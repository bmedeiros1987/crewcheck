// Existing-table independent GitHub review; never supplied/modified by the OIDC job.
import assert from 'node:assert/strict';
import {snapshotDigest} from '../../scripts/android-play/reconcile_journal.mjs';
import {validatePlan} from '../../scripts/android-play/planned_lifecycle.mjs';
import {createPlatformJournal} from '../../scripts/android-play/platform_journal.mjs';
import {REPOSITORY_ID,OWNER_ID,WORKFLOW_REF,checkTimes} from './oidc.mjs';
export const PACKAGE='com.crewcheck.app';
export const OPERATIONS=Object.freeze(['probe','read','observe','reserve','startAllocation','saveEdit','allocate','finalize','startStage','commit','reconcile','rollover']);
const exact=(v,keys)=>{assert(v&&Object.getPrototypeOf(v)===Object.prototype);assert.deepEqual(Object.keys(v).sort(),[...keys].sort());};
const positive=v=>assert(typeof v==='string'&&/^[1-9][0-9]*$/.test(v));
const sha=v=>assert(typeof v==='string'&&/^[0-9a-f]{64}$/.test(v));
const parse=v=>typeof v==='string'?JSON.parse(v):structuredClone(v);
const keys=(run,attempt)=>{positive(run);positive(attempt);const suffix=PACKAGE+':'+run+':'+attempt;return {approval:'play-release-approval:'+suffix,revocation:'play-release-revocation:'+suffix,admission:'play-release-admission:'+suffix};};
export function validateApproval(a){
 exact(a,['schema','repositoryId','ownerId','runId','runAttempt','actorId','workflowRef','workflowSha','codeSha','binding','operations','issuedAt','expiresAt','recoveryUntil']);
 assert.equal(a.schema,1);assert.equal(a.repositoryId,REPOSITORY_ID);assert.equal(a.ownerId,OWNER_ID);for(const k of ['runId','runAttempt','actorId'])positive(a[k]);assert.equal(a.workflowRef,WORKFLOW_REF);
 for(const k of ['workflowSha','codeSha'])assert(typeof a[k]==='string'&&/^[0-9a-f]{40}$/.test(a[k]));exact(a.binding,['schema','generation','plan']);assert.equal(a.binding.schema,2);assert(Number.isSafeInteger(a.binding.generation)&&a.binding.generation>0);validatePlan(a.binding.plan);
 assert.equal(a.binding.plan.package,PACKAGE);assert.equal(a.binding.plan.runId,a.runId);assert.equal(a.binding.plan.sourceSha,a.codeSha);assert.equal(a.binding.plan.controllerSha,a.codeSha);
 assert(Array.isArray(a.operations)&&a.operations.length>0&&new Set(a.operations).size===a.operations.length&&a.operations.every(o=>OPERATIONS.includes(o)));
 for(const k of ['issuedAt','expiresAt','recoveryUntil'])assert(Number.isSafeInteger(a[k]));assert(a.expiresAt>a.issuedAt&&a.expiresAt-a.issuedAt<=7200);assert(a.recoveryUntil>=a.expiresAt&&a.recoveryUntil<=a.expiresAt+900);
}
function verifyReceipt(record){exact(record,['schema','approval','approver','approvalSha256']);assert.equal(record.schema,1);validateApproval(record.approval);sha(record.approvalSha256);assert.equal(record.approvalSha256,snapshotDigest(record.approval));exact(record.approver,['provider','principalRef','proofSha256']);assert.equal(record.approver.provider,'github-environment-review');assert(typeof record.approver.principalRef==='string'&&record.approver.principalRef.length>0&&record.approver.principalRef.length<=128);sha(record.approver.proofSha256);}
function match(record,revocation,claims,frame,time){
 verifyReceipt(record);const a=record.approval;
 exact(revocation,['schema','approvalSha256','revision','revoked']);assert.equal(revocation.schema,1);assert.equal(revocation.approvalSha256,record.approvalSha256);assert(Number.isSafeInteger(revocation.revision)&&revocation.revision>0);assert.equal(typeof revocation.revoked,'boolean');
 checkTimes(claims,time);assert.equal(claims.run_id,a.runId);assert.equal(claims.run_attempt,a.runAttempt);assert.equal(claims.actor_id,a.actorId);assert.equal(claims.workflow_ref,a.workflowRef);assert.equal(claims.workflow_sha,a.workflowSha);assert.equal(claims.sha,a.codeSha);
 assert.deepEqual(frame.binding,a.binding);assert(a.operations.includes(frame.operation));assert(time>=a.issuedAt);
 const recovery=frame.operation==='observe';
 if(recovery){assert(time<a.recoveryUntil);assert.equal(frame.revision,0);exact(frame.input,[]);}
 else{assert(time<a.expiresAt);assert.equal(revocation.revoked,false);}
 return record;
}
export function createApprovalStore(db,{now=()=>Math.floor(Date.now()/1000)}={}){
 assert.equal(db?.dialect,'mysql');assert.equal(typeof db.connect,'function');
 async function readRow(query,key){const result=await query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1',[key]);assert.equal(result.rows.length,1,'Independent approval absent');return parse(result.rows[0].payload);}
 async function read(claims,frame){const k=keys(claims.run_id,claims.run_attempt);const record=await readRow(db.query.bind(db),k.approval),rev=await readRow(db.query.bind(db),k.revocation);return match(record,rev,claims,frame,now());}
 function transitionAdmission(claims,frame,verifyFreshProof){
  assert.equal(typeof verifyFreshProof,'function');
  const pinnedClaims=structuredClone(claims),pinnedFrame=structuredClone(frame);
  return async(connection,context)=>{
   const k=keys(pinnedClaims.run_id,pinnedClaims.run_attempt);
   const rawRead=async key=>{const [rows]=await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[key]);assert.equal(rows.length,1);return parse(rows[0].payload);};
   const record=await rawRead(k.approval),revocation=await rawRead(k.revocation);
   match(record,revocation,pinnedClaims,pinnedFrame,now());
   // One service-owned commit spans TWO SQL transactions. Neither phase can be
   // requested as a frame; completion must cite this exact durable pending admission.
   const commit=pinnedFrame.operation==='commit';
   const completion=commit&&['acknowledged','reconciliation_required'].includes(context.operation);
   if(commit){
    assert(['pending','acknowledged','reconciliation_required'].includes(context.operation));
    assert.deepEqual(context.current.plan,pinnedFrame.binding.plan);
    assert.deepEqual(context.next.plan,pinnedFrame.binding.plan);
    assert.deepEqual(context.next.staged,pinnedFrame.input);
    assert.equal(context.next.state,context.operation);
    if(completion)assert.equal(context.current.state,'pending');
   }else assert.equal(context.operation,pinnedFrame.operation);
   assert.equal(context.next.package,PACKAGE);
   assert.equal(context.current?.revision??0,pinnedFrame.revision+(completion?1:0));assert.equal(context.current?.generation??1,pinnedFrame.binding.generation);
   const ledger=await rawRead(k.admission);exact(ledger,['schema','approvalSha256','revision','operations']);assert.equal(ledger.schema,1);assert.equal(ledger.approvalSha256,record.approvalSha256);assert(Number.isSafeInteger(ledger.revision)&&ledger.revision>0&&ledger.revision<Number.MAX_SAFE_INTEGER);assert(Array.isArray(ledger.operations)&&ledger.operations.length<128);
   for(const op of ledger.operations){exact(op,['opId','operation','owner','generation','revision','digest','resultRevision']);assert(typeof op.opId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(op.opId));assert(OPERATIONS.includes(op.operation));assert.equal(op.owner,record.approval.binding.plan.owner);assert.equal(op.generation,record.approval.binding.generation);assert(Number.isSafeInteger(op.revision)&&op.revision>=0);assert(Number.isSafeInteger(op.resultRevision)&&op.resultRevision>op.revision);sha(op.digest);}
   const phaseId=phase=>'commit_'+snapshotDigest({frame:pinnedFrame,phase});
   const opId=commit?phaseId(completion?'completion':'pending'):pinnedFrame.id;
   if(completion){const prior=ledger.operations.filter(o=>o.opId===phaseId('pending'));assert.equal(prior.length,1);assert.equal(prior[0].digest,snapshotDigest(pinnedFrame));assert.equal(prior[0].resultRevision,context.current.revision);}
   assert(!ledger.operations.some(o=>o.opId===opId),'Operation replay denied');
   const op={opId,operation:pinnedFrame.operation,owner:pinnedFrame.binding.plan.owner,generation:pinnedFrame.binding.generation,revision:context.current?.revision??0,digest:snapshotDigest(pinnedFrame),resultRevision:context.next.revision};
   const next={...ledger,revision:ledger.revision+1,operations:[...ledger.operations,op]};
   // ALL authority/admission locks and readbacks are now held. No await between
   // these last checks and the first ledger/journal write; waiting is not authority.
   assert.equal(verifyFreshProof(),true,'GitHub proof aged while waiting for locks');
   match(record,revocation,pinnedClaims,pinnedFrame,now());
   const [result]=await connection.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=CURRENT_TIMESTAMP(3) WHERE state_key=?',[JSON.stringify(next),k.admission]);assert.equal(result.affectedRows,1);
   const saved=await rawRead(k.admission);assert.deepEqual(saved,next);
   // A delayed SQL readback must also roll back admission before journal mutation.
   assert.equal(verifyFreshProof(),true,'GitHub proof aged during admission readback');
   match(record,revocation,pinnedClaims,pinnedFrame,now());
   // This update commits/rolls back WITH the existing journal mutation, not before it.
   return true;
  };
 }
 return Object.freeze({read,transitionAdmission});
}

// Private service-side materialization. Only a proof sealed by the independent
// GitHub provider can create authorization; no owner/admin/scheduler/job assertion.
export function createGitHubApprovalBinder({db,proofProvider}){
 assert.equal(typeof proofProvider?.isVerified,'function');
 async function transaction(work){const c=await db.connect();assert(c!==db&&typeof c.release==='function'&&typeof c.discard==='function');let attempted=false,discard=false;
  try{await c.query('BEGIN');const result=await work(c);attempted=true;await c.query('COMMIT');return result;}
  catch{if(attempted){discard=true;c.discard();}else try{await c.query('ROLLBACK');}catch{discard=true;c.discard();}throw Error('GitHub approval transaction unverified');}
  finally{if(!discard)c.release();}
 }
 async function register(proof){
  assert.equal(proofProvider.isVerified(proof),true);assert.equal(proof.state,'approved');
  const record={schema:1,approval:structuredClone(proof.approval),approver:structuredClone(proof.approver),approvalSha256:snapshotDigest(proof.approval)};verifyReceipt(record);
  await createPlatformJournal(db).verifyExistingSchema();const k=keys(record.approval.runId,record.approval.runAttempt);
  await transaction(async c=>{
   const found=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1 FOR UPDATE',[k.approval]);assert(found.rows.length<=1);
   if(found.rows.length){assert.deepEqual(parse(found.rows[0].payload),record,'Approval already bound to different evidence');return;}
   const entries=[[k.approval,record],[k.revocation,{schema:1,approvalSha256:record.approvalSha256,revision:1,revoked:false}],[k.admission,{schema:1,approvalSha256:record.approvalSha256,revision:1,operations:[]}]];
   for(const [key,value] of entries){const r=await c.query('INSERT INTO crewcheck_telegram_state(state_key,payload,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP(3))',[key,JSON.stringify(value)]);assert.equal(r.rowCount,1);}
  });
  const saved=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1',[k.approval]);assert.equal(saved.rows.length,1);assert.deepEqual(parse(saved.rows[0].payload),record);return record;
 }
 async function revoke(proof){
  assert.equal(proofProvider.isVerified(proof),true);assert.equal(proof.state,'revoked');const k=keys(proof.runId,proof.runAttempt);let next;
  await transaction(async c=>{const record=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1 FOR UPDATE',[k.approval]);if(!record.rows.length)return;assert.equal(record.rows.length,1);verifyReceipt(parse(record.rows[0].payload));const r=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1 FOR UPDATE',[k.revocation]);assert.equal(r.rows.length,1);const previous=parse(r.rows[0].payload);if(previous.revoked){next=previous;return;}next={...previous,revision:previous.revision+1,revoked:true};const result=await c.query('UPDATE crewcheck_telegram_state SET payload=$1,updated_at=CURRENT_TIMESTAMP(3) WHERE state_key=$2',[JSON.stringify(next),k.revocation]);assert.equal(result.rowCount,1);});
  if(next){const read=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1',[k.revocation]);assert.equal(read.rows.length,1);assert.deepEqual(parse(read.rows[0].payload),next);}return next;
 }
 return Object.freeze({register,revoke});
}
