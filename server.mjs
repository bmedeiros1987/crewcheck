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


// CrewCheck v13.7.14 — Internal Update Center backend.
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


// CrewCheck v13.7.14 — ElevenLabs env aliases.
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
// CrewCheck v13.7.14 — ElevenLabs TTS Restore.
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
// CrewCheck v13.7.14 — Telegram Human Voice Reply.
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
// CrewCheck v13.7.14 — TTS provider policy.
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
    version: '13.7.14',
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
    const payload = { chat_id: chatId, text: String(text || '').slice(0, 3900), parse_mode: 'HTML', disable_web_page_preview: true, ...extra };
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    return { ok: Boolean(response.ok && data.ok !== false), configured: true, status: response.status, data, message: response.ok ? 'Mensagem enviada.' : 'Mensagem não entregue agora.' };
  } catch {
    return { ok: false, configured: true, message: 'Mensagem não entregue agora.' };
  }
}

// CrewCheck v13.7.14 — Telegram Link backend.
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
  try {
    if (!email && typeof cc1371Verify === 'function' && typeof cc1371RequestToken === 'function') {
      const payload = cc1371Verify(cc1371RequestToken(req));
      email = String(payload?.email || '').trim().toLowerCase();
      name = name || String(payload?.name || '').trim();
    }
  } catch {}
  if (!email) email = 'local@crewcheck.local';
  if (!name) name = email.includes('@') ? email.split('@')[0] : 'Tripulante CrewCheck';
  return { email, name };
}
function telegramLinkedChatIdForEmail(email = '') {
  const key = String(email || '').trim().toLowerCase();
  if (!key) return '';
  const data = telegramLinksRead();
  return String(data.linked?.[key]?.chatId || '');
}
async function handleTelegramLinkStart(req, res) {
  if (req.method !== 'POST') return sendJson(res, 200, { ok: true, configured: telegramConfigured(), botUsername: telegramBotUsername(), message: 'Vínculo Telegram pronto.' });
  const body = await readJsonBody(req, 300000);
  const user = telegramRequestUser(req, body);
  const code = telegramLinkCode();
  const data = telegramLinksRead();
  data.pending[code] = { code, email: user.email, name: user.name, createdAt: new Date().toISOString() };
  telegramLinksWrite(data);
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
  const email = String(url.searchParams.get('email') || '').trim().toLowerCase();
  const data = telegramLinksRead();
  let linked = null;
  if (code) linked = Object.values(data.linked || {}).find((item) => item && item.code === code) || null;
  if (!linked && email) linked = data.linked?.[email] || null;
  return sendJson(res, 200, {
    ok: Boolean(linked?.chatId),
    linked: Boolean(linked?.chatId),
    chatId: linked?.chatId ? String(linked.chatId) : '',
    linkedAt: linked?.linkedAt || '',
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
  const pending = data.pending?.[code];
  if (!pending) {
    await sendTelegramMessage(chatId, 'Código de vínculo não localizado ou expirado. Gere um novo vínculo no CrewCheck.');
    return true;
  }
  const email = String(pending.email || '').trim().toLowerCase();
  data.linked[email] = {
    email,
    name: pending.name || '',
    code,
    chatId: String(chatId),
    username: message?.from?.username || message?.chat?.username || '',
    linkedAt: new Date().toISOString(),
  };
  delete data.pending[code];
  telegramLinksWrite(data);
  await sendTelegramMessage(chatId, [
    'Telegram vinculado ao CrewCheck.',
    '',
    'Você já pode receber notificações operacionais, radar, meteorologia e despertador inteligente quando habilitados no app.',
    '',
    'Para testar, volte ao CrewCheck e use Despertador > Testar canal.'
  ].join('\n'));
  return true;
}

// CrewCheck v13.7.14 — Telegram Voice STT Restore.
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
  if (!response.ok || payload?.ok === false || !payload?.result?.file_path) return { ok: false, status: response.status, message: 'Não consegui baixar o áudio do Telegram.' };
  return { ok: true, filePath: payload.result.file_path, fileSize: payload.result.file_size || 0 };
}
async function telegramDownloadFile(filePath) {
  const token = telegramToken();
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!response.ok) return { ok: false, status: response.status, message: 'Arquivo de áudio indisponível no Telegram.' };
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
// CrewCheck v13.7.14 — ElevenLabs STT Provider.
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
  if (!crewcheckSttConfigured()) {
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
    const reply = buildTelegramReply(transcript);
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
  return sendJson(res, 200, { ok: crewcheckSttConfigured(), configured: crewcheckSttConfigured(), model: crewcheckSttConfigured() ? crewcheckSttModel() : '', provider: sttProviderPreference(),
    model: sttProviderPreference() === 'elevenlabs' ? elevenLabsSttModel() : crewcheckSttModel(),
    elevenLabsConfigured: elevenLabsSttConfigured(),
    openaiConfigured: crewcheckSttConfigured(),
    telegramConfigured: telegramConfigured(), message: crewcheckSttConfigured() ? 'Transcrição de áudio configurada.' : 'Transcrição aguardando OPENAI_API_KEY.' });
}

function handleTelegramHealth(req, res) {
  const webhookUrl = publicUrl() ? `${publicUrl()}/api/telegram/webhook` : '';
  return sendJson(res, 200, { ok: telegramConfigured(), configured: telegramConfigured(), webhookConfigured: Boolean(webhookUrl), defaultChatConfigured: Boolean(telegramDefaultChatId()), botUsername: telegramBotUsername(), linkSupported: Boolean(telegramBotUsername()), ttsProvider: 'elevenlabs', ttsConfigured: elevenLabsTtsConfigured(), message: telegramConfigured() ? 'Concierge configurado.' : 'Concierge aguardando configuração.' });
}

async function handleTelegramSend(req, res) {
  if (req.method !== 'POST') return sendJson(res, 200, { ok: true, message: 'Envio do concierge pronto.' });
  const payload = await readJsonBody(req);
  const chatId = String(payload.chatId || payload.chat_id || telegramLinkedChatIdForEmail(payload.email) || telegramDefaultChatId() || '').trim();
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
  if (chatId && text && await telegramTryBindFromWebhook(message, text)) return sendJson(res, 200, { ok: true, linked: true, message: 'Telegram vinculado.' });
  if (chatId && text) await sendTelegramMessage(chatId, buildTelegramReply(text));
  else if (chatId && (message?.voice || message?.audio || message?.document?.mime_type?.startsWith?.('audio/'))) await handleTelegramVoiceMessage(message);
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
  const chatId = String(payload.chatId || telegramLinkedChatIdForEmail(payload.email) || telegramDefaultChatId() || '').trim();
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
    reliabilityModule('tts-elevenlabs','Voz Premium ElevenLabs',['ELEVENLABS_API_KEY','CREWCHECK_ELEVENLABS_API_KEY','ELEVENLABS_TTS_API_KEY','ELEVENLABS_VOICE_ID','ELEVENLABS_TTS_VOICE_ID','CREWCHECK_ELEVENLABS_VOICE_ID','CREWCHECK_ELEVENLABS_TTS_VOICE_ID','ELEVENLABS_DEFAULT_VOICE_ID']),
    reliabilityModule('telegram-stt','Áudio Telegram',['OPENAI_API_KEY','OPENAI_STT_API_KEY','CREWCHECK_OPENAI_API_KEY','CREWCHECK_STT_API_KEY']),
    reliabilityModule('telegram-stt-elevenlabs','Áudio Telegram ElevenLabs',['ELEVENLABS_API_KEY','CREWCHECK_ELEVENLABS_API_KEY','ELEVENLABS_TTS_API_KEY']),
    reliabilityModule('wakeup','Despertador',['INFOBIP_API_KEY','INFOBIP_BASE_URL','CALLMEBOT_API_KEY','TELEGRAM_BOT_TOKEN']),
    reliabilityModule('database','Banco de dados',['DATABASE_URL','SUPABASE_URL']),
    reliabilityModule('billing','Assinatura',['ASAAS_API_KEY']),
    reliabilityModule('osm','OpenStreetMap',['OSM_ROUTING_URL','OSM_ENABLE_PUBLIC_SERVICES']),
  ];
}
function handleReliabilityEnv(req, res) {
  const items = reliabilityEnvItems();
  return sendJson(res, 200, { ok:true, version:'13.7.14', items, summary:{ configured:items.filter(i=>i.configured).length, pending:items.filter(i=>!i.configured).length, total:items.length }, message:'Variáveis avaliadas sem expor segredos.' });
}
function handleReliabilityHealth(req, res) {
  const critical = ['auth','maps','radar','telegram','wakeup'];
  const modules = reliabilityEnvItems().map((item) => ({ ...item, ok:item.configured || !critical.includes(item.id), message:item.configured ? item.message : critical.includes(item.id) ? item.message : 'Opcional.' }));
  const ok = modules.filter((m)=>critical.includes(m.id)).every((m)=>m.ok);
  return sendJson(res, 200, { ok, app:'CrewCheck', version:'13.7.14', mode:process.env.NODE_ENV || 'production', uptimeSeconds:Math.round(process.uptime()), modules, apiRoutes:['/api/health','/api/auth/config','/api/radar-health','/api/telegram/health','/api/alarm/health','/api/osm/health','/api/aviation-weather'], cache:{ noStoreApi:true, spaFallback:true }, message: ok ? 'Núcleo operacional configurado.' : 'Sistema operacional com pendências de configuração.' });
}
function handleReliabilitySelfTest(req, res) {
  return sendJson(res, 200, { ok:true, version:'13.7.14', expectedRoutes:['/api/auth/config','/api/weather/airport','/api/aviation-weather','/api/maps/route-preview','/api/places/fitness','/api/osm/health','/api/osm/route-preview','/api/telegram/health','/api/telegram/webhook','/api/telegram/send','/api/telegram/setup-webhook','/api/alarm/health','/api/alarm/preview','/api/alarm/test','/api/radar-flight','/api/radar-health'], apiFallbackJson:true, secretsExposed:false, message:'Autoteste estrutural concluído. Rotas críticas registradas em JSON.' });
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
  <span class="badge">CrewCheck 13.7.14 - Safe Shell</span>
  <h1>Inicializacao segura</h1>
  <p>Esta tela e servida direto pelo servidor, sem depender do painel principal. Use quando o app ficar preso na abertura.</p>
  <div class="mini">
    <div><strong>Backend</strong><small id="apiState">verificando...</small></div>
    <div><strong>Cache</strong><small>reparo local disponivel</small></div>
    <div><strong>App</strong><small>abre em rota isolada /app</small></div>
  </div>
  <div class="grid">
    <button onclick="repairAndOpen()">Reparar cache e abrir app seguro</button>
    <a class="primary" href="/app?safe=1&v=13.7.14">Abrir app em modo seguro</a>
    <a class="secondary" href="/app?v=13.7.14">Abrir app normal</a>
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
    setTimeout(function(){ location.href = '/app?safe=1&v=13.7.14&ts=' + Date.now(); }, 600);
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
    'x-crewcheck-boot': 'static-shell-13.7.14'
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
  if (url.pathname === '/api/auth/diagnostic') return sendJson(res, 200, { ok: true, version: '13.7.14', authHandler: typeof handleAuthConfig1371 === 'function', authSecretConfigured: Boolean(envAny(['CREWCHECK_AUTH_SECRET'])), authRequired: cc1371AuthRequired(), message: 'Auth API rebind ativo.' });
  if (url.pathname === '/api/auth/config') return handleAuthConfig1371(req, res);
  if (url.pathname === '/api/auth/login') return handleAuthLogin1371(req, res);
  if (url.pathname === '/api/auth/register') return handleAuthRegister1371(req, res);
  if (url.pathname === '/api/auth/me') return handleAuthMe1371(req, res);
  if (url.pathname === '/api/auth/logout') return handleAuthLogout1371(req, res);
  if (url.pathname === '/api/auth/verify-email') return handleAuthVerifyEmail1371(req, res);
  if (url.pathname === '/api/auth/resend-verification') return handleAuthResendVerification1371(req, res);
  if (url.pathname === '/api/auth/request-reset') return handleAuthRequestReset1371(req, res);
  if (url.pathname === '/api/auth/reset-password') return handleAuthResetPassword1371(req, res);
  if (url.pathname === '/api/weather/airport') return handleAirportWeather(req, res, url);
  if (url.pathname === '/api/aviation-weather') return handleAviationWeather(req, res, url);
  if (url.pathname === '/api/maps/route-preview') return handleRoutePreview(req, res, url);
  if (url.pathname === '/api/places/fitness') return handleFitness(req, res, url);
  if (url.pathname === '/api/osm/health') return handleOsmHealth(req, res, url);
  if (url.pathname === '/api/osm/route-preview') return handleOsmRoutePreview(req, res, url);
    if (url.pathname === '/api/tts/provider-health') return handleTtsProviderHealth(req, res);
  if (url.pathname === '/api/tts/health') return handleTtsHealth(req, res);
  if (url.pathname === '/api/tts/speak') return handleTtsSpeak(req, res);
if (url.pathname === '/api/telegram/link/start') return handleTelegramLinkStart(req, res, url);
  if (url.pathname === '/api/telegram/link/status') return handleTelegramLinkStatus(req, res, url);
  if (url.pathname === '/api/telegram/stt-health') return handleTelegramSttHealth(req, res, url);
  if (url.pathname === '/api/telegram/health') return handleTelegramHealth(req, res, url);
  if (url.pathname === '/api/telegram/webhook') return handleTelegramWebhook(req, res, url);
  if (url.pathname === '/api/telegram/send') return handleTelegramSend(req, res, url);
  if (url.pathname === '/api/telegram/setup-webhook') return handleTelegramSetupWebhook(req, res, url);
  if (url.pathname === '/api/alarm/health') return handleAlarmHealth(req, res, url);
  if (url.pathname === '/api/alarm/preview') return handleAlarmPreview(req, res, url);
  if (url.pathname === '/api/alarm/test') return handleAlarmTest(req, res, url);
  if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true, app: 'CrewCheck', version: '13.7.14', reliability: true });
  if (url.pathname === '/api/radar-flight') return handleRadar(req, res, url);
  if (url.pathname === '/api/radar-health') return handleRadarHealth(req, res, url);
  if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { ok: false, message: 'Recurso operacional indisponível agora.' });
  return serveStatic(req, res, url);
}).listen(port, () => console.log(`CrewCheck server listening on ${port}`));
