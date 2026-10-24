import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,existsSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import mysql from 'mysql2/promise';
import {mysqlAdapter} from '../server/mysql-platform-adapter.mjs';
import {createFinancialSqlStore} from '../server/financial-ledger-sql.mjs';
import {appendFinancialRecord,readFinancialLedger} from '../server/financial-ledger.mjs';
import {captureReviewedFinancialForecast} from '../server/financial-forecast-producer.mjs';
import {financialLedgerErasureStatements} from '../server/financial-ledger-erasure.mjs';
// Explicit local fixture only: no production URL, existing socket, credentials,
// environment database configuration or service-manager integration is accepted.
const binary=process.env.FINANCIAL_TEST_MYSQLD;
if(!binary||!path.isAbsolute(binary)||!existsSync(binary))throw Error('Set FINANCIAL_TEST_MYSQLD to an installed official MySQL 8 mysqld binary; no runtime is downloaded by this test.');
const version=spawnSync(binary,['--no-defaults','--version'],{encoding:'utf8'});
assert.equal(version.status,0);assert.match(version.stdout,/Ver 8\./);
const root=mkdtempSync(path.join(tmpdir(),'cc-fin-mysql-')),data=path.join(root,'data'),socket=path.join(root,'db.sock'),log=path.join(root,'server.log'),schema='crewcheck_financial_test_fixture';
mkdirSync(data,{mode:0o700});
const basedir=path.dirname(path.dirname(realpathSync(binary)));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let child,pool,db;
async function start(){
 child=spawn(binary,['--no-defaults','--basedir='+basedir,'--datadir='+data,'--socket='+socket,'--pid-file='+path.join(root,'mysqld.pid'),'--skip-networking','--mysqlx=OFF','--skip-log-bin','--innodb-buffer-pool-size=64M','--performance-schema=OFF','--log-error='+log],{stdio:'ignore'});
 for(let attempt=0;attempt<100;attempt++){
  if(child.exitCode!==null)throw Error('Disposable MySQL exited before readiness. Inspect fixture log locally.');
  try{const c=await mysql.createConnection({socketPath:socket,user:'root',connectTimeout:500});await c.query('SELECT 1');await c.end();return;}catch{await pause(100);}
 }
 throw Error('Disposable MySQL readiness timeout');
}
async function stop(){
 if(pool){await pool.end();pool=null;}
 if(child&&child.exitCode===null){const c=await mysql.createConnection({socketPath:socket,user:'root'});await c.query('SHUTDOWN');await c.end();await Promise.race([once(child,'exit'),pause(10000)]);if(child.exitCode===null)throw Error('Disposable MySQL did not stop');}
}
function connect(){pool=mysql.createPool({socketPath:socket,user:'root',database:schema,connectionLimit:6});db=mysqlAdapter(pool);return createFinancialSqlStore(db);}
const A={authenticated:true,role:'owner',ownerId:'synthetic-a@example.invalid'},B={...A,ownerId:'synthetic-b@example.invalid'};
const input=(extra={})=>({action:'capture_forecast',expectedRevision:0,idempotencyKey:'synthetic-first',sourceFingerprint:'a'.repeat(64),provenance:{kind:'roster_snapshot',reference:'synthetic-reviewed'},record:{sourceId:'synthetic-logical-meal',category:'allowance',currency:'USD',amountMinor:1234,periodStart:'2032-02-01',periodEnd:'2032-02-01',timezone:'America/Sao_Paulo',aggregationLevel:'item',status:'forecast',ruleVersion:'synthetic-v1'},...extra});
try{
 // Empty-root authentication exists only in this newly created disposable data
 // directory; TCP/X are disabled and no real user's authentication is changed.
 const init=spawnSync(binary,['--no-defaults','--basedir='+basedir,'--initialize-insecure','--datadir='+data,'--log-error='+log],{stdio:'ignore'});assert.equal(init.status,0,'disposable initialization');
 await start();const setup=await mysql.createConnection({socketPath:socket,user:'root'});
 await setup.query('CREATE DATABASE '+schema+' CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');await setup.end();
 let store=connect();await pool.query('CREATE TABLE crewcheck_platform_profiles(email VARCHAR(254) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin PRIMARY KEY) ENGINE=InnoDB');
 await pool.query('INSERT INTO crewcheck_platform_profiles(email) VALUES(?),(?)',[A.ownerId,B.ownerId]);
 await assert.rejects(store.list(A.ownerId),{code:'ER_NO_SUCH_TABLE'});
 const migration=readFileSync(new URL('../migrations/20261017_020_financial_ledger_mysql.sql',import.meta.url),'utf8');
 const channelMigration=readFileSync(new URL('../migrations/20261020_021_financial_channel_preparation_mysql.sql',import.meta.url),'utf8');
 for(const sql of channelMigration.split(';').map(s=>s.trim()).filter(Boolean))await pool.query(sql);
 for(let replay=0;replay<2;replay++)for(const sql of migration.split(';').map(s=>s.trim()).filter(Boolean))await pool.query(sql);
 const [tables]=await pool.query("SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME LIKE 'crewcheck_financial_%'",[schema]);assert.equal(tables.length,4);assert(tables.every(t=>t.ENGINE==='InnoDB'));
 const append=(value,identity=A,target=store)=>appendFinancialRecord({store:target,identity,input:value});
 const receipt=await append(input());assert.equal(receipt.revision,1);assert.equal((await append(input())).replayed,true);
 await stop();await start();store=connect();assert.equal((await store.list(A.ownerId))[0].amountMinor,1234,'actual server restart persists original currency snapshot');
 assert.equal((await store.list(B.ownerId)).length,0);
 await pool.query('CREATE TABLE synthetic_rosters(id INT PRIMARY KEY) ENGINE=InnoDB');await pool.query('INSERT INTO synthetic_rosters VALUES(1)');await pool.query('DELETE FROM synthetic_rosters');assert.equal((await store.list(A.ownerId)).length,1,'roster deletion has no financial cascade');
 const concurrent=input({idempotencyKey:'concurrent-identical',record:{...input().record,sourceId:'concurrent-meal'}});
 const retries=await Promise.all(Array.from({length:12},()=>append(concurrent)));assert.equal(retries.filter(r=>!r.replayed).length,1);assert(retries.every(r=>r.id===retries[0].id&&r.revision===1));
 const competing=await Promise.allSettled([1,2].map(n=>append({...concurrent,idempotencyKey:'competing-'+n,expectedRevision:1,sourceFingerprint:String(n).repeat(64),record:{...concurrent.record,amountMinor:2000+n}})));
 assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);assert.equal(competing.filter(r=>r.status==='rejected'&&r.reason.code==='FINANCIAL_REVISION_CONFLICT').length,1);
 const latest=await readFinancialLedger({store,identity:A,periodStart:'2032-02-01',periodEnd:'2032-02-01',aggregationLevel:'item'});assert.equal(latest.records.length,2);assert.equal(latest.history.length,3);assert.equal(latest.totals[0].amountMinor,1234+2001+competing.findIndex(r=>r.status==='fulfilled'));
 // Inject an I/O failure after a real transaction creates its locked head.
 const broken={...db,connect:async()=>{const c=await db.connect();return {...c,query:async(sql,p)=>{if(sql.startsWith('INSERT INTO crewcheck_financial_revisions'))throw Error('synthetic I/O failure');return c.query(sql,p);}};}};
 const brokenInput=input({idempotencyKey:'rollback',record:{...input().record,sourceId:'rollback-only'}});await assert.rejects(append(brokenInput,A,createFinancialSqlStore(broken)),/synthetic I\/O failure/);
 const [heads]=await pool.query('SELECT COUNT(*) AS n FROM crewcheck_financial_heads WHERE owner_id=?',[A.ownerId]);assert.equal(heads[0].n,2,'real rollback also removes newly inserted head');
 const producerSource={kind:'reviewed_financial_forecast',ownerId:B.ownerId,scopeId:'synthetic-producer',reviewReference:'synthetic-reviewed',ruleVersion:'synthetic-v1',fingerprint:'b'.repeat(64),items:[{key:'meal-1',expectedRevision:0,record:{periodStart:'2032-02-02',periodEnd:'2032-02-02',currency:'JPY',timezone:'Asia/Tokyo',amountMinor:123,category:'allowance',aggregationLevel:'item'}}]};
 const produced=await captureReviewedFinancialForecast({identity:B,source:producerSource,store});assert.equal(produced.receipts[0].revision,1);assert.equal((await captureReviewedFinancialForecast({identity:B,source:producerSource,store})).receipts[0].replayed,true);
 // Exact first-lock order used by production account erasure. A writer queued
 // after the deletion lock cannot recreate financial state after profile removal.
 const eraser=await db.connect();await eraser.query('BEGIN');await eraser.query('SELECT email FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE',[A.ownerId]);
 let settled=false;const afterErase=append(input({idempotencyKey:'after-erasure',record:{...input().record,sourceId:'after-erasure'}})).then(()=>{settled=true;return 'unexpected';},e=>{settled=true;return e.code;});
 await pause(50);assert.equal(settled,false,'real InnoDB writer waits for account erasure lock');
 for(const [sql,p] of financialLedgerErasureStatements(A.ownerId))await eraser.query(sql,p);
 await eraser.query('DELETE FROM crewcheck_platform_profiles WHERE email=$1',[A.ownerId]);await eraser.query('COMMIT');eraser.release();assert.equal(await afterErase,'FINANCIAL_OWNER_REQUIRED');
 const [remaining]=await pool.query('SELECT owner_id FROM crewcheck_financial_revisions');assert.deepEqual([...new Set(remaining.map(r=>r.owner_id))],[B.ownerId]);assert.equal((await store.list(B.ownerId))[0].currency,'JPY');
 await assert.rejects(store.list(A.ownerId),{code:'FINANCIAL_OWNER_REQUIRED'});
 console.log(JSON.stringify({result:'PASS',engine:version.stdout.trim(),transport:'private unix socket; TCP and MySQL X disabled',migrationReplay:true,actualServerRestart:true,rosterIndependence:true,concurrentIdenticalWriters:12,competingRevision:true,rollback:true,syntheticProducer:true,ownerIsolation:true,accountErasureRace:true,fixtureDataOnly:true,productionAccess:false}));
}finally{
 try{await stop();}finally{if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([once(child,'exit'),pause(10000)]);}if(!child||child.exitCode!==null)rmSync(root,{recursive:true,force:true});}
}
