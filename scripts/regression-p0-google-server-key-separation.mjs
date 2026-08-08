import fs from 'node:fs';

const server = fs.readFileSync('server.mjs', 'utf8');
const loader = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');

const required = [
  "function googleRoutesKey() {\n  return envAny(['GOOGLE_ROUTES_API_KEY']);\n}",
  "function mapsServerKey() {\n  return envAny(['GOOGLE_MAPS_SERVER_KEY']);\n}",
  "async function handleRoutePreview(req, res, url) {\n  const googleKey = googleRoutesKey();",
  "const key = googleRoutesKey();\n  if (key) {\n    try {\n      const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes'",
  "async function handleReverseGeocode(req, res, url) {\n  const key = mapsServerKey();",
];
for (const marker of required) {
  if (!server.includes(marker)) throw new Error(`Contrato P0 Maps ausente: ${marker.slice(0, 90)}`);
}

if (server.includes("envAny(['GOOGLE_MAPS_SERVER_KEY', 'GOOGLE_MAPS_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY'])")) {
  throw new Error('Chave pública VITE ainda é aceita pelo seletor server-side.');
}
if (/handleRoutePreview[\s\S]{0,180}mapsServerKey\(\)/.test(server)) {
  throw new Error('Routes ainda depende da chave de Maps/Geocoding.');
}
if (/conciergeTravelEstimate[\s\S]{0,420}mapsServerKey\(\)/.test(server)) {
  throw new Error('Concierge ainda usa chave de Maps/Geocoding para Routes.');
}
if (!loader.includes("await import('../v14388/apply.mjs');")) {
  throw new Error('Patch v14.3.88 não está ligado ao preparador canônico.');
}

console.log('P0 Google server key separation OK');
