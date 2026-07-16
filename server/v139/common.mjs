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

export function readBody(req, limit = 1_000_000) {
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

export function secureCompare(a, b) {
  try {
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));
    return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
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
    connectionLimit: 6,
    connectTimeout: 8000,
    waitForConnections: true,
    dateStrings: true,
    ssl: local || sslDisabled ? undefined : { rejectUnauthorized: false },
  };
}

export async function dbPool() {
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

export function parseJsonColumn(value, fallback = null) {
  if (value && typeof value === 'object') return value;
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
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

export function authSecret() {
  const secret = env('CREWCHECK_AUTH_SECRET', env('JWT_SECRET'));
  if (!secret) throw Object.assign(new Error('Segredo de autenticação não configurado.'), { status: 503 });
  return secret;
}

function b64Json(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function issueJwt(user) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64Json({ alg: 'HS256', typ: 'JWT' });
  const body = b64Json({
    iss: 'crewcheck',
    aud: 'crewcheck-web',
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    admin: Boolean(user.admin),
    mustChangePassword: Boolean(user.mustChangePassword),
    iat: now,
    exp: now + 60 * 60 * 24 * 30,
  });
  const signature = crypto
    .createHmac('sha256', authSecret())
    .update(`${head}.${body}`)
    .digest('base64url');
  return `${head}.${body}.${signature}`;
}

export function verifyJwt(token = '') {
  const parts = String(token || '').trim().split('.');
  if (parts.length !== 3) return null;
  const [head, body, signature] = parts;
  const expected = crypto
    .createHmac('sha256', authSecret())
    .update(`${head}.${body}`)
    .digest('base64url');
  if (!secureCompare(signature, expected)) return null;
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

export function setAuthCookie(res, token) {
  const secure = env('NODE_ENV').toLowerCase() === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `crewcheck_auth_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`,
  );
}

export function clearAuthCookie(res) {
  const secure = env('NODE_ENV').toLowerCase() === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `crewcheck_auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function publicId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  const part = (offset) => Array.from(
    bytes.subarray(offset, offset + 4),
    (value) => chars[value % chars.length],
  ).join('');
  return `CC-${part(0)}-${part(4)}`;
}

export async function ensureProfile(db, email, name = '') {
  const [rows] = await db.query(
    'SELECT * FROM crewcheck_platform_profiles WHERE email=? LIMIT 1',
    [email],
  );
  if (rows[0]) return rows[0];

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const id = publicId();
      await db.query(
        `INSERT INTO crewcheck_platform_profiles
         (email,public_id,display_name,locale,timezone,plan,share_presence)
         VALUES(?,?,?,?,?,?,0)`,
        [
          email,
          id,
          cleanText(name || email.split('@')[0], 120) || 'Tripulante',
          'pt-BR',
          'America/Sao_Paulo',
          isAdminEmail(email) ? 'premium_unlimited' : 'free',
        ],
      );
      const [created] = await db.query(
        'SELECT * FROM crewcheck_platform_profiles WHERE email=? LIMIT 1',
        [email],
      );
      return created[0];
    } catch (error) {
      if (String(error?.code) !== 'ER_DUP_ENTRY') throw error;
    }
  }
  throw Object.assign(new Error('Não consegui gerar o ID CrewCheck.'), { status: 503 });
}

export async function userFromAccount(db, email, mustChangePassword = false) {
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
    mustChangePassword: Boolean(mustChangePassword),
  };
}

export async function requireIdentity(req, res) {
  let payload = null;
  try {
    payload = verifyJwt(requestToken(req));
  } catch (error) {
    sendJson(res, Number(error?.status || 503), { ok: false, message: error?.message || 'Autenticação indisponível.' });
    return null;
  }
  const email = safeEmail(payload?.email);
  if (!email) {
    sendJson(res, 401, { ok: false, message: 'Faça login para continuar.' });
    return null;
  }
  const db = await dbPool();
  if (!db) {
    sendJson(res, 503, { ok: false, message: 'Banco Aiven indisponível.' });
    return null;
  }
  const profile = await ensureProfile(db, email, payload?.name);
  return { db, email, profile, admin: Boolean(payload?.admin || isAdminEmail(email)), payload };
}
