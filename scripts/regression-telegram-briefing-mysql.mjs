import assert from 'node:assert/strict';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import { changeTelegramBriefingConsent, runTelegramBriefingCycle } from '../server/concierge/telegram-briefing.mjs';
import { dispatchClaimedJob } from '../server/notification-job-safety.mjs';
// Same network-disabled disposable socket/database pattern as notification QA.
// Never use DATABASE_URL, production credentials, TCP or a provider.
const socketPath='/tmp/crewcheck-notification-qa-socket/mysqld.sock';
assert.equal(process.env.CREWCHECK_NOTIFICATION_QA,'isolated-mysql');
assert.equal(process.env.CREWCHECK_QA_MYSQL_SOCKET,socketPath);
assert(fs.statSync(socketPath).isSocket());
globalThis.fetch=()=>{throw Error('External network forbidden');};
const db=mysql.createPool({socketPath,user:'root',password:'',database:'crewcheck_notification_qa',connectionLimit:12});
const NOW=Date.parse('2026-10-06T06:00:00Z'),email='briefing-synthetic@example.test',owner='CC-SYNTHETIC-BRIEFING',chatId='123456789';
let clock=NOW,sends=0;
const options={enabled:true,clock:()=>clock};
const identity={db,email,profile:{public_id:owner},payload:{iss:'crewcheck',aud:'crewcheck-web',sub:owner,email,exp:(NOW+86400000)/1000}};
const grant=(expectedRevision=0)=>changeTelegramBriefingConsent(db,identity,{enabled:true,confirmed:true,expectedRevision,preferences:{timing:'default',timeZone:'America/Sao_Paulo'}},options);
const plan=()=>runTelegramBriefingCycle(db,options);
const jobs=async()=>(await db.query('SELECT * FROM crewcheck_notification_jobs ORDER BY id'))[0];
const dispatch=(job,deliver=async()=>{sends++;return {ok:true};},database=db)=>dispatchClaimedJob(database,job,{deliver,findLink:()=>{throw Error('Generic delivery forbidden');},operationalBriefingEnabled:true,clock:()=>clock});
async function claim(job){await db.query("UPDATE crewcheck_notification_jobs SET status='processing',locked_at=NOW(3),attempts=attempts+1 WHERE id=? AND status='pending'",[job.id]);return job;}
const passed=[];
try{
 assert.equal((await db.query('SELECT DATABASE() AS name'))[0][0].name,'crewcheck_notification_qa');
 for(const table of ['crewcheck_notification_jobs','crewcheck_platform_rosters','crewcheck_telegram_state','crewcheck_platform_accounts','crewcheck_platform_profiles'])await db.query(`DROP TABLE IF EXISTS ${table}`);
 await db.query('CREATE TABLE crewcheck_telegram_state(state_key VARCHAR(255) PRIMARY KEY,payload JSON NOT NULL,updated_at DATETIME(3) NOT NULL) ENGINE=InnoDB');
 await db.query('CREATE TABLE crewcheck_platform_profiles(email VARCHAR(254) PRIMARY KEY,public_id VARCHAR(64),created_at DATETIME(3) NOT NULL) ENGINE=InnoDB');
 await db.query('CREATE TABLE crewcheck_platform_accounts(email VARCHAR(254) PRIMARY KEY,must_change_password TINYINT NOT NULL) ENGINE=InnoDB');
 await db.query('CREATE TABLE crewcheck_platform_rosters(id VARCHAR(160) PRIMARY KEY,owner_email VARCHAR(254),roster_key VARCHAR(7),roster JSON,fingerprint VARCHAR(64),active TINYINT,updated_at DATETIME(3),created_at DATETIME(3),INDEX(owner_email,active)) ENGINE=InnoDB');
 const queue=fs.readFileSync('server/telegram-fast-ack.mjs','utf8');await db.query(queue.match(/await db\.query\(`(CREATE TABLE IF NOT EXISTS crewcheck_notification_jobs[\s\S]*?)`\)/)[1]);
 await db.query('INSERT INTO crewcheck_platform_profiles VALUES(?,?,?)',[email,owner,new Date(NOW-86400000)]);
 await db.query('INSERT INTO crewcheck_platform_accounts VALUES(?,0)',[email]);
 const link={email,chatId,code:'synthetic-only',linkedAt:new Date(NOW-86400000).toISOString()};
 for(const key of ['link-email:'+email,'link-chat:'+chatId])await db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3))',[key,JSON.stringify(link)]);
 const roster={year:2026,month:10,base:'GRU',rank:'CCM',rawText:'',days:[{date:'06/10/2026',dayNumber:6,month:10,year:2026,dayOfWeek:'',type:'VOO',pairingCode:'SYNTHETIC',dutyReport:'05:30',dutyDebrief:'10:00',isNextDay:false,continuityInferred:false,base:'GRU',rawText:'',legs:[{id:'synthetic-leg',flightNumber:'LA1234',origin:'GRU',destination:'BSB',departureTime:'06:30',arrivalTime:'08:30',workType:'OP'}]}]};
 await db.query('INSERT INTO crewcheck_platform_rosters VALUES(?,?,?,?,?,1,?,?)',['synthetic-roster',email,'2026-10',JSON.stringify(roster),'a'.repeat(64),new Date(NOW-60000),new Date(NOW-86400000)]);
 const grants=await Promise.allSettled([grant(),grant()]);assert.equal(grants.filter(x=>x.status==='fulfilled').length,1);passed.push('real SQL consent CAS');
 await Promise.all(Array.from({length:8},plan));assert.equal((await jobs()).length,1);passed.push('eight concurrent planners one durable job');
 let job=(await jobs())[0];await claim(job);clock=Date.parse('2026-10-06T07:00:00Z');
 await Promise.all([dispatch(job),dispatch(job)]);assert.equal(sends,1);assert.equal((await jobs())[0].status,'sent');passed.push('concurrent real SQL claims one fake submission');
 await plan();assert.equal((await jobs()).length,1);assert.equal(sends,1);passed.push('terminal event not resurrected after producer recreation');
 // Reset ONLY disposable fixture job/state, retaining source/link/consent.
 async function freshJob(){clock=NOW;await db.query('DELETE FROM crewcheck_notification_jobs');await plan();const next=(await jobs())[0];assert(next);await claim(next);clock=Date.parse('2026-10-06T07:00:00Z');return next;}
 // Force an old consistent-read snapshot before waiting for the source writer.
 job=await freshJob();
 const writer=await db.getConnection();let waiting,readerConnectionId;
 const ownerWait=new Promise(resolve=>{waiting=resolve;});
 await writer.beginTransaction();
 await writer.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[email]);
 await writer.query('UPDATE crewcheck_platform_rosters SET updated_at=? WHERE id=?',[new Date(NOW-45000),'synthetic-roster']);
 const racing={query:(...args)=>db.query(...args),getConnection:async()=>{
  const c=await db.getConnection();await c.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  readerConnectionId=(await c.query('SELECT CONNECTION_ID() AS id'))[0][0].id;
  return {beginTransaction:()=>c.beginTransaction(),commit:()=>c.commit(),rollback:()=>c.rollback(),release:()=>c.release(),query:(sql,args)=>{
   if(sql.startsWith('SELECT p.public_id,a.must_change_password'))waiting();
   return c.query(sql,args);
  }};
 }};
 const raced=dispatch(job,async()=>{sends++;return {ok:true};},racing);
 try {
  await ownerWait;let blocked=false;
  for(let attempt=0;attempt<100;attempt++){
   const [waits]=await db.query('SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits w JOIN performance_schema.threads t ON t.THREAD_ID=w.REQUESTING_THREAD_ID WHERE t.PROCESSLIST_ID=?',[readerConnectionId]);
   if(Number(waits[0].n)>0){blocked=true;break;}
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert(blocked,'fixture must observe an actual reader lock wait before writer commit');
  await writer.commit();
 }finally{await writer.rollback();writer.release();}
 assert.equal((await raced).status,'cancelled','STALE_SOURCE_RACE: committed source revision must cancel');assert.equal(sends,1);
 passed.push('REPEATABLE READ old hint snapshot plus waiting writer commit reads current source');
 job=await freshJob();await db.query('UPDATE crewcheck_platform_rosters SET updated_at=? WHERE id=?',[new Date(NOW-30000),'synthetic-roster']);
 assert.equal((await dispatch(job)).status,'cancelled');assert.equal(sends,1);passed.push('source revision changed before dispatch cancels');
 job=await freshJob();await changeTelegramBriefingConsent(db,identity,{enabled:false,expectedRevision:1},options);assert.equal((await dispatch(job)).status,'skipped');assert.equal(sends,1);passed.push('revocation cancels processing before dispatch');
 clock=NOW;await grant(2);job=await freshJob();
 const uncertain=await dispatch(job,async()=>{sends++;return {ok:false};});assert.equal(uncertain.status,'uncertain');await dispatch(job);assert.equal(sends,2);passed.push('ambiguous provider outcome has no replay');
 job=await freshJob();
 const faulty={getConnection:()=>db.getConnection(),query:async(sql,params)=>{if(sql.startsWith('UPDATE crewcheck_notification_jobs SET status=?'))throw Error('Synthetic final persistence outage');return db.query(sql,params);}};
 await assert.rejects(()=>dispatch(job,async()=>{sends++;return {ok:true};},faulty));assert.equal((await jobs())[0].status,'dispatching');await dispatch(job);assert.equal(sends,3);passed.push('accepted then final-write outage never repeats');
 console.log(JSON.stringify({status:'PASS',passed,sends,externalCalls:0,physicalDelivery:false},null,2));
}finally{await db.end();}
