import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDeviceService } from '../server/tv/devices.mjs';
import { buildUberPhoneHandoff, tvAirportMobilityPoint } from '../server/tv/mobility.mjs';
import { airlineVisualFor } from '../server/tv/airline-visual.mjs';

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
assert.equal(listed[0].contextActive,false);
await assert.rejects(
  devices.updateContext('owner@example.test',credential.deviceId,{routeOrigin:{latitude:-15.8,longitude:-47.9}}),
  e=>e.status===403,
);
await devices.updatePreferences('owner@example.test',credential.deviceId,{
  audience:'owner',
  share:{operational:true,weather:true,traffic:true,mobility:true},
});
const contextResult=await devices.updateContext('owner@example.test',credential.deviceId,{
  routeOrigin:{latitude:-15.81,longitude:-47.90,label:'Origem autorizada'},
  ttlMs:60*60*1000,
});
assert.ok(Date.parse(contextResult.expiresAt)-now<=10*60*1000,'route context TTL must cap at ten minutes');
auth=await devices.authorize(credential.token);
assert.equal(auth.context.routeOrigin.label,'Origem autorizada');
assert.equal(auth.preferences.share.traffic,true);
now+=10*60*1000+1;
auth=await devices.authorize(credential.token);
assert.equal(auth.context,null,'precise route origin must disappear after TTL');

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

const visual=airlineVisualFor('LATAM',JSON.stringify({
  LATAM:{imageUrl:'https://media.example.test/latam-hero.jpg',source:'owner-approved media kit',licensed:true,attribution:'LATAM media asset'},
  GOL:{imageUrl:'http://insecure.example/gol.jpg',source:'bad',licensed:true},
  AZUL:{imageUrl:'https://media.example.test/azul.jpg',source:'',licensed:true},
}));
assert.equal(visual?.licensed,true);
assert.equal(visual?.imageUrl,'https://media.example.test/latam-hero.jpg');
assert.equal(airlineVisualFor('GOL',JSON.stringify({GOL:{imageUrl:'http://insecure.example/gol.jpg',source:'bad',licensed:true}})),null);
assert.equal(airlineVisualFor('AZUL',JSON.stringify({AZUL:{imageUrl:'https://media.example.test/azul.jpg',source:'',licensed:true}})),null);

const mobile=await readFile('client/src/pages/TvPairPage.tsx','utf8');
assert.match(mobile,/Quem está vendo esta TV/);
assert.match(mobile,/Só eu — experiência completa autorizável/);
assert.match(mobile,/Visitante — linguagem simples/);
assert.match(mobile,/Tripulação/);
assert.match(mobile,/Financeiro/);
assert.match(mobile,/Uber no celular/);
assert.match(mobile,/Compartilhar origem para trânsito por 5 min/);
assert.match(mobile,/ttlMs:5\*60\*1000/);
assert.match(mobile,/A coordenada é temporária e não é exibida na TV/);
assert.match(mobile,/\/api\/tv\/preferences/);
assert.match(mobile,/\/api\/tv\/context/);

const http=await readFile('server/tv/http.mjs','utf8');
const routes=await readFile('server/tv/routes.mjs','utf8');
assert.match(http,/\/api\/tv\/preferences/);
assert.match(http,/const effectivePrivacy = audience === 'owner' \? auth\.privacy : 'family'/);
assert.match(http,/audience === 'owner' && preferences\.share\?\.crew === true/);
assert.match(http,/audience === 'owner' && preferences\.share\?\.finance === true/);
assert.match(http,/audience === 'owner' && preferences\.share\?\.hotel === true/);
assert.match(http,/audience === 'owner' && preferences\.share\?\.mobility === true/);
assert.match(http,/buildUberPhoneHandoff/);
assert.match(http,/tvGateContext/);
assert.match(http,/source:'crewcheck-radar'/);
assert.match(http,/tvTrafficContext/);
assert.match(http,/auth\.context\?\.routeOrigin/);
assert.match(http,/source:'crewcheck-route-preview'/);
assert.match(http,/preferences\.share\?\.traffic === true/);
assert.match(http,/airlineVisualFor/);
assert.match(http,/CREWCHECK_TV_AIRLINE_VISUALS_JSON/);
assert.match(http,/snapshot\.journeyDetails = \{\}/);
assert.match(routes,/expectedPrivacy = auth\.preferences\?\.audience/);
assert.match(routes,/updatePreferences/);
assert.match(routes,/updateContext/);

console.log('PASS: TV extension consent is per-device, sensitive fields fail closed, visitor projection redacts, Uber is owner-only phone handoff.');
