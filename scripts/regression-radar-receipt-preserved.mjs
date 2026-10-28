// dot review of #1281 (792987a91): the reported-gate window is anchored on the source's original
// receipt all the way through the actual Home saver, cache reader and NextFlight resolver.
// A response received at 08:00 and saved by the phone at 08:04 is valid until 08:30, never
// 08:34; the receipt is never turned into a gate observation. Synthetic fixtures, no network.
import {loadRadarReadAdmission} from './fixtures/load-radar-read-admission.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const root=process.env.RADAR_SOURCE_ROOT||process.cwd(),require=createRequire(path.join(root,'package.json')),ts=require('typescript'),{build}=require('esbuild');
const radarAdmission=await loadRadarReadAdmission(root);
const policy=await import(pathToFileURL(path.join(root,'shared/gate-query-day.mjs')).href);
function functions(file,names){const source=fs.readFileSync(path.join(root,file),'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);return names.map(name=>{const n=ast.statements.find(x=>ts.isFunctionDeclaration(x)&&x.name?.text===name);assert(n,name);return ts.transpileModule(n.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;}).join('\n');}
const at=clock=>Date.parse(`2032-10-14T${clock}:00Z`);
let now=at('08:04');
const FixedDate=class extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};
const compiled=await build({stdin:{contents:"export * from './client/src/lib/nextFlightGate';export * from './client/src/lib/nextFlightWatch';",resolveDir:root},bundle:true,platform:'node',format:'cjs',write:false});
const m={exports:{}};Function('module','exports','require','Date',compiled.outputFiles[0].text)(m,m.exports,require,FixedDate);
const gate=m.exports;
const event={id:'fixture-event',kind:'flight',flightNumber:'LA100',origin:'GRU',destination:'REC',day:{date:'14/10/2032'},canonical:{date:'2032-10-14',startDateTime:'2032-10-14T12:00:00Z'},date:new Date('2032-10-14T12:00:00Z')};
const store=new Map(),storage={getItem:k=>store.get(k)||null};
const client=vm.createContext({...radarAdmission,...policy,...gate,Date:FixedDate,storage:{get:k=>store.get(k)||'null',set:(k,v)=>store.set(k,v)},localStorage:{},window:{dispatchEvent:()=>{}},CustomEvent:class {},getStoredUser:()=>({}),readManualGate:()=>null,manualGateAccountKey:()=> 'fixture-account',publishCrewCheckNotice:()=>{},publishCrewCheckPulse:()=>{},reconcileCrewCheckPulse(){},manualGateNoticeScope:()=>'synthetic-scope',RADAR_CARD_CACHE_TTL_MS:6*3600000});
vm.runInContext(functions('client/src/pages/Home.tsx',['radarSnapshotKey','radarEventOperationalDate','radarSnapshotMatchesEvent','validatedRadarForEvent','readRadarSnapshot','radarGateInfo','saveRadarSnapshot']),client);
// Provider-reported gate: exact occurrence, a gate, no field observation or gate-update proof.
const payload=(over={})=>({ok:true,configured:true,provider:'flightaware',flight:'LA100',origin:'GRU',destination:'REC',sourceOrigin:'GRU',sourceDestination:'REC',gate:'12',status:'Programado',scheduledDepartureUtc:'2032-10-14T12:00:00Z',departure:'2032-10-14T12:00:00Z',sourceReceivedAt:at('08:00'),...over});
const resolve=clock=>{now=at(clock);return gate.resolveNextFlightGate({event,radar:gate.readCachedRadarForFlight(storage,event,now),now});};

// fetchRadarSnapshot legitimately admits a 4-minute-old response.
now=at('08:04');
assert.equal(policy.radarResultDecision(payload(),{flight:'LA100',origin:'GRU',destination:'REC',departureDate:'2032-10-14',scheduledDepartureUtc:'2032-10-14T12:00:00Z'},now,gate.RADAR_GATE_STALE_MS).allowed,true);
const saved=client.saveRadarSnapshot(event,payload());
const report={savedUpdatedAt:new Date(saved.updatedAt).toISOString(),at0829:null,at0831:null};
let info=resolve('08:29');
report.at0829={gate:info.gate,source:info.gateSource,stale:info.stale,validUntil:new Date(info.automaticFieldValidUntilEpochMs.gate||0).toISOString()};
info=resolve('08:31');
report.at0831={gate:info.gate,source:info.gateSource,stale:info.stale,validUntil:info.automaticFieldValidUntilEpochMs.gate?new Date(info.automaticFieldValidUntilEpochMs.gate).toISOString():null};
console.log(JSON.stringify(report));
assert.equal(saved.updatedAt,at('08:00'),'saved anchor is the original receipt, not the phone save time');
assert.equal(saved.sourceReceivedAt,at('08:00'));
info=resolve('08:29');
assert.equal(info.gate,'12');assert.equal(info.gateSource,'reported');assert.equal(info.stale,false);
assert.equal(info.automaticFieldValidUntilEpochMs.gate,at('08:30'),'valid until receipt + 30 min');
assert.equal(info.radarUpdatedAtEpochMs,at('08:00'));
assert.equal(gate.watchGateNote(info).includes('recebido 05:00 BRT'),true,'the watch note shows the original receipt');
info=resolve('08:31');
assert.notEqual(info.gateSource,'reported','a 31-minute-old receipt never shows a reported gate');
assert.notEqual(info.gate,'12');
assert.deepEqual(info.automaticFieldValidUntilEpochMs,{});
// Receipt is not observation: nothing in the saved record claims the gate was observed.
assert.equal(saved.operationalEvidence,undefined);assert.equal(saved.gateUpdate,undefined);assert.equal(saved.gateEvidenceReceivedAt,undefined);
now=at('08:29');assert.equal(client.radarGateInfo(event,saved).gateSource,'reported','Home card path, same anchor');
now=at('08:31');assert.notEqual(client.radarGateInfo(event,saved).gateSource,'reported','Home card path expires at 08:30 too');
// Without a source receipt the phone's own receipt stays the anchor; a receipt ahead of the phone clock is capped.
now=at('09:00');const noReceipt=payload({sourceReceivedAt:undefined});delete noReceipt.sourceReceivedAt;
assert.equal(client.saveRadarSnapshot(event,noReceipt).updatedAt,at('09:00'));
assert.equal(client.saveRadarSnapshot(event,payload({sourceReceivedAt:at('09:05')})).updatedAt,at('09:00'));
assert.equal(client.saveRadarSnapshot(event,payload({sourceReceivedAt:'2032-10-14T08:50:00Z'})).updatedAt,at('08:50'),'ISO receipt');
console.log('PASS Radar receipt preserved: actual saveRadarSnapshot → cache → resolveNextFlightGate/Home card anchor the reported gate on the original source receipt (08:00 → until 08:30), never the phone save time, and never as an observation');
