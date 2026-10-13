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
 if(['valid','missing-apks'].includes(scenario)){const o=await reader.stage(record,staged);assert.equal(o.maxCode,scenario==='missing-apks'?42:99);assert.equal(o.reviewState,'unknown');assert.equal(o.otherEditState,'unknown');assert.equal(reads,2);}
 else await assert.rejects(reader.stage(record,staged));
 assert(calls.every(c=>c.method==='GET'));assert(!calls.some(c=>c.url.includes('/releases')));
}
console.log('PASS official-shaped original-edit readers: strict complete lists, APK floor, expiry/identity, hashes, retained/non-target tracks; review/other-edit authority stays unknown; no POST/DELETE');

// Documented repeated absence equals explicit empty only in successful typed envelopes.
for(const field of ['tracks','bundles','apks','releases','versionCodes']){
 let omittedDigest;
 for(const mode of ['omitted','empty','null','object','string','boolean','partial','error','wrong-kind','bad-http']){
  const request=async r=>{
   const suffix=r.url.split('/edits/original')[1];
   if(suffix==='')return {status:200,body:{id:'original',expiryTimeSeconds:'999999'}};
   const list=suffix.slice(1);const body={kind:`androidpublisher#${list}ListResponse`,[list]:[]};
   if(list==='tracks')body.tracks=[{track:'internal',releases:[{status:'completed',versionCodes:['42']}]},{track:'unused'}];
   let selected=null;
   if(field===list)selected=body;
   if(list==='tracks'&&field==='releases')selected=body.tracks[0];
   if(list==='tracks'&&field==='versionCodes')selected=body.tracks[0].releases[0];
   if(selected){
    if(mode==='omitted')delete selected[field];
    else if(mode==='empty')selected[field]=[];
    else if(['null','object','string','boolean'].includes(mode))selected[field]={null:null,object:{},string:'',boolean:false}[mode];
    else if(mode==='partial')body.nextPageToken='unhandled';
    else if(mode==='error')body.error={code:500};
    else if(mode==='wrong-kind')delete body.kind;
    else if(mode==='bad-http')return {status:503,body};
   }
   return {status:200,body};
  };
  const reader=createPlayStateReader({request,now:()=>1000});
  if(['omitted','empty'].includes(mode)){
   const o=await reader.inventory(record);assert.equal(o.inventoryComplete,true);
   if(mode==='omitted')omittedDigest=o.inventorySha256;else assert.equal(o.inventorySha256,omittedDigest,'Empty and omitted normalize identically');
   if(['tracks','bundles','apks'].includes(field))assert.deepEqual(o[field],[]);
   if(field==='releases')assert.deepEqual(o.tracks[0].releases,[]);
   if(field==='versionCodes')assert.deepEqual(o.tracks[0].releases[0].versionCodes,[]);
   // Empty evidence cannot satisfy required target/artifact presence for commit.
   await assert.rejects(reader.stage(record,staged));
  }else await assert.rejects(reader.inventory(record));
 }
}
console.log('PASS repeated-field matrix: omitted/empty documented arrays normalize only after typed HTTP200 envelopes; null/malformed/partial/error block; required commit evidence never invented');
