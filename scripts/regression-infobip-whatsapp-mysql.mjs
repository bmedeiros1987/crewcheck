// REAL MYSQL QA: only a task-owned ephemeral Unix socket, never a shared DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {execFileSync,fork} from 'node:child_process';
import {createHash,createHmac} from 'node:crypto';
import {createInfobipSendAdmission} from '../server/infobip-whatsapp-admission.mjs';
import {createInfobipSqlBudget} from '../server/infobip-whatsapp-sql-budget.mjs';
import {createOfflineInfobipDeliveryReceiver} from '../server/infobip-whatsapp-delivery.mjs';
import {runMysqlScenarios} from './infobip-whatsapp-mysql-scenarios.mjs';
import {verifyNamespaceIsolation} from './infobip-whatsapp-mysql-scenarios.mjs';
const HEAD=process.argv[6];assert(/^[a-f0-9]{40}$/.test(HEAD));
const [mode,checkoutArg,socketArg,rootArg]=process.argv.slice(2);
assert(['preflight','suite','restart','engine-worker'].includes(mode));
const checkout=fs.realpathSync(checkoutArg);
assert.equal(execFileSync('git',['-C',checkout,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),HEAD);
assert.equal(execFileSync('git',['-C',checkout,'status','--porcelain'],{encoding:'utf8'}).trim(),'');
const require=createRequire(path.join(checkout,'package.json'));
const mysql=require('mysql2/promise'); // must already be available; no installation
if(mode==='preflight'){console.log('PREFLIGHT ONLY: pinned clean HEAD and existing mysql2 found');process.exit(0);}
const root=fs.realpathSync(rootArg),socket=fs.realpathSync(socketArg);
assert.equal(path.dirname(root),fs.realpathSync('/tmp'));
assert(/^crewcheck-infobip-sql\.[A-Za-z0-9]+$/.test(path.basename(root)));
assert.equal(fs.readFileSync(path.join(root,'.owned-qa'),'utf8').trim(),HEAD);
assert.equal(path.dirname(socket),root);assert(fs.statSync(socket).isSocket());
globalThis.fetch=()=>{throw Error('EXTERNAL_TRANSPORT_FORBIDDEN');};
const admin=await mysql.createConnection({socketPath:socket,user:'root',password:'',connectTimeout:2000});
const [server]=await admin.query('SELECT VERSION() AS version,@@datadir AS datadir,@@skip_networking AS no_tcp');
assert(/^8\.4\./.test(server[0].version));assert.equal(Number(server[0].no_tcp),1);
assert.equal(fs.realpathSync(server[0].datadir),path.join(root,'data'));
const database='crewcheck_infobip_qa';
if(mode==='suite')await admin.query('CREATE DATABASE crewcheck_infobip_qa');
await admin.end();
const db=mysql.createPool({socketPath:socket,user:'root',password:'',database,connectionLimit:12,dateStrings:true,timezone:'Z',connectTimeout:2000});
const load=relative=>import(pathToFileURL(path.join(checkout,relative)).href);
const {createInfobipSqlStore,createInfobipProductionStore}=await load('server/infobip-whatsapp-store.mjs');
const {createOfflineInfobipReceiver}=await load('server/infobip-whatsapp-candidate.mjs');
const {sealSubscription:seal}=await load('server/web-push/installationRegistry.mjs');
const sender='12025550100',recipient='12025550101',email='sql-synthetic@example.invalid',owner='synthetic-owner';
const key=Buffer.alloc(32,7),salt='synthetic-existing-hash-key-not-real',password='synthetic-webhook-password-not-real';
const phoneHash=createHmac('sha256',salt).update(recipient).digest('hex');
const epoch=Date.parse('2032-01-01T12:00:00.000Z');let clock=epoch;
const event={from:recipient,to:sender,integrationType:'WHATSAPP',receivedAt:'2032-01-01T12:00:00.000Z',messageId:'synthetic-restart-id',message:{type:'TEXT',text:'SYNTHETIC PRIVATE SQL QUESTION'}};
const eventKey=createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,event.messageId])).digest('hex');
const stateKey='crewcheck-infobip-inbound-v1:'+eventKey;
const packet=(item=event)=>({method:'POST',rawHeaders:['Authorization','Basic '+Buffer.from('synthetic:'+password).toString('base64')],rawBody:Buffer.from(JSON.stringify({results:[item]}))});
const make=(pool=db)=>{const store=createInfobipSqlStore({db:pool,sender,encryptionKey:key,linkHashKey:salt,now:()=>clock});return {store,receive:createOfflineInfobipReceiver({sender,username:'synthetic',password,store,now:()=>clock})};};
const read=async()=>{const [r]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[stateKey]);return typeof r[0]?.payload==='string'?JSON.parse(r[0].payload):r[0]?.payload;};
const reportEvent={...event,messageId:'synthetic-restart-reports'};
const reportKey=createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,reportEvent.messageId])).digest('hex');
const reportStateKey='crewcheck-infobip-inbound-v1:'+reportKey;
const preparingEvent={...event,messageId:'synthetic-restart-preparing'};
const preparingKey=createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,preparingEvent.messageId])).digest('hex');
const preparingStateKey='crewcheck-infobip-inbound-v1:'+preparingKey;
const report={messageId:'cc-'+reportKey,to:recipient,sentAt:new Date(epoch).toISOString(),doneAt:new Date(epoch+1000).toISOString(),status:{id:5,name:'DELIVERED_TO_HANDSET',groupId:3,groupName:'DELIVERED'}};
const seen={messageId:report.messageId,from:sender,to:recipient,sentAt:report.sentAt,seenAt:new Date(epoch+2000).toISOString()};
const reportsPacket=items=>({...packet(),rawBody:Buffer.from(JSON.stringify({results:items}))});
const receiveReports=kind=>createOfflineInfobipDeliveryReceiver({kind,username:'synthetic',password,store:make().store,now:()=>epoch+3000});
const restartAdmission=()=>createInfobipSendAdmission({id:'synthetic-engine-restart-approval',recipients:[recipient],maxAttempts:1,validFrom:epoch-1000,validUntil:epoch+60000},{sender,now:()=>epoch});
const reserveRestart=()=>createInfobipSqlBudget(db)(c=>restartAdmission().reserve(c,{sender,recipient}));
if(mode==='engine-worker'){
 const {configureWhatsAppConcierge,invokeConfiguredWhatsAppConcierge}=await load('server/whatsapp.mjs');
 let effects=0,release;const hold=new Promise(r=>release=r);
 process.once('message',message=>{assert.equal(message,'release');release();});
 configureWhatsAppConcierge(async()=>{process.send({phase:'entered'});await hold;
   await db.query('UPDATE crewcheck_platform_profiles SET created_at=NOW(3) WHERE email=?',[email]);effects++;return 'SYNTHETIC';});
 const store=createInfobipProductionStore({db,sender,encryptionKey:key,linkHashKey:salt,now:()=>epoch},
  {concierge:invokeConfiguredWhatsAppConcierge,send:async()=>assert.fail('revoked worker must not send'),
   admission:createInfobipSendAdmission({id:'synthetic-multiprocess',recipients:[recipient],maxAttempts:1,validFrom:epoch-1000,validUntil:epoch+60000},{sender,now:()=>epoch})});
 const result=await store.dispatch(eventKey);await db.end();process.send({phase:'done',status:result.status,effects});process.disconnect();process.exit(0);
}
const passed=[];const run=async(name,fn)=>{await fn();passed.push(name);};
const timeout=setTimeout(()=>{console.error('FAIL bounded synthetic SQL suite');process.exit(1);},45000);
try{
 if(mode==='restart'){
   assert.equal((await make().receive(packet())).duplicates,1);assert.equal((await read()).status,'held');
   const hmacBody=Buffer.from(JSON.stringify({results:[event]})),hmacKey='synthetic-hmac-after-engine-restart';
   const hmacReceive=createOfflineInfobipReceiver({sender,authentication:{mode:'hmac-sha256',secretKey:hmacKey},store:make().store,now:()=>clock});
   assert.equal((await hmacReceive({method:'POST',rawHeaders:['x-hub-signature','SHA256='+createHmac('sha256',hmacKey).update(hmacBody).digest('hex')],rawBody:hmacBody})).duplicates,1);
   const [[persisted]]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[reportStateKey]);
   const projected=typeof persisted.payload==='string'?JSON.parse(persisted.payload):persisted.payload;
   assert.equal(projected.status,'delivered');assert.equal(projected.report.seenAt,epoch+2000);
   assert.equal((await receiveReports('delivery')(reportsPacket([report]))).duplicates,1);
   assert.equal((await receiveReports('seen')(reportsPacket([seen]))).duplicates,1);
   assert.equal(await reserveRestart(),false,'actual engine restart never resets quantity admission');
   const production=createInfobipProductionStore({db,sender,encryptionKey:key,linkHashKey:salt,now:()=>epoch},
     {admission:restartAdmission(),concierge:async()=>assert.fail('NO_ENGINE_RETRY'),send:async()=>assert.fail('NO_PROVIDER_RETRY')});
   assert.equal((await production.dispatch(preparingKey)).status,'preparing','preparing marker survives restart without retry');
   const {eraseWhatsAppAccountState}=await load('server/whatsapp-lifecycle.mjs');
   await assert.rejects(eraseWhatsAppAccountState(email,{db}));
   clock=epoch+12*24*3600000;await make().store.maintain();await make().store.maintain();
   const [[fence]]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[preparingStateKey]);
   const active=typeof fence.payload==='string'?JSON.parse(fence.payload):fence.payload;assert.equal(active.engineActive,true);assert.equal(active.sealed,null);
   await assert.rejects(eraseWhatsAppAccountState(email,{db}));
   console.log(JSON.stringify({head:HEAD,phase:'restart' ,passed:['real engine restart retained claim','HMAC after engine restart uses same durable claim','delivery and seen receipts and projections survive actual engine restart','production quantity reservation survives actual engine restart','preparing marker prevents engine/provider retry after restart','active engine fence survives restart and expired-content cleanup without permitting erasure'],externalCalls:0}));
 }else{
   await db.query('CREATE TABLE crewcheck_telegram_state(state_key VARCHAR(255) PRIMARY KEY,payload JSON NOT NULL,updated_at DATETIME(3) NOT NULL) ENGINE=InnoDB');
   await db.query('CREATE TABLE crewcheck_platform_profiles(email VARCHAR(254) PRIMARY KEY,public_id VARCHAR(64),created_at DATETIME(3) NOT NULL) ENGINE=InnoDB');
   const source=fs.readFileSync(path.join(checkout,'server/whatsapp.mjs'),'utf8');
   const ddl=source.match(/CREATE TABLE IF NOT EXISTS crewcheck_whatsapp_links \([\s\S]*?COLLATE=utf8mb4_unicode_ci/)[0];
   await db.query(ddl);
   await db.query(source.match(/CREATE TABLE IF NOT EXISTS crewcheck_whatsapp_link_codes \([\s\S]*?COLLATE=utf8mb4_unicode_ci/)[0]);
   const reset=async()=>{
     clock=epoch;await db.query('DELETE FROM crewcheck_whatsapp_link_codes');await db.query('DELETE FROM crewcheck_telegram_state');await db.query('DELETE FROM crewcheck_whatsapp_links');await db.query('DELETE FROM crewcheck_platform_profiles');
     await db.query('INSERT INTO crewcheck_platform_profiles VALUES(?,?,?)',[email,owner,'2031-12-31 12:00:00.000']);
     await db.query('INSERT INTO crewcheck_whatsapp_links(email,phone_hash,phone_cipher,consent_concierge,linked_at,revoked_at,updated_at) VALUES(?,?,?,1,?,NULL,?)',[email,phoneHash,'SYNTHETIC ONLY','2031-12-31 12:00:00.000','2031-12-31 12:00:00.000']);
   };
   await run('four existing schema slices use InnoDB',async()=>{const [r]=await db.query('SELECT ENGINE FROM information_schema.tables WHERE table_schema=?',[database]);assert.equal(r.length,4);assert(r.every(t=>t.ENGINE==='InnoDB'));});
   await reset();
   await run('canonical handshake commits link and receipt without confirmation job',async()=>{
     await db.query('DELETE FROM crewcheck_whatsapp_links');
     const code='123456',codeHash=createHmac('sha256',salt).update('crewcheck-whatsapp-link|'+code).digest('hex');
     await db.query('INSERT INTO crewcheck_whatsapp_link_codes(email,code_hash,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 10 MINUTE))',[email,codeHash]);
     const store=make().store;
     const receiver=()=>createOfflineInfobipReceiver({sender,authentication:{mode:'hmac-sha256',secretKey:password},store,now:()=>clock,queueLinkConfirmation:false});
     const item={...event,messageId:'synthetic-link-handshake',message:{type:'TEXT',text:code}};
     const rawBody=Buffer.from(JSON.stringify({results:[item]}));
     const signed={method:'POST',rawBody,rawHeaders:['X-Hub-Signature','SHA256='+createHmac('sha256',password).update(rawBody).digest('hex')]};
     const outcomes=await Promise.all(Array.from({length:8},()=>receiver()(signed)));
     assert(outcomes.every(x=>x.status===200));assert.equal(outcomes.reduce((n,x)=>n+x.linked,0),1);assert.equal(outcomes.reduce((n,x)=>n+x.duplicates,0),7);
     const [[link]]=await db.query('SELECT consent_concierge,consent_alerts FROM crewcheck_whatsapp_links WHERE email=?',[email]);
     assert.equal(Number(link.consent_concierge),1);assert.equal(Number(link.consent_alerts),0);
     const [[pending]]=await db.query('SELECT COUNT(*) AS n FROM crewcheck_whatsapp_link_codes');assert.equal(Number(pending.n),0);
     const [states]=await db.query('SELECT payload FROM crewcheck_telegram_state');
     assert(!states.some(row=>JSON.parse(typeof row.payload==='string'?row.payload:JSON.stringify(row.payload)).status==='held'));
     assert.equal((await receiver()(signed)).duplicates,1,'recreated receiver must ACK the committed claim');
   });
   await reset();
   await run('concurrent real SQL claim/enqueue',async()=>{const {receive}=make();const rs=await Promise.all(Array.from({length:16},()=>receive(packet())));assert(rs.every(r=>r.status===200));assert.equal(rs.reduce((n,r)=>n+r.accepted,0),1);assert.equal(rs.reduce((n,r)=>n+r.duplicates,0),15);assert.equal((await read()).status,'held');});
   await run('sealed state excludes raw synthetic identity/content',async()=>{const raw=JSON.stringify(await read());for(const x of [email,recipient,owner,event.message.text])assert(!raw.includes(x));});
   await run('binary namespace scan selects held job under real database collation',async()=>{assert.equal(await make().store.nextHeld(),eventKey);assert.equal((await make().store.maintain()).scanned,1);});
   await run('same ID changed payload fails closed',async()=>{assert.equal((await make().receive(packet({...event,message:{type:'TEXT',text:'changed'}}))).status,503);});
   await reset();
   await run('actual transaction rollback after injected enqueue failure',async()=>{
     const wrapped={getConnection:async()=>{const c=await db.getConnection();return {beginTransaction:()=>c.beginTransaction(),commit:()=>c.commit(),rollback:()=>c.rollback(),release:()=>c.release(),destroy:()=>c.destroy(),query:(sql,p)=>{if(sql.startsWith('UPDATE crewcheck_telegram_state'))throw Error('injected synthetic failure');return c.query(sql,p);}};}};
     assert.equal((await make(wrapped).receive(packet())).status,503);assert.equal(await read(),undefined);assert.equal((await make().receive(packet())).accepted,1);
   });
   await reset();
   await run('lost commit ACK injection preserves real committed claim',async()=>{
     let once=true;const wrapped={getConnection:async()=>{const c=await db.getConnection();return {beginTransaction:()=>c.beginTransaction(),query:(...a)=>c.query(...a),rollback:()=>c.rollback(),release:()=>c.release(),destroy:()=>c.destroy(),commit:async()=>{await c.commit();if(once){once=false;throw Error('injected lost ACK');}}};}};
     assert.equal((await make(wrapped).receive(packet())).status,503);assert.equal((await make().receive(packet())).duplicates,1);
   });
   await reset();
   await run('revocation committed before dispatch blocks mock attempt',async()=>{const {store,receive}=make();await receive(packet());let calls=0;await db.query('UPDATE crewcheck_whatsapp_links SET revoked_at=NOW(3) WHERE email=?',[email]);await store.exerciseDispatch(eventKey,{concierge:async()=>assert.fail('revoked account'),send:async()=>{calls++;}});assert.equal(calls,0);});
   await reset();
   await run('revocation waits on actual InnoDB lock through mock I/O',async()=>{
     const {store,receive}=make();await receive(packet());let enter,release,calls=0;const entered=new Promise(r=>enter=r),hold=new Promise(r=>release=r);
     const sending=store.exerciseDispatch(eventKey,{concierge:async()=> 'SYNTHETIC REPLY',send:async()=>{calls++;enter();await hold;return {status:'accepted_unconfirmed'};}});
     await entered;const c=await db.getConnection();let revoking;
     try{const [[identity]]=await c.query('SELECT CONNECTION_ID() AS id');revoking=c.query('UPDATE crewcheck_whatsapp_links SET revoked_at=NOW(3) WHERE email=?',[email]);revoking.catch(()=>{});
       let locked=false;for(let i=0;i<60&&!locked;i++){const [r]=await db.query('SELECT trx_state FROM information_schema.innodb_trx WHERE trx_mysql_thread_id=?',[identity.id]);locked=r.some(x=>x.trx_state==='LOCK WAIT');if(!locked)await new Promise(r=>setTimeout(r,25));}
       assert(locked,'prove lock wait, not just elapsed time');release();assert.equal((await sending).status,'accepted_unconfirmed');await revoking;assert.equal(calls,1);
     }finally{release();await sending.catch(()=>{});if(revoking)await revoking.catch(()=>{});c.release();}
   });
   await reset();
   await run('retry timeline and prolonged unavailability simulate possible loss',async()=>{
     let minute=0;const times=[0];for(let retry=0;retry<20;retry++){minute+=1+retry*retry;times.push(minute);}assert.equal(minute,2490);
     assert.equal(times.filter(t=>t>=3000).length,0,'provider horizon can expire with no callback received');assert.equal(await read(),undefined);
     const first=times.find(t=>t>=60);assert.equal(first,61);clock=epoch+first*60000;const {receive}=make();assert.equal((await receive(packet())).denied,1);assert.equal((await read()).status,'denied');assert.equal((await read()).sealed,null);assert.equal((await receive(packet())).duplicates,1);
   });
   await runMysqlScenarios({run,db,reset,make,event,eventKey,stateKey,sender,recipient,email,owner,key,salt,password,epoch,setClock:value=>{clock=value;}});
   await run('separate process engine blocks OFF-host erasure and retains unknown fence after crash',async()=>{
     const {eraseWhatsAppAccountState}=await load('server/whatsapp-lifecycle.mjs');
     for(const crash of [false,true]){
       await reset();await make().receive(packet());
       const child=fork(new URL(import.meta.url),['engine-worker',checkout,socket,root,HEAD],{stdio:['ignore','pipe','pipe','ipc']});
       let diagnostics='';child.stderr.on('data',b=>{diagnostics=(diagnostics+b).slice(-2000);});
       const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
       const waitMessage=phase=>new Promise((resolve,reject)=>{const onMessage=m=>{if(m.phase===phase){child.off('message',onMessage);resolve(m);}};child.on('message',onMessage);exit.then(r=>reject(Error('worker exited '+JSON.stringify(r)+diagnostics)));});
       try{
         await waitMessage('entered');
         assert.equal((await read()).engineActive,true);
         assert.equal((await make().receive(packet())).duplicates,1);
         await Promise.all(Array.from({length:4},async()=>assert.equal((await make().store.exerciseDispatch(eventKey,{concierge:async()=>assert.fail(),send:async()=>assert.fail()})).status,'preparing')));
         await db.query('UPDATE crewcheck_whatsapp_links SET revoked_at=NOW(3),consent_concierge=0 WHERE email=?',[email]);
         await assert.rejects(eraseWhatsAppAccountState(email,{db}));
         const {mysqlAdapter}=await load('server/mysql-platform-adapter.mjs');const client=await mysqlAdapter(db).connect();
         try{await client.query('BEGIN');await assert.rejects(eraseWhatsAppAccountState(email,{client}));await client.query('ROLLBACK');}finally{client.release();}
         clock=epoch+12*24*3600000;await make().store.maintain({forgetAccountId:owner});
         assert.equal((await read()).engineActive,true);assert.equal((await read()).sealed,null);
         if(crash){child.kill('SIGKILL');await exit;await assert.rejects(eraseWhatsAppAccountState(email,{db}));await make().store.maintain();assert.equal((await read()).engineActive,true);}
         else {const done=waitMessage('done');child.send('release');assert.equal((await done).effects,1);assert.equal((await exit).code,0);assert.equal((await read()).engineActive,false);await eraseWhatsAppAccountState(email,{db});}
         const [[quota]]=await db.query("SELECT payload FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-infobip-admission-v1:%'");
         assert.equal((typeof quota.payload==='string'?JSON.parse(quota.payload):quota.payload).used,1);
       }finally{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exit;}}
     }
   });
   await verifyNamespaceIsolation({run,db,reset,make,event,sender,key,salt,email});
   // Leave exactly one held synthetic claim to verify an actual engine restart.
   await reset();assert.equal((await make().receive(packet())).accepted,1);
   assert.equal((await make().receive(packet(reportEvent))).accepted,1);
   assert.equal((await make().store.exerciseDispatch(reportKey,{concierge:async()=> 'SYNTHETIC',send:async()=>({status:'accepted_unconfirmed'})})).status,'accepted_unconfirmed');
   assert.equal((await receiveReports('delivery')(reportsPacket([report]))).recorded,1);
   assert.equal((await receiveReports('seen')(reportsPacket([seen]))).seen,1);
   assert.equal((await make().receive(packet(preparingEvent))).accepted,1);
   await createInfobipSqlBudget(db)(async c=>{
     assert.equal(await restartAdmission().reserve(c,{sender,recipient}),true);
     const [[row]]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[preparingStateKey]);
     const state=typeof row.payload==='string'?JSON.parse(row.payload):row.payload;
     await c.query('UPDATE crewcheck_telegram_state SET payload=? WHERE state_key=?',[JSON.stringify({...state,status:'preparing',preparationId:'synthetic-preparation',engineActive:true,engineOwner:createHash('sha256').update(JSON.stringify(['infobip-engine-owner-v1',owner])).digest('hex')}),preparingStateKey]);
   });
   console.log(JSON.stringify({head:HEAD,phase:'suite',engine:server[0].version,passed,externalCalls:0,retryContract:'synthetic ten-day ACK horizon; no account verification'}));
 }
}finally{clearTimeout(timeout);await db.end();}
