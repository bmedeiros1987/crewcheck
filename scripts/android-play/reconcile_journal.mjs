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
  assert(observation.otherTracks && Object.getPrototypeOf(observation.otherTracks)===Object.prototype);
  assert(!Object.hasOwn(observation.otherTracks,record.intent.track));
  assert.equal(snapshotDigest(observation.targetTrack),record.intent.expectedTrackSha256);
  assert.equal(snapshotDigest(observation.otherTracks),record.intent.otherTracksBeforeSha256);
  // Adapter advance performs owned revision CAS and durable readback. A lost SQL
  // acknowledgement is surfaced; this function never retries or releases a lock.
  const result=await journal.advance(record.package,record.owner,{...record.intent,reconciliationSha256:snapshotDigest(observation)},record.revision,'reconciled');
  return {...result,observationSha256:snapshotDigest(observation),storeAvailability:'unknown',retryAllowed:false,rolloverAllowed:false};
}
