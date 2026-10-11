// Reuse the EXISTING notification-mysql CI fixture, never an application DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import {createMysqlJournal,coordinatedCommit} from './mysql_journal.mjs';
import {reconcileAcknowledged,snapshotDigest} from './reconcile_journal.mjs';
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
try{
  assert.equal((await db.query('SELECT DATABASE() AS name'))[0][0].name,'crewcheck_notification_qa');
  // No DDL: prior existing notification regression created the ephemeral table.
  await reset();const journal=createMysqlJournal(db);await journal.verifyExistingSchema();
  const outcomes=await Promise.allSettled(Array.from({length:6},(_,i)=>journal.reserve(packageName,`qa:${i}`,intent)));
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
    query:(...args)=>c.query(...args),beginTransaction:()=>c.beginTransaction(),rollback:()=>c.rollback(),release:()=>c.release(),destroy:()=>c.destroy(),
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
  const ack=await coordinatedCommit(recovery,opened2,async()=>{}); // synthetic callback only
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
  console.log('PASS: real existing isolated MySQL PK concurrency, owner/revision fencing and committed-but-lost pending acknowledgement; no Play calls');
}finally{await reset();await db.end();}
