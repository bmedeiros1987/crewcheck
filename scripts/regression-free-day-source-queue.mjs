import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import {voluntarySources,sourceKey,SOURCE_SCOPE} from '../server/free-day-sources.mjs';
import {sourceQueue,handleSourceQueue,SOURCE_QUEUE_DISPATCH_ALLOWED} from '../server/free-day-source-queue.mjs';
import {sourceJobStateKey,SOURCE_JOB_SCOPE} from '../server/free-day-source-job-state.mjs';
import {syntheticSourceDatabase} from './fixtures/free-day-source-db.mjs';
import {dispatchClaimedJob} from '../server/notification-job-safety.mjs';
import {notificationStateDeletionStatements} from '../server/v139/notificationStateDeletion.mjs';
const user={email:'synthetic-source@example.invalid',id:'synthetic-owner'},hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const receipt=(clock)=>({identityDigest:hash(['900001','BSB']),period:'2026-08',documentHash:hash(clock),starts:[12,13,14].map(d=>({date:`2026-08-${d}`,clock,offset:-180,literal:true}))});
const review=(revision=0)=>({scope:SOURCE_SCOPE,action:'review',expectedRevision:revision,before:receipt('01:46'),after:receipt('08:30'),sequenceDate:'2026-08-12',confirmed:true,consent:true});
const request=(action='prepare',revision=1,extra={})=>({scope:SOURCE_JOB_SCOPE,action,expectedRevision:revision,...extra});
const putLink=(db,changes={})=>{const link={email:user.email,chatId:'9000012345',username:'synthetic_crew',linkedAt:'2026-10-01T12:00:00Z',code:'synthetic-link',...changes};db.state.rows.set(`link-email:${user.email}`,JSON.stringify(link));db.state.rows.set(`link-chat:${link.chatId}`,JSON.stringify(link));};
const seed=async()=>{const db=syntheticSourceDatabase();await voluntarySources(db,user,review());putLink(db);return db;};
assert.equal(SOURCE_QUEUE_DISPATCH_ALLOWED,false);
const automatic=syntheticSourceDatabase();putLink(automatic);const autoSaved=await voluntarySources(automatic,user,review());assert.equal(autoSaved.queuePreparation.prepared,true);assert.equal(automatic.state.jobs.size,1);assert.equal([...automatic.state.jobs.values()][0].status,'held');
const db=await seed(),results=await Promise.all(Array.from({length:8},()=>sourceQueue(db,user,request())));
assert.equal(db.state.jobs.size,1);assert.equal(results.filter(x=>!x.duplicate).length,1);
const key=results[0].job.jobKey,job=db.state.jobs.get(key);assert.equal(job.status,'held');assert.equal(job.chat_id,null);assert.equal(job.telegram_username,null);assert.equal(job.phone,null);
assert.match(job.message,/Segundo as versões que você enviou/);assert.doesNotMatch(job.message,/900001|2026-08|01:46|08:30|700/);
assert.equal(results[0].delayMinutes,404);assert.equal(results[0].realConsent,false);assert.equal(results[0].accepted,false);assert.equal(results[0].delivered,false);assert.equal(results[0].sourceVerified,false);assert.equal(results[0].possibleAmount,null);
assert.equal(results[0].destination.label,'@synthetic_crew · chat ••••2345');assert.equal(results[0].telegramConfigured,false,'configuration is not required for no-network simulation');
assert.equal((await voluntarySources(db,user,review(1))).duplicate,true);assert.equal(db.state.jobs.get(key).status,'held','same confirmed review keeps the reservation');
const simulations=await Promise.all(Array.from({length:8},()=>sourceQueue(db,user,request('simulate',1,{jobKey:key}))));
assert.equal(simulations.filter(x=>!x.duplicate).length,1);assert.equal(job.status,'held');assert.equal(simulations[0].simulation.simulated,true);assert.equal(simulations[0].simulation.accepted,false);assert.equal(simulations[0].simulation.delivered,false);
const metadata=JSON.parse(db.state.rows.get(sourceJobStateKey(user,key)));assert.ok(!JSON.stringify(metadata).includes('9000012345'));assert.ok(!JSON.stringify(metadata).includes('@synthetic_crew'));
for(const extra of [{realConsent:true},{dispatchAllowed:true},{chatId:'9000012345'},{sourceVerified:true},{recipient:'other'},{possibleAmount:700}])await assert.rejects(sourceQueue(db,user,request('prepare',1,extra)),{code:'CLIENT_AUTHORITY_REJECTED'});
await assert.rejects(sourceQueue(db,user,request('activate')),{code:'REAL_DELIVERY_NOT_ACTIVE'});
await assert.rejects(sourceQueue(db,user,request('simulate',1,{jobKey:'free-day:source:foreign'})),{code:'OWN_SIMULATION_JOB_REQUIRED'});
await assert.rejects(sourceQueue(db,user,request('prepare',0)),{code:'SOURCE_REVISION_CHANGED'});
process.env.CREWCHECK_FREE_DAY_DELIVERY_ENABLED='1';assert.equal((await sourceQueue(db,user,null,{configured:true})).dispatchAllowed,false);delete process.env.CREWCHECK_FREE_DAY_DELIVERY_ENABLED;
const without=await seed();without.state.rows.delete(`link-chat:9000012345`);assert.equal((await sourceQueue(without,user)).destination,null);await assert.rejects(sourceQueue(without,user,request()),{code:'VERIFIED_EXISTING_DESTINATION_REQUIRED'});assert.equal(without.state.jobs.size,0);
for(const changes of [{linkedAt:'2019-01-01T00:00Z'},{linkedAt:'2999-01-01T00:00Z'},{email:'foreign@example.invalid'},{chatId:'invented-chat'},{chatId:'0'},{chatId:'0001234'},{linkedAt:'2026-10-01T12:00:00'}]){const invalid=await seed();putLink(invalid,changes);assert.equal((await sourceQueue(invalid,user)).destination,null);}
const duplicateRotation=syntheticSourceDatabase();putLink(duplicateRotation);const duplicateSaved=await voluntarySources(duplicateRotation,user,review());putLink(duplicateRotation,{chatId:'9000099999'});const duplicateReview=await voluntarySources(duplicateRotation,user,review(1));assert.equal(duplicateReview.queuePreparation.prepared,false);assert.equal(duplicateRotation.state.jobs.get(duplicateSaved.queuePreparation.jobKey).status,'cancelled');
const collective=await seed();putLink(collective,{chatId:'-9000012345'});assert.match((await sourceQueue(collective,user)).destination.label,/coletivo/);assert.doesNotMatch((await sourceQueue(collective,user)).destination.label,/@synthetic_crew/);
const rotation=await seed();const old=await sourceQueue(rotation,user,request());putLink(rotation,{chatId:'9000099999',code:'new-link'});await assert.rejects(sourceQueue(rotation,user,request('simulate',1,{jobKey:old.job.jobKey})),{code:'QUEUE_CONTEXT_CHANGED'});assert.equal(rotation.state.jobs.get(old.job.jobKey).status,'cancelled');assert.equal(rotation.state.rows.has(sourceJobStateKey(user,old.job.jobKey)),false,'context cancellation commit survives error');
const sourceChange=await seed();const previousJob=await sourceQueue(sourceChange,user,request());const changed=review(1);changed.after=receipt('09:30');await voluntarySources(sourceChange,user,changed);assert.equal(sourceChange.state.jobs.get(previousJob.job.jobKey).status,'cancelled');assert.equal(sourceChange.state.rows.has(sourceJobStateKey(user,previousJob.job.jobKey)),false);assert.equal([...sourceChange.state.jobs.values()].filter(j=>j.status==='held').length,1,'new confirmed version reserves its own held job atomically');
for(const access of ['sources-stale-post','queue-stale-post','revoke-old-tab']) {
 const expiry=await seed();const prepared=await sourceQueue(expiry,user,request());const state=JSON.parse(expiry.state.rows.get(sourceKey(user))),now=Date.parse(state.expiresAt)+1;
 if(access==='sources-stale-post')await assert.rejects(voluntarySources(expiry,user,review(1),{now}),{code:'SOURCE_REVISION_CHANGED'});
 if(access==='queue-stale-post')await assert.rejects(sourceQueue(expiry,user,request('simulate',1,{jobKey:prepared.job.jobKey}),{now}),{code:'CONSENT_REQUIRED_OR_EXPIRED'});
 if(access==='revoke-old-tab')assert.equal((await voluntarySources(expiry,user,{scope:SOURCE_SCOPE,action:'revoke',expectedRevision:1},{now})).alreadyRevoked,true);
 assert.equal(expiry.state.jobs.get(prepared.job.jobKey).status,'cancelled');assert.equal(expiry.state.rows.has(sourceJobStateKey(user,prepared.job.jobKey)),false);assert.ok(!expiry.state.rows.get(sourceKey(user)).includes('documentHash'));
}
const race=await seed();await sourceQueue(race,user,request());const revocation=await Promise.allSettled([voluntarySources(race,user,{scope:SOURCE_SCOPE,action:'revoke',expectedRevision:1}),sourceQueue(race,user,request('simulate',1,{jobKey:[...race.state.jobs.keys()][0]}))]);assert.equal(revocation[0].status,'fulfilled');assert.equal(revocation[1].status,'rejected');assert.ok([...race.state.jobs.values()].every(j=>j.status==='cancelled'));
const recreation=await seed();await sourceQueue(recreation,user,request());recreation.state.owner='replacement-owner';await assert.rejects(sourceQueue(recreation,user),{code:'OWNER_CHANGED'});
const pending=await seed();const source=JSON.parse(pending.state.rows.get(sourceKey(user)));source.review.before.starts[0].clock=null;source.review.before.starts[0].literal=false;pending.state.rows.set(sourceKey(user),JSON.stringify(source));await assert.rejects(sourceQueue(pending,user,request()),{code:'RECEIPT_VERSION_CHANGED'});assert.equal(pending.state.jobs.size,0);
const broken=await seed(),connect=broken.getConnection;broken.getConnection=async()=>{const c=await connect(),query=c.query;c.query=async(sql,args)=>{if(sql.startsWith('INSERT INTO crewcheck_telegram_state')&&args[0].startsWith('notification-free-day-source-job:'))throw Error('synthetic rollback');return query(sql,args);};return c;};await assert.rejects(sourceQueue(broken,user,request()));assert.equal(broken.state.jobs.size,0);
const atomic=syntheticSourceDatabase();putLink(atomic);const autoConnect=atomic.getConnection;atomic.getConnection=async()=>{const c=await autoConnect(),query=c.query;c.query=async(sql,args)=>{if(sql.startsWith('INSERT INTO crewcheck_telegram_state')&&args[0].startsWith('notification-free-day-source-job:'))throw Error('synthetic atomic audit failure');return query(sql,args);};return c;};await assert.rejects(voluntarySources(atomic,user,review()));assert.equal(atomic.state.jobs.size,0);assert.equal(atomic.state.rows.has(sourceKey(user)),false,'automatic job/audit failure rolls back the confirmed receipt');
const missingCreated=await seed();missingCreated.state.created=null;await assert.rejects(sourceQueue(missingCreated,user),{code:'ACCOUNT_CREATION_PENDING'});
let realSends=0;const forged={query:async sql=>sql.startsWith('SELECT *')?[[{id:1,job_key:key,status:'processing',locked_at:new Date()}]]:[{affectedRows:1}]};assert.equal((await dispatchClaimedJob(forged,{id:1},{deliver:()=>{realSends++;},findLink:()=>{throw Error('Should not read');}})).status,'cancelled');assert.equal(realSends,0);
assert.match(notificationStateDeletionStatements(user.email)[1][0],/notification-free-day-source-job:%/);
for(const file of ['server/free-day-source-queue.mjs','server/free-day-source-job-state.mjs'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/fetch\(|setInterval\(|setTimeout\(|sendTelegram|https:\/\/api|TELEGRAM_BOT_TOKEN/);
// Actual HTTP producer/consumer calls remain usable after the simulated app
// closes; no Notification API, browser worker, real bot or delivery timer.
const httpDb=await seed();let browserAppOpen=true,access=0;
const server=http.createServer((req,res)=>handleSourceQueue(req,res,{identity:r=>r.headers.authorization==='Bearer synthetic-only'?user:null,dbPool:async()=>{access++;return httpDb;},readJson:async r=>{let text='';for await(const chunk of r)text+=chunk;return JSON.parse(text);},sendJson:(r,status,value)=>{r.writeHead(status,{'content-type':'application/json'});r.end(JSON.stringify(value));}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
 const url=`http://127.0.0.1:${server.address().port}/api/notifications/free-day-source-queue`,headers={authorization:'Bearer synthetic-only','content-type':'application/json'};
 assert.equal((await fetch(url)).status,401);assert.equal(access,0);browserAppOpen=false;
 const prepared=await (await fetch(url,{method:'POST',headers,body:JSON.stringify(request())})).json();assert.equal(prepared.ok,true);
 const simulated=await (await fetch(url,{method:'POST',headers,body:JSON.stringify(request('simulate',1,{jobKey:prepared.job.jobKey}))})).json();assert.equal(simulated.simulation.simulated,true);assert.equal(simulated.delivered,false);assert.equal(browserAppOpen,false);assert.equal([...httpDb.state.jobs.values()][0].status,'held');
}finally{await new Promise(r=>server.close(r));}
console.log('PASS source receipts → held queue → fixed local transport with app closed:404min,8-way dedupe, owner/dual-link validation, CAS/TTL/revoke/rotation/rollback, no real consent/destination persistence/provider activation/sends');
