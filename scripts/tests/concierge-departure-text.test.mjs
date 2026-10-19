import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
const snippet=fs.readFileSync('scripts/v14335/departure-reply.snippet','utf8');
const prepared=!process.argv.includes('--source') && (process.argv.includes('--materialized') || fs.readFileSync('server.mjs','utf8').includes('const civilKey = date =>'));
const source=prepared?fs.readFileSync('server.mjs','utf8'):snippet;
const body=source.match(/async function conciergeDepartureReply\([\s\S]*?\n}/)?.[0];assert(body);
function fixture({now='2099-10-04T09:00:00Z',origin='AAA',base='AAA',start='2099-10-04T10:00:00Z',end='2099-10-04T16:00:00Z',stay=null,status=null,records=true,days=true,code='VOO',following=false}={}) {
 let routes=0;
 const record={start:new Date(start),end:new Date(end),startTime:'07:00',endTime:'13:00',code,display:{presentationConfirmed:true,publishedStart:Date.parse(start)},day:{base:origin,status,dutyReport:'07:00'},legs:code==='VOO'?[{origin,destination:'BBB'}]:[]};
 const roster={base,days:days?[{}]:[]};
 class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return new Date(now).getTime();}}
 const context=vm.createContext({Date:Clock,conciergeJourneyProgramRecords:()=>records?[record,...(following?[{...record,start:new Date('2099-10-05T10:00:00Z'),end:new Date('2099-10-05T16:00:00Z')}]:[])]:[],conciergeProgramRecords:()=>[],conciergeCurrentStay:()=>assert.fail('unbound hotel selector must not be consumed'),
 conciergePresentationTime:()=>record.startTime,conciergeProgramTitle:()=> 'SYNTH-FLIGHT',conciergeDateLabel:()=> 'Data sintética',
 conciergeLocationContextV14335:()=>({fresh:true,location:{source:'synthetic'}}),conciergeLocationLineV14335:()=> 'Localização sintética de referência.',
 conciergeTravelEstimate:async()=>{routes++;return{minutes:30,distanceKm:10,durationText:'30 min',distanceText:'10 km',trafficAware:false};}});
 vm.runInContext(body+'\nglobalThis.run=conciergeDepartureReply;',context);
 return {run:()=>context.run({roster}),routes:()=>routes};
}
for(const [name,now,expected] of [
 ['before leave','2099-10-04T09:00:00Z',/Saída recomendada: 04\/10\/2099 às 06:05/],
 ['after leave before APZ','2099-10-04T09:30:00Z',/saída recomendada já passou.*06:05.*apresentação ainda é futura/],
 ['at APZ','2099-10-04T10:00:00Z',/apresentação desta programação.*já passou/],
 ['after APZ current duty','2099-10-04T11:00:00Z',/não selecionei outra programação automaticamente/],
])test(name,async()=>{const f=fixture({now});const result=await f.run();assert.match(result,expected);assert.match(result,/UTC−03/);assert.doesNotMatch(result,/você já chegou|você está no aeroporto|Saia amanhã/);assert.equal(f.routes(),now<'2099-10-04T10:00:00Z'?1:0);});
test('tomorrow is explicit with full date',async()=>{const f=fixture({start:'2099-10-05T10:00:00Z',end:'2099-10-05T16:00:00Z'});assert.match(await f.run(),/amanhã, 05\/10\/2099 às 06:05/);});
for(const [name,options,expected] of [
 ['outside base',{origin:'BBB'},/fora da base.*Hotel e pickup não confirmados/],
 ['missing base',{base:''},/Base ou origem.*não confirmada/],
 ['cancelled',{status:'Cancelled'},/consta cancelada/],
 ['home standby',{code:'HSB'},/Sobreaviso em casa/],
 ['no roster',{days:false},/Não há escala disponível/],
 ['incomplete coverage',{records:false},/período disponível.*cobertura dos próximos dias não está confirmada/],
 ['after duty',{now:'2099-10-04T17:00:00Z'},/período disponível/],
])test(name,async()=>{const f=fixture(options);const result=await f.run();assert.match(result,expected);assert.equal(f.routes(),0);assert.doesNotMatch(result,/SYNTH-UNBOUND|wa\.me|Você está no hotel|Saia de casa às/);});

test('past leave with future APZ keeps today even with tomorrow available',async()=>{const f=fixture({now:'2099-10-04T09:30:00Z',following:true});const result=await f.run();assert.match(result,/saída recomendada já passou/);assert.match(result,/04\/10\/2099 às 07:00/);assert.doesNotMatch(result,/amanhã|05\/10/);});

test('unbound stay cannot suppress location-based route',async()=>{const f=fixture({stay:{hotel:'SYNTH-UNBOUND'}});const result=await f.run();assert.equal(f.routes(),1);assert.doesNotMatch(result,/pernoite|pickup|SYNTH-UNBOUND|você está/);});

// Integration counterproofs use the actual legacy reader, actual canonical
// projection and actual prepared producer. Only time and the external route
// response are synthetic; no current-stay/program selector is mocked.
import {prepareConciergeCanonicalBridge} from '../p1-concierge-journey/bridge.mjs';
prepareConciergeCanonicalBridge();
const {conciergeJourneyProgramRecords:realPrograms}=await import('../../server/concierge/journey-programs.mjs');
const {buildProgramSummary:realSummary}=await import('../../server/v1404/telegram-language.mjs');
const actualServer=fs.readFileSync('server.mjs','utf8');
function realRuntime(now='2099-10-04T09:00:00Z') {
  let routes=0;
  const external=new Set(['conciergeJourneyProgramRecords','conciergeTravelEstimate','conciergeLocationContextV14335','conciergeLocationLineV14335']);
  const names=['conciergeProgramRecords','conciergePresentationTime','conciergeProgramTitle','conciergeDateLabel'];
  const declarations=[body],seen=new Set();
  for(let i=0;i<names.length;i++) {
    const name=names[i];if(seen.has(name)||external.has(name))continue;seen.add(name);
    const declaration=actualServer.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}`))?.[0];assert(declaration,name);declarations.push(declaration);
    for(const match of declaration.matchAll(/\b(concierge[A-Za-z0-9_]+)\s*\(/g))if(!external.has(match[1])&&!seen.has(match[1])&&actualServer.includes(`function ${match[1]}(`))names.push(match[1]);
  }
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return new Date(now).getTime();}}
  const context=vm.createContext({Date:Clock,Intl,conciergeInactiveCodes:new Set(['DO','DOF','DOP','DOPR','DR','OFF','VC']),
    conciergeJourneyProgramRecords:realPrograms,
    conciergeLocationContextV14335:()=>({fresh:true,location:{source:'synthetic'}}),conciergeLocationLineV14335:()=> 'Referência sintética compartilhada.',
    conciergeTravelEstimate:async()=>{routes++;return{minutes:30,distanceKm:10,durationText:'30 min',distanceText:'10 km',trafficAware:false};},
  });
  vm.runInContext(declarations.join('\n')+'\nglobalThis.run=conciergeDepartureReply;globalThis.programs=conciergeProgramRecords;',context);
  return{run:roster=>context.run({roster}),programs:roster=>realPrograms(roster,context.programs(roster)),routes:()=>routes};
}
function sourceDay(extra={}){return{date:'04/10/2099',dayNumber:4,month:10,year:2099,type:'VOO',pairingCode:'LA0012',dutyReport:'07:00',dutyDebrief:'09:30',dutyReportSource:'published',dutyDebriefSource:'published',base:'AAA',hotel:null,legs:[{flightNumber:'LA0012',origin:'AAA',destination:'BBB',departureTime:'08:00',arrivalTime:'09:00',workType:'OP'}],...extra};}
const sourceRoster=days=>({month:10,year:2099,base:'AAA',days});
for(const status of [undefined,'Cancelled','Planned'])test(`real producer ignores loose hotel row ${status??'unknown'}`,async()=>{
  const f=realRuntime(),g=realRuntime();const clean=sourceRoster([sourceDay()]);
  const loose=sourceRoster([sourceDay(),sourceDay({type:'OTHER',pairingCode:'',dutyReport:null,dutyDebrief:null,legs:[],hotel:'SYNTH-LOOSE-HOTEL',status})]);
  const expected=await f.run(clean),actual=await g.run(loose);assert.equal(actual,expected);assert.equal(g.routes(),1);assert.match(actual,/06:05/);assert.doesNotMatch(actual,/pernoite|pickup|SYNTH-LOOSE-HOTEL/);
});
for(const report of [null,undefined,''])test(`real ASB missing APZ ${String(report)} does not become midnight`,async()=>{
  const f=realRuntime();const roster=sourceRoster([sourceDay({date:'05/10/2099',dayNumber:5,type:'ASB',pairingCode:'ASB',dutyReport:report,dutyDebrief:'06:00',legs:[]})]);
  const actual=await f.run(roster);assert.equal(f.routes(),0);assert.match(actual,/apresentação.*não está confirmada/);assert.doesNotMatch(actual,/00:00|23:05|Saída recomendada/);
  const record=f.programs(roster)[0];const nextText=realSummary({record,label:'A próxima programação',includeGreeting:false});assert.match(nextText,/apresentação não confirmada/);assert.doesNotMatch(nextText,/00:00/);
});
for(const status of ['Cancelled','Planned'])test(`real next and departure preserve reservation situation ${status}`,async()=>{
  const f=realRuntime();const roster=sourceRoster([sourceDay({status})]);const record=f.programs(roster)[0];const nextText=realSummary({record,label:'A próxima programação',includeGreeting:false});
  if(status==='Cancelled'){assert.match(nextText,/cancelad/);assert.doesNotMatch(nextText,/Próxima programação: 1 voo|APZ:/);assert.match(await f.run(roster),/cancelad/);assert.equal(f.routes(),0);}
  else {assert.match(nextText,/Planejada; não é confirmação operacional/);}
});
test('real flight with missing published APZ cannot promote departure fallback',async()=>{
  const f=realRuntime(),roster=sourceRoster([sourceDay({dutyReport:null})]);const record=f.programs(roster)[0];assert.equal(record.display.presentationConfirmed,false);
  assert.match(await f.run(roster),/apresentação.*não está confirmada/);assert.equal(f.routes(),0);
  assert.match(realSummary({record,label:'A próxima programação',includeGreeting:false}),/APZ: horário e data.*não confirmados/);
});


test('explicit published midnight remains valid rather than being treated as missing',async()=>{
 const f=realRuntime('2099-10-04T20:00:00Z');const roster=sourceRoster([sourceDay({date:'05/10/2099',dayNumber:5,type:'ASB',pairingCode:'ASB',dutyReport:'00:00',dutyDebrief:'06:00',legs:[]})]);
 const result=await f.run(roster);assert.equal(f.routes(),1);assert.match(result,/23:05/);assert.match(result,/amanhã, 05\/10\/2099 às 00:00/);
});
test('leg cancellation is not hidden by a Planned day',async()=>{
 const f=realRuntime(),raw=sourceDay({status:'Planned'});raw.legs[0].status='Cancelled';const roster=sourceRoster([raw]);const record=f.programs(roster)[0];assert.equal(record.display.cancelled,true);
 assert.match(realSummary({record,label:'A próxima programação',includeGreeting:false}),/cancelad/);assert.match(await f.run(roster),/cancelad/);assert.equal(f.routes(),0);
});

for(const [name,changes] of [
 ['report equals departure fallback',{dutyReport:'08:00',dutyReportSource:'published'}],
 ['estimated report',{dutyReportSource:'estimated'}],
 ['missing provenance',{dutyReportSource:undefined}],
 ['unknown provenance',{dutyReportSource:'unknown'}],
 ['estimated ASB',{type:'ASB',pairingCode:'ASB',legs:[],dutyReportSource:'estimated'}],
 ['ASB without provenance',{type:'ASB',pairingCode:'ASB',legs:[],dutyReportSource:undefined}],
])test(`real canonical publication proof rejects ${name}`,async()=>{
 const f=realRuntime(),roster=sourceRoster([sourceDay(changes)]);const record=f.programs(roster)[0];
 assert.equal(record.display.presentationConfirmed,false);assert.equal(record.display.publishedStart,null);
 const departure=await f.run(roster);assert.equal(f.routes(),0);assert.match(departure,/apresentação.*não está confirmada/);assert.doesNotMatch(departure,/Saída recomendada|às 00:00|às 06:05|às 07:05/);
 const text=realSummary({record,label:'A próxima programação',includeGreeting:false});assert.match(text,/apresentação não confirmada|APZ: horário e data.*não confirmados/);assert.doesNotMatch(text,/APZ:.*às 0[78]:00/);
});
test('literal leg APZ equal to departure is not publication proof',async()=>{
 const f=realRuntime(),raw=sourceDay({dutyReport:null});raw.legs[0].presentationTime='08:00';const roster=sourceRoster([raw]);assert.equal(f.programs(roster)[0].display.presentationConfirmed,false);assert.match(await f.run(roster),/apresentação.*não está confirmada/);assert.equal(f.routes(),0);
});
for(const changes of [{dutyDebriefSource:'estimated'},{dutyDebriefSource:undefined},{type:'ASB',pairingCode:'ASB',legs:[],dutyDebriefSource:'estimated'}])test(`published APZ remains independent of incomplete end ${JSON.stringify(changes)}`,async()=>{
 const f=realRuntime(),roster=sourceRoster([sourceDay(changes)]),record=f.programs(roster)[0];
 assert.equal(record.display.presentationConfirmed,true);assert.equal(record.display.publishedStart,Date.parse('2099-10-04T10:00:00Z'));assert.equal(record.display.endConfirmed,false);
 const text=realSummary({record,label:'A próxima programação',includeGreeting:false});assert.match(text,/APZ: 04\/10\/2099 às 07:00/);assert.match(text,/Fim publicado.*não confirmado/);assert.match(await f.run(roster),/06:05/);assert.equal(f.routes(),1);
});
test('complete published endpoints remain available',async()=>{
 const f=realRuntime(),roster=sourceRoster([sourceDay()]),record=f.programs(roster)[0];assert.equal(record.display.presentationConfirmed,true);assert.equal(record.display.endConfirmed,true);
 const text=realSummary({record,label:'A próxima programação',includeGreeting:false});assert.match(text,/APZ: 04\/10\/2099 às 07:00/);assert.match(text,/Fim publicado: 04\/10\/2099 às 09:30/);assert.match(await f.run(roster),/06:05/);
});
test('ASB cancellation with whitespace blocks route',async()=>{
 const f=realRuntime(),roster=sourceRoster([sourceDay({type:'ASB',pairingCode:'ASB',legs:[],status:' Cancelled '})]);assert.match(await f.run(roster),/cancelad/);assert.equal(f.routes(),0);
 assert.match(realSummary({record:f.programs(roster)[0],label:'A próxima programação',includeGreeting:false}),/cancelad/);
});
test('Planned leg remains visible under a Confirmed day',()=>{
 const f=realRuntime(),raw=sourceDay({status:'Confirmed'});raw.legs[0].status=' Planned ';const record=f.programs(sourceRoster([raw]))[0];
 assert.equal(record.display.planned,true);assert(record.display.statuses.some(row=>row.level==='day'&&row.status==='confirmed'));assert(record.display.statuses.some(row=>row.level==='leg'&&row.status==='planned'));
 assert.match(realSummary({record,label:'A próxima programação',includeGreeting:false}),/Planejada; não é confirmação operacional/);
});


for(const [name,overrides,publishedDate,now] of [
 ['reserve bound to flight',{type:'ASB',pairingCode:'ASB',dutyReport:'03:00'},'04/10/2099','2099-10-04T04:00:00Z'],
 ['reserve at year turn',{type:'ASB',pairingCode:'ASB',dutyReport:'03:00',date:'01/01/2100',dayNumber:1,month:1,year:2100},'01/01/2100','2099-12-31T23:00:00Z'],
])test(`same proven APZ in Next and departure: ${name}`,async()=>{
 const f=realRuntime(now),roster=sourceRoster([sourceDay(overrides)]);if(overrides.year){roster.year=overrides.year;roster.month=overrides.month;}
 const before=JSON.stringify(roster),record=f.programs(roster)[0];
 assert.equal(record.startTime,'08:00','canonical classifier fallback stays unchanged');
 assert.equal(new Date(record.display.publishedStart-180*60_000).toISOString().slice(11,16),'03:00');
 const text=realSummary({record,label:'A próxima programação',includeGreeting:false,presentationTime:'08:00'});
 assert(text.includes(`APZ: ${publishedDate} às 03:00.`));assert.doesNotMatch(text,/APZ:.*às 08:00/);assert.match(text,/UTC−03/);
 const departure=await f.run(roster);assert(departure.includes(`${publishedDate} às 03:00`));assert.match(departure,/UTC−03/);assert.equal(f.routes(),1);
 assert.equal(JSON.stringify(roster),before,'source data unchanged');assert.equal(record.startTime,'08:00','renderer does not repair classifier');
});
