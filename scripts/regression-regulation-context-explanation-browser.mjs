import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {createRequire} from 'node:module';import {build} from 'esbuild';
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'regulation-explainer-browser-'));
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import View from ${JSON.stringify(path.resolve('client/src/components/regulation/RegulationScenarioView.tsx'))};
import {buildCanonicalRosterEvents} from ${JSON.stringify(path.resolve('client/src/lib/canonicalRoster.ts'))};
import {regulationProgramDay} from ${JSON.stringify(path.resolve('shared/regulationScenarioPrefill.mjs'))};
const day={date:'20/10/2032',year:2032,month:10,type:'VOO',base:'BSB',dutyReport:'04:10',dutyReportSource:'published',dutyDebrief:'11:25',dutyDebriefSource:'published',legs:[
{flightNumber:'QA4527',origin:'BSB',destination:'CGH',departureTime:'05:00',arrivalTime:'06:45',presentationTime:'04:10',workType:'OP'},
{flightNumber:'QA3036',origin:'CGH',destination:'BSB',departureTime:'07:30',arrivalTime:'09:00',workType:'PS'},
{flightNumber:'QA3039',origin:'BSB',destination:'GRU',departureTime:'09:30',arrivalTime:'10:55',workType:'OP'}]};
const events=buildCanonicalRosterEvents({year:2032,month:10,days:[day]}).filter(e=>e.kind==='flight');
const ui=events.map(e=>({id:e.id,kind:e.kind,canonical:e,day:e.publishedDay}));
createRoot(document.getElementById('root')).render(<View scheduleDay={regulationProgramDay(ui,ui.at(-1))} program={events.at(-1)} compliance={{legalProfile:{role:'cabin',actName:'ACT sintético'}}}/>);`;
let server,browser;
try {
 await build({stdin:{contents:entry,loader:'jsx',resolveDir:process.cwd()},bundle:true,jsx:'automatic',format:'iife',outfile:path.join(dir,'app.js'),alias:{'@':path.resolve('client/src'),'@shared':path.resolve('shared')},logLevel:'silent'});
 server=http.createServer((req,res)=>{const file=req.url==='/app.js'?'app.js':req.url==='/app.css'?'app.css':null;res.setHeader('Content-Type',file?.endsWith('.js')?'text/javascript':file?'text/css':'text/html');res.end(file?fs.readFileSync(path.join(dir,file)):'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 for(const timezoneId of ['UTC','America/Sao_Paulo','Asia/Tokyo']) {
  const context=await browser.newContext({timezoneId,viewport:{width:390,height:844},serviceWorkers:'block'});let external=0;const errors=[];
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(external++,route.abort()));
  await context.addInitScript(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'fixture-A',email:'fixture@example.invalid',role:'user'}));localStorage.setItem('crewcheck_auth_token','offline-fixture');});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await page.getByText('Como foi calculado',{exact:true}).click();const explanation=page.getByRole('region',{name:'Concierge explica esta jornada'});await explanation.waitFor();
  const text=await explanation.innerText();assert.match(text,/04:10 · publicada/);for(const flight of ['QA4527','QA3036','QA3039'])assert(text.includes(flight));assert.match(text,/PS: deslocamento publicado/);assert.match(text,/não de pouso ou corte/);
  await explanation.getByRole('button',{name:'Confirmar próximo dado'}).click();assert.equal(await page.getByLabel('Composição da tripulação',{exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.getByLabel('Composição da tripulação',{exact:true}).selectOption('simple');await explanation.getByRole('button',{name:'Confirmar próximo dado'}).click();assert.equal(await page.getByLabel('Condição de aclimatação',{exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.getByLabel('Atraso previsto em minutos',{exact:true}).fill('60');assert.match(await explanation.innerText(),/atraso editável de 60 min/);
  await page.getByText('Hipótese excepcional de extensão',{exact:true}).click();await page.getByRole('switch',{name:'Simular extensão de 1 hora',exact:true}).check();assert.match(await explanation.innerText(),/\+60 min altera somente a referência temporal/);
  await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'fixture-B',email:'other@example.invalid',role:'user'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});await explanation.waitFor({state:'detached'});
  assert.doesNotMatch(await page.locator('body').innerText(),/QA4527|QA3036|QA3039|04:10/);assert.equal(external,0);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS actual contextual explainer: complete OP/PS journey, focus exact missing field, editable delay/extension, account invalidation, three zones, zero external requests.');
} finally {if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
