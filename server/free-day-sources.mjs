// Voluntary minimal receipts only. No original files, raw text, queue or transport.
import crypto from 'node:crypto';
export const SOURCE_SCOPE = 'free-day-voluntary-review-v1';
const TTL = 30 * 86400000;
const hash = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fail = (status, code) => { throw Object.assign(new Error(code), { status, code }); };
const parse = x => { try { return typeof x === 'string' ? JSON.parse(x) : x || {}; } catch { return {}; } };
const only = (x, fields) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).every(k => fields.includes(k));
const date = x => /^\d{4}-\d{2}-\d{2}$/.test(x || '') && Number.isFinite(Date.parse(x + 'T12:00Z')) && new Date(x + 'T12:00Z').toISOString().slice(0,10) === x;
export const sourceKey = user => 'notification-free-day-sources:' + hash([user.email,user.id]);
export function validateReceipt(input, identityDigest) {
  if (!only(input,['identityDigest','period','documentHash','starts']) || input.identityDigest !== identityDigest) fail(409,'SOURCE_IDENTITY_PENDING');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period || '') || !/^[a-f0-9]{64}$/.test(input.documentHash || '') || !Array.isArray(input.starts) || !input.starts.length || input.starts.length > 370) fail(400,'SOURCE_METADATA_REQUIRED');
  const starts = input.starts.map(s => {
    if (!only(s,['date','clock','offset','literal']) || !date(s.date) || !s.date.startsWith(input.period + '-')) fail(400,'SOURCE_DATE_PENDING');
    const valid = s.literal === true && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.clock || '') && Number.isInteger(s.offset) && Math.abs(s.offset) <= 840;
    return { date:s.date,clock:valid?s.clock:null,offset:valid?s.offset:null,literal:valid };
  }).sort((a,b)=>a.date.localeCompare(b.date));
  if (new Set(starts.map(s=>s.date)).size !== starts.length) fail(400,'DUPLICATE_SOURCE_DATE');
  const minimal = { identityDigest,period:input.period,documentHash:input.documentHash,starts };
  return {...minimal,version:hash(minimal),origin:'voluntary-upload-declared',officialVerified:false};
}
export function compareSources(before,after,sequenceDate) {
  if (before.period !== after.period || before.identityDigest !== after.identityDigest) fail(409,'IDENTITY_OR_PERIOD_PENDING');
  if (before.documentHash === after.documentHash || before.version === after.version) return {state:'pending',reason:'DISTINCT_VERSIONS_REQUIRED',delayMinutes:null};
  const boundary = receipt => {
    const index = receipt.starts.findIndex(s=>s.date===sequenceDate);
    return index >= 0 && (index===0 || Date.parse(sequenceDate)-Date.parse(receipt.starts[index-1].date)!==86400000) ? receipt.starts[index] : null;
  };
  const old=boundary(before), current=boundary(after);
  if (!old || !current) return {state:'pending',reason:'SEQUENCE_CORRESPONDENCE_PENDING',delayMinutes:null};
  if (!old.literal || !current.literal) return {state:'pending',reason:'LITERAL_START_PENDING',delayMinutes:null};
  const instant = s=>Date.parse(s.date+'T'+s.clock+':00Z')-s.offset*60000;
  const delayMinutes=(instant(current)-instant(old))/60000;
  return {state:delayMinutes>240?'simulated-delay':'no-delay-above-four-hours',reason:null,delayMinutes};
}
const publicState = (state,now) => ({revision:state.revision || 0,consent:state.consent===true && Date.parse(state.expiresAt)>now,expiresAt:state.expiresAt || null,
  review:Date.parse(state.expiresAt)>now?state.review || null:null,dispatchAllowed:false,delivered:false,officialVerified:false,linkVerified:false});
export async function voluntarySources(db,user,body=null,{now=Date.now()}={}) {
  if (!user?.email || !user?.id) fail(401,'SESSION_REQUIRED');
  if (body && (!only(body,['scope','action','expectedRevision','before','after','sequenceDate','confirmed','consent']) || body.scope!==SOURCE_SCOPE)) fail(400,'CLIENT_AUTHORITY_REJECTED');
  const c=await db.getConnection();
  let committed=false;
  try {
    await c.beginTransaction();
    const [owners]=await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[user.email]);
    if (String(owners[0]?.public_id || '')!==String(user.id)) fail(401,'OWNER_CHANGED');
    const key=sourceKey(user);
    const [rows]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[key]);
    const stored=parse(rows[0]?.payload);
    let state=stored.ownerId===user.id && stored.scope===SOURCE_SCOPE?stored:{email:user.email,ownerId:user.id,scope:SOURCE_SCOPE,revision:0,consent:false};
    // Physical receipt expiry is enforced on the next authenticated access, without a background job.
    if (state.review && !(Date.parse(state.expiresAt)>now)) {
      const expiredRevision=state.revision;
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
        if (state.consent===true && Date.parse(state.expiresAt)>now && state.review?.dedupe===dedupe) { await c.commit(); return {...publicState(state,now),duplicate:true}; }
        state={email:user.email,ownerId:user.id,scope:SOURCE_SCOPE,revision:state.revision+1,consent:true,expiresAt:new Date(now+TTL).toISOString(),
          review:{before,after,sequenceDate:body.sequenceDate,dedupe,confirmedAt:new Date(now).toISOString(),sourceStatus:'user-confirmed-declaration',...comparison,possibleAmount:null}};
      } else fail(400,'UNKNOWN_ACTION');
      await save(c,key,state);
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
