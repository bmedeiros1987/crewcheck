// Actual prepared functions + real canonical constructor. Synthetic storage/notices only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
const root=process.env.NEXT_FLIGHT_GATE_ROOT||process.cwd();
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'next-gate-prepared-'));
try {
  const entry=path.join(temp,'entry.ts');
  fs.writeFileSync(entry,`export * from '${root}/client/src/lib/nextFlightGate.ts';export * from '${root}/client/src/lib/navigationContext.ts';export {buildCanonicalRosterEvents} from '${root}/client/src/lib/canonicalRoster.ts';`);
  await build({entryPoints:[entry],outfile:path.join(temp,'bundle.mjs'),bundle:true,format:'esm',platform:'node',alias:{'@':root+'/client/src'},logLevel:'silent'});
  const m=await import(pathToFileURL(path.join(temp,'bundle.mjs')).href);
  function ast(file){return ts.createSourceFile(file,fs.readFileSync(path.join(root,file),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);}
  const home=ast('client/src/pages/Home.tsx'),card=ast('client/src/components/nextflight/NextFlightGateCard.tsx');
  function fn(source,name){let found;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n;ts.forEachChild(n,visit);}visit(source);assert.ok(found,`actual prepared function ${name}`);return ts.transpileModule(found.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;}
  const roster={year:2032,month:10,base:'BSB',rank:'CC',airline:'LA',crewName:'SYNTHETIC',days:[{date:'11/10/2032',year:2032,month:10,type:'VOO',pairingCode:'QA',base:'BSB',dutyReport:'23:00',dutyDebrief:'02:30',dutyReportSource:'published',dutyDebriefSource:'published',legs:[{flightNumber:'QA3377',origin:'GRU',destination:'REC',departureTime:'23:50',arrivalTime:'02:00',duration:2+10/60,presentationTime:'23:00',workType:'OP',aircraftType:'SYNTHETIC'}],rawText:'SYNTHETIC ONLY'}]};
  const canonical=m.buildCanonicalRosterEvents(roster).find(e=>e.kind==='flight');
  assert.equal(canonical.date,'11/10/2032');
  const event={...canonical,canonical,date:new Date(canonical.startDateTime),gate:'7'};
  const now=Date.parse(canonical.startDateTime)-10*60_000;
  class FixedDate extends Date {static now(){return now;}}
  const info=m.resolveNextFlightGate({event,now});
  const clock=vm.createContext({Intl,Date:FixedDate});vm.runInContext(fn(card,'flightDate'),clock);
  const originalTZ=process.env.TZ;
  try {for(const zone of ['America/Sao_Paulo','UTC','Pacific/Auckland']){process.env.TZ=zone;assert.match(clock.flightDate(info),/11\/10$/,zone);assert.equal(info.departure,'23:50');}}finally{if(originalTZ===undefined)delete process.env.TZ;else process.env.TZ=originalTZ;}
  assert.equal(clock.flightDate({...info,operationalDate:''}),'Data não informada');

  // Real prepared Radar -> Weather handoff and Home selection, including vanished event.
  const nav=vm.createContext({...m,window:{dispatchEvent(){}},CustomEvent:class{}});
  vm.runInContext(fn(home,'openWeatherFromRadar'),nav);
  let picker;
  function declarations(n){if(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(home)==='flightSurfaceEvent'))picker=n;ts.forEachChild(n,declarations);}
  declarations(home);assert.ok(picker,'actual prepared Home contextual selector');
  const variableNames=['flightSurfaceContext','contextualFlightEvent','flightSurfaceEvent'];const picked=[];
  function collect(n){if(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>variableNames.includes(d.name.getText(home))))picked.push(n.getText(home));ts.forEachChild(n,collect);}collect(home);
  const pickerCode=ts.transpileModule(picked.join('\n')+'\nglobalThis.selected=flightSurfaceEvent;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const globalFlight={...event,id:'QA-EARLIER',flightNumber:'QA0001'};
  for(const sourceView of ['cockpit','home-roster']){
    m.setPendingNavigationContext({sourceView,targetView:'radar',programId:event.id,flightKey:event.flightNumber,returnView:'cockpit',policy:'persistent-until-return'});
    nav.openWeatherFromRadar();assert.equal(m.peekPendingNavigationContext('weather')?.programId,event.id);assert.equal(m.peekPendingNavigationContext('weather')?.sourceView,sourceView);
    const select=vm.createContext({...m,view:'weather',events:[globalFlight,event],flightEvent:globalFlight});vm.runInContext(pickerCode,select);assert.equal(select.selected.id,event.id,'weather retains card flight, not global earlier flight');
    const missing=vm.createContext({...m,view:'weather',events:[globalFlight],flightEvent:globalFlight});vm.runInContext(pickerCode,missing);assert.equal(missing.selected,null,'removed program fails closed');
  }
  m.clearPendingNavigationContext();const global=vm.createContext({...m,view:'weather',events:[globalFlight,event],flightEvent:globalFlight});vm.runInContext(pickerCode,global);assert.equal(global.selected.id,globalFlight.id,'global navigation keeps normal selection');

  const positive={ok:true,flight:event.flightNumber,gate:'7',origin:'GRU',destination:'REC',sourceOrigin:'GRU',sourceDestination:'REC',scheduledDepartureUtc:canonical.startDateTime,departure:canonical.startDateTime,updatedAt:now-60_000,operationalEvidence:{gate:{version:1,value:'7',sourceObservedAt:new Date(now-60000).toISOString(),provenance:'synthetic-prepared-field-proof'}}};
  function savedNotice(payload,manual=null,previous=positive){
    const notices=[],writes=[];
    const context=vm.createContext({Date:FixedDate,storage:{set:(...args)=>writes.push(args)},readRadarSnapshot:()=>previous,radarSnapshotKey:m.radarSnapshotStorageKey,flightOperationalDate:m.flightOperationalDate,window:{dispatchEvent(){}},CustomEvent:class{},localStorage:{},readManualGate:()=>manual,manualGateAccountKey:()=> 'synthetic',getStoredUser:()=>({id:'SYNTHETIC'}),normalizeBoardingGate:m.normalizeBoardingGate,publishCrewCheckNotice:n=>notices.push(n),reconcileCrewCheckPulse(){},manualGateNoticeScope:()=>"synthetic-scope",retainLatestGateEvidence:m.retainLatestGateEvidence,nextGateUpdateWatermark:m.nextGateUpdateWatermark,gateChangeAlertAllowed:epoch=>m.gateChangeAlertAllowed(epoch,now),resolveNextFlightGate:input=>m.resolveNextFlightGate({...input,now}),eventStartDateTime:e=>new Date(e.canonical.startDateTime)});
    vm.runInContext(fn(home,'radarEventOperationalDate')+'\n'+fn(home,'confirmedRadarGate')+'\n'+fn(home,'saveRadarSnapshot'),context);
    const snapshot=context.saveRadarSnapshot(event,payload);return {notices,writes,snapshot,decision:m.resolveNextFlightGate({event,radar:snapshot,now})};
  }
  const bad=[{...positive,gate:'12',flight:'QA9999'},{...positive,gate:'12',origin:'REC',destination:'GRU'},{...positive,gate:'12',scheduledDepartureUtc:'2032-10-11T02:50:00Z'},{...positive,gate:'12',ok:false},{...positive,gate:'POS 12'}];
  for(const payload of bad){const r=savedNotice(payload);assert.equal(r.notices.length,0,'rejected source must not emit even in-app gate notice');assert.equal(r.writes.length,1,'cache write remains existing behavior, guarded consumers reject it');}
  const confirmedChange={...positive,gate:'12',operationalEvidence:{gate:{version:1,value:'12',sourceObservedAt:new Date(now-60000).toISOString(),provenance:'synthetic-prepared-field-proof'}}};const change=savedNotice(confirmedChange);assert.equal(change.notices.length,1);assert.equal(change.notices[0].systemNotification,'background');assert.equal(change.decision.gate,'12');
  assert.equal(savedNotice({...positive,gate:'7'}).notices.length,0,'unchanged source dedupes');
  const manual={gate:'24'};assert.equal(savedNotice({...positive,gate:'12',origin:'REC',destination:'GRU'},manual).notices.length,0,'manual cannot make rejected source alertable');
  assert.equal(savedNotice({...positive,gate:'12'},manual).notices.length,0,'unproven source update cannot alert as newer than manual');
  assert.equal(savedNotice({...positive,gate:'7'},manual).notices.length,0,'same Radar source does not repeat divergence notice');
  const source=fs.readFileSync(path.join(root,'client/src/pages/Home.tsx'),'utf8');
  assert.equal((source.match(/addEventListener\('crewcheck:radar-updated', onRequest\)/g)||[]).length,1,'one Radar -> Watch listener');
  assert.equal((source.match(/removeEventListener\('crewcheck:radar-updated', onRequest\)/g)||[]).length,1,'one cleanup');
  console.log('[next-flight-gate-prepared] PASS canonical DD/MM/YYYY, fixed operational card date, retained handoff/fail-closed, real save alerts and single watch listener; synthetic only');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
