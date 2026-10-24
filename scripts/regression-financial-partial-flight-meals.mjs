import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {build} from 'vite';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadClientModules} from './lib/ts-module-harness.mjs';

// Invented dates, airports and prices. Exercise real caller/evidence/window
// functions, never a personal roster, statement or company tariff fixture.
const modules=loadClientModules({files:['client/src/lib/financialAmounts.ts','client/src/lib/financialStatementLearning.ts','client/src/lib/financialJourneyGrouping.ts','client/src/lib/financialIntervalEvidence.ts','client/src/lib/compensationPolicy.ts','client/src/lib/financialForecastPeriods.ts'],prefix:'synthetic-partial-meals-'});
try {
  const source=process.env.FINANCIAL_BASELINE_SHA?execFileSync('git',['show',process.env.FINANCIAL_BASELINE_SHA+':client/src/pages/Home.tsx'],{encoding:'utf8'}):fs.readFileSync('client/src/pages/Home.tsx','utf8');
  const ast=ts.createSourceFile('Home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const names=['perDiemConfig','calculatePerDiem','moneyBRL','moneyCurrency'];
  const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text));assert.equal(functions.length,names.length);
  const learned=[],consulted=[];
  const rates=modules.load('financialStatementLearning');
  const context=vm.createContext({
    ...modules.load('financialAmounts'),...modules.load('financialJourneyGrouping'),...modules.load('financialIntervalEvidence'),...modules.load('compensationPolicy'),...modules.load('financialForecastPeriods'),
    resolveActFinancialRules:()=>({profileLabel:'Synthetic reference',legalReference:'synthetic-only',version:'synthetic-v1',breakfastPercent:.25,perDiem:[{key:'domestic',label:'Synthetic domestic',currency:'BRL',mainMeal:100},{key:'foreign',label:'Synthetic foreign',currency:'USD',mainMeal:65}]}),
    confirmedPerDiemReferencesAt:date=>{
      const at=key=>{consulted.push({key,date});return rates.rateAt(learned,key,date,'BRL');};
      return {state:'ready',mainMeal:at('per_diem.lunch')??at('per_diem.dinner')??at('per_diem.supper'),breakfast:at('per_diem.breakfast')?.value??null,taxi:at('per_diem.taxi')?.value??null};
    },
    confirmedRateAt:(key,date)=>{consulted.push({key,date});return rates.rateAt(learned,key,date,'BRL');},
    confirmedRateValueAt:(key,date)=>{consulted.push({key,date});return rates.rateAt(learned,key,date,'BRL')?.value??null;},
    readOptionalNumberSetting:()=>null,readNumberSetting:()=>0,loadAirportPerDiemOverrides:()=>({}),
    resolvePerDiemRule:(origin,destination)=>({rateKey:origin==='UNKNOWN'||destination==='UNKNOWN'?null:destination==='FOREIGN'?'foreign':'domestic',airport:destination,reason:'Synthetic geography'}),
    isOperationalEvent:()=>true,financialEventCode:event=>event.day.type,
    eventStartDateTime:event=>new Date(event.start),eventEndDateTime:event=>new Date(event.end),
    dateChip:date=>date.toISOString().slice(0,10),
  });
  vm.runInContext(ts.transpileModule(functions.map(n=>n.getText(ast)).join('\n')+'\nglobalThis.calculate=calculatePerDiem;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  const month='2032-08',iso=month+'-06',roster={year:2032,month:8,base:'TEST'};
  const at=clock=>iso+'T'+clock+':00-03:00';
  function flight({id='one',departure='09:10',arrival='11:20',report=departure,reportSource='estimated',destination='AWAY',index=0,legs,records}={}) {
    const published={dutyReport:report,dutyReportSource:reportSource,legs:legs||[{departureTime:departure,arrivalTime:arrival}],...(records?{records}: {})};
    return {id,kind:'flight',origin:'TEST',destination,start:at(departure),end:at(arrival),salaryClockKnown:true,
      day:{type:'VOO',dutyReport:report,publishedClockEvidence:published},canonical:{journeyId:'synthetic-journey',legIndex:index,leg:published.legs[index]}};
  }
  const reserve={id:'reserve',kind:'duty',origin:'TEST',destination:'TEST',start:at('06:20'),end:at('09:10'),day:{type:'ASB',dutyReport:'06:20',dutyDebrief:'09:10',dutyReportSource:'published',dutyDebriefSource:'published'}};
  const legs=[{departureTime:'09:10',arrivalTime:'11:20'},{departureTime:'11:55',arrivalTime:'14:10'}];
  const pair=[flight({legs}),flight({id:'two',departure:'11:55',arrival:'14:10',index:1,legs})];
  const run=events=>context.calculate(events,roster,new Date(iso+'T15:00:00Z'));
  const known=run([reserve,...pair]);
  assert.match(known.rows.find(row=>row.label==='Almoço').source,/referência ACT; tarifa empresarial da conta não confirmada neste período/,'reference pricing must disclose that an account tariff is unconfirmed');
  assert.equal(known.rows.filter(row=>row.label==='Almoço').length,1,'literal flights crossing lunch preserve one known meal despite unknown APZ');
  assert.equal(known.rows.find(row=>row.label==='Almoço').value,100);
  assert.equal(known.rows.filter(row=>row.label==='Café').length,1,'breakfast is from the separately proven reserve only');
  assert.equal(known.rows.filter(row=>row.label==='Táxi').length,0,'no unknown APZ commute is invented');
  assert(known.unclassifiedItems.some(row=>/Apresentação publicada ausente/.test(row.reason)),'whole-duty completeness stays pending');
  assert.match(known.rows.find(row=>row.label==='Almoço').source,/subtotal parcial/);
  assert.equal(run([...pair].reverse()).rows.filter(row=>row.label==='Almoço').length,1,'input order never duplicates the same meal');
  const literal=flight({report:'09:10',reportSource:'published',legs:[{presentationTime:'09:10',departureTime:'09:10',arrivalTime:'11:20'}]});
  assert.equal(run([literal]).unclassifiedItems.length,0,'an explicitly published presentation equal to departure is valid; equality alone cannot invalidate original evidence');
  assert.equal(run([literal]).rows.find(row=>row.label==='Almoço').value,100);
  for(const report of [null,'bad','09:10']) {
    const item=flight({report,reportSource:report?'estimated':'absent'});
    const result=run([item]);assert.equal(result.rows.length,1);assert.equal(result.rows[0].label,'Almoço');assert(result.unclassifiedItems.length);
  }
  for(const item of [flight({arrival:'bad'}),{...flight(),salaryClockKnown:false},flight({records:[{legs},{legs}]}),flight({destination:'UNKNOWN'})]) {
    const result=run([item]);assert.equal(result.rows.length,0,'missing clocks, unresolved versions or geography cannot create a known meal');assert(result.unclassifiedItems.length);
  }
  for(const [departure,arrival] of [['05:40','07:40'],['10:00','10:59'],['13:01','14:00']]) {
    assert.equal(run([flight({departure,arrival})]).rows.length,0,'no breakfast, taxi, preflight extension or outside-window meal');
  }
  assert.equal(run([flight({departure:'10:00',arrival:'11:00'})]).rows.filter(row=>row.label==='Almoço').length,1,'literal arrival at inclusive11:00 proves lunch');
  const touching={...reserve,end:at('11:00'),day:{...reserve.day,dutyDebrief:'11:00'}};
  assert.equal(run([touching]).rows.filter(row=>row.label==='Almoço').length,1,'published reserve ending exactly11:00 retains inclusive lunch');
  // A demonstrated price is adopted only with explicit, bounded reviewed input.
  for(const [key,value] of [['per_diem.lunch',175],['per_diem.breakfast',43.75]]) learned.push({key,value,currency:'BRL',confirmed:true,effectiveFrom:month+'-01',effectiveTo:month+'-31'});
  const reviewed=run([reserve,...pair]);assert.equal(reviewed.rows.find(row=>row.label==='Almoço').value,175);assert.equal(reviewed.rows.find(row=>row.label==='Café').value,43.75);
  const early=flight({id:'early-independent',departure:'05:00',arrival:'06:40',report:'04:10',reportSource:'published'});
  const missingTaxi=run([early]);
  assert.equal(missingTaxi.rows.filter(row=>row.label==='Táxi').length,0);
  assert(missingTaxi.unclassifiedItems.some(row=>/Tarifa de táxi confirmada para o período ausente/.test(row.reason)),'proved commute with absent tariff stays a specific pending item, never zero');
  assert.equal(missingTaxi.monthlyUnclassifiedItems.filter(row=>row.pendingKind==='taxi_rate').length,1,'eligible unpriced taxi has a display-only pending marker');
  learned.push({key:'per_diem.taxi',value:31.25,currency:'BRL',confirmed:true,effectiveFrom:iso,effectiveTo:iso});
  const pricedTaxi=run([early]);assert.equal(pricedTaxi.rows.find(row=>row.label==='Táxi').value,31.25,'taxi uses its own reviewed amount, never the breakfast percentage');
  assert.match(pricedTaxi.rows.find(row=>row.label==='Táxi').source,/previsão não comprova pagamento/);
  assert.equal(run([{...early,day:{...early.day,publishedClockEvidence:{...early.day.publishedClockEvidence,dutyReportSource:'estimated'}}}]).rows.filter(row=>row.label==='Táxi').length,0,'known taxi price cannot supply missing presentation evidence');
  learned.forEach(row=>row.effectiveTo=month+'-05');
  assert.equal(run([reserve,...pair]).rows.find(row=>row.label==='Almoço').value,100,'expired personal rate never extends into this date');
  assert(consulted.every(row=>row.date===iso),'all pricing consults actual occurrence date');
  const foreign=run([flight({destination:'FOREIGN'})]);
  const lunch=foreign.rows.find(row=>row.label==='Almoço');
  assert.equal(lunch.currency,'USD');assert.equal(lunch.value,65);
  assert.equal(lunch.expectedPaymentDate,iso,'literal flight date survives unrelated pending APZ');
  assert.equal(lunch.expectedPaymentTimezone,'America/Sao_Paulo');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-foreign-concierge-'));
  try {
    const entry=path.join(temp,'entry.ts');fs.writeFileSync(entry,['nextFinancialPayment','financialLocalUpcoming'].map(name=>`export * from ${JSON.stringify(path.resolve('client/src/lib/'+name+'.ts'))};`).join('\n'));
    await build({configFile:false,logLevel:'silent',build:{lib:{entry,formats:['es'],fileName:()=> 'subject.mjs'},outDir:temp,emptyOutDir:false,minify:false}});
    const {nextAllowancePayment,localUpcomingAllowance}=await import(pathToFileURL(path.join(temp,'subject.mjs')));
    const now=new Date(iso+'T15:00:00Z');
    const payment=nextAllowancePayment(foreign.rows,foreign.unclassifiedItems,[month],now,[iso]);
    const upcoming=localUpcomingAllowance(payment,now);
    assert(upcoming.events.some(event=>event.currency==='USD'&&event.amountMinor===6500&&event.expectedPaymentDate===iso&&event.expectedPaymentTimezone==='America/Sao_Paulo'),'real Concierge projection preserves proved foreign flight payment date');
    const nextIso=month+'-07';
    const overnightEvent={...flight({id:'synthetic-overnight',departure:'23:10',arrival:'01:20',destination:'FOREIGN'}),end:nextIso+'T01:20:00-03:00'};
    const overnight=run([overnightEvent]);
    const supper=overnight.rows.find(row=>row.label==='Ceia');
    assert(supper,'literal overnight flight preserves next-day supper');
    assert.equal(supper.iso,nextIso);assert.equal(supper.expectedPaymentDate,iso);
    assert(overnight.unclassifiedItems.some(item=>item.iso===iso),'pending duty is dated at flight start');
    const nightPayment=nextAllowancePayment(overnight.rows,overnight.unclassifiedItems,[month],now,[iso,nextIso]);
    const nightPreview=localUpcomingAllowance(nightPayment,now);
    assert.deepEqual(nightPreview.events.map(event=>[event.expectedPaymentDate,event.currency,event.amountMinor,event.partial]),[[iso,'USD',6500,true]],'overnight partiality follows the proved flight payment date, not next-day meal occurrence');
    // Same date, distinct journeys: domestic APZ cannot taint a complete foreign meal.
    const completeNight={...overnightEvent,day:{...overnightEvent.day,dutyReport:'22:30',publishedClockEvidence:{...overnightEvent.day.publishedClockEvidence,dutyReport:'22:30',dutyReportSource:'published'}},canonical:{...overnightEvent.canonical,journeyId:'independent-foreign'}};
    const domesticPending=flight({id:'domestic-pending'});
    const isolated=run([domesticPending,completeNight]);
    const isolatedPreview=localUpcomingAllowance(nextAllowancePayment(isolated.rows,isolated.unclassifiedItems,[month],now,[iso,nextIso]),now);
    assert.equal(isolatedPreview.events.find(item=>item.currency==='USD').partial,false,'independent domestic pending cannot taint published foreign journey');
    // One journey spans midnight; second leg retains the first leg's missing APZ.
    const spanningLegs=[{departureTime:'22:00',arrivalTime:'23:50'},{departureTime:'00:20',arrivalTime:'02:00'}];
    const first=flight({legs:spanningLegs,id:'journey-first',departure:'22:00',arrival:'23:50',destination:'FOREIGN'});
    const second={...flight({legs:spanningLegs,id:'journey-second',departure:'00:20',arrival:'02:00',destination:'FOREIGN',index:1}),start:nextIso+'T00:20:00-03:00',end:nextIso+'T02:00:00-03:00'};
    const spanning=run([first,second]);
    assert.equal(spanning.rows.find(item=>item.label==='Ceia').partial,true,'producer carries missing journey APZ to second-leg meal');
    const spanningPreview=localUpcomingAllowance(nextAllowancePayment(spanning.rows,spanning.unclassifiedItems,[month],now,[iso,nextIso]),now);
    assert.equal(spanningPreview.events.find(item=>item.currency==='USD').partial,true,'second-leg payment date never clears journey pending');
    const duty=run([{...reserve,destination:'FOREIGN',end:at('12:30'),day:{...reserve.day,dutyDebrief:'12:30'}}]);
    assert(duty.rows.length);assert(duty.rows.every(row=>row.expectedPaymentDate===undefined),'foreign duty without a flight never borrows a payment date');
    assert.equal(localUpcomingAllowance(nextAllowancePayment(duty.rows,duty.unclassifiedItems,[month],now,[iso]),now).events.length,0);
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
  console.log('PASS partial flight meals: real caller, literal-only inclusive windows, preserved APZ/taxi/breakfast unknowns, no duplicate meals, bounded reviewed tariffs. TZ='+process.env.TZ);
} finally {modules.cleanup();}
