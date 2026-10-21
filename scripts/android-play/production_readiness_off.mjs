// Inactive, GET-only exact-source provider and production proposal. No publisher,
// credentials, listener, process env, OIDC or automatic caller.
import assert from 'node:assert/strict';
import { snapshotDigest } from './reconcile_journal.mjs';
const ROOT='https://api.github.com/repos/bmedeiros1987/crewcheck';
const SHA=/^[0-9a-f]{40}$/;
const plain=x=>x&&Object.getPrototypeOf(x)===Object.prototype;

export function createProductionSourceReader({request,now=()=>Date.now(),requiredWorkflows}={}) {
 assert.equal(typeof request,'function');assert(Array.isArray(requiredWorkflows)&&requiredWorkflows.length>0);
 const required=structuredClone(requiredWorkflows);assert(required.every(x=>plain(x)&&Number.isSafeInteger(x.id)&&x.id>0&&typeof x.path==='string'&&/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(x.path)));
 assert.equal(new Set(required.map(x=>x.id)).size,required.length);
 const sealed=new WeakSet();
 async function get(path){
  assert(path.startsWith('/'));const response=await request({method:'GET',url:ROOT+path,redirect:'error',retries:0});
  assert.equal(response.status,200);return structuredClone(response.body);
 }
 async function list(path,field=null){
  const rows=[];
  for(let page=1;page<=20;page++){
   const body=await get(path+(path.includes('?')?'&':'?')+`per_page=100&page=${page}`),batch=field?body[field]:body;
   assert(Array.isArray(batch)&&batch.length<=100);rows.push(...batch);
   if(batch.length<100){if(field)assert.equal(body.total_count,rows.length,'Incomplete source inventory');return rows;}
  }
  throw Error('SOURCE_INVENTORY_BOUND_EXCEEDED');
 }
 async function read({sourceSha,sourcePr,controllerSha}){
  assert(SHA.test(sourceSha)&&SHA.test(controllerSha));assert(Number.isSafeInteger(sourcePr)&&sourcePr>0);
  const started=now(),pr=await get('/pulls/'+sourcePr),main=await get('/branches/main');
  assert.equal(pr.merged,true);assert.equal(pr.merge_commit_sha,sourceSha);assert.equal(main.commit.sha,sourceSha);
  assert.equal(pr.base.ref,'main');for(const side of ['base','head'])assert.equal(pr[side].repo.full_name,'bmedeiros1987/crewcheck');
  assert(SHA.test(pr.head.sha));
  const reviews=await list(`/pulls/${sourcePr}/reviews`),latest=new Map();
  for(const review of reviews){
   assert(Number.isSafeInteger(review.id)&&typeof review.user?.login==='string');
   if(!['APPROVED','CHANGES_REQUESTED','DISMISSED'].includes(review.state))continue;
   if(!latest.has(review.user.login)||latest.get(review.user.login).id<review.id)latest.set(review.user.login,review);
  }
  const current=[...latest.values()];
  assert(!current.some(r=>r.state==='CHANGES_REQUESTED'),'Unresolved review request');
  assert(current.some(r=>r.state==='APPROVED'&&r.commit_id===pr.head.sha&&r.user.login!==pr.user.login),'Independent exact-head approval missing');
  const runs=await list(`/actions/runs?head_sha=${sourceSha}`,'workflow_runs'),byWorkflow=new Map();
  for(const run of runs){
   assert.equal(run.head_sha,sourceSha);
   if(run.event!=='push'||run.head_branch!=='main')continue;
   assert(Number.isSafeInteger(run.id)&&Number.isSafeInteger(run.run_attempt)&&run.run_attempt>0);
   const prior=byWorkflow.get(run.workflow_id);
   if(!prior||run.id>prior.id||(run.id===prior.id&&run.run_attempt>prior.run_attempt))byWorkflow.set(run.workflow_id,run);
  }
  const selected=[...byWorkflow.values()];assert(selected.length>0);
  assert(selected.every(r=>r.status==='completed'&&['success','skipped'].includes(r.conclusion)),'Failed/pending exact-source CI');
  assert(required.every(expected=>selected.some(r=>r.workflow_id===expected.id&&r.path===expected.path&&r.conclusion==='success')),'Required successful workflow identity absent');
  // Refuse races observed during inventory. This is still a bounded snapshot,
  // not a commit authority: a future commit must revalidate under its own fence.
  assert.deepEqual(await list(`/pulls/${sourcePr}/reviews`),reviews,'Review inventory changed during read');
  assert.deepEqual(await list(`/actions/runs?head_sha=${sourceSha}`,'workflow_runs'),runs,'CI inventory changed during read');
  // Read again after all pages: main/reviewed PR must not have moved meanwhile.
  const after=await get('/pulls/'+sourcePr);assert.deepEqual([after.merged,after.merge_commit_sha,after.head.sha],[true,sourceSha,pr.head.sha]);
  assert.equal((await get('/branches/main')).commit.sha,sourceSha);
  const end=now();assert(Number.isSafeInteger(started)&&Number.isSafeInteger(end)&&end>=started&&end-started<=30000);
  const proof=Object.freeze({sourceSha,sourcePr,controllerSha,reviewedHead:pr.head.sha,observedAt:end,expiresAt:end+30000,
   evidenceSha256:snapshotDigest({reviews:current,runs:selected}),storeMutationAllowed:false});sealed.add(proof);return proof;
 }
 const isFresh=proof=>sealed.has(proof)&&now()>=proof.observedAt&&now()<proof.expiresAt;
 return Object.freeze({read,isFresh,isVerified:proof=>sealed.has(proof)});
}

export function proposeProductionRelease({sourceReader,sourceProof,inventory,mobile,retainedMobileCodes,releaseNotes}){
 assert.equal(sourceReader.isVerified(sourceProof),true);assert.equal(sourceReader.isFresh(sourceProof),true);
 assert(plain(inventory)&&inventory.inventoryComplete===true&&inventory.reviewState==='clear'&&inventory.otherEditState==='none');
 assert.equal(inventory.package,'com.crewcheck.app');assert(Array.isArray(inventory.tracks));
 const snapshot=Object.fromEntries(['package','editId','edit','tracks','bundles','apks'].map(k=>[k,inventory[k]]));
 assert.equal(snapshotDigest(snapshot),inventory.inventorySha256);
 assert(plain(mobile)&&mobile.module==='app'&&mobile.watch===false&&mobile.package===inventory.package);
 assert.equal(mobile.sourceSha,sourceProof.sourceSha);assert.equal(mobile.controllerSha,sourceProof.controllerSha);
 assert(/^[0-9a-f]{64}$/.test(mobile.artifactSha256));
 assert(Number.isSafeInteger(mobile.versionCode)&&mobile.versionCode>inventory.maxCode&&mobile.versionCode<2100000000);
 assert(Array.isArray(retainedMobileCodes)&&retainedMobileCodes.every(x=>typeof x==='string'&&/^[1-9][0-9]*$/.test(x)));
 const target=inventory.tracks.filter(t=>t.track==='production');assert.equal(target.length,1);
 assert(target[0].releases.every(r=>r.status==='completed'),'Existing rollout/draft requires disposition');
 const oldCodes=target[0].releases.flatMap(r=>r.versionCodes);
 assert(retainedMobileCodes.every(code=>oldCodes.includes(code)));
 // No unsupported guess at mobile/Wear targeting: preserve ALL previous codes.
 assert(Array.isArray(releaseNotes)&&releaseNotes.length>0&&releaseNotes.every(n=>plain(n)&&typeof n.language==='string'&&typeof n.text==='string'&&n.text.length>0));
 const codes=[...new Set([...oldCodes,String(mobile.versionCode)])].sort((a,b)=>Number(a)-Number(b));
 const otherTracksBeforeSha256=snapshotDigest(Object.fromEntries(inventory.tracks.filter(t=>t.track!=='production').map(t=>[t.track,t])));
 return Object.freeze({schema:1,sourceSha:sourceProof.sourceSha,controllerSha:sourceProof.controllerSha,
  track:'production',expectedTrack:{track:'production',releases:[{name:mobile.versionName,status:'completed',versionCodes:codes,releaseNotes:structuredClone(releaseNotes)}]},
  otherTracksBeforeSha256,inventorySha256:inventory.inventorySha256,storeMutationAllowed:false,
  activationBlockers:['durable all-writer authority','production journal transition policy','review/submission mode','complete postcommit reconciliation']});
}
