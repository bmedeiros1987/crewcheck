// In-memory SQL, actual RSA and independent GitHub-shaped public GET proof.
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {database} from './mysql_journal_fixture.mjs';
import {mysqlAdapter} from '../../server/mysql-platform-adapter.mjs';
import {canonical} from './reconcile_journal.mjs';
import {createGitHubApprovalBinder} from '../../server/release-journal/approval.mjs';
import {createReleaseJournalHandler,PATH} from '../../server/release-journal/route.mjs';
import {createOidcVerifier} from '../../server/release-journal/oidc.mjs';
import {createGitHubReviewProvider} from '../../server/release-journal/github-review.mjs';
import {fixtureToken,fixtureJwk} from './test_release_oidc.mjs';
import {reviewFixture} from './release_review_fixture.mjs';
const raw=database();let time=10000,expireBeforeAdmission=false,loseJournal=false,journalWaitTo=null,ledgerWaitTo=null,ledgerReadbackWaitTo=null,ledgerReads=0;
const native={query:(...a)=>raw.query(...a),async getConnection(){const c=await raw.getConnection();return {async query(sql,args){if(sql==='BEGIN'){await c.beginTransaction();return [{affectedRows:0}];}if(sql==='COMMIT'){await c.commit();return [{affectedRows:0}];}if(sql==='ROLLBACK'){await c.rollback();return [{affectedRows:0}];}if(loseJournal&&sql.includes('FOR UPDATE')&&args?.[0]==='play-release-journal:com.crewcheck.app'){loseJournal=false;raw.lose();}if(expireBeforeAdmission&&sql.includes('FOR UPDATE')&&args?.[0]==='play-release-journal:com.crewcheck.app'){time=10100;expireBeforeAdmission=false;}if(sql.includes('FOR UPDATE')&&args?.[0]==='play-release-journal:com.crewcheck.app'&&journalWaitTo!==null){time=journalWaitTo;journalWaitTo=null;}const result=await c.query(sql,args);if(sql.includes('FOR UPDATE')&&args?.[0]==='play-release-admission:com.crewcheck.app:123:1'&&ledgerWaitTo!==null){time=ledgerWaitTo;ledgerWaitTo=null;}if(sql.includes('FOR UPDATE')&&args?.[0]==='play-release-admission:com.crewcheck.app:123:1'&&ledgerReadbackWaitTo!==null&&++ledgerReads===2){time=ledgerReadbackWaitTo;ledgerReadbackWaitTo=null;}return result;},release:()=>c.release(),destroy:()=>c.destroy()};}};
const db=mysqlAdapter(native),f=reviewFixture({operations:['probe','read','observe','reserve','startAllocation']});
const provider=createGitHubReviewProvider({policy:f.policy,request:f.request,now:()=>time});const binder=createGitHubApprovalBinder({db,proofProvider:provider});
await assert.rejects(binder.register({state:'approved',approval:f.approval,approver:{provider:'github-environment-review',principalRef:'forged',proofSha256:'e'.repeat(64)}}));assert.equal(raw.rows.size,0);
const verifyToken=createOidcVerifier({now:()=>time,loadJwks:async()=>({keys:[fixtureJwk]})});
const handler=createReleaseJournalHandler({enabled:true,poolProvider:async()=>db,githubReviewProvider:provider,verifyIngress:async req=>req.trustedTls===true,verifyToken,now:()=>time});
const frame=(id,operation,revision,input={})=>({schema:2,id,operation,binding:f.binding,revision,input});
async function call(body,{token=fixtureToken({...f.claims,iat:time,nbf:time,exp:time+300,jti:'fixture-'+time}),trustedTls=true,query=''}={}){const req=Readable.from([Buffer.from(canonical(body))]);req.method='POST';req.headers={authorization:'Bearer '+token,'content-type':'application/json'};req.trustedTls=trustedTls;const res={writeHead(s){this.status=s;},end(b){this.body=JSON.parse(b);}};await handler(req,res,new URL('https://fixture.invalid'+PATH+query));return res;}
for(const op of ['register','revoke','renew','approve','delete','sql','commit','pending','acknowledged','publish'])assert.equal((await call(frame('bad-'+op,op,0,{approval:f.approval}))).status,403);
assert.equal(raw.rows.size,0);
for(const changed of [{repository_id:'999'},{sha:'a'.repeat(40)},{workflow_sha:'a'.repeat(40)},{run_attempt:'2'},{actor_id:'999'},{check_run_id:'777'},{environment:'844'}])assert.equal((await call(frame('claim','reserve',0,f.binding.plan),{token:fixtureToken({...f.claims,...changed})})).status,403);
assert.equal((await call({...frame('extra','reserve',0,f.binding.plan),approved:true})).status,403);assert.equal((await call(frame('http','probe',0),{trustedTls:false})).status,403);assert.equal((await call(frame('query','probe',0),{query:'?table=other'})).status,403);
assert.equal((await call(frame('probe','probe',0))).status,200);assert.equal(raw.rows.size,3);const approvalKey='play-release-approval:com.crewcheck.app:123:1',immutable=raw.rows.get(approvalKey);
// Job request materializes only proof already held in real GitHub review history.
f.state.reviews=[];assert.equal((await call(frame('no-review','reserve',0,f.binding.plan))).status,403);assert.equal(raw.rows.size,3);f.state.reviews=reviewFixture({operations:f.policy.operations}).state.reviews;
raw.lose();assert.equal((await call(frame('reserve','reserve',0,f.binding.plan))).status,403);
// Loss occurred while re-reading identical registration, not journal mutation: no retry grant.
assert(!raw.rows.has('play-release-journal:com.crewcheck.app'));
loseJournal=true;assert.equal((await call(frame('reserve-2','reserve',0,f.binding.plan))).status,409);
const key='play-release-journal:com.crewcheck.app',saved=JSON.parse(raw.rows.get(key));assert.equal(saved.state,'planned');const admissionKey='play-release-admission:com.crewcheck.app:123:1';assert.equal(JSON.parse(raw.rows.get(admissionKey)).operations.length,1);
assert.equal((await call(frame('reserve-2','startAllocation',1))).status,409);assert.deepEqual(JSON.parse(raw.rows.get(key)),saved);
// Regression: outer authorization is valid, but final ledger lock wait changes time.
for(const [name,start,journalAt,ledgerAt,tokenExpiry] of [['proof-aged',10000,10010,10011,10300],['approval-expired',10099,null,10100,10399],['jwt-expired',10000,null,10005,10005]]){
 time=start;journalWaitTo=journalAt;ledgerWaitTo=ledgerAt;const beforeLedger=raw.rows.get(admissionKey),beforeJournal=raw.rows.get(key);
 const response=await call(frame(name,'startAllocation',1),{token:fixtureToken({...f.claims,iat:start,nbf:start,exp:tokenExpiry,jti:name})});
 assert.equal(response.status,409,name+' must reject after all locks');assert.equal(raw.rows.get(key),beforeJournal);assert.equal(raw.rows.get(admissionKey),beforeLedger);assert.equal(raw.rows.get(approvalKey),immutable);
}
time=10000;ledgerReads=0;ledgerReadbackWaitTo=10005;const beforeSlowReadbackLedger=raw.rows.get(admissionKey),beforeSlowReadbackJournal=raw.rows.get(key);
assert.equal((await call(frame('jwt-readback-delay','startAllocation',1),{token:fixtureToken({...f.claims,exp:10005,jti:'jwt-readback-delay'})})).status,409);assert.equal(ledgerReads,2);assert.equal(raw.rows.get(admissionKey),beforeSlowReadbackLedger);assert.equal(raw.rows.get(key),beforeSlowReadbackJournal);
time=10000;
expireBeforeAdmission=true;assert.equal((await call(frame('expiry-race','startAllocation',1))).status,409);assert.deepEqual(JSON.parse(raw.rows.get(key)),saved);assert.equal(JSON.parse(raw.rows.get(admissionKey)).operations.length,1);
time=10000;f.state.meta.conclusion='cancelled';assert.equal((await call(frame('cancelled','startAllocation',1))).status,403);assert.equal(JSON.parse(raw.rows.get('play-release-revocation:com.crewcheck.app:123:1')).revoked,true);
const observed=await call(frame('recovery','observe',0));assert.equal(observed.status,200);assert.deepEqual(observed.body.record,saved);for(const k of ['retryAllowed','resumeAllowed','storeMutationAllowed','rolloverAllowed'])assert.equal(observed.body[k],false);
assert.equal((await call(frame('renewed','startAllocation',1),{token:fixtureToken({...f.claims,jti:'new-token'})})).status,403);time=11000;assert.equal((await call(frame('late','observe',0))).status,403);assert.equal(raw.rows.get(approvalKey),immutable);
let touches=0;const off=createReleaseJournalHandler({enabled:false,poolProvider:async()=>{touches++;},verifyToken:async()=>{touches++;}}),rs={writeHead(s){this.status=s;},end(){}};await off({method:'POST'},rs,new URL('https://fixture.invalid'+PATH));assert.equal(rs.status,503);assert.equal(touches,0);
console.log('PASS real-shaped GitHub proof replaces hypothetical registrar; job cannot approve/widen/renew/revoke, immutable binding survives token refresh, expiry/revocation preserve journal, admission ledger atomic, post-all-lock JWT/approval/proof freshness waits refuse without changing either record, receiver OFF');
