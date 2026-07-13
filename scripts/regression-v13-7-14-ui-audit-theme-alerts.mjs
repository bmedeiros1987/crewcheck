import fs from 'node:fs';
import { execSync } from 'node:child_process';
const server=fs.readFileSync('server.mjs','utf8');
const home=fs.readFileSync('client/src/pages/Home.tsx','utf8');
const css=fs.readFileSync('client/src/index.css','utf8');
function assert(c,m){if(!c){console.error(`ERRO: ${m}`);process.exit(1)} console.log(`OK: ${m}`)}
assert(server.includes('13.7.14'),'server versionado 13.7.14');
assert(home.includes("const DEFAULT_VERSION = '13.7.14'"),'Home versionado 13.7.14');
assert(!/url\.pathname === '\/' \|\| url\.pathname === '\/index\.html'.*handleCrewCheckStaticShell/.test(server),'safe shell não captura / e /index.html');
assert(home.includes('legacyRuntime'),'runtime patch antigo ignorado');
assert(home.includes('alertCount?: number'),'BottomNav recebe alertCount');
assert(home.includes('visibleAlertCount'),'badge de alertas calculado');
assert(!home.includes('<em>3</em>'),'badge hardcoded removido');
assert(css.includes('v13.7.14'),'CSS v13.7.14 aplicado');
assert(css.includes('position:relative!important;top:auto!important'),'header não fica fixo');
assert(css.includes('[data-crew-theme="dark"] .cz-menu-panel'),'menu dark padronizado');
assert(css.includes('[data-crew-theme="light"] .cz-menu-panel'),'menu light padronizado');
let changed='';
try{changed=execSync('git diff --name-only main...HEAD',{encoding:'utf8'})}catch{changed=execSync('git diff --name-only',{encoding:'utf8'})}
assert(!changed.includes('client/src/lib/pdfParser.ts'),'pdfParser não alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'),'canonicalRoster não alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'),'Google Calendar não alterado');
console.log('OK: CrewCheck v13.7.14 UI Audit regression OK');
