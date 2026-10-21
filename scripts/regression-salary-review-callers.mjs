import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const modules=loadClientModules({files:['client/src/lib/financialPayrollPeriods.ts','client/src/lib/salaryDisplayBasis.ts','client/src/lib/salaryActivityEvidence.ts','client/src/lib/salaryCalculationDiagnostic.ts','client/src/lib/financialHistoryPeriods.ts','client/src/lib/rosterReferencePeriod.ts','client/src/lib/rosterDisplayDate.ts','client/src/lib/financialReserveCredits.ts','client/src/lib/financialJourneyGrouping.ts'],prefix:'salary-review-callers-'});
const home=fs.readFileSync('client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',home,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const names=['airportPoint','routeDistanceKm','flightDistanceKmFromEvent','calculateSalary','nightHoursInsideWindow','salaryDiagnosticItem','salaryForecastMetric','SalaryReliableView','KpiCard','moneyBRL'];
const nodes=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='AIRPORT_MAP_POINTS'));
assert.equal(nodes.length,names.length+1);
const cfg={configured:true,baseConfigured:false,requiresManualFunction:false,basePay:0,fixedAdditions:0,dayKmMetric:1,nightKmMetric:2,chiefPerSector:0,instructorPerSector:0,reserveHourMetric:0,standbyHourMetric:0,inssDeduction:0,irrfDeduction:0,otherDeductions:0,fgtsRate:0,source:'synthetic'};
let basis='gross',monthlyRecord=null;
const c=vm.createContext({...modules.load('financialPayrollPeriods'),...modules.load('salaryDisplayBasis'),useSalaryDisplayBasis:()=>({basis,choose:()=>true}),readMonthlyFinancialSettings:()=>monthlyRecord,FinancialScreen:p=>p.children,FinancialFreeDayDetails:()=>null,salaryDeductionEvidence:()=>({inss:false,irrf:false,otherDeductions:false,complete:false}),SalaryBreakdownChart:()=>null,PayrollPaymentCard:()=>null,useFinancialPrivacy:()=>({hidden:false,text:value=>value,amount:value=>value}),...modules.load('salaryActivityEvidence'),React,...modules.load('salaryCalculationDiagnostic'),...modules.load('financialHistoryPeriods'),...modules.load('rosterReferencePeriod'),...modules.load('rosterDisplayDate'),...modules.load('financialReserveCredits'),...modules.load('financialJourneyGrouping'),loadActCompensationConfig:()=>cfg,storage:{get:()=> '0'},dedupeProjectedLegs:events=>events,durationHours:()=>2,financialFlightRule:()=>({extra:false,reason:'synthetic'}),isSundayOrConfiguredHoliday:()=>false,userIsFirstCcm:()=>false,flightWorkType:()=> 'OP',safe:(v,f)=>v||f,dateChip:()=> '02/02',isOperationalEvent:()=>true,financialEventCode:()=> 'CRM',eventStartDateTime:e=>new Date(e.iso+'T12:00:00Z'),eventEndDateTime:e=>new Date(e.iso+'T14:00:00Z'),reviewedPayrollCycleForOperationalMonth:()=>null,financeSnapshot:()=>{},FinancialHistoryExplorer:'explorer',Brand:()=>null,DollarSign:()=>null,SalaryCalculationStatus:()=>null,MoneyText:p=>React.createElement('span',null,p.value)});
const coverageSource=fs.readFileSync('client/src/lib/payrollPaymentComposition.ts','utf8'),coverageAst=ts.createSourceFile('payrollPaymentComposition.ts',coverageSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const coverageNode=coverageAst.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='payrollOperationalCoverage');assert(coverageNode);
vm.runInContext(ts.transpileModule(coverageNode.getText(coverageAst).replace(/^export\s+/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);
vm.runInContext(ts.transpileModule(nodes.map(n=>n.getText(ast)).join('\n')+'\nglobalThis.subject={calculateSalary,SalaryReliableView};',{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,c);
const roster={year:2032,month:2,days:[{}]},range=c.financialRange('month','2032-02','','','');
const event=destination=>({id:'synthetic-flight',iso:'2032-02-02',date:new Date('2032-02-02T12:00:00Z'),day:{date:'02/02/2032'},kind:'flight',origin:'BSB',destination,flightNumber:'QA1001'});
function check(destination,pending,base){Object.assign(cfg,{requiresManualFunction:pending,baseConfigured:base,basePay:base?2400:0});const salary=c.subject.calculateSalary([event(destination)],roster),snapshot={roster,salary},caller=c.subject.SalaryReliableView({bundle:{roster}}).props;assert.equal(salary.rows.length,1);const available=destination==='GRU'&&!pending&&base;assert.deepEqual(JSON.parse(JSON.stringify(caller.metric(snapshot))),available?{BRL:salary.gross}:{});assert.deepEqual(JSON.parse(JSON.stringify(caller.rangeMetric(snapshot,range))),available?{BRL:salary.gross}:{});const node=caller.render({snapshots:[{roster,snapshot,source:'synthetic'}],range,missing:[],controls:null,graph:null});const html=renderToStaticMarkup(node);if(!available)assert.match(html,/Não calculável/);if(destination!=='GRU'||pending){assert.match(html,/Variáveis e total: não calculáveis/);assert.doesNotMatch(html,/Líquido simulado da competência: R/);assert.match(html,/Componentes por voo[\s\S]*Não calculável/);}if(destination!=='GRU'){assert.equal(salary.rows[0].distanceKnown,false);assert.match(html,/Distância operacional desconhecida/);assert.doesNotMatch(html,/0 km diurno/);}return salary;}
const jfk=check('JFK',false,false);assert.equal(jfk.rows[0].km,0,'real airport table reproduces missing JFK, without adding airport or changing engine');check('ZZZ',false,true);check('GRU',true,true);check('GRU',false,true);console.log('PASS actual engine airport table + actual SalaryReliableView metric/rangeMetric/render: unknown JFK/ZZZ and pending function blocked across all salary surfaces; known route remains available');

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
 const expected=complete?{BRL:Math.max(0,salary.gross-150)}:{};
 assert.deepEqual(JSON.parse(JSON.stringify(caller.metric(snapshot))),expected,'monthly graph net requires distinct proved days');
 assert.deepEqual(JSON.parse(JSON.stringify(caller.rangeMetric(snapshot,range))),expected,'range net uses same coverage proof');
 const html=renderToStaticMarkup(caller.render({snapshots:[{roster:scopedRoster,snapshot,source:'synthetic'}],range,missing:[],controls:null,graph:null}));
 if(!complete){assert.match(html,/Líquido previsto no período[\s\S]*Não calculável|Não calculável/);assert.match(html,/Falta conferir/);}
}
console.log('PASS actual net callers: full leap month vs1/29days, duplicate-day count and out-of-month coverage never invent complete net');
