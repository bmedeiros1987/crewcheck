import crypto from 'node:crypto';
import { diagnoseCiriumFlight, ciriumConfiguration } from '../cirium-diagnostic.mjs';
import { sendJson } from '../v139/common.mjs';

const CACHE_TTL_MS = 60_000;
const STALE_TTL_MS = 10 * 60_000;
const cache = new Map();

export function voyageFlightStatusCapabilities() {
  const config = ciriumConfiguration();
  return {
    version: '1.0',
    capability: 'FLIGHT_STATUS',
    provider: config.provider,
    configured: Boolean(config.configured),
    sharedWithVoyage: true,
    fields: [
      'STATUS',
      'DEPARTURE_GATE',
      'DEPARTURE_TERMINAL',
      'ARRIVAL_GATE',
      'ARRIVAL_TERMINAL',
      'BAGGAGE_CAROUSEL',
      'SCHEDULED_ESTIMATED_ACTUAL_TIMES',
      'AIRCRAFT',
      'REGISTRATION',
      'DELAYS',
      'IRREGULAR_OPERATIONS',
      'FRESHNESS'
    ],
    auth: 'CREWCHECK_SHARED_SERVICES_TOKEN',
    providerSecretsExposed: false,
    policy: [
      'Voyage consumes the existing CrewCheck Cirium integration rather than duplicating provider credentials.',
      'Baggage carousel is operational data only and never proves whether baggage is through-checked.',
      'Stale data may be returned only after a live provider failure and is explicitly labeled stale.',
      'This service returns provider-backed facts; it does not mutate CrewCheck or Voyage itineraries.'
    ]
  };
}

export async function handleVoyageFlightStatusSharedRoute(req, res, url) {
  const isCapabilities = url.pathname === '/api/shared/v1/flight/status/capabilities';
  const isStatus = url.pathname === '/api/shared/v1/flight/status';
  if (!isCapabilities && !isStatus) return false;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
    return true;
  }

  if (!authorize(req)) {
    sendJson(res, 401, { ok: false, code: 'SHARED_SERVICE_UNAUTHORIZED' });
    return true;
  }

  if (isCapabilities) {
    sendJson(res, 200, { ok: true, ...voyageFlightStatusCapabilities() });
    return true;
  }

  const carrier = normalizeCarrier(url.searchParams.get('carrier'));
  const flight = normalizeFlight(url.searchParams.get('flight'));
  const date = normalizeDate(url.searchParams.get('date'));
  if (!carrier || !flight || !date) {
    sendJson(res, 400, { ok: false, code: 'INVALID_FLIGHT_QUERY', required: ['carrier', 'flight', 'date'] });
    return true;
  }

  const result = await getSharedFlightStatus({ carrier, flight, date });
  sendJson(res, result.ok ? 200 : result.code === 'CIRIUM_NOT_CONFIGURED' ? 503 : 502, result);
  return true;
}

export async function getSharedFlightStatus({ carrier, flight, date, forceRefresh = false, fetchImpl = globalThis.fetch } = {}) {
  const safeCarrier = normalizeCarrier(carrier);
  const safeFlight = normalizeFlight(flight);
  const safeDate = normalizeDate(date);
  if (!safeCarrier || !safeFlight || !safeDate) return { ok: false, code: 'INVALID_FLIGHT_QUERY' };

  const key = `${safeCarrier}:${safeFlight}:${safeDate}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (!forceRefresh && cached && now - cached.at <= CACHE_TTL_MS) {
    return clone({ ...cached.value, cache: { hit: true, stale: false, ageSeconds: Math.floor((now - cached.at) / 1000) } });
  }

  const configuration = ciriumConfiguration();
  if (!configuration.configured) {
    return {
      ok: false,
      code: 'CIRIUM_NOT_CONFIGURED',
      provider: configuration.provider,
      query: { carrier: safeCarrier, flight: safeFlight, date: safeDate },
      flights: [],
      secretsExposed: false
    };
  }

  const live = await diagnoseCiriumFlight({ carrier: safeCarrier, flight: safeFlight, date: safeDate, fetchImpl });
  if (live.ok) {
    const value = {
      ok: true,
      provider: live.provider,
      status: 'LIVE',
      query: live.query || { carrier: safeCarrier, flight: safeFlight, date: safeDate },
      count: Number(live.count || 0),
      flights: Array.isArray(live.flights) ? live.flights.slice(0, 8) : [],
      fetchedAt: new Date(now).toISOString(),
      cache: { hit: false, stale: false, ageSeconds: 0 },
      provenance: { route: 'CREWCHECK_SHARED_SERVICE', upstream: live.provider },
      secretsExposed: false
    };
    cache.set(key, { at: now, value });
    return clone(value);
  }

  if (cached && now - cached.at <= STALE_TTL_MS) {
    return clone({
      ...cached.value,
      status: 'STALE_IF_ERROR',
      warning: safeCode(live.reason || live.state || 'UPSTREAM_UNAVAILABLE'),
      cache: { hit: true, stale: true, ageSeconds: Math.floor((now - cached.at) / 1000) }
    });
  }

  return {
    ok: false,
    code: 'CIRIUM_UPSTREAM_UNAVAILABLE',
    provider: live.provider || configuration.provider,
    state: safeCode(live.state),
    reason: safeCode(live.reason),
    query: { carrier: safeCarrier, flight: safeFlight, date: safeDate },
    flights: [],
    fetchedAt: new Date(now).toISOString(),
    secretsExposed: false
  };
}

function authorize(req) {
  const expected = configured(process.env.CREWCHECK_SHARED_SERVICES_TOKEN);
  const supplied = configured(req.headers['x-crewcheck-service-token']);
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizeCarrier(value) {
  const text = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9]{2,3}$/.test(text) ? text : null;
}

function normalizeFlight(value) {
  const text = String(value || '').trim().toUpperCase();
  return /^[0-9]{1,4}[A-Z]?$/.test(text) ? text : null;
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : null;
}

function configured(value) {
  const text = String(value || '').trim();
  return text && !['value', 'changeme', 'placeholder', 'your_value_here'].includes(text.toLowerCase()) ? text : null;
}

function safeCode(value) {
  const code = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_').slice(0, 100);
  return code || null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
