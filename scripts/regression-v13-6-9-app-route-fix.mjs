import fs from 'node:fs';
import { execSync } from 'node:child_process';

const app = fs.readFileSync('client/src/App.tsx', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const server = fs.readFileSync('server.mjs', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`ERRO: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

assert(app.includes('path="/app"'), 'rota /app registrada');
assert(app.includes('path="/home"'), 'rota /home registrada');
assert(!app.includes('navigator.serviceWorker.register'), 'service worker antigo não é registrado');
assert(app.includes('registration.unregister'), 'service workers antigos são desativados');
assert(home.includes("const DEFAULT_VERSION = '13.6.9'"), 'Home versionado em 13.6.9');
assert(server.includes("version: '13.6.9'") || server.includes("version:'13.6.9'"), 'server versionado em 13.6.9');
assert(server.includes('/app?safe=1&v=13.6.9'), 'shell abre /app com versão 13.6.9');
assert(server.includes('__crewcheck_boot_rescue_1369.html'), 'boot rescue 1369 existe');
assert(server.includes('__crewcheck_boot_rescue_1368.html'), 'compatibilidade com boot rescue 1368 mantida');

const forbidden = ['ghp_', 'sk-proj-', 'TELEGRAM_BOT_TOKEN=', 'INFOBIP_API_KEY=', 'DATABASE_URL='];
for (const token of forbidden) {
  assert(!app.includes(token) && !home.includes(token) && !server.includes(token), `sem segredo hardcoded: ${token}`);
}

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }

assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'Google Calendar não alterado');

console.log('OK: CrewCheck v13.6.9 app route fix regression OK');
