const DEFAULT_GRAPHQL_PATH = '/otp/gtfs/v1';
const DEFAULT_TIMEOUT_MS = 8000;
const DIRECT_MODES = new Set(['WALK', 'BICYCLE', 'CAR']);
const TRANSIT_MODES = new Set(['BUS', 'RAIL', 'TRAM', 'SUBWAY', 'FERRY']);

export function opentripplannerConfig(environment = process.env) {
  const configuredUrl = String(environment.OTP_GRAPHQL_URL || '').trim();
  const baseUrl = String(environment.OTP_BASE_URL || '').trim().replace(/\/$/, '');
  const graphqlUrl = configuredUrl || (baseUrl ? `${baseUrl}${DEFAULT_GRAPHQL_PATH}` : '');
  const timeoutMs = Number(environment.OTP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const authToken = String(environment.OTP_AUTH_TOKEN || '').trim();

  if (graphqlUrl) {
    const parsed = new URL(graphqlUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError('Invalid OTP URL protocol');
    if (parsed.username || parsed.password) throw new TypeError('OTP URL must not contain credentials');
  }

  return {
    configured: Boolean(graphqlUrl),
    graphqlUrl,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
    authToken,
  };
}

function coordinate(value, min, max, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) throw new TypeError(`Invalid ${label}`);
  return numeric;
}

function point(input, label) {
  if (!input || typeof input !== 'object') throw new TypeError(`${label} is required`);
  return {
    latitude: coordinate(input.latitude, -90, 90, `${label} latitude`),
    longitude: coordinate(input.longitude, -180, 180, `${label} longitude`),
  };
}

function isoOffsetDateTime(value, label) {
  const text = String(value || '').trim();
  if (!text || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    throw new TypeError(`${label} must be an ISO 8601 offset datetime`);
  }
  if (!Number.isFinite(Date.parse(text))) throw new TypeError(`Invalid ${label}`);
  return text;
}

function modeList(values, allowed, fallback, label) {
  const source = values == null ? fallback : values;
  if (!Array.isArray(source) || source.length === 0) throw new TypeError(`${label} must not be empty`);
  const normalized = [...new Set(source.map((value) => String(value || '').trim().toUpperCase()))];
  if (normalized.some((value) => !allowed.has(value))) throw new TypeError(`Invalid ${label}`);
  return normalized;
}

function positiveInteger(value, fallback, max, label) {
  const numeric = value == null ? fallback : Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0 || numeric > max) throw new TypeError(`Invalid ${label}`);
  return numeric;
}

function secondsBetween(start, end) {
  const a = Date.parse(start || '');
  const b = Date.parse(end || '');
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 1000);
}

function normalizeLeg(leg = {}) {
  return {
    mode: leg.mode || null,
    from: leg.from || null,
    to: leg.to || null,
    route: leg.route || null,
    geometry: leg.legGeometry?.points || null,
  };
}

function normalizeItinerary(node = {}) {
  return {
    start: node.start || null,
    end: node.end || null,
    durationSeconds: secondsBetween(node.start, node.end),
    legs: Array.isArray(node.legs) ? node.legs.map(normalizeLeg) : [],
  };
}

export async function opentripplannerRequest(query, {
  environment = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const config = opentripplannerConfig(environment);
  if (!config.configured) {
    const error = new Error('OpenTripPlanner is not configured');
    error.code = 'OTP_NOT_CONFIGURED';
    throw error;
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
  };
  if (config.authToken) headers.authorization = `Bearer ${config.authToken}`;

  try {
    const response = await fetchImpl(config.graphqlUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(`OpenTripPlanner request failed (${response.status})`);
      error.code = 'OTP_UPSTREAM_ERROR';
      error.status = response.status;
      throw error;
    }
    if (Array.isArray(payload?.errors) && payload.errors.length) {
      const error = new Error('OpenTripPlanner GraphQL error');
      error.code = 'OTP_GRAPHQL_ERROR';
      error.errors = payload.errors;
      throw error;
    }
    return {
      provider: 'opentripplanner',
      fetchedAt: new Date().toISOString(),
      data: payload?.data || null,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('OpenTripPlanner request timed out');
      timeoutError.code = 'OTP_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function opentripplannerPlanTrip({
  origin,
  destination,
  earliestDeparture,
  latestArrival,
  directModes,
  transitModes,
  first = 5,
}, options = {}) {
  const from = point(origin, 'origin');
  const to = point(destination, 'destination');
  if (Boolean(earliestDeparture) === Boolean(latestArrival)) {
    throw new TypeError('Provide exactly one of earliestDeparture or latestArrival');
  }
  const dateTime = earliestDeparture
    ? `earliestDeparture: ${JSON.stringify(isoOffsetDateTime(earliestDeparture, 'earliestDeparture'))}`
    : `latestArrival: ${JSON.stringify(isoOffsetDateTime(latestArrival, 'latestArrival'))}`;
  const direct = modeList(directModes, DIRECT_MODES, ['WALK'], 'directModes');
  const transit = modeList(transitModes, TRANSIT_MODES, ['BUS', 'RAIL'], 'transitModes');
  const maxResults = positiveInteger(first, 5, 10, 'first');

  const transitLiteral = transit.map((mode) => `{ mode: ${mode} }`).join(', ');
  const query = `query CrewCheckMobilityPlan {
  planConnection(
    origin: { location: { coordinate: { latitude: ${from.latitude}, longitude: ${from.longitude} } } }
    destination: { location: { coordinate: { latitude: ${to.latitude}, longitude: ${to.longitude} } } }
    dateTime: { ${dateTime} }
    first: ${maxResults}
    modes: {
      direct: [${direct.join(', ')}]
      transit: { transit: [${transitLiteral}] }
    }
  ) {
    edges {
      node {
        start
        end
        legs {
          mode
          from {
            name
            lat
            lon
            departure {
              scheduledTime
              estimated { time delay }
            }
          }
          to {
            name
            lat
            lon
            arrival {
              scheduledTime
              estimated { time delay }
            }
          }
          route { gtfsId longName shortName }
          legGeometry { points }
        }
      }
    }
  }
}`;

  const response = await opentripplannerRequest(query, options);
  const edges = response.data?.planConnection?.edges;
  return {
    provider: response.provider,
    fetchedAt: response.fetchedAt,
    queryMode: earliestDeparture ? 'depart-after' : 'arrive-by',
    itineraries: Array.isArray(edges) ? edges.map((edge) => normalizeItinerary(edge?.node || {})) : [],
  };
}
