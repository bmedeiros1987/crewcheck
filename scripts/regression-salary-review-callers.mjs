import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const adapterDir=fs.mkdtempSync(path.join(os.tmpdir(),'salary-caller-dsr-')),adapterFile=path.join(adapterDir,'adapter.cjs');
await build({entryPoints:['client/src/lib/salaryDsrConsumer.ts'],bundle:true,platform:'node',format:'cjs',outfile:adapterFile});
const dsrAdapter=createRequire(import.meta.url)(adapterFile);
// The actual salary caller now mounts these real components. Keep them in its
// dependency graph rather than suppressing the new surfaces with empty mocks.
const forecastFile=path.join(adapterDir,'forecasts.cjs'),runtimeRequire=createRequire(import.meta.url);
await build({stdin:{contents:`
export {default as VacationForecast} from './client/src/components/finance/VacationForecast';
export {default as ThirteenthForecast} from './client/src/components/finance/ThirteenthForecast';
`.trim(),resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',jsx:'automatic',outfile:forecastFile,alias:{'@':path.resolve('client/src')},loader:{'.css':'empty'},plugins:[{name:'same-react-runtime',setup(b){b.onResolve({filter:/^react(?:\/.*)?$/},args=>({path:runtimeRequire.resolve(args.path),external:true}));}}]});
const forecastViews=runtimeRequire(forecastFile);

const modules=loadClientModules({files:['client/src/lib/payrollProjectionPeriods.ts','client/src/lib/financialActApplicability.ts','client/src/lib/financialPayrollPeriods.ts','client/src/lib/salaryDisplayBasis.ts','client/src/lib/salaryActivityEvidence.ts','client/src/lib/salaryCalculationDiagnostic.ts','client/src/lib/financialHistoryPeriods.ts','client/src/lib/rosterReferencePeriod.ts','client/src/lib/rosterDisplayDate.ts','client/src/lib/financialReserveCredits.ts','client/src/lib/financialJourneyGrouping.ts'],prefix:'salary-review-callers-'});
const home=fs.readFileSync('client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',home,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=['airportPoint','routeDistanceKm','flightDistanceKmFromEvent','calculateSalary','nightHoursInsideWindow','salaryDiagnosticItem','salaryForecastMetric','SalaryReliableView','KpiCard','moneyBRL'];
const nodes=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='AIRPORT_MAP_POINTS'));
assert.equal(nodes.length,names.length+1);
const cfg={configured:true,baseConfigured:false,requiresManualFunction:false,basePay:0,fixedAdditions:0,dayKmMetric:1,nightKmMetric:2,chiefPerSector:0,instructorPerSector:0,reserveHourMetric:0,standbyHourMetric:0,inssDeduction:0,irrfDeduction:0,otherDeductions:0,fgtsRate:0,source:'synthetic'};
let basis='gross',monthlyRecord=null,chiefEligible=false,chiefTariff=null;
const c=vm.createContext({...dsrAdapter,...forecastViews,financialPresetScope:modules.load('payrollProjectionPeriods').financialPresetScope,readFinancialActApplicability:modules.load('financialActApplicability').readFinancialActApplicability,captureAuthSession:()=>({isCurrent:()=>true}),financialRateOwner:()=>'synthetic',confirmedPayrollDsrContext:()=>null,confirmedRateAt:()=>null,rosterFinancialDate:()=>'2032-02-01',rosterFingerprint:roster=>JSON.stringify(roster.days),readOptionalNumberSetting:key=>key==='crewcheck_act_chief_sector_brl'?chiefTariff:null,...modules.load('financialPayrollPeriods'),...modules.load('salaryDisplayBasis'),useSalaryDisplayBasis:()=>({basis,choose:()=>true}),readMonthlyFinancialSettings:()=>monthlyRecord,FinancialScreen:p=>p.children,FinancialFreeDayDetails:()=>null,salaryDeductionEvidence:()=>({inss:false,irrf:false,otherDeductions:false,complete:false}),SalaryBreakdownChart:()=>null,PayrollPaymentCard:()=>null,useFinancialPrivacy:()=>({hidden:false,text:value=>value,amount:value=>value}),...modules.load('salaryActivityEvidence'),React,...modules.load('salaryCalculationDiagnostic'),...modules.load('financialHistoryPeriods'),...modules.load('rosterReferencePeriod'),...modules.load('rosterDisplayDate'),...modules.load('financialReserveCredits'),...modules.load('financialJourneyGrouping'),loadActCompensationConfig:()=>cfg,storage:{get:()=> '0'},dedupeProjectedLegs:events=>events,durationHours:()=>2,financialFlightRule:()=>({extra:false,reason:'synthetic'}),isSundayOrConfiguredHoliday:()=>false,userIsFirstCcm:()=>chiefEligible,flightWorkType:()=> 'OP',safe:(v,f)=>v||f,dateChip:()=> '02/02',isOperationalEvent:()=>true,financialEventCode:()=> 'CRM',eventStartDateTime:e=>new Date(e.iso+'T12:00:00Z'),eventEndDateTime:e=>new Date(e.iso+'T14:00:00Z'),reviewedPayrollCycleForOperationalMonth:()=>null,financeSnapshot:()=>{},FinancialHistoryExplorer:'explorer',Brand:()=>null,DollarSign:()=>null,SalaryCalculationStatus:()=>null,MoneyText:p=>React.createElement('span',null,p.value)});
const coverageSource=fs.readFileSync('client/src/lib/payrollPaymentComposition.ts','utf8'),coverageAst=ts.createSourceFile('payrollPaymentComposition.ts',coverageSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const coverageNode=coverageAst.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='payrollOperationalCoverage');assert(coverageNode);
vm.runInContext(ts.transpileModule(coverageNode.getText(coverageAst).replace(/^export\s+/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);
vm.runInContext(ts.transpileModule(nodes.map(n=>n.getText(ast)).join('\n')+'\nglobalThis.subject={calculateSalary,SalaryReliableView};',{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,c);
const roster={year:2032,month:2,days:[{}]},range=c.financialRange('month','2032-02','','','');
const event=destination=>({id:'synthetic-flight',iso:'2032-02-02',date:new Date('2032-02-02T12:00:00Z'),day:{date:'02/02/2032'},kind:'flight',origin:'BSB',destination,flightNumber:'QA1001'});
function check(destination,pending,base){Object.assign(cfg,{requiresManualFunction:pending,baseConfigured:base,basePay:base?2400:0});const salary=c.subject.calculateSalary([event(destination)],roster),snapshot={roster,salary},caller=c.subject.SalaryReliableView({bundle:{roster}}).props;assert.equal(salary.rows.length,1);const knownProduction=destination==='GRU'&&!pending?salary.rows[0].production:0;const expectedKnown=base||knownProduction?(base?240000:0)+Math.round(knownProduction*100):null;assert.equal(salary.dsr.observedSubtotalMinor,expectedKnown,'same known pre-DSR component cents preserved');assert.ok(Number.isNaN(salary.gross),'inventory incompleteness blocks complete gross, never known subtotal');const available=destination==='GRU'&&!pending&&base;assert.deepEqual(JSON.parse(JSON.stringify(caller.metric(snapshot))),{});assert.deepEqual(JSON.parse(JSON.stringify(caller.rangeMetric(snapshot,range))),{});const node=caller.render({snapshots:[{roster,snapshot,source:'synthetic'}],range,missing:[],controls:null,graph:null});const html=renderToStaticMarkup(node);assert.match(html,/Previsão de férias/,'real vacation view remains mounted');assert.match(html,/Previsão do 13º/,'real thirteenth view remains mounted');if(expectedKnown!==null){const kpi=html.match(/<small>Subtotal bruto estimado no período<\/small>[\s\S]*?<strong>([\s\S]*?)<\/strong>/)?.[1];assert.ok(kpi&&!kpi.includes('Não calculável'),'Known canonical subtotal must survive the statement header with incomplete inventory');assert.match(html,/Parcelas observadas, sem DSR/);}if(!available)assert.match(html,/Não calculável/);if(destination!=='GRU'||pending){assert.match(html,/Variáveis e total: não calculáveis/);assert.doesNotMatch(html,/Líquido simulado da competência: R/);assert.match(html,/Componentes por voo[\s\S]*Não calculável/);}if(destination!=='GRU'){assert.equal(salary.rows[0].distanceKnown,false);assert.match(html,/Distância operacional desconhecida/);assert.doesNotMatch(html,/0 km diurno/);}return salary;}
const jfk=check('JFK',false,false);assert.equal(jfk.rows[0].km,0,'real airport table reproduces missing JFK, without adding airport or changing engine');check('ZZZ',false,true);check('GRU',true,true);check('GRU',false,true);console.log('PASS actual engine airport table + actual SalaryReliableView metric/rangeMetric/render: unknown JFK/ZZZ and pending function blocked across all salary surfaces; known route subtotal remains available; incomplete inventory keeps full gross pending');

chiefEligible=true;chiefTariff=17;Object.assign(cfg,{requiresManualFunction:false,baseConfigured:false,basePay:0,chiefPerSector:17});
const chiefSalary=c.subject.calculateSalary([event('JFK')],roster);assert.equal(chiefSalary.rows[0].distanceKnown,false);assert.equal(chiefSalary.rows[0].chief,17);assert.equal(chiefSalary.dsr.observedParts.find(p=>p.key==='chief').amountMinor,1700);assert.equal(chiefSalary.dsr.observedParts.find(p=>p.key==='instructor').amountMinor,null);assert.equal(chiefSalary.dsr.observedSubtotalMinor,1700);
const chiefHtml=renderToStaticMarkup(c.subject.SalaryReliableView({bundle:{roster}}).props.render({snapshots:[{roster,snapshot:{roster,salary:chiefSalary},source:'synthetic'}],range,missing:[],controls:null,graph:null}));assert.match(chiefHtml,/chefe R\$\s*17,00/);assert.match(chiefHtml,/instrutor Não informado/);assert.doesNotMatch(chiefHtml,/chefe\/instrutor/);
chiefEligible=false;chiefTariff=null;cfg.chiefPerSector=0;
console.log('PASS actual salary engine/UI: chief sector17 remains known with missing KM, instructor absence stays unknown');

Object.assign(cfg,{requiresManualFunction:false,baseConfigured:true,basePay:2400});
const invalidEvent={...event('GRU'),canonical:{startDateTime:'2032-02-02T12:00:00',endDateTime:'2032-02-02T14:00:00Z'}};
const invalidSalary=c.subject.calculateSalary([invalidEvent],roster),invalidSnapshot={roster,salary:invalidSalary},invalidCaller=c.subject.SalaryReliableView({bundle:{roster}}).props;
assert.equal(invalidSalary.rows[0].timeKnown,false);assert.ok(Number.isNaN(invalidSalary.gross));assert.deepEqual(JSON.parse(JSON.stringify(invalidCaller.metric(invalidSnapshot))),{});
const invalidHtml=renderToStaticMarkup(invalidCaller.render({snapshots:[{roster,snapshot:invalidSnapshot,source:'synthetic'}],range,missing:[],controls:null,graph:null}));
assert.match(invalidHtml,/Horários ou fuso operacional ausentes ou ambíguos/);assert.match(invalidHtml,/Componentes por voo[\s\S]*Não calculável/);assert.doesNotMatch(invalidHtml,/NaN|0 km diurno/);
console.log('PASS actual salary UI: ambiguous canonical clock blocks aggregate and row amounts');

// Real salary caller: a ready diagnostic alone is not full monthly coverage.
basis='net';
const v=amountMinor=>({amountMinor,kind:'deduction',currency:'BRL',source:'manual',sourceId:'synthetic',recurrence:'once'});
monthlyRecord={schema:1,ownerId:'synthetic',month:'2032-02',revision:1,closed:false,values:{inss:v(10000),irrf:v(0),other_deductions:v(5000)}};
const fullDays=Array.from({length:29},(_,i)=>({date:`${String(i+1).padStart(2,'0')}/02/2032`}));
for(const [days,complete] of [[fullDays,true],[fullDays.slice(0,1),false],[Array(29).fill(fullDays[0]),false],[fullDays.slice(0,28).concat({date:'01/03/2032'}),false]]){
 const scopedRoster={...roster,days},salary=c.subject.calculateSalary([event('GRU')],scopedRoster),snapshot={roster:scopedRoster,salary};
 const caller=c.subject.SalaryReliableView({bundle:{roster:scopedRoster}}).props;
 assert.equal(c.payrollOperationalCoverage('2032-02',days.map(day=>day.date)).complete,complete,'existing distinct-day coverage counterproof is preserved');assert.equal(salary.dsr.observedSubtotalMinor,240000+Math.round(salary.rows[0].production*100),'known base and work retained even without complete net');const expected={};
 assert.deepEqual(JSON.parse(JSON.stringify(caller.metric(snapshot))),expected,'monthly graph net requires distinct proved days');
 assert.deepEqual(JSON.parse(JSON.stringify(caller.rangeMetric(snapshot,range))),expected,'range net uses same coverage proof');
 const html=renderToStaticMarkup(caller.render({snapshots:[{roster:scopedRoster,snapshot,source:'synthetic'}],range,missing:[],controls:null,graph:null}));
 if(!complete){assert.match(html,/Líquido previsto no período[\s\S]*Não calculável|Não calculável/);assert.match(html,/Falta conferir/);}
}
console.log('PASS actual net callers: full leap month vs1/29days, duplicate-day count and out-of-month coverage never invent complete net');

// The actual producer's category observations, not a legacy row total, own
// the payment subtotal. A global instructor flag is not owner-bound proof.
Object.assign(cfg,{configured:true,baseConfigured:true,fixedAdditionsConfigured:true,basePay:2400,fixedAdditions:0,requiresManualFunction:false,instructorPerSector:19});
c.storage={get:key=>key==='crewcheck_instructor'?'1':'0'};
const auditedRoster={...roster,days:fullDays},produced=c.subject.calculateSalary([event('GRU')],auditedRoster);
assert.equal(produced.rows[0].instructor,19);assert.equal(produced.dsr.observedParts.find(p=>p.key==='instructor').amountMinor,null);assert.equal(produced.dsr.inventoryComplete,false);assert(Number.isNaN(produced.gross));
const paymentFile=path.join(adapterDir,'payment.cjs');await build({entryPoints:['client/src/lib/payrollPaymentComposition.ts'],bundle:true,platform:'node',format:'cjs',outfile:paymentFile});
const {composeOperationalPayrollEstimate}=createRequire(import.meta.url)(paymentFile);
const projected=composeOperationalPayrollEstimate({month:'2032-02',salary:produced,publishedDays:fullDays.map(d=>d.date)});
assert.equal(projected.totals,null);assert.equal(projected.calculationPartial,true);assert.equal(Math.round(projected.calculationTotals.BRL*100),produced.dsr.observedSubtotalMinor,'actual Home and summary share the exact observed component subtotal');assert.equal(projected.lines.find(line=>line.label==='Instrutoria').value,null);
console.log('PASS real producer to payment: scalar inputs and global instructor flag never certify inventory or inflate observed canonical subtotal');

const statementValue=(salary,items,selectedRange=range)=>{
 const html=renderToStaticMarkup(c.subject.SalaryReliableView({bundle:{roster}}).props.render({snapshots:items||[{roster,snapshot:{roster,salary},source:'synthetic'}],range:selectedRange,missing:[],controls:null,graph:null}));
 return html.match(/<small>Subtotal bruto estimado no período<\/small>[\s\S]*?<strong>([\s\S]*?)<\/strong>/)?.[1];
};
basis='gross';
for(const dsr of [{...produced.dsr,isCurrent:()=>false},{...produced.dsr,composition:{...produced.dsr.composition,ownerId:'other-account'}},{...produced.dsr,composition:{...produced.dsr.composition,competence:'2032-01'}}])assert.match(statementValue({...produced,dsr}),/Não calculável/);
const duplicate={roster,snapshot:{roster,salary:produced},source:'synthetic'};
assert.match(statementValue(produced,[duplicate,duplicate]),/Não calculável/,'Duplicate monthly sources must not inflate a subtotal');
assert.match(statementValue(produced,undefined,c.financialRange('day','2032-02','2032-02-02','','')),/Não calculável/,'Monthly observations must not be assigned to a single day');
Object.assign(cfg,{baseConfigured:true,basePay:0,fixedAdditionsConfigured:false,requiresManualFunction:true});
const explicitZero=c.subject.calculateSalary([event('ZZZ')],roster);
assert.equal(explicitZero.dsr.observedSubtotalMinor,0);assert.ok(!statementValue(explicitZero).includes('Não calculável'),'Confirmed zero remains a known subtotal');
assert.ok(Number.isNaN(explicitZero.gross));
console.log('PASS statement observed subtotal: revoked/foreign/stale competence, duplicate month, day scope refused; explicit zero retained without certifying gross/net');
fs.rmSync(adapterDir,{recursive:true,force:true});
