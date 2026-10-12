import assert from 'node:assert/strict';
import {createPlayStateReader} from './play_state_reader.mjs';
import {snapshotDigest} from './reconcile_journal.mjs';
const record={package:'com.crewcheck.app',editId:'original',plan:{producer:'mobile'},artifacts:[{versionCode:42,artifactSha256:'a'.repeat(64)}]};
const target={track:'internal',releases:[{status:'completed',versionCodes:['40','42']}]};
const other={'wear:internal':{track:'wear:internal',releases:[{status:'completed',versionCodes:['41']}]},production:{track:'production',releases:[]}};
const staged={track:'internal',expectedTrackSha256:snapshotDigest(target),otherTracksBeforeSha256:snapshotDigest(other)};
for(const scenario of ['valid','404','expired','wrong-edit','missing-apks','partial','bad-version','duplicates','remote-hash','other-drift','retained-drift','draft']){
 const calls=[];let reads=0;
 const reader=createPlayStateReader({now:()=>1000,request:async r=>{
  calls.push(r);assert.equal(r.method,'GET');const suffix=r.url.split('/edits/original')[1];
  if(scenario==='404')return {status:404,body:{}};
  let body;
  if(suffix===''){reads++;body={id:scenario==='wrong-edit'?'different':'original',expiryTimeSeconds:scenario==='expired'?'1':'999999'};}
  else if(suffix==='/tracks'){
   const t=structuredClone(target),o=structuredClone(other);
   if(scenario==='other-drift')o['wear:internal'].releases=[];
   if(scenario==='retained-drift')t.releases[0].versionCodes=['42'];
   if(scenario==='draft')t.releases[0].status='draft';
   body={kind:'androidpublisher#tracksListResponse',tracks:[t,...Object.values(o)]};
   if(scenario==='duplicates')body.tracks.push(t);
  }else if(suffix==='/bundles')body={kind:'androidpublisher#bundlesListResponse',bundles:[{versionCode:42,sha256:scenario==='remote-hash'?'b'.repeat(64):'a'.repeat(64)}]};
  else if(suffix==='/apks'){body={kind:'androidpublisher#apksListResponse',apks:[{versionCode:scenario==='bad-version'?true:99}]};if(scenario==='missing-apks')delete body.apks;if(scenario==='partial')body.nextPageToken='unhandled';}
  else assert.fail('Undocumented endpoint');
  return {status:200,body};
 }});
 if(scenario==='valid'){const o=await reader.stage(record,staged);assert.equal(o.maxCode,99);assert.equal(o.reviewState,'unknown');assert.equal(o.otherEditState,'unknown');assert.equal(reads,2);}
 else await assert.rejects(reader.stage(record,staged));
 assert(calls.every(c=>c.method==='GET'));assert(!calls.some(c=>c.url.includes('/releases')));
}
console.log('PASS official-shaped original-edit readers: strict complete lists, APK floor, expiry/identity, hashes, retained/non-target tracks; review/other-edit authority stays unknown; no POST/DELETE');
