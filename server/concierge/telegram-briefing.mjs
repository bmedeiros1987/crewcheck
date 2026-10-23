import { createHash } from 'node:crypto';
import { requireExistingIdentity, readBody, sendJson, parseJsonColumn } from '../v139/common.mjs';
import { readOperationalBriefingPreview } from './operational-briefing-source.mjs';
import { briefingPresentation, briefingTriggerAt } from './briefing-preferences.mjs';

// Code gate only: no environment setting enables enrollment, planning or sending.
export const TELEGRAM_OPERATIONAL_BRIEFING_ENABLED = false;
export const BRIEFING_JOB_PREFIX = 'operational-briefing:';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const emailKey = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const consentKey = (email, owner) => 'briefing-consent:' + hash([email, owner]);
const eventKey = jobKey => 'briefing-event:' + hash(jobKey);
const iso = value => new Date(value).toISOString();
const terminal = new Set(['sent','failed','expired','uncertain','cancelled','partial','dispatching']);
const parse = row => row ? parseJsonColumn(row.payload, null) : null;
const deny = () => Object.assign(new Error('Briefing context unavailable'), { code: 'BRIEFING_CONTEXT_UNAVAILABLE' });
async function transaction(db, run) {
  const c = await db.getConnection();
  try { await c.beginTransaction(); const result = await run(c); await c.commit(); return result; }
  catch (error) { await c.rollback(); throw error; } finally { c.release(); }
}
async function readState(c, key) {
  const [rows] = await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [key]);
  if (!Array.isArray(rows) || rows.length > 1) throw deny();
  const value = parse(rows[0]);
  if (rows.length && (!value || typeof value !== 'object' || Array.isArray(value))) throw deny();
  return value;
}
async function writeState(c, key, value) {
  await c.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES (?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=NOW(3)', [key, JSON.stringify(value)]);
}
async function currentContext(c, email, owner, clock) {
  const [profiles] = await c.query('SELECT p.public_id,a.must_change_password FROM crewcheck_platform_profiles p JOIN crewcheck_platform_accounts a ON a.email=p.email WHERE p.email=? FOR UPDATE', [email]);
  if (profiles.length !== 1 || profiles[0].public_id !== owner || ![false,0,'0'].includes(profiles[0].must_change_password)) throw deny();
  const byEmail = await readState(c, `link-email:${email}`);
  const chatId = byEmail?.chatId;
  if (typeof chatId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(chatId)) throw deny();
  const byChat = await readState(c, `link-chat:${chatId}`);
  const linkedAt = Date.parse(byEmail.linkedAt);
  if (emailKey(byEmail.email) !== email || emailKey(byChat?.email) !== email || byChat.chatId !== chatId ||
    !byEmail.code || byChat.code !== byEmail.code || byChat.linkedAt !== byEmail.linkedAt || !Number.isFinite(linkedAt) || linkedAt > clock()) throw deny();
  return { email, owner, chatId, bindingRevision: hash([chatId, byEmail.linkedAt, byEmail.code]) };
}
function preferences(input) {
  if (!input || !['default','lead','custom'].includes(input.timing) || typeof input.timeZone !== 'string') return null;
  try { new Intl.DateTimeFormat('pt-BR', { timeZone: input.timeZone }); } catch { return null; }
  if (!input.timeZone) return null;
  if (input.timing === 'lead' && (!Number.isInteger(input.leadMinutes) || input.leadMinutes < 1 || input.leadMinutes > 4320)) return null;
  if (input.timing === 'custom' && (typeof input.customAt !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(input.customAt) || !Number.isFinite(Date.parse(input.customAt)))) return null;
  return { enabled: true, tone: 'professional', timing: input.timing, timeZone: input.timeZone,
    ...(input.timing === 'lead' ? { leadMinutes: input.leadMinutes } : {}), ...(input.timing === 'custom' ? { customAt: input.customAt } : {}) };
}
function principal(identity, now) {
  const p = identity?.payload;
  return p?.iss === 'crewcheck' && p.aud === 'crewcheck-web' && typeof p.sub === 'string' && p.sub &&
    identity.profile?.public_id === p.sub && !p.mustChangePassword && Number.isFinite(p.exp) && p.exp * 1000 > now &&
    emailKey(p.email) === identity.email ? { email: identity.email, owner: p.sub } : null;
}
export async function changeTelegramBriefingConsent(db, identity, input, { enabled = TELEGRAM_OPERATIONAL_BRIEFING_ENABLED, clock = Date.now } = {}) {
  if (enabled !== true) return { status: 'disabled', received: null };
  const who = principal(identity, clock()), prefs = preferences(input?.preferences);
  if (!who || typeof input?.enabled !== 'boolean' || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
    input.enabled && (input.confirmed !== true || !prefs)) throw deny();
  return transaction(db, async c => {
    const [profiles] = await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [who.email]);
    if (profiles.length !== 1 || profiles[0].public_id !== who.owner) throw deny();
    const key = consentKey(who.email, who.owner), old = await readState(c, key);
    if ((old?.revision || 0) !== input.expectedRevision || old && (old.email !== who.email || old.owner !== who.owner) || input.expectedRevision >= Number.MAX_SAFE_INTEGER) throw deny();
    const binding = input.enabled ? await currentContext(c, who.email, who.owner, clock) : null;
    const record = { version: 1, ...who, topic: 'operational-next-duty', channel: 'telegram', enabled: input.enabled,
      revision: input.expectedRevision + 1, grantedAt: iso(clock()), bindingRevision: binding?.bindingRevision || null,
      preferences: input.enabled ? prefs : null };
    await writeState(c, key, record);
    // Pending/claimed work is cancelled; already-dispatching work cannot be recalled.
    await c.query("UPDATE crewcheck_notification_jobs SET status='cancelled',locked_at=NULL WHERE email=? AND LEFT(job_key,?)=? AND status IN ('pending','processing')", [who.email, BRIEFING_JOB_PREFIX.length, BRIEFING_JOB_PREFIX]);
    const [inflight] = await c.query("SELECT id FROM crewcheck_notification_jobs WHERE email=? AND LEFT(job_key,?)=? AND status='dispatching'", [who.email, BRIEFING_JOB_PREFIX.length, BRIEFING_JOB_PREFIX]);
    return { status: input.enabled ? 'consent_recorded' : 'consent_revoked', revision: record.revision, inFlight: inflight.length > 0, received: null };
  });
}
async function source(c, context, clock) {
  // Hold the active source rows/range in this transaction as well as the owner.
  await c.query('SELECT id FROM crewcheck_platform_rosters WHERE owner_email=? AND active=TRUE FOR UPDATE', [context.email]);
  const result = await readOperationalBriefingPreview({ ok: true, email: context.email, publicId: context.owner, db: c }, { now: clock, includeInternal: true, lockSource: true });
  if (result.status !== 200 || !result.internal?.preview?.dutyKey) throw deny();
  return result;
}
function validConsent(value, context, now) {
  return value?.version === 1 && value.enabled === true && value.email === context.email && value.owner === context.owner &&
    Number.isFinite(Date.parse(value.grantedAt)) && Date.parse(value.grantedAt) <= now && value.topic === 'operational-next-duty' && value.channel === 'telegram' && value.bindingRevision === context.bindingRevision &&
    Number.isSafeInteger(value.revision) && value.revision > 0 && preferences(value.preferences);
}
function scheduledPlan(result, consent, alarm, now) {
  return briefingPresentation({ preview: result.internal.preview, preferences: consent.preferences, alarm, now });
}
function reference(result) { return { ...result.body.source, checkedAt: undefined }; }
function fingerprint(result) { return hash(reference(result)); }

export async function runTelegramBriefingCycle(db, { enabled = TELEGRAM_OPERATIONAL_BRIEFING_ENABLED, clock = Date.now } = {}) {
  if (enabled !== true) return { status: 'disabled', planned: 0 };
  const [rows] = await db.query("SELECT state_key,payload FROM crewcheck_telegram_state WHERE state_key LIKE 'briefing-consent:%' AND JSON_EXTRACT(payload,'$.enabled')=true ORDER BY updated_at,state_key LIMIT 50");
  let planned = 0, blocked = 0;
  for (const row of rows) {
    // Rotate the bounded existing-state scan, including unreadable/blocked rows.
    await db.query('UPDATE crewcheck_telegram_state SET updated_at=NOW(3) WHERE state_key=?', [row.state_key]);
    try {
      const hint = parse(row);
      if (!hint?.email || !hint.owner) throw deny();
      const didPlan = await transaction(db, async c => {
        const context = await currentContext(c, hint.email, hint.owner, clock);
        const consent = await readState(c, consentKey(context.email, context.owner));
        if (!validConsent(consent, context, clock())) throw deny();
        const result = await source(c, context, clock);
        // Existing alarm timing is used only through an authoritative duty binding.
        // This slice has no such stored binding; default remains APZ minus 90m.
        const plan = scheduledPlan(result, consent, null, clock());
        const scheduledAt = Date.parse(plan.scheduledAt), presentationAt = Date.parse(result.internal.preview.duty?.presentationAt);
        if (!Number.isFinite(scheduledAt) || !Number.isFinite(presentationAt) || Date.parse(consent.grantedAt) > scheduledAt) return false;
        const key = BRIEFING_JOB_PREFIX + hash([context.owner, result.internal.preview.dutyKey, context.bindingRevision]);
        const [jobs] = await c.query('SELECT id,status FROM crewcheck_notification_jobs WHERE email=? AND job_key=? FOR UPDATE', [context.email, key]);
        if (jobs.length && (terminal.has(jobs[0].status) || jobs[0].status === 'processing')) return false;
        const record = { version: 1, ...context, dutyKey: result.internal.preview.dutyKey, sourceFingerprint: fingerprint(result),
          consentRevision: consent.revision, preferencesHash: hash(consent.preferences), scheduledAt, presentationAt, jobKey: key };
        await writeState(c, eventKey(key), record);
        if (!jobs.length) await c.query("INSERT INTO crewcheck_notification_jobs (email,job_key,scheduled_at,channel,chat_id,message,status) VALUES (?,?,FROM_UNIXTIME(?/1000),'telegram',?,?,'pending') ON DUPLICATE KEY UPDATE id=id", [context.email, key, scheduledAt, context.chatId, plan.external.body]);
        else await c.query("UPDATE crewcheck_notification_jobs SET scheduled_at=FROM_UNIXTIME(?/1000),chat_id=?,message=? WHERE id=? AND status='pending'", [scheduledAt, context.chatId, plan.external.body, jobs[0].id]);
        return true;
      });
      if (didPlan) planned++;
    } catch { blocked++; }
  }
  return { status: 'observed', planned, blocked };
}
export async function dispatchTelegramBriefing(db, selected, { enabled = TELEGRAM_OPERATIONAL_BRIEFING_ENABLED, deliver, clock = Date.now } = {}) {
  const cancel = async () => { await db.query("UPDATE crewcheck_notification_jobs SET status='cancelled',locked_at=NULL WHERE id=? AND status='processing' AND locked_at=?", [selected.id, selected.locked_at]); return { status: 'cancelled', accepted: false, delivered: null }; };
  if (enabled !== true) return cancel();
  let job, event, sourceExpiresAt, reservationAttempted = false;
  try {
    const ready = await transaction(db, async c => {
      // Unlocked hint selects the account only; re-read it under locks below.
      const [hints] = await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?', [eventKey(selected.job_key)]);
      const hint = hints.length === 1 ? parse(hints[0]) : null;
      if (hint?.version !== 1 || hint.jobKey !== selected.job_key || hint.email !== selected.email) throw deny();
      const context = await currentContext(c, hint.email, hint.owner, clock);
      const consent = await readState(c, consentKey(context.email, context.owner));
      if (!validConsent(consent, context, clock()) || consent.revision !== hint.consentRevision || hash(consent.preferences) !== hint.preferencesHash || context.bindingRevision !== hint.bindingRevision) throw deny();
      const result = await source(c, context, clock);
      const lockedEvent = await readState(c, eventKey(selected.job_key));
      if (hash(lockedEvent) !== hash(hint)) throw deny();
      sourceExpiresAt = Date.parse(result.internal.preview.validUntil);
      if (fingerprint(result) !== hint.sourceFingerprint || result.internal.preview.dutyKey !== hint.dutyKey ||
        !Number.isSafeInteger(hint.scheduledAt) || !Number.isSafeInteger(hint.presentationAt) ||
        hint.presentationAt !== Date.parse(result.internal.preview.duty?.presentationAt) ||
        hint.scheduledAt !== briefingTriggerAt({ preview: result.internal.preview, preferences: consent.preferences }).scheduledAt) throw deny();
      const [jobs] = await c.query("SELECT *,ROUND(UNIX_TIMESTAMP(scheduled_at)*1000) AS scheduled_epoch FROM crewcheck_notification_jobs WHERE id=? AND status='processing' AND locked_at=? FOR UPDATE", [selected.id, selected.locked_at]);
      job = jobs[0]; event = hint;
      const now = clock();
      if (!job || job.email !== context.email || job.job_key !== hint.jobKey || job.chat_id !== context.chatId || job.channel !== 'telegram' ||
        Number(job.scheduled_epoch) !== hint.scheduledAt || now < hint.scheduledAt || now > hint.scheduledAt + 120000 || now >= hint.presentationAt ||
        now >= Date.parse(result.internal.preview.validUntil) || Date.parse(consent.grantedAt) > hint.scheduledAt) throw deny();
      // Never trust persisted/client message text as the operational content.
      job.message = 'Seu briefing operacional está disponível. No app, abra Menu → Notificações → Briefing antes da apresentação.';
      reservationAttempted = true;
      const [claimed] = await c.query("UPDATE crewcheck_notification_jobs SET status='dispatching' WHERE id=? AND status='processing' AND locked_at=?", [job.id, job.locked_at]);
      return claimed.affectedRows === 1;
    });
    if (!ready) return { status: 'skipped', accepted: false, delivered: null };
  } catch { return reservationAttempted ? { status: 'uncertain', accepted: false, delivered: null } : cancel(); }
  // Durable dispatching is terminal for replay. No await before transport after this check.
  const dispatchNow = clock();
  if (!Number.isFinite(dispatchNow) || dispatchNow < event.scheduledAt || dispatchNow > event.scheduledAt + 120000 || dispatchNow >= event.presentationAt || dispatchNow >= sourceExpiresAt) {
    await db.query("UPDATE crewcheck_notification_jobs SET status='expired',locked_at=NULL WHERE id=? AND status='dispatching' AND locked_at=?", [job.id, job.locked_at]);
    return { status: 'expired', accepted: false, delivered: null };
  }
  let accepted = false;
  try { const result = await deliver(job); accepted = result?.ok === true; } catch {}
  const status = accepted ? 'sent' : 'uncertain';
  await db.query("UPDATE crewcheck_notification_jobs SET status=?,locked_at=NULL,sent_at=IF(?=1,NOW(3),sent_at),last_error=? WHERE id=? AND status='dispatching' AND locked_at=?", [status, accepted ? 1 : 0, accepted ? null : 'Briefing attempt unconfirmed; no automatic retry.', job.id, job.locked_at]);
  return { status, accepted, delivered: null };
}
export async function handleTelegramBriefingConsent(req, res, url, { enabled = TELEGRAM_OPERATIONAL_BRIEFING_ENABLED, identify = requireExistingIdentity, read = readBody, reply = sendJson, clock = Date.now } = {}) {
  if (url.pathname !== '/api/notifications/operational-briefing') return false;
  if (enabled !== true) { reply(res, 503, { ok: false, code: 'BRIEFING_DISABLED' }); return true; }
  if (!['GET','POST'].includes(req.method)) { reply(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' }); return true; }
  if (req.method === 'GET') {
    const identity = await identify(req, res); if (!identity) return true;
    const who = principal(identity, clock());
    if (!who) { reply(res, 401, { ok: false, code: 'AUTH_REQUIRED' }); return true; }
    try {
      const result = await transaction(identity.db, async c => {
        const [profiles] = await c.query('SELECT p.public_id,a.must_change_password FROM crewcheck_platform_profiles p JOIN crewcheck_platform_accounts a ON a.email=p.email WHERE p.email=? FOR UPDATE', [who.email]);
        if (profiles.length !== 1 || profiles[0].public_id !== who.owner || ![false,0,'0'].includes(profiles[0].must_change_password)) throw deny();
        const saved = await readState(c, consentKey(who.email, who.owner));
        if (saved && (saved.version !== 1 || saved.email !== who.email || saved.owner !== who.owner || !Number.isSafeInteger(saved.revision))) throw deny();
        let linked = false, active = false;
        try { const context = await currentContext(c, who.email, who.owner, clock); linked = true; active = Boolean(validConsent(saved, context, clock())); } catch {}
        const preview = await readOperationalBriefingPreview({ ok: true, email: who.email, publicId: who.owner, db: c }, { now: clock, lockSource: true });
        const trigger = preview.status === 200 && saved?.preferences
          ? briefingTriggerAt({ preview: { duty: preview.body.briefing.duty }, preferences: saved.preferences }).scheduledAt : null;
        return { status: 200, body: { ...preview.body, ok: true, previewAvailable: preview.status === 200,
          consent: { enabled: active, recorded: saved?.enabled === true, revision: saved?.revision || 0, preferences: saved?.preferences || null },
          telegramLinked: linked, scheduledAt: Number.isFinite(trigger) ? iso(trigger) : null,
          deliveryConfirmed: false } };
      });
      reply(res, result.status, result.body);
    } catch { reply(res, 409, { ok: false, code: 'BRIEFING_CONTEXT_CHANGED' }); }
    return true;
  }
  // No cookie-authorized cross-origin preference changes.
  if (!['https://crewcheck.online','https://crewcheck.onrender.com'].includes(req.headers?.origin) || req.headers?.['sec-fetch-site'] === 'cross-site') { reply(res, 403, { ok: false, code: 'ORIGIN_REFUSED' }); return true; }
  const identity = await identify(req, res); if (!identity) return true;
  try { const result = await changeTelegramBriefingConsent(identity.db, identity, await read(req, 10000), { enabled, clock }); reply(res, 200, { ok: true, ...result }); }
  catch { reply(res, 409, { ok: false, code: 'BRIEFING_CONTEXT_CHANGED' }); }
  return true;
}
