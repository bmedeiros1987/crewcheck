// TEST ONLY: deterministic row; next executor binding is approved outside frames.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {snapshotDigest} from './reconcile_journal.mjs';
import {database} from './mysql_journal_fixture.mjs';
import {createMysqlJournal} from './mysql_journal.mjs';
import {createJournalProtocol} from './journal_protocol.mjs';
const data=JSON.parse(fs.readFileSync(0,'utf8')),db=database(),key='play-release-journal:com.crewcheck.app';
db.rows.set(key,JSON.stringify(data.record));
const journal=createMysqlJournal(db,{approvePlan:async p=>snapshotDigest(p)===snapshotDigest(data.next.plan),approveRollover:async()=>data.scenario!=='approval-refused',verifyReconciliation:async()=>data.scenario!=='proof-incomplete'});
const nextApproval=async(old,binding)=>data.scenario!=='binding-refused'&&snapshotDigest(binding)===snapshotDigest(data.next);
const old=createJournalProtocol({journal,binding:data.binding,authorize:async()=>true,lifecycle:{approveNextBinding:nextApproval}});
// New instance is a separately approved executor, never repinned by old frames.
const next=createJournalProtocol({journal,binding:data.next,authorize:async()=>data.scenario!=='new-executor-refused'});
const responses=[];
for(const frame of data.frames){const request=JSON.parse(frame);if(data.scenario==='lost-rollover-sql'&&request.operation==='rollover')db.lose();const server=request.binding.plan.owner===data.binding.plan.owner?old:next;responses.push(await server(frame));}
console.log(JSON.stringify({responses,record:await journal.read('com.crewcheck.app')}));
