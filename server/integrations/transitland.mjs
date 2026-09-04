const DEFAULT_BASE_URL = 'https://transit.land/api/v2/rest';
const DEFAULT_TIMEOUT_MS = 8000;

export function transitlandConfig(environment = process.env) {
  const apiKey = String(environment.TRANSITLAND_API_KEY || '').trim();
  const baseUrl = String(environment.TRANSITLAND_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/$/, '');
  const timeoutMs = Number(environment.TRANSITLAND_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  return {
    configured: Boolean(apiKey),
    apiKey,
    baseUrl,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  };
}

function finiteCoordinate(value, min, max, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new TypeError(`Invalid ${label}`);
  }
  return numeric;
}

function positiveRadius(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 10000) {
    throw new TypeError('Invalid radius');
  }
  return Math.round(numeric);
}

function buildUrl(baseUrl, path, params = {}) {
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

export async function transitlandRequest(path, {
  params = {},
  environment = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = transitlandConfig(environment);
  if (!config.configured) {
    const error = new Error('Transitland is not configured');
    error.code = 'TRANSITLAND_NOT_CONFIGURED';
    throw error;
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetch implementation is required');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const url = buildUrl(config.baseUrl, path, params);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        apikey: config.apiKey,
      },
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(`Transitland request failed (${response.status})`);
      error.code = 'TRANSITLAND_UPSTREAM_ERROR';
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return {
      provider: 'transitland',
      fetchedAt: new Date().toISOString(),
      data: payload,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Transitland request timed out');
      timeoutError.code = 'TRANSITLAND_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function transitlandNearbyStops({ latitude, longitude, radius = 1500 }, options = {}) {
  const lat = finiteCoordinate(latitude, -90, 90, 'latitude');
  const lon = finiteCoordinate(longitude, -180, 180, 'longitude');
  return transitlandRequest('/stops', {
    ...options,
    params: { lat, lon, radius: positiveRadius(radius) },
  });
}

export function transitlandNearbyRoutes({ latitude, longitude, radius = 5000, routeTypes }, options = {}) {
  const lat = finiteCoordinate(latitude, -90, 90, 'latitude');
  const lon = finiteCoordinate(longitude, -180, 180, 'longitude');
  return transitlandRequest('/routes', {
    ...options,
    params: {
      lat,
      lon,
      radius: positiveRadius(radius),
      route_types: Array.isArray(routeTypes) ? routeTypes.join(',') : routeTypes,
    },
  });
}

export function transitlandStopDepartures({ stopKey, nextSeconds = 3600, limit = 20 }, options = {}) {
  const key = String(stopKey || '').trim();
  if (!key) throw new TypeError('stopKey is required');
  const next = Number(nextSeconds);
  const max = Number(limit);
  if (!Number.isFinite(next) || next <= 0) throw new TypeError('Invalid nextSeconds');
  if (!Number.isFinite(max) || max <= 0 || max > 100) throw new TypeError('Invalid limit');

  return transitlandRequest(`/stops/${encodeURIComponent(key)}/departures`, {
    ...options,
    params: { next: Math.round(next), limit: Math.round(max) },
  });
}
