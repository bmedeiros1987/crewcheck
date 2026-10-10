import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import { loadClientModules } from './lib/ts-module-harness.mjs';

const modules=loadClientModules({files:['client/src/lib/salaryCalculationDiagnostic.ts','client/src/lib/financialHistoryPeriods.ts','client/src/lib/financialReserveCredits.ts','client/src/lib/salaryActivityEvidence.ts','client/src/lib/aimsParser.ts','client/src/lib/canonicalRoster.ts','client/src/lib/rosterDisplayDate.ts','client/src/lib/financialIntervalEvidence.ts','client/src/lib/compensationPolicy.ts','client/src/lib/financialJourneyGrouping.ts','client/src/lib/financialForecastPeriods.ts','client/src/lib/financialAmounts.ts'],prefix:'independent-extra-financial-'});
try {
 const parser=modules.load('aimsParser'),canonical=modules.load('canonicalRoster');
 const names=['buildLegs','projectedFlightQuality','dedupeProjectedLegs','eventStartDateTime','eventEndDateTime','isOperationalEvent','flightWorkType','financialEventCode','financialFlightRule','durationHours','nightHoursInsideWindow','isSundayOrConfiguredHoliday','calculateSalary','calculatePerDiem','moneyBRL'];
 const home=ts.createSourceFile('Home.tsx',fs.readFileSync('client/src/pages/Home.tsx','utf8'),99,true,4);
 const functions=home.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text));assert.equal(functions.length,names.length);
 const context=vm.createContext({...modules.load('salaryActivityEvidence'),console,Date,Intl,...canonical,...modules.load('rosterDisplayDate'),...modules.load('financialIntervalEvidence'),...modules.load('compensationPolicy'),...modules.load('financialJourneyGrouping'),...modules.load('financialForecastPeriods'),...modules.load('financialAmounts'),
   storage:{get:(_k,f)=>f},pad2:n=>String(n).padStart(2,'0'),safe:(v,f='—')=>String(v??'').trim()||f,city:v=>v,normalizedAirlineCode:()=> 'LA',airlineNameFor:()=> 'SYNTHETIC',addMinutesToTime:()=>'',applyPresentationManagement:x=>x,
   dateChip:d=>d.toISOString().slice(0,10),moneyCurrency:(v,c)=>`${c} ${v}`,
   loadActCompensationConfig:()=>({basePay:1000,fixedAdditions:0,dayKmMetric:1,nightKmMetric:2,chiefPerSector:0,instructorPerSector:0,reserveHourMetric:1,standbyHourMetric:1,inssDeduction:0,irrfDeduction:0,otherDeductions:0,fgtsRate:0,configured:true,source:'SYNTHETIC NOT A TARIFF'}),
   flightDistanceKmFromEvent:e=>({'LA9001':100,'LA9002':200,'LA9003':300,'LA9011':400,'LA9012':500,'LA9013':600}[e.flightNumber]||100),userIsFirstCcm:()=>false,payableReserveHours:(a,b)=>Math.max(0,(b-a)/36e5),
   perDiemConfig:()=>({rates:{domestic:{mainMeal:100,currency:'BRL',label:'SYNTHETIC'}},domesticBreakfast:25,domesticMainMealSource:'synthetic',domesticBreakfastSource:'synthetic',breakfastPercent:.25,exchangeRates:{BRL:1},source:'SYNTHETIC NOT A TARIFF',act:{version:'SYNTHETIC'}}),
   loadAirportPerDiemOverrides:()=>({}),resolvePerDiemRule:origin=>({rateKey:'domestic',airport:origin,reason:'synthetic fixture'}),readOptionalNumberSetting:()=>null});
 vm.runInContext(ts.transpileModule(functions.map(n=>n.getText(home)).join('\n')+'\nglobalThis.subject={buildLegs,calculateSalary,calculatePerDiem,financialFlightRule,eventStartDateTime,eventEndDateTime,nightHoursInsideWindow,isSundayOrConfiguredHoliday,moneyBRL};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);

 const fixed={basePay:1000,fixedAdditions:0,dayKmMetric:1,nightKmMetric:2,chiefPerSector:0,instructorPerSector:0,reserveHourMetric:1,standbyHourMetric:1,inssDeduction:0,irrfDeduction:0,otherDeductions:0,fgtsRate:0,configured:true,baseConfigured:true,requiresManualFunction:false,source:'SYNTHETIC NOT A TARIFF'};
 context.loadActCompensationConfig=()=>fixed;context.payableReserveHours=modules.load('financialReserveCredits').payableReserveHours;
 const activity=(date,type='HSB',report='09:00',release='13:00',source='published')=>({date,dayOfWeek:'SYN',year:2032,month:10,type,pairingCode:type,base:'BSB',dutyReport:report,dutyDebrief:release,dutyReportSource:source,dutyDebriefSource:source,legs:[],dutyHours:null,flyingHours:0,isNextDay:false,hotel:null,rawText:'SYNTHETIC ONLY'});
 const roster=days=>({year:2032,month:10,base:'BSB',rank:'CC',airline:'LA',days});
 const run=raw=>context.subject.calculateSalary(context.subject.buildLegs(raw),raw);
 const literalReserve=activity('20/10/2032','ASB','04:10','10:10'),literalStandby=activity('21/10/2032'),unknownStandby=activity('22/10/2032','HSB',null,null,'absent');
 const outputs=[];
 for(const timezone of ['UTC','America/Sao_Paulo','Asia/Tokyo']){
  process.env.TZ=timezone;
  const complete=run(roster([literalReserve,literalStandby]));assert.equal(complete.reserveHours,6);assert.equal(complete.standbyHours,4);assert.equal(complete.gross,1010);
  for(const type of ['ASB','HSB','HSBE'])for(const [name,report,release,source] of [['absent',null,null,'absent'],['report-missing',null,'13:00','published'],['release-missing','09:00',null,'published'],['invalid','bad','13:00','published'],['estimated','09:00','13:00','estimated'],['unknown','09:00','13:00','unknown'],['legacy','09:00','13:00',undefined]]){
   const day=activity('22/10/2032',type,report,release,source);if(name==='legacy'){delete day.dutyReportSource;delete day.dutyDebriefSource;}
   const raw=roster([day]),before=JSON.stringify(raw),events=context.subject.buildLegs(raw),salary=context.subject.calculateSalary(events,raw),assessment=type==='ASB'?salary.reserveAssessment:salary.standbyAssessment;
   assert.equal(assessment.pendingCount,1);assert.equal(assessment.knownCount,0);assert.ok(Number.isNaN(assessment.amount));assert.ok(Number.isNaN(salary.gross));assert.ok(Number.isNaN(salary.net));assert.equal(assessment.rows[0].hours,null);assert.equal(assessment.rows[0].value,null);assert.equal(JSON.stringify(raw),before);
   if(name==='absent')assert.ok(events.some(e=>e.canonical.startDateTime.endsWith('T03:00:00.000Z')&&e.canonical.endDateTime.endsWith('T02:59:00.000Z')),'canonical23h59 fallback reproduced without changing it');
   const restored=run(JSON.parse(JSON.stringify(raw)));assert.equal(restored.standbyAssessment.pendingCount+restored.reserveAssessment.pendingCount,1);
   outputs.push({timezone,type,name,raw,canonical:events.map(e=>e.canonical),salary:{gross:salary.gross,reserve:salary.reserve,standby:salary.standby},assessment});
  }
  const mixedRaw=roster([literalReserve,literalStandby,unknownStandby]),mixed=run(mixedRaw);assert.equal(mixed.reserve,6);assert.equal(mixed.standbyAssessment.knownAmount,4);assert.equal(mixed.standbyAssessment.knownCount,1);assert.equal(mixed.standbyAssessment.pendingCount,1);assert.ok(Number.isNaN(mixed.standby));assert.ok(Number.isNaN(mixed.gross));
  const mixedReserve=run(roster([literalReserve,activity('22/10/2032','ASB','04:10','10:10','estimated')]));assert.equal(mixedReserve.reserveAssessment.knownAmount,6);assert.ok(Number.isNaN(mixedReserve.reserve));
  const validEvents=context.subject.buildLegs(roster([literalReserve]));const dedup=context.subject.calculateSalary([...validEvents,...validEvents],roster([literalReserve]));assert.equal(dedup.reserve,6);
  const overnight=run(roster([activity('22/10/2032','HSB','22:00','03:00')]));assert.equal(overnight.standbyHours,5);
  const adjacent=run(roster([literalReserve,{...activity('22/09/2032','ASB','04:10','10:10'),month:9}]));assert.equal(adjacent.reserve,6,'nominal competence unchanged');
  const activated=roster([{...literalReserve,legs:[]},{...activity('20/10/2032','VOO','07:25','10:10'),legs:[{flightNumber:'LA9001',origin:'BSB',destination:'GRU',departureTime:'08:20',arrivalTime:'09:40',workType:'OP'}]}]);assert.ok(Math.abs(run(activated).reserveHours-(4+10/60))<1e-10,'existing reserve credit stops at first activating flight');
  fixed.reserveHourMetric=0;const missingZeroRate=run(roster([activity('22/10/2032','ASB',null,null,'absent')]));assert.ok(Number.isNaN(missingZeroRate.gross),'unknown interval does not become zero at zero metric');assert.equal(run(roster([literalReserve])).reserve,0,'proved interval at real zero metric stays zero');fixed.reserveHourMetric=1;
  const diag=modules.load('salaryCalculationDiagnostic').salaryCalculationDiagnostic([{month:'2032-10',days:mixedRaw.days.length,configured:true,baseConfigured:true,requiresManualFunction:false,variable:mixed.production+mixed.reserve+mixed.standby,variableComplete:true,pendingActivityCount:1}],modules.load('financialHistoryPeriods').financialRange('month','2032-10','','',''),[]);assert.equal(diag.ready,false);assert.equal(diag.variable,null);assert.match(diag.reasons.join(' '),/reserva\/sobreaviso/);
  outputs.push({timezone,name:'mixed-valid-subtotals',raw:mixedRaw,reserve:mixed.reserve,standbyKnown:mixed.standbyAssessment.knownAmount,gross:mixed.gross,diagnostic:diag});
 }
 // Exact preexisting missing-HSB counterproof, real parser -> canonical -> Home.
 const fixture=JSON.parse(fs.readFileSync('scripts/fixtures/salary-night-3900-4527.json','utf8'));
 const parsed=parser.parseAimsRoster(fixture.sourceText.replace('20Oct Tue','09Oct Fri HSB 02:00 BSB 02:40\n20Oct Tue'));
 const raw={...parsed,days:parsed.days.filter(d=>d.date==='09/10/2032')},events=context.subject.buildLegs(raw);assert.equal(raw.days[0].dutyReport,null);assert.equal(raw.days[0].dutyDebrief,null);
 const base=ts.createSourceFile('baselineHome.tsx',execFileSync('git',['show','be292f81a7945c9a038d0cac95b53b8a8b421463:client/src/pages/Home.tsx'],{encoding:'utf8'}),99,true,4);const baselineFunction=base.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='calculateSalary');vm.runInContext(ts.transpileModule(baselineFunction.getText(base).replace('function calculateSalary(','function baselineSalary(')+'\nglobalThis.baselineSalary=baselineSalary;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 const previous=context.baselineSalary(events,raw),corrected=context.subject.calculateSalary(events,raw);assert.ok(Math.abs(previous.standbyHours-(23+59/60))<1e-10);assert.ok(Math.abs(previous.gross-(1000+23+59/60))<1e-10);assert.ok(Number.isNaN(corrected.gross));outputs.push({name:'published-base-counterproof',raw,events,previous:{standbyHours:previous.standbyHours,gross:previous.gross},corrected:{standbyHours:corrected.standbyHours,gross:corrected.gross,assessment:corrected.standbyAssessment}});
 fs.mkdirSync('artifacts/salary-activity-evidence',{recursive:true});fs.writeFileSync('artifacts/salary-activity-evidence/report.json',JSON.stringify({synthetic:true,outputs},null,2));console.log('PASS real parser/canonical/Home salary: unknown ASB/HSB/HSBE origin/timing blocks aggregate across3TZ, valid subtotals retained, no zero masking, dedup/overnight/nominal periods/activation credit and published23h59 counterproof');
}finally{modules.cleanup();}
