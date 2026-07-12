import fs from 'node:fs';
import { execSync } from 'node:child_process';

const css = fs.readFileSync('client/src/index.css', 'utf8');
const home = fs.existsSync('client/src/pages/Home.tsx') ? fs.readFileSync('client/src/pages/Home.tsx', 'utf8') : '';
const server = fs.existsSync('server.mjs') ? fs.readFileSync('server.mjs', 'utf8') : '';

function assert(condition, message) {
  if (!condition) {
    console.error(`ERRO: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

assert(css.includes('CrewCheck v13.7.3 — Actual Menu Panel Scroll Rescue'), 'patch 13.7.3 aplicado');
assert(css.includes('.cz-menu-panel'), 'painel real coberto');
assert(css.includes('.cz-menu-overlay'), 'overlay real coberto');
assert(css.includes('overflow-y: auto !important'), 'scroll vertical forçado');
assert(css.includes('touch-action: pan-y'), 'gesto vertical liberado no painel');
assert(css.includes('crewcheck-menu-open'), 'lock de body/html aplicado no CSS');
assert(css.includes('safe-area-inset-bottom'), 'safe area inferior preservada');

assert(home.includes('crewcheck-menu-open'), 'Home aplica classe de menu aberto');
assert(home.includes('data-crew-menu-panel="true"'), 'aside real marcado');
assert(home.includes('onTouchMove={(event) => event.stopPropagation()}'), 'touchmove não vaza');
assert(home.includes("const DEFAULT_VERSION = '13.7.3'"), 'Home versionado em 13.7.3');

if (server) assert(server.includes("version: '13.7.3'") || server.includes("version:'13.7.3'"), 'server versionado em 13.7.3');

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }

assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'Google Calendar não alterado');

console.log('OK: CrewCheck v13.7.3 actual menu scroll regression OK');
