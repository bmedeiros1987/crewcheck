// Inactive composition of the EXISTING receiver, pool, journal and Play reader.
// No env/secret/client loader, new endpoint, workflow, connection or live caller.
import assert from 'node:assert/strict';
import { createReleaseJournalHandler } from './route.mjs';
import { MOBILE_OPERATIONS } from './enrollment.mjs';
import { createPlayStateReader, createReviewSafeCommit } from '../../scripts/android-play/play_state_reader.mjs';
import { snapshotDigest } from '../../scripts/android-play/reconcile_journal.mjs';

export const SHARED_WRITERS=Object.freeze(['mobile_internal.py','allocate_versions.py','publish.py','crewwatch_internal.py','console']);
export function prepareMobileExecutionCapabilities({storeRequest,coordinationProvider,verifyConsumedArtifacts,readCompleteState,now=()=>Date.now(),timeoutMs=10000}={}) {
 assert.equal(typeof storeRequest,'function');assert.equal(typeof verifyConsumedArtifacts,'function');assert.equal(typeof readCompleteState,'function');
 assert(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=30000);
 for(const method of ['verify','isVerified','isFresh'])assert.equal(typeof coordinationProvider?.[method],'function');
 async function bounded(work){
  const controller=new AbortController();let timer;
  try{return await Promise.race([Promise.resolve().then(()=>work(controller.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('MOBILE_EXECUTION_TIMEOUT_UNCERTAIN'));},timeoutMs);})]);}
  finally{clearTimeout(timer);}
 }
 // An adapter must honor AbortSignal, refuse redirects and never retry. A remote
 // side effect may still complete after timeout; durable pending stays fenced.
 const request=req=>bounded(signal=>storeRequest({...req,signal,retries:0,redirect:'error'}));
 const reader=createPlayStateReader({request,now});
 async function coordination(record,operation,observation=null,retain=false){
  assert.equal(record.plan.producer,'mobile');assert.deepEqual(record.plan.modules,['app']);
  // This is an independent sealed provider, never caller-supplied positive flags.
  const proof=await bounded(signal=>coordinationProvider.verify(structuredClone(record),operation,structuredClone(observation),{signal}));
  assert.equal(coordinationProvider.isVerified(proof),true,'Unsealed coordination proof');
  assert.equal(coordinationProvider.isFresh(proof),true,'Stale coordination proof');
  assert.equal(proof.package,record.package);assert.equal(proof.planSha256,record.plan.planSha256);
  assert.equal(proof.editId,record.editId??null);assert.equal(proof.inventoryComplete,true);
  assert.equal(proof.reviewState,'clear');assert.equal(proof.otherEditState,'none');
  assert.deepEqual(Object.keys(proof.writers).sort(),[...SHARED_WRITERS].sort());
  assert(Object.values(proof.writers).every(value=>value==='fenced'),'Uncoordinated shared-package writer');
  if(observation)assert.equal(proof.observationSha256,observation.inventorySha256);
  if(record.allocation){
   assert(proof.baseline);assert.equal(proof.baseline.inventorySha256,record.allocation.inventorySha256);
   const snapshot=Object.fromEntries(['package','editId','edit','tracks','bundles','apks'].map(k=>[k,proof.baseline[k]]));
   assert.equal(snapshotDigest(snapshot),proof.baseline.inventorySha256);
   assert.equal(proof.baseline.package,record.package);assert.equal(proof.baseline.editId,record.editId);
  }
  return retain?()=>coordinationProvider.isVerified(proof)===true&&coordinationProvider.isFresh(proof)===true:structuredClone(proof);
 }
 const verifyReviewProof=async(record,observed)=>{await coordination(record,record.state==='acknowledged'?'reconcile':'commit',observed);return true;};
 const commitOnce=createReviewSafeCommit({request,reader,verifyReviewProof});
 const proofCapabilities={
  verifyExecution:context=>coordination(context.current??context.next,context.operation,null,true),
  async verifyInventory(record,input){
   const observed=await reader.inventory(record);await coordination(record,'allocate',observed);
   assert.equal(input.inventorySha256,observed.inventorySha256);assert(input.floor>=observed.maxCode);
   return true;
  },
  async verifyArtifacts(record,artifacts){await coordination(record,'finalize');return await bounded(signal=>verifyConsumedArtifacts(structuredClone(record),structuredClone(artifacts),{signal}))===true;},
  async verifyStage(record,staged){
   assert.equal(record.state,'stage_started','Durable stage intent required');
   const observed=await reader.stage(record,staged),proof=await coordination(record,'pending',observed);
   const before=proof.baseline.tracks.find(t=>t.track==='internal');assert(before);
   const beforeCodes=before.releases.flatMap(r=>r.versionCodes??[]).map(String);
   const after=observed.tracks.find(t=>t.track==='internal');const afterCodes=after.releases.flatMap(r=>r.versionCodes??[]).map(String);
   assert(beforeCodes.every(code=>afterCodes.includes(code)),'Retained phone release lost');
   const other=Object.fromEntries(proof.baseline.tracks.filter(t=>t.track!=='internal').map(t=>[t.track,t]));
   assert.equal(staged.otherTracksBeforeSha256,snapshotDigest(other));return true;
  },
  commitOnce,
  async verifyReconciliation(record){await coordination(record,'reconcile');return true;},
 };
 const lifecycle={
  async readCompleteState(record){const observed=await bounded(signal=>readCompleteState(structuredClone(record),{signal}));await coordination(record,'reconcile',observed);return observed;},
  verifyReviewProof,
 };
 return Object.freeze({proofCapabilities:Object.freeze(proofCapabilities),lifecycle:Object.freeze(lifecycle)});
}

// Not used by platform.mjs: the live route remains the probe-only OFF composition.
// An option/enrollment cannot activate this factory. Future activation must be an
// independently reviewed code change, with concrete trusted providers configured.
export function createMobileJournalComposition(options={}) {
 const {enabled:ignored,allowedOperations:alsoIgnored,...trusted}=options;
 return createReleaseJournalHandler({...trusted,enabled:false,allowedOperations:MOBILE_OPERATIONS});
}
