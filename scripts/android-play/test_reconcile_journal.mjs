import assert from 'node:assert/strict';
import {reconcileAcknowledged,snapshotDigest} from './reconcile_journal.mjs';
globalThis.fetch=()=>{throw Error('No external API permitted');};
const target={track:'qa',releases:[{status:'completed',versionCodes:['144201']}]},others={production:{track:'production',releases:[]}};
const record={package:'com.crewcheck.app',owner:'run:123:1',revision:4,state:'acknowledged',intent:{editId:'edit1',track:'qa',expectedTrackSha256:snapshotDigest(target),otherTracksBeforeSha256:snapshotDigest(others)}};
const observation={httpStatus:200,package:record.package,editId:'edit1',owner:record.owner,revision:4,inventoryComplete:true,pendingReview:false,unfinishedRelease:false,unresolvedEdits:false,targetTrack:target,otherTracks:others};
function fixture(){let current=structuredClone(record),writes=0;return {get writes(){return writes;},async read(){return structuredClone(current);},async advance(p,o,intent,rev,state){assert.equal(p,current.package);assert.equal(o,current.owner);assert.equal(rev,current.revision);assert.equal(state,'reconciled');writes++;current={...current,intent,revision:rev+1,state};return structuredClone(current);}};}
for(const patch of [{httpStatus:404},{httpStatus:302},{inventoryComplete:false},{pendingReview:true},{unfinishedRelease:true},{unresolvedEdits:true},{editId:'other'},{owner:'other'},{revision:3},{package:'com.crewcheck.life'},{targetTrack:{track:'qa',releases:[]}},{otherTracks:{}},{targetTrack:{track:'qa',releases:[{status:'inProgress'}]}}]){
 const j=fixture();await assert.rejects(reconcileAcknowledged(j,record,async()=>({...observation,...patch})));assert.equal(j.writes,0);
}
for(const state of ['pending','reconciliation_required','reserved','reconciled']){
 const j=fixture();await assert.rejects(reconcileAcknowledged(j,{...record,state},async()=>observation));assert.equal(j.writes,0);
}
const j=fixture();let reads=0;
const result=await reconcileAcknowledged(j,record,async expected=>{reads++;assert.deepEqual(expected,record);return observation;});
assert.equal(result.intent.reconciliationSha256,snapshotDigest(observation));assert.equal(result.state,'reconciled');assert.equal(result.retryAllowed,false);assert.equal(result.rolloverAllowed,false);assert.equal(result.storeAvailability,'unknown');
await assert.rejects(reconcileAcknowledged(j,record,async()=>{reads++;return observation;}));assert.equal(reads,1);
const lost=fixture();lost.advance=async()=>{throw Error('Lost durable write acknowledgement');};
await assert.rejects(reconcileAcknowledged(lost,record,async()=>observation));
const unreadable=fixture();await assert.rejects(reconcileAcknowledged(unreadable,record,async()=>{throw Error('secret transport body');}),e=>!e.message.includes('secret'));assert.equal(unreadable.writes,0);
assert.equal(snapshotDigest({b:2,a:1}),snapshotDigest({a:1,b:2}));
console.log('PASS: exact acknowledged owner/revision, complete snapshots, durable proof intent; uncertainty/replay block without retry or rollover');
