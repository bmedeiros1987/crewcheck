import assert from 'node:assert/strict';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import {changeTelegramOperationalConsent,runTelegramOperationalChangeCycle} from '../server/concierge/telegram-operational-change.mjs';
import {dispatchClaimedJob} from '../server/notification-job-safety.mjs';
const socketPath='/tmp/crewcheck-notification-qa-socket/mysqld.sock';
assert.equal(process.env.CREWCHECK_NOTIFICATION_QA,'isolated-mysql');assert.equal(process.env.CREWCHECK_QA_MYSQL_SOCKET,socketPath);assert(fs.statSync(socketPath).isSocket());
globalThis.fetch=()=>{throw Error('No network allowed');};
const db=mysql.createPool({socketPath,user:'root',password:'',database:'crewcheck_notification_qa',connectionLimit:12});
const NOW=Date.parse('2032-10-14T12:00:00Z'),email='operational-change@example.invalid',owner='CC-SYNTHETIC-CHANGE',chatId='123456789';
let now=NOW,sends=0;
const identity={db,email,profile:{public_id:owner},payload:{iss:'crewcheck',aud:'crewcheck-web',sub:owner,email,exp:(NOW+86400000)/1000}};
const flight={flight:'LA100',origin:'GRU',destination:'REC',departureDate:'2032-10-14',scheduledDepartureUtc:'2032-10-14T13:00:00Z'};
const observation=(gate,offset)=>({ok:true,provider:'custom',...flight,gate,sourceReceivedAt:NOW+offset+100,departureGateUpdate:{schema:'crewcheck.departure-gate-update.v1',...flight,gate,updatedAt:new Date(NOW+offset).toISOString()}});
const history={scope:{ownerId:owner,rosterRevision:'revision1',identity:flight},source:{ownerId:owner,rosterRevision:'revision1',previousObservation:observation('24',1000),observation:observation('25',2000)}};
const readSource=async(c,context,options)=>{assert.equal(context.owner,owner);assert.equal(options.lockSource,true);const sql="SELECT payload FROM crewcheck_telegram_state WHERE state_key='fixture-current-source'"+(process.env.CREWCHECK_QA_OLD_CHANGE_SOURCE_READ==='1'?'':' FOR UPDATE');const [rows]=await c.query(sql);return rows.length===1?rows[0].payload:null;};
const options={enabled:true,clock:()=>now,readSource};
const grant=(revision=0,enabled=true)=>changeTelegramOperationalConsent(db,identity,{field:'gate',enabled,confirmed:true,expectedRevision:revision},options);
const plan=()=>runTelegramOperationalChangeCycle(db,options);
const jobs=async()=> (await db.query('SELECT * FROM crewcheck_notification_jobs ORDER BY id'))[0];
const dispatch=(job,pool=db)=>dispatchClaimedJob(pool,job,{operationalChangeEnabled:true,readOperationalChangeSource:readSource,clock:()=>now,deliver:async()=>{sends++;return {ok:true};}});
async function claim(job){await db.query("UPDATE crewcheck_notification_jobs SET status='processing',locked_at=NOW(3) WHERE id=? AND status='pending'",[job.id]);}
try{
 assert.equal((await db.query('SELECT DATABASE() AS name'))[0][0].name,'crewcheck_notification_qa');
 for(const table of ['crewcheck_notification_jobs','crewcheck_platform_rosters','crewcheck_telegram_state','crewcheck_platform_accounts','crewcheck_platform_profiles'])await db.query(`DROP TABLE IF EXISTS ${table}`);
 await db.query('CREATE TABLE crewcheck_telegram_state(state_key VARCHAR(255) PRIMARY KEY,payload JSON NOT NULL,updated_at DATETIME(3) NOT NULL) ENGINE=InnoDB');
 await db.query('CREATE TABLE crewcheck_platform_profiles(email VARCHAR(254) PRIMARY KEY,public_id VARCHAR(64),created_at DATETIME(3) NOT NULL) ENGINE=InnoDB');
 await db.query('CREATE TABLE crewcheck_platform_accounts(email VARCHAR(254) PRIMARY KEY,must_change_password TINYINT NOT NULL) ENGINE=InnoDB');
 const queue=fs.readFileSync('server/telegram-fast-ack.mjs','utf8');await db.query(queue.match(/await db\.query\(`(CREATE TABLE IF NOT EXISTS crewcheck_notification_jobs[\s\S]*?)`\)/)[1]);
 await db.query('INSERT INTO crewcheck_platform_profiles VALUES(?,?,?)',[email,owner,new Date(NOW-86400000)]);await db.query('INSERT INTO crewcheck_platform_accounts VALUES(?,0)',[email]);
 const link={email,chatId,code:'fixture-only',linkedAt:new Date(NOW-86400000).toISOString()};
 for(const key of ['link-email:'+email,'link-chat:'+chatId])await db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3))',[key,JSON.stringify(link)]);
 await db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3))',['fixture-current-source',JSON.stringify(history)]);
 assert.equal((await Promise.allSettled([grant(),grant()])).filter(x=>x.status==='fulfilled').length,1);
 now=NOW+3000;await Promise.all(Array.from({length:8},plan));assert.equal((await jobs()).length,1);
 let job=(await jobs())[0];await claim(job);await Promise.all([dispatch(job),dispatch(job)]);assert.equal(sends,1);assert.equal((await jobs())[0].status,'sent');await plan();assert.equal((await jobs()).length,1);
 // The isolated source row models a trusted, lock-taking reader, NOT an operational integration.
 await db.query('DELETE FROM crewcheck_notification_jobs');await plan();job=(await jobs())[0];await claim(job);
 const writer=await db.getConnection();await writer.beginTransaction();await writer.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[email]);
 const changed=structuredClone(history);changed.scope.rosterRevision='revision2';changed.source.rosterRevision='revision2';
 await writer.query("UPDATE crewcheck_telegram_state SET payload=? WHERE state_key='fixture-current-source'",[JSON.stringify(changed)]);
 let readerId;const racing={query:(...a)=>db.query(...a),getConnection:async()=>{const c=await db.getConnection();await c.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');readerId=(await c.query('SELECT CONNECTION_ID() AS id'))[0][0].id;return c;}};
 const pending=dispatch(job,racing);
 let blocked=false;for(let n=0;n<200;n++){if(readerId){const [locks]=await db.query('SELECT t.PROCESSLIST_ID FROM performance_schema.data_lock_waits w JOIN performance_schema.threads t ON t.THREAD_ID=w.REQUESTING_THREAD_ID WHERE t.PROCESSLIST_ID=?',[readerId]);if(locks.length){blocked=true;break;}}await new Promise(r=>setTimeout(r,10));}
 assert(blocked,'reader must wait after unlocked event hint');await writer.commit();writer.release();assert.equal((await pending).status,'cancelled','CHANGE_STALE_SOURCE_RACE: current read must cancel committed revision');assert.equal(sends,1);
 await grant(1,false);assert.equal((await plan()).planned,0);
 console.log('PASS real isolated SQL operational change: consent CAS, eight producers, competing dispatch, durable replay fence, RR writer commit during owner wait, revoke; fake transport only. Reader is fixture-only.');
}finally{await db.end();}
