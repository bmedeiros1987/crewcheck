import assert from 'node:assert/strict';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import {readOperationalHistoryScope as scope,recordOperationalGateObservation as record,readOperationalGateHistory as read} from '../server/concierge/operational-history.mjs';
import {changeTelegramOperationalConsent,runTelegramOperationalChangeCycle} from '../server/concierge/telegram-operational-change.mjs';
import {dispatchClaimedJob} from '../server/notification-job-safety.mjs';
const socketPath='/tmp/crewcheck-notification-qa-socket/mysqld.sock';
assert.equal(process.env.CREWCHECK_NOTIFICATION_QA,'isolated-mysql');assert.equal(process.env.CREWCHECK_QA_MYSQL_SOCKET,socketPath);assert(fs.statSync(socketPath).isSocket());
globalThis.fetch=()=>assert.fail('Network forbidden');
const db=mysql.createPool({socketPath,user:'root',password:'',database:'crewcheck_notification_qa',connectionLimit:12});
const NOW=Date.parse('2032-10-06T06:00:00Z'),email='history@example.invalid',owner='CC-SYNTHETIC-HISTORY',chatId='123456789';let now=NOW,sends=0;
const context={email,owner},options=()=>({enabled:true,now,lockSource:true});
async function tx(fn){const c=await db.getConnection();try{await c.beginTransaction();const v=await fn(c);await c.commit();return v;}catch(e){await c.rollback();throw e;}finally{c.release();}}
const currentScope=()=>tx(c=>scope(c,context,options()));
const source=(c,who,opts)=>read(c,who,{...opts,enabled:true});
const observation=(identity,gate,offset)=>({ok:true,provider:'custom',...identity,gate,sourceReceivedAt:NOW+offset+100,departureGateUpdate:{schema:'crewcheck.departure-gate-update.v1',...identity,gate,updatedAt:new Date(NOW+offset).toISOString()}});
try{
 assert.equal((await db.query('SELECT DATABASE() AS name'))[0][0].name,'crewcheck_notification_qa');
 for(const table of ['crewcheck_notification_jobs','crewcheck_platform_rosters','crewcheck_telegram_state','crewcheck_platform_accounts','crewcheck_platform_profiles'])await db.query(`DROP TABLE IF EXISTS ${table}`);
 await db.query('CREATE TABLE crewcheck_telegram_state(state_key VARCHAR(255) PRIMARY KEY,payload JSON NOT NULL,updated_at DATETIME(3) NOT NULL) ENGINE=InnoDB');
 await db.query('CREATE TABLE crewcheck_platform_profiles(email VARCHAR(254) PRIMARY KEY,public_id VARCHAR(64),created_at DATETIME(3) NOT NULL) ENGINE=InnoDB');
 await db.query('CREATE TABLE crewcheck_platform_accounts(email VARCHAR(254) PRIMARY KEY,must_change_password TINYINT NOT NULL) ENGINE=InnoDB');
 await db.query('CREATE TABLE crewcheck_platform_rosters(id VARCHAR(160) PRIMARY KEY,owner_email VARCHAR(254),roster_key VARCHAR(7),roster JSON,fingerprint VARCHAR(64),active TINYINT,updated_at DATETIME(3),created_at DATETIME(3),INDEX(owner_email,active)) ENGINE=InnoDB');
 await db.query(fs.readFileSync('server/telegram-fast-ack.mjs','utf8').match(/await db\.query\(`(CREATE TABLE IF NOT EXISTS crewcheck_notification_jobs[\s\S]*?)`\)/)[1]);
 await db.query('INSERT INTO crewcheck_platform_profiles VALUES(?,?,?)',[email,owner,new Date(NOW-86400000)]);await db.query('INSERT INTO crewcheck_platform_accounts VALUES(?,0)',[email]);
 const roster={year:2032,month:10,base:'GRU',rank:'CCM',rawText:'',days:[{date:'06/10/2032',dayNumber:6,month:10,year:2032,dayOfWeek:'',type:'VOO',pairingCode:'TEST123',dutyReport:'05:30',dutyDebrief:'10:00',isNextDay:false,continuityInferred:false,base:'GRU',rawText:'',legs:[{id:'synthetic-leg',flightNumber:'LA1234',origin:'GRU',destination:'BSB',departureTime:'06:30',arrivalTime:'08:30',workType:'OP'}]}]};
 await db.query('INSERT INTO crewcheck_platform_rosters VALUES(?,?,?,?,?,1,?,?)',['synthetic-roster',email,'2032-10',JSON.stringify(roster),'a'.repeat(64),new Date(NOW-60000),new Date(NOW-86400000)]);
 const link={email,chatId,code:'synthetic-code',linkedAt:new Date(NOW-86400000).toISOString()};for(const k of ['link-email:'+email,'link-chat:'+chatId])await db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3))',[k,JSON.stringify(link)]);
 const ticket=await currentScope();const input=(gate,offset)=>{const value=observation(ticket.identity,gate,offset);value.departure={gate};delete value.gate;return {expectedScope:ticket,field:'gate',observation:value};};
 const identity={db,email,profile:{public_id:owner},payload:{iss:'crewcheck',aud:'crewcheck-web',sub:owner,email,exp:(NOW+86400000)/1000}};
 await changeTelegramOperationalConsent(db,identity,{field:'gate',enabled:true,confirmed:true,expectedRevision:0},{enabled:true,clock:()=>now});
 now=NOW+3000;const first=await Promise.all(Array.from({length:8},()=>record(db,context,input('24',1000),{enabled:true,clock:()=>now})));assert.equal(first.filter(x=>x.status==='baseline').length,1);
 await record(db,context,input('25',2000),{enabled:true,clock:()=>now});
 const restarted=await import('../server/concierge/operational-history.mjs?restart');assert.equal((await tx(c=>restarted.readOperationalGateHistory(c,context,options()))).source.observation.gate,'25');
 await Promise.all(Array.from({length:8},()=>runTelegramOperationalChangeCycle(db,{enabled:true,clock:()=>now,readSource:source})));
 const [jobs]=await db.query('SELECT * FROM crewcheck_notification_jobs');assert.equal(jobs.length,1);const job=jobs[0];await db.query("UPDATE crewcheck_notification_jobs SET status='processing',locked_at=NOW(3) WHERE id=?",[job.id]);
 const dispatch=()=>dispatchClaimedJob(db,job,{operationalChangeEnabled:true,readOperationalChangeSource:source,clock:()=>now,deliver:async()=>{sends++;return {ok:true};}});await Promise.all([dispatch(),dispatch()]);assert.equal(sends,1);
 // Actual reader under RR: snapshot precedes owner wait; writer changes the
 // durable source during that wait. Only the test wrapper can remove the lock.
 const [rows]=await db.query("SELECT * FROM crewcheck_telegram_state WHERE state_key LIKE 'operational-source-history:%'");assert.equal(rows.length,1);const revised=typeof rows[0].payload==='string'?JSON.parse(rows[0].payload):rows[0].payload;
 revised.source.previousObservation=revised.source.observation;revised.source.observation=observation(ticket.identity,'26',2500);
 const writer=await db.getConnection();await writer.beginTransaction();await writer.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[email]);await writer.query('UPDATE crewcheck_telegram_state SET payload=? WHERE state_key=?',[JSON.stringify(revised),rows[0].state_key]);
 const reader=await db.getConnection();await reader.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');await reader.beginTransaction();await reader.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[rows[0].state_key]);const id=(await reader.query('SELECT CONNECTION_ID() AS id'))[0][0].id;
 const wrapped={query:(sql,args)=>reader.query(process.env.CREWCHECK_QA_OLD_HISTORY_READ==='1'&&sql.startsWith('SELECT payload FROM crewcheck_telegram_state')?sql.replace(' FOR UPDATE',''):sql,args)};
 const pending=read(wrapped,context,options());let blocked=false;
 for(let n=0;n<200;n++){const [w]=await db.query('SELECT t.PROCESSLIST_ID FROM performance_schema.data_lock_waits w JOIN performance_schema.threads t ON t.THREAD_ID=w.REQUESTING_THREAD_ID WHERE t.PROCESSLIST_ID=?',[id]);if(w.length){blocked=true;break;}await new Promise(r=>setTimeout(r,10));}
 assert(blocked);await writer.commit();writer.release();let result;try{result=await pending;}finally{await reader.rollback();reader.release();}
 assert.equal(result.source.observation.gate,'26','HISTORY_STALE_READ: durable observation must be current after owner wait');
 await db.query('UPDATE crewcheck_platform_rosters SET updated_at=? WHERE id=?',[new Date(NOW-30000),'synthetic-roster']);assert.equal(await tx(c=>read(c,context,options())),null);await assert.rejects(record(db,context,input('27',2700),{enabled:true,clock:()=>now}));
 console.log('PASS isolated SQL actual history reader/writer: eight writers, restart, real queue/dispatch with fake transport, current source after RR owner wait, stale ticket/revision refused; external calls=0.');
}finally{await db.end();}
