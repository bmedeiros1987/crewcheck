import assert from 'node:assert/strict';
import {withProfileLocks,withTransaction,assertTransactionClient} from '../server/profile-locks.mjs';
const calls=[];let attempt=0;
const db={async connect(){const current=attempt++;return {async query(sql,params){calls.push([current,sql,params]);return {rows:[{email:'a@example.test'}]};},release(){calls.push([current,'release']);}};}};
let effects=0;
const result=await withProfileLocks(db,['z@example.test','a@example.test','a@example.test'],async()=>{if(!effects++)throw Object.assign(Error('synthetic deadlock'),{code:'ER_LOCK_DEADLOCK'});return 'ok';},{repeatableRead:true});
assert.equal(result,'ok');assert.equal(attempt,2);
for(let index=0;index<2;index++){
 const statements=calls.filter(([n])=>n===index);
 assert.equal(statements[0][1],'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
 assert.equal(statements[1][1],'BEGIN');
 assert.equal(statements[2][2][0],'a@example.test');assert.equal(statements[3][2][0],'z@example.test');
 assert.equal(statements.at(-1)[1],'release');
 assert.equal(statements.at(-2)[1],index?'COMMIT':'ROLLBACK');
}

console.log('PASS profile locks: transaction isolation ordering, rollback/release, bounded retry with fresh connection');
for(const failure of ['isolation','missing-profile','action','exhausted-deadlock']){
 let attempts=0,releases=0,rollbacks=0,commits=0,afterCommitEffects=0;
 const broken={async connect(){attempts++;return {async query(sql){if(sql==='ROLLBACK')rollbacks++;if(sql==='COMMIT')commits++;if(failure==='isolation'&&sql.startsWith('SET TRANSACTION'))throw Error('isolation unavailable');return {rows:failure==='missing-profile'?[]:[{email:'a@example.test'}]};},release(){releases++;}};}};
 await assert.rejects(async()=>{await withProfileLocks(broken,['a@example.test'],async()=>{throw Object.assign(Error('fail'),failure==='exhausted-deadlock'?{code:'ER_LOCK_DEADLOCK'}:{});},{repeatableRead:true});afterCommitEffects++;});
 assert.equal(commits,0);assert.equal(afterCommitEffects,0);assert.equal(releases,attempts);assert.equal(rollbacks,attempts);assert.equal(attempts,failure==='exhausted-deadlock'?2:1);
}
console.log('PASS isolation failure/missing profile/action failure/deadlock exhaustion: rollback, release, no postcommit effects');
for(const mode of ['rollback-failed','commit-lost','commit-deadlock','fatal-query','discard-failed','discard-missing']){
 let connections=0,actions=0,releases=0,discards=0;
 const fixture={async connect(){connections++;return {async query(sql){if(sql==='ROLLBACK'&&['rollback-failed','discard-failed','discard-missing'].includes(mode))throw Error('SYNTHETIC_ROLLBACK_FAILURE');if(sql==='COMMIT'&&mode.startsWith('commit-'))throw Object.assign(Error('SYNTHETIC_COMMIT_FAILURE'),{code:mode==='commit-deadlock'?'ER_LOCK_DEADLOCK':'ECONNRESET'});return {rows:[{email:'synthetic@example.invalid'}]};},release(){releases++;},...(mode==='discard-missing'?{}:{discard(){discards++;if(mode==='discard-failed')throw Error('SYNTHETIC_DISCARD_FAILURE');}})};}};
 await assert.rejects(withProfileLocks(fixture,['synthetic@example.invalid'],async()=>{actions++;if(!mode.startsWith('commit-'))throw Object.assign(Error('SYNTHETIC_ACTION_FAILURE'),{code:mode==='fatal-query'?'ECONNRESET':'ER_LOCK_DEADLOCK'});return 'not-certified';}),e=>e.status===503&&/^PROFILE_TX_/.test(e.code));
 assert.equal(connections,1,'uncertain cleanup/commit must not retry');assert.equal(actions,1);assert.equal(releases,0,'uncertain client must never be returned to the pool');assert.equal(discards,mode==='discard-missing'?0:1);
}
console.log('PASS transaction uncertainty: rollback/fatal/commit failures discard once, never release/retry; missing or failed discard stays closed');

let escaped;const branded={connect:async()=>({query:async()=>({rows:[]}),release(){}})};
await withTransaction(branded,async client=>{escaped=client;assert.doesNotThrow(()=>assertTransactionClient(client));});
assert.throws(()=>assertTransactionClient(escaped),e=>e.code==='PROFILE_TX_CLIENT_REQUIRED');assert.throws(()=>assertTransactionClient(branded),e=>e.code==='PROFILE_TX_CLIENT_REQUIRED');
console.log('PASS transaction capability: no pool or escaped committed client can perform atomic cleanup');
