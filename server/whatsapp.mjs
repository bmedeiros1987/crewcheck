import crypto from 'node:crypto';
import { dbPool, secureCompare } from './v139/common.mjs';

const MAX_WEBHOOK_BYTES = 1_000_000;
const MEMORY_DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
const memoryClaims = new Map();
let tableReadyPromise = null;

function envAny(names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function verifyToken() {
  return envAny(['WHATSAPP_VERIFY_TOKEN', 'META_WEBHOOK_VERIFY_TOKEN']);
}

function appSecret() {
  return envAny(['META_APP_SECRET', 'WHATSAPP_APP_SECRET']);
}

function auditSecret() {
  return envAny([
    'CREWCHECK_WHATSAPP_AUDIT_SALT',
    'CREWCHECK_DATA_ENCRYPTION_KEY',
    'CREWCHECK_AUTH_SECRET',
    'META_APP_SECRET',
  ]);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, value) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(String(value || ''));
}

function readRawBody(req, limit = MAX_WEBHOOK_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > limit) {
        reject(Object.assign(new Error('Webhook acima do limite permitido.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function verifyWhatsAppSignature(rawBody, signatureHeader, secret = appSecret()) {
  if (!secret) return false;
  const supplied = String(signatureHeader || '').trim();
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return secureCompare(supplied, expected);
}

function privateHash(value) {
  const secret = auditSecret();
  if (!value || !secret) return '';
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

function payloadHash(rawBody) {
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}

export function extractWhatsAppEvents(payload = {}, rawBody = Buffer.alloc(0)) {
  const events = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      if (String(change?.field || '') !== 'messages') continue;
      const value = change?.value || {};
      const phoneNumberId = String(value?.metadata?.phone_number_id || '').trim();
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      for (const message of messages) {
        const messageId = String(message?.id || '').trim();
        if (!messageId) continue;
        events.push({
          eventId: `message:${messageId}`,
          eventType: `message.${String(message?.type || 'unknown').slice(0, 32)}`,
          phoneNumberId,
          subjectHash: privateHash(message?.from),
          eventStatus: 'received',
        });
      }
      const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
      for (const status of statuses) {
        const messageId = String(status?.id || '').trim();
        const state = String(status?.status || 'unknown').trim().slice(0, 32);
        const timestamp = String(status?.timestamp || '').trim();
        if (!messageId) continue;
        events.push({
          eventId: `status:${messageId}:${state}:${timestamp}`.slice(0, 191),
          eventType: 'message.status',
          phoneNumberId,
          subjectHash: privateHash(status?.recipient_id),
          eventStatus: state,
        });
      }
    }
  }
  if (!events.length) {
    const hash = payloadHash(rawBody);
    events.push({
      eventId: `notification:${hash}`,
      eventType: 'notification.unknown',
      phoneNumberId: '',
      subjectHash: '',
      eventStatus: 'ignored',
    });
  }
  return events;
}

function claimInMemory(eventId) {
  const now = Date.now();
  for (const [key, expiresAt] of memoryClaims.entries()) {
    if (expiresAt <= now) memoryClaims.delete(key);
  }
  if (memoryClaims.has(eventId)) return false;
  memoryClaims.set(eventId, now + MEMORY_DEDUP_TTL_MS);
  return true;
}

async function ensureEventsTable() {
  const db = await dbPool();
  if (!db) return null;
  if (!tableReadyPromise) {
    tableReadyPromise = db.query(`CREATE TABLE IF NOT EXISTS crewcheck_whatsapp_webhook_events (
      event_id VARCHAR(191) NOT NULL PRIMARY KEY,
      event_type VARCHAR(64) NOT NULL,
      phone_number_id VARCHAR(80) NULL,
      subject_hash CHAR(64) NULL,
      event_status VARCHAR(40) NULL,
      payload_hash CHAR(64) NOT NULL,
      received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY crewcheck_whatsapp_received_idx (received_at),
      KEY crewcheck_whatsapp_type_idx (event_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
      .then(() => db)
      .catch((error) => {
        tableReadyPromise = null;
        console.error('[crewcheck:whatsapp:table]', String(error?.code || 'DB_ERROR'));
        return null;
      });
  }
  return tableReadyPromise;
}

async function claimPersistentEvent(event, rawHash) {
  const db = await ensureEventsTable();
  if (!db) return true;
  try {
    const [result] = await db.query(
      `INSERT IGNORE INTO crewcheck_whatsapp_webhook_events
       (event_id,event_type,phone_number_id,subject_hash,event_status,payload_hash)
       VALUES (?,?,?,?,?,?)`,
      [
        event.eventId,
        event.eventType,
        event.phoneNumberId || null,
        event.subjectHash || null,
        event.eventStatus || null,
        rawHash,
      ],
    );
    return Number(result?.affectedRows || 0) > 0;
  } catch (error) {
    console.error('[crewcheck:whatsapp:claim]', String(error?.code || 'DB_ERROR'));
    return true;
  }
}

async function processWhatsAppPayload(payload, rawBody) {
  const rawHash = payloadHash(rawBody);
  const events = extractWhatsAppEvents(payload, rawBody);
  let accepted = 0;
  let duplicates = 0;
  for (const event of events) {
    if (!claimInMemory(event.eventId)) {
      duplicates += 1;
      continue;
    }
    if (await claimPersistentEvent(event, rawHash)) accepted += 1;
    else duplicates += 1;
  }
  console.info('[crewcheck:whatsapp:webhook]', JSON.stringify({ accepted, duplicates, total: events.length }));
}

function webhookHealth() {
  const inbound = Boolean(verifyToken() && appSecret());
  const outbound = Boolean(envAny(['WHATSAPP_ACCESS_TOKEN']) && envAny(['WHATSAPP_PHONE_NUMBER_ID']));
  return {
    ok: inbound,
    configured: inbound,
    inbound,
    outbound,
    callbackPath: '/api/whatsapp/webhook',
    verifyTokenConfigured: Boolean(verifyToken()),
    appSecretConfigured: Boolean(appSecret()),
    accessTokenConfigured: Boolean(envAny(['WHATSAPP_ACCESS_TOKEN'])),
    phoneNumberIdConfigured: Boolean(envAny(['WHATSAPP_PHONE_NUMBER_ID'])),
    businessAccountIdConfigured: Boolean(envAny(['WHATSAPP_BUSINESS_ACCOUNT_ID'])),
    clientCertificateRequired: false,
    message: inbound
      ? 'Webhook oficial do WhatsApp pronto para verificação da Meta.'
      : 'Configure WHATSAPP_VERIFY_TOKEN e META_APP_SECRET no Render.',
  };
}

async function handleVerification(res, url) {
  const configured = verifyToken();
  if (!configured) return sendText(res, 503, 'WHATSAPP_VERIFY_TOKEN não configurado');
  const mode = String(url.searchParams.get('hub.mode') || '');
  const supplied = String(url.searchParams.get('hub.verify_token') || '');
  const challenge = String(url.searchParams.get('hub.challenge') || '');
  if (mode === 'subscribe' && secureCompare(supplied, configured) && challenge) {
    return sendText(res, 200, challenge);
  }
  return sendText(res, 403, 'Webhook verification failed');
}

async function handleNotification(req, res) {
  const secret = appSecret();
  if (!secret) return sendJson(res, 503, { ok: false, message: 'META_APP_SECRET não configurado.' });
  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    return sendJson(res, Number(error?.status || 400), { ok: false, message: 'Webhook inválido.' });
  }
  const signature = req.headers['x-hub-signature-256'];
  if (!verifyWhatsAppSignature(rawBody, signature, secret)) {
    return sendJson(res, 401, { ok: false, message: 'Assinatura do webhook inválida.' });
  }
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8') || '{}');
  } catch {
    return sendJson(res, 400, { ok: false, message: 'JSON inválido.' });
  }
  if (String(payload?.object || '') !== 'whatsapp_business_account') {
    return sendJson(res, 200, { ok: true, ignored: true });
  }
  sendJson(res, 200, { ok: true, queued: true });
  setImmediate(() => {
    processWhatsAppPayload(payload, rawBody).catch((error) => {
      console.error('[crewcheck:whatsapp:process]', String(error?.code || error?.message || 'PROCESS_ERROR'));
    });
  });
}

export async function handleWhatsAppRoute(req, res, url) {
  if (url.pathname === '/api/whatsapp/health') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
      return true;
    }
    sendJson(res, 200, webhookHealth());
    return true;
  }
  if (url.pathname !== '/api/whatsapp/webhook') return false;
  if (req.method === 'GET') {
    await handleVerification(res, url);
    return true;
  }
  if (req.method === 'POST') {
    await handleNotification(req, res);
    return true;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { allow: 'GET, POST, OPTIONS', 'cache-control': 'no-store' });
    res.end();
    return true;
  }
  sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
  return true;
}
