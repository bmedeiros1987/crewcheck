import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadClientModules } from './lib/ts-module-harness.mjs';
const modules = loadClientModules({files:['client/src/lib/financialIntervalEvidence.ts','client/src/lib/compensationPolicy.ts','client/src/lib/financialJourneyGrouping.ts','client/src/lib/financialForecastPeriods.ts','client/src/lib/financialAmounts.ts','client/src/lib/financialStatementLearning.ts'],stubs:{authClient:'exports.getStoredUser=()=>({id:"synthetic-owner",role:"crew"});exports.getToken=()=>"synthetic-token";'}});
try {
 const policy=modules.load('compensationPolicy'), learning=modules.load('financialStatementLearning');
 const document='DEMONSTRATIVO DE DIARIAS\nDe 2032-10-01 até 2032-10-07\nCAFE R$ 25,00\nTAXI R$ 31,50\nTotal depositado R$ 56,50';
 const learned=learning.learnPerDiemStatement(document,'synthetic-taxi.txt');
 assert.equal(learned.rates.find(x=>x.key==='per_diem.taxi')?.value,31.5);
 assert.equal(learned.rates.find(x=>x.key==='per_diem.taxi')?.unit,'amount');
 assert.equal(learned.rates.find(x=>x.key==='per_diem.breakfast')?.value,25);
 assert.equal(learned.rates.every(x=>!x.confirmed),true);
 assert.equal(learning.learnPerDiemStatement(document.replace('Total depositado','TAXI R$ 40,00\nTotal depositado'),'synthetic-conflict.txt').rates.some(x=>x.key==='per_diem.taxi'),false);
 const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};globalThis.window={dispatchEvent:()=>{}};
 const rate=learned.rates.find(x=>x.key==='per_diem.taxi');
 assert.equal(learning.confirmedRateValueAt('per_diem.taxi','2032-10-05'),null);
 assert.equal(learning.saveConfirmedFinancialRates([{...rate,confirmed:true}]),true);
 assert.equal(learning.confirmedRateValueAt('per_diem.taxi','2032-10-05'),31.5);
 assert.equal(learning.confirmedRateValueAt('per_diem.taxi','2032-10-08'),null);
 const home=fs.readFileSync('client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',home,99,true,ts.ScriptKind.TSX);
 const names=['eventStartDateTime','eventEndDateTime','calculatePerDiem'];
 const fns=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text));assert.equal(fns.length,3);
 let taxiRate=31.5;
 const context=vm.createContext({...policy,...modules.load('financialIntervalEvidence'),...modules.load('financialJourneyGrouping'),...modules.load('financialForecastPeriods'),...modules.load('financialAmounts'),
 perDiemConfig:()=>({taxiRate,rates:{domestic:{mainMeal:100,currency:'BRL',label:'SYNTHETIC'}},domesticBreakfast:25,domesticMainMealSource:'synthetic',domesticBreakfastSource:'synthetic',breakfastPercent:.25,exchangeRates:{BRL:1},source:'SYNTHETIC',act:{version:'synthetic'}}),
 loadAirportPerDiemOverrides:()=>({}),resolvePerDiemRule:origin=>({rateKey:'domestic',airport:origin,reason:'synthetic'}),isOperationalEvent:()=>true,financialEventCode:e=>e.day.type,readOptionalNumberSetting:()=>null,dateChip:d=>d.toISOString().slice(0,10),moneyCurrency:(v,c)=>`${c} ${v}`});
 vm.runInContext(ts.transpileModule(fns.map(n=>n.getText(ast)).join('\n')+'\nglobalThis.calculate=calculatePerDiem;',{compilerOptions:{target:99}}).outputText,context);
 const at=(clock,iso='2032-10-05')=>`${iso}T${clock}:00-03:00`;
 const flight=(report='04:00',origin='BSB',destination='GRU',departure='06:00',arrival='08:00',iso='2032-10-05')=>({id:'SYN-FLIGHT',kind:'flight',origin,destination,day:{type:'VOO',dutyReport:report,dutyReportSource:'published'},canonical:{journeyId:'SYN-JOURNEY',startDateTime:at(departure,iso),endDateTime:at(arrival,iso),leg:{departureTime:departure,arrivalTime:arrival}}});
 const roster={year:2032,month:10,base:'BSB'};
 const run=events=>context.calculate(events,roster,new Date(at('12:00')));
 const taxis=result=>Array.from(result.rows).filter(x=>x.label==='Táxi');
 for(const [clock,count] of [['00:00',1],['05:45',1],['05:46',0]]) assert.equal(taxis(run([flight(clock,'BSB','GRU',clock==='00:00'?'01:00':'06:00')])).length,count,clock);
 assert.equal(taxis(run([flight('23:59','BSB','GRU','00:30','02:00','2032-10-06')])).length,0,'APZ previous day23:59');
 const overnight=taxis(run([flight('00:00','BSB','GRU','01:00','03:00','2032-10-06')]));assert.equal(overnight[0].iso,'2032-10-06');
 assert.equal(taxis(run([flight('04:00','JPA')])).length,0,'outside base');
 assert.equal(taxis(run([flight('')])).length,0,'absent APZ');
 const estimated=flight();estimated.day.dutyReportSource='estimated';assert.equal(taxis(run([estimated])).length,0,'estimated APZ');
 const extra=flight();extra.day.type='EXTRA';extra.workType='extra';assert.equal(taxis(run([extra]))[0].value,31.5,'extra no multiplier');
 const duplicate=flight();assert.equal(taxis(run([duplicate,{...duplicate,id:'SYN-DUP'}])).length,1);
 const reserve={id:'SYN-ASB',kind:'duty',origin:'BSB',destination:'BSB',day:{type:'ASB',dutyReport:'04:00',dutyDebrief:'10:00',dutyReportSource:'published',dutyDebriefSource:'published'},canonical:{startDateTime:at('04:00'),endDateTime:at('10:00')}};
 assert.equal(taxis(run([reserve,flight()])).length,1,'ASB plus activation same day');
 assert.equal(taxis(run([{...reserve,day:{...reserve.day,type:'HSB'}}])).length,0,'HSB no presence');
 assert.equal(taxis(run([{...reserve,origin:'JPA',destination:'JPA'}])).length,0,'reserve outside base');
 const arrival=run([flight('02:00','JPA','BSB','03:00','05:45')]);assert.equal(taxis(arrival).length,0);assert.equal(arrival.unclassifiedItems.some(x=>x.reason?.includes('critério de APZ/liberação')),true,'arrival remains explicit pending');
 assert.equal(run([flight('02:00','JPA','BSB','03:00','05:46')]).unclassifiedItems.some(x=>x.reason?.includes('Táxi na chegada')),false);
 assert.equal(run([flight('02:00','JPA','BSB','03:00','23:59')]).unclassifiedItems.some(x=>x.reason?.includes('Táxi na chegada')),false);
 const incoming=flight('00:00','JPA','BSB','01:00','02:00');incoming.canonical.journeyId='SYN-IN';
 const outgoing=flight();outgoing.canonical.journeyId='SYN-OUT';
 for(const events of [[incoming,outgoing],[outgoing,incoming]]) { const result=run(events);assert.equal(taxis(result).length,1,'arrival pending cannot suppress proven departure');assert.equal(result.unclassifiedItems.some(x=>x.reason?.includes('Táxi na chegada')),false); }
 const equalValues=learning.learnPerDiemStatement(document.replace('31,50','25,00').replace('56,50','50,00'),'synthetic-equal.txt');assert.equal(equalValues.rates.length,2,'equal-valued taxi and cafe remain distinct');
 const normal=run([flight()]);assert.equal(taxis(normal)[0].value,31.5);assert.equal(normal.rows.find(x=>x.label==='Café')?.value,25);assert.match(taxis(normal)[0].source,/previsão não comprova pagamento/);
 taxiRate=null;const pending=run([flight()]);assert.equal(taxis(pending).length,0);assert.equal(pending.unclassifiedItems.some(x=>x.reason?.includes('Tarifa de táxi')),true);assert.equal(pending.monthly,null,'missing taxi prevents complete total');
 console.log('PASS taxi ingestion/confirmation/period and actual Home APZ caller: boundaries, base, missing/estimated APZ, overnight, reserve/extra/dedup, independent coffee, arrival/value pending. TZ='+process.env.TZ);
}finally{modules.cleanup();}
