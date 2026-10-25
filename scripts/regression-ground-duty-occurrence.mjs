// Synthetic pure canonical consumers; no provider, real roster or rate rules.
import assert from 'node:assert/strict';import vm from 'node:vm';import ts from 'typescript';
import {loadClientModules,readRepoFile} from './lib/ts-module-harness.mjs';
import {resolveRegulationProgram} from '../shared/regulationScenarioPrefill.mjs';
const h=loadClientModules({files:['client/src/lib/canonicalRoster.ts','client/src/lib/canonicalDutyMeasurement.ts']});
try{
 const c=h.load('canonicalRoster'),m=h.load('canonicalDutyMeasurement');
 const day=(code,report,release,airport='BSB',extra={})=>({date:'25/10/2032',type:code,pairingCode:code,base:'BSB',operationalAirport:airport,dutyReport:report,dutyDebrief:release,dutyReportSource:report?'published':'absent',dutyDebriefSource:release?'published':'absent',legs:[],rawText:'SYNTHETIC',...extra});
 const build=days=>c.buildCanonicalRosterEvents({month:10,year:2032,base:'BSB',days,rawText:'SYNTHETIC'}).filter(e=>e.kind==='duty');let cases=0;
 for(const code of ['ASB','HSB','HSBE','CRM'])for(const station of ['BSB','REC','CPT','LIS']){
  const input=[day(code,'03:00','07:00',station),day(code,'08:00','12:00',station)];const before=JSON.stringify(input);const both=build(input),reverse=build([...input].reverse()),a=build([input[0]])[0],b=build([input[1]])[0];
  assert.equal(JSON.stringify(input),before);assert.equal(both.length,2);assert.equal(new Set(both.map(e=>e.id)).size,2);
  assert.deepEqual(both.map(e=>e.id),[`25/10/2032|duty|${code}|03:00|07:00|${station}`,`25/10/2032|duty|${code}|08:00|12:00|${station}`],'existing prepared v14347 event IDs unchanged');
  assert.deepEqual(reverse.map(e=>e.id),both.map(e=>e.id));assert.equal(a.id,both[0].id);assert.equal(b.id,both[1].id);assert.equal(a.journeyId,both[0].journeyId);assert.equal(b.journeyId,both[1].journeyId);
  for(const event of both){const measurement=m.measureCanonicalDuty(both,event.id);assert.equal(measurement.state,'available');assert.equal(measurement.minutes,240,'never combine03–07 and08–12 into540min');assert.equal(event.journeyId,event.id);assert.equal(measurement.start,event.startDateTime);assert.equal(measurement.end,event.endDateTime);assert.deepEqual(m.publishedDutyEndpoints(both,event.id),{start:Date.parse(event.startDateTime),end:Date.parse(event.endDateTime)});assert.equal(event.origin,station);assert.equal(event.publishedDay.base,'BSB')}
  assert.equal(new Set(both.map(e=>e.journeyId)).size,2);
  assert.equal(resolveRegulationProgram(both,both[0],{programId:both[1].id}),both[1]);assert.equal(resolveRegulationProgram([b],b,{programId:a.id}),null);
  const duplicate=build([input[0],input[0]]);assert.equal(duplicate.length,1);assert.equal(duplicate[0].id,a.id);assert.equal(duplicate[0].journeyId,a.journeyId);
  const missing=build([day(code,null,null,station)])[0];assert.equal(m.measureCanonicalDuty([missing],missing.id).state,'incomplete');assert.deepEqual(m.publishedDutyEndpoints([missing],missing.id),{start:null,end:null});
  const estimated=build([day(code,'03:00','07:00',station,{dutyReportSource:'estimated'})])[0];assert.equal(m.measureCanonicalDuty([estimated],estimated.id).state,'incomplete');
  cases++;
 }
 const overnight=build([day('ASB','23:00','03:00')])[0];assert.equal(m.measureCanonicalDuty([overnight],overnight.id).minutes,240);
 const dates=build([day('ASB','03:00','07:00','BSB',{date:'31/10/2032'}),day('ASB','03:00','07:00','BSB',{date:'01/11/2032'})]);assert.equal(new Set(dates.map(e=>e.journeyId)).size,2);
 const other=c.buildCanonicalRosterEvents({month:10,year:2032,base:'BSB',days:[day('DO','03:00','07:00'),day('LAYOVER','03:00','07:00','BSB',{date:'26/10/2032',hotel:'SYNTHETIC'}),day('VOO','07:00','10:00','BSB',{date:'27/10/2032',legs:[{flightNumber:'QA0001',origin:'BSB',destination:'GRU',departureTime:'08:00',arrivalTime:'09:30'}]})]});
 assert.equal(other.find(e=>e.kind==='rest').id,'25/10/2032|rest|DO|03:00|07:00|BSB');assert.equal(other.find(e=>e.kind==='rest').journeyId,'rest|25/10/2032|DO');assert.equal(other.find(e=>e.kind==='stay').id,'26/10/2032|stay|LAYOVER|03:00|07:00|BSB');assert.equal(other.find(e=>e.kind==='stay').journeyId,'stay|26/10/2032|LAYOVER');assert.equal(other.find(e=>e.kind==='flight').id,'27/10/2032|0|QA0001|BSB|GRU|08:00|09:30');
 // Exercise ONLY the exact existing canonical callback; no release/server steps.
 const materializer=readRepoFile('scripts/v14347/apply.mjs');const ast=ts.createSourceFile('apply.mjs',materializer,99,true,ts.ScriptKind.JS);const helper=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='replaceRequired');const call=ast.statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='update'&&n.expression.arguments[0]?.text==='client/src/lib/canonicalRoster.ts');assert(helper&&call);
 const source=readRepoFile('client/src/lib/canonicalRoster.ts');let transformed=source;for(let i=0;i<2;i++)vm.runInNewContext(helper.getText(ast)+'\n'+call.getText(ast),{update(path,transform){assert.equal(path,'client/src/lib/canonicalRoster.ts');transformed=transform(transformed)}});assert.equal(transformed,source,'v14347 canonical callback remains byte-idempotent raw/prepared');
 console.log(`PASS duty occurrence: ${cases} code/location pairs,240min each, existing v14347 IDs/selection/unknowns, dates, other kinds, materializer idempotency`);
}finally{h.cleanup()}
