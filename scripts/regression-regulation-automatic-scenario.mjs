import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {build} from 'esbuild';import {pathToFileURL} from 'node:url';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'regulation-automatic-'));
try{
 const entry=`export * from ${JSON.stringify(path.resolve('client/src/lib/regulationAutomaticScenario.ts'))};export * from ${JSON.stringify(path.resolve('client/src/lib/regulationAircraftEvidence.ts'))};export {buildCanonicalRosterEvents} from ${JSON.stringify(path.resolve('client/src/lib/canonicalRoster.ts'))};export {getScheduledDutyLimitReference} from ${JSON.stringify(path.resolve('client/src/lib/complianceEngine.ts'))};export {regulationProgramDay} from ${JSON.stringify(path.resolve('shared/regulationScenarioPrefill.mjs'))};`;
 await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:path.join(dir,'fixture.mjs'),logLevel:'silent'});
 const m=await import(pathToFileURL(path.join(dir,'fixture.mjs')));
 const leg={flightNumber:'QA1234',origin:'BSB',destination:'GRU',departureTime:'07:00',arrivalTime:'09:00',workType:'OP',aircraftType:'A320',presentationTime:'06:00'};
 const day={date:'21/10/2026',year:2026,month:10,type:'VOO',base:'BSB',dutyReport:'06:00',dutyReportSource:'published',dutyDebrief:'14:30',dutyDebriefSource:'published',legs:[leg]};
 function context(raw){const events=m.buildCanonicalRosterEvents({days:[raw],year:2026,month:10,base:'BSB'}).filter(e=>e.kind==='flight');const ui=events.map(c=>({id:c.id,kind:c.kind,canonical:c,day:c.publishedDay}));const source=m.regulationProgramDay(ui,ui[0]);return m.regulationAutomaticContext(source,events[0]);}
 for(const zone of ['UTC','America/Sao_Paulo','Asia/Tokyo']){
  process.env.TZ=zone;
  const c=context(day),r=m.regulationAutomaticAssessment(c,c.form);
  assert.equal(r.reference.maxDutyMinutes,m.getScheduledDutyLimitReference(day).maxDutyMinutes,'one existing numeric producer');
  assert.equal(r.normalDutyEnd,'2026-10-21T20:00:00.000Z');assert.equal(r.engineStopLimit,'2026-10-21T19:30:00.000Z');assert.equal(r.projectedDutyEnd,'2026-10-21T17:30:00.000Z');
  assert.equal(c.form.composition,'simple');assert.equal(r.evidence.composition,'NB_scenario_default');assert.equal(r.authorization,'not_assessed');assert.equal(r.operationalCompliance,'not_assessed');assert.equal(r.state,'conditional');assert.equal('reviewed' in c.form,false);
  const delay=m.regulationAutomaticAssessment(c,{...c.form,delay:'60'});assert.equal(delay.normalDutyEnd,r.normalDutyEnd);assert.equal(delay.engineStopLimit,r.engineStopLimit);assert.equal(delay.marginMinutes,r.marginMinutes-60);
  const post0=m.regulationAutomaticAssessment(c,{...c.form,postFlight:'0'});assert.equal(post0.normalDutyEnd,r.normalDutyEnd);assert.equal(post0.engineStopLimit,null,'existing postflight guard preserved');
  assert.equal(m.regulationAutomaticAssessment(c,{...c.form,tasks:''}).marginMinutes,null);
  for(const composition of ['augmented','relief']){const other=m.regulationAutomaticAssessment(c,{...c.form,composition});assert.equal(other.normalDutyEnd,null);assert.ok(other.referenceDutyEnd);assert.equal(other.marginMinutes,null);}
  for(const acclimatization of ['unknown','not_acclimatized'])assert.equal(m.regulationAutomaticAssessment(c,{...c.form,acclimatization}).normalDutyEnd,null);
  assert.equal(m.regulationAutomaticAssessment(c,{...c.form,timingChange:'reprogramming'}).normalDutyEnd,null);
  const wide=context({...day,legs:[{...leg,aircraftType:'B789'}]});assert.equal(wide.form.composition,'');const wr=m.regulationAutomaticAssessment(wide,wide.form);assert.equal(wr.aircraft.group,'WB');assert.equal(wr.evidence.composition,'simple_comparison_hypothesis');assert.equal(wr.authorization,'not_assessed');
  for(const aircraftType of ['',undefined,'UNKNOWN','32S','BSB-GRU']){const unknown=context({...day,legs:[{...leg,aircraftType}]});const ur=m.regulationAutomaticAssessment(unknown,unknown.form);assert.equal(ur.aircraft.group,'unknown');assert.equal(unknown.form.composition,'');assert.ok(ur.referenceDutyEnd,'unknown equipment does not erase a daily hypothetical cell');}
  const intl=context({...day,legs:[{...leg,destination:'EZE'}]});assert.equal(intl.form.operation,'international');assert.equal(intl.form.postFlight,'45');assert.equal(m.regulationAutomaticAssessment(intl,{...intl.form,postFlight:'30'}).engineStopLimit,null);
  const noArrival=context({...day,legs:[{...leg,arrivalTime:''}]});assert.ok(m.regulationAutomaticAssessment(noArrival,noArrival.form).normalDutyEnd,'missing arrival does not erase independent normal reference');
  const noApz=context({...day,dutyReport:null,dutyReportSource:'absent',legs:[{...leg,presentationTime:undefined}]});assert.equal(noApz.form.presentation,'');assert.equal(m.regulationAutomaticAssessment(noApz,noApz.form).normalDutyEnd,null);
  for(const workType of ['PS','']){const other=context({...day,legs:[{...leg,workType}]});assert.equal(other.form.composition,'','PS/unknown aircraft must not default an operating crew composition');assert.equal(m.regulationAutomaticAssessment(other,other.form).normalDutyEnd,null,'unproved PS/OP rule never becomes daily limit');}
  const ps=context({...day,legs:[{...leg,workType:'PS'}]});
  const psExplicit=m.regulationAutomaticAssessment(ps,{...ps.form,composition:'simple'});
  assert.equal(psExplicit.normalDutyEnd,'2026-10-21T20:00:00.000Z','explicit simple PS comparison uses same conditional B.1 cell as OP');
  assert.equal(psExplicit.engineStopLimit,null,'PS-only has no operated engine-stop deadline');
  for(const types of [['PS'],['PS','OP'],['OP','PS'],['OP','PS','OP']]){
   const mixed=context({...day,legs:types.map((workType,i)=>({...leg,flightNumber:'QA'+(2000+i),origin:i%2?'GRU':'BSB',destination:i%2?'BSB':'GRU',presentationTime:i===0?'06:00':undefined,departureTime:String(7+i*2).padStart(2,'0')+':00',arrivalTime:String(8+i*2).padStart(2,'0')+':00',workType}))});
   assert.equal(mixed.form.composition,'');
   assert.equal(m.regulationAutomaticAssessment(mixed,mixed.form).normalDutyEnd,null,'PS never infers simple crew');
   const compared=m.regulationAutomaticAssessment(mixed,{...mixed.form,composition:'simple'});
   assert.equal(compared.reference.sectors,types.length,'all physical PS/OP legs count for this comparison');
   assert.equal(compared.normalDutyEnd,'2026-10-21T20:00:00.000Z');
   assert.equal(compared.engineStopLimit!==null,types.at(-1)==='OP');
   assert.equal(compared.evidence.positioningSectors,'LATAM_user_operational_confirmation_scenario_only');
   assert.equal(compared.evidence.regulatoryApplicability,'not_assessed');
   for(const acclimatization of ['unknown','not_acclimatized'])assert.equal(m.regulationAutomaticAssessment(mixed,{...mixed.form,composition:'simple',acclimatization}).normalDutyEnd,null);
  }
  for(const [count,hours] of [[2,13],[3,13],[4,13],[5,12],[6,11],[7,10]]){
   const band=context({...day,dutyReport:'08:00',legs:Array.from({length:count},(_,i)=>({...leg,flightNumber:'QA'+(3000+i),origin:i%2?'GRU':'BSB',destination:i%2?'BSB':'GRU',presentationTime:i===0?'08:00':undefined,departureTime:String(9+i).padStart(2,'0')+':00',arrivalTime:String(10+i).padStart(2,'0')+':00',workType:i===0?'PS':'OP'}))});
   const result=m.regulationAutomaticAssessment(band,{...band.form,composition:'simple'});
   assert.equal(result.reference.sectors,count);assert.equal(result.reference.maxDutyMinutes,hours*60,'independent B.1 08:00 band including PS');
  }
  const missingRelease=context({...day,dutyDebrief:null,dutyDebriefSource:'absent'});const er=m.regulationAutomaticAssessment(missingRelease,{...missingRelease.form,tasks:'15'});assert.equal(er.projectedDutyEnd,'2026-10-21T12:45:00.000Z','scenario postflight/tasks recompute from last scheduled arrival');
  const changed=m.regulationAutomaticAssessment(c,{...c.form,presentation:'2026-10-21T07:00'});assert.notEqual(changed.normalDutyEnd,r.normalDutyEnd);assert.equal(changed.evidence.presentation,'user_scenario');
 }
 assert.equal(m.regulationAircraftEvidence([{aircraftType:'A320'},{aircraftType:'B789'}]).group,'mixed');
 console.log('PASS automatic conditional scenario: one existing engine, defaults/provenance, NB/WB/unknown, no monthly contamination, OP/PS, missing APZ/arrival, domestic/international postflight, delay and immutable limits, 3 zones; no legal authorization');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
