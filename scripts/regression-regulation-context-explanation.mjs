import assert from 'node:assert/strict';
import { regulationContextExplanation } from '../shared/regulationContextExplanation.mjs';
import { regulationProgramDay, regulationScenarioSeed, regulationScheduleProjection } from '../shared/regulationScenarioPrefill.mjs';
import { loadClientModules } from './lib/ts-module-harness.mjs';

const modules = loadClientModules({ files: ['client/src/lib/canonicalRoster.ts', 'client/src/lib/canonicalDutyMeasurement.ts', 'client/src/lib/complianceEngine.ts'], prefix: 'regulation-explain-' });
try {
 const canonical = modules.load('canonicalRoster'), engine = modules.load('complianceEngine');
 const day = {date:'20/10/2032',month:10,year:2032,type:'VOO',base:'BSB',dutyReport:'04:10',dutyReportSource:'published',dutyDebrief:'11:25',dutyDebriefSource:'published',legs:[
  {flightNumber:'QA4527',origin:'BSB',destination:'CGH',departureTime:'05:00',arrivalTime:'06:45',presentationTime:'04:10',workType:'OP'},
  {flightNumber:'QA3036',origin:'CGH',destination:'BSB',departureTime:'07:30',arrivalTime:'09:00',workType:'PS'},
  {flightNumber:'QA3039',origin:'BSB',destination:'GRU',departureTime:'09:30',arrivalTime:'10:55',workType:'OP'},
 ]};
 for (const timezone of ['UTC','America/Sao_Paulo','Asia/Tokyo']) {
  process.env.TZ = timezone;
  const events = canonical.buildCanonicalRosterEvents({month:10,year:2032,days:[day]}).filter(e=>e.kind==='flight');
  const ui = events.map(e=>({id:e.id,kind:e.kind,canonical:e,day:e.publishedDay}));
  const program = events.at(-1), scheduleDay = regulationProgramDay(ui,ui.at(-1));
  const reference = engine.getScheduledDutyLimitReference(scheduleDay,null);
  const form = {...regulationScenarioSeed(scheduleDay,reference,program),plannedEnd:'2032-10-20T11:25',plannedEndSource:'Liberação publicada da jornada canônica',delay:'60'};
  const result = regulationScheduleProjection(form), input = {allowed:true,scheduleDay,program,reference,form,result};
  const before = JSON.stringify(input), explanation = regulationContextExplanation(input), text = JSON.stringify(explanation);
  assert.match(text,/04:10 · publicada/);assert.match(text,/QA4527/);assert.match(text,/QA3036.*PS: deslocamento publicado/);assert.match(text,/QA3039/);
  assert.equal(explanation.facts.filter(x=>/QA\d/.test(x)).length,3,'explanation retains the entire selected journey, including PS');
  assert.match(explanation.hypothesis,/Referência condicional do motor existente/);
  assert.match(explanation.hypothesis,/simples e aclimatada.*confirme/i);
  assert.match(explanation.scenario,/60 min.*não reinicia a apresentação/);
  assert.match(explanation.scenario,/encerramento\/liberação.*não de pouso ou corte/);
  assert.match(explanation.scenario,/não derive o corte.*chegada/);
  assert.match(explanation.scenario,/não autoriza extensão/);
  assert.equal(explanation.next.field,'Composição da tripulação');
  assert.equal(JSON.stringify(input),before,'reader cannot mutate source/form/results');
  assert.equal(regulationContextExplanation({...input,allowed:false}),null,'no previous owner source may be exposed');
  assert.doesNotMatch(JSON.stringify(regulationContextExplanation({...input,program:{...program,journeyId:'foreign'}})),/QA4527|QA3036|QA3039|04:10/,'mismatching journey cannot be narrated or given its reference');
  const missing = regulationContextExplanation({...input,reference:null});assert.match(missing.hypothesis,/nenhum limite foi inventado/);
  const extension = regulationContextExplanation({...input,form:{...form,extension:true}});assert.match(extension.scenario,/\+60 min.*somente a referência temporal/);
  const detailed = regulationContextExplanation({...input,form:{...form,method:'detailed'}});assert.match(detailed.scenario,/método detalhado.*decolagem estimada/);assert.doesNotMatch(detailed.scenario,/atraso editável/);
  const partiallyConfirmed = regulationContextExplanation({...input,form:{...form,composition:'simple'}});assert.equal(partiallyConfirmed.next.field,'Condição de aclimatação');
  const confirmed = regulationContextExplanation({...input,form:{...form,composition:'simple',acclimatization:'acclimatized'}});assert.equal(confirmed.next.field,'Confirmei o fuso dos horários publicados');
 }
 console.log('PASS contextual regulation explanation: full canonical OP/PS journey, conditional existing reference, exact next field, owner/journey fences, no mutation, three zones; zero network.');
} finally { modules.cleanup(); }
