import fs from 'node:fs';
import { execSync } from 'node:child_process';

const server = fs.readFileSync('server.mjs', 'utf8');
const home = fs.existsSync('client/src/pages/Home.tsx') ? fs.readFileSync('client/src/pages/Home.tsx', 'utf8') : '';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

assert(server.includes('/api/radar-flight'), 'endpoint /api/radar-flight existe');
assert(server.includes('runRadarRace'), 'motor de corrida de APIs existe');
assert(server.includes('providerFlightAware'), 'FlightAware suportado');
assert(server.includes('providerAviationstack'), 'Aviationstack suportado');
assert(server.includes('providerAirLabs'), 'AirLabs suportado');
assert(server.includes('providerAeroDataBox'), 'AeroDataBox suportado');
assert(server.includes('CREWCHECK_FLIGHT_STATUS_URL'), 'fonte custom configurável suportada');
assert(server.includes('CREWCHECK_RADAR_TIMEOUT_MS'), 'timeout operacional configurável existe');
assert(server.includes('scoreRadar'), 'seleção por qualidade existe');
assert(server.includes('radarHealth'), 'cache de saúde das fontes existe');
assert(server.includes('/api/radar-health'), 'health-check do radar existe');
assert(server.includes('/api/maps/route-preview'), 'rota de mapas preservada');
assert(server.includes('/api/places/fitness'), 'rota de academias preservada');
assert(server.includes('GOOGLE_MAPS_SERVER_KEY'), 'chave backend de mapas preservada');
assert(server.includes('routes.googleapis.com/directions/v2:computeRoutes'), 'Routes API preservada');
assert(server.includes('places.googleapis.com/v1/places:searchText'), 'Places API preservada');
assert(!server.includes('ghp_'), 'nenhum token GitHub foi gravado');
assert(!server.includes('VITE_FLIGHTAWARE'), 'FlightAware não é exposto como VITE');
if (home) {
  assert(home.includes('13.5.7'), 'Home atualizado para 13.5.7');
  assert(home.includes('Atualizar agora'), 'Radar tem atualização manual');
  assert(home.includes('Qualidade'), 'Radar exibe qualidade da resposta');
}

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }
assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não foi alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não foi alterado');

console.log('✅ CrewCheck v13.5.7 radar multi-api race regression OK');
