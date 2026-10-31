import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { build } from 'esbuild';
import { selectAeroDataBoxOccurrence } from '../server/aerodatabox-occurrence.mjs';
import * as radarEvidence from '../shared/radar-field-evidence.mjs';
const now=Date.parse('2032-10-21T08:00:00Z');
const occurrence={flight:'QA123',origin:'CGH',destination:'SSA',scheduledDepartureUtc:'2032-10-21T09:35:00Z'};
const row={number:'QA123',departure:{airport:{iata:'CGH'},scheduledTime:{utc:occurrence.scheduledDepartureUtc},gate:'12',quality:['Basic','Live']},arrival:{airport:{iata:'SSA'}},lastUpdatedUtc:'2032-10-21T07:58:00Z',status:'Scheduled'};
assert.equal(selectAeroDataBoxOccurrence([{...row,number:'QA124'},row],occurrence),row);
assert.equal(selectAeroDataBoxOccurrence([row,row],occurrence),null);
for(const other of [{...occurrence,flight:'QA124'},{...occurrence,origin:'GRU'},{...occurrence,destination:'REC'},{...occurrence,scheduledDepartureUtc:'2032-10-22T09:35:00Z'}])assert.equal(selectAeroDataBoxOccurrence([row],other),null);
const ast=ts.createSourceFile('server.mjs',fs.readFileSync('server.mjs','utf8'),99,true,ts.ScriptKind.JS);
const names=['firstKnown','providerAeroDataBox','publicRadarPayload'];
const functions=names.map(name=>{const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(fn,name);return fn.getText(ast)}).join('\n');
let payload=[row],calls=0;
const scope=vm.createContext({...radarEvidence,selectAeroDataBoxOccurrence,Date:class extends Date{static now(){return now;}},envAny:keys=>keys.includes('AERODATABOX_API_KEY')?'synthetic-only':'',providerAvailable:()=>true,markProvider:()=>{},jsonFetch:async()=>{calls++;return{response:{ok:true},payload};},ciriumRadarProjection:()=>({}),gateQuerySuppressed:()=>({ok:false})});
vm.runInContext(functions,scope);
const compiled=await build({stdin:{contents:"export {resolveNextFlightGate} from './client/src/lib/nextFlightGate';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',write:false});
const mod={exports:{}};Function('module','exports','require',compiled.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url));
const event={id:'synthetic-flight',kind:'flight',flightNumber:occurrence.flight,origin:occurrence.origin,destination:occurrence.destination,day:{date:'21/10/2032'},canonical:{startDateTime:occurrence.scheduledDepartureUtc}};
const read=async()=>{const candidate=await scope.providerAeroDataBox({iata:occurrence.flight,gateQueryEvidence:occurrence},1000);return scope.publicRadarPayload({...candidate,sourceReceivedAt:now});};
const accepted=await read();assert.equal(accepted.operationalEvidence,undefined);
const resolve=radar=>mod.exports.resolveNextFlightGate({event,radar:{...radar,sourceOrigin:radar.origin,sourceDestination:radar.destination,updatedAt:now},now});
const assertReported=(radar,gate)=>{
 const info=resolve(radar);
 assert.equal(info.gate,gate);assert.equal(info.gateSource,'reported');assert.equal(info.usesRadar,false);
 assert.equal(radar.operationalEvidence,undefined);assert.equal(radar.gateUpdate,null);
 assert.equal(info.status,'');assert.equal(info.registration,'');
 assert.equal(info.automaticFieldValidUntilEpochMs.gate,now+30*60_000);
};
assert.equal(accepted.gate,'12');assertReported(accepted,'12');
for(const patch of [{operationalConflicts:['gate']},{operationalEvidence:{gate:{version:1,value:'12',sourceObservedAt:'2032-10-20T07:00:00Z',provenance:'synthetic'}}},{gateUpdateWatermark:{gate:'12',sourceUpdatedAtEpochMs:now,conflicted:true}}]){
 const rejected=resolve({...accepted,...patch});assert.equal(rejected.gate,'');assert.notEqual(rejected.gateSource,'reported');
}
// A later cache/save clock must not replace the original HTTP receipt.
const expired=mod.exports.resolveNextFlightGate({event,radar:{...accepted,sourceOrigin:accepted.origin,sourceDestination:accepted.destination,updatedAt:now+31*60_000},now:now+31*60_000});
assert.equal(expired.gate,'');assert.notEqual(expired.gateSource,'reported');
payload=[{...row,departure:{...row.departure,gate:'14'},lastUpdatedUtc:'2032-10-21T07:59:00Z'}];assertReported(await read(),'14');
// Generic record time is not propagated by the adapter and proves no field freshness.
payload=[{...row,lastUpdatedUtc:'2032-10-21T07:00:00Z'}];const oldRecord=await read();assert.equal(oldRecord.lastUpdatedUtc,undefined);assertReported(oldRecord,'12');
payload=[{...row,departure:{...row.departure,gate:null}}];assert.equal(resolve(await read()).gate,'');
payload=[{...row,number:'QA999'}];assert.equal((await read()).ok,false);
const manual={flight:occurrence.flight,origin:occurrence.origin,destination:occurrence.destination,date:'2032-10-21',scheduledDepartureUtc:occurrence.scheduledDepartureUtc,gate:'7A',author:'synthetic',setAtEpochMs:now};
const manualResult=mod.exports.resolveNextFlightGate({event,radar:{...accepted,sourceOrigin:accepted.origin,sourceDestination:accepted.destination,updatedAt:now},manual,now});assert.equal(manualResult.gate,'7A');assert.equal(manualResult.gateSource,'manual');
assert.equal(calls,5);console.log('PASS actual AeroDataBox adapter → public projection → card resolver: reported receipt window only; no observation/status promotion; failed/conflicting proof denied; matching row selection, missing, ambiguity/other occurrence, change and manual preserved; zero external network.');

// Provider health with the real server functions: a valid response for another
// occurrence is not a provider failure, so other flights keep querying it; an HTTP
// failure still opens the 30 s back-off.
{
  const names=['providerAvailable','markProvider','providerAeroDataBox'];
  const health=names.map(name=>{const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(fn,name);return fn.getText(ast)}).join('\n');
  let body=[{...row,number:'QA999'}],ok=true,fetches=0;
  const fresh=()=>vm.createContext({selectAeroDataBoxOccurrence,radarHealth:new Map(),process:{env:{AERODATABOX_API_KEY:'synthetic-only'}},Date:class extends Date{static now(){return now;}},
    envAny:keys=>keys.includes('AERODATABOX_API_KEY')?'synthetic-only':'',jsonFetch:async()=>{fetches++;return{response:{ok},payload:body};},firstKnown:(...values)=>values.find(value=>value!==undefined&&value!==null&&value!=='')});
  const query=(ctx,flight)=>ctx.providerAeroDataBox({iata:flight,gateQueryEvidence:{...occurrence,flight}},1000);
  const valid=fresh();vm.runInContext(health,valid);
  assert.equal((await query(valid,'QA123')).ok,false,'no unique occurrence in a valid response');
  assert.equal(valid.providerAvailable('aerodatabox',['AERODATABOX_API_KEY']),true,'valid response without the occurrence keeps the provider available');
  body=[{...row,number:'QA999'}];
  assert.equal((await query(valid,'QA999')).ok,true,'another flight is still queried and accepted');
  const failing=fresh();vm.runInContext(health,failing);ok=false;
  assert.equal((await query(failing,'QA123')).ok,false);
  assert.equal(failing.providerAvailable('aerodatabox',['AERODATABOX_API_KEY']),false,'HTTP failure still backs off');
  assert.equal(await query(failing,'QA999'),null,'back-off skips the provider for other flights');
  assert.equal(fetches,3);
  console.log('PASS AeroDataBox provider health (real providerAvailable/markProvider): valid response without the occurrence keeps the provider for other flights; HTTP failure still backs off.');
}
