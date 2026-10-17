// Reuse the EXISTING notification-mysql CI fixture, never an application DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import {createMysqlJournal,coordinatedCommit} from './mysql_journal.mjs';
import {reconcileAcknowledged,snapshotDigest} from './reconcile_journal.mjs';
import {mysqlAdapter} from '../../server/mysql-platform-adapter.mjs';
import {createPlatformJournal,createPlatformReleaseProtocol} from './platform_journal.mjs';
import {createJournalProtocol} from './journal_protocol.mjs';
import {runPrototypeNode} from '../v139/prototype-processes.mjs';
import {fileURLToPath} from 'node:url';
globalThis.fetch=()=>{throw Error('External network forbidden');};
const socketPath='/tmp/crewcheck-notification-qa-socket/mysqld.sock';
assert.equal(process.env.CREWCHECK_NOTIFICATION_QA,'isolated-mysql');
assert.equal(process.env.CREWCHECK_QA_MYSQL_SOCKET,socketPath);
assert(fs.statSync(socketPath).isSocket());
const db=mysql.createPool({socketPath,user:'root',password:'',database:'crewcheck_notification_qa',connectionLimit:8});
const packageName='com.crewcheck.app',stateKey=`play-release-journal:${packageName}`;
const intent={sourceSha:'a'.repeat(40),controllerSha:'b'.repeat(40),artifactSha256:'c'.repeat(64),runId:'123',versionCode:144201};
const staged={...intent,editId:'synthetic-edit',track:'qa',expectedTrackSha256:'d'.repeat(64),otherTracksBeforeSha256:'e'.repeat(64)};
const reset=()=>db.query('DELETE FROM crewcheck_telegram_state WHERE state_key=?',[stateKey]);
let cleanupSafe=true;
if(process.argv.includes('--crash-after-pending')){
  const worker=createMysqlJournal(db);
  const reserved=await worker.reserve(packageName,'qa-dead-runner',intent);
  const opened=await worker.advance(packageName,reserved.owner,staged,reserved.revision,'edit_open');
  await coordinatedCommit(worker,opened,async()=>{
    assert.equal((await worker.read(packageName)).state,'pending');
    fs.writeSync(1,'QA_PENDING_DURABLY_READ_BEFORE_RUNNER_KILL\n');
    process.kill(process.pid,'SIGKILL');
  });
  throw Error('Crash fixture unexpectedly survived');
}
try{
  assert.equal((await db.query('SELECT DATABASE() AS name'))[0][0].name,'crewcheck_notification_qa');
  // No DDL: prior existing notification regression created the ephemeral table.
  await reset();const journal=createMysqlJournal(db);await journal.verifyExistingSchema();
  const outcomes=await Promise.allSettled(Array.from({length:6},(_,i)=>journal.reserve(packageName,`${i%2?'wear':'mobile'}:qa:${i}`,intent)));
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(x=>x.status==='rejected').length,5);
  const reserved=await journal.read(packageName),owner=reserved.owner;
  await assert.rejects(journal.advance(packageName,'foreign',staged,reserved.revision,'edit_open'));
  const opened=await journal.advance(packageName,owner,staged,reserved.revision,'edit_open');
  let callbacks=0;
  const result=await coordinatedCommit(journal,opened,async()=>{callbacks++;assert.equal((await journal.read(packageName)).state,'pending');throw Error('synthetic lost Play response');});
  assert.equal(result.state,'reconciliation_required');assert.equal(callbacks,1);
  await assert.rejects(coordinatedCommit(journal,opened,async()=>callbacks++));assert.equal(callbacks,1);
  await assert.rejects(createMysqlJournal(db).reserve(packageName,'fresh-run',intent));
  await reset();let loseCommit=false;
  const lossy={query:(...args)=>db.query(...args),async getConnection(){const c=await db.getConnection();return {
    async query(sql,args){const result=await c.query(sql,args);if(sql==='COMMIT'&&loseCommit){loseCommit=false;throw Error('synthetic acknowledgement lost AFTER SQL COMMIT query');}return result;},
    beginTransaction:()=>c.beginTransaction(),rollback:()=>c.rollback(),release:()=>c.release(),destroy:()=>c.destroy(),
    async commit(){await c.commit();if(loseCommit){loseCommit=false;throw Error('synthetic acknowledgement lost AFTER SQL commit');}}
  };}};
  const recovery=createMysqlJournal(lossy),first=await recovery.reserve(packageName,'qa-owner',intent);
  const edit=await recovery.advance(packageName,'qa-owner',staged,first.revision,'edit_open');
  loseCommit=true;let externalCalls=0;
  await assert.rejects(coordinatedCommit(recovery,edit,async()=>externalCalls++));
  assert.equal(externalCalls,0);assert.equal((await createMysqlJournal(db).read(packageName)).state,'pending');
  await assert.rejects(createMysqlJournal(db).reserve(packageName,'replacement-run',intent));
  await reset();
  const targetTrack={track:'qa',releases:[{status:'completed',versionCodes:['144201']}]};
  const otherTracks={production:{track:'production',releases:[]}};
  const bound={...staged,expectedTrackSha256:snapshotDigest(targetTrack),otherTracksBeforeSha256:snapshotDigest(otherTracks)};
  const start=await recovery.reserve(packageName,'qa-reconcile',intent);
  const opened2=await recovery.advance(packageName,start.owner,bound,start.revision,'edit_open');
  await coordinatedCommit(recovery,opened2,async()=>{}); // synthetic callback only
  const ack=await recovery.read(packageName); // exact durable record, no outcome-only fields
  const observation={httpStatus:200,package:packageName,editId:bound.editId,owner:ack.owner,revision:ack.revision,inventoryComplete:true,pendingReview:false,unfinishedRelease:false,unresolvedEdits:false,targetTrack,otherTracks};
  await assert.rejects(reconcileAcknowledged(recovery,ack,async()=>({...observation,pendingReview:true})));
  assert.equal((await recovery.read(packageName)).state,'acknowledged');
  loseCommit=true;
  await assert.rejects(reconcileAcknowledged(recovery,ack,async()=>observation));
  const durableProof=await createMysqlJournal(db).read(packageName);
  assert.equal(durableProof.state,'reconciled');
  assert.equal(durableProof.intent.reconciliationSha256,snapshotDigest(observation));
  await assert.rejects(reconcileAcknowledged(recovery,ack,async()=>observation));
  await assert.rejects(recovery.reserve(packageName,'after-reconciled',intent));
  console.log('PASS: real existing isolated SQL reconciliation proof survives lost acknowledgement; replay and rollover blocked; no Play calls');
  await reset();
  const platformJournal=createPlatformJournal(mysqlAdapter(lossy));
  const bridged=await platformJournal.reserve(packageName,'qa-platform-bridge',intent);
  await assert.rejects(platformJournal.advance(packageName,'foreign',bound,bridged.revision,'edit_open'));
  const bridgedEdit=await platformJournal.advance(packageName,bridged.owner,bound,bridged.revision,'edit_open');
  loseCommit=true;let bridgeExternalCalls=0;
  await assert.rejects(coordinatedCommit(platformJournal,bridgedEdit,async()=>bridgeExternalCalls++));
  assert.equal(bridgeExternalCalls,0);
  assert.equal((await createPlatformJournal(mysqlAdapter(db)).read(packageName)).state,'pending');
  await assert.rejects(createPlatformJournal(mysqlAdapter(db)).reserve(packageName,'new-platform-owner',intent));
  console.log('PASS: existing platform query/connect adapter and journal share real isolated SQL binds/CAS; lost pending acknowledgement blocks external callback and new owner; no Play calls');
  await reset();
  const wireJournal=createPlatformJournal(mysqlAdapter(lossy));
  const binding={package:packageName,owner:'qa-wire',producer:'mobile',...intent};
  const protocol=createJournalProtocol({journal:wireJournal,binding,authorize:async()=>true}); // fictional QA capability only
  const canonical=v=>v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  const frame=(id,operation,revision,state,intent)=>canonical({schema:1,id,operation,binding,revision,state,intent});
  const reservedWire=JSON.parse(await protocol(frame('reserve','reserve',0,null,intent)));
  assert.equal(reservedWire.status,'ok');assert.equal(reservedWire.record.revision,1);
  const stagedWire=JSON.parse(await protocol(frame('open','advance',1,'edit_open',bound)));
  assert.equal(stagedWire.status,'ok');assert.equal(stagedWire.record.revision,2);
  loseCommit=true;
  const uncertainWire=JSON.parse(await protocol(frame('pending','advance',2,'pending',bound)));
  assert.equal(uncertainWire.status,'blocked');assert.equal(uncertainWire.retryAllowed,false);
  assert.equal((await createPlatformJournal(mysqlAdapter(db)).read(packageName)).state,'pending');
  assert.equal(JSON.parse(await protocol(frame('new-id','advance',2,'pending',bound))).status,'blocked');
  await assert.rejects(createPlatformJournal(mysqlAdapter(db)).reserve(packageName,'other-wire-owner',intent));
  console.log('PASS: serialized executor/journal protocol on existing real isolated platform SQL; lost durable reply and stale frames block without retry or Play');
  await reset();
  let lifecycleCommits=0;
  const lifecycleBinding={...binding,owner:'qa-platform-lifecycle'};
  const complete=record=>({...observation,owner:record.owner,revision:record.revision,editId:record.intent.editId});
  const releaseProtocol=createPlatformReleaseProtocol({db:mysqlAdapter(db),binding:lifecycleBinding,authorize:async()=>true,
    lifecycle:{async readStagedState(record){assert.equal((await createPlatformJournal(mysqlAdapter(db)).read(packageName)).state,'pending');return complete(record);},
      async commitOnce(){lifecycleCommits++;},async readCompleteState(record){return complete(record);}}});
  const releaseFrame=(id,operation,revision,state,value)=>canonical({schema:1,id,operation,binding:lifecycleBinding,revision,state,intent:value});
  assert.equal(JSON.parse(await releaseProtocol(releaseFrame('life-reserve','reserve',0,null,intent))).status,'ok');
  assert.equal(JSON.parse(await releaseProtocol(releaseFrame('life-open','advance',1,'edit_open',bound))).status,'ok');
  const committed=JSON.parse(await releaseProtocol(releaseFrame('life-commit','commit',2,null,bound)));
  assert.equal(committed.helperResult.state,'acknowledged');assert.equal(lifecycleCommits,1);
  const reconciled=JSON.parse(await releaseProtocol(releaseFrame('life-reconcile','reconcile',4,null,bound)));
  assert.equal(reconciled.helperResult.state,'reconciled');assert(Array.isArray(reconciled.observation.targetTrack.releases));
  assert.equal((await createPlatformJournal(mysqlAdapter(db)).read(packageName)).intent.reconciliationSha256,reconciled.helperResult.observationSha256);
  assert.equal(JSON.parse(await releaseProtocol(releaseFrame('life-replay','commit',2,null,bound))).status,'blocked');
  await assert.rejects(createPlatformJournal(mysqlAdapter(db)).reserve(packageName,'wear-after-mobile',intent));
  assert.equal(lifecycleCommits,1);
  console.log('PASS: publisher lifecycle wire invokes existing helpers through existing platform adapter on real isolated SQL, exact proof persisted, replay/Mobile-Wear competition blocked; fictional Play only');
  await reset();
  // Schema-v2 OFF lifecycle uses the very same platform adapter/key, no DDL.
  const qaCapabilities={approvePlan:async()=>true,verifyInventory:async()=>true,
    verifyArtifacts:async()=>true,verifyStage:async()=>true,
    verifyReconciliation:async()=>true,approveRollover:async()=>true,commitOnce:async()=>{}};
  const planned=createPlatformJournal(mysqlAdapter(db),qaCapabilities);
  const plannedBinding=r=>({owner:r.owner,generation:r.generation,revision:r.revision});
  const nextPlan=run=>{const p={package:packageName,owner:`qa-planned:${run}`,producer:'mobile',sourceSha:intent.sourceSha,controllerSha:intent.controllerSha,runId:run,modules:['app']};return {...p,planSha256:snapshotDigest(p)};};
  let plannedRecord=await planned.plan('reserve',null,nextPlan('801'));
  for(let i=0;i<2;i++){
    plannedRecord=await planned.plan('startAllocation',plannedBinding(plannedRecord),{});
    plannedRecord=await planned.plan('saveEdit',plannedBinding(plannedRecord),{editId:`qa-original-${i}`});
    const floor=144155+i*2;
    plannedRecord=await planned.plan('allocate',plannedBinding(plannedRecord),{inventorySha256:'d'.repeat(64),floor,versionCodes:{app:floor+1}});
    const a=['app'].map(module=>({module,package:packageName,versionCode:plannedRecord.allocation.versionCodes[module],sourceSha:intent.sourceSha,controllerSha:intent.controllerSha,manifestSha256:'e'.repeat(64),uploadCertificateSha256:'f'.repeat(64),artifactSha256:'c'.repeat(64)}));
    plannedRecord=await planned.plan('finalize',plannedBinding(plannedRecord),a);
    await planned.commitPlan(plannedBinding(plannedRecord),{track:'internal',expectedTrackSha256:'d'.repeat(64),otherTracksBeforeSha256:'e'.repeat(64)});
    plannedRecord=await planned.read(packageName);
    plannedRecord=await planned.plan('reconcile',plannedBinding(plannedRecord),{reconciliationSha256:'f'.repeat(64)});
    if(i===0){const stale=plannedBinding(plannedRecord);plannedRecord=await planned.plan('rollover',stale,nextPlan('802'));await assert.rejects(planned.plan('startAllocation',stale,{}));}
  }
  assert.equal(plannedRecord.generation,2);assert.equal(plannedRecord.history.length,1);
  assert.equal(plannedRecord.history[0].highWaterVersionCode,144156);
  assert.equal((await createPlatformJournal(mysqlAdapter(db)).read(packageName)).allocation.versionCodes.app,144158);
  console.log('PASS: schema-v2 plan/allocation/finalization and two generations persist through existing platform adapter on isolated InnoDB; no live transport');
  await reset();
  cleanupSafe=false;
  const killed=runPrototypeNode([fileURLToPath(import.meta.url),'--crash-after-pending'],{
    timeout:30000,cwd:process.cwd(),env:{PATH:process.env.PATH,
      CREWCHECK_NOTIFICATION_QA:'isolated-mysql',CREWCHECK_QA_MYSQL_SOCKET:socketPath}});
  assert(!killed.error);assert.equal(killed.status,128);assert.equal(killed.signal,null);
  assert.match(killed.stdout,/QA_PENDING_DURABLY_READ_BEFORE_RUNNER_KILL/);
  cleanupSafe=true; // Approved supervisor returned after confirming quiescence.
  const afterDeath=await createPlatformJournal(mysqlAdapter(db)).read(packageName);
  assert.equal(afterDeath.state,'pending');assert.equal(afterDeath.owner,'qa-dead-runner');
  await assert.rejects(createPlatformJournal(mysqlAdapter(db)).reserve(packageName,'wear-after-death',intent));
  console.log('PASS: actual supervised runner SIGKILL after acknowledged pending SQL; existing InnoDB row survives and Mobile/Wear fresh owner remains blocked; no Play');
  console.log('PASS: real existing isolated MySQL PK concurrency, owner/revision fencing and committed-but-lost pending acknowledgement; no Play calls');
}finally{if(cleanupSafe)await reset();await db.end();}
