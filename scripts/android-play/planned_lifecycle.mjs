// OFF: pure schema-v2 lifecycle for the existing SQL row; no API/transport/access.
import assert from 'node:assert/strict';
import {snapshotDigest} from './reconcile_journal.mjs';
const packageName='com.crewcheck.app';
const states=['planned','allocation_started','edit_known','allocated','finalized','stage_started','pending','acknowledged','reconciliation_required','reconciled'];
const exact=(v,keys)=>{assert(v&&Object.getPrototypeOf(v)===Object.prototype);assert.deepEqual(Object.keys(v).sort(),[...keys].sort());};
const sha=(v,n=64)=>assert(typeof v==='string'&&new RegExp(`^[0-9a-f]{${n}}$`).test(v));
const positive=v=>assert(Number.isSafeInteger(v)&&v>0);
const code=v=>{positive(v);assert(v<2100000000);};
const owner=v=>assert(typeof v==='string'&&/^[A-Za-z0-9:_-]{1,128}$/.test(v));
export function validatePlan(p){
  exact(p,['package','owner','producer','sourceSha','controllerSha','runId','modules','planSha256']);
  assert.equal(p.package,packageName);owner(p.owner);sha(p.sourceSha,40);sha(p.controllerSha,40);
  assert(typeof p.runId==='string'&&/^[1-9][0-9]*$/.test(p.runId));
  const modules={mobile:['app'],wear:['wear'],joint:['app','wear']};
  assert(Object.hasOwn(modules,p.producer));assert.deepEqual(p.modules,modules[p.producer]);sha(p.planSha256);
  const {planSha256,...body}=p;assert.equal(planSha256,snapshotDigest(body),'Plan digest mismatch');
}
function validateAllocation(a,p){
  exact(a,['inventorySha256','floor','versionCodes']);sha(a.inventorySha256);code(a.floor);
  exact(a.versionCodes,p.modules);let previous=a.floor;
  for(const m of p.modules){code(a.versionCodes[m]);assert(a.versionCodes[m]>previous);previous=a.versionCodes[m];}
}
function validateArtifacts(items,r){
  assert(Array.isArray(items));assert.deepEqual(items.map(x=>x.module),r.plan.modules);
  for(const a of items){
    exact(a,['module','package','versionCode','sourceSha','controllerSha','manifestSha256','uploadCertificateSha256','artifactSha256']);
    assert.equal(a.package,packageName);assert.equal(a.versionCode,r.allocation.versionCodes[a.module]);
    for(const field of ['sourceSha','controllerSha'])assert.equal(a[field],r.plan[field]);
    for(const field of ['manifestSha256','uploadCertificateSha256','artifactSha256'])sha(a[field]);
  }
}
function validateStage(s){exact(s,['track','expectedTrackSha256','otherTracksBeforeSha256']);assert.equal(s.track,'internal');sha(s.expectedTrackSha256);sha(s.otherTracksBeforeSha256);}
export function validatePlannedRecord(r){
  const fields=['schema','package','owner','generation','revision','state','plan','history'];
  if(r.editId!==undefined)fields.push('editId');if(r.allocation!==undefined)fields.push('allocation');
  if(r.artifacts!==undefined)fields.push('artifacts');if(r.staged!==undefined)fields.push('staged');if(r.reconciliationSha256!==undefined)fields.push('reconciliationSha256');
  exact(r,fields);assert.equal(r.schema,2);assert.equal(r.package,packageName);positive(r.generation);positive(r.revision);
  assert(states.includes(r.state));if(r.state==='stage_started')assert.equal(r.plan.producer,'mobile');validatePlan(r.plan);assert.equal(r.owner,r.plan.owner);
  assert(Array.isArray(r.history));assert.equal(r.history.length,r.generation-1);
  let lastRevision=0;
  for(const [i,h] of r.history.entries()){
    exact(h,['generation','revision','owner','planSha256','artifactsSha256','allocationSha256','reconciliationSha256','highWaterVersionCode']);
    assert.equal(h.generation,i+1);positive(h.revision);assert(h.revision>lastRevision&&h.revision<r.revision);lastRevision=h.revision;
    code(h.highWaterVersionCode);if(i>0)assert(h.highWaterVersionCode>r.history[i-1].highWaterVersionCode);
    owner(h.owner);for(const k of ['planSha256','artifactsSha256','allocationSha256','reconciliationSha256'])sha(h[k]);
  }
  const index=states.indexOf(r.state);
  assert.equal(r.editId!==undefined,index>=2);if(r.editId!==undefined)assert(typeof r.editId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(r.editId));
  assert.equal(r.allocation!==undefined,index>=3);if(r.allocation){validateAllocation(r.allocation,r.plan);if(r.history.length)assert(r.allocation.floor>=r.history.at(-1).highWaterVersionCode,'Allocation below previous generation');}
  assert.equal(r.artifacts!==undefined,index>=4);if(r.artifacts)validateArtifacts(r.artifacts,r);
  assert.equal(r.staged!==undefined,['pending','acknowledged','reconciliation_required','reconciled'].includes(r.state));if(r.staged){assert.equal(r.plan.producer,'mobile','Multi-track commit policy not implemented');validateStage(r.staged);}
  assert.equal(r.reconciliationSha256!==undefined,r.state==='reconciled');if(r.reconciliationSha256)sha(r.reconciliationSha256);
}
async function verified(c,name,...args){assert.equal(typeof c[name],'function',`Trusted ${name} capability missing`);assert.equal(await c[name](...args.map(x=>structuredClone(x))),true,`Trusted ${name} proof unverified`);}
export async function plannedMutation(op,current,expected,input,c){
  if(op==='reserve'){
    assert.equal(current,null,'Existing row requires explicit recovery');assert.equal(expected,null);validatePlan(input);
    await verified(c,'approvePlan',input);
    const r={schema:2,package:packageName,owner:input.owner,generation:1,revision:1,state:'planned',plan:input,history:[]};validatePlannedRecord(r);return r;
  }
  assert(current?.schema===2,'Legacy row cannot migrate implicitly');validatePlannedRecord(current);
  exact(expected,['owner','generation','revision']);assert.deepEqual(expected,{owner:current.owner,generation:current.generation,revision:current.revision});
  assert(current.revision<Number.MAX_SAFE_INTEGER);const r=structuredClone(current);r.revision++;
  if(op==='rollover'){
    assert.equal(current.state,'reconciled');validatePlan(input);assert.notEqual(input.owner,current.owner);assert.notEqual(input.runId,current.plan.runId);
    assert(current.generation<Number.MAX_SAFE_INTEGER);
    await verified(c,'approvePlan',input);await verified(c,'approveRollover',current,input);
    await verified(c,'verifyReconciliation',current);
    const h={generation:current.generation,revision:current.revision,owner:current.owner,planSha256:current.plan.planSha256,artifactsSha256:snapshotDigest(current.artifacts),allocationSha256:snapshotDigest(current.allocation),reconciliationSha256:current.reconciliationSha256,highWaterVersionCode:Math.max(...Object.values(current.allocation.versionCodes))};
    const next={schema:2,package:packageName,owner:input.owner,generation:current.generation+1,revision:r.revision,state:'planned',plan:input,history:[...current.history,h]};validatePlannedRecord(next);return next;
  }
  if(op==='startAllocation'){assert.equal(current.state,'planned');exact(input,[]);r.state='allocation_started';}
  else if(op==='saveEdit'){assert.equal(current.state,'allocation_started');exact(input,['editId']);r.editId=input.editId;r.state='edit_known';}
  else if(op==='allocate'){assert.equal(current.state,'edit_known');validateAllocation(input,current.plan);await verified(c,'verifyInventory',current,input);r.allocation=input;r.state='allocated';}
  else if(op==='finalize'){assert.equal(current.state,'allocated');validateArtifacts(input,current);await verified(c,'verifyArtifacts',current,input);r.artifacts=input;r.state='finalized';}
  else if(op==='startStage'){assert.equal(current.plan.producer,'mobile');assert.equal(current.state,'finalized');exact(input,[]);r.state='stage_started';}
  else if(op==='pending'){assert.equal(current.plan.producer,'mobile','Multi-track commit policy not implemented');assert(['finalized','stage_started'].includes(current.state));validateStage(input);await verified(c,'verifyStage',current,input);r.staged=input;r.state='pending';}
  else if(op==='acknowledged'||op==='reconciliation_required'){assert.equal(current.state,'pending');exact(input,[]);r.state=op;}
  else if(op==='reconcile'){
    assert(['acknowledged','reconciliation_required'].includes(current.state));exact(input,['reconciliationSha256']);sha(input.reconciliationSha256);
    await verified(c,'verifyReconciliation',current,input);r.reconciliationSha256=input.reconciliationSha256;r.state='reconciled';
  }else throw Error('Unknown planned lifecycle operation');
  validatePlannedRecord(r);return r;
}
