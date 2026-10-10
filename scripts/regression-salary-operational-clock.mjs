import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { loadClientModules } from './lib/ts-module-harness.mjs';

const modules=loadClientModules({files:['client/src/lib/aimsParser.ts','client/src/lib/canonicalRoster.ts','client/src/lib/rosterDisplayDate.ts','client/src/lib/financialIntervalEvidence.ts','client/src/lib/compensationPolicy.ts','client/src/lib/financialJourneyGrouping.ts','client/src/lib/financialForecastPeriods.ts','client/src/lib/financialAmounts.ts'],prefix:'independent-extra-financial-'});
try {
 const parser=modules.load('aimsParser'),canonical=modules.load('canonicalRoster');
 const names=['buildLegs','projectedFlightQuality','dedupeProjectedLegs','eventStartDateTime','eventEndDateTime','isOperationalEvent','flightWorkType','financialEventCode','financialFlightRule','durationHours','nightHoursInsideWindow','isSundayOrConfiguredHoliday','calculateSalary','calculatePerDiem','moneyBRL'];
 const home=ts.createSourceFile('Home.tsx',fs.readFileSync('client/src/pages/Home.tsx','utf8'),99,true,4);
 const functions=home.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text));assert.equal(functions.length,names.length);
 const context=vm.createContext({console,Date,Intl,...canonical,...modules.load('rosterDisplayDate'),...modules.load('financialIntervalEvidence'),...modules.load('compensationPolicy'),...modules.load('financialJourneyGrouping'),...modules.load('financialForecastPeriods'),...modules.load('financialAmounts'),
   storage:{get:(_k,f)=>f},pad2:n=>String(n).padStart(2,'0'),safe:(v,f='—')=>String(v??'').trim()||f,city:v=>v,normalizedAirlineCode:()=> 'LA',airlineNameFor:()=> 'SYNTHETIC',addMinutesToTime:()=>'',applyPresentationManagement:x=>x,
   dateChip:d=>d.toISOString().slice(0,10),moneyCurrency:(v,c)=>`${c} ${v}`,
   loadActCompensationConfig:()=>({basePay:1000,fixedAdditions:0,dayKmMetric:1,nightKmMetric:2,chiefPerSector:0,instructorPerSector:0,reserveHourMetric:1,standbyHourMetric:1,inssDeduction:0,irrfDeduction:0,otherDeductions:0,fgtsRate:0,configured:true,source:'SYNTHETIC NOT A TARIFF'}),
   flightDistanceKmFromEvent:e=>({'LA9001':100,'LA9002':200,'LA9003':300,'LA9011':400,'LA9012':500,'LA9013':600}[e.flightNumber]||100),userIsFirstCcm:()=>false,payableReserveHours:(a,b)=>Math.max(0,(b-a)/36e5),
   perDiemConfig:()=>({rates:{domestic:{mainMeal:100,currency:'BRL',label:'SYNTHETIC'}},domesticBreakfast:25,domesticMainMealSource:'synthetic',domesticBreakfastSource:'synthetic',breakfastPercent:.25,exchangeRates:{BRL:1},source:'SYNTHETIC NOT A TARIFF',act:{version:'SYNTHETIC'}}),
   loadAirportPerDiemOverrides:()=>({}),resolvePerDiemRule:origin=>({rateKey:'domestic',airport:origin,reason:'synthetic fixture'}),readOptionalNumberSetting:()=>null});
 vm.runInContext(ts.transpileModule(functions.map(n=>n.getText(home)).join('\n')+'\nglobalThis.subject={buildLegs,calculateSalary,calculatePerDiem,financialFlightRule,eventStartDateTime,eventEndDateTime,nightHoursInsideWindow,isSundayOrConfiguredHoliday,moneyBRL};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 const fixture=JSON.parse(fs.readFileSync('scripts/fixtures/salary-night-3900-4527.json','utf8'));
 const text=fixture.sourceText;
 const outputs=[];
 for(const timezone of['UTC','America/Sao_Paulo','Asia/Tokyo']){
   process.env.TZ=timezone;
   const parsed=parser.parseAimsRoster(text);
   const night=context.subject.nightHoursInsideWindow;
   const cases=[
     ['2032-02-28T21:30:00-03:00','2032-02-29T05:30:00-03:00','Etc/GMT+3',7],
     ['2032-01-31T23:30:00-03:00','2032-02-01T01:30:00-03:00','America/Sao_Paulo',2],
     ['2032-02-01T21:59:30-03:00','2032-02-01T22:00:30-03:00','Etc/GMT+3',1/120],
     ['2032-02-02T04:59:30-03:00','2032-02-02T05:00:30-03:00','Etc/GMT+3',1/120],
     ['2032-02-27T22:00:00-03:00','2032-02-29T05:00:00-03:00','Etc/GMT+3',14],
     ['2032-03-13T22:00:00-05:00','2032-03-14T05:00:00-04:00','America/New_York',6],
     ['2032-11-06T22:00:00-04:00','2032-11-07T05:00:00-05:00','America/New_York',8],
     ['2032-11-07T01:30:00-04:00','2032-11-07T01:30:00-05:00','America/New_York',1],
     ['2032-02-01T22:00:00+05:45','2032-02-02T05:00:00+05:45','Asia/Kathmandu',7],
     ['2032-02-02T10:00:00-03:00','2032-02-02T12:00:00-03:00','Asia/Tokyo',2],
   ];
   for(const [a,b,zone,expected] of cases)assert.ok(Math.abs(night(a,b,zone)-expected)<1e-10,zone+' exact elapsed night hours');
   for(const [a,b,zone] of [
     ['2032-11-07T01:30:00','2032-11-07T02:30:00','America/New_York'],
     ['2032-03-14T02:30:00','2032-03-14T04:00:00','America/New_York'],
     ['2032-02-30T22:00:00Z','2032-03-01T05:00:00Z','UTC'],
     [undefined,'2032-02-02T05:00:00Z','UTC'],
     ['2032-02-02T05:00:00Z','2032-02-01T22:00:00Z','UTC'],
     ['2032-02-01T22:00:00Z','2032-02-02T05:00:00Z',''],
     ['2032-02-01T22:00:00Z','2032-02-02T05:00:00Z','Invalid/Zone'],
   ])assert.ok(Number.isNaN(night(a,b,zone)),'unknown or ambiguous timing is not zero');
   const calendar=context.subject.isSundayOrConfiguredHoliday;
   const timed=stamp=>({canonical:{startDateTime:stamp},operationalTimeZone:'America/Sao_Paulo'});
   assert.equal(calendar(timed('2032-02-01T12:30:00-03:00')),true,'Sunday BRT despite device Saturday/Monday');
   assert.equal(calendar(timed('2032-01-31T12:30:00-03:00')),false,'Saturday BRT despite device Sunday');
   const savedStorage=context.storage;context.storage={get:(key,f)=>key==='crewcheck_local_holiday_dates'?'2032-02-02':f};
   assert.equal(calendar(timed('2032-02-02T12:30:00-03:00')),true,'configured holiday keyed by operational date');
   assert.equal(calendar(timed('2032-02-01T23:30:00-03:00')),true,'Sunday remains Sunday at late operational clock');
   assert.equal(calendar({canonical:{startDateTime:'2032-02-02T00:30:00'},operationalTimeZone:'America/Sao_Paulo'}),null,'ambiguous calendar cannot infer regular rate');
   const clockFlight=(iso,start,end,zone='America/Sao_Paulo')=>({id:'CAL-SYN',kind:'flight',flightNumber:'CAL9000',origin:'BSB',destination:'GRU',date:new Date(iso+'T12:00:00-03:00'),day:{date:iso.split('-').reverse().join('/')},leg:{workType:'OP'},operationalTimeZone:zone,canonical:{id:'CAL-SYN',date:iso,startDateTime:start,endDateTime:end}});
   const payrollRoster={year:2032,month:2,days:[{date:'02/02/2032'}]};
   const payroll=(event,r=payrollRoster)=>context.subject.calculateSalary([event],r);
   assert.equal(payroll(clockFlight('2032-02-02','2032-02-02T12:30:00-03:00','2032-02-02T13:30:00-03:00')).gross,1200,'holiday premium preserves original rate');
   context.storage=savedStorage;
   assert.equal(payroll(clockFlight('2032-02-01','2032-02-01T12:30:00-03:00','2032-02-01T13:30:00-03:00')).gross,1200,'Sunday premium preserves original rate');
   assert.equal(payroll(clockFlight('2032-02-02','2032-02-02T12:30:00-03:00','2032-02-02T13:30:00-03:00')).gross,1100,'regular day remains regular rate');
   const crossing=clockFlight('2032-01-31','2032-01-31T23:30:00-03:00','2032-02-01T01:30:00-03:00');
   const january=payroll(crossing,{...payrollRoster,month:1});assert.equal(january.gross,1200);assert.equal(january.rows[0].iso,'2032-01-31');assert.equal(payroll(crossing).rows.length,0,'night interpretation does not move nominal competence');
   for(const [start,end,zone] of [['2032-02-02T12:30:00','2032-02-02T13:30:00','America/Sao_Paulo'],['','2032-02-02T13:30:00Z','America/Sao_Paulo'],['2032-02-02T12:30:00Z','2032-02-02T13:30:00Z',null],['2032-02-02T12:30:00Z','2032-02-02T13:30:00Z','Invalid/Zone']]){
     const invalid=payroll(clockFlight('2032-02-02',start,end,zone));assert.equal(invalid.rows[0].timeKnown,false);assert.ok(Number.isNaN(invalid.gross),'unproven timing cannot become regular/day production');
   }


   const selected={...parsed,days:parsed.days.filter(d=>['20/10/2032','21/10/2032'].includes(d.date))};
   const roster={...selected,days:selected.days.map(d=>({...d,dutyReportSource:'published',dutyDebriefSource:'published'}))};
   const before=JSON.stringify(roster);
   const events=context.subject.buildLegs(roster);
   const salary=context.subject.calculateSalary(events,roster);
   const perdiem=context.subject.calculatePerDiem(events,roster,new Date('2032-10-21T12:00:00-03:00'));
   // Counterproofs use the real raw-roster -> buildLegs -> salary chain.
   const counterproof=JSON.parse(fs.readFileSync('scripts/fixtures/salary-clock-missing-counterproofs.json','utf8'));
   const rawDay=counterproof.missingArrivalRoster.days[0], rawLeg=rawDay.legs[0];
   const timingRoster=(departureTime,arrivalTime,mixed=false)=>({...counterproof.missingArrivalRoster,days:[{...rawDay,dutyReport:'04:10',dutyDebrief:'10:00',legs:[
     {...rawLeg,flightNumber:'CAL9000',departureTime,arrivalTime},
     ...(mixed?[{...rawLeg,flightNumber:'CAL9001',origin:rawLeg.destination,destination:rawLeg.origin,departureTime:'08:00',arrivalTime:'09:00'}]:[]),
   ]}]});
   for(const {departureTime:departure,arrivalTime:arrival} of counterproof.variants){
     const raw=timingRoster(departure,arrival), original=JSON.stringify(raw), projected=context.subject.buildLegs(raw);
     const bad=context.subject.calculateSalary(projected,raw);assert.equal(bad.rows.length,1);
     assert.equal(projected.find(e=>e.kind==='flight').salaryClockKnown,false,'raw timing evidence captured before canonical fallbacks');
     assert.equal(bad.rows[0].timeKnown,false);assert.ok(Number.isNaN(bad.gross),'fabricated canonical interval cannot prove salary');assert.ok(Number.isNaN(bad.nightHours),'fabricated canonical clock cannot prove night hours');
     assert.equal(JSON.stringify(raw),original,'raw source preserved');
   }
   const mixedRoster=timingRoster('05:00','',true),mixedSalary=context.subject.calculateSalary(context.subject.buildLegs(mixedRoster),mixedRoster);
   assert.equal(mixedSalary.rows.length,2);assert.equal(mixedSalary.rows.filter(row=>Number.isFinite(row.total))[0].total,100);assert.ok(Number.isNaN(mixedSalary.gross));
   const launch=ts.createSourceFile('RosterLaunchView.tsx',fs.readFileSync('client/src/components/v1391/RosterLaunchView.tsx','utf8'),99,true,4);
   const launchFunctions=launch.statements.filter(node=>ts.isFunctionDeclaration(node)&&['salaryRowsTotal','money'].includes(node.name?.text));assert.equal(launchFunctions.length,2);
   const launchStatements=[],launchExpressions=[];
   function findLaunch(node){
     if(ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>['production','groupProduction'].includes(d.name.getText(launch))))launchStatements.push(node.getText(launch));
     if(ts.isJsxExpression(node)&&node.expression&&/^(?:financeAvailable|scopedFinance\?\.salary\?\.configured)\s*\?/.test(node.expression.getText(launch)) && /money\((?:groupProduction|production)\)/.test(node.expression.getText(launch)))launchExpressions.push(node.expression.getText(launch));
     ts.forEachChild(node,findLaunch);
   }findLaunch(launch);assert.equal(launchStatements.length,2);assert.equal(launchExpressions.length,3);
   const evaluateLaunch=rows=>{const c=vm.createContext({selectedSalaryRows:rows,groupEarnings:rows,financeAvailable:true,scopedFinance:{salary:{configured:true}}});
     vm.runInContext(ts.transpileModule(launchFunctions.map(n=>n.getText(launch)).join('\n')+'\n'+launchStatements.join('\n')+'\nglobalThis.values=['+launchExpressions.join(',')+'];globalThis.total=production;globalThis.dayTotal=groupProduction;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);return c;};
   const partial=evaluateLaunch(mixedSalary.rows);assert.equal(partial.total,null);assert.equal(partial.dayTotal,null);assert.deepEqual(Array.from(partial.values),['Não calculável','Não calculável','Não calculável']);
   const complete=evaluateLaunch(mixedSalary.rows.filter(r=>r.timeKnown));assert.equal(complete.total,100);assert.equal(complete.dayTotal,100);
   const compare=home.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='CompareRosterView'),compareStatements=[],compareExpressions=[];
   function findCompare(node){
     if(ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(home)==='financial'))compareStatements.push(node.getText(home));
     if(ts.isJsxExpression(node)&&node.expression&&(/^financial\?\.salaryReady.*moneyBRL/.test(node.expression.getText(home))||/^(?:!financial\?\.salaryReady|financial\?\.plannedGuaranteeReview)/.test(node.expression.getText(home))))compareExpressions.push(node.expression.getText(home));
     ts.forEachChild(node,findCompare);
   }findCompare(compare);assert.equal(compareStatements.length,1);assert.equal(compareExpressions.length,3);
   const validRoster=timingRoster('05:00','06:45'),validSalary=context.subject.calculateSalary(context.subject.buildLegs(validRoster),validRoster);
   const compareContext=vm.createContext({useMemo:f=>f(),planned:{roster:'before'},bundle:{roster:'after'},comparison:{summary:{periodMatches:true}},financeSnapshot:r=>({salary:r==='before'?validSalary:mixedSalary,perdiem:{nativeSummary:{}}}),nativeForecastDelta:()=>null,moneyBRL:context.subject.moneyBRL});
   vm.runInContext(ts.transpileModule(compareStatements.join('\n')+'\nglobalThis.financial=financial;globalThis.labels=['+compareExpressions.join(',')+'];',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,compareContext);
   assert.equal(compareContext.financial.salaryReady,false);assert.equal(compareContext.financial.variableDelta,null);assert.equal(compareContext.financial.plannedGuaranteeReview,null);
   assert.match(compareContext.labels[0],/Não calculável/);assert.equal(compareContext.labels[1],'Comparação financeira pendente');assert.equal(compareContext.labels[2],'—');assert.doesNotMatch(compareContext.labels.join(' '),/Sem redução|R\$ 0/);
   const validCompareContext=vm.createContext({useMemo:f=>f(),planned:{roster:'before'},bundle:{roster:'after'},comparison:{summary:{periodMatches:true}},financeSnapshot:()=>({salary:validSalary,perdiem:{nativeSummary:{}}}),nativeForecastDelta:()=>null,moneyBRL:context.subject.moneyBRL});
   vm.runInContext(ts.transpileModule(compareStatements.join('\n')+'\nglobalThis.financial=financial;globalThis.labels=['+compareExpressions.join(',')+'];',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,validCompareContext);
   assert.equal(validCompareContext.financial.salaryReady,true);assert.equal(validCompareContext.financial.variableDelta,0);assert.equal(validCompareContext.labels[1],'Sem redução detectada','complete unchanged amounts retain the existing valid claim');
   assert.equal(context.subject.moneyBRL(NaN),'Não calculável');assert.equal(context.subject.moneyBRL(null),'Não calculável');assert.match(context.subject.moneyBRL(0),/^R\$ 0/,'known zero remains valid');
   const previousRoles=events.map(e=>e.kind==='flight'?{...e,leg:{...e.leg,workType:['LA9001','LA9012'].includes(e.flightNumber)?'PS':'OP'}}:e);
   const beforeRoleCorrection=context.subject.calculateSalary(previousRoles,roster);
   const withoutRaw={...roster,days:roster.days.map(d=>({...d,rawText:''}))};
   const control=context.subject.calculateSalary(context.subject.buildLegs(withoutRaw),withoutRaw);
   assert.equal(salary.gross,fixture.expectedCorrectedGross);
   assert.deepEqual(Array.from(salary.rows,r=>r.production),fixture.expectedCorrectedProduction);
   assert.equal(salary.nightHours,0);
   assert.ok(salary.rows.every(r=>r.timeKnown));
   assert.equal(JSON.stringify(roster),before,'clock interpretation never rewrites roster provenance or roles');
   assert.equal(salary.rows.length,6);assert.equal(Math.round(salary.blockHours*60),620);
   assert.equal(salary.rows.filter(r=>r.workType==='PS').length,2);
   const duplicated=context.subject.calculateSalary(context.subject.buildLegs({...roster,days:[...roster.days,...roster.days]}),roster);
   assert.equal(duplicated.rows.length,6);assert.equal(duplicated.gross,salary.gross);
   const allOpEvents=events.map(e=>e.kind==='flight'?{...e,leg:{...e.leg,workType:'OP'}}:e);
   const opMeals=context.subject.calculatePerDiem(allOpEvents,roster,new Date('2032-10-21T12:00:00-03:00'));
   assert.equal(JSON.stringify(perdiem.rows),JSON.stringify(opMeals.rows));
   outputs.push({timezone,instants:events.filter(e=>e.kind==='flight').map(e=>({flight:e.flightNumber,workType:e.leg?.workType,startUTC:context.subject.eventStartDateTime(e).toISOString(),endUTC:context.subject.eventEndDateTime(e).toISOString(),startBRT:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'medium'}).format(context.subject.eventStartDateTime(e)),endBRT:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'medium'}).format(context.subject.eventEndDateTime(e))})),parsed:roster.days.map(d=>({date:d.date,rawText:d.rawText,roles:d.legs.map(l=>l.workType)})),salary:salary.rows.map(r=>({flight:r.flight,workType:r.workType,extra:r.extraFlight,production:r.production,payRule:r.payRule})),gross:salary.gross,beforeRoleCorrection:beforeRoleCorrection.gross,roleCorrectionDelta:salary.gross-beforeRoleCorrection.gross,blockHours:salary.blockHours,withoutDayRawText:control.rows.map(r=>({flight:r.flight,workType:r.workType,extra:r.extraFlight,production:r.production})),perdiem:perdiem.rows.map(r=>({iso:r.iso,label:r.label,eventId:r.eventId,value:r.value})),perdiemComplete:perdiem.nativeSummary.complete});
 }
 fs.mkdirSync('artifacts/salary-operational-clock',{recursive:true});fs.writeFileSync('artifacts/salary-operational-clock/report.json',JSON.stringify({synthetic:true,outputs,nightBoundaryCasesPerTimezone:10,invalidCasesPerTimezone:7,calendarCasesPerTimezone:5,rawClockCounterproofsPerTimezone:3,mixedConsumersPerTimezone:4},null,2));
 console.log('PASS exact3900 salary/parser fixture, OP/PS/dedup/per-diem invariants, night/calendar boundaries and ambiguous/missing inputs across3device timezones');
} finally {modules.cleanup();}
