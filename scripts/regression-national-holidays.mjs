import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { loadClientModules } from './lib/ts-module-harness.mjs';

const modules=loadClientModules({files:['client/src/lib/brazilNationalHolidays.ts','client/src/lib/aimsParser.ts','client/src/lib/canonicalRoster.ts','client/src/lib/rosterDisplayDate.ts','client/src/lib/financialIntervalEvidence.ts','client/src/lib/compensationPolicy.ts','client/src/lib/financialJourneyGrouping.ts','client/src/lib/financialForecastPeriods.ts','client/src/lib/financialAmounts.ts'],prefix:'independent-extra-financial-'});
try {
 const parser=modules.load('aimsParser'),canonical=modules.load('canonicalRoster');
 const names=['buildLegs','projectedFlightQuality','dedupeProjectedLegs','eventStartDateTime','eventEndDateTime','isOperationalEvent','flightWorkType','financialEventCode','financialFlightRule','durationHours','nightHoursInsideWindow','isSundayOrConfiguredHoliday','calculateSalary','calculatePerDiem','moneyBRL'];
 const home=ts.createSourceFile('Home.tsx',fs.readFileSync('client/src/pages/Home.tsx','utf8'),99,true,4);
 const functions=home.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text));assert.equal(functions.length,names.length);
 const context=vm.createContext({console,Date,Intl,...modules.load('brazilNationalHolidays'),...canonical,...modules.load('rosterDisplayDate'),...modules.load('financialIntervalEvidence'),...modules.load('compensationPolicy'),...modules.load('financialJourneyGrouping'),...modules.load('financialForecastPeriods'),...modules.load('financialAmounts'),
   storage:{get:(_k,f)=>f},pad2:n=>String(n).padStart(2,'0'),safe:(v,f='—')=>String(v??'').trim()||f,city:v=>v,normalizedAirlineCode:()=> 'LA',airlineNameFor:()=> 'SYNTHETIC',addMinutesToTime:()=>'',applyPresentationManagement:x=>x,
   dateChip:d=>d.toISOString().slice(0,10),moneyCurrency:(v,c)=>`${c} ${v}`,
   loadActCompensationConfig:()=>({basePay:1000,fixedAdditions:0,dayKmMetric:1,nightKmMetric:2,chiefPerSector:0,instructorPerSector:0,reserveHourMetric:1,standbyHourMetric:1,inssDeduction:0,irrfDeduction:0,otherDeductions:0,fgtsRate:0,configured:true,source:'SYNTHETIC NOT A TARIFF'}),
   flightDistanceKmFromEvent:e=>({'LA9001':100,'LA9002':200,'LA9003':300,'LA9011':400,'LA9012':500,'LA9013':600}[e.flightNumber]||100),userIsFirstCcm:()=>false,payableReserveHours:(a,b)=>Math.max(0,(b-a)/36e5),
   perDiemConfig:()=>({rates:{domestic:{mainMeal:100,currency:'BRL',label:'SYNTHETIC'}},domesticBreakfast:25,domesticMainMealSource:'synthetic',domesticBreakfastSource:'synthetic',breakfastPercent:.25,exchangeRates:{BRL:1},source:'SYNTHETIC NOT A TARIFF',act:{version:'SYNTHETIC'}}),
   loadAirportPerDiemOverrides:()=>({}),resolvePerDiemRule:origin=>({rateKey:'domestic',airport:origin,reason:'synthetic fixture'}),readOptionalNumberSetting:()=>null});
 vm.runInContext(ts.transpileModule(functions.map(n=>n.getText(home)).join('\n')+'\nglobalThis.subject={buildLegs,calculateSalary,calculatePerDiem,financialFlightRule,eventStartDateTime,eventEndDateTime,nightHoursInsideWindow,isSundayOrConfiguredHoliday,moneyBRL};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 const calendar=modules.load('brazilNationalHolidays');
 const outputs=[];
 for(const timezone of ['UTC','America/Sao_Paulo','Asia/Tokyo']) {
  process.env.TZ=timezone;
  for(const year of [2024,2026,2027,2032]) for(const date of ['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25']) assert.ok(calendar.brazilNationalHolidayName(`${year}-${date}`));
  assert.equal(calendar.brazilNationalHolidayName('2023-11-20'),null);
  for(const iso of ['2026-02-17','2026-06-04','2026-10-13','2026-02-30','12/10/2026','']) assert.equal(calendar.brazilNationalHolidayName(iso),null);
  const roster={year:2026,month:10,days:[]};
  const event=(iso,kind='flight',code='OP')=>({id:kind,kind,flightNumber:'CAL9000',origin:'BSB',destination:'GRU',date:new Date(iso+'T12:00:00-03:00'),day:{date:iso.split('-').reverse().join('/'),type:code},leg:{workType:code},operationalTimeZone:'America/Sao_Paulo',canonical:{id:kind,date:iso,startDateTime:iso+'T12:00:00-03:00',endDateTime:iso+'T14:00:00-03:00'}});
  context.loadActCompensationConfig=()=>({basePay:1000,fixedAdditions:50,dayKmMetric:1,nightKmMetric:2.7,chiefPerSector:11,instructorPerSector:0,reserveHourMetric:7,standbyHourMetric:5,inssDeduction:0,irrfDeduction:0,otherDeductions:0,fgtsRate:0,configured:true,source:'SYNTHETIC'});
  context.userIsFirstCcm=()=>true;
  const salary=iso=>context.subject.calculateSalary([event(iso),event(iso,'activity','RES'),{...event(iso,'activity','HSB'),id:'standby'}],roster);
  const regular=salary('2026-10-13'),holiday=salary('2026-10-12'),sunday=salary('2026-10-11');
  assert.equal(regular.rows[0].production,100);assert.equal(holiday.rows[0].production,270);assert.equal(sunday.rows[0].production,270);
  for(const key of ['reserve','standby','chief']) assert.equal(regular[key],holiday[key],key+' is not multiplied');
  assert.equal(holiday.gross-regular.gross,170,'only existing kilometre tariff classification changes; not a 2x multiplier');
  const saved=context.storage;
  context.storage={get:(k,f)=>k==='crewcheck_local_holiday_dates'?'2026-10-12,2026-10-12,2026-10-13':f};
  assert.equal(salary('2026-10-12').gross,holiday.gross,'manual + national applies once');
  assert.equal(salary('2026-10-13').gross,holiday.gross,'manual list preserved');context.storage=saved;
  assert.equal(calendar.classifyBrazilCalendarDate('2026-11-15',['2026-11-15']).special,true,'Sunday + national + manual remains one boolean');
  const crossed={...event('2026-10-12'),canonical:{startDateTime:'2026-10-13T01:00:00Z'},operationalTimeZone:'America/Sao_Paulo'};
  assert.equal(context.subject.isSundayOrConfiguredHoliday(crossed),true);
  assert.equal(context.subject.isSundayOrConfiguredHoliday({...crossed,operationalTimeZone:'UTC'}),false,'explicit operational zone controls existing start-date policy');
  assert.equal(context.subject.isSundayOrConfiguredHoliday({...crossed,operationalTimeZone:'Invalid/Zone'}),null);
  const meals=iso=>context.subject.calculatePerDiem([event(iso)],roster,new Date('2026-10-30T12:00:00-03:00'));
  assert.deepEqual(Array.from(meals('2026-10-12').rows,r=>r.value),Array.from(meals('2026-10-13').rows,r=>r.value),'diárias unchanged');
  outputs.push({timezone,regularGross:regular.gross,holidayGross:holiday.gross,reserve:holiday.reserve,standby:holiday.standby,chief:holiday.chief,production:holiday.rows[0].production});
 }
 const css=fs.readFileSync('client/src/components/v1391/roster-layout.css','utf8');
 assert.match(css,/data-calendar-special="true"\]\[data-today="false"/);
 assert.match(css,/button:focus-visible/);
 fs.mkdirSync('artifacts/national-holidays',{recursive:true});fs.writeFileSync('artifacts/national-holidays/report.json',JSON.stringify({synthetic:true,outputs},null,2));
 console.log('PASS national holidays, years, 3 device zones, operational zone boundaries, manual dedup and excluded payment invariants');
} finally {modules.cleanup();}
