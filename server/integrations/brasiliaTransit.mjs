const DEFAULT_TIMEOUT_MS = 8000;

export const BRASILIA_TRANSIT_SOURCES = Object.freeze({
  semobDfGtfs: Object.freeze({
    id: 'semob-df-gtfs',
    authority: 'SEMOB/DF',
    kind: 'gtfs-static',
    official: true,
    status: 'awaiting-published-feed-url',
    notes: 'Lei Distrital 7.836/2025 requires STPC/DF data to be made available in GTFS with enough information for computational tools.',
  }),
  dfNoPonto: Object.freeze({
    id: 'df-no-ponto',
    authority: 'GDF / SEMOB / TCB',
    kind: 'realtime-and-trip-planning',
    official: true,
    status: 'official-app-public-ui-no-undocumented-api-use',
    notes: 'Public service exposes routes, lines, stops, realtime schedules and service alerts. CrewCheck must not depend on undocumented private app endpoints.',
  }),
  metroDf: Object.freeze({
    id: 'metro-df',
    authority: 'METRÔ-DF',
    kind: 'rail-realtime-status',
    official: true,
    status: 'official-app-public-ui-no-undocumented-api-use',
    notes: 'Official app exposes train arrival estimates and operational status. External API must be documented/authorized before direct consumption.',
  }),
});

function normalizeHttpUrl(value, name) {
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name}_INVALID_URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${name}_INVALID_URL`);
  if (parsed.username || parsed.password) throw new Error(`${name}_EMBEDDED_CREDENTIALS_FORBIDDEN`);
  return parsed.toString();
}

function timeoutMs(env) {
  const raw = env.BRASILIA_TRANSIT_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 500 || parsed > 30000) throw new Error('BRASILIA_TRANSIT_TIMEOUT_MS_INVALID');
  return Math.round(parsed);
}

export function getBrasiliaTransitConfig(env = process.env) {
  return {
    semobDfGtfsUrl: normalizeHttpUrl(env.SEMOB_DF_GTFS_URL, 'SEMOB_DF_GTFS_URL'),
    metroDfStatusUrl: normalizeHttpUrl(env.METRO_DF_STATUS_URL, 'METRO_DF_STATUS_URL'),
    timeoutMs: timeoutMs(env),
  };
}

export function getBrasiliaTransitCapabilities(env = process.env) {
  const config = getBrasiliaTransitConfig(env);
  return {
    region: 'BRASILIA_DF',
    provider: 'brasilia-transit-pack',
    staticTransit: config.semobDfGtfsUrl
      ? { ready: true, source: BRASILIA_TRANSIT_SOURCES.semobDfGtfs.id, url: config.semobDfGtfsUrl }
      : { ready: false, source: BRASILIA_TRANSIT_SOURCES.semobDfGtfs.id, reason: 'PUBLISHED_GTFS_URL_NOT_CONFIGURED' },
    railRealtime: config.metroDfStatusUrl
      ? { ready: true, source: BRASILIA_TRANSIT_SOURCES.metroDf.id, url: config.metroDfStatusUrl }
      : { ready: false, source: BRASILIA_TRANSIT_SOURCES.metroDf.id, reason: 'DOCUMENTED_METRO_DF_STATUS_URL_NOT_CONFIGURED' },
    busRealtime: {
      ready: false,
      source: BRASILIA_TRANSIT_SOURCES.dfNoPonto.id,
      reason: 'DOCUMENTED_REALTIME_API_NOT_YET_VERIFIED',
    },
  };
}

export async function fetchOfficialJson(url, { fetchImpl = fetch, timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`BRASILIA_TRANSIT_UPSTREAM_${response.status}`);
      error.code = 'BRASILIA_TRANSIT_UPSTREAM_ERROR';
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('BRASILIA_TRANSIT_TIMEOUT');
      timeoutError.code = 'BRASILIA_TRANSIT_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function brasliaMobilitySourcePolicy() {
  return {
    useOnlyDocumentedOrAuthorizedInterfaces: true,
    neverScrapePrivateAppEndpoints: true,
    provenanceRequired: true,
    freshnessRequiredForRealtime: true,
    otpRole: 'routing-engine',
    crewcheckRole: 'decision-and-recommendation',
    canonicalRosterMayBeReadButNeverMutated: true,
  };
}
