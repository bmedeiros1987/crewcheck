import assert from 'node:assert/strict';
import {createProductionSourceReader,proposeProductionRelease} from './production_readiness_off.mjs';
import {snapshotDigest} from './reconcile_journal.mjs';
const sourceSha='a'.repeat(40),controllerSha='b'.repeat(40),head='c'.repeat(40);
let time=1000,mode='',calls=[],reviewReads=0,runReads=0;
const pr={merged:true,merge_commit_sha:sourceSha,head:{sha:head,repo:{full_name:'bmedeiros1987/crewcheck'}},base:{ref:'main',repo:{full_name:'bmedeiros1987/crewcheck'}},user:{login:'author'}};
const review={id:1,user:{login:'reviewer'},state:'APPROVED',commit_id:head};
const run={id:10,run_attempt:1,workflow_id:1,path:'.github/workflows/release-gate.yml',head_sha:sourceSha,event:'push',head_branch:'main',name:'release-gate',status:'completed',conclusion:'success'};
async function request(req){
 assert.equal(req.method,'GET');assert.equal(req.retries,0);assert.equal(req.redirect,'error');assert(req.url.startsWith('https://api.github.com/repos/bmedeiros1987/crewcheck/'));calls.push(req.url);
 let body;
 if(req.url.includes('/reviews')){reviewReads++;body=[{...review,...(mode==='self-review'?{user:{login:'author'}}:{}),...(mode==='stale-review'?{commit_id:'d'.repeat(40)}:{})},...((mode==='requested'||(mode==='late-review'&&reviewReads%2===0))?[{...review,id:2,state:'CHANGES_REQUESTED'}]:[])];}
 else if(req.url.includes('/pulls/'))body=pr;
 else if(req.url.includes('/branches/'))body={commit:{sha:mode==='main-moved'?'d'.repeat(40):sourceSha}};
 else {runReads++;body={total_count:mode==='partial'?2:1,workflow_runs:[{...run,...(mode==='failure'?{conclusion:'failure'}:{}),...(mode==='pending'?{status:'in_progress'}:{}),...(mode==='wrong-path'?{path:'.github/workflows/other.yml'}:{}),...(mode==='wrong-id'?{workflow_id:2}:{}),...(mode==='late-ci'&&runReads%2===0?{conclusion:'failure'}:{})}]};}
 return {status:mode==='denied'?403:200,body};
}
const reader=createProductionSourceReader({request,now:()=>time,requiredWorkflows:[{id:1,path:'.github/workflows/release-gate.yml'}]});
const proof=await reader.read({sourceSha,sourcePr:1,controllerSha});
assert(reader.isVerified(proof));assert(!reader.isVerified({...proof}));
const snapshot={package:'com.crewcheck.app',editId:'existing-edit',edit:{id:'existing-edit'},tracks:[{track:'production',releases:[{status:'completed',versionCodes:['100','101']}]},{track:'wear:qa',releases:[{status:'completed',versionCodes:['102']}]}],bundles:[],apks:[]};
const inventory={...snapshot,inventorySha256:snapshotDigest(snapshot),inventoryComplete:true,maxCode:102,reviewState:'clear',otherEditState:'none'};
const mobile={module:'app',watch:false,package:inventory.package,sourceSha,controllerSha,artifactSha256:'e'.repeat(64),versionCode:103,versionName:'14.4.11'};
const args={sourceReader:reader,sourceProof:proof,inventory,mobile,retainedMobileCodes:['100'],releaseNotes:[{language:'pt-BR',text:'Correções revisadas.'}]};
const plan=proposeProductionRelease(args);assert.equal(plan.storeMutationAllowed,false);assert.deepEqual(plan.expectedTrack.releases[0].versionCodes,['100','101','103']);
assert.equal(plan.otherTracksBeforeSha256,snapshotDigest({'wear:qa':snapshot.tracks[1]}));
for(const invalid of [{...args,sourceProof:{...proof}},{...args,mobile:{...mobile,watch:true}},{...args,mobile:{...mobile,versionCode:102}},{...args,inventory:{...inventory,reviewState:'unknown'}},{...args,inventory:{...inventory,inventorySha256:'f'.repeat(64)}},{...args,retainedMobileCodes:['999']}])assert.throws(()=>proposeProductionRelease(invalid));
time=proof.expiresAt;assert(!reader.isFresh(proof));assert.throws(()=>proposeProductionRelease(args));time=1000;
for(mode of ['self-review','stale-review','requested','main-moved','partial','failure','pending','denied','wrong-path','wrong-id','late-review','late-ci']){reviewReads=0;runReads=0;await assert.rejects(reader.read({sourceSha,sourcePr:1,controllerSha}));}
assert(calls.every(url=>!url.includes('androidpublisher')));
console.log('PASS production OFF proposal: exact source/review/CI, pagination, freshness, no manufactured authority, shared-package retention, wrong artifact/floor; GET only, zero live APIs');
