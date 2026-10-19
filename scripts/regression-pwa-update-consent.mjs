import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {createRequire}from'node:module';
import{build}from'esbuild';
import{stampServiceWorkerBuild}from'./ci/stamp-service-worker-build.mjs';
const require=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url),{chromium}=require('playwright');
const raw=fs.readFileSync('client/public/sw.js','utf8'),push=fs.readFileSync('client/public/crewcheck-push-offline.js','utf8');
const bundled=await build({stdin:{contents:"import React from'react';import{createRoot}from'react-dom/client';import Notice from'./client/src/components/PwaUpdateNotice';import{installPwaUpdateCoordinator}from'./client/src/lib/pwaUpdateCoordinator';window.fixtureStop=installPwaUpdateCoordinator();createRoot(document.getElementById('notice')).render(<Notice/>);navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'fixture.js',jsx:'automatic'});
const js=bundled.outputFiles.find(f=>f.path.endsWith('.js')).text,css=bundled.outputFiles.find(f=>f.path.endsWith('.css')).text;
const html=version=>`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><main><label>Rascunho<input id="draft"></label><p id="operation">Importação sintética em curso</p><div id="notice"></div></main><script src="/assets/app-${version}.js"></script>`;
assert.notEqual(stampServiceWorkerBuild(raw,html('a')).buildId,stampServiceWorkerBuild(raw,html('b')).buildId,'same public version + new bundle must change worker bytes');
assert.throws(()=>stampServiceWorkerBuild(raw,'<p>announcement only</p>'),'announcement without served entry is not downloadable');
let stage='a',missing=false,servedMismatch=false;
const server=http.createServer((req,res)=>{res.setHeader('cache-control','no-store');if(req.url==='/sw.js'){res.setHeader('content-type','text/javascript');res.end(stampServiceWorkerBuild(raw,html(stage)).source);}
 else if(req.url==='/crewcheck-push-offline.js'){res.setHeader('content-type','text/javascript');res.end(push);}
 else if(req.url?.startsWith('/assets/')){res.setHeader('content-type','text/javascript');if(missing){res.statusCode=503;res.end('');}else res.end(js+`;window.fixtureVersion=${JSON.stringify(req.url.match(/app-(\w+)\.js/)?.[1])};`);}
 else if(req.url==='/manifest.json'){res.setHeader('content-type','application/json');res.end('{"name":"fixture","display":"standalone"}');}
 else if(req.url?.startsWith('/icons/')){res.setHeader('content-type','image/png');res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3WQAAAAASUVORK5CYII=','base64'));}
 else{res.setHeader('content-type','text/html');res.end(html(servedMismatch?'a':stage));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;let browser;
let checks=2;const check=(value,label)=>{checks++;assert(value,label);};
try{
 browser=await chromium.launch({args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'allow'});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await context.addInitScript(()=>{window.permissionCalls=0;Notification.requestPermission=()=>{window.permissionCalls++;throw Error('No permissions');};});
 const first=await context.newPage();await first.goto(origin);await first.waitForFunction(()=>navigator.serviceWorker.controller);await first.reload();await first.waitForFunction(()=>window.fixtureVersion==='a');
 check(await first.getByRole('complementary').count()===0,'initial installation is not an update');
 const second=await context.newPage();await second.goto(origin);await second.waitForFunction(()=>window.fixtureVersion==='a');await first.locator('#draft').fill('unsaved A');await second.locator('#draft').fill('unsaved B');
 const update=()=>first.evaluate(async()=>{const registration=await navigator.serviceWorker.ready;await registration.update();});
 stage='b';missing=true;await update();await first.waitForTimeout(300);check(await first.getByRole('complementary').count()===0,'failed asset download creates no offer');
 stage='c';missing=false;servedMismatch=true;await update();await first.waitForTimeout(300);check(await first.getByRole('complementary').count()===0,'worker build mismatching served index creates no offer');
 stage='d';servedMismatch=false;await update();const notice=first.getByRole('complementary',{name:'Atualização do CrewCheck'});await notice.waitFor();await second.getByRole('complementary').waitFor();
 check(await first.evaluate(()=>window.fixtureVersion==='a'),'downloaded update did not reload current page');check(await first.locator('#draft').inputValue()==='unsaved A','download retains form');
 for(const width of [320,390,820])for(const font of [14,28]){await first.setViewportSize({width,height:844});await notice.evaluate((node,size)=>node.style.fontSize=size+'px',font);const box=await notice.boundingBox();check(box.x>=0&&box.x+box.width<=width&&box.y>=80&&box.y+box.height<=748,'accessible notice clears navigation at font2x');check(await first.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');}await first.setViewportSize({width:390,height:844});await notice.evaluate(node=>node.style.fontSize='14px');if(process.env.PWA_UPDATE_SCREENSHOT)await first.screenshot({path:process.env.PWA_UPDATE_SCREENSHOT});
 await first.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await first.waitForTimeout(50);check(await notice.getByRole('button',{name:'Atualizar agora'}).isVisible(),'visibility never auto-activates');
 await notice.getByRole('button',{name:'Depois',exact:true}).click();await notice.waitFor({state:'hidden'});await second.getByRole('complementary').waitFor({state:'hidden'});check(await first.evaluate(async()=>Boolean((await navigator.serviceWorker.ready).waiting)),'defer leaves waiting worker intact');
 stage='e';await update();await notice.waitFor();await second.getByRole('complementary').waitFor();
 await context.setOffline(true);await notice.getByText('Sem conexão.',{exact:false}).waitFor();check(await notice.getByRole('button',{name:'Atualizar agora'}).isDisabled(),'offline cannot request activation');check(await first.locator('#draft').inputValue()==='unsaved A','offline retains form');await context.setOffline(false);await notice.getByRole('button',{name:'Atualizar agora'}).waitFor();
 await notice.getByRole('button',{name:'Atualizar agora'}).click();await notice.getByRole('link',{name:'Abrir versão nova'}).waitFor();await second.getByRole('link',{name:'Abrir versão nova'}).waitFor();
 check(await first.locator('#draft').inputValue()==='unsaved A','explicit activation preserves first form');check(await second.locator('#draft').inputValue()==='unsaved B','another tab activation preserves second form');check(await first.evaluate(()=>window.fixtureVersion==='a'),'controllerchange never reloads first tab');check(await second.evaluate(()=>window.fixtureVersion==='a'),'controllerchange never reloads other tab');check((await first.locator('#operation').innerText()).includes('em curso'),'in-progress action remains intact');
 await context.setOffline(true);const oldAsset=await first.evaluate(async()=>{const response=await fetch('/assets/app-a.js');return{status:response.status,text:await response.text()};});check(oldAsset.status===200&&oldAsset.text.includes('fixtureVersion="a"'),'old tab assets remain available offline');await context.setOffline(false);
 const popupPromise=context.waitForEvent('page');await notice.getByRole('link',{name:'Abrir versão nova'}).click();const fresh=await popupPromise;await fresh.waitForFunction(()=>window.fixtureVersion==='e');check(await first.locator('#draft').inputValue()==='unsaved A','opening new version does not discard old form');check(await fresh.evaluate(()=>window.permissionCalls===0),'no permission request');
 check(await fresh.getByRole('complementary').count()===0,'no controllerchange/update reload loop in new build');
 console.log(`PASS ${checks} actual worker/update UI assertions: complete served bundle only, failed/mismatched downloads, consent, defer across tabs, offline, no hidden/idle activation, controllerchange without reload, old form/action/cache preservation and explicit new tab; no real permissions or production requests.`);await context.close();
}finally{await browser?.close();await new Promise(r=>server.close(r));}
