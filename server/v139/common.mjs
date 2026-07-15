import crypto from 'node:crypto';

let poolPromise = null;

export function env(name, fallback = '') {
  const value = String(process.env[name] || '').trim();
  return value || fallback;
}

export function flag(name, fallback = false) {
  const value = env(name);
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'sim', 'on', 'enabled'].includes(value.toLowerCase());
}

export function safeEmail(value = '') {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

export function cleanText(value = '', max = 500) {
  return String(value || '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}

export function readBody(req, limit = 36_000_000) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (Buffer.byteLength(raw, 'utf8') > limit) {
        reject(Object.assign(new Error('Conteúdo maior que o limite permitido.'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('JSON inválido.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function authSecret() {
  const secret = env('CREWCHECK_AUTH_SECRET');
  if (!secret && env('NODE_ENV').toLowerCase() === 'production') {
    throw Object.assign(new Error('Autenticação aguardando segredo seguro.'), { status: 503 });
  }
  return secret || 'crewcheck-local-development-secret';
}

export function hmac(value) {
  return crypto.createHmac('sha256', authSecret()).update(String(value)).digest('hex');
}

function b64(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function issueJwt(user) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({
    iss: 'crewcheck',
    aud: 'crewcheck-web',
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    admin: user.admin,
    mustChangePassword: Boolean(user.mustChangePassword),
    iat: now,
    exp: now + 60 * 60 * 24 * 30,
  });
  const signature = crypto.createHmac('sha256', authSecret()).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${signature}`;
}

export function verifyJwt(token = '') {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [head, body, signature] = parts;
  const expected = crypto.createHmac('sha256', authSecret()).update(`${head}.${body}`).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (!actualBuffer.length || actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function requestToken(req) {
  const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) return bearer.trim();
  const match = String(req.headers.cookie || '').match(/(?:^|;\s*)crewcheck_auth_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function setCookie(res, token) {
  const secure = env('NODE_ENV').toLowerCase() === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `crewcheck_auth_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`);
}

export function clearCookie(res) {
  const secure = env('NODE_ENV').toLowerCase() === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `crewcheck_auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

export function adminEmails() {
  return env('CREWCHECK_ADMIN_EMAILS', env('CREWCHECK_ADMIN_EMAIL'))
    .split(',')
    .map(safeEmail)
    .filter(Boolean);
}

export function isAdminEmail(email) {
  return adminEmails().includes(safeEmail(email));
}

function mysqlOptions(connectionString) {
  const parsed = new URL(connectionString);
  const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  const sslDisabled = /^(disable|disabled|false|off)$/i.test(env('MYSQL_SSL_MODE'));
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '') || 'defaultdb'),
    connectionLimit: 5,
    connectTimeout: 6000,
    waitForConnections: true,
    dateStrings: true,
    ssl: local || sslDisabled ? undefined : { rejectUnauthorized: false },
  };
}

export async function pool() {
  const connectionString = env('DATABASE_URL', env('CREWCHECK_DATABASE_URL', env('MYSQL_URL')));
  if (!/^mysql:\/\//i.test(connectionString)) return null;
  if (!poolPromise) {
    poolPromise = import('mysql2/promise')
      .then((module) => {
        const mysql = module.default || module;
        return mysql.createPool(mysqlOptions(connectionString));
      })
      .then(async (db) => {
        await db.query('SELECT 1');
        return db;
      })
      .catch((error) => {
        poolPromise = null;
        console.error('[crewcheck:v139:database]', String(error?.code || 'DB_ERROR'));
        return null;
      });
  }
  return poolPromise;
}

export function passwordDigest(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(password), salt, 64).toString('hex') };
}

export function passwordMatches(password, salt, expected) {
  try {
    const actual = Buffer.from(passwordDigest(password, salt).hash, 'hex');
    const target = Buffer.from(String(expected || ''), 'hex');
    return actual.length === target.length && actual.length > 0 && crypto.timingSafeEqual(actual, target);
  } catch {
    return false;
  }
}

function publicId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  const part = (offset) => Array.from(bytes.subarray(offset, offset + 4), (value) => chars[value % chars.length]).join('');
  return `CC-${part(0)}-${part(4)}`;
}

export async function ensureProfile(db, email, name = '') {
  const [rows] = await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=? LIMIT 1', [email]);
  if (rows[0]) return rows[0];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const id = publicId();
      await db.query(
        'INSERT INTO crewcheck_platform_profiles(email,public_id,display_name,locale,timezone,plan,share_presence) VALUES(?,?,?,?,?,?,0)',
        [email, id, cleanText(name || email.split('@')[0], 120) || 'Tripulante', 'pt-BR', 'America/Sao_Paulo', isAdminEmail(email) ? 'premium_unlimited' : 'free'],
      );
      const [created] = await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=? LIMIT 1', [email]);
      return created[0];
    } catch (error) {
      if (String(error?.code) !== 'ER_DUP_ENTRY') throw error;
    }
  }
  throw Object.assign(new Error('Não consegui gerar o ID CrewCheck.'), { status: 503 });
}

export async function accountUser(db, email, mustChangePassword = false) {
  const profile = await ensureProfile(db, email);
  const admin = isAdminEmail(email);
  const plan = admin ? 'premium_unlimited' : String(profile.plan || 'free');
  return {
    id: profile.public_id,
    name: profile.display_name,
    email,
    role: admin ? 'admin' : plan,
    plan,
    premium: admin || plan !== 'free',
    admin,
    verified: true,
    mustChangePassword,
  };
}

export function issueLogin(res, user, message = 'Login realizado.') {
  const token = issueJwt(user);
  setCookie(res, token);
  return sendJson(res, 200, { ok: true, token, user, message });
}

export async function requireIdentity(req, res) {
  const token = verifyJwt(requestToken(req));
  const email = safeEmail(token?.email);
  if (!email) {
    sendJson(res, 401, { ok: false, message: 'Faça login para continuar.' });
    return null;
  }
  const db = await pool();
  if (!db) {
    sendJson(res, 503, { ok: false, message: 'Banco Aiven indisponível.' });
    return null;
  }
  const profile = await ensureProfile(db, email, token?.name);
  return { db, email, profile, admin: Boolean(token?.admin || isAdminEmail(email)), token };
}

export function dateValue(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
