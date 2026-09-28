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

assert(home.includes("const DEFAULT_VERSION = '13.6.1'"), 'versão 13.6.1 aplicada');
assert(css.includes('CrewCheck v13.6.1 — Mobile Layout Rescue'), 'CSS de resgate mobile aplicado');
assert(css.includes('overflow-x: hidden !important'), 'overflow horizontal bloqueado');
assert(css.includes('writing-mode: horizontal-tb'), 'texto vertical bloqueado');
assert(css.includes('.cz-roster-main'), 'roster principal protegido');
assert(css.includes('.cz-roster-linked-chips'), 'chips do roster protegidos');
assert(css.includes('.cz-detail-grid'), 'grid de detalhes protegido');
assert(css.includes('.cz-bottom-nav'), 'bottom nav protegida');
assert(css.includes('env(safe-area-inset-bottom'), 'safe-area mobile tratada');
assert(css.includes('@media (max-width: 520px)'), 'mobile pequeno tratado');

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }

assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não foi alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não foi alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'Google Calendar não foi alterado');
assert(!changed.includes('server.mjs'), 'backend não foi alterado');

console.log('OK: CrewCheck v13.6.1 mobile layout rescue regression OK');
