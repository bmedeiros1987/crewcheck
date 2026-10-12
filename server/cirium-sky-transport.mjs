import { evaluateCiriumRadar } from './cirium-radar-provider.mjs';

// Activation requires a separate reviewed change with current entitlement evidence.
export const CIRIUM_SKY_PRODUCTION_ENABLED = false;
const BASE = 'https://api.sky.cirium.com';
const MAX_BYTES = 256 * 1024;
const disabled = () => ({ state: 'disabled', upstreamCalled: false });
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);

// No diagnostic summary, context-derived times, carrier aliases, or Flex fallback.
export function adaptSkyStatusEnvelope(payload) {
  if (!object(payload) || Object.hasOwn(payload, 'error')) return { state: 'invalid_payload' };
  const plural = Object.hasOwn(payload, 'flightStatuses');
  const singular = Object.hasOwn(payload, 'flightStatus');
  if (plural === singular) return { state: 'invalid_payload' };
  const rows = plural ? payload.flightStatuses : object(payload.flightStatus) ? [payload.flightStatus] : null;
  if (!Array.isArray(rows) || rows.length > 100 || rows.some(x => !object(x))) return { state: 'invalid_payload' };
  return { state: 'available', rows };
}

function policyValid(p, now) {
  return object(p) && p.product === 'Sky Flight Status' && typeof p.evidenceId === 'string' && p.evidenceId.length > 0
    && typeof p.contractEvidenceId === 'string' && p.contractEvidenceId.length > 0
    && Number.isInteger(p.maxObservationAgeMs) && p.maxObservationAgeMs > 0 && p.maxObservationAgeMs <= 900_000
    && Number.isFinite(p.validFromMs) && Number.isFinite(p.validUntilMs) && now >= p.validFromMs && now < p.validUntilMs
    && Number.isInteger(p.maxCalls) && p.maxCalls > 0 && p.maxCalls <= 100
    && Number.isInteger(p.dateWindowDays) && p.dateWindowDays >= 0 && p.dateWindowDays <= 2
    && object(p.airportTimeZones);
}

function cooldownMs(headers, now) {
  const raw = headers?.get?.('retry-after');
  const seconds = typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw) : NaN;
  const date = typeof raw === 'string' && !Number.isFinite(seconds) ? Date.parse(raw) : NaN;
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Number.isFinite(date) ? date - now : 60_000;
  // A zero/missing/malformed header cannot create an immediate retry loop.
  return Math.min(86_400_000, Math.max(60_000, ms));
}

async function readPayload(response, signal) {
  if (!/^(application\/json)(?:\s*;|$)/i.test(response.headers?.get?.('content-type') || '')) throw Error('payload');
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) throw Error('payload');
  if (!response.body?.getReader) throw Error('payload');
  const reader = response.body.getReader();
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  const chunks = []; let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw Error('payload');
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener('abort', cancel); cancel();
    reader.releaseLock();
  }
  const buffer = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
}

// Explicit code-injected capability for offline tests / a future bounded canary.
// Policy is copied once; caller mutation cannot extend quota or entitlement.
// No environment reads, background timers, polling, retries, or logging.
export function createCiriumSkyTransport({ enabled = false, policy, credential, fetchImpl = globalThis.fetch,
  now = Date.now, timeoutMs = 8000, cacheTtlMs = 60_000, minIntervalMs = 1000 } = {}) {
  const p = object(policy) ? { ...policy, airportTimeZones: { ...policy.airportTimeZones } } : null;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000
    || !Number.isInteger(cacheTtlMs) || cacheTtlMs < 1000 || cacheTtlMs > 60_000
    || !Number.isInteger(minIntervalMs) || minIntervalMs < 1000) throw Error('Invalid transport limits');
  const cache = new Map(), pending = new Map();
  let calls = 0, lastStarted = -Infinity, cooldownUntil = 0;
  function delivery(value, identity) {
    if (!policyValid(p, now())) return { state: 'not_configured', upstreamCalled: value.upstreamCalled === true };
    if (value.state !== 'available') return structuredClone(value);
    const evaluated = evaluateCiriumRadar(identity, value, { enabled: true });
    if (!evaluated.ok) return { state: evaluated.state, upstreamCalled: value.upstreamCalled === true };
    const observed = Date.parse(evaluated.candidate.updatedAt);
    if (!Number.isFinite(observed) || now() - observed > p.maxObservationAgeMs || observed > now())
      return { state: 'stale_data', upstreamCalled: value.upstreamCalled === true };
    return structuredClone(value);
  }
  const keyOf = identity => JSON.stringify(['carrierNamespace', 'carrierFsCode', 'flightNumber', 'origin', 'destination',
    'departureDate', 'originTimeZone', 'scheduledDepartureUtc'].map(k => k === 'scheduledDepartureUtc' ? new Date(identity[k]).toISOString() : identity[k]));
  async function source(identity) {
    if (enabled !== true) return disabled();
    if (!object(identity)) return { state: 'invalid_request', upstreamCalled: false };
    identity = Object.freeze({ ...identity });
    const at = now();
    if (!policyValid(p, at)) return { state: 'not_configured', upstreamCalled: false };
    const validation = evaluateCiriumRadar(identity, { state: 'available', rows: [] }, { enabled: true });
    if (validation.state === 'invalid_request') return { state: 'invalid_request', upstreamCalled: false };
    if (p.airportTimeZones[identity.origin] !== identity.originTimeZone) return { state: 'invalid_request', upstreamCalled: false };
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: identity.originTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
    const part = k => parts.find(x => x.type === k).value;
    const today = `${part('year')}-${part('month')}-${part('day')}`;
    if (Math.abs(Date.parse(identity.departureDate) - Date.parse(today)) > p.dateWindowDays * 86_400_000)
      return { state: 'invalid_request', upstreamCalled: false };
    const key = keyOf(identity);
    const hit = cache.get(key);
    if (hit && at - hit.at < cacheTtlMs) return delivery({ ...hit.value, cached: true, upstreamCalled: false }, identity);
    if (pending.has(key)) return delivery(await pending.get(key), identity);
    if (at < cooldownUntil || at - lastStarted < minIntervalMs) return { state: 'rate_limited', upstreamCalled: false };
    if (calls >= p.maxCalls) return { state: 'rate_limited', reason: 'budget_exhausted', upstreamCalled: false };
    if (typeof credential !== 'function' || typeof fetchImpl !== 'function') return { state: 'not_configured', upstreamCalled: false };
    let token;
    try { token = credential(); } catch { return { state: 'not_configured', upstreamCalled: false }; }
    if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) return { state: 'not_configured', upstreamCalled: false };
    calls++; lastStarted = at;
    const controller = new AbortController();
    let timer, response;
    const task = (async () => {
      const url = new URL(`/v1/flights/status/airline/${encodeURIComponent(identity.carrierFsCode)}/flight-number/${encodeURIComponent(identity.flightNumber)}/departure-date/${identity.departureDate}`, BASE);
      try {
        const timeout = new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve({ state: 'timeout' }); }, timeoutMs); });
        const request = (async () => {
          response = await fetchImpl(url, { method: 'GET', headers: { Authorization: token, Accept: 'application/json' }, signal: controller.signal, redirect: 'error' });
          if (controller.signal.aborted) { response.body?.cancel?.().catch(() => {}); return { state: 'timeout' }; }
          if (response.status === 429) { cooldownUntil = Math.max(cooldownUntil, now() + cooldownMs(response.headers, now())); return { state: 'rate_limited' }; }
          if (response.status !== 200) {
            if (response.status === 401 || response.status === 403) cooldownUntil = p.validUntilMs;
            return { state: 'provider_error' };
          }
          try {
            const envelope = adaptSkyStatusEnvelope(await readPayload(response, controller.signal));
            if (envelope.state !== 'available') return envelope;
            return delivery(envelope, identity);
          }
          catch { return { state: 'invalid_payload' }; }
        })().catch(() => ({ state: controller.signal.aborted ? 'timeout' : 'provider_error' }));
        const value = { ...await Promise.race([request, timeout]), upstreamCalled: true };
        if (value.state === 'timeout') cooldownUntil = Math.max(cooldownUntil, now() + 60_000);
        cache.set(key, { at: now(), value: structuredClone(value) });
        if (cache.size > 128) cache.delete(cache.keys().next().value);
        return value;
      } finally {
        clearTimeout(timer); controller.abort();
        // Abort native fetch even when an error response body is never consumed.
        // Do not wait forever for a non-cooperative injected/mock stream.
        if (response?.body && !response.body.locked) response.body.cancel().catch(() => {});
        token = null;
      }
    })();
    pending.set(key, task);
    try { return delivery(await task, identity); } finally { pending.delete(key); }
  }
  return Object.freeze({ source, counters: () => ({ calls, cacheEntries: cache.size, pending: pending.size }) });
}

// The live process cannot acquire a transport from credentials or HTTP params.
export function productionCiriumSkyTransport() { return createCiriumSkyTransport({ enabled: CIRIUM_SKY_PRODUCTION_ENABLED }); }

export async function runCiriumSkyRadar(identity, transport, requestedFlight) {
  const validation = evaluateCiriumRadar(identity, { state: 'available', rows: [] }, { enabled: true });
  let result = validation;
  if (validation.state !== 'invalid_request' && requestedFlight === `${identity.carrierFsCode}${identity.flightNumber}`) {
    const response = await transport.source(Object.freeze({ ...identity }));
    result = response.state === 'available' || ['not_configured', 'timeout', 'rate_limited', 'provider_error'].includes(response.state)
      ? evaluateCiriumRadar(identity, response, { enabled: true }) : { state: response.state, ok: false };
  } else result = { state: 'invalid_request', ok: false };
  return { ...(result.candidate || {}), provider: 'cirium-sky', providerState: result.state, ok: result.ok,
    configured: result.state !== 'disabled' && result.state !== 'not_configured', canonicalReadOnly: true,
    occurrenceKey: result.occurrenceKey || '', provenance: result.provenance || null,
    updatedAt: result.candidate?.updatedAt || null, exportedToConcierge: false };
}
