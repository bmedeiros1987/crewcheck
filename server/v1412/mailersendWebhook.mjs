import crypto from 'node:crypto';
import { cleanText, dbPool, env, readBody, sendJson } from '../v139/common.mjs';

function safeString(value, limit = 500) {
  return cleanText(String(value || ''), limit);
}

function signatureValid(req, rawBody) {
  const secret = env('MAILERSEND_WEBHOOK_SECRET');
  if (!secret) return true;
  const supplied = String(req.headers['signature'] || req.headers['x-mailersend-signature'] || '').trim();
  if (!supplied) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function ensureTable(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_email_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(80) NOT NULL,
    event_id VARCHAR(190) NULL,
    message_id VARCHAR(190) NULL,
    email_id VARCHAR(190) NULL,
    recipient VARCHAR(190) NULL,
    subject VARCHAR(500) NULL,
    payload_json JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    provider_created_at VARCHAR(80) NULL,
    UNIQUE KEY uq_email_event (event_type, event_id),
    KEY idx_email_message (message_id),
    KEY idx_email_recipient (recipient),
    KEY idx_email_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

export async function handleMailerSendWebhook(req, res, url) {
  if (url.pathname !== '/api/webhooks/mailersend') return false;
  if (req.method === 'GET' || req.method === 'HEAD') {
    sendJson(res, 200, { ok: true, provider: 'mailersend', version: '2.0', message: 'Webhook MailerSend pronto.' });
    return true;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
    return true;
  }

  let body;
  try {
    body = await readBody(req, 500_000);
  } catch {
    sendJson(res, 400, { ok: false, message: 'Payload inválido.' });
    return true;
  }

  const rawBody = JSON.stringify(body || {});
  if (!signatureValid(req, rawBody)) {
    sendJson(res, 401, { ok: false, message: 'Assinatura do webhook inválida.' });
    return true;
  }

  // Resposta rápida: MailerSend considera sucesso apenas respostas 2xx em poucos segundos.
  sendJson(res, 200, { ok: true, accepted: true });

  queueMicrotask(async () => {
    try {
      const db = await dbPool();
      if (!db) return;
      await ensureTable(db);
      const type = safeString(body?.type || body?.event || 'unknown', 80);
      const data = body?.data || {};
      const eventId = safeString(data?.id || body?.id || `${Date.now()}-${Math.random()}`, 190);
      const messageId = safeString(data?.message_id || data?.message?.id, 190) || null;
      const emailId = safeString(data?.email_id || data?.email?.id, 190) || null;
      const recipient = safeString(data?.email || data?.recipient?.email || data?.recipient, 190) || null;
      const subject = safeString(data?.subject || data?.email?.subject, 500) || null;
      await db.query(`INSERT INTO crewcheck_email_events
        (event_type,event_id,message_id,email_id,recipient,subject,payload_json,provider_created_at)
        VALUES(?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE message_id=VALUES(message_id),email_id=VALUES(email_id),recipient=VALUES(recipient),subject=VALUES(subject),payload_json=VALUES(payload_json),provider_created_at=VALUES(provider_created_at)`,
        [type, eventId, messageId, emailId, recipient, subject, JSON.stringify(body), safeString(body?.created_at, 80) || null]);
    } catch (error) {
      console.error('[mailersend:webhook]', safeString(error?.message || error, 300));
    }
  });
  return true;
}
