import assert from 'node:assert/strict';
import {loadClientModules} from './lib/ts-module-harness.mjs';
import {regulationProgramDay,regulationScenarioSeed,regulationDraftForm,regulationScheduleProjection} from '../shared/regulationScenarioPrefill.mjs';
const modules=loadClientModules({files:['client/src/lib/canonicalRoster.ts','client/src/lib/canonicalDutyMeasurement.ts','client/src/lib/complianceEngine.ts','client/src/lib/financialRules.ts'],prefix:'regulation-source-'});
try {
 const canonical=modules.load('canonicalRoster'),engine=modules.load('complianceEngine'),measure=modules.load('canonicalDutyMeasurement'),geo=modules.load('financialRules');
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
