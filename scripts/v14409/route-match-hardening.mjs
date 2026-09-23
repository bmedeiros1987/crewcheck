import fs from 'node:fs';

function airportCode(value = '') {
  return String(value || '').trim().toUpperCase();
}

export function matchesCiriumRouteCodes(row = {}, requested = {}) {
  const wantedOrigin = airportCode(requested.origin);
  const wantedDestination = airportCode(requested.destination);
  const departure = airportCode(row?.departureAirportFsCode);
  const arrival = airportCode(row?.arrivalAirportFsCode);
  return (!wantedOrigin || departure === wantedOrigin)
    && (!wantedDestination || arrival === wantedDestination);
}

const serverPath = 'server.mjs';
if (!fs.existsSync(serverPath)) throw new Error('[v14409-route] server.mjs ausente.');
let source = fs.readFileSync(serverPath, 'utf8');

const safeMarker = 'const routeFiltered = Boolean(wantedOrigin || wantedDestination);';
const unsafeBlock = `    const wantedOrigin = radarAirportCode(origin);\n    const wantedDestination = radarAirportCode(destination);\n    const routeMatch = rows.find((row) => {\n      const departure = radarAirportCode(row?.departureAirportFsCode);\n      const arrival = radarAirportCode(row?.arrivalAirportFsCode);\n      return (!wantedOrigin || !departure || departure === wantedOrigin) && (!wantedDestination || !arrival || arrival === wantedDestination);\n    });\n    const row = routeMatch || rows.find((item) => item?.status !== 'C') || rows[0];`;
const safeBlock = `    const wantedOrigin = radarAirportCode(origin);\n    const wantedDestination = radarAirportCode(destination);\n    const routeFiltered = Boolean(wantedOrigin || wantedDestination);\n    const routeMatch = rows.find((row) => {\n      const departure = radarAirportCode(row?.departureAirportFsCode);\n      const arrival = radarAirportCode(row?.arrivalAirportFsCode);\n      return (!wantedOrigin || departure === wantedOrigin) && (!wantedDestination || arrival === wantedDestination);\n    });\n    const row = routeFiltered ? routeMatch : (rows.find((item) => item?.status !== 'C') || rows[0]);`;

if (!source.includes(safeMarker)) {
  if (!source.includes(unsafeBlock)) {
    throw new Error('[v14409-route] bloco Cirium legado não localizado; recusando aplicar hardening de rota.');
  }
  source = source.replace(unsafeBlock, safeBlock);
  fs.writeFileSync(serverPath, source, 'utf8');
}

for (const required of [
  safeMarker,
  'return (!wantedOrigin || departure === wantedOrigin) && (!wantedDestination || arrival === wantedDestination);',
  'const row = routeFiltered ? routeMatch : (rows.find((item) => item?.status !== \'C\') || rows[0]);',
]) {
  if (!source.includes(required)) throw new Error(`[v14409-route] contrato fail-closed ausente: ${required}`);
}
if (source.includes('return (!wantedOrigin || !departure || departure === wantedOrigin) && (!wantedDestination || !arrival || arrival === wantedDestination);')) {
  throw new Error('[v14409-route] predicado permissivo antigo ainda está presente.');
}

console.log('[v14409-route] Cirium falha fechado quando a ocorrência não corresponde à rota solicitada.');
