import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { createOfflineSqlGateAdapters } from '../server/web-push/gateSqlOffline.mjs';
import { createOfflineGatePushCandidate } from '../server/web-push/gateCandidate.mjs';
import { notificationStateDeletionStatements } from '../server/v139/notificationStateDeletion.mjs';
globalThis.fetch = () => { throw Error('External network forbidden'); };
const socketPath = process.env.CREWCHECK_GATE_QA_SOCKET;
assert.equal(process.env.CREWCHECK_GATE_QA, 'isolated-mysql');
assert(/^\/tmp\/crewcheck-gate-sql-qa-[a-zA-Z0-9]+\/mysqld.sock$/.test(socketPath || ''));
assert(fs.statSync(socketPath).isSocket());
const db = mysql.createPool({ socketPath, user: 'root', password: '', database: 'crewcheck_gate_push_qa', connectionLimit: 12 });
const NOW = Date.parse('2032-10-14T12:00:00Z');
const email = 'gate-a@example.test', ownerId = 'owner_fixture_A';
const identity = {flight:'LA100',origin:'GRU',destination:'REC',departureDate:'2032-10-14',scheduledDepartureUtc:'2032-10-14T13:00:00Z'};
const observation = gate => ({ok:true,provider:'custom',...identity,gate,departureGateUpdate:{schema:'crewcheck.departure-gate-update.v1',...identity,gate,updatedAt:new Date(NOW+(gate==='24'?-60000:-30000)).toISOString()}});
const initial = () => ({ownerId,authority:{ownerId,epoch:'epoch_fixture_01',expiresAt:NOW+300000,revoked:false},rosterRevision:'roster_fixture_v1',identity,
 installation:{ownerId,installationId:'installation_fixture_01',revision:1,active:true},consent:{ownerId,installationId:'installation_fixture_01',installationRevision:1,revision:1,enabled:true,topic:'departure-gate-change'},observation:observation('24')});
const options = {db,email,ownerId,fixtureOnly:true};
const adapter = () => createOfflineSqlGateAdapters(options);
async function mutate(a, change) {
 const c=await db.getConnection();try{await c.beginTransaction();await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[email]);
 const [rows]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[a.authorityKey]);const value=typeof rows[0].payload==='string'?JSON.parse(rows[0].payload):rows[0].payload;change(value.state);
 await c.query('UPDATE crewcheck_telegram_state SET payload=? WHERE state_key=?',[JSON.stringify(value),a.authorityKey]);await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();}
}
let sends=0;
const mockProvider={kind:'isolated-web-push-mock',send:async envelope=>{assert.equal(envelope.authorityEpoch,'epoch_fixture_01');assert.equal(Object.keys(envelope).length,9);sends++;return{accepted:true};}};
const make=(a=adapter(),extra={})=>createOfflineGatePushCandidate({enabled:true,...a,mockProvider,clock:()=>NOW,...extra});
try {
 const [where]=await db.query('SELECT DATABASE() AS name,@@datadir AS datadir');
 assert.equal(where[0].name,'crewcheck_gate_push_qa');assert([path.join(path.dirname(socketPath),'data'),'/var/run/mysqld/data'].includes(path.resolve(where[0].datadir)));
 const a=adapter();
 if(process.env.CREWCHECK_GATE_QA_RESTART==='verify'){
  const result=await make(a).process();assert.equal(sends,0,'engine restart cannot replay durable dispatch claim');assert(result.results?.some(r=>r.status==='dispatching'));
  console.log('PASS real MySQL ENGINE restart: committed dispatching claim survives, recreated producer sends zero');
 } else {
  await db.query('CREATE TABLE crewcheck_platform_profiles(email VARCHAR(254) PRIMARY KEY,public_id VARCHAR(160)) ENGINE=InnoDB');
  await db.query('CREATE TABLE crewcheck_telegram_state(state_key VARCHAR(255) PRIMARY KEY,payload JSON NOT NULL,updated_at DATETIME(3) NOT NULL) ENGINE=InnoDB');
  await db.query('INSERT INTO crewcheck_platform_profiles VALUES (?,?),(?,?)',[email,ownerId,'gate-b@example.test','owner_fixture_B']);
  const seed=async()=>{await db.query('DELETE FROM crewcheck_telegram_state');await db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3))',[a.authorityKey,JSON.stringify({kind:'isolated-gate-authority',email,ownerId,state:initial()})]);};
  await seed();await assert.rejects(a.repository.transaction('rollback-probe',async record=>{await record.save({status:'must-rollback'});throw Error('synthetic rollback');}),/synthetic rollback/);const [rolledBack]=await db.query("SELECT state_key FROM crewcheck_telegram_state WHERE JSON_UNQUOTE(JSON_EXTRACT(payload,'$.key'))='rollback-probe'");assert.equal(rolledBack.length,0,'baseline and save roll back atomically');assert.equal((await make().process()).status,'baseline');assert.equal(sends,0);
  await mutate(a,s=>s.observation=observation('25'));
  await Promise.all(Array.from({length:8},()=>make().process()));assert.equal(sends,1,'eight real SQL consumers send exactly once');
  await make().process();assert.equal(sends,1,'new adapter preserves dedup');
  for(const revoke of [s=>s.authority.epoch='epoch_fixture_02',s=>s.authority.revoked=true,s=>s.consent.enabled=false,s=>s.installation.revision++,s=>s.rosterRevision='roster_fixture_v2']){
   await seed();await make().process();await mutate(a,s=>s.observation=observation('25'));sends=0;
   const repository={...a.repository,transaction:async(key,run)=>{const result=await a.repository.transaction(key,run);if(result?.claimId)await mutate(a,revoke);return result;}};
   await make(a,{repository}).process();assert.equal(sends,0,'revocation between durable claim and send is rechecked under SQL owner lock');
  }
  await seed();sends=0;await make().process();await mutate(a,s=>s.observation=observation('25'));
  const crashRepository={...a.repository,transaction:(key,run)=>a.repository.transaction(key,async record=>{const result=await run(record);if(result?.status==='accepted_unconfirmed')throw Error('synthetic crash after mock acceptance');return result;})};
  await assert.rejects(make(a,{repository:crashRepository}).process(),/synthetic crash/);assert.equal(sends,1);
  await make().process();assert.equal(sends,1,'rollback after acceptance never returns committed claim to sendable state');
  const [claims]=await db.query("SELECT payload FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-push-outbox:gate-off:%' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.record.status'))='dispatching'");assert.equal(claims.length,1);
  // Scope + deletion counterproof uses the existing account deletion statements.
  const other=createOfflineSqlGateAdapters({...options,email:'gate-b@example.test',ownerId:'owner_fixture_B'});
  await other.repository.transaction('other-scope',async r=>r.save({status:'fixture-only'}));
  for(const [sql,args] of notificationStateDeletionStatements(email)){
   if(!sql.includes('crewcheck_telegram_state'))continue;
   await db.query(sql.replaceAll('$1','?'),args);
  }
  const [left]=await db.query("SELECT payload FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-push-outbox:gate-off:%'");assert.equal(left.length,1);assert.equal((typeof left[0].payload==='string'?JSON.parse(left[0].payload):left[0].payload).ownerId,'owner_fixture_B');
  await seed();await make().process();await mutate(a,s=>s.observation=observation('25'));sends=0;await db.query('UPDATE crewcheck_platform_profiles SET public_id=? WHERE email=?',['owner_replacement_fixture',email]);assert.equal((await make().process()).status,'blocked');assert.equal(sends,0,'owner replacement blocks an otherwise valid pending change');await db.query('UPDATE crewcheck_platform_profiles SET public_id=? WHERE email=?',[ownerId,email]);
  // Restore the deliberately uncertain durable state for an external engine restart.
  await seed();sends=0;await make().process();await mutate(a,s=>s.observation=observation('25'));
  await assert.rejects(make(a,{repository:crashRepository}).process(),/synthetic crash/);assert.equal(sends,1);
  console.log('PASS real InnoDB: producer baseline/change,8consumers, recreation, epoch/revoke/consent/install/roster fences, rollback after mock acceptance, owner-scoped deletion; zero network/real data');
 }
}finally{await db.end();}
