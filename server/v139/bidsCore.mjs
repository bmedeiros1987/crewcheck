import crypto from 'node:crypto';
import { cleanText, readBody, requireIdentity, sendJson } from './common.mjs';

function parseDate(value) {
  const date = new Date(String(value || ''));
  return Number.isFinite(date.getTime()) ? date : null;
}

export async function handleBidsCore(req, res, url) {
  if (url.pathname !== '/api/platform/bids') return false;
  const context = await requireIdentity(req, res);
  if (!context) return true;
  if (req.method === 'POST') {
    const body = await readBody(req, 300000);
    const opens = parseDate(body.opensAt);
    const closes = parseDate(body.closesAt);
    const targetMonth = String(body.targetMonth || '').slice(0, 7);
    if (!opens || !closes || closes <= opens || !/^\d{4}-\d{2}$/.test(targetMonth)) {
      sendJson(res, 400, { ok: false, message: 'Confira mês, abertura e encerramento.' });
      return true;
    }
    await context.db.query(
      'INSERT INTO crewcheck_platform_bid_windows (id,owner_email,title,target_month,opens_at,closes_at,provider_url,notify_open,notify_last_day) VALUES(?,?,?,?,?,?,?,?,?)',
      [crypto.randomUUID(), context.email, cleanText(body.title || 'Janela de BIDS', 180), targetMonth, opens, closes, cleanText(body.providerUrl, 800) || null, 1, 1],
    );
  }
  const [rows] = await context.db.query('SELECT * FROM crewcheck_platform_bid_windows WHERE owner_email=? ORDER BY opens_at DESC LIMIT 80', [context.email]);
  sendJson(res, 200, { ok: true, windows: rows });
  return true;
}
