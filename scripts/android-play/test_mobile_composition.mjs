// TEST ONLY: actual HTTP/RSA/GitHub proof, existing SQL adapter and official-shaped
// fictional Play. No real bearer/Store/DB connection unless the fixed isolated QA flag.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Readable} from 'node:stream';
import {database} from './mysql_journal_fixture.mjs';
import {mysqlAdapter} from '../../server/mysql-platform-adapter.mjs';
import {canonical,snapshotDigest} from './reconcile_journal.mjs';
import {createPlayStateReader} from './play_state_reader.mjs';
import {createPlatformJournal} from './platform_journal.mjs';
import {createReleaseJournalHandler,PATH} from '../../server/release-journal/route.mjs';
import {prepareMobileExecutionCapabilities,createMobileJournalComposition,SHARED_WRITERS} from '../../server/release-journal/mobile-composition.mjs';
import {parseMobileEnrollment,parseProbeEnrollment,MOBILE_OPERATIONS,SERVICE_ID,SERVICE_ORIGIN} from '../../server/release-journal/enrollment.mjs';
import {createOidcVerifier} from '../../server/release-journal/oidc.mjs';
import {createGitHubReviewProvider} from '../../server/release-journal/github-review.mjs';
import {reviewFixture} from './release_review_fixture.mjs';
import {fixtureToken,fixtureJwk} from './test_release_oidc.mjs';
const key='play-release-journal:com.crewcheck.app';
const tracks=[{track:'internal',releases:[{status:'completed',versionCodes:['144158']}]},{track:'wear:internal',releases:[{status:'completed',versionCodes:['144155']}]},{track:'production',releases:[{status:'completed',versionCodes:['140319']}]}];
let native=null;
if(process.argv.includes('--isolated')){
 const socket='/tmp/crewcheck-notification-qa-socket/mysqld.sock';
 assert.equal(process.env.CREWCHECK_NOTIFICATION_QA,'isolated-mysql');assert.equal(process.env.CREWCHECK_QA_MYSQL_SOCKET,socket);assert(fs.statSync(socket).isSocket());
 const mysql=await import('mysql2/promise');native=mysql.createPool({socketPath:socket,user:'root',password:'',database:'crewcheck_notification_qa',connectionLimit:8,dateStrings:true});
 assert.equal((await native.query('SELECT DATABASE() AS name'))[0][0].name,'crewcheck_notification_qa');
}
globalThis.fetch=()=>{throw Error('Network forbidden in synthetic mobile composition');};
async function fixture(scenario='valid'){
 if(native)await native.query("DELETE FROM crewcheck_telegram_state WHERE state_key LIKE 'play-release-%'");
 const raw=native??database();let lost=false,poolCalls=0,time=10000,commits=0,staged=false,coordFresh=true,armCoord=false;
 const sql={query:(...a)=>raw.query(...a),async getConnection(){const c=await raw.getConnection();let txPending=false;return {
  async query(s,a){
   if(s==='BEGIN'){if(native)return c.query(s);await c.beginTransaction();return [{}];}
   if(s==='ROLLBACK'){if(native)return c.query(s);await c.rollback();return [{}];}
   if(s==='COMMIT'){const r=native?await c.query(s):(await c.commit(),[{}]);if(txPending&&scenario==='expired-after-pending')time=10101;if(txPending&&scenario==='revoked-after-pending'){const rk='play-release-revocation:com.crewcheck.app:123:1';const rr=(await raw.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[rk]))[0][0];const rev=typeof rr.payload==='string'?JSON.parse(rr.payload):rr.payload;await raw.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=CURRENT_TIMESTAMP(3) WHERE state_key=?',[JSON.stringify({...rev,revoked:true,revision:rev.revision+1}),rk]);}if(txPending&&scenario==='lost-pending-sql'&&!lost){lost=true;throw Error('Synthetic SQL ACK lost');}return r;}
   if(/^(INSERT|UPDATE)/.test(s)&&a?.some(v=>typeof v==='string'&&v.includes('"state":"pending"')))txPending=true;
   if(armCoord&&scenario==='proof-aged-in-admission'&&s.includes('FOR UPDATE')&&a?.[0]==='play-release-admission:com.crewcheck.app:123:1')coordFresh=false;
   return c.query(s,a);
  },release:()=>c.release(),destroy:()=>c.destroy?.()
 };}};
 const db=mysqlAdapter(sql),f=reviewFixture({operations:[...MOBILE_OPERATIONS]});
 const provider=createGitHubReviewProvider({policy:f.policy,request:f.request,now:()=>time});
 const verifyToken=createOidcVerifier({now:()=>time,loadJwks:async()=>({keys:[fixtureJwk]})});
 const requests=[];
 const request=async req=>{
  requests.push(structuredClone(req));
  if(req.method==='POST'){
   assert(req.url.endsWith('/edits/original:commit'));assert.equal((await journal()).state,'pending');
   assert.deepEqual(req.params,{changesNotSentForReview:true,changesInReviewBehavior:'ERROR_IF_IN_REVIEW'});
   commits++;if(scenario==='deadline-timeout')return new Promise(()=>{});if(scenario==='commit-timeout')throw Error('Synthetic commit response lost');return {status:200,body:{id:'original'}};
  }
  assert.equal(req.method,'GET');
  if(commits&&scenario==='postcommit404')return {status:404,body:{}};
  if(req.url.endsWith('/edits/original'))return {status:200,body:{id:'original',expiryTimeSeconds:'99999999'}};
  if(req.url.endsWith('/tracks')){
   const t=structuredClone(tracks);if(staged)t[0].releases[0].versionCodes.push('144161');
   if(staged&&scenario==='non-target-drift')t[1].releases=[];
   return {status:200,body:{kind:'androidpublisher#tracksListResponse',tracks:t}};
  }
  if(req.url.endsWith('/bundles'))return {status:200,body:{kind:'androidpublisher#bundlesListResponse',bundles:[{versionCode:144158,sha256:'a'.repeat(64)},...(staged?[{versionCode:144161,sha256:'c'.repeat(64)}]:[])],...(scenario==='partial-list'?{nextPageToken:'partial'}:{})}};
  if(req.url.endsWith('/apks'))return {status:200,body:{kind:'androidpublisher#apksListResponse',apks:[{versionCode:144160}]}};
  assert.fail('Unexpected fixture Store request');
 };
 const reader=createPlayStateReader({request,now:()=>1000000});
 let baseline;
 const sealed=new WeakSet();
 const coordinationProvider={
  async verify(record,operation,observed){
   if(scenario==='permission-denied')throw Error('Synthetic executor permission denied');
   const p={package:record.package,planSha256:record.plan.planSha256,editId:record.editId??null,inventoryComplete:scenario!=='incomplete-inventory',reviewState:scenario==='review-pending'?'pending':'clear',otherEditState:scenario==='other-edit'?'unknown':'none',writers:Object.fromEntries(SHARED_WRITERS.map(w=>[w,scenario==='wear-unfenced'&&w==='crewwatch_internal.py'?'unknown':'fenced'])),observationSha256:observed?.inventorySha256,baseline};
   if(scenario!=='forged-proof')sealed.add(p);if(scenario==='proof-aged-in-admission')armCoord=true;return p;
  },isVerified:p=>sealed.has(p),isFresh:()=>scenario!=='stale-proof'&&coordFresh
 };
 const caps=prepareMobileExecutionCapabilities({storeRequest:request,coordinationProvider,verifyConsumedArtifacts:async(_r,a)=>scenario!=='invalid-artifact'&&a[0].artifactSha256==='c'.repeat(64),readCompleteState:async r=>({...await reader.inventory(r),generation:r.generation,revision:r.revision}),now:()=>1000000,timeoutMs:scenario==='deadline-timeout'?5:10000});
 const handler=createReleaseJournalHandler({enabled:true,allowedOperations:MOBILE_OPERATIONS,poolProvider:async()=>{poolCalls++;return db;},githubReviewProvider:provider,verifyIngress:async()=>true,verifyToken,now:()=>time,...caps});
 const frame=(id,op,revision,input={})=>({schema:2,id,operation:op,binding:f.binding,revision,input});
 async function call(body,token=fixtureToken(f.claims),which=handler){
  const req=Readable.from([Buffer.from(canonical(body))]);req.method='POST';req.headers={'content-type':'application/json',authorization:'Bearer '+token};
  const res={writeHead(s){this.status=s;},end(b){this.body=JSON.parse(b);}};
  await which(req,res,new URL(SERVICE_ORIGIN+PATH));return res;
 }
 async function journal(){const r=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1',[key]);return r.rows.length?(typeof r.rows[0].payload==='string'?JSON.parse(r.rows[0].payload):r.rows[0].payload):null;}
 async function throughStage(){
  assert.equal((await call(frame('reserve','reserve',0,f.binding.plan))).status,200);
  assert.equal((await call(frame('start','startAllocation',1))).status,200);
  assert.equal((await call(frame('edit','saveEdit',2,{editId:'original'}))).status,200);
  baseline=await reader.inventory({package:f.binding.plan.package,editId:'original'});
  const allocation={inventorySha256:baseline.inventorySha256,floor:144160,versionCodes:{app:scenario==='low-code'?144160:144161}};
  const allocated=await call(frame('allocate','allocate',3,allocation));if(allocated.status!==200)return allocated;
  const artifacts=[{module:'app',package:f.binding.plan.package,versionCode:144161,sourceSha:f.binding.plan.sourceSha,controllerSha:f.binding.plan.controllerSha,manifestSha256:'d'.repeat(64),uploadCertificateSha256:'e'.repeat(64),artifactSha256:'c'.repeat(64)}];
  const finalized=await call(frame('final','finalize',4,artifacts));if(finalized.status!==200)return finalized;
  assert.equal((await call(frame('stage','startStage',5))).status,200);staged=true;
  const observed=await reader.inventory({package:f.binding.plan.package,editId:'original'}),target=observed.tracks[0];
  const s={track:'internal',expectedTrackSha256:snapshotDigest(target),otherTracksBeforeSha256:snapshotDigest(Object.fromEntries(baseline.tracks.filter(t=>t.track!=='internal').map(t=>[t.track,t])))};
  return call(frame('commit','commit',6,s));
 }
 return {raw,db,f,caps,call,frame,journal,throughStage,reader,requests,get commits(){return commits;},get poolCalls(){return poolCalls;},set time(v){time=v;}};
}
const passed=[];
async function run(name,work){await work();passed.push(name);}
try{
 await run('OFF ignores activation options without pool/JWT/Store access',async()=>{
  const x=await fixture();const off=createMobileJournalComposition({enabled:true,poolProvider:()=>assert.fail('OFF pool')});
  assert.equal((await x.call(x.frame('off','probe',0),'invalid.jwt.token',off)).status,503);assert.equal(x.requests.length,0);assert.equal(x.poolCalls,0);
 });
 await run('separate enrollment cannot widen probe or alter repo/service/environment/operations',async()=>{
  const f=reviewFixture({operations:[...MOBILE_OPERATIONS]}),identity={serviceId:SERVICE_ID,repository:'bmedeiros1987/crewcheck',origin:SERVICE_ORIGIN,commit:f.policy.reviewedCodeSha};
  assert.deepEqual(parseMobileEnrollment(JSON.stringify(f.policy),identity).operations,MOBILE_OPERATIONS);assert.throws(()=>parseProbeEnrollment(JSON.stringify(f.policy),identity));
  for(const override of [{operations:['probe']},{operations:[...MOBILE_OPERATIONS,'rollover']},{environmentNodeId:'foreign'},{protectedJobName:'prepare-journal-plan'},{reviewedCodeSha:(f.policy.reviewedCodeSha==='a'.repeat(40)?'b':'a').repeat(40)}])assert.throws(()=>parseMobileEnrollment(JSON.stringify({...f.policy,...override}),identity));
  assert.throws(()=>parseMobileEnrollment(JSON.stringify(f.policy),{...identity,repository:'foreign/repo'}));
 });
 await run('OIDC/permission rejection before Store or journal mutation',async()=>{
  const x=await fixture();assert.equal((await x.call(x.frame('bad','reserve',0,x.f.binding.plan),'invalid.jwt.token')).status,403);assert.equal(x.poolCalls,0);assert.equal(x.requests.length,0);
 });
 for(const scenario of ['permission-denied','incomplete-inventory','review-pending','other-edit','wear-unfenced','forged-proof','stale-proof','proof-aged-in-admission'])await run(scenario,async()=>{const x=await fixture(scenario);assert.equal((await x.call(x.frame('denied','reserve',0,x.f.binding.plan))).status,409);assert.equal(await x.journal(),null);assert.equal(x.commits,0);assert.equal(x.requests.length,0);});
 for(const scenario of ['partial-list','low-code','invalid-artifact','non-target-drift','lost-pending-sql','expired-after-pending','revoked-after-pending','commit-timeout','deadline-timeout','postcommit404','valid'])await run(scenario,async()=>{
  const x=await fixture(scenario);let r;try{r=await x.throughStage();}catch(e){assert.equal(scenario,'partial-list');assert.equal(x.commits,0);return;}
  if(scenario==='valid'||scenario==='postcommit404'){
   assert.equal(r.status,200);assert.equal(r.body.record.state,'acknowledged');assert.equal(x.commits,1);
   const replay=await x.call(x.frame('commit','commit',6,r.body.record.staged));assert.equal(replay.status,409);assert.equal(x.commits,1);
   const reconciled=await x.call(x.frame('reconcile','reconcile',8));assert.equal(reconciled.status,scenario==='valid'?200:409);
   assert.equal((await x.journal()).state,scenario==='valid'?'reconciled':'acknowledged');
   const ledger=(await x.db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1',['play-release-admission:com.crewcheck.app:123:1'])).rows[0].payload;
   assert.equal((typeof ledger==='string'?JSON.parse(ledger):ledger).operations.filter(o=>o.operation==='commit').length,2);
  }else if(['commit-timeout','deadline-timeout'].includes(scenario)){assert.equal(r.status,200);assert.equal(r.body.record.state,'reconciliation_required');assert.equal(x.commits,1);}
  else{assert.equal(r.status,409);assert.equal(x.commits,0);if(['lost-pending-sql','expired-after-pending','revoked-after-pending'].includes(scenario))assert.equal((await x.journal()).state,'pending');}
 });
 await run('phone/Wear reserve same existing key; stale CAS cannot advance winner',async()=>{
  const x=await fixture(),other=structuredClone(x.f.binding.plan);Object.assign(other,{owner:'wear:999',producer:'wear',runId:'999',modules:['wear']});other.planSha256=snapshotDigest(Object.fromEntries(Object.entries(other).filter(([k])=>k!=='planSha256')));
  const wear=createPlatformJournal(x.db,{approvePlan:async()=>true});
  const results=await Promise.allSettled([x.call(x.frame('race','reserve',0,x.f.binding.plan)),wear.plan('reserve',null,other)]);
  const s=await x.journal();assert(s);assert(['mobile','wear'].includes(s.plan.producer));
  assert.equal(results.filter(r=>r.status==='fulfilled'&&(r.value.status===200||r.value.state==='planned')).length,1);
  assert.notEqual((await x.call(x.frame('stale','startAllocation',0))).status,200);
 });
 console.log('PASS '+passed.length+' existing-pool mobile composition cases '+(native?'actual isolated MySQL':'controlled transactional SQL')+': OFF, identity/scope, sealed readiness, inventory/edit/writer guards, APK floor, two-phase atomic commit admission, replay/CAS, SQL/Store timeout and reconciliation; all Store/signers fictional.');
}finally{if(native)await native.end();}
