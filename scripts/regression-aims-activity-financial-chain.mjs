import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import { loadClientModules } from './lib/ts-module-harness.mjs';

const modules=loadClientModules({files:['client/src/lib/aimsParser.ts','client/src/lib/canonicalRoster.ts','client/src/lib/rosterDisplayDate.ts','client/src/lib/financialIntervalEvidence.ts','client/src/lib/compensationPolicy.ts','client/src/lib/financialJourneyGrouping.ts','client/src/lib/financialForecastPeriods.ts','client/src/lib/financialAmounts.ts'],expose:{aimsParser:['parseASB','parseStandby','parseGroundActivity','parseCRM']},prefix:'aims-activity-financial-'});
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

 const asbFallback=parser.parseASB(['ASB','04:10']);assert.equal(asbFallback.dutyDebrief,'10:10');assert.equal(asbFallback.dutyDebriefSource,'estimated','six-hour fallback equal to literal release stays estimated');
 const hsbInferred=parser.parseStandby(['HSB','09:00','ASB','13:00','19:00'],'HSB');assert.equal(hsbInferred.dutyDebrief,'13:00');assert.equal(hsbInferred.dutyDebriefSource,'estimated','next activity does not prove standby end');
 const hsbAbsent=parser.parseStandby(['HSB','09:00'],'HSB');assert.equal(hsbAbsent.dutyDebrief,null);assert.equal(hsbAbsent.dutyDebriefSource,'absent');
 const repeatedGround=parser.parseGroundActivity(['CRM','07:00','07:00'],'CRM');assert.equal(repeatedGround.dutyDebriefSource,'estimated','repeated single clock does not prove second boundary');
 const report=JSON.parse(fs.readFileSync(process.env.AIMS_DUTY_SOURCE_REPORT||'artifacts/aims-duty-source/report.json','utf8'));
 const baselineRoot=process.env.CREWCHECK_BASELINE_REPO;
 const baseline=baselineRoot?(await import(pathToFileURL(path.join(baselineRoot,'scripts/lib/ts-module-harness.mjs')).href)).loadClientModules({files:['client/src/lib/aimsParser.ts'],prefix:'activity-source-baseline-'}):null;
 const outputs=[];
 try {
  for(const proof of report.results.filter(r=>['literal','activity-start-only','activity-no-clocks','activity-end-only'].includes(r.variant))){
   process.env.TZ=proof.timezoneId;
   const base=baseline?.load('aimsParser').parseAimsRoster(proof.roster.rawText);
   const days=proof.roster.days.filter(d=>!d.legs.length);assert.equal(days.length,17);
   for(const day of days){
    const raw=JSON.stringify(day),roster={...proof.roster,days:[day]};
    const events=context.subject.buildLegs(roster);assert.ok(events.length,day.date+' canonical activity retained');
    const issue=context.financialIntervalEvidenceIssue(events);
    const perdiem=context.subject.calculatePerDiem(events,roster,new Date('2032-10-31T12:00:00-03:00'));
    const salary=context.subject.calculateSalary(events,roster);
    const labels=Array.from(perdiem.rows,r=>r.label);
    if(proof.activityWindow==='complete'){
     assert.equal(day.dutyReportSource,'published');assert.equal(day.dutyDebriefSource,'published');assert.equal(issue,null,day.date+' literal boundary evidence accepted');
     if(day.type==='ASB'&&['04:10','06:05'].includes(day.dutyReport))assert.ok(labels.includes('Café'),'literal ASB at base retains breakfast');
     if(day.type==='CRM')assert.ok(labels.includes('Almoço'),'literal training retains lunch: '+day.pairingCode);
     if(['HSB','HSBE'].includes(day.type))assert.deepEqual(labels,[],'published standby does not invent allowance eligibility');
     const duplicated=context.subject.calculatePerDiem([...events,...events],roster,new Date('2032-10-31T12:00:00-03:00'));assert.deepEqual(JSON.parse(JSON.stringify(duplicated.rows)),JSON.parse(JSON.stringify(perdiem.rows)),'duplicate events do not duplicate allowances');
    }else{
     assert.notEqual(day.dutyDebriefSource,'published','missing release cannot become published');
     assert.match(issue,/ausentes|estimados/);assert.deepEqual(labels,[],'incomplete activity does not invent allowance');
     assert.ok(perdiem.unclassifiedItems.length,'incomplete activity visible as pending');
    }
    assert.equal(JSON.stringify(day),raw,'raw parser model immutable');
    const persisted=JSON.parse(JSON.stringify(roster));assert.equal(context.financialIntervalEvidenceIssue(context.subject.buildLegs(persisted)),issue,'JSON persistence keeps financial completeness');
    let baselineEvidence=null;
    if(base){
     const baseDay=base.days.find(d=>d.date===day.date&&!d.legs.length);assert.ok(baseDay);
     for(const key of ['dutyReport','dutyDebrief','dutyHours','flyingHours'])assert.equal(day[key],baseDay[key],'numeric '+key+' unchanged vs published base');
     const baselineRoster={...base,days:[baseDay]},baselineEvents=context.subject.buildLegs(baselineRoster),baselineSalary=context.subject.calculateSalary(baselineEvents,baselineRoster),baselinePerdiem=context.subject.calculatePerDiem(baselineEvents,baselineRoster,new Date('2032-10-31T12:00:00-03:00'));
     for(const key of ['gross','reserve','standby'])assert.equal(salary[key],baselineSalary[key],'salary '+key+' unchanged');
     if(proof.activityWindow==='complete')assert.deepEqual(labels,Array.from(baselinePerdiem.rows,r=>r.label),'literal allowance eligibility unchanged vs published base');
     baselineEvidence={day:baseDay,salary:{gross:baselineSalary.gross,reserve:baselineSalary.reserve,standby:baselineSalary.standby},labels:Array.from(baselinePerdiem.rows,r=>r.label)};
    }
    outputs.push({timezone:proof.timezoneId,variant:proof.variant,day,issue,labels,rows:perdiem.rows,unclassifiedItems:perdiem.unclassifiedItems,salary:{gross:salary.gross,reserve:salary.reserve,standby:salary.standby},baseline:baselineEvidence});
   }
  }
 }finally{baseline?.cleanup();}
 assert.equal(outputs.length,204,'17activities ×4clock states ×3timezones');
 fs.mkdirSync('artifacts/aims-activity-finance',{recursive:true});fs.writeFileSync('artifacts/aims-activity-finance/report.json',JSON.stringify({synthetic:true,chain:'physicalPDF -> real parsePDF/AIMS -> actual Home buildLegs -> financial evidence/calculatePerDiem/calculateSalary',baselineCompared:Boolean(baseline),outputs},null,2));
 console.log('PASS204 physical-PDF activities across3TZ: ASB/RES/CRM variants/HSB/HSBE/ground codes, literal meal eligibility, missing clocks pending, persistence/dedup; numeric clocks and salary unchanged when baseline supplied');
} finally {modules.cleanup();}
