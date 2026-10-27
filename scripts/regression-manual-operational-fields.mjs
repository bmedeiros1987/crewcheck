import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';import {buildSync} from 'esbuild';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'manual-operational-')),file=path.join(dir,'gate.cjs'),watchFile=path.join(dir,'watch.cjs');
buildSync({entryPoints:['client/src/lib/nextFlightGate.ts'],bundle:true,platform:'node',format:'cjs',outfile:file,alias:{'@':path.resolve('client/src')},logLevel:'silent'});
buildSync({entryPoints:['client/src/lib/nextFlightWatch.ts'],bundle:true,platform:'node',format:'cjs',outfile:watchFile,alias:{'@':path.resolve('client/src')},logLevel:'silent'});
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
 assert.equal(m.sourceInstantEpochMs('2032-10-20T09:01:00.999Z'),now+999,'explicit fractional milliseconds must be retained');
 assert.equal(resolve({...radar,updatedAt:now,operationalEvidence:{...radar.operationalEvidence,status:{...proof('Embarcando'),sourceObservedAt:'2032-10-20T09:01:00.999Z'}}}).status,'','a future observation within this second is not fresh evidence');
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
 assert(m.patchManualOperationalFields(storage,account,event,{status:null,registration:null},'Synthetic',now).ok);assert.equal(read(),null);assert.equal(resolve().manualGateUnlinked,false);assert.equal(storage.getItem(v1),legacyBytes);
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
 // Explicit removal also dismisses the legacy prefill only for this UTC.
 const tombstones={map:new Map([[v1,legacyBytes]]),getItem(key){return this.map.get(key)||null;},setItem(key,value){this.map.set(key,value);}};
 assert.equal(m.readManualGate(tombstones,account,a).gate,'25');assert(m.writeManualGate(tombstones,account,a,{gate:'',author:'Synthetic'},now).ok);assert.equal(m.readManualGate(tombstones,account,a),null);assert.equal(m.readManualGate(tombstones,account,b).gate,'25');
 assert(m.patchManualOperationalFields(tombstones,account,a,{status:'Embarcando',registration:'PR-ABC'},'Synthetic',now).ok);assert.equal(m.readManualGate(tombstones,account,a).gate,'');assert(m.patchManualOperationalFields(tombstones,account,a,{status:null,registration:null},'Synthetic',now).ok);assert.equal(m.readManualGate(tombstones,account,a),null,'clearing sibling fields retains gate tombstone');
 assert(m.writeManualGate(tombstones,account,a,{gate:'11',author:'Synthetic'},now).ok);assert.equal(m.readManualGate(tombstones,account,a).gate,'11');assert(m.writeManualGate(tombstones,account,a,{gate:'',author:'Synthetic'},now).ok);assert.equal(m.readManualGate(tombstones,account,a),null,'removing a replacement gate does not resurrect legacy');assert.equal(m.readManualGate(tombstones,account,b).gate,'25');assert.equal(tombstones.getItem(v1),legacyBytes,'legacy bytes remain intact');
 // Boarding type is a separately labeled manual assertion, atomically bound to a gate revision.
 const typed={map:new Map(),getItem(key){return this.map.get(key)||null;},setItem(key,value){this.map.set(key,value);}};
 const typedRead=(e=event,owner=account)=>m.readManualGate(typed,owner,e);
 const typedInfo=(at=now,e=event,owner=account)=>m.resolveNextFlightGate({event:e,manual:typedRead(e,owner),now:at});
 const typedRevision=()=>m.manualGateRevision(typedRead(),account,event);
 const typedWrite=(gate,boardingType,at=now,expectedManualRevision=typedRevision())=>m.writeManualGate(typed,account,event,{gate,boardingType,author:'Synthetic type author',expectedManualRevision},at);
 assert.equal(typedInfo().boardingType,'unknown');assert.equal(typedInfo().manualBoardingType,null);
 assert(m.writeManualGate(typed,account,event,{gate:'47',author:'Existing v2 author'},now-600000).ok);
 assert.equal(typedInfo().boardingType,'unknown','old v2 gates do not establish an airport catalogue type');
 const untyped=typedRead();assert.equal(m.manualGateRevision(untyped,account),JSON.stringify([account,untyped.gate,untyped.terminal||'',untyped.setAtEpochMs,untyped.sourceReview||null,untyped.scheduledDepartureUtc||'']),'untyped two-argument revision stays byte-identical for persisted notice dedup');assert.equal(m.manualGateRevision(null,account),'');
 const oldV2=typed.getItem(v2),noTypeRevision=typedRevision();
 assert.equal(m.writeManualGate(typed,account,event,{gate:'47',boardingType:'remote',author:'Synthetic'},now).ok,false,'typed write requires a captured revision');
 assert.equal(typed.getItem(v2),oldV2);
 assert(typedWrite('47','remote').ok);let typedResolved=typedInfo();
 assert.equal(typedResolved.gate,'47');assert.equal(typedResolved.boardingType,'remote');assert.equal(typedResolved.remote,false,'numeric remote assertion does not change legacy remote flag');
 assert.deepEqual(typedResolved.manualBoardingType,{value:'remote',gate:'47',gateSetAtEpochMs:now,author:'Synthetic type author',setAtEpochMs:now});
 assert.notEqual(typedRevision(),noTypeRevision);
 const persisted=JSON.parse(typed.getItem(v2)),identity=Object.keys(persisted)[0];
 assert.deepEqual(persisted[identity].gate.boardingType,typedResolved.manualBoardingType);
 // Deterministic storage seam: a newer write lands after the first comparison but before persistence.
 // This proves the last re-read guard, not an atomic cross-tab localStorage transaction.
 for(const newerGate of ['47','50']) {
  const oldBytes=typed.getItem(v2),newerMap=JSON.parse(oldBytes),nextGate=newerMap[identity].gate;
  nextGate.value=newerGate;nextGate.boardingType={...nextGate.boardingType,value:'finger',gate:newerGate};
  const newerBytes=JSON.stringify(newerMap),raceData=new Map(typed.map),expected=typedRevision();let v2Reads=0,writeAttempts=0;
  const interleaved={getItem(key){const captured=raceData.get(key)||null;if(key===v2&&++v2Reads===2)raceData.set(v2,newerBytes);return captured;},setItem(key,value){writeAttempts++;raceData.set(key,value);}};
  const outcome=m.writeManualGate(interleaved,account,event,{gate:'47',boardingType:'remote',author:'Stale synthetic tab',expectedManualRevision:expected},now);
  assert.equal(outcome.ok,false,'prewrite revision recheck refuses a newer gate/type after initial comparison');assert(v2Reads>=3,'counterexample changed storage after the initial comparison');assert.equal(writeAttempts,0);assert.equal(raceData.get(v2),newerBytes,'latest gate/type record is not overwritten');
 }

 assert.equal(typedInfo(now+24*3600000).boardingType,'remote','no unapproved expiry policy is imposed on a manual assertion');
 assert.equal(typedInfo(now+24*3600000).manualBoardingType.setAtEpochMs,now,'reading never refreshes the manual timestamp');
 const firstTypedRevision=typedRevision();assert(typedWrite('47','finger').ok);
 assert.notEqual(typedRevision(),firstTypedRevision,'same-millisecond type-only edit changes the review/CAS token');
 const changedTypeBytes=typed.getItem(v2);assert.equal(typedWrite('47','remote',now,firstTypedRevision).ok,false);assert.equal(typed.getItem(v2),changedTypeBytes,'a stale tab cannot overwrite the newer type');
 assert.equal(typedInfo().boardingType,'finger');assert.equal(typedInfo().remote,false);
 assert(m.patchManualOperationalFields(typed,account,event,{status:'Embarcando',registration:'PR-TYP'},'Synthetic sibling',now+1).ok);
 assert.equal(typedInfo(now+1).boardingType,'finger');assert.equal(typedInfo(now+1).manualBoardingType.setAtEpochMs,now,'sibling edits do not reconfirm boarding type');
 assert(typedWrite('48','unknown',now+2).ok);assert.equal(typedInfo(now+2).boardingType,'unknown');assert.equal(typedInfo(now+2).manualBoardingType,null);assert.equal(typedInfo(now+2).status,'Embarcando');assert.equal(typedInfo(now+2).registration,'PR-TYP');
 assert(typedWrite('48','remote',now+3).ok);assert(m.writeManualGate(typed,account,event,{gate:'49',author:'Existing gate writer'},now+4).ok);assert.equal(typedInfo(now+4).boardingType,'unknown','changing gate through an existing writer drops its old type');
 assert(typedWrite('49','remote',now+5).ok);assert(typedWrite('','unknown',now+6).ok);assert.equal(typedInfo(now+6).boardingType,'unknown');assert.equal(typedInfo(now+6).gate,'');assert.equal(typedInfo(now+6).status,'Embarcando');
 assert(typedWrite('49','unknown',now+7).ok);assert.equal(typedInfo(now+7).boardingType,'unknown','returning to a former gate does not revive its old type');
 assert(typedWrite('47','remote').ok);
 for(const changed of [{...event,flightNumber:'QA9999'},{...event,origin:'REC'},{...event,destination:'CNF'},{...event,canonical:{startDateTime:'2032-10-20T15:30:00Z'}},{...event,canonical:{startDateTime:'2032-10-21T12:30:00Z'}}])assert.equal(typedInfo(now,changed).boardingType,'unknown','type belongs only to the exact occurrence');
 // An editor token also binds the exact occurrence, even when legacy gate/review bytes match.
 const otherTypedEvent={...event,flightNumber:'QA4999'};
 assert(m.writeManualGate(typed,account,otherTypedEvent,{gate:'47',author:'Synthetic type author'},now).ok);
 const otherUntyped=m.readManualGate(typed,account,otherTypedEvent);
 const sameUntypedEvent={...event,flightNumber:'QA4888'};
 assert(m.writeManualGate(typed,account,sameUntypedEvent,{gate:'47',author:'Synthetic type author'},now).ok);
 const sameUntyped=m.readManualGate(typed,account,sameUntypedEvent);
 assert.equal(m.manualGateRevision(otherUntyped,account),m.manualGateRevision(sameUntyped,account),'old notice token intentionally omits flight/route because caller supplies scope');
 assert.notEqual(m.manualGateRevision(otherUntyped,account,otherTypedEvent),m.manualGateRevision(sameUntyped,account,sameUntypedEvent),'editor token includes occurrence independent of gate bytes');
 const beforeCrossScope=typed.getItem(v2);
 assert.equal(m.writeManualGate(typed,account,otherTypedEvent,{gate:'47',boardingType:'remote',author:'Synthetic',expectedManualRevision:m.manualGateRevision(sameUntyped,account,sameUntypedEvent)},now).ok,false);assert.equal(typed.getItem(v2),beforeCrossScope);
 const emptyEventA={...event,flightNumber:'QA4777'},emptyEventB={...event,flightNumber:'QA4666'};
 assert.notEqual(m.manualGateRevision(null,account,emptyEventA),m.manualGateRevision(null,account,emptyEventB));
 assert.equal(m.writeManualGate(typed,account,emptyEventB,{gate:'47',boardingType:'remote',author:'Synthetic',expectedManualRevision:m.manualGateRevision(null,account,emptyEventA)},now).ok,false);assert.equal(typed.getItem(v2),beforeCrossScope,'empty-entry revision cannot cross occurrence either');
 assert.equal(typedInfo(now,event,'other-owner').boardingType,'unknown');
 typed.setItem('crewcheck:manual-gate:v2:other-owner',typed.getItem(v2));assert.equal(typedInfo(now,event,'other-owner').boardingType,'unknown','copying bytes does not transfer account ownership');
 const validTypeMap=typed.getItem(v2);
 for(const patch of [{value:'bus'},{value:'unknown'},{gate:'48'},{gateSetAtEpochMs:now-1},{gateSetAtEpochMs:String(now)},{setAtEpochMs:0},{setAtEpochMs:NaN},{setAtEpochMs:String(now)},{setAtEpochMs:now+1},{author:''},{author:' '},{author:'x'.repeat(61)}]) {
  const map=JSON.parse(validTypeMap);map[identity].gate.boardingType={...map[identity].gate.boardingType,...patch};typed.setItem(v2,JSON.stringify(map));
  const bad=typedInfo();assert.equal(bad.gate,'47');assert.equal(bad.boardingType,'unknown',JSON.stringify(patch));assert.equal(bad.manualBoardingType,null);
 }
 typed.setItem(v2,validTypeMap);
 const futureManual={...typedRead(),setAtEpochMs:now+1,boardingType:{...typedRead().boardingType,gateSetAtEpochMs:now+1,setAtEpochMs:now+1}};const futureType=m.resolveNextFlightGate({event,manual:futureManual,now});assert.equal(futureType.boardingType,'unknown');assert.equal(futureType.manualBoardingType,null,'otherwise coherent future-dated confirmation still fails closed');
 const beforeBadWrites=JSON.stringify([...typed.map]);
 for(const type of ['',null,'bus',{},['remote']])assert.equal(typedWrite('47',type).ok,false,'invalid selections are not silently treated as confirmation');
 assert.equal(JSON.stringify([...typed.map]),beforeBadWrites);
 const failTyped={getItem:key=>typed.getItem(key),setItem(){throw Error('quota');}};
 assert.equal(m.writeManualGate(failTyped,account,event,{gate:'47',boardingType:'finger',author:'Synthetic',expectedManualRevision:typedRevision()},now).ok,false);assert.equal(JSON.stringify([...typed.map]),beforeBadWrites,'quota failure preserves gate and type atomically');
 // Legacy v1 properties must never masquerade as v2 type confirmation, even with a UTC-bound gate.
 const legacyTyped={...legacy,gate:'47',scheduledDepartureUtc:event.canonical.startDateTime,boardingType:typedInfo().manualBoardingType};
 const legacyTypeStore={getItem:key=>key===v1?JSON.stringify({[m.manualGateIdentity(event)]:legacyTyped}):null,setItem(){throw Error('read-only legacy fixture');}};
 const legacyTypeInfo=m.resolveNextFlightGate({event,manual:m.readManualGate(legacyTypeStore,account,event),now});assert.equal(legacyTypeInfo.gate,'47');assert.equal(legacyTypeInfo.boardingType,'unknown');assert.equal(legacyTypeInfo.manualBoardingType,null);
 // Explicit source review keeps a timestamp unchanged, but accepting another gate cannot inherit its type.
 assert(typedWrite('47','remote',now-5*60000).ok);typed.setItem(m.radarSnapshotStorageKey(event),JSON.stringify(custom));
 const typedReview=at=>m.resolveNextFlightGate({event,manual:typedRead(),radar:JSON.parse(typed.getItem(m.radarSnapshotStorageKey(event))),now:at});
 const reviewChoice=(action,at)=>m.writeManualGateReview(typed,account,event,{action,expectedManualRevision:m.manualGateRevision(typedRead(),account),expectedSourceFingerprint:typedReview(at).manualReview.candidate.fingerprint,author:'Synthetic reviewer'},at);
 const typeBeforeKeep=typedInfo().manualBoardingType;assert.equal(typedReview(now).manualReview.state,'newer');assert(reviewChoice('keep',now).ok);assert.deepEqual(typedInfo().manualBoardingType,typeBeforeKeep);
 const newer={...custom,updatedAt:now+60000,gate:'18',gateUpdate:{...custom.gateUpdate,gate:'18',sourceUpdatedAt:new Date(now+30000).toISOString()}};typed.setItem(m.radarSnapshotStorageKey(event),JSON.stringify(newer));
 assert.equal(typedReview(now+60000).manualReview.state,'newer');assert(reviewChoice('accept',now+60000).ok);assert.equal(typedInfo(now+60000).gate,'18');assert.equal(typedInfo(now+60000).boardingType,'unknown');assert.equal(typedInfo(now+60000).manualBoardingType,null);
 // Phone/web tri-state must not silently broaden the existing native v1 contract.
 const {applyNextFlightToWatchSnapshot}=createRequire(import.meta.url)(watchFile);
 const snapshot={schedule:[{id:'type-occurrence'}],currentFlight:event.flightNumber,generatedAtEpochMs:now,validUntilEpochMs:now+3600000,gate:'',remoteStand:false};
 const watch=info=>applyNextFlightToWatchSnapshot(snapshot,info,{primaryEventId:event.id,nextFlightScheduleId:'type-occurrence'});
 assert(typedWrite('47','unknown').ok);const watchUnknown=watch(typedInfo());
 assert(typedWrite('47','remote').ok);assert.deepEqual(watch(typedInfo()),watchUnknown,'Remota with numeric gate remains app-only metadata');
 assert(typedWrite('47','finger').ok);assert.deepEqual(watch(typedInfo()),watchUnknown,'Finger does not mutate the native boolean or payload');
 const beforeContradiction=typed.getItem(v2);assert.equal(typedWrite('REMOTA','finger').ok,false,'explicit Finger cannot contradict the legacy remote gate text');assert.equal(typed.getItem(v2),beforeContradiction);
 assert(typedWrite('REMOTA','unknown').ok);assert.equal(typedInfo().boardingType,'unknown','legacy text inference is not an explicit manual-type confirmation');assert.equal(typedInfo().remote,true);assert.equal(watch(typedInfo()).remoteStand,true,'legacy textual remote projection remains unchanged');
 console.log('PASS same-domain manual operational fields: exact occurrence/account, v1 preservation/confirmation, per-field patch/clear, manual priority/conflict, strict source observation+receipt, placeholders, quota, typed gate CAS/legacy/account/UTC/review/timestamp safety, native contract unchanged, no Radar/network writes.');
} finally {modules.cleanup();}
