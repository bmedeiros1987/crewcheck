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
function realRuntime(now='2099-10-04T09:00:00Z',{routeMode='short',fresh=true}={}) {
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
    conciergeLocationContextV14335:()=>({fresh,message:'Localização sintética pendente.',location:{source:'synthetic'}}),conciergeLocationLineV14335:()=> 'Referência sintética compartilhada.',
    conciergeTravelEstimate:async()=>{routes++;if(routeMode==='throw')throw Error('SYNTH-ROUTE-UNAVAILABLE');if(routeMode==='null')return null;return{minutes:30,distanceKm:routeMode==='long'?300:10,durationText:'30 min',distanceText:routeMode==='long'?'300 km':'10 km',trafficAware:false};},
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


for(const [date,year,month,day,at] of [
 ['04/10/2099',2099,10,4,'2099-10-04T04:00:00Z'],
 ['01/01/2100',2100,1,1,'2099-12-31T23:00:00Z'],
])for(const mode of ['null','throw','long','stale-location','past-APZ','outside-base'])test(`every APZ return uses published instant: ${mode} ${date}`,async()=>{
 const now=mode==='past-APZ'?`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T07:00:00Z`:at;
 const f=realRuntime(now,{routeMode:mode,fresh:mode!=='stale-location'}),raw=sourceDay({date,year,month,dayNumber:day,type:'ASB',pairingCode:'ASB',dutyReport:'03:00'});
 if(mode==='outside-base')raw.legs[0].origin='CCC';
 const roster={...sourceRoster([raw]),year,month};const before=JSON.stringify(roster),record=f.programs(roster)[0];assert.equal(record.startTime,'08:00');
 const text=await f.run(roster);assert(text.includes(`${date} às 03:00`),text);assert.match(text,/UTC−03/);assert.doesNotMatch(text,/(?:Apresentação|apresentação|APZ)[^\n]*08:00/);
 assert.equal(f.routes(),['stale-location','past-APZ','outside-base'].includes(mode)?0:1);assert.equal(JSON.stringify(roster),before);
 if(['null','throw'].includes(mode))assert.match(text,/Não consegui calcular a rota/);
 if(mode==='long')assert.match(text,/posicionamento aéreo/);
});


for(const [date,year,month,day] of [['04/10/2099',2099,10,4],['01/01/2100',2100,1,1]])test(`selected second ASB block keeps its own published APZ ${date}`,async()=>{
 const f=realRuntime(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T15:00:00Z`);
 const raw=sourceDay({date,year,month,dayNumber:day,type:'ASB',pairingCode:'ASB',dutyReport:'03:00',dutyDebrief:'17:30',legs:[
  {flightNumber:'LA0012',origin:'AAA',destination:'BBB',departureTime:'08:00',arrivalTime:'09:00',workType:'OP'},
  {flightNumber:'LA0013',origin:'BBB',destination:'AAA',departureTime:'16:00',arrivalTime:'17:00',presentationTime:'15:00',workType:'OP'},
 ]});
 const roster={...sourceRoster([raw]),year,month,base:'BBB'};const before=JSON.stringify(roster),programs=f.programs(roster);assert.equal(programs.length,2);
 assert.notEqual(programs[0].journeyId,programs[1].journeyId);assert.equal(programs[0].display.publishedStart,Date.parse(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T06:00:00Z`),'first bound reserve still starts03:00');
 const second=programs[1];assert.equal(second.startTime,'15:00');assert.equal(second.display.publishedStart,Date.parse(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T18:00:00Z`));
 const text=realSummary({record:second,label:'A próxima programação',includeGreeting:false});assert(text.includes(`APZ: ${date} às 15:00.`));assert.match(text,/UTC−03/);assert.doesNotMatch(text,/APZ:.*03:00/);
 const departure=await f.run(roster);assert(departure.includes(`${date} às 15:00`));assert.match(departure,/14:05/);assert.doesNotMatch(departure,/já passou|às 03:00/);assert.equal(f.routes(),1);assert.equal(JSON.stringify(roster),before);
});

for(const order of ['full-first','partial-first'])test(`ASB partial duplicate ownership is order independent: ${order}`,async()=>{
 const first={flightNumber:'QA-OWNER-1',origin:'AAA',destination:'BBB',departureTime:'08:00',arrivalTime:'09:00',workType:'OP'};
 const second={flightNumber:'QA-OWNER-2',origin:'BBB',destination:'AAA',departureTime:'16:00',arrivalTime:'17:00',presentationTime:'15:00',workType:'OP'};
 const full=sourceDay({type:'ASB',pairingCode:'ASB',dutyReport:'03:00',dutyDebrief:'17:30',legs:[first,second]}),partial={...full,legs:[second]};
 const roster={...sourceRoster(order==='full-first'?[full,partial]:[partial,full]),base:'BBB'},before=JSON.stringify(roster),f=realRuntime('2099-10-04T15:00:00Z');
 const next=f.programs(roster).filter(p=>p.legs.some(l=>l.flightNumber==='QA-OWNER-2'));assert(next.length);
 for(const p of next)assert.equal(p.display.publishedStart,Date.parse('2099-10-04T18:00:00Z'),'03:00 cannot attach through a partial duplicate');
 const text=await f.run(roster);assert.match(text,/04\/10\/2099 às 15:00/);assert.match(text,/14:05/);assert.doesNotMatch(text,/já passou|às 03:00/);assert.equal(f.routes(),1);assert.equal(JSON.stringify(roster),before);
});
for(const explicit of [true,false])test(`ASB physical filtering cannot transfer reserve ownership: explicit=${explicit}`,async()=>{
 const raw=sourceDay({type:'ASB',pairingCode:'ASB',dutyReport:'03:00',dutyDebrief:'19:30',legs:[
  {flightNumber:'QA-DROPPED',origin:'AAA',destination:'BBB',departureTime:'08:00',arrivalTime:'09:00',workType:'OP'},
  {flightNumber:'QA-REINDEXED',origin:'CCC',destination:'DDD',departureTime:'16:00',arrivalTime:'17:00',...(explicit?{presentationTime:'15:00'}:{}),workType:'OP'},
  {flightNumber:'QA-CONTINUATION',origin:'DDD',destination:'CCC',departureTime:'18:00',arrivalTime:'19:00',workType:'OP'},
 ]});
 const roster={...sourceRoster([raw]),base:'CCC'},before=JSON.stringify(roster),f=realRuntime('2099-10-04T15:00:00Z'),programs=f.programs(roster);
 assert.equal(programs.length,1);assert.equal(programs[0].legs[0].flightNumber,'QA-REINDEXED');assert.equal(programs[0].display.publishedStart,explicit?Date.parse('2099-10-04T18:00:00Z'):null);
 const text=await f.run(roster);assert.doesNotMatch(text,/às 03:00/);assert.equal(f.routes(),explicit?1:0);if(explicit){assert.match(text,/04\/10\/2099 às 15:00/);assert.match(text,/14:05/);assert.doesNotMatch(text,/já passou/);}assert.equal(JSON.stringify(roster),before);
});

for(const source of ['estimated','unknown',undefined])test(`literal leg APZ cannot publish reserve03 from ${source}`,async()=>{
 const raw=sourceDay({type:'ASB',pairingCode:'ASB',dutyReport:'03:00',dutyReportSource:source,legs:[{flightNumber:'QA-OWN-APZ',origin:'AAA',destination:'BBB',departureTime:'08:00',arrivalTime:'09:00',presentationTime:'07:00',workType:'OP'}]});
 const roster=sourceRoster([raw]),before=JSON.stringify(roster),f=realRuntime('2099-10-04T09:00:00Z'),record=f.programs(roster)[0];
 assert.equal(record.display.publishedStart,Date.parse('2099-10-04T10:00:00Z'));const text=await f.run(roster);assert.match(text,/04\/10\/2099 às 07:00/);assert.doesNotMatch(text,/às 03:00/);assert.equal(f.routes(),1);assert.equal(JSON.stringify(roster),before);
});
for(const source of ['estimated','unknown',undefined])for(const reverse of [false,true])test(`duplicate reserve provenance stays pending: ${source} reverse=${reverse}`,async()=>{
 const full=sourceDay({type:'ASB',pairingCode:'ASB',dutyReport:'03:00'}),uncertain={...full,dutyReportSource:source};
 const roster=sourceRoster(reverse?[uncertain,full]:[full,uncertain]),before=JSON.stringify(roster),f=realRuntime('2099-10-04T04:00:00Z'),programs=f.programs(roster);
 assert(programs.length);for(const p of programs)assert.equal(p.display.publishedStart,null,'a published duplicate cannot erase unknown provenance');const text=await f.run(roster);assert.doesNotMatch(text,/às 03:00/);assert.equal(f.routes(),0);assert.equal(JSON.stringify(roster),before);
});

for(const reverse of [false,true])test(`equivalent clock spellings reconcile reserve ownership reverse=${reverse}`,async()=>{
 const early={flightNumber:'QA-EARLY',origin:'CCC',destination:'BBB',departureTime:'04:00',arrivalTime:'05:00',workType:'OP'},own={flightNumber:'QA-CLOCK',origin:'BBB',destination:'AAA',departureTime:'08:00',arrivalTime:'09:00',presentationTime:'07:00',workType:'OP'};
 const full=sourceDay({type:'ASB',pairingCode:'ASB',dutyReport:'00:00',legs:[early,own]}),partial={...full,legs:[{...own,departureTime:'8:00',arrivalTime:'9:00'}]};
 const roster={...sourceRoster(reverse?[partial,full]:[full,partial]),base:'BBB'},before=JSON.stringify(roster),f=realRuntime('2099-10-04T09:00:00Z');
 for(const p of f.programs(roster).filter(p=>p.legs.some(l=>l.flightNumber==='QA-CLOCK')))assert.equal(p.display.publishedStart,Date.parse('2099-10-04T10:00:00Z'));
 const text=await f.run(roster);assert.match(text,/04\/10\/2099 às 07:00/);assert.doesNotMatch(text,/já passou|às 00:00/);assert.equal(f.routes(),1);assert.equal(JSON.stringify(roster),before);
});
for(const kind of ['estimated','earlier-block'])test(`nested original evidence cannot publish another reserve: ${kind}`,async()=>{
 const own={flightNumber:'QA-NESTED',origin:'AAA',destination:'BBB',departureTime:kind==='estimated'?'08:00':'16:00',arrivalTime:kind==='estimated'?'09:00':'17:00',presentationTime:kind==='estimated'?'07:00':'15:00',workType:'OP'};
 const raw=sourceDay({type:'ASB',pairingCode:'ASB',dutyReport:'03:00',dutyDebrief:kind==='estimated'?'09:30':'17:30',legs:[own]});
 const clocks=legs=>legs.map(({departureTime,arrivalTime,presentationTime})=>({departureTime,arrivalTime,presentationTime}));
 const original={dutyReport:raw.dutyReport,dutyDebrief:raw.dutyDebrief,dutyReportSource:'published',dutyDebriefSource:'published',legs:clocks(raw.legs)};
 const nested=kind==='estimated'?{...original,dutyReportSource:'estimated'}:{...original,legs:clocks([{departureTime:'08:00',arrivalTime:'09:00'},own])};
 raw.publishedClockEvidence={...original,records:[{...original,records:[nested]}]};
 const roster=sourceRoster([raw]),before=JSON.stringify(roster),f=realRuntime(kind==='estimated'?'2099-10-04T09:00:00Z':'2099-10-04T15:00:00Z'),record=f.programs(roster)[0];
 assert.equal(record.display.publishedStart,Date.parse(kind==='estimated'?'2099-10-04T10:00:00Z':'2099-10-04T18:00:00Z'));const text=await f.run(roster);assert.match(text,kind==='estimated'?/04\/10\/2099 às 07:00/:/04\/10\/2099 às 15:00/);assert.doesNotMatch(text,/já passou|às 03:00/);assert.equal(f.routes(),1);assert.equal(JSON.stringify(roster),before);
});

for(const kind of ['estimated-container','earlier-container'])for(const order of ['alone','plain-first','preserved-first'])test(`preserved container survives normalization merge: ${kind} ${order}`,async()=>{
 const own={flightNumber:'QA-MERGED',origin:'AAA',destination:'BBB',departureTime:'08:00',arrivalTime:'09:00',presentationTime:'07:00',workType:'OP'};
 const plain=sourceDay({type:'ASB',pairingCode:'ASB',dutyReport:'03:00',legs:[own]});
 const leaf={dutyReport:'03:00',dutyDebrief:'09:30',dutyReportSource:'published',dutyDebriefSource:'published',legs:[{departureTime:'08:00',arrivalTime:'09:00',presentationTime:'07:00'}]};
 const container=kind==='estimated-container'?{...leaf,dutyReportSource:'estimated',records:[leaf]}:{...leaf,legs:[{departureTime:'04:00',arrivalTime:'05:00'},...leaf.legs],records:[leaf]};
 const preserved={...plain,publishedClockEvidence:container},days=order==='alone'?[preserved]:order==='plain-first'?[plain,preserved]:[preserved,plain],roster=sourceRoster(days),before=JSON.stringify(roster),f=realRuntime('2099-10-04T09:00:00Z');
 const records=f.programs(roster);assert.equal(records.length,1);assert.equal(records[0].display.publishedStart,Date.parse('2099-10-04T10:00:00Z'));const summary=realSummary({record:records[0],label:'A próxima programação',includeGreeting:false});assert.match(summary,/APZ: 04\/10\/2099 às 07:00/);
 const text=await f.run(roster);assert.match(text,/04\/10\/2099 às 07:00/);assert.doesNotMatch(text,/já passou|às 03:00/);assert.equal(f.routes(),1);assert.equal(JSON.stringify(roster),before);
});
