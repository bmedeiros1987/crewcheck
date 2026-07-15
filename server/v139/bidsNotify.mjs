import { dbPool, env, secureCompare, sendJson } from './common.mjs';
import { sendTelegram, telegramLink } from './delivery.mjs';

function parseDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dueKind(row, now = new Date()) {
  const opens = parseDate(row.opens_at);
  const closes = parseDate(row.closes_at);
  if (!opens || !closes || now > closes) return '';
  const today = now.toISOString().slice(0, 10);
  if (row.notify_last_day && !row.last_day_notified_at && closes.toISOString().slice(0, 10) === today) return 'last-day';
  if (row.notify_open && !row.open_notified_at && now >= opens) return 'open';
  return '';
}

export async function notifyBidRows(db, rows) {
  const notices = [];
  for (const row of rows) {
    const kind = dueKind(row);
    if (!kind) continue;
    const link = await telegramLink(db, row.owner_email);
    const closes = parseDate(row.closes_at);
    const text = kind === 'open'
      ? [`BIDS aberto — ${row.title}`, `Mês alvo: ${row.target_month}`, `Encerramento: ${closes?.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) || 'a confirmar'}`].join('\n')
      : [`Último dia de BIDS — ${row.title}`, 'A janela encerra hoje.', 'Confira sua solicitação no sistema oficial.'].join('\n');
    await sendTelegram(link?.chatId, text);
    await db.query(
      kind === 'open'
        ? 'UPDATE crewcheck_platform_bid_windows SET open_notified_at=CURRENT_TIMESTAMP(3) WHERE id=?'
        : 'UPDATE crewcheck_platform_bid_windows SET last_day_notified_at=CURRENT_TIMESTAMP(3) WHERE id=?',
      [row.id],
    );
    notices.push({ id: row.id, kind, title: row.title, message: text });
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
  const [rows] = await db.query('SELECT * FROM crewcheck_platform_bid_windows WHERE closes_at>=CURRENT_TIMESTAMP(3) ORDER BY owner_email,opens_at');
  const notifications = await notifyBidRows(db, rows);
  sendJson(res, 200, { ok: true, notifications: notifications.length, message: 'Janelas de BIDS verificadas.' });
  return true;
}
