import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { radarReadReply } from '../server/concierge/radar-readonly.mjs';
import { pharmacyPlaceResults, pharmacyResultsText, pharmacyKind } from '../server/concierge/place-results.mjs';
import { pharmacyReferenceReply } from '../server/concierge/pharmacy-reference.mjs';
const place = (name, extra = {}) => ({ name, address: 'Rua Exemplo, 12, Guarulhos', location: { latitude: -23.46, longitude: -46.53 }, distanceKm: 0.4, ...extra });
const sample = [place('Botica Pet', {openNow:true}),place('Farmácia de Manipulação Centro',{openNow:true}),place('Drogaria Fechada',{openNow:false,distanceKm:.1}),place('Drogaria Sem Horário',{distanceKm:.3}),place('Drogaria Aberta',{openNow:true,distanceKm:1.1}),place('Drogaria Outra',{openNow:true,distanceKm:2}),place('Drogaria Terceira',{openNow:true,distanceKm:3})];
let results = pharmacyPlaceResults(sample,{reference:'Referência de busca: Hotel Sintético · Guarulhos'});
assert.deepEqual(results.places.map(p=>p.name),['Drogaria Aberta','Drogaria Outra','Drogaria Terceira']);
assert.equal(results.moreAvailable,true);
assert.equal(pharmacyKind(place('Farmácia X',{types:['pharmacy','veterinary_care']})),'veterinary');
assert.equal(pharmacyKind(place('Farmácia Homeopática')),'compounding');
assert.equal(pharmacyPlaceResults(sample,{text:'mais farmácias'}).places.length,5);
assert.deepEqual(pharmacyPlaceResults(sample,{text:'farmácia veterinária'}).places.map(p=>p.name),['Botica Pet']);
assert.deepEqual(pharmacyPlaceResults(sample,{text:'farmácia de manipulação'}).places.map(p=>p.name),['Farmácia de Manipulação Centro']);
results=pharmacyPlaceResults(sample.slice(0,2));assert.equal(results.places[0].category,'Manipulação');assert.match(results.note,/Só encontrei.*manipulação/);
assert.equal(pharmacyPlaceResults([sample[0]]).places.length,0,'never offer a vet as human fallback');
results=pharmacyPlaceResults([place('Sem horário'),place('Fechada',{openNow:false}),place('Encerrada',{businessStatus:'CLOSED_PERMANENTLY'}),place('Temporária',{businessStatus:'CLOSED_TEMPORARILY'})]);
assert.equal(results.places.length,2);assert.equal(results.places[0].openNow,undefined);assert.equal(results.places[1].openNow,false);
let text=pharmacyResultsText(results);assert.match(text,/Horário não informado/);assert.match(text,/Fechada agora/);assert.match(text,/em linha reta/);assert.doesNotMatch(text,/minutos|caminhada|a pé|\]\(/);assert.equal((text.match(/↗ Rota:/g)||[]).length,2);assert.ok(text.indexOf('↗ Rota:')<text.indexOf('2. Fechada'));assert.doesNotMatch(text,/travelmode|origin=/);
assert.equal(pharmacyPlaceResults([place('Duplicada'),place('Duplicada')]).places.length,1);
results=pharmacyPlaceResults([place('Inválida',{rating:8,distanceKm:null,location:{latitude:null,longitude:0},routeUrl:'javascript:alert(1)'})]);assert.equal(results.places[0].rating,undefined);assert.equal(results.places[0].distanceKm,null);assert.equal(results.places[0].routeUrl,'');
results=pharmacyPlaceResults([place('Hospital A'),place('Hospital Veterinário')],{searchType:'hospital'});assert.equal(results.title,'Hospitais');assert.equal(results.places.length,1);assert.match(results.note,/Confirme especialidade e pronto atendimento/);assert.doesNotMatch(pharmacyResultsText(results),/192|911|112/);
const now=new Date('2026-10-04T14:00:00Z');
const hotel={name:'Hotel Sintético',address:'Avenida longa, 10, Centro, Guarulhos, SP, 07000-000, Brasil',city:'Guarulhos',location:{latitude:-23.4,longitude:-46.5}};
const stay={day:{date:'2026-10-04',layoverStart:'10:00',layoverEnd:'19:00'},hotel:hotel.name,location:'GRU',start:'2026-10-04T13:00:00Z',end:'2026-10-04T22:00:00Z'};
const profile={email:'synthetic@example.invalid',channel:'whatsapp'};
let snapshot,stays,queries,gps;
const reset=()=>{snapshot={email:profile.email,key:profile.email,roster:{days:[{date:'2026-10-04',hotel:hotel.name}]},preferences:{location:{updatedAt:'2026-10-03T01:00:00Z'}}};stays=[stay];queries=[];gps={fresh:false};};
const deps={load:async()=>snapshot,save:async(_p,preferences)=>{snapshot={...snapshot,preferences:{...snapshot.preferences,...preferences}};},stays:()=>stays,city:()=>hotel.city,gpsFresh:()=>gps.fresh,gps:()=>gps,lookup:async()=>[hotel],nearby:async(point,kind)=>{queries.push({point,kind});return kind==='hospital'?[place('Hospital Sintético')]:sample;}};
reset();let reply=await pharmacyReferenceReply('farmácias',profile,snapshot,deps,now);assert.equal(reply.handled,true);assert.ok(reply.placeResults);assert.match(reply.reply,/Referência de busca: Hotel Sintético · Guarulhos/);assert.doesNotMatch(reply.reply,/Avenida longa|Não confirma sua presença|referência: hotel/);assert.ok(reply.reply.length<1800);
reply=await pharmacyReferenceReply('🏥 Hospitais',profile,snapshot,deps,now);assert.equal(reply.handled,true);assert.equal(queries.at(-1).kind,'hospital');assert.deepEqual(queries.at(-1).point,hotel.location);assert.doesNotMatch(reply.reply,/expirou|Compartilhe novamente/);assert.equal(snapshot.preferences.location.updatedAt,'2026-10-03T01:00:00Z');
reset();stays=[];reply=await pharmacyReferenceReply('hospitais',profile,snapshot,deps,now);assert.match(reply.reply,/GPS é opcional/);assert.equal(queries.length,0);
reply=await pharmacyReferenceReply('perto de Hotel Sintético, Guarulhos',profile,snapshot,deps,now);assert.match(reply.reply,/1\. Hotel Sintético/);
const before=structuredClone(snapshot);reply=await pharmacyReferenceReply('1',{...profile,channel:'app'},snapshot,deps,now);assert.equal(reply.handled,false);assert.deepEqual(snapshot,before);
reply=await pharmacyReferenceReply('1',profile,snapshot,deps,now);assert.equal(reply.placeResults.title,'Hospitais');
reply=await pharmacyReferenceReply('farmácias',profile,snapshot,deps,now);assert.equal(reply.placeResults.title,'Farmácias');
reply=await pharmacyReferenceReply('hospitais',profile,snapshot,deps,now);assert.equal(reply.placeResults.title,'Hospitais');assert.deepEqual(queries.at(-1).point,hotel.location);
reply=await pharmacyReferenceReply('hospitais',profile,snapshot,deps,new Date(now.getTime()+600001));assert.match(reply.reply,/GPS é opcional/);assert.equal(queries.length,3);
reset();stays=[];gps={fresh:true,label:'Guarulhos',location:hotel.location};reply=await pharmacyReferenceReply('farmácia perto de mim',profile,snapshot,deps,now);assert.match(reply.reply,/Localização compartilhada: Guarulhos/);assert.equal(reply.placeResults.places.length,3);
reset();stays=[];await pharmacyReferenceReply('farmácia veterinária',profile,snapshot,deps,now);await pharmacyReferenceReply('perto de Hotel Sintético, Guarulhos',profile,snapshot,deps,now);reply=await pharmacyReferenceReply('1',profile,snapshot,deps,now);assert.equal(reply.placeResults.title,'Farmácias veterinárias');
// A fresh voluntary GPS search must not return a now-stale/different origin after provider delay.
reset();stays=[];gps={fresh:true,label:'Guarulhos',location:hotel.location};
const originalNearby=deps.nearby;let resolveNearby;deps.nearby=()=>new Promise(resolve=>{resolveNearby=resolve;});
const delayedGps=pharmacyReferenceReply('farmácia perto de mim',profile,snapshot,deps,now);
await new Promise(resolve=>setImmediate(resolve));gps={fresh:false};resolveNearby(sample);
assert.match((await delayedGps).reply,/perdeu a validade/);deps.nearby=originalNearby;
// Questions may contain private health details: persist normalized filters only.
reset();stays=[];await pharmacyReferenceReply('farmácia de manipulação para medicamento particular',profile,snapshot,deps,now);
assert.equal(snapshot.preferences.pharmacySearchReference.pharmacyCategory,'compounding');
assert.doesNotMatch(JSON.stringify(snapshot.preferences.pharmacySearchReference),/medicamento|particular|searchText/);
let foreign=await pharmacyReferenceReply('perto de Hotel Sintético, Guarulhos',{...profile,channel:'app'},snapshot,deps,now);
assert.match(foreign.reply,/Qual local/);assert.equal(snapshot.preferences.pharmacySearchReference.pharmacyCategory,'ordinary','foreign channel cannot inherit specialization');
reset();stays=[];await pharmacyReferenceReply('hospitais',profile,snapshot,deps,now);
await pharmacyReferenceReply('perto de Hotel Sintético, Guarulhos',profile,snapshot,deps,new Date(now.getTime()+600001));
assert.equal(snapshot.preferences.pharmacySearchReference.searchType,'pharmacy','expired intent is not inherited');
console.log('PASS result relevance, 3/6 choices, per-place plain routes, honest hours/distances, hospital/reference continuity, expiry, GPS and channel isolation');
if(process.argv.includes('--prepared')) {
 const source=fs.readFileSync('server.mjs','utf8');
 assert.match(source,/places\.location,places\.types,places\.businessStatus/);
 assert.match(source,/nearby: \(point, kind\) => conciergeSearchNearbyHealthPlacesAtReference\(\[kind === 'hospital' \? 'hospital' : 'pharmacy'\], point, 20\)/);
 const start=source.indexOf('const poi = await pharmacyReferenceReply');const end=source.indexOf('\n',source.indexOf('if (poi.handled) return',start));const adapter=source.slice(start,end);
 for(const channel of ['app','telegram','whatsapp']) {
  reset();const ctx=vm.createContext({pharmacyReferenceReply:(t,p,s,d)=>pharmacyReferenceReply(t,p,s,d,now),text:'farmácias',profile:{...profile,channel},currentSnapshot:snapshot,conciergeSaveSnapshotAsync:async(p,_r,m)=>deps.save(p,m.preferences),conciergeLoadSnapshot:deps.load,conciergeStayRecords:deps.stays,WEATHER_AIRPORT_POINTS:{GRU:{city:hotel.city}},conciergeLocationContextV14335:()=>gps,conciergeSearchPlaces:deps.lookup,conciergeSearchNearbyHealthPlacesAtReference:async(types,point,max)=>{assert.equal(max,20);return deps.nearby(point,types[0]);},conciergeHumanizeReplyV14408:r=>r});
  const output=await vm.runInContext(`(async()=>{${adapter}})()`,ctx);assert.equal(typeof output,channel==='app'?'object':'string');if(channel==='app')assert.equal(output.placeResults.places.length,3);
 }
 const endpoint=source.slice(source.indexOf('async function handleTelegramConciergeAsk('),source.indexOf('function telegramMessagePdfDocument('));
 let response;const ctx=vm.createContext({radarReadReply,readJsonBody:async()=>({text:'farmácias'}),telegramRequestUser:()=>({email:profile.email}),telegramAppRequestAllowed:()=>true,telegramLinkedRecordForEmail:async()=>({chatId:'123'}),conciergeAccessMatches:()=>true,conciergeLoadSnapshot:async()=>snapshot,buildTelegramConciergeReply:async()=>({reply:'plain',placeResults:{title:'Farmácias'}}),conciergePreferencesV14336:()=>({}),conciergeVoiceOptionsV14336:()=>[],sendJson:(_r,_s,p)=>{response=p;}});
 vm.runInContext(endpoint,ctx);await ctx.handleTelegramConciergeAsk({method:'POST'},{});assert.equal(response.reply,'plain');assert.equal(response.placeResults.title,'Farmácias');
 // Execute the real early Telegram entry, including its canonical-health bypass.
 const index=fs.readFileSync('server/v139/index.mjs','utf8');
 const normalize=index.slice(index.indexOf('function normalizeTelegramIntentText'),index.indexOf('export async function handleV139Route'));
 const handler=index.slice(index.indexOf('export async function handleV139Telegram'),index.indexOf('export const crewCheckV139')).replace('export async function','async function');
 let emergencyCalls=0,crewLockCalls=0;const transport=vm.createContext({handleTelegramLocationAndPlaces:async()=>false,handleEmergencyTelegram:async()=>{emergencyCalls++;return true;},handleCrewLockTelegram:async()=>{crewLockCalls++;return false;}});
 vm.runInContext(normalize+'\n'+handler,transport);
 for(const text of ['🏥 Hospitais','💊 Farmácias','farmácia','hospital','/farmacias@crewcheck_bot','/hospitais@crewcheck_bot','/farmacias perto de Hotel Exemplo, Guarulhos']) {
  emergencyCalls=0;crewLockCalls=0;assert.equal(await transport.handleV139Telegram({message:{text,chat:{id:123}}},()=>{}),false);assert.equal(crewLockCalls,1,`canonical routing must reach downstream handler, not a caught error: ${text}`);assert.equal(emergencyCalls,0,`canonical search reached legacy emergency: ${text}`);
 }
 for(const text of ['/emergencia','/plano S450','/prontoatendimento','usar hotel/pernoite']) {
  emergencyCalls=0;assert.equal(await transport.handleV139Telegram({message:{text,chat:{id:123}}},()=>{}),true,`emergency route failed: ${text}`);assert.equal(emergencyCalls,1,`emergency intent bypassed: ${text}`);
 }
 emergencyCalls=0;await transport.handleV139Telegram({callback_query:{data:'cc_emergency_confirm:medical',message:{text:'Hospitais',chat:{id:123}}}},()=>{});assert.equal(emergencyCalls,1);
 const home=fs.readFileSync('client/src/pages/Home.tsx','utf8');assert.match(home,/<ConciergePlaceResults results=\{placeResults\}/);assert.match(home,/setPlaceResults\(isConciergePlaceResults\(payload\.placeResults\)/);
 console.log('PASS prepared provider projection, actual channel adapter, API response and app renderer wiring');
}
