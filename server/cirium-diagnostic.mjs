const CIRIUM_FLEX_PROBE_URL = 'https://api.flightstats.com/flex/airlines/rest/v1/json/iata/LA';
const CIRIUM_SKY_DEFAULT_BASE_URL = 'https://api.sky.cirium.com';
const CIRIUM_TIMEOUT_MS = 8_000;

function configuredValue(name) {
  return String(process.env[name] || '').trim();
}

function safeSkyBaseUrl(value) {
  const candidate = configuredValue('CIRIUM_SKY_BASE_URL') || value || CIRIUM_SKY_DEFAULT_BASE_URL;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && url.hostname === 'api.sky.cirium.com'
      ? url.origin
      : CIRIUM_SKY_DEFAULT_BASE_URL;
  } catch {
    return CIRIUM_SKY_DEFAULT_BASE_URL;
  }
}

export function ciriumConfiguration() {
  // Fail closed before accessing credentials. Setting a token is not consent
  // to consume upstream queries, including the legacy Flex diagnostic.
  if (process.env.CIRIUM_DIAGNOSTIC_ENABLED !== 'true') {
    return { mode: 'disabled', provider: 'cirium-sky', configured: false };
  }
  const skyToken = configuredValue('CIRIUM_SKY_API_TOKEN') || configuredValue('CIRIUM_SKY_SECRET');
  const skyIdentifier = configuredValue('CIRIUM_SKY_IDENTIFIER');
  const skyBaseUrl = safeSkyBaseUrl();
  const appId = configuredValue('CIRIUM_APP_ID');
  const appKey = configuredValue('CIRIUM_APP_KEY');

  if (skyToken) {
    return {
      mode: 'sky',
      provider: 'cirium-sky',
      token: skyToken,
      identifier: skyIdentifier,
      baseUrl: skyBaseUrl,
      configured: true,
    };
  }

  // The legacy FlightStats probe is not evidence of the Sky contract. It stays
  // unreachable unless a separate, explicit opt-in is present; Flex credentials
  // are never an automatic fallback for the Sky probe.
  if (appId && appKey && process.env.CIRIUM_DIAGNOSTIC_ALLOW_LEGACY_FLEX === 'true') {
    return {
      mode: 'flex',
      provider: 'cirium-flightstats',
      appId,
      appKey,
      configured: true,
    };
  }

  return { mode: 'none', provider: 'cirium-sky', configured: false };
}

function providerHint(payload) {
  const error = payload && typeof payload === 'object' ? payload.error : null;
  return [
    error?.code,
    error?.message,
    error?.status,
    error?.errorCode,
    error?.errorMessage,
    error?.httpStatusCode,
  ]
    .filter((value) => typeof value === 'string' || typeof value === 'number')
    .join(' ')
    .toLowerCase()
    .slice(0, 500);
}

export function normalizeCiriumResult(httpStatus, payload) {
  const hint = providerHint(payload);
  const pending = /pending|evaluation|plan|subscription|not active|inactive|not approved|approval/.test(hint);
  const quota = httpStatus === 429 || /quota|rate.?limit|usage.?limit|transaction.?limit|quota_exceeded/.test(hint);
  if (quota) return 'quota';
  if ((httpStatus === 401 || httpStatus === 403) && pending) return 'plan_pending';
  if (httpStatus === 401 || /invalid_token/.test(hint)) return 'forbidden';
  if (httpStatus === 403) return 'forbidden';
  if (httpStatus >= 200 && httpStatus < 300) return 'available';
  if (httpStatus === 404 || httpStatus === 405) return 'unverified';
  return 'error';
}

function safeCode(value, pattern, fallback = '') {
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) return fallback;
  const normalized = String(value).trim().toUpperCase();
  return pattern.test(normalized) ? normalized : fallback;
}

function safeDateParts(value = '') {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : match.slice(1).map(Number);
}

function timeValue(value) {
  if (!value || typeof value !== 'object') return null;
  return value.dateUtc || value.dateLocal || null;
}

function numericOrNull(value) {
  // Only real numbers or plain numeric strings. null, '', booleans, arrays and objects
  // (Number([]) and Number([null]) are 0) stay missing.
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
}

function flightSummary(flight) {
  const times = flight?.operationalTimes || {};
  const resources = flight?.airportResources || {};
  const equipment = flight?.flightEquipment || {};
  const delays = flight?.delays || {};
  const durations = flight?.flightDurations || {};
  const scheduledDeparture = timeValue(times.scheduledGateDeparture || times.publishedDeparture);
  const estimatedDeparture = timeValue(times.estimatedGateDeparture || times.estimatedRunwayDeparture);
  const actualDeparture = timeValue(times.actualGateDeparture || times.actualRunwayDeparture);
  const scheduledArrival = timeValue(times.scheduledGateArrival || times.publishedArrival);
  const estimatedArrival = timeValue(times.estimatedGateArrival || times.estimatedRunwayArrival);
  const actualArrival = timeValue(times.actualGateArrival || times.actualRunwayArrival);
  const updatedAt = flight?.lastUpdatedDate || flight?.statusDetails?.updatedAt || null;
  const updatedMs = Date.parse(updatedAt || '');
  const scheduledEquipment = equipment.scheduledEquipmentIataCode || equipment?.scheduledEquipment?.iata || null;
  const actualEquipment = equipment.actualEquipmentIataCode || equipment?.actualEquipment?.iata || null;
  const tailNumber = String(equipment.tailNumber || '').trim().slice(0, 32) || null;
  const codeshares = Array.isArray(flight?.codeshares)
    ? flight.codeshares.slice(0, 12).map((item) => ({
      carrier: safeCode(item?.fsCode, /^[A-Z0-9]{2,3}$/),
      flightNumber: safeCode(item?.flightNumber, /^[0-9A-Z]{1,5}$/),
      relationship: safeCode(item?.relationship, /^[A-Z]{1,2}$/),
    })).filter((item) => item.carrier && item.flightNumber)
    : [];
  const irregularOperations = Array.isArray(flight?.irregularOperations)
    ? flight.irregularOperations.slice(0, 10).map((item) => ({
      type: String(item?.type || item?.typeCode || '').trim().slice(0, 80) || null,
      reason: String(item?.reason || item?.reasonCode || '').trim().slice(0, 120) || null,
    }))
    : [];

  return {
    flightId: numericOrNull(flight?.flightId) || null,
    carrier: safeCode(flight?.carrierFsCode, /^[A-Z0-9]{2,3}$/),
    flightNumber: safeCode(flight?.flightNumber, /^[0-9A-Z]{1,5}$/),
    status: safeCode(flight?.status, /^[A-Z]{1,3}$/),
    route: {
      departure: safeCode(flight?.departureAirportFsCode, /^[A-Z0-9]{3,4}$/),
      arrival: safeCode(flight?.arrivalAirportFsCode, /^[A-Z0-9]{3,4}$/),
    },
    resources: {
      departureTerminal: String(resources.departureTerminal || '').slice(0, 20) || null,
      departureGate: String(resources.departureGate || '').slice(0, 20) || null,
      arrivalTerminal: String(resources.arrivalTerminal || '').slice(0, 20) || null,
      arrivalGate: String(resources.arrivalGate || '').slice(0, 20) || null,
      baggage: String(resources.baggage || '').slice(0, 20) || null,
    },
    equipment: {
      scheduled: scheduledEquipment,
      actual: actualEquipment,
      tailNumber,
    },
    delays: {
      departureGateMinutes: numericOrNull(delays.departureGateDelayMinutes),
      departureRunwayMinutes: numericOrNull(delays.departureRunwayDelayMinutes),
      arrivalGateMinutes: numericOrNull(delays.arrivalGateDelayMinutes),
      arrivalRunwayMinutes: numericOrNull(delays.arrivalRunwayDelayMinutes),
    },
    durations: {
      scheduledBlockMinutes: numericOrNull(durations.scheduledBlockMinutes),
      blockMinutes: numericOrNull(durations.blockMinutes),
      scheduledAirMinutes: numericOrNull(durations.scheduledAirMinutes),
      airMinutes: numericOrNull(durations.airMinutes),
      taxiOutMinutes: numericOrNull(durations.taxiOutMinutes),
      taxiInMinutes: numericOrNull(durations.taxiInMinutes),
    },
    times: { scheduledDeparture, estimatedDeparture, actualDeparture, scheduledArrival, estimatedArrival, actualArrival },
    codeshares,
    irregularOperations,
    freshness: {
      updatedAt,
      ageMinutes: Number.isFinite(updatedMs) ? Math.max(0, Math.round((Date.now() - updatedMs) / 60_000)) : null,
    },
    presence: {
      status: Boolean(flight?.status),
      departureGate: Boolean(resources.departureGate),
      departureTerminal: Boolean(resources.departureTerminal),
      arrivalGate: Boolean(resources.arrivalGate),
      arrivalTerminal: Boolean(resources.arrivalTerminal),
      baggage: Boolean(resources.baggage),
      scheduled: Boolean(scheduledDeparture || scheduledArrival),
      estimated: Boolean(estimatedDeparture || estimatedArrival),
      actual: Boolean(actualDeparture || actualArrival),
      aircraft: Boolean(actualEquipment || scheduledEquipment),
      registration: Boolean(tailNumber),
      delays: Object.values(delays).some((value) => numericOrNull(value) !== null),
      freshness: Boolean(updatedAt),
    },
  };
}

function skyFlightUrl(config, carrier, flight, date) {
  const url = new URL(`${config.baseUrl}/v1/flights/status/airline/${encodeURIComponent(carrier)}/flight-number/${encodeURIComponent(flight)}/departure-date/${date}`);
  url.searchParams.set('extendedOptions', 'includeDeltas,includeNewFields');
  return url;
}

// Conservative fallback used when a 429 does not carry a usable Retry-After.
const CIRIUM_RATE_LIMIT_FALLBACK_MS = 60_000;
function retryAfterMs(response, fallback = CIRIUM_RATE_LIMIT_FALLBACK_MS) {
  // A missing header must not be coerced: Number(null) is 0, which would read as
  // "retry immediately" instead of the conservative fallback.
  const raw = response?.headers?.get?.('retry-after');
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= 86_400 ? Math.round(seconds * 1_000) : fallback;
}

async function fetchJson(url, options, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CIRIUM_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}


// Process-wide protection against unintended or repeated upstream queries.
// Every real attempt is counted before the request starts; failures are cached
// too, so no caller can turn an error into a retry loop. No polling, no retries.
export const CIRIUM_GUARD_DEFAULTS = Object.freeze({
  maxCalls: 6,
  minIntervalMs: 30_000,
  cacheTtlMs: 10 * 60_000,
});

export function createCiriumGuard({ maxCalls, minIntervalMs, cacheTtlMs, now = Date.now } = {}) {
  const limits = {
    maxCalls: maxCalls ?? CIRIUM_GUARD_DEFAULTS.maxCalls,
    minIntervalMs: minIntervalMs ?? CIRIUM_GUARD_DEFAULTS.minIntervalMs,
    cacheTtlMs: cacheTtlMs ?? CIRIUM_GUARD_DEFAULTS.cacheTtlMs,
  };
  const cache = new Map();
  const inflight = new Map();
  let calls = 0;
  let lastStartedAt = -Infinity;
  let cooldownUntil = -Infinity;
  return {
    get calls() { return calls; },
    /** Records a provider 429 as a cooldown so it is never retried automatically. */
    noteRateLimit(retryAfterMs) {
      const requested = Number(retryAfterMs);
      const until = now() + (Number.isFinite(requested) && requested > 0 ? requested : 0);
      if (until > cooldownUntil) cooldownUntil = until;
      return cooldownUntil;
    },
    async run(key, task) {
      const cached = cache.get(key);
      if (cached && now() - cached.at < limits.cacheTtlMs) return { ...cached.value, cached: true };
      if (inflight.has(key)) return inflight.get(key);
      if (now() < cooldownUntil) {
        return {
          ok: false,
          state: 'provider_cooldown',
          reason: 'retry_after',
          upstreamCalled: false,
          retryAfterAt: new Date(cooldownUntil).toISOString(),
        };
      }
      if (calls >= limits.maxCalls) return { ok: false, state: 'budget_exhausted', reason: 'session_budget', upstreamCalled: false };
      if (now() - lastStartedAt < limits.minIntervalMs) return { ok: false, state: 'rate_limited_local', reason: 'min_interval', upstreamCalled: false };
      calls += 1;
      lastStartedAt = now();
      const pending = (async () => {
        try {
          const value = await task();
          cache.set(key, { at: now(), value });
          return value;
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, pending);
      return pending;
    },
  };
}

const defaultGuard = createCiriumGuard();

// Window is conservative until the official product contract is validated.
const CIRIUM_DATE_WINDOW_DAYS = 2;

function localToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function dateWithinWindow(value) {
  const days = Math.abs(Date.parse(`${value}T12:00:00Z`) - Date.parse(`${localToday()}T12:00:00Z`)) / 86_400_000;
  return days <= CIRIUM_DATE_WINDOW_DAYS;
}

// Rows that are not objects or that answer a different flight than the one
// requested are dropped, never displayed, and only counted.
function localDateOf(value) {
  const text = value && typeof value === 'object' ? value.dateLocal : null;
  const match = typeof text === 'string' ? text.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/) : null;
  return match ? match[1] : null;
}

function hasTimeOffset(text) {
  return typeof text === 'string' && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
}

function timestampEpoch(text, { utcField = false, wallClock = false } = {}) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(text)
      || !safeDateParts(text.slice(0, 10))) return null;
  const offset = text.match(/([+-])(\d{2}):?(\d{2})$/);
  if (offset && (Number(offset[3]) > 59 || Number(offset[2]) * 60 + Number(offset[3]) > 14 * 60)) return null;
  if (!hasTimeOffset(text) && !utcField && !wallClock) return null;
  // The named dateUtc field declares UTC even when Z is omitted. A bare local
  // clock is never converted using the machine's timezone; wallClock is only
  // used to bound a possible UTC offset, never as an actual flight instant.
  const epoch = Date.parse(hasTimeOffset(text) ? text : `${text}Z`);
  return Number.isFinite(epoch) ? epoch : null;
}

function utcDateOf(value) {
  const epoch = timestampEpoch(value?.dateUtc, { utcField: true });
  return epoch === null ? null : new Date(epoch).toISOString().slice(0, 10);
}

function epochOf(value) {
  if (value?.dateUtc != null) return timestampEpoch(value.dateUtc, { utcField: true });
  return timestampEpoch(value?.dateLocal);
}

// The occurrence must be the requested one: same flight, same departure date and a
// coherent leg. A row whose date cannot be verified is rejected, never displayed.
function acceptRow(row, carrier, flight, date) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  if (safeCode(row.carrierFsCode, /^[A-Z0-9]{2,3}$/) !== carrier) return false;
  if (safeCode(row.flightNumber, /^[0-9A-Z]{1,5}$/) !== flight) return false;

  const times = row.operationalTimes && typeof row.operationalTimes === 'object' ? row.operationalTimes : {};
  const dayMs = 86_400_000;
  const requestedDay = Date.parse(`${date}T12:00:00Z`);
  const plannedDepartures = [row.departureDate, times.scheduledGateDeparture, times.publishedDeparture].filter((v) => v != null);
  if (!plannedDepartures.length) return false;

  function consistentTime(value, kind) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const local = localDateOf(value);
    const utc = utcDateOf(value);
    if (!local && !utc) return false;
    if (value.dateLocal != null && (!local || !safeDateParts(local) || (value.dateLocal !== local && timestampEpoch(value.dateLocal, { wallClock: true }) === null))) return false;
    if (value.dateUtc != null && !utc) return false;
    // dateLocal without an offset is a wall clock, not the host's timezone.
    // Its difference from UTC must be a plausible civil offset; no airport zone
    // is inferred. When an explicit offset exists, both values must be the same instant.
    const hasTime = (text) => typeof text === 'string' && /T\d{2}:\d{2}/.test(text);
    if (hasTime(value.dateLocal) && hasTime(value.dateUtc)) {
      const utcInstant = timestampEpoch(value.dateUtc, { utcField: true });
      const localInstant = timestampEpoch(value.dateLocal, { wallClock: true });
      if (utcInstant === null || localInstant === null) return false;
      const difference = Math.abs(utcInstant - localInstant);
      if (hasTimeOffset(value.dateLocal) ? difference !== 0 : difference > 14 * 3_600_000) return false;
    }
    // Local and UTC may straddle midnight, but cannot describe different years/days.
    if (local && utc && Math.abs(Date.parse(`${local}T12:00:00Z`) - Date.parse(`${utc}T12:00:00Z`)) > dayMs) return false;
    for (const [day, isLocal] of [[local, true], [utc, false]]) {
      if (!day) continue;
      const delta = (Date.parse(`${day}T12:00:00Z`) - requestedDay) / dayMs;
      if (kind === 'planned-departure' && isLocal && delta !== 0) return false;
      // Operational departures may be delayed into the next day; arrivals may cross
      // another midnight. Beyond these conservative bounds the occurrence is unverified.
      if (delta < -1 || delta > (kind === 'arrival' ? 2 : 1)) return false;
    }
    return true;
  }
  if (!plannedDepartures.every((value) => consistentTime(value, 'planned-departure'))) return false;
  if (row.arrivalDate != null && !consistentTime(row.arrivalDate, 'arrival')) return false;
  for (const [name, value] of Object.entries(times)) {
    if (value == null || !/(Departure|Arrival)$/.test(name)) continue;
    if (!consistentTime(value, /Arrival$/.test(name) ? 'arrival' : 'departure')) return false;
  }

  const departure = safeCode(row.departureAirportFsCode, /^[A-Z0-9]{3,4}$/);
  const arrival = safeCode(row.arrivalAirportFsCode, /^[A-Z0-9]{3,4}$/);
  if (!departure || !arrival || departure === arrival) return false;

  function coherentPair(outValue, inValue) {
    const out = epochOf(outValue), inn = epochOf(inValue);
    // Two supplied endpoints require comparable instants. Different airports'
    // bare local clocks cannot establish elapsed time without verified zones.
    return out !== null && inn !== null && inn > out && inn - out <= dayMs;
  }
  // flightSummary chooses scheduledGate first, then published, independently
  // for each endpoint. That displayed pair can span two prefixes and must be
  // coherent as well as the complete pairs supplied by the provider.
  const displayedDeparture = times.scheduledGateDeparture || times.publishedDeparture;
  const displayedArrival = times.scheduledGateArrival || times.publishedArrival;
  if (displayedDeparture && displayedArrival && !coherentPair(displayedDeparture, displayedArrival)) return false;
  for (const prefix of ['scheduled', 'published', 'estimated', 'actual']) {
    const departures = Object.entries(times).filter(([name, value]) => value != null && name.startsWith(prefix) && /Departure$/.test(name));
    const arrivals = Object.entries(times).filter(([name, value]) => value != null && name.startsWith(prefix) && /Arrival$/.test(name));
    for (const [, out] of departures) for (const [, inn] of arrivals) {
      if (!coherentPair(out, inn)) return false;
    }
  }
  if (row.departureDate != null && row.arrivalDate != null && !coherentPair(row.departureDate, row.arrivalDate)) return false;
  return true;
}

function jsonObject(payload) {
  return payload && typeof payload === 'object' && !Array.isArray(payload);
}

export async function diagnoseCirium({ fetchImpl = globalThis.fetch, guard = defaultGuard } = {}) {
  const config = ciriumConfiguration();
  if (!config.configured) {
    return { ok: true, provider: config.provider, state: config.mode === 'disabled' ? 'disabled' : 'not_configured', configured: false };
  }
  const probeDate = localToday();
  return guard.run(`probe:${config.mode}:${probeDate}`, async () => {
    try {
      if (config.mode === 'sky') {
        const url = skyFlightUrl(config, 'LA', '3377', probeDate);
        const { response, payload } = await fetchJson(url, {
          method: 'GET',
          headers: { accept: 'application/json', authorization: config.token },
          redirect: 'error',
        }, fetchImpl);
        const status = Number(response.status) || null;
        if (status === 429) guard.noteRateLimit?.(retryAfterMs(response));
        let state = normalizeCiriumResult(status, payload);
        // A 2xx with an unusable body proves nothing about the account.
        if (state === 'available' && !(jsonObject(payload) && Array.isArray(payload.flightStatuses)
          && payload.flightStatuses.every((row) => acceptRow(row, 'LA', '3377', probeDate)))) state = 'invalid_payload';
        return {
          ok: state === 'available',
          provider: config.provider,
          state,
          configured: true,
          httpStatus: status,
          credentialIdentifierConfigured: Boolean(config.identifier),
        };
      }

      const url = new URL(CIRIUM_FLEX_PROBE_URL);
      url.searchParams.set('appId', config.appId);
      url.searchParams.set('appKey', config.appKey);
      const { response, payload } = await fetchJson(url, {
        method: 'GET', headers: { accept: 'application/json' }, redirect: 'error',
      }, fetchImpl);
      const status = Number(response.status) || null;
      if (status === 429) guard.noteRateLimit?.(retryAfterMs(response));
      let state = normalizeCiriumResult(status, payload);
      if (state === 'available' && !(jsonObject(payload) && Array.isArray(payload.airlines)
        && payload.airlines.every((row) => jsonObject(row) && typeof (row.fs || row.iata) === 'string'))) state = 'invalid_payload';
      return { ok: state === 'available', provider: config.provider, state, configured: true, httpStatus: status };
    } catch (error) {
      return {
        ok: false,
        provider: config.provider,
        state: 'error',
        configured: true,
        reason: error?.name === 'AbortError' ? 'timeout' : 'unavailable',
      };
    }
  });
}

export async function diagnoseCiriumFlight({ carrier, flight, date, fetchImpl = globalThis.fetch, guard = defaultGuard } = {}) {
  const config = ciriumConfiguration();
  if (!config.configured) return { ok: false, provider: config.provider, state: config.mode === 'disabled' ? 'disabled' : 'not_configured', configured: false };

  // Invalid input is rejected locally; it is never rewritten into another flight.
  const safeCarrier = safeCode(carrier ?? 'LA', /^[A-Z0-9]{2,3}$/);
  if (date !== undefined && date !== null && typeof date !== 'string') return { ok: false, provider: config.provider, state: 'error', configured: true, reason: 'invalid_date' };
  const safeFlight = safeCode(flight ?? '3377', /^[0-9]{1,4}[A-Z]?$/);
  if (!safeCarrier) return { ok: false, provider: config.provider, state: 'error', configured: true, reason: 'invalid_carrier' };
  if (!safeFlight) return { ok: false, provider: config.provider, state: 'error', configured: true, reason: 'invalid_flight' };
  const localDate = date ?? localToday();
  const parts = safeDateParts(localDate);
  if (!parts) return { ok: false, provider: config.provider, state: 'error', configured: true, reason: 'invalid_date' };
  if (!dateWithinWindow(localDate)) return { ok: false, provider: config.provider, state: 'error', configured: true, reason: 'date_out_of_window' };

  let url;
  let headers = { accept: 'application/json' };
  if (config.mode === 'sky') {
    url = skyFlightUrl(config, safeCarrier, safeFlight, localDate);
    headers = { ...headers, authorization: config.token };
  } else {
    const [year, month, day] = parts;
    url = new URL(`https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/${safeCarrier}/${safeFlight}/dep/${year}/${month}/${day}`);
    url.searchParams.set('appId', config.appId);
    url.searchParams.set('appKey', config.appKey);
    url.searchParams.set('extendedOptions', 'useHttpErrors');
  }

  return guard.run(`flight:${config.mode}:${safeCarrier}:${safeFlight}:${localDate}`, async () => {
    try {
      const { response, payload } = await fetchJson(url, { method: 'GET', headers, redirect: 'error' }, fetchImpl);
      if (Number(response.status) === 429) guard.noteRateLimit?.(retryAfterMs(response));
      const state = normalizeCiriumResult(response.status, payload);
      if (response.status < 200 || response.status >= 300) {
        return { ok: false, provider: config.provider, state, configured: true, httpStatus: response.status };
      }
      const rows = jsonObject(payload) && Array.isArray(payload.flightStatuses)
        ? payload.flightStatuses
        : jsonObject(payload) && jsonObject(payload.flightStatus)
          ? [payload.flightStatus]
          : null;
      if (!rows) return { ok: false, provider: config.provider, state: 'invalid_payload', configured: true, httpStatus: response.status };
      const accepted = rows.filter((row) => acceptRow(row, safeCarrier, safeFlight, localDate));
      const rejected = rows.length - accepted.length;
      if (rows.length && !accepted.length) {
        return { ok: false, provider: config.provider, state: 'invalid_payload', configured: true, httpStatus: response.status, rejectedRows: rejected };
      }
      const flights = accepted.map(flightSummary);
      return {
        ok: true,
        provider: config.provider,
        state: flights.length ? 'available' : 'no_data',
        configured: true,
        httpStatus: response.status,
        query: { carrier: safeCarrier, flight: safeFlight, date: localDate },
        count: flights.length,
        rejectedRows: rejected,
        flights: flights.slice(0, 8),
      };
    } catch (error) {
      return { ok: false, provider: config.provider, state: 'error', configured: true, reason: error?.name === 'AbortError' ? 'timeout' : 'unavailable' };
    }
  });
}
