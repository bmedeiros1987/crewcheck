import crypto from 'node:crypto';
import { dbPool, requireIdentity, secureCompare } from './v139/common.mjs';

const MAX_WEBHOOK_BYTES = 1_000_000;
const MEMORY_DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
const LINK_TTL_MINUTES = 10;
const memoryClaims = new Map();
let tableReadyPromise = null;
let whatsappConciergeHandler = null;

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

function accessToken() {
  return envAny(['WHATSAPP_ACCESS_TOKEN']);
}

function phoneNumberId() {
  return envAny(['WHATSAPP_PHONE_NUMBER_ID']);
}

function businessNumber() {
  return envAny(['CREWCHECK_WHATSAPP_NUMBER', 'WHATSAPP_BUSINESS_NUMBER']);
}

function graphVersion() {
  const value = envAny(['WHATSAPP_GRAPH_VERSION']) || 'v26.0';
  return /^v\d+\.\d+$/.test(value) ? value : 'v26.0';
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

async function readJsonBody(req, limit = 100_000) {
  const raw = await readRawBody(req, limit);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw Object.assign(new Error('JSON inválido.'), { status: 400 });
  }
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

function linkCodeHash(code) {
  const secret = auditSecret();
  if (!secret || !code) return '';
  return crypto.createHmac('sha256', secret).update(`crewcheck-whatsapp-link|${String(code)}`).digest('hex');
}

function payloadHash(rawBody) {
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}

function normalizePhone(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 16 ? digits : '';
}

function phoneEncryptionKey() {
  const secret = auditSecret();
  if (!secret) return null;
  return crypto.createHash('sha256').update(`crewcheck-whatsapp-phone|${secret}`).digest();
}

function encryptPhone(value) {
  const phone = normalizePhone(value);
  const key = phoneEncryptionKey();
  if (!phone || !key) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function extractWhatsAppEvents(payload = {}, rawBody = Buffer.alloc(0)) {
  const events = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      if (String(change?.field || '') !== 'messages') continue;
      const value = change?.value || {};
      const phoneId = String(value?.metadata?.phone_number_id || '').trim();
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      for (const message of messages) {
        const messageId = String(message?.id || '').trim();
        if (!messageId) continue;
        events.push({
          eventId: `message:${messageId}`,
          eventType: `message.${String(message?.type || 'unknown').slice(0, 32)}`,
          phoneNumberId: phoneId,
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
          phoneNumberId: phoneId,
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

export function extractWhatsAppInboundMessages(payload = {}) {
  const messages = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      if (String(change?.field || '') !== 'messages') continue;
      const value = change?.value || {};
      const phoneId = String(value?.metadata?.phone_number_id || '').trim();
      for (const message of Array.isArray(value?.messages) ? value.messages : []) {
        const id = String(message?.id || '').trim();
        const from = normalizePhone(message?.from);
        if (!id || !from) continue;
        messages.push({
          id,
          from,
          phoneNumberId: phoneId,
          type: String(message?.type || 'unknown').slice(0, 32),
          text: String(message?.text?.body || '').trim().slice(0, 4000),
        });
      }
    }
  }
  return messages;
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

async function ensureWhatsAppTables(existingDb = null) {
  const db = existingDb || await dbPool();
  if (!db) return null;
  if (!tableReadyPromise) {
    tableReadyPromise = (async () => {
      await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_whatsapp_webhook_events (
        event_id VARCHAR(191) NOT NULL PRIMARY KEY,
        event_type VARCHAR(64) NOT NULL,
        phone_number_id VARCHAR(80) NULL,
        subject_hash CHAR(64) NULL,
        event_status VARCHAR(40) NULL,
        payload_hash CHAR(64) NOT NULL,
        received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY crewcheck_whatsapp_received_idx (received_at),
        KEY crewcheck_whatsapp_type_idx (event_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_whatsapp_links (
        email VARCHAR(254) NOT NULL PRIMARY KEY,
        phone_hash CHAR(64) NOT NULL,
        phone_cipher TEXT NOT NULL,
        phone_last4 VARCHAR(4) NULL,
        consent_concierge TINYINT(1) NOT NULL DEFAULT 1,
        consent_alerts TINYINT(1) NOT NULL DEFAULT 0,
        linked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        revoked_at DATETIME(3) NULL,
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY crewcheck_whatsapp_phone_uq (phone_hash),
        KEY crewcheck_whatsapp_active_idx (revoked_at, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_whatsapp_link_codes (
        email VARCHAR(254) NOT NULL PRIMARY KEY,
        code_hash CHAR(64) NOT NULL,
        expires_at DATETIME(3) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY crewcheck_whatsapp_link_code_uq (code_hash),
        KEY crewcheck_whatsapp_link_expiry_idx (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      return db;
    })().catch((error) => {
      tableReadyPromise = null;
      console.error('[crewcheck:whatsapp:table]', String(error?.code || 'DB_ERROR'));
      return null;
    });
  }
  return tableReadyPromise;
}

async function claimPersistentEvent(event, rawHash) {
  const db = await ensureWhatsAppTables();
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

export function configureWhatsAppConcierge(handler) {
  whatsappConciergeHandler = typeof handler === 'function' ? handler : null;
}

export async function sendWhatsAppText(to, text, options = {}) {
  const token = accessToken();
  const senderId = phoneNumberId();
  const recipient = normalizePhone(to);
  const body = String(text || '').trim().slice(0, 4000);
  if (!token || !senderId) return { ok: false, code: 'WHATSAPP_OUTBOUND_NOT_CONFIGURED' };
  if (!recipient || !body) return { ok: false, code: 'WHATSAPP_INVALID_MESSAGE' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: { preview_url: false, body },
      ...(options?.replyToMessageId ? { context: { message_id: String(options.replyToMessageId) } } : {}),
    };
    const response = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(senderId)}/messages`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn('[crewcheck:whatsapp:send]', JSON.stringify({ status: response.status, code: result?.error?.code || 'GRAPH_ERROR' }));
      return { ok: false, status: response.status, code: result?.error?.code || 'GRAPH_ERROR' };
    }
    const messageId = String(result?.messages?.[0]?.id || '');
    return { ok: true, messageId };
  } catch (error) {
    console.warn('[crewcheck:whatsapp:send]', String(error?.name || 'NETWORK_ERROR'));
    return { ok: false, code: error?.name === 'AbortError' ? 'WHATSAPP_TIMEOUT' : 'WHATSAPP_NETWORK_ERROR' };
  } finally {
    clearTimeout(timer);
  }
}

async function findActiveLinkByPhone(from) {
  const db = await ensureWhatsAppTables();
  const phoneHash = privateHash(normalizePhone(from));
  if (!db || !phoneHash) return null;
  const [rows] = await db.query(
    `SELECT email,consent_concierge,consent_alerts,linked_at
     FROM crewcheck_whatsapp_links
     WHERE phone_hash=? AND revoked_at IS NULL LIMIT 1`,
    [phoneHash],
  );
  return rows[0] || null;
}

async function tryCompleteLink(from, code) {
  const db = await ensureWhatsAppTables();
  const phone = normalizePhone(from);
  const codeHash = linkCodeHash(code);
  const phoneHash = privateHash(phone);
  const phoneCipher = encryptPhone(phone);
  if (!db || !phone || !codeHash || !phoneHash || !phoneCipher) return { linked: false };
  const [pendingRows] = await db.query(
    `SELECT email FROM crewcheck_whatsapp_link_codes
     WHERE code_hash=? AND expires_at > UTC_TIMESTAMP(3) LIMIT 1`,
    [codeHash],
  );
  const pending = pendingRows[0];
  if (!pending?.email) return { linked: false };
  const [existingRows] = await db.query(
    `SELECT email FROM crewcheck_whatsapp_links
     WHERE phone_hash=? AND revoked_at IS NULL LIMIT 1`,
    [phoneHash],
  );
  if (existingRows[0]?.email && String(existingRows[0].email).toLowerCase() !== String(pending.email).toLowerCase()) {
    return { linked: false, conflict: true };
  }
  await db.query(
    `INSERT INTO crewcheck_whatsapp_links
     (email,phone_hash,phone_cipher,phone_last4,consent_concierge,consent_alerts,linked_at,revoked_at)
     VALUES(?,?,?,?,1,0,CURRENT_TIMESTAMP(3),NULL)
     ON DUPLICATE KEY UPDATE
       phone_hash=VALUES(phone_hash),phone_cipher=VALUES(phone_cipher),phone_last4=VALUES(phone_last4),
       consent_concierge=1,revoked_at=NULL,linked_at=CURRENT_TIMESTAMP(3),updated_at=CURRENT_TIMESTAMP(3)`,
    [pending.email, phoneHash, phoneCipher, phone.slice(-4)],
  );
  await db.query('DELETE FROM crewcheck_whatsapp_link_codes WHERE email=?', [pending.email]);
  return { linked: true, email: String(pending.email) };
}

async function handleInboundMessage(message) {
  const from = normalizePhone(message?.from);
  if (!from) return;
  const text = String(message?.text || '').trim();
  if (message?.type === 'text' && /^\d{6}$/.test(text)) {
    const linking = await tryCompleteLink(from, text);
    if (linking.conflict) {
      await sendWhatsAppText(from, 'Este número já está vinculado a outra conta CrewCheck. Desvincule a conta anterior antes de tentar novamente.', { replyToMessageId: message.id });
      return;
    }
    if (linking.linked) {
      await sendWhatsAppText(from, 'WhatsApp conectado ao CrewCheck com segurança. A partir de agora você pode falar comigo por aqui sobre sua programação.', { replyToMessageId: message.id });
      return;
    }
  }

  const link = await findActiveLinkByPhone(from);
  if (!link?.email) {
    await sendWhatsAppText(from, 'Para proteger sua escala, conecte este WhatsApp à sua conta no CrewCheck usando o botão “Vincular WhatsApp”. O código é temporário e não precisa ser compartilhado com ninguém.', { replyToMessageId: message.id });
    return;
  }
  if (!Number(link.consent_concierge)) return;
  if (message?.type !== 'text') {
    await sendWhatsAppText(from, 'Recebi sua mensagem. Nesta primeira etapa do WhatsApp, fale comigo por texto. Áudio, localização e PDF serão liberados separadamente.', { replyToMessageId: message.id });
    return;
  }
  if (!text) return;
  if (typeof whatsappConciergeHandler !== 'function') {
    await sendWhatsAppText(from, 'Seu WhatsApp já está conectado. O Concierge está terminando de carregar; tente novamente em instantes.', { replyToMessageId: message.id });
    return;
  }
  try {
    const result = await whatsappConciergeHandler({ email: String(link.email), text, messageId: message.id });
    const reply = typeof result === 'string' ? result : String(result?.text || result?.reply || '');
    if (reply.trim()) await sendWhatsAppText(from, reply, { replyToMessageId: message.id });
  } catch (error) {
    console.error('[crewcheck:whatsapp:concierge]', String(error?.code || error?.name || 'CONCIERGE_ERROR'));
    await sendWhatsAppText(from, 'Não consegui concluir essa consulta agora. Tente novamente em instantes ou confira a informação diretamente no CrewCheck.', { replyToMessageId: message.id });
  }
}

async function processWhatsAppPayload(payload, rawBody) {
  const rawHash = payloadHash(rawBody);
  const events = extractWhatsAppEvents(payload, rawBody);
  const inbound = extractWhatsAppInboundMessages(payload);
  const acceptedMessageIds = new Set();
  let accepted = 0;
  let duplicates = 0;
  for (const event of events) {
    if (!claimInMemory(event.eventId)) {
      duplicates += 1;
      continue;
    }
    if (await claimPersistentEvent(event, rawHash)) {
      accepted += 1;
      if (event.eventId.startsWith('message:')) acceptedMessageIds.add(event.eventId.slice('message:'.length));
    } else duplicates += 1;
  }
  for (const message of inbound) {
    if (acceptedMessageIds.has(message.id)) await handleInboundMessage(message);
  }
  console.info('[crewcheck:whatsapp:webhook]', JSON.stringify({ accepted, duplicates, total: events.length, inbound: inbound.length }));
}

function webhookHealth() {
  const inbound = Boolean(verifyToken() && appSecret());
  const outbound = Boolean(accessToken() && phoneNumberId());
  return {
    ok: inbound,
    configured: inbound,
    inbound,
    outbound,
    callbackPath: '/api/whatsapp/webhook',
    verifyTokenConfigured: Boolean(verifyToken()),
    appSecretConfigured: Boolean(appSecret()),
    accessTokenConfigured: Boolean(accessToken()),
    phoneNumberIdConfigured: Boolean(phoneNumberId()),
    businessAccountIdConfigured: Boolean(envAny(['WHATSAPP_BUSINESS_ACCOUNT_ID'])),
    businessNumberConfigured: Boolean(businessNumber()),
    graphVersion: graphVersion(),
    accountLinking: true,
    conciergeText: true,
    clientCertificateRequired: false,
    message: inbound && outbound
      ? 'WhatsApp oficial pronto para receber, vincular e responder por texto.'
      : inbound
        ? 'Webhook pronto. Configure token permanente e Phone Number ID para responder mensagens.'
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

async function handleLinkStart(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  let body = {};
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, Number(error?.status || 400), { ok: false, message: 'Solicitação inválida.' });
  }
  if (body?.consentConcierge !== true) {
    return sendJson(res, 400, { ok: false, message: 'Confirme que deseja usar o Concierge pelo WhatsApp.' });
  }
  const db = await ensureWhatsAppTables(identity.db);
  if (!db || !auditSecret()) return sendJson(res, 503, { ok: false, message: 'Vínculo do WhatsApp temporariamente indisponível.' });
  let code = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const hash = linkCodeHash(candidate);
    try {
      await db.query(
        `INSERT INTO crewcheck_whatsapp_link_codes (email,code_hash,expires_at)
         VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${LINK_TTL_MINUTES} MINUTE))
         ON DUPLICATE KEY UPDATE code_hash=VALUES(code_hash),expires_at=VALUES(expires_at),updated_at=CURRENT_TIMESTAMP(3)`,
        [identity.email, hash],
      );
      code = candidate;
      break;
    } catch (error) {
      if (String(error?.code || '') !== 'ER_DUP_ENTRY') throw error;
    }
  }
  if (!code) return sendJson(res, 503, { ok: false, message: 'Não consegui gerar o código agora. Tente novamente.' });
  const number = normalizePhone(businessNumber());
  const openUrl = number ? `https://wa.me/${number}?text=${encodeURIComponent(code)}` : '';
  return sendJson(res, 200, {
    ok: true,
    code,
    expiresInMinutes: LINK_TTL_MINUTES,
    openUrl,
    message: 'Envie este código pelo WhatsApp oficial do CrewCheck para concluir o vínculo.',
  });
}

async function handleLinkStatus(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const db = await ensureWhatsAppTables(identity.db);
  if (!db) return sendJson(res, 503, { ok: false, message: 'Vínculo do WhatsApp temporariamente indisponível.' });
  const [rows] = await db.query(
    `SELECT phone_last4,consent_concierge,consent_alerts,linked_at
     FROM crewcheck_whatsapp_links WHERE email=? AND revoked_at IS NULL LIMIT 1`,
    [identity.email],
  );
  const link = rows[0];
  return sendJson(res, 200, {
    ok: true,
    linked: Boolean(link),
    last4: link?.phone_last4 || '',
    consentConcierge: Boolean(link?.consent_concierge),
    consentAlerts: Boolean(link?.consent_alerts),
    linkedAt: link?.linked_at || null,
  });
}

async function handleUnlink(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const db = await ensureWhatsAppTables(identity.db);
  if (!db) return sendJson(res, 503, { ok: false, message: 'Vínculo do WhatsApp temporariamente indisponível.' });
  await db.query(
    `UPDATE crewcheck_whatsapp_links SET revoked_at=CURRENT_TIMESTAMP(3),updated_at=CURRENT_TIMESTAMP(3) WHERE email=?`,
    [identity.email],
  );
  await db.query('DELETE FROM crewcheck_whatsapp_link_codes WHERE email=?', [identity.email]);
  return sendJson(res, 200, { ok: true, linked: false, message: 'WhatsApp desvinculado da sua conta.' });
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
  if (url.pathname === '/api/whatsapp/link/start') {
    await handleLinkStart(req, res);
    return true;
  }
  if (url.pathname === '/api/whatsapp/link/status') {
    await handleLinkStatus(req, res);
    return true;
  }
  if (url.pathname === '/api/whatsapp/link/unlink') {
    await handleUnlink(req, res);
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
