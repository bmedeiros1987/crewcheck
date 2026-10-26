import {installAllowanceDependencies} from './lib/shared-allowance-fixture.mjs';
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.env.FINANCIAL_SOURCE_ROOT || '.');const require=createRequire(path.join(root,'package.json'));const ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {loadClientModules,TYPE_ONLY_PDF_PARSER_STUB}=await import(pathToFileURL(root+'/scripts/lib/ts-module-harness.mjs'));
const libNames=['aimsParser','canonicalRoster','financialIntervalEvidence','compensationPolicy','financialJourneyGrouping','financialForecastPeriods','financialAmounts','financialHistoryPeriods'];
const m=loadClientModules({files:libNames.map(n=>'client/src/lib/'+n+'.ts'),stubs:TYPE_ONLY_PDF_PARSER_STUB});
try{
const libs=Object.assign({},...libNames.map(n=>m.load(n)));const home=fs.readFileSync(root+'/client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',home,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const stubbed=new Set(['perDiemConfig','loadAirportPerDiemOverrides','readOptionalNumberSetting','calculateSalary','city','Brand','KpiCard']);
const declarations=new Map(ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name&&!stubbed.has(n.name.text)).map(n=>[n.name.text,n]));
const selected=new Set(),todo=['buildLegs','calculatePerDiem','financeSnapshot','scopedFinancialForecast','PerDiemMonthView'];while(todo.length){const name=todo.pop();if(selected.has(name)||!declarations.has(name))continue;selected.add(name);const visit=n=>{if(ts.isIdentifier(n)&&declarations.has(n.text)&&!selected.has(n.text))todo.push(n.text);ts.forEachChild(n,visit)};visit(declarations.get(name))}const functions=[...selected].map(n=>declarations.get(n));
const vars=ast.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['AIRLINE_NAMES','PRESENTATION_RULES_KEY','PRESENTATION_OVERRIDES_KEY'].includes(d.name.getText(ast))));
const noWrite=()=>{throw Error('No writes allowed in financial diagnostic')};
const rateConfig={taxiRate:31.5,rates:{domestic:{mainMeal:100,currency:'BRL',label:'SYNTHETIC'}},domesticBreakfast:25,domesticMainMealSource:'synthetic',domesticBreakfastSource:'synthetic',breakfastPercent:.25,source:'SYNTHETIC',act:{version:'synthetic'}};
const context=vm.createContext({...libs,React,useMemo:React.useMemo,useState:React.useState,console,storage:{get:(k,f)=>f,set:noWrite,remove:noWrite},city:x=>x,
perDiemConfig:()=>rateConfig,loadAirportPerDiemOverrides:()=>({}),resolvePerDiemRule:origin=>({rateKey:'domestic',airport:origin,reason:'synthetic'}),readOptionalNumberSetting:()=>null,calculateSalary:()=>({notUnderTest:true}),
useFinancialPrivacy:()=>({hidden:false,text:v=>v,amount:v=>v}),FinancialPrivacyToggle:()=>null,PersonalAllowanceReference:()=>null,FinancialStatementImporter:()=>null,FinancialScreen:p=>p.children,Brand:()=>null,KpiCard:p=>React.createElement('article',null,p.title,': ',p.value,' — ',p.detail),BriefcaseBusiness:()=>null,CalendarDays:()=>null,Plane:()=>null,DollarSign:()=>null,MoneyText:p=>React.createElement('span',null,p.value),
});
vm.runInContext(ts.transpileModule([...vars,...functions].map(n=>n.getText(ast).replace(/^export default /,'').replace(/^export /,'')).join('\n')+'\nglobalThis.subject={buildLegs,calculatePerDiem,financeSnapshot,scopedFinancialForecast,PerDiemMonthView};',{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,context);
  installAllowanceDependencies(context,{stubConfig:true});
// All dates, routes and amounts below are fictional test fixtures, not tariffs.
const good='ASB BSB 05:30 BSB 08:40';
const bad=good+' 09:40 LA 4101 09:39 BSB';
function textFor(target=good,month=8,changes={},year=2032) {
  const tag=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1],count=new Date(Date.UTC(year,month,0)).getUTCDate(),mm=String(month).padStart(2,'0');
  let text=`Escala de Tripulante Convertida para padrão AIMS\nTripulante: SYNTHETIC PILOT -BP:00000000 -Base: BSB -01/${mm}/${year} até${count}/${mm}/${year}\n`;
  for(let day=1;day<=count;day++)text+=String(day).padStart(2,'0')+tag+' '+(changes[day]??(day===15?target:day<=5?'08:00 LA 3001 09:00 BSB GRU 10:30 (320) LA 3002 11:30 GRU BSB 13:00 (320) 13:30':'DO'))+'\n';
  return text;
}
const visualRows=text=>text.trim().split('\n').slice(2).flatMap((line,index)=>line.split(/\s+/).map((str,row)=>({page:1,key:row,text:str,items:[{str,x:100+index*100,y:800-row*15,page:1}]})));
const monthRange=month=>libs.financialRange('month',`2032-${String(month).padStart(2,'0')}`,'','','');
const dateRange=(start,end=start)=>libs.financialRange('custom','','',start,end);
const results=[];
function forecast(roster,range=monthRange(8),others=[]) {
  const before=JSON.stringify(roster),snapshot=context.subject.financeSnapshot(roster);
  const value=context.subject.scopedFinancialForecast([snapshot,...others],range,[]);
  const html=renderToStaticMarkup(React.createElement(context.subject.PerDiemMonthView,{bundle:{roster,source:'synthetic'},forecastOverride:value,rangeLabel:'Synthetic source coverage'}));
  assert.equal(JSON.stringify(roster),before,'source and manual annotations are never mutated');
  return {value,html,snapshot};
}
const known=(value,label)=>value.monthlyRows.filter(row=>label?row.label===label:row.label!=='Táxi').reduce((sum,row)=>sum+row.value,0);
const pending=result=>{assert.equal(result.value.nativeSummary.complete,false);assert.equal(result.value.monthlySummary.convertedComplete,false);assert.equal(result.value.monthly,null);assert.ok(result.value.unclassifiedItems.length);assert.match(result.html,/Dados financeiros pendentes/);assert.doesNotMatch(result.html,/valores na moeda original/);};
const complete=result=>{assert.equal(result.value.nativeSummary.complete,true);assert.equal(result.value.monthlySummary.convertedComplete,true);assert.equal(result.value.unclassifiedItems.length,0);assert.match(result.html,/valores na moeda original/);};
for(const source of ['text','visual']) {
  const parse=text=>libs.parseAimsRoster(text,source==='visual'?visualRows(text):undefined);
  const broken=parse(textFor(bad)),valid=parse(textFor()),b=forecast(broken),v=forecast(valid);
  // This assertion is RED on current main: all31 dates used to hide a lost flight.
  pending(b);complete(v);assert.equal(new Set(broken.days.map(day=>day.date)).size,31);
  assert.equal(broken.days.filter(day=>day.date==='15/08/2032').flatMap(day=>day.legs).length,0);
  assert.equal(known(b.value),650);assert.equal(known(b.value,'Táxi'),31.5);
  assert.equal(b.value.nativeSummary.knownTotalsByCurrency.BRL,681.5);assert.match(b.html,/Subtotal estimado/);
  assert.deepEqual(b.value.monthlyRows.map(row=>[row.iso,row.label,row.value]),v.value.monthlyRows.map(row=>[row.iso,row.label,row.value]),'known meal/taxi rows survive source uncertainty unchanged');
  assert.deepEqual([...new Set(b.value.unclassifiedItems.map(item=>item.iso))],Array.from({length:17},(_,i)=>`2032-08-${i+15}`));
  pending(forecast(JSON.parse(JSON.stringify(broken))));
  complete(forecast(broken,dateRange('2032-08-01','2032-08-05')));
  pending(forecast(broken,dateRange('2032-08-16','2032-08-20')));
  const laterKnown=parse(textFor(bad,8,{16:'08:00 LA 3001 09:00 BSB GRU 10:30 (320) LA 3002 11:30 GRU BSB 13:00 (320) 13:30'}));
  complete(forecast(laterKnown,dateRange('2032-08-01','2032-08-05')));pending(forecast(laterKnown,dateRange('2032-08-16')));
  const whole=parse(textFor('09:40 LA 4101 09:39 BSB'));pending(forecast(whole));
  pending(forecast(parse(textFor().replace('01Aug ', '00Aug LA 4101 09:39 BSB\n01Aug '))));
  pending(forecast(parse(textFor().replace('01Aug ', 'LA 4101 09:39 BSB\n01Aug '))));
  const repeated=parse(textFor('08:00 LA 4101 09:00 BSB GRU 10:30 (320) LA 4101 11:30 GRU'));pending(forecast(repeated));
  complete(forecast(parse(textFor('08:00 LA 4101 09:00 BSB GRU 10:30 (320) LA 4101 11:30 GRU BSB 13:00 (320) 13:30'))));
  const overnight=parse(textFor(good,8,{14:'22:30 LA 4501 23:20 BSB (...)',15:'(...) GRU 01:10 (320) 01:40 15:00 LA 4502 16:00 GRU BSB 17:30 (320) 18:00'}));
  const overnightResult=forecast(overnight);assert.ok(overnight.days.some(day=>day.legs.some(leg=>leg.flightNumber==='LA4501')),'literal stitched overnight flight survives');
  assert.equal(overnightResult.value.unclassifiedItems.some(item=>item.pendingKind==='source_coverage'),false,'legible stitched continuation does not invent source incompleteness');
  const ambiguousContinuation=parse(textFor(good,8,{14:'22:30 LA 4501 23:20 BSB (...)',15:'(...) GRU 01:10 (320) 01:40 08:00 LA 4502 09:00 GRU BSB 10:30 (320) 11:00'}));
  const repeatedProjected=context.subject.buildLegs(ambiguousContinuation).filter(event=>event.flightNumber==='LA4502');
  if(repeatedProjected.length>1)assert.ok(forecast(ambiguousContinuation).value.unclassifiedItems.some(item=>item.pendingKind==='source_coverage'),'an existing extra projection is not certified or silently rewritten');
  const repeatedPage=textFor()+textFor().split('\n').slice(2).join('\n'),duplicateSource=parse(repeatedPage);assert.equal(duplicateSource.aimsFlightSourceCoverage.occurrences.length,10,'identical repeated source blocks do not double the inventory');
  if(duplicateSource.days.flatMap(day=>day.legs).length<10)pending(forecast(duplicateSource));else complete(forecast(duplicateSource));
  const benign=structuredClone(valid);benign.crewName='SYNTHETIC OTHER';benign.days.find(day=>day.legs.length).hotel='SYNTHETIC HOTEL';complete(forecast(benign));
  for(const mutate of [r=>r.days.find(day=>day.legs.length).legs.shift(),r=>r.days.find(day=>day.legs.length).legs[0].flightNumber='LA9999',r=>r.rawText+='\nSYNTHETIC CHANGED SOURCE',r=>delete r.aimsFlightSourceCoverage,r=>r.aimsFlightSourceCoverage.version=999,r=>r.aimsFlightSourceCoverage.occurrences.pop(),r=>r.aimsFlightSourceCoverage.sourceDates.push('2032-08-99')]) {const changed=structuredClone(valid);mutate(changed);pending(forecast(changed));}
  for(const month of [13,9]){const changed=structuredClone(valid);changed.month=month;const result=forecast(changed);pending(result);assert.ok(result.value.unclassifiedItems.some(item=>item.iso===''),'invalid/changed authority remains unscoped pending, not no-data');}
  const erased=structuredClone(valid);delete erased.aimsFlightSourceCoverage;erased.rawText='';complete(forecast(erased)); // Explicit residual: no AIMS origin can be inferred from blank text.
  rateConfig.taxiRate=null;const noTaxi=forecast(valid);pending(noTaxi);assert.equal(known(noTaxi.value),650);assert.equal(noTaxi.value.monthlyRows.some(row=>row.label==='Táxi'),false);assert.ok(noTaxi.value.unclassifiedItems.some(item=>item.pendingKind==='taxi_rate'));rateConfig.taxiRate=31.5;
  rateConfig.rates.domestic.mainMeal=NaN;const noMeal=forecast(valid);pending(noMeal);assert.ok(noMeal.value.monthlyRows.every(row=>row.value>0),'unknown tariff does not become zero');assert.equal(known(noMeal.value,'Táxi'),31.5);rateConfig.rates.domestic.mainMeal=100;
  const civilFlight='08:00 LA 4501 09:00 BSB GRU 10:30 (320) LA 4502 11:30 GRU BSB 13:00 (320) 13:30';
  pending(forecast(parse(textFor(good,4)+'31Apr '+civilFlight+'\n'),monthRange(4)));
  pending(forecast(parse(textFor(good,2,{},2033)+'29Feb '+civilFlight+'\n'),libs.financialRange('month','2033-02','','','')));
  complete(forecast(parse(textFor(good,2,{29:civilFlight})),monthRange(2)));
  const september=parse(textFor(good,9));complete(forecast(september,monthRange(9),[b.snapshot]));
  const spillover=parse(textFor()+'01Sep '+bad+'\n08Sep '+good+'\n'),spillEvents=context.subject.buildLegs(spillover);
  for(const day of ['2032-09-01','2032-09-08']){const allRows=context.subject.calculatePerDiem(spillEvents,spillover,new Date(day+'T15:00:00Z'));assert.equal(allRows.monthlySummary.convertedComplete,true,'August authority is not poisoned by later printed issue');assert.equal(allRows.weeklySummary.convertedComplete,false,'weekly all-row consumer retains explicit spillover uncertainty');assert.ok(allRows.unclassifiedItems.some(item=>item.iso===day&&item.pendingKind==='source_coverage'));assert.equal(allRows.monthlyUnclassifiedItems.length,0);}
  complete(forecast(september,monthRange(9),[context.subject.financeSnapshot(spillover)]));
  const monthEnd=parse(textFor(good,8,{31:bad})),end=forecast(monthEnd,dateRange('2032-08-31'));pending(end);
  complete(forecast(september,monthRange(9),[end.snapshot]));pending(forecast(monthEnd,dateRange('2032-08-31','2032-09-05'),[context.subject.financeSnapshot(september)]));
  results.push({source,knownMeals:650,knownTaxi:31.5,finalTotal:null,sourceIssues:new Set(b.value.unclassifiedItems.map(item=>item.sourceIssueId)).size,coverageDays:b.value.unclassifiedItems.length});
}
const secondaryText=textFor(good,8,{14:'08:00 LA 4501 09:00 BSB GRU 10:30 (320) LA 4502 11:30 GRU BSB 13:00 (320) 13:30'});
const visualGap=secondaryText.split('\n').filter(line=>!line.startsWith('14Aug ')).join('\n');
const rescuedSecondary=libs.parseAimsRoster(secondaryText,visualRows(visualGap));complete(forecast(rescuedSecondary));
const validVisual=libs.parseAimsRoster(textFor(bad),visualRows(textFor()));complete(forecast(validVisual));
pending(forecast(libs.parseAimsRoster(textFor(),visualRows(textFor(bad)))));
const legacyText=textFor().split('\n').slice(0,2).join('\n')+'\n15Aug 08:00 LA 9999 09:00 BSB GRU 10:30 (320) LA 9998 11:30 GRU BSB 13:00 (320) 13:30\n';
const legacySecondary=libs.parseAimsRoster(legacyText,visualRows(textFor()));
assert.ok(forecast(legacySecondary,dateRange('2032-08-16')).value.unclassifiedItems.some(item=>item.pendingKind==='source_coverage'),'a secondary flight without source identity cannot vanish from later coverage');

// Run the actual payment helper, not a duplicate formula or provider call.
const paymentSource=fs.readFileSync(root+'/client/src/lib/nextFinancialPayment.ts','utf8'),paymentExports={};
vm.runInNewContext(ts.transpileModule(paymentSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:paymentExports,require:specifier=>specifier.includes('/shared/')?require(root+'/shared/'+path.basename(specifier)):m.load(path.basename(specifier)),console});
const brokenForPayment=libs.parseAimsRoster(textFor(bad)),snapshot=context.subject.financeSnapshot(brokenForPayment);
const payment=paymentExports.nextAllowancePayment(snapshot.perdiem.monthlyRows,snapshot.perdiem.unclassifiedItems,['2032-08'],new Date('2032-08-19T15:00:00Z'),brokenForPayment.days.map(day=>libs.aimsSourceDateIso?libs.aimsSourceDateIso(day.date):day.date.split('/').reverse().join('-')));
assert.equal(payment.totals,null);assert.equal(payment.calculationPartial,true);assert.ok(payment.issues.some(issue=>issue.includes('Cobertura da fonte AIMS')));
const foreign={iso:'2032-08-15',label:'SYNTHETIC foreign meal',currency:'USD',value:20,convertedBRL:null,source:'SYNTHETIC',partial:false,expectedPaymentDate:'2032-08-15',expectedPaymentTimezone:'America/Sao_Paulo'};
const upcoming=pending=>paymentExports.nextAllowancePayment([foreign],pending,['2032-08'],new Date('2032-08-19T15:00:00Z'),['2032-08-15']).upcomingLines[0];
assert.equal(upcoming([{iso:'2032-08-15',airport:'BSB',pendingKind:'source_coverage',reason:'SYNTHETIC source pending'}]).partial,true);
assert.equal(upcoming([{iso:'',airport:'',pendingKind:'source_coverage',reason:'SYNTHETIC authority pending'}]).partial,true);
assert.equal(upcoming([{iso:'2032-08-16',airport:'',pendingKind:'source_coverage'}]).partial,false,'unrelated source date does not contaminate this foreign item');
assert.equal(upcoming([{iso:'2032-08-15',airport:'BSB',pendingKind:'taxi_rate'}]).partial,false,'BRL taxi tariff pending is not a currency-independent source gap');
// Evaluate the actual Home caller argument expressions, not a hand-built cohort:
// monthly rows must use monthly pending, while the engine weekly path keeps all.
const spilloverRoster=libs.parseAimsRoster(textFor()+'01Sep '+bad+'\n'),septemberRoster=libs.parseAimsRoster(textFor(good,9));
const cohorts=[spilloverRoster,septemberRoster].map(roster=>({roster,snapshot:context.subject.financeSnapshot(roster)}));
const cohortContext=vm.createContext({snapshots:cohorts,snapshot:cohorts[0].snapshot});
let paymentPendingArgs=[],reconciliationPending;
function findPendingArguments(node){
 if(ts.isCallExpression(node)&&node.expression.getText(ast)==='nextAllowancePayment')paymentPendingArgs.push(node.arguments[1]);
 if((ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node))&&node.tagName.getText(ast)==='FinancialStatementReconciliation')reconciliationPending=node.attributes.properties.find(attribute=>ts.isJsxAttribute(attribute)&&attribute.name.text==='unclassified')?.initializer?.expression;
 ts.forEachChild(node,findPendingArguments);
}
findPendingArguments(ast);assert.equal(paymentPendingArgs.length,2);assert.ok(reconciliationPending);
for(const expression of [...paymentPendingArgs,reconciliationPending])assert.equal(vm.runInContext(expression.getText(ast),cohortContext).length,0,'actual nominal-row caller cannot inherit old-source spillover warnings');
const combinedRows=cohorts.flatMap(item=>item.snapshot.perdiem.monthlyRows),combinedDays=cohorts.flatMap(item=>item.roster.days.map(day=>day.date.split('/').reverse().join('-')));
const coherentPending=vm.runInContext(paymentPendingArgs.find(node=>node.getText(ast).includes('snapshots.')).getText(ast),cohortContext);
const independentPayment=paymentExports.nextAllowancePayment(combinedRows,coherentPending,['2032-08','2032-09'],new Date('2032-09-03T15:00:00Z'),combinedDays);
assert.equal(independentPayment.calculationPartial,false,'independently witnessed September payment remains complete');



// Evaluate the actual capture key expression: an unchanged known subtotal must
// not preserve a prior certified review after coverage changes.
let captureKey;function findCaptureKey(node){if((ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node))&&node.tagName.getText(ast)==='CanonicalForecastCapture')captureKey=node.attributes.properties.find(attribute=>ts.isJsxAttribute(attribute)&&attribute.name.text==='key')?.initializer?.expression;ts.forEachChild(node,findCaptureKey)}findCaptureKey(ast);assert.ok(captureKey);
const captureKeyContext=vm.createContext({getStoredUser:()=>({email:'synthetic@example.invalid'}),range:monthRange(8),captureRows:[],captureFlights:[],forecast:{nativeSummary:{complete:true},scopeIncomplete:false}});
const keyBefore=vm.runInContext(captureKey.getText(ast),captureKeyContext);captureKeyContext.forecast.nativeSummary.complete=false;
assert.notEqual(vm.runInContext(captureKey.getText(ast),captureKeyContext),keyBefore,'actual Home key remounts a stale capture review when coverage changes');

// Actual reconciliation component calculation with a controlled read-only
// document state. Undated or malformed pending must not become a comparison.
const reconciliationSource=fs.readFileSync(root+'/client/src/components/finance/FinancialStatementReconciliation.tsx','utf8');
const reconciliationAst=ts.createSourceFile('FinancialStatementReconciliation.tsx',reconciliationSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const reconciliationNodes=reconciliationAst.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='FinancialStatementReconciliation'||ts.isVariableStatement(node)&&node.declarationList.declarations.some(declaration=>['owner','formatMoney'].includes(declaration.name.getText(reconciliationAst))));
let stateIndex=0;
const reconciliationContext=vm.createContext({...libs,React,useFinancialPrivacy:()=>({amount:value=>value,text:value=>value}),useEffect:()=>{},useRef:()=>({current:0}),useState:initial=>[stateIndex++===0?{owner:'synthetic:synthetic-token',session:'synthetic-session',result:{periodStart:'2032-08-01',periodEnd:'2032-08-05',paymentDate:null,totals:{deposited:1000},warnings:[],rates:[]}}:initial,()=>{}],getStoredUser:()=>({id:'synthetic'}),getToken:()=> 'synthetic-token',FinancialStatementImporter:()=>null});
vm.runInContext(ts.transpileModule(reconciliationNodes.map(node=>node.getText(reconciliationAst).replace('export default ','')).join('\n')+'\nglobalThis.component=FinancialStatementReconciliation;',{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,reconciliationContext);
const reconciliationRows=context.subject.financeSnapshot(libs.parseAimsRoster(textFor())).perdiem.monthlyRows;
function reconcile(pending){stateIndex=0;return renderToStaticMarkup(reconciliationContext.component({rows:reconciliationRows,unclassified:pending,coveredMonths:['2032-08'],requestRange:()=>{}}))}
assert.match(reconcile([]),/Diferença a conferir/,'complete comparison control remains available');
for(const iso of ['', '2032-08-99']){const html=reconcile([{iso,airport:'',pendingKind:'source_coverage'}]);assert.match(html,/Não calculável/);assert.doesNotMatch(html,/Diferença a conferir/);}

const report={synthetic:true,homeSha256:crypto.createHash('sha256').update(home).digest('hex'),scope:'AIMS source-flight coverage only; no real tariff, payment, salary, provider or browser claim',results};
const phase=process.env.FINANCIAL_COVERAGE_PHASE||'local';assert.ok(['raw','prepared','local'].includes(phase));
const out=path.join(root,'artifacts/financial-aims-source-coverage',phase);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,`report-${String(process.env.TZ||'device').replace(/[^A-Za-z0-9_-]/g,'_')}.json`),JSON.stringify(report,null,2));
console.log('PASS actual AIMS parser → Home buildLegs/snapshot/scoped forecast/SSR; source omissions, provenance edits, scopes, legacy, meal/taxi subtotals and payment pending');
}finally{m.cleanup()}
