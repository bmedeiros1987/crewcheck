import crypto from 'node:crypto';
import { requireIdentity, sendJson } from '../v139/common.mjs';

const FX_BASE = 'https://economia.awesomeapi.com.br';
const CEP_BASE = 'https://cep.awesomeapi.com.br';
const TIMEOUT_MS = 7000;
const FX_TTL_MS = 60_000;
const CEP_TTL_MS = 24 * 60 * 60 * 1000;
const FX_STALE_MS = 6 * 60 * 60 * 1000;
const CEP_STALE_MS = 30 * 24 * 60 * 60 * 1000;
const fxCache = new Map();
const cepCache = new Map();

export function awesomeApiSharedCapabilities() {
  return {
    provider: 'AWESOMEAPI',
    version: '1.0',
    capabilities: ['CURRENCY', 'BRAZIL_CEP'],
    sharedWithVoyage: true,
    auth: 'SERVICE_TOKEN_OR_CREWCHECK_ADMIN',
    secretsExposed: false,
    cache: { fxFreshSeconds: 60, cepFreshHours: 24, staleIfError: true },
    policy: [
      'API key remains server-side and is sent using x-api-key only.',
      'Query-string API tokens are intentionally not used.',
      'Stale cache is returned only after live provider failure and is explicitly marked stale.',
      'CEP is a locality/address helper and not proof of exact entrance or indoor position.'
    ]
  };
}

export async function handleAwesomeApiSharedRoute(req, res, url) {
  const isFx = url.pathname === '/api/shared/v1/fx/latest';
  const cepMatch = url.pathname.match(/^\/api\/shared\/v1\/cep\/(\d{8})$/);
  const isHealth = url.pathname === '/api/admin/awesomeapi-health';
  if (!isFx && !cepMatch && !isHealth) return false;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' });
    return true;
  }

  if (isHealth) {
    const identity = await requireIdentity(req, res);
    if (!identity) return true;
    if (!identity.admin) {
      sendJson(res, 403, { ok: false, message: 'Acesso restrito ao administrador.' });
      return true;
    }
    const configured = Boolean(apiKey());
    sendJson(res, 200, {
      ok: true,
      provider: 'AWESOMEAPI',
      configured,
      sharedServiceTokenConfigured: Boolean(sharedToken()),
      capabilities: awesomeApiSharedCapabilities(),
      secretsExposed: false
    });
    return true;
  }

  if (!(await authorizeSharedRequest(req, res))) return true;

  if (isFx) {
    const pairs = normalizePairs(url.searchParams.get('pairs') || url.searchParams.get('pair') || 'USD-BRL,EUR-BRL');
    if (!pairs.length) {
      sendJson(res, 400, { ok: false, code: 'INVALID_FX_PAIRS' });
      return true;
    }
    const result = await fetchFxLatest(pairs);
    sendJson(res, result.ok ? 200 : 503, result);
    return true;
  }

  const result = await lookupCep(cepMatch[1]);
  sendJson(res, result.ok ? 200 : result.code === 'CEP_NOT_FOUND' ? 404 : 503, result);
  return true;
}

export async function fetchFxLatest(pairsInput, options = {}) {
  const pairs = normalizePairs(pairsInput);
  if (!pairs.length) return { ok: false, code: 'INVALID_FX_PAIRS', quotes: [] };
  const now = Date.now();
  const cacheKey = pairs.join(',');
  const cached = fxCache.get(cacheKey);
  if (!options.forceRefresh && cached && now - cached.at <= FX_TTL_MS) {
    return structuredCloneSafe({ ...cached.value, cache: { hit: true, stale: false, ageSeconds: Math.floor((now - cached.at) / 1000) } });
  }

  try {
    const payload = await providerJson(`${FX_BASE}/json/last/${pairs.join(',')}`);
    const quotes = normalizeFxPayload(payload, pairs, now);
    if (!quotes.length) throw providerError('FX_EMPTY_RESPONSE');
    const value = {
      ok: true,
      provider: 'AWESOMEAPI',
      status: 'LIVE',
      authenticated: Boolean(apiKey()),
      quotes,
      fetchedAt: new Date(now).toISOString(),
      cache: { hit: false, stale: false, ageSeconds: 0 }
    };
    fxCache.set(cacheKey, { at: now, value });
    return structuredCloneSafe(value);
  } catch (error) {
    if (cached && now - cached.at <= FX_STALE_MS) {
      return structuredCloneSafe({
        ...cached.value,
        status: 'STALE_IF_ERROR',
        warning: safeCode(error),
        cache: { hit: true, stale: true, ageSeconds: Math.floor((now - cached.at) / 1000) }
      });
    }
    return { ok: false, provider: 'AWESOMEAPI', code: safeCode(error), quotes: [], fetchedAt: new Date(now).toISOString() };
  }
}

export async function lookupCep(cepInput, options = {}) {
  const cep = normalizeCep(cepInput);
  if (!cep) return { ok: false, code: 'INVALID_CEP', address: null };
  const now = Date.now();
  const cached = cepCache.get(cep);
  if (!options.forceRefresh && cached && now - cached.at <= CEP_TTL_MS) {
    return structuredCloneSafe({ ...cached.value, cache: { hit: true, stale: false, ageSeconds: Math.floor((now - cached.at) / 1000) } });
  }

  try {
    const payload = await providerJson(`${CEP_BASE}/json/${cep}`);
    const address = normalizeCepPayload(payload, cep);
    if (!address) throw providerError('CEP_INVALID_RESPONSE');
    const value = {
      ok: true,
      provider: 'AWESOMEAPI',
      status: 'LIVE',
      authenticated: Boolean(apiKey()),
      address,
      fetchedAt: new Date(now).toISOString(),
      cache: { hit: false, stale: false, ageSeconds: 0 },
      disclaimer: 'CEP resolves address/locality context but does not prove the exact entrance or indoor destination.'
    };
    cepCache.set(cep, { at: now, value });
    return structuredCloneSafe(value);
  } catch (error) {
    if (cached && now - cached.at <= CEP_STALE_MS) {
      return structuredCloneSafe({
        ...cached.value,
        status: 'STALE_IF_ERROR',
        warning: safeCode(error),
        cache: { hit: true, stale: true, ageSeconds: Math.floor((now - cached.at) / 1000) }
      });
    }
    const code = safeCode(error);
    return { ok: false, provider: 'AWESOMEAPI', code: code === 'HTTP_404' ? 'CEP_NOT_FOUND' : code, address: null, fetchedAt: new Date(now).toISOString() };
  }
}

async function authorizeSharedRequest(req, res) {
  const expected = sharedToken();
  const supplied = String(req.headers['x-crewcheck-service-token'] || '').trim();
  if (expected && supplied && timingSafeEqual(expected, supplied)) return true;

  const identity = await requireIdentity(req, res);
  if (!identity) return false;
  if (!identity.admin) {
    sendJson(res, 403, { ok: false, code: 'SHARED_SERVICE_FORBIDDEN' });
    return false;
  }
  return true;
}

async function providerJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers = { accept: 'application/json' };
    const key = apiKey();
    if (key) headers['x-api-key'] = key;
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) {
      const error = providerError(`HTTP_${response.status}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw providerError('TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeFxPayload(payload, pairs, fetchedAtMs) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const requested = new Set(pairs);
  const output = [];
  for (const item of Object.values(payload)) {
    const from = currency(item?.code);
    const to = currency(item?.codein);
    const pair = from && to ? `${from}-${to}` : null;
    if (!pair || !requested.has(pair)) continue;
    const bid = positive(item.bid);
    const ask = positive(item.ask);
    if (bid === null && ask === null) continue;
    output.push({
      pair,
      from,
      to,
      name: text(item.name, 180),
      bid,
      ask,
      mid: bid !== null && ask !== null ? round((bid + ask) / 2) : bid ?? ask,
      high: positive(item.high),
      low: positive(item.low),
      percentChange: finite(item.pctChange),
      observedAt: epoch(item.timestamp) || providerDate(item.create_date) || new Date(fetchedAtMs).toISOString(),
      provenance: { provider: 'AWESOMEAPI', endpoint: '/json/last/:pairs' }
    });
  }
  return output.sort((a, b) => a.pair.localeCompare(b.pair));
}

function normalizeCepPayload(payload, requestedCep) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const cep = normalizeCep(payload.cep || requestedCep);
  if (!cep) return null;
  return {
    cep,
    formattedCep: `${cep.slice(0, 5)}-${cep.slice(5)}`,
    addressType: text(payload.address_type, 80),
    addressName: text(payload.address_name, 180),
    address: text(payload.address, 260),
    district: text(payload.district, 180),
    city: text(payload.city, 180),
    state: /^[A-Z]{2}$/.test(String(payload.state || '').toUpperCase()) ? String(payload.state).toUpperCase() : null,
    cityIbge: digits(payload.city_ibge, 16),
    ddd: digits(payload.ddd, 3),
    latitude: coord(payload.lat, -90, 90),
    longitude: coord(payload.lng, -180, 180),
    precision: payload.lat != null && payload.lng != null ? 'PROVIDER_COORDINATE' : 'POSTAL_AREA_ONLY'
  };
}

function normalizePairs(input) {
  const values = Array.isArray(input) ? input : String(input || '').split(',');
  const output = [];
  for (const value of values) {
    const pair = String(value || '').trim().toUpperCase().replace(/[_/]/g, '-');
    if (!/^[A-Z0-9]{2,10}-[A-Z0-9]{2,10}$/.test(pair)) continue;
    if (!output.includes(pair)) output.push(pair);
    if (output.length >= 20) break;
  }
  return output;
}

function normalizeCep(value) {
  const valueDigits = String(value || '').replace(/\D/g, '');
  return /^\d{8}$/.test(valueDigits) ? valueDigits : null;
}

function apiKey() {
  return configured(process.env.AWESOMEAPI_API_KEY || process.env.AWESOME_API_KEY);
}

function sharedToken() {
  return configured(process.env.CREWCHECK_SHARED_SERVICES_TOKEN);
}

function configured(value) {
  const clean = String(value || '').trim();
  return clean && !['value', 'changeme', 'placeholder', 'your_value_here'].includes(clean.toLowerCase()) ? clean : null;
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function providerError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function safeCode(error) {
  return String(error?.code || error?.name || 'PROVIDER_ERROR').toUpperCase().replace(/[^A-Z0-9_]+/g, '_').slice(0, 100);
}

function currency(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9]{2,10}$/.test(code) ? code : null;
}

function text(value, max) {
  if (value === null || value === undefined) return null;
  const clean = String(value).trim();
  return clean ? clean.slice(0, max) : null;
}

function digits(value, max) {
  const clean = String(value || '').replace(/\D/g, '');
  return clean ? clean.slice(0, max) : null;
}

function positive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coord(value, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function round(value) {
  return Number(Number(value).toFixed(8));
}

function epoch(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const date = new Date(parsed > 10_000_000_000 ? parsed : parsed * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function providerDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).trim().replace(' ', 'T')}-03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
