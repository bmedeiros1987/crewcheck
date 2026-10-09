import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { radarReadReply } from '../server/concierge/radar-readonly.mjs';
import { conciergeLocationState, conciergeLocationDistanceKm, filterConciergePlacesByLocation } from '../server/v14335/concierge-location.mjs';
import { pharmacyReferenceReply } from '../server/concierge/pharmacy-reference.mjs';
import { conciergeHumanizeReplyV14408 } from '../server/v14408/concierge-human.mjs';
import { decorateConciergeReply, normalizeConciergePreferences } from '../server/v14336/concierge-personality.mjs';
const now = new Date('2026-10-03T15:00:00Z');
const hotel = {name:'Hotel Sintético',address:'Rua Teste, Guarulhos',city:'Guarulhos',location:{latitude:-23.4,longitude:-46.4}};
const stay = {day:{date:'2026-10-03',layoverStart:'07:00',layoverEnd:'17:00'},hotel:hotel.name,location:'GRU',start:'2026-10-03T10:00:00Z',end:'2026-10-03T20:00:00Z'};
const profile = {email:'a@example.invalid',channel:'whatsapp'};
let snapshot, saves, lookups, searches, candidates, stays, gps;
function reset() {
 snapshot={email:profile.email,key:profile.email,roster:{days:[{date:'2026-10-03',hotel:hotel.name}]},preferences:{}};
 saves=[];lookups=[];searches=[];candidates=[hotel];stays=[stay];gps=false;
}
const deps={
 load:async()=>snapshot,
 save: async (who, preferences)=>{assert.equal(who.email,profile.email);saves.push(preferences);snapshot={...snapshot,preferences:{...snapshot.preferences,...preferences}};},
 stays:()=>stays,city:()=> 'Guarulhos',gpsFresh:()=>gps,
 lookup:async query=>{lookups.push(query);return candidates;},
 nearby:async point=>{searches.push(point);return [{name:'Farmácia Sintética',address:'Rua Farmácia',openNow:undefined}];},
 placeLines:places=>places.map(p=>p.name+' · '+p.address).join('\n'),routeLines:()=>''
};
const ask=(text,who=profile,time=now,snap=snapshot)=>pharmacyReferenceReply(text,who,snap,deps,time);
reset();let result=await ask('/farmacias');assert.equal(result.handled,true);assert.match(result.reply,/Hotel Sintético/);assert.match(result.reply,/Referência de busca/);assert.doesNotMatch(result.reply,/aberto agora|Envie sua localização/);assert.deepEqual(searches,[hotel.location]);assert.equal(lookups.length,1);assert.equal(snapshot.preferences.location,undefined);
await ask('farmácia');assert.equal(lookups.length,1,'reuse only within TTL');
const savedA=structuredClone(snapshot);result=await ask('/farmacias',{email:'b@example.invalid',channel:'whatsapp'});assert.match(result.reply,/confirmar a conta/);assert.deepEqual(snapshot,savedA);assert.equal(searches.length,2);
await ask('/farmacias',profile,new Date(now.getTime()+600001));assert.equal(lookups.length,2,'expired references must be resolved again');
snapshot.roster.days[0].hotel='Outro hotel';await ask('/farmacias');assert.equal(lookups.length,3,'roster revision invalidates cached reference');
reset();await ask('/farmacias');stays=[{...stay,end:'2026-10-03T15:01:00Z'}];await ask('/farmacias',profile,new Date('2026-10-03T15:02:00Z'));assert.equal(searches.length,1,'ended stay cannot reuse short-lived cached reference');
reset();stays=[];result=await ask('/farmacias');assert.match(result.reply,/GPS é opcional/);assert.equal(lookups.length,0);assert.equal(searches.length,0);
result=await ask('referência: Hotel Sintético, Guarulhos');assert.match(result.reply,/1\. Hotel Sintético/);assert.equal(searches.length,0,'manual search hit requires selection');
result=await ask('1');assert.match(result.reply,/Farmácia Sintética/);assert.equal(searches.length,1);assert.equal(snapshot.roster.days[0].hotel,hotel.name,'search reference must not write hotel/room');
reset();candidates=[hotel,{...hotel,address:'Outra rua, Guarulhos'}];result=await ask('/farmacias');assert.match(result.reply,/2\. Hotel Sintético/);assert.equal(searches.length,0);const pending=structuredClone(snapshot);
result=await ask('9');assert.match(result.reply,/1 a 2/);assert.equal(searches.length,0);
result=await ask('1',{...profile,channel:'app'});assert.equal(result.handled,false);assert.equal(searches.length,0,'channel context isolation');
result=await ask('1',profile,new Date(now.getTime()+600001));assert.equal(result.handled,false);assert.equal(searches.length,0,'expired callback cannot choose');
snapshot.roster.days[0].date='2026-10-04';result=await ask('1');assert.equal(result.handled,false);assert.equal(searches.length,0,'changed stay/date invalidates pending choice');
snapshot=pending;result=await ask('2');assert.equal(snapshot.preferences.pharmacySearchReference.selected.address,'Outra rua, Guarulhos');assert.equal(searches.length,1);
reset();candidates=[{...hotel,address:'Outra cidade',city:''}, {...hotel,location:{latitude:null,longitude:null}}];result=await ask('/farmacias');assert.match(result.reply,/1\. Hotel Sintético/);assert.equal(searches.length,0);
reset();stays=[stay,{...stay,hotel:'Outro'}];result=await ask('/farmacias');assert.match(result.reply,/mais de um pernoite/);assert.equal(lookups.length,0,'ambiguous active stay must not silently choose');
reset();gps=true;result=await ask('farmácia perto de mim');assert.equal(result.handled,false,'explicit voluntary GPS keeps existing handler');assert.equal(lookups.length,0);
reset();stays=[];gps=true;result=await ask('/farmacias');assert.equal(result.handled,false,'fresh GPS still supported without hotel');
reset();await ask('/farmacias');const ref=snapshot.preferences.pharmacySearchReference;ref.request.createdAt='2026-10-03T15:01:00Z';await ask('/farmacias');assert.equal(lookups.length,2,'future context rejected');
// Reproductions from independent review; no provider calls.
reset();candidates=[{...hotel,city:'',address:'Rua Guarulhos, Curitiba',location:{latitude:-25.4,longitude:-49.2}}];result=await ask('/farmacias');assert.match(result.reply,/1\. Hotel Sintético/);assert.equal(searches.length,0,'address substrings cannot establish city');
reset();stays=[{...stay,day:{date:'2026-10-03'}}];result=await ask('/farmacias');assert.match(result.reply,/GPS é opcional/);assert.equal(lookups.length,0,'missing published stay times must not use all-day fallback');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
// A linked app profile carries the same chatId as Telegram: origin must still isolate choices.
const appLinked={...profile,channel:'app',chatId:'123456'};
const telegramLinked={...profile,channel:'telegram',chatId:'123456'};
for (const [from,to] of [[appLinked,telegramLinked],[telegramLinked,appLinked]]) {
 reset();await ask('referência: Hotel Sintético, Guarulhos',from);
 const before=structuredClone(snapshot);const writeCount=saves.length;
 result=await ask('1',to);assert.equal(result.handled,false,'linked app and Telegram must not consume each other’s options');
 assert.equal(searches.length,0);assert.equal(saves.length,writeCount);assert.deepEqual(snapshot,before);
 result=await ask('1',from);assert.match(result.reply,/Farmácia Sintética/);assert.equal(searches.length,1);
 reset();await ask('referência: Hotel Sintético, Guarulhos',from);
 result=await ask('1',from,new Date(now.getTime()+600000));assert.equal(result.handled,false,'exact expiry cannot select');
}
reset();let a=deferred(),b=deferred();const lookup=deps.lookup;deps.lookup=q=>q.includes('Alpha')?a.promise:b.promise;
const old=ask('referência: Alpha, Guarulhos');const recent=ask('referência: Beta, Guarulhos');b.resolve([{...hotel,name:'Beta'}]);await recent;a.resolve([{...hotel,name:'Alpha'}]);result=await old;assert.match(result.reply,/substituída/);assert.equal(snapshot.preferences.pharmacySearchReference.options[0].name,'Beta','late request cannot overwrite newer reference');deps.lookup=lookup;
for (const [from,to] of [[appLinked,telegramLinked],[telegramLinked,appLinked]]) {
 reset();a=deferred();b=deferred();deps.lookup=q=>q.includes('Alpha')?a.promise:b.promise;
 const slow=ask('referência: Alpha, Guarulhos',from);
 const fast=ask('referência: Beta, Guarulhos',to);
 b.resolve([{...hotel,name:'Beta'}]);await fast;a.resolve([{...hotel,name:'Alpha'}]);
 assert.match((await slow).reply,/substituída/);
 assert.equal(snapshot.preferences.pharmacySearchReference.options[0].name,'Beta');
 assert.equal((await ask('1',from)).handled,false,'superseded channel cannot select latest options');
 assert.match((await ask('1',to)).reply,/Beta/);assert.equal(searches.length,1);
 deps.lookup=lookup;
 reset();a=deferred();deps.lookup=()=>a.promise;
 const cancelled=ask('referência: Alpha, Guarulhos',from);
 assert.equal((await ask('farmácia perto de mim',to)).handled,false);
 a.resolve([hotel]);assert.match((await cancelled).reply,/substituída/);
 assert.equal(snapshot.preferences.pharmacySearchReference,null,'explicit GPS cancels older pending reference');
 assert.equal(searches.length,0);deps.lookup=lookup;
}
reset();await ask('referência: Hotel Sintético, Guarulhos',telegramLinked);
snapshot.preferences.pharmacySearchReference.request.chatId=telegramLinked.chatId;
assert.equal((await ask('1',telegramLinked)).handled,false,'pre-fix unscoped record is not reusable');
assert.equal((await ask('1',appLinked)).handled,false);assert.equal(searches.length,0);
reset();a=deferred();deps.lookup=()=>a.promise;const changing=ask('/farmacias');snapshot={...snapshot,roster:{days:[]}};a.resolve([hotel]);result=await changing;assert.match(result.reply,/validade/);assert.equal(saves.length,0,'roster changes during provider await prevent save');deps.lookup=lookup;
reset();a=deferred();deps.lookup=()=>a.promise;deps.now=()=>new Date(now.getTime()+600001);const expired=ask('/farmacias');a.resolve([hotel]);result=await expired;assert.match(result.reply,/validade/);assert.equal(saves.length,0);deps.lookup=lookup;delete deps.now;
reset();a=deferred();const nearby=deps.nearby;deps.nearby=()=>a.promise;const delayed=ask('/farmacias');await new Promise(r=>setImmediate(r));snapshot={...snapshot,roster:{days:[]}};a.resolve([{name:'Old pharmacy'}]);result=await delayed;assert.match(result.reply,/validade/);assert.doesNotMatch(result.reply,/Old pharmacy/);deps.nearby=nearby;
for(const query of ['academia perto do hotel','farmácia','quanto recebo de diária quinta-feira','salário mês que vem']) {
 const raw='Contexto do pernoite: Hotel Sintético\nDados insuficientes para confirmar valor ou horário.';
 const human=conciergeHumanizeReplyV14408(raw,query);assert.match(human,/Hotel Sintético/);assert.doesNotMatch(human,/Posso cruzar|Se quiser, eu/);
}
const formal=normalizeConciergePreferences({mode:'formal'},{mode:'comic'},{});assert.equal(decorateConciergeReply('Farmácia: horário não informado.',{preferences:formal}).humorApplied,false);
assert.equal(decorateConciergeReply('Emergência: procure o serviço oficial.',{preferences:{mode:'comic'},random:()=>0}).humorApplied,false);
const source=fs.readFileSync('server.mjs','utf8');assert.match(source,/const poi = await pharmacyReferenceReply/);assert.match(source,/conciergeSearchNearbyHealthPlacesAtReference\(\[kind === 'hospital' \? 'hospital' : 'pharmacy'\], point, 20\)/);assert.match(source,/locationRestriction/);
// Execute the actual app endpoint: linked identity must not override trusted origin.
let appRequestProfile;
const appEndpoint=source.slice(source.indexOf('async function handleTelegramConciergeAsk('),source.indexOf('function telegramMessagePdfDocument('));
const appContext=vm.createContext({radarReadReply,
 readJsonBody:async()=>({text:'1',channel:'telegram'}),
 telegramRequestUser:()=>({email:profile.email,channel:'telegram'}),
 telegramAppRequestAllowed:()=>true,telegramLinkedRecordForEmail:async()=>({chatId:'123456'}),
 conciergeAccessMatches:()=>true,conciergeLoadSnapshot:async()=>snapshot,
 buildTelegramConciergeReply:async(_text,who)=>{appRequestProfile=who;return 'offline';},
 conciergePreferencesV14336:()=>({}),conciergeVoiceOptionsV14336:()=>[],sendJson:()=>({ok:true}),
});
vm.runInContext(appEndpoint,appContext);await appContext.handleTelegramConciergeAsk({method:'POST'},{});
assert.equal(appRequestProfile.channel,'app');assert.equal(appRequestProfile.chatId,'123456');
console.log('PASS pharmacy hotel/GPS, explicit selection, A/B/channel isolation, TTL/date/stay invalidation, ambiguous/missing coordinates, factual language; zero real APIs');

// Execute the canonical prepared query implementation with a fake transport.
let calls=[];
const nearbySource=source.slice(source.indexOf('async function conciergeSearchNearbyHealthPlaces('),source.indexOf('async function conciergePharmaciesReply('));
const context=vm.createContext({
 mapsServerKey:()=> 'offline-test',WEATHER_AIRPORT_POINTS:{},
 conciergeLocationStateV14335:conciergeLocationState,
 conciergeLocationDistanceKmV14335:conciergeLocationDistanceKm,
 filterConciergePlacesByLocationV14335:filterConciergePlacesByLocation,
 conciergeGoogleMapsRouteUrl:()=> 'https://example.invalid/route',
 fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({places:[
  {displayName:{text:'Near'},formattedAddress:'Synthetic',location:hotel.location},
  {displayName:{text:'Far'},formattedAddress:'Synthetic',location:{latitude:0,longitude:0}}
 ]})};}
});
vm.runInContext(nearbySource,context);
assert.equal((await context.conciergeSearchNearbyHealthPlaces(['pharmacy'],null,6)).length,0);
assert.equal(calls.length,0,'GPS wrapper retains fresh-location requirement');
assert.equal((await context.conciergeSearchNearbyHealthPlacesAtReference(['pharmacy'],{latitude:null,longitude:null},6)).length,0);
const actual=await context.conciergeSearchNearbyHealthPlacesAtReference(['pharmacy'],hotel.location,6);
assert.equal(actual.length,1);assert.equal(actual[0].name,'Near');assert.equal(actual[0].openNow,undefined);
assert.equal(calls.length,1);assert.deepEqual(calls[0].body.includedTypes,['pharmacy']);
assert.equal(calls[0].body.locationRestriction.circle.radius,15000);
assert.deepEqual(calls[0].body.locationRestriction.circle.center,hotel.location);
console.log('PASS canonical Nearby runtime: voluntary GPS guard, numeric coordinates, pharmacy restriction, radius and distant-result filter; fake transport only');

// Execute the emitted adapter so a missing dependency fails before release.
reset();stays=[];
const adapter=source.slice(source.indexOf('const poi = await pharmacyReferenceReply'),source.indexOf('if (poi.handled) return'));
assert.match(adapter,/load: conciergeLoadSnapshot/);
const adapterContext=vm.createContext({pharmacyReferenceReply,text:'/farmacias',profile,currentSnapshot:snapshot,
 conciergeSaveSnapshotAsync:async(who,_roster,metadata)=>deps.save(who,metadata.preferences),
 conciergeLoadSnapshot:deps.load,conciergeStayRecords:deps.stays,WEATHER_AIRPORT_POINTS:{},
 conciergeLocationContextV14335:()=>({fresh:false}),conciergeSearchPlaces:deps.lookup,
 conciergeSearchNearbyHealthPlacesAtReference:deps.nearby,conciergePlaceLines:deps.placeLines,
 conciergeHealthRouteLines:deps.routeLines
});
const adapted=await vm.runInContext('(async()=>{'+adapter+'return poi;})()',adapterContext);
assert.match(adapted.reply,/GPS é opcional/);assert.equal(saves.length,1);
console.log('PASS emitted adapter dependency wiring and missing-reference reply');

