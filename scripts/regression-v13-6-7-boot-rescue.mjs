import fs from 'node:fs';
import { execSync } from 'node:child_process';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const server = fs.readFileSync('server.mjs', 'utf8');
const errorBoundary = fs.existsSync('client/src/components/ErrorBoundary.tsx') ? fs.readFileSync('client/src/components/ErrorBoundary.tsx', 'utf8') : '';
const css = fs.readFileSync('client/src/index.css', 'utf8');

function assert(condition, message) {
  if (!condition) { console.error(`ERRO: ${message}`); process.exit(1); }
  console.log(`OK: ${message}`);
}

assert(home.includes("const DEFAULT_VERSION = '13.6.7'"), 'versão 13.6.7 aplicada');
assert(home.includes('function runtimeInitialView'), 'runtimeInitialView existe');
assert(home.includes("params.has('safe')"), 'modo seguro por URL existe');
assert(home.includes("params.has('repair')"), 'reparo por URL existe');
assert(home.includes('clearCrewCheckRuntimeCaches'), 'limpeza de cache local existe');
assert(home.includes('onStalled'), 'vídeo de abertura tem proteção contra stall');
assert(server.includes('function handleCrewCheckRepairPage'), 'página independente de reparo existe');
assert(server.includes('/crewcheck-repair'), 'rota /crewcheck-repair registrada');
assert(server.includes("version: '13.6.7'"), 'server atualizado para 13.6.7');
assert(css.includes('CrewCheck v13.6.7 — Boot Rescue / Safe Start'), 'CSS boot rescue aplicado');
assert(errorBoundary.includes('crewcheck_latest_roster_bundle'), 'ErrorBoundary preserva escala ativa');
assert(errorBoundary.includes('/?safe=1&v=13.6.7'), 'ErrorBoundary redireciona para modo seguro');

const forbidden = ['ghp_', 'sk-proj-', 'TELEGRAM_BOT_TOKEN=', 'INFOBIP_API_KEY=', 'DATABASE_URL='];
for (const token of forbidden) assert(!home.includes(token) && !server.includes(token) && !css.includes(token), `sem segredo hardcoded: ${token}`);

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }
assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não foi alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não foi alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'Google Calendar não foi alterado');

console.log('OK: CrewCheck v13.6.7 boot rescue regression OK');
