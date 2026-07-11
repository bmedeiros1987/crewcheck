import fs from 'node:fs';
import { execSync } from 'node:child_process';
const home=fs.readFileSync('client/src/pages/Home.tsx','utf8'); const css=fs.readFileSync('client/src/index.css','utf8');
function assert(c,m){ if(!c){ console.error(`ERRO: ${m}`); process.exit(1);} console.log(`OK: ${m}`);}
assert(home.includes("const DEFAULT_VERSION = '13.6.4'"),'versão 13.6.4 aplicada');
assert(home.includes('type ActCompensationConfig'),'configuração ACT criada');
assert(home.includes('crewcheck_act_km_metric_brl'),'métrica ACT por KM configurável');
assert(home.includes('KM voado x métrica ACT'),'salário explica KM x métrica ACT');
assert(home.includes('flightDistanceKmFromEvent'),'distância por voo calculada');
assert(home.includes('userIsFirstCcm'),'regra de chefe por primeiro CCM preservada');
assert(home.includes('05:00–08:00')||home.includes('05–08'),'janela de café');
assert(home.includes('11:00–13:00')||home.includes('11–13'),'janela de almoço');
assert(home.includes('19:00–20:00')||home.includes('19–20'),'janela de jantar');
assert(home.includes('00:00–01:00')||home.includes('00–01'),'janela de ceia');
assert(css.includes('CrewCheck v13.6.4 — Finance Restore Cards'),'CSS financeiro aplicado');
assert(!home.includes('ghp_')&&!css.includes('ghp_'),'sem token hardcoded');
assert(!home.includes('FLIGHTAWARE_AEROAPI_KEY'),'chave radar não exposta no frontend');
let changed=''; try{changed=execSync('git diff --name-only main...HEAD',{encoding:'utf8'});}catch{changed=execSync('git diff --name-only',{encoding:'utf8'});}
assert(!changed.includes('client/src/lib/pdfParser.ts'),'pdfParser não foi alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'),'canonicalRoster não foi alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'),'Google Calendar não foi alterado');
assert(!changed.includes('server.mjs'),'backend não foi alterado');
console.log('OK: CrewCheck v13.6.4 finance earnings restore regression OK');
