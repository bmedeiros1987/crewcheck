// Personal authorization only. Never releases held jobs or invokes a provider.
import {SOURCE_SCOPE,sourceKey} from './free-day-source-contract.mjs';
import {sourceJobHash,sourceJobStateKey,SOURCE_JOB_SCOPE} from './free-day-source-job-state.mjs';
import {lockedDestination,validatedReview,sourceQueueJobKey} from './free-day-source-queue.mjs';
export const PERSONAL_SCOPE='free-day-personal-consent-v1';
export const PERSONAL_TEXT_VERSION='1';
export function personalConsentConfiguration(env=process.env) {
  return {offerEnabled:env.CREWCHECK_FREE_DAY_PERSONAL_CONSENT_OFFER==='true',
    ownerIds:String(env.CREWCHECK_FREE_DAY_PERSONAL_CONSENT_OWNER_IDS || '').split(',').map(x=>x.trim()).filter(Boolean)};
}
const fail=(status,code)=>{throw Object.assign(new Error(code),{status,code});};
const parse=x=>{try{return typeof x==='string'?JSON.parse(x):x || {};}catch{return {};}};
export async function personalConsent(db,user,body=null,{now=Date.now(),configuration={offerEnabled:false,ownerIds:[]}}={}) {
  if(!user?.id || !user?.email)fail(401,'SESSION_REQUIRED');
  if(body && (body.scope!==PERSONAL_SCOPE || Object.keys(body).some(k=>!['scope','action','context','expectedRevision','confirmed','textVersion'].includes(k)) || !['grant','revoke'].includes(body.action)))fail(400,'CLIENT_AUTHORITY_REJECTED');
  const c=await db.getConnection();let committed=false;
  try {
    await c.beginTransaction();
    const [profiles]=await c.query('SELECT public_id,ROUND(UNIX_TIMESTAMP(created_at)*1000) AS created_epoch FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[user.email]);
    if(String(profiles[0]?.public_id || '')!==String(user.id))fail(401,'OWNER_CHANGED');
    const created=Number(profiles[0]?.created_epoch);if(!Number.isFinite(created) || created<=0)fail(409,'ACCOUNT_CREATION_PENDING');
    const [sources]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[sourceKey(user)]);
    const state=parse(sources[0]?.payload);
    const prepared=state.ownerId===user.id && state.email===user.email && state.scope===SOURCE_SCOPE && state.consent===true && Date.parse(state.expiresAt)>now;
    let review=null;try{if(prepared)review=validatedReview(state,user);}catch{}
    const destination=await lockedDestination(c,user,created,now);
    const key=review?sourceQueueJobKey(user,review):null;
    const [jobs]=key?await c.query('SELECT id,status FROM crewcheck_notification_jobs WHERE email=? AND job_key=? FOR UPDATE',[user.email,key]):[[]];
    const metadataKey=key?sourceJobStateKey(user,key):null;
    const [rows]=metadataKey?await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[metadataKey]):[[]];
    let receipt=parse(rows[0]?.payload);
    const valid=prepared && review && destination && jobs[0]?.status==='held' && receipt.ownerId===user.id && receipt.email===user.email && receipt.scope===SOURCE_JOB_SCOPE && receipt.consentRevision===state.revision && receipt.reviewDedupe===review.dedupe && receipt.linkVersion===destination.version && receipt.expiresAt===state.expiresAt;
    const context=valid?sourceJobHash([PERSONAL_SCOPE,user.id,created,state.revision,review.dedupe,destination.version,state.expiresAt]):null;
    let personal=receipt.personalConsent || {revision:0};
    const revision=Number.isInteger(personal.revision)?personal.revision:0;
    const available=Boolean(valid && configuration.offerEnabled===true && Array.isArray(configuration.ownerIds) && configuration.ownerIds.includes(String(user.id)));
    const active=()=>Boolean(valid && personal.context===context && personal.granted===true && Date.parse(personal.expiresAt)>now && personal.textVersion===PERSONAL_TEXT_VERSION);
    const info=()=>({scope:PERSONAL_SCOPE,available,context,revision:personal.revision || 0,textVersion:PERSONAL_TEXT_VERSION,
      consent:active(),expiresAt:active()?personal.expiresAt:null,dispatchAllowed:false,accepted:false,delivered:false,
      destination:valid?{label:`Telegram ${destination.label.includes('coletivo')?'coletivo vinculado':'da sua conta'} · chat ${destination.label.split('chat ')[1]}`,collective:destination.label.includes('coletivo'),validated:true}:null,
      reason:!valid?'CONSENT_CONTEXT_CHANGED':!available?'CONSENT_NOT_OFFERED':null});
    if(!body){if(!committed)await c.commit();return info();}
    if(!valid || body.context!==context)fail(409,'CONSENT_CONTEXT_CHANGED');
    if(body.action==='revoke' && (body.confirmed!==undefined || body.textVersion!==undefined))fail(400,'CLIENT_AUTHORITY_REJECTED');
    if(body.action==='grant' && !available)fail(403,'CONSENT_NOT_OFFERED');
    if(body.action==='grant' && active() && personal.requestRevision===body.expectedRevision && body.confirmed===true && body.textVersion===PERSONAL_TEXT_VERSION){await c.commit();return {...info(),duplicate:true};}
    if(body.action==='revoke' && personal.granted===false && personal.requestRevision===body.expectedRevision){await c.commit();return {...info(),duplicate:true};}
    if(!Number.isInteger(body.expectedRevision) || body.expectedRevision!==revision)fail(409,'PERSONAL_REVISION_CHANGED');
    if(body.action==='grant') {
      if(!available)fail(403,'CONSENT_NOT_OFFERED');
      if(body.confirmed!==true || body.textVersion!==PERSONAL_TEXT_VERSION)fail(400,'PERSONAL_CONFIRMATION_REQUIRED');
      if(active()){await c.commit();return {...info(),duplicate:true};}
      personal={revision:revision+1,requestRevision:body.expectedRevision,context,granted:true,textVersion:PERSONAL_TEXT_VERSION,grantedAt:new Date(now).toISOString(),expiresAt:new Date(Math.min(now+30*86400000,Date.parse(state.expiresAt))).toISOString()};
    } else {
      if(body.confirmed!==undefined || body.textVersion!==undefined)fail(400,'CLIENT_AUTHORITY_REJECTED');
      if(personal.granted!==true){await c.commit();return {...info(),duplicate:true};}
      personal={revision:revision+1,requestRevision:body.expectedRevision,context,granted:false,revokedAt:new Date(now).toISOString()};
    }
    receipt={...receipt,personalConsent:personal};
    await c.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=NOW(3)',[metadataKey,JSON.stringify(receipt)]);
    await c.commit();return {...info(),duplicate:false};
  }catch(e){if(!committed)await c.rollback();throw e;}finally{c.release();}
}
export async function handlePersonalConsent(req,res,{identity,dbPool,readJson,sendJson}) {
  const user=identity(req);if(!user)return sendJson(res,401,{ok:false,code:'SESSION_REQUIRED'});
  if(!['GET','POST'].includes(req.method))return sendJson(res,405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  try{const db=await dbPool();if(!db)fail(503,'DATABASE_UNAVAILABLE');return sendJson(res,200,{ok:true,...await personalConsent(db,user,req.method==='POST'?await readJson(req):null,{configuration:personalConsentConfiguration()})});}
  catch(e){return sendJson(res,e.status || 503,{ok:false,code:e.code || 'PERSONAL_CONSENT_UNAVAILABLE',dispatchAllowed:false,accepted:false,delivered:false});}
}
