import { changeGateConsent, createGateOutboxConnection, gateConsentKey } from '../server/web-push/gateHost.mjs';
import { handleCrewCheckPush } from '../server/web-push/api.mjs';
import crypto from 'node:crypto';
import { installationStateKey,mutateInstallation } from '../server/web-push/installationRegistry.mjs';
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
  // Actual canonical session table/installation registry/consent/outbox connection.
  // Tables and credentials below exist ONLY in this already guarded disposable DB.
  await db.query('CREATE TABLE crewcheck_platform_accounts(email VARCHAR(254) PRIMARY KEY,must_change_password TINYINT NOT NULL) ENGINE=InnoDB');
  await db.query('INSERT INTO crewcheck_platform_accounts VALUES (?,0)',[email]);
  await db.query('CREATE TABLE crewcheck_watch_sessions(owner_id VARCHAR(160),session_id VARCHAR(160),epoch VARCHAR(64),revoked TINYINT,expires_at BIGINT,version BIGINT,PRIMARY KEY(owner_id,session_id)) ENGINE=InnoDB');
  const sessionId='watch1_'+ 'a'.repeat(64),epoch='b'.repeat(64),installId='installation_fixture_01',subscription={endpoint:'https://fcm.googleapis.com/fixture-gate-host',keys:{p256dh:'fixture',auth:'fixture'}},endpointKey=installationStateKey(subscription.endpoint);
  const identityContext={email,profile:{public_id:ownerId},payload:{iss:'crewcheck',aud:'crewcheck-web',sub:ownerId,email,jti:sessionId,iat:Math.floor(NOW/1000)-60,exp:Math.floor(NOW/1000)+600,mustChangePassword:false}};
  await db.query('INSERT INTO crewcheck_watch_sessions VALUES (?,?,?,0,?,1)',[ownerId,sessionId,epoch,NOW+600000]);
  const pair=crypto.createECDH('prime256v1');pair.generateKeys();subscription.keys={p256dh:pair.getPublicKey().toString('base64url'),auth:Buffer.alloc(16,7).toString('base64url')};
  const registryInput={identity:{email,ownerId},installationId:installId,expectedRevision:0,action:'subscribe',consent:true,subscription,key:Buffer.alloc(32),now:NOW};
  await mutateInstallation(db,registryInput);
  const consentInput={installationId:installId,expectedRevision:0,expectedInstallationRevision:1,enabled:true,confirmed:true};
  assert.equal((await changeGateConsent(db,identityContext,consentInput)).status,'disabled');
  await assert.rejects(changeGateConsent(db,identityContext,{...consentInput,authorityEpoch:epoch},{enabled:true,clock:()=>NOW}));
  for(const delta of [{jti:undefined},{aud:'crewcheck-visitor'},{sub:'owner_fixture_B'},{mustChangePassword:true},{exp:Math.floor(NOW/1000)}])await assert.rejects(changeGateConsent(db,{...identityContext,payload:{...identityContext.payload,...delta}},consentInput,{enabled:true,clock:()=>NOW}));
  await db.query('UPDATE crewcheck_watch_sessions SET revoked=1 WHERE owner_id=? AND session_id=?',[ownerId,sessionId]);await assert.rejects(changeGateConsent(db,identityContext,consentInput,{enabled:true,clock:()=>NOW}));
  await db.query('UPDATE crewcheck_watch_sessions SET revoked=0 WHERE owner_id=? AND session_id=?',[ownerId,sessionId]);
  await mutateInstallation(db,{...registryInput,expectedRevision:1});
  await assert.rejects(changeGateConsent(db,identityContext,consentInput,{enabled:true,clock:()=>NOW}),/não confirmados/,'old confirmation cannot consent to rotated installation');
  const callApi=async(input,context=identityContext)=>{let status,payload;const res={setHeader(){},writeHead(code){status=code;},end(raw){payload=JSON.parse(raw);}};
   await handleCrewCheckPush({method:'POST',headers:{origin:'https://fixture.test'}},res,new URL('https://fixture.test/api/platform/notifications/crewcheck-installation'),{identify:async()=>({...context,db}),configuration:()=>({origin:'https://fixture.test'}),read:async()=>structuredClone(input),clock:()=>NOW,gateHostEnabled:()=>true});return {status,payload};};
  const staleApi=await callApi({action:'gate-consent',...consentInput});assert.equal(staleApi.status,409,'API maps stale installation revision to conflict');assert.equal(staleApi.payload.code,'GATE_CONSENT_CONFLICT');
  const [staleConsent]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[gateConsentKey(ownerId,installId)]);assert.equal(staleConsent.length,0);
  consentInput.expectedInstallationRevision=2;
  const ack=await changeGateConsent(db,identityContext,consentInput,{enabled:true,clock:()=>NOW});assert.equal(ack.authorityEpoch,epoch);assert.equal(ack.localFenceConfirmed,false);assert(!('sessionId' in ack));
  await assert.rejects(changeGateConsent(db,identityContext,consentInput,{enabled:true,clock:()=>NOW}),/não confirmados/);
  const obs=observation('25'),sourceContext={rosterRevision:'roster_fixture_v1',identity,gate:'25',sourceUpdatedAt:obs.departureGateUpdate.updatedAt};
  let source={ownerId,rosterRevision:'roster_fixture_v1',observation:obs,previousObservation:observation('24')};
  const connected=createGateOutboxConnection({enabled:true,readSource:async()=>structuredClone(source),clock:()=>NOW});
  const gateEnvelope={schema:'crewcheck-notice-v1',ownerId,installationId:installId,consentRevision:2,topicRevision:1,authorityEpoch:epoch,eventKey:'gate-change-v1:'+ 'd'.repeat(64),expiresAt:new Date(NOW+60000).toISOString(),route:'/app'};
  const jobInput={installationKey:endpointKey,envelope:gateEnvelope,sourceContext,scheduledAt:new Date(NOW).toISOString()};
  assert.equal((await createGateOutboxConnection().enqueue(db,identityContext,jobInput)).status,'disabled');
  assert.equal((await createGateOutboxConnection({enabled:true,clock:()=>NOW}).enqueue(db,identityContext,jobInput)).status,'blocked','no source adapter is closed, even with valid authority/consent');
  for(const delta of [{authorityEpoch:'x'.repeat(64)},{ownerId:'owner_fixture_B'},{installationId:'installation_fixture_02'},{consentRevision:1},{consentRevision:3},{topicRevision:2}])assert.equal((await connected.enqueue(db,identityContext,{...jobInput,envelope:{...gateEnvelope,...delta}})).status,'blocked');
  for(const delta of [{ownerId:'owner_fixture_B'},{rosterRevision:'other_roster_fixture'},{previousObservation:undefined},{previousObservation:obs},{previousObservation:{...observation('24'),departureGateUpdate:{...observation('24').departureGateUpdate,updatedAt:new Date(NOW-1800001).toISOString()}}},{observation:{...obs,provider:'legacy'}},{observation:{...obs,operationalConflicts:['gate']}}]){const prior=source;source={...source,...delta};assert.equal((await connected.enqueue(db,identityContext,jobInput)).status,'blocked');source=prior;}
  source={...source,observation:{...obs,departureGateUpdate:undefined}};assert.equal((await connected.enqueue(db,identityContext,jobInput)).status,'blocked','fetch/record time is not field proof');source={ownerId,rosterRevision:'roster_fixture_v1',observation:obs,previousObservation:observation('24')};
  assert.equal((await connected.enqueue(db,identityContext,jobInput)).status,'queued');
  const [queued]=await db.query("SELECT state_key,payload FROM crewcheck_telegram_state WHERE JSON_UNQUOTE(JSON_EXTRACT(payload,'$.envelope.eventKey'))=?",[gateEnvelope.eventKey]);assert.equal(queued.length,1);
  let providerCalls=0;const configuration={enabled:true,configured:true,encryptionKey:Buffer.alloc(32)};
  assert.equal((await connected.dispatch(db,queued[0],configuration,async(sub,envelope)=>{providerCalls++;assert.equal(sub.endpoint,subscription.endpoint);assert.equal(envelope.authorityEpoch,epoch);return{status:'accepted_unconfirmed',received:null};})).status,'accepted_unconfirmed');assert.equal(providerCalls,1);
  assert.equal((await connected.dispatch(db,queued[0],configuration,async()=>{throw Error('duplicate');})).status,'accepted_unconfirmed');providerCalls=0;
  const revokedInput={...jobInput,envelope:{...gateEnvelope,eventKey:'gate-change-v1:'+ 'e'.repeat(64)}};assert.equal((await connected.enqueue(db,identityContext,revokedInput)).status,'queued');
  const [revocationJobs]=await db.query("SELECT state_key,payload FROM crewcheck_telegram_state WHERE JSON_UNQUOTE(JSON_EXTRACT(payload,'$.envelope.eventKey'))=?",[revokedInput.envelope.eventKey]);assert.equal(revocationJobs.length,1);
  // Revoked canonical session blocks existing persistent outbox before opening subscription/provider.
  await db.query('UPDATE crewcheck_watch_sessions SET revoked=1,epoch=NULL,version=version+1 WHERE owner_id=? AND session_id=?',[ownerId,sessionId]);
  assert.equal((await connected.dispatch(db,revocationJobs[0],configuration,async()=>{providerCalls++;throw Error('forbidden real transport');})).status,'cancelled');assert.equal(providerCalls,0);
  const [topicRows]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[gateConsentKey(ownerId,installId)]);assert.equal((typeof topicRows[0].payload==='string'?JSON.parse(topicRows[0].payload):topicRows[0].payload).active,true,'session invalidation blocks independently of topic row');
  await assert.rejects(changeGateConsent(db,identityContext,{...consentInput,expectedRevision:1},{enabled:true,clock:()=>NOW}));
  assert.equal((await callApi({action:'gate-consent',...consentInput,enabled:false,confirmed:false,expectedRevision:1})).status,409,'revoked session cannot write consent');
  // The tombstoned session stays revoked. A separate canonical session of the same owner
  // revokes topic consent through the actual API and CAS; a replay is then a conflict.
  const freshSession='watch1_'+'c'.repeat(64),freshContext={...identityContext,payload:{...identityContext.payload,jti:freshSession}};
  await db.query('INSERT INTO crewcheck_watch_sessions VALUES (?,?,?,0,?,1)',[ownerId,freshSession,'c'.repeat(64),NOW+600000]);
  const revokedApi=await callApi({action:'gate-consent',...consentInput,enabled:false,confirmed:false,expectedRevision:1},freshContext);
  assert.equal(revokedApi.status,200);assert.equal(revokedApi.payload.status,'server_consent_revoked');assert.equal(revokedApi.payload.enabled,false);assert.equal(revokedApi.payload.topicRevision,2);assert.equal(revokedApi.payload.localFenceConfirmed,false);assert(!('sessionId' in revokedApi.payload));
  const [revokedRows]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[gateConsentKey(ownerId,installId)]);const revokedTopic=typeof revokedRows[0].payload==='string'?JSON.parse(revokedRows[0].payload):revokedRows[0].payload;assert.equal(revokedTopic.active,false);assert.equal(revokedTopic.revision,2);
  const replay=await callApi({action:'gate-consent',...consentInput,enabled:false,confirmed:false,expectedRevision:1},freshContext);assert.equal(replay.status,409);assert.equal(replay.payload.code,'GATE_CONSENT_CONFLICT');
  assert.equal((await connected.enqueue(db,identityContext,{...jobInput,envelope:{...gateEnvelope,topicRevision:2,authorityEpoch:'c'.repeat(64),eventKey:'gate-change-v1:'+ 'f'.repeat(64)}})).status,'blocked','server-revoked topic cannot enqueue even at its current revision');
  console.log('PASS real canonical session reader + existing installation + gate consent CAS + existing persistent outbox: default OFF, scope/epoch/revision mismatch, no source proof and revocation before provider; no device enrollment or real sender');
  // Restore the deliberately uncertain durable state for an external engine restart.
  await seed();sends=0;await make().process();await mutate(a,s=>s.observation=observation('25'));
  await assert.rejects(make(a,{repository:crashRepository}).process(),/synthetic crash/);assert.equal(sends,1);
  console.log('PASS real InnoDB: producer baseline/change,8consumers, recreation, epoch/revoke/consent/install/roster fences, rollback after mock acceptance, owner-scoped deletion; zero network/real data');
 }
}finally{await db.end();}
