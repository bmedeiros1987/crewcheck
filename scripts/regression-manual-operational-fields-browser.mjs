import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {createRequire} from 'node:module';import {build} from 'esbuild';
const {chromium}=createRequire(process.env.GATE_PLAYWRIGHT_PACKAGE||process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'manual-operational-browser-'));
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {ManualGateEditor} from ${JSON.stringify(path.resolve('client/src/components/nextflight/ManualGateEditor.tsx'))};import {computeNextFlightGate} from ${JSON.stringify(path.resolve('client/src/components/nextflight/useNextFlightGate.ts'))};import {writeManualGate,readManualGate,manualGateRevision,manualGateAccountKey} from ${JSON.stringify(path.resolve('client/src/lib/nextFlightGate.ts'))};
const event={id:'synthetic-flight',kind:'flight',flightNumber:'QA4002',origin:'BSB',destination:'GRU',date:new Date('2032-10-20T12:30:00Z'),canonical:{startDateTime:'2032-10-20T12:30:00Z'}};
let selected=event;window.notifyAuthChange=()=>flushSync(()=>window.dispatchEvent(new Event('crewcheck:auth-changed')));window.read=()=>computeNextFlightGate(selected);window.event=event;window.concurrentGate=(gate)=>{const owner=manualGateAccountKey(JSON.parse(localStorage.getItem('crewcheck_auth_user')));return writeManualGate(localStorage,owner,selected,{gate,author:'Other synthetic tab',expectedManualRevision:manualGateRevision(readManualGate(localStorage,owner,selected),owner,selected)});};window.root=createRoot(document.getElementById('root'));window.renderEvent=(patch={})=>{selected={...event,...patch};window.root.render(<ManualGateEditor event={selected}/>);};window.renderEvent();`;
let server,browser;
try {
 await build({stdin:{contents:entry,loader:'jsx',resolveDir:process.cwd()},bundle:true,jsx:'automatic',format:'iife',outfile:path.join(dir,'app.js'),alias:{'@':path.resolve('client/src'),'@shared':path.resolve('shared')},logLevel:'silent'});
 server=http.createServer((req,res)=>{const file=req.url==='/app.js'?'app.js':req.url==='/app.css'?'app.css':null;res.setHeader('Content-Type',file?.endsWith('.js')?'text/javascript':file?'text/css':'text/html');res.end(file?fs.readFileSync(path.join(dir,file)):'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,...(process.env.GATE_CHROMIUM_EXECUTABLE?{executablePath:process.env.GATE_CHROMIUM_EXECUTABLE}:{})});const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});let external=0;const errors=[];
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(external++,route.abort()));
 await context.addInitScript(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'fixture-A',email:'fixture@example.invalid',name:'Autor sintético',role:'user'}));localStorage.setItem('crewcheck_auth_token','offline-token');});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.getByLabel('Status informado por você',{exact:true}).waitFor();
 await page.getByLabel('Status informado por você',{exact:true}).fill('Embarcando');await page.getByRole('button',{name:'Salvar status',exact:true}).click();await page.getByRole('button',{name:'Remover status manual'}).waitFor();let info=await page.evaluate(()=>window.read());assert.equal(info.status,'Embarcando');assert.equal(info.gateSource,null);assert.equal(info.statusSource,'manual');assert.match(await page.locator('body').innerText(),/Informado por Autor sintético/);
 await page.getByLabel('Matrícula informada por você',{exact:true}).fill('pr-abc');await page.getByRole('button',{name:'Salvar matrícula',exact:true}).click();await page.getByRole('button',{name:'Remover matrícula manual'}).waitFor();info=await page.evaluate(()=>window.read());assert.equal(info.registration,'PR-ABC');assert.equal(info.status,'Embarcando');
 await page.getByLabel('Portão de embarque',{exact:true}).fill('24');await page.getByRole('button',{name:'Salvar portão',exact:true}).click();await page.waitForFunction(()=>window.read().gate==='24');await page.reload();await page.getByLabel('Status informado por você',{exact:true}).waitFor();info=await page.evaluate(()=>window.read());assert.equal(info.gate,'24');assert.equal(info.status,'Embarcando');assert.equal(info.registration,'PR-ABC');
 // Three explicit choices, keyboard reachable beside the existing gate form.
 const typeSelect=page.getByLabel('Tipo de embarque informado por você',{exact:true});
 assert.deepEqual(await typeSelect.locator('option').allTextContents(),['Não confirmado','Remota','Finger']);assert.equal(await typeSelect.inputValue(),'unknown');
 assert.equal(info.boardingType,'unknown','existing v2 gate reloads without inferred type');
 await page.getByLabel('Portão de embarque',{exact:true}).fill('47');await typeSelect.focus();await typeSelect.press('Home');await typeSelect.press('ArrowDown');assert.equal(await typeSelect.inputValue(),'remote');assert(await typeSelect.evaluate(el=>el===document.activeElement),'native selector is keyboard focused');
 await page.getByRole('button',{name:'Salvar portão',exact:true}).click();await page.waitForFunction(()=>window.read().boardingType==='remote');
 info=await page.evaluate(()=>window.read());assert.equal(info.gate,'47');assert.equal(info.remote,false);assert.equal(info.manualBoardingType.author,'Autor sintético');const confirmedAt=info.manualBoardingType.setAtEpochMs;
 await page.reload();await typeSelect.waitFor();assert.equal(await typeSelect.inputValue(),'remote');info=await page.evaluate(()=>window.read());assert.equal(info.boardingType,'remote');assert.equal(info.manualBoardingType.setAtEpochMs,confirmedAt);assert.equal(info.status,'Embarcando');assert.equal(info.registration,'PR-ABC');
 await typeSelect.selectOption('finger');await page.getByRole('button',{name:'Salvar portão',exact:true}).click();await page.waitForFunction(()=>window.read().boardingType==='finger');assert.equal((await page.evaluate(()=>window.read())).gate,'47');
 // Editing another gate must not silently carry the selected type across.
 await page.getByLabel('Portão de embarque',{exact:true}).fill('48');assert.equal(await typeSelect.inputValue(),'unknown');await page.getByRole('button',{name:'Salvar portão',exact:true}).click();await page.waitForFunction(()=>window.read().gate==='48');assert.equal((await page.evaluate(()=>window.read())).boardingType,'unknown');
 // Another tab's write without an event invalidates a captured gate+type save.
 await typeSelect.selectOption('remote');assert((await page.evaluate(()=>window.concurrentGate('49'))).ok);const concurrentBytes=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('crewcheck:manual-gate:'))));
 await page.getByRole('button',{name:'Salvar portão',exact:true}).click();assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('crewcheck:manual-gate:')))),concurrentBytes);assert.equal((await page.evaluate(()=>window.read())).gate,'49');assert.equal((await page.evaluate(()=>window.read())).boardingType,'unknown');
 await page.evaluate(()=>window.dispatchEvent(new Event('crewcheck:manual-gate-updated')));await page.waitForFunction(()=>document.querySelector('input[placeholder="Ex.: 24"]').value==='49');
 // A same-account token change also rejects the stale editor before storage mutation.
 await typeSelect.selectOption('finger');await page.evaluate(()=>localStorage.setItem('crewcheck_auth_token','other-synthetic-token'));await page.getByRole('button',{name:'Salvar portão',exact:true}).click();assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('crewcheck:manual-gate:')))),concurrentBytes);
 // Finish the synthetic notification before observing the returned session.
 // Runtime must invalidate the rejected choice even when B never rendered.
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','offline-token');window.notifyAuthChange();});assert.equal(await typeSelect.inputValue(),'unknown');
 // Rejected A→B→A may have no intermediate render, or may commit B before returning.
 // Neither ordering may revive the old Finger draft, even with Save in the same JS turn.
 for(const observeIntermediate of [false,true]) {
  await typeSelect.selectOption('finger');
  const beforeCycle=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('crewcheck:manual-gate:'))));
  const cycle=await page.evaluate(observeIntermediate=>{
   const save=[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Salvar portão');
   localStorage.setItem('crewcheck_auth_token','temporary-token');save.click();
   const rejectedBytes=Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('crewcheck:manual-gate:')));
   if(observeIntermediate)window.notifyAuthChange();
   localStorage.setItem('crewcheck_auth_token','offline-token');window.notifyAuthChange();
   const restoredDraft=document.querySelector('select').value;save.click();
   return {rejectedBytes,restoredDraft,storedType:window.read().boardingType};
  },observeIntermediate);
  assert.deepEqual(cycle.rejectedBytes,beforeCycle,'silent-token stale Save is still rejected');
  assert.equal(cycle.restoredDraft,'unknown','rejected session draft cannot revive on A→B→A');
  assert.equal(cycle.storedType,'unknown','immediate Save cannot persist the rejected old type');
  await page.waitForFunction(()=>document.querySelector('.cc-manual-gate-status').textContent.startsWith('Portão 49 salvo')); // Next input follows the visible committed receipt.
 }
 await typeSelect.selectOption('remote');assert.equal(await typeSelect.inputValue(),'remote');await page.getByRole('button',{name:'Salvar portão',exact:true}).click();await page.waitForFunction(()=>window.read().boardingType==='remote');
 await page.getByRole('button',{name:'Remover',exact:true}).click();await page.waitForFunction(()=>window.read().gate==='');assert.equal((await page.evaluate(()=>window.read())).boardingType,'unknown');assert.equal((await page.evaluate(()=>window.read())).status,'Embarcando');assert.equal((await page.evaluate(()=>window.read())).registration,'PR-ABC');
 await page.getByLabel('Portão de embarque',{exact:true}).fill('24');assert.equal(await typeSelect.inputValue(),'unknown');await page.getByRole('button',{name:'Salvar portão',exact:true}).click();await page.waitForFunction(()=>window.read().gate==='24');
 // Keep the actual form usable on narrow phone widths and large text, no horizontal overflow.
 for(const width of [320,390])for(const fontSize of ['100%','200%']) {
  await page.setViewportSize({width,height:844});await page.evaluate(size=>document.documentElement.style.fontSize=size,fontSize);
  const geometry=await typeSelect.evaluate(el=>({x:el.getBoundingClientRect().x,right:el.getBoundingClientRect().right,height:el.getBoundingClientRect().height,viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert(geometry.x>=0&&geometry.right<=geometry.viewport+1&&geometry.height>=44,JSON.stringify({width,fontSize,geometry}));assert(geometry.scroll<=geometry.viewport+1,JSON.stringify({width,fontSize,geometry}));
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='100%');
 await page.getByRole('button',{name:'Remover status manual'}).click();await page.waitForFunction(()=>window.read().status==='');info=await page.evaluate(()=>window.read());assert.equal(info.gate,'24');assert.equal(info.registration,'PR-ABC');
 // Change storage identity without dispatching a render event: stale Save must refuse.
 await page.getByLabel('Status informado por você',{exact:true}).fill('Cancelado');const before=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('crewcheck:manual-gate:'))));await page.evaluate(()=>localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'fixture-B',email:'other@example.invalid',role:'user'})));await page.getByRole('button',{name:'Salvar status',exact:true}).click();const after=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.startsWith('crewcheck:manual-gate:'))));assert.deepEqual(after,before);
 await page.evaluate(()=>window.dispatchEvent(new Event('crewcheck:auth-changed')));await page.waitForFunction(()=>document.querySelector('input[placeholder="Ex.: PR-ABC"]').value==='');assert.equal(await page.getByLabel('Status informado por você',{exact:true}).inputValue(),'');assert.doesNotMatch(await page.locator('body').innerText(),/Autor sintético|PR-ABC/);assert.equal(await typeSelect.inputValue(),'unknown');
 // Keep id/UTC fixed while each remaining occurrence identity field changes.
 for(const patch of [{id:'other-rendered-event'},{flightNumber:'QA9999'},{origin:'REC'},{destination:'CGH'},{canonical:{startDateTime:'2032-10-20T13:30:00Z'}}]) {
  await page.evaluate(()=>window.renderEvent());await page.getByLabel('Status informado por você',{exact:true}).fill('Rascunho da ocorrência anterior');await page.getByLabel('Matrícula informada por você',{exact:true}).fill('PR-DRAFT');await typeSelect.selectOption('remote');await page.evaluate(patch=>window.renderEvent(patch),patch);await page.waitForFunction(()=>document.querySelector('input[placeholder="Ex.: PR-ABC"]').value==='');assert.equal(await page.getByLabel('Status informado por você',{exact:true}).inputValue(),'','identity changes invalidate unsaved draft');assert.equal(await typeSelect.inputValue(),'unknown','identity changes invalidate unsaved boarding type');
 }
 assert.equal(external,0);assert.deepEqual(errors,[]);await context.close();
 console.log('PASS actual manual editor: status/registration without gate, per-field persistence/clear, gate preserved, author/time shown, reload, keyboard/mobile/large-text selector, typed gate CAS and token fences, type clear/reset, stale owner Save rejected, account reset, zero external requests.');
} finally {if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
