import {
  transitlandConfig,
  transitlandNearbyRoutes,
  transitlandNearbyStops,
} from '../integrations/transitland.mjs';

const DEFAULT_BSB_POINT = Object.freeze({ latitude: -15.8697, longitude: -47.9172 });

function countCollection(payload, keys = []) {
  for (const key of keys) {
    const value = payload?.[key];
    if (Array.isArray(value)) return value.length;
  }
  if (Array.isArray(payload)) return payload.length;
  return 0;
}

function finiteCoordinate(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) return fallback;
  return numeric;
}

function safeRadius(value, fallback = 3000) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 10000) return fallback;
  return Math.round(numeric);
}

export async function transitlandHealthSnapshot({
  environment = process.env,
  fetchImpl = globalThis.fetch,
  latitude = DEFAULT_BSB_POINT.latitude,
  longitude = DEFAULT_BSB_POINT.longitude,
  radius = 3000,
} = {}) {
  const config = transitlandConfig(environment);
  const checkedAt = new Date().toISOString();
  if (!config.configured) {
    return {
      ok: false,
      configured: false,
      reachable: false,
      coverage: false,
      provider: 'transitland',
      region: 'BSB',
      checkedAt,
      message: 'Transitland aguardando TRANSITLAND_API_KEY no backend.',
    };
  }

  const point = {
    latitude: finiteCoordinate(latitude, DEFAULT_BSB_POINT.latitude, -90, 90),
    longitude: finiteCoordinate(longitude, DEFAULT_BSB_POINT.longitude, -180, 180),
  };
  const searchRadius = safeRadius(radius);
  const startedAt = Date.now();

  try {
    const [stopsResult, routesResult] = await Promise.all([
      transitlandNearbyStops(
        { ...point, radius: searchRadius },
        { environment, fetchImpl },
      ),
      transitlandNearbyRoutes(
        { ...point, radius: Math.min(10000, Math.max(searchRadius, 5000)) },
        { environment, fetchImpl },
      ),
    ]);

    const stops = countCollection(stopsResult?.data, ['stops', 'features', 'data']);
    const routes = countCollection(routesResult?.data, ['routes', 'features', 'data']);
    const coverage = stops > 0 || routes > 0;
    return {
      ok: true,
      configured: true,
      reachable: true,
      coverage,
      provider: 'transitland',
      region: 'BSB',
      probe: { latitude: point.latitude, longitude: point.longitude, radiusMeters: searchRadius },
      counts: { stops, routes },
      latencyMs: Date.now() - startedAt,
      checkedAt,
      message: coverage
        ? 'Transitland respondeu e encontrou cobertura próxima de BSB.'
        : 'Transitland respondeu, mas não encontrou cobertura neste raio de BSB.',
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      reachable: false,
      coverage: false,
      provider: 'transitland',
      region: 'BSB',
      probe: { latitude: point.latitude, longitude: point.longitude, radiusMeters: searchRadius },
      latencyMs: Date.now() - startedAt,
      checkedAt,
      code: String(error?.code || 'TRANSITLAND_HEALTH_ERROR').slice(0, 80),
      message: 'Transitland está configurado, mas a chamada de validação não respondeu corretamente agora.',
    };
  }
}

export async function handleTransitlandHealthRoute(req, res, url) {
  if (url?.pathname !== '/api/mobility/transitland/health') return false;
  if (req?.method && req.method !== 'GET') {
    res.writeHead(405, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: false, message: 'Método não permitido.' }));
    return true;
  }

  const snapshot = await transitlandHealthSnapshot({
    latitude: url?.searchParams?.get('lat'),
    longitude: url?.searchParams?.get('lon'),
    radius: url?.searchParams?.get('radius'),
  });
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(snapshot));
  return true;
}
