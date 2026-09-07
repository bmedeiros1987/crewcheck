const DEFAULT_BASE_URL = 'https://api.olhovivo.sptrans.com.br/v2.1';
const DEFAULT_TIMEOUT_MS = 8000;

export function sptransConfig(environment = process.env) {
  const token = String(environment.SPTRANS_OLHO_VIVO_TOKEN || '').trim();
  const baseUrl = String(environment.SPTRANS_OLHO_VIVO_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/$/, '');
  const timeoutMs = Number(environment.SPTRANS_OLHO_VIVO_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return {
    configured: Boolean(token),
    token,
    baseUrl,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  };
}

function ensureFetch(fetchImpl) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
}

async function withTimeout(timeoutMs, task) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await task(controller.signal); }
  catch (error) {
    if (error?.name === 'AbortError') {
      const e = new Error('SPTrans request timed out');
      e.code = 'SPTRANS_TIMEOUT';
      throw e;
    }
    throw error;
  } finally { clearTimeout(timer); }
}

export async function sptransSession({ environment = process.env, fetchImpl = globalThis.fetch } = {}) {
  ensureFetch(fetchImpl);
  const config = sptransConfig(environment);
  if (!config.configured) {
    const error = new Error('SPTrans Olho Vivo is not configured');
    error.code = 'SPTRANS_NOT_CONFIGURED';
    throw error;
  }
  return withTimeout(config.timeoutMs, async (signal) => {
    const login = new URL(`${config.baseUrl}/Login/Autenticar`);
    login.searchParams.set('token', config.token);
    const response = await fetchImpl(login, { method: 'POST', signal, redirect: 'follow' });
    const ok = await response.json().catch(() => false);
    if (!response.ok || ok !== true) {
      const error = new Error(`SPTrans authentication failed (${response.status})`);
      error.code = 'SPTRANS_AUTH_ERROR';
      throw error;
    }
    const setCookie = response.headers?.get?.('set-cookie') || '';
    return { config, cookie: setCookie.split(';')[0] || '' };
  });
}

export async function sptransRequest(path, { params = {}, environment = process.env, fetchImpl = globalThis.fetch } = {}) {
  const { config, cookie } = await sptransSession({ environment, fetchImpl });
  return withTimeout(config.timeoutMs, async (signal) => {
    const url = new URL(`${config.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    const response = await fetchImpl(url, { method: 'GET', signal, headers: cookie ? { cookie } : {} });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(`SPTrans request failed (${response.status})`);
      error.code = 'SPTRANS_UPSTREAM_ERROR';
      error.status = response.status;
      throw error;
    }
    return { provider: 'sptrans-olho-vivo', fetchedAt: new Date().toISOString(), data: payload };
  });
}

export const sptransFindLines = (terms, options = {}) => sptransRequest('/Linha/Buscar', { ...options, params: { termosBusca: String(terms || '').trim() } });
export const sptransFindStops = (terms, options = {}) => sptransRequest('/Parada/Buscar', { ...options, params: { termosBusca: String(terms || '').trim() } });
export const sptransVehiclePositions = (lineCode, options = {}) => sptransRequest('/Posicao', { ...options, params: { codigoLinha: Number(lineCode) } });
export const sptransArrivalForecast = ({ stopCode, lineCode }, options = {}) => sptransRequest('/Previsao', { ...options, params: { codigoParada: Number(stopCode), codigoLinha: Number(lineCode) } });
