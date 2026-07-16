import crypto from 'node:crypto';
import { cleanText, readBody, requireIdentity, sendJson } from './common.mjs';
import { notifyBidRows } from './bidsNotify.mjs';

function parseDate(value) {
  const date = new Date(String(value || ''));
  return Number.isFinite(date.getTime()) ? date : null;
}

function clientRow(row) {
  const iso = (value) => parseDate(value)?.toISOString() || null;
  return {
    id: row.id,
    title: row.title,
    targetMonth: row.target_month,
    opensAt: iso(row.opens_at),
    closesAt: iso(row.closes_at),
    providerUrl: row.provider_url || '',
    notifyOpen: Boolean(row.notify_open),
    notifyLastDay: Boolean(row.notify_last_day),
    openNotifiedAt: iso(row.open_notified_at),
    lastDayNotifiedAt: iso(row.last_day_notified_at),
    createdAt: iso(row.created_at),
  };
}

export async function handleBidsCore(req, res, url) {
  const item = url.pathname.match(/^\/api\/platform\/bids\/([^/]+)$/);
  if (url.pathname !== '/api/platform/bids' && !item) return false;
  const context = await requireIdentity(req, res);
  if (!context) return true;

  if (item && req.method === 'DELETE') {
    await context.db.query('DELETE FROM crewcheck_platform_bid_windows WHERE id=? AND owner_email=?', [item[1], context.email]);
    sendJson(res, 200, { ok: true, message: 'Janela removida.' });
    return true;
  }

  if (req.method === 'POST') {
    const body = await readBody(req, 300000);
    const opens = parseDate(body.opensAt);
    const closes = parseDate(body.closesAt);
    const targetMonth = String(body.targetMonth || '').slice(0, 7);
    const title = cleanText(body.title || 'Janela de BIDS', 180);
    if (!opens || !closes || closes <= opens || !/^\d{4}-\d{2}$/.test(targetMonth)) {
      sendJson(res, 400, { ok: false, message: 'Confira mês, abertura e encerramento.' });
      return true;
    }
    const [existing] = await context.db.query(
      'SELECT id FROM crewcheck_platform_bid_windows WHERE owner_email=? AND target_month=? AND title=? ORDER BY updated_at DESC LIMIT 1',
      [context.email, targetMonth, title],
    );
    if (existing[0]?.id) {
      await context.db.query(
        `UPDATE crewcheck_platform_bid_windows
         SET opens_at=?,closes_at=?,provider_url=?,notify_open=?,notify_last_day=?,open_notified_at=NULL,last_day_notified_at=NULL
         WHERE id=? AND owner_email=?`,
        [opens, closes, cleanText(body.providerUrl, 800) || null, body.notifyOpen === false ? 0 : 1, body.notifyLastDay === false ? 0 : 1, existing[0].id, context.email],
      );
    } else {
      await context.db.query(
        'INSERT INTO crewcheck_platform_bid_windows (id,owner_email,title,target_month,opens_at,closes_at,provider_url,notify_open,notify_last_day) VALUES(?,?,?,?,?,?,?,?,?)',
        [crypto.randomUUID(), context.email, title, targetMonth, opens, closes, cleanText(body.providerUrl, 800) || null, body.notifyOpen === false ? 0 : 1, body.notifyLastDay === false ? 0 : 1],
      );
    }
  } else if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
    return true;
  }

  const [rows] = await context.db.query('SELECT * FROM crewcheck_platform_bid_windows WHERE owner_email=? ORDER BY opens_at DESC LIMIT 80', [context.email]);
  const notifications = await notifyBidRows(context.db, rows);
  const [updated] = await context.db.query('SELECT * FROM crewcheck_platform_bid_windows WHERE owner_email=? ORDER BY opens_at DESC LIMIT 80', [context.email]);
  sendJson(res, 200, { ok: true, windows: updated.map(clientRow), notifications });
  return true;
}
