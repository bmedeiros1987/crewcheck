const DEFAULT_BASE_URL = 'https://aisweb.decea.mil.br/api/';
const DEFAULT_TIMEOUT_MS = 8_000;

function env(name, fallback = '') {
  return String(process.env[name] ?? fallback).trim();
}

export function aiswebConfiguration() {
  const apiKey = env('AISWEB_API_KEY');
  const apiPass = env('AISWEB_API_PASS');
  const baseUrl = env('AISWEB_API_BASE_URL', DEFAULT_BASE_URL).replace(/\/+$/, '/') || DEFAULT_BASE_URL;
  return {
    configured: Boolean(apiKey && apiPass),
    apiKey,
    apiPass,
    baseUrl,
  };
}

function safeIcao(value, fallback = 'SBBR') {
  const normalized = String(value || '').trim().toUpperCase();
  return /^[A-Z]{4}$/.test(normalized) ? normalized : fallback;
}

function classifyHttp(status) {
  if (status >= 200 && status < 300) return 'available';
  if (status === 401 || status === 403) return 'authentication_failed';
  if (status === 404) return 'endpoint_unavailable';
  if (status === 408 || status === 429) return 'temporarily_unavailable';
  if (status >= 500) return 'upstream_error';
  return 'error';
}

function summarizeBody(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return { responsePresent: false, contentTypeHint: 'empty' };
  const lower = raw.slice(0, 300).toLowerCase();
  return {
    responsePresent: true,
    contentTypeHint: raw.startsWith('<') ? 'xml' : (raw.startsWith('{') || raw.startsWith('[') ? 'json' : 'text'),
    likelyAuthError: /unauthor|forbidden|invalid credential|api.?key|api.?pass/.test(lower),
  };
}

export async function diagnoseAiswebNotam({
  icao = 'SBBR',
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const config = aiswebConfiguration();
  if (!config.configured) {
    return {
      ok: false,
      provider: 'aisweb-decea',
      state: 'not_configured',
      configured: false,
    };
  }

  const aerodrome = safeIcao(icao);
  let url;
  try {
    url = new URL(config.baseUrl);
  } catch {
    return {
      ok: false,
      provider: 'aisweb-decea',
      state: 'configuration_error',
      configured: true,
      query: { area: 'notam', icao: aerodrome },
    };
  }
  url.searchParams.set('apiKey', config.apiKey);
  url.searchParams.set('apiPass', config.apiPass);
  url.searchParams.set('area', 'notam');
  url.searchParams.set('icaoCode', aerodrome);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/xml,text/xml,application/json;q=0.9,*/*;q=0.5' },
      redirect: 'error',
      signal: controller.signal,
    });
    let body = '';
    try {
      body = await response.text();
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
    }
    const bodySummary = summarizeBody(body);
    const state = classifyHttp(response.status);
    return {
      ok: response.status >= 200 && response.status < 300 && bodySummary.responsePresent && !bodySummary.likelyAuthError,
      provider: 'aisweb-decea',
      state: bodySummary.likelyAuthError ? 'authentication_failed' : state,
      configured: true,
      httpStatus: response.status,
      query: { area: 'notam', icao: aerodrome },
      ...bodySummary,
    };
  } catch (error) {
    return {
      ok: false,
      provider: 'aisweb-decea',
      state: error?.name === 'AbortError' ? 'timeout' : 'unavailable',
      configured: true,
      query: { area: 'notam', icao: aerodrome },
    };
  } finally {
    clearTimeout(timer);
  }
}
