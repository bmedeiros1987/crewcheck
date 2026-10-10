import {handlePersonalConsent} from '../server/free-day-personal-consent.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import {handleSourceQueue} from '../server/free-day-source-queue.mjs';
import {handleVoluntarySources} from '../server/free-day-sources.mjs';
import {syntheticSourceDatabase} from './fixtures/free-day-source-db.mjs';
import {pdfBytes,lines} from './fixtures/free-day-source-pdf.mjs';
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright');
const db=syntheticSourceDatabase();db.state.roster.crewId='99999999';let posts=[];
const user={email:'synthetic-source@example.invalid',id:'synthetic-owner'};
const harness=path.resolve('client/__source-probe.tsx');fs.writeFileSync(harness,`import React from 'react';import {createRoot} from 'react-dom/client';import {FreeDaySourceConsent} from './src/components/FreeDaySourceConsent';createRoot(document.getElementById('root')!).render(<FreeDaySourceConsent session="synthetic-session" bound={true} />);`);
const server=await createServer({configFile:false,root:path.resolve('client'),resolve:{alias:{'@':path.resolve('client/src'),'@shared':path.resolve('shared')}},esbuild:{jsx:'automatic'},cacheDir:path.join('/tmp',`crewcheck-source-vite-${process.pid}`),optimizeDeps:{entries:[harness],include:['react','react/jsx-runtime','react/jsx-dev-runtime','react-dom/client','pdfjs-dist/legacy/build/pdf.mjs']},plugins:[{name:'source-consent-synthetic-e2e',configureServer(server){server.middlewares.use((req,res,next)=>{
 if(['/api/notifications/free-day-sources','/api/notifications/free-day-source-queue','/api/notifications/free-day-personal-consent'].includes(req.url))return void (req.url.endsWith('personal-consent')?handlePersonalConsent:req.url.endsWith('source-queue')?handleSourceQueue:handleVoluntarySources)(req,res,{identity:r=>r.headers.authorization==='Bearer synthetic-only'?user:null,dbPool:async()=>db,readJson:async r=>{let text='';for await(const chunk of r)text+=chunk;posts.push(JSON.parse(text));return JSON.parse(text);},sendJson:(r,status,data)=>{r.writeHead(status,{'content-type':'application/json'});r.end(JSON.stringify(data));}});
 if(req.url==='/__source_probe'){res.setHeader('content-type','text/html');res.end('<div id="root"></div><script type="module" src="/__source-probe.tsx"></script>');return;}next();});}}],server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd(),fs.realpathSync('node_modules')]}}});
await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
const out='artifacts/free-day-sources';fs.mkdirSync(out,{recursive:true});
try {
 for(const timezoneId of ['UTC','America/Sao_Paulo','Asia/Tokyo']) {
  db.state.rows.clear();posts=[];
  const context=await browser.newContext({timezoneId,serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.addInitScript(user=>{localStorage.setItem('crewcheck_auth_token','synthetic-only');localStorage.setItem('crewcheck_auth_user',JSON.stringify(user));},user);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Synthetic browser error:',e.message);});page.on('console',m=>{if(m.type()==='error')console.error(m.text());});await page.goto(origin+'/__source_probe');
  await page.locator('summary').click();
  const inputs=page.locator('input[type=file]');
  await inputs.nth(0).setInputFiles({name:'synthetic-before.pdf',mimeType:'application/pdf',buffer:pdfBytes(lines('01:46'))});
  await page.getByText('Período 2026-08',{exact:false}).waitFor();
  await inputs.nth(1).setInputFiles({name:'synthetic-after.pdf',mimeType:'application/pdf',buffer:pdfBytes(lines('08:30'))});
  await page.waitForFunction(()=>document.querySelectorAll('[data-free-day-source-consent] ul').length===2);
  assert.equal(posts.length,0,'PDF selection never posts files/text');
  await page.locator('input[type=date]').fill('2026-08-12');
  const save=page.getByRole('button',{name:'Salvar revisão simulada'});assert.equal(await save.isDisabled(),true);
  await page.locator('input[type=checkbox]').nth(0).check();assert.equal(await save.isDisabled(),true);
  await page.locator('input[type=checkbox]').nth(1).check();await save.click();
  await page.locator('[data-source-review-result]').filter({hasText:'404 minutos'}).waitFor();assert.equal(posts.length,1);
  assert.deepEqual(Object.keys(posts[0].before).sort(),['documentHash','identityDigest','period','starts']);
  assert.ok(!JSON.stringify(posts).includes('SYNTHETIC TEST'));assert.ok(!JSON.stringify(posts).includes('99999999'));assert.ok(!JSON.stringify(posts).includes('rawText'));
  assert.match(await page.locator('[data-source-review-result]').innerText(),/origem oficial não verificada/);
  assert.match(await page.locator('[data-source-review-result]').innerText(),/Valor: pendente/);
  assert.equal(db.state.rows.size,1);
  await page.screenshot({path:path.join(out,timezoneId.replaceAll('/','_')+'.png'),fullPage:true});
  await page.getByRole('button',{name:'Revogar e remover recibos'}).click();await page.getByRole('status').filter({hasText:'revogado'}).waitFor();
  assert.ok(![...db.state.rows.values()].join('').includes('documentHash'));
  await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','other-token');window.dispatchEvent(new Event('crewcheck:auth-changed'));});
  assert.equal(await save.isDisabled(),true);assert.equal(await page.locator('ul').count(),0);assert.equal(posts.length,2);
  assert.deepEqual(errors,[]);await context.close();
 }
 // Hold physical file reads to reproduce user review of stale receipts and
 // multiple selections resolving out of order. No parser/provenance flags are injected.
 {
  db.state.rows.clear();posts=[];
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.addInitScript(user=>{
   localStorage.setItem('crewcheck_auth_token','synthetic-only');localStorage.setItem('crewcheck_auth_user',JSON.stringify(user));
   const original=File.prototype.arrayBuffer,held=new Set();globalThis.syntheticFileGates={};
   const digest=crypto.subtle.digest.bind(crypto.subtle);globalThis.syntheticLogoutDigests=0;crypto.subtle.digest=async(...args)=>{const result=await digest(...args);if(globalThis.syntheticLogoutStarted)globalThis.syntheticLogoutDigests++;return result;};
   File.prototype.arrayBuffer=async function(){if(this.name.startsWith('slow-') && !held.has(this.name)){held.add(this.name);await new Promise(resolve=>globalThis.syntheticFileGates[this.name]=resolve);}return original.call(this);};
  },user);
  const page=await context.newPage();await page.goto(origin+'/__source_probe');await page.locator('summary').click();
  const inputs=page.locator('input[type=file]'),checkboxes=page.locator('input[type=checkbox]'),save=page.getByRole('button',{name:'Salvar revisão simulada'});
  await inputs.nth(0).setInputFiles({name:'synthetic-before.pdf',mimeType:'application/pdf',buffer:pdfBytes(lines('01:46'))});await page.waitForFunction(()=>document.querySelectorAll('ul').length===1);
  await inputs.nth(1).setInputFiles({name:'synthetic-after.pdf',mimeType:'application/pdf',buffer:pdfBytes(lines('08:30'))});await page.waitForFunction(()=>document.querySelectorAll('ul').length===2);
  await page.locator('input[type=date]').fill('2026-08-12');await checkboxes.nth(0).check();await checkboxes.nth(1).check();assert.equal(await save.isDisabled(),false);
  await inputs.nth(1).setInputFiles({name:'slow-first.pdf',mimeType:'application/pdf',buffer:pdfBytes(lines('09:30'))});await page.waitForFunction(()=>Boolean(globalThis.syntheticFileGates['slow-first.pdf']));
  assert.equal(await page.locator('ul').count(),1,'old receipt removed at selection');assert.equal(await checkboxes.nth(0).isDisabled(),true);assert.equal(await checkboxes.nth(1).isDisabled(),true);assert.equal(await checkboxes.nth(0).isChecked(),false);assert.equal(await save.isDisabled(),true);
  // setInputFiles can force the second change while the control is disabled;
  // only the latest extraction for that slot may publish a receipt.
  await inputs.nth(1).setInputFiles({name:'slow-latest.pdf',mimeType:'application/pdf',buffer:pdfBytes(lines('10:30'))});await page.waitForFunction(()=>Boolean(globalThis.syntheticFileGates['slow-latest.pdf']));
  await page.evaluate(()=>globalThis.syntheticFileGates['slow-latest.pdf']());await page.getByText('2026-08-12: 10:30',{exact:false}).waitFor();assert.equal(await checkboxes.nth(0).isDisabled(),true,'older parse still pending');
  await page.evaluate(()=>globalThis.syntheticFileGates['slow-first.pdf']());await page.waitForFunction(()=>!document.querySelector('input[type=checkbox]').disabled);
  assert.equal(await page.getByText('2026-08-12: 09:30',{exact:false}).count(),0);assert.equal(await checkboxes.nth(0).isChecked(),false);assert.equal(await checkboxes.nth(1).isChecked(),false);assert.equal(await save.isDisabled(),true);assert.equal(posts.length,0);
  await inputs.nth(1).setInputFiles({name:'slow-logout.pdf',mimeType:'application/pdf',buffer:pdfBytes(lines('11:30'))});await page.waitForFunction(()=>Boolean(globalThis.syntheticFileGates['slow-logout.pdf']));
  await page.evaluate(()=>{localStorage.removeItem('crewcheck_auth_token');localStorage.removeItem('crewcheck_auth_user');window.dispatchEvent(new Event('crewcheck:auth-changed'));globalThis.syntheticLogoutStarted=true;globalThis.syntheticFileGates['slow-logout.pdf']();});
  await page.waitForFunction(()=>globalThis.syntheticLogoutDigests>=2);assert.equal(await page.locator('ul').count(),0);assert.equal(await save.isDisabled(),true);assert.equal(posts.length,0);await context.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({synthetic:true,timezones:['UTC','America/Sao_Paulo','Asia/Tokyo'],physicalPdf:true,delayMinutes:404,receiptOnly:true,officialVerified:false,queueWrites:0,delivered:false,checks:['voluntaryLocalPDF','explicitTwoCheckboxes','authenticatedHTTP','minimalReceipt','revokeDeletes','accountSwitchClears','delayedParseClearsReceipt','confirmationBoundToReceiptIdentity','latestExtractionWins','logoutDuringParse']},null,2));
 console.log('PASS physical PDF → consent UI → authenticated receipt API →404min → revoke/account switch,3TZ, zero raw text/file transfer and zero sends');
}finally{await browser.close();await server.close();fs.rmSync(harness,{force:true});}
