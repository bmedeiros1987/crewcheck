import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDeviceService } from '../server/tv/devices.mjs';
import { buildUberPhoneHandoff, tvAirportMobilityPoint } from '../server/tv/mobility.mjs';

let now=Date.parse('2026-09-19T21:30:00-03:00');
let state={pairings:{},devices:{}};
const store={async transaction(fn){const draft=structuredClone(state);const value=await fn(draft);state=draft;return value;}};
const devices=createDeviceService({store,now:()=>now,pairingOrigin:'https://pilot.example.test'});

const pair=await devices.begin('lg-webos',true);
await devices.approve('owner@example.test',pair.userCode,'private');
now+=5000;
const credential=await devices.poll(pair.deviceCode);
let auth=await devices.authorize(credential.token);
assert.equal(auth.preferences.audience,'owner');
assert.equal(auth.preferences.share.operational,true);
assert.equal(auth.preferences.share.weather,true);
for(const field of ['crew','finance','hotel','mobility']) assert.equal(auth.preferences.share[field],false,field+' must default off');

await assert.rejects(
  devices.updatePreferences('other@example.test',credential.deviceId,{audience:'visitor',share:{crew:true}}),
  e=>e.status===404,
);
await devices.updatePreferences('owner@example.test',credential.deviceId,{
  audience:'visitor',
  share:{operational:true,weather:true,hotel:true,crew:true,finance:true,mobility:true},
});
auth=await devices.authorize(credential.token);
assert.equal(auth.preferences.audience,'visitor');
// Device preference can remember requested toggles, but projection must enforce
// owner-only sensitive values separately in server/tv/http.mjs.
assert.equal(auth.preferences.share.crew,true);

const listed=await devices.list('owner@example.test');
assert.equal(listed[0].preferences.audience,'visitor');

const uber=buildUberPhoneHandoff({clientId:'test-client',airport:'BSB',audience:'owner',allowed:true});
assert.ok(uber);
const uberUrl=new URL(uber.deepLink);
assert.equal(uberUrl.protocol,'https:');
assert.equal(uberUrl.hostname,'m.uber.com');
assert.equal(uberUrl.pathname,'/looking');
assert.equal(uberUrl.searchParams.get('pickup'),'my_location');
assert.equal(JSON.parse(uberUrl.searchParams.get('drop[0]')).addressLine2,'BSB');
assert.equal(buildUberPhoneHandoff({clientId:'test-client',airport:'BSB',audience:'visitor',allowed:true}),null);
assert.equal(buildUberPhoneHandoff({clientId:'test-client',airport:'XXX',audience:'owner',allowed:true}),null);
assert.equal(buildUberPhoneHandoff({clientId:'',airport:'BSB',audience:'owner',allowed:true}),null);
assert.equal(buildUberPhoneHandoff({clientId:'test-client',airport:'BSB',audience:'owner',allowed:false}),null);
assert.equal(tvAirportMobilityPoint('BSB')?.label,'Aeroporto de Brasília');

const http=await readFile('server/tv/http.mjs','utf8');
const routes=await readFile('server/tv/routes.mjs','utf8');
assert.match(http,/\/api\/tv\/preferences/);
assert.match(http,/const effectivePrivacy = audience === 'owner' \? auth\.privacy : 'family'/);
assert.match(http,/audience === 'owner' && preferences\.share\?\.crew === true/);
assert.match(http,/audience === 'owner' && preferences\.share\?\.finance === true/);
assert.match(http,/audience === 'owner' && preferences\.share\?\.hotel === true/);
assert.match(http,/audience === 'owner' && preferences\.share\?\.mobility === true/);
assert.match(http,/buildUberPhoneHandoff/);
assert.match(http,/snapshot\.journeyDetails = \{\}/);
assert.match(routes,/expectedPrivacy = auth\.preferences\?\.audience/);
assert.match(routes,/updatePreferences/);

console.log('PASS: TV extension consent is per-device, sensitive fields fail closed, visitor projection redacts, Uber is owner-only phone handoff.');
