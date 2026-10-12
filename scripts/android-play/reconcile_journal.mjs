// Inactive injected-reader reconciliation. No API client, retry, new edit or unlock.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value && typeof value==='object'){
    assert.equal(Object.getPrototypeOf(value),Object.prototype);
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  }
  assert(value===null||['string','boolean'].includes(typeof value)||(typeof value==='number'&&Number.isFinite(value)));
  return JSON.stringify(value);
}
export const snapshotDigest=value=>createHash('sha256').update(canonical(value)).digest('hex');

// Restart observation only, reusing the existing journal. No receipt projection,
// retry, publication permission, new reservation or lifecycle transition.
export async function readRecoveryFence(journal,binding){
  try{
    assert(journal&&typeof journal.read==='function');
    assert(binding&&Object.getPrototypeOf(binding)===Object.prototype);
    assert.deepEqual(Object.keys(binding).sort(),['package','owner','sourceSha','controllerSha','runId','artifactSha256','versionCode'].sort());
    assert.equal(binding.package,'com.crewcheck.app');
    assert(/^[A-Za-z0-9:_-]{1,128}$/.test(binding.owner));
    for(const f of ['sourceSha','controllerSha'])assert(/^[0-9a-f]{40}$/.test(binding[f]));
    assert(/^[0-9a-f]{64}$/.test(binding.artifactSha256));assert(/^[1-9][0-9]*$/.test(binding.runId));
    assert(Number.isSafeInteger(binding.versionCode)&&binding.versionCode>0&&binding.versionCode<2100000000);
    const pinned=structuredClone(binding);
    const first=structuredClone(await journal.read(pinned.package));
    if(first!==null){
      assert(first&&Object.getPrototypeOf(first)===Object.prototype);
      assert.equal(first.package,pinned.package);assert.equal(first.owner,pinned.owner);
      assert(Number.isSafeInteger(first.revision)&&first.revision>0);
      assert(['reserved','edit_open','pending','acknowledged','reconciliation_required','reconciled'].includes(first.state));
      for(const f of ['sourceSha','controllerSha','runId','artifactSha256','versionCode'])assert.equal(first.intent[f],pinned[f]);
    }
    // A racing transition or uncertain read is not recovery authority.
    assert.deepEqual(await journal.read(pinned.package),first);
    return {record:first,observationSha256:snapshotDigest(first),reservationPresent:first!==null,
      storeAvailability:'unknown',storeMutationAllowed:false,reservationAllowed:false,
      retryAllowed:false,rolloverAllowed:false,resumeAllowed:false};
  }catch{throw new Error('Restart journal observation unverified; publication remains OFF');}
}

export async function reconcileAcknowledged(journal,expected,readCompleteState){
  // Lost/ambiguous store acknowledgements deliberately cannot use this path.
  assert.equal(expected.package,'com.crewcheck.app');
  assert.equal(expected.state,'acknowledged');
  const record=structuredClone(expected);
  assert.deepEqual(await journal.read(record.package),record,'Stale reconciliation owner/revision');
  // Reader is an independently reviewed trusted adapter, not archive metadata.
  // No reader adapter is configured in the application or CI.
  let observation;
  try{observation=await readCompleteState(structuredClone(record));}
  catch{throw new Error('Reconciliation observation unverified; package remains locked');}
  const proof=verifyCompleteReleaseObservation(record,observation);
  // Adapter advance performs owned revision CAS and durable readback. A lost SQL
  // acknowledgement is surfaced; this function never retries or releases a lock.
  const result=await journal.advance(record.package,record.owner,{...record.intent,reconciliationSha256:proof},record.revision,'reconciled');
  return {...result,observationSha256:proof,storeAvailability:'unknown',retryAllowed:false,rolloverAllowed:false};
}

// Shared by staged commit and acknowledged reconciliation; complete trusted reader only.
export function verifyCompleteReleaseObservation(record,observation){
  assert(['pending','acknowledged'].includes(record.state));
  assert(observation && Object.getPrototypeOf(observation)===Object.prototype);
  assert.equal(observation.httpStatus,200);
  assert.equal(observation.package,record.package);
  assert.equal(observation.editId,record.intent.editId);
  assert.equal(observation.owner,record.owner);
  assert.equal(observation.revision,record.revision);
  assert.equal(observation.inventoryComplete,true);
  assert.equal(observation.pendingReview,false);
  assert.equal(observation.unfinishedRelease,false);
  assert.equal(observation.unresolvedEdits,false);
  assert.equal(observation.targetTrack?.track,record.intent.track);
  assert(Array.isArray(observation.targetTrack.releases));
  assert(observation.targetTrack.releases.every(r=>r.status==='completed'));
  assert(Number.isSafeInteger(record.intent.versionCode)&&record.intent.versionCode>0&&record.intent.versionCode<2100000000);
  const codes=observation.targetTrack.releases.flatMap(release=>{
    assert(Array.isArray(release.versionCodes)&&release.versionCodes.length>0);
    assert(release.versionCodes.every(code=>typeof code==='string'&&/^[1-9][0-9]*$/.test(code)&&Number.isSafeInteger(Number(code))&&Number(code)<2100000000));
    return release.versionCodes;
  });
  assert(codes.includes(String(record.intent.versionCode)),'Intended version absent from complete target snapshot');
  assert(observation.otherTracks && Object.getPrototypeOf(observation.otherTracks)===Object.prototype);
  assert(!Object.hasOwn(observation.otherTracks,record.intent.track));
  assert.equal(snapshotDigest(observation.targetTrack),record.intent.expectedTrackSha256);
  assert.equal(snapshotDigest(observation.otherTracks),record.intent.otherTracksBeforeSha256);
  return snapshotDigest(observation);
}
