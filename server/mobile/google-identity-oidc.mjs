import crypto from 'node:crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_IDENTITY_SCOPE = 'openid email profile';
const STATE_TTL_MS = 10 * 60_000;
const CLOCK_SKEW_SECONDS = 60;
let poolPromise = null;
let jwksCache = { expiresAt: 0, keys: [] };

function envAny(names = []) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function publicBaseUrl() {
  return (envAny(['CREWCHECK_PUBLIC_BASE_URL', 'CREWCHECK_APP_URL', 'PUBLIC_BASE_URL']) || 'https://crewcheck.online').replace(/\/+$/, '');
}

function config() {
  const clientId = envAny(['GOOGLE_OAUTH_WEB_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_ID', 'VITE_GOOGLE_CLIENT_ID']);
  const clientSecret = envAny(['GOOGLE_OAUTH_WEB_CLIENT_SECRET', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET']);
  const redirectUri = envAny(['GOOGLE_IDENTITY_REDIRECT_URI']) || `${publicBaseUrl()}/api/auth/google/callback`;
  const encryptionSecret = envAny(['CREWCHECK_AUTH_SECRET']);
  const databaseUrl = envAny(['DATABASE_URL', 'CREWCHECK_DATABASE_URL', 'MYSQL_URL']);
  return {
    clientId,
    clientSecret,
    redirectUri,
    encryptionSecret,
    databaseUrl,
    configured: Boolean(clientId && clientSecret && encryptionSecret && /^mysql:\/\//i.test(databaseUrl) && /^https:\/\//i.test(redirectUri)),
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate', pragma: 'no-cache' });
  res.end(JSON.stringify(payload));
}

function readJson(req, limit = 200_000) {
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

function safeText(value, fallback = '') {
  const text = String(value || '').replace(/[\r\n<>]/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 320);
  return text || fallback;
}

function encryptionKey(secret) {
  return crypto.scryptSync(String(secret || ''), 'crewcheck-google-identity-oidc-v1', 32);
}

function encryptPayload(payload, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decryptPayload(value, secret) {
  const [ivRaw, tagRaw, cipherRaw] = String(value || '').split('.');
  if (!ivRaw || !tagRaw || !cipherRaw) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(cipherRaw, 'base64url')), decipher.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

async function dbPool() {
  const cfg = config();
  if (!cfg.configured) return null;
  if (!poolPromise) {
    poolPromise = (async () => {
      try {
        const mysql = await import('mysql2/promise');
        const createPool = mysql.createPool || mysql.default?.createPool;
        const parsed = new URL(cfg.databaseUrl);
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
        await pool.query(`CREATE TABLE IF NOT EXISTS crewcheck_google_identity_oidc (
          record_key VARCHAR(191) PRIMARY KEY,
          payload LONGTEXT NOT NULL,
          expires_at DATETIME(3) NULL,
          consumed_at DATETIME(3) NULL,
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

function stateKey(state) {
  return `state:${crypto.createHash('sha256').update(String(state || '')).digest('hex')}`;
}

async function storePut(key, payload, expiresAt, consumed = false) {
  const cfg = config();
  const pool = await dbPool();
  if (!pool) return false;
  const encrypted = encryptPayload(payload, cfg.encryptionSecret);
  await pool.query(
    'INSERT INTO crewcheck_google_identity_oidc (record_key, payload, expires_at, consumed_at, updated_at) VALUES (?, ?, ?, ?, NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload), expires_at=VALUES(expires_at), consumed_at=VALUES(consumed_at), updated_at=NOW(3)',
    [key, encrypted, expiresAt ? new Date(expiresAt) : null, consumed ? new Date() : null],
  );
  return true;
}

async function storeGet(key) {
  const cfg = config();
  const pool = await dbPool();
  if (!pool) return null;
  const [rows] = await pool.query('SELECT payload, expires_at, consumed_at FROM crewcheck_google_identity_oidc WHERE record_key=? LIMIT 1', [key]);
  const row = rows?.[0];
  if (!row) return null;
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (expiresAt && expiresAt < Date.now()) return null;
  return { payload: decryptPayload(row.payload, cfg.encryptionSecret), consumed: Boolean(row.consumed_at) };
}

async function storeDelete(key) {
  const pool = await dbPool();
  if (!pool) return false;
  await pool.query('DELETE FROM crewcheck_google_identity_oidc WHERE record_key=?', [key]);
  return true;
}

async function claimOnce(key, payload, expiresAt) {
  const cfg = config();
  const pool = await dbPool();
  if (!pool) return false;
  const encrypted = encryptPayload(payload, cfg.encryptionSecret);
  const [result] = await pool.query(
    'INSERT IGNORE INTO crewcheck_google_identity_oidc (record_key, payload, expires_at, consumed_at, updated_at) VALUES (?, ?, ?, NOW(3), NOW(3))',
    [key, encrypted, new Date(expiresAt)],
  );
  return Number(result?.affectedRows || 0) === 1;
}

function providerLinkKey(providerKey) {
  return `link:google:${providerKey}`;
}

function crewLinkKey(crewcheckSub, secret) {
  const digest = crypto.createHmac('sha256', secret).update(`crewcheck:${String(crewcheckSub || '')}`).digest('hex');
  return `link:crewcheck:${digest}`;
}

function completionKey(state) {
  return `complete:${crypto.createHash('sha256').update(String(state || '')).digest('hex')}`;
}

function sessionIdentity(identity = {}) {
  return {
    sub: String(identity.sub || ''),
    email: String(identity.email || '').trim().toLowerCase(),
    name: safeText(identity.name || ''),
    role: String(identity.role || 'premium'),
    plan: String(identity.plan || 'premium'),
    admin: Boolean(identity.admin),
    emergency: Boolean(identity.emergency),
  };
}

function parseJwtPart(value) {
  return JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'));
}

async function googleJwks(fetchImpl = fetch) {
  if (jwksCache.expiresAt > Date.now() && jwksCache.keys.length) return jwksCache.keys;
  const response = await fetchImpl(GOOGLE_JWKS_URL, { headers: { accept: 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload?.keys)) throw new Error('Não foi possível validar a assinatura da Conta Google.');
  const maxAge = Number(String(response.headers?.get?.('cache-control') || '').match(/max-age=(\d+)/i)?.[1] || 300);
  jwksCache = { keys: payload.keys, expiresAt: Date.now() + Math.max(60, maxAge) * 1000 };
  return jwksCache.keys;
}

export async function verifyGoogleIdToken(idToken, expected, options = {}) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('ID token Google inválido.');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJwtPart(encodedHeader);
  const claims = parseJwtPart(encodedPayload);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Algoritmo do ID token Google inválido.');
  const keys = options.jwks || await googleJwks(options.fetchImpl);
  const jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) throw new Error('Chave de assinatura Google não reconhecida.');
  const verified = crypto.verify('RSA-SHA256', Buffer.from(`${encodedHeader}.${encodedPayload}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(encodedSignature, 'base64url'));
  if (!verified) throw new Error('Assinatura do ID token Google inválida.');
  const now = Number(options.nowSeconds || Math.floor(Date.now() / 1000));
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(String(claims.iss || ''))) throw new Error('Emissor do ID token Google inválido.');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(expected.clientId)) throw new Error('Audiência do ID token Google inválida.');
  if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) < now - CLOCK_SKEW_SECONDS) throw new Error('ID token Google expirado.');
  if (!Number.isFinite(Number(claims.iat)) || Number(claims.iat) > now + CLOCK_SKEW_SECONDS) throw new Error('Data de emissão do ID token Google inválida.');
  if (String(claims.nonce || '') !== String(expected.nonce || '')) throw new Error('Nonce do ID token Google inválido.');
  if (claims.email_verified !== true || !claims.sub || !claims.email) throw new Error('A Conta Google não confirmou a identidade necessária.');
  return claims;
}

async function exchangeCode(code, verifier, cfg) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: 'authorization_code', code_verifier: verifier }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id_token) throw new Error(safeText(payload?.error_description || payload?.error, 'O Google não concluiu a autenticação.'));
  return payload;
}

function callbackHtml(ok, title, message) {
  const safeTitle = safeText(title, ok ? 'Conta Google confirmada' : 'Login Google não concluído');
  const safeMessage = safeText(message);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Cache-Control" content="no-store"><title>${safeTitle}</title></head><body><main><h1>${safeTitle}</h1><p>${safeMessage}</p><p>Volte ao CrewCheck para continuar.</p></main><script>setTimeout(function(){try{window.close()}catch(e){}},1800)</script></body></html>`;
}

function maskEmail(email) {
  const [name = '', domain = ''] = String(email || '').split('@');
  return `${name.slice(0, 2)}${name.length > 2 ? '***' : ''}@${domain}`;
}

async function health(_req, res) {
  const cfg = config();
  const pool = await dbPool();
  return sendJson(res, 200, {
    ok: Boolean(cfg.configured && pool),
    configured: Boolean(cfg.configured && pool),
    scope: GOOGLE_IDENTITY_SCOPE,
    calendarConsentSeparate: true,
    redirectUri: cfg.redirectUri,
    storage: pool ? 'database-encrypted' : 'unavailable',
    message: cfg.configured && pool ? 'Contrato de identidade Google pronto para validação.' : 'Identidade Google indisponível até a configuração segura do servidor e banco.',
  });
}

async function start(req, res, context) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'Use POST para iniciar o login Google.' });
  const cfg = config();
  const pool = await dbPool();
  if (!cfg.configured || !pool) return sendJson(res, 503, { ok: false, code: 'GOOGLE_IDENTITY_NOT_CONFIGURED', message: 'O login Google ainda não está configurado de forma segura.' });
  const body = await readJson(req);
  const intent = body.intent === 'link' ? 'link' : 'login';
  const owner = intent === 'link' ? sessionIdentity(context.identity) : null;
  if (intent === 'link' && (!owner?.sub || !owner?.email)) {
    return sendJson(res, 401, { ok: false, code: 'AUTH_REQUIRED', message: 'Entre no CrewCheck antes de vincular uma Conta Google.' });
  }
  if (intent === 'link' && body.confirmLink !== true) {
    return sendJson(res, 400, { ok: false, code: 'EXPLICIT_LINK_CONFIRMATION_REQUIRED', message: 'Confirme explicitamente o vínculo com esta conta CrewCheck.' });
  }
  const state = crypto.randomBytes(32).toString('base64url');
  const nonce = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const expiresAt = Date.now() + STATE_TTL_MS;
  await storePut(stateKey(state), { status: 'pending', intent, owner, nonce, verifier, createdAt: Date.now() }, expiresAt);
  const query = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: GOOGLE_IDENTITY_SCOPE,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
    include_granted_scopes: 'false',
  });
  return sendJson(res, 200, { ok: true, state, authUrl: `${GOOGLE_AUTH_URL}?${query.toString()}`, expiresAt: new Date(expiresAt).toISOString() });
}

async function callback(_req, res, url) {
  const cfg = config();
  const state = String(url.searchParams.get('state') || '');
  const stored = state ? await storeGet(stateKey(state)) : null;
  if (!stored?.payload || stored.consumed || stored.payload.status !== 'pending') {
    res.writeHead(400, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(callbackHtml(false, 'Login expirado', 'Inicie o login Google novamente no CrewCheck.'));
  }
  const expiresAt = Date.now() + STATE_TTL_MS;
  await storePut(stateKey(state), { ...stored.payload, status: 'exchanging', verifier: '' }, expiresAt, true);
  const oauthError = String(url.searchParams.get('error') || '');
  const code = String(url.searchParams.get('code') || '');
  try {
    if (oauthError) throw new Error(url.searchParams.get('error_description') || oauthError);
    if (!code) throw new Error('Código de autorização Google ausente.');
    const exchanged = await exchangeCode(code, stored.payload.verifier, cfg);
    const claims = await verifyGoogleIdToken(exchanged.id_token, { clientId: cfg.clientId, nonce: stored.payload.nonce });
    const providerKey = crypto.createHmac('sha256', cfg.encryptionSecret).update(`google:${claims.sub}`).digest('hex');
    const existingProviderLink = await storeGet(providerLinkKey(providerKey));
    if (stored.payload.intent === 'link') {
      const owner = sessionIdentity(stored.payload.owner);
      if (!owner.sub || !owner.email) throw new Error('A sessão CrewCheck usada para vincular expirou.');
      if (existingProviderLink?.payload?.user?.sub && existingProviderLink.payload.user.sub !== owner.sub) {
        throw new Error('Esta Conta Google já está vinculada a outra conta CrewCheck.');
      }
      const reverseKey = crewLinkKey(owner.sub, cfg.encryptionSecret);
      const existingCrewLink = await storeGet(reverseKey);
      if (existingCrewLink?.payload?.providerKey && existingCrewLink.payload.providerKey !== providerKey) {
        throw new Error('Esta conta CrewCheck já possui outra Conta Google vinculada. Desvincule-a antes de trocar.');
      }
      const linkedAt = new Date().toISOString();
      await storePut(providerLinkKey(providerKey), { provider: 'google', providerKey, user: owner, linkedAt }, null);
      await storePut(reverseKey, { provider: 'google', providerKey, emailHint: maskEmail(claims.email), linkedAt }, null);
      await storePut(stateKey(state), { status: 'linked', intent: 'link', user: owner, email: String(claims.email).toLowerCase(), linkedAt }, expiresAt, true);
    } else if (existingProviderLink?.payload?.user?.sub) {
      await storePut(stateKey(state), { status: 'ready', intent: 'login', user: sessionIdentity(existingProviderLink.payload.user), email: String(claims.email).toLowerCase(), verifiedAt: Date.now() }, expiresAt, true);
    } else {
      await storePut(stateKey(state), {
        status: 'link_required',
        intent: 'login',
        providerKey,
        email: String(claims.email).toLowerCase(),
        name: safeText(claims.name || ''),
        verifiedAt: Date.now(),
      }, expiresAt, true);
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    const linked = stored.payload.intent === 'link';
    const known = Boolean(existingProviderLink?.payload?.user?.sub);
    return res.end(callbackHtml(true, linked ? 'Conta Google vinculada' : known ? 'Conta Google confirmada' : 'Conta Google ainda não vinculada', linked ? 'O vínculo explícito foi concluído. Volte ao CrewCheck.' : known ? 'Volte ao CrewCheck para concluir o login.' : 'Entre com e-mail e senha uma vez e vincule esta Conta Google nas configurações.'));
  } catch (error) {
    await storePut(stateKey(state), { status: 'failed', error: safeText(error instanceof Error ? error.message : error, 'O login Google falhou.') }, expiresAt, true);
    res.writeHead(400, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return res.end(callbackHtml(false, 'Login Google não concluído', error instanceof Error ? error.message : error));
  }
}

async function status(_req, res, url) {
  const state = String(url.searchParams.get('state') || '');
  const stored = state ? await storeGet(stateKey(state)) : null;
  if (!stored?.payload) return sendJson(res, 404, { ok: false, code: 'GOOGLE_IDENTITY_STATE_EXPIRED', message: 'O login Google expirou. Tente novamente.' });
  const payload = stored.payload;
  return sendJson(res, 200, {
    ok: payload.status !== 'failed',
    state: payload.status,
    linkRequired: payload.status === 'link_required',
    canComplete: payload.status === 'ready',
    linked: payload.status === 'linked',
    emailHint: payload.email ? maskEmail(payload.email) : '',
    message: payload.status === 'link_required'
      ? 'Conta Google confirmada. Entre com e-mail e senha uma vez para autorizar o vínculo.'
      : payload.status === 'ready'
        ? 'Conta Google reconhecida. Conclua o login no CrewCheck.'
        : payload.status === 'linked'
          ? 'Conta Google vinculada explicitamente a esta conta CrewCheck.'
          : payload.error || 'Aguardando a confirmação da Conta Google.',
  });
}

async function complete(req, res, context) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'Use POST para concluir o login Google.' });
  const body = await readJson(req);
  const state = String(body.state || '');
  const stored = state ? await storeGet(stateKey(state)) : null;
  if (!stored?.payload || stored.payload.status !== 'ready' || !stored.payload.user?.sub) {
    return sendJson(res, 409, { ok: false, code: 'GOOGLE_IDENTITY_NOT_READY', message: 'A Conta Google ainda não está pronta para concluir o login.' });
  }
  if (typeof context.issueSession !== 'function') {
    return sendJson(res, 503, { ok: false, code: 'SESSION_ISSUER_UNAVAILABLE', message: 'O emissor de sessão do CrewCheck está indisponível.' });
  }
  const claimed = await claimOnce(completionKey(state), { completedAt: Date.now() }, Date.now() + STATE_TTL_MS);
  if (!claimed) return sendJson(res, 409, { ok: false, code: 'GOOGLE_IDENTITY_ALREADY_COMPLETED', message: 'Este login Google já foi concluído. Inicie outro se necessário.' });
  await storePut(stateKey(state), { ...stored.payload, status: 'completed', completedAt: Date.now() }, Date.now() + STATE_TTL_MS, true);
  return context.issueSession(res, stored.payload.user, 'Login com Google concluído.');
}

async function connection(_req, res, context) {
  const identity = sessionIdentity(context.identity);
  if (!identity.sub) return sendJson(res, 401, { ok: false, code: 'AUTH_REQUIRED', message: 'Entre no CrewCheck para consultar o vínculo Google.' });
  const cfg = config();
  if (!cfg.configured || !(await dbPool())) return sendJson(res, 503, { ok: false, code: 'GOOGLE_IDENTITY_NOT_CONFIGURED', message: 'O vínculo Google está indisponível no servidor.' });
  const reverse = await storeGet(crewLinkKey(identity.sub, cfg.encryptionSecret));
  return sendJson(res, 200, { ok: true, linked: Boolean(reverse?.payload?.providerKey), provider: reverse?.payload?.provider || null, emailHint: reverse?.payload?.emailHint || '', linkedAt: reverse?.payload?.linkedAt || null });
}

async function unlink(req, res, context) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'Use POST para desvincular a Conta Google.' });
  const identity = sessionIdentity(context.identity);
  if (!identity.sub) return sendJson(res, 401, { ok: false, code: 'AUTH_REQUIRED', message: 'Entre no CrewCheck antes de desvincular a Conta Google.' });
  const cfg = config();
  if (!cfg.configured || !(await dbPool())) return sendJson(res, 503, { ok: false, code: 'GOOGLE_IDENTITY_NOT_CONFIGURED', message: 'O vínculo Google está indisponível no servidor.' });
  const reverseKey = crewLinkKey(identity.sub, cfg.encryptionSecret);
  const reverse = await storeGet(reverseKey);
  if (reverse?.payload?.providerKey) await storeDelete(providerLinkKey(reverse.payload.providerKey));
  await storeDelete(reverseKey);
  return sendJson(res, 200, { ok: true, linked: false, message: 'Conta Google desvinculada. Sua conta e escala CrewCheck foram preservadas.' });
}

export async function handleGoogleIdentityRoute(req, res, url, context = {}) {
  if (!String(url?.pathname || '').startsWith('/api/auth/google')) return false;
  const pathname = String(url.pathname || '');
  if (pathname === '/api/auth/google/health') await health(req, res);
  else if (pathname === '/api/auth/google/start') await start(req, res, context);
  else if (pathname === '/api/auth/google/callback') await callback(req, res, url);
  else if (pathname === '/api/auth/google/status') await status(req, res, url);
  else if (pathname === '/api/auth/google/complete') await complete(req, res, context);
  else if (pathname === '/api/auth/google/connection') await connection(req, res, context);
  else if (pathname === '/api/auth/google/unlink') await unlink(req, res, context);
  else sendJson(res, 404, { ok: false, message: 'Rota de identidade Google não encontrada.' });
  return true;
}
