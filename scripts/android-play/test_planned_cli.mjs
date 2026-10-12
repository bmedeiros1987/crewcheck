// TEST ONLY: prefix-replayed SQL fixture and official-shaped fictional Play responses.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createMysqlJournal} from './mysql_journal.mjs';
import {createJournalProtocol} from './journal_protocol.mjs';
import {createPlayStateReader,createReviewSafeCommit} from './play_state_reader.mjs';
import {snapshotDigest} from './reconcile_journal.mjs';
import {database} from './mysql_journal_fixture.mjs';
const data=JSON.parse(fs.readFileSync(0,'utf8')),db=database(),responses=[],calls=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
let staged=false,commits=0;
const tracks=()=>structuredClone(staged?data.stagedTracks:data.tracks);
const reader=createPlayStateReader({now:()=>1000,request:async request=>{
 assert.equal(request.method,'GET');calls.push(request);
 const suffix=request.url.split('/edits/original-edit')[1];assert.notEqual(suffix,undefined);
 if(commits&&data.scenario!=='complete-proof')return {status:404,body:{}};
 if(suffix==='')return {status:200,body:{id:data.scenario==='wrong-edit'?'foreign':'original-edit',expiryTimeSeconds:'99999999'}};
 if(suffix==='/tracks'){
  const t=tracks();if(staged&&data.scenario==='other-track')t[1].releases=[];
  return {status:200,body:{kind:'androidpublisher#tracksListResponse',tracks:t}};
 }
 if(suffix==='/bundles'){
  if(data.scenario==='incomplete')return {status:200,body:{kind:'androidpublisher#bundlesListResponse',nextPageToken:'unhandled-partial'}};
  const b=[{versionCode:144154,sha256:'a'.repeat(64)}];if(staged)b.push({versionCode:144156,sha256:data.scenario==='remote-hash'?'0'.repeat(64):data.artifactSha256});
  return {status:200,body:{kind:'androidpublisher#bundlesListResponse',bundles:b}};
 }
 if(suffix==='/apks')return {status:200,body:{kind:'androidpublisher#apksListResponse',apks:[{versionCode:144155}]}};
 assert.fail('Unknown fixture endpoint');
}});
const commitAdapter=createReviewSafeCommit({reader,verifyReviewProof:async()=>data.scenario!=='review-pending',request:async request=>{
 assert.equal(request.method,'POST');assert(request.url.endsWith('/edits/original-edit:commit'));
 assert.deepEqual(request.params,{changesNotSentForReview:true,changesInReviewBehavior:'ERROR_IF_IN_REVIEW'});
 assert.equal((await journal.read('com.crewcheck.app')).state,'pending');commits++;
 if(data.scenario==='unknown-commit')throw Error('fixture lost response');
 return {status:200,body:{id:'original-edit'}};
}});
const caps={approvePlan:async()=>true,
 verifyInventory:async(r,input)=>{const o=await reader.inventory(r);return input.inventorySha256===o.inventorySha256&&input.floor>=o.maxCode;},
 verifyArtifacts:async(r,a)=>{
  const bytes=fs.readFileSync(data.root+'/'+data.file),manifest=fs.readFileSync(data.root+'/app-manifest.xml');
  return a.length===1&&a[0].artifactSha256===hash(bytes)&&a[0].manifestSha256===hash(manifest)&&a[0].uploadCertificateSha256===data.certificateSha256;
 },
 verifyStage:async(r,s)=>{
  assert.equal(s.otherTracksBeforeSha256,snapshotDigest(Object.fromEntries(data.tracks.filter(t=>t.track!=='internal').map(t=>[t.track,t]))));
  const observed=await reader.stage(r,s),target=observed.tracks.find(t=>t.track==='internal');
  const codes=target.releases.flatMap(r=>r.versionCodes);assert(data.tracks[0].releases.flatMap(r=>r.versionCodes).every(c=>codes.includes(c)));
  return data.scenario!=='review-pending';
 },
 commitOnce:commitAdapter,
 verifyReconciliation:async()=>data.scenario==='complete-proof'};
const journal=createMysqlJournal(db,caps);
const protocol=createJournalProtocol({journal,binding:data.binding,authorize:async()=>true,lifecycle:{
 readCompleteState:async r=>({...await reader.inventory(r),generation:r.generation,revision:r.revision}),
 verifyReviewProof:async()=>data.scenario==='complete-proof'}});
for(const f of data.frames){const request=JSON.parse(f);if(request.operation==='commit')staged=true;if(data.scenario==='lost-pending-sql'&&request.operation==='commit')db.lose();responses.push(await protocol(f));}
console.log(JSON.stringify({responses,record:await journal.read('com.crewcheck.app'),commits,calls}));
