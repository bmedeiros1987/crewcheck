import assert from 'node:assert/strict';
import { wellhubOpeningStatus as status, prioritizeWellhubOpening } from '../shared/wellhub-hours.mjs';
import { searchVerifiedWellhub } from '../server/v14407/wellhub.mjs';
const unit = { verifiedAt:'2026-10-09',timeZone:'America/Fortaleza',openingHours:['seg-sex 05:00-22:30','sab 08:00-16:00','dom 08:00-12:00'] };
const at = (iso,p=unit) => status(p,new Date(iso)).status;
assert.equal(at('2026-10-10T10:59:59Z'),'closed');
assert.equal(at('2026-10-10T11:00:00Z'),'open');
assert.equal(at('2026-10-10T18:59:59Z'),'open');
assert.equal(at('2026-10-10T19:00:00Z'),'closed');
assert.equal(at('2026-10-11T11:00:00Z'),'open');
assert.equal(at('2026-10-11T15:00:00Z'),'closed');
const overnight={...unit,openingHours:['sab 22:00-02:00','dom 08:00-12:00']};
assert.equal(at('2026-10-11T04:59:59Z',overnight),'open');
assert.equal(at('2026-10-11T05:00:00Z',overnight),'closed');
const pauses={...unit,openingHours:['sab 08:00-12:00, 14:00-18:00']};
assert.equal(at('2026-10-10T15:00:00Z',pauses),'closed');
assert.equal(at('2026-10-10T17:00:00Z',pauses),'open');
assert.equal(at('2026-10-11T02:59:59Z',{...unit,is24Hours:true,openingHours:['seg-dom 00:00-23:59']}),'open');
assert.equal(at('2026-10-10T11:00:00Z',{...unit,timeZone:'America/Manaus'}),'closed');
for(const patch of [{verifiedAt:'2026-01-01'},{verifiedAt:'2026-10-11'},{verifiedAt:'2026-02-30'},{openingHours:[]},{openingHours:['sab 25:00-16:00']},{openingHours:['sab 08:00-16:00 lixo']},{openingHours:['bad 08:00-16:00']},{timeZone:'UTC'},{timeZone:'invalid/zone'},{holidayHoursUncertain:true}]) assert.equal(at('2026-10-10T12:00:00Z',{...unit,...patch}),'unknown',JSON.stringify(patch));
assert.equal(at('2026-10-12T12:00:00Z'),'unknown');
const sorted=prioritizeWellhubOpening([{...unit,id:'closed',openingHours:['sab 18:00-20:00']},{...unit,id:'open-a'},{...unit,id:'unknown',openingHours:[]},{...unit,id:'open-b'}],new Date('2026-10-10T12:00:00Z'));
assert.deepEqual(sorted.map(p=>p.id),['open-a','open-b','unknown','closed']);
for(const locationText of ['Fortaleza CE','Brasília DF']) {
 const partners=await searchVerifiedWellhub({plan:'silver-plus',locationText,now:new Date('2026-10-10T21:32:00Z'),limit:60});
 assert.ok(partners.length);
 assert.ok(partners.every(p=>p.state===(locationText==='Fortaleza CE'?'CE':'DF')));
 assert.ok(partners.every(p=>p.minimumPlan!=='gold'));
 assert.equal(partners[0].openingStatus.status,'open');
}
console.log('Wellhub hours: unit IANA, current instant, weekends, 24h, midnight, pauses, boundaries, holiday/stale unknown, stable rank after filters: PASS');
const { subscribeWellhubClock } = await import('../shared/wellhub-clock.mjs');
const listeners=new Map(), win={addEventListener:(e,f)=>listeners.set(e,f),removeEventListener:e=>listeners.delete(e)},doc={...win,visibilityState:'visible'};
let clockNow=Date.parse('2026-10-10T18:59:59Z'), callback, delay, ticks=[];
const unsubscribe=subscribeWellhubClock(n=>ticks.push(n),win,doc,{now:()=>clockNow,setTimeout:(f,ms)=>{callback=f;delay=ms;return 1;},clearTimeout:()=>{}});
assert.equal(delay,1000);
clockNow+=1000;callback();assert.equal(status(unit,new Date(ticks.at(-1))).status,'closed');
clockNow=Date.parse('2026-10-11T11:00:00Z');listeners.get('focus')();assert.equal(status(unit,new Date(ticks.at(-1))).status,'open');
clockNow=Date.parse('2026-10-11T15:00:00Z');listeners.get('visibilitychange')();assert.equal(status(unit,new Date(ticks.at(-1))).status,'closed');
unsubscribe();assert.equal(listeners.size,0);
console.log('App clock: minute boundary, focus/visibility resume, cleanup and no network: PASS');

assert.equal(at('2026-10-11T12:00:00Z',{...unit,openingHours:['seg-sab 08:00-18:00']}),'unknown');

assert.equal(at('2026-10-10T21:32:00Z',{...unit,name:'Nome 24h sem prova'}),'closed');
assert.equal(at('2026-10-10T21:32:00Z',{...unit,is24Hours:true}),'unknown');
const { isOfficialWellhubUrl, WELLHUB_UBER_FALLBACK_URL } = await import('../shared/wellhub-links.mjs');
assert.equal(isOfficialWellhubUrl('https://wellhub.com/pt-br/search/partners/test?x=%26%22'),true);
for(const url of ['javascript:alert(1)','https://wellhub.com.evil.invalid/pt-br/search/','https://user@wellhub.com/pt-br/search/','http://wellhub.com/pt-br/search/'])assert.equal(isOfficialWellhubUrl(url),false);
assert.equal(WELLHUB_UBER_FALLBACK_URL,'https://m.uber.com/');
console.log('Official aliases and honest Uber fallback without coordinates/credentials: PASS');
const fs=await import('node:fs'),vm=await import('node:vm'),concierge=await import('../server/v14410/wellhub-concierge.mjs'),api=await import('../server/v14407/wellhub.mjs');
let requestNow=new Date('2026-10-10T21:32:00Z');
const context=vm.createContext({...api,...concierge,searchVerifiedWellhub:input=>api.searchVerifiedWellhub({...input,now:requestNow}),conciergeCurrentStay:()=>null,conciergeNextProgram:()=>null,conciergeLocationContextV14335:()=>({fresh:true,location:{city:'Fortaleza',state:'CE'}}),WEATHER_AIRPORT_POINTS:{}});
vm.runInContext(fs.readFileSync('scripts/v14410/concierge-gyms.snippet','utf8')+'\nthis.reply=conciergeGymsReply;',context);
const snapshot={roster:{base:'BSB'},preferences:{gymPlan:'wellhub',wellhubPlan:'silver-plus'}};
let reply=await context.reply(snapshot,'/academias');
assert.match(reply,/1\. Porão Academia Messejana 24h\n🟢 Aberta pelo horário cadastrado/);
assert.match(reply,/Greenlife Messejana\n🔴 Fechada pelo horário cadastrado/);
assert.ok(reply.length<=3900);assert.match(reply,/Horário avaliado nesta consulta, sem acompanhamento contínuo/);
requestNow=new Date('2026-10-12T21:32:00Z');reply=await context.reply(snapshot,'/academias');assert.doesNotMatch(reply,/🟢|🔴/);assert.match(reply,/🟡 Horário cadastrado incerto/);
console.log('CrewCierge request instant: same labels/rank, Fortaleza before BSB, holiday unknown, footer and text budget: PASS');

// Independent review reproducers: all 24h intervals must agree, and a
// holiday-origin overnight interval stays unknown past midnight.
assert.equal(at('2026-10-11T21:00:00Z',{...unit,is24Hours:true,openingHours:['seg-dom 00:00-23:59','dom 08:00-12:00']}),'unknown');
assert.equal(at('2026-10-13T04:00:00Z',{...unit,openingHours:['seg 22:00-02:00']}),'unknown');
assert.equal(at('2026-10-20T04:00:00Z',{...unit,openingHours:['seg 22:00-02:00']}),'open');
assert.equal(at('2026-10-11T21:00:00Z',{...unit,is24Hours:true,openingHours:['seg-sex 00:00-23:59','sab-dom 00:00-23:59']}),'open');
assert.equal(at('2026-10-11T21:00:00Z',{...unit,is24Hours:true,openingHours:['seg-dom 00:00-23:59','dom 00:00-23:59']}),'open');
console.log('Independent reproducers: contradictory 24h unknown; holiday origin survives midnight; coherent 24h/nonholiday overnight preserved: PASS');
