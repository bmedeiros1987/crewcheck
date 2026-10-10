// Explicit server-side simulation lane. The real SQL queue remains held.
// No provider callback, network client, recipient, timer or retry scheduler.
import {SOURCE_SCOPE,sourceKey} from './free-day-source-contract.mjs';
import {SOURCE_JOB_SCOPE,sourceJobHash,sourceJobStateKey,cancelSourceJobs} from './free-day-source-job-state.mjs';
import {lockedDestination,validatedReview,sourceQueueJobKey} from './free-day-source-queue.mjs';
import {PERSONAL_SCOPE,PERSONAL_TEXT_VERSION,personalConsentConfiguration} from './free-day-personal-consent.mjs';
export const WORKER_SCOPE='free-day-simulated-worker-v1';
export const WORKER_CUTOFF_MS=120000;
export const localProviderStats={calls:0};
const terminal=new Set(['accepted_unconfirmed','uncertain','rejected','cancelled']);
const fail=(status,code)=>{throw Object.assign(new Error(code),{status,code});};
const parse=x=>{try{return typeof x==='string'?JSON.parse(x):x || {};}catch{return {};}};
const save=(c,key,value)=>c.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=NOW(3)',[key,JSON.stringify(value)]);
export function simulatedWorkerConfiguration(env=process.env) {
 const offer=personalConsentConfiguration(env);
 return {enabled:env.CREWCHECK_FREE_DAY_WORKER_SIMULATION_ENABLED==='true' && offer.offerEnabled,ownerIds:offer.ownerIds};
}
async function lockContext(c,user,clock) {
 const [profiles]=await c.query('SELECT public_id,ROUND(UNIX_TIMESTAMP(created_at)*1000) AS created_epoch FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[user.email]);
 if(String(profiles[0]?.public_id || '')!==String(user.id))fail(401,'OWNER_CHANGED');
 const created=Number(profiles[0]?.created_epoch);if(!Number.isFinite(created) || created<=0)fail(409,'ACCOUNT_CREATION_PENDING');
 const [sources]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[sourceKey(user)]),state=parse(sources[0]?.payload);
 let review=null;
 if(state.ownerId===user.id && state.email===user.email && state.scope===SOURCE_SCOPE && state.consent===true){try{review=validatedReview(state,user);}catch{}}
 const destination=await lockedDestination(c,user,created,clock());
 const jobKey=review?sourceQueueJobKey(user,review):null,key=jobKey?sourceJobStateKey(user,jobKey):null;
 const [jobs]=jobKey?await c.query('SELECT id,status FROM crewcheck_notification_jobs WHERE email=? AND job_key=? FOR UPDATE',[user.email,jobKey]):[[]];
 const [rows]=key?await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[key]):[[]];
 const receipt=parse(rows[0]?.payload);
 const valid=review && destination && jobs[0]?.status==='held' && receipt.ownerId===user.id && receipt.email===user.email && receipt.scope===SOURCE_JOB_SCOPE && receipt.consentRevision===state.revision && receipt.reviewDedupe===review.dedupe && receipt.linkVersion===destination.version && receipt.expiresAt===state.expiresAt;
 const context=valid?sourceJobHash([PERSONAL_SCOPE,user.id,created,state.revision,review.dedupe,destination.version,state.expiresAt]):null;
 const personal=receipt.personalConsent;
 const authorized=Boolean(valid && personal?.granted===true && personal.context===context && personal.textVersion===PERSONAL_TEXT_VERSION);
 return refreshTime({key,receipt,context,authorized,valid:Boolean(valid),revision:personal?.revision ?? 0,jobKey,sourceExpiresAt:state.expiresAt,personalExpiresAt:personal?.expiresAt},clock());
}
function refreshTime(x,now) {
 x.valid=Boolean(x.valid && Date.parse(x.sourceExpiresAt)>now);
 x.authorized=Boolean(x.valid && x.authorized && Date.parse(x.personalExpiresAt)>now);
 x.checkedAt=now;return x;
}
function fixedLocalProvider(outcome,attempt) {
 localProviderStats.calls++;
 return {transport:'local-no-network',invocation:attempt,simulatedAccepted:outcome==='accepted',simulatedUncertain:outcome==='uncertain',accepted:false,delivered:false};
}
const info=(x,now)=>{refreshTime(x,now);return {scope:WORKER_SCOPE,phase:x.receipt.worker?.phase || 'held',workerRevision:x.receipt.worker?.revision || 0,
 eligible:x.authorized,context:x.context,personalRevision:x.revision,dispatchAllowed:false,accepted:false,delivered:false,
 simulation:x.receipt.worker?.result || null};};
export async function simulatedWorker(db,user,body=null,{now,clock=now===undefined?()=>Date.now():()=>now,configuration={enabled:false,ownerIds:[]},outcome='accepted',interruptAfterClaim=false}={}) {
 if(!user?.id || !user?.email)fail(401,'SESSION_REQUIRED');
 if(body && (body.scope!==WORKER_SCOPE || !['enqueue','run'].includes(body.action) || Object.keys(body).some(k=>!['scope','action','context','expectedPersonalRevision','expectedWorkerRevision'].includes(k))))fail(400,'CLIENT_AUTHORITY_REJECTED');
 if(!['accepted','uncertain','rejected'].includes(outcome))fail(400,'INVALID_SIMULATED_OUTCOME');
 const c=await db.getConnection();let inTransaction=false,claimState='not_started',attempt;
 try {
  await c.beginTransaction();inTransaction=true;
  let x=await lockContext(c,user,clock);
  const allowed=configuration.enabled===true && Array.isArray(configuration.ownerIds) && configuration.ownerIds.includes(String(user.id));
  if(!x.valid){await cancelSourceJobs(c,user);await c.commit();inTransaction=false;if(body)fail(409,'WORKER_CONTEXT_CHANGED');return {...info(x,clock()),phase:'unavailable',eligible:false,available:false,previousAttemptUnknown:true};}
  let worker=x.receipt.worker || {revision:0,phase:'held'};
  const changed=worker.context && (worker.context!==x.context || worker.personalRevision!==x.revision);
  if((!x.authorized || changed || !allowed) && ['pending','dispatching'].includes(worker.phase)) {
   worker={...worker,revision:worker.revision+1,phase:worker.phase==='dispatching'?'uncertain':'cancelled'};x.receipt.worker=worker;await save(c,x.key,x.receipt);await c.commit();inTransaction=false;
   if(body)fail(409,'WORKER_AUTHORIZATION_CHANGED');return {...info(x,clock()),available:false};
  }
  if(worker.phase==='dispatching' && !(Date.parse(worker.claimedAt)+WORKER_CUTOFF_MS>x.checkedAt)) {
   worker={...worker,revision:worker.revision+1,phase:'uncertain'};x.receipt.worker=worker;await save(c,x.key,x.receipt);await c.commit();inTransaction=false;return {...info(x,clock()),duplicate:true,available:allowed};
  }
  if(!body){await c.commit();inTransaction=false;return {...info(x,clock()),available:allowed};}
  if(!allowed)fail(403,'WORKER_SIMULATION_NOT_OFFERED');
  if(!x.authorized || body.context!==x.context || body.expectedPersonalRevision!==x.revision)fail(409,'WORKER_AUTHORIZATION_CHANGED');
  if(!Number.isInteger(body.expectedWorkerRevision))fail(409,'WORKER_REVISION_CHANGED');
  if(terminal.has(worker.phase) || worker.phase==='dispatching'){await c.commit();inTransaction=false;return {...info(x,clock()),duplicate:true};}
  if(body.action==='enqueue' && worker.phase==='pending' && body.expectedWorkerRevision===worker.requestRevision){await c.commit();inTransaction=false;return {...info(x,clock()),duplicate:true};}
  if(body.expectedWorkerRevision!==worker.revision)fail(409,'WORKER_REVISION_CHANGED');
  if(body.action==='enqueue') {
   if(worker.phase!=='held')fail(409,'WORKER_NOT_HELD');
   worker={revision:worker.revision+1,phase:'pending',requestRevision:body.expectedWorkerRevision,context:x.context,personalRevision:x.revision};
   x.receipt.worker=worker;await save(c,x.key,x.receipt);await c.commit();inTransaction=false;return {...info(x,clock()),duplicate:false};
  }
  if(worker.phase!=='pending')fail(409,'WORKER_NOT_PENDING');
  attempt=sourceJobHash([WORKER_SCOPE,x.jobKey,x.context,x.revision]);
  worker={...worker,revision:worker.revision+1,phase:'dispatching',claimedAt:new Date(clock()).toISOString(),attempt};
  x.receipt.worker=worker;await save(c,x.key,x.receipt);
  // Durable cutoff BEFORE any provider invocation: an interrupted attempt is
  // never replayed. Unknown commit outcomes likewise require inspection.
  claimState='unknown';
  await c.commit();inTransaction=false;claimState='persisted';
  if(interruptAfterClaim)return {...info(x,clock()),interrupted:true};
  await c.beginTransaction();inTransaction=true;
  x=await lockContext(c,user,clock);worker=x.receipt.worker;
  if(!x.valid){await cancelSourceJobs(c,user);await c.commit();inTransaction=false;return {...info(x,clock()),phase:'cancelled',eligible:false};}
  if(!worker || worker.attempt!==attempt || worker.phase!=='dispatching'){await c.commit();inTransaction=false;return {...info(x,clock()),duplicate:true};}
  if(configuration.enabled!==true || !configuration.ownerIds.includes(String(user.id)) || !x.authorized || x.revision!==worker.personalRevision || x.context!==worker.context){x.receipt.worker={...worker,revision:worker.revision+1,phase:'cancelled'};await save(c,x.key,x.receipt);await c.commit();inTransaction=false;return info(x,clock());}
  // Final synchronous check: no await separates this fresh clock from the
  // fixed provider call. Lock/commit waits cannot extend source/consent TTL.
  refreshTime(x,clock());
  if(!x.valid){await cancelSourceJobs(c,user);await c.commit();inTransaction=false;return {...info(x,clock()),phase:'cancelled',eligible:false};}
  const cutoffExpired=!(Date.parse(worker.claimedAt)+WORKER_CUTOFF_MS>x.checkedAt);
  if(!x.authorized || cutoffExpired){x.receipt.worker={...worker,revision:worker.revision+1,phase:cutoffExpired?'uncertain':'cancelled'};await save(c,x.key,x.receipt);await c.commit();inTransaction=false;return info(x,clock());}
  // Profile, source, link and consent remain locked through this synchronous,
  // fixed local provider. No external provider can be injected here.
  const result=fixedLocalProvider(outcome,attempt);
  x.receipt.worker={...worker,revision:worker.revision+1,phase:outcome==='accepted'?'accepted_unconfirmed':outcome==='uncertain'?'uncertain':'rejected',result};
  await save(c,x.key,x.receipt);await c.commit();inTransaction=false;return {...info(x,clock()),duplicate:false};
 }catch(e){
  const error=e instanceof Error?e:new Error('WORKER_UNAVAILABLE');
  // Attach the durable/unknown cutoff BEFORE cleanup. Rollback or release
  // failure must not replace the original error or imply that no claim exists.
  error.claimState=claimState;error.claimPersisted=claimState==='unknown'?null:claimState==='persisted';
  if(inTransaction){try{await c.rollback();}catch{error.rollbackFailed=true;}}
  throw error;
 }finally{try{c.release();}catch{/* Do not mask cutoff/error evidence. */}}

}
export async function handleSimulatedWorker(req,res,{identity,dbPool,readJson,sendJson,configuration=simulatedWorkerConfiguration(),clock}) {
 const user=identity(req);if(!user)return sendJson(res,401,{ok:false,code:'SESSION_REQUIRED'});
 if(!['GET','POST'].includes(req.method))return sendJson(res,405,{ok:false,code:'METHOD_NOT_ALLOWED'});
 try{const db=await dbPool();if(!db)fail(503,'DATABASE_UNAVAILABLE');return sendJson(res,200,{ok:true,...await simulatedWorker(db,user,req.method==='POST'?await readJson(req):null,{configuration,clock})});}
 catch(e){return sendJson(res,e.status || 503,{ok:false,code:e.code || 'WORKER_UNAVAILABLE',claimPersisted:e.claimState==='unknown'?null:e.claimPersisted===true,claimState:e.claimState || 'not_started',rollbackFailed:e.rollbackFailed===true,dispatchAllowed:false,accepted:false,delivered:false});}
}
