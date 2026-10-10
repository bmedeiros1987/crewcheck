// Explicit held preparation and local simulation. No real provider or worker timer.
import {SOURCE_SCOPE,sourceKey,validateReceipt,compareSources} from './free-day-source-contract.mjs';
import {SOURCE_JOB_PREFIX,SOURCE_JOB_SCOPE,sourceJobHash,sourceJobStateKey,cancelSourceJobs} from './free-day-source-job-state.mjs';
export const SOURCE_QUEUE_DISPATCH_ALLOWED=false;
const fail=(status,code)=>{throw Object.assign(new Error(code),{status,code});};
const parse=x=>{try{return typeof x==='string'?JSON.parse(x):x || {};}catch{return {};}};
const save=(c,key,state)=>c.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=NOW(3)',[key,JSON.stringify(state)]);
const flags={dispatchAllowed:SOURCE_QUEUE_DISPATCH_ALLOWED,realConsent:false,realConsentAvailable:false,accepted:false,delivered:false,sourceVerified:false,possibleAmount:null};
const genericMessage='Segundo as versões que você enviou, há postergação do início da folga. Abra o CrewCheck para revisar. Esta simulação não confirma indenização ou entrega.';
export function sourceQueueJobKey(user,review) {return SOURCE_JOB_PREFIX+sourceJobHash([user.id,review.sequenceDate,review.before.version,review.after.version]);}
const linkFingerprint=(user,link)=>sourceJobHash([user.id,String(link.chatId),link.linkedAt,String(link.code || ''),String(link.username || '')]);
export async function lockedDestination(c,user,created,now) {
  const [rows]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[`link-email:${user.email}`]);
  const link=parse(rows[0]?.payload),chat=String(link.chatId || '');
  const time=Date.parse(link.linkedAt);
  if(link.email!==user.email || !/^-?[1-9]\d{0,19}$/.test(chat) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(String(link.linkedAt || '')) || !Number.isFinite(time) || time<created || time>now) return null;
  const [reverse]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[`link-chat:${chat}`]);
  const other=parse(reverse[0]?.payload);
  if(other.email!==user.email || String(other.chatId)!==chat || linkFingerprint(user,other)!==linkFingerprint(user,link)) return null;
  const username=/^[A-Za-z0-9_]{5,32}$/.test(String(link.username || ''))?'@'+link.username:null;
  return {version:linkFingerprint(user,link),label:chat.startsWith('-')?`Telegram coletivo existente · chat ••••${chat.slice(-4)}`:`${username || 'Telegram existente'} · chat ••••${chat.slice(-4)}`,verifiedAt:link.linkedAt};
}
export function validatedReview(state,user) {
  const review=state.review;
  if(!review || !/^[a-f0-9]{64}$/.test(String(review.before?.identityDigest || '')) || review.sourceStatus!=='user-confirmed-declaration' || !Number.isFinite(Date.parse(review.confirmedAt))) fail(409,'CONFIRMED_REVIEW_REQUIRED');
  const before=validateReceipt({identityDigest:review.before?.identityDigest,period:review.before?.period,documentHash:review.before?.documentHash,starts:review.before?.starts},review.before?.identityDigest);
  const after=validateReceipt({identityDigest:review.after?.identityDigest,period:review.after?.period,documentHash:review.after?.documentHash,starts:review.after?.starts},review.before?.identityDigest);
  if(before.version!==review.before.version || after.version!==review.after.version || review.dedupe!==sourceJobHash([user.id,review.sequenceDate,before.version,after.version])) fail(409,'RECEIPT_VERSION_CHANGED');
  const comparison=compareSources(before,after,review.sequenceDate);
  if(comparison.state!=='simulated-delay') fail(409,comparison.reason || 'NO_DELAY_ABOVE_FOUR_HOURS');
  return {...review,before,after,...comparison};
}
// Called by voluntary confirmation while its account/source transaction is
// still locked. A missing existing link preserves the review without guessing
// a destination; an eligible review reserves held atomically with its receipts.
export async function prepareConfirmedSourceJob(c,user,state,created,now) {
  if(!Number.isFinite(created) || created<=0) return {prepared:false,reason:'ACCOUNT_CREATION_PENDING'};
  if(state.consent!==true || !(Date.parse(state.expiresAt)>now)) return {prepared:false,reason:'CONSENT_REQUIRED_OR_EXPIRED'};
  let review;try{review=validatedReview(state,user);}catch(e){return {prepared:false,reason:e.code || 'CONFIRMED_REVIEW_REQUIRED'};}
  const destination=await lockedDestination(c,user,created,now);
  if(!destination) {await cancelSourceJobs(c,user);return {prepared:false,reason:'VERIFIED_EXISTING_DESTINATION_REQUIRED'};}
  const jobKey=sourceQueueJobKey(user,review),[jobs]=await c.query('SELECT id,status FROM crewcheck_notification_jobs WHERE email=? AND job_key=? FOR UPDATE',[user.email,jobKey]);
  if(jobs.length) {
    if(jobs[0].status==='held') {
      const [rows]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[sourceJobStateKey(user,jobKey)]),receipt=parse(rows[0]?.payload);
      if(receipt.ownerId!==user.id || receipt.scope!==SOURCE_JOB_SCOPE || receipt.consentRevision!==state.revision || receipt.reviewDedupe!==review.dedupe || receipt.linkVersion!==destination.version || receipt.expiresAt!==state.expiresAt) {
        await cancelSourceJobs(c,user);return {prepared:false,jobKey,status:'cancelled',duplicate:true,reason:'QUEUE_CONTEXT_CHANGED'};
      }
    }
    return {prepared:jobs[0].status==='held',jobKey,status:jobs[0].status,duplicate:true};
  }
  await c.query("INSERT INTO crewcheck_notification_jobs (email,job_key,scheduled_at,channel,chat_id,telegram_username,phone,message,status) VALUES(?,?,FROM_UNIXTIME(?/1000),'telegram',NULL,NULL,NULL,?,'held') ON DUPLICATE KEY UPDATE id=id",[user.email,jobKey,now,genericMessage]);
  const receipt={email:user.email,ownerId:user.id,scope:SOURCE_JOB_SCOPE,jobKey,consentRevision:state.revision,reviewDedupe:review.dedupe,
    beforeVersion:review.before.version,afterVersion:review.after.version,sequenceDate:review.sequenceDate,delayMinutes:review.delayMinutes,
    expiresAt:state.expiresAt,linkVersion:destination.version,sourceStatus:'user-confirmed-declaration',...flags};
  await save(c,sourceJobStateKey(user,jobKey),receipt);
  return {prepared:true,jobKey,status:'held',duplicate:false};
}
// The transport is deliberately fixed: it cannot accept a callback, recipient,
// provider configuration or URL, and records only a simulation outcome.
function simulatedTransport() {return {simulated:true,simulatedAccepted:true,transport:'local-no-network',accepted:false,delivered:false};}
export async function sourceQueue(db,user,body=null,{now=Date.now(),configured=false}={}) {
  if(!user?.id || !user?.email) fail(401,'SESSION_REQUIRED');
  if(body && (body.scope!==SOURCE_JOB_SCOPE || Object.keys(body).some(k=>!['scope','action','expectedRevision','jobKey'].includes(k)))) fail(400,'CLIENT_AUTHORITY_REJECTED');
  if(body && !['prepare','simulate'].includes(body.action)) fail(409,'REAL_DELIVERY_NOT_ACTIVE');
  const c=await db.getConnection();let committed=false;
  try {
    await c.beginTransaction();
    const [profiles]=await c.query('SELECT public_id,ROUND(UNIX_TIMESTAMP(created_at)*1000) AS created_epoch FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[user.email]);
    if(String(profiles[0]?.public_id || '')!==String(user.id)) fail(401,'OWNER_CHANGED');
    const created=Number(profiles[0]?.created_epoch);if(!Number.isFinite(created) || created<=0) fail(409,'ACCOUNT_CREATION_PENDING');
    const key=sourceKey(user),[rows]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[key]);
    let state=parse(rows[0]?.payload);
    if(state.ownerId!==user.id || state.email!==user.email || state.scope!==SOURCE_SCOPE) state={email:user.email,ownerId:user.id,scope:SOURCE_SCOPE,revision:0,consent:false};
    if(state.review && !(Date.parse(state.expiresAt)>now)) {
      await cancelSourceJobs(c,user);
      state={email:user.email,ownerId:user.id,scope:SOURCE_SCOPE,revision:state.revision+1,consent:false};await save(c,key,state);
      await c.commit();committed=true;
      if(body) fail(409,'CONSENT_REQUIRED_OR_EXPIRED');
      return {...flags,revision:state.revision,preparationConsent:false,expiresAt:null,destination:null,telegramConfigured:configured===true,job:null};
    }
    const consent=state.consent===true && Date.parse(state.expiresAt)>now;
    if(body && (!Number.isInteger(body.expectedRevision) || body.expectedRevision!==state.revision)) fail(409,'SOURCE_REVISION_CHANGED');
    if(body && !consent) fail(409,'CONSENT_REQUIRED_OR_EXPIRED');
    const destination=await lockedDestination(c,user,created,now);
    let review=null,reviewPending=null;
    if(consent) {try{review=validatedReview(state,user);}catch(e){reviewPending=e.code;}}
    const jobKey=review?sourceQueueJobKey(user,review):null;
    let jobs=[],receipt={};
    if(jobKey) {
      [jobs]=await c.query('SELECT id,status FROM crewcheck_notification_jobs WHERE email=? AND job_key=? FOR UPDATE',[user.email,jobKey]);
      const [metadata]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[sourceJobStateKey(user,jobKey)]);receipt=parse(metadata[0]?.payload);
    }
    const mismatch=jobs.length && jobs[0].status==='held' && (receipt.ownerId!==user.id || receipt.scope!==SOURCE_JOB_SCOPE || receipt.consentRevision!==state.revision || receipt.reviewDedupe!==review?.dedupe || !destination || receipt.linkVersion!==destination.version || receipt.expiresAt!==state.expiresAt);
    if(mismatch || (!consent && jobs.length)) {
      await cancelSourceJobs(c,user);if(jobs[0])jobs[0].status='cancelled';receipt={};
      await c.commit();committed=true;
      if(body) fail(409,'QUEUE_CONTEXT_CHANGED');
    }
    const info=()=>({...flags,revision:state.revision,preparationConsent:consent,expiresAt:consent?state.expiresAt:null,
      destination:destination?{label:destination.label,verifiedAt:destination.verifiedAt,validated:true}:null,
      telegramConfigured:configured===true,reviewPending,delayMinutes:review?.delayMinutes ?? null,
      job:jobs.length?{jobKey,status:jobs[0].status,simulated:receipt.simulation?.simulated===true}:null});
    if(!body){if(!committed)await c.commit();return info();}
    if(reviewPending || !review) fail(409,reviewPending || 'CONFIRMED_REVIEW_REQUIRED');
    if(!destination) fail(409,'VERIFIED_EXISTING_DESTINATION_REQUIRED');
    if(body.action==='prepare') {
      if(body.jobKey!==undefined) fail(400,'SERVER_JOB_KEY_REQUIRED');
      if(!jobs.length) {
        await prepareConfirmedSourceJob(c,user,state,created,now);
        const [metadata]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[sourceJobStateKey(user,jobKey)]);receipt=parse(metadata[0]?.payload);jobs=[{status:'held'}];
        await c.commit();return {...info(),duplicate:false};
      }
      await c.commit();return {...info(),duplicate:true};
    }
    if(body.jobKey!==jobKey || !jobs.length) fail(409,'OWN_SIMULATION_JOB_REQUIRED');
    if(jobs[0].status!=='held') fail(409,'JOB_NOT_HELD');
    // Account/source/link locks remain held until the audit commit. No queue
    // status or recipient is changed, and there is no real delivery consent.
    const duplicate=receipt.simulation?.simulated===true;
    if(!duplicate){receipt={...receipt,simulation:{...simulatedTransport(),at:new Date(now).toISOString()}};await save(c,sourceJobStateKey(user,jobKey),receipt);}
    await c.commit();return {...info(),duplicate,simulation:receipt.simulation};
  }catch(e){if(!committed)await c.rollback();throw e;}finally{c.release();}
}
export async function handleSourceQueue(req,res,{identity,dbPool,readJson,sendJson,configured=false}) {
  const user=identity(req);if(!user)return sendJson(res,401,{ok:false,code:'SESSION_REQUIRED'});
  if(!['GET','POST'].includes(req.method))return sendJson(res,405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  try {
    const db=await dbPool();if(!db)fail(503,'DATABASE_UNAVAILABLE');
    return sendJson(res,200,{ok:true,...await sourceQueue(db,user,req.method==='POST'?await readJson(req):null,{configured})});
  }catch(e){return sendJson(res,e.status || 503,{ok:false,code:e.code || 'SOURCE_QUEUE_UNAVAILABLE',...flags});}
}
