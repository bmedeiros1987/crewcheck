import fs from 'node:fs';
import { execSync } from 'node:child_process';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const css = fs.readFileSync('client/src/index.css', 'utf8');
const server = fs.readFileSync('server.mjs', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

function assert(condition, message) {
  if (!condition) {
    console.error(`ERRO: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

assert(home.includes("import JSZip from 'jszip'"), 'JSZip importado');
assert(home.includes("| 'updates'"), 'view updates registrada');
assert(home.includes('function UpdateCenterView()'), 'UpdateCenterView existe');
assert(home.includes('JSZip.loadAsync'), 'leitor ZIP ativo');
assert(home.includes('/api/admin/runtime-patch'), 'frontend chama runtime patch');
assert(home.includes('loadCrewCheckRuntimePatch'), 'runtime patch carregado na abertura');
assert(home.includes('data-crew-menu-panel="true"'), 'menu real marcado para scroll');
assert(home.includes('crewcheck-menu-open'), 'body/html lock de menu aplicado');
assert(home.includes("const DEFAULT_VERSION = '13.7.4'"), 'Home versionado 13.7.4');

assert(css.includes('CrewCheck v13.7.4 — Menu Scroll Built-in + Runtime Support'), 'CSS built-in 13.7.4 aplicado');
assert(css.includes('.cz-menu-panel'), 'menu real coberto no CSS');
assert(css.includes('.cz-update-textarea'), 'estilo da central de atualizações aplicado');

assert(server.includes('CrewCheck v13.7.4 — Internal Update Center backend'), 'backend update center inserido');
assert(server.includes('/api/admin/runtime-patch/current'), 'endpoint current existe');
assert(server.includes('/api/admin/runtime-patch/clear'), 'endpoint clear existe');
assert(server.includes('CREWCHECK_ADMIN_UPDATE_TOKEN'), 'token admin de atualização suportado');
assert(server.includes('crewcheckValidateRuntimeCss'), 'validação CSS runtime existe');
assert(server.includes("version: '13.7.4'") || server.includes("version:'13.7.4'"), 'server versionado 13.7.4');

assert(pkg.version === '13.7.4', 'package versionado 13.7.4');
assert(pkg.dependencies && pkg.dependencies.jszip, 'dependência jszip presente');

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }

assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'Google Calendar não alterado');

const forbidden = ['g' + 'hp_', 'sk-proj-', 'TELEGRAM_BOT_TOKEN=', 'INFOBIP_API_KEY=', 'DATABASE_URL=', 'OPENAI_API_KEY='];
for (const token of forbidden) {
  assert(!home.includes(token) && !server.includes(token), `sem segredo hardcoded: ${token}`);
}

console.log('OK: CrewCheck v13.7.4 internal update center regression OK');
