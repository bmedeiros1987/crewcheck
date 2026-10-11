// TEST ONLY batch fixture: Python frames -> existing protocol -> actual journal
// on the existing deterministic SQL fixture. No listener, credential or network.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createMysqlJournal,coordinatedCommit} from './mysql_journal.mjs';
import {createJournalProtocol} from './journal_protocol.mjs';
import {snapshotDigest,reconcileAcknowledged} from './reconcile_journal.mjs';
import {database} from './mysql_journal_fixture.mjs';
globalThis.fetch=()=>{throw Error('No external network');};
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const db=database(),journal=createMysqlJournal(db);
const protocol=createJournalProtocol({journal,binding:input.binding,authorize:async()=>true});
const responses=[];
let finalResult=null,observation=null,finalCommitCalls=0;
async function reconcile(){
  const acknowledged=await journal.read(input.binding.package);
  observation={httpStatus:200,package:acknowledged.package,owner:acknowledged.owner,revision:acknowledged.revision,editId:acknowledged.intent.editId,inventoryComplete:true,pendingReview:false,unfinishedRelease:false,unresolvedEdits:false,targetTrack:input.expectedTrack,otherTracks:input.otherTracks};
  finalResult=await reconcileAcknowledged(journal,acknowledged,async()=>observation);
 }
async function finish(){
 const record=await journal.read(input.binding.package);
 const staged={...record,intent:{...record.intent,track:input.expectedTrack.track,expectedTrackSha256:snapshotDigest(input.expectedTrack),otherTracksBeforeSha256:snapshotDigest(input.otherTracks)}};
 finalResult=await coordinatedCommit(journal,staged,async()=>{finalCommitCalls++;if(input.finalOutcome==='uncertain')throw Error('fictional lost response');});
 if(input.finalOutcome==='reconciled')await reconcile();
 await assert.rejects(coordinatedCommit(journal,staged,async()=>finalCommitCalls++));
 await assert.rejects(journal.reserve(record.package,'new-run',record.intent));
 assert.equal(finalCommitCalls,1);
}

for(const [index,frame] of input.frames.entries()){
 if(input.loseSqlAt===index)db.lose();
 responses.push(await protocol(frame));
 if(input.finishAfter===index)await finish();
 if(input.reconcileAfter===index)await reconcile();
}
let commitCalls=0;
if(input.uncertainCommit){
 const record=await journal.read(input.binding.package);
 const staged={...record,intent:{...record.intent,track:'qa',expectedTrackSha256:'d'.repeat(64),otherTracksBeforeSha256:'e'.repeat(64)}};
 await coordinatedCommit(journal,staged,async()=>{commitCalls++;throw Error('fictional lost store response');});
}
process.stdout.write(JSON.stringify({finalResult,observation,finalCommitCalls,snapshotDigests:(input.snapshots||[]).map(snapshotDigest),responses,record:await journal.read(input.binding.package),commitCalls}));
