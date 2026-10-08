import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { loadClientModules } from './lib/ts-module-harness.mjs';
const modules=loadClientModules({files:['client/src/lib/financialHistoryPeriods.ts','client/src/lib/financialForecastPeriods.ts','client/src/lib/rosterReferencePeriod.ts','client/src/lib/rosterDisplayDate.ts','client/src/lib/financialJourneyGrouping.ts','client/src/lib/financialReserveCredits.ts'],prefix:'synthetic-history-'});
try {
  const history=modules.load('financialHistoryPeriods'),periods=modules.load('financialForecastPeriods'),scope=modules.load('rosterReferencePeriod');
  const {financialRange,financialWeeks,financialMonths,financialRowsInRange,latestFinancialPeriods}=history;
  const month=financialRange('month','2032-02','','','');assert.equal(month.end,'2032-02-29');
  const week=financialRange('week','','2032-02-01','','');assert.deepEqual([week.start,week.end],['2032-01-28','2032-02-03']);
  assert.deepEqual(financialMonths(week),['2032-01','2032-02']);
  const weeks=financialWeeks(month);assert.equal(weeks[0].start,month.start);assert.equal(weeks.at(-1).end,month.end);
  assert.equal(financialRowsInRange(Array.from({length:29},(_,i)=>({iso:'2032-02-'+String(i+1).padStart(2,'0')})),month).length,29);
  assert.equal(financialRowsInRange([{iso:'2032-02-30'},{iso:'2032-01-31'}],month).length,0);
  assert.equal(financialRange('week','','','2032-02-01','2032-02-29').valid,false);
  assert.equal(financialRange('custom','','','2032-02-29','2032-02-01').valid,false);
  assert.equal(financialRange('custom','','','2031-02-29','2031-03-01').valid,false);
  assert.equal(financialMonths(financialRange('year','2032-11','','','')).length,12);
  const home=process.env.FINANCIAL_BASELINE_SHA?execFileSync('git',['show',process.env.FINANCIAL_BASELINE_SHA+':client/src/pages/Home.tsx'],{encoding:'utf8'}):fs.readFileSync('client/src/pages/Home.tsx','utf8');
  const ast=ts.createSourceFile('Home.tsx',home,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const names=['calculateSalary','nightHoursInsideWindow','scopedFinancialForecast','moneyCurrency','moneyBRL'];
  const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text));
  const cfg={configured:true,baseConfigured:true,basePay:900,fixedAdditions:0,dayKmMetric:1,nightKmMetric:2,chiefPerSector:0,instructorPerSector:0,reserveHourMetric:10,standbyHourMetric:5,inssDeduction:0,irrfDeduction:0,otherDeductions:0,fgtsRate:0,source:'SYNTHETIC — not a real tariff'};
  const context=vm.createContext({...history,...periods,...scope,...modules.load('rosterDisplayDate'),...modules.load('financialJourneyGrouping'),...(fs.existsSync('client/src/lib/financialReserveCredits.ts')?modules.load('financialReserveCredits'):{}),loadActCompensationConfig:()=>cfg,storage:{get:()=> '0'},dedupeProjectedLegs:events=>events,
    flightDistanceKmFromEvent:()=>100,durationHours:()=>2,financialFlightRule:()=>({extra:false,reason:'synthetic'}),isSundayOrConfiguredHoliday:()=>false,userIsFirstCcm:()=>false,flightWorkType:()=> 'OP',safe:(value,fallback)=>value||fallback,dateChip:date=>date.toISOString().slice(0,10),isOperationalEvent:()=>true,financialEventCode:event=>event.kind==='reserve'?'ASB':'CRM',
    eventStartDateTime:event=>new Date(event.iso+(event.kind==='reserve'?'T07:00:00':'T11:00:00')),eventEndDateTime:event=>new Date(event.iso+(event.kind==='reserve'?'T09:00:00':'T13:00:00'))});
  vm.runInContext(ts.transpileModule(functions.map(n=>n.getText(ast)).join('\n')+'\nglobalThis.subject={calculateSalary'+(functions.some(n=>n.name.text==='scopedFinancialForecast')?',scopedFinancialForecast':'')+'};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  const event=(iso,kind='flight')=>({id:'synthetic-'+iso+'-'+kind,iso,date:new Date(iso+'T12:00:00'),kind,day:{date:iso.slice(8)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4)},origin:'AAA',destination:'BBB',flightNumber:'SYN'});
  const salary=context.subject.calculateSalary([event('2032-01-31'),event('2032-02-02'),event('2032-03-01'),event('2032-01-31','reserve'),event('2032-02-02','reserve')],{year:2032,month:2});
  assert.equal(salary.rows.length,1,'monthly salary excludes adjacent-month flights');assert.equal(salary.reserveHours,2,'monthly salary excludes adjacent-month reserve');assert.equal(salary.gross,1020);
  assert.equal(salary.rows[0].iso,'2032-02-02');
  if(context.subject.scopedFinancialForecast){
    const row=(iso,currency,value,convertedBRL)=>({iso,currency,value,convertedBRL,label:'SYN',source:'synthetic'});
    const snapshot=rows=>({perdiem:{rows,monthlyRows:rows,monthlyUnclassifiedItems:[],unclassifiedItems:[]}});
    const mixed=context.subject.scopedFinancialForecast([snapshot([row('2032-02-01','BRL',120,120),row('2032-02-02','USD',30,null)])],month,[]);
    assert.equal(mixed.nativeSummary.complete,true);assert.equal(mixed.monthlySummary.convertedTotalBRL,null);assert.equal(mixed.totalsByCurrency.BRL,120);assert.equal(mixed.totalsByCurrency.USD,30);
    const unknown=context.subject.scopedFinancialForecast([{perdiem:{rows:[],monthlyRows:[],monthlyUnclassifiedItems:[{iso:'2032-02-02',airport:'ZZZ'}]}}],month,[]);assert.equal(unknown.nativeSummary.complete,false,'unknown-only month is not a zero');
    const absent=context.subject.scopedFinancialForecast([snapshot([row('2032-02-02','BRL',120,120)])],week,['2032-01']);assert.equal(absent.monthly,null,'missing monthly source prevents a cross-month total');
  }
  const db=ts.createSourceFile('databaseClient.ts',fs.readFileSync('client/src/lib/databaseClient.ts','utf8'),ts.ScriptTarget.Latest,true);
  const identityFunctions=db.statements.filter(n=>ts.isFunctionDeclaration(n)&&['normalizeRosterCrewId','normalizeRosterCrewName','crewIdentityToken'].includes(n.name?.text));
  const identityContext=vm.createContext({});vm.runInContext(ts.transpileModule(identityFunctions.map(n=>n.getText(db)).join('\n')+'\nglobalThis.identify=crewIdentityToken;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,identityContext);
  const identify=identityContext.identify,crew=identify({crewId:'SYN01'}),item=(id,stamp,crewId='SYN01')=>({id,year:2032,month:2,createdAt:stamp,crewId});
  const latest=latestFinancialPeriods([item('old','2032-02-01T00:00:00Z'),item('new','2032-02-02T00:00:00Z'),item('foreign','2032-02-03T00:00:00Z','SYN02')],crew,identify);assert.equal(latest.items.length,1);assert.equal(latest.items[0].id,'new');
  assert.equal(latestFinancialPeriods([item('a','2032-02-02T00:00:00Z'),item('b','2032-02-02T00:00:00Z')],crew,identify).conflicts.length,1,'ambiguous revisions are not summed');
  assert.equal(latestFinancialPeriods([item('a','not-a-date')],crew,identify).items.length,0);
  assert.equal(identify({crewId:'UNKNOWN7',crewName:'Tripulante2'}),'','reuse canonical identity sentinel guard');
  assert.equal(latestFinancialPeriods([item('a','2032-02-02T00:00:00Z')],'',identify).items.length,0);
  console.log('PASS financial history: civil periods, leap days, scope completeness, native currencies, canonical salary competence, owner identity, revision dedup/conflicts — TZ='+process.env.TZ);
}finally{modules.cleanup();}
