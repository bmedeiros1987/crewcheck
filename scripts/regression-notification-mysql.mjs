import assert from 'node:assert/strict';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import { handleBidsCore } from '../server/v139/bidsCore.mjs';
import { notifyBidRows, claimBid } from '../server/v139/bidsNotify.mjs';
import { confirmCycle, cycleJobPrefix, cycleStateKey, LEAVE_CYCLE } from '../server/v139/notificationCycles.mjs';
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
  await run('account deletion removes owned cycle decisions, tombstones, claims and jobs',async()=>{
    await db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3))',['notification-cycle:other',JSON.stringify({email:'other@example.test'})]);
    for(const [sql,args] of notificationStateDeletionStatements(email)) await db.query(sql.replace(/\$1/g,'?'),args);
    assert.equal((await db.query("SELECT COUNT(*) AS n FROM crewcheck_telegram_state WHERE JSON_UNQUOTE(JSON_EXTRACT(payload,'$.email'))=?",[email]))[0][0].n,0);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM crewcheck_notification_jobs WHERE email=?',[email]))[0][0].n,0);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM crewcheck_telegram_state WHERE state_key=?',['notification-cycle:other']))[0][0].n,1);
  });
  console.log(JSON.stringify({database:'disposable mysql8.4',passed},null,2));
} finally { await db.end(); }
