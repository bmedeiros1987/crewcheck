const CIRIUM_PROBE_URL = 'https://api.flightstats.com/flex/airlines/rest/v1/json/iata/LA';
const CIRIUM_TIMEOUT_MS = 8_000;

function configuredValue(name) {
  return String(process.env[name] || '').trim();
}

export function ciriumConfiguration() {
  const appId = configuredValue('CIRIUM_APP_ID');
  const appKey = configuredValue('CIRIUM_APP_KEY');
  return { appId, appKey, configured: Boolean(appId && appKey) };
}

function providerHint(payload) {
  const error = payload && typeof payload === 'object' ? payload.error : null;
  return [error?.errorCode, error?.errorMessage, error?.httpStatusCode]
    .filter((value) => typeof value === 'string' || typeof value === 'number')
    .join(' ')
    .toLowerCase()
    .slice(0, 500);
}

export function normalizeCiriumResult(httpStatus, payload) {
  const hint = providerHint(payload);
  const pending = /pending|evaluation|plan|subscription|not active|inactive|not approved|approval/.test(hint);
  const quota = httpStatus === 429 || /quota|rate.?limit|usage.?limit|transaction.?limit/.test(hint);
  if (quota) return 'quota';
  if ((httpStatus === 401 || httpStatus === 403) && pending) return 'plan_pending';
  if (httpStatus === 401 || httpStatus === 403) return 'forbidden';
  if (httpStatus >= 200 && httpStatus < 300) {
    const airlines = Array.isArray(payload?.airlines) ? payload.airlines : [];
    return airlines.length > 0 ? 'available' : 'authenticated';
  }
  if (httpStatus === 404 || httpStatus === 405) return 'authenticated';
  return 'error';
}

export async function diagnoseCirium({ fetchImpl = globalThis.fetch } = {}) {
  const config = ciriumConfiguration();
  if (!config.configured) {
    return { ok: true, provider: 'cirium-flightstats', state: 'not_configured', configured: false };
  }

  const url = new URL(CIRIUM_PROBE_URL);
  url.searchParams.set('appId', config.appId);
  url.searchParams.set('appKey', config.appKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CIRIUM_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const state = normalizeCiriumResult(response.status, payload);
    return {
      ok: state === 'available' || state === 'authenticated',
      provider: 'cirium-flightstats',
      state,
      configured: true,
      httpStatus: Number(response.status) || null,
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'cirium-flightstats',
      state: 'error',
      configured: true,
      reason: error?.name === 'AbortError' ? 'timeout' : 'unavailable',
    };
  } finally {
    clearTimeout(timer);
  }
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

function flightSummary(flight) {
  const times = flight?.operationalTimes || {};
  const resources = flight?.airportResources || {};
  const scheduledDeparture = timeValue(times.scheduledGateDeparture || times.publishedDeparture);
  const estimatedDeparture = timeValue(times.estimatedGateDeparture || times.estimatedRunwayDeparture);
  const actualDeparture = timeValue(times.actualGateDeparture || times.actualRunwayDeparture);
  const scheduledArrival = timeValue(times.scheduledGateArrival || times.publishedArrival);
  const estimatedArrival = timeValue(times.estimatedGateArrival || times.estimatedRunwayArrival);
  const actualArrival = timeValue(times.actualGateArrival || times.actualRunwayArrival);
  const updatedAt = flight?.lastUpdatedDate || flight?.statusDetails?.updatedAt || null;
  const updatedMs = Date.parse(updatedAt || '');
  return {
    flightId: Number(flight?.flightId) || null,
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
    times: { scheduledDeparture, estimatedDeparture, actualDeparture, scheduledArrival, estimatedArrival, actualArrival },
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
      scheduled: Boolean(scheduledDeparture || scheduledArrival),
      estimated: Boolean(estimatedDeparture || estimatedArrival),
      actual: Boolean(actualDeparture || actualArrival),
      freshness: Boolean(updatedAt),
    },
  };
}

export async function diagnoseCiriumFlight({ carrier = 'LA', flight = '3377', date, fetchImpl = globalThis.fetch } = {}) {
  const config = ciriumConfiguration();
  if (!config.configured) return { ok: false, provider: 'cirium-flightstats', state: 'not_configured', configured: false };
  const safeCarrier = safeCode(carrier, /^[A-Z0-9]{2,3}$/, 'LA');
  const safeFlight = safeCode(flight, /^[0-9]{1,5}[A-Z]?$/, '3377');
  const localDate = date || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const parts = safeDateParts(localDate);
  if (!parts) return { ok: false, provider: 'cirium-flightstats', state: 'error', configured: true, reason: 'invalid_date' };
  const [year, month, day] = parts;
  const url = new URL(`https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/${safeCarrier}/${safeFlight}/dep/${year}/${month}/${day}`);
  url.searchParams.set('appId', config.appId);
  url.searchParams.set('appKey', config.appKey);
  url.searchParams.set('extendedOptions', 'useHttpErrors');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CIRIUM_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { headers: { accept: 'application/json' }, redirect: 'error', signal: controller.signal });
    const payload = await response.json().catch(() => null);
    const state = normalizeCiriumResult(response.status, payload);
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, provider: 'cirium-flightstats', state, configured: true, httpStatus: response.status };
    }
    const flights = Array.isArray(payload?.flightStatuses) ? payload.flightStatuses.map(flightSummary) : [];
    return {
      ok: true,
      provider: 'cirium-flightstats',
      state: flights.length ? 'available' : 'authenticated',
      configured: true,
      httpStatus: response.status,
      query: { carrier: safeCarrier, flight: safeFlight, date: localDate },
      count: flights.length,
      flights: flights.slice(0, 8),
    };
  } catch (error) {
    return { ok: false, provider: 'cirium-flightstats', state: 'error', configured: true, reason: error?.name === 'AbortError' ? 'timeout' : 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

