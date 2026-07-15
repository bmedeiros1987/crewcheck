import crypto from 'node:crypto';

const APP_VERSION = '13.8.8';
const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const SUPPORTED_LOCALES = new Set(['pt-BR', 'en-US', 'es-ES']);
const PLAN_IDS = new Set(['free', 'premium_monthly', 'premium_annual', 'premium_unlimited']);
const GOOGLE_PLAY_PRODUCTS = new Map([
  ['crewcheck_premium_monthly', 'premium_monthly'],
  ['crewcheck_premium_annual', 'premium_annual'],
]);
const state = { poolPromise: null, databaseFailure: null, schemaReport: null, googleToken: null, googleTokenExpiresAt: 0 };

const PLAN_CATALOG = [
  {
    id: 'free',
    name: 'CrewCheck Essencial',
    cycle: 'Gratuito',
    priceEnv: '',
    defaultPrice: 0,
    callLimitEnv: 'CREWCHECK_FREE_CALL_LIMIT',
    callLimit: 1,
    features: [
      'Importação e leitura da escala oficial',
      'Próxima programação, escala completa e mapa do mês',
      'Conformidade preventiva e carga de trabalho',
      'Diárias e salário com parâmetros informados pelo usuário',
      'PDF, ICS e envio de relatório pelo CrewCheck',
      'Concierge Telegram por texto e 1 teste de ligação por mês',
    ],
  },
  {
    id: 'premium_monthly',
    name: 'CrewCheck Premium Mensal',
    cycle: 'Mensal, renovação automática',
    priceEnv: 'CREWCHECK_PREMIUM_MONTHLY_BRL',
    defaultPrice: 19.9,
    callLimitEnv: 'CREWCHECK_PREMIUM_CALL_LIMIT',
    callLimit: 20,
    features: [
      'Tudo do Essencial',
      'Radar, portão e terminal quando disponíveis',
      'Saída Inteligente, meteorologia e rotinas conectadas',
      'Hotéis, aprendizado de apresentação e academias parceiras',
      'Comparação de escala, visitantes e chat interno',
      '20 ligações do despertador por mês',
      'Sincronização e compartilhamentos revogáveis em banco',
    ],
  },
  {
    id: 'premium_annual',
    name: 'CrewCheck Premium Anual',
    cycle: 'Anual, renovação automática',
    priceEnv: 'CREWCHECK_PREMIUM_ANNUAL_BRL',
    defaultPrice: 179.9,
    callLimitEnv: 'CREWCHECK_PREMIUM_CALL_LIMIT',
    callLimit: 20,
    features: [
      'Todos os recursos do Premium Mensal',
      'Economia anual exibida antes da compra',
      '20 ligações do despertador por mês',
      'Prioridade de restauração e sincronização de escala',
    ],
  },
  {
    id: 'premium_unlimited',
    name: 'Premium Unlimited',
    cycle: 'Vitalício, somente concessão administrativa',
    priceEnv: '',
    defaultPrice: 0,
    callLimitEnv: 'CREWCHECK_UNLIMITED_CALL_LIMIT',
    callLimit: 60,
    features: [
      'Todos os recursos Premium sem cobrança recorrente',
      'Acesso vitalício para contas autorizadas',
      '60 ligações mensais de uso justo para proteger custos externos',
    ],
  },
];

function env(name, fallback = '') {
  const value = String(process.env[name] || '').trim();
  return value || fallback;
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req, limit = 2_500_000) {
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
      try { resolve(JSON.parse(raw)); }
      catch { reject(Object.assign(new Error('JSON inválido.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function safeEmail(value = '') {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function normalizeText(value, max = 240) {
  return String(value || '').normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function safeEqual(left = '', right = '') {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function sha256(value = '') {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function retiredTokenHash() {
  return sha256(crypto.randomBytes(32).toString('base64url'));
}

function b64Json(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function authSecret() {
  const configured = env('CREWCHECK_AUTH_SECRET');
  if (configured) return configured;
  if (env('NODE_ENV').toLowerCase() === 'production') {
    throw Object.assign(new Error('Autenticação aguardando segredo seguro do servidor.'), { status: 503, code: 'AUTH_SECRET_REQUIRED' });
  }
  return 'crewcheck-local-development-secret';
}

function verifyJwt(token = '') {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [head, body, signature] = parts;
  const expected = crypto.createHmac('sha256', authSecret()).update(`${head}.${body}`).digest('base64url');
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function issueVisitorJwt(visitor) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64Json({ alg: 'HS256', typ: 'JWT' });
  const body = b64Json({
    iss: 'crewcheck', aud: 'crewcheck-visitor', sub: visitor.id,
    visitorId: visitor.id, ownerEmail: visitor.owner_email, email: visitor.email,
    role: 'visitor', iat: now, exp: now + 60 * 60 * 24 * 30,
  });
  const signature = crypto.createHmac('sha256', authSecret()).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${signature}`;
}

function requestToken(req, cookieName = 'crewcheck_auth_token') {
  const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer) return bearer.trim();
  const cookie = String(req.headers.cookie || '');
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function mainIdentity(req, body = {}) {
  const token = verifyJwt(requestToken(req));
  const authRequired = env('CREWCHECK_AUTH_REQUIRED', 'true').toLowerCase() !== 'false';
  const fallbackEmail = !authRequired ? safeEmail(req.headers['x-crewcheck-email'] || body.email) : '';
  const email = safeEmail(token?.email) || fallbackEmail;
  const adminEmails = env('CREWCHECK_ADMIN_EMAILS', env('CREWCHECK_ADMIN_EMAIL', 'bmedeiros1987@gmail.com'))
    .split(',').map(safeEmail).filter(Boolean);
  return {
    token,
    email,
    name: normalizeText(token?.name || body.name || email.split('@')[0] || 'Tripulante', 120),
    role: normalizeText(token?.role || 'free', 40).toLowerCase(),
    plan: normalizeText(token?.plan || '', 40).toLowerCase(),
    locale: normalizeLocale(req.headers['x-crewcheck-locale'] || 'pt-BR'),
    timezone: normalizeTimezone(req.headers['x-crewcheck-timezone'] || DEFAULT_TIMEZONE),
    admin: Boolean(token?.admin || adminEmails.includes(email)),
    authenticated: Boolean(email),
  };
}

function visitorIdentity(req) {
  const token = verifyJwt(requestToken(req, 'crewcheck_visitor_token'));
  if (!token || token.aud !== 'crewcheck-visitor' || token.role !== 'visitor') return null;
  return token;
}

function databaseConnectionString() {
  for (const name of ['DATABASE_URL', 'CREWCHECK_DATABASE_URL', 'MYSQL_URL']) {
    const value = env(name);
    if (/^mysql:\/\//i.test(value)) return value;
  }
  return '';
}

function databaseDialect(connectionString = databaseConnectionString()) {
  return /^mysql:\/\//i.test(connectionString) ? 'mysql' : '';
}

const PLATFORM_CORE_TABLES = [
  'crewcheck_platform_profiles',
  'crewcheck_platform_subscriptions',
  'crewcheck_platform_usage',
];

const PLATFORM_OPTIONAL_TABLES = [
  'crewcheck_platform_rosters',
  'crewcheck_platform_hotel_rules',
  'crewcheck_platform_stays',
  'crewcheck_platform_shares',
  'crewcheck_platform_visitors',
  'crewcheck_platform_connections',
  'crewcheck_platform_chat_threads',
  'crewcheck_platform_chat_messages',
  'crewcheck_platform_gym_checkins',
  'crewcheck_platform_webhook_events',
  'crewcheck_platform_emergencies',
  'crewcheck_telegram_state',
  'crewcheck_platform_auth_attempts',
  'crewcheck_platform_addresses',
  'crewcheck_platform_user_hotels',
  'crewcheck_platform_gym_preferences',
  'crewcheck_platform_routine_preferences',
  'crewcheck_platform_parking_positions',
  'crewcheck_platform_finance_configs',
  'crewcheck_platform_flight_follows',
  'crewcheck_platform_swap_analyses',
  'crewcheck_platform_schedule_comparisons',
  'crewcheck_platform_terms',
  'crewcheck_platform_terms_acceptances',
];


const MYSQL_JSON_COLUMNS = new Set(['metadata', 'roster', 'compliance', 'gym', 'permissions', 'payload', 'channels', 'opening_hours', 'community_status', 'activities', 'constraints', 'salary_rules', 'per_diem_rules', 'last_snapshot', 'offered_duty', 'requested_duty', 'result']);
const MYSQL_BOOLEAN_COLUMNS = new Set([
  'share_presence', 'cancel_at_period_end', 'active', 'share_same_hotel',
  'share_with_visitors', 'must_change_password', 'is_default', 'favorite',
]);

function normalizeMysqlRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const normalized = { ...row };
    for (const [key, value] of Object.entries(normalized)) {
      if (MYSQL_JSON_COLUMNS.has(key) && typeof value === 'string') {
        try { normalized[key] = JSON.parse(value); } catch {}
      }
      if (MYSQL_BOOLEAN_COLUMNS.has(key)) normalized[key] = Boolean(value);
    }
    return normalized;
  });
}

function mysqlStatement(sql, params = []) {
  const values = [];
  const statement = String(sql).replace(/\$(\d+)/g, (_match, index) => {
    const value = params[Number(index) - 1];
    values.push(value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)
      ? JSON.stringify(value)
      : value);
    return '?';
  });
  return { statement, values };
}

function mysqlAdapter(native, release = null) {
  const adapter = {
    dialect: 'mysql',
    async query(sql, params = []) {
      const prepared = mysqlStatement(sql, params);
      const [result] = await native.query(prepared.statement, prepared.values);
      if (Array.isArray(result)) return { rows: normalizeMysqlRows(result), rowCount: result.length };
      return { rows: [], rowCount: Number(result?.affectedRows || 0), insertId: result?.insertId || null };
    },
    async connect() {
      if (typeof native.getConnection !== 'function') return adapter;
      const connection = await native.getConnection();
      return mysqlAdapter(connection, () => connection.release());
    },
    release() {
      if (release) release();
    },
  };
  return adapter;
}

function mysqlPoolOptions(connectionString) {
  const parsed = new URL(connectionString);
  const sslDisabled = /^(?:disable|disabled|false|off)$/i.test(env('MYSQL_SSL_MODE'));
  const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '') || 'defaultdb'),
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 5000,
    dateStrings: true,
    decimalNumbers: true,
    ssl: local || sslDisabled ? undefined : { rejectUnauthorized: false },
  };
}

async function platformSchemaReport(db) {
  const tables = [...PLATFORM_CORE_TABLES, ...PLATFORM_OPTIONAL_TABLES];
  const requiredColumns = {
    crewcheck_platform_profiles: ['email', 'public_id', 'display_name', 'locale', 'timezone', 'plan', 'share_presence'],
    crewcheck_platform_shares: ['id', 'owner_email', 'token_hash', 'kind', 'permissions', 'expires_at', 'created_at'],
  };
  const tableParams = tables.map((_table, index) => `$${index + 1}`).join(',');
  const result = await db.query(
    `SELECT TABLE_NAME AS table_name FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${tableParams})`,
    tables,
  );
  const ready = new Set(result.rows.map((row) => row.table_name));
  const columnTables = Object.keys(requiredColumns);
  const columnParams = columnTables.map((_table, index) => `$${index + 1}`).join(',');
  const columnResult = await db.query(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${columnParams})`,
    columnTables,
  );
  const columns = new Set(columnResult.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missingProfileColumns = requiredColumns.crewcheck_platform_profiles
    .filter((column) => !columns.has(`crewcheck_platform_profiles.${column}`))
    .map((column) => `crewcheck_platform_profiles.${column}`);
  const missingShareColumns = requiredColumns.crewcheck_platform_shares
    .filter((column) => !columns.has(`crewcheck_platform_shares.${column}`))
    .map((column) => `crewcheck_platform_shares.${column}`);
  const missingCore = [
    ...PLATFORM_CORE_TABLES.filter((table) => !ready.has(table)),
    ...missingProfileColumns,
  ];
  const missingOptional = [
    ...PLATFORM_OPTIONAL_TABLES.filter((table) => !ready.has(table)),
    ...missingShareColumns,
  ];
  return {
    coreReady: missingCore.length === 0,
    optionalReady: missingOptional.length === 0,
    profileIdReady: ready.has('crewcheck_platform_profiles') && missingProfileColumns.length === 0,
    qrShareReady: ready.has('crewcheck_platform_shares') && missingShareColumns.length === 0,
    missingCore,
    missingOptional,
    available: [...ready],
  };
}

// Compatibilidade com diagnósticos e integrações anteriores à separação entre
// tabelas essenciais e opcionais. O resultado representa somente o núcleo que
// precisa estar disponível para autenticação, perfil e assinatura funcionarem.
async function platformSchemaReady(db) {
  const report = await platformSchemaReport(db);
  return report.coreReady;
}

async function platformTableReady(db, tableName) {
  if (![...PLATFORM_CORE_TABLES, ...PLATFORM_OPTIONAL_TABLES].includes(tableName)) return false;
  if (tableName === 'crewcheck_platform_profiles' && state.schemaReport && !state.schemaReport.profileIdReady) return false;
  if (tableName === 'crewcheck_platform_shares' && state.schemaReport && !state.schemaReport.qrShareReady) return false;
  if (state.schemaReport?.available?.includes(tableName)) return true;
  const result = await db.query(
    'SELECT TABLE_NAME AS relation FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=$1 LIMIT 1',
    [tableName],
  );
  const ready = Boolean(result.rows[0]?.relation);
  if (ready && state.schemaReport) state.schemaReport.available = [...new Set([...(state.schemaReport.available || []), tableName])];
  return ready;
}
async function pool() {
  const connectionString = databaseConnectionString();
  if (!/^mysql:\/\//i.test(connectionString)) return null;
  if (!state.poolPromise) {
    state.poolPromise = (async () => {
      const mysqlModule = await import('mysql2/promise');
      const mysql = mysqlModule.default || mysqlModule;
      if (typeof mysql.createPool !== 'function') return null;
      const native = mysql.createPool(mysqlPoolOptions(connectionString));
      const db = mysqlAdapter(native);
      await db.query('SELECT 1');
      state.schemaReport = await platformSchemaReport(db);
      if (!state.schemaReport.coreReady) {
        throw Object.assign(new Error('A migration MySQL do CrewCheck ainda não foi aplicada.'), { code: 'DATABASE_MIGRATION_REQUIRED' });
      }
      state.databaseFailure = null;
      return db;
    })().catch((error) => {
      state.poolPromise = null;
      state.databaseFailure = { code: String(error?.code || 'DATABASE_UNAVAILABLE'), message: String(error?.message || 'Falha de conexão').slice(0, 180) };
      console.error('[crewcheck:database]', state.databaseFailure.code, state.databaseFailure.message);
      return null;
    });
  }
  return state.poolPromise;
}

function publicId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  const part = (start) => Array.from(bytes.subarray(start, start + 4), (b) => alphabet[b % alphabet.length]).join('');
  return `CC-${part(0)}-${part(4)}`;
}

function normalizeTimezone(value) {
  const candidate = normalizeText(value || DEFAULT_TIMEZONE, 80);
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function normalizeLocale(value) {
  const exact = normalizeText(value, 20);
  if (SUPPORTED_LOCALES.has(exact)) return exact;
  const lower = exact.toLowerCase();
  if (lower.startsWith('en')) return 'en-US';
  if (lower.startsWith('es')) return 'es-ES';
  return 'pt-BR';
}

function unlimitedEmails() {
  return env('CREWCHECK_PREMIUM_UNLIMITED_EMAILS').split(',').map(safeEmail).filter(Boolean);
}

function isPublicIdConflict(error) {
  const code = String(error?.code || '');
  const detail = String(error?.message || '').toLowerCase();
  return (code === 'ER_DUP_ENTRY' || Number(error?.errno) === 1062) && detail.includes('public_id');
}

async function ensureProfile(db, identity, patch = {}) {
  const forcedUnlimited = identity.admin || unlimitedEmails().includes(identity.email);
  const requestedPlan = PLAN_IDS.has(patch.plan) ? patch.plan : null;
  const defaultPlan = forcedUnlimited ? 'premium_unlimited' : (PLAN_IDS.has(identity.plan) ? identity.plan : 'free');
  const displayName = normalizeText(patch.displayName || identity.name || identity.email.split('@')[0], 120) || 'Tripulante';
  const locale = normalizeLocale(patch.locale || identity.locale || 'pt-BR');
  const timezone = normalizeTimezone(patch.timezone || identity.timezone || DEFAULT_TIMEZONE);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=$1 LIMIT 1', [identity.email]);
    const current = existing.rows[0] || null;
    const candidate = current?.public_id || publicId();
    try {
      if (current) {
        await db.query(`
          UPDATE crewcheck_platform_profiles SET
            public_id=IF(public_id IS NULL OR TRIM(public_id)='', $2, public_id),
            display_name=IF($8, $3, display_name),
            locale=IF($8, $4, locale),
            timezone=IF($8, $5, timezone),
            share_presence=IF($8, $7, share_presence),
            plan=IF($9, 'premium_unlimited', IF($10, $6, plan)),
            updated_at=CURRENT_TIMESTAMP(3)
          WHERE email=$1`, [
          identity.email, candidate, displayName, locale, timezone, requestedPlan || defaultPlan,
          Boolean(patch.sharePresence), Boolean(patch.apply), forcedUnlimited, Boolean(requestedPlan && identity.admin),
        ]);
      } else {
        await db.query(`
          INSERT INTO crewcheck_platform_profiles(email,public_id,display_name,locale,timezone,plan,share_presence)
          VALUES($1,$2,$3,$4,$5,$6,$7)`, [
          identity.email, candidate, displayName, locale, timezone, requestedPlan || defaultPlan,
          Boolean(patch.sharePresence),
        ]);
      }
      const result = await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=$1 LIMIT 1', [identity.email]);
      const profile = result.rows[0];
      if (!profile?.public_id) throw Object.assign(new Error('O perfil não recebeu um ID público.'), { code: 'PROFILE_ID_MISSING' });
      return profile;
    } catch (error) {
      const duplicate = String(error?.code || '') === 'ER_DUP_ENTRY' || Number(error?.errno) === 1062;
      if (duplicate && attempt < 4) continue;
      throw error;
    }
  }
  throw Object.assign(new Error('Não foi possível gerar um ID público único.'), { code: 'PROFILE_ID_GENERATION_FAILED' });
}

function planCatalog() {
  const monthly = Number(env('CREWCHECK_PREMIUM_MONTHLY_BRL', '19.90'));
  const annual = Number(env('CREWCHECK_PREMIUM_ANNUAL_BRL', '179.90'));
  return PLAN_CATALOG.map((plan) => ({
    id: plan.id,
    name: plan.name,
    cycle: plan.cycle,
    currency: 'BRL',
    value: plan.priceEnv ? Number(env(plan.priceEnv, String(plan.defaultPrice))) : plan.defaultPrice,
    callLimit: Math.max(0, Math.min(500, Math.round(Number(env(plan.callLimitEnv, String(plan.callLimit))) || plan.callLimit))),
    features: [...plan.features],
    googlePlayProductId: plan.id === 'premium_monthly' ? 'crewcheck_premium_monthly' : plan.id === 'premium_annual' ? 'crewcheck_premium_annual' : null,
    webCheckout: ['premium_monthly', 'premium_annual'].includes(plan.id),
    adminGrantOnly: plan.id === 'premium_unlimited',
    trialDays: ['premium_monthly', 'premium_annual'].includes(plan.id) ? 7 : 0,
    annualSavings: plan.id === 'premium_annual' && monthly > 0 && annual > 0 ? Math.max(0, Math.round((1 - annual / (monthly * 12)) * 100)) : 0,
  }));
}

function currentMonthKey(timezone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: normalizeTimezone(timezone), year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return `${year}-${month}`;
}

function planLimit(plan, kind) {
  if (kind !== 'wakeup_call') return 0;
  return planCatalog().find((item) => item.id === plan)?.callLimit ?? 1;
}

async function subscriptionStatus(db, profile) {
  const result = await db.query('SELECT * FROM crewcheck_platform_subscriptions WHERE email=$1 LIMIT 1', [profile.email]);
  const subscription = result.rows[0] || null;
  const now = Date.now();
  const subscriptionActive = subscription && ['active', 'trialing', 'grace_period'].includes(subscription.status)
    && (!subscription.current_period_end || new Date(subscription.current_period_end).getTime() > now);
  const legacyPremium = env('CREWCHECK_TRUST_LEGACY_PREMIUM_PROFILE', 'false').toLowerCase() === 'true'
    && !subscription && ['premium_monthly', 'premium_annual'].includes(profile.plan);
  const plan = profile.plan === 'premium_unlimited'
    ? profile.plan
    : subscriptionActive && PLAN_IDS.has(subscription.plan)
      ? subscription.plan
      : legacyPremium
        ? profile.plan
        : 'free';
  const monthKey = currentMonthKey(profile.timezone);
  const limit = planLimit(plan, 'wakeup_call');
  const usageResult = await db.query('SELECT used FROM crewcheck_platform_usage WHERE email=$1 AND month_key=$2 AND usage_kind=$3', [profile.email, monthKey, 'wakeup_call']);
  const used = Number(usageResult.rows[0]?.used || 0);
  return {
    plan,
    status: profile.plan === 'premium_unlimited' ? 'lifetime' : subscription?.status || (legacyPremium ? 'legacy_migration' : 'free'),
    provider: subscription?.provider || (profile.plan === 'premium_unlimited' ? 'admin' : legacyPremium ? 'legacy' : null),
    productId: subscription?.product_id || null,
    currentPeriodEnd: subscription?.current_period_end || null,
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    premiumAccess: plan !== 'free',
    entitlements: {
      roster: true, compliance: true, workload: true, finance: true, export: true,
      radar: plan !== 'free', smartDeparture: plan !== 'free', hotelLearning: plan !== 'free',
      gyms: plan !== 'free', visitors: plan !== 'free', rosterComparison: plan !== 'free', chat: plan !== 'free',
    },
    usage: { kind: 'wakeup_call', monthKey, used, limit, remaining: Math.max(0, limit - used) },
  };
}

export async function consumePlatformUsage(reqOrIdentity, kind = 'wakeup_call', amount = 1) {
  const identity = reqOrIdentity?.headers ? mainIdentity(reqOrIdentity) : reqOrIdentity;
  if (!identity?.email) return { allowed: false, status: 401, message: 'Faça login para usar ligações.' };
  if (identity.admin) return { allowed: true, admin: true, used: 0, limit: null, remaining: null };
  const db = await pool();
  if (!db) return { allowed: false, status: 503, message: 'O controle de custos está aguardando o banco. Nenhuma ligação foi cobrada.' };
  const profile = await ensureProfile(db, identity);
  const status = await subscriptionStatus(db, profile);
  const monthKey = currentMonthKey(profile.timezone);
  const limit = planLimit(status.plan, kind);
  if (amount <= 0 || amount > limit) return { allowed: false, status: 429, used: 0, limit, remaining: limit, message: `Limite mensal de ${limit} ligações atingido.` };

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT used FROM crewcheck_platform_usage WHERE email=$1 AND month_key=$2 AND usage_kind=$3 FOR UPDATE',
      [identity.email, monthKey, kind],
    );
    const usedBefore = Number(current.rows[0]?.used || 0);
    const used = usedBefore + amount;
    if (used > limit) {
      await client.query('ROLLBACK');
      return { allowed: false, status: 429, used: usedBefore, limit, remaining: Math.max(0, limit - usedBefore), message: `Limite mensal de ${limit} ligações atingido. Mensagens Telegram e lembrete local continuam disponíveis.` };
    }
    await client.query(`
      INSERT INTO crewcheck_platform_usage(email,month_key,usage_kind,used,limit_value)
      VALUES($1,$2,$3,$4,$5)
      ON DUPLICATE KEY UPDATE used=VALUES(used),limit_value=VALUES(limit_value),updated_at=CURRENT_TIMESTAMP(3)`,
    [identity.email, monthKey, kind, used, limit]);
    await client.query('COMMIT');
    return { allowed: true, used, limit, remaining: Math.max(0, limit - used), monthKey };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function encryptionKey() {
  return crypto.createHash('sha256').update(env('CREWCHECK_DATA_ENCRYPTION_KEY', authSecret())).digest();
}

function encryptPrivate(value) {
  const text = normalizeText(value, 80);
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decryptPrivate(value) {
  try {
    const raw = Buffer.from(String(value || ''), 'base64url');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch { return ''; }
}

function hotelKey(value) {
  return normalizeText(value, 160).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}

function sanitizeRoster(roster) {
  const clone = JSON.parse(JSON.stringify(roster || {}));
  clone.rawText = '';
  clone.days = Array.isArray(clone.days) ? clone.days.slice(0, 370).map((day) => ({
    ...day,
    rawText: '',
    legs: Array.isArray(day?.legs) ? day.legs.slice(0, 16) : [],
  })) : [];
  return clone;
}

const SHARED_COWORKER_FIELDS = new Set([
  'crew', 'crewlist', 'crewmembers', 'ccmlead', 'captain', 'firstofficer',
  'pilots', 'cabincrew', 'cockpitcrew', 'colleagues',
]);

function stripSharedCoworkerFields(value) {
  if (Array.isArray(value)) return value.map(stripSharedCoworkerFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SHARED_COWORKER_FIELDS.has(key.toLowerCase()))
    .map(([key, nested]) => [key, stripSharedCoworkerFields(nested)]));
}

function rosterForPermissions(roster, permissions = {}) {
  if (!roster) return null;
  const allowed = allowedPermissions(permissions);
  if (!allowed.roster) return {
    year: roster.year, month: roster.month, base: roster.base, days: [],
  };
  const copy = stripSharedCoworkerFields(sanitizeRoster(roster));
  copy.days = copy.days.map((day) => {
    const next = { ...day };
    if (!allowed.hotels) {
      delete next.hotel;
      delete next.hotelName;
      delete next.accommodation;
    }
    if (!allowed.presentation) {
      delete next.presentation;
      delete next.hotelPresentation;
      delete next.reportTime;
      delete next.dutyReport;
    }
    if (!allowed.radar) {
      delete next.gate;
      delete next.terminal;
      delete next.status;
      next.legs = Array.isArray(next.legs) ? next.legs.map((leg) => {
        const clean = { ...leg };
        delete clean.gate;
        delete clean.terminal;
        delete clean.status;
        return clean;
      }) : [];
    }
    return next;
  });
  return copy;
}

function rosterKey(roster) {
  return `${Number(roster?.year || 0)}-${String(Number(roster?.month || 0)).padStart(2, '0')}`;
}

function rosterFingerprint(roster) {
  return sha256(JSON.stringify({ year: roster?.year, month: roster?.month, crewId: roster?.crewId, days: roster?.days }));
}

function parseDateOnly(value) {
  const raw = String(value || '').trim();
  const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) return `${br[3].length === 2 ? `20${br[3]}` : br[3]}-${String(Number(br[2])).padStart(2, '0')}-${String(Number(br[1])).padStart(2, '0')}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : '';
}

function temporaryPassword() {
  const words = ['Voo', 'Escala', 'Tripula', 'Pernoite', 'Crew'];
  return `${words[crypto.randomInt(words.length)]}-${crypto.randomInt(100000, 999999)}!`;
}

function passwordHash(password, salt = crypto.randomBytes(16).toString('base64url')) {
  return `${salt}:${crypto.scryptSync(String(password), salt, 64).toString('base64url')}`;
}

function passwordMatches(password, stored) {
  try {
    const [salt, expected] = String(stored || '').split(':');
    const actual = crypto.scryptSync(String(password), salt, 64).toString('base64url');
    const a = Buffer.from(actual); const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

async function sendSystemEmail({ to, subject, text, html }) {
  const apiKey = env('MAILERSEND_API_KEY');
  const fromEmail = env('MAILERSEND_FROM', env('EMAIL_FROM'));
  if (!apiKey || !fromEmail) return { ok: false, configured: false };
  const response = await fetch('https://api.mailersend.com/v1/email', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      from: { email: fromEmail, name: env('EMAIL_FROM_NAME', 'CrewCheck') },
      to: [{ email: to }], subject, text, html,
    }),
  });
  return { ok: response.ok, configured: true, status: response.status };
}

async function sendTelegramDirect(chatId, text) {
  const token = env('TELEGRAM_BOT_TOKEN', env('BOT_TOKEN', env('CREWCHECK_TELEGRAM_BOT_TOKEN')));
  if (!token || !chatId) return { ok: false, configured: Boolean(token) };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: String(chatId), text: normalizeText(text, 3500), disable_web_page_preview: true }),
  });
  return { ok: response.ok, configured: true };
}

async function googleAccessToken() {
  if (state.googleToken && state.googleTokenExpiresAt > Date.now() + 60_000) return state.googleToken;
  const raw = env('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if (!raw) return '';
  let account;
  try {
    account = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  } catch { return ''; }
  if (!account.client_email || !account.private_key) return '';
  const now = Math.floor(Date.now() / 1000);
  const head = b64Json({ alg: 'RS256', typ: 'JWT' });
  const body = b64Json({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: account.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), account.private_key).toString('base64url');
  const response = await fetch(account.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${signature}` }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) return '';
  state.googleToken = payload.access_token;
  state.googleTokenExpiresAt = Date.now() + Number(payload.expires_in || 3600) * 1000;
  return state.googleToken;
}

async function verifyGooglePlaySubscription(purchaseToken, expectedProductId = '', allowInactive = false) {
  const accessToken = await googleAccessToken();
  if (!accessToken) throw Object.assign(new Error('Verificação Google Play aguardando credencial segura do servidor.'), { status: 503 });
  const packageName = env('GOOGLE_PLAY_PACKAGE_NAME', 'com.crewcheck.app');
  const endpoint = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const response = await fetch(endpoint, { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw Object.assign(new Error('A compra não pôde ser confirmada na Google Play.'), { status: 400 });
  const item = Array.isArray(payload.lineItems)
    ? payload.lineItems.find((line) => expectedProductId ? line.productId === expectedProductId : GOOGLE_PLAY_PRODUCTS.has(line.productId))
    : null;
  const expiry = item?.expiryTime ? new Date(item.expiryTime) : null;
  const activeStates = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']);
  const active = activeStates.has(payload.subscriptionState) && expiry && expiry.getTime() > Date.now();
  if (!item || (!active && !allowInactive)) throw Object.assign(new Error('A assinatura não está ativa para este produto.'), { status: 402 });
  return { payload, item, expiry, packageName };
}

function normalizedGoogleStatus(payload, expiry) {
  const stateName = normalizeText(payload?.subscriptionState, 90);
  const inFuture = expiry instanceof Date && expiry.getTime() > Date.now();
  if (stateName === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' && inFuture) return { status: 'grace_period', active: true, cancelAtPeriodEnd: false };
  if (stateName === 'SUBSCRIPTION_STATE_CANCELED' && inFuture) return { status: 'active', active: true, cancelAtPeriodEnd: true };
  if (stateName === 'SUBSCRIPTION_STATE_ACTIVE' && inFuture) return { status: 'active', active: true, cancelAtPeriodEnd: false };
  if (stateName === 'SUBSCRIPTION_STATE_PENDING') return { status: 'pending', active: false, cancelAtPeriodEnd: false };
  if (stateName === 'SUBSCRIPTION_STATE_ON_HOLD') return { status: 'past_due', active: false, cancelAtPeriodEnd: false };
  if (stateName === 'SUBSCRIPTION_STATE_PAUSED') return { status: 'paused', active: false, cancelAtPeriodEnd: false };
  return { status: 'expired', active: false, cancelAtPeriodEnd: false };
}

async function saveGoogleSubscription(db, email, purchaseToken, verified) {
  const productId = normalizeText(verified.item?.productId, 100);
  const plan = GOOGLE_PLAY_PRODUCTS.get(productId);
  if (!plan) throw Object.assign(new Error('Produto Google Play não reconhecido.'), { status: 400 });
  const tokenHash = sha256(purchaseToken);
  const owner = await db.query('SELECT email FROM crewcheck_platform_subscriptions WHERE purchase_token_hash=$1 LIMIT 1', [tokenHash]);
  if (owner.rows[0] && owner.rows[0].email !== email) {
    throw Object.assign(new Error('Esta compra já está vinculada a outra conta CrewCheck.'), { status: 409, code: 'PURCHASE_ALREADY_LINKED' });
  }
  const normalized = normalizedGoogleStatus(verified.payload, verified.expiry);
  await db.query(`
    INSERT INTO crewcheck_platform_subscriptions(email,plan,status,provider,product_id,provider_ref,purchase_token_hash,current_period_end,cancel_at_period_end,metadata)
    VALUES($1,$2,$3,'google_play',$4,$5,$6,$7,$8,$9)
    ON DUPLICATE KEY UPDATE
      plan=VALUES(plan),status=VALUES(status),provider='google_play',product_id=VALUES(product_id),
      provider_ref=VALUES(provider_ref),purchase_token_hash=VALUES(purchase_token_hash),
      current_period_end=VALUES(current_period_end),cancel_at_period_end=VALUES(cancel_at_period_end),
      metadata=VALUES(metadata),updated_at=CURRENT_TIMESTAMP(3)`, [
    email, plan, normalized.status, productId, normalizeText(verified.payload.latestOrderId, 180), tokenHash,
    verified.expiry?.toISOString().slice(0, 23).replace('T', ' ') || null, normalized.cancelAtPeriodEnd,
    JSON.stringify({ subscriptionState: verified.payload.subscriptionState, acknowledgementState: verified.payload.acknowledgementState }),
  ]);
  const current = await db.query('SELECT plan FROM crewcheck_platform_profiles WHERE email=$1', [email]);
  if (current.rows[0]?.plan !== 'premium_unlimited') {
    await db.query('UPDATE crewcheck_platform_profiles SET plan=$2,updated_at=NOW() WHERE email=$1', [email, normalized.active ? plan : 'free']);
  }
  return { plan, ...normalized };
}

async function verifyGooglePubSubIdentity(req) {
  const expectedAudience = env('GOOGLE_PLAY_RTDN_AUDIENCE');
  const expectedEmail = safeEmail(env('GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL'));
  const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
  if (!expectedAudience || !expectedEmail) throw Object.assign(new Error('RTDN aguardando audiência e conta de serviço.'), { status: 503 });
  if (!bearer) throw Object.assign(new Error('RTDN não autenticada.'), { status: 401 });
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(bearer)}`, { headers: { accept: 'application/json' } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.aud !== expectedAudience || safeEmail(payload.email) !== expectedEmail || String(payload.email_verified) !== 'true') {
    throw Object.assign(new Error('Identidade RTDN inválida.'), { status: 403 });
  }
}

async function asaasRequest(path, init = {}) {
  const apiKey = env('ASAAS_API_KEY');
  if (!apiKey) throw Object.assign(new Error('Cobrança web aguardando configuração do Asaas.'), { status: 503 });
  const base = env('ASAAS_API_BASE_URL', 'https://api.asaas.com/v3').replace(/\/+$/, '');
  const response = await fetch(`${base}${path}`, { ...init, headers: { access_token: apiKey, 'content-type': 'application/json', accept: 'application/json', ...(init.headers || {}) } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error('O provedor de cobrança não aceitou a solicitação.'), { status: 502, providerStatus: response.status, detail: payload });
  return payload;
}

async function requireMain(req, res, body = {}) {
  const identity = mainIdentity(req, body);
  if (!identity.email) {
    sendJson(res, 401, { ok: false, code: 'AUTH_REQUIRED', message: 'Faça login para continuar.' });
    return null;
  }
  const db = await pool();
  if (!db) {
    sendJson(res, 503, { ok: false, code: 'DATABASE_OFFLINE', message: 'Sincronização temporariamente indisponível. Seus dados locais continuam protegidos.' });
    return null;
  }
  const profile = await ensureProfile(db, identity);
  return { identity, db, profile };
}

async function requirePlatformTable(context, res, tableName, feature) {
  if (await platformTableReady(context.db, tableName)) return true;
  sendJson(res, 503, {
    ok: false,
    code: 'DATABASE_MIGRATION_REQUIRED',
    missingTable: tableName,
    message: `${feature} aguarda a migration do banco configurado.`,
  });
  return false;
}

async function handleDatabaseHealth(req, res) {
  const configured = Boolean(databaseConnectionString());
  if (!configured) return sendJson(res, 200, { ok: false, configured: false, connected: false, coreReady: false, degraded: true, migrationRequired: true, missingOptionalCount: 0, message: 'Banco aguardando configuração.' });
  const db = await pool();
  const report = state.schemaReport || { coreReady: false, optionalReady: false, missingCore: [], missingOptional: [] };
  const connected = Boolean(db && report.coreReady);
  const profileIdReady = Boolean(connected && report.profileIdReady);
  const qrShareReady = Boolean(connected && report.qrShareReady);
  return sendJson(res, 200, {
    ok: connected,
    configured: true,
    provider: databaseDialect(),
    connected,
    coreReady: Boolean(report.coreReady),
    profileIdReady,
    qrShareReady,
    degraded: connected && !report.optionalReady,
    migrationRequired: !report.coreReady || !report.optionalReady,
    missingCore: Array.isArray(report.missingCore) ? report.missingCore : [],
    missingOptional: Array.isArray(report.missingOptional) ? report.missingOptional : [],
    missingOptionalCount: Array.isArray(report.missingOptional) ? report.missingOptional.length : 0,
    retryable: !connected,
    message: connected
      ? report.optionalReady ? 'Banco conectado e schema completo.' : 'Banco principal conectado; módulos opcionais aguardam migration.'
      : 'Não foi possível conectar ao núcleo do banco agora.',
  });
}

async function requirePremium(context, res, feature = 'Este recurso') {
  const billing = await subscriptionStatus(context.db, context.profile);
  if (!billing.premiumAccess) {
    sendJson(res, 402, { ok: false, code: 'PREMIUM_REQUIRED', billing, message: `${feature} está disponível nos planos Premium.` });
    return null;
  }
  return billing;
}

function publicBaseUrl(req) {
  const configured = env('PUBLIC_APP_URL');
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === 'https:' || (env('NODE_ENV').toLowerCase() !== 'production' && parsed.protocol === 'http:')) return parsed.origin;
    } catch {}
  }
  return env('NODE_ENV').toLowerCase() === 'production' ? 'https://crewcheck.online' : `http://${req.headers.host || 'localhost:3000'}`;
}

function requestFingerprint(req, email = '') {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const remote = forwarded || String(req.socket?.remoteAddress || 'unknown');
  return sha256(`${remote}|${safeEmail(email) || 'unknown'}`);
}

async function checkAuthThrottle(db, req, email) {
  const identifier = requestFingerprint(req, email);
  if (!await platformTableReady(db, 'crewcheck_platform_auth_attempts')) return identifier;
  const result = await db.query('SELECT failures,window_started,blocked_until FROM crewcheck_platform_auth_attempts WHERE identifier=$1', [identifier]);
  const row = result.rows[0];
  if (row?.blocked_until && new Date(row.blocked_until).getTime() > Date.now()) {
    const retryAfterSeconds = Math.max(1, Math.ceil((new Date(row.blocked_until).getTime() - Date.now()) / 1000));
    throw Object.assign(new Error(`Muitas tentativas. Aguarde ${retryAfterSeconds} segundos.`), { status: 429, code: 'LOGIN_THROTTLED', retryAfterSeconds });
  }
  if (row?.window_started && new Date(row.window_started).getTime() < Date.now() - 15 * 60_000) {
    await db.query('DELETE FROM crewcheck_platform_auth_attempts WHERE identifier=$1', [identifier]);
  }
  return identifier;
}

async function recordAuthFailure(db, identifier) {
  if (!await platformTableReady(db, 'crewcheck_platform_auth_attempts')) return;
  await db.query(`
    INSERT INTO crewcheck_platform_auth_attempts(identifier,failures,window_started,blocked_until)
    VALUES($1,1,NOW(),NULL)
    ON DUPLICATE KEY UPDATE
      failures=IF(window_started<DATE_SUB(NOW(), INTERVAL 15 MINUTE),1,failures+1),
      window_started=IF(window_started<DATE_SUB(NOW(), INTERVAL 15 MINUTE),NOW(),window_started),
      blocked_until=IF(IF(window_started<DATE_SUB(NOW(), INTERVAL 15 MINUTE),1,failures+1)>=5,DATE_ADD(NOW(), INTERVAL 15 MINUTE),NULL),
      updated_at=NOW()`, [identifier]);
}

async function clearAuthFailures(db, identifier) {
  if (!await platformTableReady(db, 'crewcheck_platform_auth_attempts')) return;
  await db.query('DELETE FROM crewcheck_platform_auth_attempts WHERE identifier=$1', [identifier]);
}

const PLATFORM_METHOD_POLICIES = [
  [/^\/api\/platform\/catalog$/, ['GET']],
  [/^\/api\/platform\/database\/health$/, ['GET']],
  [/^\/api\/platform\/profile$/, ['GET', 'PATCH']],
  [/^\/api\/platform\/billing\/status$/, ['GET']],
  [/^\/api\/platform\/billing\/google-play\/verify$/, ['POST']],
  [/^\/api\/platform\/billing\/google-play\/rtdn$/, ['POST']],
  [/^\/api\/platform\/billing\/asaas\/checkout$/, ['POST']],
  [/^\/api\/platform\/billing\/asaas\/webhook$/, ['POST']],
  [/^\/api\/platform\/billing\/cancel$/, ['POST']],
  [/^\/api\/platform\/rosters\/sync$/, ['POST']],
  [/^\/api\/platform\/rosters\/active$/, ['GET']],
  [/^\/api\/platform\/hotels\/stays$/, ['GET', 'POST', 'PATCH']],
  [/^\/api\/platform\/hotels\/companions$/, ['GET']],
  [/^\/api\/platform\/visitors$/, ['GET', 'POST']],
  [/^\/api\/platform\/visitors\/[^/]+\/revoke$/, ['POST']],
  [/^\/api\/platform\/visitors\/[^/]+\/chat$/, ['GET', 'POST']],
  [/^\/api\/platform\/visitors\/[^/]+$/, ['PATCH']],
  [/^\/api\/platform\/visitor\/invite$/, ['GET']],
  [/^\/api\/platform\/visitor\/accept$/, ['POST']],
  [/^\/api\/platform\/visitor\/login$/, ['POST']],
  [/^\/api\/platform\/visitor\/data$/, ['GET']],
  [/^\/api\/platform\/visitor\/logout$/, ['POST']],
  [/^\/api\/platform\/visitor\/emergency$/, ['POST']],
  [/^\/api\/platform\/visitor\/chat$/, ['GET', 'POST']],
  [/^\/api\/platform\/shares$/, ['GET', 'POST']],
  [/^\/api\/platform\/shares\/public\/[^/]+$/, ['GET']],
  [/^\/api\/platform\/shares\/[^/]+\/revoke$/, ['POST']],
  [/^\/api\/platform\/connections$/, ['GET', 'POST', 'PATCH']],
  [/^\/api\/platform\/compare$/, ['GET']],
  [/^\/api\/platform\/chat$/, ['GET', 'POST']],
  [/^\/api\/platform\/gyms\/checkins$/, ['GET', 'POST']],
  [/^\/api\/platform\/parking$/, ['GET', 'POST', 'DELETE']],
  [/^\/api\/platform\/account\/delete$/, ['POST']],
  [/^\/api\/platform\/terms\/current$/, ['GET']],
  [/^\/api\/platform\/terms\/accept$/, ['POST']],
  [/^\/api\/platform\/admin\/terms$/, ['GET', 'POST']],
  [/^\/api\/platform\/admin\/unlimited$/, ['POST']],
  [/^\/api\/platform\/health\/amil$/, ['GET']],
  [/^\/api\/platform\/health\/amil\/search$/, ['GET']],
];

function enforcePlatformMethod(req, res, pathname) {
  const policy = PLATFORM_METHOD_POLICIES.find(([pattern]) => pattern.test(pathname));
  if (!policy || policy[1].includes(req.method)) return true;
  res.setHeader('Allow', policy[1].join(', '));
  sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
  return false;
}

function allowedPermissions(input = {}) {
  const keys = ['roster', 'map', 'hotels', 'room', 'presentation', 'radar', 'contact', 'emergency', 'chat'];
  const permissions = Object.fromEntries(keys.map((key) => [key, Boolean(input?.[key])]));
  if (!permissions.hotels) permissions.room = false;
  if (!permissions.roster && !permissions.hotels) permissions.presentation = false;
  if (!permissions.roster) permissions.radar = false;
  return permissions;
}

function publicProfile(row) {
  return { email: row.email, publicId: row.public_id, displayName: row.display_name, locale: row.locale, timezone: row.timezone, plan: row.plan, sharePresence: row.share_presence };
}

async function handleCatalog(req, res) {
  const identity = mainIdentity(req);
  const visiblePlans = planCatalog().filter((plan) => plan.id !== 'premium_unlimited' || identity.admin);
  return sendJson(res, 200, {
    ok: true, version: APP_VERSION, encoding: 'UTF-8', defaultLocale: 'pt-BR', supportedLocales: [...SUPPORTED_LOCALES],
    defaultTimezone: DEFAULT_TIMEZONE, plans: visiblePlans,
    disclosures: {
      autoRenew: 'Assinaturas Mensal e Anual renovam automaticamente até o cancelamento.',
      trial: 'Quando disponível, o teste de 7 dias informa a data da primeira cobrança antes da confirmação.',
      cancellation: 'Compras Google Play são gerenciadas na Play Store; compras web são gerenciadas no CrewCheck.',
      calls: 'Ligações usam provedores externos e têm franquia mensal. Telegram por texto e lembrete local continuam disponíveis ao atingir o limite.',
    },
  });
}

function requestAuditHash(req, value = '') {
  const salt = env('CREWCHECK_AUDIT_HASH_SALT', env('CREWCHECK_TERMS_AUDIT_SALT', env('CREWCHECK_AUTH_SECRET', 'crewcheck-audit')));
  return crypto.createHash('sha256').update(`${salt}:${String(value || '')}`).digest('hex');
}

async function currentTerms(db) {
  if (!await platformTableReady(db, 'crewcheck_platform_terms')) return null;
  const result = await db.query("SELECT id,version,title,body_text,content_hash,published_at,effective_at FROM crewcheck_platform_terms WHERE status='published' ORDER BY version DESC LIMIT 1");
  return result.rows[0] || null;
}

function publicTerms(row, accepted = false) {
  if (!row) return null;
  return {
    id: row.id,
    version: Number(row.version || 0),
    title: row.title,
    body: row.body_text,
    contentHash: row.content_hash,
    publishedAt: row.published_at,
    effectiveAt: row.effective_at,
    accepted: Boolean(accepted),
  };
}

async function handleTermsCurrent(req, res) {
  const db = await pool();
  if (!db || !await platformTableReady(db, 'crewcheck_platform_terms')) {
    return sendJson(res, 200, { ok: true, configured: false, terms: null, message: 'Termos aguardando migration MySQL.' });
  }
  const terms = await currentTerms(db);
  if (!terms) return sendJson(res, 200, { ok: true, configured: false, terms: null, message: 'Nenhuma versão publicada.' });
  const identity = mainIdentity(req);
  let accepted = false;
  if (identity.email && await platformTableReady(db, 'crewcheck_platform_terms_acceptances')) {
    const result = await db.query('SELECT 1 accepted FROM crewcheck_platform_terms_acceptances WHERE email=$1 AND terms_id=$2 AND content_hash=$3 LIMIT 1', [identity.email, terms.id, terms.content_hash]);
    accepted = Boolean(result.rows[0]?.accepted);
  }
  return sendJson(res, 200, { ok: true, configured: true, terms: publicTerms(terms, accepted) });
}

async function handleTermsAccept(req, res) {
  const body = await readBody(req, 100_000);
  const context = await requireMain(req, res, body);
  if (!context) return;
  if (!await requirePlatformTable(context, res, 'crewcheck_platform_terms', 'Aceite dos Termos')) return;
  if (!await requirePlatformTable(context, res, 'crewcheck_platform_terms_acceptances', 'Aceite dos Termos')) return;
  const terms = await currentTerms(context.db);
  if (!terms) return sendJson(res, 409, { ok: false, message: 'Nenhuma versão dos Termos está publicada.' });
  if (String(body.termsId || '') !== String(terms.id) || String(body.contentHash || '') !== String(terms.content_hash)) {
    return sendJson(res, 409, { ok: false, code: 'TERMS_VERSION_CHANGED', message: 'Os Termos foram atualizados. Leia a versão vigente antes de aceitar.' });
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const userAgent = normalizeText(req.headers['user-agent'], 500);
  await context.db.query(`INSERT INTO crewcheck_platform_terms_acceptances(email,terms_id,terms_version,content_hash,accepted_at,ip_hash,user_agent_hash)
    VALUES($1,$2,$3,$4,NOW(),$5,$6)
    ON DUPLICATE KEY UPDATE terms_version=VALUES(terms_version),content_hash=VALUES(content_hash),accepted_at=NOW(),ip_hash=VALUES(ip_hash),user_agent_hash=VALUES(user_agent_hash)`, [
    context.identity.email, terms.id, Number(terms.version), terms.content_hash,
    requestAuditHash(req, ip), requestAuditHash(req, userAgent),
  ]);
  return sendJson(res, 200, { ok: true, accepted: true, terms: publicTerms(terms, true), message: 'Aceite registrado.' });
}

async function handleAdminTerms(req, res) {
  const body = req.method === 'POST' ? await readBody(req, 500_000) : {};
  const context = await requireMain(req, res, body);
  if (!context) return;
  if (!context.identity.admin) return sendJson(res, 403, { ok: false, message: 'Acesso administrativo necessário.' });
  if (!await requirePlatformTable(context, res, 'crewcheck_platform_terms', 'Editor de Termos')) return;
  if (req.method === 'GET') {
    const result = await context.db.query('SELECT id,version,title,content_hash,status,published_at,effective_at,created_by FROM crewcheck_platform_terms ORDER BY version DESC LIMIT 20');
    return sendJson(res, 200, { ok: true, terms: result.rows });
  }
  const title = normalizeText(body.title, 180);
  const bodyText = normalizeText(body.body, 120_000);
  if (title.length < 5 || bodyText.length < 300) return sendJson(res, 400, { ok: false, message: 'Informe título e texto completo com pelo menos 300 caracteres.' });
  const contentHash = crypto.createHash('sha256').update(bodyText, 'utf8').digest('hex');
  const published = await currentTerms(context.db);
  if (published && String(published.content_hash || '') === contentHash) {
    return sendJson(res, 200, {
      ok: true,
      unchanged: true,
      terms: publicTerms(published),
      message: 'O texto não mudou. A versão atual foi mantida e nenhum novo aceite será solicitado.',
    });
  }
  const latest = await context.db.query('SELECT COALESCE(MAX(version),0) version FROM crewcheck_platform_terms');
  const version = Number(latest.rows[0]?.version || 0) + 1;
  const id = `terms-${version}-${crypto.randomUUID().slice(0, 8)}`;
  const client = await context.db.connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE crewcheck_platform_terms SET status='superseded' WHERE status='published'");
    await client.query(`INSERT INTO crewcheck_platform_terms(id,version,title,body_text,content_hash,status,published_at,effective_at,created_by)
      VALUES($1,$2,$3,$4,$5,'published',NOW(),NOW(),$6)`, [id, version, title, bodyText, contentHash, context.identity.email]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  return sendJson(res, 200, { ok: true, terms: publicTerms({ id, version, title, body_text: bodyText, content_hash: contentHash, published_at: new Date(), effective_at: new Date() }), message: 'Nova versão publicada. Usuários deverão aceitá-la uma vez.' });
}

async function handleAdminUnlimited(req, res) {
  const body = await readBody(req, 100_000);
  const context = await requireMain(req, res, body);
  if (!context) return;
  if (!context.identity.admin) return sendJson(res, 403, { ok: false, message: 'Acesso administrativo necessário.' });
  const email = safeEmail(body.email);
  if (!email) return sendJson(res, 400, { ok: false, message: 'Informe um e-mail válido.' });
  const targetIdentity = { email, name: normalizeText(body.name || email.split('@')[0], 120), role: 'user', plan: 'free', locale: 'pt-BR', timezone: DEFAULT_TIMEZONE, admin: false };
  const profile = await ensureProfile(context.db, targetIdentity, { apply: true, displayName: targetIdentity.name });
  await context.db.query("UPDATE crewcheck_platform_profiles SET plan='premium_unlimited',updated_at=NOW() WHERE email=$1", [email]);
  return sendJson(res, 200, { ok: true, profile: { ...publicProfile(profile), plan: 'premium_unlimited' }, message: 'Premium Unlimited concedido. Obrigado por fazer parte do CrewCheck.' });
}

function amilConfiguration() {
  const baseUrl = env('AMIL_API_BASE_URL', 'https://api-dev.servicos.grupoamil.com.br').replace(/\/+$/, '');
  const searchPath = env('AMIL_API_SEARCH_PATH');
  const token = env('AMIL_API_ACCESS_TOKEN');
  const apiKey = env('AMIL_API_KEY');
  const enabled = env('CREWCHECK_AMIL_ENABLED', 'false').toLowerCase() === 'true';
  const safePath = /^\/[A-Za-z0-9_./-]+$/.test(searchPath) && !searchPath.includes('..') ? searchPath : '';
  return { baseUrl, searchPath: safePath, token, apiKey, enabled, configured: enabled && baseUrl.startsWith('https://') && Boolean(safePath) && Boolean(token || apiKey) };
}

async function handleAmilHealth(req, res) {
  const config = amilConfiguration();
  return sendJson(res, 200, { ok: config.configured, configured: config.configured, provider: 'amil', environment: config.baseUrl.includes('api-dev.') ? 'development' : 'production', message: config.configured ? 'Rede Amil configurada no backend.' : 'Integração Amil aguarda credenciais oficiais e o caminho de busca contratado.' });
}

async function handleAmilSearch(req, res, url) {
  const context = await requireMain(req, res);
  if (!context) return;
  const config = amilConfiguration();
  if (!config.configured) return sendJson(res, 503, { ok: false, configured: false, code: 'AMIL_NOT_CONFIGURED', message: 'A consulta Amil aguarda credenciais oficiais no Render.' });
  const params = new URLSearchParams();
  for (const key of ['latitude', 'longitude', 'postalCode', 'city', 'state', 'serviceType', 'planCode']) {
    const value = normalizeText(url.searchParams.get(key), 120);
    if (value) params.set(key, value);
  }
  if (url.searchParams.get('open24Hours') === 'true') params.set('open24Hours', 'true');
  const headers = { accept: 'application/json' };
  if (config.token) headers.authorization = `Bearer ${config.token}`;
  if (config.apiKey) headers['x-api-key'] = config.apiKey;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${config.baseUrl}${config.searchPath}?${params.toString()}`, { headers, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return sendJson(res, 502, { ok: false, configured: true, message: 'A Amil não concluiu a consulta agora.' });
    const candidates = Array.isArray(payload) ? payload : payload?.items || payload?.results || payload?.data || payload?.prestadores || [];
    const providers = Array.isArray(candidates) ? candidates.slice(0, 30).map((item) => ({
      id: normalizeText(item.id || item.codigo || item.providerId, 100),
      name: normalizeText(item.name || item.nome || item.razaoSocial, 180),
      serviceType: normalizeText(item.serviceType || item.tipoServico || item.especialidade, 120),
      address: normalizeText(item.address || item.endereco || item.formattedAddress, 300),
      city: normalizeText(item.city || item.cidade, 100),
      state: normalizeText(item.state || item.uf, 20),
      phone: normalizeText(item.phone || item.telefone, 60),
      open24Hours: Boolean(item.open24Hours || item.atendimento24Horas),
      latitude: Number(item.latitude || item.lat) || null,
      longitude: Number(item.longitude || item.lng || item.lon) || null,
    })).filter((item) => item.name) : [];
    return sendJson(res, 200, { ok: true, configured: true, providers, count: providers.length, disclaimer: 'Confirme cobertura, elegibilidade e atendimento diretamente com a operadora antes do deslocamento.' });
  } finally { clearTimeout(timer); }
}

async function handleProfile(req, res) {
  const body = req.method === 'PATCH' || req.method === 'POST' ? await readBody(req) : {};
  const context = await requireMain(req, res, body);
  if (!context) return;
  let profile = context.profile;
  if (req.method !== 'GET') profile = await ensureProfile(context.db, context.identity, {
    apply: true,
    displayName: body.displayName,
    locale: normalizeLocale(body.locale),
    timezone: normalizeTimezone(body.timezone),
    sharePresence: Boolean(body.sharePresence),
  });
  const billing = await subscriptionStatus(context.db, profile);
  return sendJson(res, 200, { ok: true, profile: publicProfile(profile), billing, encoding: 'UTF-8' });
}

async function handleBillingStatus(req, res) {
  const context = await requireMain(req, res);
  if (!context) return;
  return sendJson(res, 200, { ok: true, ...(await subscriptionStatus(context.db, context.profile)), plans: planCatalog() });
}

async function handleGooglePurchase(req, res) {
  const body = await readBody(req, 500_000);
  const context = await requireMain(req, res, body);
  if (!context) return;
  const productId = normalizeText(body.productId, 100);
  const purchaseToken = normalizeText(body.purchaseToken, 5000);
  const plan = GOOGLE_PLAY_PRODUCTS.get(productId);
  if (!plan || !purchaseToken) return sendJson(res, 400, { ok: false, message: 'Produto ou comprovante Google Play inválido.' });
  const verified = await verifyGooglePlaySubscription(purchaseToken, productId);
  const obfuscatedAccountId = normalizeText(verified.payload?.externalAccountIdentifiers?.obfuscatedExternalAccountId, 64).toUpperCase();
  if (obfuscatedAccountId && obfuscatedAccountId !== String(context.profile.public_id || '').toUpperCase()) {
    return sendJson(res, 409, { ok: false, code: 'GOOGLE_ACCOUNT_MISMATCH', message: 'Esta compra foi iniciada para outra conta CrewCheck.' });
  }
  const saved = await saveGoogleSubscription(context.db, context.identity.email, purchaseToken, verified);
  const profile = { ...context.profile, plan: saved.active ? plan : 'free' };
  return sendJson(res, 200, {
    ok: true,
    billing: await subscriptionStatus(context.db, profile),
    needsAcknowledgement: verified.payload.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    message: saved.active ? 'Assinatura Google Play confirmada e restaurada.' : 'Compra localizada, mas ainda sem acesso ativo.',
  });
}

async function handleAsaasCheckout(req, res) {
  const body = await readBody(req, 500_000);
  const context = await requireMain(req, res, body);
  if (!context) return;
  const platform = normalizeText(body.platform || req.headers['x-crewcheck-platform'], 30).toLowerCase();
  if (platform === 'android' || body.googlePlay === true) return sendJson(res, 409, { ok: false, code: 'USE_GOOGLE_PLAY', message: 'No aplicativo Android, conclua a assinatura pela Google Play.' });
  const plan = normalizeText(body.plan, 40);
  if (!['premium_monthly', 'premium_annual'].includes(plan)) return sendJson(res, 400, { ok: false, message: 'Escolha um plano recorrente válido.' });
  const currentBilling = await subscriptionStatus(context.db, context.profile);
  if (currentBilling.premiumAccess) return sendJson(res, 409, { ok: false, code: 'SUBSCRIPTION_ALREADY_ACTIVE', billing: currentBilling, message: 'Esta conta já possui uma assinatura ativa. Gerencie o plano atual antes de iniciar outra cobrança.' });
  const cpfCnpj = String(body.cpfCnpj || '').replace(/\D/g, '');
  if (![11, 14].includes(cpfCnpj.length)) return sendJson(res, 400, { ok: false, code: 'CPF_REQUIRED', message: 'Informe CPF ou CNPJ válido para a cobrança web.' });
  const price = planCatalog().find((item) => item.id === plan)?.value;
  const pendingResult = await context.db.query("SELECT provider_ref,metadata FROM crewcheck_platform_subscriptions WHERE email=$1 AND provider='asaas' AND plan=$2 AND status='pending' LIMIT 1", [context.identity.email, plan]);
  const pending = pendingResult.rows[0];
  if (pending?.provider_ref) {
    const existingPayments = await asaasRequest(`/subscriptions/${encodeURIComponent(pending.provider_ref)}/payments?limit=1`).catch(() => null);
    const existing = existingPayments?.data?.[0] || null;
    const checkoutUrl = existing?.invoiceUrl || existing?.bankSlipUrl || null;
    return sendJson(res, 200, { ok: true, provider: 'asaas', plan, reused: true, firstDueDate: pending.metadata?.firstDue || null, checkoutUrl, message: 'A cobrança pendente existente foi reutilizada; nenhuma assinatura duplicada foi criada.' });
  }
  const customers = await asaasRequest(`/customers?email=${encodeURIComponent(context.identity.email)}&limit=1`);
  let customerId = customers?.data?.[0]?.id;
  if (!customerId) {
    const customer = await asaasRequest('/customers', { method: 'POST', headers: { 'asaas-request-id': sha256(`customer:${context.profile.public_id}`).slice(0, 36) }, body: JSON.stringify({ name: context.profile.display_name, email: context.identity.email, cpfCnpj, externalReference: context.profile.public_id }) });
    customerId = customer.id;
  }
  const firstDue = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const subscription = await asaasRequest('/subscriptions', { method: 'POST', headers: { 'asaas-request-id': sha256(`subscription:${context.profile.public_id}:${plan}:${firstDue}`).slice(0, 36) }, body: JSON.stringify({ customer: customerId, billingType: normalizeText(body.billingType || 'UNDEFINED', 30), value: price, nextDueDate: firstDue, cycle: plan === 'premium_annual' ? 'YEARLY' : 'MONTHLY', description: plan === 'premium_annual' ? 'CrewCheck Premium Anual' : 'CrewCheck Premium Mensal', externalReference: `${context.profile.public_id}:${plan}` }) });
  const paymentPage = await asaasRequest(`/subscriptions/${encodeURIComponent(subscription.id)}/payments?limit=1`).catch(() => null);
  const firstPayment = paymentPage?.data?.[0] || null;
  await context.db.query(`INSERT INTO crewcheck_platform_subscriptions(email,plan,status,provider,product_id,provider_ref,current_period_end,metadata)
    VALUES($1,$2,'pending','asaas',$2,$3,NULL,$4)
    ON DUPLICATE KEY UPDATE plan=VALUES(plan),status='pending',provider='asaas',product_id=VALUES(product_id),provider_ref=VALUES(provider_ref),metadata=VALUES(metadata),updated_at=NOW()`, [context.identity.email, plan, subscription.id, JSON.stringify({ customerId, firstDue })]);
  return sendJson(res, 200, { ok: true, provider: 'asaas', plan, firstDueDate: firstDue, checkoutUrl: firstPayment?.invoiceUrl || firstPayment?.bankSlipUrl || subscription.invoiceUrl || subscription.paymentLink || null, message: 'Assinatura web criada. A primeira cobrança ocorrerá após o período informado.' });
}

async function handleBillingCancel(req, res) {
  const context = await requireMain(req, res);
  if (!context) return;
  const result = await context.db.query('SELECT * FROM crewcheck_platform_subscriptions WHERE email=$1 LIMIT 1', [context.identity.email]);
  const subscription = result.rows[0];
  if (!subscription) return sendJson(res, 404, { ok: false, message: 'Nenhuma assinatura recorrente foi localizada.' });
  if (subscription.provider === 'google_play') {
    const product = encodeURIComponent(subscription.product_id || '');
    const manageUrl = `https://play.google.com/store/account/subscriptions?sku=${product}&package=com.crewcheck.app`;
    return sendJson(res, 200, { ok: true, actionRequired: true, manageUrl, message: 'Conclua o cancelamento na Google Play. O acesso permanece até o fim do período pago.' });
  }
  if (subscription.provider !== 'asaas' || !subscription.provider_ref) return sendJson(res, 409, { ok: false, message: 'Este plano não possui cobrança recorrente cancelável.' });
  await asaasRequest(`/subscriptions/${encodeURIComponent(subscription.provider_ref)}`, { method: 'DELETE' });
  const keepsPaidAccess = ['active', 'trialing', 'grace_period'].includes(subscription.status)
    && subscription.current_period_end && new Date(subscription.current_period_end).getTime() > Date.now();
  await context.db.query("UPDATE crewcheck_platform_subscriptions SET status=$2,cancel_at_period_end=TRUE,updated_at=NOW() WHERE email=$1", [context.identity.email, keepsPaidAccess ? subscription.status : 'canceled']);
  if (!keepsPaidAccess && context.profile.plan !== 'premium_unlimited') await context.db.query("UPDATE crewcheck_platform_profiles SET plan='free',updated_at=NOW() WHERE email=$1", [context.identity.email]);
  return sendJson(res, 200, { ok: true, canceled: true, currentPeriodEnd: subscription.current_period_end || null, message: keepsPaidAccess ? 'Renovação web cancelada. O acesso permanece até o fim do período já pago.' : 'Assinatura web cancelada. Não haverá nova renovação.' });
}

function asaasEventStatus(eventName) {
  const event = normalizeText(eventName, 100).toUpperCase();
  if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'SUBSCRIPTION_REACTIVATED'].includes(event)) return 'active';
  if (['PAYMENT_OVERDUE'].includes(event)) return 'past_due';
  if (['PAYMENT_REFUNDED', 'PAYMENT_REFUND_IN_PROGRESS'].includes(event)) return 'refunded';
  if (['PAYMENT_DELETED', 'SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'].includes(event)) return 'canceled';
  return null;
}

async function handleAsaasWebhook(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
  const expected = env('ASAAS_WEBHOOK_TOKEN');
  if (!expected || !safeEqual(req.headers['asaas-access-token'], expected)) return sendJson(res, 403, { ok: false, message: 'Webhook não autorizado.' });
  const body = await readBody(req, 1_000_000);
  const eventId = normalizeText(body.id, 180);
  const eventName = normalizeText(body.event, 100).toUpperCase();
  const subscriptionRef = normalizeText(body.payment?.subscription || body.subscription?.id || body.subscription, 180);
  if (!eventId || !eventName) return sendJson(res, 400, { ok: false, message: 'Evento Asaas inválido.' });
  const db = await pool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  const eventRow = await db.query(`INSERT IGNORE INTO crewcheck_platform_webhook_events(provider,event_id,payload_hash)
    VALUES('asaas',$1,$2)`, [eventId, sha256(JSON.stringify(body))]);
  if (!eventRow.rowCount) return sendJson(res, 200, { ok: true, duplicate: true });
  if (!subscriptionRef) return sendJson(res, 200, { ok: true, ignored: true });
  const current = await db.query("SELECT * FROM crewcheck_platform_subscriptions WHERE provider='asaas' AND provider_ref=$1 LIMIT 1", [subscriptionRef]);
  const subscription = current.rows[0];
  if (!subscription) {
    await db.query("DELETE FROM crewcheck_platform_webhook_events WHERE provider='asaas' AND event_id=$1", [eventId]);
    return sendJson(res, 503, { ok: false, message: 'Assinatura ainda não conciliada; tente novamente.' });
  }
  const status = asaasEventStatus(eventName);
  if (!status) return sendJson(res, 200, { ok: true, ignored: true, message: 'Evento informativo registrado sem alterar a assinatura.' });
  const due = parseDateOnly(body.payment?.confirmedDate || body.payment?.clientPaymentDate || body.payment?.paymentDate || body.payment?.dueDate || body.dateCreated);
  const periodEnd = due ? new Date(`${due}T12:00:00.000Z`) : new Date();
  periodEnd.setUTCDate(periodEnd.getUTCDate() + (subscription.plan === 'premium_annual' ? 366 : 31));
  const nextMetadata = { ...(subscription.metadata && typeof subscription.metadata === 'object' ? subscription.metadata : {}), lastAsaasEvent: eventName, lastAsaasEventId: eventId };
  await db.query('UPDATE crewcheck_platform_subscriptions SET status=$2,current_period_end=CASE WHEN $2=$3 THEN $4 ELSE current_period_end END,metadata=$5,updated_at=NOW() WHERE email=$1', [subscription.email, status, 'active', periodEnd.toISOString().slice(0, 23).replace('T', ' '), JSON.stringify(nextMetadata)]);
  const profile = await db.query('SELECT plan FROM crewcheck_platform_profiles WHERE email=$1', [subscription.email]);
  if (profile.rows[0]?.plan !== 'premium_unlimited') {
    await db.query('UPDATE crewcheck_platform_profiles SET plan=$2,updated_at=NOW() WHERE email=$1', [subscription.email, status === 'active' ? subscription.plan : 'free']);
  }
  return sendJson(res, 200, { ok: true });
}

async function handleGoogleRtdn(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
  await verifyGooglePubSubIdentity(req);
  const body = await readBody(req, 1_000_000);
  const eventId = normalizeText(body.message?.messageId, 180);
  let notification;
  try { notification = JSON.parse(Buffer.from(String(body.message?.data || ''), 'base64').toString('utf8')); }
  catch { return sendJson(res, 400, { ok: false, message: 'RTDN inválida.' }); }
  const purchaseToken = normalizeText(notification?.subscriptionNotification?.purchaseToken, 5000);
  const packageName = normalizeText(notification?.packageName, 180);
  if (!eventId || !purchaseToken || packageName !== env('GOOGLE_PLAY_PACKAGE_NAME', 'com.crewcheck.app')) return sendJson(res, 400, { ok: false, message: 'RTDN incompleta.' });
  const db = await pool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  const duplicate = await db.query("SELECT 1 FROM crewcheck_platform_webhook_events WHERE provider='google_play' AND event_id=$1", [eventId]);
  if (duplicate.rows[0]) return sendJson(res, 200, { ok: true, duplicate: true });
  const verified = await verifyGooglePlaySubscription(purchaseToken, '', true);
  let owner = await db.query('SELECT email FROM crewcheck_platform_subscriptions WHERE purchase_token_hash=$1 LIMIT 1', [sha256(purchaseToken)]);
  if (!owner.rows[0]) {
    const publicIdValue = normalizeText(verified.payload?.externalAccountIdentifiers?.obfuscatedExternalAccountId, 40).toUpperCase();
    if (publicIdValue) owner = await db.query('SELECT email FROM crewcheck_platform_profiles WHERE public_id=$1 LIMIT 1', [publicIdValue]);
  }
  if (!owner.rows[0]) return sendJson(res, 200, { ok: true, ignored: true, message: 'Compra sem conta CrewCheck conciliável.' });
  await saveGoogleSubscription(db, owner.rows[0].email, purchaseToken, verified);
  await db.query("INSERT IGNORE INTO crewcheck_platform_webhook_events(provider,event_id,payload_hash) VALUES('google_play',$1,$2)", [eventId, sha256(JSON.stringify(notification))]);
  return sendJson(res, 200, { ok: true });
}

function meaningfulComplianceAlerts(compliance = {}) {
  const values = [...(Array.isArray(compliance?.alerts) ? compliance.alerts : []), ...(Array.isArray(compliance?.warnings) ? compliance.warnings : [])];
  const seen = new Set();
  return values.filter((item) => {
    const title = normalizeText(item?.title || item?.rule || item?.code, 160);
    const description = normalizeText(item?.description || item?.message || item?.detail, 400);
    const severity = normalizeText(item?.severity || item?.level, 30).toLowerCase();
    if ((!title && !description) || !['critical', 'error', 'warning', 'high'].includes(severity)) return false;
    const key = `${title}|${description}|${severity}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rosterSummary(row) {
  if (!row) return null;
  const roster = row.roster || {};
  const compliance = row.compliance || {};
  const alerts = meaningfulComplianceAlerts(compliance);
  return {
    id: row.id,
    createdAt: row.created_at || row.updated_at,
    crewName: roster.crewName || roster.name || null,
    crewId: roster.crewId || roster.registration || null,
    base: roster.base || null,
    rank: roster.rank || roster.role || null,
    airline: roster.airline || roster.company || null,
    year: Number(roster.year || String(row.roster_key || '').slice(0, 4)) || null,
    month: Number(roster.month || String(row.roster_key || '').slice(5, 7)) || null,
    sourceFileName: row.source_name || null,
    score: Number(compliance.score ?? compliance.complianceScore ?? 0),
    intensityScore: Number(compliance.intensityScore ?? compliance.workloadScore ?? 0),
    alertsCount: alerts.length,
    criticalAlertsCount: alerts.filter((item) => ['critical', 'error', 'high'].includes(normalizeText(item?.severity || item?.level, 30).toLowerCase())).length,
    checksum: row.fingerprint || null,
    isActive: Boolean(row.active),
    activeAt: row.active ? row.updated_at : null,
    deletedAt: null,
    importStatus: 'ready',
    storageProvider: 'database',
    sourceStoragePath: null,
    sourceFileSizeBytes: null,
    storageUploadedAt: null,
    storageReady: true,
  };
}

async function saveRosterMysql(context, { id, key, roster, compliance, gym, sourceName, fingerprint, stays }) {
  const client = await context.db.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE crewcheck_platform_rosters SET active=FALSE WHERE owner_email=$1', [context.identity.email]);
    await client.query(`
      INSERT INTO crewcheck_platform_rosters(id,owner_email,roster_key,roster,compliance,gym,source_name,fingerprint,active)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
      ON DUPLICATE KEY UPDATE
        roster=VALUES(roster),compliance=VALUES(compliance),gym=VALUES(gym),
        source_name=VALUES(source_name),fingerprint=VALUES(fingerprint),active=TRUE,updated_at=CURRENT_TIMESTAMP(3)`,
    [id, context.identity.email, key, JSON.stringify(roster), JSON.stringify(compliance), JSON.stringify(gym), sourceName, fingerprint]);

    const existing = await client.query(
      'SELECT id,stay_date,hotel_key FROM crewcheck_platform_stays WHERE owner_email=$1 AND roster_key=$2',
      [context.identity.email, key],
    );
    const expected = new Set(stays.map((stay) => `${stay.stayDate}|${stay.hotelKey}`));
    for (const row of existing.rows) {
      const stayDate = parseDateOnly(row.stay_date);
      if (!expected.has(`${stayDate}|${row.hotel_key}`)) {
        await client.query('DELETE FROM crewcheck_platform_stays WHERE id=$1 AND owner_email=$2', [row.id, context.identity.email]);
      }
    }
    for (const stay of stays) {
      const rule = await client.query(
        'SELECT lead_minutes FROM crewcheck_platform_hotel_rules WHERE owner_email=$1 AND hotel_key=$2',
        [context.identity.email, stay.hotelKey],
      );
      await client.query(`
        INSERT INTO crewcheck_platform_stays(id,owner_email,roster_key,stay_date,hotel_key,hotel_name,airport,presentation_time,lead_minutes)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON DUPLICATE KEY UPDATE
          roster_key=VALUES(roster_key),hotel_name=VALUES(hotel_name),airport=VALUES(airport),
          presentation_time=COALESCE(VALUES(presentation_time),presentation_time),
          lead_minutes=COALESCE(lead_minutes,VALUES(lead_minutes)),updated_at=CURRENT_TIMESTAMP(3)`,
      [crypto.randomUUID(), context.identity.email, key, stay.stayDate, stay.hotelKey, stay.hotelName, stay.airport, stay.presentationTime, rule.rows[0]?.lead_minutes || null]);
    }
    const saved = await client.query(
      'SELECT id,roster_key,updated_at FROM crewcheck_platform_rosters WHERE owner_email=$1 AND roster_key=$2 LIMIT 1',
      [context.identity.email, key],
    );
    const full = await client.query(
      'SELECT * FROM crewcheck_platform_rosters WHERE owner_email=$1 AND roster_key=$2 LIMIT 1',
      [context.identity.email, key],
    );
    await client.query('COMMIT');
    return { saved: saved.rows[0], full: full.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function handleRosterSync(req, res) {
  const body = await readBody(req, 4_500_000);
  const context = await requireMain(req, res, body);
  if (!context) return;
  const roster = sanitizeRoster(body.roster);
  if (!Array.isArray(roster.days) || !roster.days.length) return sendJson(res, 400, { ok: false, message: 'A escala não possui dias válidos.' });
  const firstDate = parseDateOnly(roster.days.find((day) => parseDateOnly(day?.date))?.date);
  const inferredYear = Number(firstDate?.slice(0, 4));
  const inferredMonth = Number(firstDate?.slice(5, 7));
  roster.year = Number(roster.year) || inferredYear;
  roster.month = Number(roster.month) || inferredMonth;
  if (!Number.isInteger(roster.year) || roster.year < 2000 || roster.year > 2100 || !Number.isInteger(roster.month) || roster.month < 1 || roster.month > 12) {
    return sendJson(res, 400, { ok: false, code: 'ROSTER_PERIOD_REQUIRED', message: 'Não foi possível confirmar mês e ano da escala.' });
  }
  const key = rosterKey(roster);
  const id = crypto.randomUUID();
  const compliance = body.compliance && typeof body.compliance === 'object' ? body.compliance : {};
  const gym = Array.isArray(body.gym) ? body.gym.slice(0, 370) : [];
  const rosterStaysByKey = new Map();
  for (const day of roster.days) {
    const hotelName = normalizeText(day.hotel || day.hotelName, 180);
    const stayDate = parseDateOnly(day.date);
    if (!hotelName || !stayDate) continue;
    const hKey = hotelKey(hotelName);
    rosterStaysByKey.set(`${stayDate}|${hKey}`, {
      stayDate,
      hotelKey: hKey,
      hotelName,
      airport: normalizeText(day.destination || day.airport, 8).toUpperCase(),
      presentationTime: normalizeText(day.hotelPresentation || day.presentation || day.dutyReport, 10),
    });
  }
  const saved = await saveRosterMysql(context, {
    id, key, roster, compliance, gym,
    sourceName: normalizeText(body.sourceName || body.sourceFileName, 180),
    fingerprint: rosterFingerprint(roster),
    stays: [...rosterStaysByKey.values()],
  });
  return sendJson(res, 200, {
    ok: true, saved: saved.saved, roster: rosterSummary(saved.full),
    databasePrimary: true, message: 'Escala ativa salva no banco principal.',
  });
}

async function handleRosterActive(req, res) {
  const context = await requireMain(req, res);
  if (!context) return;
  const result = await context.db.query('SELECT id,roster_key,roster,compliance,gym,source_name,updated_at FROM crewcheck_platform_rosters WHERE owner_email=$1 AND active=TRUE ORDER BY updated_at DESC LIMIT 1', [context.identity.email]);
  return sendJson(res, 200, { ok: true, roster: result.rows[0] || null, databasePrimary: true });
}

async function handleStays(req, res) {
  const body = req.method === 'POST' || req.method === 'PATCH' ? await readBody(req, 500_000) : {};
  const context = await requireMain(req, res, body);
  if (!context) return;
  if (!await requirePremium(context, res, 'Hotéis e aprendizado de apresentação')) return;
  if (req.method !== 'GET') {
    const id = normalizeText(body.id, 80);
    const hotelName = normalizeText(body.hotelName, 180);
    const stayDate = parseDateOnly(body.stayDate);
    if (!id && (!hotelName || !stayDate)) return sendJson(res, 400, { ok: false, message: 'Informe o pernoite que deseja editar.' });
    const hKey = hotelKey(hotelName);
    const lead = Number(body.leadMinutes);
    const leadMinutes = Number.isFinite(lead) && lead >= 0 && lead <= 720 ? Math.round(lead) : null;
    if (body.learnRule && hKey && leadMinutes !== null) {
      await context.db.query(`
        INSERT INTO crewcheck_platform_hotel_rules(owner_email,hotel_key,hotel_name,lead_minutes,sample_count)
        VALUES($1,$2,$3,$4,1)
        ON DUPLICATE KEY UPDATE
          lead_minutes=ROUND((lead_minutes*sample_count+VALUES(lead_minutes))/(sample_count+1)),
          sample_count=sample_count+1,hotel_name=VALUES(hotel_name),updated_at=NOW()`,
      [context.identity.email, hKey, hotelName, leadMinutes]);
    }
    if (id) {
      await context.db.query(`UPDATE crewcheck_platform_stays
        SET hotel_name=COALESCE(NULLIF($3,''),hotel_name),hotel_key=COALESCE(NULLIF($4,''),hotel_key),
          room_cipher=IF($5,$6,room_cipher),presentation_time=COALESCE(NULLIF($7,''),presentation_time),
          lead_minutes=COALESCE($8,lead_minutes),share_same_hotel=$9,share_with_visitors=$10,updated_at=NOW()
        WHERE id=$1 AND owner_email=$2`,
      [id, context.identity.email, hotelName, hKey, Object.hasOwn(body, 'room'), encryptPrivate(body.room), normalizeText(body.presentationTime, 10), leadMinutes, Boolean(body.shareSameHotel), Boolean(body.shareWithVisitors)]);
    } else if (hotelName && stayDate) {
      await context.db.query(`
        INSERT INTO crewcheck_platform_stays(id,owner_email,stay_date,hotel_key,hotel_name,airport,room_cipher,presentation_time,lead_minutes,share_same_hotel,share_with_visitors)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON DUPLICATE KEY UPDATE
          hotel_name=VALUES(hotel_name),airport=VALUES(airport),room_cipher=VALUES(room_cipher),
          presentation_time=VALUES(presentation_time),lead_minutes=VALUES(lead_minutes),
          share_same_hotel=VALUES(share_same_hotel),share_with_visitors=VALUES(share_with_visitors),updated_at=NOW()`,
      [crypto.randomUUID(), context.identity.email, stayDate, hKey, hotelName, normalizeText(body.airport, 8).toUpperCase(), encryptPrivate(body.room), normalizeText(body.presentationTime, 10), leadMinutes, Boolean(body.shareSameHotel), Boolean(body.shareWithVisitors)]);
    }
  }
  const result = await context.db.query(`SELECT s.*,r.sample_count FROM crewcheck_platform_stays s
    LEFT JOIN crewcheck_platform_hotel_rules r ON r.owner_email=s.owner_email AND r.hotel_key=s.hotel_key
    WHERE s.owner_email=$1 ORDER BY s.stay_date DESC LIMIT 120`, [context.identity.email]);
  const stays = result.rows.map((row) => ({ id: row.id, rosterKey: row.roster_key, stayDate: row.stay_date, hotelKey: row.hotel_key, hotelName: row.hotel_name, airport: row.airport, room: decryptPrivate(row.room_cipher), presentationTime: row.presentation_time, leadMinutes: row.lead_minutes, learnedSamples: row.sample_count || 0, shareSameHotel: row.share_same_hotel, shareWithVisitors: row.share_with_visitors }));
  return sendJson(res, 200, { ok: true, stays });
}

async function handleSameHotel(req, res, url) {
  const context = await requireMain(req, res);
  if (!context) return;
  if (!await requirePremium(context, res, 'Colegas no mesmo hotel')) return;
  const hKey = hotelKey(url.searchParams.get('hotelKey'));
  const date = parseDateOnly(url.searchParams.get('date'));
  if (!hKey || !date) return sendJson(res, 400, { ok: false, message: 'Informe hotel e data.' });
  const result = await context.db.query(`SELECT p.display_name,p.public_id FROM crewcheck_platform_stays s JOIN crewcheck_platform_profiles p ON p.email=s.owner_email WHERE s.hotel_key=$1 AND s.stay_date=$2 AND s.share_same_hotel=TRUE AND s.owner_email<>$3 ORDER BY p.display_name LIMIT 30`, [hKey, date, context.identity.email]);
  return sendJson(res, 200, { ok: true, companions: result.rows.map((row) => ({ displayName: row.display_name, publicId: row.public_id })), privacy: 'Número do quarto nunca é exibido a colegas.' });
}

async function handleVisitors(req, res) {
  const body = req.method === 'POST' ? await readBody(req, 500_000) : {};
  const context = await requireMain(req, res, body);
  if (!context) return;
  if (!await requirePremium(context, res, 'Modo visitante')) return;
  if (req.method === 'POST') {
    const email = safeEmail(body.email);
    if (!email) return sendJson(res, 400, { ok: false, message: 'Informe o e-mail do visitante.' });
    const token = crypto.randomBytes(32).toString('base64url');
    const telegramToken = crypto.randomBytes(32).toString('base64url');
    const password = temporaryPassword();
    const id = crypto.randomUUID();
    const permissions = allowedPermissions(body.permissions);
    const displayName = normalizeText(body.displayName || email.split('@')[0], 120);
    const telegram = normalizeText(body.telegram, 80).replace(/^@/, '');
    await context.db.query(`
      INSERT INTO crewcheck_platform_visitors(id,owner_email,email,display_name,telegram,password_hash,invite_token_hash,telegram_token_hash,permissions,status,must_change_password)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'invited',TRUE)
      ON DUPLICATE KEY UPDATE
        id=VALUES(id),display_name=VALUES(display_name),telegram=VALUES(telegram),telegram_chat_id=NULL,
        password_hash=VALUES(password_hash),invite_token_hash=VALUES(invite_token_hash),
        telegram_token_hash=VALUES(telegram_token_hash),permissions=VALUES(permissions),
        status='invited',must_change_password=TRUE,updated_at=NOW()`,
    [id, context.identity.email, email, displayName, telegram, passwordHash(password), sha256(token), sha256(telegramToken), JSON.stringify(permissions)]);
    const saved = await context.db.query('SELECT id FROM crewcheck_platform_visitors WHERE owner_email=$1 AND email=$2 LIMIT 1', [context.identity.email, email]);
    const link = `${publicBaseUrl(req)}/visitor?token=${encodeURIComponent(token)}`;
    const bot = env('TELEGRAM_BOT_USERNAME', env('CREWCHECK_TELEGRAM_BOT_USERNAME', 'crewchecknotify_bot')).replace(/^@/, '');
    const telegramLink = `https://t.me/${bot}?start=visitor_${telegramToken}`;
    const safeOwnerName = escapeHtml(context.profile.display_name);
    const safeLink = escapeHtml(link);
    const safeTelegramLink = escapeHtml(telegramLink);
    const safePassword = escapeHtml(password);
    const mail = await sendSystemEmail({
      to: email,
      subject: `${context.profile.display_name} convidou você para acompanhar a escala no CrewCheck`,
      text: `Você recebeu acesso de visitante ao CrewCheck.\n\nLink: ${link}\nSenha temporária: ${password}\n\nNo primeiro acesso, defina uma nova senha. O titular controla e pode revogar todas as permissões.\nTelegram: ${telegramLink}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px"><h1>Convite CrewCheck</h1><p><b>${safeOwnerName}</b> convidou você para acompanhar informações selecionadas da escala.</p><p><a href="${safeLink}" style="display:inline-block;padding:14px 20px;border-radius:12px;background:#0b5678;color:#fff;text-decoration:none;font-weight:bold">Aceitar convite</a></p><p>Senha temporária: <b>${safePassword}</b></p><p>Você deverá criar outra senha no primeiro acesso.</p><p><a href="${safeTelegramLink}">Vincular Telegram</a></p></div>`,
    });
    return sendJson(res, 200, { ok: true, id: saved.rows[0]?.id || id, emailSent: mail.ok, link: mail.ok ? undefined : link, temporaryPassword: mail.ok ? undefined : password, telegramLink, permissions, message: mail.ok ? 'Convite enviado pelo CrewCheck.' : 'Convite criado. O e-mail não está configurado; compartilhe o link e a senha temporária exibidos agora.' });
  }
  const result = await context.db.query('SELECT id,email,display_name,telegram,permissions,status,must_change_password,last_login_at,created_at FROM crewcheck_platform_visitors WHERE owner_email=$1 ORDER BY created_at DESC', [context.identity.email]);
  return sendJson(res, 200, { ok: true, visitors: result.rows });
}

async function handleVisitorRevoke(req, res, id) {
  const context = await requireMain(req, res);
  if (!context) return;
  await context.db.query("UPDATE crewcheck_platform_visitors SET status='revoked',telegram_chat_id=NULL,invite_token_hash=$3,telegram_token_hash=$4,updated_at=NOW() WHERE id=$1 AND owner_email=$2", [id, context.identity.email, retiredTokenHash(), retiredTokenHash()]);
  return sendJson(res, 200, { ok: true, message: 'Acesso do visitante revogado.' });
}

async function handleVisitorUpdate(req, res, id) {
  const body = await readBody(req, 300_000);
  const context = await requireMain(req, res, body);
  if (!context) return;
  if (!await requirePremium(context, res, 'Permissões do visitante')) return;
  const permissions = allowedPermissions(body.permissions);
  const visitorId = normalizeText(id, 80);
  const updated = await context.db.query(`
    UPDATE crewcheck_platform_visitors SET permissions=$3,updated_at=NOW()
    WHERE id=$1 AND owner_email=$2 AND status<>'revoked'`,
  [visitorId, context.identity.email, JSON.stringify(permissions)]);
  if (!updated.rowCount) return sendJson(res, 404, { ok: false, message: 'Visitante ativo ou convidado não localizado.' });
  const result = await context.db.query(
    'SELECT id,email,display_name,telegram,permissions,status,must_change_password,last_login_at,created_at FROM crewcheck_platform_visitors WHERE id=$1 AND owner_email=$2 LIMIT 1',
    [visitorId, context.identity.email],
  );
  return sendJson(res, 200, { ok: true, visitor: result.rows[0], message: 'Permissões atualizadas imediatamente.' });
}

async function handleVisitorInviteInfo(req, res, url) {
  const token = normalizeText(url.searchParams.get('token'), 500);
  const db = await pool();
  if (!db || !token) return sendJson(res, 404, { ok: false, message: 'Convite não localizado.' });
  const result = await db.query("SELECT id,email,display_name,status,must_change_password FROM crewcheck_platform_visitors WHERE invite_token_hash=$1 AND status='invited' LIMIT 1", [sha256(token)]);
  const visitor = result.rows[0];
  if (!visitor) return sendJson(res, 404, { ok: false, message: 'Convite inválido, expirado ou revogado.' });
  return sendJson(res, 200, { ok: true, visitor: { email: visitor.email, displayName: visitor.display_name, mustChangePassword: visitor.must_change_password } });
}

async function handleVisitorAccept(req, res) {
  const body = await readBody(req, 300_000);
  const db = await pool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  const token = normalizeText(body.token, 500);
  const email = safeEmail(body.email);
  const temporary = String(body.temporaryPassword || '');
  const nextPassword = String(body.newPassword || '');
  if (!email || temporary.length > 256 || nextPassword.length < 10 || nextPassword.length > 256) return sendJson(res, 400, { ok: false, message: 'Confira o e-mail e use uma nova senha de 10 a 256 caracteres.' });
  const throttleId = await checkAuthThrottle(db, req, email);
  const result = await db.query("SELECT * FROM crewcheck_platform_visitors WHERE invite_token_hash=$1 AND email=$2 AND status='invited' LIMIT 1", [sha256(token), email]);
  const visitor = result.rows[0];
  if (!visitor || !passwordMatches(temporary, visitor.password_hash)) {
    await recordAuthFailure(db, throttleId);
    return sendJson(res, 401, { ok: false, message: 'Convite, e-mail ou senha temporária inválidos.' });
  }
  await clearAuthFailures(db, throttleId);
  await db.query("UPDATE crewcheck_platform_visitors SET password_hash=$2,invite_token_hash=$3,status='active',must_change_password=FALSE,last_login_at=NOW(),updated_at=NOW() WHERE id=$1", [visitor.id, passwordHash(nextPassword), retiredTokenHash()]);
  const jwt = issueVisitorJwt(visitor);
  const secure = env('NODE_ENV').toLowerCase() === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `crewcheck_visitor_token=${encodeURIComponent(jwt)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`);
  return sendJson(res, 200, { ok: true, message: 'Convite aceito. Sua senha foi definida.' });
}

async function handleVisitorLogin(req, res) {
  const body = await readBody(req, 200_000);
  const db = await pool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  const email = safeEmail(body.email);
  const password = String(body.password || '');
  if (!email || !password || password.length > 256) return sendJson(res, 401, { ok: false, message: 'E-mail ou senha inválidos.' });
  const throttleId = await checkAuthThrottle(db, req, email);
  const result = await db.query("SELECT * FROM crewcheck_platform_visitors WHERE email=$1 AND status='active' ORDER BY updated_at DESC LIMIT 20", [email]);
  const matches = result.rows.filter((candidate) => passwordMatches(password, candidate.password_hash));
  const requestedOwner = normalizeText(body.ownerPublicId, 20).toUpperCase();
  const ownerEmails = [...new Set(matches.map((item) => item.owner_email).filter(Boolean))];
  const ownerParams = ownerEmails.map((_email, index) => `$${index + 1}`).join(',');
  let visitor = matches[0];
  if (matches.length > 1 && requestedOwner) {
    const owners = await db.query(`SELECT email,public_id FROM crewcheck_platform_profiles WHERE email IN (${ownerParams || 'NULL'})`, ownerEmails);
    const selectedEmail = owners.rows.find((owner) => owner.public_id === requestedOwner)?.email;
    visitor = matches.find((candidate) => candidate.owner_email === selectedEmail);
  }
  if (!visitor || (matches.length > 1 && !requestedOwner)) {
    if (matches.length > 1) {
      const owners = await db.query(`SELECT display_name,public_id FROM crewcheck_platform_profiles WHERE email IN (${ownerParams || 'NULL'})`, ownerEmails);
      return sendJson(res, 409, { ok: false, code: 'OWNER_SELECTION_REQUIRED', owners: owners.rows.map((owner) => ({ displayName: owner.display_name, publicId: owner.public_id })), message: 'Escolha qual convite deseja acessar.' });
    }
    await recordAuthFailure(db, throttleId);
    return sendJson(res, 401, { ok: false, message: 'E-mail ou senha inválidos.' });
  }
  await clearAuthFailures(db, throttleId);
  await db.query('UPDATE crewcheck_platform_visitors SET last_login_at=NOW() WHERE id=$1', [visitor.id]);
  const jwt = issueVisitorJwt(visitor);
  const secure = env('NODE_ENV').toLowerCase() === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `crewcheck_visitor_token=${encodeURIComponent(jwt)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`);
  return sendJson(res, 200, { ok: true, message: 'Acesso de visitante liberado.' });
}

async function handleVisitorData(req, res) {
  const identity = visitorIdentity(req);
  if (!identity) return sendJson(res, 401, { ok: false, message: 'Acesso de visitante expirado.' });
  const db = await pool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  const result = await db.query("SELECT * FROM crewcheck_platform_visitors WHERE id=$1 AND owner_email=$2 AND status='active' LIMIT 1", [identity.visitorId, identity.ownerEmail]);
  const visitor = result.rows[0];
  if (!visitor) return sendJson(res, 403, { ok: false, message: 'Acesso revogado.' });
  const ownerProfileResult = await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=$1', [identity.ownerEmail]);
  const ownerProfile = ownerProfileResult.rows[0];
  if (!ownerProfile || !(await subscriptionStatus(db, ownerProfile)).premiumAccess) return sendJson(res, 402, { ok: false, code: 'OWNER_PREMIUM_REQUIRED', message: 'Este acesso está pausado porque o plano Premium do titular não está ativo.' });
  const permissions = allowedPermissions(visitor.permissions);
  const owner = await db.query('SELECT display_name,public_id FROM crewcheck_platform_profiles WHERE email=$1', [identity.ownerEmail]);
  const rosterResult = permissions.roster || permissions.map || permissions.hotels || permissions.presentation || permissions.radar ? await db.query('SELECT roster_key,roster,updated_at FROM crewcheck_platform_rosters WHERE owner_email=$1 AND active=TRUE ORDER BY updated_at DESC LIMIT 1', [identity.ownerEmail]) : { rows: [] };
  const rosterRow = rosterResult.rows[0] || null;
  const roster = rosterForPermissions(rosterRow?.roster || null, permissions);
  const staysResult = permissions.hotels ? await db.query('SELECT id,stay_date,hotel_name,airport,room_cipher,presentation_time,lead_minutes,share_with_visitors FROM crewcheck_platform_stays WHERE owner_email=$1 AND share_with_visitors=TRUE ORDER BY stay_date LIMIT 90', [identity.ownerEmail]) : { rows: [] };
  const stays = staysResult.rows.map((row) => ({ id: row.id, stayDate: row.stay_date, hotelName: row.hotel_name, airport: row.airport, room: permissions.room ? decryptPrivate(row.room_cipher) : null, presentationTime: permissions.presentation ? row.presentation_time : null, leadMinutes: permissions.presentation ? row.lead_minutes : null }));
  return sendJson(res, 200, { ok: true, visitor: { displayName: visitor.display_name, permissions }, owner: owner.rows[0] || null, roster, stays, privacy: 'O titular pode alterar ou revogar este acesso a qualquer momento.' });
}

async function handleVisitorLogout(req, res) {
  const secure = env('NODE_ENV').toLowerCase() === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `crewcheck_visitor_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  return sendJson(res, 200, { ok: true, message: 'Sessão de visitante encerrada.' });
}

function emergencyLocation(body = {}) {
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return '';
  return `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

async function notifyOwnerEmergency(db, visitor, body = {}) {
  const recent = await db.query("SELECT COUNT(*) count FROM crewcheck_platform_emergencies WHERE visitor_id=$1 AND created_at>DATE_SUB(NOW(), INTERVAL 10 MINUTE)", [visitor.id]);
  if (Number(recent.rows[0]?.count || 0) >= 3) throw Object.assign(new Error('Aguarde alguns minutos antes de enviar outro pedido de ajuda.'), { status: 429 });
  const message = normalizeText(body.message || 'Preciso de ajuda. Entre em contato comigo assim que possível.', 800);
  const locationUrl = emergencyLocation(body);
  const owner = await db.query('SELECT display_name FROM crewcheck_platform_profiles WHERE email=$1 LIMIT 1', [visitor.owner_email]);
  const ownerName = owner.rows[0]?.display_name || 'Tripulante';
  const telegramState = await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1 LIMIT 1', [`link-email:${visitor.owner_email}`]).catch(() => ({ rows: [] }));
  const telegramChatId = telegramState.rows[0]?.payload?.chatId || '';
  const alertText = [
    'ALERTA DE AJUDA — CrewCheck',
    `Visitante: ${visitor.display_name} (${visitor.email})`,
    `Mensagem: ${message}`,
    locationUrl ? `Localização compartilhada: ${locationUrl}` : '',
    'Confirme o contato diretamente com a pessoa. Em risco imediato, acione os serviços públicos de emergência.',
  ].filter(Boolean).join('\n');
  const [mail, telegram] = await Promise.all([
    sendSystemEmail({
      to: visitor.owner_email,
      subject: `Pedido de ajuda de ${visitor.display_name} no CrewCheck`,
      text: alertText,
      html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px"><h1>Pedido de ajuda</h1><p>Olá, ${escapeHtml(ownerName)}.</p><p><b>${escapeHtml(visitor.display_name)}</b> enviou um pedido de ajuda pelo CrewCheck.</p><p>${escapeHtml(message)}</p>${locationUrl ? `<p><a href="${escapeHtml(locationUrl)}">Ver localização compartilhada</a></p>` : ''}<p>Confirme o contato diretamente. Em risco imediato, acione os serviços públicos de emergência.</p></div>`,
    }),
    sendTelegramDirect(telegramChatId, alertText),
  ]);
  const channels = { email: mail.ok, telegram: telegram.ok };
  await db.query('INSERT INTO crewcheck_platform_emergencies(id,visitor_id,owner_email,message,location_url,channels) VALUES($1,$2,$3,$4,$5,$6)', [crypto.randomUUID(), visitor.id, visitor.owner_email, message, locationUrl || null, JSON.stringify(channels)]);
  return channels;
}

async function handleVisitorEmergency(req, res) {
  const identity = visitorIdentity(req);
  if (!identity) return sendJson(res, 401, { ok: false, message: 'Acesso de visitante expirado.' });
  const body = await readBody(req, 200_000);
  const db = await pool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  const result = await db.query("SELECT * FROM crewcheck_platform_visitors WHERE id=$1 AND owner_email=$2 AND status='active' LIMIT 1", [identity.visitorId, identity.ownerEmail]);
  const visitor = result.rows[0];
  if (!visitor || !allowedPermissions(visitor.permissions).emergency) return sendJson(res, 403, { ok: false, message: 'O titular não habilitou pedidos de ajuda para este acesso.' });
  const channels = await notifyOwnerEmergency(db, visitor, body);
  return sendJson(res, channels.email || channels.telegram ? 200 : 503, { ok: channels.email || channels.telegram, channels, message: channels.email || channels.telegram ? 'Pedido de ajuda enviado ao titular.' : 'Nenhum canal do titular está disponível agora. Em risco imediato, use os serviços públicos de emergência.' });
}

function visitorDaySummary(day) {
  const date = parseDateOnly(day?.date);
  const legs = Array.isArray(day?.legs) ? day.legs : [];
  const first = legs[0] || {};
  const last = legs[legs.length - 1] || first;
  const route = first.origin && last.destination ? `${first.origin} → ${last.destination}` : '';
  return `${date || 'Data a confirmar'} — ${normalizeText(day?.type || day?.pairingCode || route || 'Programação', 120)}${route ? ` · ${route}` : ''}`;
}

export async function handlePlatformVisitorTelegram(message = {}, text = '', send = sendTelegramDirect) {
  const chatId = String(message?.chat?.id || '');
  if (!chatId) return false;
  const db = await pool();
  if (!db) return false;
  const bind = String(text || '').trim().match(/^\/start(?:@\S+)?\s+visitor_([A-Za-z0-9_-]{20,80})$/i);
  if (bind) {
    const visitorResult = await db.query("SELECT * FROM crewcheck_platform_visitors WHERE telegram_token_hash=$1 AND status IN ('invited','active') LIMIT 1", [sha256(bind[1])]);
    const visitor = visitorResult.rows[0];
    if (!visitor) {
      await send(chatId, 'Este vínculo de visitante expirou ou foi revogado. Peça um novo convite ao titular.');
      return true;
    }
    await db.query('UPDATE crewcheck_platform_visitors SET telegram_chat_id=$2,telegram_token_hash=$3,updated_at=NOW() WHERE id=$1', [visitor.id, chatId, retiredTokenHash()]);
    await send(chatId, visitor.status === 'active' ? 'Telegram vinculado ao acesso de visitante. Use /ajuda para ver os comandos permitidos.' : 'Telegram vinculado. Conclua o primeiro acesso pelo link recebido no e-mail e depois use /ajuda.');
    return true;
  }
  const visitorResult = await db.query("SELECT * FROM crewcheck_platform_visitors WHERE telegram_chat_id=$1 AND status IN ('invited','active') ORDER BY updated_at DESC LIMIT 1", [chatId]);
  const visitor = visitorResult.rows[0];
  if (!visitor) return false;
  if (visitor.status !== 'active') {
    await send(chatId, 'Conclua o primeiro acesso pelo link do convite antes de consultar a escala.');
    return true;
  }
  const permissions = allowedPermissions(visitor.permissions);
  const command = normalizeText(text, 200).toLowerCase().split(/\s+/)[0];
  if (command === '/emergencia' || command === '/ajuda_agora') {
    if (!permissions.emergency) await send(chatId, 'O titular não habilitou pedidos de ajuda neste acesso.');
    else {
      const channels = await notifyOwnerEmergency(db, visitor, { message: String(text).replace(/^\/\S+\s*/i, '') || 'Preciso de ajuda. Entre em contato comigo.' });
      await send(chatId, channels.email || channels.telegram ? 'Pedido de ajuda enviado ao titular.' : 'Não consegui alcançar o titular pelos canais configurados. Em risco imediato, acione os serviços públicos de emergência.');
    }
    return true;
  }
  const ownerProfile = await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=$1', [visitor.owner_email]);
  if (!ownerProfile.rows[0] || !(await subscriptionStatus(db, ownerProfile.rows[0])).premiumAccess) {
    await send(chatId, 'O acesso de visitante está pausado porque o plano Premium do titular não está ativo.');
    return true;
  }
  if (command === '/ajuda' || command === '/start' || !command.startsWith('/')) {
    await send(chatId, ['/escala — próximos dias permitidos', '/proximo — próxima programação', '/hotel — pernoite compartilhado', permissions.emergency ? '/emergencia mensagem — pedir ajuda ao titular' : ''].filter(Boolean).join('\n'));
    return true;
  }
  if (command === '/hotel') {
    if (!permissions.hotels) await send(chatId, 'O titular não compartilhou a aba de hotéis.');
    else {
      const stays = await db.query('SELECT * FROM crewcheck_platform_stays WHERE owner_email=$1 AND share_with_visitors=TRUE AND stay_date>=CURRENT_DATE ORDER BY stay_date LIMIT 3', [visitor.owner_email]);
      const lines = stays.rows.map((stay) => [stay.stay_date, stay.hotel_name, permissions.room && stay.room_cipher ? `quarto ${decryptPrivate(stay.room_cipher)}` : '', permissions.presentation && stay.presentation_time ? `apresentação ${stay.presentation_time}` : ''].filter(Boolean).join(' · '));
      await send(chatId, lines.length ? lines.join('\n') : 'Nenhum pernoite foi compartilhado agora.');
    }
    return true;
  }
  if (command === '/escala' || command === '/proximo') {
    if (!permissions.roster) await send(chatId, 'O titular não compartilhou a escala.');
    else {
      const rosterResult = await db.query('SELECT roster FROM crewcheck_platform_rosters WHERE owner_email=$1 AND active=TRUE ORDER BY updated_at DESC LIMIT 1', [visitor.owner_email]);
      const today = new Date().toISOString().slice(0, 10);
      const days = (rosterResult.rows[0]?.roster?.days || []).filter((day) => !parseDateOnly(day?.date) || parseDateOnly(day?.date) >= today).slice(0, command === '/proximo' ? 1 : 7);
      await send(chatId, days.length ? days.map(visitorDaySummary).join('\n') : 'Nenhuma programação futura compartilhada.');
    }
    return true;
  }
  await send(chatId, 'Comando não disponível para visitante. Use /ajuda.');
  return true;
}

async function handleShares(req, res) {
  const body = req.method === 'POST' ? await readBody(req, 500_000) : {};
  const context = await requireMain(req, res, body);
  if (!context) return;
  if (!await requirePremium(context, res, 'Compartilhamentos revogáveis')) return;
  if (!await requirePlatformTable(context, res, 'crewcheck_platform_shares', 'O QR Code e o compartilhamento')) return;
  if (req.method === 'POST') {
    const token = crypto.randomBytes(32).toString('base64url');
    const id = crypto.randomUUID();
    const kind = ['roster', 'comparison', 'visitor'].includes(body.kind) ? body.kind : 'roster';
    const expiresHours = Math.min(24 * 30, Math.max(1, Number(body.expiresHours || 72)));
    const expiresAt = new Date(Date.now() + expiresHours * 3600000);
    const permissions = allowedPermissions(body.permissions || { roster: true, map: true });
    await context.db.query(
      'INSERT INTO crewcheck_platform_shares(id,owner_email,token_hash,kind,roster_key,permissions,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [id, context.identity.email, sha256(token), kind, normalizeText(body.rosterKey, 20) || null, JSON.stringify(permissions), expiresAt],
    );
    const url = `${publicBaseUrl(req)}/share/${token}`;
    return sendJson(res, 200, { ok: true, id, url, token, expiresAt, permissions, revocable: true, message: 'Link temporário criado. O QR deve conter somente este link revogável.' });
  }
  const result = await context.db.query('SELECT id,kind,roster_key,permissions,expires_at,revoked_at,created_at FROM crewcheck_platform_shares WHERE owner_email=$1 ORDER BY created_at DESC LIMIT 100', [context.identity.email]);
  return sendJson(res, 200, { ok: true, shares: result.rows });
}
async function handleSharePublic(req, res, token) {
  const db = await pool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  if (!await platformTableReady(db, 'crewcheck_platform_shares')) return sendJson(res, 503, { ok: false, code: 'DATABASE_MIGRATION_REQUIRED', message: 'O compartilhamento aguarda a migration do banco configurado.' });
  const shareResult = await db.query('SELECT * FROM crewcheck_platform_shares WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>NOW() LIMIT 1', [sha256(token)]);
  const share = shareResult.rows[0];
  if (!share) return sendJson(res, 404, { ok: false, message: 'Compartilhamento expirado ou revogado.' });
  const permissions = allowedPermissions(share.permissions);
  const owner = await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=$1', [share.owner_email]);
  if (!owner.rows[0] || !(await subscriptionStatus(db, owner.rows[0])).premiumAccess) return sendJson(res, 410, { ok: false, code: 'SHARE_PAUSED', message: 'Este compartilhamento não está mais disponível.' });
  const roster = share.roster_key
    ? await db.query('SELECT roster_key,roster,updated_at FROM crewcheck_platform_rosters WHERE owner_email=$1 AND roster_key=$2 ORDER BY active DESC,updated_at DESC LIMIT 1', [share.owner_email, share.roster_key])
    : await db.query('SELECT roster_key,roster,updated_at FROM crewcheck_platform_rosters WHERE owner_email=$1 ORDER BY active DESC,updated_at DESC LIMIT 1', [share.owner_email]);
  const payload = roster.rows[0]?.roster || null;
  const selectedRosterKey = roster.rows[0]?.roster_key || null;
  const staysResult = permissions.hotels && selectedRosterKey ? await db.query('SELECT stay_date,hotel_name,airport,room_cipher,presentation_time,lead_minutes FROM crewcheck_platform_stays WHERE owner_email=$1 AND roster_key=$2 AND share_with_visitors=TRUE ORDER BY stay_date LIMIT 90', [share.owner_email, selectedRosterKey]) : { rows: [] };
  const stays = staysResult.rows.map((stay) => ({
    stayDate: stay.stay_date, hotelName: stay.hotel_name, airport: stay.airport,
    room: permissions.room ? decryptPrivate(stay.room_cipher) : null,
    presentationTime: permissions.presentation ? stay.presentation_time : null,
    leadMinutes: permissions.presentation ? stay.lead_minutes : null,
  }));
  return sendJson(res, 200, { ok: true, owner: { display_name: owner.rows[0].display_name, public_id: owner.rows[0].public_id }, kind: share.kind, permissions, roster: rosterForPermissions(payload, permissions), stays, expiresAt: share.expires_at });
}

async function handleShareRevoke(req, res, id) {
  const context = await requireMain(req, res);
  if (!context) return;
  await context.db.query('UPDATE crewcheck_platform_shares SET revoked_at=NOW() WHERE id=$1 AND owner_email=$2', [id, context.identity.email]);
  return sendJson(res, 200, { ok: true, message: 'Compartilhamento revogado.' });
}

async function handleConnections(req, res) {
  const body = req.method === 'POST' || req.method === 'PATCH' ? await readBody(req, 300_000) : {};
  const context = await requireMain(req, res, body);
  if (!context) return;
  if (!await requirePremium(context, res, 'Comparação de escala')) return;
  if (req.method === 'POST') {
    const targetEmail = safeEmail(body.email || body.publicId);
    const targetId = normalizeText(body.publicId, 20).toUpperCase();
    const target = targetEmail
      ? await context.db.query('SELECT email,display_name,public_id FROM crewcheck_platform_profiles WHERE email=$1 LIMIT 1', [targetEmail])
      : await context.db.query('SELECT email,display_name,public_id FROM crewcheck_platform_profiles WHERE public_id=$1 LIMIT 1', [targetId]);
    if (!target.rows[0] || target.rows[0].email === context.identity.email) return sendJson(res, 404, { ok: false, message: 'ID CrewCheck não localizado.' });
    await context.db.query(
      `INSERT INTO crewcheck_platform_connections(id,requester_email,target_email,status,permissions)
       VALUES($1,$2,$3,'pending',$4)
       ON DUPLICATE KEY UPDATE status='pending',permissions=VALUES(permissions),updated_at=NOW()`,
      [crypto.randomUUID(), context.identity.email, target.rows[0].email, JSON.stringify({ compareRoster: true, chat: Boolean(body.chat !== false) })],
    );
  }
  if (req.method === 'PATCH') {
    const id = normalizeText(body.id, 80);
    const status = body.status === 'accepted' ? 'accepted' : 'declined';
    await context.db.query('UPDATE crewcheck_platform_connections SET status=$3,updated_at=NOW() WHERE id=$1 AND target_email=$2', [id, context.identity.email, status]);
  }
  const result = await context.db.query(`SELECT c.*,pr.display_name requester_name,pr.public_id requester_id,pt.display_name target_name,pt.public_id target_id FROM crewcheck_platform_connections c JOIN crewcheck_platform_profiles pr ON pr.email=c.requester_email JOIN crewcheck_platform_profiles pt ON pt.email=c.target_email WHERE c.requester_email=$1 OR c.target_email=$1 ORDER BY c.updated_at DESC`, [context.identity.email]);
  return sendJson(res, 200, { ok: true, connections: result.rows.map((row) => ({ id: row.id, direction: row.requester_email === context.identity.email ? 'outgoing' : 'incoming', status: row.status, person: row.requester_email === context.identity.email ? { displayName: row.target_name, publicId: row.target_id } : { displayName: row.requester_name, publicId: row.requester_id }, permissions: row.permissions })) });
}
async function handleCompare(req, res, url) {
  const context = await requireMain(req, res);
  if (!context) return;
  if (!await requirePremium(context, res, 'Comparação de escala')) return;
  const otherId = normalizeText(url.searchParams.get('publicId'), 20).toUpperCase();
  const target = await context.db.query('SELECT email,display_name,public_id FROM crewcheck_platform_profiles WHERE public_id=$1', [otherId]);
  const other = target.rows[0];
  if (!other) return sendJson(res, 404, { ok: false, message: 'ID CrewCheck não localizado.' });
  const connection = await context.db.query("SELECT 1 FROM crewcheck_platform_connections WHERE status='accepted' AND ((requester_email=$1 AND target_email=$2) OR (requester_email=$2 AND target_email=$1)) LIMIT 1", [context.identity.email, other.email]);
  if (!connection.rows[0]) return sendJson(res, 403, { ok: false, message: 'A comparação precisa ser aceita pelos dois usuários.' });
  const rosters = await context.db.query('SELECT owner_email,roster FROM crewcheck_platform_rosters WHERE active=TRUE AND owner_email IN ($1,$2) ORDER BY updated_at DESC', [context.identity.email, other.email]);
  const mine = rosters.rows.find((row) => row.owner_email === context.identity.email)?.roster;
  const theirs = rosters.rows.find((row) => row.owner_email === other.email)?.roster;
  const dayMap = (roster) => new Map((roster?.days || []).map((day) => [parseDateOnly(day.date), day]));
  const a = dayMap(mine); const b = dayMap(theirs);
  const dates = [...new Set([...a.keys(), ...b.keys()])].filter(Boolean).sort();
  const sharedStays = await context.db.query('SELECT owner_email,stay_date,hotel_key FROM crewcheck_platform_stays WHERE owner_email IN ($1,$2) AND share_same_hotel=TRUE', [context.identity.email, other.email]);
  const sharedHotelMap = new Map(sharedStays.rows.map((stay) => [`${stay.owner_email}|${parseDateOnly(stay.stay_date)}`, stay.hotel_key]));
  const rows = dates.map((date) => {
    const x = a.get(date); const y = b.get(date);
    const off = (day) => /\b(DO|DOF|DOP|DOPR|DR|OFF|FOLGA|FERIAS|FÉRIAS)\b/i.test(`${day?.type || ''} ${day?.pairingCode || ''}`) && !(day?.legs || []).length;
    const mineHotel = sharedHotelMap.get(`${context.identity.email}|${date}`);
    const otherHotel = sharedHotelMap.get(`${other.email}|${date}`);
    return { date, mine: x ? (off(x) ? 'Folga/descanso' : 'Programado') : 'Sem dado', colleague: y ? (off(y) ? 'Folga/descanso' : 'Programado') : 'Sem dado', bothFree: Boolean(x && y && off(x) && off(y)), sameHotel: Boolean(mineHotel && otherHotel && mineHotel === otherHotel) };
  });
  return sendJson(res, 200, { ok: true, colleague: { displayName: other.display_name, publicId: other.public_id }, summary: { daysCompared: rows.length, bothFree: rows.filter((row) => row.bothFree).length, sameHotel: rows.filter((row) => row.sameHotel).length }, rows, privacy: 'A comparação exibe disponibilidade agregada, não números de voo, quarto ou dados pessoais.' });
}
async function handleChat(req, res, url) {
  const body = req.method === 'POST' ? await readBody(req, 100_000) : {};
  const context = await requireMain(req, res, body);
  if (!context) return;
  if (!await requirePremium(context, res, 'Chat interno')) return;
  const otherId = normalizeText(body.publicId || url.searchParams.get('publicId'), 20).toUpperCase();
  const target = await context.db.query('SELECT email,display_name,public_id FROM crewcheck_platform_profiles WHERE public_id=$1 LIMIT 1', [otherId]);
  const other = target.rows[0];
  if (!other) return sendJson(res, 404, { ok: false, message: 'Usuário não localizado.' });
  const connection = await context.db.query("SELECT permissions FROM crewcheck_platform_connections WHERE status='accepted' AND ((requester_email=$1 AND target_email=$2) OR (requester_email=$2 AND target_email=$1)) LIMIT 1", [context.identity.email, other.email]);
  if (!connection.rows[0]?.permissions?.chat) return sendJson(res, 403, { ok: false, message: 'O chat precisa estar autorizado na conexão.' });
  const directKey = [context.identity.email, other.email].sort().join('|');
  const id = crypto.randomUUID();
  await context.db.query(
    'INSERT INTO crewcheck_platform_chat_threads(id,direct_key) VALUES($1,$2) ON DUPLICATE KEY UPDATE direct_key=VALUES(direct_key)',
    [id, directKey],
  );
  const threadResult = await context.db.query('SELECT id FROM crewcheck_platform_chat_threads WHERE direct_key=$1 LIMIT 1', [directKey]);
  const threadId = threadResult.rows[0].id;
  if (req.method === 'POST') {
    const message = normalizeText(body.message, 2000);
    if (!message) return sendJson(res, 400, { ok: false, message: 'Digite uma mensagem.' });
    const recent = await context.db.query('SELECT COUNT(*) count FROM crewcheck_platform_chat_messages WHERE thread_id=$1 AND sender_email=$2 AND created_at>DATE_SUB(NOW(), INTERVAL 1 MINUTE)', [threadId, context.identity.email]);
    if (Number(recent.rows[0]?.count || 0) >= 20) return sendJson(res, 429, { ok: false, message: 'Muitas mensagens em pouco tempo. Aguarde um minuto.' });
    await context.db.query('INSERT INTO crewcheck_platform_chat_messages(id,thread_id,sender_email,body) VALUES($1,$2,$3,$4)', [crypto.randomUUID(), threadId, context.identity.email, message]);
  }
  const messages = await context.db.query('SELECT id,sender_email,body,created_at FROM crewcheck_platform_chat_messages WHERE thread_id=$1 ORDER BY created_at DESC LIMIT 100', [threadId]);
  return sendJson(res, 200, { ok: true, threadId, person: { displayName: other.display_name, publicId: other.public_id }, messages: messages.rows.reverse().map((row) => ({ id: row.id, mine: row.sender_email === context.identity.email, body: row.body, createdAt: row.created_at })) });
}

function visitorChatKey(visitor) {
  return [visitor.owner_email, `visitor:${visitor.id}`].sort().join('|');
}

async function visitorChatThread(db, visitor) {
  const directKey = visitorChatKey(visitor);
  await db.query(
    'INSERT INTO crewcheck_platform_chat_threads(id,direct_key) VALUES($1,$2) ON DUPLICATE KEY UPDATE direct_key=VALUES(direct_key)',
    [crypto.randomUUID(), directKey],
  );
  const result = await db.query('SELECT id FROM crewcheck_platform_chat_threads WHERE direct_key=$1 LIMIT 1', [directKey]);
  return result.rows[0].id;
}

async function appendChatMessage(db, threadId, sender, value) {
  const message = normalizeText(value, 2000);
  if (!message) throw Object.assign(new Error('Digite uma mensagem.'), { status: 400 });
  const recent = await db.query('SELECT COUNT(*) count FROM crewcheck_platform_chat_messages WHERE thread_id=$1 AND sender_email=$2 AND created_at>DATE_SUB(NOW(), INTERVAL 1 MINUTE)', [threadId, sender]);
  if (Number(recent.rows[0]?.count || 0) >= 20) throw Object.assign(new Error('Muitas mensagens em pouco tempo. Aguarde um minuto.'), { status: 429 });
  await db.query('INSERT INTO crewcheck_platform_chat_messages(id,thread_id,sender_email,body) VALUES($1,$2,$3,$4)', [crypto.randomUUID(), threadId, sender, message]);
}

async function chatMessages(db, threadId, mineKey) {
  const result = await db.query('SELECT id,sender_email,body,created_at FROM crewcheck_platform_chat_messages WHERE thread_id=$1 ORDER BY created_at DESC LIMIT 100', [threadId]);
  return result.rows.reverse().map((row) => ({ id: row.id, mine: row.sender_email === mineKey, body: row.body, createdAt: row.created_at }));
}

async function handleVisitorChat(req, res) {
  const identity = visitorIdentity(req);
  if (!identity) return sendJson(res, 401, { ok: false, message: 'Acesso de visitante expirado.' });
  const body = req.method === 'POST' ? await readBody(req, 100_000) : {};
  const db = await pool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  const visitorResult = await db.query("SELECT * FROM crewcheck_platform_visitors WHERE id=$1 AND owner_email=$2 AND status='active' LIMIT 1", [identity.visitorId, identity.ownerEmail]);
  const visitor = visitorResult.rows[0];
  if (!visitor || !allowedPermissions(visitor.permissions).chat) return sendJson(res, 403, { ok: false, message: 'O titular não habilitou o chat neste acesso.' });
  const ownerResult = await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=$1 LIMIT 1', [visitor.owner_email]);
  const owner = ownerResult.rows[0];
  if (!owner || !(await subscriptionStatus(db, owner)).premiumAccess) return sendJson(res, 402, { ok: false, code: 'OWNER_PREMIUM_REQUIRED', message: 'O chat está pausado porque o plano Premium do titular não está ativo.' });
  const threadId = await visitorChatThread(db, visitor);
  const sender = `visitor:${visitor.id}`;
  if (req.method === 'POST') await appendChatMessage(db, threadId, sender, body.message);
  return sendJson(res, 200, { ok: true, threadId, person: { displayName: owner.display_name, publicId: owner.public_id }, messages: await chatMessages(db, threadId, sender) });
}

async function handleOwnerVisitorChat(req, res, visitorId) {
  const body = req.method === 'POST' ? await readBody(req, 100_000) : {};
  const context = await requireMain(req, res, body);
  if (!context) return;
  if (!await requirePremium(context, res, 'Chat com visitante')) return;
  const result = await context.db.query("SELECT * FROM crewcheck_platform_visitors WHERE id=$1 AND owner_email=$2 AND status='active' LIMIT 1", [normalizeText(visitorId, 80), context.identity.email]);
  const visitor = result.rows[0];
  if (!visitor) return sendJson(res, 404, { ok: false, message: 'Visitante ativo não localizado.' });
  if (!allowedPermissions(visitor.permissions).chat) return sendJson(res, 403, { ok: false, message: 'Habilite a permissão de chat para este visitante.' });
  const threadId = await visitorChatThread(context.db, visitor);
  if (req.method === 'POST') await appendChatMessage(context.db, threadId, context.identity.email, body.message);
  return sendJson(res, 200, { ok: true, threadId, person: { displayName: visitor.display_name, visitorId: visitor.id }, messages: await chatMessages(context.db, threadId, context.identity.email) });
}

function parkingPositionPayload(row) {
  if (!row) return null;
  let details = {};
  try { details = JSON.parse(row.notes || '{}'); } catch { details = { notes: row.notes || '' }; }
  return {
    id: row.id,
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    level: row.level_label || '',
    spot: row.spot_label || '',
    reference: normalizeText(details.reference, 240),
    notes: normalizeText(details.notes, 1000),
    accuracy: Number(details.accuracy || 0) || undefined,
    savedAt: row.parked_at,
  };
}

async function handleParking(req, res) {
  const body = req.method === 'POST' ? await readBody(req, 100_000) : {};
  const context = await requireMain(req, res, body);
  if (!context) return;
  if (!await platformTableReady(context.db, 'crewcheck_platform_parking_positions')) {
    return sendJson(res, 503, { ok: false, code: 'DATABASE_MIGRATION_REQUIRED', message: 'A sincronização de estacionamento aguarda a migration; a marcação local continua disponível.' });
  }
  if (req.method === 'DELETE') {
    await context.db.query('UPDATE crewcheck_platform_parking_positions SET active=FALSE,cleared_at=NOW() WHERE owner_email=$1 AND active=TRUE', [context.identity.email]);
    return sendJson(res, 200, { ok: true, position: null });
  }
  if (req.method === 'POST') {
    const latitude = Number(body.lat);
    const longitude = Number(body.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return sendJson(res, 400, { ok: false, message: 'Coordenadas de estacionamento inválidas.' });
    }
    const details = JSON.stringify({
      reference: normalizeText(body.reference || body.label, 240),
      notes: normalizeText(body.notes, 1000),
      accuracy: Number(body.accuracy || 0) || null,
    });
    const id = crypto.randomUUID();
    const client = await context.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE crewcheck_platform_parking_positions SET active=FALSE,cleared_at=NOW() WHERE owner_email=$1 AND active=TRUE', [context.identity.email]);
      await client.query(`INSERT INTO crewcheck_platform_parking_positions(id,owner_email,latitude,longitude,level_label,spot_label,notes,active,parked_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,TRUE,NOW())`, [
        id, context.identity.email, latitude, longitude,
        normalizeText(body.level, 80), normalizeText(body.spot, 80), details,
      ]);
      const saved = await client.query('SELECT * FROM crewcheck_platform_parking_positions WHERE id=$1 LIMIT 1', [id]);
      await client.query('COMMIT');
      return sendJson(res, 200, { ok: true, position: parkingPositionPayload(saved.rows[0]) });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  const result = await context.db.query('SELECT * FROM crewcheck_platform_parking_positions WHERE owner_email=$1 AND active=TRUE ORDER BY parked_at DESC LIMIT 1', [context.identity.email]);
  return sendJson(res, 200, { ok: true, position: parkingPositionPayload(result.rows[0]) });
}

async function handleGym(req, res, url) {
  const body = req.method === 'POST' ? await readBody(req, 200_000) : {};
  const context = await requireMain(req, res, body);
  if (!context) return;
  if (!await requirePremium(context, res, 'Presença e lotação colaborativa')) return;
  if (req.method === 'POST') {
    const gymName = normalizeText(body.gymName, 180);
    if (!gymName) return sendJson(res, 400, { ok: false, message: 'Informe a academia.' });
    const gKey = hotelKey(`${body.chainName || ''}-${gymName}-${body.location || ''}`);
    const minutes = Math.min(240, Math.max(15, Number(body.durationMinutes || 90)));
    await context.db.query('DELETE FROM crewcheck_platform_gym_checkins WHERE owner_email=$1 OR expires_at<NOW()', [context.identity.email]);
    await context.db.query(
      'INSERT INTO crewcheck_platform_gym_checkins(id,owner_email,gym_key,gym_name,chain_name,share_presence,expires_at) VALUES($1,$2,$3,$4,$5,$6,DATE_ADD(NOW(), INTERVAL $7 MINUTE))',
      [crypto.randomUUID(), context.identity.email, gKey, gymName, normalizeText(body.chainName, 100), Boolean(body.sharePresence), minutes],
    );
  }
  const aggregate = `SELECT gym_key,gym_name,chain_name,SUM(CASE WHEN share_presence=TRUE THEN 1 ELSE 0 END) shared_count,COUNT(*) total_count,MAX(checked_in_at) last_report
    FROM crewcheck_platform_gym_checkins WHERE expires_at>NOW()`;
  const queryKey = hotelKey(url.searchParams.get('gymKey'));
  const result = queryKey
    ? await context.db.query(`${aggregate} AND gym_key=$1 GROUP BY gym_key,gym_name,chain_name`, [queryKey])
    : await context.db.query(`${aggregate} GROUP BY gym_key,gym_name,chain_name ORDER BY shared_count DESC LIMIT 50`);
  return sendJson(res, 200, { ok: true, gyms: result.rows.map((row) => ({ gymKey: row.gym_key, gymName: row.gym_name, chainName: row.chain_name, peopleSharing: Number(row.shared_count || 0), crowdLabel: Number(row.shared_count || 0) >= 8 ? 'Movimentada segundo usuários' : Number(row.shared_count || 0) >= 3 ? 'Movimento moderado segundo usuários' : Number(row.shared_count || 0) > 0 ? 'Poucos relatos agora' : 'Sem relatos recentes', lastReport: row.last_report })), disclaimer: 'Lotação é colaborativa e temporária; não representa dado oficial da academia ou do Wellhub.' });
}

function periodStats(row) {
  const roster = row.roster || {};
  const days = Array.isArray(roster.days) ? roster.days : [];
  const compliance = row.compliance || {};
  const alerts = meaningfulComplianceAlerts(compliance);
  const dayText = (day) => `${day?.type || ''} ${day?.pairingCode || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const gym = Array.isArray(row.gym) ? row.gym : [];
  return {
    id: row.id, period: row.roster_key, year: Number(roster.year || 0) || null, month: Number(roster.month || 0) || null,
    daysAnalyzed: days.length,
    flightSegments: days.reduce((total, day) => total + (Array.isArray(day?.legs) ? day.legs.length : 0), 0),
    daysOff: days.filter((day) => /\b(DO|DOF|DOP|DOPR|OFF|DR|FOLGA|FERIAS)\b/.test(dayText(day)) && !(day?.legs || []).length).length,
    layovers: days.filter((day) => Boolean(day?.hotel || day?.hotelName)).length,
    standby: days.filter((day) => /\b(SB|STANDBY|SOBREAVISO)\b/.test(dayText(day))).length,
    reserve: days.filter((day) => /\b(RSV|RESERVA)\b/.test(dayText(day))).length,
    gymGoodDays: gym.filter((item) => /good|boa|recommended|recomend/i.test(`${item?.status || ''} ${item?.recommendation || ''}`)).length,
    gymAvoidDays: gym.filter((item) => /avoid|evitar|heavy|pesad/i.test(`${item?.status || ''} ${item?.recommendation || ''}`)).length,
    heavyDays: Number(compliance.heavyDays || days.filter((day) => Number(day?.dutyMinutes || 0) >= 600).length),
    score: Number(compliance.score ?? compliance.complianceScore ?? 0),
    intensityScore: Number(compliance.intensityScore ?? compliance.workloadScore ?? 0),
    alertsCount: alerts.length,
    criticalAlertsCount: alerts.filter((item) => ['critical', 'error', 'high'].includes(normalizeText(item?.severity || item?.level, 30).toLowerCase())).length,
  };
}

function statsSummary(periods) {
  const average = (key) => periods.length ? Math.round(periods.reduce((sum, item) => sum + Number(item[key] || 0), 0) / periods.length * 10) / 10 : 0;
  return {
    rostersCount: periods.length,
    firstPeriod: periods.map((item) => item.period).sort()[0] || null,
    lastPeriod: periods.map((item) => item.period).sort().at(-1) || null,
    avgScore: average('score'), avgIntensity: average('intensityScore'), avgAlerts: average('alertsCount'),
    avgCriticalAlerts: average('criticalAlertsCount'), avgFlightSegments: average('flightSegments'), avgDaysOff: average('daysOff'),
    avgLayovers: average('layovers'), avgGymGoodDays: average('gymGoodDays'), avgHeavyDays: average('heavyDays'),
  };
}

async function handleLegacyStats(req, res) {
  const context = await requireMain(req, res);
  if (!context) return;
  const personalRows = await context.db.query('SELECT * FROM crewcheck_platform_rosters WHERE owner_email=$1 ORDER BY roster_key', [context.identity.email]);
  const periods = personalRows.rows.map(periodStats);
  const population = await context.db.query('SELECT COUNT(DISTINCT owner_email) count FROM crewcheck_platform_rosters');
  const enoughForAggregate = Number(population.rows[0]?.count || 0) >= 5;
  const globalRows = enoughForAggregate ? await context.db.query('SELECT * FROM crewcheck_platform_rosters ORDER BY roster_key') : { rows: [] };
  const globalPeriods = globalRows.rows.map(periodStats);
  return sendJson(res, 200, {
    ok: true,
    personal: { mode: 'personal', summary: statsSummary(periods), periods, disclaimer: 'Estatísticas calculadas somente a partir das escalas salvas desta conta.' },
    global: { mode: 'global', summary: statsSummary(globalPeriods), periods: [], disclaimer: enoughForAggregate ? 'Resumo agregado e sem identificação individual.' : 'Resumo global oculto até existir uma base mínima de cinco usuários.' },
    notice: 'Os números dependem da integridade da escala importada e não substituem documentos oficiais.',
  });
}

async function handleLegacyDatabase(req, res, url) {
  if (url.pathname === '/api/db/status') {
    const context = await requireMain(req, res);
    if (!context) return;
    const result = await context.db.query('SELECT DATABASE() database, CURRENT_USER() user_name, NOW() now');
    return sendJson(res, 200, { ok: true, connected: true, databaseConfigured: true, ...result.rows[0], storage: { provider: 'aiven-mysql', mode: 'primary', configured: true, databasePrimary: true, premiumBackupPriority: true } });
  }
  if (url.pathname === '/api/stats') return handleLegacyStats(req, res);
  if (url.pathname === '/api/rosters' && req.method === 'POST') return handleRosterSync(req, res);
  const context = await requireMain(req, res);
  if (!context) return;
  if (url.pathname === '/api/rosters' && req.method === 'GET') {
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 72)));
    const result = await context.db.query('SELECT * FROM crewcheck_platform_rosters WHERE owner_email=$1 ORDER BY active DESC,updated_at DESC LIMIT $2', [context.identity.email, limit]);
    return sendJson(res, 200, { ok: true, rosters: result.rows.map(rosterSummary) });
  }
  if (url.pathname === '/api/rosters/active') {
    const result = await context.db.query('SELECT * FROM crewcheck_platform_rosters WHERE owner_email=$1 AND active=TRUE ORDER BY updated_at DESC LIMIT 1', [context.identity.email]);
    const row = result.rows[0] || null;
    return sendJson(res, 200, { ok: true, roster: rosterSummary(row), data: row ? { roster: row.roster, compliance: row.compliance, gym: row.gym || [] } : null });
  }
  const activate = url.pathname.match(/^\/api\/rosters\/([^/]+)\/activate$/);
  if (activate && req.method === 'POST') {
    const target = await context.db.query('SELECT * FROM crewcheck_platform_rosters WHERE id=$1 AND owner_email=$2 LIMIT 1', [activate[1], context.identity.email]);
    if (!target.rows[0]) return sendJson(res, 404, { ok: false, message: 'Escala não localizada.' });
    await context.db.query('UPDATE crewcheck_platform_rosters SET active=(id=$2),updated_at=CASE WHEN id=$2 THEN NOW() ELSE updated_at END WHERE owner_email=$1', [context.identity.email, activate[1]]);
    return sendJson(res, 200, { ok: true, roster: rosterSummary({ ...target.rows[0], active: true, updated_at: new Date() }) });
  }
  const byId = url.pathname.match(/^\/api\/rosters\/([^/]+)$/);
  const openId = url.pathname === '/api/rosters/open' ? normalizeText(url.searchParams.get('id'), 100) : '';
  const id = byId?.[1] || openId;
  if (id && req.method === 'DELETE') {
    const current = await context.db.query('SELECT active FROM crewcheck_platform_rosters WHERE id=$1 AND owner_email=$2 LIMIT 1', [id, context.identity.email]);
    const wasActive = Boolean(current.rows[0]?.active);
    const removed = await context.db.query('DELETE FROM crewcheck_platform_rosters WHERE id=$1 AND owner_email=$2', [id, context.identity.email]);
    if (wasActive) {
      const next = await context.db.query('SELECT id FROM crewcheck_platform_rosters WHERE owner_email=$1 ORDER BY updated_at DESC LIMIT 1', [context.identity.email]);
      if (next.rows[0]?.id) await context.db.query('UPDATE crewcheck_platform_rosters SET active=TRUE,updated_at=NOW() WHERE id=$1', [next.rows[0].id]);
    }
    return sendJson(res, 200, { ok: Boolean(removed.rowCount), message: removed.rowCount ? 'Escala excluída.' : 'Escala não localizada.' });
  }
  if (id && req.method === 'GET') {
    const result = await context.db.query('SELECT * FROM crewcheck_platform_rosters WHERE id=$1 AND owner_email=$2 LIMIT 1', [id, context.identity.email]);
    const row = result.rows[0];
    if (!row) return sendJson(res, 404, { ok: false, message: 'Escala não localizada.' });
    return sendJson(res, 200, { ok: true, roster: rosterSummary(row), data: { roster: row.roster, compliance: row.compliance, gym: row.gym || [] } });
  }
  return sendJson(res, 404, { ok: false, message: 'Recurso de banco não localizado.' });
}

async function handleAccountDeletion(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
  const body = await readBody(req, 100_000);
  const context = await requireMain(req, res, body);
  if (!context) return;
  if (normalizeText(body.confirmation, 30).toUpperCase() !== 'EXCLUIR') return sendJson(res, 400, { ok: false, message: 'Digite EXCLUIR para confirmar a remoção permanente.' });
  const subscriptionResult = await context.db.query('SELECT provider,provider_ref,status FROM crewcheck_platform_subscriptions WHERE email=$1', [context.identity.email]);
  const subscription = subscriptionResult.rows[0] || null;
  let externalCancellation = null;
  if (subscription?.provider === 'asaas' && subscription.provider_ref) {
    const alreadyInactive = ['canceled', 'expired', 'refunded'].includes(subscription.status);
    if (alreadyInactive) {
      externalCancellation = true;
    } else {
      try {
        await asaasRequest(`/subscriptions/${encodeURIComponent(subscription.provider_ref)}`, { method: 'DELETE' });
        externalCancellation = true;
      } catch (error) {
        if (error?.providerStatus === 404) {
          externalCancellation = true;
        } else {
          console.error('[CrewCheck] Falha ao cancelar a assinatura Asaas antes da exclusão:', error?.message || error);
          return sendJson(res, error?.status === 503 ? 503 : 502, {
            ok: false,
            deleted: false,
            retryable: true,
            code: 'ASAAS_CANCELLATION_REQUIRED',
            message: 'Não foi possível confirmar o cancelamento da cobrança no Asaas. Nenhum dado foi excluído; tente novamente em alguns minutos.',
          });
        }
      }
    }
  }
  const client = await context.db.connect();
  try {
    await client.query('BEGIN');
    const visitorRows = await client.query('SELECT id FROM crewcheck_platform_visitors WHERE owner_email=$1 OR email=$1', [context.identity.email]);
    const visitorKeys = new Set(visitorRows.rows.map((row) => `visitor:${row.id}`));
    const threadRows = await client.query('SELECT id,direct_key FROM crewcheck_platform_chat_threads');
    const threadIds = threadRows.rows
      .filter((row) => String(row.direct_key || '').split('|').some((part) => part === context.identity.email || visitorKeys.has(part)))
      .map((row) => row.id);
    if (threadIds.length) {
      const messageThreadParams = threadIds.map((_, index) => `$${index + 2}`).join(',');
      await client.query(`DELETE FROM crewcheck_platform_chat_messages WHERE sender_email=$1 OR thread_id IN (${messageThreadParams})`, [context.identity.email, ...threadIds]);
      const threadParams = threadIds.map((_, index) => `$${index + 1}`).join(',');
      await client.query(`DELETE FROM crewcheck_platform_chat_threads WHERE id IN (${threadParams})`, threadIds);
    } else {
      await client.query('DELETE FROM crewcheck_platform_chat_messages WHERE sender_email=$1', [context.identity.email]);
    }
    await client.query('DELETE FROM crewcheck_platform_connections WHERE requester_email=$1 OR target_email=$1', [context.identity.email]);
    await client.query('DELETE FROM crewcheck_platform_emergencies WHERE owner_email=$1 OR visitor_id IN (SELECT id FROM crewcheck_platform_visitors WHERE owner_email=$1 OR email=$1)', [context.identity.email]);
    await client.query('DELETE FROM crewcheck_platform_visitors WHERE owner_email=$1 OR email=$1', [context.identity.email]);
    await client.query('DELETE FROM crewcheck_platform_stays WHERE owner_email=$1', [context.identity.email]);
    await client.query('DELETE FROM crewcheck_platform_hotel_rules WHERE owner_email=$1', [context.identity.email]);
    await client.query('DELETE FROM crewcheck_platform_shares WHERE owner_email=$1', [context.identity.email]);
    await client.query('DELETE FROM crewcheck_platform_gym_checkins WHERE owner_email=$1', [context.identity.email]);
    if (await platformTableReady(client, 'crewcheck_platform_parking_positions')) {
      await client.query('DELETE FROM crewcheck_platform_parking_positions WHERE owner_email=$1', [context.identity.email]);
    }
    await client.query('DELETE FROM crewcheck_platform_rosters WHERE owner_email=$1', [context.identity.email]);
    await client.query('DELETE FROM crewcheck_platform_usage WHERE email=$1', [context.identity.email]);
    if (await platformTableReady(client, 'crewcheck_platform_terms_acceptances')) {
      await client.query('DELETE FROM crewcheck_platform_terms_acceptances WHERE email=$1', [context.identity.email]);
    }
    await client.query('DELETE FROM crewcheck_platform_subscriptions WHERE email=$1', [context.identity.email]);
    await client.query('DELETE FROM crewcheck_platform_profiles WHERE email=$1', [context.identity.email]);
    await client.query('DELETE FROM crewcheck_telegram_state WHERE state_key IN ($1,$2) OR state_key=$3', [`link-email:${context.identity.email}`, `snapshot:${context.identity.email}`, `profile:${context.identity.email}`]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const secure = env('NODE_ENV').toLowerCase() === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `crewcheck_auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  return sendJson(res, 200, {
    ok: true, deleted: true, externalCancellation,
    manageGooglePlayUrl: subscription?.provider === 'google_play' ? 'https://play.google.com/store/account/subscriptions' : null,
    message: subscription?.provider === 'google_play' ? 'Dados excluídos e sessão encerrada. A assinatura Google Play deve ser cancelada separadamente na Play Store.' : 'Dados excluídos e sessão encerrada.',
  });
}

export async function handlePlatformRoute(req, res, url) {
  const legacy = url.pathname === '/api/db/status' || url.pathname === '/api/stats' || url.pathname === '/api/rosters' || url.pathname.startsWith('/api/rosters/');
  if (!url.pathname.startsWith('/api/platform/') && !legacy) return false;
  if (!legacy && !enforcePlatformMethod(req, res, url.pathname)) return true;
  try {
    if (legacy) { await handleLegacyDatabase(req, res, url); return true; }
    if (url.pathname === '/api/platform/catalog') { await handleCatalog(req, res); return true; }
    if (url.pathname === '/api/platform/terms/current') { await handleTermsCurrent(req, res); return true; }
    if (url.pathname === '/api/platform/terms/accept') { await handleTermsAccept(req, res); return true; }
    if (url.pathname === '/api/platform/admin/terms') { await handleAdminTerms(req, res); return true; }
    if (url.pathname === '/api/platform/admin/unlimited') { await handleAdminUnlimited(req, res); return true; }
    if (url.pathname === '/api/platform/health/amil') { await handleAmilHealth(req, res); return true; }
    if (url.pathname === '/api/platform/health/amil/search') { await handleAmilSearch(req, res, url); return true; }
    if (url.pathname === '/api/platform/database/health') { await handleDatabaseHealth(req, res); return true; }
    if (url.pathname === '/api/platform/profile') { await handleProfile(req, res); return true; }
    if (url.pathname === '/api/platform/billing/status') { await handleBillingStatus(req, res); return true; }
    if (url.pathname === '/api/platform/billing/google-play/verify') { await handleGooglePurchase(req, res); return true; }
    if (url.pathname === '/api/platform/billing/asaas/checkout') { await handleAsaasCheckout(req, res); return true; }
    if (url.pathname === '/api/platform/billing/asaas/webhook') { await handleAsaasWebhook(req, res); return true; }
    if (url.pathname === '/api/platform/billing/google-play/rtdn') { await handleGoogleRtdn(req, res); return true; }
    if (url.pathname === '/api/platform/billing/cancel') { await handleBillingCancel(req, res); return true; }
    if (url.pathname === '/api/platform/rosters/sync') { await handleRosterSync(req, res); return true; }
    if (url.pathname === '/api/platform/rosters/active') { await handleRosterActive(req, res); return true; }
    if (url.pathname === '/api/platform/hotels/stays') { await handleStays(req, res); return true; }
    if (url.pathname === '/api/platform/hotels/companions') { await handleSameHotel(req, res, url); return true; }
    if (url.pathname === '/api/platform/visitors') { await handleVisitors(req, res); return true; }
    const visitorRevoke = url.pathname.match(/^\/api\/platform\/visitors\/([^/]+)\/revoke$/);
    if (visitorRevoke) { await handleVisitorRevoke(req, res, visitorRevoke[1]); return true; }
    const ownerVisitorChat = url.pathname.match(/^\/api\/platform\/visitors\/([^/]+)\/chat$/);
    if (ownerVisitorChat) { await handleOwnerVisitorChat(req, res, ownerVisitorChat[1]); return true; }
    const visitorUpdate = url.pathname.match(/^\/api\/platform\/visitors\/([^/]+)$/);
    if (visitorUpdate) { await handleVisitorUpdate(req, res, visitorUpdate[1]); return true; }
    if (url.pathname === '/api/platform/visitor/invite') { await handleVisitorInviteInfo(req, res, url); return true; }
    if (url.pathname === '/api/platform/visitor/accept') { await handleVisitorAccept(req, res); return true; }
    if (url.pathname === '/api/platform/visitor/login') { await handleVisitorLogin(req, res); return true; }
    if (url.pathname === '/api/platform/visitor/data') { await handleVisitorData(req, res); return true; }
    if (url.pathname === '/api/platform/visitor/logout') { await handleVisitorLogout(req, res); return true; }
    if (url.pathname === '/api/platform/visitor/emergency') { await handleVisitorEmergency(req, res); return true; }
    if (url.pathname === '/api/platform/visitor/chat') { await handleVisitorChat(req, res); return true; }
    if (url.pathname === '/api/platform/shares') { await handleShares(req, res); return true; }
    const sharePublic = url.pathname.match(/^\/api\/platform\/shares\/public\/([^/]+)$/);
    if (sharePublic) { await handleSharePublic(req, res, sharePublic[1]); return true; }
    const shareRevoke = url.pathname.match(/^\/api\/platform\/shares\/([^/]+)\/revoke$/);
    if (shareRevoke) { await handleShareRevoke(req, res, shareRevoke[1]); return true; }
    if (url.pathname === '/api/platform/connections') { await handleConnections(req, res); return true; }
    if (url.pathname === '/api/platform/compare') { await handleCompare(req, res, url); return true; }
    if (url.pathname === '/api/platform/chat') { await handleChat(req, res, url); return true; }
    if (url.pathname === '/api/platform/gyms/checkins') { await handleGym(req, res, url); return true; }
    if (url.pathname === '/api/platform/parking') { await handleParking(req, res); return true; }
    if (url.pathname === '/api/platform/account/delete') { await handleAccountDeletion(req, res); return true; }
    sendJson(res, 404, { ok: false, message: 'Recurso da plataforma não localizado.' });
    return true;
  } catch (error) {
    const status = Number(error?.status || 500);
    sendJson(res, status >= 400 && status < 600 ? status : 500, { ok: false, code: error?.code || 'PLATFORM_ERROR', message: status >= 500 ? 'O CrewCheck não conseguiu concluir esta operação agora.' : error?.message || 'Solicitação inválida.' });
    return true;
  }
}

export const crewCheckPlatform = { version: APP_VERSION, defaultTimezone: DEFAULT_TIMEZONE, supportedLocales: [...SUPPORTED_LOCALES] };
