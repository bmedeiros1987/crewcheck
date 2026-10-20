// P1: exercise the real Home selectors, not a hand-written null schedule prop.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';import ts from 'typescript';import {build} from 'esbuild';
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const root=process.cwd(),home=fs.readFileSync('client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',home,99,true,ts.ScriptKind.TSX);
const names=['pad2','safe','placeholderLeg','noFutureLeg','nextFlight','chronologicalNextRosterLeg','isOperationalEvent','eventStartDateTime','eventEndDateTime'];
const functions=names.map(name=>{const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(node,'Missing actual Home selector '+name);return node.getText(ast);}).join('\n');
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import View from '${root}/client/src/components/regulation/RegulationScenarioView.tsx';import {regulationProgramDay,resolveRegulationProgram} from '${root}/shared/regulationScenarioPrefill.mjs';import {regulationLastActivity} from '${root}/shared/regulationDeadlineSummary.mjs';import {selectNextRosterEvent,isOperationalCanonicalEvent,buildCanonicalRosterEvents} from '${root}/client/src/lib/canonicalRoster.ts';
const storage={get:(key,fallback)=>fallback};${functions}
const root=createRoot(document.getElementById('root'));
window.renderFixture=(kind='empty')=>{
 const day={date:'20/10/2020',year:2020,month:10,type:'VOO',base:'BSB',dutyReport:'06:00',dutyReportSource:'published',dutyDebrief:'10:00',dutyDebriefSource:'published',legs:[{flightNumber:'QA1234',origin:'BSB',destination:'GRU',departureTime:'07:00',arrivalTime:'09:30',workType:''}]};
 const canonical=buildCanonicalRosterEvents({days:[day],year:2020,month:10,base:'BSB'}).filter(e=>e.kind==='flight');
 const expired=canonical.map(c=>({id:c.id,kind:c.kind,canonical:c,day:c.publishedDay,flightNumber:c.flightNumber,date:new Date(c.startDateTime),origin:c.origin,destination:c.destination}));
 const events=kind==='empty'?[]:expired,event=nextFlight(events),selected=resolveRegulationProgram(events,event,null),scheduleDay=regulationProgramDay(events,selected);
 window.repro={placeholder:event.placeholder,borrowedDayType:event.day.type,scheduleDay,importedUnknown:regulationLastActivity(day,'operating')};
 root.render(<View scheduleDay={scheduleDay} program={selected?.canonical}/>);
};window.renderFixture();`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'no-roster-home-'));
await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,format:'iife',outfile:path.join(dir,'app.js'),jsx:'automatic',alias:{'@':path.join(root,'client/src'),'@shared':path.join(root,'shared')},logLevel:'silent'});
let browser;try{
 browser=await chromium.launch({headless:true,timeout:20000,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const origin='https://synthetic-no-roster.invalid';
 for(const zone of ['UTC','America/Sao_Paulo','Asia/Tokyo']){
  const context=await browser.newContext({timezoneId:zone,serviceWorkers:'block'});let external=0;const errors=[];
  await context.addInitScript(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-owner',email:'fixture@example.invalid',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-only');});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin){external++;return route.abort();}const file=url.pathname==='/app.js'?'app.js':url.pathname==='/app.css'?'app.css':null;return route.fulfill({contentType:file?.endsWith('.js')?'text/javascript':file?'text/css':'text/html',body:file?fs.readFileSync(path.join(dir,file)):'<html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'});});
  const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);
  for(const kind of ['empty','expired']){
   await page.evaluate(kind=>window.renderFixture(kind),kind);
   await page.getByRole('button',{name:'Confirmar dados do limite',exact:true}).click();
   const result=await page.evaluate(()=>window.repro);assert.equal(result.placeholder,true);assert.equal(result.scheduleDay,null);assert.equal(result.importedUnknown,'unknown','a real imported unknown leg cannot be overridden as OP');
   assert.equal(result.borrowedDayType,kind==='empty'?'IMPORTAR':'VOO');
   assert.equal(await page.getByLabel('Última atividade da jornada',{exact:true}).count(),1);assert.match(await page.locator('h1').innerText(),/Regulamentação/);assert.match(await page.locator('body').innerText(),/Simulação sem escala/);
  }
  assert.equal(external,0);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS P1 actual Home empty and expired placeholder day -> no imported scenario -> editable manual last activity; real imported unknown remains unknown; 3 zones; offline');
}finally{if(browser)await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
