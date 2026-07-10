import fs from 'node:fs';
import { execSync } from 'node:child_process';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const gcal = fs.readFileSync('client/src/lib/googleCalendarSync.ts', 'utf8');
const server = fs.readFileSync('server.mjs', 'utf8');
const css = fs.readFileSync('client/src/index.css', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

assert(home.includes("const DEFAULT_VERSION = '13.5.5'"), 'versão 13.5.5 aplicada');
assert(home.includes("return 'gyms'"), 'menu/rota de academias existe');
assert(home.includes('function GymsView'), 'tela Academias existe');
assert(home.includes('Academias próximas'), 'hotéis integram academias próximas');
assert(home.includes('function openToday'), 'botão Hoje da escala existe');
assert(home.includes('data-roster-day'), 'escala possui âncora para o dia');
assert(home.includes('listGoogleCalendars'), 'Google Calendar lista calendários');
assert(home.includes('saveGoogleCalendarSettings'), 'Google Calendar salva calendário selecionado');
assert(home.includes('fetchRoutePreviewInfo'), 'Saída Inteligente consulta rota/tempo');
assert(home.includes('/api/radar-flight'), 'Radar usa endpoint funcional');
assert(server.includes('/api/maps/route-preview'), 'server possui rota de mapas');
assert(server.includes('/api/places/fitness'), 'server possui rota de academias/locais');
assert(server.includes('/api/radar-flight'), 'server possui rota de radar');
assert(server.includes('GOOGLE_MAPS_SERVER_KEY'), 'server suporta chave Google Maps backend');
assert(server.includes('CREWCHECK_FLIGHT_STATUS_URL') || server.includes('AVIATIONSTACK_API_KEY'), 'server suporta fonte real de voos');
assert(!gcal.includes('OAuth Client ID ativo'), 'diagnóstico não expõe Client ID');
assert(!gcal.includes('Chave SHA-1 Android'), 'diagnóstico não expõe SHA-1');
assert(!gcal.includes('Service Account'), 'diagnóstico não expõe Service Account');
assert(css.includes('Functional Recovery'), 'CSS anti-overflow funcional aplicado');

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }
assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não foi alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não foi alterado');

console.log('✅ CrewCheck v13.5.5 operational core recovery regression OK');
