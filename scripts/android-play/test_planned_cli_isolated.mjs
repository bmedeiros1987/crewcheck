// QA ONLY: same disposable socket/table as notification tests; no production access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {snapshotDigest} from './reconcile_journal.mjs';
import {fileURLToPath} from 'node:url';
import mysql from 'mysql2/promise';
import {mysqlAdapter} from '../../server/mysql-platform-adapter.mjs';
import {createPlatformJournal} from './platform_journal.mjs';
import {createJournalProtocol} from './journal_protocol.mjs';
import {runPrototypeCommand} from '../v139/prototype-processes.mjs';
const socket='/tmp/crewcheck-notification-qa-socket/mysqld.sock',pkg='com.crewcheck.app',key=`play-release-journal:${pkg}`;
assert.equal(process.env.CREWCHECK_NOTIFICATION_QA,'isolated-mysql');assert.equal(process.env.CREWCHECK_QA_MYSQL_SOCKET,socket);assert(fs.statSync(socket).isSocket());
globalThis.fetch=()=>{throw Error('Network forbidden');};
const db=mysql.createPool({socketPath:socket,user:'root',password:'',database:'crewcheck_notification_qa',connectionLimit:2});
const journal=createPlatformJournal(mysqlAdapter(db));
const reset=()=>db.query('DELETE FROM crewcheck_telegram_state WHERE state_key=?',[key]);
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
let cleanupSafe=true;
try{
 assert.equal((await db.query('SELECT DATABASE() AS name'))[0][0].name,'crewcheck_notification_qa');
 await journal.verifyExistingSchema();
 const cases={'complete-proof':'reconciled','original-gone':'acknowledged','lost-create':'allocation_started','lost-stage':'stage_started','lost-pending-sql':'pending','unknown-commit':'reconciliation_required','lost-transport':'acknowledged','other-track':'stage_started','kill-stage-runner':'stage_started','kill-pending-helper':'pending'};
 for(const [scenario,state] of Object.entries(cases)){
  await reset();cleanupSafe=false;
  const result=runPrototypeCommand('python3',[fileURLToPath(new URL('./test_planned_cli.py',import.meta.url)),'--isolated-mysql',scenario],{
   timeout:60000,cwd:process.cwd(),env:{PATH:process.env.PATH,CREWCHECK_NOTIFICATION_QA:'isolated-mysql',CREWCHECK_QA_MYSQL_SOCKET:socket}});
  // The supervisor guarantees process-group quiescence; otherwise preserve row.
  assert(!result.error,'QA child or descendant quiescence unverified');assert.equal(result.signal,null);
  if(scenario==='kill-stage-runner'){assert.equal(result.status,128);assert.match(result.stderr,/QA_V2_STAGE_STARTED_BEFORE_RUNNER_SIGKILL/);}
  else if(scenario==='kill-pending-helper'){assert.notEqual(result.status,0);assert.match(result.stderr,/QA_V2_PENDING_READ_BEFORE_HELPER_SIGKILL/);}
  else assert.equal(result.status,0,`QA CLI failed (${scenario}): ${result.stderr}`);
  cleanupSafe=true;
  const saved=await journal.read(pkg);assert.equal(saved.state,state);assert.equal(saved.schema,2);
  // Fresh protocol process reads actual durable state, never prefix replay.
  const binding={schema:2,generation:saved.generation,plan:saved.plan};
  const restarted=createJournalProtocol({journal:createPlatformJournal(mysqlAdapter(db)),binding,authorize:async()=>true});
  const frame=(id,operation,input={})=>canonical({schema:2,id,operation,binding,revision:saved.revision,input});
  const observed=JSON.parse(await restarted(frame('restart-read','read')));assert.equal(observed.status,'ok');assert.deepEqual(observed.record,saved);assert.equal(observed.retryAllowed,false);
  assert.equal(JSON.parse(await restarted(frame('unsafe-resume','startAllocation'))).status,'blocked');
  await assert.rejects(journal.plan('reserve',null,saved.plan));assert.deepEqual(await journal.read(pkg),saved);
  console.log(`PASS real InnoDB CLI/protocol (${scenario}): ${state} persisted across fresh processes; restart observation and replacement/resume blocked; fictional Play only`);
  if(scenario==='complete-proof'){
   const plan={...saved.plan,owner:'mobile:124',runId:'124'};delete plan.planSha256;plan.planSha256=snapshotDigest(plan);
   const nextBinding={schema:2,generation:2,plan};
   const rollJournal=createPlatformJournal(mysqlAdapter(db),{approvePlan:async p=>snapshotDigest(p)===snapshotDigest(plan),approveRollover:async()=>true,verifyReconciliation:async()=>true});
   const oldSession=createJournalProtocol({journal:rollJournal,binding,authorize:async()=>true,lifecycle:{approveNextBinding:async(_r,b)=>snapshotDigest(b)===snapshotDigest(nextBinding)}});
   const roll=JSON.parse(await oldSession(frame('approved-rollover','rollover',nextBinding)));assert.equal(roll.status,'ok');assert.equal(roll.record.generation,2);
   assert.equal(JSON.parse(await oldSession(frame('retired-old','read'))).status,'blocked');
   const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-qa-handoff-')),receipt=path.join(dir,'receipt.json');
   fs.writeFileSync(receipt,JSON.stringify({binding:nextBinding,record:roll.record}),{mode:0o600});
   cleanupSafe=false;
   const second=runPrototypeCommand('python3',[fileURLToPath(new URL('./test_planned_cli.py',import.meta.url)),'--isolated-mysql','complete-proof','--handoff',receipt],{
    timeout:60000,cwd:process.cwd(),env:{PATH:process.env.PATH,CREWCHECK_NOTIFICATION_QA:'isolated-mysql',CREWCHECK_QA_MYSQL_SOCKET:socket}});
   assert(!second.error);assert.equal(second.signal,null);assert.equal(second.status,0,second.stderr);cleanupSafe=true;
   const completed=await journal.read(pkg);assert.equal(completed.generation,2);assert.equal(completed.state,'reconciled');assert.equal(completed.allocation.versionCodes.app,144157);assert.equal(completed.history[0].highWaterVersionCode,144156);assert(completed.revision>roll.record.revision);
   fs.rmSync(dir,{recursive:true});
   console.log('PASS real InnoDB two actual CLI generations: reviewed serialized rollover, retired old binding, fresh Python/Node handoff readback, preserved history and higher version; fictional Play only');
  }

 }
}finally{if(cleanupSafe)await reset();await db.end();}
