// OFF: official edit GET models over an injected request; no fetch/client/credentials.
import assert from 'node:assert/strict';
import {snapshotDigest} from './reconcile_journal.mjs';
const root='https://androidpublisher.googleapis.com/androidpublisher/v3/applications/';
function version(v){assert((typeof v==='number'&&Number.isSafeInteger(v))||(typeof v==='string'&&/^[1-9][0-9]*$/.test(v)));const n=Number(v);assert(Number.isSafeInteger(n)&&n>0&&n<2100000000);return n;}
export function createPlayStateReader({request,now=()=>Date.now()}){
  assert.equal(typeof request,'function');assert.equal(typeof now,'function');
  async function get(url){
    const r=await request({method:'GET',url});assert.equal(r?.status,200);assert(r.body&&Object.getPrototypeOf(r.body)===Object.prototype);
    // These list methods expose no pagination; unknown partial-list metadata blocks.
    assert(!Object.hasOwn(r.body,'nextPageToken'));assert(!Object.hasOwn(r.body,'tokenPagination'));return structuredClone(r.body);
  }
  async function inventory(record){
    assert.equal(record.package,'com.crewcheck.app');assert(/^[A-Za-z0-9_-]{1,128}$/.test(record.editId));
    const url=root+encodeURIComponent(record.package)+'/edits/'+encodeURIComponent(record.editId);
    const edit=await get(url);assert.equal(edit.id,record.editId);
    assert(typeof edit.expiryTimeSeconds==='string'&&/^[1-9][0-9]*$/.test(edit.expiryTimeSeconds));assert(Number(edit.expiryTimeSeconds)*1000>now());
    const tracks=await get(url+'/tracks'),bundles=await get(url+'/bundles'),apks=await get(url+'/apks');
    for(const [body,kind,field] of [[tracks,'tracks','tracks'],[bundles,'bundles','bundles'],[apks,'apks','apks']]){
      assert.equal(body.kind,`androidpublisher#${kind}ListResponse`);assert(Array.isArray(body[field]));
    }
    const names=new Set(),codes=[];
    for(const t of tracks.tracks){assert(typeof t.track==='string'&&t.track.length>0&&!names.has(t.track));names.add(t.track);assert(Array.isArray(t.releases));
      for(const r of t.releases){assert(['draft','inProgress','halted','completed'].includes(r.status));assert(Array.isArray(r.versionCodes));for(const v of r.versionCodes)codes.push(version(v));}
    }
    for(const a of [...bundles.bundles,...apks.apks])codes.push(version(a.versionCode));
    // Verify the original edit still exists after all reads; no replacement creation.
    assert.deepEqual(await get(url),edit);
    const snapshot={package:record.package,editId:record.editId,edit,tracks:tracks.tracks,bundles:bundles.bundles,apks:apks.apks};
    return {...snapshot,maxCode:Math.max(0,...codes),inventorySha256:snapshotDigest(snapshot),inventoryComplete:true,reviewState:'unknown',otherEditState:'unknown'};
  }
  async function stage(record,expected){
    assert.equal(record.plan.producer,'mobile');assert.equal(expected.track,'internal');
    const observed=await inventory(record);
    verifyPlannedSnapshot({...record,staged:expected},observed);
    return observed;
  }
  return Object.freeze({inventory,stage});
}

export function verifyPlannedSnapshot(record,observation){
  assert.equal(observation.inventoryComplete,true);
  const snapshot=Object.fromEntries(['package','editId','edit','tracks','bundles','apks'].map(k=>[k,observation[k]]));
  assert.equal(observation.inventorySha256,snapshotDigest(snapshot));
  assert.equal(record.plan.producer,'mobile');assert.equal(observation.package,record.package);assert.equal(observation.editId,record.editId);
  assert.equal(observation.edit?.id,record.editId);assert(Array.isArray(observation.tracks));assert(Array.isArray(observation.bundles));assert(Array.isArray(observation.apks));
  assert.equal(new Set(observation.tracks.map(t=>t.track)).size,observation.tracks.length);
    const target=observation.tracks.find(t=>t.track==='internal');assert(target);
    assert(target.releases.every(r=>r.status==='completed'));
    const other=Object.fromEntries(observation.tracks.filter(t=>t.track!=='internal').map(t=>[t.track,t]));
    assert.equal(snapshotDigest(target),record.staged.expectedTrackSha256);assert.equal(snapshotDigest(other),record.staged.otherTracksBeforeSha256);
    const codes=target.releases.flatMap(r=>r.versionCodes.map(version));
    for(const artifact of record.artifacts){
      assert(codes.includes(artifact.versionCode));const bundle=observation.bundles.find(b=>version(b.versionCode)===artifact.versionCode);assert(bundle);assert.equal(bundle.sha256,artifact.artifactSha256);
    }
  return snapshotDigest(observation);
}

// Inactive commit adapter: only an embedding executor can supply request/review proof.
export function createReviewSafeCommit({request,reader,verifyReviewProof}){
  assert.equal(typeof request,'function');assert.equal(typeof reader?.stage,'function');assert.equal(typeof verifyReviewProof,'function');
  return async record=>{
    assert.equal(record.state,'pending');assert.equal(record.plan.producer,'mobile');
    const observation=await reader.stage(record,record.staged);
    assert.equal(await verifyReviewProof(structuredClone(record),observation),true,'Independent review/edit-coordination proof missing');
    const response=await request({method:'POST',url:root+encodeURIComponent(record.package)+'/edits/'+encodeURIComponent(record.editId)+':commit',
      params:{changesNotSentForReview:true,changesInReviewBehavior:'ERROR_IF_IN_REVIEW'}});
    assert.equal(response?.status,200);assert.equal(response.body?.id,record.editId);
    // No review-mode fallback, retry, replacement edit or availability assertion.
  };
}
