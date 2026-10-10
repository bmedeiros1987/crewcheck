// Explicit preparation endpoints only. No provider, timer, worker or activation path.
import crypto from 'node:crypto';
export const FREE_DAY_SCOPE = 'free-day-telegram-held-v1';
const DAY_MS = 86400000;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const freeDayConsentKey = (email, id) => `notification-free-day:${hash([email, id])}`;
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
const fail = (status, code) => { throw Object.assign(new Error(code), { status, code }); };
const iso = value => {
  const text = String(value || '').replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1');
  const time = Date.parse(text + 'T12:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === text ? text : null;
};

// Recompute from the owner's stored snapshot, never from request-supplied alert/value.
// Imported token metadata is not proof of the original published document.
export function heldSourceReceipt(row, ownerId) {
  const roster = parse(row?.roster);
  if (!row?.id || !roster.crewId || !roster.base || !Number.isInteger(roster.year) || !Number.isInteger(roster.month)
    || roster.month < 1 || roster.month > 12 || !Array.isArray(roster.days) || roster.days.length > 370) fail(409, 'SOURCE_PENDING');
  const period = `${roster.year}-${String(roster.month).padStart(2, '0')}`;
  const starts = [];
  for (const day of roster.days) {
    if (!/^(DO|DOF|DOP|DOPR|DR|OFF)$/.test(String(day.pairingCode || day.type || '').toUpperCase()) || day.legs?.length) continue;
    const date = iso(day.date), e = day.freeDayStartEvidence;
    if (!date || !date.startsWith(period + '-')) fail(409, 'SOURCE_PENDING');
    const tokens = String(e?.tokenExcerpt || '').trim().split(/\s+/);
    const clock = /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(tokens[1] || '') ? tokens[1].padStart(5, '0') : null;
    const valid = e && iso(e.date) === date && /^(DO|DOF|DOP|DOPR|DR|OFF)$/.test(tokens[0])
      && tokens[0] === e.code && tokens[0] === String(day.pairingCode || day.type).toUpperCase()
      && clock && clock === e.clock && e.clockSource === 'published' && e.timeZoneSource === 'published'
      && Number.isInteger(e.utcOffsetMinutes) && Math.abs(e.utcOffsetMinutes) <= 840 && e.origin === 'AIMS published rest tokens';
    starts.push({ date, clock: valid ? clock : null, offset: valid ? e.utcOffsetMinutes : null });
  }
  starts.sort((a, b) => a.date.localeCompare(b.date));
  const identity = hash([ownerId, String(roster.crewId), roster.base]);
  const minimal = { period, identity, starts };
  return { ...minimal, version: hash(minimal), sourceId: String(row.id), provenance: 'stored-client-snapshot', sourceVerified: false };
}
function sequenceDelay(before, after, date) {
  if (before.period !== after.period || before.identity !== after.identity) fail(409, 'IDENTITY_OR_PERIOD_PENDING');
  const isSequenceStart = receipt => {
    const dates = [...new Set(receipt.starts.map(x => x.date))].sort();
    const index = dates.indexOf(date);
    return index >= 0 && (index === 0 || Date.parse(date) - Date.parse(dates[index - 1]) !== DAY_MS);
  };
  if (!isSequenceStart(before)) fail(409, 'SEQUENCE_START_REQUIRED');
  // A matching rest date may now be an interior day of an earlier sequence.
  // Compare clocks only when the requested date is the boundary in both versions.
  if (!isSequenceStart(after)) fail(409, 'SEQUENCE_CORRESPONDENCE_PENDING');
  const boundary = receipt => {
    const starts = receipt.starts.filter(x => x.date === date);
    const first = starts[0];
    return first?.clock && Number.isInteger(first.offset) && starts.every(x => x.clock === first.clock && x.offset === first.offset) ? first : null;
  };
  const old = boundary(before), current = boundary(after);
  if (!old || !current) fail(409, 'LITERAL_START_PENDING');
  const instant = x => Date.parse(date + 'T' + x.clock + ':00Z') - x.offset * 60000;
  const delay = (instant(current) - instant(old)) / 60000;
  if (!Number.isFinite(delay) || delay <= 240) fail(409, 'NO_DELAY_ABOVE_FOUR_HOURS');
  return delay;
}
const validLink = (link, user, accountCreated) => link.email === user.email && Boolean(String(link.chatId || '').trim())
  && /(?:Z|[+-]\d{2}:\d{2})$/.test(String(link.linkedAt || '')) && Number.isFinite(Date.parse(link.linkedAt)) && Date.parse(link.linkedAt) >= accountCreated;
const linkVersion = (link, user) => hash([user.id, String(link.chatId), link.linkedAt, link.code || '']);
const cancelHeld = (connection, email) => connection.query("UPDATE crewcheck_notification_jobs SET status='cancelled',locked_at=NULL WHERE email=? AND LEFT(job_key,9)='free-day:' AND status IN ('held','pending','processing')", [email]);
async function lockedState(connection, user) {
  const [owners] = await connection.query('SELECT public_id,ROUND(UNIX_TIMESTAMP(created_at)*1000) AS created_epoch FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [user.email]);
  if (!user.id || String(owners[0]?.public_id || '') !== String(user.id)) fail(401, 'OWNER_CHANGED');
  const accountCreated = Number(owners[0]?.created_epoch);
  if (!Number.isFinite(accountCreated)) fail(409, 'ACCOUNT_CREATION_PENDING');
  const key = freeDayConsentKey(user.email, user.id);
  const [rows] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [key]);
  const stored = parse(rows[0]?.payload);
  const state = stored.ownerId === user.id && stored.scope === FREE_DAY_SCOPE ? stored
    : { email: user.email, ownerId: user.id, scope: FREE_DAY_SCOPE, revision: 0, consent: false, dispatchAllowed: false };
  return { key, state, accountCreated };
}
async function saveState(connection, key, state) {
  await connection.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=NOW(3)', [key, JSON.stringify(state)]);
}
function revision(state, expected) { if (!Number.isInteger(expected) || expected !== state.revision) fail(409, 'CONSENT_REVISION_CHANGED'); }
function activeConsent(state, expected, now) {
  revision(state, expected);
  if (state.consent !== true || !Number.isFinite(Date.parse(state.expiresAt)) || Date.parse(state.expiresAt) <= now) fail(409, 'CONSENT_REQUIRED_OR_EXPIRED');
}
async function ownedRoster(connection, user, id) {
  if (typeof id !== 'string' || !id || id.length > 80) fail(400, 'SOURCE_ID_REQUIRED');
  const [rows] = await connection.query('SELECT id,roster,active FROM crewcheck_platform_rosters WHERE owner_email=? AND id=? FOR UPDATE', [user.email, id]);
  const row = rows[0];
  if (!row || ![true, 1, '1'].includes(row.active)) fail(409, 'OWN_ACTIVE_SOURCE_REQUIRED');
  return heldSourceReceipt(row, user.id);
}
export async function mutateFreeDayHeld(db, user, body, { now = Date.now(), configured = false } = {}) {
  if (!user?.email || !user?.id || body?.scope !== FREE_DAY_SCOPE) fail(400, 'SCOPE_REQUIRED');
  if (Object.keys(body).some(key => !['scope','action','expectedRevision','sourceId','sequenceDate'].includes(key))) fail(400, 'CLIENT_AUTHORITY_REJECTED');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { key, state, accountCreated } = await lockedState(connection, user);
    revision(state, body.expectedRevision);
    if (['grant','renew','revoke'].includes(body.action)) {
      if (body.action === 'renew') activeConsent(state, body.expectedRevision, now);
      const [cancelled] = await cancelHeld(connection, user.email);
      const consent = body.action !== 'revoke';
      const next = { email: user.email, ownerId: user.id, scope: FREE_DAY_SCOPE, revision: state.revision + 1,
        consent, dispatchAllowed: false, changedAt: new Date(now).toISOString(), expiresAt: consent ? new Date(now + 30 * DAY_MS).toISOString() : null };
      await saveState(connection, key, next);
      await connection.commit();
      return { revision: next.revision, consent, expiresAt: next.expiresAt, cancelled: cancelled.affectedRows, dispatchAllowed: false, delivered: false };
    }
    activeConsent(state, body.expectedRevision, now);
    if (body.action === 'reference') {
      const reference = await ownedRoster(connection, user, body.sourceId);
      await cancelHeld(connection, user.email);
      const next = { ...state, revision: state.revision + 1, reference, referenceCapturedAt: new Date(now).toISOString() };
      await saveState(connection, key, next);
      await connection.commit();
      return { revision: next.revision, sourceVersion: reference.version, sourceVerified: false, dispatchAllowed: false, delivered: false };
    }
    if (body.action !== 'prepare') fail(400, 'ACTION_REQUIRED');
    if (!state.reference) fail(409, 'REFERENCE_RECEIPT_REQUIRED');
    const current = await ownedRoster(connection, user, body.sourceId);
    const date = iso(body.sequenceDate);
    if (!date) fail(400, 'SEQUENCE_DATE_REQUIRED');
    const delayMinutes = sequenceDelay(state.reference, current, date);
    const [links] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [`link-email:${user.email}`]);
    const link = parse(links[0]?.payload);
    // Link is read inside the transaction; no client-provided readiness/recipient.
    if (!validLink(link, user, accountCreated)) fail(409, 'VERIFIED_LINK_REQUIRED');
    if (configured !== true) fail(409, 'CONFIGURATION_REQUIRED');
    const jobKey = `free-day:${hash([user.id, date, state.reference.version, current.version])}`;
    const [existing] = await connection.query('SELECT id,status FROM crewcheck_notification_jobs WHERE email=? AND job_key=? FOR UPDATE', [user.email, jobKey]);
    if (existing.length && existing[0].status === 'held') {
      const [receipts] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [`notification-free-day-job:${hash([user.email, jobKey])}`]);
      const receipt = parse(receipts[0]?.payload);
      if (receipt.ownerId !== user.id || receipt.consentRevision !== state.revision || receipt.linkVersion !== linkVersion(link, user)) {
        await connection.query("UPDATE crewcheck_notification_jobs SET status='cancelled',locked_at=NULL WHERE email=? AND job_key=? AND status='held'", [user.email, jobKey]);
        existing[0].status = 'cancelled';
      }
    }
    if (!existing.length) {
      // No destination retained for an inert job. Worker cannot select held.
      await connection.query("INSERT INTO crewcheck_notification_jobs (email,job_key,scheduled_at,channel,chat_id,telegram_username,phone,message,status) VALUES(?,?,FROM_UNIXTIME(?/1000),'telegram',NULL,NULL,NULL,?,'held') ON DUPLICATE KEY UPDATE id=id", [user.email, jobKey, now, 'Abra o CrewCheck para revisar as condições de início da folga. Envio não ativado.']);
      await saveState(connection, `notification-free-day-job:${hash([user.email, jobKey])}`, {
        email: user.email, ownerId: user.id, scope: FREE_DAY_SCOPE, consentRevision: state.revision, jobKey,
        sequenceDate: date, beforeVersion: state.reference.version, afterVersion: current.version,
        delayMinutes, possibleAmount: null, sourceVerified: false, provenance: 'stored-client-snapshot',
        linkVersion: linkVersion(link, user), dispatchAllowed: false,
      });
    }
    await connection.commit();
    return { jobKey, status: existing[0]?.status || 'held', duplicate: existing.length > 0, delayMinutes,
      possibleAmount: null, sourceVerified: false, dispatchAllowed: false, delivered: false };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
export async function readFreeDayHeldState(db, user, { now = Date.now(), configured = false } = {}) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { state, accountCreated } = await lockedState(connection, user);
    const [links] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [`link-email:${user.email}`]);
    const link = parse(links[0]?.payload);
    await connection.commit();
    const consent = state.consent === true && Date.parse(state.expiresAt) > now;
    return { scope: FREE_DAY_SCOPE, revision: state.revision, consent, expiresAt: state.expiresAt || null,
      referenceAvailable: consent && Boolean(state.reference), sourceVerified: false,
      telegramLinked: validLink(link, user, accountCreated),
      telegramConfigured: configured === true, dispatchAllowed: false, delivered: false };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
export async function handleFreeDayHeld(req, res, dependencies) {
  const { identity, readJson, dbPool, sendJson, configured = false } = dependencies;
  const user = identity(req);
  if (!user) return sendJson(res, 401, { ok: false, code: 'SESSION_REQUIRED' });
  const db = await dbPool();
  if (!db) return sendJson(res, 503, { ok: false, code: 'DATABASE_UNAVAILABLE' });
  try {
    if (req.method === 'GET') return sendJson(res, 200, { ok: true, ...await readFreeDayHeldState(db, user, { configured }) });
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', dispatchAllowed: false });
    const body = await readJson(req);
    const result = await mutateFreeDayHeld(db, user, body, { configured });
    return sendJson(res, 200, { ok: true, ...result });
  } catch (error) { return sendJson(res, error.status || 503, { ok: false, code: error.code || 'PREPARATION_UNAVAILABLE', dispatchAllowed: false }); }
}
