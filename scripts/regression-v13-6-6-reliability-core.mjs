import fs from 'node:fs';
import { execSync } from 'node:child_process';
const home = fs.readFileSync('client/src/pages/Home.tsx','utf8');
const server = fs.readFileSync('server.mjs','utf8');
const css = fs.readFileSync('client/src/index.css','utf8');
function assert(c,m){ if(!c){ console.error(`ERRO: ${m}`); process.exit(1); } console.log(`OK: ${m}`); }
assert(home.includes("const DEFAULT_VERSION = '13.6.6'"),'versão 13.6.6 aplicada');
assert(home.includes("| 'diagnostics'"),'view diagnostics registrada');
assert(home.includes('function DiagnosticsView'),'DiagnosticsView existe');
assert(home.includes('/api/reliability/health'),'frontend consulta health reliability');
assert(home.includes('Reparar app/cache'),'ação reparar app/cache existe');
assert(server.includes("version: '13.6.6'"),'server health 13.6.6');
assert(server.includes('/api/reliability/health'),'rota reliability health registrada');
assert(server.includes('/api/reliability/env'),'rota reliability env registrada');
assert(server.includes('/api/reliability/self-test'),'rota reliability self-test registrada');
assert(server.includes('function handleReliabilityHealth'),'handler reliability existe');
assert(server.includes('secretsExposed:false') || server.includes('secretsExposed: false'),'self-test sem segredos');
assert(css.includes('CrewCheck v13.6.6 — Reliability Core / Diagnostics'),'CSS diagnostics aplicado');
for (const token of ['ghp_','sk-proj-','TELEGRAM_BOT_TOKEN=','INFOBIP_API_KEY=','DATABASE_URL=']) assert(!home.includes(token) && !server.includes(token) && !css.includes(token), `sem segredo hardcoded: ${token}`);
let changed=''; try{ changed=execSync('git diff --name-only main...HEAD',{encoding:'utf8'}); } catch { changed=execSync('git diff --name-only',{encoding:'utf8'}); }
assert(!changed.includes('client/src/lib/pdfParser.ts'),'pdfParser não foi alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'),'canonicalRoster não foi alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'),'Google Calendar não foi alterado');
console.log('OK: CrewCheck v13.6.6 reliability regression OK');
