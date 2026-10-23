import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {stampServiceWorkerBuild} from './ci/stamp-service-worker-build.mjs';
const require=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url);
const {chromium}=require('playwright');
const raw=fs.readFileSync(process.env.PWA_WORKER_SOURCE || 'client/public/sw.js','utf8');
const push=fs.readFileSync('client/public/crewcheck-push-offline.js','utf8');
const compiled=await build({stdin:{contents:"import React from'react';import{createRoot}from'react-dom/client';import Notice from'./client/src/components/PwaUpdateNotice';import{installPwaUpdateCoordinator}from'./client/src/lib/pwaUpdateCoordinator';installPwaUpdateCoordinator();createRoot(document.getElementById('notice')).render(<Notice/>);navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'fixture.js',jsx:'automatic'});
const js=compiled.outputFiles.find(file=>file.path.endsWith('.js')).text;
const css=compiled.outputFiles.find(file=>file.path.endsWith('.css')).text;
const html=version=>`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><input id="draft"><div id="notice"></div><script src="/assets/app-${version}.js"></script></body></html>`;
const stamped=version=>stampServiceWorkerBuild(raw,html(version));
const owned=version=>{const source=stamped(version).source;return['CACHE_NAME','RUNTIME_CACHE'].map(name=>source.match(new RegExp(`const ${name} = '([^']+)'`))[1]);};
let stage='a', holdInstall=false, releaseInstall, installRequested;
let requestedInstall;
const installGate=()=>{requestedInstall=new Promise(resolve=>{installRequested=resolve;});return new Promise(resolve=>{releaseInstall=resolve;});};
let heldInstall;
const server=http.createServer((req,res)=>{
 res.setHeader('cache-control','no-store');
 if(req.url==='/sw.js'){res.setHeader('content-type','text/javascript');res.end(stamped(stage).source);}
 else if(req.url==='/crewcheck-gate-receiver-offline.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync('client/public/crewcheck-gate-receiver-offline.js','utf8'));}
 else if(req.url==='/crewcheck-push-offline.js'){res.setHeader('content-type','text/javascript');res.end(push);}
 else if(req.url==='/assets/app-c.js'&&holdInstall){installRequested();heldInstall.then(()=>{res.setHeader('content-type','text/javascript');res.end(js);});}
 else if(req.url?.startsWith('/assets/')){res.setHeader('content-type','text/javascript');res.end(js+`;window.fixtureVersion=${JSON.stringify(req.url.match(/app-(\w+)\.js/)?.[1])};`);}
 else if(req.url==='/manifest.json'){res.setHeader('content-type','application/json');res.end('{"name":"synthetic","display":"standalone"}');}
 else if(req.url?.startsWith('/icons/')){res.setHeader('content-type','image/png');res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3WQAAAAASUVORK5CYII=','base64'));}
 else{res.setHeader('content-type','text/html');res.end(html(stage));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser,checks=0;const check=(value,label)=>{checks++;assert(value,label);};
try{
 browser=await chromium.launch({args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 // Isolated real-worker pending lifecycle regression. Evaluate the actual
 // cleanup function with the sole fixture client treated as arriving; no
 // lifecycle property, cache API or worker implementation is mocked here.
 const pending=await browser.newContext({serviceWorkers:'allow'});
 const probe=await pending.newPage();stage='a';await probe.goto(origin);
 await probe.waitForFunction(()=>navigator.serviceWorker.controller);
 const activeA=pending.serviceWorkers()[0];
 const sweep=()=>activeA.evaluate(async()=>{const pages=await self.clients.matchAll({type:'window',includeUncontrolled:true});return cleanupRetiredBuildCaches(pages[0]?.id||'');});
 const info=()=>probe.evaluate(async()=>{const r=await navigator.serviceWorker.ready;return await new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=event=>resolve(event.data);r.waiting.postMessage({type:'CREWCHECK_UPDATE_INFO'},[channel.port2]);});});
 stage='b';await probe.evaluate(async()=>{window.probeRegistration=await navigator.serviceWorker.ready;await window.probeRegistration.update();});
 await probe.waitForFunction(()=>Boolean(window.probeRegistration.waiting));
 console.log('Pending lifecycle diagnostic',await probe.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return {active:r.active?.state,waiting:r.waiting?.state,installing:r.installing?.state,controlled:!!navigator.serviceWorker.controller};}));
 assert.equal((await info()).ready,true,'B initially ready');
 await sweep();
 const waitingSafe=(await info()).ready===true;
 console.log((waitingSafe?'PASS':'FAIL')+' real A active/B waiting ready survives sweep');
 holdInstall=true;heldInstall=installGate();stage='c';
 await probe.evaluate(async()=>{window.probeRegistration=await navigator.serviceWorker.ready;await window.probeRegistration.update();});
 await requestedInstall;
 await probe.waitForFunction(()=>Boolean(window.probeRegistration.installing));
 const cBefore=await probe.evaluate(()=>caches.keys());
 await sweep();
 const cAfter=await probe.evaluate(()=>caches.keys());
 const installingSafe=owned('c').filter(name=>cBefore.includes(name)).every(name=>cAfter.includes(name))&&cBefore.includes(owned('c')[0]);
 console.log((installingSafe?'PASS':'FAIL')+' real A active/C installing partial cache survives sweep');
 holdInstall=false;releaseInstall();
 await probe.waitForFunction(()=>!window.probeRegistration.installing&&Boolean(window.probeRegistration.waiting));
 const cReady=(await info()).ready===true;
 await pending.close();stage='a';
 check(waitingSafe,'A must preserve ready B waiting');
 check(installingSafe,'A must preserve partially downloaded C installing');
 check(cReady,'C completes ready after concurrent cleanup');
 const context=await browser.newContext({serviceWorkers:'allow'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await context.addInitScript(()=>{Notification.requestPermission=()=>{throw Error('Real permission forbidden');};});
 const a=await context.newPage();await a.goto(origin);await a.waitForFunction(()=>navigator.serviceWorker.controller);await a.reload();await a.waitForFunction(()=>window.fixtureVersion==='a');await a.locator('#draft').fill('unsaved A');
 // Synthetic non-build caches must survive even after the final old tab closes.
 await a.evaluate(async()=>{for(const name of ['crewcheck-pwa-shared-pdf-v1','workbox-unrelated']){const cache=await caches.open(name);await cache.put('/synthetic-preserved',new Response('preserve'));}});
 const cacheNames=page=>page.evaluate(()=>caches.keys());
 const activate=async(page,version)=>{stage=version;await page.evaluate(async()=>{await(await navigator.serviceWorker.ready).update();});const notice=page.getByRole('complementary',{name:'Atualização do CrewCheck'});await notice.getByRole('button',{name:'Atualizar agora'}).waitFor();check(await page.evaluate(async()=>Boolean((await navigator.serviceWorker.ready).waiting)),'update waits for explicit consent');await notice.getByRole('button',{name:'Atualizar agora'}).click();await notice.getByRole('link',{name:'Abrir versão nova'}).waitFor();};
 await activate(a,'b');
 const b=await context.newPage();await b.goto(origin);await b.waitForFunction(()=>window.fixtureVersion==='b');await b.locator('#draft').fill('unsaved B');
 let names=await cacheNames(b);check(owned('a').every(name=>names.includes(name)),'A shell/runtime retained with old A document open');
 await activate(b,'c');
 const c=await context.newPage();await c.goto(origin);await c.waitForFunction(()=>window.fixtureVersion==='c');
 names=await cacheNames(c);check(['a','b','c'].every(version=>owned(version).every(name=>names.includes(name))),'three consented builds retain assets while old documents are open');
 check(await a.locator('#draft').inputValue()==='unsaved A','A form never reloaded');check(await b.locator('#draft').inputValue()==='unsaved B','B form never reloaded');
 await context.setOffline(true);
 for(const[page,version]of [[a,'a'],[b,'b']]){const text=await page.evaluate(async value=>(await fetch('/assets/app-'+value+'.js')).text(),version);check(text.includes('fixtureVersion="'+version+'"'),'old '+version+' chunk remains readable offline');}
 await context.setOffline(false);
 await a.close();await b.close();
 const stillOpen=await context.newPage();await stillOpen.goto(origin);await stillOpen.waitForFunction(()=>window.fixtureVersion==='c');
 names=await cacheNames(stillOpen);check(owned('a').every(name=>names.includes(name)),'existing latest window conservatively prevents cleanup');
 await c.close();await stillOpen.close();check(context.pages().length===0,'all origin windows closed');
 const reopened=await context.newPage();await reopened.goto(origin);await reopened.waitForFunction(()=>window.fixtureVersion==='c');
 names=await cacheNames(reopened);console.log('Caches after close/reopen: '+JSON.stringify(names));
 check(['a','b'].every(version=>owned(version).every(name=>!names.includes(name))),'closed build shell/runtime caches are retired on the next fresh navigation');
 check(owned('c').every(name=>names.includes(name)),'current build caches preserved');
 for(const name of ['crewcheck-pwa-shared-pdf-v1','workbox-unrelated'])check(await reopened.evaluate(async value=>Boolean(await(await caches.open(value)).match('/synthetic-preserved')),name),'unrelated/shared PDF cache preserved');
 await context.setOffline(true);await reopened.reload();await reopened.waitForFunction(()=>window.fixtureVersion==='c');check(await reopened.locator('#draft').count()===1,'current build remains available offline after retirement');
 console.log(`PASS ${checks} real-worker cache lifecycle assertions: consented A/B/C, old tabs/forms/offline chunks, close/reopen retirement, current/shared/unrelated preservation; synthetic localhost only.`);
 await context.close();
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
