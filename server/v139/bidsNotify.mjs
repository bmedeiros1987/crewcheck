import crypto from 'node:crypto';
import { dbPool, env, parseJsonColumn, secureCompare, sendJson } from './common.mjs';
import { sendTelegram, telegramLink } from './delivery.mjs';

function parseDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function dueKind(row, now = new Date()) {
  const opens = parseDate(row.open_epoch != null ? Number(row.open_epoch) : row.opens_at);
  const closes = parseDate(row.close_epoch != null ? Number(row.close_epoch) : row.closes_at);
  if (!opens || !closes || closes <= opens || now < opens || now >= closes) return '';
  const day = (date) => date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  if (row.notify_last_day && !row.last_day_notified_at && day(closes) === day(now)) return 'last-day';
  if (row.notify_open && !row.open_notified_at && now >= opens) return 'open';
  return '';
}

const instant = (row, name) => Number(row[name === 'opens_at' ? 'open_epoch' : 'close_epoch'] ?? new Date(row[name]).getTime());
const revision = row => JSON.stringify([row.id, row.owner_email, row.title, row.target_month, instant(row, 'opens_at'), instant(row, 'closes_at'), row.provider_url || '', Boolean(row.notify_open), Boolean(row.notify_last_day)]);

export async function claimBid(db, selected, now) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT *,ROUND(UNIX_TIMESTAMP(opens_at)*1000) AS open_epoch,ROUND(UNIX_TIMESTAMP(closes_at)*1000) AS close_epoch FROM crewcheck_platform_bid_windows WHERE id=? AND owner_email=? FOR UPDATE', [selected.id, selected.owner_email]);
    const row = rows[0], kind = row && dueKind(row, now);
    if (!kind || revision(row) !== revision(selected)) { await connection.rollback(); return null; }
    const [owners] = await connection.query('SELECT p.public_id FROM crewcheck_platform_profiles p JOIN crewcheck_platform_bid_windows b ON BINARY b.owner_email=BINARY p.email WHERE b.id=? AND p.email=? AND p.created_at<=b.created_at', [row.id, row.owner_email]);
    if (!owners[0]?.public_id) { await connection.rollback(); return null; }
    const key = `bids-claim:${crypto.createHash('sha256').update(JSON.stringify([row.id, row.owner_email, kind, instant(row, 'opens_at'), instant(row, 'closes_at')])).digest('hex')}`;
    await connection.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key', [key, JSON.stringify({ email: row.owner_email, id: row.id, status: 'pending' })]);
    const [states] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [key]);
    const state = parseJsonColumn(states[0]?.payload, {});
    if (state.status !== 'pending') { await connection.rollback(); return null; }
    const token = crypto.randomUUID();
    await connection.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?', [JSON.stringify({ ...state, token, status: 'dispatching' }), key]);
    await connection.commit();
    return { row, kind, key, token };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function notifyBidRows(db, rows, { now = new Date(), findLink = telegramLink, send = sendTelegram } = {}) {
  const notices = [];
  for (const row of rows) {
    if (!dueKind(row, now)) continue;
    const link = await findLink(db, row.owner_email);
    if (!link?.chatId) continue;
    const claim = await claimBid(db, row, now);
    if (!claim) continue;
    const { kind } = claim;
    const closes = parseDate(row.close_epoch != null ? Number(row.close_epoch) : row.closes_at);
    const text = kind === 'open'
      ? [`BIDS aberto — ${row.title}`, `Mês alvo: ${row.target_month}`, `Encerramento: ${closes?.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) || 'a confirmar'}`].join('\n')
      : [`Último dia de BIDS — ${row.title}`, 'A janela encerra hoje.', 'Confira sua solicitação no sistema oficial.'].join('\n');
    let result;
    try { result = await send(link.chatId, text); } catch { result = { ok: false, uncertain: true }; }
    const status = result?.ok === true ? 'accepted' : result?.uncertain === false ? 'pending' : 'uncertain';
    // Never auto-retry a timeout/unknown outcome. A stale dispatch claim stays held.
    await db.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=? AND JSON_UNQUOTE(JSON_EXTRACT(payload,\'$.token\'))=?', [JSON.stringify({ email: row.owner_email, id: row.id, token: claim.token, status }), claim.key, claim.token]);
    // Provider acceptance is not a delivery/read receipt. Failed attempts stay pending.
    if (!result?.ok) continue;
    await db.query(
      kind === 'open'
        ? 'UPDATE crewcheck_platform_bid_windows SET open_notified_at=CURRENT_TIMESTAMP(3) WHERE id=? AND owner_email=? AND opens_at=FROM_UNIXTIME(?/1000) AND closes_at=FROM_UNIXTIME(?/1000)'
        : 'UPDATE crewcheck_platform_bid_windows SET last_day_notified_at=CURRENT_TIMESTAMP(3) WHERE id=? AND owner_email=? AND opens_at=FROM_UNIXTIME(?/1000) AND closes_at=FROM_UNIXTIME(?/1000)',
      [row.id, row.owner_email, instant(row, 'opens_at'), instant(row, 'closes_at')],
    );
    notices.push({ id: row.id, kind, title: row.title, message: text, channel: 'telegram', status: 'accepted', delivered: null });
  }
  return notices;
}

export async function handleBidsScheduler(req, res, url) {
  if (url.pathname !== '/api/platform/bids/notifications/run') return false;
  const configured = env('CREWCHECK_SCHEDULER_SECRET');
  const received = String(req.headers['x-crewcheck-scheduler-secret'] || '');
  if (!configured || !secureCompare(configured, received)) {
    sendJson(res, 403, { ok: false, message: 'Agendador não autorizado.' });
    return true;
  }
  const db = await dbPool();
  if (!db) {
    sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
    return true;
  }
  const [rows] = await db.query('SELECT *,ROUND(UNIX_TIMESTAMP(opens_at)*1000) AS open_epoch,ROUND(UNIX_TIMESTAMP(closes_at)*1000) AS close_epoch FROM crewcheck_platform_bid_windows WHERE closes_at>=CURRENT_TIMESTAMP(3) ORDER BY owner_email,opens_at');
  const notifications = await notifyBidRows(db, rows);
  sendJson(res, 200, { ok: true, notifications: notifications.length, message: 'Janelas de BIDS verificadas.' });
  return true;
}
