import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePdfOnServer } from './server/rosterParser.mjs';
import { handlePlatformRoute, consumePlatformUsage, handlePlatformVisitorTelegram } from './server/platform.mjs';

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
  const requestedMode = String(url.searchParams.get('mode') || 'driving').toLowerCase();
  const travelMode = requestedMode === 'transit' ? 'TRANSIT' : 'DRIVE';
  if (!origin || !destination) return sendJson(res, 400, { ok: false, message: 'Origem e destino são necessários.' });
  if (!key) return sendJson(res, 200, { ok: false, configured: false, mes…33260 tokens truncated…;
    if (!identity.admin) {
      usage = await consumePlatformUsage(req, 'wakeup_call', 1);
      if (!usage.allowed) return sendJson(res, Number(usage.status || 429), { ok: false, usage, message: usage.message || 'Limite mensal de ligações atingido.' });
    }
    results.push({ channel: 'telegram-call', ...(await sendTelegramVoiceCall(username, text)) });
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
    reliabilityModule('database','Banco Aiven MySQL',['DATABASE_URL','CREWCHECK_DATABASE_URL','MYSQL_URL']),
    reliabilityModuleAll('billing-web','Assinatura web Asaas',['ASAAS_API_KEY','ASAAS_WEBHOOK_TOKEN']),
    reliabilityModuleAll('billing-google-play','Assinatura Google Play',['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON','GOOGLE_PLAY_PACKAGE_NAME','GOOGLE_PLAY_RTDN_AUDIENCE','GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL']),
    reliabilityModule('privacy-key','Criptografia de quarto',['CREWCHECK_DATA_ENCRYPTION_KEY','CREWCHECK_AUTH_SECRET']),
    reliabilityModule('osm','OpenStreetMap',['OSM_ROUTING_URL','OSM_ENABLE_PUBLIC_SERVICES']),
  ];
}
function handleReliabilityEnv(req, res) {
  const items = reliabilityEnvItems();
  return sendJson(res, 200, { ok:true, version:'13.8.8', items, summary:{ configured:items.filter(i=>i.configured).length, pending:items.filter(i=>!i.configured).length, total:items.length }, message:'Variáveis avaliadas sem expor segredos.' });
}
function handleReliabilityHealth(req, res) {
  const critical = ['auth','maps','radar','telegram','wakeup'];
  const modules = reliabilityEnvItems().map((item) => ({ ...item, ok:item.configured || !critical.includes(item.id), message:item.configured ? item.message : critical.includes(item.id) ? item.message : 'Opcional.' }));
  const ok = modules.filter((m)=>critical.includes(m.id)).every((m)=>m.ok);
return sendJson(res, 200, { ok, app:'CrewCheck', version:'13.8.8', mode:process.env.NODE_ENV || 'production', uptimeSeconds:Math.round(process.uptime()), modules, apiRoutes:['/api/health','/api/auth/config','/api/platform/catalog','/api/platform/database/health','/api/platform/profile','/api/platform/billing/status','/api/platform/billing/google-play/verify','/api/platform/billing/google-play/rtdn','/api/platform/billing/asaas/webhook','/api/platform/billing/cancel','/api/platform/rosters/sync','/api/platform/hotels/stays','/api/platform/visitors','/api/platform/visitor/chat','/api/platform/shares','/api/platform/connections','/api/platform/chat','/api/platform/gyms/checkins','/api/platform/parking','/api/platform/account/delete','/api/platform/terms/current','/api/platform/terms/accept','/api/platform/admin/terms','/api/platform/admin/unlimited','/api/platform/health/amil','/api/platform/health/amil/search','/api/radar-health','/api/telegram/health','/api/telegram/roster-sync','/api/telegram/concierge/ask','/api/parse-pdf','/api/places/search','/api/alarm/health','/api/email/health','/api/email/share','/api/osm/health','/api/aviation-weather'], cache:{ noStoreApi:true, spaFallback:true }, message: ok ? 'Núcleo operacional configurado.' : 'Sistema operacional com pendências de configuração.' });
}
function handleReliabilitySelfTest(req, res) {
  return sendJson(res, 200, { ok:true, version:'13.8.8', expectedRoutes:['/api/auth/config','/api/platform/catalog','/api/platform/database/health','/api/platform/profile','/api/platform/billing/status','/api/platform/billing/google-play/verify','/api/platform/billing/google-play/rtdn','/api/platform/billing/asaas/webhook','/api/platform/billing/cancel','/api/platform/rosters/sync','/api/platform/hotels/stays','/api/platform/visitors','/api/platform/visitor/chat','/api/platform/shares','/api/platform/connections','/api/platform/chat','/api/platform/gyms/checkins','/api/platform/parking','/api/platform/account/delete','/api/platform/terms/current','/api/platform/terms/accept','/api/platform/admin/terms','/api/platform/admin/unlimited','/api/platform/health/amil','/api/platform/health/amil/search','/api/parse-pdf','/api/weather/airport','/api/aviation-weather','/api/maps/route-preview','/api/places/search','/api/places/fitness','/api/osm/health','/api/osm/route-preview','/api/telegram/health','/api/telegram/webhook','/api/telegram/roster-sync','/api/telegram/concierge/ask','/api/telegram/send','/api/telegram/setup-webhook','/api/alarm/health','/api/alarm/preview','/api/alarm/test','/api/email/health','/api/email/share','/api/radar-flight','/api/radar-health'], apiFallbackJson:true, secretsExposed:false, message:'Autoteste estrutural concluído. Rotas críticas registradas em JSON.' });
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
  <span class="badge">CrewCheck 13.8.8 - Safe Shell</span>
  <h1>Inicializacao segura</h1>
  <p>Esta tela e servida direto pelo servidor, sem depender do painel principal. Use quando o app ficar preso na abertura.</p>
  <div class="mini">
    <div><strong>Backend</strong><small id="apiState">verificando...</small></div>
    <div><strong>Cache</strong><small>reparo local disponivel</small></div>
    <div><strong>App</strong><small>abre em rota isolada /app</small></div>
  </div>
  <div class="grid">
    <button onclick="repairAndOpen()">Reparar cache e abrir app seguro</button>
    <a class="primary" href="/app?safe=1&v=13.8.8">Abrir app em modo seguro</a>
    <a class="secondary" href="/app?v=13.8.8">Abrir app normal</a>
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
    setTimeout(function(){ location.href = '/app?safe=1&v=13.8.8&ts=' + Date.now(); }, 600);
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
    'x-crewcheck-boot': 'static-shell-13.8.8'
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
  if (url.pathname === '/api/auth/diagnostic') return sendJson(res, 200, { ok: true, version: '13.8.8', authHandler: typeof handleAuthConfig1371 === 'function', authSecretConfigured: Boolean(envAny(['CREWCHECK_AUTH_SECRET'])), authRequired: cc1371AuthRequired(), message: 'Auth API rebind ativo.' });
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
  if (url.pathname === '/api/places/search') return handlePlacesSearch(req, res, url);
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
  if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true, app: 'CrewCheck', version: '13.8.8', reliability: true, platform: true, encoding: 'UTF-8', defaultTimezone: 'America/Sao_Paulo' });
  if (url.pathname === '/api/radar-flight') return handleRadar(req, res, url);
  if (url.pathname === '/api/radar-health') return handleRadarHealth(req, res, url);
  if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { ok: false, message: 'Recurso operacional indisponível agora.' });
  return serveStatic(req, res, url);
}).listen(port, () => console.log(`CrewCheck server listening on ${port}`));
