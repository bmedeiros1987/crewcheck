import crypto from 'node:crypto';
import {
  googleMapsBudgetStatus,
  reserveGoogleMapsRequest,
  markGoogleMapsQuotaBlocked,
  googleMapsQuotaFailure,
  readGoogleRouteCache,
  writeGoogleRouteCache,
} from '../v14342/maps-budget.mjs';
import { sendJson } from '../v139/common.mjs';

const REQUEST_TIMEOUT_MS = 7000;
const TOMTOM_CACHE_TTL_MS = 90_000;
const tomtomCache = new Map();

export function voyageRoutePreviewCapabilities() {
  const google = Boolean(googleKey());
  const tomtom = Boolean(tomtomKey());
  return {
    version: '1.0',
    capability: 'ROUTES_AND_TRAFFIC',
    configured: google || tomtom,
    providers: {
      driving: [tomtom && 'TomTom', google && 'Google Routes'].filter(Boolean),
      transit: [google && 'Google Routes'].filter(Boolean),
    },
    modes: ['driving', 'transit'],
    sharedWithVoyage: true,
    auth: 'CREWCHECK_SHARED_SERVICES_TOKEN',
    providerSecretsExposed: false,
    policy: [
      'Reuse the same CrewCheck route-provider credentials and Google Maps monthly budget before adding Voyage-specific providers.',
      'Driving prefers TomTom and falls back to Google Routes with traffic-aware routing when configured.',
      'Transit uses Google Routes when configured.',
      'Unknown travel time, distance or availability remains unresolved rather than guessed.',
      'The shared route is advisory data; it never mutates a Voyage itinerary automatically.'
    ]
  };
}

export async function handleVoyageRoutePreviewSharedRoute(req, res, url) {
  const isCapabilities = url.pathname === '/api/shared/v1/routes/capabilities';
  const isPreview = url.pathname === '/api/shared/v1/routes/preview';
  if (!isCapabilities && !isPreview) return false;
  if (!['GET', 'HEAD'].includes(req.method)) {
    sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
    return true;
  }
  if (!authorize(req)) {
    sendJson(res, 401, { ok: false, code: 'SHARED_SERVICE_UNAUTHORIZED' });
    return true;
  }
  if (isCapabilities) {
    sendJson(res, 200, { ok: true, ...voyageRoutePreviewCapabilities(), mapsBudget: await googleMapsBudgetStatus() });
    return true;
  }

  const origin = cleanLocation(url.searchParams.get('origin'));
  const destination = cleanLocation(url.searchParams.get('destination'));
  const mode = normalizeMode(url.searchParams.get('mode'));
  if (!origin || !destination || !mode) {
    sendJson(res, 400, { ok: false, code: 'INVALID_ROUTE_QUERY', required: ['origin', 'destination'], modes: ['driving', 'transit'] });
    return true;
  }

  const result = await getSharedRoutePreview({ origin, destination, mode });
  sendJson(res, result.ok ? 200 : result.configured === false ? 503 : 200, result);
  return true;
}

export async function getSharedRoutePreview({ origin, destination, mode = 'driving', fetchImpl = globalThis.fetch } = {}) {
  const safeOrigin = cleanLocation(origin);
  const safeDestination = cleanLocation(destination);
  const safeMode = normalizeMode(mode);
  if (!safeOrigin || !safeDestination || !safeMode) return { ok: false, code: 'INVALID_ROUTE_QUERY' };

  const google = googleKey();
  const tomtom = tomtomKey();
  if (!google && !tomtom) return {
    ok: false,
    configured: false,
    code: 'ROUTE_PROVIDERS_NOT_CONFIGURED',
    providerOrder: safeMode === 'transit' ? ['Google Routes'] : ['TomTom', 'Google Routes'],
    secretsExposed: false
  };

  if (safeMode === 'driving' && tomtom) {
    const tomtomResult = await tomtomRoute(safeOrigin, safeDestination, tomtom, fetchImpl).catch(() => null);
    if (tomtomResult?.ok) return finish(tomtomResult, { providerOrder: ['TomTom', 'Google Routes'], fallback: false });
  }

  if (google) {
    const googleResult = await googleRoute(safeOrigin, safeDestination, safeMode, google, fetchImpl).catch(() => null);
    if (googleResult?.ok) return finish(googleResult, {
      providerOrder: safeMode === 'transit' ? ['Google Routes'] : ['TomTom', 'Google Routes'],
      fallback: safeMode === 'driving' && Boolean(tomtom),
      fallbackFrom: safeMode === 'driving' && tomtom ? 'TomTom' : null
    });
    if (googleResult?.budgetDenied || googleResult?.quotaFailure) return finish(googleResult, {
      providerOrder: safeMode === 'transit' ? ['Google Routes'] : ['TomTom', 'Google Routes']
    });
  }

  return {
    ok: false,
    configured: true,
    code: 'ROUTE_UNAVAILABLE',
    providerOrder: safeMode === 'transit' ? ['Google Routes'] : ['TomTom', 'Google Routes'],
    mapsBudget: await googleMapsBudgetStatus(),
    secretsExposed: false,
    itineraryMutation: false
  };
}

async function tomtomRoute(origin, destination, key, fetchImpl) {
  const cacheKey = `${origin.toLowerCase()}|${destination.toLowerCase()}`;
  const cached = tomtomCache.get(cacheKey);
  if (cached && Date.now() - cached.at <= TOMTOM_CACHE_TTL_MS) return { ...cached.value, cache: 'fresh', cacheAgeMs: Date.now() - cached.at };

  const [from, to] = await Promise.all([resolveTomTomPoint(origin, key, fetchImpl), resolveTomTomPoint(destination, key, fetchImpl)]);
  if (!from || !to) return { ok: false, configured: true, provider: 'TomTom', code: 'TOMTOM_GEOCODE_UNAVAILABLE' };
  const endpoint = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${from.lat},${from.lng}:${to.lat},${to.lng}/json`);
  endpoint.searchParams.set('key', key);
  endpoint.searchParams.set('traffic', 'true');
  endpoint.searchParams.set('travelMode', 'car');
  endpoint.searchParams.set('routeType', 'fastest');
  endpoint.searchParams.set('computeTravelTimeFor', 'all');
  const payload = await fetchJson(endpoint.toString(), { fetchImpl });
  const route = payload?.routes?.[0];
  const summary = route?.summary;
  if (!summary) return { ok: false, configured: true, provider: 'TomTom', code: 'TOMTOM_ROUTE_UNAVAILABLE' };
  const durationSeconds = finite(summary.travelTimeInSeconds);
  const baselineDurationSeconds = finite(summary.noTrafficTravelTimeInSeconds ?? summary.historicTrafficTravelTimeInSeconds);
  const trafficDelaySeconds = finite(summary.trafficDelayInSeconds) ?? (durationSeconds !== null && baselineDurationSeconds !== null ? Math.max(0, durationSeconds - baselineDurationSeconds) : null);
  const value = {
    ok: durationSeconds !== null && finite(summary.lengthInMeters) !== null,
    configured: true,
    provider: 'TomTom',
    liveTraffic: true,
    trafficAware: true,
    distanceMeters: finite(summary.lengthInMeters),
    durationSeconds,
    baselineDurationSeconds,
    trafficDelaySeconds,
    polyline: '',
    updatedAt: new Date().toISOString(),
    refreshAfterSeconds: 90,
    provenance: { route: 'CREWCHECK_SHARED_SERVICE', upstream: 'TomTom' },
    secretsExposed: false,
    itineraryMutation: false
  };
  if (value.ok) tomtomCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

async function resolveTomTomPoint(value, key, fetchImpl) {
  const coordinate = parseCoordinate(value);
  if (coordinate) return coordinate;
  const endpoint = new URL(`https://api.tomtom.com/search/2/geocode/${encodeURIComponent(value)}.json`);
  endpoint.searchParams.set('key', key);
  endpoint.searchParams.set('limit', '1');
  endpoint.searchParams.set('language', 'pt-BR');
  const payload = await fetchJson(endpoint.toString(), { fetchImpl });
  const position = payload?.results?.[0]?.position;
  const lat = finite(position?.lat);
  const lng = finite(position?.lon);
  return lat !== null && lng !== null ? { lat, lng } : null;
}

async function googleRoute(origin, destination, mode, key, fetchImpl) {
  const cached = readGoogleRouteCache(origin, destination, mode);
  if (cached) return { ...cached, provider: 'Google Routes', provenance: { route: 'CREWCHECK_SHARED_SERVICE', upstream: 'Google Routes' }, secretsExposed: false };
  const budget = await reserveGoogleMapsRequest('voyage_shared_routes', 1);
  if (!budget.allowed) return { ok: false, configured: true, provider: 'Google Routes', budgetDenied: true, code: 'GOOGLE_MAPS_MONTHLY_BUDGET', mapsBudget: budget, secretsExposed: false };
  const travelMode = mode === 'transit' ? 'TRANSIT' : 'DRIVE';
  const response = await fetchWithTimeout('https://routes.googleapis.com/directions/v2:computeRoutes', {
    fetchImpl,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.localizedValues'
    },
    body: JSON.stringify({
      origin: { address: origin },
      destination: { address: destination },
      travelMode,
      ...(travelMode === 'DRIVE' ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
      computeAlternativeRoutes: false,
      languageCode: 'pt-BR',
      units: 'METRIC'
    })
  });
  const payload = await response.json().catch(() => null);
  if (googleMapsQuotaFailure(response.status, payload)) {
    const blocked = await markGoogleMapsQuotaBlocked(`voyage_shared_quota_${response.status || 'unknown'}`);
    return { ok: false, configured: true, provider: 'Google Routes', quotaFailure: true, code: 'GOOGLE_PROVIDER_QUOTA', mapsBudget: blocked, secretsExposed: false };
  }
  const route = payload?.routes?.[0];
  if (!response.ok || !route) return { ok: false, configured: true, provider: 'Google Routes', code: 'GOOGLE_ROUTE_UNAVAILABLE', httpStatus: response.status, mapsBudget: await googleMapsBudgetStatus(), secretsExposed: false };
  const durationSeconds = duration(route.duration);
  const baselineDurationSeconds = duration(route.staticDuration);
  const value = {
    ok: durationSeconds !== null && finite(route.distanceMeters) !== null,
    configured: true,
    provider: 'Google Routes',
    liveTraffic: travelMode === 'DRIVE',
    trafficAware: travelMode === 'DRIVE',
    distanceMeters: finite(route.distanceMeters),
    distanceText: text(route.localizedValues?.distance?.text, 80),
    durationText: text(route.localizedValues?.duration?.text, 80),
    durationSeconds,
    baselineDurationSeconds,
    trafficDelaySeconds: durationSeconds !== null && baselineDurationSeconds !== null ? Math.max(0, durationSeconds - baselineDurationSeconds) : null,
    polyline: text(route.polyline?.encodedPolyline, 20000) || '',
    updatedAt: new Date().toISOString(),
    refreshAfterSeconds: 120,
    mapsBudget: await googleMapsBudgetStatus(),
    provenance: { route: 'CREWCHECK_SHARED_SERVICE', upstream: 'Google Routes' },
    secretsExposed: false,
    itineraryMutation: false
  };
  if (value.ok) writeGoogleRouteCache(origin, destination, mode, value);
  return value;
}

function finish(result, extra = {}) {
  return { ...result, ...extra, secretsExposed: false, itineraryMutation: false };
}

function googleKey() {
  return secret(process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_API_KEY);
}
function tomtomKey() { return secret(process.env.TOMTOM_API_KEY); }
function secret(value) {
  const clean = String(value || '').trim();
  return clean && !['value', 'changeme', 'placeholder'].includes(clean.toLowerCase()) ? clean : null;
}
function authorize(req) {
  const expected = secret(process.env.CREWCHECK_SHARED_SERVICES_TOKEN);
  const supplied = secret(req.headers['x-crewcheck-service-token']);
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function cleanLocation(value) {
  const clean = String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, ' ');
  return clean ? clean.slice(0, 300) : null;
}
function normalizeMode(value) {
  const mode = String(value || 'driving').trim().toLowerCase();
  return ['driving', 'transit'].includes(mode) ? mode : null;
}
function parseCoordinate(value) {
  const match = String(value || '').trim().match(/^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
function finite(value) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; }
function duration(value) { const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)s$/); return match ? Number(match[1]) : null; }
function text(value, max) { const clean = String(value || '').trim(); return clean ? clean.slice(0, max) : null; }
async function fetchJson(url, { fetchImpl }) { const response = await fetchWithTimeout(url, { fetchImpl }); if (!response.ok) return null; return response.json().catch(() => null); }
async function fetchWithTimeout(url, { fetchImpl, method = 'GET', headers = {}, body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try { return await fetchImpl(url, { method, headers, body, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
