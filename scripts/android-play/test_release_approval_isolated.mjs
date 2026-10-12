// Existing disposable MySQL8.4 fixture ONLY; RSA/job/store identities are fictional.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Readable} from 'node:stream';
import mysql from 'mysql2/promise';
import {mysqlAdapter} from '../../server/mysql-platform-adapter.mjs';
import {createGitHubApprovalBinder,createApprovalStore} from '../../server/release-journal/approval.mjs';
import {createReleaseJournalHandler,PATH} from '../../server/release-journal/route.mjs';
import {createOidcVerifier} from '../../server/release-journal/oidc.mjs';
import {canonical} from './reconcile_journal.mjs';
import {fixtureToken,fixtureJwk} from './test_release_oidc.mjs';
import {reviewFixture} from './release_review_fixture.mjs';
import {createGitHubReviewProvider} from '../../server/release-journal/github-review.mjs';
const socket='/tmp/crewcheck-notification-qa-socket/mysqld.sock';assert.equal(process.env.CREWCHECK_NOTIFICATION_QA,'isolated-mysql');assert.equal(process.env.CREWCHECK_QA_MYSQL_SOCKET,socket);assert(fs.statSync(socket).isSocket());
globalThis.fetch=()=>{throw Error('Network forbidden');};
const pool=mysql.createPool({socketPath:socket,user:'root',password:'',database:'crewcheck_notification_qa',connectionLimit:8});
const pkg='com.crewcheck.app',journalKey='play-release-journal:'+pkg,run='125',attempt='1';
const key=kind=>`play-release-${kind}:${pkg}:${run}:${attempt}`;
const owned=[journalKey,...['approval','revocation','admission'].map(key)];
let lose=false,pause=null,arrived=null,cleanupSafe=false,time=10000;
const native={query:(...a)=>pool.query(...a),async getConnection(){const c=await pool.getConnection();return {async query(sql,args){if(sql.includes('FOR UPDATE')&&args?.[0]===journalKey){if(lose){lose=false;this.loseCommit=true;}if(pause){const hold=pause;pause=null;arrived();await hold;}}const result=await c.query(sql,args);if(sql==='COMMIT'&&this.loseCommit){this.loseCommit=false;throw Error('fixture lost SQL reply after commit');}return result;},release:()=>c.release(),destroy:()=>c.destroy()};}};
const db=mysqlAdapter(native),f=reviewFixture({run,operations:['reserve','startAllocation','observe']}),{binding,approval,claims:fixtureClaims}=f,plan=binding.plan;
const provider=createGitHubReviewProvider({policy:f.policy,request:f.request,now:()=>time});
const registrar=createGitHubApprovalBinder({db,proofProvider:provider});
const verifier=createOidcVerifier({now:()=>time,loadJwks:async()=>({keys:[fixtureJwk]})});
const handler=createReleaseJournalHandler({enabled:true,poolProvider:async()=>db,verifyIngress:async()=>true,verifyToken:verifier,githubReviewProvider:provider,now:()=>time});
const get=async k=>{const r=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1',[k]);return r.rows[0]?.payload??null;};
const reset=async()=>{for(const k of owned)await db.query('DELETE FROM crewcheck_telegram_state WHERE state_key=$1',[k]);};
async function call(id,operation,revision,input={}){const f={schema:2,id,operation,binding,revision,input};const req=Readable.from([Buffer.from(canonical(f))]);req.method='POST';req.headers={'content-type':'application/json',authorization:'Bearer '+fixtureToken({...fixtureClaims,run_id:run,iat:time,nbf:time,exp:time+300,jti:id})};const res={writeHead(s){this.status=s;},end(b){this.body=JSON.parse(b);}};await handler(req,res,new URL('https://fixture.invalid'+PATH));return res;}
try{
 assert.equal((await db.query('SELECT DATABASE() AS name')).rows[0].name,'crewcheck_notification_qa');await reset();
 const proof=await provider.verify(fixtureClaims,{schema:2,id:'initial',operation:'reserve',binding,revision:0,input:plan});
 await assert.rejects(registrar.register(structuredClone(proof)));
 const registered=await Promise.allSettled([registrar.register(proof),registrar.register(proof)]);assert(registered.some(r=>r.status==='fulfilled'));
 const conflicting=reviewFixture({run,operations:f.policy.operations});conflicting.approval.binding.generation=2;conflicting.doc.approvalSha256=(await import('./reconcile_journal.mjs')).snapshotDigest(conflicting.approval);conflicting.state.reviews[0].comment=(await import('../../server/release-journal/github-review.mjs')).APPROVAL_PREFIX+canonical(conflicting.doc);
 const conflictingProvider=createGitHubReviewProvider({policy:conflicting.policy,request:conflicting.request,now:()=>time});const conflictingBinder=createGitHubApprovalBinder({db,proofProvider:conflictingProvider});await assert.rejects(conflictingBinder.register(await conflictingProvider.verify(conflicting.claims,{operation:'reserve',binding:conflicting.binding})));
 const immutable=await get(key('approval'));assert.equal((await db.query('SELECT COUNT(*) AS n FROM crewcheck_telegram_state WHERE state_key=$1',[key('approval')])).rows[0].n,1);
 assert.equal((await call('job-approve','register',0,{approval})).status,403);
 // Lost SQL response leaves BOTH journal and replay admission durably saved.
 lose=true;assert.equal((await call('reserve','reserve',0,plan)).status,409);
 const saved=await get(journalKey);assert.equal(saved.state,'planned');assert.equal((await get(key('admission'))).operations.length,1);
 const freshPool=mysql.createPool({socketPath:socket,user:'root',password:'',database:'crewcheck_notification_qa',connectionLimit:2});try{const independent=mysqlAdapter(freshPool);for(const [k,expected] of [[journalKey,saved],[key('approval'),immutable]])assert.deepEqual((await independent.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1',[k])).rows[0].payload,expected);assert.equal((await independent.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1',[key('admission')])).rows[0].payload.operations.length,1);}finally{await freshPool.end();}
 assert.equal((await call('reserve','startAllocation',1)).status,409);assert.deepEqual(await get(journalKey),saved);
 time=10100;const expiredObservation=await call('expired-read','observe',0);assert.equal(expiredObservation.status,200);assert.equal(expiredObservation.body.resumeAllowed,false);assert.equal((await call('expired-write','startAllocation',1)).status,403);time=10000;
 // Revocation wins after outer authorization but before the journal's transaction.
 let resume,signal;pause=new Promise(r=>{resume=r;});const seen=new Promise(r=>{signal=r;});arrived=signal;
 const inFlight=call('revocation-race','startAllocation',1);await seen;f.state.meta.conclusion='cancelled';await registrar.revoke(await provider.verify(fixtureClaims,{operation:'observe',binding}));resume();assert.equal((await inFlight).status,409);
 assert.deepEqual(await get(journalKey),saved);assert.equal((await get(key('admission'))).operations.length,1);assert.deepEqual(await get(key('approval')),immutable);
 const fresh=createApprovalStore(mysqlAdapter(pool),{now:()=>time});await assert.rejects(fresh.read({...fixtureClaims,run_id:run},{schema:2,id:'renewed',operation:'startAllocation',binding,revision:1,input:{}}));
 const observed=await call('recover','observe',0);assert.equal(observed.status,200);assert.deepEqual(observed.body.record,saved);assert.equal(observed.body.resumeAllowed,false);
 time=11000;assert.equal((await call('expired-recovery','observe',0)).status,403);assert.deepEqual(await get(journalKey),saved);
 cleanupSafe=true;
 console.log('PASS real existing InnoDB: sealed GitHub manual review and unique immutable run/attempt binding, atomic journal+op ledger survives lost reply, renewed token/replay denied, revocation race blocks before admission, bounded recovery never unlocks');
}finally{if(cleanupSafe)await reset();await pool.end();}
