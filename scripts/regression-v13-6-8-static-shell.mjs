import fs from 'node:fs';
import { execSync } from 'node:child_process';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const server = fs.readFileSync('server.mjs', 'utf8');
const index = fs.existsSync('client/index.html') ? fs.readFileSync('client/index.html', 'utf8') : '';

function assert(condition, message) {
  if (!condition) {
    console.error(`ERRO: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

assert(home.includes("const DEFAULT_VERSION = '13.6.8'"), 'Home versionado em 13.6.8');
assert(home.includes('frontend estável restaurado'), 'nota de frontend estável aplicada');
assert(server.includes("version: '13.6.8'") || server.includes("version:'13.6.8'"), 'server versionado em 13.6.8');
assert(server.includes('function handleCrewCheckStaticShell'), 'shell estático existe');
assert(server.includes("url.pathname === '/'"), 'rota raiz servida pelo shell estático');
assert(server.includes('/__crewcheck_boot_rescue_1368.html'), 'rota de boot rescue única existe');
assert(server.includes('/app?safe=1&v=13.6.8'), 'shell abre app em rota isolada');
assert(server.includes("'cache-control': 'no-store, no-cache, must-revalidate'"), 'estáticos sem cache durante emergência');
assert(index.includes('crewcheck-cache-reset-13-6-8'), 'index força reset de cache 13.6.8');

const forbidden = ['ghp_', 'sk-proj-', 'TELEGRAM_BOT_TOKEN=', 'INFOBIP_API_KEY=', 'DATABASE_URL='];
for (const token of forbidden) {
  assert(!home.includes(token) && !server.includes(token) && !index.includes(token), `sem segredo hardcoded: ${token}`);
}

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }

assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'Google Calendar não alterado');

console.log('OK: CrewCheck v13.6.8 static shell regression OK');
