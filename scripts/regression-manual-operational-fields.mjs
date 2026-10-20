import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';import {buildSync} from 'esbuild';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'manual-operational-')),file=path.join(dir,'gate.cjs');
buildSync({entryPoints:['client/src/lib/nextFlightGate.ts'],bundle:true,platform:'node',format:'cjs',outfile:file,alias:{'@':path.resolve('client/src')},logLevel:'silent'});
const modules={load:()=>createRequire(import.meta.url)(file),cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
try {
 const m=modules.load('nextFlightGate'),now=Date.parse('2032-10-20T09:01:00Z'),received=now-60000,observed='2032-10-20T08:59:00Z';
 const event={id:'synthetic-occurrence',kind:'flight',flightNumber:'QA4002',origin:'BSB',destination:'GRU',date:'2032-10-20T12:30:00Z',canonical:{startDateTime:'2032-10-20T12:30:00Z'},status:'Programado',gate:'24'};
 const storage={map:new Map(),getItem(key){return this.map.get(key)||null;},setItem(key,value){this.map.set(key,value);}};
 const account='synthetic-owner',read=()=>m.readManualGate(storage,account,event),resolve=(radar=null,manual=read())=>m.resolveNextFlightGate({event,radar,manual,now});
 const proof=(value)=>({version:1,value,sourceObservedAt:observed,provenance:'synthetic-source-field'});
 const radar={ok:true,flight:event.flightNumber,sourceOrigin:event.origin,sourceDestination:event.destination,scheduledDepartureUtc:event.canonical.startDateTime,updatedAt:received,gate:'17',status:'Embarcando',registration:'PR-XYZ',terminal:'2',operationalEvidence:{gate:proof('17'),status:proof('Embarcando'),registration:proof('PR-XYZ')}};
 let info=resolve();assert.equal(info.status,'');assert.equal(info.gate,'');assert.equal(info.statusSource,null);assert.equal(info.plannedStatus,'Programado');assert.equal(info.plannedGate,'24');assert.equal(m.gateDisplay(info),'Não confirmado');
 assert.equal(resolve({...radar,operationalEvidence:undefined}).gate,'');assert.equal(resolve({...radar,operationalEvidence:undefined}).status,'');assert.equal(resolve({...radar,operationalEvidence:undefined}).registration,'');
 for(const patch of [{flight:''},{sourceOrigin:''},{sourceDestination:''},{flight:'OTHER1'},{sourceOrigin:'REC'},{scheduledDepartureUtc:'2032-10-20T13:30:00Z'},{updatedAt:now+1},{updatedAt:now-31*60000}]) {
  info=resolve({...radar,...patch});assert.equal(info.status,'');assert.equal(info.gate,'');assert.equal(info.registration,'');assert.equal(info.terminal,'');
 }
 for(const field of ['gate','status','registration']) for(const p of [{sourceObservedAt:'2032-10-20T09:02:00Z'},{sourceObservedAt:'2032-10-20T08:00:00Z'},{sourceObservedAt:''},{provenance:''},{value:'OTHER'},{conflict:true}]) {
  info=resolve({...radar,operationalEvidence:{...radar.operationalEvidence,[field]:{...radar.operationalEvidence[field],...p}}});assert.equal(info[field],'',field+' fails closed without fresh matching field proof');
 }
 info=resolve(radar);assert.equal(info.gate,'17');assert.equal(info.status,'Embarcando');assert.equal(info.registration,'PR-XYZ');assert.equal(info.terminal,'','gate proof does not establish terminal');assert.equal(info.statusSource,'radar');
 assert(Number.isNaN(m.sourceInstantEpochMs([observed])));assert.equal(resolve({...radar,operationalEvidence:{...radar.operationalEvidence,status:{...proof('Embarcando'),sourceObservedAt:[observed]}}}).status,'');
 assert.equal(m.patchManualOperationalFields(storage,account,{...event,canonical:{startDateTime:[event.canonical.startDateTime]}},{status:'Embarcando'},'Synthetic',now).ok,false);
 assert.equal(resolve({...radar,gate:'POSITION 17'}).radarRejected,'position');
 for(const watermark of [{sourceUpdatedAtEpochMs:Date.parse(observed),gate:'17',conflicted:true},{sourceUpdatedAtEpochMs:received,gate:'18',conflicted:false}]) {const x=resolve({...radar,gateUpdateWatermark:watermark});assert.equal(x.gate,'');assert(x.operationalConflicts.includes('gate'));}
 for(const field of ['gate','status','registration']) {const conflicted=resolve({...radar,operationalConflicts:[field]});assert.equal(conflicted[field],'');assert(conflicted.operationalConflicts.includes(field));}
 // Legacy source evidence is retained, but cannot silently bind to a repeated flight.
 const legacy={gate:'25',terminal:'3',flight:event.flightNumber,date:'2032-10-20',origin:'BSB',destination:'GRU',author:'Synthetic',setAtEpochMs:now-1000,sourceReview:{action:'keep',fingerprint:'kept'}};
 const v1='crewcheck:manual-gate:v1:'+account;storage.setItem(v1,JSON.stringify({[m.manualGateIdentity(event)]:legacy}));const legacyBytes=storage.getItem(v1);
 info=resolve();assert.equal(info.gate,'');assert.equal(info.manualGateUnlinked,true);assert.equal(info.manual.gate,'25');assert.equal(info.manualReview.state,'none');
 assert(m.patchManualOperationalFields(storage,account,event,{status:'Atrasado'},'Synthetic',now).ok);info=resolve();assert.equal(info.status,'Atrasado');assert.equal(info.statusSource,'manual');assert.equal(info.gateSource,null);assert.equal(storage.getItem(v1),legacyBytes);
 const statusStamp=read().operationalStatus.setAtEpochMs;
 assert(m.patchManualOperationalFields(storage,account,event,{registration:'pr-abc'},'Other author',now).ok);assert.equal(read().operationalRegistration.value,'PR-ABC');assert.equal(read().operationalStatus.setAtEpochMs,statusStamp);
 assert(m.patchManualOperationalFields(storage,account,event,{status:null},'Synthetic',now).ok);assert.equal(read().operationalStatus,undefined);assert.equal(read().operationalRegistration.value,'PR-ABC');assert.equal(storage.getItem(v1),legacyBytes);
 assert(m.writeManualGate(storage,account,event,{gate:'26',terminal:'4',author:'Synthetic'},now).ok);assert.equal(read().scheduledDepartureUtc,'2032-10-20T12:30:00.000Z');assert.equal(read().operationalRegistration.value,'PR-ABC');assert.equal(resolve().gate,'26');
 assert(m.patchManualOperationalFields(storage,account,event,{status:'Atrasado'},'Synthetic',now).ok);info=resolve(radar);assert.equal(info.status,'Atrasado');assert.equal(info.registration,'PR-ABC');assert.equal(info.gate,'26');assert.deepEqual(info.operationalConflicts,['gate','status','registration']);
 assert(m.writeManualGate(storage,account,event,{gate:'',author:'Synthetic'},now).ok);assert.equal(resolve().gate,'');assert.equal(resolve().status,'Atrasado');assert.equal(resolve().gateSource,null);
 const other={...event,canonical:{startDateTime:'2032-10-20T13:30:00Z'}};assert.equal(m.resolveNextFlightGate({event:other,manual:m.readManualGate(storage,account,other),now}).gate,'');assert.equal(m.readManualGate(storage,account,other).operationalStatus,undefined);assert.equal(m.readManualGate(storage,'other-account',event),null);
 const v2='crewcheck:manual-gate:v2:'+account;storage.setItem('crewcheck:manual-gate:v2:other-account',storage.getItem(v2));assert.equal(m.readManualGate(storage,'other-account',event),null,'copied map does not cross account ownership');
 const before=JSON.stringify([...storage.map]);for(const p of [{status:''},{registration:'???'},{status:'Não confirmado'}])assert.equal(m.patchManualOperationalFields(storage,account,event,p,'Synthetic',now).ok,false);assert.equal(JSON.stringify([...storage.map]),before);
 assert.equal(m.patchManualOperationalFields(storage,'local',event,{status:'Embarcando'},'Synthetic',now).ok,false);assert.equal(m.patchManualOperationalFields(storage,account,{...event,canonical:{}},{status:'Embarcando'},'Synthetic',now).ok,false);
 const failing={getItem:key=>storage.getItem(key),setItem(){throw Error('quota');}};assert.equal(m.patchManualOperationalFields(failing,account,event,{status:null},'Synthetic',now).ok,false);assert.equal(JSON.stringify([...storage.map]),before);
 assert(m.patchManualOperationalFields(storage,account,event,{status:null,registration:null},'Synthetic',now).ok);assert.equal(read().operationalStatus,undefined);assert.equal(read().operationalRegistration,undefined);assert.equal(resolve().manualGateUnlinked,true);assert.equal(storage.getItem(v1),legacyBytes);
 // Two identical flight/date/route occurrences retain independent gates and reviews.
 const a={...event,canonical:{startDateTime:'2032-10-20T12:30:00Z'}},b={...event,id:'synthetic-second',canonical:{startDateTime:'2032-10-20T15:30:00Z'}};
 const linked=(e)=>m.resolveNextFlightGate({event:e,manual:m.readManualGate(storage,account,e),now});
 assert(m.writeManualGate(storage,account,a,{gate:'11',terminal:'1',author:'Synthetic'},now-5*60000).ok);assert(m.writeManualGate(storage,account,b,{gate:'22',terminal:'2',author:'Synthetic'},now).ok);assert.equal(linked(a).gate,'11');assert.equal(linked(b).gate,'22');
 assert(m.writeManualGate(storage,account,b,{gate:'',author:'Synthetic'},now).ok);assert.equal(linked(a).gate,'11');assert.equal(linked(b).gate,'');assert.equal(storage.getItem(v1),legacyBytes);
 const custom={...radar,origin:'BSB',destination:'GRU',operationalDate:'2032-10-20',operationalEvidence:undefined,gateUpdate:{version:1,provider:'custom',kind:'departure-gate-update',sourceUpdatedAt:observed,gate:'17',flight:event.flightNumber,origin:'BSB',destination:'GRU',scheduledDepartureUtc:a.canonical.startDateTime}};
 assert(m.patchManualOperationalFields(storage,account,a,{status:'Embarcando',registration:'PR-ABC'},'Synthetic',now).ok);
 storage.setItem(m.radarSnapshotStorageKey(a),JSON.stringify(custom));let reviewInfo=m.resolveNextFlightGate({event:a,manual:m.readManualGate(storage,account,a),radar:custom,now});assert.equal(reviewInfo.manualReview.state,'newer');
 const choose=action=>m.writeManualGateReview(storage,account,a,{action,expectedManualRevision:m.manualGateRevision(m.readManualGate(storage,account,a),account),expectedSourceFingerprint:reviewInfo.manualReview.candidate.fingerprint,author:'Synthetic'},now);
 assert(choose('keep').ok);assert.equal(linked(a).manual.sourceReview.action,'keep');assert.equal(linked(a).gate,'11');assert.equal(linked(b).gate,'');assert.equal(storage.getItem(v1),legacyBytes);
 assert(m.patchManualOperationalFields(storage,account,a,{status:null,registration:null},'Synthetic',now).ok);assert.equal(linked(a).status,'');assert.equal(linked(a).registration,'');assert.equal(linked(a).manual.operationalStatus,undefined);assert.equal(linked(a).manual.operationalRegistration,undefined);assert.equal(linked(a).gate,'11');assert.equal(storage.getItem(v1),legacyBytes,'review/clear never creates v1 shadow fields');
 for(const patch of [{setAtEpochMs:now+100000},{setAtEpochMs:String(now)},{author:''},{author:'   '}]) {const manual={...m.readManualGate(storage,account,a),...patch};assert.equal(m.resolveNextFlightGate({event:a,manual,now}).gate,'');}
 for(const watermark of [{sourceUpdatedAtEpochMs:Date.parse(observed),gate:'17',conflicted:true},{sourceUpdatedAtEpochMs:received,gate:'18',conflicted:false}]){const x=m.resolveNextFlightGate({event:a,radar:{...custom,gateUpdateWatermark:watermark},now});assert.equal(x.gate,'');assert(x.operationalConflicts.includes('gate'));}
 console.log('PASS same-domain manual operational fields: exact occurrence/account, v1 preservation/confirmation, per-field patch/clear, manual priority/conflict, strict source observation+receipt, placeholders, quota, no Radar/network writes.');
} finally {modules.cleanup();}
