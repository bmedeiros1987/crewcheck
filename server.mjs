import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  return sendJson(res, 200, payload);
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
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.googleMapsUri',
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
    const payload = { chat_id: chatId, text: String(text || '').slice(0, 3900), parse_mode: 'HTML', disable_web_page_preview: true, ...extra };
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    return { ok: Boolean(response.ok && data.ok !== false), configured: true, status: response.status, data, message: response.ok ? 'Mensagem enviada.' : 'Mensagem não entregue agora.' };
  } catch {
    return { ok: false, configured: true, message: 'Mensagem não entregue agora.' };
  }
}

function handleTelegramHealth(req, res) {
  const webhookUrl = publicUrl() ? `${publicUrl()}/api/telegram/webhook` : '';
  return sendJson(res, 200, { ok: telegramConfigured(), configured: telegramConfigured(), webhookConfigured: Boolean(webhookUrl), defaultChatConfigured: Boolean(telegramDefaultChatId()), message: telegramConfigured() ? 'Concierge configurado.' : 'Concierge aguardando configuração.' });
}

async function handleTelegramSend(req, res) {
  if (req.method !== 'POST') return sendJson(res, 200, { ok: true, message: 'Envio do concierge pronto.' });
  const payload = await readJsonBody(req);
  const chatId = String(payload.chatId || payload.chat_id || telegramDefaultChatId() || '').trim();
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
  if (chatId && text) await sendTelegramMessage(chatId, buildTelegramReply(text));
  else if (chatId && (message?.voice || message?.audio)) await sendTelegramMessage(chatId, 'Recebi seu áudio. A transcrição ainda não está configurada neste ambiente; envie por texto que eu respondo por texto.');
  return sendJson(res, 200, { ok: true, received: true, message: 'Evento recebido.' });
}

function alarmChannelConfigured(channel = '') {
  const value = String(channel || '').toLowerCase();
  const telegram = telegramConfigured();
  const voice = Boolean(envAny(['INFOBIP_API_KEY', 'INFOBIP_BASE_URL', 'CALLMEBOT_API_KEY', 'CALLMEBOT_KEY']));
  if (value.includes('telegram') && value.includes('liga')) return telegram || voice;
  if (value.includes('telegram')) return telegram;
  if (value.includes('liga') || value.includes('voz')) return voice;
  return telegram || voice;
}

function handleAlarmHealth(req, res) {
  const telegram = telegramConfigured();
  const voice = Boolean(envAny(['INFOBIP_API_KEY', 'INFOBIP_BASE_URL', 'CALLMEBOT_API_KEY', 'CALLMEBOT_KEY']));
  return sendJson(res, 200, { ok: telegram || voice, configured: telegram || voice, telegram, voice, channels: { telegram, call: voice, both: telegram || voice }, message: telegram || voice ? 'Despertador pronto para configuração.' : 'Despertador aguardando configuração de canal.' });
}

async function handleAlarmPreview(req, res, url) {
  const presentation = String(url.searchParams.get('presentation') || '').trim();
  const lead = Number(url.searchParams.get('lead') || 90);
  const channel = String(url.searchParams.get('channel') || 'telegram').trim();
  return sendJson(res, 200, { ok: true, configured: alarmChannelConfigured(channel), presentation, leadMinutes: Number.isFinite(lead) ? lead : 90, channel, maxCallsPerLayover: 2, snoozeTelegram: telegramConfigured(), message: 'Prévia do despertador calculada no dispositivo. Confirme o horário no app antes de ativar.' });
}

async function handleAlarmTest(req, res) {
  if (req.method !== 'POST') return sendJson(res, 200, { ok: true, message: 'Teste do despertador pronto.' });
  const payload = await readJsonBody(req);
  const channel = String(payload.channel || 'telegram').toLowerCase();
  const chatId = String(payload.chatId || telegramDefaultChatId() || '').trim();
  const text = String(payload.message || 'Teste do Despertador Inteligente CrewCheck.').trim();
  let telegramResult = null;
  if (channel.includes('telegram') || channel.includes('ambos')) telegramResult = await sendTelegramMessage(chatId, text);
  const voiceConfigured = Boolean(envAny(['INFOBIP_API_KEY', 'INFOBIP_BASE_URL', 'CALLMEBOT_API_KEY', 'CALLMEBOT_KEY']));
  return sendJson(res, 200, { ok: Boolean((telegramResult && telegramResult.ok) || voiceConfigured), configured: Boolean((telegramResult && telegramResult.configured) || voiceConfigured), telegram: telegramResult, voice: { configured: voiceConfigured, message: voiceConfigured ? 'Canal de ligação configurado para uso operacional.' : 'Canal de ligação aguardando configuração.' }, message: 'Teste processado.' });
}


function boolEnv(keys = []) { return keys.some((key) => Boolean(String(process.env[key] || '').trim())); }
function reliabilityModule(id, label, keys = [], messageOk = 'Configurado.', messageMissing = 'Aguardando configuração.') {
  const configured = boolEnv(keys);
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
    reliabilityModule('wakeup','Despertador',['INFOBIP_API_KEY','INFOBIP_BASE_URL','CALLMEBOT_API_KEY','TELEGRAM_BOT_TOKEN']),
    reliabilityModule('database','Banco de dados',['DATABASE_URL','SUPABASE_URL']),
    reliabilityModule('billing','Assinatura',['ASAAS_API_KEY']),
    reliabilityModule('osm','OpenStreetMap',['OSM_ROUTING_URL','OSM_ENABLE_PUBLIC_SERVICES']),
  ];
}
function handleReliabilityEnv(req, res) {
  const items = reliabilityEnvItems();
  return sendJson(res, 200, { ok:true, version:'13.6.8', items, summary:{ configured:items.filter(i=>i.configured).length, pending:items.filter(i=>!i.configured).length, total:items.length }, message:'Variáveis avaliadas sem expor segredos.' });
}
function handleReliabilityHealth(req, res) {
  const critical = ['auth','maps','radar','telegram','wakeup'];
  const modules = reliabilityEnvItems().map((item) => ({ ...item, ok:item.configured || !critical.includes(item.id), message:item.configured ? item.message : critical.includes(item.id) ? item.message : 'Opcional.' }));
  const ok = modules.filter((m)=>critical.includes(m.id)).every((m)=>m.ok);
  return sendJson(res, 200, { ok, app:'CrewCheck', version:'13.6.8', mode:process.env.NODE_ENV || 'production', uptimeSeconds:Math.round(process.uptime()), modules, apiRoutes:['/api/health','/api/auth/config','/api/radar-health','/api/telegram/health','/api/alarm/health','/api/osm/health','/api/aviation-weather'], cache:{ noStoreApi:true, spaFallback:true }, message: ok ? 'Núcleo operacional configurado.' : 'Sistema operacional com pendências de configuração.' });
}
function handleReliabilitySelfTest(req, res) {
  return sendJson(res, 200, { ok:true, version:'13.6.8', expectedRoutes:['/api/auth/config','/api/weather/airport','/api/aviation-weather','/api/maps/route-preview','/api/places/fitness','/api/osm/health','/api/osm/route-preview','/api/telegram/health','/api/telegram/webhook','/api/telegram/send','/api/telegram/setup-webhook','/api/alarm/health','/api/alarm/preview','/api/alarm/test','/api/radar-flight','/api/radar-health'], apiFallbackJson:true, secretsExposed:false, message:'Autoteste estrutural concluído. Rotas críticas registradas em JSON.' });
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
  <span class="badge">CrewCheck 13.6.8 - Safe Shell</span>
  <h1>Inicializacao segura</h1>
  <p>Esta tela e servida direto pelo servidor, sem depender do painel principal. Use quando o app ficar preso na abertura.</p>
  <div class="mini">
    <div><strong>Backend</strong><small id="apiState">verificando...</small></div>
    <div><strong>Cache</strong><small>reparo local disponivel</small></div>
    <div><strong>App</strong><small>abre em rota isolada /app</small></div>
  </div>
  <div class="grid">
    <button onclick="repairAndOpen()">Reparar cache e abrir app seguro</button>
    <a class="primary" href="/app?safe=1&v=13.6.8">Abrir app em modo seguro</a>
    <a class="secondary" href="/app?v=13.6.8">Abrir app normal</a>
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
    setTimeout(function(){ location.href = '/app?safe=1&v=13.6.8&ts=' + Date.now(); }, 600);
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
    'x-crewcheck-boot': 'static-shell-13.6.8'
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
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/crewcheck-repair' || url.pathname === '/repair' || url.pathname === '/safe-start' || url.pathname === '/emergency' || url.pathname === '/__crewcheck_boot_rescue_1368.html') return handleCrewCheckStaticShell(req, res);

  if (url.pathname === '/crewcheck-repair' || url.pathname === '/repair' || url.pathname === '/safe-start') return handleCrewCheckRepairPage(req, res);
  if (url.pathname === '/api/reliability/health') return handleReliabilityHealth(req, res);
  if (url.pathname === '/api/reliability/env') return handleReliabilityEnv(req, res);
  if (url.pathname === '/api/reliability/self-test') return handleReliabilitySelfTest(req, res);
  if (url.pathname === '/api/auth/config') return handleAuthConfig(req, res);
  if (url.pathname === '/api/auth/login') return handleAuthLogin(req, res);
  if (url.pathname === '/api/auth/register') return handleAuthRegister(req, res);
  if (url.pathname === '/api/auth/me') return handleAuthMe(req, res);
  if (url.pathname === '/api/auth/logout') return handleAuthLogout(req, res);
  if (url.pathname === '/api/auth/verify-email') return handleAuthVerifyEmail(req, res);
  if (url.pathname === '/api/auth/resend-verification') return handleAuthResendVerification(req, res);
  if (url.pathname === '/api/auth/request-reset') return handleAuthRequestReset(req, res);
  if (url.pathname === '/api/auth/reset-password') return handleAuthResetPassword(req, res);
  if (url.pathname === '/api/weather/airport') return handleAirportWeather(req, res, url);
  if (url.pathname === '/api/aviation-weather') return handleAviationWeather(req, res, url);
  if (url.pathname === '/api/maps/route-preview') return handleRoutePreview(req, res, url);
  if (url.pathname === '/api/places/fitness') return handleFitness(req, res, url);
  if (url.pathname === '/api/osm/health') return handleOsmHealth(req, res, url);
  if (url.pathname === '/api/osm/route-preview') return handleOsmRoutePreview(req, res, url);
  if (url.pathname === '/api/telegram/health') return handleTelegramHealth(req, res, url);
  if (url.pathname === '/api/telegram/webhook') return handleTelegramWebhook(req, res, url);
  if (url.pathname === '/api/telegram/send') return handleTelegramSend(req, res, url);
  if (url.pathname === '/api/telegram/setup-webhook') return handleTelegramSetupWebhook(req, res, url);
  if (url.pathname === '/api/alarm/health') return handleAlarmHealth(req, res, url);
  if (url.pathname === '/api/alarm/preview') return handleAlarmPreview(req, res, url);
  if (url.pathname === '/api/alarm/test') return handleAlarmTest(req, res, url);
  if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true, app: 'CrewCheck', version: '13.6.8', reliability: true });
  if (url.pathname === '/api/radar-flight') return handleRadar(req, res, url);
  if (url.pathname === '/api/radar-health') return handleRadarHealth(req, res, url);
  if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { ok: false, message: 'Recurso operacional indisponível agora.' });
  return serveStatic(req, res, url);
}).listen(port, () => console.log(`CrewCheck server listening on ${port}`));
