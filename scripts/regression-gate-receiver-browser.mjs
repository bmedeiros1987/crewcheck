import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(process.env.GATE_PLAYWRIGHT_PACKAGE || import.meta.url);
const { chromium } = require('playwright');
const sources = Object.fromEntries(['crewcheck-push-offline.js', 'crewcheck-gate-receiver-offline.js'].map(name => ['/' + name, fs.readFileSync('client/public/' + name, 'utf8')]));
const fixture = `importScripts('/crewcheck-push-offline.js','/crewcheck-gate-receiver-offline.js');
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
let store,receiver,release,entered=false;const notifications=[];
const registration={getNotifications:async()=>notifications,showNotification:async(title,options)=>{entered=true;await new Promise(resolve=>{release=resolve;});notifications.push({...options,closed:false,close(){this.closed=true;}});}};
function recreate(){store=CrewCheckGateReceiverOffline.withGateStore(CrewCheckPushOffline.indexedStore(indexedDB),indexedDB);receiver=CrewCheckGateReceiverOffline.create({enabled:true,store,registration,locks:navigator.locks,processPush:CrewCheckPushOffline.processPush,clock:()=>Date.parse('2032-10-14T12:00:00Z')});}recreate();
// Fixture-only admission, never part of the shipping receiver/module. No auth claim.
async function seed(value){const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('crewcheck-notification-installation-v1',1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,'binding');tx.objectStore('state').put({...value,active:true},'gate-binding:v1');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}
self.addEventListener('message',event=>event.waitUntil((async()=>{try{const v=event.data;let result;if(v.action==='seed'){await seed(v.binding);result={seeded:true};}else if(v.action==='receive')result=await receiver.receive(v.envelope);else if(v.action==='revoke'){const other=CrewCheckGateReceiverOffline.create({enabled:true,store,registration,locks:navigator.locks,processPush:CrewCheckPushOffline.processPush});result=await other.revoke(v.request);}else if(v.action==='release'){release?.();result={released:true};}else if(v.action==='recreate'){recreate();result={recreated:true};}else result={entered,notifications:notifications.map(n=>({closed:n.closed})),binding:await store.gateBinding()};event.ports[0].postMessage(result);}catch(error){event.ports[0].postMessage({error:String(error)});}})()));`;
const server = http.createServer((req, res) => {
  res.setHeader('content-type', req.url.includes('.js') ? 'text/javascript' : 'text/html');
  res.end(req.url.startsWith('/fixture-sw.js') ? fixture : sources[req.url] || '<title>Synthetic gate fence</title>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const context = await browser.newContext(); await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  let page = await context.newPage();
  const setup = async () => {
    await page.goto(origin); await page.evaluate(async () => {
      await navigator.serviceWorker.register('/fixture-sw.js'); await navigator.serviceWorker.ready;
      window.rpc = async payload => { const registration = await navigator.serviceWorker.ready; return new Promise(resolve => { const channel = new MessageChannel(); channel.port1.onmessage = event => resolve(event.data); registration.active.postMessage(payload, [channel.port2]); }); };
    });
  };
  const rpc = value => page.evaluate(value => window.rpc(value), value);
  await setup();
  const binding = { ownerId: 'owner_fixture_A', installationId: 'installation_fixture_01', consentRevision: 2, topicRevision: 3, authorityEpoch: 'epoch_fixture_01' };
  const envelope = { schema: 'crewcheck-notice-v1', ...binding, eventKey: 'gate-change-v1:' + 'a'.repeat(64), expiresAt: '2032-10-14T12:01:00Z', route: '/app' };
  const request = { ...binding, requestId: 'revocation_fixture_01' };
  assert.equal((await rpc({ action: 'seed', binding })).seeded, true);
  for (const delta of [{authorityEpoch:undefined},{authorityEpoch:'epoch_fixture_02'},{authorityEpoch:'Epoch_fixture_01'},{ownerId:'owner_fixture_B'},{installationId:'installation_fixture_02'},{consentRevision:3},{topicRevision:4}]) {
    const r=await rpc({action:'receive',envelope:{...envelope,...delta}}); assert(['blocked','revoked'].includes(r.status));
    assert.equal((await rpc({action:'status'})).entered,false);
  }
  await page.evaluate(envelope => { window.pendingReceive = window.rpc({ action: 'receive', envelope }); }, envelope);
  await page.waitForFunction(async () => (await window.rpc({ action: 'status' })).entered);
  await page.evaluate(request => { window.acknowledged = false; window.pendingRevoke = window.rpc({ action: 'revoke', request }).then(value => { window.acknowledged = true; return value; }); }, request);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => window.acknowledged), false, 'actual origin Web Lock prevents ACK overtaking pending display');
  await rpc({ action: 'release' });
  const result = await page.evaluate(() => Promise.all([window.pendingReceive, window.pendingRevoke]));
  assert.equal(result[0].status, 'display_api_resolved'); assert.equal(result[1].ack.requestId, request.requestId);
  const after = await rpc({ action: 'status' }); assert.equal(after.binding.active, false); assert(after.notifications.every(n => n.closed));
  assert.equal((await rpc({ action: 'receive', envelope: { ...envelope, eventKey: 'gate-change-v1:' + 'b'.repeat(64) } })).status, 'revoked');
  await page.close(); page = await context.newPage(); await setup(); await rpc({ action: 'recreate' });
  assert.equal((await rpc({ action: 'status' })).binding.active, false, 'actual IndexedDB tombstone persists across page/receiver recreation');
  assert.equal((await rpc({ action: 'receive', envelope: { ...envelope, eventKey: 'gate-change-v1:' + 'c'.repeat(64) } })).status, 'revoked');
  assert.equal((await rpc({ action: 'revoke', request: { ...request, topicRevision: 4 } })).ack, null);
  const rotated={...binding,authorityEpoch:'epoch_fixture_02'};
  await rpc({action:'seed',binding:rotated}); await rpc({action:'recreate'});
  assert.equal((await rpc({action:'receive',envelope})).status,'revoked');
  assert.equal((await rpc({action:'revoke',request})).ack,null);
  assert.equal((await rpc({action:'status'})).binding.active,true,'old epoch cannot tombstone replacement');
  const rotatedAck=await rpc({action:'revoke',request:{...request,authorityEpoch:rotated.authorityEpoch}});
  assert.equal(rotatedAck.ack.authorityEpoch,rotated.authorityEpoch);
  await page.reload(); await setup(); await rpc({action:'recreate'});
  assert.equal((await rpc({action:'receive',envelope:{...envelope,authorityEpoch:rotated.authorityEpoch}})).status,'revoked');
  console.log('PASS actual worker + IndexedDB + origin Web Locks: pending display/revoke serialization, correlated ACK after fence/close, late and recreated receiver blocked; mock display only, no permission or real notification.');
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
