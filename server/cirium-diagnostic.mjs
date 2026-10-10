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

  if (appId && appKey) {
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
  const normalized = String(value || '').trim().toUpperCase();
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
  // Number(null) and Number('') are 0: a missing provider value must stay missing.
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
  return {
    get calls() { return calls; },
    async run(key, task) {
      const cached = cache.get(key);
      if (cached && now() - cached.at < limits.cacheTtlMs) return { ...cached.value, cached: true };
      if (inflight.has(key)) return inflight.get(key);
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
function acceptRow(row, carrier, flight) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  const rowCarrier = safeCode(row.carrierFsCode, /^[A-Z0-9]{2,3}$/);
  const rowFlight = safeCode(row.flightNumber, /^[0-9A-Z]{1,5}$/);
  return rowCarrier === carrier && rowFlight === flight;
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
        let state = normalizeCiriumResult(status, payload);
        // A 2xx with an unusable body proves nothing about the account.
        if (state === 'available' && !(jsonObject(payload) && Array.isArray(payload.flightStatuses))) state = 'invalid_payload';
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
      let state = normalizeCiriumResult(status, payload);
      if (state === 'available' && !(jsonObject(payload) && Array.isArray(payload.airlines))) state = 'invalid_payload';
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
  const safeFlight = safeCode(flight ?? '3377', /^[0-9]{1,4}[A-Z]?$/);
  if (!safeCarrier) return { ok: false, provider: config.provider, state: 'error', configured: true, reason: 'invalid_carrier' };
  if (!safeFlight) return { ok: false, provider: config.provider, state: 'error', configured: true, reason: 'invalid_flight' };
  const localDate = date || localToday();
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
      const accepted = rows.filter((row) => acceptRow(row, safeCarrier, safeFlight));
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
