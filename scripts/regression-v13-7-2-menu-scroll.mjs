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

assert(css.includes('CrewCheck v13.7.2 — Menu Scroll Rescue'), 'patch de scroll aplicado');
assert(css.includes('.cc-sidebar'), 'sidebar coberta');
assert(css.includes('.cc-drawer'), 'drawer coberto');
assert(css.includes('overflow-y: auto !important'), 'scroll vertical forçado');
assert(css.includes('-webkit-overflow-scrolling: touch'), 'scroll suave iOS/Android');
assert(css.includes('100dvh'), 'altura dinâmica mobile aplicada');
assert(css.includes('safe-area-inset-bottom'), 'safe area preservada');

if (home) assert(home.includes("const DEFAULT_VERSION = '13.7.2'"), 'Home versionado em 13.7.2');
if (server) assert(server.includes("version: '13.7.2'") || server.includes("version:'13.7.2'"), 'server versionado em 13.7.2');

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }

assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'Google Calendar não alterado');

console.log('OK: CrewCheck v13.7.2 menu scroll regression OK');
