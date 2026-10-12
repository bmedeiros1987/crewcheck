// TEST ONLY independent GitHub responses, not claims/body-derived approval.
import {canonical,snapshotDigest} from './reconcile_journal.mjs';
import {API,APPROVAL_PREFIX} from '../../server/release-journal/github-review.mjs';
import {fixtureClaims} from './test_release_oidc.mjs';
import {ENVIRONMENT_ID,ENVIRONMENT_NAME} from '../../server/release-journal/oidc.mjs';
export function reviewFixture({run='123',operations=['probe'],time=10000}={}){
 const plan={package:'com.crewcheck.app',owner:'mobile:'+run,producer:'mobile',sourceSha:fixtureClaims.sha,controllerSha:fixtureClaims.sha,runId:run,modules:['app']};plan.planSha256=snapshotDigest(plan);const binding={schema:2,generation:1,plan};
 const approval={schema:1,repositoryId:fixtureClaims.repository_id,ownerId:fixtureClaims.repository_owner_id,runId:run,runAttempt:'1',actorId:fixtureClaims.actor_id,workflowRef:fixtureClaims.workflow_ref,workflowSha:fixtureClaims.workflow_sha,codeSha:fixtureClaims.sha,binding,operations,issuedAt:time,expiresAt:time+100,recoveryUntil:time+1000};
 const doc={schema:1,approval,approvalSha256:snapshotDigest(approval),artifactId:'789',artifactArchiveSha256:'a'.repeat(64)};
 const env={id:Number(ENVIRONMENT_ID),name:ENVIRONMENT_NAME,node_id:'fixture-env861'};
 const state={reviews:[{state:'approved',comment:APPROVAL_PREFIX+canonical(doc),user:{id:Number(fixtureClaims.actor_id)},environments:[env]}],meta:{id:Number(run),run_attempt:1,repository:{id:Number(fixtureClaims.repository_id),owner:{id:Number(fixtureClaims.repository_owner_id)},full_name:fixtureClaims.repository},head_sha:fixtureClaims.sha,head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/mobile-only-internal.yml',actor:{id:Number(fixtureClaims.actor_id)},status:'in_progress',conclusion:null,run_started_at:new Date(time*1000).toISOString().replace('.000Z','Z')},jobs:{total_count:1,jobs:[{check_run_url:API+'/check-runs/456',name:'reviewed-mobile',run_id:Number(run),run_attempt:1,head_sha:fixtureClaims.sha,status:'in_progress',conclusion:null}]},artifact:{id:789,expired:false,name:`crewcheck-journal-plan-${run}-attempt-1`,workflow_run:{id:Number(run),repository_id:Number(fixtureClaims.repository_id),head_sha:fixtureClaims.sha},digest:'sha256:'+doc.artifactArchiveSha256},calls:[]};
 const policy={reviewedCodeSha:fixtureClaims.sha,reviewedWorkflowSha:fixtureClaims.workflow_sha,environmentNodeId:env.node_id,protectedJobName:'reviewed-mobile',operations};
 const request=async url=>{state.calls.push(url);if(url===`${API}/actions/runs/${run}/approvals`)return structuredClone(state.reviews);if(url===`${API}/actions/runs/${run}/attempts/1`)return structuredClone(state.meta);if(url===`${API}/actions/runs/${run}/attempts/1/jobs?per_page=100&page=1`)return structuredClone(state.jobs);if(url===API+'/actions/artifacts/789')return structuredClone(state.artifact);throw Error('Unexpected public fixture URL');};
 return {binding,approval,doc,state,policy,request,claims:{...fixtureClaims,run_id:run}};
}
