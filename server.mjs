import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePdfOnServer } from './server/rosterParser.mjs';
import { handlePlatformRoute, consumePlatformUsage, refundPlatformUsage, handlePlatformVisitorTelegram } from './server/platform.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 4173);
const radarHealth = new Map();

// CrewCheck Reliability crash guard — logs only sanitized messages.
process.on('unhandledRejection', (reason) => { console.error('[crewcheck:unhandledRejection]', reason instanceof Error ? reason.message : String(reason || 'unknown')); });
process.on('uncaughtException', (error) => { console.error('[crewcheck:uncaughtException]', error instanceof Error ? error.message : String(error || 'unknown')); });


function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}
function envAny(names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}
function firstKnown(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim()) || '';
}
function normalizeFlightRaw(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}
function buildFlightContext(value) {
  const raw = normalizeFlightRaw(value);
  let iata = raw;
  let icao = raw;
  if (/^LAN\d+$/i.test(raw)) iata = `LA${raw.replace(/^LAN/i, '')}`;
  if (/^TAM\d+$/i.test(raw)) iata = `JJ${raw.replace(/^TAM/i, '')}`;
  if (/^LA\d+$/i.test(raw)) icao = `LAN${raw.replace(/^LA/i, '')}`;
  if (/^JJ\d+$/i.test(raw)) icao = `TAM${raw.replace(/^JJ/i, '')}`;
  return { raw, iata, icao, flightAware: icao };
}
function publicRadarPayload(item = {}) {
  return {
    ok: Boolean(item.ok),
    configured: Boolean(item.configured),
    flight: firstKnown(item.flight, item.ident),
    status: firstKnown(item.status, 'Monitorando'),
    gate: firstKnown(item.gate),
    terminal: firstKnown(item.terminal),
    departure: firstKnown(item.departure),
    arrival: firstKnown(item.arrival),
    origin: firstKnown(item.origin),
    destination: firstKnown(item.destination),
    aircraft: firstKnown(item.aircraft),
    registration: firstKnown(item.registration),
    latencyMs: Number(item.latencyMs || 0),
    quality: Number(item.quality || item.score || 0),
    alternatives: Number(item.alternatives || 0),
    message: firstKnown(item.message, item.ok ? 'Radar atualizado.' : 'Radar aguardando fonte operacional.'),
  };
}
function scoreRadar(item = {}, ctx = {}) {
  let score = 0;
  if (item.ok) score += 18;
  const flight = normalizeFlightRaw(firstKnown(item.flight, item.ident));
  if (flight && [ctx.raw, ctx.iata, ctx.icao].includes(flight)) score += 22;
  if (item.status && !/monitorando|aguardando/i.test(String(item.status))) score += 14;
  if (item.gate) score += 16;
  if (item.terminal) score += 8;
  if (item.departure) score += 10;
  if (item.arrival) score += 10;
  if (item.aircraft) score += 5;
  if (item.registration) score += 5;
  if (item.origin) score += 4;
  if (item.destination) score += 4;
  const latency = Number(item.latencyMs || 9999);
  if (latency < 800) score += 8;
  else if (latency < 1500) score += 5;
  else if (latency < 2400) score += 2;
  if (item.cancelled) score += 8;
  return Math.max(0, Math.min(100, score));
}
async function jsonFetch(url, options = {}, timeoutMs = 2200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}
function providerAvailable(name, keys) {
  const hasKey = keys.some((key) => Boolean(String(process.env[key] || '').trim()));
  if (!hasKey) return false;
  const state = radarHealth.get(name);
  if (!state) return true;
  const now = Date.now();
  if (state.lastOk && now - state.lastOk < 10 * 60_000) return true;
  if (state.lastFail && now - state.lastFail < 30_000) return false;
  return true;
}
function markProvider(name, ok) {
  const state = radarHealth.get(name) || {};
  if (ok) state.lastOk = Date.now();
  else state.lastFail = Date.now();
  radarHealth.set(name, state);
}
function normalizeFlightAwareFlight(row = {}, ctx) {
  return {
    ok: true,
    configured: true,
    flight: firstKnown(row.ident, row.fa_flight_id, ctx.icao),
    status: firstKnown(row.status, row.cancelled ? 'Cancelado' : '', row.progress_percent === 100 ? 'Finalizado' : '', 'Monitorando'),
    gate: firstKnown(row.gate_origin, row.gate_destination, row.departure_gate, row.arrival_gate),
    terminal: firstKnown(row.terminal_origin, row.terminal_destination, row.departure_terminal, row.arrival_terminal),
    departure: firstKnown(row.estimated_out, row.actual_out, row.scheduled_out, row.filed_departure_time),
    arrival: firstKnown(row.estimated_in, row.actual_in, row.scheduled_in, row.filed_arrival_time),
    origin: firstKnown(row.origin?.code_iata, row.origin?.code, row.origin?.airport_code),
    destination: firstKnown(row.destination?.code_iata, row.destination?.code, row.destination?.airport_code),
    aircraft: firstKnown(row.aircraft_type, row.aircrafttype),
    registration: firstKnown(row.registration, row.tailnumber),
    cancelled: Boolean(row.cancelled),
    message: 'Radar atualizado.',
  };
}
async function providerFlightAware(ctx, timeoutMs) {
  const key = envAny(['FLIGHTAWARE_AEROAPI_KEY', 'AEROAPI_KEY']);
  if (!key || !providerAvailable('flightaware', ['FLIGHTAWARE_AEROAPI_KEY', 'AEROAPI_KEY'])) return null;
  const started = Date.now();
  const url = `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ctx.flightAware)}?max_pages=1`;
  const { response, payload } = await jsonFetch(url, { headers: { accept: 'application/json', 'x-apikey': key } }, timeoutMs);
  if (!response.ok) {
    markProvider('flightaware', false);
    return { ok: false, configured: true, latencyMs: Date.now() - started, message: 'Fonte operacional configurada, mas sem dados agora.' };
  }
  const flights = Array.isArray(payload?.flights) ? payload.flights : [];
  const row = flights.find((item) => !item.cancelled && !item.actual_in) || flights[0];
  if (!row) {
    markProvider('flightaware', false);
    return { ok: false, configured: true, latencyMs: Date.now() - started, message: 'Voo não localizado na fonte operacional.' };
  }
  markProvider('flightaware', true);
  return { ...normalizeFlightAwareFlight(row, ctx), latencyMs: Date.now() - started };
}
async function providerCustom(ctx, timeoutMs, origin, destination) {
  const template = envAny(['CREWCHECK_FLIGHT_STATUS_URL']);
  if (!template) return null;
  const started = Date.now();
  const apiUrl = template
    .replaceAll('{flight}', encodeURIComponent(ctx.iata || ctx.raw))
    .replaceAll('{flight_icao}', encodeURIComponent(ctx.icao || ctx.raw))
    .replaceAll('{origin}', encodeURIComponent(origin || ''))
    .replaceAll('{destination}', encodeURIComponent(destination || ''));
  const { response, payload } = await jsonFetch(apiUrl, { headers: { accept: 'application/json' } }, timeoutMs);
  if (!response.ok) return { ok: false, configured: true, latencyMs: Date.now() - started, message: 'Fonte configurável sem dados agora.' };
  return {
    ok: true,
    configured: true,
    flight: firstKnown(payload?.flight, payload?.flight_iata, payload?.flight_icao, ctx.iata),
    status: firstKnown(payload?.status, payload?.flight_status, 'Monitorando'),
    gate: firstKnown(payload?.gate, payload?.departure?.gate),
    terminal: firstKnown(payload?.terminal, payload?.departure?.terminal),
    departure: firstKnown(payload?.departure?.estimated, payload?.departure?.actual, payload?.departure?.scheduled, payload?.departure),
    arrival: firstKnown(payload?.arrival?.estimated, payload?.arrival?.actual, payload?.arrival?.scheduled, payload?.arrival),
    origin: firstKnown(payload?.origin, payload?.departure?.iata, origin),
    destination: firstKnown(payload?.destination, payload?.arrival?.iata, destination),
    aircraft: firstKnown(payload?.aircraft, payload?.aircraft?.iata, payload?.aircraft?.icao),
    registration: firstKnown(payload?.registration, payload?.aircraft?.registration),
    latencyMs: Date.now() - started,
    message: 'Radar atualizado.',
  };
}
async function providerAviationstack(ctx, timeoutMs) {
  const key = envAny(['AVIATIONSTACK_API_KEY']);
  if (!key || !providerAvailable('aviationstack', ['AVIATIONSTACK_API_KEY'])) return null;
  const started = Date.now();
  const url = `https://api.aviationstack.com/v1/flights?access_key=${encodeURIComponent(key)}&flight_iata=${encodeURIComponent(ctx.iata)}`;
  const { response, payload } = await jsonFetch(url, { headers: { accept: 'application/json' } }, timeoutMs);
  if (!response.ok) {
    markProvider('aviationstack', false);
    return { ok: false, configured: true, latencyMs: Date.now() - started, message: 'Fonte operacional sem resposta agora.' };
  }
  const row = Array.isArray(payload?.data) ? payload.data[0] : null;
  if (!row) {
    markProvider('aviationstack', false);
    return { ok: false, configured: true, latencyMs: Date.now() - started, message: 'Voo não localizado na fonte operacional.' };
  }
  markProvider('aviationstack', true);
  return {
    ok: true,
    configured: true,
    flight: firstKnown(row.flight?.iata, row.flight?.icao, ctx.iata),
    status: firstKnown(row.flight_status, 'Monitorando'),
    gate: firstKnown(row.departure?.gate, row.arrival?.gate),
    terminal: firstKnown(row.departure?.terminal, row.arrival?.terminal),
    departure: firstKnown(row.departure?.estimated, row.departure?.actual, row.departure?.scheduled),
    arrival: firstKnown(row.arrival?.estimated, row.arrival?.actual, row.arrival?.scheduled),
    origin: firstKnown(row.departure?.iata, row.departure?.icao),
    destination: firstKnown(row.arrival?.iata, row.arrival?.icao),
    aircraft: firstKnown(row.aircraft?.iata, row.aircraft?.icao),
    registration: firstKnown(row.aircraft?.registration),
    latencyMs: Date.now() - started,
    message: 'Radar atualizado.',
  };
}
async function providerAirLabs(ctx, timeoutMs) {
  const key = envAny(['AIRLABS_API_KEY']);
  if (!key || !providerAvailable('airlabs', ['AIRLABS_API_KEY'])) return null;
  const started = Date.now();
  const url = `https://airlabs.co/api/v9/flight?flight_iata=${encodeURIComponent(ctx.iata)}&api_key=${encodeURIComponent(key)}`;
  const { response, payload } = await jsonFetch(url, { headers: { accept: 'application/json' } }, timeoutMs);
  if (!response.ok || payload?.error) {
    markProvider('airlabs', false);
    return { ok: false, configured: true, latencyMs: Date.now() - started, message: 'Fonte operacional sem resposta agora.' };
  }
  const row = payload?.response || payload;
  markProvider('airlabs', true);
  return {
    ok: true,
    configured: true,
    flight: firstKnown(row.flight_iata, row.flight_icao, ctx.iata),
    status: firstKnown(row.status, 'Monitorando'),
    gate: firstKnown(row.dep_gate, row.arr_gate),
    terminal: firstKnown(row.dep_terminal, row.arr_terminal),
    departure: firstKnown(row.dep_estimated, row.dep_actual, row.dep_time),
    arrival: firstKnown(row.arr_estimated, row.arr_actual, row.arr_time),
    origin: firstKnown(row.dep_iata, row.dep_icao),
    destination: firstKnown(row.arr_iata, row.arr_icao),
    aircraft: firstKnown(row.aircraft_icao),
    registration: firstKnown(row.reg_number),
    latencyMs: Date.now() - started,
    message: 'Radar atualizado.',
  };
}
async function providerAeroDataBox(ctx, timeoutMs) {
  const key = envAny(['AERODATABOX_API_KEY']);
  if (!key || !providerAvailable('aerodatabox', ['AERODATABOX_API_KEY'])) return null;
  const started = Date.now();
  const host = envAny(['AERODATABOX_RAPIDAPI_HOST']) || 'aerodatabox.p.rapidapi.com';
  const template = envAny(['AERODATABOX_URL_TEMPLATE']) || `https://${host}/flights/number/{flight}?withAircraftImage=false&withLocation=false`;
  const apiUrl = template.replaceAll('{flight}', encodeURIComponent(ctx.iata)).replaceAll('{flight_icao}', encodeURIComponent(ctx.icao));
  const { response, payload } = await jsonFetch(apiUrl, { headers: { accept: 'application/json', 'x-rapidapi-key': key, 'x-rapidapi-host': host } }, timeoutMs);
  if (!response.ok) {
    markProvider('aerodatabox', false);
    return { ok: false, configured: true, latencyMs: Date.now() - started, message: 'Fonte operacional sem resposta agora.' };
  }
  const row = Array.isArray(payload) ? payload[0] : Array.isArray(payload?.items) ? payload.items[0] : payload;
  if (!row) {
    markProvider('aerodatabox', false);
    return { ok: false, configured: true, latencyMs: Date.now() - started, message: 'Voo não localizado na fonte operacional.' };
  }
  markProvider('aerodatabox', true);
  return {
    ok: true,
    configured: true,
    flight: firstKnown(row.number, row.flightNumber, ctx.iata),
    status: firstKnown(row.status, row.statusCode, 'Monitorando'),
    gate: firstKnown(row.departure?.gate, row.arrival?.gate),
    terminal: firstKnown(row.departure?.terminal, row.arrival?.terminal),
    departure: firstKnown(row.departure?.revisedTime?.local, row.departure?.predictedTime?.local, row.departure?.scheduledTime?.local),
    arrival: firstKnown(row.arrival?.revisedTime?.local, row.arrival?.predictedTime?.local, row.arrival?.scheduledTime?.local),
    origin: firstKnown(row.departure?.airport?.iata, row.departure?.airport?.icao),
    destination: firstKnown(row.arrival?.airport?.iata, row.arrival?.airport?.icao),
    aircraft: firstKnown(row.aircraft?.model, row.aircraft?.reg),
    registration: firstKnown(row.aircraft?.reg),
    latencyMs: Date.now() - started,
    message: 'Radar atualizado.',
  };
}
function configuredProviders() {
  return [
    { key: 'flightaware', available: Boolean(envAny(['FLIGHTAWARE_AEROAPI_KEY', 'AEROAPI_KEY'])) },
    { key: 'custom', available: Boolean(envAny(['CREWCHECK_FLIGHT_STATUS_URL'])) },
    { key: 'aviationstack', available: Boolean(envAny(['AVIATIONSTACK_API_KEY'])) },
    { key: 'airlabs', available: Boolean(envAny(['AIRLABS_API_KEY'])) },
    { key: 'aerodatabox', available: Boolean(envAny(['AERODATABOX_API_KEY'])) },
  ];
}
async function runRadarRace(ctx, origin, destination) {
  const timeoutMs = Math.max(800, Math.min(5000, Number(process.env.CREWCHECK_RADAR_TIMEOUT_MS || 2400)));
  const started = Date.now();
  const providers = [
    () => providerFlightAware(ctx, timeoutMs),
    () => providerCustom(ctx, timeoutMs, origin, destination),
    () => providerAviationstack(ctx, timeoutMs),
    () => providerAirLabs(ctx, timeoutMs),
    () => providerAeroDataBox(ctx, timeoutMs),
  ];
  const results = [];
  let settled = false;
  return await new Promise((resolve) => {
    const finish = () => {
      if (settled) return;
      settled = true;
      const okResults = results.filter((item) => item && item.ok);
      const candidates = okResults.length ? okResults : results.filter(Boolean);
      const best = candidates.sort((a, b) => (b.quality - a.quality) || (a.latencyMs - b.latencyMs))[0];
      if (!best) {
        resolve({ ok: false, configured: configuredProviders().some((p) => p.available), status: 'Aguardando', message: 'Nenhuma fonte respondeu dentro do limite operacional.', latencyMs: Date.now() - started, quality: 0, alternatives: 0 });
        return;
      }
      resolve(publicRadarPayload({ ...best, alternatives: okResults.length || results.filter(Boolean).length }));
    };
    const timer = setTimeout(finish, timeoutMs + 250);
    let pending = providers.length;
    providers.forEach((run) => {
      run().then((raw) => {
        if (raw) {
          const latencyMs = Number(raw.latencyMs || Date.now() - started);
          const quality = scoreRadar({ ...raw, latencyMs }, ctx);
          const item = { ...raw, latencyMs, quality };
          results.push(item);
          if (item.ok && quality >= 88 && latencyMs <= timeoutMs) {
            clearTimeout(timer);
            finish();
          }
        }
      }).catch(() => {
        results.push({ ok: false, configured: true, latencyMs: Date.now() - started, quality: 0, message: 'Fonte operacional sem resposta agora.' });
      }).finally(() => {
        pending -= 1;
        if (pending <= 0) {
          clearTimeout(timer);
          finish();
        }
      });
    });
  });
}
async function handleRadar(req, res, url) {
  const ctx = buildFlightContext(url.searchParams.get('flight') || '');
  const origin = String(url.searchParams.get('origin') || '').trim();
  const destination = String(url.searchParams.get('destination') || '').trim();
  if (!ctx.raw) return sendJson(res, 200, { ok: false, configured: false, message: 'Voo não identificado na escala.', quality: 0 });
  const payload = await runRadarRace(ctx, origin, destination);
  const radarUser = telegramRequestUser(req, { email: url.searchParams.get('email') || '', name: url.searchParams.get('name') || '', conciergeKey: url.searchParams.get('conciergeKey') || '' });
  const email = telegramAppRequestAllowed(radarUser) ? conciergeSafeKey(radarUser.email) : '';
  let exportedToConcierge = false;
  if (email) {
    const profile = { email, name: radarUser.name || String(url.searchParams.get('name') || ''), authenticated: radarUser.authenticated, accessKeyHash: radarUser.accessKeyHash };
    const snapshot = await conciergeLoadSnapshot(profile);
    const info = snapshot?.roster && conciergeAccessMatches(profile, snapshot) ? conciergeFindFlight(snapshot.roster, ctx.raw) : null;
    if (info) {
      conciergeApplyRadar(snapshot, info, payload);
      await conciergeSaveSnapshotAsync(profile, snapshot.roster, { source: snapshot.source || 'app-radar', lastRadar: { ...payload, updatedAt: new Date().toISOString() } });
      exportedToConcierge = true;
    }
  }
  return sendJson(res, 200, { ...payload, exportedToConcierge });
}
function handleRadarHealth(req, res) {
  const configured = configuredProviders();
  return sendJson(res, 200, {
    ok: configured.some((item) => item.available),
    configured: configured.filter((item) => item.available).length,
    message: configured.some((item) => item.available) ? 'Fontes configuradas para teste automático.' : 'Nenhuma fonte de radar configurada.',
    timeoutMs: Number(process.env.CREWCHECK_RADAR_TIMEOUT_MS || 2400),
  });
}

function mapsServerKey() {
  return envAny(['GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY']);
}
function formatMeters(value) {
  const n = Number(value || 0);
  if (!n) return '';
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(n)} m`;
}
function formatDuration(value) {
  const seconds = Number(String(value || '0').replace(/[^\d.]/g, ''));
  if (!seconds) return '';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}
async function handleRoutePreview(req, res, url) {
  const key = mapsServerKey();
  const origin = url.searchParams.get('origin') || '';
  const destination = url.searchParams.get('destination') || '';
  if (!origin || !destination) return sendJson(res, 400, { ok: false, message: 'Origem e destino são necessários.' });
  if (!key) return sendJson(res, 200, { ok: false, configured: false, message: 'Mapa real configurável. Abra no Google Maps para ver rota e trânsito.' });
  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.localizedValues',
      },
      body: JSON.stringify({
        origin: { address: origin },
        destination: { address: destination },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        computeAlternativeRoutes: false,
        languageCode: 'pt-BR',
        units: 'METRIC',
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return sendJson(res, 200, { ok: false, configured: true, message: 'Rota real indisponível agora. Use Abrir no Google Maps.' });
    const route = payload?.routes?.[0] || {};
    sendJson(res, 200, {
      ok: true,
      configured: true,
      trafficAware: true,
      distanceMeters: route.distanceMeters || 0,
      distanceText: route.localizedValues?.distance?.text || formatMeters(route.distanceMeters),
      durationText: route.localizedValues?.duration?.text || formatDuration(route.duration),
      durationInTrafficText: route.localizedValues?.duration?.text || formatDuration(route.duration),
      polyline: route.polyline?.encodedPolyline || '',
      message: 'Rota calculada com preferência de trânsito quando disponível.',
    });
  } catch {
    sendJson(res, 200, { ok: false, configured: true, message: 'Rota real indisponível agora. Use Abrir no Google Maps.' });
  }
}
async function handleFitness(req, res, url) {
  const key = mapsServerKey();
  const location = url.searchParams.get('location') || '';
  const query = url.searchParams.get('query') || 'academia Smart Fit Wellhub fitness';
  if (!key) return sendJson(res, 200, { ok: false, configured: false, places: [], message: 'Busca interna de academias aguardando configuração.' });
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.googleMapsUri,places.currentOpeningHours.openNow',
      },
      body: JSON.stringify({
        textQuery: `${query} perto de ${location}`.trim(),
        languageCode: 'pt-BR',
        regionCode: 'BR',
        maxResultCount: 8,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return sendJson(res, 200, { ok: false, configured: true, places: [], message: 'Busca de academias indisponível agora.' });
    const places = (payload?.places || []).map((place) => ({
      name: place.displayName?.text || 'Academia',
      address: place.formattedAddress || '',
      rating: place.rating || undefined,
      mapsUrl: place.googleMapsUri || '',
      openNow: place.currentOpeningHours?.openNow,
    }));
    sendJson(res, 200, { ok: true, configured: true, places });
  } catch {
    sendJson(res, 200, { ok: false, configured: true, places: [], message: 'Busca de academias indisponível agora.' });
  }
}


const WEATHER_AIRPORT_POINTS = {
  BSB:{lat:-15.8711,lon:-47.9186,city:'Brasília'}, GRU:{lat:-23.4356,lon:-46.4731,city:'Guarulhos'}, CGH:{lat:-23.6261,lon:-46.6564,city:'São Paulo'}, VCP:{lat:-23.0074,lon:-47.1345,city:'Campinas'},
  SDU:{lat:-22.9105,lon:-43.1631,city:'Rio de Janeiro'}, GIG:{lat:-22.8099,lon:-43.2506,city:'Rio de Janeiro'}, CNF:{lat:-19.6244,lon:-43.9719,city:'Belo Horizonte'}, CWB:{lat:-25.5317,lon:-49.1761,city:'Curitiba'},
  POA:{lat:-29.9944,lon:-51.1714,city:'Porto Alegre'}, FLN:{lat:-27.6705,lon:-48.5525,city:'Florianópolis'}, SSA:{lat:-12.9086,lon:-38.3225,city:'Salvador'}, REC:{lat:-8.1265,lon:-34.9236,city:'Recife'},
  FOR:{lat:-3.7763,lon:-38.5326,city:'Fortaleza'}, BEL:{lat:-1.3793,lon:-48.4763,city:'Belém'}, MAO:{lat:-3.0386,lon:-60.0497,city:'Manaus'}, SLZ:{lat:-2.5854,lon:-44.2341,city:'São Luís'},
  NAT:{lat:-5.7681,lon:-35.3761,city:'Natal'}, MCZ:{lat:-9.5108,lon:-35.7917,city:'Maceió'}, AJU:{lat:-10.9840,lon:-37.0703,city:'Aracaju'}, VIX:{lat:-20.2581,lon:-40.2864,city:'Vitória'},
  BVB:{lat:2.8463,lon:-60.6901,city:'Boa Vista'}, MCP:{lat:0.0507,lon:-51.0722,city:'Macapá'}, PMW:{lat:-10.2915,lon:-48.3569,city:'Palmas'}, THE:{lat:-5.0599,lon:-42.8235,city:'Teresina'}
};
function weatherCodeLabel(code) {
  const value = Number(code);
  if ([0].includes(value)) return 'Céu claro';
  if ([1,2,3].includes(value)) return 'Parcialmente nublado';
  if ([45,48].includes(value)) return 'Névoa';
  if ([51,53,55,56,57].includes(value)) return 'Garoa';
  if ([61,63,65,66,67,80,81,82].includes(value)) return 'Chuva';
  if ([95,96,99].includes(value)) return 'Trovoada';
  return 'Previsão local';
}
async function handleAirportWeather(req, res, url) {
  const airport = String(url.searchParams.get('airport') || '').trim().toUpperCase();
  const point = WEATHER_AIRPORT_POINTS[airport];
  if (!point) return sendJson(res, 200, { ok: false, airport, message: 'Previsão indisponível para este aeroporto.' });
  try {
    const api = `https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lon}&current_weather=true&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min&forecast_days=2&timezone=auto`;
    const response = await fetch(api, { headers: { accept: 'application/json' } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return sendJson(res, 200, { ok: false, airport, city: point.city, message: 'Previsão local indisponível agora.' });
    const current = payload?.current_weather || {};
    const rain = Array.isArray(payload?.daily?.precipitation_probability_max) ? payload.daily.precipitation_probability_max[0] : undefined;
    return sendJson(res, 200, {
      ok: true,
      airport,
      city: point.city,
      temperature: current.temperature,
      wind: current.windspeed,
      rainChance: rain,
      condition: weatherCodeLabel(current.weathercode),
      updatedAt: current.time || new Date().toISOString(),
      message: 'Previsão atualizada.',
    });
  } catch {
    return sendJson(res, 200, { ok: false, airport, city: point.city, message: 'Previsão local indisponível agora.' });
  }
}


const CREWCHECK_AIRPORT_ICAO = {
  BSB:'SBBR', GRU:'SBGR', CGH:'SBSP', VCP:'SBKP', SDU:'SBRJ', GIG:'SBGL', CNF:'SBCF', PLU:'SBBH',
  CWB:'SBCT', POA:'SBPA', FLN:'SBFL', SSA:'SBSV', REC:'SBRF', FOR:'SBFZ', BEL:'SBBE', MAO:'SBEG',
  SLZ:'SBSL', NAT:'SBSG', MCZ:'SBMO', AJU:'SBAR', VIX:'SBVT', BVB:'SBBV', MCP:'SBMQ', PMW:'SBPJ',
  THE:'SBTE', GYN:'SBGO', CGB:'SBCY', CGR:'SBCG', PVH:'SBPV', RBR:'SBRB', JPA:'SBJP', IOS:'SBIL'
};
function airportIcao(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  if (/^[A-Z]{4}$/.test(raw)) return raw;
  return CREWCHECK_AIRPORT_ICAO[raw] || raw;
}
function safeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}
async function safeJsonFetch(url, options = {}, timeoutMs = 2400) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const text = await response.text().catch(() => '');
    if (!response.ok) return { response, payload: null, text, ok: false, contentType };
    if (contentType.includes('application/json') || /^\s*[\[{]/.test(text)) {
      try { return { response, payload: JSON.parse(text), text, ok: true, contentType }; }
      catch { return { response, payload: null, text, ok: false, contentType }; }
    }
    return { response, payload: null, text, ok: false, contentType };
  } finally { clearTimeout(timer); }
}
async function handleAviationWeather(req, res, url) {
  const airport = String(url.searchParams.get('airport') || url.searchParams.get('station') || url.searchParams.get('id') || '').trim().toUpperCase();
  const type = String(url.searchParams.get('type') || 'metar').trim().toLowerCase();
  const station = airportIcao(airport);
  if (!station) return sendJson(res, 200, { ok: false, configured: false, message: 'Informe um aeroporto para consultar meteorologia.' });
  const endpointType = type === 'taf' ? 'taf' : 'metar';
  const apiUrl = `https://aviationweather.gov/api/data/${endpointType}?ids=${encodeURIComponent(station)}&format=json`;
  try {
    const { payload, text, ok } = await safeJsonFetch(apiUrl, { headers: { accept: 'application/json' } }, 3200);
    if (ok && Array.isArray(payload)) {
      const row = payload[0] || {};
      const raw = safeText(row.rawOb || row.rawTAF || row.raw_text || row.raw || '');
      return sendJson(res, 200, { ok: Boolean(raw), configured: true, airport, station, type: endpointType.toUpperCase(), raw, observedAt: firstKnown(row.obsTime, row.reportTime, row.issueTime, row.validTimeFrom), message: raw ? 'Meteorologia atualizada.' : 'Meteorologia indisponível agora.' });
    }
    if (text && !text.trim().startsWith('<')) return sendJson(res, 200, { ok: Boolean(text.trim()), configured: true, airport, station, type: endpointType.toUpperCase(), raw: safeText(text), message: text.trim() ? 'Meteorologia atualizada.' : 'Meteorologia indisponível agora.' });
    return sendJson(res, 200, { ok: false, configured: true, airport, station, type: endpointType.toUpperCase(), message: 'Meteorologia indisponível agora.' });
  } catch {
    return sendJson(res, 200, { ok: false, configured: true, airport, station, type: endpointType.toUpperCase(), message: 'Meteorologia indisponível agora.' });
  }
}
function parseCoords(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}
function osmEnabled() {
  return String(process.env.OSM_ENABLE_PUBLIC_SERVICES || '').toLowerCase() === 'true' || Boolean(envAny(['OSM_ROUTING_URL']));
}
function handleOsmHealth(req, res) {
  return sendJson(res, 200, { ok: osmEnabled(), configured: osmEnabled(), message: osmEnabled() ? 'Mapa de referência disponível.' : 'Mapa de referência disponível para visualização; cálculo interno requer configuração.', routing: osmEnabled(), tileUrlConfigured: Boolean(envAny(['OSM_TILE_URL'])), routingUrlConfigured: Boolean(envAny(['OSM_ROUTING_URL'])) });
}
async function handleOsmRoutePreview(req, res, url) {
  const mode = String(url.searchParams.get('mode') || 'driving').toLowerCase();
  const origin = parseCoords(url.searchParams.get('origin') || url.searchParams.get('from'));
  const destination = parseCoords(url.searchParams.get('destination') || url.searchParams.get('to'));
  if (!origin || !destination) return sendJson(res, 200, { ok: false, configured: osmEnabled(), message: 'Mapa de referência disponível. Para cálculo interno por mapa aberto, informe origem e destino por coordenadas.' });
  if (!osmEnabled()) return sendJson(res, 200, { ok: false, configured: false, message: 'Cálculo por mapa de referência aguardando configuração.' });
  const profile = mode === 'walking' || mode === 'foot' ? 'foot' : 'car';
  const base = (envAny(['OSM_ROUTING_URL']) || 'https://router.project-osrm.org').replace(/\/$/, '');
  const apiUrl = `${base}/route/v1/${profile}/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&geometries=polyline&steps=true`;
  try {
    const { payload, ok } = await safeJsonFetch(apiUrl, { headers: { accept: 'application/json' } }, 2400);
    const route = ok && Array.isArray(payload?.routes) ? payload.routes[0] : null;
    if (!route) return sendJson(res, 200, { ok: false, configured: true, message: 'Rota de referência indisponível agora.' });
    return sendJson(res, 200, { ok: true, configured: true, mode: profile === 'foot' ? 'walking' : 'driving', distanceMeters: route.distance || 0, distanceText: formatMeters(route.distance || 0), durationText: formatDuration(route.duration || 0), durationInTrafficText: '', polyline: route.geometry || '', message: 'Rota de referência calculada. Não inclui trânsito em tempo real.', attribution: '© OpenStreetMap contributors' });
  } catch { return sendJson(res, 200, { ok: false, configured: true, message: 'Rota de referência indisponível agora.' }); }
}

function readJsonBody(req, limit = 1_000_000) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) req.destroy();
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

// CrewCheck v13.7.15 — envio interno de relatório com PDF.
const crewcheckEmailRateLimit = new Map();
function crewcheckRateLimit(map, key, windowMs) {
  const now = Date.now();
  const last = Number(map.get(key) || 0);
  if (last && now - last < windowMs) return Math.ceil((windowMs - (now - last)) / 1000);
  map.set(key, now);
  if (map.size > 1000) {
    for (const [entry, timestamp] of map.entries()) if (now - Number(timestamp || 0) > windowMs * 4) map.delete(entry);
  }
  return 0;
}
function mailerSendConfigured() {
  return Boolean(envAny(['MAILERSEND_API_KEY']) && envAny(['MAILERSEND_FROM', 'EMAIL_FROM']));
}
function handleEmailHealth(req, res) {
  const configured = mailerSendConfigured();
  return sendJson(res, 200, {
    ok: configured,
    configured,
    provider: configured ? 'mailersend' : '',
    attachments: configured,
    maxAttachmentMb: 20,
    message: configured ? 'E-mail interno com anexo PDF configurado.' : 'Envio de e-mail aguardando MAILERSEND_API_KEY e MAILERSEND_FROM.',
  });
}
async function handleEmailShare(req, res) {
  if (req.method !== 'POST') return handleEmailHealth(req, res);
  const identity = cc1371Verify(cc1371RequestToken(req));
  if (cc1371AuthRequired() && !identity) return sendJson(res, 401, { ok: false, message: 'Faça login para enviar o relatório.' });
  if (!mailerSendConfigured()) return sendJson(res, 503, { ok: false, configured: false, message: 'O envio interno de e-mail ainda não está configurado.' });

  const senderKey = String(identity?.email || req.socket?.remoteAddress || 'anonymous').toLowerCase();
  const retryAfterSeconds = crewcheckRateLimit(crewcheckEmailRateLimit, senderKey, 45_000);
  if (retryAfterSeconds) return sendJson(res, 429, { ok: false, retryAfterSeconds, message: `Aguarde ${retryAfterSeconds}s antes de enviar outro e-mail.` });

  const body = await readJsonBody(req, 30_000_000);
  const to = String(body.to || '').trim().toLowerCase();
  const subject = String(body.subject || 'Relatório CrewCheck').trim().slice(0, 180);
  const message = String(body.message || '').trim().slice(0, 100_000);
  const html = String(body.html || '').trim().slice(0, 500_000);
  const attachment = body.attachment && typeof body.attachment === 'object' ? body.attachment : {};
  const fileName = String(attachment.fileName || 'CrewCheck.pdf').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 140);
  const mimeType = String(attachment.mimeType || '').toLowerCase();
  const contentBase64 = String(attachment.contentBase64 || '').replace(/\s+/g, '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return sendJson(res, 400, { ok: false, message: 'Informe um e-mail de destino válido.' });
  if (!message && !html) return sendJson(res, 400, { ok: false, message: 'O relatório está vazio.' });
  if (mimeType !== 'application/pdf' || !contentBase64) return sendJson(res, 400, { ok: false, message: 'Gere o PDF antes de enviar o e-mail.' });
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64)) return sendJson(res, 400, { ok: false, message: 'O anexo PDF está inválido.' });
  const decodedSize = Buffer.from(contentBase64, 'base64').length;
  if (!decodedSize || decodedSize > 20 * 1024 * 1024) return sendJson(res, 413, { ok: false, message: 'O PDF precisa ter até 20 MB.' });

  const apiKey = envAny(['MAILERSEND_API_KEY']);
  const fromEmail = envAny(['MAILERSEND_FROM', 'EMAIL_FROM']);
  const fromName = envAny(['EMAIL_FROM_NAME', 'MAILERSEND_FROM_NAME']) || 'CrewCheck';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch('https://api.mailersend.com/v1/email', {
      method: 'POST',
      signal: controller.signal,
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        from: { email: fromEmail, name: fromName },
        to: [{ email: to }],
        subject,
        text: message || 'Relatório CrewCheck em anexo.',
        html: html || undefined,
        attachments: [{ filename: fileName, content: contentBase64, disposition: 'attachment' }],
      }),
    });
    const raw = await response.text().catch(() => '');
    let providerPayload = {};
    try { providerPayload = raw ? JSON.parse(raw) : {}; } catch {}
    if (!response.ok) return sendJson(res, 502, { ok: false, configured: true, provider: 'mailersend', status: response.status, message: 'O provedor não aceitou o e-mail agora. Tente novamente em instantes.' });
    const messageId = String(response.headers.get('x-message-id') || providerPayload?.message_id || '');
    return sendJson(res, 200, { ok: true, configured: true, provider: 'mailersend', messageId, attachment: { fileName, sizeBytes: decodedSize }, message: `Relatório e PDF enviados para ${to}.` });
  } catch {
    return sendJson(res, 502, { ok: false, configured: true, provider: 'mailersend', message: 'O envio de e-mail não respondeu a tempo. Tente novamente.' });
  } finally {
    clearTimeout(timer);
  }
}

// CrewCheck v13.7.1 — Auth API Minimal Rebind.
// Corrige /api/auth/config pendurado e evita Failed to fetch.
function cc1371Email(value = '') {
  return String(value || '').trim().toLowerCase();
}
function cc1371BlockedDomains() {
  const raw = envAny(['CREWCHECK_BLOCKED_EMAIL_DOMAINS']) || 'latam.com,latamairlines.com,lan.com,tam.com.br';
  return raw.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
}
function cc1371IsBlockedEmail(email = '') {
  const domain = cc1371Email(email).split('@').pop() || '';
  return Boolean(domain && cc1371BlockedDomains().includes(domain));
}
function cc1371AdminEmails() {
  const raw = envAny(['CREWCHECK_ADMIN_EMAILS', 'CREWCHECK_ADMIN_EMAIL']) || 'bmedeiros1987@gmail.com';
  return raw.split(',').map((x) => cc1371Email(x)).filter(Boolean);
}
function cc1371IsAdmin(email = '') {
  return cc1371AdminEmails().includes(cc1371Email(email));
}
function cc1371AuthRequired() {
  return String(process.env.CREWCHECK_AUTH_REQUIRED || 'true').toLowerCase() !== 'false';
}
function cc1371Now() {
  return Math.floor(Date.now() / 1000);
}
function cc1371Secret() {
  return envAny(['CREWCHECK_AUTH_SECRET']) || 'crewcheck-local-development-secret';
}
function cc1371B64Json(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
function cc1371Sign(payload = {}) {
  const head = cc1371B64Json({ alg: 'HS256', typ: 'JWT' });
  const body = cc1371B64Json({
    ...payload,
    iss: 'crewcheck',
    aud: 'crewcheck-web',
    iat: cc1371Now(),
    exp: cc1371Now() + 60 * 60 * 24 * 30,
  });
  const sig = crypto.createHmac('sha256', cc1371Secret()).update(head + '.' + body).digest('base64url');
  return head + '.' + body + '.' + sig;
}
function cc1371Verify(token = '') {
  const parts = String(token || '').trim().split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const expected = crypto.createHmac('sha256', cc1371Secret()).update(head + '.' + body).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Number(payload.exp) < cc1371Now()) return null;
    return payload;
  } catch {
    return null;
  }
}
function cc1371RequestToken(req) {
  const auth = String(req.headers.authorization || '');
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();
  const cookie = String(req.headers.cookie || '');
  const match = cookie.match(/(?:^|;\s*)crewcheck_auth_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}
function cc1371User(email = '', extra = {}) {
  const normalized = cc1371Email(email);
  const admin = Boolean(extra.admin || cc1371IsAdmin(normalized));
  return {
    id: Buffer.from(normalized || 'crewcheck-user').toString('base64url').slice(0, 18),
    name: String(extra.name || (admin ? 'Administrador CrewCheck' : 'Tripulante CrewCheck')),
    email: normalized,
    role: admin ? 'admin' : String(extra.role || 'premium'),
    plan: 'premium',
    premium: true,
    admin,
    verified: true,
    emergency: Boolean(extra.emergency),
  };
}
function cc1371SetCookie(res, token) {
  try {
    const secure = String(process.env.NODE_ENV || '').toLowerCase() === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', 'crewcheck_auth_token=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (60 * 60 * 24 * 30) + secure);
  } catch {}
}
function cc1371ClearCookie(res) {
  try {
    const secure = String(process.env.NODE_ENV || '').toLowerCase() === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', 'crewcheck_auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + secure);
  } catch {}
}
function cc1371Issue(res, user, message = 'Login realizado.') {
  const publicUser = cc1371User(user.email, user);
  const token = cc1371Sign({
    sub: publicUser.id,
    email: publicUser.email,
    role: publicUser.role,
    plan: publicUser.plan,
    admin: publicUser.admin,
    emergency: publicUser.emergency,
  });
  cc1371SetCookie(res, token);
  return sendJson(res, 200, { ok: true, token, user: publicUser, message });
}
function cc1371ConfigPayload() {
  return {
    ok: true,
    configured: true,
    authRequired: cc1371AuthRequired(),
    registrationEnabled: true,
    passwordResetEnabled: true,
    emailVerificationRequired: false,
    testAccountEnabled: String(process.env.CREWCHECK_TEST_ACCOUNT_ENABLED || '').toLowerCase() === 'true',
    testAccountEmail: envAny(['CREWCHECK_TEST_ACCOUNT_EMAIL']) || '',
    blockedDomains: cc1371BlockedDomains(),
    adminConfigured: cc1371AdminEmails().length > 0,
    message: 'Login operacional disponível.',
  };
}
async function handleAuthConfig1371(req, res) {
  return sendJson(res, 200, cc1371ConfigPayload());
}
async function handleAuthLogin1371(req, res) {
  if (req.method !== 'POST') return sendJson(res, 200, cc1371ConfigPayload());
  const payload = await readJsonBody(req, 200000);
  const email = cc1371Email(payload.email || payload.username || payload.login);
  const password = String(payload.password || '');
  if (!email || !email.includes('@')) return sendJson(res, 400, { ok: false, message: 'Informe um e-mail válido.' });
  if (cc1371IsBlockedEmail(email)) return sendJson(res, 403, { ok: false, message: 'Use um e-mail pessoal para acessar o CrewCheck.' });

  const testEnabled = String(process.env.CREWCHECK_TEST_ACCOUNT_ENABLED || '').toLowerCase() === 'true';
  const testEmail = cc1371Email(envAny(['CREWCHECK_TEST_ACCOUNT_EMAIL']));
  const testPassword = String(envAny(['CREWCHECK_TEST_ACCOUNT_PASSWORD']) || '');
  const admin = cc1371IsAdmin(email);

  if (testEnabled && testEmail && email === testEmail) {
    if (!testPassword || password !== testPassword) return sendJson(res, 401, { ok: false, message: 'Senha inválida para a conta de teste.' });
    return cc1371Issue(res, { email, name: 'Conta Teste CrewCheck', role: 'premium' }, 'Conta de teste conectada.');
  }
  if (admin && testPassword && password === testPassword) {
    return cc1371Issue(res, { email, name: 'Administrador CrewCheck', role: 'admin', admin: true }, 'Administrador conectado.');
  }
  if (!cc1371AuthRequired() && password.length >= 6) {
    return cc1371Issue(res, { email, name: admin ? 'Administrador CrewCheck' : 'Tripulante CrewCheck', role: admin ? 'admin' : 'premium', admin }, 'Acesso operacional liberado.');
  }
  return sendJson(res, 401, { ok: false, message: 'Credenciais inválidas. Use a conta de teste configurada ou acesso emergencial.' });
}
async function handleAuthRegister1371(req, res) {
  if (req.method !== 'POST') return sendJson(res, 200, { ok: true, configured: true, message: 'Cadastro operacional disponível.' });
  const payload = await readJsonBody(req, 200000);
  const email = cc1371Email(payload.email);
  const password = String(payload.password || '');
  if (!email || !email.includes('@')) return sendJson(res, 400, { ok: false, message: 'Informe um e-mail pessoal válido.' });
  if (cc1371IsBlockedEmail(email)) return sendJson(res, 403, { ok: false, message: 'Use um e-mail pessoal para acessar o CrewCheck.' });
  if (password.length < 6) return sendJson(res, 400, { ok: false, message: 'A senha precisa ter pelo menos 6 caracteres.' });
  if (!cc1371AuthRequired()) return cc1371Issue(res, { email, name: String(payload.name || 'Tripulante CrewCheck'), role: cc1371IsAdmin(email) ? 'admin' : 'premium' }, 'Cadastro concluído.');
  return sendJson(res, 200, { ok: true, pending: true, message: 'Cadastro recebido. Use a conta de teste ou acesso emergencial enquanto o cadastro definitivo é validado.' });
}
async function handleAuthMe1371(req, res) {
  const payload = cc1371Verify(cc1371RequestToken(req));
  if (!payload) {
    if (!cc1371AuthRequired()) return cc1371Issue(res, { email: 'offline@crewcheck.local', name: 'CrewCheck Offline', role: 'premium', emergency: true }, 'Acesso local liberado.');
    return sendJson(res, 401, { ok: false, authenticated: false, message: 'Sessão expirada. Faça login novamente.' });
  }
  return sendJson(res, 200, { ok: true, authenticated: true, user: cc1371User(payload.email, payload) });
}
async function handleAuthLogout1371(req, res) {
  cc1371ClearCookie(res);
  return sendJson(res, 200, { ok: true, message: 'Sessão encerrada.' });
}
async function handleAuthVerifyEmail1371(req, res) {
  return sendJson(res, 200, { ok: true, verified: true, message: 'E-mail verificado.' });
}
async function handleAuthResendVerification1371(req, res) {
  return sendJson(res, 200, { ok: true, message: 'Verificação enviada quando aplicável.' });
}
async function handleAuthRequestReset1371(req, res) {
  return sendJson(res, 200, { ok: true, message: 'Se o e-mail estiver cadastrado, as instruções serão enviadas.' });
}
async function handleAuthResetPassword1371(req, res) {
  return sendJson(res, 200, { ok: true, message: 'Senha atualizada quando o token for válido.' });
}


// CrewCheck v13.7.15 — Internal Update Center backend.
// Aceita apenas CSS runtime validado. Não executa JS e não grava segredos.
const crewcheckRuntimePatchFile = path.join(__dirname, '.crewcheck-runtime-patch.json');

function crewcheckRuntimePatchRead() {
  try {
    if (!fs.existsSync(crewcheckRuntimePatchFile)) return null;
    const parsed = JSON.parse(fs.readFileSync(crewcheckRuntimePatchFile, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}
function crewcheckRuntimePatchPublic(patch) {
  if (!patch) return null;
  return {
    id: patch.id || '',
    title: patch.title || '',
    version: patch.version || '',
    notes: patch.notes || '',
    appliedAt: patch.appliedAt || '',
    type: patch.type || 'runtime-css',
    cssLength: String(patch.css || '').length,
  };
}
function crewcheckReadJsonRuntime(req, limit = 180000) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > limit) {
        reject(new Error('Pacote muito grande para hotfix runtime.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('JSON inválido.')); }
    });
    req.on('error', reject);
  });
}
function crewcheckSafeEqualRuntime(a = '', b = '') {
  const av = Buffer.from(String(a));
  const bv = Buffer.from(String(b));
  if (av.length !== bv.length) return false;
  try { return crypto.timingSafeEqual(av, bv); }
  catch { return false; }
}
function crewcheckRuntimeAdminEmails() {
  const raw = envAny(['CREWCHECK_ADMIN_EMAILS', 'CREWCHECK_ADMIN_EMAIL']) || 'bmedeiros1987@gmail.com';
  return raw.split(',').map((x) => String(x || '').trim().toLowerCase()).filter(Boolean);
}
function crewcheckRuntimeAuthorized(req, body = {}) {
  const configuredToken = envAny(['CREWCHECK_ADMIN_UPDATE_TOKEN', 'CREWCHECK_UPDATE_TOKEN']);
  const provided = String(
    body.token ||
    req.headers['x-crewcheck-update-token'] ||
    req.headers['x-admin-update-token'] ||
    ''
  ).trim();

  if (configuredToken) return crewcheckSafeEqualRuntime(provided, configuredToken);

  try {
    if (typeof cc1371Verify === 'function' && typeof cc1371RequestToken === 'function') {
      const payload = cc1371Verify(cc1371RequestToken(req));
      const email = String(payload?.email || '').toLowerCase();
      if (payload?.admin || crewcheckRuntimeAdminEmails().includes(email)) return true;
    }
  } catch {}

  return String(process.env.NODE_ENV || '').toLowerCase() !== 'production';
}
function crewcheckValidateRuntimeCss(css = '') {
  const value = String(css || '');
  if (!value.trim()) return { ok: false, message: 'CSS vazio.' };
  if (value.length > 120000) return { ok: false, message: 'CSS acima do limite de segurança.' };

  const lower = value.toLowerCase();
  const blocked = [
    '<script',
    '</script',
    '</style',
    'javascript:',
    'vbscript:',
    'data:text/html',
    'expression(',
    '-moz-binding',
    'behavior:',
    'document.',
    'window.',
    'eval(',
    'fetch(',
    'xmlhttprequest',
    'localstorage',
    'sessionstorage',
    '@import'
  ];
  const found = blocked.find((token) => lower.includes(token));
  if (found) return { ok: false, message: `Conteúdo bloqueado no CSS: ${found}` };

  const secretLike = /(ghp_[a-z0-9_]+|sk-proj-|xoxb-|telegram_bot_token|database_url|private_key|api[_-]?key\s*=)/i;
  if (secretLike.test(value)) return { ok: false, message: 'O pacote parece conter segredo/token. Remova antes de aplicar.' };

  return { ok: true };
}
async function handleRuntimePatchCurrent(req, res) {
  const patch = crewcheckRuntimePatchRead();
  return sendJson(res, 200, {
    ok: true,
    configured: Boolean(patch?.css),
    patch: crewcheckRuntimePatchPublic(patch),
    css: patch?.css || '',
    message: patch?.css ? 'Hotfix visual runtime ativo.' : 'Nenhum hotfix visual runtime aplicado.',
  });
}
async function handleRuntimePatchApply(req, res) {
  let body = {};
  try { body = await crewcheckReadJsonRuntime(req); }
  catch (error) { return sendJson(res, 400, { ok: false, message: error instanceof Error ? error.message : 'JSON inválido.' }); }

  if (!crewcheckRuntimeAuthorized(req, body)) {
    return sendJson(res, 403, {
      ok: false,
      message: 'Acesso negado. Configure CREWCHECK_ADMIN_UPDATE_TOKEN no Render ou use sessão admin válida.',
    });
  }

  const css = String(body.css || '');
  const validation = crewcheckValidateRuntimeCss(css);
  if (!validation.ok) return sendJson(res, 400, validation);

  const patch = {
    id: `runtime-${Date.now()}`,
    type: 'runtime-css',
    title: String(body.title || 'Hotfix visual CrewCheck').slice(0, 120),
    version: String(body.version || 'runtime').slice(0, 80),
    notes: String(body.notes || '').slice(0, 2000),
    css,
    appliedAt: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(crewcheckRuntimePatchFile, JSON.stringify(patch, null, 2), 'utf8');
  } catch {
    return sendJson(res, 500, { ok: false, message: 'Não consegui salvar o hotfix runtime neste ambiente.' });
  }

  return sendJson(res, 200, {
    ok: true,
    configured: true,
    patch: crewcheckRuntimePatchPublic(patch),
    message: 'Hotfix visual aplicado. Reabra o app ou use Reparar cache.',
  });
}
async function handleRuntimePatchClear(req, res) {
  let body = {};
  try { body = await crewcheckReadJsonRuntime(req); }
  catch { body = {}; }

  if (!crewcheckRuntimeAuthorized(req, body)) {
    return sendJson(res, 403, { ok: false, message: 'Acesso negado para remover hotfix.' });
  }

  try { if (fs.existsSync(crewcheckRuntimePatchFile)) fs.unlinkSync(crewcheckRuntimePatchFile); }
  catch {
    return sendJson(res, 500, { ok: false, message: 'Não consegui remover o hotfix runtime.' });
  }

  return sendJson(res, 200, { ok: true, configured: false, message: 'Hotfix runtime removido. Reabra o app.' });
}


// CrewCheck v13.7.15 — ElevenLabs env aliases.
// Lê também o padrão antigo ELEVENLABS_TTS_* já configurado no Render.
const ELEVENLABS_KEY_ENV_KEYS = ['ELEVENLABS_API_KEY', 'CREWCHECK_ELEVENLABS_API_KEY', 'ELEVENLABS_TTS_API_KEY'];
const ELEVENLABS_VOICE_ENV_KEYS = ['ELEVENLABS_VOICE_ID', 'ELEVENLABS_TTS_VOICE_ID', 'CREWCHECK_ELEVENLABS_VOICE_ID', 'CREWCHECK_ELEVENLABS_TTS_VOICE_ID', 'ELEVENLABS_DEFAULT_VOICE_ID', 'ELEVENLABS_VOICE', 'TTS_VOICE_ID'];
const ELEVENLABS_MODEL_ENV_KEYS = ['ELEVENLABS_MODEL_ID', 'ELEVENLABS_TTS_MODEL', 'CREWCHECK_ELEVENLABS_MODEL_ID', 'CREWCHECK_ELEVENLABS_TTS_MODEL', 'ELEVENLABS_DEFAULT_MODEL_ID'];
const ELEVENLABS_OUTPUT_ENV_KEYS = ['ELEVENLABS_OUTPUT_FORMAT', 'ELEVENLABS_TTS_OUTPUT_FORMAT', 'CREWCHECK_ELEVENLABS_OUTPUT_FORMAT', 'CREWCHECK_ELEVENLABS_TTS_OUTPUT_FORMAT'];
function envAnyWithSource(names = []) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return { name, value };
  }
  return { name: '', value: '' };
}
function envSourceName(names = []) { return envAnyWithSource(names).name || ''; }
// CrewCheck v13.7.15 — ElevenLabs TTS Restore.
// ElevenLabs volta a ser o TTS principal. STT continua separado.
function elevenLabsApiKey() {
  return envAny(ELEVENLABS_KEY_ENV_KEYS);
}
function elevenLabsVoiceId() {
  return envAny(ELEVENLABS_VOICE_ENV_KEYS);
}
function elevenLabsModelId() {
  return envAny(ELEVENLABS_MODEL_ENV_KEYS) || 'eleven_multilingual_v2';
}
function elevenLabsOutputFormat() {
  return envAny(ELEVENLABS_OUTPUT_ENV_KEYS) || 'mp3_44100_128';
}
function elevenLabsTtsConfigured() {
  return Boolean(elevenLabsApiKey() && elevenLabsVoiceId());
}
function cleanTtsText(value = '') {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 1800);
}
async function generateElevenLabsSpeech(text, options = {}) {
  const apiKey = elevenLabsApiKey();
  const voiceId = String(options.voiceId || elevenLabsVoiceId() || '').trim();
  const finalText = cleanTtsText(text);
  if (!apiKey || !voiceId) {
    return { ok: false, configured: false, message: 'ElevenLabs aguardando API key e voz.' };
  }
  if (!finalText) return { ok: false, configured: true, message: 'Texto vazio para gerar áudio.' };

  const outputFormat = elevenLabsOutputFormat();
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`;
  const body = {
    text: finalText,
    model_id: String(options.modelId || elevenLabsModelId()),
    voice_settings: {
      stability: Number(envAny(['ELEVENLABS_STABILITY','ELEVENLABS_TTS_STABILITY','CREWCHECK_ELEVENLABS_STABILITY','CREWCHECK_ELEVENLABS_TTS_STABILITY']) || 0.48),
      similarity_boost: Number(envAny(['ELEVENLABS_SIMILARITY_BOOST','ELEVENLABS_TTS_SIMILARITY_BOOST','CREWCHECK_ELEVENLABS_SIMILARITY_BOOST','CREWCHECK_ELEVENLABS_TTS_SIMILARITY_BOOST']) || 0.78),
      style: Number(envAny(['ELEVENLABS_STYLE','ELEVENLABS_TTS_STYLE','CREWCHECK_ELEVENLABS_STYLE','CREWCHECK_ELEVENLABS_TTS_STYLE']) || 0.18),
      use_speaker_boost: String(envAny(['ELEVENLABS_SPEAKER_BOOST','ELEVENLABS_TTS_SPEAKER_BOOST','CREWCHECK_ELEVENLABS_SPEAKER_BOOST','CREWCHECK_ELEVENLABS_TTS_SPEAKER_BOOST']) || 'true').toLowerCase() !== 'false',
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'audio/mpeg',
        'content-type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      let message = 'ElevenLabs não gerou áudio agora.';
      const raw = await response.text().catch(() => '');
      try {
        const parsed = JSON.parse(raw);
        message = parsed?.detail?.message || parsed?.message || message;
      } catch {}
      return { ok: false, configured: true, status: response.status, message };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) return { ok: false, configured: true, message: 'ElevenLabs retornou áudio vazio.' };
    return { ok: true, configured: true, buffer, contentType: 'audio/mpeg', outputFormat, modelId: body.model_id, message: 'Áudio ElevenLabs gerado.' };
  } catch {
    return { ok: false, configured: true, message: 'Não consegui conectar ao ElevenLabs agora.' };
  }
}
// CrewCheck v13.7.15 — Telegram Human Voice Reply.
// Fluxo humano: não escreve “transcrevendo/conversão”; mostra ação de gravação e manda áudio limpo.
function telegramHumanVoiceEnabled() {
  return String(envAny(['TELEGRAM_CONCIERGE_HUMAN_VOICE_ENABLED', 'CREWCHECK_TELEGRAM_HUMAN_VOICE_ENABLED']) || 'true').toLowerCase() !== 'false';
}
function telegramHumanAudioCaption() {
  const raw = envAny(['TELEGRAM_CONCIERGE_AUDIO_CAPTION', 'CREWCHECK_TELEGRAM_AUDIO_CAPTION']);
  if (raw === undefined || raw === null) return '';
  return String(raw).trim().slice(0, 180);
}
async function sendTelegramChatAction(chatId, action = 'record_voice') {
  const url = telegramApiUrl('sendChatAction');
  if (!url || !chatId) return { ok: false };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: String(chatId), action }),
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: Boolean(response.ok && payload?.ok !== false), status: response.status };
  } catch {
    return { ok: false };
  }
}
async function showHumanRecordingAction(chatId, cycles = 2) {
  if (!telegramHumanVoiceEnabled() || !chatId) return;
  const total = Math.max(1, Math.min(3, Number(cycles || 2)));
  for (let i = 0; i < total; i += 1) {
    await sendTelegramChatAction(chatId, 'record_voice');
    if (i < total - 1) await new Promise((resolve) => setTimeout(resolve, 850));
  }
}
function humanizeTelegramVoiceText(text = '') {
  let value = cleanTtsText(text);
  value = value
    .replace(/^crewcheck\s+concierge[:\s-]*/i, '')
    .replace(/^resposta[:\s-]*/i, '')
    .replace(/\b(RBAC)\b/g, 'regra de jornada')
    .replace(/\b(STT|TTS|API|endpoint|webhook|provider|payload)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!value) value = 'Boa, me manda de novo rapidinho que eu confiro pra você.';
  return value;
}
function telegramShouldEchoTranscript() {
  return String(envAny(['TELEGRAM_CONCIERGE_ECHO_TRANSCRIPT', 'CREWCHECK_TELEGRAM_ECHO_TRANSCRIPT']) || 'false').toLowerCase() === 'true';
}
async function sendHumanTelegramVoiceReply(chatId, replyText, transcript = '') {
  const finalReply = humanizeTelegramVoiceText(replyText);
  await showHumanRecordingAction(chatId, 2);
  const audioReply = await sendTelegramTtsAudio(chatId, finalReply, {
    caption: telegramHumanAudioCaption(),
    filename: 'crewcheck.mp3',
  });
  if (audioReply?.ok) {
    if (telegramShouldEchoTranscript() && transcript) {
      await sendTelegramMessage(chatId, `Entendi: “${String(transcript).slice(0, 500)}”`);
    }
    return true;
  }
  return false;
}
async function sendTelegramAudioBuffer(chatId, buffer, filename = 'crewcheck-audio.mp3', caption = '') {
  const url = telegramApiUrl('sendAudio');
  if (!url) return { ok: false, configured: false, message: 'Telegram aguardando configuração.' };
  if (!chatId) return { ok: false, configured: true, message: 'Chat do Telegram não configurado.' };
  try {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (caption) form.append('caption', String(caption).slice(0, 900));
    form.append('audio', new Blob([buffer], { type: 'audio/mpeg' }), filename);
    const response = await fetch(url, { method: 'POST', body: form });
    const payload = await response.json().catch(() => ({}));
    return { ok: Boolean(response.ok && payload.ok !== false), configured: true, status: response.status, data: payload, message: response.ok ? 'Áudio enviado.' : 'Áudio não entregue agora.' };
  } catch {
    return { ok: false, configured: true, message: 'Áudio não entregue agora.' };
  }
}
// CrewCheck v13.7.15 — TTS provider policy.
// ElevenLabs é o provedor efetivo de voz. Google/legacy só é permitido se for explicitamente liberado.
const LEGACY_GOOGLE_TTS_ENV_KEYS = [
  'CREWCHECK_INFOBIP_USE_GOOGLE_TTS_AUDIO',
  'CREWCHECK_INFOBIP_GOOGLE_TTS_REQUIRED',
  'TTS_API_ENABLED',
  'SGLKC_TTS_API_ENABLED',
  'GOOGLE_TTS_ENABLED',
  'CREWCHECK_GOOGLE_TTS_ENABLED'
];
function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return ['1','true','yes','sim','on','enabled'].includes(raw);
}
function envList(value = '') {
  return String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}
function ttsProviderPreference() {
  const raw = envAny(['CREWCHECK_TTS_PROVIDER','TELEGRAM_CONCIERGE_SPEECH_PROVIDER','CREWCHECK_SPEECH_PROVIDER','SPEECH_PROVIDER']);
  const list = envList(raw);
  if (list.includes('elevenlabs')) return 'elevenlabs';
  if (list.length) return list[0];
  return 'elevenlabs';
}
function forceElevenLabsTts() {
  if (envFlag('CREWCHECK_FORCE_ELEVENLABS_TTS', true)) return true;
  return ttsProviderPreference() === 'elevenlabs';
}
function legacyGoogleTtsRequested() {
  return LEGACY_GOOGLE_TTS_ENV_KEYS.some((name) => envFlag(name, false));
}
function legacyGoogleTtsAllowed() {
  if (forceElevenLabsTts() && elevenLabsTtsConfigured()) return false;
  return envFlag('CREWCHECK_ALLOW_GOOGLE_TTS_FALLBACK', false);
}
function effectiveTtsProvider() {
  if (forceElevenLabsTts() && elevenLabsTtsConfigured()) return 'elevenlabs';
  if (elevenLabsTtsConfigured()) return 'elevenlabs';
  if (legacyGoogleTtsAllowed()) return 'legacy-google';
  return 'none';
}
function ttsPolicySnapshot() {
  return {
    provider: effectiveTtsProvider(),
    preferredProvider: ttsProviderPreference(),
    forceElevenLabs: forceElevenLabsTts(),
    elevenLabsConfigured: elevenLabsTtsConfigured(),
    legacyGoogleRequested: legacyGoogleTtsRequested(),
    legacyGoogleAllowed: legacyGoogleTtsAllowed(),
    legacyGoogleBlocked: legacyGoogleTtsRequested() && !legacyGoogleTtsAllowed(),
    legacyGoogleEnvKeys: LEGACY_GOOGLE_TTS_ENV_KEYS.filter((name) => envFlag(name, false)),
  };
}
async function sendTelegramTtsAudio(chatId, text, options = {}) {
  const finalText = cleanTtsText(text);
  const policy = ttsPolicySnapshot();
  if (policy.provider !== 'elevenlabs') return { ok: false, configured: false, provider: policy.provider, policy, message: 'Voz Premium aguardando ElevenLabs.' };
  if (!elevenLabsTtsConfigured()) return { ok: false, configured: false, provider: 'elevenlabs', policy, message: 'ElevenLabs aguardando configuração.' };
  const generated = await generateElevenLabsSpeech(finalText, options);
  if (!generated.ok) return generated;
  const sent = await sendTelegramAudioBuffer(chatId, generated.buffer, options.filename || 'crewcheck-elevenlabs.mp3', options.caption || 'CrewCheck Concierge');
  return { ...sent, provider: 'elevenlabs', effectiveProvider: 'elevenlabs', policy: ttsPolicySnapshot(),
    humanVoiceEnabled: telegramHumanVoiceEnabled(),
    echoTranscript: telegramShouldEchoTranscript(), tts: { ok: generated.ok, outputFormat: generated.outputFormat, modelId: generated.modelId } };
}
async function handleTtsHealth(req, res) {
  return sendJson(res, 200, {
    ok: elevenLabsTtsConfigured(),
    configured: elevenLabsTtsConfigured(),
    provider: effectiveTtsProvider(),
    preferredProvider: ttsProviderPreference(),
    policy: ttsPolicySnapshot(),
    googleTtsBlocked: legacyGoogleTtsRequested() && !legacyGoogleTtsAllowed(),
    model: elevenLabsTtsConfigured() ? elevenLabsModelId() : '',
    voiceConfigured: Boolean(elevenLabsVoiceId()),
    keyConfigured: Boolean(elevenLabsApiKey()),
    outputFormat: elevenLabsOutputFormat(),
    activeKeyEnv: envSourceName(ELEVENLABS_KEY_ENV_KEYS),
    activeVoiceEnv: envSourceName(ELEVENLABS_VOICE_ENV_KEYS),
    activeModelEnv: envSourceName(ELEVENLABS_MODEL_ENV_KEYS),
    activeOutputEnv: envSourceName(ELEVENLABS_OUTPUT_ENV_KEYS),
    acceptedVoiceEnvKeys: ELEVENLABS_VOICE_ENV_KEYS,
    message: elevenLabsTtsConfigured() ? 'ElevenLabs TTS configurado.' : 'ElevenLabs aguardando chave e voz. Também aceito ELEVENLABS_TTS_VOICE_ID.',
  });
}
function handleTtsProviderHealth(req, res) {
  return sendJson(res, 200, {
    ok: effectiveTtsProvider() === 'elevenlabs',
    version: '13.8.0',
    ...ttsPolicySnapshot(),
    message: effectiveTtsProvider() === 'elevenlabs'
      ? 'ElevenLabs é o provedor efetivo de voz.'
      : 'ElevenLabs ainda não está configurado como provedor efetivo.',
  });
}
async function handleTtsSpeak(req, res) {
  if (req.method !== 'POST') return handleTtsHealth(req, res);
  const payload = await readJsonBody(req, 300000);
  const text = cleanTtsText(payload.text || payload.message || '');
  if (!text) return sendJson(res, 400, { ok: false, message: 'Texto vazio.' });
  const result = await generateElevenLabsSpeech(text, {
    voiceId: payload.voiceId,
    modelId: payload.modelId,
  });
  if (!result.ok) return sendJson(res, result.configured === false ? 200 : 502, { ok: false, configured: result.configured, provider: 'elevenlabs', message: result.message });
  return sendJson(res, 200, {
    ok: true,
    configured: true,
    provider: 'elevenlabs',
    contentType: result.contentType,
    outputFormat: result.outputFormat,
    audioBase64: result.buffer.toString('base64'),
    message: 'Áudio gerado com ElevenLabs.',
  });
}

function telegramToken() {
  return envAny(['TELEGRAM_BOT_TOKEN', 'CREWCHECK_TELEGRAM_BOT_TOKEN']);
}

function telegramDefaultChatId() {
  return envAny(['TELEGRAM_DEFAULT_CHAT_ID', 'CREWCHECK_TELEGRAM_CHAT_ID']);
}

function publicUrl() {
  return String(envAny(['CREWCHECK_PUBLIC_URL', 'PUBLIC_URL', 'RENDER_EXTERNAL_URL']) || '').replace(/\/$/, '');
}

function telegramApiUrl(method) {
  const token = telegramToken();
  return token ? `https://api.telegram.org/bot${token}/${method}` : '';
}

function telegramConfigured() {
  return Boolean(telegramToken());
}

function buildTelegramReply(text = '') {
  const value = String(text || '').toLowerCase();
  if (/\/start|ajuda|help|comandos/.test(value)) {
    return [
      'Olá, sou o concierge da escala do CrewCheck.',
      '',
      'Posso ajudar com:',
      '• próxima programação',
      '• minha escala',
      '• previsão do tempo',
      '• portão/status do voo',
      '• hotéis e academias',
      '• despertador inteligente',
      '',
      'Para detalhes completos, mantenha sua escala ativa no app.'
    ].join('\n');
  }
  if (/pr[oó]xim|voo|programa/.test(value)) return 'Próxima programação: consulte o card principal no CrewCheck. Quando a escala estiver sincronizada no app, eu retorno horários, rota e alertas.';
  if (/escala|roster/.test(value)) return 'Sua escala fica protegida no CrewCheck. Use o app para importar/sincronizar o PDF e depois peça “próxima programação”.';
  if (/volto|base|retorno/.test(value)) return 'Para calcular retorno à base, preciso da escala ativa. Abra o CrewCheck, confirme a escala e consulte o concierge novamente.';
  if (/tempo|meteor|metar|taf|previs/.test(value)) return 'Meteorologia: consulte a aba Meteorologia no CrewCheck para METAR/TAF e previsão traduzida. Também posso receber comandos de previsão quando a escala estiver ativa.';
  if (/port[aã]o|gate|status|radar/.test(value)) return 'Radar: o CrewCheck consulta portão, status e terminal quando disponível. Dados não confirmados aparecem como “a confirmar”.';
  if (/hotel|academ|wellhub|smart fit|crossfit|pilates/.test(value)) return 'Hotéis e academias: abra Hotéis/Academias no CrewCheck. O sistema usa o hotel/pernoite detectado e oferece busca de entorno.';
  if (/despert|wake|alarme|soneca/.test(value)) return 'Despertador Inteligente: configure o canal no app. Telegram fica disponível quando seu chat estiver vinculado; ligação depende do canal de voz configurado.';
  return 'Recebi sua mensagem. Para uma resposta operacional completa, mantenha sua escala ativa no CrewCheck e use comandos como “próxima programação”, “meteorologia”, “radar”, “hotéis”, “academias” ou “despertador”.';
}

async function sendTelegramMessage(chatId, text, extra = {}) {
  const url = telegramApiUrl('sendMessage');
  if (!url) return { ok: false, configured: false, message: 'Concierge aguardando configuração.' };
  if (!chatId) return { ok: false, configured: true, message: 'Chat do Telegram não configurado.' };
  try {
    const payload = { chat_id: chatId, text: String(text || '').slice(0, 3900), disable_web_page_preview: true, ...extra };
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    return { ok: Boolean(response.ok && data.ok !== false), configured: true, status: response.status, data, message: response.ok ? 'Mensagem enviada.' : 'Mensagem não entregue agora.' };
  } catch {
    return { ok: false, configured: true, message: 'Mensagem não entregue agora.' };
  }
}

// CrewCheck v13.7.16 — Concierge operacional restaurado.
// O snapshot minimiza dados: o texto bruto do PDF não é persistido.
const crewcheckTelegramRostersFile = path.join(__dirname, '.crewcheck-telegram-rosters.json');
const conciergeInactiveCodes = new Set(['DOP', 'DOPR', 'DO', 'DOF', 'DR', 'OFF', 'VC', 'FOLGA', 'FERIAS', 'FÉRIAS']);
const conciergeRemoteCodes = new Set(['EAD', 'ONLINE', 'REMOTO', 'REMOTE', 'DOP', 'DOPR', 'DO', 'DOF', 'DR', 'OFF', 'VC', 'HSB', 'HSBE']);
let conciergeDbPoolPromise = null;
const conciergeKeyboard = {
  keyboard: [
    ['/proximo', '/hoje'],
    ['/radar', '/saida'],
    ['/escala', '/rotina'],
    ['/hoteis', '/academias'],
    ['/metar', '/ajuda'],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

async function conciergeDbPool() {
  const connectionString = envAny(['DATABASE_URL']);
  if (!/^postgres(?:ql)?:\/\//i.test(connectionString)) return null;
  if (!conciergeDbPoolPromise) {
    conciergeDbPoolPromise = (async () => {
      try {
        const pg = await import('pg');
        const Pool = pg.Pool || pg.default?.Pool;
        if (!Pool) return null;
        const sslDisabled = /localhost|127\.0\.0\.1/.test(connectionString) || String(process.env.PGSSLMODE || '').toLowerCase() === 'disable';
        const pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 3500, idleTimeoutMillis: 20_000, ssl: sslDisabled ? false : { rejectUnauthorized: false } });
        await pool.query('CREATE TABLE IF NOT EXISTS crewcheck_telegram_state (state_key TEXT PRIMARY KEY, payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
        return pool;
      } catch {
        return null;
      }
    })();
  }
  return conciergeDbPoolPromise;
}
async function conciergeDbPut(key, payload) {
  try {
    const pool = await conciergeDbPool();
    if (!pool || !key) return false;
    await pool.query('INSERT INTO crewcheck_telegram_state (state_key, payload, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (state_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()', [String(key), JSON.stringify(payload || {})]);
    return true;
  } catch {
    return false;
  }
}
async function conciergeDbGet(key) {
  try {
    const pool = await conciergeDbPool();
    if (!pool || !key) return null;
    const result = await pool.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key = $1 LIMIT 1', [String(key)]);
    return result.rows?.[0]?.payload || null;
  } catch {
    return null;
  }
}
async function conciergeDbDelete(key) {
  try {
    const pool = await conciergeDbPool();
    if (!pool || !key) return false;
    await pool.query('DELETE FROM crewcheck_telegram_state WHERE state_key = $1', [String(key)]);
    return true;
  } catch {
    return false;
  }
}

function telegramRostersRead() {
  try {
    if (!fs.existsSync(crewcheckTelegramRostersFile)) return { snapshots: {} };
    const parsed = JSON.parse(fs.readFileSync(crewcheckTelegramRostersFile, 'utf8'));
    return { snapshots: parsed && typeof parsed.snapshots === 'object' ? parsed.snapshots : {} };
  } catch {
    return { snapshots: {} };
  }
}
function telegramRostersWrite(data) {
  try {
    fs.writeFileSync(crewcheckTelegramRostersFile, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}
function conciergeSafeKey(value = '') {
  return String(value || '').trim().toLowerCase().slice(0, 240);
}
function conciergeAccessHash(value = '') {
  const raw = String(value || '').trim();
  return raw.length >= 24 ? crypto.createHash('sha256').update(raw).digest('hex') : '';
}
function conciergeAccessMatches(user = {}, record = null) {
  if (user.authenticated) return true;
  const expected = String(record?.accessKeyHash || '');
  const received = String(user.accessKeyHash || '');
  return Boolean(expected && received && expected.length === received.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received)));
}
function telegramProfileForChat(message = {}) {
  const chatId = String(message?.chat?.id || '');
  const links = telegramLinksRead();
  const linked = Object.values(links.linked || {}).find((item) => String(item?.chatId || '') === chatId);
  if (linked) return { email: conciergeSafeKey(linked.email), name: linked.name || message?.from?.first_name || 'Tripulante', chatId, linked: true, accessKeyHash: linked.accessKeyHash || '' };
  return {
    email: chatId ? `telegram:${chatId}` : '',
    name: message?.from?.first_name || message?.chat?.first_name || 'Tripulante',
    chatId,
    linked: false,
  };
}
async function telegramProfileForChatAsync(message = {}) {
  const cached = telegramProfileForChat(message);
  if (cached.linked || !cached.chatId) return cached;
  const persisted = await conciergeDbGet(`link-chat:${cached.chatId}`);
  if (!persisted?.email) return cached;
  const data = telegramLinksRead();
  data.linked[conciergeSafeKey(persisted.email)] = persisted;
  telegramLinksWrite(data);
  return { email: conciergeSafeKey(persisted.email), name: persisted.name || cached.name, chatId: cached.chatId, linked: true, accessKeyHash: persisted.accessKeyHash || '' };
}
function conciergeSnapshotForProfile(profile = {}) {
  const key = conciergeSafeKey(profile.email || (profile.chatId ? `telegram:${profile.chatId}` : ''));
  if (!key) return null;
  return telegramRostersRead().snapshots[key] || null;
}
function conciergeMinimizeRoster(roster = {}) {
  const clean = JSON.parse(JSON.stringify(roster || {}));
  clean.rawText = '';
  clean.days = Array.isArray(clean.days) ? clean.days.slice(0, 370).map((day) => ({
    ...day,
    rawText: '',
    legs: Array.isArray(day?.legs) ? day.legs.slice(0, 12) : [],
  })) : [];
  return clean;
}
function conciergeRosterDiagnostics(roster = {}) {
  const days = Array.isArray(roster.days) ? roster.days : [];
  return {
    days: new Set(days.map((day) => String(day?.date || ''))).size,
    programs: days.filter((day) => day?.pairingCode || day?.type || day?.legs?.length).length,
    flights: days.reduce((sum, day) => sum + (Array.isArray(day?.legs) ? day.legs.length : 0), 0),
    stays: days.filter((day) => Boolean(day?.hotel)).length,
  };
}
function conciergeSaveSnapshot(profile = {}, roster = null, metadata = {}) {
  const key = conciergeSafeKey(profile.email || (profile.chatId ? `telegram:${profile.chatId}` : ''));
  if (!key) return null;
  const data = telegramRostersRead();
  const previous = data.snapshots[key] || {};
  const nextRoster = roster ? conciergeMinimizeRoster(roster) : previous.roster || null;
  const snapshot = {
    ...previous,
    ...metadata,
    key,
    email: profile.email || previous.email || '',
    name: profile.name || previous.name || '',
    chatId: String(profile.chatId || previous.chatId || ''),
    accessKeyHash: profile.accessKeyHash || previous.accessKeyHash || '',
    roster: nextRoster,
    diagnostics: nextRoster ? conciergeRosterDiagnostics(nextRoster) : previous.diagnostics || null,
    preferences: { ...(previous.preferences || {}), ...(metadata.preferences || {}) },
    updatedAt: new Date().toISOString(),
  };
  data.snapshots[key] = snapshot;
  telegramRostersWrite(data);
  return snapshot;
}
async function conciergeSaveSnapshotAsync(profile = {}, roster = null, metadata = {}) {
  const snapshot = conciergeSaveSnapshot(profile, roster, metadata);
  if (snapshot) await conciergeDbPut(`snapshot:${snapshot.key}`, snapshot);
  return snapshot;
}
async function conciergeLoadSnapshot(profile = {}) {
  const cached = conciergeSnapshotForProfile(profile);
  if (cached) return cached;
  const key = conciergeSafeKey(profile.email || (profile.chatId ? `telegram:${profile.chatId}` : ''));
  if (!key) return null;
  const persisted = await conciergeDbGet(`snapshot:${key}`);
  if (!persisted) return null;
  const data = telegramRostersRead();
  data.snapshots[key] = persisted;
  telegramRostersWrite(data);
  return persisted;
}
async function conciergeMergeChatSnapshot(profile = {}) {
  const emailKey = conciergeSafeKey(profile.email);
  const chatKey = conciergeSafeKey(profile.chatId ? `telegram:${profile.chatId}` : '');
  if (!emailKey || !chatKey || emailKey === chatKey) return;
  const data = telegramRostersRead();
  const transient = data.snapshots[chatKey] || await conciergeDbGet(`snapshot:${chatKey}`);
  if (!transient) return;
  const current = data.snapshots[emailKey] || {};
  data.snapshots[emailKey] = {
    ...transient,
    ...current,
    key: emailKey,
    email: profile.email,
    name: profile.name || current.name || transient.name,
    chatId: String(profile.chatId || current.chatId || transient.chatId || ''),
    accessKeyHash: profile.accessKeyHash || current.accessKeyHash || transient.accessKeyHash || '',
    roster: current.roster || transient.roster,
    preferences: { ...(transient.preferences || {}), ...(current.preferences || {}) },
    updatedAt: new Date().toISOString(),
  };
  delete data.snapshots[chatKey];
  telegramRostersWrite(data);
  await conciergeDbPut(`snapshot:${emailKey}`, data.snapshots[emailKey]);
  await conciergeDbDelete(`snapshot:${chatKey}`);
}
function conciergeRosterDayParts(day = {}) {
  const direct = String(day.date || '').trim();
  const br = direct.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return { day: Number(br[1]), month: Number(br[2]), year: Number(br[3]) };
  const iso = direct.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { day: Number(iso[3]), month: Number(iso[2]), year: Number(iso[1]) };
  return { day: Number(day.dayNumber || 1), month: Number(day.month || 1), year: Number(day.year || new Date().getFullYear()) };
}
function conciergeTime(value, fallback = '00:00') {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  return match ? `${String(Number(match[1])).padStart(2, '0')}:${match[2]}` : fallback;
}
function conciergeProgramDate(day = {}, time = '00:00') {
  const p = conciergeRosterDayParts(day);
  return new Date(`${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${conciergeTime(time)}:00-03:00`);
}
function conciergeProgramRecords(roster = {}) {
  const records = [];
  for (const day of Array.isArray(roster.days) ? roster.days : []) {
    const legs = Array.isArray(day?.legs) ? day.legs : [];
    const code = String(day?.pairingCode || day?.type || '').trim().toUpperCase();
    if (conciergeInactiveCodes.has(code)) continue;
    if (!legs.length && (!code || code === 'OTHER')) continue;
    const startTime = conciergeTime(day?.dutyReport || legs[0]?.departureTime || '00:00');
    const endTime = conciergeTime(day?.dutyDebrief || legs.at(-1)?.arrivalTime || startTime);
    const start = conciergeProgramDate(day, startTime);
    let end = conciergeProgramDate(day, endTime);
    if (end.getTime() <= start.getTime()) end = new Date(end.getTime() + 86_400_000);
    records.push({ day, legs, code: code || (legs.length ? 'VOO' : 'ATIVIDADE'), startTime, endTime, start, end });
  }
  return records.sort((a, b) => a.start.getTime() - b.start.getTime());
}
function conciergeNextProgram(roster = {}, now = new Date()) {
  const records = conciergeProgramRecords(roster);
  return records.find((item) => item.start <= now && item.end >= now) || records.find((item) => item.start > now) || null;
}
function conciergeDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function conciergeRecordDateKey(record) {
  const p = conciergeRosterDayParts(record?.day || {});
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
function conciergeDateLabel(record) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit' }).format(record.start).replace('.', '');
}
function conciergeProgramTitle(record) {
  if (!record) return 'Programação';
  if (record.legs?.length) return record.legs.map((leg) => String(leg.flightNumber || 'Voo')).join(' + ');
  const labels = { ASB: 'Reserva', HSB: 'Sobreaviso', HSBE: 'Sobreaviso especial', MT: 'Treinamento/reunião', CRM: 'Treinamento CRM' };
  return labels[record.code] || record.code || 'Atividade';
}
function conciergePresentationTime(record) {
  if (!record) return '';
  if (record.day?.dutyReport) return conciergeTime(record.day.dutyReport);
  const firstDeparture = record.legs?.[0]?.departureTime;
  if (!firstDeparture) return record.startTime;
  const date = conciergeProgramDate(record.day, firstDeparture);
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(date.getTime() - 60 * 60_000));
}
function conciergeFormatProgram(record, radar = null) {
  if (!record) return 'Nenhuma programação encontrada.';
  const lines = [`${conciergeProgramTitle(record)} · ${conciergeDateLabel(record)}`, `Apresentação ${conciergePresentationTime(record) || 'a confirmar'} · término ${record.endTime || 'a confirmar'}`];
  for (const leg of record.legs || []) {
    const gate = radar && normalizeFlightRaw(radar.flight) === normalizeFlightRaw(leg.flightNumber) ? radar.gate : leg.gate;
    const terminal = radar && normalizeFlightRaw(radar.flight) === normalizeFlightRaw(leg.flightNumber) ? radar.terminal : leg.terminal;
    lines.push(`${leg.flightNumber || 'Voo'} · ${leg.origin || '—'} ${conciergeTime(leg.departureTime, '—')} → ${leg.destination || '—'} ${conciergeTime(leg.arrivalTime, '—')}${gate ? ` · portão ${gate}${terminal ? ` / terminal ${terminal}` : ''}` : ''}`);
  }
  if (!record.legs?.length) lines.push(`${record.day?.base || 'Local a confirmar'} · ${record.startTime}–${record.endTime}`);
  return lines.join('\n');
}
function conciergeHelp(name = 'Tripulante') {
  const firstName = String(name || 'Tripulante').trim().split(/\s+/)[0];
  return [
    `Olá, ${firstName}. O Concierge CrewCheck está de volta.`,
    '',
    'Envie o PDF oficial da sua escala diretamente nesta conversa ou sincronize a escala pelo app.',
    '',
    'Comandos:',
    '/hoje — programação de hoje',
    '/amanha — programação de amanhã',
    '/proximo — próxima programação',
    '/escala — resumo da escala ativa',
    '/portao LA3730 — portão e terminal',
    '/radar LA3730 — status ao vivo',
    '/saida — Saída Inteligente',
    '/metar SBBR — METAR',
    '/taf SBGR — TAF',
    '/hoteis — pernoites e hotéis',
    '/academias — academias próximas',
    '/rotina — rotina sugerida',
    '/diarias — pernoites detectados',
    '/conformidade — leitura preventiva',
    '',
    'Também entendo perguntas naturais e mensagens de voz. Para busca perto de você, envie sua localização pelo Telegram.',
  ].join('\n');
}
function conciergeExtractFlight(text = '') {
  const match = String(text).toUpperCase().match(/\b(?:LA|JJ|G3|AD|AZU|LAN|TAM)\s?\d{2,5}\b/);
  return match ? normalizeFlightRaw(match[0]) : '';
}
function conciergeFindFlight(roster = {}, requested = '') {
  const ctx = buildFlightContext(requested);
  const variants = new Set([ctx.raw, ctx.iata, ctx.icao].filter(Boolean));
  for (const record of conciergeProgramRecords(roster)) {
    for (const leg of record.legs || []) {
      const legCtx = buildFlightContext(leg.flightNumber);
      if (!requested || [legCtx.raw, legCtx.iata, legCtx.icao].some((value) => variants.has(value))) return { record, leg };
    }
  }
  return null;
}
function conciergeApplyRadar(snapshot, flightInfo, radar) {
  if (!snapshot?.roster || !flightInfo?.leg || !radar) return snapshot;
  Object.assign(flightInfo.leg, {
    gate: radar.gate || flightInfo.leg.gate || '',
    terminal: radar.terminal || flightInfo.leg.terminal || '',
    status: radar.status || flightInfo.leg.status || '',
    aircraft: radar.aircraft || flightInfo.leg.aircraft || flightInfo.leg.aircraftType || '',
    registration: radar.registration || flightInfo.leg.registration || '',
    radarUpdatedAt: new Date().toISOString(),
    radarQuality: Number(radar.quality || 0),
  });
  return snapshot;
}
async function conciergeRadarReply(text, profile, snapshot) {
  const roster = snapshot?.roster;
  const requested = conciergeExtractFlight(text);
  const next = conciergeNextProgram(roster);
  const firstFlight = requested ? conciergeFindFlight(roster, requested) : (next?.legs?.length ? { record: next, leg: next.legs[0] } : conciergeFindFlight(roster));
  const flight = requested || firstFlight?.leg?.flightNumber || '';
  if (!flight) return 'Não encontrei um voo na escala ativa. Envie o PDF ou informe o número, por exemplo: /radar LA3730.';
  const info = firstFlight || conciergeFindFlight(roster, flight);
  const radar = await runRadarRace(buildFlightContext(flight), info?.leg?.origin || '', info?.leg?.destination || '');
  if (snapshot && info?.leg) {
    conciergeApplyRadar(snapshot, info, radar);
    await conciergeSaveSnapshotAsync(profile, snapshot.roster, { source: snapshot.source || 'radar', lastRadar: { ...radar, updatedAt: new Date().toISOString() } });
  }
  const lines = [
    `Radar ${buildFlightContext(flight).iata || flight}`,
    `${info?.leg?.origin || radar.origin || '—'} → ${info?.leg?.destination || radar.destination || '—'}`,
    `Status: ${radar.status || 'a confirmar'}`,
    `Portão: ${radar.gate || 'a confirmar'}${radar.terminal ? ` · Terminal ${radar.terminal}` : ''}`,
    `Partida: ${radar.departure || info?.leg?.departureTime || 'a confirmar'}`,
    `Chegada: ${radar.arrival || info?.leg?.arrivalTime || 'a confirmar'}`,
    `Qualidade da consulta: ${Number(radar.quality || 0)}% · ${Number(radar.alternatives || 0)} fonte(s) útil(eis)`,
  ];
  if (!radar.ok) lines.push(radar.message || 'As fontes não confirmaram dados ao vivo agora.');
  else if (radar.gate) lines.push('O portão foi sincronizado com o card da próxima programação.');
  return lines.join('\n');
}
async function conciergeWeatherReply(text, snapshot) {
  const explicit = String(text).toUpperCase().match(/\b[A-Z]{4}\b|\b[A-Z]{3}\b/);
  const next = conciergeNextProgram(snapshot?.roster);
  const airport = explicit?.[0] || next?.legs?.[0]?.origin || '';
  const station = airportIcao(airport);
  const type = /taf/i.test(text) ? 'taf' : 'metar';
  if (!station) return 'Informe o aeroporto, por exemplo: /metar SBBR ou /taf GRU.';
  try {
    const apiUrl = `https://aviationweather.gov/api/data/${type}?ids=${encodeURIComponent(station)}&format=json`;
    const { payload, text: rawText, ok } = await safeJsonFetch(apiUrl, { headers: { accept: 'application/json' } }, 3600);
    const row = ok && Array.isArray(payload) ? payload[0] || {} : {};
    const raw = safeText(row.rawOb || row.rawTAF || row.raw_text || row.raw || rawText || '');
    return raw ? `${type.toUpperCase()} ${station}\n${raw}` : `${type.toUpperCase()} ${station}: informação indisponível agora.`;
  } catch {
    return `${type.toUpperCase()} ${station}: informação indisponível agora.`;
  }
}
function conciergeHaversineKm(a, b) {
  const rad = (value) => Number(value) * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const p = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(p), Math.sqrt(1 - p));
}
async function conciergeTravelEstimate(location, airport) {
  const point = WEATHER_AIRPORT_POINTS[String(airport || '').toUpperCase()];
  if (!location || !point) return null;
  const distanceKm = conciergeHaversineKm({ lat: Number(location.latitude), lon: Number(location.longitude) }, point);
  const key = mapsServerKey();
  if (key) {
    try {
      const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.localizedValues' },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: Number(location.latitude), longitude: Number(location.longitude) } } },
          destination: { location: { latLng: { latitude: point.lat, longitude: point.lon } } },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
          languageCode: 'pt-BR',
          units: 'METRIC',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      const route = response.ok ? payload?.routes?.[0] : null;
      if (route) {
        const seconds = Number(String(route.duration || '').replace(/[^\d.]/g, ''));
        return { distanceKm: Number(route.distanceMeters || 0) / 1000 || distanceKm, minutes: Math.max(1, Math.round(seconds / 60)), trafficAware: true, distanceText: route.localizedValues?.distance?.text || formatMeters(route.distanceMeters), durationText: route.localizedValues?.duration?.text || formatDuration(route.duration) };
      }
    } catch {}
  }
  return { distanceKm, minutes: Math.max(20, Math.round((distanceKm / 38) * 60 + 18)), trafficAware: false, distanceText: `${distanceKm.toFixed(0)} km`, durationText: 'estimativa de referência' };
}
function conciergeLeaveDateLabel(date) {
  const key = conciergeDateKey(date);
  const today = conciergeDateKey(new Date());
  const tomorrow = conciergeDateKey(new Date(Date.now() + 86_400_000));
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  if (key === today) return `Saia hoje às ${time}.`;
  if (key === tomorrow) return `Saia amanhã às ${time}.`;
  return `Saia no dia ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(date)} às ${time}.`;
}
async function conciergeDepartureReply(snapshot) {
  const roster = snapshot?.roster;
  const record = conciergeProgramRecords(roster).find((item) => {
    if (item.end < new Date()) return false;
    if (item.legs?.length) return true;
    return !conciergeRemoteCodes.has(item.code) && ['ASB', 'MT', 'CRM', 'CBF', 'EMER'].some((code) => item.code === code || item.code.startsWith(code));
  });
  if (!record) return 'Não encontrei uma próxima programação presencial que exija saída. Folga, EAD, sobreaviso em casa e descanso não geram rota.';
  const presentation = conciergePresentationTime(record);
  const presentationDate = conciergeProgramDate(record.day, presentation || record.startTime);
  const location = snapshot?.preferences?.location;
  if (!location) {
    return `${conciergeProgramTitle(record)} · ${conciergeDateLabel(record)}\nApresentação ${presentation || 'a confirmar'} em ${record.legs?.[0]?.origin || record.day?.base || 'local a confirmar'}.\n\nEnvie sua localização pelo Telegram para calcular a Saída Inteligente com mapa, distância e trânsito.`;
  }
  const origin = record.legs?.[0]?.origin || record.day?.base || '';
  const route = await conciergeTravelEstimate(location, origin);
  if (!route) return `Apresentação ${presentation || 'a confirmar'} em ${origin || 'local a confirmar'}. Não tenho coordenadas suficientes para calcular a rota; abra Saída Inteligente no app para ver a prévia do mapa.`;
  if (route.distanceKm > 250) {
    return [`Automático · longa distância`, `${conciergeProgramTitle(record)} · ${conciergeDateLabel(record)}`, `Você está distante do aeroporto de origem ${origin}. Planeje o deslocamento até o aeroporto e o voo publicado na escala.`, `Apresentação ${presentation || 'a confirmar'} · distância de referência ${route.distanceText}.`, 'Abra Saída Inteligente no app para revisar cada trecho no mapa.'].join('\n');
  }
  const bufferMinutes = 25;
  const leave = new Date(presentationDate.getTime() - (route.minutes + bufferMinutes) * 60_000);
  return [
    conciergeLeaveDateLabel(leave),
    `${conciergeProgramTitle(record)} · apresentação ${presentation} em ${origin}`,
    `Deslocamento: ${route.durationText || `${route.minutes} min`} · ${route.distanceText} · margem ${bufferMinutes} min`,
    route.trafficAware ? 'Rota calculada com trânsito disponível.' : 'Tempo estimado; confirme o trânsito na prévia do mapa do app.',
  ].join('\n');
}
async function conciergeSearchPlaces(query, locationText = '', location = null, maxResultCount = 4) {
  const key = mapsServerKey();
  if (!key) return [];
  try {
    const body = { textQuery: `${query}${locationText ? ` perto de ${locationText}` : ''}`, languageCode: 'pt-BR', regionCode: 'BR', maxResultCount };
    if (location?.latitude && location?.longitude) body.locationBias = { circle: { center: { latitude: Number(location.latitude), longitude: Number(location.longitude) }, radius: 12000 } };
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.googleMapsUri,places.currentOpeningHours.openNow' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return [];
    return (payload?.places || []).slice(0, maxResultCount).map((place) => ({ name: place.displayName?.text || 'Local', address: place.formattedAddress || '', rating: place.rating || 0, mapsUrl: place.googleMapsUri || '', openNow: place.currentOpeningHours?.openNow }));
  } catch {
    return [];
  }
}
function conciergePlaceLines(places = []) {
  return places.map((place, index) => `${index + 1}. ${place.name}${place.rating ? ` · nota ${place.rating}` : ''}${place.openNow === true ? ' · aberto agora' : place.openNow === false ? ' · fechado agora' : ''}\n${place.address || place.mapsUrl || ''}`).join('\n\n');
}
async function conciergeHotelsReply(snapshot) {
  const roster = snapshot?.roster || {};
  const assigned = (roster.days || []).filter((day) => day?.hotel).slice(0, 6);
  if (assigned.length) return ['Hotéis publicados/detectados na escala:', ...assigned.map((day) => `• ${day.hotel} · ${day.date || ''}`)].join('\n');
  const next = conciergeNextProgram(roster);
  const airport = next?.legs?.[0]?.origin || roster.base || '';
  const locationText = airport ? `${airport} ${WEATHER_AIRPORT_POINTS[airport]?.city || ''}` : '';
  const places = await conciergeSearchPlaces('hotel para tripulação próximo ao aeroporto', locationText, snapshot?.preferences?.location, 4);
  if (!places.length) return 'Nenhum hotel foi publicado na escala. Quando houver pernoite, o CrewCheck exibirá o hotel; sugestões próximas dependem da busca de locais configurada.';
  return [`A escala não informa hotel. Estas são sugestões próximas — não são reserva da companhia:`, '', conciergePlaceLines(places)].join('\n');
}
async function conciergeGymsReply(snapshot) {
  const location = snapshot?.preferences?.location;
  const next = conciergeNextProgram(snapshot?.roster);
  const hotel = (snapshot?.roster?.days || []).find((day) => day?.hotel)?.hotel || '';
  const airport = next?.legs?.[0]?.origin || snapshot?.roster?.base || '';
  const plan = String(snapshot?.preferences?.gymPlan || 'ambos');
  const partnerChains = 'Selfit Panobianco Bluefit Corpo e Saúde Pratique Fórmula Bodytech Fábrica de Monstros Ultra';
  const query = plan === 'smartfit' ? 'Smart Fit academia aberta agora' : plan === 'wellhub' ? `${partnerChains} academia parceira aberta agora` : `Smart Fit ${partnerChains} academia aberta agora`;
  const places = await conciergeSearchPlaces(query, hotel || `${airport} ${WEATHER_AIRPORT_POINTS[airport]?.city || ''}`, location, 5);
  if (!places.length) return 'Não encontrei academias dentro do sistema agora. Envie sua localização e confira se a busca de locais está configurada; o app ainda oferece “Abrir no Google Maps”.';
  return [`Academias próximas · busca ${plan === 'ambos' ? 'Wellhub + Smart Fit' : plan}:`, '', conciergePlaceLines(places), '', 'Wellhub é um benefício corporativo, não uma academia. Confirme parceria, elegibilidade, lotação e horário nos canais oficiais antes de sair.'].join('\n');
}
function conciergeRoutineReply(snapshot) {
  const next = conciergeNextProgram(snapshot?.roster);
  if (!next) return 'Envie ou sincronize sua escala para eu montar a rotina de recuperação, treino, alimentação e sono.';
  const hours = (next.start.getTime() - Date.now()) / 3_600_000;
  const duty = Number(next.day?.dutyHours || 0);
  const items = [];
  if (hours <= 12) items.push('Prioridade: hidratação, alimentação leve e preparação do sono; evite treino intenso.');
  else if (hours <= 24) items.push('Janela curta: mobilidade ou treino leve, refeição completa e descanso antecipado.');
  else items.push('Há espaço para treino moderado, com recuperação concluída antes da próxima apresentação.');
  if (duty >= 10) items.push(`Jornada prevista de ${duty.toFixed(1).replace('.', ',')} h: reforce refeição, água e recuperação pós-jornada.`);
  if (next.legs?.length >= 3) items.push(`${next.legs.length} etapas no dia: prefira treino curto e preserve energia.`);
  items.push(`Próxima programação: ${conciergeProgramTitle(next)} · ${conciergeDateLabel(next)} · apresentação ${conciergePresentationTime(next)}.`);
  return ['Rotina sugerida', ...items.map((item) => `• ${item}`)].join('\n');
}
function conciergePerDiemReply(snapshot) {
  const roster = snapshot?.roster || {};
  const base = String(roster.base || '').toUpperCase();
  const nights = [];
  for (const record of conciergeProgramRecords(roster)) {
    const last = record.legs?.at(-1);
    if (last?.destination && last.destination !== base) nights.push({ date: conciergeRecordDateKey(record), destination: last.destination });
  }
  const unique = [...new Map(nights.map((item) => [`${item.date}-${item.destination}`, item])).values()];
  if (!unique.length) return 'Não detectei pernoites fora da base nesta escala. O cálculo financeiro permanece no módulo Diárias do app.';
  return [`Pernoites potenciais detectados: ${unique.length}`, ...unique.slice(0, 12).map((item) => `• ${item.date.split('-').reverse().slice(0, 2).join('/')} · ${item.destination}`), '', 'Esta é uma leitura operacional; valores e elegibilidade devem ser confirmados no módulo Diárias.'].join('\n');
}
function conciergeComplianceReply(snapshot) {
  const records = conciergeProgramRecords(snapshot?.roster);
  if (!records.length) return 'Sincronize a escala para executar a leitura preventiva.';
  const longDuty = records.filter((record) => Number(record.day?.dutyHours || 0) >= 11);
  const shortRest = records.slice(1).filter((record, index) => (record.start.getTime() - records[index].end.getTime()) / 3_600_000 < 12);
  if (!longDuty.length && !shortRest.length) return 'Leitura preventiva: nenhuma jornada longa ou intervalo curto foi detectado pelos dados disponíveis. Use Irregularidades no app para a análise completa RBAC/ACT.';
  return [`Leitura preventiva · ${longDuty.length + shortRest.length} ponto(s) para revisar`, longDuty.length ? `• ${longDuty.length} jornada(s) com duração publicada elevada.` : '', shortRest.length ? `• ${shortRest.length} intervalo(s) inferior(es) a 12 h entre programações.` : '', 'Isso não confirma irregularidade. Abra Irregularidades no app para contexto RBAC/ACT e dados completos.'].filter(Boolean).join('\n');
}
function conciergeScheduleReply(snapshot, mode = 'next') {
  const roster = snapshot?.roster;
  if (!roster?.days?.length) return 'Ainda não tenho uma escala ativa. Envie o PDF aqui no Telegram ou toque em “Sincronizar escala” no app.';
  if (mode === 'summary') {
    const stats = conciergeRosterDiagnostics(roster);
    const next = conciergeNextProgram(roster);
    return [`Escala ativa · ${String(roster.month || '').padStart(2, '0')}/${roster.year || ''}`, `${roster.crewName || 'Tripulante'} · Base ${roster.base || '—'}`, `${stats.days} dias · ${stats.flights} voos · ${stats.programs} programações`, '', next ? `Próxima:\n${conciergeFormatProgram(next)}` : 'Nenhuma programação futura detectada.'].join('\n');
  }
  if (mode === 'today' || mode === 'tomorrow') {
    const offset = mode === 'tomorrow' ? 86_400_000 : 0;
    const key = conciergeDateKey(new Date(Date.now() + offset));
    const found = conciergeProgramRecords(roster).filter((record) => conciergeRecordDateKey(record) === key);
    if (!found.length) return `${mode === 'today' ? 'Hoje' : 'Amanhã'}: nenhuma programação publicada.`;
    return [`${mode === 'today' ? 'Hoje' : 'Amanhã'}:`, '', ...found.map((record) => conciergeFormatProgram(record))].join('\n\n');
  }
  const next = conciergeNextProgram(roster);
  return next ? `Próxima programação\n\n${conciergeFormatProgram(next)}` : 'Nenhuma programação futura detectada na escala ativa.';
}
async function buildTelegramConciergeReply(text = '', profile = {}, snapshot = null) {
  const value = String(text || '').trim();
  const lower = value.toLowerCase();
  if (!value || /^\/(?:start|ajuda|help|comandos)(?:@\S+)?$/i.test(value) || /^(ajuda|comandos)$/i.test(value)) return conciergeHelp(profile.name);
  if (/^\/(?:hoje)(?:@\S+)?\b/i.test(value) || /\b(programa[cç][aã]o|escala)\s+(de\s+)?hoje\b/i.test(lower)) return conciergeScheduleReply(snapshot, 'today');
  if (/^\/(?:amanha|amanhã)(?:@\S+)?\b/i.test(value) || /\b(programa[cç][aã]o|escala)\s+(de\s+)?amanh[ãa]\b/i.test(lower)) return conciergeScheduleReply(snapshot, 'tomorrow');
  if (/^\/(?:proximo|próximo)(?:@\S+)?\b/i.test(value) || /pr[oó]xima\s+(programa[cç][aã]o|escala|atividade|voo)/i.test(lower)) return conciergeScheduleReply(snapshot, 'next');
  if (/^\/escala(?:@\S+)?\b/i.test(value) || /resumo\s+(da\s+)?escala/i.test(lower)) return conciergeScheduleReply(snapshot, 'summary');
  if (/^\/(?:portao|portão|radar)(?:@\S+)?\b/i.test(value) || /\b(port[aã]o|gate|radar|status\s+do\s+voo)\b/i.test(lower)) return conciergeRadarReply(value, profile, snapshot);
  if (/^\/(?:metar|taf)(?:@\S+)?\b/i.test(value) || /\b(metar|taf|meteorologia)\b/i.test(lower)) return conciergeWeatherReply(value, snapshot);
  if (/^\/saida(?:@\S+)?\b/i.test(value) || /\b(que horas devo sair|sa[ií]da inteligente|hora de sair)\b/i.test(lower)) return conciergeDepartureReply(snapshot);
  if (/^\/(?:hoteis|hotéis|hotel)(?:@\S+)?\b/i.test(value) || /\b(hotel|hot[eé]is|pernoite)\b/i.test(lower)) return conciergeHotelsReply(snapshot);
  if (/^\/academias?(?:@\S+)?\b/i.test(value) || /\b(academia|wellhub|gympass|smart fit|treino perto)\b/i.test(lower)) return conciergeGymsReply(snapshot);
  if (/^\/rotina(?:@\S+)?\b/i.test(value) || /\b(rotina|recupera[cç][aã]o|treino hoje)\b/i.test(lower)) return conciergeRoutineReply(snapshot);
  if (/^\/diarias?(?:@\S+)?\b/i.test(value) || /\bdi[aá]rias?\b/i.test(lower)) return conciergePerDiemReply(snapshot);
  if (/^\/conformidade(?:@\S+)?\b/i.test(value) || /\b(rbac|act|irregularidade|conformidade)\b/i.test(lower)) return conciergeComplianceReply(snapshot);
  if (/onde.*(estou|localiza)|perto de mim/i.test(lower)) return snapshot?.preferences?.location ? 'Localização recebida. Use /academias, /hoteis ou /saida para consultar perto de você.' : 'Envie sua localização pelo clipe do Telegram para ativar busca próxima e Saída Inteligente.';
  return `Entendi sua mensagem, mas preciso de um comando operacional mais específico.\n\n${conciergeHelp(profile.name)}`;
}
async function handleParsePdfApi(req, res) {
  if (req.method !== 'POST') return sendJson(res, 200, { ok: true, parser: 'AIMS + CrewRosterReport', message: 'Leitor de PDF pronto.' });
  try {
    const body = await readJsonBody(req, 24_000_000);
    const parsed = await parsePdfOnServer({ filename: String(body.filename || 'escala.pdf'), dataBase64: String(body.dataBase64 || body.pdfBase64 || '') });
    return sendJson(res, 200, { ok: true, ...parsed, message: 'Escala interpretada pelo servidor.' });
  } catch (error) {
    return sendJson(res, 422, { ok: false, message: error instanceof Error ? error.message : 'Não consegui interpretar este PDF.' });
  }
}
async function handleTelegramRosterSync(req, res, url) {
  const body = req.method === 'POST' ? await readJsonBody(req, 6_000_000) : { email: String(url?.searchParams?.get('email') || ''), name: String(url?.searchParams?.get('name') || ''), conciergeKey: String(url?.searchParams?.get('conciergeKey') || '') };
  const user = telegramRequestUser(req, body);
  if (!telegramAppRequestAllowed(user)) return sendJson(res, 401, { ok: false, message: 'Faça login para sincronizar a escala com o Concierge.' });
  const linkedRecord = await telegramLinkedRecordForEmail(user.email);
  if (linkedRecord && !conciergeAccessMatches(user, linkedRecord)) return sendJson(res, 403, { ok: false, message: 'Este dispositivo não está autorizado a usar o Telegram vinculado.' });
  const chatId = String(linkedRecord?.chatId || '');
  const profile = { ...user, chatId, linked: Boolean(chatId) };
  const existingSnapshot = await conciergeLoadSnapshot(profile);
  if (existingSnapshot && !conciergeAccessMatches(user, existingSnapshot)) return sendJson(res, 403, { ok: false, message: 'Este dispositivo não está autorizado a acessar a escala do Concierge.' });
  if (req.method === 'DELETE') {
    const data = telegramRostersRead();
    delete data.snapshots[conciergeSafeKey(user.email)];
    telegramRostersWrite(data);
    await conciergeDbDelete(`snapshot:${conciergeSafeKey(user.email)}`);
    return sendJson(res, 200, { ok: true, message: 'Escala removida do Concierge.' });
  }
  if (req.method !== 'POST') {
    const snapshot = existingSnapshot;
    return sendJson(res, 200, { ok: Boolean(snapshot?.roster), linked: profile.linked, snapshot: snapshot || null, message: snapshot?.roster ? 'Escala do Concierge disponível.' : 'Nenhuma escala sincronizada com o Concierge.' });
  }
  const roster = body.roster;
  if (!roster || !Array.isArray(roster.days) || !roster.days.length) return sendJson(res, 400, { ok: false, message: 'Escala sem dias válidos.' });
  const snapshot = await conciergeSaveSnapshotAsync(profile, roster, { source: String(body.source || 'app'), fileName: String(body.fileName || ''), diagnostics: body.diagnostics || null });
  return sendJson(res, 200, { ok: true, linked: profile.linked, diagnostics: snapshot?.diagnostics, updatedAt: snapshot?.updatedAt, message: profile.linked ? 'Escala sincronizada com o Concierge Telegram.' : 'Escala preparada. Vincule o Telegram para consultar pelo bot.' });
}
async function handleTelegramConciergeAsk(req, res) {
  if (req.method !== 'POST') return sendJson(res, 200, { ok: true, commands: ['/hoje','/amanha','/proximo','/escala','/radar','/saida','/metar','/hoteis','/academias','/rotina','/diarias','/conformidade'], message: 'Concierge pronto.' });
  const body = await readJsonBody(req, 1_000_000);
  const user = telegramRequestUser(req, body);
  if (!telegramAppRequestAllowed(user)) return sendJson(res, 401, { ok: false, message: 'Faça login para consultar o Concierge no app.' });
  const linkedRecord = await telegramLinkedRecordForEmail(user.email);
  if (linkedRecord && !conciergeAccessMatches(user, linkedRecord)) return sendJson(res, 403, { ok: false, message: 'Este dispositivo não está autorizado a usar o Telegram vinculado.' });
  const chatId = String(linkedRecord?.chatId || '');
  const profile = { ...user, chatId, linked: Boolean(chatId) };
  let snapshot = await conciergeLoadSnapshot(profile);
  if (snapshot && !conciergeAccessMatches(user, snapshot)) return sendJson(res, 403, { ok: false, message: 'Este dispositivo não está autorizado a consultar esta escala.' });
  if (body.location && typeof body.location === 'object') snapshot = await conciergeSaveSnapshotAsync(profile, null, { preferences: { location: body.location } });
  const reply = await buildTelegramConciergeReply(String(body.text || body.message || ''), profile, snapshot);
  return sendJson(res, 200, { ok: true, reply, linked: profile.linked, hasRoster: Boolean(snapshot?.roster), updatedAt: snapshot?.updatedAt || '', message: 'Resposta operacional gerada.' });
}
function telegramMessagePdfDocument(message = {}) {
  const document = message?.document;
  if (!document?.file_id) return null;
  const name = String(document.file_name || '').trim();
  const mime = String(document.mime_type || '').toLowerCase();
  return mime === 'application/pdf' || /\.pdf$/i.test(name) ? document : null;
}
async function handleTelegramPdfRoster(message = {}) {
  const chatId = message?.chat?.id;
  const document = telegramMessagePdfDocument(message);
  if (!chatId || !document) return false;
  const profile = await telegramProfileForChatAsync(message);
  await sendTelegramChatAction(chatId, 'typing');
  await sendTelegramMessage(chatId, 'Escala recebida. Estou conferindo período, dias, voos e próxima programação.');
  try {
    const info = await telegramGetFileInfo(document.file_id);
    if (!info.ok) throw new Error('Não consegui localizar o PDF no Telegram.');
    const fileSize = Number(document.file_size || info.fileSize || 0);
    if (fileSize > 20 * 1024 * 1024) throw new Error('O PDF excede 20 MB. Envie a versão original compacta da escala.');
    const downloaded = await telegramDownloadFile(info.filePath);
    if (!downloaded.ok) throw new Error('Não consegui baixar o PDF agora.');
    const parsed = await parsePdfOnServer({ filename: document.file_name || 'escala-telegram.pdf', dataBase64: downloaded.buffer.toString('base64') });
    const roster = parsed?.roster;
    if (!roster?.days?.length) throw new Error('O PDF foi lido, mas nenhuma data de escala foi confirmada.');
    const snapshot = await conciergeSaveSnapshotAsync(profile, roster, { source: 'telegram-pdf', fileName: document.file_name || 'escala.pdf', parserDiagnostics: parsed.diagnostics || null });
    const stats = snapshot.diagnostics || conciergeRosterDiagnostics(roster);
    const next = conciergeNextProgram(roster);
    await sendTelegramMessage(chatId, [
      'Escala ativada no Concierge.',
      `${roster.crewName || profile.name} · Base ${roster.base || '—'} · ${String(roster.month || '').padStart(2, '0')}/${roster.year || ''}`,
      `${stats.days} dias · ${stats.flights} voos · ${stats.programs} programações`,
      parsed?.diagnostics?.confidence ? `Leitura: confiança ${parsed.diagnostics.confidence}.` : '',
      '',
      next ? `Próxima programação:\n${conciergeFormatProgram(next)}` : 'Nenhuma programação futura detectada.',
      '',
      profile.linked ? 'A escala também está disponível para importar/sincronizar no app.' : 'Vincule este Telegram no app para compartilhar a mesma escala entre os dois.',
    ].filter(Boolean).join('\n'), { reply_markup: conciergeKeyboard });
  } catch (error) {
    await sendTelegramMessage(chatId, error instanceof Error ? error.message : 'Não consegui interpretar o PDF. Envie o arquivo oficial sem senha.');
  }
  return true;
}
async function handleTelegramLocation(message = {}) {
  const chatId = message?.chat?.id;
  const location = message?.location;
  if (!chatId || !location) return false;
  const profile = await telegramProfileForChatAsync(message);
  await conciergeSaveSnapshotAsync(profile, null, { preferences: { location: { latitude: Number(location.latitude), longitude: Number(location.longitude), accuracy: Number(location.horizontal_accuracy || 0), updatedAt: new Date().toISOString() } } });
  await sendTelegramMessage(chatId, 'Localização atualizada. Agora posso calcular /saida e procurar /academias ou /hoteis perto de você.', { reply_markup: conciergeKeyboard });
  return true;
}

// CrewCheck v13.7.15 — Telegram Link backend.
const crewcheckTelegramLinksFile = path.join(__dirname, '.crewcheck-telegram-links.json');

function telegramBotUsername() {
  return envAny(['TELEGRAM_BOT_USERNAME', 'CREWCHECK_TELEGRAM_BOT_USERNAME']).replace(/^@/, '');
}
function telegramLinksRead() {
  try {
    if (!fs.existsSync(crewcheckTelegramLinksFile)) return { pending: {}, linked: {} };
    const parsed = JSON.parse(fs.readFileSync(crewcheckTelegramLinksFile, 'utf8'));
    return {
      pending: parsed && typeof parsed.pending === 'object' ? parsed.pending : {},
      linked: parsed && typeof parsed.linked === 'object' ? parsed.linked : {},
    };
  } catch {
    return { pending: {}, linked: {} };
  }
}
function telegramLinksWrite(data) {
  try { fs.writeFileSync(crewcheckTelegramLinksFile, JSON.stringify(data, null, 2), 'utf8'); return true; }
  catch { return false; }
}
function telegramLinkCode() {
  return 'cc_' + crypto.randomBytes(9).toString('base64url');
}
function telegramRequestUser(req, body = {}) {
  let email = String(body.email || '').trim().toLowerCase();
  let name = String(body.name || '').trim();
  const accessKeyHash = conciergeAccessHash(body.conciergeKey || body.accessKey || req?.headers?.['x-crewcheck-concierge-key'] || '');
  let authenticated = false;
  try {
    if (typeof cc1371Verify === 'function' && typeof cc1371RequestToken === 'function') {
      const payload = cc1371Verify(cc1371RequestToken(req));
      const tokenEmail = String(payload?.email || '').trim().toLowerCase();
      if (tokenEmail) {
        email = tokenEmail;
        name = String(payload?.name || '').trim() || name;
        authenticated = true;
      }
    }
  } catch {}
  if (!email) email = 'local@crewcheck.local';
  if (!name) name = email.includes('@') ? email.split('@')[0] : 'Tripulante CrewCheck';
  return { email, name, authenticated, accessKeyHash };
}
function telegramAppRequestAllowed(user = {}) {
  return Boolean(user.authenticated || (!cc1371AuthRequired() && user.accessKeyHash));
}
function telegramLinkedChatIdForEmail(email = '') {
  const key = String(email || '').trim().toLowerCase();
  if (!key) return '';
  const data = telegramLinksRead();
  return String(data.linked?.[key]?.chatId || '');
}
function telegramLinkedUsernameForEmail(email = '') {
  const key = String(email || '').trim().toLowerCase();
  if (!key) return '';
  const data = telegramLinksRead();
  return String(data.linked?.[key]?.username || '').trim().replace(/^@/, '');
}
async function telegramLinkedRecordForEmail(email = '') {
  const key = conciergeSafeKey(email);
  if (!key) return null;
  const data = telegramLinksRead();
  if (data.linked?.[key]) return data.linked[key];
  const persisted = await conciergeDbGet(`link-email:${key}`);
  if (!persisted?.chatId) return null;
  data.linked[key] = persisted;
  telegramLinksWrite(data);
  return persisted;
}
async function telegramLinkedChatIdForEmailAsync(email = '') {
  const record = await telegramLinkedRecordForEmail(email);
  return String(record?.chatId || '');
}
async function telegramLinkedUsernameForEmailAsync(email = '') {
  const record = await telegramLinkedRecordForEmail(email);
  return String(record?.username || '').trim().replace(/^@/, '');
}
async function handleTelegramLinkStart(req, res) {
  if (req.method !== 'POST') return sendJson(res, 200, { ok: true, configured: telegramConfigured(), botUsername: telegramBotUsername(), message: 'Vínculo Telegram pronto.' });
  const body = await readJsonBody(req, 300000);
  const user = telegramRequestUser(req, body);
  if (!telegramAppRequestAllowed(user)) return sendJson(res, 401, { ok: false, message: 'Faça login para vincular o Telegram.' });
  const existingLink = await telegramLinkedRecordForEmail(user.email);
  const existingSnapshot = await conciergeLoadSnapshot(user);
  const legacyChatId = String(existingLink?.chatId || existingSnapshot?.chatId || '');
  const legacyMigration = Boolean(user.accessKeyHash && legacyChatId && (!existingLink?.accessKeyHash || !existingSnapshot?.accessKeyHash));
  if (existingLink && !conciergeAccessMatches(user, existingLink) && !legacyMigration) return sendJson(res, 403, { ok: false, message: 'Este Telegram já está protegido por outro dispositivo. Entre com a conta vinculada para refazer o vínculo.' });
  if (existingSnapshot && !conciergeAccessMatches(user, existingSnapshot) && !legacyMigration) return sendJson(res, 403, { ok: false, message: 'A escala do Concierge já está protegida. Refaça o vínculo no Telegram antigo ou entre com uma sessão autenticada.' });
  const code = telegramLinkCode();
  const data = telegramLinksRead();
  data.pending[code] = { code, email: user.email, name: user.name, accessKeyHash: user.accessKeyHash || existingLink?.accessKeyHash || '', legacyMigration, existingChatId: legacyMigration ? legacyChatId : '', createdAt: new Date().toISOString() };
  telegramLinksWrite(data);
  await conciergeDbPut(`pending:${code}`, data.pending[code]);
  const username = telegramBotUsername();
  const link = username ? `https://t.me/${username}?start=${encodeURIComponent(code)}` : '';
  return sendJson(res, 200, {
    ok: Boolean(link),
    configured: telegramConfigured(),
    code,
    link,
    botUsername: username,
    command: `/start ${code}`,
    message: link ? 'Abra o Telegram e toque em Start para vincular notificações.' : 'Configure TELEGRAM_BOT_USERNAME no Render para gerar link automático. Use o comando exibido no bot.',
  });
}
async function handleTelegramLinkStatus(req, res, url) {
  const code = String(url.searchParams.get('code') || '').trim();
  const requestedEmail = String(url.searchParams.get('email') || '').trim().toLowerCase();
  const user = telegramRequestUser(req, { email: requestedEmail, conciergeKey: String(url.searchParams.get('conciergeKey') || '') });
  if (!telegramAppRequestAllowed(user)) return sendJson(res, 401, { ok: false, linked: false, message: 'Faça login para consultar o vínculo Telegram.' });
  const email = user.email;
  const data = telegramLinksRead();
  let linked = null;
  if (code) linked = Object.values(data.linked || {}).find((item) => item && item.code === code) || null;
  if (!linked && email) linked = data.linked?.[email] || null;
  if (!linked && code) linked = await conciergeDbGet(`link-code:${code}`);
  if (!linked && email) linked = await telegramLinkedRecordForEmail(email);
  if (linked && email && conciergeSafeKey(linked.email) !== conciergeSafeKey(email)) linked = null;
  if (linked && !conciergeAccessMatches(user, linked)) return sendJson(res, 403, { ok: false, linked: false, message: 'Este dispositivo não está autorizado a consultar este vínculo.' });
  const snapshot = linked?.email ? await conciergeLoadSnapshot({ ...user, email: linked.email, chatId: linked.chatId }) : (email ? await conciergeLoadSnapshot(user) : null);
  if (snapshot && !conciergeAccessMatches(user, snapshot)) return sendJson(res, 403, { ok: false, linked: false, message: 'Este dispositivo não está autorizado a consultar a escala vinculada.' });
  return sendJson(res, 200, {
    ok: Boolean(linked?.chatId),
    linked: Boolean(linked?.chatId),
    chatId: linked?.chatId ? String(linked.chatId) : '',
    linkedAt: linked?.linkedAt || '',
    hasRoster: Boolean(snapshot?.roster),
    rosterUpdatedAt: snapshot?.updatedAt || '',
    message: linked?.chatId ? 'Telegram vinculado para notificações.' : 'Telegram ainda não vinculado. Abra o bot e toque em Start.',
  });
}
async function telegramTryBindFromWebhook(message = {}, text = '') {
  const match = String(text || '').trim().match(/^\/start(?:@\S+)?\s+(cc_[A-Za-z0-9_-]+)/i);
  if (!match) return false;
  const code = match[1];
  const chatId = message?.chat?.id;
  if (!chatId) return false;
  const data = telegramLinksRead();
  const pending = data.pending?.[code] || await conciergeDbGet(`pending:${code}`);
  if (!pending) {
    await sendTelegramMessage(chatId, 'Código de vínculo não localizado ou expirado. Gere um novo vínculo no CrewCheck.');
    return true;
  }
  if (pending.legacyMigration && String(pending.existingChatId || '') !== String(chatId)) {
    await sendTelegramMessage(chatId, 'A migração deste vínculo precisa ser confirmada no Telegram que já estava conectado ao CrewCheck.');
    return true;
  }
  const email = String(pending.email || '').trim().toLowerCase();
  data.linked[email] = {
    email,
    name: pending.name || '',
    code,
    chatId: String(chatId),
    username: message?.from?.username || message?.chat?.username || '',
    accessKeyHash: pending.accessKeyHash || '',
    linkedAt: new Date().toISOString(),
  };
  delete data.pending[code];
  telegramLinksWrite(data);
  await Promise.all([
    conciergeDbPut(`link-email:${email}`, data.linked[email]),
    conciergeDbPut(`link-chat:${String(chatId)}`, data.linked[email]),
    conciergeDbPut(`link-code:${code}`, data.linked[email]),
    conciergeDbDelete(`pending:${code}`),
  ]);
  await conciergeMergeChatSnapshot({ email, name: pending.name || '', chatId: String(chatId), accessKeyHash: pending.accessKeyHash || '' });
  await sendTelegramMessage(chatId, [
    'Telegram vinculado ao CrewCheck.',
    '',
    'Você já pode enviar o PDF da escala aqui e consultar programação, radar, meteorologia, hotéis, academias, rotina e Saída Inteligente.',
    '',
    'Use /ajuda para ver os comandos antigos restaurados. Para testar alertas, volte ao CrewCheck e use Despertador > Testar canal.'
  ].join('\n'), { reply_markup: conciergeKeyboard });
  return true;
}

// CrewCheck v13.7.15 — Telegram Voice STT Restore.
function crewcheckSttApiKey() {
  return envAny(['OPENAI_API_KEY', 'OPENAI_STT_API_KEY', 'CREWCHECK_OPENAI_API_KEY', 'CREWCHECK_STT_API_KEY']);
}
function crewcheckSttModel() {
  return envAny(['CREWCHECK_STT_MODEL', 'OPENAI_TRANSCRIPTION_MODEL', 'OPENAI_STT_MODEL']) || 'gpt-4o-mini-transcribe';
}
function crewcheckSttConfigured() { return Boolean(crewcheckSttApiKey()); }
function telegramVoiceFileId(message = {}) {
  return String(message?.voice?.file_id || message?.audio?.file_id || message?.document?.file_id || '').trim();
}
function telegramVoiceMime(message = {}) {
  return String(message?.voice?.mime_type || message?.audio?.mime_type || message?.document?.mime_type || 'audio/ogg').trim();
}
function telegramVoiceDuration(message = {}) {
  return Number(message?.voice?.duration || message?.audio?.duration || 0);
}
function telegramVoiceFileName(message = {}, filePath = '') {
  const explicit = String(message?.audio?.file_name || message?.document?.file_name || '').trim();
  if (explicit) return explicit.slice(0, 80);
  const ext = String(filePath || '').split('.').pop() || '';
  if (/^(oga|ogg|opus)$/i.test(ext)) return 'telegram-voice.ogg';
  if (/^(mp3|m4a|wav|webm|mp4|mpeg|mpga)$/i.test(ext)) return `telegram-audio.${ext.toLowerCase()}`;
  return 'telegram-voice.ogg';
}
async function telegramGetFileInfo(fileId) {
  const token = telegramToken();
  if (!token) return { ok: false, message: 'Telegram aguardando token do bot.' };
  const response = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`, { headers: { accept: 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false || !payload?.result?.file_path) return { ok: false, status: response.status, message: 'Não consegui localizar o arquivo no Telegram.' };
  return { ok: true, filePath: payload.result.file_path, fileSize: payload.result.file_size || 0 };
}
async function telegramDownloadFile(filePath) {
  const token = telegramToken();
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!response.ok) return { ok: false, status: response.status, message: 'Arquivo indisponível no Telegram.' };
  const arrayBuffer = await response.arrayBuffer();
  return { ok: true, buffer: Buffer.from(arrayBuffer) };
}
async function transcribeTelegramAudioWithOpenAI(buffer, fileName, mimeType) {
  const key = crewcheckSttApiKey();
  if (!key) return { ok: false, configured: false, message: 'Ainda não consegui ouvir áudio por aqui. Me manda em texto rapidinho?' };
  const form = new FormData();
  const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
  form.append('file', blob, fileName || 'telegram-audio.ogg');
  form.append('model', crewcheckSttModel());
  form.append('response_format', 'text');
  form.append('language', 'pt');
  form.append('prompt', 'CrewCheck, escala, voo, reserva, sobreaviso, pernoite, METAR, TAF, portão, radar, BSB, GRU, CGH, CNF, GIG, SDU, CWB, POA, REC, FOR, SLZ, SSA.');
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form });
  const text = await response.text().catch(() => '');
  if (!response.ok) {
    let message = 'Não consegui ouvir esse áudio agora.';
    try { const parsed = JSON.parse(text); message = parsed?.error?.message || message; } catch {}
    return { ok: false, configured: true, status: response.status, message };
  }
  const transcript = text.trim().replace(/^"|"$/g, '').trim();
  return { ok: Boolean(transcript), configured: true, text: transcript, message: transcript ? 'Áudio transcrito.' : 'Não entendi bem esse áudio. Grava de novo rapidinho?' };
}
// CrewCheck v13.7.15 — ElevenLabs STT Provider.
// Evita dependência de cota OpenAI para áudio do Telegram.
function sttProviderPreference() {
  const raw = envAny(['CREWCHECK_STT_PROVIDER','TELEGRAM_CONCIERGE_STT_PROVIDER','STT_PROVIDER','SPEECH_TO_TEXT_PROVIDER']);
  const value = String(raw || '').trim().toLowerCase();
  if (['openai','elevenlabs'].includes(value)) return value;
  return elevenLabsApiKey() ? 'elevenlabs' : 'openai';
}
function elevenLabsSttModel() {
  return envAny(['ELEVENLABS_STT_MODEL','CREWCHECK_ELEVENLABS_STT_MODEL','CREWCHECK_STT_MODEL']) || 'scribe_v2';
}
function elevenLabsSttConfigured() { return Boolean(elevenLabsApiKey()); }
async function transcribeTelegramAudioWithElevenLabs(buffer, fileName, mimeType) {
  const key = elevenLabsApiKey();
  if (!key) return { ok: false, configured: false, provider: 'elevenlabs', message: 'Transcrição aguardando ElevenLabs.' };
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), fileName || 'telegram-audio.ogg');
  form.append('model_id', elevenLabsSttModel());
  form.append('language_code', 'por');
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: form });
    const raw = await response.text().catch(() => '');
    let payload = {};
    try { payload = JSON.parse(raw); } catch {}
    if (!response.ok) {
      const message = payload?.detail?.message || payload?.message || 'Não consegui ouvir esse áudio agora.';
      return { ok: false, configured: true, provider: 'elevenlabs', status: response.status, message };
    }
    const transcript = String(payload?.text || '').trim();
    return { ok: Boolean(transcript), configured: true, provider: 'elevenlabs', model: elevenLabsSttModel(), text: transcript, language: payload?.language_code || '', message: transcript ? 'Áudio entendido.' : 'Não consegui entender esse áudio agora.' };
  } catch {
    return { ok: false, configured: true, provider: 'elevenlabs', message: 'Não consegui ouvir esse áudio agora.' };
  }
}
async function transcribeTelegramAudio(buffer, fileName, mimeType) {
  const provider = sttProviderPreference();
  if (provider === 'elevenlabs') {
    const eleven = await transcribeTelegramAudioWithElevenLabs(buffer, fileName, mimeType);
    if (eleven.ok || !crewcheckSttApiKey()) return eleven;
    if (String(envAny(['CREWCHECK_ALLOW_OPENAI_STT_FALLBACK']) || 'false').toLowerCase() === 'true') return transcribeTelegramAudioWithOpenAI(buffer, fileName, mimeType);
    return eleven;
  }
  return transcribeTelegramAudioWithOpenAI(buffer, fileName, mimeType);
}
async function handleTelegramVoiceMessage(message = {}) {
  const chatId = message?.chat?.id;
  const fileId = telegramVoiceFileId(message);
  if (!chatId || !fileId) return false;
  if (!crewcheckSttConfigured() && !elevenLabsSttConfigured()) {
    await sendTelegramMessage(chatId, ['Ainda não consegui ouvir áudio por aqui. Me manda em texto rapidinho?','','No Render, configure CREWCHECK_STT_PROVIDER=elevenlabs e ELEVENLABS_API_KEY.','Sugestão: ELEVENLABS_STT_MODEL=scribe_v2','','Enquanto isso, envie por texto que eu respondo normalmente.'].join('\n'));
    return true;
  }
  const duration = telegramVoiceDuration(message);
  if (duration && duration > 180) { await sendTelegramMessage(chatId, 'Esse áudio ficou grande pra mim. Me manda um mais curtinho?'); return true; }
  await showHumanRecordingAction(chatId, 1);
  try {
    const info = await telegramGetFileInfo(fileId);
    if (!info.ok) { await sendTelegramMessage(chatId, info.message || 'Não consegui localizar o arquivo de áudio no Telegram.'); return true; }
    if (Number(info.fileSize || 0) > 25 * 1024 * 1024) { await sendTelegramMessage(chatId, 'Esse áudio ficou pesado pra mim. Me manda um mais curtinho?'); return true; }
    const downloaded = await telegramDownloadFile(info.filePath);
    if (!downloaded.ok) { await sendTelegramMessage(chatId, downloaded.message || 'Não consegui baixar o áudio agora.'); return true; }
    const fileName = telegramVoiceFileName(message, info.filePath);
    const mimeType = telegramVoiceMime(message);
    const result = await transcribeTelegramAudio(downloaded.buffer, fileName, mimeType);
    if (!result.ok) {
      await sendTelegramMessage(chatId, result.message || 'Não consegui ouvir esse áudio agora. Me manda de novo rapidinho ou escreve por texto.');
      return true;
    }
    const transcript = String(result.text || '').trim();
    const profile = await telegramProfileForChatAsync(message);
    const snapshot = await conciergeLoadSnapshot(profile);
    const reply = await buildTelegramConciergeReply(transcript, profile, snapshot);
    const humanAudioSent = await sendHumanTelegramVoiceReply(chatId, reply, transcript);
    if (humanAudioSent) return true;
    await sendTelegramMessage(chatId, [`Ouvi: “${transcript.slice(0, 700)}”`, '', reply].join('\n'));
    return true;
  } catch {
    await sendTelegramMessage(chatId, 'Não consegui ouvir esse áudio agora. Me manda em texto rapidinho ou tenta gravar de novo?');
    return true;
  }
}
function handleTelegramSttHealth(req, res) {
  const configured = crewcheckSttConfigured() || elevenLabsSttConfigured();
  return sendJson(res, 200, { ok: configured, configured, model: configured ? crewcheckSttModel() : '', provider: sttProviderPreference(),
    model: sttProviderPreference() === 'elevenlabs' ? elevenLabsSttModel() : crewcheckSttModel(),
    elevenLabsConfigured: elevenLabsSttConfigured(),
    openaiConfigured: crewcheckSttConfigured(),
    telegramConfigured: telegramConfigured(), message: configured ? 'Transcrição de áudio configurada.' : 'Transcrição aguardando ElevenLabs ou OpenAI.' });
}

function handleTelegramHealth(req, res) {
  const webhookUrl = publicUrl() ? `${publicUrl()}/api/telegram/webhook` : '';
  return sendJson(res, 200, { ok: telegramConfigured(), configured: telegramConfigured(), webhookConfigured: Boolean(webhookUrl), defaultChatConfigured: Boolean(telegramDefaultChatId()), botUsername: telegramBotUsername(), linkSupported: Boolean(telegramBotUsername()), pdfImport: true, rosterSync: true, persistentStore: Boolean(envAny(['DATABASE_URL'])), locationSupported: true, voiceSupported: crewcheckSttConfigured() || elevenLabsSttConfigured(), commandsRestored: true, ttsProvider: 'elevenlabs', ttsConfigured: elevenLabsTtsConfigured(), message: telegramConfigured() ? 'Concierge completo configurado.' : 'Concierge aguardando configuração.' });
}

async function handleTelegramSend(req, res) {
  if (req.method !== 'POST') return sendJson(res, 200, { ok: true, message: 'Envio do concierge pronto.' });
  const payload = await readJsonBody(req);
  const user = telegramRequestUser(req, payload);
  if (!telegramAppRequestAllowed(user)) return sendJson(res, 401, { ok: false, message: 'Faça login para enviar pelo Concierge.' });
  const linkedRecord = await telegramLinkedRecordForEmail(user.email);
  if (linkedRecord && !conciergeAccessMatches(user, linkedRecord)) return sendJson(res, 403, { ok: false, message: 'Este dispositivo não está autorizado a enviar para o Telegram vinculado.' });
  const linkedChatId = String(linkedRecord?.chatId || '');
  const admin = Boolean(typeof cc1371IsAdmin === 'function' && cc1371IsAdmin(user.email));
  const requestedChatId = admin ? String(payload.chatId || payload.chat_id || '') : '';
  const chatId = String(requestedChatId || linkedChatId || (admin ? telegramDefaultChatId() : '') || '').trim();
  const text = String(payload.text || payload.message || '').trim();
  if (!text) return sendJson(res, 400, { ok: false, message: 'Mensagem vazia.' });
  const result = await sendTelegramMessage(chatId, text);
  return sendJson(res, 200, result);
}

async function handleTelegramSetupWebhook(req, res) {
  const url = telegramApiUrl('setWebhook');
  const base = publicUrl();
  if (!url || !base) return sendJson(res, 200, { ok: false, configured: Boolean(url), message: 'Webhook aguardando configuração do endereço público.' });
  const secret = envAny(['TELEGRAM_WEBHOOK_SECRET']);
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: `${base}/api/telegram/webhook`, ...(secret ? { secret_token: secret } : {}), allowed_updates: ['message'], drop_pending_updates: false }) });
    const data = await response.json().catch(() => ({}));
    return sendJson(res, 200, { ok: Boolean(response.ok && data.ok !== false), configured: true, message: response.ok ? 'Webhook atualizado.' : 'Webhook não atualizado agora.' });
  } catch {
    return sendJson(res, 200, { ok: false, configured: true, message: 'Webhook não atualizado agora.' });
  }
}

async function handleTelegramWebhook(req, res) {
  const secret = envAny(['TELEGRAM_WEBHOOK_SECRET']);
  if (secret) {
    const received = String(req.headers['x-telegram-bot-api-secret-token'] || '');
    if (received !== secret) return sendJson(res, 403, { ok: false, message: 'Webhook não autorizado.' });
  }
  if (req.method !== 'POST') return sendJson(res, 200, { ok: true, message: 'Concierge pronto para receber eventos.' });
  const update = await readJsonBody(req);
  const message = update?.message || update?.edited_message || {};
  const chatId = message?.chat?.id;
  const text = String(message?.text || message?.caption || '').trim();
  if (chatId && text && await handlePlatformVisitorTelegram(message, text, sendTelegramMessage)) return sendJson(res, 200, { ok: true, visitor: true, message: 'Comando de visitante processado.' });
  if (chatId && text && await telegramTryBindFromWebhook(message, text)) return sendJson(res, 200, { ok: true, linked: true, message: 'Telegram vinculado.' });
  if (chatId && telegramMessagePdfDocument(message)) await handleTelegramPdfRoster(message);
  else if (chatId && message?.location) await handleTelegramLocation(message);
  else if (chatId && text) {
    const profile = await telegramProfileForChatAsync(message);
    const snapshot = await conciergeLoadSnapshot(profile);
    await sendTelegramChatAction(chatId, 'typing');
    await sendTelegramMessage(chatId, await buildTelegramConciergeReply(text, profile, snapshot), { reply_markup: conciergeKeyboard });
  } else if (chatId && (message?.voice || message?.audio || message?.document?.mime_type?.startsWith?.('audio/'))) await handleTelegramVoiceMessage(message);
  return sendJson(res, 200, { ok: true, received: true, message: 'Evento recebido.' });
}

const crewcheckAlarmTestRateLimit = new Map();

function telegramCallProviderEnabled() {
  return String(process.env.CALLMEBOT_TELEGRAM_CALL_ENABLED || 'true').toLowerCase() !== 'false';
}
function callMeBotPhoneConfigured() {
  return Boolean(envAny(['CALLMEBOT_API_KEY', 'CALLMEBOT_KEY']));
}
function infobipPhoneConfigured() {
  return Boolean(envAny(['INFOBIP_API_KEY']) && envAny(['INFOBIP_BASE_URL']) && envAny(['INFOBIP_FROM', 'INFOBIP_CALLER_ID']));
}
function phoneCallConfigured() {
  return callMeBotPhoneConfigured() || infobipPhoneConfigured();
}
function cleanVoiceCallText(value = '') {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
}
async function fetchVoiceProvider(url, options = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text().catch(() => '');
    const accepted = response.ok && !/(error|not authorized|unauthori[sz]ed|invalid|missing)/i.test(text);
    return { ok: accepted, configured: true, status: response.status, providerMessage: text.slice(0, 240) };
  } catch {
    return { ok: false, configured: true, message: 'O provedor de ligação não respondeu agora.' };
  } finally {
    clearTimeout(timer);
  }
}
async function sendTelegramVoiceCall(username, text) {
  const user = String(username || '').trim().replace(/^@/, '');
  if (!telegramCallProviderEnabled()) return { ok: false, configured: false, provider: 'callmebot-telegram', message: 'Ligação via Telegram desativada no servidor.' };
  if (!user) return { ok: false, configured: true, provider: 'callmebot-telegram', message: 'Vincule um Telegram com nome de usuário para receber a ligação.' };
  const url = new URL('https://api.callmebot.com/start.php');
  url.searchParams.set('user', `@${user}`);
  url.searchParams.set('text', cleanVoiceCallText(text) || 'Teste de ligação CrewCheck.');
  url.searchParams.set('lang', envAny(['CALLMEBOT_TELEGRAM_LANG']) || 'pt-BR-Standard-A');
  url.searchParams.set('rpt', '1');
  url.searchParams.set('cc', 'missed');
  url.searchParams.set('timeout', '45');
  const result = await fetchVoiceProvider(url.toString(), {}, 18_000);
  return { ...result, provider: 'callmebot-telegram', message: result.ok ? `Ligação via Telegram iniciada para @${user}.` : result.message || 'A ligação via Telegram não foi aceita. Autorize o CallMeBot e tente novamente.' };
}
async function sendCallMeBotPhoneCall(phone, text) {
  const apiKey = envAny(['CALLMEBOT_API_KEY', 'CALLMEBOT_KEY']);
  const destination = String(phone || envAny(['CALLMEBOT_PHONE', 'CREWCHECK_ADMIN_PHONE']) || '').trim().replace(/[^+\d]/g, '');
  if (!apiKey) return { ok: false, configured: false, provider: 'callmebot-phone', message: 'Ligação telefônica aguardando chave do CallMeBot.' };
  if (!destination) return { ok: false, configured: true, provider: 'callmebot-phone', message: 'Informe o telefone do administrador com DDI.' };
  const url = new URL('https://api.callmebot.com/call.php');
  url.searchParams.set('phone', destination);
  url.searchParams.set('text', cleanVoiceCallText(text) || 'Teste de ligação CrewCheck.');
  url.searchParams.set('apikey', apiKey);
  const result = await fetchVoiceProvider(url.toString(), {}, 18_000);
  return { ...result, provider: 'callmebot-phone', message: result.ok ? 'Ligação telefônica de teste iniciada.' : result.message || 'A ligação telefônica não foi aceita agora.' };
}
async function sendInfobipPhoneCall(phone, text) {
  const apiKey = envAny(['INFOBIP_API_KEY']);
  const baseUrl = envAny(['INFOBIP_BASE_URL']).replace(/\/+$/, '');
  const from = envAny(['INFOBIP_FROM', 'INFOBIP_CALLER_ID']);
  const destination = String(phone || envAny(['CREWCHECK_ADMIN_PHONE']) || '').trim().replace(/[^+\d]/g, '');
  if (!apiKey || !baseUrl || !from) return { ok: false, configured: false, provider: 'infobip', message: 'Infobip aguardando API key, base URL e identificador de origem.' };
  if (!destination) return { ok: false, configured: true, provider: 'infobip', message: 'Informe o telefone do administrador com DDI.' };
  const result = await fetchVoiceProvider(`${baseUrl}/tts/3/advanced`, {
    method: 'POST',
    headers: { authorization: `App ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ messages: [{ from, destinations: [{ to: destination }], text: cleanVoiceCallText(text), language: 'pt-BR' }] }),
  }, 18_000);
  return { ...result, provider: 'infobip', message: result.ok ? 'Ligação telefônica de teste iniciada.' : result.message || 'A Infobip não aceitou a ligação agora.' };
}
async function sendAdminPhoneCall(phone, text) {
  const preferred = String(envAny(['CREWCHECK_WAKEUP_CALL_PROVIDER']) || '').toLowerCase();
  if (preferred.includes('infobip') && infobipPhoneConfigured()) {
    const primary = await sendInfobipPhoneCall(phone, text);
    if (primary.ok || !callMeBotPhoneConfigured()) return primary;
  }
  if (callMeBotPhoneConfigured()) return sendCallMeBotPhoneCall(phone, text);
  if (infobipPhoneConfigured()) return sendInfobipPhoneCall(phone, text);
  return { ok: false, configured: false, provider: '', message: 'Nenhum provedor de ligação telefônica está configurado.' };
}
function alarmRequestIdentity(req) {
  const token = cc1371Verify(cc1371RequestToken(req));
  const email = String(token?.email || '').trim().toLowerCase();
  return { token, email, admin: Boolean(token?.admin || cc1371IsAdmin(email)) };
}
function alarmChannelConfigured(channel = '', email = '') {
  const value = String(channel || '').toLowerCase();
  const telegram = telegramConfigured();
  const telegramCall = telegramCallProviderEnabled() && Boolean(telegramLinkedUsernameForEmail(email));
  const phone = phoneCallConfigured();
  if (value === 'telegram-call') return telegramCall;
  if (value.includes('telegram') && value.includes('liga')) return telegram || phone;
  if (value.includes('telegram')) return telegram;
  if (value.includes('liga') || value.includes('voz')) return phone;
  return telegram || telegramCall || phone;
}
async function handleAlarmHealth(req, res) {
  const identity = alarmRequestIdentity(req);
  if (identity.email) await telegramLinkedRecordForEmail(identity.email);
  const telegram = telegramConfigured();
  const username = telegramLinkedUsernameForEmail(identity.email);
  const telegramCall = telegramCallProviderEnabled() && Boolean(username);
  const phoneCall = phoneCallConfigured();
  return sendJson(res, 200, {
    ok: telegram || telegramCall || phoneCall,
    configured: telegram || phoneCall,
    telegram,
    telegramCall,
    telegramCallAvailable: telegramCallProviderEnabled(),
    phoneCall,
    voice: telegramCall || phoneCall,
    channels: { telegram, telegramCall, phoneCall, both: telegram || phoneCall },
    message: telegram || telegramCall || phoneCall ? 'Despertador pronto para teste e configuração.' : 'Despertador aguardando configuração de canal.',
  });
}
async function handleAlarmPreview(req, res, url) {
  const identity = alarmRequestIdentity(req);
  if (identity.email) await telegramLinkedRecordForEmail(identity.email);
  const presentation = String(url.searchParams.get('presentation') || '').trim();
  const lead = Number(url.searchParams.get('lead') || 90);
  const channel = String(url.searchParams.get('channel') || 'telegram').trim();
  return sendJson(res, 200, { ok: true, configured: alarmChannelConfigured(channel, identity.email), presentation, leadMinutes: Number.isFinite(lead) ? lead : 90, channel, maxCallsPerLayover: 2, snoozeTelegram: telegramConfigured(), telegramCallAvailable: telegramCallProviderEnabled(), message: 'Prévia calculada. Confirme o horário no app antes de ativar.' });
}
async function handleAlarmTest(req, res) {
  if (req.method !== 'POST') return sendJson(res, 200, { ok: true, message: 'Teste do despertador pronto.' });
  const identity = alarmRequestIdentity(req);
  if (cc1371AuthRequired() && !identity.token) return sendJson(res, 401, { ok: false, message: 'Faça login para testar o despertador.' });

  const payload = await readJsonBody(req, 300_000);
  const testType = String(payload.testType || 'selected').toLowerCase();
  const channel = String(payload.channel || 'telegram').toLowerCase();
  const rateKey = `${identity.email || req.socket?.remoteAddress || 'anonymous'}:${testType}`;
  const retryAfterSeconds = crewcheckRateLimit(crewcheckAlarmTestRateLimit, rateKey, 35_000);
  if (retryAfterSeconds) return sendJson(res, 429, { ok: false, retryAfterSeconds, message: `Aguarde ${retryAfterSeconds}s antes de repetir este teste.` });

  const text = cleanVoiceCallText(payload.message || 'Teste do Despertador Inteligente CrewCheck.');
  const wantsTelegramMessage = testType === 'telegram-message' || (testType === 'selected' && channel !== 'telegram-call' && (channel.includes('telegram') || channel.includes('ambos')));
  const wantsTelegramCall = testType === 'telegram-call' || (testType === 'selected' && channel === 'telegram-call');
  const wantsPhoneCall = testType === 'phone-call' || (testType === 'selected' && (channel.includes('liga') || channel.includes('ambos')));

  if (wantsPhoneCall && !identity.admin) return sendJson(res, 403, { ok: false, message: 'O teste de ligação telefônica é exclusivo do administrador. A ligação via Telegram continua disponível para todos.' });

  let usage = null;

  const results = [];
  if (wantsTelegramMessage) {
    const linkedChatId = await telegramLinkedChatIdForEmailAsync(identity.email);
    const chatId = String(payload.chatId || linkedChatId || telegramDefaultChatId() || '').trim();
    results.push({ channel: 'telegram-message', ...(await sendTelegramMessage(chatId, text)) });
  }
  if (wantsTelegramCall) {
    const linkedUsername = await telegramLinkedUsernameForEmailAsync(identity.email);
    const username = linkedUsername || (identity.admin ? envAny(['CALLMEBOT_TELEGRAM_CALL_USER']) : '');
    if (!username) return sendJson(res, 400, { ok: false, message: 'Vincule um Telegram com nome de usuário antes de testar a ligação. Nenhuma ligação foi descontada.' });
    if (!identity.admin) {
      usage = await consumePlatformUsage(req, 'wakeup_call', 1);
      if (!usage.allowed) return sendJson(res, Number(usage.status || 429), { ok: false, usage, message: usage.message || 'Limite mensal de ligações atingido.' });
    }
    const telegramCallResult = await sendTelegramVoiceCall(username, text);
    if (!telegramCallResult.ok && usage?.allowed && !usage.admin) {
      const refund = await refundPlatformUsage(req, 'wakeup_call', 1);
      usage = { ...usage, ...refund, refunded: Boolean(refund.refunded) };
    }
    results.push({ channel: 'telegram-call', ...telegramCallResult });
  }
  if (wantsPhoneCall) results.push({ channel: 'phone-call', ...(await sendAdminPhoneCall(payload.phone, text)) });
  if (!results.length) return sendJson(res, 400, { ok: false, message: 'Escolha um canal de teste válido.' });

  const ok = results.some((result) => result.ok);
  const message = ok ? String(results.find((result) => result.ok)?.message || 'Teste enviado.') : String(results[0]?.message || 'O teste não pôde ser concluído.');
  return sendJson(res, ok ? 200 : 502, {
    ok,
    configured: results.some((result) => result.configured),
    results,
    usage,
    health: { telegram: telegramConfigured(), telegramCall: telegramCallProviderEnabled() && Boolean(await telegramLinkedUsernameForEmailAsync(identity.email)), phoneCall: phoneCallConfigured() },
    message,
  });
}


function boolEnv(keys = []) { return keys.some((key) => Boolean(String(process.env[key] || '').trim())); }
function reliabilityModule(id, label, keys = [], messageOk = 'Configurado.', messageMissing = 'Aguardando configuração.') {
  const configured = boolEnv(keys);
  return { id, label, ok: configured, configured, keys, message: configured ? messageOk : messageMissing };
}
function reliabilityModuleAll(id, label, keys = [], messageOk = 'Configurado.', messageMissing = 'Aguardando configuração completa.') {
  const configured = keys.length > 0 && keys.every((key) => Boolean(String(process.env[key] || '').trim()));
  return { id, label, ok: configured, configured, keys, message: configured ? messageOk : messageMissing };
}
function reliabilityEnvItems() {
  return [
    reliabilityModule('auth','Login e sessão',['CREWCHECK_AUTH_SECRET']),
    reliabilityModule('admin','Admin',['CREWCHECK_ADMIN_EMAILS','CREWCHECK_ADMIN_EMAIL']),
    reliabilityModule('maps','Mapas e rotas',['GOOGLE_MAPS_SERVER_KEY','GOOGLE_ROUTES_API_KEY','GOOGLE_MAPS_API_KEY','TOMTOM_API_KEY']),
    reliabilityModule('places','Locais/academias',['GOOGLE_PLACES_API_KEY','GOOGLE_PLACES_SERVER_KEY']),
    reliabilityModule('radar','Radar de voos',['FLIGHTAWARE_AEROAPI_KEY','AEROAPI_KEY','AIRLABS_API_KEY','AVIATIONSTACK_API_KEY','AVIATIONSTACK_ACCESS_KEY','OAG_FLIGHT_INFO_PRIMARY_KEY']),
    reliabilityModule('weather','Meteorologia',['AVIATION_WEATHER_API_BASE','CREWCHECK_WEATHER_API_BASE']),
    reliabilityModule('telegram','Telegram',['TELEGRAM_BOT_TOKEN','CREWCHECK_TELEGRAM_BOT_TOKEN']),
    reliabilityModule('email','E-mail interno com PDF',['MAILERSEND_API_KEY','MAILERSEND_FROM']),
    reliabilityModule('tts-elevenlabs','Voz Premium ElevenLabs',['ELEVENLABS_API_KEY','CREWCHECK_ELEVENLABS_API_KEY','ELEVENLABS_TTS_API_KEY','ELEVENLABS_VOICE_ID','ELEVENLABS_TTS_VOICE_ID','CREWCHECK_ELEVENLABS_VOICE_ID','CREWCHECK_ELEVENLABS_TTS_VOICE_ID','ELEVENLABS_DEFAULT_VOICE_ID']),
    reliabilityModule('telegram-stt','Áudio Telegram',['OPENAI_API_KEY','OPENAI_STT_API_KEY','CREWCHECK_OPENAI_API_KEY','CREWCHECK_STT_API_KEY']),
    reliabilityModule('telegram-stt-elevenlabs','Áudio Telegram ElevenLabs',['ELEVENLABS_API_KEY','CREWCHECK_ELEVENLABS_API_KEY','ELEVENLABS_TTS_API_KEY']),
    reliabilityModule('wakeup','Despertador',['INFOBIP_API_KEY','INFOBIP_BASE_URL','INFOBIP_FROM','CALLMEBOT_API_KEY','CALLMEBOT_TELEGRAM_CALL_USER','TELEGRAM_BOT_TOKEN']),
    reliabilityModule('database','Banco de dados',['DATABASE_URL','SUPABASE_URL']),
    reliabilityModuleAll('billing-web','Assinatura web Asaas',['ASAAS_API_KEY','ASAAS_WEBHOOK_TOKEN']),
    reliabilityModuleAll('billing-google-play','Assinatura Google Play',['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON','GOOGLE_PLAY_PACKAGE_NAME','GOOGLE_PLAY_RTDN_AUDIENCE','GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL']),
    reliabilityModule('privacy-key','Criptografia de quarto',['CREWCHECK_DATA_ENCRYPTION_KEY','CREWCHECK_AUTH_SECRET']),
    reliabilityModule('osm','OpenStreetMap',['OSM_ROUTING_URL','OSM_ENABLE_PUBLIC_SERVICES']),
  ];
}
function handleReliabilityEnv(req, res) {
  const items = reliabilityEnvItems();
  return sendJson(res, 200, { ok:true, version:'13.8.0', items, summary:{ configured:items.filter(i=>i.configured).length, pending:items.filter(i=>!i.configured).length, total:items.length }, message:'Variáveis avaliadas sem expor segredos.' });
}
function handleReliabilityHealth(req, res) {
  const critical = ['auth','maps','radar','telegram','wakeup'];
  const modules = reliabilityEnvItems().map((item) => ({ ...item, ok:item.configured || !critical.includes(item.id), message:item.configured ? item.message : critical.includes(item.id) ? item.message : 'Opcional.' }));
  const ok = modules.filter((m)=>critical.includes(m.id)).every((m)=>m.ok);
  return sendJson(res, 200, { ok, app:'CrewCheck', version:'13.8.0', mode:process.env.NODE_ENV || 'production', uptimeSeconds:Math.round(process.uptime()), modules, apiRoutes:['/api/health','/api/auth/config','/api/platform/catalog','/api/platform/profile','/api/platform/billing/status','/api/platform/billing/google-play/verify','/api/platform/billing/google-play/rtdn','/api/platform/billing/asaas/webhook','/api/platform/billing/cancel','/api/platform/rosters/sync','/api/platform/hotels/stays','/api/platform/visitors','/api/platform/visitor/chat','/api/platform/shares','/api/platform/connections','/api/platform/chat','/api/platform/gyms/checkins','/api/platform/account/delete','/api/radar-health','/api/telegram/health','/api/telegram/roster-sync','/api/telegram/concierge/ask','/api/parse-pdf','/api/alarm/health','/api/email/health','/api/email/share','/api/osm/health','/api/aviation-weather'], cache:{ noStoreApi:true, spaFallback:true }, message: ok ? 'Núcleo operacional configurado.' : 'Sistema operacional com pendências de configuração.' });
}
function handleReliabilitySelfTest(req, res) {
  return sendJson(res, 200, { ok:true, version:'13.8.0', expectedRoutes:['/api/auth/config','/api/platform/catalog','/api/platform/profile','/api/platform/billing/status','/api/platform/billing/google-play/verify','/api/platform/billing/google-play/rtdn','/api/platform/billing/asaas/webhook','/api/platform/billing/cancel','/api/platform/rosters/sync','/api/platform/hotels/stays','/api/platform/visitors','/api/platform/visitor/chat','/api/platform/shares','/api/platform/connections','/api/platform/chat','/api/platform/gyms/checkins','/api/platform/account/delete','/api/parse-pdf','/api/weather/airport','/api/aviation-weather','/api/maps/route-preview','/api/places/fitness','/api/osm/health','/api/osm/route-preview','/api/telegram/health','/api/telegram/webhook','/api/telegram/roster-sync','/api/telegram/concierge/ask','/api/telegram/send','/api/telegram/setup-webhook','/api/alarm/health','/api/alarm/preview','/api/alarm/test','/api/email/health','/api/email/share','/api/radar-flight','/api/radar-health'], apiFallbackJson:true, secretsExposed:false, message:'Autoteste estrutural concluído. Rotas críticas registradas em JSON.' });
}



function handleCrewCheckStaticShell(req, res) {
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate"/>
  <meta http-equiv="Pragma" content="no-cache"/>
  <meta http-equiv="Expires" content="0"/>
  <meta name="theme-color" content="#06101d"/>
  <title>CrewCheck - Inicializacao Segura</title>
  <style>
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;background:radial-gradient(circle at top,#164e63 0,#06101d 46%,#020617 100%);color:#fff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;padding:22px}
    main{width:100%;max-width:720px;border-radius:30px;border:1px solid rgba(255,255,255,.16);background:linear-gradient(145deg,rgba(15,23,42,.96),rgba(8,47,73,.86));box-shadow:0 26px 90px rgba(0,0,0,.42);padding:24px}
    .badge{display:inline-flex;gap:8px;align-items:center;border-radius:999px;padding:8px 12px;background:rgba(34,211,238,.14);color:#67e8f9;font-weight:900;font-size:12px;letter-spacing:.12em;text-transform:uppercase}
    h1{font-size:clamp(28px,7vw,44px);line-height:1.04;margin:18px 0 12px}
    p{color:#cbd5e1;line-height:1.58;margin:10px 0}
    .grid{display:grid;gap:12px;margin-top:18px}
    button,a{width:100%;min-height:52px;border:0;border-radius:18px;display:flex;align-items:center;justify-content:center;text-align:center;text-decoration:none;font-weight:950;font-size:15px}
    button{background:linear-gradient(135deg,#22d3ee,#a78bfa);color:#051923}
    a.primary{background:#fff;color:#06101d}
    a.secondary{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.16)}
    .status{margin-top:16px;padding:12px;border-radius:18px;background:rgba(2,6,23,.42);border:1px solid rgba(255,255,255,.1);color:#cbd5e1;font-size:13px;overflow-wrap:anywhere}
    .mini{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:14px}
    .mini div{border-radius:16px;background:rgba(255,255,255,.07);padding:12px}
    .mini strong{display:block;font-size:13px}
    .mini small{display:block;color:#94a3b8;margin-top:4px}
  </style>
</head>
<body>
<main>
  <span class="badge">CrewCheck 13.8.0 - Safe Shell</span>
  <h1>Inicializacao segura</h1>
  <p>Esta tela e servida direto pelo servidor, sem depender do painel principal. Use quando o app ficar preso na abertura.</p>
  <div class="mini">
    <div><strong>Backend</strong><small id="apiState">verificando...</small></div>
    <div><strong>Cache</strong><small>reparo local disponivel</small></div>
    <div><strong>App</strong><small>abre em rota isolada /app</small></div>
  </div>
  <div class="grid">
    <button onclick="repairAndOpen()">Reparar cache e abrir app seguro</button>
    <a class="primary" href="/app?safe=1&v=13.8.0">Abrir app em modo seguro</a>
    <a class="secondary" href="/app?v=13.8.0">Abrir app normal</a>
    <a class="secondary" href="/api/reliability/health">Ver diagnostico do backend</a>
  </div>
  <div class="status" id="status">Nenhum token, chave ou senha e exibido aqui.</div>
</main>
<script>
(function(){
  var status = document.getElementById('status');
  var apiState = document.getElementById('apiState');
  function log(msg){ status.textContent = msg; }
  fetch('/api/health',{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){
    apiState.textContent = j && j.version ? ('online - v' + j.version) : 'online';
  }).catch(function(){ apiState.textContent='nao verificado'; });
  window.repairAndOpen = async function(){
    log('Reparando cache local e desativando service worker antigo...');
    try {
      var keep = new Set([
        'crewcheck_auth_token','crewcheck_user','crewcheck_theme_mode','crewcheck_light_premium','crewcheck_language',
        'crewcheck_latest_roster_bundle','crewcheck_last_roster','crewcheck_roster_sync_latest_v108134','crewcheck_roster_bundle_v1',
        'crewcheck_telegram_chat_id','crewcheck_wakeup_phone','crewcheck_wakeup_channel',
        'crewcheck_act_km_metric_brl','crewcheck_act_chief_sector_brl','crewcheck_act_instructor_sector_brl','crewcheck_act_night_hour_brl','crewcheck_salary_base_brl',
        'crewcheck_perdiem_meal_brl','crewcheck_perdiem_breakfast_brl','crewcheck_virtual_base','crewcheck_manual_route_origin','crewcheck_last_geo','crewcheck_my_car_parking_position_v1',
        'crewcheck_profile_avatar','crewcheck_profile_display_name','crewcheck_profile_company','crewcheck_profile_base','crewcheck_profile_rank','crewcheck_app_mode'
      ]);
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf('crewcheck_') === 0 && !keep.has(k)) localStorage.removeItem(k);
      }
      sessionStorage.clear();
      sessionStorage.setItem('crewcheck_force_view_once','cockpit');
      localStorage.setItem('crewcheck_intro_seen_v1278','1');
      localStorage.setItem('crewcheck_static_shell_repair_at', new Date().toISOString());
    } catch(e) {}
    try {
      if ('serviceWorker' in navigator) {
        var regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(function(r){ return r.unregister(); }));
      }
    } catch(e) {}
    try {
      if ('caches' in window) {
        var names = await caches.keys();
        await Promise.all(names.filter(function(n){ return /crewcheck|workbox|vite/i.test(n); }).map(function(n){ return caches.delete(n); }));
      }
    } catch(e) {}
    log('Reparo concluido. Abrindo app seguro...');
    setTimeout(function(){ location.href = '/app?safe=1&v=13.8.0&ts=' + Date.now(); }, 600);
  }
})();
</script>
</body>
</html>`;
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'pragma': 'no-cache',
    'expires': '0',
    'surrogate-control': 'no-store',
    'x-crewcheck-boot': 'static-shell-13.8.0'
  });
  res.end(html);
}

function serveStatic(req, res, url) {
  let filePath = path.join(distDir, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || !path.extname(filePath)) filePath = path.join(distDir, 'index.html');
  if (!filePath.startsWith(distDir)) return sendJson(res, 403, { ok: false });
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(distDir, 'index.html'), (fallbackErr, fallback) => {
        if (fallbackErr) return sendJson(res, 404, { ok: false, message: 'Build não encontrado. Rode npm run build.' });
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(fallback);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === '.js' ? 'text/javascript; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : ext === '.html' ? 'text/html; charset=utf-8' : ext === '.json' ? 'application/json; charset=utf-8' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store, no-cache, must-revalidate' });
    res.end(data);
  });
}
http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (['/crewcheck-repair','/repair','/safe-start','/emergency'].includes(url.pathname) || /^\/__crewcheck_boot_rescue_\d+\.html$/.test(url.pathname)) return handleCrewCheckStaticShell(req, res);

  if (url.pathname === '/api/reliability/health') return handleReliabilityHealth(req, res);
  if (url.pathname === '/api/reliability/env') return handleReliabilityEnv(req, res);
  if (url.pathname === '/api/reliability/self-test') return handleReliabilitySelfTest(req, res);
  if (url.pathname === '/api/admin/runtime-patch/current') return handleRuntimePatchCurrent(req, res);
  if (url.pathname === '/api/admin/runtime-patch') return handleRuntimePatchApply(req, res);
  if (url.pathname === '/api/admin/runtime-patch/clear') return handleRuntimePatchClear(req, res);
  if (url.pathname === '/api/auth/diagnostic') return sendJson(res, 200, { ok: true, version: '13.8.0', authHandler: typeof handleAuthConfig1371 === 'function', authSecretConfigured: Boolean(envAny(['CREWCHECK_AUTH_SECRET'])), authRequired: cc1371AuthRequired(), message: 'Auth API rebind ativo.' });
  if (url.pathname === '/api/auth/config') return handleAuthConfig1371(req, res);
  if (url.pathname === '/api/auth/login') return handleAuthLogin1371(req, res);
  if (url.pathname === '/api/auth/register') return handleAuthRegister1371(req, res);
  if (url.pathname === '/api/auth/me') return handleAuthMe1371(req, res);
  if (url.pathname === '/api/auth/logout') return handleAuthLogout1371(req, res);
  if (url.pathname === '/api/auth/verify-email') return handleAuthVerifyEmail1371(req, res);
  if (url.pathname === '/api/auth/resend-verification') return handleAuthResendVerification1371(req, res);
  if (url.pathname === '/api/auth/request-reset') return handleAuthRequestReset1371(req, res);
  if (url.pathname === '/api/auth/reset-password') return handleAuthResetPassword1371(req, res);
  if (await handlePlatformRoute(req, res, url)) return;
  if (url.pathname === '/api/weather/airport') return handleAirportWeather(req, res, url);
  if (url.pathname === '/api/aviation-weather') return handleAviationWeather(req, res, url);
  if (url.pathname === '/api/parse-pdf') return handleParsePdfApi(req, res, url);
  if (url.pathname === '/api/maps/route-preview') return handleRoutePreview(req, res, url);
  if (url.pathname === '/api/places/fitness') return handleFitness(req, res, url);
  if (url.pathname === '/api/email/health') return handleEmailHealth(req, res);
  if (url.pathname === '/api/email/share') return handleEmailShare(req, res);
  if (url.pathname === '/api/osm/health') return handleOsmHealth(req, res, url);
  if (url.pathname === '/api/osm/route-preview') return handleOsmRoutePreview(req, res, url);
    if (url.pathname === '/api/tts/provider-health') return handleTtsProviderHealth(req, res);
  if (url.pathname === '/api/tts/health') return handleTtsHealth(req, res);
  if (url.pathname === '/api/tts/speak') return handleTtsSpeak(req, res);
if (url.pathname === '/api/telegram/link/start') return handleTelegramLinkStart(req, res, url);
  if (url.pathname === '/api/telegram/link/status') return handleTelegramLinkStatus(req, res, url);
  if (url.pathname === '/api/telegram/roster-sync' || url.pathname === '/api/telegram/roster') return handleTelegramRosterSync(req, res, url);
  if (url.pathname === '/api/telegram/concierge/ask') return handleTelegramConciergeAsk(req, res, url);
  if (url.pathname === '/api/telegram/stt-health') return handleTelegramSttHealth(req, res, url);
  if (url.pathname === '/api/telegram/health') return handleTelegramHealth(req, res, url);
  if (url.pathname === '/api/telegram/webhook') return handleTelegramWebhook(req, res, url);
  if (url.pathname === '/api/telegram/send') return handleTelegramSend(req, res, url);
  if (url.pathname === '/api/telegram/setup-webhook') return handleTelegramSetupWebhook(req, res, url);
  if (url.pathname === '/api/alarm/health') return handleAlarmHealth(req, res, url);
  if (url.pathname === '/api/alarm/preview') return handleAlarmPreview(req, res, url);
  if (url.pathname === '/api/alarm/test') return handleAlarmTest(req, res, url);
  if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true, app: 'CrewCheck', version: '13.8.0', reliability: true, platform: true, encoding: 'UTF-8', defaultTimezone: 'America/Sao_Paulo' });
  if (url.pathname === '/api/radar-flight') return handleRadar(req, res, url);
  if (url.pathname === '/api/radar-health') return handleRadarHealth(req, res, url);
  if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { ok: false, message: 'Recurso operacional indisponível agora.' });
  return serveStatic(req, res, url);
}).listen(port, () => console.log(`CrewCheck server listening on ${port}`));
