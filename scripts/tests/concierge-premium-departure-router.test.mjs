import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {prepareConciergeCanonicalBridge} from '../p1-concierge-journey/bridge.mjs';
import {harness} from '../regression-concierge-wellhub-conversation.mjs';
import * as gates from '../../shared/gate-query-day.mjs';
assert(process.argv.includes('--materialized'),'requires the actual fully prepared router');
prepareConciergeCanonicalBridge();
const programs=await import('../../server/concierge/journey-programs.mjs');
const canonical=await import('../../server/concierge/generated/canonicalRoster.mjs');
const source=fs.readFileSync('server.mjs','utf8');
const extract=name=>{const m=source.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}`));assert(m,name);return m[0];};
const now='2099-10-04T09:00:00Z';
function realDeparture(roster,mode='missing',at=now) {
 const h=harness({operationalProbe:true});let routeCalls=0,radarCalls=0;
 class Clock extends Date {constructor(...args){super(...(args.length?args:[at]));}static now(){return Date.parse(at);}}
 Object.assign(h.context,{Date:Clock,crypto,Buffer,...programs,buildCanonicalRosterEvents:canonical.buildCanonicalRosterEvents,
   findPublishedGateLeg:gates.findPublishedGateLeg,originFlightDate:gates.originFlightDate,
   gateQueryDay:i=>gates.gateQueryDay(i,Date.parse(at)),gateQuerySuppressed:gates.gateQuerySuppressed,
   conciergeLocationContextV14335:()=>({fresh:mode!=='missing',location:{latitude:1,longitude:2},message:'Localização sintética pendente.'}),
   conciergeLocationLineV14335:()=> 'Referência sintética compartilhada.',
   conciergeTravelEstimate:async()=>{routeCalls++;if(mode==='throw')throw Error('SYNTHETIC ROUTE FAILURE');if(mode==='null')return null;return {minutes:30,distanceKm:mode==='long'?300:10,durationText:'30 min',distanceText:mode==='long'?'300 km':'10 km'};},
   runRadarRace:async()=>{radarCalls++;return gates.gateQuerySuppressed({reason:'synthetic-offline'});},
 });
 for(const name of ['conciergeInactiveCodes','conciergeRemoteCodes']){const m=source.match(new RegExp(`const ${name} = new Set\\([\\s\\S]*?\\);`));assert(m,name);vm.runInContext(m[0],h.context);}
 const force=['buildFlightContext','normalizeFlightRaw','conciergeProgramRecords','conciergePresentationTime','conciergeProgramTitle','conciergeDateLabel','conciergePremiumScheduleReply','conciergePremiumDepartureReply','conciergeDepartureReply','conciergeAccessMatches'];
 const external=new Set([...Object.keys(programs),'conciergeTravelEstimate','conciergeLocationContextV14335','conciergeLocationLineV14335']);
 const names=[...force],seen=new Set();
 for(let i=0;i<names.length;i++){
  const name=names[i];if(seen.has(name)||external.has(name))continue;seen.add(name);
  if(!force.includes(name)&&typeof h.context[name]==='function')continue;
  const body=extract(name);vm.runInContext(body,h.context);
  for(const m of body.matchAll(/\b(concierge[A-Za-z0-9_]+)\s*\(/g))if(!seen.has(m[1])&&!external.has(m[1])&&source.includes(`function ${m[1]}(`))names.push(m[1]);
 }
 // Execute the actual prepared sender too; only its HTTP boundary is synthetic.
 let messageId=500;const messages=new Map();
 h.context.telegramApiUrl=method=>'https://synthetic-telegram.invalid/'+method;
 h.context.fetch=async(url,options)=>{
  assert(String(url).startsWith('https://synthetic-telegram.invalid/'),'no external Telegram/provider request');
  const method=String(url).split('/').at(-1),body=JSON.parse(options.body);let result;
  if(method==='sendMessage'){
   result={message_id:++messageId,date:Math.floor(Date.parse(at)/1000),chat:{id:body.chat_id,type:'private'},text:body.text};
   const entry={chat:body.chat_id,reply:body.text,extra:{reply_markup:body.reply_markup},result,outputIndex:h.trace.output.length};
   h.trace.output.push(body.text);h.trace.transports.push(entry);messages.set(result.message_id,entry);
  }else{
   const entry=messages.get(body.message_id);assert(entry,'only known synthetic message may be edited');result=entry.result;
   entry.extra.reply_markup=body.reply_markup;
   if(method==='editMessageText'){entry.reply=body.text;result.text=body.text;h.trace.output[entry.outputIndex]=body.text;}
   else assert.equal(method,'editMessageReplyMarkup');
  }
  return {ok:true,status:200,json:async()=>({ok:true,result})};
 };
 vm.runInContext(extract('sendTelegramMessage'),h.context);
 const runtime=source.match(/const crewcheckMenu = createTelegramMenu\([\s\S]*?\n}\);/);assert(runtime);
 vm.runInContext(runtime[0].replace('const crewcheckMenu =','globalThis.crewcheckMenu ='),h.context);
 h.setRoster(roster,mode==='missing'?{location:null}:{location:{latitude:1,longitude:2,updatedAt:at}});
 return {...h,routeCalls:()=>routeCalls,radarCalls:()=>radarCalls};
}
function data(kind,normalized=false){
 const leg={flightNumber:'QA-MERGED',origin:'AAA',destination:'BBB',departureTime:'08:00',arrivalTime:'09:00',presentationTime:'07:00',workType:'OP'};
 const leaf={dutyReport:'03:00',dutyDebrief:'09:30',dutyReportSource:'published',dutyDebriefSource:'published',legs:[{departureTime:'08:00',arrivalTime:'09:00',presentationTime:'07:00'}]};
 const container=kind==='estimated'?{...leaf,dutyReportSource:'estimated',records:[leaf]}:{...leaf,legs:[{departureTime:'04:00',arrivalTime:'05:00'},...leaf.legs],records:[leaf]};
 const day={date:'04/10/2099',dayNumber:4,month:10,year:2099,type:'ASB',pairingCode:'ASB',base:'AAA',dutyReport:'03:00',dutyDebrief:'09:30',dutyReportSource:'published',dutyDebriefSource:'published',legs:[leg],publishedClockEvidence:container};
 const next=JSON.parse(JSON.stringify(day));Object.assign(next,{date:'05/10/2099',dayNumber:5});
 const roster={year:2099,month:10,base:'AAA',days:[day,next]};
 return normalized?canonical.normalizeRosterDays(roster):roster;
}
for(const at of ['2099-10-04T09:00:00Z','2099-10-04T09:30:00Z','2099-10-04T10:00:00Z','2099-10-04T10:30:00Z'])for(const kind of ['estimated','earlier'])for(const normalized of [false,true])for(const mode of ['missing','null','throw','long','short'])for(const path of ['typed','button']) {
 test(`actual prepared ${path} premium ${kind} normalized=${normalized} route=${mode} at=${at}`,async()=>{
  const roster=data(kind,normalized),before=JSON.stringify(roster),h=realDeparture(roster,mode,at);
  await h.send('telegram','/proximo');const next=h.trace.output.at(-1);assert.match(next,/APZ: 04\/10\/2099 às 07:00/);
  if(path==='typed')await h.send('telegram','/saida');
  else {await h.openInline();await h.tap('Transporte');await h.tap('Saída');}
  const reply=h.trace.output.at(-1);assert.match(reply,/04\/10\/2099 às 07:00/,reply);assert.doesNotMatch(reply,/três horas|às 03:00/);
  const past=Date.parse(at)>=Date.parse('2099-10-04T10:00:00Z');
  if(past){assert.match(reply,/apresentação desta programação já passou/);assert.doesNotMatch(reply,/Saída recomendada|Saia de casa/);}
  else if(mode==='short'){assert.match(reply,/04\/10\/2099 às 06:05/);if(at.includes('09:30'))assert.match(reply,/saída recomendada já passou.*apresentação ainda é futura/);}
  assert.equal(h.routeCalls(),past||mode==='missing'?0:1);assert.equal(h.radarCalls(),0);assert.equal(JSON.stringify(roster),before);
 });
}


for(const path of ['typed','button'])for(const kind of ['estimated','earlier'])test(`actual ${path} missing own APZ ${kind} stays unavailable without route`,async()=>{
 const roster=data(kind);
 const clear=value=>{if(!value||typeof value!=='object')return;if('presentationTime'in value)delete value.presentationTime;for(const child of Object.values(value)){if(Array.isArray(child))child.forEach(clear);else if(child&&typeof child==='object')clear(child);}};clear(roster);
 const h=realDeparture(roster,'short');
 if(path==='typed')await h.send('telegram','/saida');else{await h.openInline();await h.tap('Transporte');await h.tap('Saída');}
 const reply=h.trace.output.at(-1);assert.match(reply,/apresentação não confirmados|apresentação não está confirmada/);assert.doesNotMatch(reply,/03:00|00:00|Saia de casa/);assert.equal(h.routeCalls(),0);assert.equal(h.radarCalls(),0);
});

test('actual owner change during route cannot deliver prior-owner departure facts',async()=>{
 const h=realDeparture(data('estimated'),'short');h.context.conciergeTravelEstimate=async()=>{h.profile.email='changed@example.invalid';return{minutes:30,distanceKm:10};};
 await h.send('telegram','/saida');const reply=h.trace.output.at(-1);assert.doesNotMatch(reply,/07:00|04\/10\/2099|Saia de casa/);assert.equal(h.radarCalls(),0);
});

test('actual revoked binding cannot use an issued Saída callback',async()=>{
 const h=realDeparture(data('estimated'),'short');await h.openInline();await h.tap('Transporte');const before=h.trace.transports.length;h.profile.linked=false;
 await h.tap('Saída');assert.equal(h.trace.transports.length,before);assert.equal(h.routeCalls(),0);assert.equal(h.radarCalls(),0);
});

test('actual canonical event identity retains the guarded Radar path for a proven flight',async()=>{
 const roster={year:2099,month:10,base:'BSB',days:[{date:'04/10/2099',dayNumber:4,month:10,year:2099,type:'VOO',pairingCode:'LA1234',base:'BSB',dutyReport:'07:00',dutyDebrief:'09:30',dutyReportSource:'published',dutyDebriefSource:'published',legs:[{flightNumber:'LA1234',origin:'BSB',destination:'GRU',departureTime:'08:00',arrivalTime:'09:00',workType:'OP'}]}]};
 const h=realDeparture(roster,'short');await h.send('telegram','/saida');assert.match(h.trace.output.at(-1),/04\/10\/2099 às 07:00/);assert.equal(h.routeCalls(),1);assert.equal(h.radarCalls(),1,'one synthetic response after exact selected-event binding');
});

for(const path of ['typed','button'])for(const mode of ['missing','null','throw','long','short'])for(const scenario of [
 {date:'05/10/2099',at:'2099-10-04T23:00:00Z',apz:'07:00',dep:'08:00',arr:'09:00',expected:'05/10/2099 às 07:00',leave:'05/10/2099 às 06:05',tomorrow:true},
 {date:'04/10/2099',at:'2099-10-04T02:50:00Z',apz:'00:20',dep:'01:00',arr:'02:00',expected:'04/10/2099 às 00:20',leave:'03/10/2099 às 23:25',tomorrow:true,late:true},
 {date:'01/01/2100',at:'2100-01-01T02:50:00Z',apz:'00:20',dep:'01:00',arr:'02:00',expected:'01/01/2100 às 00:20',leave:'31/12/2099 às 23:25',tomorrow:true,late:true},
 {date:'04/10/2099',at:'2099-10-04T03:00:00Z',apz:'00:20',dep:'01:00',arr:'02:00',expected:'04/10/2099 às 00:20',leave:'03/10/2099 às 23:25',tomorrow:false,late:true},
])test(`actual temporal ${path} ${mode} ${scenario.date} at=${scenario.at}`,async()=>{
 const [d,m,y]=scenario.date.split('/').map(Number);
 const roster={year:y,month:m,base:'AAA',days:[{date:scenario.date,dayNumber:d,month:m,year:y,type:'VOO',base:'AAA',dutyReport:scenario.apz,dutyDebrief:scenario.arr,dutyReportSource:'published',dutyDebriefSource:'published',legs:[{flightNumber:'QA-TIME',origin:'AAA',destination:'BBB',departureTime:scenario.dep,arrivalTime:scenario.arr,presentationTime:scenario.apz}]}]};
 const h=realDeparture(roster,mode,scenario.at);
 if(path==='typed')await h.send('telegram','/saida');else{await h.openInline();await h.tap('Transporte');await h.tap('Saída');}
 const reply=h.trace.output.at(-1);assert(reply.includes(scenario.expected),reply);
 if(scenario.tomorrow)assert.match(reply,/Apresentação: amanhã,/);else assert.doesNotMatch(reply,/amanhã/);
 if(mode==='short'){assert(reply.includes(scenario.leave),reply);if(scenario.late)assert.match(reply,/saída recomendada já passou.*apresentação ainda é futura/);}
 assert.doesNotMatch(reply,/Saia de casa/);assert.equal(h.radarCalls(),0);
});

for(const path of ['typed','button','que horas tenho que sair','hora de sair','rota para o aeroporto','trânsito para o aeroporto','ir para o aeroporto'])for(const boundary of ['route','radar','final'])test(`actual copied identity relink at ${boundary} denies ${path} prior-owner facts`,async()=>{
 const roster=data('estimated');const h=realDeparture(roster,'short');let current={...h.profile};
 h.context.telegramLinksRead=()=>({linked:{synthetic:{...current}}});
 h.context.telegramLinksWrite=()=>true;
 vm.runInContext(extract('telegramProfileForChat')+'\n'+extract('telegramProfileForChatAsync'),h.context);
 const runtime=source.match(/const crewcheckMenu = createTelegramMenu\([\s\S]*?\n}\);/);
 vm.runInContext(runtime[0].replace('const crewcheckMenu =','globalThis.crewcheckMenu ='),h.context);
 const relink=()=>{current={...current,email:'route-b@example.invalid'};};
 if(boundary==='route')h.context.conciergeTravelEstimate=async()=>{relink();return{minutes:30,distanceKm:10};};
 else if(boundary==='radar'){
  roster.base='BSB';roster.days[0].base='BSB';Object.assign(roster.days[0].legs[0],{flightNumber:'LA1234',origin:'BSB',destination:'GRU'});h.setRoster(roster);
  h.context.runRadarRace=async()=>{relink();return{ok:true,gate:'FORBIDDEN_GATE'};};
 }else{
  const save=h.context.conciergeSaveSnapshotAsync;
  h.context.conciergeSaveSnapshotAsync=async(...args)=>{const r=await save(...args);if(args[2]?.preferences?.conciergeConversation)relink();return r;};
 }
 if(path==='button'){await h.openInline();await h.tap('Transporte');await h.tap('Saída');}else await h.send('telegram',path==='typed'?'/saida':path);
 if(boundary==='final')assert.equal(current.email,'route-b@example.invalid','final fixture must cross actual conversation save');
 const outputs=h.trace.output.join(' ');assert.doesNotMatch(outputs,/04\/10\/2099|07:00|QA-MERGED|FORBIDDEN_GATE/);
 if(boundary==='route')assert.equal(h.radarCalls(),0);
});

test('actual wrapper never renders stale legacy gate when Radar rejects the occurrence',async()=>{
 const roster=data('estimated');roster.days[0].legs[0].gate='OLD_GATE_99';roster.days[0].legs[0].gateUpdatedAt='2099-10-01T00:00:00Z';
 const h=realDeparture(roster,'short');await h.send('telegram','/saida');assert.doesNotMatch(h.trace.output.join(' '),/OLD_GATE_99|portão/);
});

for(const path of ['typed','button'])for(const kind of ['base-missing','origin-missing','outside-base','cancelled','home-standby','empty','no-future'])test(`actual premium shares departure reader policy ${kind} ${path}`,async()=>{
 const roster=data('estimated');
 if(kind==='base-missing')delete roster.base;
 if(kind==='origin-missing'){for(const d of roster.days){delete d.base;for(const leg of d.legs)delete leg.origin;}}
 if(kind==='outside-base')roster.base='CCC';
 if(kind==='cancelled')for(const day of roster.days)day.status='cancelled';
 if(kind==='home-standby')for(const day of roster.days){day.type='HSB';day.pairingCode='HSB';day.legs=[];delete day.publishedClockEvidence;}
 if(kind==='empty')roster.days=[];
 const h=realDeparture(roster,'short',kind==='no-future'?'2099-10-08T09:00:00Z':now);
 if(path==='typed')await h.send('telegram','/saida');else{await h.openInline();await h.tap('Transporte');await h.tap('Saída');}
 const reply=h.trace.output.at(-1);assert.doesNotMatch(reply,/Saia de casa|Saída recomendada:/);assert.equal(h.routeCalls(),0);assert.equal(h.radarCalls(),0);
 const expected={'base-missing':/não confirmada/,'origin-missing':/não confirmada/,'outside-base':/fora da base.*posição física/,'cancelled':/cancelada/,'home-standby':/Sobreaviso em casa|cobertura/,'empty':/Não há escala/,'no-future':/cobertura.*não está confirmada/i};assert.match(reply,expected[kind]);
});
