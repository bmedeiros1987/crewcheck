import crypto from 'node:crypto';
import { cleanText, dbPool, env, flag, isAdminEmail, readBody, requestToken, safeEmail, sendJson, sha256, verifyJwt } from '../v139/common.mjs';

const API_VERSION = 'v1';
const DEFAULT_SCOPES = Object.freeze(['gates:read']);
const ALLOWED_SCOPES = Object.freeze(['gates:read', 'webhooks:manage', 'flights:watch']);

export function normalizePartnerFlight(value = '') {
  const raw = String(value || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{2,3}\d{1,5}[A-Z]?$/.test(raw)) return '';
  if (/^LAN\d+/i.test(raw)) return `LA${raw.replace(/^LAN/i, '')}`;
  if (/^TAM\d+/i.test(raw)) return `JJ${raw.replace(/^TAM/i, '')}`;
  return raw;
}

export function normalizeAirport(value = '') {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

export function parsePartnerScopes(value = '') {
  const values = Array.isArray(value) ? value : String(value || '').split(/[\s,]+/);
  return [...new Set(values.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))];
}

export function partnerGatePayload(radar = {}, request = {}, now = new Date()) {
  const quality = Math.max(0, Math.min(100, Number(radar?.quality || 0)));
  const gate = cleanText(radar?.gate, 32) || null;
  const terminal = cleanText(radar?.terminal, 32) || null;
  const origin = normalizeAirport(radar?.origin || request?.origin) || null;
  const destination = normalizeAirport(radar?.destination || request?.destination) || null;
  const confidence = Number((quality / 100).toFixed(2));
  const confidenceBand = quality >= 80 ? 'high' : quality >= 55 ? 'medium' : 'low';
  return {
    ok: Boolean(radar?.ok && gate),
    apiVersion: API_VERSION,
    flight: normalizePartnerFlight(radar?.flight || request?.flight) || request?.flight || null,
    origin,
    destination,
    gate,
    terminal,
    flightStatus: cleanText(radar?.status, 80) || null,
    gateStatus: gate ? 'available' : 'unavailable',
    confidence,
    confidenceBand,
    source: 'crewcheck-radar',
    retrievedAt: now.toISOString(),
    occurrenceMatch: 'live-flight-route',
  };
}

function apiKeyMaterial(prefix = 'ck_live_') {
  const secret = crypto.randomBytes(32).toString('base64url');
  const token = `${prefix}${secret}`;
  return {
    token,
    keyPrefix: token.slice(0, 18),
    keyHash: sha256(token),
  };
}

function bearer(req) {
  return String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

function adminIdentity(req) {
  const payload = verifyJwt(requestToken(req));
  const email = safeEmail(payload?.email);
  if (!payload || !email) throw Object.assign(new Error('Sessão expirada.'), { status: 401, code: 'AUTH_REQUIRED' });
  if (!payload.admin || !isAdminEmail(email)) throw Object.assign(new Error('Acesso restrito ao administrador.'), { status: 403, code: 'ADMIN_REQUIRED' });
  return { payload, email };
}

export async function ensurePartnerApiTable(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_partner_api_keys (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    partner_email VARCHAR(190) NULL,
    label VARCHAR(120) NOT NULL,
    key_prefix VARCHAR(24) NOT NULL,
    key_hash CHAR(64) NOT NULL,
    scopes VARCHAR(500) NOT NULL DEFAULT 'gates:read',
    active TINYINT(1) NOT NULL DEFAULT 1,
    last_used_at TIMESTAMP(3) NULL,
    created_by VARCHAR(190) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    revoked_at TIMESTAMP(3) NULL,
    UNIQUE KEY uq_crewcheck_partner_api_hash (key_hash),
    KEY idx_crewcheck_partner_api_prefix (key_prefix),
    KEY idx_crewcheck_partner_api_partner (partner_email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_partner_api_rate_windows (
    api_key_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    window_started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    request_count INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function rateLimitFor(db, keyId) {
  const configured = Number(env('CREWCHECK_PARTNER_API_RATE_LIMIT', '60'));
  const limit = Number.isFinite(configured) ? Math.max(1, Math.min(5000, configured)) : 60;
  await db.query(`INSERT INTO crewcheck_partner_api_rate_windows (api_key_id,window_started_at,request_count)
    VALUES(?,CURRENT_TIMESTAMP(3),1)
    ON DUPLICATE KEY UPDATE
      request_count=IF(TIMESTAMPDIFF(SECOND,window_started_at,CURRENT_TIMESTAMP(3))>=60,1,request_count+1),
      window_started_at=IF(TIMESTAMPDIFF(SECOND,window_started_at,CURRENT_TIMESTAMP(3))>=60,CURRENT_TIMESTAMP(3),window_started_at)`, [keyId]);
  const [rows] = await db.query('SELECT request_count AS requestCount,UNIX_TIMESTAMP(window_started_at) AS windowStarted FROM crewcheck_partner_api_rate_windows WHERE api_key_id=? LIMIT 1', [keyId]);
  const state = rows[0] || {};
  const count = Math.max(1, Number(state.requestCount || 1));
  const startedMs = Math.floor(Number(state.windowStarted || Date.now() / 1000) * 1000);
  return { allowed: count <= limit, limit, remaining: Math.max(0, limit - count), resetAt: startedMs + 60_000 };
}

export async function authenticatePartnerApi(req, db, requiredScope) {
  const token = bearer(req);
  if (!/^ck_(?:live|test)_[A-Za-z0-9_-]{20,}$/.test(token)) {
    throw Object.assign(new Error('Credencial de parceiro ausente ou inválida.'), { status: 401, code: 'INVALID_API_KEY' });
  }
  await ensurePartnerApiTable(db);
  const keyHash = sha256(token);
  const [rows] = await db.query(
    `SELECT id,partner_email AS partnerEmail,label,key_prefix AS keyPrefix,scopes,active
     FROM crewcheck_partner_api_keys WHERE key_hash=? LIMIT 1`,
    [keyHash],
  );
  const credential = rows[0];
  if (!credential || !credential.active) {
    throw Object.assign(new Error('Credencial de parceiro inválida ou revogada.'), { status: 401, code: 'INVALID_API_KEY' });
  }
  const scopes = parsePartnerScopes(credential.scopes);
  if (requiredScope && !scopes.includes(requiredScope)) {
    throw Object.assign(new Error('Credencial sem permissão para este recurso.'), { status: 403, code: 'INSUFFICIENT_SCOPE' });
  }
  const rate = await rateLimitFor(db, Number(credential.id));
  if (!rate.allowed) {
    throw Object.assign(new Error('Limite de requisições excedido.'), { status: 429, code: 'RATE_LIMITED', rate });
  }
  db.query('UPDATE crewcheck_partner_api_keys SET last_used_at=CURRENT_TIMESTAMP(3) WHERE id=?', [credential.id]).catch(() => {});
  return { ...credential, scopes, rate };
}

export function writeRateHeaders(res, rate) {
  if (!rate) return;
  res.setHeader('x-ratelimit-limit', String(rate.limit));
  res.setHeader('x-ratelimit-remaining', String(rate.remaining));
  res.setHeader('x-ratelimit-reset', String(Math.ceil(rate.resetAt / 1000)));
}

export async function fetchInternalRadar({ flight, origin, destination }) {
  const base = env('CREWCHECK_PARTNER_RADAR_BASE_URL', `http://127.0.0.1:${env('PORT', '4173')}`).replace(/\/$/, '');
  const params = new URLSearchParams({ flight });
  if (origin) params.set('origin', origin);
  if (destination) params.set('destination', destination);
  const controller = new AbortController();
  const timeoutMs = Math.max(500, Math.min(8000, Number(env('CREWCHECK_PARTNER_RADAR_TIMEOUT_MS', '4000')) || 4000));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}/api/radar-flight?${params}`, {
      headers: { accept: 'application/json', 'x-crewcheck-internal': 'partner-gate-api-v1' },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) throw new Error(`RADAR_HTTP_${response.status}`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function handleGateRead(req, res, url, db, flightSegment) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
  const credential = await authenticatePartnerApi(req, db, 'gates:read');
  writeRateHeaders(res, credential.rate);
  if (!flag('CREWCHECK_PARTNER_GATE_EXPORT_ENABLED', false)) {
    return sendJson(res, 503, {
      ok: false,
      code: 'PARTNER_EXPORT_DISABLED',
      message: 'A exportação de dados operacionais para parceiros ainda não foi habilitada.',
    });
  }
  const flight = normalizePartnerFlight(flightSegment);
  const originRaw = String(url.searchParams.get('origin') || '');
  const destinationRaw = String(url.searchParams.get('destination') || '');
  const origin = originRaw ? normalizeAirport(originRaw) : '';
  const destination = destinationRaw ? normalizeAirport(destinationRaw) : '';
  if (!flight) return sendJson(res, 400, { ok: false, code: 'INVALID_FLIGHT', message: 'Informe um voo válido, por exemplo LA3729.' });
  if (originRaw && !origin) return sendJson(res, 400, { ok: false, code: 'INVALID_ORIGIN', message: 'Origem deve usar código IATA de três letras.' });
  if (destinationRaw && !destination) return sendJson(res, 400, { ok: false, code: 'INVALID_DESTINATION', message: 'Destino deve usar código IATA de três letras.' });

  let radar;
  try {
    radar = await fetchInternalRadar({ flight, origin, destination });
  } catch (error) {
    console.error('[crewcheck:partner-gate-api:radar]', cleanText(error?.name === 'AbortError' ? 'RADAR_TIMEOUT' : error?.message || 'RADAR_ERROR', 120));
    return sendJson(res, 502, { ok: false, code: 'RADAR_UNAVAILABLE', message: 'A fonte operacional do CrewCheck não respondeu agora.' });
  }
  return sendJson(res, 200, partnerGatePayload(radar, { flight, origin, destination }));
}

async function listKeys(req, res, db) {
  if (req.method !== 'GET') return false;
  adminIdentity(req);
  await ensurePartnerApiTable(db);
  const [rows] = await db.query(`SELECT id,partner_email AS partnerEmail,label,key_prefix AS keyPrefix,scopes,active,last_used_at AS lastUsedAt,created_by AS createdBy,created_at AS createdAt,revoked_at AS revokedAt FROM crewcheck_partner_api_keys ORDER BY id DESC LIMIT 250`);
  return sendJson(res, 200, { ok: true, keys: rows.map((row) => ({ ...row, scopes: parsePartnerScopes(row.scopes), active: Boolean(row.active) })) });
}

async function createKey(req, res, db) {
  if (req.method !== 'POST') return false;
  const admin = adminIdentity(req);
  const body = await readBody(req, 80_000);
  const partnerEmail = body.partnerEmail ? safeEmail(body.partnerEmail) : '';
  const label = cleanText(body.label || body.partnerName || body.partnerEmail || 'Parceiro CrewCheck', 120);
  const requestedScopes = parsePartnerScopes(body.scopes || DEFAULT_SCOPES);
  const allowedScopes = requestedScopes.filter((scope) => ALLOWED_SCOPES.includes(scope));
  if (!label) return sendJson(res, 400, { ok: false, code: 'INVALID_LABEL', message: 'Informe um nome para a credencial.' });
  if (body.partnerEmail && !partnerEmail) return sendJson(res, 400, { ok: false, code: 'INVALID_EMAIL', message: 'E-mail do parceiro inválido.' });
  if (!allowedScopes.length || allowedScopes.length !== requestedScopes.length) return sendJson(res, 400, { ok: false, code: 'INVALID_SCOPE', message: `Escopos permitidos: ${ALLOWED_SCOPES.join(', ')}.` });
  await ensurePartnerApiTable(db);
  if (partnerEmail) {
    const [partnerRows] = await db.query('SELECT email FROM crewcheck_partner_accounts WHERE email=? LIMIT 1', [partnerEmail]);
    if (!partnerRows[0]) return sendJson(res, 404, { ok: false, code: 'PARTNER_NOT_FOUND', message: 'Conta de parceiro não localizada.' });
  }
  const material = apiKeyMaterial(flag('CREWCHECK_PARTNER_API_TEST_MODE', false) ? 'ck_test_' : 'ck_live_');
  const scopes = allowedScopes.join(' ');
  const [result] = await db.query(
    `INSERT INTO crewcheck_partner_api_keys (partner_email,label,key_prefix,key_hash,scopes,created_by) VALUES(?,?,?,?,?,?)`,
    [partnerEmail || null, label, material.keyPrefix, material.keyHash, scopes, admin.email],
  );
  return sendJson(res, 201, {
    ok: true,
    message: 'Credencial criada. A chave completa é exibida apenas nesta resposta.',
    key: material.token,
    credential: { id: Number(result.insertId), partnerEmail: partnerEmail || null, label, keyPrefix: material.keyPrefix, scopes: allowedScopes, active: true },
  });
}

async function revokeKey(req, res, db, id) {
  if (req.method !== 'DELETE') return false;
  adminIdentity(req);
  await ensurePartnerApiTable(db);
  const keyId = Number(id);
  if (!Number.isInteger(keyId) || keyId <= 0) return sendJson(res, 400, { ok: false, code: 'INVALID_KEY_ID', message: 'Identificador de credencial inválido.' });
  const [result] = await db.query('UPDATE crewcheck_partner_api_keys SET active=0,revoked_at=CURRENT_TIMESTAMP(3) WHERE id=? AND active=1', [keyId]);
  return sendJson(res, result.affectedRows ? 200 : 404, result.affectedRows
    ? { ok: true, message: 'Credencial revogada. Consultas e entregas de webhook vinculadas deixam de ser autorizadas.' }
    : { ok: false, code: 'KEY_NOT_FOUND', message: 'Credencial ativa não localizada.' });
}

export async function handlePartnerGateApiRoute(req, res, url) {
  const gateMatch = url.pathname.match(/^\/api\/v1\/flights\/([^/]+)\/gate$/i);
  const adminKeys = url.pathname === '/api/admin/partner-api/keys';
  const adminRevoke = url.pathname.match(/^\/api\/admin\/partner-api\/keys\/(\d+)$/);
  if (!gateMatch && !adminKeys && !adminRevoke) return false;

  try {
    const db = await dbPool();
    if (!db) return sendJson(res, 503, { ok: false, code: 'DATABASE_UNAVAILABLE', message: 'Banco de dados indisponível.' }), true;
    if (gateMatch) await handleGateRead(req, res, url, db, decodeURIComponent(gateMatch[1]));
    else if (adminRevoke) await revokeKey(req, res, db, adminRevoke[1]);
    else if (req.method === 'GET') await listKeys(req, res, db);
    else if (req.method === 'POST') await createKey(req, res, db);
    else sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
  } catch (error) {
    const status = Number(error?.status || 500);
    if (error?.rate) writeRateHeaders(res, error.rate);
    sendJson(res, status >= 400 && status < 600 ? status : 500, {
      ok: false,
      code: error?.code || 'PARTNER_API_ERROR',
      message: status >= 500 ? 'O CrewCheck não conseguiu concluir esta operação agora.' : error?.message || 'Solicitação inválida.',
    });
  }
  return true;
}
