import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {createRequire} from 'node:module';import {build} from 'esbuild';
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'regulation-arrival-browser-'));
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import View from ${JSON.stringify(path.resolve('client/src/components/regulation/RegulationScenarioView.tsx'))};
import {buildCanonicalRosterEvents} from ${JSON.stringify(path.resolve('client/src/lib/canonicalRoster.ts'))};
import {regulationProgramDay} from ${JSON.stringify(path.resolve('shared/regulationScenarioPrefill.mjs'))};
import {captureAuthSession} from ${JSON.stringify(path.resolve('client/src/lib/authClient.ts'))};
import {normalizeCiriumFlightStatus} from ${JSON.stringify(path.resolve('server/cirium-flight-adapter.mjs'))};
const day={date:'20/10/2032',year:2032,month:10,type:'VOO',base:'BSB',dutyReport:'04:10',dutyReportSource:'published',dutyDebrief:'11:30',dutyDebriefSource:'published',legs:[{flightNumber:'QA1234',origin:'BSB',destination:'GRU',departureTime:'09:30',arrivalTime:'11:00',presentationTime:'04:10',workType:'OP',aircraftType:'A320'}]};
const events=buildCanonicalRosterEvents({days:[day],year:2032,month:10,base:'BSB'}).filter(e=>e.kind==='flight');const ui=events.map(c=>({id:c.id,kind:c.kind,canonical:c,day:c.publishedDay}));
const row={carrierFsCode:'QA',flightNumber:'1234',departureAirportFsCode:'BSB',arrivalAirportFsCode:'GRU',status:'S',operationalTimes:{estimatedRunwayArrival:{dateUtc:'2032-10-20T14:10:23Z'}},flightStatusUpdates:[{updatedAt:{dateUtc:'2032-10-20T13:00:00Z'},updatedDateFields:[{field:'ERA',newDateUtc:'2032-10-20T14:10:23Z'}]}]};
const candidate={...normalizeCiriumFlightStatus(row),scheduledDepartureUtc:events[0].startDateTime,departureDate:'2032-10-20'};
window.hostCurrent=true;const admitted={candidate,session:captureAuthSession(),ownerScope:'synthetic-owner',revision:'r1',receivedAt:'2032-10-20T13:00:02Z',isCurrent:()=>window.hostCurrent};
const root=createRoot(document.getElementById('root'));window.renderAircraft=(code)=>{const changed={...day,legs:day.legs.map(leg=>({...leg,aircraftType:code}))};const updated=buildCanonicalRosterEvents({days:[changed],year:2032,month:10,base:'BSB'}).filter(e=>e.kind==='flight');const rows=updated.map(c=>({id:c.id,kind:c.kind,canonical:c,day:c.publishedDay}));root.render(<View scheduleDay={regulationProgramDay(rows,rows[0])} program={updated[0]}/>);};window.renderAdmission=(kind='good')=>root.render(<View scheduleDay={regulationProgramDay(ui,ui[0])} program={events[0]} operationalArrival={kind==='none'?null:{...admitted,candidate:kind==='other'?{...candidate,destination:'REC'}:kind==='seconds'?{...normalizeCiriumFlightStatus({...row,operationalTimes:{estimatedRunwayArrival:{dateUtc:'2032-10-20T15:30:01Z'}},flightStatusUpdates:[{updatedAt:{dateUtc:'2032-10-20T13:00:00Z'},updatedDateFields:[{field:'ERA',newDateUtc:'2032-10-20T15:30:01Z'}]}]}),scheduledDepartureUtc:events[0].startDateTime,departureDate:'2032-10-20'}:candidate}}/>);window.renderAdmission();`;
console.log('Bundling synthetic component');await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,jsx:'automatic',format:'iife',outfile:path.join(dir,'app.js'),alias:{'@':path.resolve('client/src'),'@shared':path.resolve('shared')},logLevel:'silent'});
const server=http.createServer((req,res)=>{const file=req.url==='/app.js'?'app.js':req.url==='/app.css'?'app.css':null;res.setHeader('Content-Type',file?.endsWith('.js')?'text/javascript':file?'text/css':'text/html');res.end(file?fs.readFileSync(path.join(dir,file)):'<html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
let browser;try{
 console.log('Launching isolated headless Chrome');browser=await chromium.launch({headless:true,timeout:20000,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 for(const zone of ['UTC','America/Sao_Paulo','Asia/Tokyo']){
  const context=await browser.newContext({timezoneId:zone,viewport:{width:390,height:844},serviceWorkers:'block'});let external=0;const errors=[];
  await context.route('**/*',route=>{if(route.request().url().startsWith(origin))return route.continue();external++;return route.abort();});
  await context.addInitScript(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-owner',email:'fixture@example.invalid',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-offline-token');window.fixtureNow=Date.parse('2032-10-20T13:01:00Z');Date.now=()=>window.fixtureNow;});
  const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);console.log('Loaded fixture',zone);await page.getByRole('button',{name:'Ajustar dados',exact:true}).waitFor();
  const baseline=process.env.EXPECT_REGULATION_NATIVE_BASELINE==='1';
  await page.getByRole('button',{name:'Ajustar dados',exact:true}).click();
  const composition=page.getByLabel('Composição da tripulação',{exact:true}),equipment=page.getByLabel('Equipamento da etapa 1',{exact:true}),restore=page.getByRole('button',{name:'Restaurar dados da escala'});
  await composition.evaluate(el=>{window.nativeChanges=0;el.addEventListener('change',()=>window.nativeChanges++);});
  for(const mode of ['pointer','keyboard']){
   await restore.click();assert.equal(await composition.inputValue(),'simple');await page.evaluate(()=>window.nativeChanges=0);
   if(mode==='pointer'){await composition.click();await page.keyboard.press('Enter');}
   else{await composition.focus();await page.keyboard.press('Space');await page.keyboard.press('Enter');}
   assert.equal(await composition.inputValue(),'simple');assert.equal(await page.evaluate(()=>window.nativeChanges),0,'same-value native selection must not synthesize a change event');
   await equipment.fill('B789');assert.equal(await composition.inputValue(),baseline?'':'simple',mode+' same-value user intent survives equipment inference');
  }
  await restore.click();await composition.focus();await page.keyboard.press('Tab');await equipment.fill('B789');assert.equal(await composition.inputValue(),'','focus/tab alone remains untouched');
  await restore.click();await equipment.fill('B789');assert.equal(await composition.inputValue(),'','Restore clears intent');await equipment.fill('A320');assert.equal(await composition.inputValue(),'simple','untouched still infers NB');
  assert.equal(external,0);assert.deepEqual(errors,[]);await context.close();
 }
 console.log((process.env.EXPECT_REGULATION_NATIVE_BASELINE==='1'?'CONFIRMED native same-value defect':'PASS native pointer/keyboard same-value intent, no synthetic change, untouched focus/tab, Restore/inference')+', 3 zones offline');
}finally{if(browser)await browser.close();server.close();fs.rmSync(dir,{recursive:true,force:true});}
