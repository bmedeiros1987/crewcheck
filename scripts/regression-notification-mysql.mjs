import {handleBidsDefaultWindow,functionalProfileKey} from '../server/v139/bidsDefaultWindow.mjs';
import {simulatedWorker,WORKER_SCOPE,localProviderStats} from '../server/free-day-simulated-worker.mjs';
import {personalConsent,PERSONAL_SCOPE} from '../server/free-day-personal-consent.mjs';
import assert from 'node:assert/strict';
import {selectPushInstallations,selectDuePushJobs} from '../server/web-push/bidsProducer.mjs';
import {enqueueCrewCheckPush,dispatchPersistentPush,reconcilePushReceipts,outboxKey} from '../server/web-push/outbox.mjs';
import {mutateInstallation,revokeAccountInstallations,installationStateKey} from '../server/web-push/installationRegistry.mjs';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { handleBidsCore } from '../server/v139/bidsCore.mjs';
import { handleBidsAlertPreferences } from '../server/v139/bidsAlertPreferences.mjs';
import { notifyBidRows, claimBid } from '../server/v139/bidsNotify.mjs';
import { confirmCycle, cycleJobPrefix, cycleStateKey, LEAVE_CYCLE } from '../server/v139/notificationCycles.mjs';
import { FREE_DAY_SCOPE, mutateFreeDayHeld, readFreeDayHeldState } from '../server/free-day-held.mjs';
import {sourceQueue} from '../server/free-day-source-queue.mjs';
import {SOURCE_JOB_SCOPE,sourceJobStateKey} from '../server/free-day-source-job-state.mjs';
import { SOURCE_SCOPE, voluntarySources, sourceKey } from '../server/free-day-sources.mjs';
import crypto from 'node:crypto';
import { dispatchClaimedJob } from '../server/notification-job-safety.mjs';
import { notificationStateDeletionStatements } from '../server/v139/notificationStateDeletion.mjs';

// Only the disposable UNIX socket: no DATABASE_URL, TCP, provider or credentials.
globalThis.fetch = () => { throw new Error('External network forbidden'); };
const socketPath = '/tmp/crewcheck-notification-qa-socket/mysqld.sock';
assert.equal(process.env.CREWCHECK_NOTIFICATION_QA, 'isolated-mysql');
assert.equal(process.env.CREWCHECK_QA_MYSQL_SOCKET, socketPath);
assert(fs.statSync(socketPath).isSocket());
const db = mysql.createPool({socketPath,user:'root',password:'',database:'crewcheck_notification_qa',connectionLimit:8});
const email = 'notifications@example.test', owner = 'fictional-owner';
const passed=[];
const run=async(name,fn)=>{await fn();passed.push(name);};
const base={creationKey:'same-creation',title:'Fictional BIDS',targetMonth:'2026-10',opensAt:'2026-10-11T10:00:00Z',closesAt:'2026-10-15T20:00:00Z',notifyOpen:true,notifyLastDay:true};
async function request(body, id='', method='POST') {
  const res={writeHead(status){this.status=status},end(text){this.body=JSON.parse(text)}};
  await handleBidsCore({method},res,new URL(`https://example.test/api/platform/bids${id?'/'+id:''}`),{identify:async()=>({db,email,profile:{public_id:owner},payload:{sub:owner}}),read:async()=>body});
  return res;
}
const list=async()=> (await db.query('SELECT *,ROUND(UNIX_TIMESTAMP(opens_at)*1000) AS open_epoch,ROUND(UNIX_TIMESTAMP(closes_at)*1000) AS close_epoch FROM crewcheck_platform_bid_windows'))[0];
try {
  assert.equal((await db.query('SELECT DATABASE() AS name'))[0][0].name,'crewcheck_notification_qa');
  for(const table of ['crewcheck_notification_jobs','crewcheck_platform_bid_windows','crewcheck_telegram_state','crewcheck_platform_profiles']) await db.query(`DROP TABLE IF EXISTS ${table}`);
  await db.query(`CREATE TABLE crewcheck_telegram_state(state_key VARCHAR(255) PRIMARY KEY,payload JSON NOT NULL,updated_at DATETIME(3) NOT NULL) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE crewcheck_platform_profiles(email VARCHAR(254) PRIMARY KEY,public_id VARCHAR(64),created_at DATETIME(3) NOT NULL) ENGINE=InnoDB`);
  const migration=fs.readFileSync('migrations/20260715_005_v139_recovery_bids_crewlock.sql','utf8');
  await db.query(migration.match(/CREATE TABLE IF NOT EXISTS crewcheck_platform_bid_windows[\s\S]*?ENGINE=InnoDB[^;]*;/)[0]);
  const queue=fs.readFileSync('server/telegram-fast-ack.mjs','utf8');
  await db.query(queue.match(/await db\.query\(`(CREATE TABLE IF NOT EXISTS crewcheck_notification_jobs[\s\S]*?)`\)/)[1]);
  await db.query('INSERT INTO crewcheck_platform_profiles VALUES(?,?,?)',[email,owner,new Date('2020-01-01T00:00:00Z')]);
  await run('functional profile real SQL CAS, observational GET and stale-owner rollback',async()=>{
    const invoke=async body=>{const res={setHeader(){},writeHead(status){this.status=status},end(value){this.data=JSON.parse(value)}};await handleBidsDefaultWindow({method:body?'POST':'GET',headers:{origin:'https://crewcheck.onrender.com'}},res,new URL('https://crewcheck.onrender.com/api/platform/bids/default-window?targetMonth=2026-10'),{identify:async()=>({db,email,profile:{public_id:owner},payload:{sub:owner}}),read:async()=>body});return res;};
    const before=(await db.query('SELECT * FROM crewcheck_telegram_state'))[0];assert.equal((await invoke()).data.profile,null);assert.deepEqual((await db.query('SELECT * FROM crewcheck_telegram_state'))[0],before);
    const body={ownerId:owner,confirmed:true,expectedRevision:0,airline:'LATAM',role:'cabin',instructorKind:'route'};
    const results=await Promise.all([invoke(body),invoke(body)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await invoke()).data.profile.instructorKind,'route');assert.equal((await invoke()).data.resolution.window,null);
    await db.query('UPDATE crewcheck_platform_profiles SET public_id=? WHERE email=?',['recreated-profile-owner',email]);assert.equal((await invoke({...body,expectedRevision:1,instructorKind:'none'})).status,401);await db.query('UPDATE crewcheck_platform_profiles SET public_id=? WHERE email=?',[owner,email]);assert.equal((await invoke()).data.profile.revision,1);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM crewcheck_notification_jobs'))[0][0].n,0);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM crewcheck_telegram_state WHERE state_key=?',[functionalProfileKey(email,owner)]))[0][0].n,1);
  });
  await run('real MySQL bounded push selection fairness',async()=>{
    const instant=Date.parse('2026-11-11T09:00:00Z');
    for(let index=0;index<51;index++)await db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3))',['crewcheck-push-installation:fair_'+String(index).padStart(3,'0'),JSON.stringify({active:true})]);
    const first=await selectPushInstallations(db),next=await selectPushInstallations(db);assert.equal(first.length,50);assert.equal(next.length,50);assert.equal(new Set([...first,...next].map(row=>row.state_key)).size,51);
    for(let index=0;index<46;index++)await db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3))',['crewcheck-push-outbox:fair_'+String(index).padStart(3,'0'),JSON.stringify({status:'queued',scheduledAt:new Date(instant+(index<25?60000+index:-(index-25)*1000)).toISOString()})]);
    const due=await selectDuePushJobs(db,instant);assert.equal(due.length,20);assert(due.every(row=>Date.parse(row.payload.scheduledAt)<=instant));
    for(const row of due)await db.query('DELETE FROM crewcheck_telegram_state WHERE state_key=?',[row.state_key]);assert.equal((await selectDuePushJobs(db,instant)).length,1);
    await db.query("DELETE FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-push-installation:fair_%' OR state_key LIKE 'crewcheck-push-outbox:fair_%' OR state_key='crewcheck-push-producer-cursor:v1'");
  });


  await run('BIDS channel preferences: real SQL owner lock, CAS, idempotency and observational GET without campaign or sends',async()=>{
    const invoke=async body=>{
      const response={status:200,setHeader(){},writeHead(status){this.status=status;},end(value){this.data=JSON.parse(value);}};
      try{await handleBidsAlertPreferences({method:body?'POST':'GET'},response,new URL('https://fixture.invalid/api/platform/bids/alert-preferences'),{identify:async()=>({db,email,profile:{public_id:owner},payload:{sub:owner}}),read:async()=>body});}
      catch(error){response.status=error.status||500;response.data={message:error.message};}
      return response;
    };
    const [before]=await db.query('SELECT state_key,payload,updated_at FROM crewcheck_telegram_state ORDER BY state_key');
    const firstRead=await invoke();assert.equal(firstRead.status,200);assert.equal(firstRead.data.preferences.enabled,false);assert.equal(firstRead.data.plan.reason,'official_data_pending');
    const [after]=await db.query('SELECT state_key,payload,updated_at FROM crewcheck_telegram_state ORDER BY state_key');assert.deepEqual(after,before);
    const preferences={enabled:true,mode:'auto',preferredTime:'10:30',quietStart:'22:00',quietEnd:'08:00',timezone:'UTC',channels:{all:true,individual:{mobilePwa:false,watch:true,crewCierge:false}}};
    const attempts=['first_request','second_request'].map(requestId=>({action:'save-preferences',expectedRevision:0,requestId,preferences}));
    const results=await Promise.all(attempts.map(invoke));assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
    const winning=attempts[results.findIndex(result=>result.status===200)];assert.equal((await invoke(winning)).data.revision,1);
    const updated=await invoke({...winning,requestId:'toggle_all_off',expectedRevision:1,preferences:{...preferences,mode:'manual',channels:{...preferences.channels,all:false}}});
    assert.equal(updated.status,200);assert.deepEqual(updated.data.preferences.channels.individual,preferences.channels.individual);assert.equal(updated.data.preferences.preferredTime,'10:30');assert(updated.data.channelStates.every(channel=>channel.deliveryAllowed===false&&channel.received===null));
    assert.equal((await invoke({action:'already-did',requestId:'forged_receipt',expectedRevision:2,confirmed:true,contextKey:'fake',campaign:{verified:true}})).status,409);
    await db.query('UPDATE crewcheck_platform_profiles SET public_id=? WHERE email=?',['recreated-BIDS-owner',email]);
    assert.equal((await invoke()).status,401,'stale GET rejected by current SQL owner binding');
    assert.equal((await invoke({...winning,requestId:'stale_write',expectedRevision:2})).status,401);
    await db.query('UPDATE crewcheck_platform_profiles SET public_id=? WHERE email=?',[owner,email]);
  });

  await run('CrewCheck push registry SQL locks account/endpoint, isolates owners and revokes without browser subscription',async()=>{
    const subscription={endpoint:'https://fcm.googleapis.com/synthetic-endpoint',keys:{p256dh:Buffer.from('046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5','hex').toString('base64url'),auth:Buffer.alloc(16,3).toString('base64url')}};
    const input={identity:{email,ownerId:'fictional-owner'},installationId:'device_fixture_1',expectedRevision:0,action:'subscribe',consent:true,subscription,key:Buffer.alloc(32,1),now:Date.parse('2026-10-11T09:00:00Z')};
    const [profile]=await db.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=?',[email]);input.identity.ownerId=profile[0].public_id;
    const concurrent=await Promise.allSettled([mutateInstallation(db,input),mutateInstallation(db,input)]);
    assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1);assert.equal(concurrent.find(result=>result.status==='rejected').reason.status,409);
    const stateKey=installationStateKey(subscription.endpoint),[rows]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[stateKey]);
    assert(!JSON.stringify(rows[0].payload).includes(subscription.endpoint));
    await assert.rejects(mutateInstallation(db,{...input,expectedRevision:1,identity:{email,ownerId:'stale_owner'}}),error=>error.status===401);
    const now=input.now,envelope={schema:'crewcheck-notice-v1',ownerId:input.identity.ownerId,installationId:input.installationId,consentRevision:1,eventKey:'persistent_fixture_1',expiresAt:new Date(now+60000).toISOString(),route:'/app'},config={enabled:true,configured:true,encryptionKey:input.key};
    const verifyContext=async()=>true,jobInput={email,installationKey:stateKey,envelope,scheduledAt:new Date(now).toISOString(),sourceContext:{preferencesRevision:1}};
    assert.equal((await enqueueCrewCheckPush(db,jobInput,{verifyContext,clock:()=>now})).status,'queued');
    const select=async value=>(await db.query('SELECT state_key,payload FROM crewcheck_telegram_state WHERE state_key=?',[outboxKey(value)]))[0][0];
    let sends=0;const send=async()=>{sends++;return{status:'accepted_unconfirmed',received:null};};
    const dispatches=await Promise.all([dispatchPersistentPush(db,await select(envelope),{configuration:config,verifyContext,clock:()=>now,send}),dispatchPersistentPush(db,await select(envelope),{configuration:config,verifyContext,clock:()=>now,send})]);assert.equal(sends,1);assert(dispatches.every(value=>['dispatching','accepted_unconfirmed'].includes(value.status)&&value.received===null));assert(dispatches.some(value=>value.status==='accepted_unconfirmed'));const finalDispatch=await select(envelope);const finalJob=typeof finalDispatch.payload==='string'?JSON.parse(finalDispatch.payload):finalDispatch.payload;assert.equal(finalJob.status,'accepted_unconfirmed');assert.equal(finalJob.received,null);
    const report={envelope,status:'display_api_resolved'};assert.equal((await reconcilePushReceipts(db,input.identity,[report])).reconciled,1);assert.equal((await reconcilePushReceipts(db,input.identity,[report])).reconciled,0);
    const unknown={...envelope,eventKey:'persistent_unknown_1'};await enqueueCrewCheckPush(db,{...jobInput,envelope:unknown},{verifyContext,clock:()=>now});const unknownSelected=await select(unknown);
    const throwing=async()=>{sends++;throw Error('ambiguous mock');};assert.equal((await dispatchPersistentPush(db,unknownSelected,{configuration:config,verifyContext,clock:()=>now,send:throwing})).status,'uncertain');await dispatchPersistentPush(db,unknownSelected,{configuration:config,verifyContext,clock:()=>now,send:throwing});assert.equal(sends,2);
    const late={...envelope,eventKey:'persistent_late_1'};await enqueueCrewCheckPush(db,{...jobInput,envelope:late},{verifyContext,clock:()=>now});let instant=now,checks=0;const advances=async()=>{checks++;if(checks===2)instant=now+60000;return true;};assert.equal((await dispatchPersistentPush(db,await select(late),{configuration:config,verifyContext:advances,clock:()=>instant,send})).status,'cancelled');assert.equal(sends,2,'expired between persistent claim and send never sends');
    assert.equal((await revokeAccountInstallations(db,input.identity,'other_device',input.now)).revoked,0);
    assert.equal((await revokeAccountInstallations(db,input.identity,input.installationId,input.now)).revoked,1);
    assert.equal((await revokeAccountInstallations(db,input.identity,input.installationId,input.now)).revoked,0);
    const [after]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[stateKey]);const state=typeof after[0].payload==='string'?JSON.parse(after[0].payload):after[0].payload;assert.equal(state.active,false);assert.equal(state.sealed,null);
    const replacement={...subscription,endpoint:'https://fcm.googleapis.com/synthetic-replacement'};const reactivated=await mutateInstallation(db,{...input,expectedRevision:2,subscription:replacement});assert.equal(reactivated.active,true);assert.equal(reactivated.revision,3);await revokeAccountInstallations(db,input.identity,input.installationId,input.now);
  });

  await run('strict MySQL reproduces rejected ISO heartbeat and persists corrected writer across restart/timezone',async()=>{
    const source=fs.readFileSync('server/telegram-fast-ack.mjs','utf8');
    const table=source.match(/await db\.query\(`(CREATE TABLE IF NOT EXISTS crewcheck_scheduler_heartbeat[\s\S]*?)`\)/)[1];
    await db.query(table);await db.query('DELETE FROM crewcheck_scheduler_heartbeat');
    await assert.rejects(db.query("INSERT INTO crewcheck_scheduler_heartbeat(scheduler_key,last_started_at)VALUES('old',?)",['2026-10-09T06:24:45.799Z']),error=>error.code==='ER_TRUNCATED_WRONG_VALUE');
    const begin=source.indexOf('async function recordSchedulerHeartbeat('),end=source.indexOf('\nasync function sendInfobipPhone',begin);
    const file=path.join(os.tmpdir(),`crewcheck-mysql-heartbeat-${process.pid}.mjs`);
    try{
      fs.writeFileSync(file,`let lastHeartbeatWrite;async function ensureSchedulerHeartbeatTable(db){await db.query(${JSON.stringify(table)});} ${source.slice(begin,end)};export{recordSchedulerHeartbeat};`);
      const {recordSchedulerHeartbeat}=await import(pathToFileURL(file).href);
      const conn=await db.getConnection();
      try{
        await conn.query("SET time_zone='+03:00'");
        await recordSchedulerHeartbeat(conn,{lastStartedAt:'2026-10-09T06:24:45.799Z',lastFinishedAt:null});
        await recordSchedulerHeartbeat(conn,{lastFinishedAt:'2026-10-09T06:24:46.824Z',lastStatus:'ok',lastSummary:{selected:0}});
        const [rows]=await conn.query("SELECT ROUND(UNIX_TIMESTAMP(last_started_at)*1000) AS started,ROUND(UNIX_TIMESTAMP(last_finished_at)*1000) AS finished,last_status FROM crewcheck_scheduler_heartbeat WHERE scheduler_key='notifications'");
        assert.equal(Number(rows[0].started),Date.parse('2026-10-09T06:24:45.799Z'));assert.equal(Number(rows[0].finished),Date.parse('2026-10-09T06:24:46.824Z'));assert.equal(rows[0].last_status,'ok');
      }finally{await conn.query("SET time_zone='+00:00'");conn.release();}
    }finally{fs.rmSync(file,{force:true});}
  });
  await run('create replay cannot overwrite later opt-out or rename',async()=>{
    assert.equal((await request(base)).status,200);const id=(await list())[0].id;
    assert.equal((await request({...base,notifyOpen:false,notifyLastDay:false},id)).status,200);
    assert.equal((await request(base)).status,409);
    assert.equal((await list())[0].notify_open,0);
    await request({...base,title:'Renamed',notifyOpen:false,notifyLastDay:false},id);
    assert.equal((await request(base)).status,409);assert.equal((await list())[0].title,'Renamed');
    await request({},id,'DELETE');assert.equal((await request(base)).status,409);assert.equal((await list()).length,0);
  });
  await run('concurrent creation deduplicates one stable ID',async()=>{
    const body={...base,creationKey:'concurrent'};
    const responses=await Promise.all(Array.from({length:8},()=>request(body)));
    assert(responses.every(r=>r.status===200));assert.equal((await list()).length,1);
  });
  await run('two workers claim one BIDS send; provider acceptance is not delivery',async()=>{
    const rows=await list();let sends=0;
    const options={now:new Date('2026-10-11T12:00:00Z'),findLink:async()=>({chatId:'fictional'}),send:async()=>{sends++;return {ok:true}}};
    const results=await Promise.all([notifyBidRows(db,rows,options),notifyBidRows(db,rows,options)]);
    assert.equal(sends,1);assert.equal(results.flat().length,1);assert.equal(results.flat()[0].delivered,null);
  });
  await run('stale selection after edit or deletion cannot dispatch',async()=>{
    const selected=(await list())[0];await request({...base,title:'Edited',creationKey:'concurrent'},selected.id);
    assert.equal(await claimBid(db,selected,new Date('2026-10-11T12:00:00Z')),null);
    await request({},selected.id,'DELETE');assert.equal(await claimBid(db,selected,new Date('2026-10-11T12:00:00Z')),null);
  });
  await run('unknown outcome is held across retries',async()=>{
    await request({...base,creationKey:'unknown'});const rows=await list();let sends=0;
    const options={now:new Date('2026-10-11T12:00:00Z'),findLink:async()=>({chatId:'fictional'}),send:async()=>{sends++;throw new Error('fictional timeout')}};
    await notifyBidRows(db,rows,options);await notifyBidRows(db,rows,options);assert.equal(sends,1);
    const response=await request({},'', 'GET');
    assert.equal(response.body.windows.find(window=>window.id===rows[0].id).openDispatchStatus,'uncertain');
  });
  await run('BIDS requires canonical current-owner link and checks revocation before claim',async()=>{
    await request({...base,creationKey:'binding',title:'Binding fixture'});
    const row=(await list()).find(r=>r.title==='Binding fixture');let sends=0;
    const options={now:new Date('2026-10-11T12:00:00Z'),send:async()=>{sends++;return {ok:true}}};
    await db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3))',[`profile:${email}`,JSON.stringify({email,chatId:'legacy-fictional'})]);
    await notifyBidRows(db,[row],options);assert.equal(sends,0,'legacy profile is not a canonical binding');
    assert.equal(await claimBid(db,row,options.now,{expectedLink:{chatId:'old'},findLink:async()=>({chatId:'new'})}),null);
    await db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3))',[`link-email:${email}`,JSON.stringify({email,chatId:'canonical-fictional',linkedAt:'2026-10-01T00:00:00Z',code:'fictional'})]);
    await notifyBidRows(db,[row],options);assert.equal(sends,1);
    const response=await request({},'', 'GET');
    assert.equal(response.body.windows.find(window=>window.id===row.id).openDispatchStatus,'accepted');
  });
  await run('confirmation is persistent, idempotent and cancels every server channel only for owner/cycle',async()=>{
    const prefix=cycleJobPrefix(LEAVE_CYCLE), now=new Date();
    for(const channel of ['telegram','telegram-call','phone-call','telegram+phone-call']) await db.query("INSERT INTO crewcheck_notification_jobs(email,job_key,scheduled_at,channel,message,status) VALUES(?,?,?,?,'fictional','pending')",[email,prefix+channel,now,channel]);
    await db.query("INSERT INTO crewcheck_notification_jobs(email,job_key,scheduled_at,channel,message,status) VALUES(?,?,?,'telegram','fictional','pending')",['other@example.test',prefix+'other',now]);
    const first=await confirmCycle(db,email,owner,LEAVE_CYCLE);assert.equal(first.cancelled,4);
    const second=await confirmCycle(db,email,owner,LEAVE_CYCLE);assert.equal(second.cancelled,0);assert.equal(first.submittedAt,second.submittedAt);
    assert.equal((await db.query('SELECT status FROM crewcheck_notification_jobs WHERE email=?',['other@example.test']))[0][0].status,'pending');
    const payload=(await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[cycleStateKey(email,LEAVE_CYCLE)]))[0][0].payload;
    assert.equal((typeof payload==='string'?JSON.parse(payload):payload).submitted,true);
    await assert.rejects(confirmCycle(db,email,'wrong-owner',LEAVE_CYCLE),e=>e.status===401);
    await assert.rejects(confirmCycle(db,email,owner,'new-invented-edition'),e=>e.status===400);
  });
  await run('dispatch/confirmation cutoff race never reports an accepted message cancelled',async()=>{
    const prefix=cycleJobPrefix(LEAVE_CYCLE), key=cycleStateKey(email,LEAVE_CYCLE), now=Date.now();
    await db.query('UPDATE crewcheck_telegram_state SET payload=? WHERE state_key=?',[JSON.stringify({email,ownerId:owner,cycle:LEAVE_CYCLE,submitted:false,schedulingAllowed:true}),key]);
    await db.query("INSERT INTO crewcheck_notification_jobs(email,job_key,scheduled_at,channel,chat_id,message,status,locked_at,attempts) VALUES(?,?,?,'telegram','fictional','fictional','processing',NOW(3),1)",[email,prefix+'race',new Date(now)]);
    const job=(await db.query('SELECT * FROM crewcheck_notification_jobs WHERE job_key=?',[prefix+'race']))[0][0];let sends=0;
    const [dispatch,confirmation]=await Promise.all([dispatchClaimedJob(db,job,{now,findLink:async()=>({chatId:'fictional'}),deliver:async()=>{sends++;return {ok:true,uncertain:false}}}),confirmCycle(db,email,owner,LEAVE_CYCLE)]);
    if(sends){assert.equal(dispatch.status,'sent');assert.equal(confirmation.inFlight,true);}else assert(['cancelled','skipped'].includes(dispatch.status));
    assert.equal((await db.query('SELECT status FROM crewcheck_notification_jobs WHERE id=?',[job.id]))[0][0].status,sends?'sent':'cancelled');
  });
  await run('held free-day SQL persists consent/reference, serializes duplicates and revocation, never dispatches',async()=>{
    await db.query('CREATE TABLE IF NOT EXISTS crewcheck_platform_rosters(id VARCHAR(80) PRIMARY KEY,owner_email VARCHAR(190),roster JSON NOT NULL,active BOOLEAN NOT NULL) ENGINE=InnoDB');
    await db.query('DELETE FROM crewcheck_platform_rosters');
    const roster=clock=>({year:2026,month:8,crewId:'900001',base:'BSB',days:[12,13,14].map(n=>({date:n+'/08/2026',type:n===12?'DO':'DR',legs:[],freeDayStartEvidence:{date:n+'/08/2026',code:n===12?'DO':'DR',clock,clockSource:'published',timeZoneSource:'published',utcOffsetMinutes:-180,origin:'AIMS published rest tokens',tokenExcerpt:(n===12?'DO':'DR')+' '+clock+' BSB'}}))});
    await db.query('INSERT INTO crewcheck_platform_rosters VALUES(?,?,?,TRUE)',['held-source',email,JSON.stringify(roster('01:46'))]);
    await db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload)',['link-email:'+email,JSON.stringify({email,chatId:'fictional-held-chat',linkedAt:new Date().toISOString(),code:'synthetic-code'})]);
    const user={email,id:owner},now=Date.now(),request=(action,expectedRevision,extra={})=>mutateFreeDayHeld(db,user,{scope:FREE_DAY_SCOPE,action,expectedRevision,...extra},{now,configured:true});
    assert.equal((await request('grant',0)).revision,1);
    assert.equal((await readFreeDayHeldState(db,user,{now,configured:true})).consent,true);
    assert.equal((await request('reference',1,{sourceId:'held-source'})).revision,2);
    const shifted=roster('08:30');const extra=structuredClone(shifted.days[0]);extra.date='11/08/2026';extra.freeDayStartEvidence.date=extra.date;shifted.days.unshift(extra);
    await db.query('UPDATE crewcheck_platform_rosters SET roster=? WHERE id=?',[JSON.stringify(shifted),'held-source']);
    await assert.rejects(request('prepare',2,{sourceId:'held-source',sequenceDate:'2026-08-12'}),error=>error.code==='SEQUENCE_CORRESPONDENCE_PENDING');
    assert.equal((await db.query("SELECT COUNT(*) AS n FROM crewcheck_notification_jobs WHERE email=? AND LEFT(job_key,9)='free-day:'",[email]))[0][0].n,0);
    await db.query('UPDATE crewcheck_platform_rosters SET roster=? WHERE id=?',[JSON.stringify(roster('08:30')),'held-source']);
    const held=await Promise.all(Array.from({length:8},()=>request('prepare',2,{sourceId:'held-source',sequenceDate:'2026-08-12'})));
    assert.equal(new Set(held.map(x=>x.jobKey)).size,1);assert.equal(held.filter(x=>!x.duplicate).length,1);assert.equal(held[0].delayMinutes,404);assert.equal(held[0].sourceVerified,false);
    const [rows]=await db.query('SELECT * FROM crewcheck_notification_jobs WHERE email=? AND job_key=?',[email,held[0].jobKey]);assert.equal(rows.length,1);assert.equal(rows[0].status,'held');assert.equal(rows[0].chat_id,null);
    assert.equal((await db.query("SELECT COUNT(*) AS n FROM crewcheck_notification_jobs WHERE job_key=? AND status='pending'",[held[0].jobKey]))[0][0].n,0);
    await db.query("UPDATE crewcheck_notification_jobs SET status='processing',locked_at=NOW(3) WHERE job_key=?",[held[0].jobKey]);let deliveries=0;
    assert.equal((await dispatchClaimedJob(db,rows[0],{deliver:async()=>{deliveries++;return{ok:true};}})).status,'cancelled');assert.equal(deliveries,0);
    const [revocation,replay]=await Promise.allSettled([request('revoke',2),request('prepare',2,{sourceId:'held-source',sequenceDate:'2026-08-12'})]);
    assert.equal(revocation.status,'fulfilled');if(replay.status==='fulfilled')assert.equal(replay.value.status,'cancelled');else assert.equal(replay.reason.code,'CONSENT_REVISION_CHANGED');
    assert.equal((await readFreeDayHeldState(db,user,{now})).consent,false);
  });
  await run('voluntary two-version receipts preserve owner/consent/404min and revocation in both InnoDB lock orders',async()=>{
    const user={email,id:owner};
    const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
    const receipt=clock=>({identityDigest:digest(['900001','BSB']),period:'2026-08',documentHash:digest(clock),starts:[12,13,14].map(d=>({date:`2026-08-${d}`,clock,offset:-180,literal:true}))});
    const body={scope:SOURCE_SCOPE,action:'review',expectedRevision:0,before:receipt('01:46'),after:receipt('08:30'),sequenceDate:'2026-08-12',confirmed:true,consent:true};
    const counts=()=>db.query('SELECT COUNT(*) AS n FROM crewcheck_notification_jobs');
    const beforeCount=(await counts())[0][0].n;
    const results=await Promise.allSettled(Array.from({length:8},()=>voluntarySources(db,user,body)));
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    const result=results.find(x=>x.status==='fulfilled').value;assert.equal(result.review.delayMinutes,404);assert.equal(result.review.possibleAmount,null);assert.equal(result.officialVerified,false);
    assert.equal((await voluntarySources(db,user,{...body,expectedRevision:1})).duplicate,true);
    await db.query('UPDATE crewcheck_platform_rosters SET roster=? WHERE owner_email=?',[JSON.stringify({crewId:'900001',base:'BSB',days:[]}),email]);
    assert.equal((await voluntarySources(db,user)).review.before.starts[0].clock,'01:46');
    const readPersisted=async()=>{const payload=(await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[sourceKey(user)]))[0][0].payload;return typeof payload==='string'?JSON.parse(payload):payload;};
    const initialState=await readPersisted();
    const revokedState=async()=>{
      const stored=await readPersisted(),publicState=await voluntarySources(db,user);
      assert.equal(stored.revision,2);assert.equal(stored.consent,false);
      assert.equal(Object.hasOwn(stored,'review'),false);
      assert.equal(publicState.revision,2);assert.equal(publicState.consent,false);
      assert.equal(publicState.review,null);assert.equal(publicState.dispatchAllowed,false);
    };
    const restoreReview=()=>db.query('UPDATE crewcheck_telegram_state SET payload=? WHERE state_key=?',[JSON.stringify(initialState),sourceKey(user)]);
    // Hold the first operation's real InnoDB owner lock while the second submits
    // its lock query. Promise array position alone does not define acquisition order.
    for(const replayFirst of [true,false]){
      await restoreReview();
      let firstLocked,releaseFirst,secondSubmitted,secondAcquired=false;
      const held=new Promise(resolve=>{firstLocked=resolve;});
      const release=new Promise(resolve=>{releaseFirst=resolve;});
      const submitted=new Promise(resolve=>{secondSubmitted=resolve;});
      const gatedDb=first=>({async getConnection(){
        const c=await db.getConnection();
        return {
          beginTransaction:()=>c.beginTransaction(),commit:()=>c.commit(),
          rollback:()=>c.rollback(),release:()=>c.release(),
          async query(sql,values){
            const ownerLock=sql.includes('crewcheck_platform_profiles')&&sql.includes('FOR UPDATE')&&values?.[0]===email;
            const result=c.query(sql,values);
            if(ownerLock&&!first)secondSubmitted();
            const rows=await result;
            if(ownerLock){if(first){firstLocked();await release;}else secondAcquired=true;}
            return rows;
          },
        };
      }});
      const revokeBody={scope:SOURCE_SCOPE,action:'revoke',expectedRevision:1},replayBody={...body,expectedRevision:1};
      const first=voluntarySources(gatedDb(true),user,replayFirst?replayBody:revokeBody);
      // Attach rejection handlers immediately; do not replace the operation outcomes.
      const firstOutcome=Promise.allSettled([first]);
      await held;
      const second=voluntarySources(gatedDb(false),user,replayFirst?revokeBody:replayBody);
      const secondOutcome=Promise.allSettled([second]);
      try{await submitted;assert.equal(secondAcquired,false);}finally{releaseFirst();}
      const [[firstResult],[secondResult]]=await Promise.all([firstOutcome,secondOutcome]);
      const revoked=replayFirst?secondResult:firstResult,replay=replayFirst?firstResult:secondResult;
      assert.equal(revoked.status,'fulfilled');
      if(replayFirst){assert.equal(replay.status,'fulfilled');assert.equal(replay.value.duplicate,true);}
      else{assert.equal(replay.status,'rejected');assert.equal(replay.reason.code,'SOURCE_REVISION_CHANGED');}
      assert.equal(secondAcquired,true);
      await revokedState();
    }
    // Keep the unconstrained race too, accepting only the two proven outcomes.
    await restoreReview();
    const [revoked,replay]=await Promise.allSettled([voluntarySources(db,user,{scope:SOURCE_SCOPE,action:'revoke',expectedRevision:1}),voluntarySources(db,user,{...body,expectedRevision:1})]);
    assert.equal(revoked.status,'fulfilled');
    if(replay.status==='fulfilled')assert.equal(replay.value.duplicate,true);
    else assert.equal(replay.reason.code,'SOURCE_REVISION_CHANGED');
    await revokedState();
    const ttlSaved=await voluntarySources(db,user,{...body,expectedRevision:2});
    const expiredNow=Date.parse(ttlSaved.expiresAt)+1;
    await assert.rejects(voluntarySources(db,user,{...body,expectedRevision:2},{now:expiredNow}),error=>error.code==='SOURCE_REVISION_CHANGED');
    let persisted=await readPersisted();
    assert.equal(persisted.revision,3);assert.equal(persisted.consent,true);assert.ok(persisted.review);
    const ttlAgain=await voluntarySources(db,user,{...body,expectedRevision:3},{now:expiredNow});
    const revokedExpired=await voluntarySources(db,user,{scope:SOURCE_SCOPE,action:'revoke',expectedRevision:4},{now:Date.parse(ttlAgain.expiresAt)+1});
    assert.equal(revokedExpired.revision,5);assert.equal(revokedExpired.consent,false);
    persisted=await readPersisted();
    assert.equal(persisted.review,undefined);assert.equal(persisted.consent,false);
    assert.equal((await counts())[0][0].n,beforeCount,'voluntary source flow never writes queue');
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM crewcheck_telegram_state WHERE state_key=?',[sourceKey(user)]))[0][0].n,1);
  });
  await run('confirmed receipt producer and fixed local transport work without app in real SQL; TTL/revoke/link rotation cancel and delete metadata',async()=>{
    const user={email,id:owner},now=Date.now(),digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
    await db.query('DELETE FROM crewcheck_telegram_state WHERE state_key=?',[sourceKey(user)]);
    const receipt=clock=>({identityDigest:digest(['900001','BSB']),period:'2026-08',documentHash:digest(clock),starts:[12,13,14].map(d=>({date:`2026-08-${d}`,clock,offset:-180,literal:true}))});
    const body={scope:SOURCE_SCOPE,action:'review',expectedRevision:0,before:receipt('01:46'),after:receipt('08:30'),sequenceDate:'2026-08-12',confirmed:true,consent:true};
    const link={email,chatId:'9000012345',username:'synthetic_crew',linkedAt:new Date(now-1000).toISOString(),code:'synthetic-queue-link'};
    const saveLink=async()=>{for(const key of ['link-email:'+email,'link-chat:'+link.chatId])await db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload)',[key,JSON.stringify(link)]);};await saveLink();
    const saved=await voluntarySources(db,user,body,{now});
    const request={scope:SOURCE_JOB_SCOPE,action:'prepare',expectedRevision:1};
    assert.equal(saved.queuePreparation.prepared,true,'confirmation atomically reserves held');
    const results=await Promise.all(Array.from({length:8},()=>sourceQueue(db,user,request,{now})));assert.equal(results.filter(x=>!x.duplicate).length,0);
    const key=results[0].job.jobKey;assert.equal(results[0].delayMinutes,404);assert.equal(results[0].destination.label,'@synthetic_crew · chat ••••2345');assert.equal(results[0].realConsent,false);assert.equal(results[0].sourceVerified,false);
    const personalOptions={now,configuration:{offerEnabled:true,ownerIds:[user.id]}},offer=await personalConsent(db,user,null,personalOptions);
    assert.equal(offer.available,true);assert.equal((await personalConsent(db,user,null,{now})).available,false);
    const grant={scope:PERSONAL_SCOPE,action:'grant',context:offer.context,expectedRevision:offer.revision,confirmed:true,textVersion:offer.textVersion};
    const grants=await Promise.all(Array.from({length:8},()=>personalConsent(db,user,grant,personalOptions)));assert.equal(grants.filter(x=>!x.duplicate).length,1);assert.equal(grants[0].consent,true);
    const personalFresh=mysql.createPool({socketPath,user:'root',password:'',database:'crewcheck_notification_qa',connectionLimit:2});try{assert.equal((await personalConsent(personalFresh,user,null,personalOptions)).consent,true);}finally{await personalFresh.end();}
    const revokes=await Promise.all(Array.from({length:8},()=>personalConsent(db,user,{scope:PERSONAL_SCOPE,action:'revoke',context:offer.context,expectedRevision:grants[0].revision},{now})));assert.equal(revokes.filter(x=>!x.duplicate).length,1);assert.equal(revokes[0].consent,false);
    await assert.rejects(personalConsent(db,user,grant,personalOptions),{code:'PERSONAL_REVISION_CHANGED'});
    const faultDb={getConnection:async()=>{const c=await db.getConnection(),query=c.query.bind(c);c.query=async(sql,args)=>{if(sql.startsWith('INSERT INTO crewcheck_telegram_state') && JSON.parse(args[1]).personalConsent)throw Error('synthetic SQL audit failure');return query(sql,args);};const release=c.release.bind(c);c.release=()=>{c.query=query;c.release=release;release();};return c;}};
    const beforeFault=await personalConsent(db,user,null,personalOptions);await assert.rejects(personalConsent(faultDb,user,{...grant,expectedRevision:beforeFault.revision},personalOptions),/SQL audit failure/);assert.equal((await personalConsent(db,user,null,personalOptions)).consent,false);

    const sqlSnapshot=async()=>JSON.stringify({state:(await db.query('SELECT state_key,payload,updated_at FROM crewcheck_telegram_state ORDER BY state_key'))[0],jobs:(await db.query('SELECT * FROM crewcheck_notification_jobs ORDER BY id'))[0]});
    for(const condition of ['expired','missing-reverse','pending','processing','cancelled','sent']) {
      if(condition==='missing-reverse')await db.query('DELETE FROM crewcheck_telegram_state WHERE state_key=?',['link-chat:'+link.chatId]);
      if(['pending','processing','cancelled','sent'].includes(condition))await db.query('UPDATE crewcheck_notification_jobs SET status=? WHERE email=? AND job_key=?',[condition,email,key]);
      const observedNow=condition==='expired'?Date.parse(saved.expiresAt)+1:now,beforeRead=await sqlSnapshot();
      const personalRead=await personalConsent(db,user,null,{now:observedNow});await voluntarySources(db,user,null,{now:observedNow});await sourceQueue(db,user,null,{now:observedNow});await simulatedWorker(db,user,null,{now:observedNow});assert.equal(personalRead.consent,false);assert.equal(personalRead.available,false);assert.equal(await sqlSnapshot(),beforeRead,'actual SQL GET preserves all rows/jobs '+condition);
      await assert.rejects(personalConsent(db,user,{scope:PERSONAL_SCOPE,action:'grant',context:personalRead.context,expectedRevision:personalRead.revision,confirmed:true,textVersion:personalRead.textVersion},{...personalOptions,now:observedNow}),{code:'CONSENT_CONTEXT_CHANGED'});assert.equal(await sqlSnapshot(),beforeRead,'rejected grant preserves SQL '+condition);
      if(condition==='missing-reverse')await saveLink();
      if(['pending','processing','cancelled','sent'].includes(condition))await db.query('UPDATE crewcheck_notification_jobs SET status=? WHERE email=? AND job_key=?',['held',email,key]);
    }
    const reoffer=await personalConsent(db,user,null,personalOptions);await personalConsent(db,user,{...grant,context:reoffer.context,expectedRevision:reoffer.revision},personalOptions);
    const workerOptions={now,configuration:{enabled:true,ownerIds:[user.id]}},workerStart=await simulatedWorker(db,user,null,workerOptions),workerRequest={scope:WORKER_SCOPE,action:'enqueue',context:workerStart.context,expectedPersonalRevision:workerStart.personalRevision,expectedWorkerRevision:workerStart.workerRevision};
    const pendingWorkers=await Promise.all(Array.from({length:8},()=>simulatedWorker(db,user,workerRequest,workerOptions)));assert.equal(pendingWorkers.filter(x=>!x.duplicate).length,1);
    const providerBefore=localProviderStats.calls,workerRuns=await Promise.all(Array.from({length:8},()=>simulatedWorker(db,user,{...workerRequest,action:'run',expectedWorkerRevision:pendingWorkers[0].workerRevision},workerOptions)));assert.equal(localProviderStats.calls-providerBefore,1);assert.ok(workerRuns.some(x=>x.phase==='accepted_unconfirmed'));
    const workerFresh=mysql.createPool({socketPath,user:'root',password:'',database:'crewcheck_notification_qa',connectionLimit:2});try{const durable=await simulatedWorker(workerFresh,user,null,workerOptions);assert.equal(durable.phase,'accepted_unconfirmed');assert.equal(durable.delivered,false);}finally{await workerFresh.end();}
    const simulations=await Promise.all(Array.from({length:8},()=>sourceQueue(db,user,{...request,action:'simulate',jobKey:key},{now})));assert.equal(simulations.filter(x=>!x.duplicate).length,1);assert.equal(simulations[0].simulation.simulated,true);assert.equal(simulations[0].accepted,false);assert.equal(simulations[0].delivered,false);
    const fresh=mysql.createPool({socketPath,user:'root',password:'',database:'crewcheck_notification_qa',connectionLimit:2});try{assert.equal((await sourceQueue(fresh,user,null,{now})).job.simulated,true,'persisted audit read from independent pool without a browser');}finally{await fresh.end();}
    let rows=(await db.query('SELECT status,chat_id,telegram_username,phone,message FROM crewcheck_notification_jobs WHERE email=? AND job_key=?',[email,key]))[0];assert.equal(rows.length,1);assert.equal(rows[0].status,'held');assert.equal(rows[0].chat_id,null);assert.equal(rows[0].telegram_username,null);assert.equal(rows[0].phone,null);assert.match(rows[0].message,/Segundo as versões que você enviou/);
    const expiry=Date.parse(saved.expiresAt)+1;await assert.rejects(sourceQueue(db,user,{...request,action:'simulate',jobKey:key},{now:expiry}),error=>error.code==='CONSENT_REQUIRED_OR_EXPIRED');
    assert.equal((await db.query('SELECT status FROM crewcheck_notification_jobs WHERE email=? AND job_key=?',[email,key]))[0][0].status,'held');
    await voluntarySources(db,user,{scope:SOURCE_SCOPE,action:'revoke',expectedRevision:1},{now:expiry});
    assert.equal((await db.query('SELECT status FROM crewcheck_notification_jobs WHERE email=? AND job_key=?',[email,key]))[0][0].status,'cancelled');assert.equal((await db.query('SELECT COUNT(*) AS n FROM crewcheck_telegram_state WHERE state_key=?',[sourceJobStateKey(user,key)]))[0][0].n,0);
    body.expectedRevision=2;body.after=receipt('09:30');await voluntarySources(db,user,body,{now});const next=await sourceQueue(db,user,{...request,expectedRevision:3},{now});
    const nextOffer=await personalConsent(db,user,null,personalOptions);await personalConsent(db,user,{scope:PERSONAL_SCOPE,action:'grant',context:nextOffer.context,expectedRevision:nextOffer.revision,confirmed:true,textVersion:nextOffer.textVersion},personalOptions);
    const nextWorker=await simulatedWorker(db,user,null,workerOptions),nextWorkerRequest={scope:WORKER_SCOPE,action:'enqueue',context:nextWorker.context,expectedPersonalRevision:nextWorker.personalRevision,expectedWorkerRevision:nextWorker.workerRevision};
    const workerFault=phase=>({getConnection:async()=>{const c=await db.getConnection(),query=c.query.bind(c);c.query=async(sql,args)=>{if(sql.startsWith('INSERT INTO crewcheck_telegram_state') && JSON.parse(args[1]).worker?.phase===phase)throw Error('synthetic worker SQL audit failure');return query(sql,args);};const release=c.release.bind(c);c.release=()=>{c.query=query;c.release=release;release();};return c;}});
    const beforeWorkerFault=localProviderStats.calls;await assert.rejects(simulatedWorker(workerFault('pending'),user,nextWorkerRequest,workerOptions),/worker SQL audit failure/);assert.equal((await simulatedWorker(db,user,null,workerOptions)).phase,'held');assert.equal(localProviderStats.calls,beforeWorkerFault);
    const nextPending=await simulatedWorker(db,user,nextWorkerRequest,workerOptions),runNext={...nextWorkerRequest,action:'run',expectedWorkerRevision:nextPending.workerRevision};await assert.rejects(simulatedWorker(workerFault('accepted_unconfirmed'),user,runNext,workerOptions),/worker SQL audit failure/);assert.equal(localProviderStats.calls-beforeWorkerFault,1);assert.equal((await simulatedWorker(db,user,null,workerOptions)).phase,'dispatching');assert.equal((await simulatedWorker(db,user,runNext,{...workerOptions,now:now+120000})).phase,'uncertain');assert.equal((await simulatedWorker(db,user,runNext,workerOptions)).duplicate,true);assert.equal(localProviderStats.calls-beforeWorkerFault,1,'actual SQL cutoff survives audit rollback without provider replay');
    const race=await Promise.allSettled([voluntarySources(db,user,{scope:SOURCE_SCOPE,action:'revoke',expectedRevision:3},{now}),sourceQueue(db,user,{...request,action:'simulate',expectedRevision:3,jobKey:next.job.jobKey},{now})]);assert.equal(race[0].status,'fulfilled');if(race[1].status==='fulfilled')assert.equal(race[1].value.accepted,false);else assert.equal(race[1].reason.code,'SOURCE_REVISION_CHANGED');
    assert.equal((await db.query('SELECT status FROM crewcheck_notification_jobs WHERE email=? AND job_key=?',[email,next.job.jobKey]))[0][0].status,'cancelled');
    body.expectedRevision=4;body.after=receipt('10:30');await voluntarySources(db,user,body,{now});const rotation=await sourceQueue(db,user,{...request,expectedRevision:5},{now});link.chatId='9000099999';link.code='rotated-fixture';await saveLink();
    await assert.rejects(sourceQueue(db,user,{...request,action:'simulate',expectedRevision:5,jobKey:rotation.job.jobKey},{now}),error=>error.code==='QUEUE_CONTEXT_CHANGED');assert.equal((await db.query('SELECT status FROM crewcheck_notification_jobs WHERE email=? AND job_key=?',[email,rotation.job.jobKey]))[0][0].status,'held');
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM crewcheck_telegram_state WHERE state_key=?',[sourceJobStateKey(user,rotation.job.jobKey)]))[0][0].n,1);
    await voluntarySources(db,user,{scope:SOURCE_SCOPE,action:'revoke',expectedRevision:5},{now});
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM crewcheck_telegram_state WHERE state_key=?',[sourceJobStateKey(user,rotation.job.jobKey)]))[0][0].n,0,'explicit revoke removes drifted metadata');
    assert.equal((await db.query("SELECT COUNT(*) AS n FROM crewcheck_notification_jobs WHERE email=? AND LEFT(job_key,16)='free-day:source:' AND status IN ('pending','processing','dispatching','sent')",[email]))[0][0].n,0);
  });
  await run('account deletion removes owned cycle/free-day decisions, tombstones, claims and jobs',async()=>{
    await db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3))',['notification-cycle:other',JSON.stringify({email:'other@example.test'})]);
    for(const [sql,args] of notificationStateDeletionStatements(email)) await db.query(sql.replace(/\$1/g,'?'),args);
    // Existing canonical account deletion already removes ordinary link/profile keys.
    await db.query('DELETE FROM crewcheck_telegram_state WHERE state_key IN (?,?)',['link-chat:9000012345','link-chat:9000099999']);
    await db.query('DELETE FROM crewcheck_telegram_state WHERE state_key IN (?,?)',[`link-email:${email}`,`profile:${email}`]);
    assert.equal((await db.query("SELECT COUNT(*) AS n FROM crewcheck_telegram_state WHERE JSON_UNQUOTE(JSON_EXTRACT(payload,'$.email'))=?",[email]))[0][0].n,0);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM crewcheck_notification_jobs WHERE email=?',[email]))[0][0].n,0);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM crewcheck_telegram_state WHERE state_key=?',['notification-cycle:other']))[0][0].n,1);
  });
  console.log(JSON.stringify({database:'disposable mysql8.4',passed},null,2));
} finally { await db.end(); }
