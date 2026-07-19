import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned';
const GOOGLE_API = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const FALLBACK_CLIENT_ID = '777637106343-1s0tejmffsrl6253hl6qp03idfu1mphf.apps.googleusercontent.com';
const STORE_FILE = path.join(process.cwd(), '.crewcheck-google-oauth-store.json');
const STATE_TTL_MS = 10 * 60_000;
const TOKEN_REFRESH_SKEW_MS = 90_000;
let poolPromise = null;

function envAny(names = []) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function publicBaseUrl() {
  return (envAny(['CREWCHECK_PUBLIC_BASE_URL', 'CREWCHECK_APP_URL', 'PUBLIC_BASE_URL', 'TELEGRAM_PUBLIC_BASE_URL']) || 'https://crewcheck.online').replace(/\/+$/, '');
}

function oauthConfig() {
  const clientId = envAny(['GOOGLE_OAUTH_WEB_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_ID', 'VITE_GOOGLE_CLIENT_ID']) || FALLBACK_CLIENT_ID;
  const clientSecret = envAny(['GOOGLE_OAUTH_WEB_CLIENT_SECRET', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET']);
  const redirectUri = envAny(['GOOGLE_OAUTH_REDIRECT_URI', 'GOOGLE_CALENDAR_REDIRECT_URI']) || `${publicBaseUrl()}/api/google-calendar/oauth/callback`;
  const encryptionSecret = envAny(['CREWCHECK_GOOGLE_TOKEN_ENCRYPTION_KEY', 'CREWCHECK_DATA_ENCRYPTION_KEY', 'CREWCHECK_AUTH_SECRET']);
  return {
    clientId,
    clientSecret,
    redirectUri,
    encryptionSecret,
    configured: Boolean(clientId && clientSecret && encryptionSecret && /^https:\/\//i.test(redirectUri)),
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, no-cache, must-revalidate',
    pragma: 'no-cache',
  });
  res.end(JSON.stringify(payload));
}

function readJson(req, limit = 1_500_000) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > limit) req.destroy();
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function safeMessage(value, fallback = 'Não foi possível concluir a conexão com o Google Calendar.') {
  const message = String(value || '').replace(/[\r\n<>]/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 500);
  return message || fallback;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function identityKey(identity = {}) {
  const source = String(identity.sub || identity.email || '').trim().toLowerCase();
  return source ? sha256(`crewcheck-google:${source}`) : '';
}

function encryptionKey(secret) {
  return crypto.scryptSync(String(secret || ''), 'crewcheck-google-calendar-oauth-v1', 32);
}

function encryptPayload(payload, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decryptPayload(value, secret) {
  const [ivRaw, tagRaw, cipherRaw] = String(value || '').split('.');
  if (!ivRaw || !tagRaw || !cipherRaw) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    const clear = Buffer.concat([decipher.update(Buffer.from(cipherRaw, 'base64url')), decipher.final()]).toString('utf8');
    return JSON.parse(clear);
  } catch {
    return null;
  }
}

function readFileStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeFileStore(store) {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

async function dbPool() {
  const connectionString = envAny(['DATABASE_URL', 'CREWCHECK_DATABASE_URL', 'MYSQL_URL']);
  if (!/^mysql:\/\//i.test(connectionString)) return null;
  if (!poolPromise) {
    poolPromise = (async () => {
      try {
        const mysql = await import('mysql2/promise');
        const createPool = mysql.createPool || mysql.default?.createPool;
        if (!createPool) return null;
        const parsed = new URL(connectionString);
        const pool = createPool({
          host: parsed.hostname,
          port: Number(parsed.port || 3306),
          user: decodeURIComponent(parsed.username),
          password: decodeURIComponent(parsed.password),
          database: parsed.pathname.replace(/^\//, '') || 'defaultdb',
          connectionLimit: 3,
          connectTimeout: 4500,
          waitForConnections: true,
          ssl: { rejectUnauthorized: false },
        });
        await pool.query(`CREATE TABLE IF NOT EXISTS crewcheck_google_oauth_store (
          record_key VARCHAR(191) PRIMARY KEY,
          payload LONGTEXT NOT NULL,
          expires_at DATETIME(3) NULL,
          updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        return pool;
      } catch {
        return null;
      }
    })();
  }
  return poolPromise;
}

async function storePut(key, payload, expiresAt = null) {
  const cfg = oauthConfig();
  const encrypted = encryptPayload(payload, cfg.encryptionSecret);
  const pool = await dbPool();
  if (pool) {
    try {
      await pool.query(
        'INSERT INTO crewcheck_google_oauth_store (record_key, payload, expires_at, updated_at) VALUES (?, ?, ?, NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload), expires_at=VALUES(expires_at), updated_at=NOW(3)',
        [key, encrypted, expiresAt ? new Date(expiresAt) : null],
      );
      return true;
    } catch {}
  }
  const store = readFileStore();
  store[key] = { payload: encrypted, expiresAt: expiresAt || null, updatedAt: new Date().toISOString() };
  return writeFileStore(store);
}

async function storeGet(key) {
  const cfg = oauthConfig();
  const pool = await dbPool();
  if (pool) {
    try {
      const [rows] = await pool.query('SELECT payload, expires_at FROM crewcheck_google_oauth_store WHERE record_key=? LIMIT 1', [key]);
      const row = rows?.[0];
      if (!row) return null;
      const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
      if (expiresAt && expiresAt < Date.now()) {
        await storeDelete(key);
        return null;
      }
      return decryptPayload(row.payload, cfg.encryptionSecret);
    } catch {}
  }
  const store = readFileStore();
  const row = store[key];
  if (!row) return null;
  const expiresAt = row.expiresAt ? new Date(row.expiresAt).getTime() : 0;
  if (expiresAt && expiresAt < Date.now()) {
    delete store[key];
    writeFileStore(store);
    return null;
  }
  return decryptPayload(row.payload, cfg.encryptionSecret);
}

async function storeDelete(key) {
  const pool = await dbPool();
  if (pool) {
    try { await pool.query('DELETE FROM crewcheck_google_oauth_store WHERE record_key=?', [key]); } catch {}
  }
  const store = readFileStore();
  if (Object.prototype.hasOwnProperty.call(store, key)) {
    delete store[key];
    writeFileStore(store);
  }
}

function stateStoreKey(state) {
  return `state:${sha256(state)}`;
}

function tokenStoreKey(userKey) {
  return `token:${userKey}`;
}

function requireIdentity(res, context = {}) {
  const identity = context.identity || null;
  if (!identity && context.authRequired !== false) {
    sendJson(res, 401, { ok: false, code: 'AUTH_REQUIRED', message: 'Entre novamente no CrewCheck antes de conectar o Google Calendar.' });
    return null;
  }
  const userKey = identityKey(identity || { sub: 'anonymous-local' });
  if (!userKey) {
    sendJson(res, 401, { ok: false, code: 'AUTH_REQUIRED', message: 'Não foi possível identificar sua sessão do CrewCheck.' });
    return null;
  }
  return { identity, userKey };
}

function callbackHtml({ ok, title, message }) {
  const safeTitle = safeMessage(title, ok ? 'Google Calendar conectado' : 'Conexão não concluída');
  const safeBody = safeMessage(message);
  const accent = ok ? '#22c55e' : '#ef4444';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Cache-Control" content="no-store"><title>${safeTitle}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,#dff7ff,#eee9ff 55%,#f8fafc);font-family:Inter,system-ui,sans-serif;color:#071d33}.card{width:min(560px,100%);box-sizing:border-box;background:#fff;border:1px solid #dbe5ef;border-radius:28px;padding:30px;box-shadow:0 24px 80px rgba(15,23,42,.18)}.mark{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;background:${accent};color:#fff;font-size:30px;font-weight:900}h1{margin:18px 0 10px;font-size:28px}p{line-height:1.55;color:#475569}small{display:block;margin-top:18px;color:#64748b}</style></head><body><main class="card"><div class="mark">${ok ? '✓' : '!'}</div><h1>${safeTitle}</h1><p>${safeBody}</p><small>Você já pode voltar ao CrewCheck. Esta janela pode ser fechada.</small></main><script>setTimeout(function(){try{window.close()}catch(e){}},1800);</script></body></html>`;
}

async function exchangeAuthorizationCode(code, verifier, cfg) {
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    const message = payload?.error_description || payload?.error || `Google OAuth retornou erro ${response.status}.`;
    throw new Error(safeMessage(message));
  }
  return payload;
}

async function refreshAccessToken(userKey, token, cfg) {
  if (!token?.refresh_token) throw new Error('A autorização do Google expirou. Conecte novamente para continuar.');
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token',
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    await storeDelete(tokenStoreKey(userKey));
    throw new Error(safeMessage(payload?.error_description || payload?.error, 'A autorização do Google foi revogada. Conecte novamente.'));
  }
  const next = {
    ...token,
    ...payload,
    refresh_token: payload.refresh_token || token.refresh_token,
    expires_at: Date.now() + Math.max(60, Number(payload.expires_in || 3600)) * 1000,
    updated_at: new Date().toISOString(),
  };
  await storePut(tokenStoreKey(userKey), next);
  return next;
}

async function validToken(userKey, forceRefresh = false) {
  const cfg = oauthConfig();
  const token = await storeGet(tokenStoreKey(userKey));
  if (!token) throw new Error('Google Calendar ainda não está conectado a esta conta do CrewCheck.');
  if (!forceRefresh && token.access_token && Number(token.expires_at || 0) > Date.now() + TOKEN_REFRESH_SKEW_MS) return token;
  return refreshAccessToken(userKey, token, cfg);
}

function allowedGooglePath(value) {
  const pathValue = String(value || '');
  return /^\/calendars\/primary\/events(?:\/[A-Za-z0-9_-]+)?(?:\?[A-Za-z0-9%_.~!$&'()*+,;=:@/?-]*)?$/.test(pathValue);
}

async function handleHealth(_req, res) {
  const cfg = oauthConfig();
  const pool = await dbPool();
  return sendJson(res, 200, {
    ok: cfg.configured,
    configured: cfg.configured,
    scope: GOOGLE_SCOPE,
    redirectUri: cfg.redirectUri,
    clientIdHint: cfg.clientId ? `${cfg.clientId.slice(0, 14)}…${cfg.clientId.slice(-24)}` : '',
    storage: pool ? 'database-encrypted' : 'encrypted-local-fallback',
    message: cfg.configured
      ? 'Ponte segura do Google Calendar configurada.'
      : 'Configure GOOGLE_OAUTH_WEB_CLIENT_SECRET e CREWCHECK_AUTH_SECRET no servidor.',
  });
}

async function handleStart(req, res, context) {
  const auth = requireIdentity(res, context);
  if (!auth) return;
  const cfg = oauthConfig();
  if (!cfg.configured) {
    return sendJson(res, 503, {
      ok: false,
      code: 'GOOGLE_OAUTH_SERVER_NOT_CONFIGURED',
      message: 'A conexão segura do Google Calendar ainda precisa do Client Secret no servidor.',
      redirectUri: cfg.redirectUri,
    });
  }
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const expiresAt = Date.now() + STATE_TTL_MS;
  await storePut(stateStoreKey(state), {
    status: 'pending',
    userKey: auth.userKey,
    verifier,
    createdAt: Date.now(),
    expiresAt,
  }, expiresAt);
  const query = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'false',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return sendJson(res, 200, {
    ok: true,
    state,
    authUrl: `${GOOGLE_AUTH_URL}?${query.toString()}`,
    expiresAt: new Date(expiresAt).toISOString(),
    redirectUri: cfg.redirectUri,
    message: 'Abra a autorização no navegador seguro e volte ao CrewCheck quando concluir.',
  });
}

async function handleCallback(_req, res, url) {
  const cfg = oauthConfig();
  const state = String(url.searchParams.get('state') || '');
  const record = state ? await storeGet(stateStoreKey(state)) : null;
  if (!state || !record) {
    res.writeHead(400, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(callbackHtml({ ok: false, title: 'Conexão expirada', message: 'Volte ao CrewCheck e inicie a conexão com o Google Calendar novamente.' }));
  }
  const oauthError = String(url.searchParams.get('error') || '');
  if (oauthError) {
    const message = safeMessage(url.searchParams.get('error_description') || oauthError, 'A autorização foi cancelada ou recusada.');
    await storePut(stateStoreKey(state), { ...record, status: 'failed', error: message }, Date.now() + STATE_TTL_MS);
    res.writeHead(400, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(callbackHtml({ ok: false, title: 'Google Calendar não conectado', message }));
  }
  const code = String(url.searchParams.get('code') || '');
  if (!code) {
    res.writeHead(400, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(callbackHtml({ ok: false, title: 'Código de autorização ausente', message: 'Volte ao CrewCheck e tente conectar novamente.' }));
  }
  try {
    const exchanged = await exchangeAuthorizationCode(code, record.verifier, cfg);
    const existing = await storeGet(tokenStoreKey(record.userKey));
    const token = {
      access_token: exchanged.access_token,
      refresh_token: exchanged.refresh_token || existing?.refresh_token || '',
      token_type: exchanged.token_type || 'Bearer',
      scope: exchanged.scope || GOOGLE_SCOPE,
      expires_at: Date.now() + Math.max(60, Number(exchanged.expires_in || 3600)) * 1000,
      obtained_at: new Date().toISOString(),
    };
    if (!token.refresh_token) throw new Error('O Google não retornou autorização permanente. Revogue o acesso antigo e conecte novamente.');
    await storePut(tokenStoreKey(record.userKey), token);
    await storePut(stateStoreKey(state), { ...record, verifier: '', status: 'connected', connectedAt: Date.now() }, Date.now() + STATE_TTL_MS);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(callbackHtml({ ok: true, title: 'Google Calendar conectado', message: 'A autorização foi concluída com segurança. O CrewCheck já pode sincronizar sua escala.' }));
  } catch (error) {
    const message = safeMessage(error instanceof Error ? error.message : error);
    await storePut(stateStoreKey(state), { ...record, verifier: '', status: 'failed', error: message }, Date.now() + STATE_TTL_MS);
    res.writeHead(400, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(callbackHtml({ ok: false, title: 'Falha ao conectar o Google Calendar', message }));
  }
}

async function handleStatus(_req, res, url, context) {
  const auth = requireIdentity(res, context);
  if (!auth) return;
  const state = String(url.searchParams.get('state') || '');
  const stateRecord = state ? await storeGet(stateStoreKey(state)) : null;
  if (stateRecord && stateRecord.userKey !== auth.userKey) {
    return sendJson(res, 403, { ok: false, code: 'STATE_OWNER_MISMATCH', message: 'Esta autorização pertence a outra sessão.' });
  }
  const token = await storeGet(tokenStoreKey(auth.userKey));
  const connected = Boolean(token?.refresh_token || (token?.access_token && Number(token?.expires_at || 0) > Date.now()));
  return sendJson(res, 200, {
    ok: true,
    configured: oauthConfig().configured,
    connected,
    state: stateRecord?.status || (connected ? 'connected' : 'idle'),
    error: stateRecord?.error || '',
    scope: token?.scope || GOOGLE_SCOPE,
    updatedAt: token?.obtained_at || token?.updated_at || null,
    message: connected ? 'Google Calendar conectado.' : stateRecord?.status === 'failed' ? stateRecord.error : 'Aguardando autorização do Google Calendar.',
  });
}

async function handleProxy(req, res, context) {
  const auth = requireIdentity(res, context);
  if (!auth) return;
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'Use POST para sincronizar o Google Calendar.' });
  const body = await readJson(req);
  const googlePath = String(body.path || '');
  const method = String(body.method || 'GET').toUpperCase();
  if (!allowedGooglePath(googlePath)) return sendJson(res, 403, { ok: false, code: 'GOOGLE_PATH_BLOCKED', message: 'O CrewCheck permite somente eventos do calendário principal.' });
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) return sendJson(res, 405, { ok: false, message: 'Operação não permitida no Google Calendar.' });
  try {
    let token = await validToken(auth.userKey);
    const requestOptions = {
      method,
      headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/json', ...(method === 'GET' || method === 'DELETE' ? {} : { 'content-type': 'application/json' }) },
      body: method === 'GET' || method === 'DELETE' ? undefined : (typeof body.body === 'string' ? body.body : JSON.stringify(body.body || {})),
    };
    let response = await fetch(`${GOOGLE_API}${googlePath}`, requestOptions);
    if (response.status === 401) {
      token = await validToken(auth.userKey, true);
      response = await fetch(`${GOOGLE_API}${googlePath}`, { ...requestOptions, headers: { ...requestOptions.headers, authorization: `Bearer ${token.access_token}` } });
    }
    const raw = await response.text().catch(() => '');
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw ? { message: raw } : null; }
    if (!response.ok) {
      const message = safeMessage(payload?.error?.message || payload?.error_description || payload?.message, `Google Calendar retornou erro ${response.status}.`);
      return sendJson(res, response.status, { ok: false, code: 'GOOGLE_CALENDAR_API_ERROR', status: response.status, message, details: payload?.error?.status || '' });
    }
    return sendJson(res, 200, { ok: true, status: response.status, data: payload });
  } catch (error) {
    return sendJson(res, 401, { ok: false, code: 'GOOGLE_RECONNECT_REQUIRED', message: safeMessage(error instanceof Error ? error.message : error) });
  }
}

async function handleDisconnect(_req, res, context) {
  const auth = requireIdentity(res, context);
  if (!auth) return;
  const token = await storeGet(tokenStoreKey(auth.userKey));
  const value = token?.refresh_token || token?.access_token || '';
  if (value) {
    try {
      await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(value)}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    } catch {}
  }
  await storeDelete(tokenStoreKey(auth.userKey));
  return sendJson(res, 200, { ok: true, connected: false, message: 'Google Calendar desconectado do CrewCheck.' });
}

export function googleCalendarOAuthReliability() {
  const cfg = oauthConfig();
  return {
    id: 'google-calendar-oauth',
    label: 'Google Calendar OAuth',
    ok: cfg.configured,
    configured: cfg.configured,
    keys: ['GOOGLE_OAUTH_WEB_CLIENT_ID', 'GOOGLE_OAUTH_WEB_CLIENT_SECRET', 'CREWCHECK_AUTH_SECRET'],
    message: cfg.configured ? 'Conexão segura por navegador configurada.' : 'Configure Client ID, Client Secret e segredo de criptografia.',
  };
}

export async function handleGoogleCalendarOAuthRoute(req, res, url, context = {}) {
  if (!String(url?.pathname || '').startsWith('/api/google-calendar/oauth')) return false;
  const pathname = String(url.pathname || '');
  if (pathname === '/api/google-calendar/oauth/health') await handleHealth(req, res);
  else if (pathname === '/api/google-calendar/oauth/start') await handleStart(req, res, context);
  else if (pathname === '/api/google-calendar/oauth/callback') await handleCallback(req, res, url);
  else if (pathname === '/api/google-calendar/oauth/status') await handleStatus(req, res, url, context);
  else if (pathname === '/api/google-calendar/oauth/proxy') await handleProxy(req, res, context);
  else if (pathname === '/api/google-calendar/oauth/disconnect') await handleDisconnect(req, res, context);
  else sendJson(res, 404, { ok: false, message: 'Rota do Google Calendar não encontrada.' });
  return true;
}
