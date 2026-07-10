import fs from 'node:fs';
import { execSync } from 'node:child_process';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const server = fs.readFileSync('server.mjs', 'utf8');
const css = fs.readFileSync('client/src/index.css', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

assert(home.includes("const DEFAULT_VERSION = '13.5.8'"), 'versão 13.5.8 aplicada');
assert(home.includes('buildGoogleStaticMonthlyMapUrl'), 'mapa estático do mês existe');
assert(home.includes('buildGoogleStaticRouteMapUrl'), 'mapa estático de rota existe');
assert(home.includes('LayoverWeatherBadge'), 'previsão em card de pernoite existe');
assert(home.includes('/api/weather/airport'), 'frontend chama previsão por aeroporto');
assert(home.includes('cz-static-map-img'), 'imagem estática de mapa é usada');
assert(server.includes('/api/weather/airport'), 'backend expõe previsão por aeroporto');
assert(server.includes('handleAirportWeather'), 'handler de previsão existe');
assert(server.includes('/api/radar-flight'), 'radar foi preservado');
assert(server.includes('/api/maps/route-preview') || home.includes('/api/maps/route-preview'), 'rota de mapas/saída inteligente preservada');
assert(css.includes('Static maps and layover weather'), 'CSS dos mapas/previsão aplicado');
assert(!home.includes('VITE_FLIGHTAWARE'), 'radar não exposto como VITE');

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }
assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não foi alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não foi alterado');

console.log('✅ CrewCheck v13.5.8 static maps/weather recovery regression OK');
