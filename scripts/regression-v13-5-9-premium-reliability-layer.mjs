import fs from 'node:fs';
import { execSync } from 'node:child_process';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const css = fs.readFileSync('client/src/index.css', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`ERRO: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

assert(home.includes("const DEFAULT_VERSION = '13.5.9'"), 'versão 13.5.9 aplicada');
assert(css.includes('CrewCheck v13.5.9 — Premium Reliability Layer'), 'camada premium v13.5.9 aplicada');
assert(css.includes('--crew-card'), 'tokens premium existem');
assert(css.includes('.cz-setting > span:last-child.on'), 'toggle premium existe');
assert(css.includes('.cz-static-map-img'), 'mapas estáticos preservados');
assert(css.includes('.cz-layover-weather-badge'), 'previsão de pernoite preservada');
assert(css.includes('.cz-radar-screen article'), 'radar visual preservado');
assert(css.includes('overflow-wrap: anywhere'), 'anti-overflow reforçado');
assert(css.includes('html[data-crew-theme="light"]'), 'tema claro tratado');
assert(!home.includes('VITE_FLIGHTAWARE'), 'radar não exposto como VITE');

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }

assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não foi alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não foi alterado');
assert(!changed.includes('client/src/lib/calendarExport.ts'), 'calendarExport não foi alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'googleCalendarSync não foi alterado');

console.log('OK: CrewCheck v13.5.9 premium reliability regression OK');
