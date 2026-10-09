import crypto from 'node:crypto';
import { cleanText, readBody, requireIdentity, sendJson } from './common.mjs';
import { withBidsCreation } from './bidsCreation.mjs';

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
    opensAt: row.open_epoch != null ? new Date(Number(row.open_epoch)).toISOString() : iso(row.opens_at),
    closesAt: row.close_epoch != null ? new Date(Number(row.close_epoch)).toISOString() : iso(row.closes_at),
    providerUrl: row.provider_url || '',
    notifyOpen: Boolean(row.notify_open),
    notifyLastDay: Boolean(row.notify_last_day),
    openNotifiedAt: iso(row.open_notified_at),
    lastDayNotifiedAt: iso(row.last_day_notified_at),
    createdAt: iso(row.created_at),
  };
}

export async function handleBidsCore(req, res, url, { identify = requireIdentity, read = readBody } = {}) {
  const item = url.pathname.match(/^\/api\/platform\/bids\/([^/]+)$/);
  if (url.pathname !== '/api/platform/bids' && !item) return false;
  const context = await identify(req, res);
  if (!context) return true;
  if (!context.payload?.sub || String(context.profile?.public_id) !== String(context.payload.sub)) {
    sendJson(res, 401, { ok: false, message: 'Sessão da conta não é mais válida.' }); return true;
  }

  if (item && req.method === 'DELETE') {
    const result = await withBidsCreation(context.db, context.email, item[1], 'delete', async connection => {
      const [deleted] = await connection.query('DELETE FROM crewcheck_platform_bid_windows WHERE BINARY id=BINARY ? AND owner_email=?', [item[1], context.email]);
      return deleted;
    });
    sendJson(res, result.affectedRows ? 200 : 404, { ok: Boolean(result.affectedRows), message: result.affectedRows ? 'Janela removida. Envios já iniciados não podem ser recolhidos.' : 'Janela não encontrada nesta conta.' });
    return true;
  }

  if (req.method === 'POST') {
    const body = await read(req, 300000);
    const opens = parseDate(body.opensAt);
    const closes = parseDate(body.closesAt);
    const targetMonth = String(body.targetMonth || '').slice(0, 7);
    const title = cleanText(body.title || 'Janela de BIDS', 180);
    if (!opens || !closes || closes <= opens || !/^\d{4}-\d{2}$/.test(targetMonth)) {
      sendJson(res, 400, { ok: false, message: 'Confira mês, abertura e encerramento.' });
      return true;
    }
    const requestedId = item?.[1] || cleanText(body.id, 64);
    const [existing] = requestedId
      ? await context.db.query('SELECT id FROM crewcheck_platform_bid_windows WHERE id=? AND owner_email=? LIMIT 1', [requestedId, context.email])
      : [[]]; // Creation is never an implicit edit. Only an explicit owned ID may update.
    if (requestedId && !existing[0]?.id) {
      sendJson(res, 404, { ok: false, message: 'Janela não encontrada nesta conta.' });
      return true;
    }
    if (existing[0]?.id) {
      await context.db.query(
        `UPDATE crewcheck_platform_bid_windows
         SET open_notified_at=IF(opens_at=FROM_UNIXTIME(?/1000) AND closes_at=FROM_UNIXTIME(?/1000),open_notified_at,NULL),
             last_day_notified_at=IF(opens_at=FROM_UNIXTIME(?/1000) AND closes_at=FROM_UNIXTIME(?/1000),last_day_notified_at,NULL),
             opens_at=FROM_UNIXTIME(?/1000),closes_at=FROM_UNIXTIME(?/1000),title=?,target_month=?,provider_url=?,notify_open=?,notify_last_day=?
         WHERE id=? AND owner_email=?`,
        [opens.getTime(), closes.getTime(), opens.getTime(), closes.getTime(), opens.getTime(), closes.getTime(), title, targetMonth, cleanText(body.providerUrl, 800) || null, body.notifyOpen === true ? 1 : 0, body.notifyLastDay === true ? 1 : 0, existing[0].id, context.email],
      );
    } else {
      const creationId = crypto.createHash('sha256').update(JSON.stringify([context.email, cleanText(body.creationKey, 100) || [targetMonth, title]])).digest('hex');
      let created;
      try { created = await withBidsCreation(context.db, context.email, creationId, 'create', async connection => {
      await connection.query(
        `INSERT INTO crewcheck_platform_bid_windows (id,owner_email,title,target_month,opens_at,closes_at,provider_url,notify_open,notify_last_day) VALUES(?,?,?,?,FROM_UNIXTIME(?/1000),FROM_UNIXTIME(?/1000),?,?,?)
         ON DUPLICATE KEY UPDATE id=id`,
        [creationId, context.email, title, targetMonth, opens.getTime(), closes.getTime(), cleanText(body.providerUrl, 800) || null, body.notifyOpen === true ? 1 : 0, body.notifyLastDay === true ? 1 : 0],
      );
      const [saved] = await connection.query('SELECT title,target_month,notify_open,notify_last_day,ROUND(UNIX_TIMESTAMP(opens_at)*1000) AS open_epoch,ROUND(UNIX_TIMESTAMP(closes_at)*1000) AS close_epoch FROM crewcheck_platform_bid_windows WHERE id=? AND owner_email=? LIMIT 1', [creationId, context.email]);
      return saved;
      }); } catch (error) {
        if (error.status !== 409) throw error;
        sendJson(res, 409, { ok: false, message: error.message }); return true;
      }
      const row = created[0];
      if (!row || row.title !== title || row.target_month !== targetMonth || Number(row.open_epoch) !== opens.getTime() || Number(row.close_epoch) !== closes.getTime() || Boolean(row.notify_open) !== (body.notifyOpen === true) || Boolean(row.notify_last_day) !== (body.notifyLastDay === true)) {
        sendJson(res, 409, { ok: false, message: 'Esta solicitação já foi alterada ou removida; recarregue as janelas.' });
        return true;
      }
    }
  } else if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
    return true;
  }

  const [rows] = await context.db.query('SELECT *,ROUND(UNIX_TIMESTAMP(opens_at)*1000) AS open_epoch,ROUND(UNIX_TIMESTAMP(closes_at)*1000) AS close_epoch FROM crewcheck_platform_bid_windows WHERE owner_email=? ORDER BY opens_at DESC LIMIT 80', [context.email]);
  // Viewing/saving a window must not send an external message as a side effect.
  sendJson(res, 200, { ok: true, windows: rows.map(clientRow), notifications: [] });
  return true;
}
