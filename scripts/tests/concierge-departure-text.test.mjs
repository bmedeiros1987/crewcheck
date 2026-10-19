import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
const snippet=fs.readFileSync('scripts/v14335/departure-reply.snippet','utf8');
const prepared=process.argv.includes('--materialized') || fs.readFileSync('server.mjs','utf8').includes('const civilKey = date =>');
const source=prepared?fs.readFileSync('server.mjs','utf8'):snippet;
const body=source.match(/async function conciergeDepartureReply\([\s\S]*?\n}/)?.[0];assert(body);
function fixture({now='2099-10-04T09:00:00Z',origin='AAA',base='AAA',start='2099-10-04T10:00:00Z',end='2099-10-04T16:00:00Z',stay=null,status=null,records=true,days=true,code='VOO',following=false}={}) {
 let routes=0;
 const record={start:new Date(start),end:new Date(end),startTime:'07:00',endTime:'13:00',code,day:{base:origin,status},legs:code==='VOO'?[{origin,destination:'BBB'}]:[]};
 const roster={base,days:days?[{}]:[]};
 class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return new Date(now).getTime();}}
 const context=vm.createContext({Date:Clock,conciergeJourneyProgramRecords:()=>records?[record,...(following?[{...record,start:new Date('2099-10-05T10:00:00Z'),end:new Date('2099-10-05T16:00:00Z')}]:[])]:[],conciergeProgramRecords:()=>[],conciergeCurrentStay:()=>stay,
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
 ['stay',{stay:{hotel:'SYNTH-UNBOUND'}},/pernoite.*não confirma sua posição física/],
 ['missing base',{base:''},/Base ou origem.*não confirmada/],
 ['cancelled',{status:'Cancelled'},/consta cancelada/],
 ['home standby',{code:'HSB'},/Sobreaviso em casa/],
 ['no roster',{days:false},/Não há escala disponível/],
 ['incomplete coverage',{records:false},/período disponível.*cobertura dos próximos dias não está confirmada/],
 ['after duty',{now:'2099-10-04T17:00:00Z'},/período disponível/],
])test(name,async()=>{const f=fixture(options);const result=await f.run();assert.match(result,expected);assert.equal(f.routes(),0);assert.doesNotMatch(result,/SYNTH-UNBOUND|wa\.me|Você está no hotel|Saia de casa às/);});

test('past leave with future APZ keeps today even with tomorrow available',async()=>{const f=fixture({now:'2099-10-04T09:30:00Z',following:true});const result=await f.run();assert.match(result,/saída recomendada já passou/);assert.match(result,/04\/10\/2099 às 07:00/);assert.doesNotMatch(result,/amanhã|05\/10/);});
