import crypto from 'node:crypto';
import { cleanText, dbPool, env, sendJson } from '../v139/common.mjs';

function safeString(value, limit = 500) {
  return cleanText(String(value || ''), limit);
}

function readRawJsonBody(req, limit = 500_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    req.on('data', (chunk) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > limit) {
        fail(Object.assign(new Error('Conteúdo maior que o limite permitido.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      const rawBody = Buffer.concat(chunks);
      const text = rawBody.toString('utf8');
      if (!text.trim()) {
        resolve({ rawBody, body: {} });
        return;
      }
      try {
        resolve({ rawBody, body: JSON.parse(text) });
      } catch {
        reject(Object.assign(new Error('JSON inválido.'), { status: 400 }));
      }
    });

    req.on('error', fail);
  });
}

function webhookSecret() {
  return env('MAILERSEND_WEBHOOK_SECRET');
}

function signatureValid(secret, req, rawBody) {
  if (!secret) return false;
  const supplied = String(req.headers['signature'] || req.headers['x-mailersend-signature'] || '').trim();
  if (!supplied) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

function recipientIdentity(value = '') {
  const email = String(value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return { stored: null, domain: '' };
  const domain = safeString(email.split('@').pop(), 190).toLowerCase();
  const digest = crypto.createHash('sha256').update(email).digest('hex');
  return { stored: `sha256:${digest}`, domain };
}

function sanitizedDeliverySnapshot(body = {}) {
  const data = body?.data || {};
  const rawErrors = Array.isArray(data?.errors)
    ? data.errors
    : Array.isArray(body?.errors)
      ? body.errors
      : [];
  const errorCodes = rawErrors
    .map((entry) => safeString(entry?.code || entry?.error_code, 80))
    .filter(Boolean)
    .slice(0, 8);
  const errorTitles = rawErrors
    .map((entry) => safeString(entry?.title || entry?.type, 120))
    .filter(Boolean)
    .slice(0, 8);
  const recipientRaw = data?.email || data?.recipient?.email || data?.recipient || '';
  const recipient = recipientIdentity(recipientRaw);
  return {
    eventType: safeString(body?.type || body?.event || 'unknown', 80),
    recipientDomain: recipient.domain,
    errorCodes,
    errorTitles,
    providerCreatedAt: safeString(body?.created_at, 80) || null,
  };
}

export function authDeliveryStateForMailerSendEvent(value) {
  const type = String(value || '').trim().toLowerCase();
  if (type === 'sent') return 'sent';
  if (type === 'delivered') return 'delivered';
  if (type === 'hard_bounced' || type === 'rejected') return 'rejected';
  if (type === 'soft_bounced' || type === 'failed') return 'failed';
  return null;
}

async function reconcileAuthArtifactDelivery(db, { messageId, eventType }) {
  const deliveryMessageId = safeString(messageId, 160) || null;
  const nextState = authDeliveryStateForMailerSendEvent(eventType);
  if (!deliveryMessageId || !nextState) return { matched: false, state: null };

  const [result] = await db.query(
    `UPDATE crewcheck_platform_auth_artifacts
     SET delivery_state = CASE
       WHEN delivery_state='delivered' THEN delivery_state
       WHEN ?='delivered' THEN 'delivered'
       WHEN delivery_state='rejected' THEN delivery_state
       WHEN ?='rejected' THEN 'rejected'
       WHEN ?='failed' AND delivery_state IN ('created','accepted','sent') THEN 'failed'
       WHEN ?='sent' AND delivery_state IN ('created','accepted') THEN 'sent'
       ELSE delivery_state
     END,
     delivery_provider=COALESCE(delivery_provider,'mailersend')
     WHERE delivery_message_id=?`,
    [nextState, nextState, nextState, nextState, deliveryMessageId],
  );
  return { matched: Number(result?.affectedRows || 0) > 0, state: nextState };
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
    sendJson(res, 200, { ok: true, provider: 'mailersend', version: '2.3', configured: Boolean(webhookSecret()), message: 'Webhook MailerSend pronto.' });
    return true;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
    return true;
  }

  const secret = webhookSecret();
  if (!secret) {
    sendJson(res, 503, { ok: false, code: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook temporariamente indisponível.' });
    return true;
  }

  let body;
  let rawBody;
  try {
    ({ body, rawBody } = await readRawJsonBody(req, 500_000));
  } catch (error) {
    sendJson(res, Number(error?.status || 400), { ok: false, message: 'Payload inválido.' });
    return true;
  }

  if (!signatureValid(secret, req, rawBody)) {
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
      const recipientRaw = data?.email || data?.recipient?.email || data?.recipient || '';
      const recipient = recipientIdentity(recipientRaw);
      const snapshot = sanitizedDeliverySnapshot(body);

      await db.query(`INSERT INTO crewcheck_email_events
        (event_type,event_id,message_id,email_id,recipient,subject,payload_json,provider_created_at)
        VALUES(?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE message_id=VALUES(message_id),email_id=VALUES(email_id),recipient=VALUES(recipient),subject=VALUES(subject),payload_json=VALUES(payload_json),provider_created_at=VALUES(provider_created_at)`,
        [type, eventId, messageId, emailId, recipient.stored, null, JSON.stringify(snapshot), snapshot.providerCreatedAt]);

      const authDelivery = await reconcileAuthArtifactDelivery(db, { messageId, eventType: type });

      console.info('[crewcheck:email:delivery]', JSON.stringify({
        type,
        status: type,
        provider: 'mailersend',
        recipientDomain: snapshot.recipientDomain,
        errorCodes: snapshot.errorCodes,
        errorTitles: snapshot.errorTitles,
        authArtifactMatched: authDelivery.matched,
        authDeliveryState: authDelivery.state,
      }));
    } catch (error) {
      console.error('[mailersend:webhook]', safeString(error?.message || error, 300));
    }
  });
  return true;
}
