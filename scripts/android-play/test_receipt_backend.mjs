// TEST ONLY batch fixture: Python frames -> existing protocol -> actual journal
// on the existing deterministic SQL fixture. No listener, credential or network.
import fs from 'node:fs';
import {createMysqlJournal,coordinatedCommit} from './mysql_journal.mjs';
import {createJournalProtocol} from './journal_protocol.mjs';
import {snapshotDigest} from './reconcile_journal.mjs';
import {database} from './mysql_journal_fixture.mjs';
globalThis.fetch=()=>{throw Error('No external network');};
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const db=database(),journal=createMysqlJournal(db);
const protocol=createJournalProtocol({journal,binding:input.binding,authorize:async()=>true});
const responses=[];
for(const [index,frame] of input.frames.entries()){
 if(input.loseSqlAt===index)db.lose();
 responses.push(await protocol(frame));
}
let commitCalls=0;
if(input.uncertainCommit){
 const record=await journal.read(input.binding.package);
 const staged={...record,intent:{...record.intent,track:'qa',expectedTrackSha256:'d'.repeat(64),otherTracksBeforeSha256:'e'.repeat(64)}};
 await coordinatedCommit(journal,staged,async()=>{commitCalls++;throw Error('fictional lost store response');});
}
process.stdout.write(JSON.stringify({snapshotDigests:(input.snapshots||[]).map(snapshotDigest),responses,record:await journal.read(input.binding.package),commitCalls}));
