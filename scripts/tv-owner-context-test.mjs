import assert from 'node:assert/strict';
import { createDeviceService } from '../server/tv/devices.mjs';

let now=Date.parse('2026-09-23T09:50:00Z');
let state={pairings:{},devices:{}};
const store={async transaction(fn){const draft=structuredClone(state);const value=await fn(draft);state=draft;return value;}};
const devices=createDeviceService({store,now:()=>now,pairingOrigin:'https://pilot.example.test',accountAllowed:id=>id==='owner@example.test'});

const pair=await devices.begin('lg-webos',true);
await devices.approve('owner@example.test',pair.userCode,'private');
now+=5000;
const credential=await devices.poll(pair.deviceCode);

let prefs=(await devices.preferencesFor('owner@example.test',credential.deviceId)).preferences;
assert.equal(prefs.audience,'owner');
assert.equal(prefs.share.finance,false);
assert.equal(prefs.share.traffic,false);

await assert.rejects(
  devices.updateContext('owner@example.test',credential.deviceId,{journeyDetails:{j1:{finance:{estimated:500}}}}),
  e=>e.status===403,
);

await devices.updatePreferences('owner@example.test',credential.deviceId,{
  audience:'owner',
  share:{...prefs.share,finance:true,traffic:true},
});
await devices.updateContext('owner@example.test',credential.deviceId,{
  ttlMs:600000,
  routeOrigin:{latitude:-15.8,longitude:-47.9,label:'Local privado'},
  journeyDetails:{
    j1:{finance:{currency:'brl',estimated:500.23,perDiem:109.95,production:390.28,note:'Estimativa calculada no celular'}},
    j2:{finance:{currency:'XXX',estimated:'bad',production:42}},
  },
});
let auth=await devices.authorize(credential.token);
assert.equal(auth.context.routeOrigin.latitude,-15.8);
assert.equal(auth.context.journeyDetails.j1.finance.currency,'BRL');
assert.equal(auth.context.journeyDetails.j1.finance.estimated,500.23);
assert.equal(auth.context.journeyDetails.j2.finance.estimated,null);
assert.equal(auth.context.journeyDetails.j2.finance.production,42);
assert.ok(auth.context.expiresAt<=now+600000);

await devices.updatePreferences('owner@example.test',credential.deviceId,{
  audience:'visitor',
  share:{operational:true,weather:true,hotel:true,crew:true,finance:true,mobility:true,traffic:true},
});
prefs=(await devices.preferencesFor('owner@example.test',credential.deviceId)).preferences;
assert.equal(prefs.audience,'visitor');
auth=await devices.authorize(credential.token);
assert.equal(auth.preferences.audience,'visitor');
// Existing short-lived context is ignored by projection whenever audience is not owner;
// a new sensitive context upload must also be rejected.
await assert.rejects(
  devices.updateContext('owner@example.test',credential.deviceId,{routeOrigin:{latitude:-15.8,longitude:-47.9}}),
  e=>e.status===403,
);

now+=600001;
auth=await devices.authorize(credential.token);
assert.equal(auth.context,null,'expired context must be dropped');

console.log('PASS: TV owner context is permission-gated, bounded, temporary, and visitor mode cannot upload sensitive context.');
