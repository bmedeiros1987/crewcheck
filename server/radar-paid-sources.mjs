import { fetchCiriumFlexOccurrence } from './cirium-flex-radar.mjs';

// Paid Radar sources (Cirium Flex primary, FlightAware fallback): one durable
// monthly budget per provider, a shared per-occurrence cache and in-flight
// coalescing. Spend is reserved in MySQL before every upstream call and never
// refunded, so a failed or uncertain attempt still counts. No ledger, no cost
// or no budget left means no paid call.
export const RADAR_PAID_PROVIDERS = Object.freeze(['cirium-flex', 'flightaware']);
export const RADAR_PAID_DEFAULT_MONTHLY_USD = 10;
const COST_ENV = Object.freeze({ 'cirium-flex': 'CIRIUM_FLEX_COST_PER_CALL_USD', flightaware: 'FLIGHTAWARE_COST_PER_CALL_USD' });
const micro = value => { const usd = Number(value); return Number.isFinite(usd) && usd > 0 ? Math.round(usd * 1e6) : 0; };
const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };

/** Billing month for the ledger (America/Sao_Paulo, as the other CrewCheck credit ledgers). */
export function radarSpendPeriod(at) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(at);
}

/** { unitMicroUsd, capMicroUsd } or null when the provider has no verified per-call cost. */
export function radarPaidPolicy(provider, env = process.env) {
  if (!RADAR_PAID_PROVIDERS.includes(provider)) return null;
  const unitMicroUsd = micro(env[COST_ENV[provider]]);
  const capMicroUsd = micro(env.RADAR_PAID_MONTHLY_BUDGET_USD ?? RADAR_PAID_DEFAULT_MONTHLY_USD);
  return unitMicroUsd && capMicroUsd && unitMicroUsd <= capMicroUsd ? { unitMicroUsd, capMicroUsd } : null;
}

export function createRadarSpendLedger({ pool, now = Date.now } = {}) {
  return Object.freeze({ async reserve(provider, policy) {
    if (!policy || !RADAR_PAID_PROVIDERS.includes(provider)) return { ok: false, reason: 'budget-not-configured' };
    let connection;
    try {
      const resolved = typeof pool === 'function' ? await pool() : pool;
      if (!resolved?.getConnection) return { ok: false, reason: 'ledger-unavailable' };
      connection = await resolved.getConnection();
      const period = radarSpendPeriod(now()), key = `radar-paid-spend:v1:${provider}:${period}`;
      await connection.beginTransaction();
      await connection.query('INSERT IGNORE INTO crewcheck_telegram_state (state_key, payload) VALUES (?, ?)',
        [key, JSON.stringify({ v: 1, kind: 'radar-paid-spend', provider, period, spentMicroUsd: 0, attempts: 0 })]);
      const [rows] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [key]);
      const state = rows?.length === 1 ? parse(rows[0].payload) : null;
      if (state?.v !== 1 || state.kind !== 'radar-paid-spend' || state.provider !== provider || state.period !== period
        || !Number.isSafeInteger(state.spentMicroUsd) || state.spentMicroUsd < 0 || !Number.isSafeInteger(state.attempts)) {
        await connection.rollback(); return { ok: false, reason: 'ledger-unavailable' };
      }
      if (state.spentMicroUsd + policy.unitMicroUsd > policy.capMicroUsd) { await connection.rollback(); return { ok: false, reason: 'budget-exhausted', period }; }
      const next = { ...state, spentMicroUsd: state.spentMicroUsd + policy.unitMicroUsd, attempts: state.attempts + 1 };
      await connection.query('UPDATE crewcheck_telegram_state SET payload=? WHERE state_key=?', [JSON.stringify(next), key]);
      await connection.commit();
      return { ok: true, period, spentMicroUsd: next.spentMicroUsd, attempts: next.attempts };
    } catch {
      try { await connection?.rollback(); } catch {}
      return { ok: false, reason: 'ledger-unavailable' };
    } finally {
      connection?.release?.();
    }
  } });
}

/** Per-occurrence result cache with in-flight coalescing. Cached copies keep their original receipt. */
export function createRadarSourceCache({ now = Date.now, okTtlMs = 5 * 60_000, missTtlMs = 2 * 60_000, maxEntries = 256 } = {}) {
  const entries = new Map(), pending = new Map();
  return Object.freeze({
    async run(key, task) {
      const hit = entries.get(key);
      if (hit && now() < hit.until) return { ...structuredClone(hit.value), cached: true };
      if (pending.has(key)) return structuredClone(await pending.get(key));
      const work = (async () => {
        const value = await task();
        if (value && typeof value === 'object') {
          entries.set(key, { value: structuredClone(value), until: now() + (value.ok === true ? okTtlMs : missTtlMs) });
          if (entries.size > maxEntries) entries.delete(entries.keys().next().value);
        }
        return value;
      })();
      pending.set(key, work);
      try { return structuredClone(await work); } finally { pending.delete(key); }
    },
    size: () => entries.size,
  });
}

export function radarOccurrenceKey(provider, identity) {
  return [provider, identity?.flight, identity?.origin, identity?.destination, identity?.scheduledDepartureUtc].map(value => String(value ?? '').trim().toUpperCase()).join('|');
}

/** Budgeted, cached call of one paid source for one published occurrence. */
export function createPaidRadarSource({ ledger, cache, env = process.env }) {
  return (provider, identity, call) => cache.run(radarOccurrenceKey(provider, identity), async () => {
    const reservation = await ledger.reserve(provider, radarPaidPolicy(provider, env));
    if (!reservation.ok) return { ok: false, configured: reservation.reason !== 'budget-not-configured', provider, providerState: reservation.reason };
    try { return (await call()) || { ok: false, configured: true, provider, providerState: 'not_found' }; }
    catch { return { ok: false, configured: true, provider, providerState: 'provider_error' }; }
  });
}

let paidRuntime = null;
/** Server startup hands the existing MySQL pool getter; nothing is created at import. */
export function configureRadarPaidSources({ pool, now = Date.now, env = process.env } = {}) {
  paidRuntime = { paid: createPaidRadarSource({ ledger: createRadarSpendLedger({ pool, now }), cache: createRadarSourceCache({ now }), env }), env };
  return paidRuntime;
}

/**
 * Sequential routing options when explicitly enabled: Cirium Flex first, FlightAware
 * only when Cirium has no valid gate for the same occurrence. Undefined (legacy race)
 * unless CIRIUM_FLEX_RADAR_ENABLED is exactly 'true' with backend-only credentials.
 */
export function ciriumFlexRadarOptions(env = process.env) {
  const appId = String(env.CIRIUM_APP_ID || '').trim(), appKey = String(env.CIRIUM_APP_KEY || '').trim();
  if (env.CIRIUM_FLEX_RADAR_ENABLED !== 'true' || !appId || !appKey || !paidRuntime) return undefined;
  const { paid } = paidRuntime;
  return {
    enabled: true, flightAwareFallback: true, provider: 'cirium-flex',
    primary: identity => paid('cirium-flex', identity, () => fetchCiriumFlexOccurrence({ identity, credentials: { appId, appKey } })),
    guardFallback: (identity, call) => paid('flightaware', identity, call),
  };
}
