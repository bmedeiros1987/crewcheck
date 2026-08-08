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
