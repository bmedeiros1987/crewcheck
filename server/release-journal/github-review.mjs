// Independent fixed public GitHub GETs; never a job-supplied approval/token copy.
import assert from 'node:assert/strict';
import {publicJson} from './public-json.mjs';
import {canonical,snapshotDigest} from '../../scripts/android-play/reconcile_journal.mjs';
import {validateApproval,OPERATIONS} from './approval.mjs';
import {REPOSITORY,REPOSITORY_ID,OWNER_ID,WORKFLOW_REF,ENVIRONMENT_NAME,ENVIRONMENT_ID,ENVIRONMENT_NODE_ID} from './oidc.mjs';
export const API='https://api.github.com/repos/'+REPOSITORY;
export const APPROVAL_PREFIX='CrewCheck approval/v1\n';
const deepFreeze=v=>{if(v&&typeof v==='object'){for(const value of Object.values(v))deepFreeze(value);Object.freeze(v);}return v;};
const exact=(v,keys)=>{assert(v&&Object.getPrototypeOf(v)===Object.prototype);assert.deepEqual(Object.keys(v).sort(),[...keys].sort());};
const positive=v=>{assert((typeof v==='string'&&/^[1-9][0-9]*$/.test(v))||(Number.isSafeInteger(v)&&v>0));return String(v);};
function timestamp(v){assert(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v));const ms=Date.parse(v);assert(Number.isFinite(ms)&&new Date(ms).toISOString().replace('.000Z','Z')===v);return ms/1000;}
export function parseApprovalComment(comment){assert(typeof comment==='string'&&comment.length<=16384);const value=comment.trim();assert(value.startsWith(APPROVAL_PREFIX));const raw=value.slice(APPROVAL_PREFIX.length),doc=JSON.parse(raw);assert.equal(canonical(doc),raw);exact(doc,['schema','approval','approvalSha256','artifactId','artifactArchiveSha256']);assert.equal(doc.schema,1);validateApproval(doc.approval);assert.equal(snapshotDigest(doc.approval),doc.approvalSha256);positive(doc.artifactId);assert(typeof doc.artifactArchiveSha256==='string'&&/^[0-9a-f]{64}$/.test(doc.artifactArchiveSha256));return doc;}
export function createGitHubReviewProvider({policy,request,now=()=>Math.floor(Date.now()/1000)}){
 // Policy enrollment is trusted deployment data, never a body/environment-name guess.
 exact(policy,['reviewedCodeSha','reviewedWorkflowSha','environmentNodeId','protectedJobName','operations']);
 for(const k of ['reviewedCodeSha','reviewedWorkflowSha'])assert(typeof policy[k]==='string'&&/^[0-9a-f]{40}$/.test(policy[k]));assert.equal(policy.environmentNodeId,ENVIRONMENT_NODE_ID);assert.equal(policy.protectedJobName,'reviewed-mobile');assert(Array.isArray(policy.operations)&&policy.operations.length>0&&new Set(policy.operations).size===policy.operations.length&&policy.operations.every(o=>OPERATIONS.includes(o)));
 const pinned=structuredClone(policy),sealed=new WeakSet();
 const get=request??(url=>publicJson(url,262144,{rejectPagination:true}));
 async function verify(claims,frame){
  assert.equal(claims.sha,pinned.reviewedCodeSha);assert.equal(claims.workflow_sha,pinned.reviewedWorkflowSha);assert.equal(claims.environment_node_id,pinned.environmentNodeId);
  const run=positive(claims.run_id),attempt=positive(claims.run_attempt);const paths=[`${API}/actions/runs/${run}/approvals`,`${API}/actions/runs/${run}/attempts/${attempt}`,`${API}/actions/runs/${run}/attempts/${attempt}/jobs?per_page=100&page=1`];
  const results=await Promise.allSettled(paths.map(url=>get(url)));for(const r of results)assert.equal(r.status,'fulfilled','Independent GitHub proof unavailable');const [reviews,meta,jobs]=results.map(r=>r.value);
  assert(Array.isArray(reviews)&&reviews.length<=100);assert.equal(positive(meta.id),run);assert.equal(positive(meta.run_attempt),attempt);assert.equal(positive(meta.repository?.id),REPOSITORY_ID);assert.equal(positive(meta.repository?.owner?.id),OWNER_ID);assert.equal(meta.repository.full_name,REPOSITORY);assert.equal(meta.head_sha,pinned.reviewedCodeSha);assert.equal(meta.head_branch,'main');assert.equal(meta.event,'workflow_dispatch');assert(['.github/workflows/mobile-only-internal.yml','.github/workflows/mobile-only-internal.yml@main','.github/workflows/mobile-only-internal.yml@refs/heads/main'].includes(meta.path),'Exact reviewed workflow/main path required');assert.equal(positive(meta.actor?.id),claims.actor_id);
  assert(Number.isSafeInteger(jobs.total_count)&&Array.isArray(jobs.jobs)&&jobs.total_count===jobs.jobs.length&&jobs.jobs.length<=100);const matching=jobs.jobs.filter(j=>j.check_run_url===`${API}/check-runs/${claims.check_run_id}`);assert.equal(matching.length,1);const job=matching[0];assert.equal(job.name,pinned.protectedJobName);assert.equal(positive(job.run_id),run);if(Object.hasOwn(job,'run_attempt'))assert.equal(positive(job.run_attempt),attempt);assert.equal(job.head_sha,pinned.reviewedCodeSha);
  const relevant=reviews.filter(r=>positive(r.user?.id)===OWNER_ID&&Array.isArray(r.environments)&&r.environments.some(e=>positive(e.id)===ENVIRONMENT_ID&&e.name===ENVIRONMENT_NAME&&e.node_id===pinned.environmentNodeId));
  // Review history has no attempt timestamp/ID. Any authentic rejection in this
  // environment blocks the WHOLE run, including reruns. Start a new run to recover.
  if(meta.conclusion==='cancelled'||meta.conclusion==='failure'||job.conclusion==='cancelled'||job.conclusion==='failure'||relevant.some(r=>r.state==='rejected')){const proof=Object.freeze({state:'revoked',runId:run,runAttempt:attempt});sealed.add(proof);return proof;}
  assert.equal(meta.status,'in_progress');assert.equal(job.status,'in_progress');
  const documents=[];
  for(const review of relevant){if(review.state!=='approved')continue;const doc=parseApprovalComment(review.comment);const a=doc.approval;
   if(a.runId!==run||a.runAttempt!==attempt)continue;
   assert.equal(a.workflowRef,WORKFLOW_REF);assert.equal(a.workflowSha,pinned.reviewedWorkflowSha);assert.equal(a.codeSha,pinned.reviewedCodeSha);assert.equal(a.actorId,claims.actor_id);assert.deepEqual(a.binding,frame.binding);assert.deepEqual(a.operations,pinned.operations);assert.equal(a.issuedAt,timestamp(meta.run_started_at));assert((frame.operation==='observe'?a.recoveryUntil:a.expiresAt)>now());assert(a.operations.includes(frame.operation));documents.push(doc);
  }
  assert(documents.length>0,'No exact manual approval');const unique=new Map(documents.map(d=>[canonical(d),d]));assert.equal(unique.size,1,'Conflicting manual approvals');const doc=[...unique.values()][0];
  const artifact=await get(`${API}/actions/artifacts/${positive(doc.artifactId)}`);assert.equal(positive(artifact.id),positive(doc.artifactId));assert.equal(artifact.expired,false);assert.equal(artifact.name,`crewcheck-journal-plan-${run}-attempt-${attempt}`);assert.equal(positive(artifact.workflow_run?.id),run);assert.equal(positive(artifact.workflow_run?.repository_id),REPOSITORY_ID);assert.equal(artifact.workflow_run.head_sha,pinned.reviewedCodeSha);assert.equal(artifact.digest,'sha256:'+doc.artifactArchiveSha256);
  // Archive digest pins provenance, not the canonical plan. The full MANUAL comment
  // authorizes the plan digest; no artifact download or credential forwarding occurs.
  const evidence={repositoryId:REPOSITORY_ID,reviewerId:OWNER_ID,environmentId:ENVIRONMENT_ID,environmentNodeId:pinned.environmentNodeId,runId:run,runAttempt:attempt,jobCheckRunId:claims.check_run_id,document:doc};
  const proof=deepFreeze({state:'approved',approval:structuredClone(doc.approval),approver:{provider:'github-environment-review',principalRef:'github-user:'+OWNER_ID,proofSha256:snapshotDigest(evidence)},observedAt:now()});sealed.add(proof);return proof;
 }
 return Object.freeze({verify,isVerified:p=>sealed.has(p),isFresh:p=>sealed.has(p)&&p.state==='approved'&&now()-p.observedAt>=0&&now()-p.observedAt<=10});
}
