import assert from 'node:assert/strict';
import { createDeviceService } from '../server/tv/devices.mjs';
import { createTvHandler } from '../server/tv/routes.mjs';

let now=Date.parse('2026-09-21T09:30:00Z');
let state={pairings:{},devices:{}};
const store={async transaction(fn){const copy=structuredClone(state);const value=await fn(copy);state=copy;return value;}};
const service=createDeviceService({store,now:()=>now,pairingOrigin:'https://pilot.example.test'});
const pair=await service.begin('lg-webos');
await service.approve('account-a',pair.userCode,'private');
now+=5000;
const credential=await service.poll(pair.deviceCode);
const initial=await service.authorize(credential.token);
assert.equal(initial.preferences.audience,'owner');
assert.equal(initial.preferences.share.crew,false);
assert.equal(initial.preferences.share.finance,false);
assert.equal(initial.preferences.share.hotel,false);
assert.equal(initial.preferences.share.mobility,false);
assert.equal(initial.preferences.share.traffic,false);

await service.updatePreferences('account-a',credential.deviceId,{
  audience:'owner',
  share:{operational:true,weather:true,hotel:true,crew:true,finance:true,mobility:true,traffic:true},
});
let owner=await service.authorize(credential.token);
assert.equal(owner.preferences.share.crew,true);
assert.equal(owner.preferences.share.finance,true);
assert.equal(owner.preferences.share.mobility,true);
assert.equal(owner.preferences.share.traffic,true);

await service.updatePreferences('account-a',credential.deviceId,{
  audience:'visitor',
  share:{operational:true,weather:true,hotel:true,crew:true,finance:true,mobility:true,traffic:true},
});
const visitor=await service.authorize(credential.token);
assert.equal(visitor.preferences.audience,'visitor');
for(const key of ['hotel','crew','finance','mobility','traffic']) assert.equal(visitor.preferences.share[key],false,key+' must fail closed outside owner');

await assert.rejects(
  service.updateContext('account-a',credential.deviceId,{routeOrigin:{latitude:-15.8,longitude:-47.9}}),
  error=>error.status===403&&error.message==='traffic_context_not_authorized'
);

await service.updatePreferences('account-a',credential.deviceId,{
  audience:'owner',
  share:{operational:true,weather:true,traffic:true},
});
const context=await service.updateContext('account-a',credential.deviceId,{
  routeOrigin:{latitude:-15.8,longitude:-47.9,label:'Local temporário'},ttlMs:5*60*1000,
});
assert.ok(Date.parse(context.expiresAt)>now);
owner=await service.authorize(credential.token);
assert.equal(owner.context.routeOrigin.label,'Local temporário');

const handler=createTvHandler({
  enabled:true,
  devices:service,
  authenticateAccount:async()=> 'account-a',
  loadProjection:async auth=>({
    schemaVersion:1,deviceId:auth.deviceId,privacy:auth.preferences.audience==='owner'?auth.privacy:'family'
  }),
  news:async()=>({items:[]}),
  rateLimit:async()=>true,
});
const saved=await handler({method:'POST',path:'/api/tv/preferences',token:'account-token',body:{
  deviceId:credential.deviceId,
  preferences:{audience:'family',share:{crew:true,finance:true,mobility:true,traffic:true}}
},ip:'test'});
assert.equal(saved.status,200);
assert.equal(saved.body.preferences.audience,'family');
assert.equal(saved.body.preferences.share.crew,false);
assert.equal(saved.body.preferences.share.finance,false);

console.log('PASS: TV sharing is server-owned, sensitive categories fail closed, and traffic context is owner-only and ephemeral.');
