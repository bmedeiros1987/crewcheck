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
    `SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (${tableParams})`,
    tables,
  );
  const ready = new Set(result.rows.map((row) => row.table_name));
  const columnTables = Object.keys(requiredColumns);
  const columnParams = columnTables.map((_table, index) => `$${index + 1}`).join(',');
  const columnResult = await db.query(
    `SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN (${columnParams})`,
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
    'SELECT table_name relation FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=$1 LIMIT 1',
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
       …27998 tokens truncated… DESC LIMIT 50`);
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
