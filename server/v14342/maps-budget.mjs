const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const memory = new Map();
const routeCache = new Map();
let poolPromise = null;

function env(name, fallback = '') {
  const value = String(process.env[name] || '').trim();
  return value || fallback;
}

function numberEnv(name, fallback) {
  const value = Number(env(name, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

export function googleMapsMonthlyLimit() {
  return Math.max(1, Math.floor(numberEnv('CREWCHECK_GOOGLE_MAPS_MONTHLY_LIMIT', 2500)));
}

export function googleMapsCacheTtlMs() {
  return Math.max(30_000, Math.floor(numberEnv('CREWCHECK_GOOGLE_MAPS_CACHE_TTL_MS', 120_000)));
}

export function googleMapsMonthKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIMEZONE, year: 'numeric', month: '2-digit' }).formatToParts(now);
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}

function nextResetAt(now = new Date()) {
  const [year, month] = googleMapsMonthKey(now).split('-').map(Number);
  return new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1, 3, 0, 0)).toISOString();
}

function memoryRecord(monthKey = googleMapsMonthKey()) {
  if (!memory.has(monthKey)) memory.set(monthKey, { used: 0, blocked: false, blockedReason: '', kinds: {}, updatedAt: new Date().toISOString() });
  return memory.get(monthKey);
}

function blockMemory(monthKey, reason) {
  const record = memoryRecord(monthKey);
  record.blocked = true;
  record.blockedReason = String(reason || 'persistence_failure').slice(0, 180);
  record.updatedAt = new Date().toISOString();
  return record;
}

function clearMemoryBlock(monthKey) {
  const record = memoryRecord(monthKey);
  record.blocked = false;
  record.blockedReason = '';
  record.updatedAt = new Date().toISOString();
  return record;
}

function databaseUrl() {
  return env('DATABASE_URL') || env('CREWCHECK_DATABASE_URL') || env('MYSQL_URL');
}

function persistentDatabaseConfigured() {
  return /^mysql:\/\//i.test(databaseUrl());
}

function mysqlOptions(connectionString) {
  const parsed = new URL(connectionString);
  const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  const sslDisabled = /^(?:disable|disabled|false|off)$/i.test(env('MYSQL_SSL_MODE'));
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '') || 'defaultdb'),
    waitForConnections: true,
    connectionLimit: 2,
    connectTimeout: 5000,
    dateStrings: true,
    decimalNumbers: true,
    ssl: local || sslDisabled ? undefined : { rejectUnauthorized: false },
  };
}

async function pool() {
  const connectionString = databaseUrl();
  if (!/^mysql:\/\//i.test(connectionString)) return null;
  if (!poolPromise) {
    poolPromise = (async () => {
      const mysqlModule = await import('mysql2/promise');
      const mysql = mysqlModule.default || mysqlModule;
      const db = mysql.createPool(mysqlOptions(connectionString));
      await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_external_api_usage (
        provider VARCHAR(64) NOT NULL,
        month_key CHAR(7) NOT NULL,
        used INT NOT NULL DEFAULT 0,
        blocked TINYINT(1) NOT NULL DEFAULT 0,
        blocked_reason VARCHAR(180) NOT NULL DEFAULT '',
        kind_usage JSON NULL,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY(provider, month_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      return db;
    })().catch((error) => {
      poolPromise = null;
      console.error('[crewcheck:maps-budget]', String(error?.message || error).slice(0, 180));
      return null;
    });
  }
  return poolPromise;
}

function publicStatus(record = {}, now = new Date(), persistent = false) {
  const limit = googleMapsMonthlyLimit();
  const used = Math.max(0, Number(record.used || 0));
  const blocked = Boolean(record.blocked) || used >= limit;
  const remaining = Math.max(0, limit - used);
  return {
    monthKey: googleMapsMonthKey(now),
    used,
    limit,
    remaining,
    percent: Math.min(100, Math.round((used / limit) * 1000) / 10),
    warning: used >= Math.floor(limit * 0.8),
    critical: used >= Math.floor(limit * 0.95),
    blocked,
    fallbackActive: blocked,
    blockedReason: String(record.blockedReason || record.blocked_reason || (used >= limit ? 'monthly_limit' : '')),
    provider: blocked ? 'TomTom' : 'Google Routes',
    resetAt: nextResetAt(now),
    persistence: persistent ? 'database' : 'memory',
    kinds: record.kinds || record.kind_usage || {},
    updatedAt: record.updatedAt || record.updated_at || new Date().toISOString(),
  };
}

async function databaseStatus(now = new Date()) {
  const db = await pool();
  if (!db) return null;
  const monthKey = googleMapsMonthKey(now);
  const [rows] = await db.query('SELECT used, blocked, blocked_reason, kind_usage, updated_at FROM crewcheck_external_api_usage WHERE provider=? AND month_key=? LIMIT 1', ['google_maps', monthKey]);
  const row = rows?.[0] || {};
  let kinds = row.kind_usage || {};
  if (typeof kinds === 'string') { try { kinds = JSON.parse(kinds); } catch { kinds = {}; } }
  return publicStatus({ ...row, kinds }, now, true);
}

export async function googleMapsBudgetStatus(now = new Date()) {
  const monthKey = googleMapsMonthKey(now);
  const latch = memoryRecord(monthKey);
  if (latch.blocked) return publicStatus(latch, now, false);
  try {
    const persistent = await databaseStatus(now);
    if (persistent) return persistent;
    if (persistentDatabaseConfigured()) return publicStatus(blockMemory(monthKey, 'persistence_initialization_failure'), now, false);
    return publicStatus(latch, now, false);
  } catch {
    return publicStatus(blockMemory(monthKey, 'persistence_status_failure'), now, false);
  }
}

export async function reserveGoogleMapsRequest(kind = 'routes', amount = 1, now = new Date()) {
  const safeAmount = Math.max(1, Math.floor(Number(amount || 1)));
  const limit = googleMapsMonthlyLimit();
  const monthKey = googleMapsMonthKey(now);
  const latch = memoryRecord(monthKey);
  if (latch.blocked) return { allowed: false, ...publicStatus(latch, now, false) };

  const persistentRequired = persistentDatabaseConfigured();
  const db = await pool();
  if (!db) {
    if (persistentRequired) {
      const record = blockMemory(monthKey, 'persistence_initialization_failure');
      return { allowed: false, ...publicStatus(record, now, false) };
    }
    if (latch.used + safeAmount > limit) return { allowed: false, ...publicStatus(latch, now, false) };
    latch.used += safeAmount;
    latch.kinds[kind] = Number(latch.kinds[kind] || 0) + safeAmount;
    latch.updatedAt = new Date().toISOString();
    return { allowed: true, ...publicStatus(latch, now, false) };
  }

  let connection = null;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    await connection.query(
      'INSERT IGNORE INTO crewcheck_external_api_usage(provider,month_key,used,blocked,blocked_reason,kind_usage) VALUES(?,?,?,?,?,?)',
      ['google_maps', monthKey, 0, 0, '', JSON.stringify({})],
    );
    const [rows] = await connection.query('SELECT used, blocked, blocked_reason, kind_usage FROM crewcheck_external_api_usage WHERE provider=? AND month_key=? FOR UPDATE', ['google_maps', monthKey]);
    const current = rows?.[0] || { used: 0, blocked: 0, blocked_reason: '', kind_usage: {} };
    let kinds = current.kind_usage || {};
    if (typeof kinds === 'string') { try { kinds = JSON.parse(kinds); } catch { kinds = {}; } }
    const usedBefore = Math.max(0, Number(current.used || 0));
    if (Boolean(current.blocked) || usedBefore + safeAmount > limit) {
      await connection.rollback();
      return { allowed: false, ...publicStatus({ ...current, kinds }, now, true) };
    }
    const used = usedBefore + safeAmount;
    kinds[kind] = Number(kinds[kind] || 0) + safeAmount;
    await connection.query(`UPDATE crewcheck_external_api_usage SET
      used=?, blocked=?, blocked_reason=?, kind_usage=?, updated_at=CURRENT_TIMESTAMP(3)
      WHERE provider=? AND month_key=?`,
    [used, used >= limit ? 1 : 0, used >= limit ? 'monthly_limit' : '', JSON.stringify(kinds), 'google_maps', monthKey]);
    await connection.commit();
    return { allowed: true, ...publicStatus({ used, blocked: used >= limit, blockedReason: used >= limit ? 'monthly_limit' : '', kinds }, now, true) };
  } catch (error) {
    if (connection) { try { await connection.rollback(); } catch {} }
    console.error('[crewcheck:maps-budget-reserve]', String(error?.message || error).slice(0, 180));
    const record = blockMemory(monthKey, 'persistence_reservation_failure');
    return { allowed: false, ...publicStatus(record, now, false) };
  } finally {
    connection?.release();
  }
}

export async function markGoogleMapsQuotaBlocked(reason = 'provider_quota', now = new Date()) {
  const monthKey = googleMapsMonthKey(now);
  const safeReason = String(reason || 'provider_quota').slice(0, 180);
  const latch = blockMemory(monthKey, safeReason);
  const db = await pool();
  if (!db) return publicStatus(latch, now, false);
  try {
    await db.query(`INSERT INTO crewcheck_external_api_usage(provider,month_key,used,blocked,blocked_reason,kind_usage)
      VALUES(?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE blocked=1,blocked_reason=VALUES(blocked_reason),updated_at=CURRENT_TIMESTAMP(3)`,
    ['google_maps', monthKey, 0, 1, safeReason, JSON.stringify({})]);
    clearMemoryBlock(monthKey);
    return await databaseStatus(now) || publicStatus(blockMemory(monthKey, safeReason), now, false);
  } catch (error) {
    console.error('[crewcheck:maps-budget-block]', String(error?.message || error).slice(0, 180));
    latch.blockedReason = `${safeReason}_persistence_failure`;
    latch.updatedAt = new Date().toISOString();
    return publicStatus(latch, now, false);
  }
}

export function googleMapsQuotaFailure(status, payload = null) {
  const text = JSON.stringify(payload || '').toUpperCase();
  return Number(status) === 429 || /RESOURCE_EXHAUSTED|OVER_QUERY_LIMIT|OVERQUOTAMAPERROR|DAILY LIMIT|QUOTA/.test(text);
}

export function routeCacheKey(origin, destination, mode = 'driving') {
  return `${String(mode).toLowerCase()}|${String(origin).trim().toLowerCase()}|${String(destination).trim().toLowerCase()}`;
}

export function readGoogleRouteCache(origin, destination, mode = 'driving') {
  const key = routeCacheKey(origin, destination, mode);
  const cached = routeCache.get(key);
  if (!cached || Date.now() - cached.cachedAt > googleMapsCacheTtlMs()) {
    if (cached) routeCache.delete(key);
    return null;
  }
  return { ...cached.value, cache: 'fresh', cacheAgeMs: Date.now() - cached.cachedAt };
}

export function writeGoogleRouteCache(origin, destination, mode, value) {
  routeCache.set(routeCacheKey(origin, destination, mode), { cachedAt: Date.now(), value });
  if (routeCache.size > 500) {
    const oldest = [...routeCache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt).slice(0, 100);
    oldest.forEach(([key]) => routeCache.delete(key));
  }
}

export function resetMapsBudgetForTests() {
  memory.clear();
  routeCache.clear();
  poolPromise = null;
}
