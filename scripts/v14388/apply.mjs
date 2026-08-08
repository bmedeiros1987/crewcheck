import fs from 'node:fs';

const serverPath = 'server.mjs';
if (!fs.existsSync(serverPath)) throw new Error('server.mjs não encontrado para aplicar separação de chaves Google.');

let source = fs.readFileSync(serverPath, 'utf8');

const legacyKeyHelper = `function mapsServerKey() {
  return envAny(['GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY']);
}`;
const separatedKeyHelpers = `function googleRoutesKey() {
  return envAny(['GOOGLE_ROUTES_API_KEY']);
}
function mapsServerKey() {
  return envAny(['GOOGLE_MAPS_SERVER_KEY']);
}`;

if (source.includes(legacyKeyHelper)) {
  source = source.replace(legacyKeyHelper, separatedKeyHelpers);
} else if (!source.includes("function googleRoutesKey() {\n  return envAny(['GOOGLE_ROUTES_API_KEY']);\n}")) {
  throw new Error('Contrato de chaves Google mudou; patch v14.3.88 recusou alteração não verificável.');
}

const routePreviewBefore = `async function handleRoutePreview(req, res, url) {
  const googleKey = mapsServerKey();`;
const routePreviewAfter = `async function handleRoutePreview(req, res, url) {
  const googleKey = googleRoutesKey();`;
if (source.includes(routePreviewBefore)) source = source.replace(routePreviewBefore, routePreviewAfter);
else if (!source.includes(routePreviewAfter)) throw new Error('handleRoutePreview não corresponde ao contrato esperado.');

const conciergeRouteBefore = `async function conciergeTravelEstimate(location, airport) {
  const point = WEATHER_AIRPORT_POINTS[String(airport || '').toUpperCase()];
  if (!location || !point) return null;
  const distanceKm = conciergeHaversineKm({ lat: Number(location.latitude), lon: Number(location.longitude) }, point);
  const key = mapsServerKey();`;
const conciergeRouteAfter = `async function conciergeTravelEstimate(location, airport) {
  const point = WEATHER_AIRPORT_POINTS[String(airport || '').toUpperCase()];
  if (!location || !point) return null;
  const distanceKm = conciergeHaversineKm({ lat: Number(location.latitude), lon: Number(location.longitude) }, point);
  const key = googleRoutesKey();`;
if (source.includes(conciergeRouteBefore)) source = source.replace(conciergeRouteBefore, conciergeRouteAfter);
else if (!source.includes(conciergeRouteAfter)) throw new Error('conciergeTravelEstimate não corresponde ao contrato esperado.');

if (source.includes("envAny(['GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY'])")) {
  throw new Error('VITE_GOOGLE_MAPS_API_KEY ainda está acessível pelo seletor server-side.');
}
if (!source.includes("return envAny(['GOOGLE_ROUTES_API_KEY']);")) throw new Error('GOOGLE_ROUTES_API_KEY não ficou isolada para Routes.');
if (!source.includes("return envAny(['GOOGLE_MAPS_SERVER_KEY']);")) throw new Error('GOOGLE_MAPS_SERVER_KEY não ficou isolada para Maps server-side.');

fs.writeFileSync(serverPath, source, 'utf8');
console.log('[crewcheck:prepare] v14.3.88 Google server key separation aplicada.');
