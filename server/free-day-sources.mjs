// Voluntary minimal receipts only. No original files, raw text, queue or transport.
import {SOURCE_SCOPE,sourceKey,validateReceipt,compareSources} from './free-day-source-contract.mjs';
export {SOURCE_SCOPE,sourceKey,validateReceipt,compareSources} from './free-day-source-contract.mjs';
import {cancelSourceJobs} from './free-day-source-job-state.mjs';
import {prepareConfirmedSourceJob} from './free-day-source-queue.mjs';
const TTL=30*86400000;
import crypto from 'node:crypto';
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail=(status,code)=>{throw Object.assign(new Error(code),{status,code});};
const parse=x=>{try{return typeof x==='string'?JSON.parse(x):x || {};}catch{return {};}};
const only=(x,fields)=>x && typeof x==='object' && !Array.isArray(x) && Object.keys(x).every(k=>fields.includes(k));
const date=x=>/^\d{4}-\d{2}-\d{2}$/.test(x || '') && Number.isFinite(Date.parse(x+'T12:00Z')) && new Date(x+'T12:00Z').toISOString().slice(0,10)===x;
const publicState = (state,now) => ({revision:state.revision || 0,consent:state.consent===true && Date.parse(state.expiresAt)>now,expiresAt:state.expiresAt || null,
  review:Date.parse(state.expiresAt)>now?state.review || null:null,dispatchAllowed:false,delivered:false,officialVerified:false,linkVerified:false});
export async function voluntarySources(db,user,body=null,{now=Date.now()}={}) {
  if (!user?.email || !user?.id) fail(401,'SESSION_REQUIRED');
  if (body && (!only(body,['scope','action','expectedRevision','before','after','sequenceDate','confirmed','consent']) || body.scope!==SOURCE_SCOPE)) fail(400,'CLIENT_AUTHORITY_REJECTED');
  const c=await db.getConnection();
  let committed=false;
  try {
    await c.beginTransaction();
    const [owners]=await c.query('SELECT public_id,ROUND(UNIX_TIMESTAMP(created_at)*1000) AS created_epoch FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[user.email]);
    if (String(owners[0]?.public_id || '')!==String(user.id)) fail(401,'OWNER_CHANGED');
    const key=sourceKey(user);
    const [rows]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[key]);
    const stored=parse(rows[0]?.payload);
    let state=stored.ownerId===user.id && stored.scope===SOURCE_SCOPE?stored:{email:user.email,ownerId:user.id,scope:SOURCE_SCOPE,revision:0,consent:false};
    // Physical receipt expiry is enforced on the next authenticated access, without a background job.
    if (state.review && !(Date.parse(state.expiresAt)>now)) {
      const expiredRevision=state.revision;
      await cancelSourceJobs(c,user);
      state={email:user.email,ownerId:user.id,scope:SOURCE_SCOPE,revision:expiredRevision+1,consent:false};
      await save(c,key,state);
      // Commit retention cleanup while holding the owner lock. A stale POST
      // must not roll it back, and no subsequent mutation uses the released lock.
      await c.commit(); committed=true;
      if (!body) return publicState(state,now);
      if (body.action==='revoke' && only(body,['scope','action','expectedRevision']) && body.expectedRevision===expiredRevision)
        return {...publicState(state,now),expired:true,alreadyRevoked:true};
      fail(409,'SOURCE_REVISION_CHANGED');
    }
    if (body) {
      if (!Number.isInteger(body.expectedRevision) || body.expectedRevision!==state.revision) fail(409,'SOURCE_REVISION_CHANGED');
      if (body.action==='revoke') {
        if (Object.keys(body).some(k=>!['scope','action','expectedRevision'].includes(k))) fail(400,'CLIENT_AUTHORITY_REJECTED');
        await cancelSourceJobs(c,user);
        state={email:user.email,ownerId:user.id,scope:SOURCE_SCOPE,revision:state.revision+1,consent:false};
      } else if (body.action==='review') {
        if (body.confirmed!==true || body.consent!==true || !date(body.sequenceDate)) fail(400,'SPECIFIC_CONFIRMATION_REQUIRED');
        const [rosters]=await c.query('SELECT roster FROM crewcheck_platform_rosters WHERE owner_email=? AND active=TRUE FOR UPDATE',[user.email]);
        if (rosters.length!==1) fail(409,'OWN_ACTIVE_SOURCE_REQUIRED');
        const roster=parse(rosters[0].roster);
        if (!roster.crewId || !roster.base) fail(409,'SOURCE_IDENTITY_PENDING');
        const identityDigest=hash([String(roster.crewId),String(roster.base)]);
        const before=validateReceipt(body.before,identityDigest),after=validateReceipt(body.after,identityDigest);
        const comparison=compareSources(before,after,body.sequenceDate);
        const dedupe=hash([user.id,body.sequenceDate,before.version,after.version]);
        if (state.consent===true && Date.parse(state.expiresAt)>now && state.review?.dedupe===dedupe) { const queuePreparation=await prepareConfirmedSourceJob(c,user,state,Number(owners[0]?.created_epoch),now);await c.commit();return {...publicState(state,now),duplicate:true,queuePreparation}; }
        await cancelSourceJobs(c,user);
        state={email:user.email,ownerId:user.id,scope:SOURCE_SCOPE,revision:state.revision+1,consent:true,expiresAt:new Date(now+TTL).toISOString(),
          review:{before,after,sequenceDate:body.sequenceDate,dedupe,confirmedAt:new Date(now).toISOString(),sourceStatus:'user-confirmed-declaration',...comparison,possibleAmount:null}};
      } else fail(400,'UNKNOWN_ACTION');
      await save(c,key,state);
      if(body.action==='review') { const queuePreparation=await prepareConfirmedSourceJob(c,user,state,Number(owners[0]?.created_epoch),now);await c.commit();return {...publicState(state,now),queuePreparation}; }
    }
    await c.commit(); return publicState(state,now);
  } catch(error) { if (!committed) await c.rollback(); throw error; } finally { c.release(); }
}
async function save(c,key,state) { await c.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=NOW(3)',[key,JSON.stringify(state)]); }
export async function handleVoluntarySources(req,res,{identity,dbPool,readJson,sendJson}) {
  const user=identity(req);
  if (!user) return sendJson(res,401,{ok:false,code:'SESSION_REQUIRED'});
  if (!['GET','POST'].includes(req.method)) return sendJson(res,405,{ok:false,code:'METHOD_NOT_ALLOWED'});
  try {
    const db=await dbPool(); if (!db) fail(503,'DATABASE_UNAVAILABLE');
    const result=await voluntarySources(db,user,req.method==='POST'?await readJson(req):null);
    return sendJson(res,200,{ok:true,...result});
  } catch(e) { return sendJson(res,e.status || 503,{ok:false,code:e.code || 'VOLUNTARY_REVIEW_UNAVAILABLE',dispatchAllowed:false}); }
}
