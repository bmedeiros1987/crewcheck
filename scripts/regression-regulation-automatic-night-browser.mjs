import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';
import {createRequire} from 'node:module';import {build} from 'esbuild';
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'night-automatic-browser-'));
// Share the exact synthetic publication used by the real-module regression.
const source=fs.readFileSync('scripts/regression-regulation-automatic-night-limits.mjs','utf8');
const fixture=source.slice(source.indexOf(' const leg='),source.indexOf(' const profile='));
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import View from ${JSON.stringify(path.resolve('client/src/components/regulation/RegulationScenarioView.tsx'))};
import * as automatic from ${JSON.stringify(path.resolve('client/src/lib/regulationAutomaticScenario.ts'))};
import {buildCanonicalRosterEvents} from ${JSON.stringify(path.resolve('client/src/lib/canonicalRoster.ts'))};
import {regulationProgramDay} from ${JSON.stringify(path.resolve('shared/regulationScenarioPrefill.mjs'))};
import {getLegalProfile} from ${JSON.stringify(path.resolve('client/src/lib/actRules.ts'))};
const m={...automatic,buildCanonicalRosterEvents,regulationProgramDay};${fixture}
const root=createRoot(document.getElementById('root'));window.renderNight=(kind='full')=>{const copy=JSON.parse(JSON.stringify(history));if(kind==='missing')copy.days=copy.days.filter(d=>d.date!=='01/11/2026');if(kind==='second')Object.assign(copy.days.find(d=>d.date==='03/11/2026'),{type:'DO',legs:[]});root.render(<View scheduleDay={regulationProgramDay(ui,ui[0])} program={events[0]} compliance={{legalProfile:getLegalProfile(copy,'cabin')}} nightRoster={copy}/>);};window.renderNight();`;
let browser,server;
try{
 await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:path.join(dir,'app.js'),alias:{'@':path.resolve('client/src'),'@shared':path.resolve('shared')},logLevel:'silent'});
 server=http.createServer((req,res)=>{const file=req.url==='/app.js'?'app.js':req.url==='/app.css'?'app.css':null;res.setHeader('Content-Type',file?.endsWith('.js')?'text/javascript':file?'text/css':'text/html');res.end(file?fs.readFileSync(path.join(dir,file)):'<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 for(const zone of ['UTC','America/Sao_Paulo','Asia/Tokyo']){
  const context=await browser.newContext({timezoneId:zone,viewport:{width:390,height:844},serviceWorkers:'block'});let outside=0;const errors=[];
  await context.route('**/*',route=>{if(route.request().url().startsWith(origin))return route.continue();outside++;return route.abort();});
  await context.addInitScript(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-owner',email:'fixture@example.invalid',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-offline-token');});
  const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  const cut=page.locator('.cc-reg-deadlines strong').nth(0),end=page.locator('.cc-reg-deadlines strong').nth(1);
  await cut.waitFor();assert.equal(await cut.innerText(),'23:29');assert.equal(await end.innerText(),'23:59');assert.equal(await page.locator('.cc-reg-margin b').innerText(),'+34 min');assert.equal(await page.locator('[data-night-state]').getAttribute('data-night-state'),'restricted');
  await page.getByRole('button',{name:'Ajustar dados',exact:true}).click();await page.getByRole('button',{name:'Simulação manual',exact:true}).click();await page.getByRole('button',{name:'Voltar ao cenário automático',exact:true}).click();await cut.waitFor();assert.equal(await cut.innerText(),'23:29','return navigation preserves history');
  await page.evaluate(()=>window.renderNight('second'));await page.waitForFunction(()=>document.querySelector('[data-night-state]')?.getAttribute('data-night-state')==='at');assert.equal(await cut.innerText(),'01:23');
  await page.evaluate(()=>window.renderNight('missing'));await page.waitForFunction(()=>document.querySelector('[data-night-state]')?.getAttribute('data-night-state')==='unknown');assert.equal(await cut.innerText(),'-');assert.equal(await page.locator('.cc-reg-margin').count(),0);
  await page.evaluate(()=>window.renderNight());await page.waitForFunction(()=>document.querySelector('[data-night-state]')?.getAttribute('data-night-state')==='restricted');
  await page.evaluate(()=>window.dispatchEvent(new Event('crewcheck:auth-expired')));await page.getByText('Sessão alterada. Reabra a programação para carregar os dados atuais.').waitFor();assert.equal(await page.locator('.cc-reg-deadlines').count(),0);
  assert.equal(outside,0);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS compiled ScenarioView→AutomaticView night limit, manual/return, publication revision, missing history and auth expiry, 3 zones; DOM only, no Inter visual or physical/operational validation');
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
