import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url), { chromium } = require('playwright');
const source = fs.readFileSync('client/public/crewcheck-push-offline.js','utf8');
const fixture = `importScripts('/crewcheck-push-offline.js');const store=CrewCheckPushOffline.indexedStore(indexedDB);let shown=0;self.addEventListener('message',event=>event.waitUntil((async()=>{const v=event.data;if(v.action==='bind'){await store.setBinding(v.binding);event.ports[0].postMessage({bound:true});return;}const result=await CrewCheckPushOffline.processPush({enabled:true,envelope:v.envelope,store,now:v.now,registration:{showNotification:async()=>{shown++;}}});event.ports[0].postMessage({result,shown});})()));`;
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/html');res.end(req.url==='/fixture-sw.js'?fixture:req.url==='/crewcheck-push-offline.js'?source:'<meta name="viewport" content="width=device-width"><title>Local isolated worker</title>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 let page=await context.newPage();await page.goto(origin);await page.evaluate(async()=>{await navigator.serviceWorker.register('/fixture-sw.js');await navigator.serviceWorker.ready;});
 const now=Date.parse('2026-11-11T09:00:00Z'),envelope={schema:'crewcheck-notice-v1',ownerId:'owner_fixture_1',installationId:'device_fixture_1',consentRevision:1,eventKey:'event_fixture_1',expiresAt:new Date(now+60000).toISOString(),route:'/app'};
 const rpc=async payload=>page.evaluate(async payload=>{const registration=await navigator.serviceWorker.ready;return new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=event=>resolve(event.data);registration.active.postMessage(payload,[channel.port2]);});},payload);
 await rpc({action:'bind',binding:envelope});
 const results=await Promise.all([rpc({envelope,now}),rpc({envelope,now})]);assert.equal(Math.max(...results.map(value=>value.shown)),1);assert(results.every(value=>value.result.received===null));
 await page.close();page=await context.newPage();await page.goto(origin);assert.equal((await rpc({envelope,now})).result.status,'duplicate_or_revoked','persisted claim survives page closure');
 assert.equal((await rpc({envelope:{...envelope,eventKey:'other_event_1'},now:now+60000})).result.status,'blocked','expired payload blocked');
 await rpc({action:'bind',binding:null});assert.equal((await rpc({envelope:{...envelope,eventKey:'other_event_1'},now})).result.status,'blocked');
 await rpc({action:'bind',binding:{...envelope,ownerId:'owner_fixture_2'}});assert.equal((await rpc({envelope:{...envelope,eventKey:'other_event_1'},now})).result.status,'blocked');
 await context.close();console.log('PASS actual isolated service worker/IndexedDB: concurrent persistent dedup, page closure, expiry, local revocation and account switch; mocked display only, zero permission requests or real notifications.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
