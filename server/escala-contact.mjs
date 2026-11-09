import { isAdminEmail, readBody, requireExistingIdentity, sendJson } from './v139/common.mjs';
import { ESCALA_CONTACT_SCHEMA, ESCALA_CONTACT_READ_PATH, ESCALA_CONTACT_ADMIN_PATH, defaultEscalaContact, validEscalaContact, validEscalaDialString } from '../shared/escala-contact.mjs';

// Never accept a key, owner or namespace from the caller. The existing KV is
// shared by this installation; only this one non-personal contact is exposed.
const KEY = 'system:escala-contact:v1';
const failure = (status, code) => Object.assign(new Error(code), { status, code });
function record(rows) {
  if (!Array.isArray(rows) || rows.length > 1) throw failure(503, 'CONTACT_STATE_UNKNOWN');
  if (!rows.length) return defaultEscalaContact();
  let value = rows[0].payload;
  try { if (typeof value === 'string') value = JSON.parse(value); } catch { throw failure(503, 'CONTACT_STATE_UNKNOWN'); }
  if (!validEscalaContact(value) || value.revision === 0) throw failure(503, 'CONTACT_STATE_UNKNOWN');
  return value;
}
function administrator(identity) {
  // Existing partner-admin policy: signed admin claim AND current server allowlist.
  return identity?.payload?.admin === true && isAdminEmail(identity.email);
}
function primaryAccount(identity) {
  return Boolean(identity?.profile?.public_id && identity.payload?.sub === identity.profile.public_id
    && identity.payload?.aud !== 'crewcheck-visitor' && !['visitor', 'guest'].includes(identity.payload?.role));
}
function updateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).sort().join(',') !== 'dialString,expectedRevision'
      || !validEscalaDialString(body.dialString) || !Number.isSafeInteger(body.expectedRevision)
      || body.expectedRevision < 0 || body.expectedRevision >= Number.MAX_SAFE_INTEGER - 1) throw failure(400, 'CONTACT_INVALID');
  return body;
}
async function save(identity, body, clock) {
  const db = await identity.db.getConnection();
  try {
    await db.beginTransaction();
    // A removed/replaced account cannot finish an earlier editor request.
    const [profiles] = await db.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [identity.email]);
    if (profiles.length !== 1 || profiles[0].public_id !== identity.profile.public_id || !administrator(identity)) throw failure(403, 'CONTACT_FORBIDDEN');
    const [rows] = await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [KEY]);
    const current = record(rows);
    if (body.expectedRevision !== current.revision) throw failure(409, 'CONTACT_CONFLICT');
    if (current.revision > 0 && current.dialString === body.dialString) { await db.commit(); return current; }
    const next = { schema: ESCALA_CONTACT_SCHEMA, dialString: body.dialString, revision: current.revision + 1, updatedAt: new Date(clock()).toISOString() };
    if (!validEscalaContact(next)) throw failure(503, 'CONTACT_STATE_UNKNOWN');
    const [written] = rows.length
      ? await db.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?', [JSON.stringify(next), KEY])
      : await db.query('INSERT INTO crewcheck_telegram_state(state_key,payload,updated_at) VALUES(?,?,NOW(3))', [KEY, JSON.stringify(next)]);
    if (written.affectedRows !== 1) throw failure(503, 'CONTACT_STATE_UNKNOWN');
    await db.commit();
    return next;
  } catch (error) {
    try { await db.rollback(); } catch { /* Never claim a rollback or retry an uncertain commit. */ }
    if (['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error?.code)) throw failure(409, 'CONTACT_CONFLICT');
    throw error;
  } finally { db.release(); }
}

export async function handleEscalaContact(req, res, url, { identify = requireExistingIdentity, read = readBody, clock = () => Date.now() } = {}) {
  const admin = url.pathname === ESCALA_CONTACT_ADMIN_PATH;
  if (!admin && url.pathname !== ESCALA_CONTACT_READ_PATH) return false;
  try {
    if (url.search) throw failure(400, 'CONTACT_INVALID');
    if (!(req.method === 'GET' || (admin && req.method === 'PUT'))) {
      res.setHeader('Allow', admin ? 'GET, PUT' : 'GET');
      throw failure(405, 'CONTACT_METHOD');
    }
    const identity = await identify(req, res);
    if (!identity) return true;
    if (!primaryAccount(identity) || (admin && !administrator(identity))) throw failure(403, 'CONTACT_FORBIDDEN');
    let contact;
    if (req.method === 'PUT') {
      if (req.headers['sec-fetch-site'] === 'cross-site'
          || !/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type'] || ''))) throw failure(400, 'CONTACT_INVALID');
      const body = updateBody(await read(req, 1024));
      contact = await save(identity, body, clock);
    } else {
      const [rows] = await identity.db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? LIMIT 1', [KEY]);
      contact = record(rows); // No INSERT, ensureProfile, ensureTables, seed or fallback on error.
    }
    sendJson(res, 200, { ok: true, contact });
  } catch (error) {
    const status = [400, 403, 405, 409, 413].includes(error?.status) ? error.status : 503;
    const code = status === 503 ? 'CONTACT_UNAVAILABLE' : ({ 400: 'CONTACT_INVALID', 403: 'CONTACT_FORBIDDEN', 405: 'CONTACT_METHOD', 409: 'CONTACT_CONFLICT', 413: 'CONTACT_TOO_LARGE' })[status];
    const message = status === 409 ? 'O contato mudou. Recarregue antes de salvar novamente.'
      : status === 403 ? 'Acesso restrito à administração.'
      : status === 400 || status === 413 ? 'Informe somente o telefone e a revisão atual, no formato indicado.'
      : 'Não foi possível confirmar o contato da Escala. Recarregue antes de tentar novamente.';
    sendJson(res, status, { ok: false, code, message });
  }
  return true;
}
