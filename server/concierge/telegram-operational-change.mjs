import { telegramOperationalAuthority as authority } from './telegram-briefing.mjs';
import { inspectOperationalChange } from './operational-change-source.mjs';
import { radarFlightId, radarSourceEpoch } from '../../shared/gate-query-day.mjs';
import { requireExistingIdentity, readBody, sendJson } from '../v139/common.mjs';

export const TELEGRAM_OPERATIONAL_CHANGE_ENABLED = false;
export const OPERATIONAL_CHANGE_PREFIX = 'operational-change:';
const { transaction, currentContext, principal, readState, writeState, hash, parse, deny } = authority;
const topics = new Set(['gate','status']);
const consentKey = (email, owner, field) => 'operational-change-consent:' + hash([email,owner,field]);
const eventKey = key => 'operational-change-event:' + hash(key);
const noSource = async () => null;
const ownPrefix = field => OPERATIONAL_CHANGE_PREFIX + field + ':';
// Same event dimensions as gateCandidateEnvelope: admitted scope + new value +
// source observation. Telegram binding replaces installation authority; neither
// a previous baseline edit nor a consent revision may re-arm the same event.
function jobKey(context, field, source) {
  const i=source.value.scope.identity;
  return ownPrefix(field)+hash([context.owner,context.bindingRevision,radarFlightId(i.flight),i.origin,i.destination,
    radarSourceEpoch(i.scheduledDepartureUtc),source.change.after,source.observedAt]);
}
function consentValid(value, context, field, now) {
  return value?.version === 1 && value.enabled === true && value.email === context.email && value.owner === context.owner
    && value.field === field && value.topic === 'departure-'+field+'-change' && value.channel === 'telegram'
    && value.bindingRevision === context.bindingRevision && Number.isSafeInteger(value.revision) && value.revision > 0
    && Number.isFinite(value.grantedAt) && value.grantedAt <= now;
}
async function currentSource(c, context, field, readSource, now) {
  // Trusted server callback only. It MUST obtain full current reads under locks,
  // bind the canonical active roster/occurrence, and never call a paid upstream.
  const value = await readSource(c, context, { lockSource: true, now });
  if (!value || value.scope?.ownerId !== context.owner) throw deny();
  const change = inspectOperationalChange(value.source, value.scope, field, now);
  if (change.status !== 'change') throw deny();
  return { value, change, fingerprint: hash(value),
    observedAt: Date.parse(change.current.sourceUpdatedAt),
    expiresAt: Math.min(Date.parse(change.current.sourceUpdatedAt)+1800000, Date.parse(value.scope.identity.scheduledDepartureUtc)+3600000) };
}
export async function changeTelegramOperationalConsent(db, identity, input, { enabled = TELEGRAM_OPERATIONAL_CHANGE_ENABLED, clock = Date.now } = {}) {
  if (enabled !== true) return { status:'disabled', received:null };
  const who = principal(identity, clock()), field = input?.field;
  if (!who || !topics.has(field) || typeof input.enabled !== 'boolean' || !Number.isSafeInteger(input.expectedRevision)
    || input.expectedRevision < 0 || input.expectedRevision >= Number.MAX_SAFE_INTEGER || input.enabled && input.confirmed !== true) throw deny();
  return transaction(db, async c => {
    const [owners] = await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[who.email]);
    if (owners.length !== 1 || owners[0].public_id !== who.owner) throw deny();
    const key = consentKey(who.email,who.owner,field), old = await readState(c,key);
    if ((old?.revision || 0) !== input.expectedRevision || old && (old.email !== who.email || old.owner !== who.owner || old.field !== field)) throw deny();
    const context = input.enabled ? await currentContext(c,who.email,who.owner,clock) : null;
    const record = { version:1,...who,field,topic:'departure-'+field+'-change',channel:'telegram',enabled:input.enabled,
      revision:input.expectedRevision+1,grantedAt:clock(),bindingRevision:context?.bindingRevision || null };
    await writeState(c,key,record);
    const prefix=ownPrefix(field);
    await c.query("UPDATE crewcheck_notification_jobs SET status='cancelled',locked_at=NULL WHERE email=? AND LEFT(job_key,?)=? AND status IN ('pending','processing')",[who.email,prefix.length,prefix]);
    const [inflight]=await c.query("SELECT id FROM crewcheck_notification_jobs WHERE email=? AND LEFT(job_key,?)=? AND status='dispatching'",[who.email,prefix.length,prefix]);
    return { status:input.enabled?'consent_recorded':'consent_revoked',revision:record.revision,inFlight:inflight.length>0,received:null };
  });
}
export async function runTelegramOperationalChangeCycle(db, { enabled = TELEGRAM_OPERATIONAL_CHANGE_ENABLED, readSource = noSource, clock = Date.now } = {}) {
  if (enabled !== true) return { status:'disabled',planned:0 };
  const [rows]=await db.query("SELECT state_key,payload FROM crewcheck_telegram_state WHERE state_key LIKE 'operational-change-consent:%' AND JSON_EXTRACT(payload,'$.enabled')=true ORDER BY updated_at,state_key LIMIT 50");
  let planned=0,blocked=0;
  for (const row of rows) {
    await db.query('UPDATE crewcheck_telegram_state SET updated_at=NOW(3) WHERE state_key=?',[row.state_key]);
    try {
      const hint=parse(row);
      if (!hint?.email || !hint.owner || !topics.has(hint.field) || row.state_key!==consentKey(hint.email,hint.owner,hint.field)) throw deny();
      const didPlan=await transaction(db,async c=>{
        const context=await currentContext(c,hint.email,hint.owner,clock);
        const consent=await readState(c,consentKey(context.email,context.owner,hint.field));
        if (!consentValid(consent,context,hint.field,clock())) throw deny();
        const source=await currentSource(c,context,hint.field,readSource,clock());
        // Enrollment does not backfill an already-observed change.
        if (source.observedAt < consent.grantedAt || clock() >= source.expiresAt) return false;
        const key=jobKey(context,hint.field,source);
        const [jobs]=await c.query('SELECT id,status FROM crewcheck_notification_jobs WHERE email=? AND job_key=? FOR UPDATE',[context.email,key]);
        if (jobs.length) return false; // every durable state, including cancelled/uncertain, fences replay
        const scheduledAt=clock();
        const record={version:1,...context,field:hint.field,consentRevision:consent.revision,sourceFingerprint:source.fingerprint,
          observedAt:source.observedAt,expiresAt:source.expiresAt,scheduledAt,jobKey:key};
        await writeState(c,eventKey(key),record);
        await c.query("INSERT INTO crewcheck_notification_jobs (email,job_key,scheduled_at,channel,chat_id,message,status) VALUES (?,?,FROM_UNIXTIME(?/1000),'telegram',?,?,'pending') ON DUPLICATE KEY UPDATE id=id",[context.email,key,scheduledAt,context.chatId,'Operational change; server validation required.']);
        return true;
      });
      if(didPlan)planned++;
    }catch{blocked++;}
  }
  return {status:'observed',planned,blocked};
}
export async function dispatchTelegramOperationalChange(db, selected, {enabled=TELEGRAM_OPERATIONAL_CHANGE_ENABLED,readSource=noSource,deliver,clock=Date.now}={}) {
  const cancel=async()=>{await db.query("UPDATE crewcheck_notification_jobs SET status='cancelled',locked_at=NULL WHERE id=? AND status='processing' AND locked_at=?",[selected.id,selected.locked_at]);return {status:'cancelled',accepted:false,delivered:null};};
  if(enabled!==true)return cancel();
  let job,event,source,attempted=false;
  try {
    const ready=await transaction(db,async c=>{
      const [hints]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[eventKey(selected.job_key)]);
      const hint=hints.length===1?parse(hints[0]):null;
      if(hint?.version!==1 || hint.jobKey!==selected.job_key || hint.email!==selected.email || !topics.has(hint.field))throw deny();
      const context=await currentContext(c,hint.email,hint.owner,clock);
      const consent=await readState(c,consentKey(context.email,context.owner,hint.field));
      if(!consentValid(consent,context,hint.field,clock()) || consent.revision!==hint.consentRevision || context.bindingRevision!==hint.bindingRevision)throw deny();
      source=await currentSource(c,context,hint.field,readSource,clock());
      const locked=await readState(c,eventKey(selected.job_key));
      const expectedKey=jobKey(context,hint.field,source);
      if(hash(locked)!==hash(hint) || source.fingerprint!==hint.sourceFingerprint || expectedKey!==hint.jobKey
        || source.observedAt!==hint.observedAt || source.expiresAt!==hint.expiresAt || source.observedAt<consent.grantedAt)throw deny();
      const [jobs]=await c.query("SELECT *,ROUND(UNIX_TIMESTAMP(scheduled_at)*1000) AS scheduled_epoch FROM crewcheck_notification_jobs WHERE id=? AND status='processing' AND locked_at=? FOR UPDATE",[selected.id,selected.locked_at]);
      job=jobs[0];event=hint;
      const now=clock();
      if(!job || job.job_key!==hint.jobKey || job.email!==context.email || job.channel!=='telegram' || job.chat_id!==context.chatId
        || !Number.isSafeInteger(hint.scheduledAt) || Number(job.scheduled_epoch)!==hint.scheduledAt || !Number.isFinite(now)
        || now<hint.scheduledAt || now>hint.scheduledAt+120000 || now>=source.expiresAt)throw deny();
      const name=hint.field==='gate'?'Portão':'Status';
      // Values came exclusively from the freshly validated field proof.
      job.message=`${name} atualizado: ${source.change.before} → ${source.change.after}. Confira os canais oficiais antes de agir.`;
      attempted=true;
      const [claim]=await c.query("UPDATE crewcheck_notification_jobs SET status='dispatching' WHERE id=? AND status='processing' AND locked_at=?",[job.id,job.locked_at]);
      return claim.affectedRows===1;
    });
    if(!ready)return {status:'skipped',accepted:false,delivered:null};
  }catch{return attempted?{status:'uncertain',accepted:false,delivered:null}:cancel();}
  const now=clock();
  if(!Number.isFinite(now)||now<event.scheduledAt||now>event.scheduledAt+120000||now>=source.expiresAt){
    await db.query("UPDATE crewcheck_notification_jobs SET status='expired',locked_at=NULL WHERE id=? AND status='dispatching' AND locked_at=?",[job.id,job.locked_at]);
    return {status:'expired',accepted:false,delivered:null};
  }
  let accepted=false;
  try{accepted=(await deliver(job))?.ok===true;}catch{}
  const status=accepted?'sent':'uncertain';
  await db.query("UPDATE crewcheck_notification_jobs SET status=?,locked_at=NULL,sent_at=IF(?=1,NOW(3),sent_at),last_error=? WHERE id=? AND status='dispatching' AND locked_at=?",[status,accepted?1:0,accepted?null:'Operational change attempt unconfirmed; no automatic retry.',job.id,job.locked_at]);
  return {status,accepted,delivered:null};
}
export async function handleTelegramOperationalConsent(req,res,url,{enabled=TELEGRAM_OPERATIONAL_CHANGE_ENABLED,identify=requireExistingIdentity,read=readBody,reply=sendJson,clock=Date.now}={}){
  if(url.pathname!=='/api/notifications/operational-change')return false;
  if(enabled!==true){reply(res,503,{ok:false,code:'OPERATIONAL_CHANGE_DISABLED'});return true;}
  if(!['GET','POST'].includes(req.method)){reply(res,405,{ok:false,code:'METHOD_NOT_ALLOWED'});return true;}
  if(req.method==='POST'&&(!['https://crewcheck.online','https://www.crewcheck.online','https://crewcheck.onrender.com'].includes(req.headers?.origin)||req.headers?.['sec-fetch-site']==='cross-site')){reply(res,403,{ok:false,code:'ORIGIN_REFUSED'});return true;}
  const identity=await identify(req,res);if(!identity)return true;
  const who=principal(identity,clock());if(!who){reply(res,401,{ok:false,code:'AUTH_REQUIRED'});return true;}
  try{
    if(req.method==='POST')reply(res,200,{ok:true,...await changeTelegramOperationalConsent(identity.db,identity,await read(req),{enabled,clock})});
    else{
      const consent=await transaction(identity.db,async c=>{
        const [owners]=await c.query('SELECT p.public_id,a.must_change_password FROM crewcheck_platform_profiles p JOIN crewcheck_platform_accounts a ON a.email=p.email WHERE p.email=? FOR UPDATE',[who.email]);
        if(owners.length!==1||owners[0].public_id!==who.owner||![false,0,'0'].includes(owners[0].must_change_password))throw deny();
        let context=null;try{context=await currentContext(c,who.email,who.owner,clock);}catch{}
        const result={};for(const field of topics){const saved=await readState(c,consentKey(who.email,who.owner,field));
          if(saved&&(saved.email!==who.email||saved.owner!==who.owner||saved.field!==field||!Number.isSafeInteger(saved.revision)))throw deny();
          result[field]={recorded:saved?.enabled===true,enabled:Boolean(context&&consentValid(saved,context,field,clock())),revision:saved?.revision||0};}
        return result;
      });
      reply(res,200,{ok:true,consent,schedulingConfirmed:false,deliveryConfirmed:false});
    }
  }catch{reply(res,409,{ok:false,code:'OPERATIONAL_CHANGE_CONTEXT_CHANGED'});}
  return true;
}
