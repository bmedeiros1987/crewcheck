import { fetchCiriumFlexOccurrence } from './cirium-flex-radar.mjs';

// Paid Radar sources (Cirium Flex primary, FlightAware fallback): one durable budget
// per provider, a shared per-occurrence cache and in-flight coalescing. Spend is
// reserved in MySQL before every upstream call and never refunded, so a failed,
// uncertain or abandoned attempt still counts. No ledger, no cost or no budget left
// means no paid call.
export const RADAR_PAID_PROVIDERS = Object.freeze(['cirium-flex', 'flightaware']);
export const RADAR_PAID_MAX_MONTHLY_USD = 10;
// Every billing month, in any provider time zone, lies within 33 consecutive UTC days
// (31 days plus up to 28 h of offset). Keeping each 33-day window under the cap bounds
// every possible billing month without knowing the provider's cycle.
export const RADAR_PAID_WINDOW_DAYS = 33;
const DAY_MS = 86_400_000;
const COST_ENV = Object.freeze({ 'cirium-flex': 'CIRIUM_FLEX_COST_PER_CALL_USD', flightaware: 'FLIGHTAWARE_COST_PER_CALL_USD' });
// Exact decimal USD -> micro-USD (BigInt), no binary floating point: { floor, exact }
// where exact means nothing was cut past the sixth decimal. Plain decimals only.
const microUsd = value => {
  const match = /^(\d{1,12})(?:\.(\d{1,64}))?$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const fraction = match[2] || '';
  return { floor: BigInt(match[1]) * 1_000_000n + BigInt(fraction.slice(0, 6).padEnd(6, '0')), exact: !/[1-9]/.test(fraction.slice(6)) };
};
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
const utcDay = at => new Date(at).toISOString().slice(0, 10);

/**
 * { unitMicroUsd, capMicroUsd } or null. Converted exactly from the decimal text: cost
 * rounds up and the cap rounds down to the micro-dollar; a cap above US$ 10, an
 * unknown or non-decimal value or a cost above the cap disables it.
 */
export function radarPaidPolicy(provider, env = process.env) {
  if (!RADAR_PAID_PROVIDERS.includes(provider)) return null;
  const cost = microUsd(env[COST_ENV[provider]]), cap = microUsd(env.RADAR_PAID_MONTHLY_BUDGET_USD ?? String(RADAR_PAID_MAX_MONTHLY_USD));
  if (!cost || !cap) return null;
  const maxMicroUsd = BigInt(RADAR_PAID_MAX_MONTHLY_USD) * 1_000_000n;
  if (cap.floor > maxMicroUsd || (cap.floor === maxMicroUsd && !cap.exact)) return null;
  const unit = cost.floor + (cost.exact ? 0n : 1n), capMicro = cap.floor;
  return unit > 0n && unit <= capMicro ? { unitMicroUsd: Number(unit), capMicroUsd: Number(capMicro) } : null;
}

export function radarSpendKey(provider) { return `radar-paid-spend:v2:${provider}`; }

export function createRadarSpendLedger({ pool, now = Date.now } = {}) {
  return Object.freeze({ async reserve(provider, policy) {
    if (!policy || !RADAR_PAID_PROVIDERS.includes(provider)) return { ok: false, reason: 'budget-not-configured' };
    let connection;
    try {
      const resolved = typeof pool === 'function' ? await pool() : pool;
      if (!resolved?.getConnection) return { ok: false, reason: 'ledger-unavailable' };
      connection = await resolved.getConnection();
      const key = radarSpendKey(provider);
      // Create the row in its own autocommit statement: inside the transaction its shared
      // lock would have to be upgraded by FOR UPDATE and concurrent workers deadlock.
      await connection.query('INSERT IGNORE INTO crewcheck_telegram_state (state_key, payload) VALUES (?, ?)',
        [key, JSON.stringify({ v: 2, kind: 'radar-paid-spend', provider, days: {}, attempts: 0 })]);
      await connection.beginTransaction();
      const [rows] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [key]);
      const state = rows?.length === 1 ? parse(rows[0].payload) : null;
      const at = now(), today = utcDay(at), oldest = utcDay(at - (RADAR_PAID_WINDOW_DAYS - 1) * DAY_MS);
      const days = state?.days && typeof state.days === 'object' && !Array.isArray(state.days) ? state.days : null;
      if (state?.v !== 2 || state.kind !== 'radar-paid-spend' || state.provider !== provider || !days || !Number.isSafeInteger(state.attempts)
        || !Number.isFinite(at) || Object.entries(days).some(([day, spent]) => !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isSafeInteger(spent) || spent < 0 || day > today)) {
        await connection.rollback(); return { ok: false, reason: 'ledger-unavailable' };
      }
      const kept = Object.fromEntries(Object.entries(days).filter(([day]) => day >= oldest));
      const windowSpent = Object.values(kept).reduce((sum, spent) => sum + spent, 0);
      if (windowSpent + policy.unitMicroUsd > policy.capMicroUsd) { await connection.rollback(); return { ok: false, reason: 'budget-exhausted', windowSpentMicroUsd: windowSpent }; }
      kept[today] = (kept[today] || 0) + policy.unitMicroUsd;
      const next = { ...state, days: kept, attempts: state.attempts + 1 };
      await connection.query('UPDATE crewcheck_telegram_state SET payload=? WHERE state_key=?', [JSON.stringify(next), key]);
      await connection.commit();
      return { ok: true, windowSpentMicroUsd: windowSpent + policy.unitMicroUsd, attempts: next.attempts };
    } catch {
      try { await connection?.rollback(); } catch {}
      return { ok: false, reason: 'ledger-unavailable' };
    } finally {
      connection?.release?.();
    }
  } });
}

/**
 * Per-occurrence result cache with in-flight coalescing. Cached copies keep their original
 * receipt. A request-specific refusal (cacheable: false) is neither stored nor shared:
 * coalesced waiters retry with their own admission.
 */
export function createRadarSourceCache({ now = Date.now, okTtlMs = 5 * 60_000, missTtlMs = 2 * 60_000, maxEntries = 256 } = {}) {
  const entries = new Map(), pending = new Map();
  return Object.freeze({
    async run(key, task) {
      for (;;) {
        const hit = entries.get(key);
        if (hit && now() < hit.until) return { ...structuredClone(hit.value), cached: true };
        if (!pending.has(key)) break;
        const shared = await pending.get(key);
        if (shared?.cacheable !== false) return structuredClone(shared);
      }
      const work = (async () => {
        const value = await task();
        if (value && typeof value === 'object' && value.cacheable !== false) {
          entries.set(key, { value: structuredClone(value), until: now() + (value.ok === true ? okTtlMs : missTtlMs) });
          if (entries.size > maxEntries) entries.delete(entries.keys().next().value);
        }
        return value;
      })();
      pending.set(key, work);
      try { return structuredClone(await work); } finally { if (pending.get(key) === work) pending.delete(key); }
    },
    size: () => entries.size,
  });
}

export function radarOccurrenceKey(provider, identity) {
  return [provider, identity?.flight, identity?.origin, identity?.destination, identity?.scheduledDepartureUtc].map(value => String(value ?? '').trim().toUpperCase()).join('|');
}

/**
 * FlightAware as paid fallback is a separate, explicit permission: OFF unless exactly 'true'.
 * Distribution to end users needs an AeroAPI Standard plan, which is not contracted.
 */
export function radarFlightAwareFallbackEnabled(env = process.env) {
  return env.RADAR_FLIGHTAWARE_FALLBACK_ENABLED === 'true';
}

/**
 * Budgeted, cached call of one paid source for one published occurrence. Account and
 * occurrence are re-admitted after the reservation, immediately before the paid call.
 * `networkAttempted` says whether the paid call itself ran (a refusal never queried).
 */
export function createPaidRadarSource({ ledger, cache, env = process.env }) {
  return (provider, identity, call, admit, ready) => {
    // FlightAware OFF: vetoed before the cache, the reservation and the network.
    if (provider === 'flightaware' && !radarFlightAwareFallbackEnabled(env))
      return Promise.resolve({ ok: false, configured: false, provider, providerState: 'fallback_disabled', cacheable: false, networkAttempted: false });
    // Pre-admission: a call that cannot leave (no key, cooldown) never reserves budget.
    let canLeave = true;
    try { canLeave = typeof ready !== 'function' || ready() === true; } catch { canLeave = false; }
    if (!canLeave) return Promise.resolve({ ok: false, configured: false, provider, providerState: 'provider_unavailable', cacheable: false, networkAttempted: false });
    return cache.run(radarOccurrenceKey(provider, identity), async () => {
      const reservation = await ledger.reserve(provider, radarPaidPolicy(provider, env));
      if (!reservation.ok) return { ok: false, configured: reservation.reason !== 'budget-not-configured', provider, providerState: reservation.reason, networkAttempted: false };
      let admitted = false;
      try { admitted = typeof admit === 'function' && await admit() === true; } catch {}
      // The reservation stays spent: an abandoned attempt is never refunded.
      if (!admitted) return { ok: false, configured: true, provider, providerState: 'authority-invalidated', cacheable: false, networkAttempted: false };
      try {
        const out = await call();
        // No result means the adapter refused before its transport (the spent reservation stays).
        return out ? { ...out, networkAttempted: true } : { ok: false, configured: true, provider, providerState: 'provider_unavailable', cacheable: false, networkAttempted: false };
      } catch { return { ok: false, configured: true, provider, providerState: 'provider_error', networkAttempted: true }; }
    });
  };
}

let paidRuntime = null;
/** Server startup hands the existing MySQL pool getter; nothing is created at import.
 * fetchImpl/timeoutMs exist for offline tests; production passes neither. */
export function configureRadarPaidSources({ pool, now = Date.now, env = process.env, fetchImpl, timeoutMs } = {}) {
  paidRuntime = { paid: createPaidRadarSource({ ledger: createRadarSpendLedger({ pool, now }), cache: createRadarSourceCache({ now }), env }), now, fetchImpl, timeoutMs };
  return paidRuntime;
}

const refused = provider => ({ ok: false, configured: false, provider, providerState: 'not_configured', cacheable: false, networkAttempted: false });

/**
 * Sequential routing options: Cirium Flex first and, only with
 * RADAR_FLIGHTAWARE_FALLBACK_ENABLED=true, FlightAware when Cirium has no valid gate for
 * the same occurrence. `sequential` selects this routing; `flightAwareFallback` is only
 * the fallback permission, and without it there is no `guardFallback` at all (Flex only).
 * Undefined (legacy race) unless CIRIUM_FLEX_RADAR_ENABLED is exactly 'true'. When
 * enabled but missing credentials or the ledger runtime, every query is refused: never
 * the unbudgeted legacy race.
 */
export function ciriumFlexRadarOptions(env = process.env) {
  if (env.CIRIUM_FLEX_RADAR_ENABLED !== 'true') return undefined;
  const appId = String(env.CIRIUM_APP_ID || '').trim(), appKey = String(env.CIRIUM_APP_KEY || '').trim();
  const fallbackAllowed = radarFlightAwareFallbackEnabled(env);
  const base = { enabled: true, sequential: true, flightAwareFallback: fallbackAllowed, provider: 'cirium-flex' };
  if (!appId || !appKey || !paidRuntime) return { ...base, primary: async () => refused('cirium-flex'), ...(fallbackAllowed ? { guardFallback: async () => refused('flightaware') } : {}) };
  const { paid, now, fetchImpl, timeoutMs } = paidRuntime;
  return {
    ...base,
    primary: (identity, admit) => paid('cirium-flex', identity, () => fetchCiriumFlexOccurrence({ identity, credentials: { appId, appKey }, fetchImpl, timeoutMs, now }), admit),
    ...(fallbackAllowed ? { guardFallback: (identity, call, admit, ready) => paid('flightaware', identity, call, admit, ready) } : {}),
  };
}
