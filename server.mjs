import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 4173);

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}
function mapsServerKey() {
  return process.env.GOOGLE_MAPS_SERVER_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
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
async function handleRadar(req, res, url) {
  const flight = (url.searchParams.get('flight') || '').replace(/\s+/g, '').toUpperCase();
  if (!flight || flight === '—') return sendJson(res, 200, { ok: false, configured: false, message: 'Voo não identificado na escala.' });

  const template = process.env.CREWCHECK_FLIGHT_STATUS_URL || '';
  if (template) {
    try {
      const apiUrl = template
        .replaceAll('{flight}', encodeURIComponent(flight))
        .replaceAll('{origin}', encodeURIComponent(url.searchParams.get('origin') || ''))
        .replaceAll('{destination}', encodeURIComponent(url.searchParams.get('destination') || ''));
      const response = await fetch(apiUrl, { headers: { accept: 'application/json' } });
      const payload = await response.json().catch(() => null);
      if (response.ok) return sendJson(res, 200, { ok: true, configured: true, status: payload?.status || payload?.flight_status || 'Monitorando', gate: payload?.gate || payload?.departure?.gate || '', terminal: payload?.terminal || payload?.departure?.terminal || '', departure: payload?.departure?.estimated || payload?.departure?.scheduled || '', arrival: payload?.arrival?.estimated || payload?.arrival?.scheduled || '', message: 'Radar atualizado.' });
    } catch {}
  }

  const key = process.env.AVIATIONSTACK_API_KEY || '';
  if (key) {
    try {
      const response = await fetch(`https://api.aviationstack.com/v1/flights?access_key=${encodeURIComponent(key)}&flight_iata=${encodeURIComponent(flight)}`);
      const payload = await response.json().catch(() => null);
      const row = payload?.data?.[0];
      if (row) return sendJson(res, 200, { ok: true, configured: true, status: row.flight_status || 'Monitorando', gate: row.departure?.gate || '', terminal: row.departure?.terminal || '', departure: row.departure?.estimated || row.departure?.scheduled || '', arrival: row.arrival?.estimated || row.arrival?.scheduled || '', message: 'Radar atualizado.' });
    } catch {}
  }

  sendJson(res, 200, { ok: false, configured: false, message: 'Radar real aguardando configuração de fonte de voos.' });
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
    res.writeHead(200, { 'content-type': type });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true, app: 'CrewCheck', version: '13.5.5' });
  if (url.pathname === '/api/maps/route-preview') return handleRoutePreview(req, res, url);
  if (url.pathname === '/api/places/fitness') return handleFitness(req, res, url);
  if (url.pathname === '/api/radar-flight' || url.pathname === '/api/radar-health') return handleRadar(req, res, url);
  return serveStatic(req, res, url);
}).listen(port, () => {
  console.log(`CrewCheck server listening on ${port}`);
});
