import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { cleanText, dbPool, env, flag, readBody, sendJson, sha256 } from '../v139/common.mjs';
import {
  authenticatePartnerApi,
  fetchInternalRadar,
  normalizeAirport,
  normalizePartnerFlight,
  partnerGatePayload,
  writeRateHeaders,
} from './partnerGateApi.mjs';

const WEBHOOK_EVENT = 'flight.gate.updated';
const WEBHOOK_TEST_EVENT = 'partner.webhook.test';
const WEBHOOK_MAX_ATTEMPTS = 6;
const MONITOR_LOCK = 'crewcheck_partner_gate_webhook_monitor_v1';
let monitorStarted = false;
let monitorTimer = null;

function webhookEncryptionKey() {
  const secret = env('CREWCHECK_PARTNER_WEBHOOK_ENCRYPTION_KEY', env('CREWCHECK_DATA_ENCRYPTION_KEY', env('CREWCHECK_AUTH_SECRET')));
  if (!secret) throw Object.assign(new Error('Criptografia de webhook não configurada.'), { status: 503, code: 'WEBHOOK_ENCRYPTION_UNAVAILABLE' });
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptWebhookSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', webhookEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptWebhookSecret(value) {
  const [version, ivRaw, tagRaw, dataRaw] = String(value || '').split('.');
  if (version !== 'v1' || !ivRaw || !tagRaw || !dataRaw) throw new Error('WEBHOOK_SECRET_FORMAT');
  const decipher = crypto.createDecipheriv('aes-256-gcm', webhookEncryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64url')), decipher.final()]).toString('utf8');
}

function webhookSecretMaterial() {
  const secret = `whsec_${crypto.randomBytes(32).toString('base64url')}`;
  return { secret, ciphertext: encryptWebhookSecret(secret), prefix: secret.slice(0, 16) };
}

export function webhookSignature(secret, timestamp, rawBody) {
  return `v1=${crypto.createHmac('sha256', String(secret)).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex')}`;
}

function privateIpv4(address) {
  const parts = String(address).split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0)
    || (a === 198 && (b === 18 || b === 19));
}

export function isPrivateAddress(address = '') {
  const value = String(address || '').trim().toLowerCase();
  const family = net.isIP(value);
  if (family === 4) return privateIpv4(value);
  if (family !== 6) return true;
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('fc') || value.startsWith('fd') || /^fe[89ab]/.test(value) || value.startsWith('ff')) return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? privateIpv4(mapped[1]) : false;
}

export function normalizeWebhookUrl(value = '') {
  let parsed;
  try { parsed = new URL(String(value || '').trim()); } catch { return ''; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
  const host = parsed.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return '';
  if (parsed.port && parsed.port !== '443') return '';
  parsed.hash = '';
  return parsed.toString();
}

async function assertPublicWebhookUrl(url) {
  const normalized = normalizeWebhookUrl(url);
  if (!normalized) throw Object.assign(new Error('Webhook deve usar HTTPS público na porta 443.'), { status: 400, code: 'INVALID_WEBHOOK_URL' });
  const host = new URL(normalized).hostname;
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw Object.assign(new Error('Endereço privado não é permitido.'), { status: 400, code: 'PRIVATE_WEBHOOK_ADDRESS' });
    return normalized;
  }
  const answers = await dns.lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (!answers.length || answers.some((entry) => isPrivateAddress(entry.address))) {
    throw Object.assign(new Error('O webhook deve resolver somente para endereços públicos.'), { status: 400, code: 'PRIVATE_WEBHOOK_ADDRESS' });
  }
  return normalized;
}

function parseEvents(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/);
  const events = [...new Set(list.map((item) => String(item || '').trim()).filter(Boolean))];
  return events.length ? events : [WEBHOOK_EVENT];
}

function parseDate(value, fallback = null) {
  if (!value) return fallback;
  const time = Date.parse(String(value));
  return Number.isFinite(time) ? new Date(time) : null;
}

export function gateEventPayload(watch = {}, radar = {}, previousGate = null, now = new Date(), eventIdValue = 'evt_test') {
  const gate = partnerGatePayload(radar, watch, now);
  return {
    id: eventIdValue,
    type: WEBHOOK_EVENT,
    apiVersion: 'v1',
    createdAt: now.toISOString(),
    data: {
      flight: gate.flight,
      origin: gate.origin,
      destination: gate.destination,
      previousGate: previousGate || null,
      gate: gate.gate,
      terminal: gate.terminal,
      flightStatus: gate.flightStatus,
      confidence: gate.confidence,
      confidenceBand: gate.confidenceBand,
      source: 'crewcheck-radar',
      reason: previousGate ? 'changed' : 'assigned',
      occurrenceMatch: 'live-flight-route',
      watchId: Number(watch.id || 0) || null,
    },
  };
}

async function ensureWebhookTables(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_partner_webhooks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    api_key_id BIGINT UNSIGNED NOT NULL,
    url VARCHAR(1000) NOT NULL,
    url_hash CHAR(64) NOT NULL,
    description VARCHAR(160) NULL,
    events VARCHAR(500) NOT NULL DEFAULT 'flight.gate.updated',
    secret_prefix VARCHAR(24) NOT NULL,
    secret_ciphertext TEXT NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    failure_count INT UNSIGNED NOT NULL DEFAULT 0,
    last_success_at TIMESTAMP(3) NULL,
    last_failure_at TIMESTAMP(3) NULL,
    disabled_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_partner_webhook_url (api_key_id,url_hash),
    KEY idx_partner_webhook_active (api_key_id,active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_partner_gate_watches (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    api_key_id BIGINT UNSIGNED NOT NULL,
    flight VARCHAR(16) NOT NULL,
    origin CHAR(3) NOT NULL,
    destination CHAR(3) NOT NULL,
    starts_at TIMESTAMP(3) NOT NULL,
    expires_at TIMESTAMP(3) NOT NULL,
    notify_initial TINYINT(1) NOT NULL DEFAULT 1,
    last_gate VARCHAR(32) NULL,
    last_terminal VARCHAR(32) NULL,
    last_observed_at TIMESTAMP(3) NULL,
    last_event_at TIMESTAMP(3) NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    KEY idx_partner_gate_watch_due (active,starts_at,expires_at),
    KEY idx_partner_gate_watch_owner (api_key_id,active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_partner_webhook_events (
    event_id VARCHAR(80) PRIMARY KEY,
    api_key_id BIGINT UNSIGNED NOT NULL,
    watch_id BIGINT UNSIGNED NULL,
    event_type VARCHAR(80) NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_partner_webhook_event_owner (api_key_id,created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_partner_webhook_deliveries (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(80) NOT NULL,
    webhook_id BIGINT UNSIGNED NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    response_status INT NULL,
    last_error VARCHAR(500) NULL,
    next_attempt_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    delivered_at TIMESTAMP(3) NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_partner_webhook_delivery (event_id,webhook_id),
    KEY idx_partner_webhook_delivery_due (status,next_attempt_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function auth(req, res, db, scope) {
  const credential = await authenticatePartnerApi(req, db, scope);
  writeRateHeaders(res, credential.rate);
  return credential;
}

async function listWebhooks(req, res, db) {
  const credential = await auth(req, res, db, 'webhooks:manage');
  const [rows] = await db.query(`SELECT id,url,description,events,secret_prefix AS secretPrefix,active,failure_count AS failureCount,last_success_at AS lastSuccessAt,last_failure_at AS lastFailureAt,created_at AS createdAt FROM crewcheck_partner_webhooks WHERE api_key_id=? ORDER BY id DESC`, [credential.id]);
  return sendJson(res, 200, { ok: true, webhooks: rows.map((row) => ({ ...row, events: parseEvents(row.events), active: Boolean(row.active) })) });
}

async function createWebhook(req, res, db) {
  const credential = await auth(req, res, db, 'webhooks:manage');
  const body = await readBody(req, 80_000);
  const url = await assertPublicWebhookUrl(body.url);
  const events = parseEvents(body.events);
  if (events.some((event) => event !== WEBHOOK_EVENT)) return sendJson(res, 400, { ok: false, code: 'INVALID_WEBHOOK_EVENT', message: `Evento permitido nesta versão: ${WEBHOOK_EVENT}.` });
  const description = cleanText(body.description || body.label, 160) || null;
  const material = webhookSecretMaterial();
  try {
    const [result] = await db.query(`INSERT INTO crewcheck_partner_webhooks (api_key_id,url,url_hash,description,events,secret_prefix,secret_ciphertext) VALUES(?,?,?,?,?,?,?)`, [credential.id, url, sha256(url), description, events.join(' '), material.prefix, material.ciphertext]);
    return sendJson(res, 201, {
      ok: true,
      message: 'Webhook criado. O segredo de assinatura é exibido apenas nesta resposta.',
      signingSecret: material.secret,
      webhook: { id: Number(result.insertId), url, description, events, active: true, secretPrefix: material.prefix },
    });
  } catch (error) {
    if (String(error?.code) === 'ER_DUP_ENTRY') return sendJson(res, 409, { ok: false, code: 'WEBHOOK_ALREADY_EXISTS', message: 'Este endpoint já está cadastrado para a credencial.' });
    throw error;
  }
}

async function deleteWebhook(req, res, db, id) {
  const credential = await auth(req, res, db, 'webhooks:manage');
  const [result] = await db.query('UPDATE crewcheck_partner_webhooks SET active=0,disabled_at=CURRENT_TIMESTAMP(3) WHERE id=? AND api_key_id=? AND active=1', [Number(id), credential.id]);
  return sendJson(res, result.affectedRows ? 200 : 404, result.affectedRows ? { ok: true, message: 'Webhook desativado.' } : { ok: false, code: 'WEBHOOK_NOT_FOUND', message: 'Webhook ativo não localizado.' });
}

async function listWatches(req, res, db) {
  const credential = await auth(req, res, db, 'flights:watch');
  const [rows] = await db.query(`SELECT id,flight,origin,destination,starts_at AS startsAt,expires_at AS expiresAt,notify_initial AS notifyInitial,last_gate AS lastGate,last_terminal AS lastTerminal,last_observed_at AS lastObservedAt,last_event_at AS lastEventAt,active,created_at AS createdAt FROM crewcheck_partner_gate_watches WHERE api_key_id=? ORDER BY id DESC LIMIT 250`, [credential.id]);
  return sendJson(res, 200, { ok: true, watches: rows.map((row) => ({ ...row, notifyInitial: Boolean(row.notifyInitial), active: Boolean(row.active) })) });
}

async function createWatch(req, res, db) {
  const credential = await auth(req, res, db, 'flights:watch');
  const body = await readBody(req, 80_000);
  const flight = normalizePartnerFlight(body.flight);
  const origin = normalizeAirport(body.origin);
  const destination = normalizeAirport(body.destination);
  if (!flight) return sendJson(res, 400, { ok: false, code: 'INVALID_FLIGHT', message: 'Informe um voo válido, por exemplo LA3729.' });
  if (!origin || !destination) return sendJson(res, 400, { ok: false, code: 'ROUTE_REQUIRED', message: 'Origem e destino IATA são obrigatórios para monitoramento.' });
  const now = new Date();
  const startsAt = parseDate(body.startsAt, now);
  const expiresAt = parseDate(body.expiresAt, new Date(now.getTime() + 24 * 60 * 60_000));
  if (!startsAt || !expiresAt) return sendJson(res, 400, { ok: false, code: 'INVALID_WATCH_WINDOW', message: 'Datas de monitoramento inválidas.' });
  if (startsAt.getTime() < now.getTime() - 5 * 60_000 || startsAt.getTime() > now.getTime() + 7 * 24 * 60 * 60_000) return sendJson(res, 400, { ok: false, code: 'INVALID_WATCH_START', message: 'O início deve ficar entre agora e os próximos 7 dias.' });
  if (expiresAt <= startsAt || expiresAt.getTime() - startsAt.getTime() > 48 * 60 * 60_000) return sendJson(res, 400, { ok: false, code: 'INVALID_WATCH_EXPIRY', message: 'A janela deve ter duração máxima de 48 horas.' });
  const [result] = await db.query(`INSERT INTO crewcheck_partner_gate_watches (api_key_id,flight,origin,destination,starts_at,expires_at,notify_initial) VALUES(?,?,?,?,?,?,?)`, [credential.id, flight, origin, destination, startsAt, expiresAt, body.notifyInitial === false ? 0 : 1]);
  return sendJson(res, 201, { ok: true, watch: { id: Number(result.insertId), flight, origin, destination, startsAt: startsAt.toISOString(), expiresAt: expiresAt.toISOString(), notifyInitial: body.notifyInitial !== false, occurrenceMatch: 'live-flight-route', active: true } });
}

async function deleteWatch(req, res, db, id) {
  const credential = await auth(req, res, db, 'flights:watch');
  const [result] = await db.query('UPDATE crewcheck_partner_gate_watches SET active=0 WHERE id=? AND api_key_id=? AND active=1', [Number(id), credential.id]);
  return sendJson(res, result.affectedRows ? 200 : 404, result.affectedRows ? { ok: true, message: 'Monitoramento encerrado.' } : { ok: false, code: 'WATCH_NOT_FOUND', message: 'Monitoramento ativo não localizado.' });
}

async function listDeliveries(req, res, db) {
  const credential = await auth(req, res, db, 'webhooks:manage');
  const [rows] = await db.query(`SELECT d.id,d.event_id AS eventId,d.webhook_id AS webhookId,d.status,d.attempts,d.response_status AS responseStatus,d.last_error AS lastError,d.next_attempt_at AS nextAttemptAt,d.delivered_at AS deliveredAt,d.created_at AS createdAt FROM crewcheck_partner_webhook_deliveries d JOIN crewcheck_partner_webhook_events e ON e.event_id=d.event_id WHERE e.api_key_id=? ORDER BY d.id DESC LIMIT 100`, [credential.id]);
  return sendJson(res, 200, { ok: true, deliveries: rows });
}

function eventId() {
  return `evt_${Date.now().toString(36)}_${crypto.randomBytes(10).toString('base64url')}`;
}

async function createTestDelivery(req, res, db, webhookId) {
  const credential = await auth(req, res, db, 'webhooks:manage');
  const [hooks] = await db.query('SELECT id FROM crewcheck_partner_webhooks WHERE id=? AND api_key_id=? AND active=1 LIMIT 1', [Number(webhookId), credential.id]);
  if (!hooks[0]) return sendJson(res, 404, { ok: false, code: 'WEBHOOK_NOT_FOUND', message: 'Webhook ativo não localizado.' });
  const id = eventId();
  const payload = JSON.stringify({ id, type: WEBHOOK_TEST_EVENT, apiVersion: 'v1', createdAt: new Date().toISOString(), data: { message: 'CrewCheck webhook test', source: 'crewcheck' } });
  await db.query('INSERT INTO crewcheck_partner_webhook_events (event_id,api_key_id,watch_id,event_type,payload_json) VALUES(?,?,NULL,?,?)', [id, credential.id, WEBHOOK_TEST_EVENT, payload]);
  await db.query(`INSERT INTO crewcheck_partner_webhook_deliveries (event_id,webhook_id,status,next_attempt_at) VALUES(?,?,'pending',CURRENT_TIMESTAMP(3))`, [id, Number(webhookId)]);
  await processDeliveries(db);
  const [rows] = await db.query('SELECT status,attempts,response_status AS responseStatus,last_error AS lastError,delivered_at AS deliveredAt FROM crewcheck_partner_webhook_deliveries WHERE event_id=? AND webhook_id=? LIMIT 1', [id, Number(webhookId)]);
  return sendJson(res, 200, { ok: true, eventId: id, delivery: rows[0] || { status: 'pending', attempts: 0 } });
}

async function createGateEvent(db, watch, radar, previousGate) {
  const payload = gateEventPayload(watch, radar, previousGate, new Date(), eventId());
  const raw = JSON.stringify(payload);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [currentRows] = await connection.query('SELECT last_gate AS lastGate,notify_initial AS notifyInitial,active FROM crewcheck_partner_gate_watches WHERE id=? FOR UPDATE', [watch.id]);
    const current = currentRows[0];
    if (!current?.active) { await connection.rollback(); return false; }
    const gate = cleanText(radar?.gate, 32);
    const currentGate = cleanText(current.lastGate, 32);
    if (!gate || currentGate === gate) { await connection.rollback(); return false; }
    const shouldEmit = Boolean(currentGate || current.notifyInitial);
    await connection.query('UPDATE crewcheck_partner_gate_watches SET last_gate=?,last_terminal=?,last_observed_at=CURRENT_TIMESTAMP(3),last_event_at=IF(?,CURRENT_TIMESTAMP(3),last_event_at) WHERE id=?', [gate, cleanText(radar?.terminal, 32) || null, shouldEmit ? 1 : 0, watch.id]);
    if (!shouldEmit) { await connection.commit(); return false; }
    await connection.query('INSERT INTO crewcheck_partner_webhook_events (event_id,api_key_id,watch_id,event_type,payload_json) VALUES(?,?,?,?,?)', [payload.id, watch.apiKeyId, watch.id, WEBHOOK_EVENT, raw]);
    const [hooks] = await connection.query('SELECT id,events FROM crewcheck_partner_webhooks WHERE api_key_id=? AND active=1', [watch.apiKeyId]);
    for (const hook of hooks) {
      if (!parseEvents(hook.events).includes(WEBHOOK_EVENT)) continue;
      await connection.query(`INSERT IGNORE INTO crewcheck_partner_webhook_deliveries (event_id,webhook_id,status,next_attempt_at) VALUES(?,?,'pending',CURRENT_TIMESTAMP(3))`, [payload.id, hook.id]);
    }
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

function retryDelayMs(attempt) {
  return [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 3 * 60 * 60_000][Math.max(0, Math.min(4, attempt - 1))];
}

async function deliverOne(db, row) {
  let status = 0;
  let errorText = '';
  try {
    const url = await assertPublicWebhookUrl(row.url);
    const secret = decryptWebhookSecret(row.secretCiphertext);
    const raw = String(row.payloadJson || '');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(15_000, Number(env('CREWCHECK_PARTNER_WEBHOOK_TIMEOUT_MS', '8000')) || 8000)));
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          accept: 'application/json',
          'user-agent': 'CrewCheck-Partner-Webhooks/1.0',
          'x-crewcheck-event': row.eventType,
          'x-crewcheck-event-id': row.eventId,
          'x-crewcheck-timestamp': timestamp,
          'x-crewcheck-signature': webhookSignature(secret, timestamp, raw),
        },
        body: raw,
      });
    } finally { clearTimeout(timer); }
    status = Number(response.status || 0);
    if (!response.ok) errorText = status >= 300 && status < 400 ? `REDIRECT_REJECTED_${status}` : `HTTP_${status}`;
  } catch (error) {
    errorText = cleanText(error?.name === 'AbortError' ? 'TIMEOUT' : error?.code || error?.message || 'DELIVERY_ERROR', 500);
  }
  const attempt = Number(row.attempts || 0) + 1;
  if (status >= 200 && status < 300) {
    await db.query(`UPDATE crewcheck_partner_webhook_deliveries SET status='delivered',attempts=?,response_status=?,last_error=NULL,delivered_at=CURRENT_TIMESTAMP(3) WHERE id=?`, [attempt, status, row.id]);
    await db.query('UPDATE crewcheck_partner_webhooks SET failure_count=0,last_success_at=CURRENT_TIMESTAMP(3) WHERE id=?', [row.webhookId]);
    return true;
  }
  const terminal = attempt >= WEBHOOK_MAX_ATTEMPTS;
  const next = new Date(Date.now() + retryDelayMs(attempt));
  await db.query(`UPDATE crewcheck_partner_webhook_deliveries SET status=?,attempts=?,response_status=?,last_error=?,next_attempt_at=? WHERE id=?`, [terminal ? 'failed' : 'pending', attempt, status || null, errorText || 'DELIVERY_FAILED', next, row.id]);
  await db.query('UPDATE crewcheck_partner_webhooks SET failure_count=failure_count+1,last_failure_at=CURRENT_TIMESTAMP(3),active=IF(failure_count>=20,0,active),disabled_at=IF(failure_count>=20,CURRENT_TIMESTAMP(3),disabled_at) WHERE id=?', [row.webhookId]);
  return false;
}

async function processDeliveries(db) {
  await db.query(`UPDATE crewcheck_partner_webhook_deliveries d JOIN crewcheck_partner_webhook_events e ON e.event_id=d.event_id JOIN crewcheck_partner_api_keys k ON k.id=e.api_key_id SET d.status='cancelled',d.last_error='API_KEY_REVOKED' WHERE d.status='pending' AND k.active=0`);
  const [rows] = await db.query(`SELECT d.id,d.event_id AS eventId,d.webhook_id AS webhookId,d.attempts,e.event_type AS eventType,e.payload_json AS payloadJson,w.url,w.secret_ciphertext AS secretCiphertext FROM crewcheck_partner_webhook_deliveries d JOIN crewcheck_partner_webhook_events e ON e.event_id=d.event_id JOIN crewcheck_partner_webhooks w ON w.id=d.webhook_id JOIN crewcheck_partner_api_keys k ON k.id=e.api_key_id WHERE d.status='pending' AND d.next_attempt_at<=CURRENT_TIMESTAMP(3) AND d.attempts<? AND w.active=1 AND k.active=1 ORDER BY d.next_attempt_at ASC LIMIT 100`, [WEBHOOK_MAX_ATTEMPTS]);
  for (const row of rows) await deliverOne(db, row);
}

async function pollWatches(db) {
  await db.query('UPDATE crewcheck_partner_gate_watches SET active=0 WHERE active=1 AND expires_at<=CURRENT_TIMESTAMP(3)');
  await db.query(`UPDATE crewcheck_partner_gate_watches w JOIN crewcheck_partner_api_keys k ON k.id=w.api_key_id SET w.active=0 WHERE w.active=1 AND k.active=0`);
  const [rows] = await db.query(`SELECT w.id,w.api_key_id AS apiKeyId,w.flight,w.origin,w.destination,w.notify_initial AS notifyInitial,w.last_gate AS lastGate,w.last_terminal AS lastTerminal FROM crewcheck_partner_gate_watches w JOIN crewcheck_partner_api_keys k ON k.id=w.api_key_id WHERE w.active=1 AND k.active=1 AND w.starts_at<=CURRENT_TIMESTAMP(3) AND w.expires_at>CURRENT_TIMESTAMP(3) ORDER BY w.id ASC LIMIT 250`);
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.flight}|${row.origin}|${row.destination}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const watches of groups.values()) {
    const anchor = watches[0];
    let radar;
    try { radar = await fetchInternalRadar(anchor); } catch { continue; }
    const gate = cleanText(radar?.gate, 32);
    if (!gate) {
      const ids = watches.map((watch) => Number(watch.id)).filter(Boolean);
      if (ids.length) await db.query(`UPDATE crewcheck_partner_gate_watches SET last_observed_at=CURRENT_TIMESTAMP(3) WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
      continue;
    }
    for (const watch of watches) {
      if (cleanText(watch.lastGate, 32) === gate) {
        await db.query('UPDATE crewcheck_partner_gate_watches SET last_terminal=?,last_observed_at=CURRENT_TIMESTAMP(3) WHERE id=?', [cleanText(radar?.terminal, 32) || null, watch.id]);
        continue;
      }
      await createGateEvent(db, watch, radar, cleanText(watch.lastGate, 32) || null);
    }
  }
}

export async function runPartnerGateWebhookMonitorOnce() {
  if (!flag('CREWCHECK_PARTNER_GATE_EXPORT_ENABLED', false) || !flag('CREWCHECK_PARTNER_WEBHOOKS_ENABLED', false)) return { ok: true, skipped: true };
  const db = await dbPool();
  if (!db) return { ok: false, code: 'DATABASE_UNAVAILABLE' };
  await ensureWebhookTables(db);
  const lockConnection = await db.getConnection();
  let acquired = false;
  try {
    const [locks] = await lockConnection.query('SELECT GET_LOCK(?,0) AS acquired', [MONITOR_LOCK]);
    acquired = Boolean(Number(locks?.[0]?.acquired));
    if (!acquired) return { ok: true, skipped: true, reason: 'lock-held' };
    await pollWatches(db);
    await processDeliveries(db);
    return { ok: true, skipped: false };
  } finally {
    if (acquired) await lockConnection.query('SELECT RELEASE_LOCK(?)', [MONITOR_LOCK]).catch(() => {});
    lockConnection.release();
  }
}

export function startPartnerGateWebhookMonitor() {
  if (monitorStarted) return;
  monitorStarted = true;
  const configured = Number(env('CREWCHECK_PARTNER_WEBHOOK_MONITOR_SECONDS', '60'));
  const intervalMs = Math.max(30, Math.min(600, Number.isFinite(configured) ? configured : 60)) * 1000;
  const schedule = (delay) => {
    monitorTimer = setTimeout(async () => {
      try { await runPartnerGateWebhookMonitorOnce(); }
      catch (error) { console.error('[crewcheck:partner-webhooks]', cleanText(error?.code || error?.message || 'MONITOR_ERROR', 180)); }
      schedule(intervalMs);
    }, delay);
    monitorTimer.unref?.();
  };
  schedule(5000);
}

export async function handlePartnerGateWebhookRoute(req, res, url) {
  const webhooks = url.pathname === '/api/v1/webhooks';
  const webhookId = url.pathname.match(/^\/api\/v1\/webhooks\/(\d+)$/);
  const webhookTest = url.pathname.match(/^\/api\/v1\/webhooks\/(\d+)\/test$/);
  const watches = url.pathname === '/api/v1/watches';
  const watchId = url.pathname.match(/^\/api\/v1\/watches\/(\d+)$/);
  const deliveries = url.pathname === '/api/v1/webhook-deliveries';
  if (!webhooks && !webhookId && !webhookTest && !watches && !watchId && !deliveries) return false;
  try {
    const db = await dbPool();
    if (!db) return sendJson(res, 503, { ok: false, code: 'DATABASE_UNAVAILABLE', message: 'Banco de dados indisponível.' }), true;
    await ensureWebhookTables(db);
    if (webhookTest) {
      if (req.method !== 'POST') sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
      else await createTestDelivery(req, res, db, webhookTest[1]);
    } else if (webhookId) {
      if (req.method !== 'DELETE') sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
      else await deleteWebhook(req, res, db, webhookId[1]);
    } else if (watchId) {
      if (req.method !== 'DELETE') sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
      else await deleteWatch(req, res, db, watchId[1]);
    } else if (deliveries) {
      if (req.method !== 'GET') sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
      else await listDeliveries(req, res, db);
    } else if (webhooks) {
      if (req.method === 'GET') await listWebhooks(req, res, db);
      else if (req.method === 'POST') await createWebhook(req, res, db);
      else sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
    } else if (watches) {
      if (req.method === 'GET') await listWatches(req, res, db);
      else if (req.method === 'POST') await createWatch(req, res, db);
      else sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
    }
  } catch (error) {
    const status = Number(error?.status || 500);
    if (error?.rate) writeRateHeaders(res, error.rate);
    sendJson(res, status >= 400 && status < 600 ? status : 500, {
      ok: false,
      code: error?.code || 'PARTNER_WEBHOOK_ERROR',
      message: status >= 500 ? 'O CrewCheck não conseguiu concluir esta operação agora.' : error?.message || 'Solicitação inválida.',
    });
  }
  return true;
}
