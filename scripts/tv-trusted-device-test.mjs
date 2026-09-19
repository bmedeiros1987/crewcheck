import assert from 'node:assert/strict';
import { createDeviceService } from '../server/tv/devices.mjs';
import { createTvHandler } from '../server/tv/routes.mjs';

let now=Date.parse('2026-09-18T21:40:00-03:00');
let state={pairings:{},devices:{}};
const store={async transaction(fn){const copy=structuredClone(state);const value=await fn(copy);state=copy;return value;}};
const service=createDeviceService({store,now:()=>now,pairingOrigin:'https://pilot.example.test'});

const pair=await service.begin('lg-webos',true);
assert.equal(pair.trusted,true);
await service.approve('account-a',pair.userCode,'private');
now+=5000;
const credential=await service.poll(pair.deviceCode);
assert.equal(credential.trusted,true);
assert.equal(credential.privacy,'private');
assert.equal(JSON.stringify(state).includes(credential.token),false,'raw device token must never be stored server-side');
const originalExpiry=Date.parse(credential.expiresAt);
assert.ok(originalExpiry-now>=364*86400000);

now+=300*86400000;
assert.equal((await service.authorize(credential.token)).trusted,true);
const heartbeat=await service.heartbeat(credential.token);
const renewedExpiry=Date.parse(heartbeat.expiresAt);
assert.ok(renewedExpiry>originalExpiry,'trusted lease should slide while TV remains active');

now=originalExpiry+1000;
assert.equal((await service.authorize(credential.token)).userId,'account-a','renewed trusted TV must survive original lease boundary');
const listed=await service.list('account-a');
assert.equal(listed.length,1);
assert.equal(listed[0].trusted,true);
assert.equal(listed[0].expiresAt,heartbeat.expiresAt);

await service.revoke('account-a',credential.deviceId);
await assert.rejects(service.authorize(credential.token),e=>e.status===401);

now=Date.parse('2026-09-18T21:40:00-03:00');
state={pairings:{},devices:{}};
const short=await service.begin('lg-webos',false);
await service.approve('account-a',short.userCode,'private');
now+=5000;
const shortCredential=await service.poll(short.deviceCode);
assert.equal(shortCredential.trusted,false);
now+=86400001;
await assert.rejects(service.authorize(shortCredential.token),e=>e.status===401);

state={pairings:{},devices:{}};
now=Date.parse('2026-09-18T21:40:00-03:00');
const handler=createTvHandler({
  enabled:true,
  devices:service,
  authenticateAccount:async()=>null,
  loadProjection:async()=>null,
  news:async()=>({items:[]}),
  rateLimit:async()=>true,
});
const routePair=await handler({method:'POST',path:'/api/tv/pair',body:{platform:'lg-webos',trusted:true},ip:'test'});
assert.equal(routePair.status,200);
assert.equal(routePair.body.trusted,true);

console.log('PASS: trusted TV is persistent, sliding, read-only, revocable, token-hashed and opt-in.');
