import crypto from 'node:crypto';
import { parseJsonColumn, readBody, requireIdentity, sendJson } from './common.mjs';

export const LEAVE_CYCLE = 'year-end-leave-2026-2027-cabine';
export const cycleJobPrefix = cycle => `cycle:${cycle}:`;
export const cycleStateKey = (email, cycle) => `notification-cycle:${crypto.createHash('sha256').update(JSON.stringify([email, cycle])).digest('hex')}`;

// Reuses the existing persistent JSON state store. No provider or event is created.
export async function lockCycle(connection, email, ownerId, cycle) {
  const key = cycleStateKey(email, cycle);
  await connection.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key', [key, JSON.stringify({ email, ownerId, cycle, submitted: false })]);
  const [rows] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [key]);
  const state = parseJsonColumn(rows[0]?.payload, {});
  // A recreated account must never inherit a prior account's decision.
  return { key, state: String(state.ownerId) === String(ownerId) ? state : { email, ownerId, cycle, submitted: false } };
}

export async function confirmCycle(db, email, ownerId, cycle) {
  if (cycle !== LEAVE_CYCLE) throw Object.assign(new Error('Edição não reconhecida.'), { status: 400 });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [owners] = await connection.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [email]);
    if (String(owners[0]?.public_id || '') !== String(ownerId || '') || !ownerId) throw Object.assign(new Error('Sessão da conta não é mais válida.'), { status: 401 });
    const { key, state } = await lockCycle(connection, email, ownerId, cycle);
    const next = { ...state, submitted: true, schedulingAllowed: false, submittedAt: state.submittedAt || new Date().toISOString() };
    await connection.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?', [JSON.stringify(next), key]);
    const prefix = cycleJobPrefix(cycle);
    // All channels of the existing queue share this owner/scope prefix. No LIKE wildcard.
    const [cancelled] = await connection.query("UPDATE crewcheck_notification_jobs SET status='cancelled',locked_at=NULL WHERE email=? AND LEFT(job_key,?)=? AND status IN ('pending','processing')", [email, prefix.length, prefix]);
    const [inFlight] = await connection.query("SELECT id FROM crewcheck_notification_jobs WHERE email=? AND LEFT(job_key,?)=? AND status IN ('dispatching','sent','partial','uncertain')", [email, prefix.length, prefix]);
    await connection.commit();
    return { submitted: true, submittedAt: next.submittedAt, cancelled: cancelled.affectedRows, inFlight: inFlight.length > 0, delivered: null,
      message: 'Solicitação declarada como enviada. Isto não confirma concessão da folga. Pendentes do servidor cancelados; mensagens já iniciadas ou aceitas não podem ser recolhidas.' };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function handleNotificationCycle(req, res, url, { identify = requireIdentity, read = readBody } = {}) {
  const match = url.pathname.match(/^\/api\/platform\/notification-cycles\/([^/]+)$/);
  if (!match) return false;
  const context = await identify(req, res);
  if (!context) return true;
  if (match[1] !== LEAVE_CYCLE) { sendJson(res, 404, { ok: false, message: 'Edição não reconhecida.' }); return true; }
  const ownerId = context.payload?.sub;
  if (!ownerId || String(context.profile?.public_id) !== String(ownerId)) { sendJson(res, 401, { ok: false, message: 'Sessão da conta não é mais válida.' }); return true; }
  if (req.method === 'POST') {
    const body = await read(req);
    if (body.action !== 'submitted') { sendJson(res, 409, { ok: false, message: 'Lembrar depois exige fuso e instante explícitos confirmados. Nada foi agendado.' }); return true; }
    sendJson(res, 200, { ok: true, cycle: LEAVE_CYCLE, ...await confirmCycle(context.db, context.email, ownerId, LEAVE_CYCLE) });
  } else if (req.method === 'GET') {
    const [rows] = await context.db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?', [cycleStateKey(context.email, LEAVE_CYCLE)]);
    const state = parseJsonColumn(rows[0]?.payload, {});
    sendJson(res, 200, { ok: true, cycle: LEAVE_CYCLE, submitted: String(state.ownerId) === String(ownerId) && state.submitted === true, schedulingAllowed: false });
  } else sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
  return true;
}
