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
 for(const arrivalTime of ['00:00','05:45','05:46','23:59']) { const result=run([flight('23:00','JPA','BSB','23:30',arrivalTime)]);assert.equal(taxis(result).length,0,'arrival never qualifies');assert.equal(result.unclassifiedItems.some(x=>x.reason?.includes('Táxi')),false,'arrival never creates taxi pending'); }
 const coffeeArrival=run([flight('02:00','JPA','BSB','03:00','05:45')]);assert.equal(taxis(coffeeArrival).length,0);assert.equal(coffeeArrival.unclassifiedItems.some(x=>x.reason?.includes('Táxi')),false);assert.equal(coffeeArrival.rows.find(x=>x.label==='Café')?.value,25,'base arrival preserves verified breakfast criterion, never taxi');
 const incoming=flight('00:00','JPA','BSB','01:00','02:00');incoming.canonical.journeyId='SYN-IN';
 const outgoing=flight();outgoing.canonical.journeyId='SYN-OUT';
 for(const events of [[incoming,outgoing],[outgoing,incoming]]) { const result=run(events);assert.equal(taxis(result).length,1,'arrival ignored; proven APZ remains eligible');assert.equal(result.unclassifiedItems.some(x=>x.reason?.includes('Táxi')),false);assert.equal(typeof result.monthly,'number');assert.equal(typeof result.weekly,'number'); }
 const nextDay=flight('04:00','BSB','GRU','06:00','08:00','2032-10-06');nextDay.id='SYN-NEXT-DAY';nextDay.canonical.journeyId='SYN-NEXT-DAY';for(const events of [[outgoing,nextDay],[nextDay,outgoing]]) assert.equal(taxis(run(events)).length,2,'daily cap resets on next BRT day');
 const otherDeparture=flight('05:00');otherDeparture.id='SYN-INDEPENDENT';otherDeparture.canonical.journeyId='SYN-INDEPENDENT';
 for(const events of [[outgoing,otherDeparture],[otherDeparture,outgoing]]) { const result=run(events);assert.equal(taxis(result).length,1);assert.equal(taxis(result)[0].eventId,'SYN-FLIGHT','earliest known occurrence deterministic');assert.equal(result.unclassifiedItems.some(x=>x.reason?.includes('Táxi')),false,'daily ceiling needs no pending for second APZ');assert.equal(typeof result.monthly,'number');assert.equal(typeof result.weekly,'number'); }
 for(const events of [[reserve,flight()],[flight(),reserve],[reserve,{...reserve},flight()]]) { const result=run(events);assert.equal(taxis(result).length,1);assert.equal(taxis(result)[0].eventId,'SYN-ASB');assert.equal(result.unclassifiedItems.some(x=>x.reason?.includes('saída independente adicional')),false,'reserve activation is same commute'); }
 const shortReserve={...reserve,day:{...reserve.day,dutyDebrief:'05:00'},canonical:{startDateTime:at('04:00'),endDateTime:at('05:00')}};const activatedAfterReport=flight('04:45','BSB','GRU','05:45','08:00');
 for(const events of [[shortReserve,activatedAfterReport],[activatedAfterReport,shortReserve]]) { const result=run(events);assert.equal(taxis(result).length,1);assert.equal(taxis(result)[0].eventId,'SYN-ASB');assert.equal(result.unclassifiedItems.some(x=>x.reason?.includes('saída independente adicional')),false,'activation APZ inside reserve despite departure after reserve end'); }
 const lateReserve={...reserve,canonical:{startDateTime:at('23:59','2032-10-04'),endDateTime:at('06:00')},day:{...reserve.day,dutyReport:'23:59',dutyDebrief:'06:00'}};assert.equal(taxis(run([lateReserve,flight()])).length,0,'midnight activation after out-of-window reserve is not a new commute');
 const lateShortReserve={...lateReserve,canonical:{...lateReserve.canonical,endDateTime:at('05:00')},day:{...lateReserve.day,dutyDebrief:'05:00'}};for(const events of [[lateShortReserve,flight()],[flight(),lateShortReserve]]) assert.equal(taxis(run(events)).length,0,'APZ in late reserve remains same commute even when flight departure follows reserve end');
 const equalValues=learning.learnPerDiemStatement(document.replace('31,50','25,00').replace('56,50','50,00'),'synthetic-equal.txt');assert.equal(equalValues.rates.length,2,'equal-valued taxi and cafe remain distinct');
 const normal=run([flight()]);assert.equal(taxis(normal)[0].value,31.5);assert.equal(normal.rows.find(x=>x.label==='Café')?.value,25);assert.match(taxis(normal)[0].source,/previsão não comprova pagamento/);
 taxiRate=null;const pending=run([flight()]);assert.equal(taxis(pending).length,0);assert.equal(pending.unclassifiedItems.some(x=>x.reason?.includes('Tarifa de táxi')),true);assert.equal(pending.monthly,null,'missing taxi prevents complete total');
 console.log('PASS taxi ingestion/confirmation/period and actual Home APZ caller: boundaries, base, missing/estimated APZ, overnight, reserve/extra/dedup, independent coffee, APZ only/one per BRT day, missing-value pending. TZ='+process.env.TZ);
}finally{modules.cleanup();}
