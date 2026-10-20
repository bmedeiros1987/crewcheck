import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';import ts from 'typescript';
import {loadClientModules} from './lib/ts-module-harness.mjs';
import {regulationProgramDay,regulationScenarioSeed,regulationDraftForm,regulationScheduleProjection} from '../shared/regulationScenarioPrefill.mjs';
const modules=loadClientModules({files:['client/src/lib/canonicalRoster.ts','client/src/lib/canonicalDutyMeasurement.ts','client/src/lib/complianceEngine.ts','client/src/lib/financialRules.ts'],prefix:'regulation-source-'});
try {
 const canonical=modules.load('canonicalRoster'),engine=modules.load('complianceEngine'),measure=modules.load('canonicalDutyMeasurement'),geo=modules.load('financialRules');
 // Exercise the actual transposed parser's deliberately missing-APZ path.
 const parserDir=fs.mkdtempSync(path.join(os.tmpdir(),'regulation-transposed-'));
 let parsed;
 try {
  let source=fs.readFileSync('client/src/lib/pdfParser.ts','utf8')
   .replace("import { isAimsFormat, parseAimsRoster } from './aimsParser';",'const isAimsFormat=()=>false;const parseAimsRoster=()=>({days:[]});')
   .replace("import { getRosterCodeDefinition, isKnownRosterCode } from './rosterCodes';",'const getRosterCodeDefinition=()=>null;const isKnownRosterCode=()=>false;')
   .replace("import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';","const pdfWorkerUrl='';")
   .replace("import { normalizeRosterDays } from './canonicalRoster';",'const normalizeRosterDays=x=>x;');
  source+='\nexport {parseTransposedFlightGroup};';
  const file=path.join(parserDir,'parser.cjs');fs.writeFileSync(file,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText);
  const item=(str,x,y)=>({str,x,y,page:1});const items=[item('BSB',0,100),item('05:00',40,100),item('GRU',0,200),item('07:00',40,200),item('LA0001',0,50)];
  parsed=createRequire(import.meta.url)(file).parseTransposedFlightGroup(items,'SYNTHETIC ONLY',{day:20,month:10,year:2032},'BSB','LA0001');
  assert.equal(parsed.dutyReportSource,'estimated');assert.equal(parsed.dutyReport,parsed.legs[0].departureTime);
 }finally{fs.rmSync(parserDir,{recursive:true,force:true});}
 assert.equal(engine.getScheduledDutyLimitReference(parsed,null),null,'actual parser departure placeholder must never start B.1');
 for(const departureTime of ['5:00','05:00(+1)','5:00 (+1)']){
  const equivalent={...parsed,legs:[{...parsed.legs[0],departureTime}]};assert.equal(engine.getScheduledDutyLimitReference(equivalent,null),null,'equivalent departure clock rejected: '+departureTime);
  const ev=canonical.buildCanonicalRosterEvents({days:[equivalent],month:10,year:2032,base:'BSB'}).filter(e=>e.kind==='flight');const ui=ev.map(c=>({id:c.id,kind:c.kind,canonical:c,day:c.publishedDay}));const d=regulationProgramDay(ui,ui[0]);assert.equal(d.dutyReport,'','adapter must reject normalized equality: '+departureTime);assert.equal(engine.getScheduledDutyLimitReference(d,null),null);
 }

 const parsedEvents=canonical.buildCanonicalRosterEvents({days:[parsed],month:10,year:2032,base:'BSB'}).filter(e=>e.kind==='flight');const parsedUI=parsedEvents.map(c=>({id:c.id,kind:c.kind,canonical:c,day:c.publishedDay}));const parsedDay=regulationProgramDay(parsedUI,parsedUI[0]);assert.equal(parsedDay.dutyReport,'');assert.equal(parsedDay.dutyReportSource,'unknown');assert.equal(regulationScenarioSeed(parsedDay,engine.getScheduledDutyLimitReference(parsedDay,null),parsedEvents[0]).normalEnd,'');
 const day={date:'20/10/2032',year:2032,month:10,type:'VOO',pairingCode:'SYN',base:'BSB',dutyReport:'04:10',dutyReportSource:'published',dutyDebrief:'07:30',dutyDebriefSource:'estimated',legs:[{flightNumber:'SYN001',origin:'BSB',destination:'GRU',departureTime:'05:00',arrivalTime:'07:00',presentationTime:'04:10',workType:'OP'}]};
 for(const timezone of ['UTC','America/Sao_Paulo','Asia/Tokyo']){
  process.env.TZ=timezone;
  const events=canonical.buildCanonicalRosterEvents({year:2032,month:10,base:'BSB',days:[day]}).filter(e=>e.kind==='flight');
  const ui=events.map(c=>({id:c.id,kind:c.kind,canonical:c,day:c.publishedDay}));
  const selected=regulationProgramDay(ui,ui[0]);assert.equal(selected.date,'20/10/2032');assert.equal(selected.regulationJourney[0],events[0]);
  assert.equal(engine.getPublishedDutyLimitSummary(day,null),null,'old usage summary cannot measure an estimated release');
  const ref=engine.getPublishedDutyLimitReference(selected,{actName:'ACT sintético'});assert.equal(ref.maxDutyMinutes,540);assert.equal(ref.startTime,'04:10');
  assert.equal(measure.publishedDutyEndpoints(events,events[0].id).end,null,'estimated release is never publication');
  const seed={...regulationScenarioSeed(selected,ref,events[0]),scheduledArrival:'2032-10-20T07:00',plannedEnd:'2032-10-20T07:30',plannedEndSource:'Estimativa: chegada + pós-voo',operation:'domestic',postFlight:'30'};
  assert.equal(seed.normalEnd,'2032-10-20T13:10');assert.equal(seed.flight,'');assert.equal(seed.taxi,'');assert.equal(seed.acclimatization,'unknown');assert.equal(seed.composition,'');
  assert.equal(regulationScheduleProjection(seed).marginMinutes,340);
  const modified=regulationDraftForm({key:'a',basis:'b',overrides:{postFlight:'45',tasks:'15'}},'a',seed,'b');assert.equal(modified.plannedEnd,'2032-10-20T08:00');assert.equal(regulationScheduleProjection(modified).marginMinutes,310);
  const manual=regulationDraftForm({key:'a',basis:'b',overrides:{plannedEnd:'2032-10-20T09:00',plannedEndSource:'Encerramento informado pelo usuário',tasks:'60'}},'a',seed,'b');assert.equal(manual.plannedEnd,'2032-10-20T09:00');
  for(const form of [{plannedEnd:'2032-10-19T07:00'},{composition:'augmented'},{acclimatization:'not_acclimatized'},{plannedEnd:''}])assert.equal(regulationScheduleProjection({...seed,...form}).state,'indeterminate');
  for(const override of [{postFlight:'0'},{operation:''},{operation:'international',postFlight:'30'}])assert.equal(regulationDraftForm({key:'a',basis:'b',overrides:override},'a',seed,'b').plannedEnd,'');
  assert.equal(regulationScheduleProjection({...seed,composition:'augmented',reviewed:true}).state,'indeterminate','checkbox cannot validate an incompatible B.1 ceiling');
  const crossing=regulationScheduleProjection({...seed,plannedEnd:'2032-10-20T23:30',delay:'60'});assert.equal(crossing.crossesReferenceDate,true);
  for(const source of ['estimated','absent','unknown'])assert.equal(engine.getPublishedDutyLimitReference({...day,dutyReportSource:source},null),null);
  for(const source of ['estimated','unknown','absent',undefined]){
   const legacy={...day,dutyReportSource:source,legs:[{...day.legs[0],presentationTime:undefined}]};
   const le=canonical.buildCanonicalRosterEvents({year:2032,month:10,base:'BSB',days:[legacy]}).filter(e=>e.kind==='flight');const lu=le.map(c=>({id:c.id,kind:c.kind,canonical:c,day:c.publishedDay}));const ld=regulationProgramDay(lu,lu[0]);
   assert.equal(ld.dutyReport,'04:10');assert.equal(ld.dutyReportSource,'estimated');assert.equal(engine.getPublishedDutyLimitReference(ld,null),null,'estimate must not pass published-only reader');
   const lr=engine.getScheduledDutyLimitReference(ld,null);assert.equal(lr.maxDutyMinutes,540);assert.equal(lr.presentationSource,'estimate');assert.match(lr.source,/apresentação estimada/);assert.equal(regulationScenarioSeed(ld,lr,le[0]).normalEnd,'2032-10-20T13:10');assert.equal(measure.publishedDutyEndpoints(le,le[0].id).start,null,'original publication proof remains missing');
  }
  const published={...day,dutyDebriefSource:'published'};const pe=canonical.buildCanonicalRosterEvents({year:2032,month:10,base:'BSB',days:[published]}).filter(e=>e.kind==='flight');assert.notEqual(measure.publishedDutyEndpoints(pe,pe[0].id).end,null);
 }
 for(const [a,b,want] of [['BSB','GRU','domestic'],['GRU','LIS','international'],['BSB','ZZZ',null]]){
  const kinds=[a,b].map(c=>geo.resolvePerDiemRule(c,c,{}).kind);const actual=kinds.some(k=>k==='pending')?null:kinds.includes('international')?'international':'domestic';assert.equal(actual,want);
 }
 console.log('PASS actual engine/reference + canonical source: missing release, B.1/ACT, ISO boundary,3 zones, immutable evidence, estimated/manual edits, chronology/crossing and geography unknown');
}finally{modules.cleanup();}
