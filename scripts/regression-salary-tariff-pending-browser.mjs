import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import {createRequire} from 'node:module';import {build} from 'esbuild';
const root=process.cwd(),out=fs.mkdtempSync(path.join(os.tmpdir(),'salary-tariff-pending-'));
const require=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url),{chromium}=require('playwright');
const mocks={
 '@/components/finance/FinancialPrivacy':`export const useFinancialPrivacy=()=>({text:x=>x,amount:x=>x});export const FinancialPrivacyToggle=()=>null;`,
 './useRosterLayout':`export const useRosterLayout=()=>({layout:'list',zoom:'month',choose:()=>{},chooseZoom:()=>{},message:''});`,
 '@/lib/navigationContext':`export const peekPendingNavigationContext=()=>null;export const setPendingNavigationContext=()=>{};`,
 '@/lib/rosterFocus':`export const consumePendingRosterFocus=()=>null;`,
 '../alerts/AlertRosterNavigation':`export const AlertRosterNavigation=()=>null;`,
 '@/components/v139/Shell':`export const V139Header=()=>null;`,
 './AimsDocumentView':`export const AimsDocumentView=()=>null;`,
 './AimsRosterTable':`export const AimsRosterTable=()=>null;`,
 './CalendarRosterView':`export const CalendarRosterView=()=>null;`,
};
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import View from './client/src/components/v1391/RosterLaunchView';
const root=createRoot(document.getElementById('root'));
window.mount=(scenario)=>{const month=scenario==='other-month'?'2026-10':'2026-11',day=month+'-10';
const event={id:'fiction-flight',kind:'flight',flightNumber:'ZZ123',origin:'AAA',destination:'BBB',departure:'12:00',arrival:'14:00',day:{date:day,type:'OP'},canonical:{date:day,kind:'flight',startDateTime:day+'T15:00:00Z',endDateTime:day+'T17:00:00Z'}};
const known=['known','unused-night'].includes(scenario),row={id:event.id,km:1000,dayKm:1000,nightKm:0,dayRateApplied:known?2:NaN,nightRateApplied:scenario==='unused-night'?NaN:2,total:known?2000:NaN,timeKnown:scenario!=='time',distanceKnown:true};
const pending={productionMonth:'2026-11',rateMonth:'2026-12',reason:'awaiting_december_2026_inpc'};
const config=scenario==='pilot'?{}:{pendingTariff:pending};
const finance={salary:{configured:known||scenario==='fixed-base',rows:[row],config},perdiem:{rows:[{eventId:event.id,iso:day,label:'Almoço',value:100,currency:'BRL',convertedBRL:100}],unclassifiedItems:[]}};
root.render(<div key={scenario} data-scenario={scenario}><View events={[event]} finance={finance} financeMonth={scenario==='scope-mismatch'?'2026-10':month} setView={()=>{}}/></div>);};window.mount('pending');`;
await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,format:'iife',jsx:'automatic',outfile:path.join(out,'app.js'),plugins:[{name:'fixture-shell',setup(b){b.onResolve({filter:/.*/},args=>{if(args.path.endsWith('.css'))return {path:args.path,namespace:'cssmock'};if(args.path in mocks)return {path:args.path,namespace:'mock'};if(args.path.startsWith('@/'))return b.resolve(path.join(root,'client/src',args.path.slice(2)),{kind:args.kind,resolveDir:args.resolveDir});});b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'tsx'}));b.onLoad({filter:/.*/,namespace:'cssmock'},()=>({contents:'',loader:'js'}));}}]});
const css=['client/src/components/v139/v139.css','client/src/launch-v13-9-1.css','client/src/components/v1397/roster-premium.css','client/src/components/v1391/roster-layout.css'].map(file=>fs.readFileSync(file,'utf8').replace(/@import[^;]+;/g,'')).join('\n');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'application/javascript':'text/html');res.end(req.url==='/app.js'?fs.readFileSync(path.join(out,'app.js')):'<style>body{margin:0}*{box-sizing:border-box}'+css+'</style><div id="root"></div><script src="/app.js"></script>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
let external=0;
try{for(const timezoneId of ['UTC','America/Sao_Paulo','Pacific/Auckland'])for(const width of [320,1440])for(const theme of ['light','dark']){
 const context=await browser.newContext({timezoneId,viewport:{width,height:900},colorScheme:theme});await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(external++,r.abort()));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.evaluate(theme=>document.body.classList.toggle('dark',theme==='dark'),theme);
 const box=page.locator('.cc-roster-km-gain-v1397');await box.waitFor();assert.match(await box.innerText(),/Tarifa de dezembro\/2026 pendente/);assert.match(await box.innerText(),/Produção novembro\/2026 · mês tarifário dezembro\/2026/);assert.match(await box.innerText(),/Aguardando INPC completo/);assert.doesNotMatch(await box.innerText(),/Horários, distância/);assert.match(await page.locator('.cc-roster-meals-v1397').innerText(),/100,00/,'known meal remains visible');
 for(const scenario of ['fixed-base','time','known','unused-night','pilot','other-month','scope-mismatch']){await page.evaluate(s=>window.mount(s),scenario);await page.locator('[data-scenario="'+scenario+'"]').waitFor();if(scenario==='scope-mismatch'){assert.equal(await box.count(),0,'other-month finance is not shown');continue;}const text=await box.innerText();if(['fixed-base','time'].includes(scenario)){assert.match(text,/Aguardando INPC completo/);if(scenario==='time')assert.match(text,/Horários ou distância também pendentes/);}else{assert.doesNotMatch(text,/Aguardando INPC/);if(['known','unused-night'].includes(scenario))assert.match(text,/2.000,00/,'known rate is displayed even when an unused bucket is unknown');}}
 await page.evaluate(()=>window.mount('pending'));await page.locator('[data-scenario="pending"]').waitFor();await page.evaluate(()=>document.body.style.fontSize='32px');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,JSON.stringify(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,items:[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,80)})).slice(-12)}))));if(timezoneId==='UTC'){const evidence=path.join(root,'artifacts/SYNTHETIC-salary-tariff-pending');fs.mkdirSync(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,width+'-'+theme+'.png'),fullPage:true});}assert.deepEqual(errors,[]);await context.close();console.log('PASS salary tariff pending real component',timezoneId,width,theme);
}assert.equal(external,0);}finally{await browser.close();await new Promise(r=>server.close(r));}
