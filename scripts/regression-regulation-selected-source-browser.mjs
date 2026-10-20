import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {createRequire} from 'node:module';import {build} from 'esbuild';
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'regulation-arrival-browser-'));
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import {DetailedRegulationScenarioView as View} from ${JSON.stringify(path.resolve('client/src/components/regulation/RegulationScenarioView.tsx'))};
import {buildCanonicalRosterEvents} from ${JSON.stringify(path.resolve('client/src/lib/canonicalRoster.ts'))};
import {regulationProgramDay} from ${JSON.stringify(path.resolve('shared/regulationScenarioPrefill.mjs'))};
import {captureAuthSession} from ${JSON.stringify(path.resolve('client/src/lib/authClient.ts'))};
import {normalizeCiriumFlightStatus} from ${JSON.stringify(path.resolve('server/cirium-flight-adapter.mjs'))};
const day={date:'20/10/2032',year:2032,month:10,type:'VOO',base:'BSB',dutyReport:'04:10',dutyReportSource:'published',dutyDebrief:'11:30',dutyDebriefSource:'published',legs:[{flightNumber:'QA1234',origin:'BSB',destination:'GRU',departureTime:'09:30',arrivalTime:'11:00',presentationTime:'04:10',workType:'OP'}]};
const events=buildCanonicalRosterEvents({days:[day],year:2032,month:10,base:'BSB'}).filter(e=>e.kind==='flight');const ui=events.map(c=>({id:c.id,kind:c.kind,canonical:c,day:c.publishedDay}));
const row={carrierFsCode:'QA',flightNumber:'1234',departureAirportFsCode:'BSB',arrivalAirportFsCode:'GRU',status:'S',operationalTimes:{estimatedRunwayArrival:{dateUtc:'2032-10-20T14:10:00Z'}},flightStatusUpdates:[{updatedAt:{dateUtc:'2032-10-20T13:00:00Z'},updatedDateFields:[{field:'ERA',newDateUtc:'2032-10-20T14:10:00Z'}]}]};
const candidate={...normalizeCiriumFlightStatus(row),scheduledDepartureUtc:events[0].startDateTime,departureDate:'2032-10-20'};
window.hostCurrent=true;const admitted={candidate,session:captureAuthSession(),ownerScope:'synthetic-owner',revision:'r1',receivedAt:'2032-10-20T13:00:02Z',isCurrent:()=>window.hostCurrent};
const root=createRoot(document.getElementById('root'));window.renderAdmission=(kind='good')=>root.render(<View scheduleDay={regulationProgramDay(ui,ui[0])} program={events[0]} operationalArrival={kind==='none'?null:{...admitted,candidate:kind==='other'?{...candidate,destination:'REC'}:candidate}}/>);window.renderAdmission();`;
console.log('Bundling synthetic component');await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,jsx:'automatic',format:'iife',outfile:path.join(dir,'app.js'),alias:{'@':path.resolve('client/src'),'@shared':path.resolve('shared')},logLevel:'silent'});
const server=http.createServer((req,res)=>{const file=req.url==='/app.js'?'app.js':req.url==='/app.css'?'app.css':null;res.setHeader('Content-Type',file?.endsWith('.js')?'text/javascript':file?'text/css':'text/html');res.end(file?fs.readFileSync(path.join(dir,file)):'<html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
let browser;try{
 console.log('Launching isolated headless Chrome');browser=await chromium.launch({headless:true,timeout:20000,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 for(const zone of ['UTC','America/Sao_Paulo','Asia/Tokyo']){
  const context=await browser.newContext({timezoneId:zone,serviceWorkers:'block'});let external=0;const errors=[];
  await context.route('**/*',route=>{if(route.request().url().startsWith(origin))return route.continue();external++;return route.abort();});
  await context.addInitScript(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-owner',email:'fixture@example.invalid',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-offline-token');window.fixtureNow=Date.parse('2032-10-20T13:01:00Z');Date.now=()=>window.fixtureNow;});
  const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);console.log('Loaded fixture',zone);await page.getByLabel('Fonte da previsão de encerramento',{exact:true}).waitFor();
  await page.locator('details').filter({has:page.locator('summary',{hasText:'Confirmar dados e ajustar referência'})}).first().evaluate(el=>el.open=true);
  await page.getByLabel('Regime aplicável',{exact:true}).selectOption('operator-reviewed');
  await page.getByLabel('Limite normal de encerramento',{exact:true}).fill('2032-10-20T12:00');
  await page.getByLabel('Composição da tripulação',{exact:true}).selectOption('simple');await page.getByLabel('Condição de aclimatação',{exact:true}).selectOption('acclimatized');
  await page.getByLabel('Táxi de chegada em minutos',{exact:true}).fill('10');
  await page.getByLabel('Tarefas posteriores em minutos',{exact:true}).fill('0');
  await page.getByLabel('Confirmei apresentação e etapas',{exact:true}).check();
  await page.getByLabel('Confirmei o fuso dos horários publicados',{exact:true}).check();
  await page.getByLabel('Revisei a referência do limite normal',{exact:true}).check();
  await page.getByLabel('Atraso previsto em minutos',{exact:true}).fill('60');
  const result=page.getByLabel('Resultado temporal',{exact:true});assert.match(await result.innerText(),/Excede a referência em 30 min/);
  const mode=page.getByLabel('Fonte da previsão de encerramento',{exact:true});await mode.selectOption('operational');assert.match(await result.innerText(),/10 min de margem da previsão operacional/);
  await page.getByLabel('Método da projeção',{exact:true}).selectOption('detailed');
  const baseline=process.env.EXPECT_REGULATION_REVIEW_BASELINE==='1';
  assert.equal(await page.getByLabel('Dados pendentes',{exact:true}).count(),baseline?1:0,'P2 operational source cannot show missing manual flight duration');
  assert.equal(await page.getByLabel('Marcos da previsão operacional',{exact:true}).count(),baseline?0:1,'P2 breakdown follows selected source');
  assert.equal(await page.getByLabel('Concierge explica esta jornada',{exact:true}).count(),baseline?1:0,'P2 manual explanation hidden in operational mode');
  if(!baseline){const table=page.getByLabel('Marcos da previsão operacional',{exact:true});assert.match(await table.innerText(),/11:20/);assert.match(await table.innerText(),/11:50/);assert.doesNotMatch(await table.innerText(),/12:30/);}
  await page.getByLabel('Método da projeção',{exact:true}).selectOption('schedule');
assert.equal(await page.getByLabel('Atraso previsto em minutos',{exact:true}).isDisabled(),true);assert.match(await page.locator('body').innerText(),/Pouso estimado · cirium-sky/);
  await mode.selectOption('manual');assert.match(await result.innerText(),/Excede a referência em 30 min/);assert.equal(await page.getByLabel('Atraso previsto em minutos',{exact:true}).inputValue(),'60');
  await mode.selectOption('operational');await page.evaluate(()=>{window.hostCurrent=false;window.fixtureNow+=1000;});await page.waitForFunction(()=>document.querySelector('[aria-label="Atraso previsto em minutos"]').disabled===false);assert.match(await result.innerText(),/Excede a referência em 30 min/);
  await page.evaluate(()=>{window.hostCurrent=true;window.fixtureNow+=16*60000;});await page.waitForFunction(()=>document.querySelector('[aria-label="Fonte da previsão de encerramento"] option[value="operational"]').disabled);assert.match(await result.innerText(),/Excede a referência em 30 min/);
  await page.evaluate(()=>{window.fixtureNow=Date.parse('2032-10-20T13:01:00Z');window.renderAdmission('other');});await page.waitForFunction(()=>document.querySelector('[aria-label="Fonte da previsão de encerramento"] option[value="operational"]').disabled);
  await page.evaluate(()=>{window.renderAdmission();window.dispatchEvent(new Event('crewcheck:auth-will-change'));});await page.waitForFunction(()=>document.querySelector('[aria-label="Fonte da previsão de encerramento"] option[value="operational"]').disabled);
  assert.equal(external,0);assert.deepEqual(errors,[]);await context.close();
 }
 console.log((process.env.EXPECT_REGULATION_REVIEW_BASELINE==='1'?'CONFIRMED published defect: ':'PASS fix: ')+'operational selected breakdown, manual pending/explainer suppressed, manual alternative/guards preserved, 3 zones offline');
}finally{if(browser)await browser.close();server.close();fs.rmSync(dir,{recursive:true,force:true});}
