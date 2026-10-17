// TEST ONLY: prefix replay against the existing deterministic SQL fixture.
// No production transport, credential, socket/listener, Play client or grant.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {database} from './mysql_journal_fixture.mjs';
import {createMysqlJournal} from './mysql_journal.mjs';
import {createJournalProtocol} from './journal_protocol.mjs';
globalThis.fetch=()=>{throw Error('No external network');};
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const db=database(),journal=createMysqlJournal(db);let commits=0,stagedReads=0,completeReads=0;
const observation=(record,target,others)=>({httpStatus:200,package:record.package,owner:record.owner,revision:record.revision,
  editId:record.intent.editId,inventoryComplete:true,pendingReview:false,unfinishedRelease:false,unresolvedEdits:false,
  targetTrack:target,otherTracks:others});
const lifecycle={
  async readStagedState(record){
    stagedReads++;assert.equal((await journal.read(record.package)).state,'pending');
    const result=observation(record,input.stagedTrack,input.otherTracks);
    if(input.scenario==='incomplete-stage')result.inventoryComplete=false;
    if(input.scenario==='pending-review')result.pendingReview=true;
    return result;
  },
  async commitOnce(record){
    assert.equal((await journal.read(record.package)).state,'pending');commits++;
    if(input.scenario==='uncertain-commit')throw Error('fictional lost Play acknowledgement');
    if(input.scenario==='lost-final-sql')db.lose();
  },
  async readCompleteState(record){
    completeReads++;const result=observation(record,input.finalTrack,input.finalOtherTracks);
    if(input.scenario==='incomplete-final')result.inventoryComplete=false;
    if(input.scenario==='reader-unavailable')throw Error('private reader diagnostic');
    return result;
  },
};
const protocol=createJournalProtocol({journal,binding:input.binding,authorize:async()=>true,
  lifecycle:input.scenario==='no-capability'?undefined:lifecycle});
const responses=[];
for(const frame of input.frames){
  const request=JSON.parse(frame);
  if(input.scenario==='lost-pending-sql'&&request.operation==='commit')db.lose();
  responses.push(await protocol(frame));
}
let contenderBlocked=true;
if(input.contender){
  const other=createJournalProtocol({journal,binding:input.contender,authorize:async()=>true,lifecycle});
  const intent=Object.fromEntries(['sourceSha','controllerSha','runId','artifactSha256','versionCode'].map(k=>[k,input.contender[k]]));
  const frame={schema:1,id:'competing_mobile_wear',operation:'reserve',binding:input.contender,revision:0,state:null,intent};
  const canonical=v=>v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  contenderBlocked=JSON.parse(await other(canonical(frame))).status==='blocked';
}
process.stdout.write(JSON.stringify({responses,record:await journal.read(input.binding.package),commits,stagedReads,completeReads,contenderBlocked}));
