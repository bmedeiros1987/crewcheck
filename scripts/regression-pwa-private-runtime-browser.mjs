import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import {stampServiceWorkerBuild} from './ci/stamp-service-worker-build.mjs';
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const raw=fs.readFileSync(process.env.PWA_WORKER_SOURCE||'client/public/sw.js','utf8');
const html='<html><body>synthetic offline privacy fixture<script src="/assets/app-a.js"></script></body></html>';
const binaryAssets=['/assets/brand/fixture.png','/assets/sounds/a320-interphone-cc0.mp3','/assets/opening/crewcheck-opening.mp4'];
const serverSource=fs.readFileSync('server.mjs','utf8');
const productionMime=serverSource.slice(serverSource.indexOf('function serveStatic(')).match(/const type = (.+);/)[1];
const staticType=url=>vm.runInNewContext(productionMime,{ext:path.extname(url)});
const stamped=stampServiceWorkerBuild(raw,html,['/assets/app-a.js',...binaryAssets]);
const imports=new Map(['crewcheck-gate-receiver-offline.js','crewcheck-push-offline.js'].map(name=>['/'+name,fs.readFileSync('client/public/'+name)]));
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');res.setHeader('cache-control','no-store');
 if(u.pathname==='/sw.js'){res.setHeader('content-type','text/javascript');res.end(stamped.source)}
 else if(imports.has(u.pathname)){res.setHeader('content-type','text/javascript');res.end(imports.get(u.pathname))}
 else if(binaryAssets.includes(u.pathname)||u.pathname==='/assets/unlisted.mp3'){res.setHeader('content-type',staticType(u.pathname));res.setHeader('cache-control','public, max-age=3600');res.end('synthetic-public-binary:'+u.pathname)}
 else if(u.pathname.startsWith('/assets/')){res.setHeader('content-type','text/javascript');res.setHeader('cache-control',u.pathname.includes('private')?'private, no-store':'public, max-age=3600');res.end(u.pathname.includes('private')?'PRIVATE_RUNTIME_CANARY':'window.syntheticPublic=true;')}
 else if(u.pathname==='/synthetic-private-export.json'){res.setHeader('content-type','application/json');res.end('{"private":"PRIVATE_RUNTIME_CANARY"}')}
 else if(u.pathname.startsWith('/icons/')){res.setHeader('content-type',staticType(u.pathname));res.end('synthetic icon')}
 else if(u.pathname==='/manifest.json'){res.setHeader('content-type','application/json');res.end('{}')}
 else{res.setHeader('content-type','text/html');res.end(html)}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser,closed=false;const results=[];const check=(v,label)=>{assert(v,label);results.push(label)};
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
 const context=await browser.newContext({serviceWorkers:'allow'});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin);
 await p.evaluate(async()=>{localStorage.setItem('syntheticOwner','A');for(const name of ['crewcheck-v14.4.10-runtime-brand936-abcdef','crewcheck-v14.4.10-shell-brand936-abcdef','unrelated-cache']){const c=await caches.open(name);await c.put(new Request('/synthetic-private-export.json',{headers:{Authorization:'Bearer SYNTHETIC_ONLY'}}),new Response('PRIVATE_RUNTIME_CANARY',{headers:{'cache-control':'no-store','content-type':'application/json'}}));await c.put(new Request('/assets/private-legacy.js',{headers:{Authorization:'Bearer SYNTHETIC_ONLY'}}),new Response('PRIVATE_RUNTIME_CANARY',{headers:{'cache-control':'private','content-type':'text/javascript'}}));}
 const c=await caches.open('crewcheck-v14.4.10-shell-brand936-abcdef');await c.put('/assets/old.js',new Response('old public chunk',{headers:{'content-type':'text/javascript','cache-control':'no-store'}}));await c.put('/__crewcheck_update_ready__',new Response(JSON.stringify({urls:['/assets/old.js']})));
 await(await caches.open('crewcheck-ocr-verified-v1')).put('/preserve',new Response('verified synthetic OCR'));await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
 await p.waitForFunction(()=>navigator.serviceWorker.controller);await p.reload();
 await p.evaluate(async()=>{await fetch('/synthetic-private-export.json',{headers:{Authorization:'Bearer SYNTHETIC_ONLY'}});await fetch('/assets/private-new.js');await fetch('/assets/public-new.js');await fetch('/assets/unlisted.mp3');});
 const admission=await p.evaluate(async()=>{const out=[];for(const name of await caches.keys()){if(!/-runtime-/.test(name))continue;const c=await caches.open(name);for(const r of await c.keys())out.push({url:r.url,auth:r.headers.has('authorization'),private:(await(await c.match(r)).text()).includes('PRIVATE_RUNTIME_CANARY')});}return out});
 check(admission.every(r=>!r.auth&&!r.private),'no authenticated/no-store admission; legacy runtime entries purged');
 const pdf=await p.evaluate(async()=>{const f=new FormData();f.set('pdf',new File(['%PDF-1.4\nSynthetic only'],'fixture.pdf',{type:'application/pdf'}));const r=await fetch('/share-target',{method:'POST',body:f});const id=new URL(r.url).searchParams.get('crewcheckSharedPdf');if(!id)return null;const url='/__crewcheck_shared_pdf/'+encodeURIComponent(id);const first=await fetch(url),body=await first.text(),second=await fetch(url);return {body,status:second.status}});
 check(pdf?.body.startsWith('%PDF-')&&pdf.status===404,'shared PDF receive/read/single-use cleanup preserved');
 await p.evaluate(()=>localStorage.setItem('syntheticOwner','B'));await context.setOffline(true);await new Promise(r=>{server.close(r);server.closeAllConnections()});closed=true;
 for(const path of ['/synthetic-private-export.json','/assets/private-legacy.js','/assets/private-new.js']){const leaked=await p.evaluate(async path=>{try{return (await(await fetch(path)).text()).includes('PRIVATE_RUNTIME_CANARY')}catch{return false}},path);check(!leaked,'B cannot replay '+path)}
 check(await p.evaluate(async()=>await(await fetch('/assets/old.js')).text())==='old public chunk','old manifest-listed public chunk survives');
 check((await p.evaluate(async()=>await(await fetch('/assets/public-new.js')).text())).includes('syntheticPublic'),'public runtime asset survives');
 for(const asset of binaryAssets)check(await p.evaluate(async asset=>await(await fetch(asset)).text(),asset)==='synthetic-public-binary:'+asset,'manifest-listed production MIME binary survives '+asset);
 check(await p.evaluate(async()=>await(await fetch('/icons/crewcheck-icon-v2.png')).text())==='synthetic icon','production MIME shell icon survives');
 check(await p.evaluate(async()=>{try{await fetch('/assets/unlisted.mp3');return false}catch{return true}}),'unlisted binary media does not enter runtime');
 check(await p.evaluate(async()=>await(await(await caches.open('crewcheck-ocr-verified-v1')).match('/preserve')).text())==='verified synthetic OCR','OCR cache untouched');
 await p.reload();check((await p.locator('body').innerText()).includes('synthetic offline privacy fixture'),'offline shell reload preserved');check(errors.length===0,'no browser page errors');
 console.log(JSON.stringify({passed:true,checks:results,realWorker:true,externalRequests:0}));
}finally{await browser?.close();if(!closed)await new Promise(r=>{server.close(r);server.closeAllConnections()})}
