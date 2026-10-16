import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHeldInfobipWhatsAppRuntime, INFOBIP_WHATSAPP_CALLBACK_PATH} from '../server/infobip-whatsapp-runtime.mjs';
import {INFOBIP_WHATSAPP_RELEASE_ENABLED} from '../server/infobip-whatsapp-candidate.mjs';

globalThis.fetch = () => assert.fail('OFF runtime cannot call real transport');
const forbidden = new Proxy({}, {get() {assert.fail('OFF runtime cannot access dependencies/credentials');}});
const runtime = createHeldInfobipWhatsAppRuntime(forbidden);
assert.equal(INFOBIP_WHATSAPP_RELEASE_ENABLED, false);assert(Object.isFrozen(runtime));
assert.deepEqual(runtime.health(), {enabled: false, ready: false, code: 'INFOBIP_WHATSAPP_DISABLED'});
assert.deepEqual(await runtime.dispatch(forbidden), {status: 'disabled'});
assert.deepEqual(await runtime.expire(forbidden), {status: 'disabled'});
for (const method of ['GET','POST','OPTIONS','PUT','DELETE']) {
  const req = new Proxy({method}, {get(_target, property) {assert.fail(`OFF cannot read request ${String(property)}`);}});
  const response = {status: 0, headers: null, body: '', writeHead(status, headers) {this.status=status;this.headers=headers;}, end(body) {this.body=body;}};
  assert.equal(await runtime.handleRoute(req, response, new URL(INFOBIP_WHATSAPP_CALLBACK_PATH, 'https://example.invalid')), true);
  assert.equal(response.status,503);assert.equal(response.headers['cache-control'],'no-store');
  assert.deepEqual(JSON.parse(response.body),{ok:false,code:'INFOBIP_WHATSAPP_DISABLED'});
}
for (const path of ['/api/whatsapp/webhook','/api/whatsapp/link/start','/api/telegram/webhook','/api/infobip/whatsapp/webhook/','/']) {
  assert.equal(await runtime.handleRoute(forbidden, forbidden, new URL(path,'https://example.invalid')),false,'other routes remain owned upstream');
}

// Canonical preparation is performed by the broad suite before this check.
const server=fs.readFileSync('server.mjs','utf8');
const imported="import { createHeldInfobipWhatsAppRuntime } from './server/infobip-whatsapp-runtime.mjs';";
const instance='const infobipWhatsAppRuntime = createHeldInfobipWhatsAppRuntime();';
const route='  if (await infobipWhatsAppRuntime.handleRoute(req, res, url)) return;';
const meta='  if (await handleWhatsAppRoute(req, res, url)) return;';
for(const exact of [imported,instance,route])assert.equal(server.split(exact).length,2,'single canonical OFF composition');
assert(server.indexOf(route)<server.indexOf(meta));
const {composeHeldInfobipRoute}=await import('./p1-infobip-whatsapp-off/apply.mjs');
assert.equal(composeHeldInfobipRoute(server),server,'composition idempotent');
assert.throws(()=>composeHeldInfobipRoute(server.replace(meta,'')),/ANCHOR_MISSING/);
assert.throws(()=>composeHeldInfobipRoute(server+'\n'+route),/DUPLICATE/);
const source=fs.readFileSync('server/infobip-whatsapp-runtime.mjs','utf8');
assert(!/process\.env|dbPool\(|setInterval\(|fetch\(/.test(source));
assert(!server.includes('composeInfobipWhatsAppForOfflineTests'),'test composition never registered as server API');
console.log('PASS Infobip runtime OFF: no dependency/request-body access, no I/O, unchanged upstream routes, canonical idempotent wiring, duplicate/missing-anchor counterproofs');
