// Safety boundary for the existing SQL notification queue. No new provider/queue.
import { LEAVE_CYCLE, cycleJobPrefix, lockCycle } from './v139/notificationCycles.mjs';
export const JOB_GRACE_SECONDS = 120;
const aliases = { both: 'telegram+phone-call', phone: 'phone-call', infobip: 'phone-call', all: 'telegram+telegram-call+phone-call' };
const allowed = new Set(['telegram', 'telegram-call', 'phone-call', 'telegram+telegram-call', 'telegram+phone-call', 'telegram-call+phone-call', 'telegram+telegram-call+phone-call']);
const terminal = new Set(['sent', 'partial', 'uncertain', 'cancelled', 'expired', 'failed']);
const epoch = (row, key) => row?.[key + '_epoch'] != null ? Number(row[key + '_epoch']) : row?.[key + '_at'] instanceof Date ? row[key + '_at'].getTime() : NaN;
const same = (a, b) => ['channel', 'chat_id', 'telegram_username', 'phone', 'message'].every(key => String(a[key] || '') === String(b[key] || '')) && epoch(a, 'scheduled') === epoch(b, 'scheduled');

async function currentOwner(db, user) {
  const [rows] = await db.query('SELECT public_id,created_at FROM crewcheck_platform_profiles WHERE email=? LIMIT 1', [user.email]);
  return rows[0] && String(rows[0].public_id) === String(user.id) ? rows[0] : null;
}

export async function safeScheduleJob({ req, res, identity, readJson, dbPool, ensureNotificationTable, linkedTelegramRecord, sendJson }) {
  const user = identity(req);
  if (!user) return sendJson(res, 401, { ok: false, message: 'Sessão expirada.' });
  const body = await readJson(req);
  const requestedAt = String(body.scheduledAt || body.scheduled_at || '');
  const scheduledAt = new Date(requestedAt);
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(requestedAt)) return sendJson(res, 400, { ok: false, message: 'Informe data/hora com fuso.' });
  if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) return sendJson(res, 400, { ok: false, message: 'Informe um horário futuro.' });
  const requested = String(body.channel || 'telegram').toLowerCase().trim();
  const channel = aliases[requested] || requested;
  if (!allowed.has(channel)) return sendJson(res, 400, { ok: false, message: 'Canal inválido.' });
  const db = await dbPool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  if (!await currentOwner(db, user)) return sendJson(res, 401, { ok: false, message: 'Sessão da conta não é mais válida.' });
  await ensureNotificationTable(db);
  const linked = await linkedTelegramRecord(db, user.email);
  const chatId = String(linked?.chatId || '').trim();
  const username = String(linked?.username || '').replace(/^@/, '').trim();
  if ((body.chatId && String(body.chatId).trim() !== chatId) || (body.telegramUsername && String(body.telegramUsername).replace(/^@/, '').trim() !== username)) return sendJson(res, 409, { ok: false, message: 'Destinatário não corresponde ao vínculo atual da conta.' });
  const channels = channel.split('+');
  const phone = String(body.phone || body.mobile || '').trim();
  if ((channels.includes('telegram') && !chatId) || (channels.includes('telegram-call') && !username) || (channels.includes('phone-call') && !phone)) return sendJson(res, 400, { ok: false, message: 'Vínculo ou destinatário indisponível.' });
  const jobKey = String(body.jobKey || body.job_key || `manual:${scheduledAt.toISOString()}:${channel}`).slice(0, 220);
  if (jobKey.startsWith('cycle:')) return sendJson(res, 409, { ok: false, message: 'Alertas por ciclo exigem fonte e agendamento verificados no servidor.' });
  const job = { email: user.email, job_key: jobKey, scheduled_at: scheduledAt, channel, chat_id: chatId, telegram_username: username, phone,
    message: String(body.message || 'Despertador CrewCheck: confira sua preparação no aplicativo.').trim().slice(0, 1000) };
  const [existing] = await db.query('SELECT *,ROUND(UNIX_TIMESTAMP(scheduled_at)*1000) AS scheduled_epoch,ROUND(UNIX_TIMESTAMP(created_at)*1000) AS created_epoch FROM crewcheck_notification_jobs WHERE email=? AND job_key=? LIMIT 1', [user.email, jobKey]);
  const old = existing[0];
  if (old && (terminal.has(old.status) || ['processing', 'dispatching'].includes(old.status))) {
    return sendJson(res, same(old, job) ? 200 : 409, { ok: same(old, job), jobKey, status: old.status, message: 'Solicitação já registrada; não foi reativada.' });
  }
  if (!old) {
    // Simultaneous identical requests share the existing unique owner/job key.
    await db.query(`INSERT INTO crewcheck_notification_jobs (email,job_key,scheduled_at,channel,chat_id,telegram_username,phone,message,status)
      VALUES(?,?,FROM_UNIXTIME(?/1000),?,?,?,?,?,'pending') ON DUPLICATE KEY UPDATE id=id`, [user.email, jobKey, scheduledAt.getTime(), channel, chatId, username, phone, job.message]);
  } else if (!same(old, job)) {
    const [update] = await db.query(`UPDATE crewcheck_notification_jobs SET scheduled_at=FROM_UNIXTIME(?/1000),channel=?,chat_id=?,telegram_username=?,phone=?,message=?,attempts=0,last_error=NULL WHERE id=? AND email=? AND status='pending'`, [scheduledAt.getTime(), channel, chatId, username, phone, job.message, old.id, user.email]);
    if (!update.affectedRows) return sendJson(res, 409, { ok: false, message: 'Envio já iniciou; alteração não aplicada.' });
  }
  const [saved] = await db.query('SELECT *,ROUND(UNIX_TIMESTAMP(scheduled_at)*1000) AS scheduled_epoch,ROUND(UNIX_TIMESTAMP(created_at)*1000) AS created_epoch FROM crewcheck_notification_jobs WHERE email=? AND job_key=? LIMIT 1', [user.email, jobKey]);
  if (!saved[0] || !same(saved[0], job)) return sendJson(res, 409, { ok: false, message: 'Outra solicitação já usa esta chave.' });
  return sendJson(res, 200, { ok: true, jobKey, scheduledAt: scheduledAt.toISOString(), channel, status: saved[0].status, message: 'Solicitação registrada no servidor; entrega não confirmada.' });
}

export async function safeCancelJob({ req, res, identity, readJson, dbPool, sendJson }) {
  const user = identity(req);
  if (!user) return sendJson(res, 401, { ok: false, message: 'Sessão expirada.' });
  const body = await readJson(req);
  const db = await dbPool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  if (!await currentOwner(db, user)) return sendJson(res, 401, { ok: false, message: 'Sessão da conta não é mais válida.' });
  const args = [user.email, Number(body.id || 0), String(body.jobKey || '')];
  const [result] = await db.query("UPDATE crewcheck_notification_jobs SET status='cancelled',locked_at=NULL WHERE email=? AND (id=? OR job_key=?) AND status IN ('pending','processing')", args);
  const [rows] = await db.query('SELECT status FROM crewcheck_notification_jobs WHERE email=? AND (id=? OR job_key=?)', args);
  const inFlight = rows.some(row => row.status === 'dispatching');
  return sendJson(res, inFlight ? 409 : 200, { ok: !inFlight, cancelled: result.affectedRows, inFlight, message: inFlight ? 'Envio já iniciou; não foi possível confirmar cancelamento.' : 'Cancelamento verificado; mensagens já aceitas não podem ser recolhidas.' });
}

export async function dispatchClaimedJob(db, selected, { deliver, findLink, now = Date.now() }) {
  const [rows] = await db.query("SELECT *,ROUND(UNIX_TIMESTAMP(scheduled_at)*1000) AS scheduled_epoch,ROUND(UNIX_TIMESTAMP(created_at)*1000) AS created_epoch FROM crewcheck_notification_jobs WHERE id=? AND status='processing' LIMIT 1", [selected.id]);
  const job = rows[0];
  if (!job) return { status: 'skipped' }; // cancellation after selection/claim
  const when = epoch(job, 'scheduled');
  if (!Number.isFinite(when) || when < now - JOB_GRACE_SECONDS * 1000 || when > now) {
    await db.query("UPDATE crewcheck_notification_jobs SET status=?,locked_at=NULL WHERE id=? AND status='processing' AND locked_at=?", [when > now ? 'pending' : 'expired', job.id, job.locked_at]);
    return { status: when > now ? 'pending' : 'expired' };
  }
  const [owners] = await db.query('SELECT created_at,ROUND(UNIX_TIMESTAMP(created_at)*1000) AS created_epoch FROM crewcheck_platform_profiles WHERE email=? LIMIT 1', [job.email]);
  const created = epoch(owners[0], 'created');
  const jobCreated = epoch(job, 'created');
  if (!owners[0] || !Number.isFinite(created) || !Number.isFinite(jobCreated) || created > jobCreated) {
    await db.query("UPDATE crewcheck_notification_jobs SET status='cancelled',locked_at=NULL WHERE id=? AND status='processing' AND locked_at=?", [job.id, job.locked_at]);
    return { status: 'cancelled' };
  }
  const channels = (aliases[job.channel] || job.channel).split('+');
  if (channels.some(channel => channel.startsWith('telegram'))) {
    const link = await findLink(db, job.email);
    if ((channels.includes('telegram') && (!link?.chatId || String(link.chatId) !== String(job.chat_id))) ||
        (channels.includes('telegram-call') && (!link?.username || String(link.username).replace(/^@/, '') !== String(job.telegram_username)))) {
      await db.query("UPDATE crewcheck_notification_jobs SET status='cancelled',locked_at=NULL WHERE id=? AND status='processing' AND locked_at=?", [job.id, job.locked_at]);
      return { status: 'cancelled' };
    }
  }
  // Atomic cancellation cutoff. Cancellation cannot report success after dispatch starts.
  const claimSql = "UPDATE crewcheck_notification_jobs SET status='dispatching' WHERE id=? AND status='processing' AND locked_at=?";
  let claim;
  if (String(job.job_key).startsWith('cycle:')) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [current] = await connection.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [job.email]);
      const supported = String(job.job_key).startsWith(cycleJobPrefix(LEAVE_CYCLE));
      const scope = supported && current[0]?.public_id ? await lockCycle(connection, job.email, current[0].public_id, LEAVE_CYCLE) : null;
      if (!scope || scope.state.submitted === true || scope.state.schedulingAllowed !== true) {
        await connection.query("UPDATE crewcheck_notification_jobs SET status='cancelled',locked_at=NULL WHERE id=? AND status='processing' AND locked_at=?", [job.id, job.locked_at]);
        await connection.commit();
        return { status: 'cancelled' };
      }
      [claim] = await connection.query(claimSql, [job.id, job.locked_at]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  } else [claim] = await db.query(claimSql, [job.id, job.locked_at]);
  if (!claim.affectedRows) return { status: 'skipped' };
  let result;
  try { result = await deliver(job); } catch { result = { ok: false, uncertain: true }; }
  const parts = Array.isArray(result?.results) ? result.results : [result];
  const accepted = parts.some(part => part?.ok === true);
  const partial = accepted && parts.some(part => part?.ok !== true);
  const uncertain = parts.some(part => part?.ok !== true && part?.uncertain !== false);
  const status = partial ? 'partial' : accepted ? 'sent' : uncertain ? 'uncertain' : Number(job.attempts) < 3 ? 'pending' : 'failed';
  await db.query("UPDATE crewcheck_notification_jobs SET status=?,locked_at=NULL,sent_at=IF(?=1,NOW(3),sent_at),last_error=? WHERE id=? AND status='dispatching' AND locked_at=?", [status, accepted ? 1 : 0, accepted ? null : 'Tentativa não confirmada; consulte o estado antes de reagendar.', job.id, job.locked_at]);
  return { status, accepted, delivered: null };
}
