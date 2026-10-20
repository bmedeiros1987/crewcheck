import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';
import {mysqlAdapter} from '../server/mysql-platform-adapter.mjs';
import {createFinancialChannelSqlService} from '../server/financial-channel-sql.mjs';
import {financialLedgerErasureStatements} from '../server/financial-ledger-erasure.mjs';
import {appendFinancialRecord} from '../server/financial-ledger.mjs';

// Self-contained fixture. No host/URL/credential/production configuration input.
// Pinned official image; fresh tmpfs data, private Unix socket, no TCP/network.
const image='mysql:8.4.6@sha256:869218921e61d6c3c89820955d63cca42971f0e3e6c1e2792247bbd944ebc6e9';
const root=mkdtempSync(path.join(tmpdir(),'cc-fin-channel-qa-')),socketDir=path.join(root,'socket');mkdirSync(socketDir,{mode:0o700});
const name='cc-fin-channel-qa-'+process.pid+'-'+Date.now();let launched=false,pool;
const docker=(args)=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:1024*1024});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const owner={authenticated:true,role:'owner',ownerId:'fixture-a@example.invalid'},other={...owner,ownerId:'fixture-b@example.invalid'};
const target={channel:'telegram',chatType:'private',conversationId:'123456'};
const start='2032-12-20T12:00:00.000Z';let clock=start;
const passed=[];async function check(name,work){await work();passed.push(name);}
try {
 docker(['run','--detach','--rm','--name',name,'--network','none','--user',String(process.getuid())+':'+String(process.getgid()),'--tmpfs','/var/lib/mysql:rw,nosuid,uid='+process.getuid()+',gid='+process.getgid()+',size=512m','--mount','type=bind,src='+socketDir+',dst=/qa','-e','MYSQL_ALLOW_EMPTY_PASSWORD=yes',image,'--skip-networking','--mysqlx=OFF','--socket=/qa/mysqld.sock','--innodb-buffer-pool-size=64M','--performance-schema=OFF']);launched=true;
 const inspect=JSON.parse(docker(['inspect',name]))[0];assert.equal(inspect.HostConfig.NetworkMode,'none');assert.equal(Object.keys(inspect.HostConfig.PortBindings||{}).length,0);assert.equal(inspect.Mounts.some(x=>x.Type==='volume'),false);
 const socketPath=path.join(socketDir,'mysqld.sock');let ready=false;
 for(let i=0;i<120;i++){try{assert(statSync(socketPath).isSocket());const c=await mysql.createConnection({socketPath,user:'root',connectTimeout:500});await c.query('SELECT 1');await c.end();ready=true;break;}catch{await pause(250);}}
 assert(ready,'private fresh MySQL socket ready');
 pool=mysql.createPool({socketPath,user:'root',connectionLimit:8,dateStrings:true});
 await pool.query('CREATE DATABASE crewcheck_financial_channel_qa');await pool.query('USE crewcheck_financial_channel_qa');
 // Pool database must be fixed per connection, never rely on connection-local USE.
 await pool.end();pool=mysql.createPool({socketPath,user:'root',database:'crewcheck_financial_channel_qa',connectionLimit:8,dateStrings:true});
 const db=mysqlAdapter(pool),service=createFinancialChannelSqlService(db,{now:()=>new Date(clock),maxSourceAgeMs:7200000});
 const [[server]]=await pool.query('SELECT DATABASE() db,@@skip_networking isolated,VERSION() version');assert.equal(server.db,'crewcheck_financial_channel_qa');assert.equal(server.isolated,1);assert.match(server.version,/^8\.4\./);
 await pool.query('CREATE TABLE crewcheck_platform_profiles(email VARCHAR(254) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin PRIMARY KEY) ENGINE=InnoDB');
 await pool.query('CREATE TABLE crewcheck_telegram_state(state_key VARCHAR(255) PRIMARY KEY,payload JSON NOT NULL,updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB');
 for(const identity of [owner,other])await pool.query('INSERT INTO crewcheck_platform_profiles(email) VALUES(?)',[identity.ownerId]);
 async function migrate(file){for(const sql of readFileSync(file,'utf8').split(';').map(x=>x.trim()).filter(Boolean))await pool.query(sql);}
 await migrate('migrations/20261017_020_financial_ledger_mysql.sql');
 await check('missing channel schema fails closed',async()=>assert.equal((await service.read(target)).state,'unavailable'));
 for(let i=0;i<2;i++)await migrate('migrations/20261020_021_financial_channel_preparation_mysql.sql');
 const link={email:owner.ownerId,chatId:target.conversationId,linkedAt:'2032-12-01T00:00:00.000Z',accessKeyHash:'synthetic',code:'synthetic-code'};
 const put=async(key,value)=>pool.query('INSERT INTO crewcheck_telegram_state(state_key,payload) VALUES(?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)',[key,JSON.stringify(value)]);
 const links=async value=>{await put('link-chat:'+target.conversationId,value);await put('link-email:'+owner.ownerId,value);};await links(link);
 await check('private binding resolves both persisted directions, never body owner',async()=>{const preview=await service.previewConsent(owner,target.conversationId);assert.equal(preview.revision,0);assert.match(preview.binding,/^[a-f0-9]{64}$/);await assert.rejects(service.previewConsent(other,target.conversationId));assert.equal((await service.read({...target,chatType:'group'})).state,'unavailable');});
 const preview=await service.previewConsent(owner,target.conversationId);
 const grant={action:'grant',conversationId:target.conversationId,binding:preview.binding,expectedRevision:0,confirmed:true,categories:['allowance'],expiresAt:'2032-12-21T12:00:00.000Z'};
 await check('explicit owner consent persists and concurrent revisions serialize',async()=>{await assert.rejects(service.changeConsent({...owner,role:'visitor'},grant));await assert.rejects(service.changeConsent(owner,{...grant,confirmed:false}));const results=await Promise.allSettled([service.changeConsent(owner,grant),service.changeConsent(owner,grant)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected').length,1);assert.equal((await service.previewConsent(owner,target.conversationId)).consent.state,'granted');});
 const {createFinancialSqlStore}=await import('../server/financial-ledger-sql.mjs');
 const store=createFinancialSqlStore(db);
 const input={action:'capture_forecast',expectedRevision:0,idempotencyKey:'synthetic-one',sourceFingerprint:'1'.repeat(64),provenance:{kind:'roster_snapshot',reference:'synthetic-review'},record:{sourceId:'synthetic-meal',category:'allowance',currency:'BRL',amountMinor:12345,periodStart:'2032-12-19',periodEnd:'2032-12-19',aggregationLevel:'item',timezone:'UTC',status:'forecast',ruleVersion:'synthetic-v1'},schedule:{airline:'TAM',policy:{ownerId:owner.ownerId,reviewed:true,reference:'synthetic-rule',timing:'brl_wed_tue_next_thursday',currencies:['BRL']}}};
 // Use existing canonical writer, not a second fixture ledger/forecast calculator.
 const receipt=await appendFinancialRecord({store,identity:owner,input});
 // Controlled synthetic due date; the schedule policy may leave future year unknown.
 const [storedRows]=await pool.query('SELECT snapshot FROM crewcheck_financial_revisions WHERE owner_id=?',[owner.ownerId]);const stored=typeof storedRows[0].snapshot==='string'?JSON.parse(storedRows[0].snapshot):storedRows[0].snapshot;
 stored.record.expectedPaymentDate='2032-12-21';stored.record.expectedPaymentTimezone='UTC';
 await pool.query('UPDATE crewcheck_financial_revisions SET snapshot=? WHERE owner_id=? AND entry_id=?',[JSON.stringify(stored),owner.ownerId,receipt.id]);
 await check('recorded_at/SQL created_at alone does not assert freshness',async()=>{const result=await service.read(target);assert.equal(result.reason,'source_freshness_unproven');assert.deepEqual(result.events,[]);});
 const observation={entryId:receipt.id,revision:receipt.revision,sourceFingerprint:input.sourceFingerprint,evidenceDigest:'2'.repeat(64),kind:'published_source_timestamp',sourceAsOf:'2032-12-20T11:00:00.000Z'};
 await check('source evidence binds exact persisted owner/revision/fingerprint and is immutable',async()=>{await assert.rejects(service.recordSourceObservation(other,observation));await assert.rejects(service.recordSourceObservation(owner,{...observation,sourceFingerprint:'3'.repeat(64)}));await service.recordSourceObservation(owner,observation);assert.equal((await service.recordSourceObservation(owner,observation)).replayed,true);await assert.rejects(service.recordSourceObservation(owner,{...observation,sourceAsOf:'2032-12-20T11:30:00.000Z'}));});
 await check('real SQL reader has canonical amount/month/revision and strips private references',async()=>{const result=await service.read(target);assert.equal(result.state,'available');assert.equal(result.events[0].amountMinor,12345);assert.equal(result.events[0].revision,receipt.revision);assert.equal(result.events[0].periodStart,input.record.periodStart);assert(!JSON.stringify(result).includes(owner.ownerId));assert(!Object.hasOwn(result.events[0],'sourceId'));});
 await check('trusted capture composes existing reviewed producer and persists exact freshness; retry replays',async()=>{
  const source={kind:'reviewed_financial_forecast',ownerId:other.ownerId,scopeId:'synthetic-capture',reviewReference:'synthetic-reviewed-capture',ruleVersion:'synthetic-v1',fingerprint:'4'.repeat(64),items:[{key:'synthetic-item',expectedRevision:0,record:{category:'allowance',currency:'BRL',amountMinor:0,periodStart:'2032-12-18',periodEnd:'2032-12-18',aggregationLevel:'item',timezone:'UTC'}}]};
  const observation={kind:'published_source_timestamp',sourceFingerprint:source.fingerprint,evidenceDigest:'5'.repeat(64),sourceAsOf:'2032-12-20T10:00:00.000Z'};
  await assert.rejects(service.captureTrustedSource({identity:other,source,observation:{...observation,sourceFingerprint:'6'.repeat(64)},store}));
  const result=await service.captureTrustedSource({identity:other,source,observation,store});assert.equal(result.receipts.length,1);
  const replay=await service.captureTrustedSource({identity:other,source,observation,store});assert.equal(replay.receipts[0].replayed,true);
  const [[count]]=await pool.query('SELECT COUNT(*) n FROM crewcheck_financial_source_observations WHERE owner_id=?',[other.ownerId]);assert.equal(count.n,1);
 });
 await check('new ledger revision cannot inherit old freshness; zero and unknown remain distinct',async()=>{
  let revision=receipt.revision;
  for(const amountMinor of [null,0]){
   const next=await appendFinancialRecord({store,identity:owner,input:{...input,expectedRevision:revision,idempotencyKey:'synthetic-revision-'+revision,record:{...input.record,amountMinor}}});revision=next.revision;
   assert.equal((await service.read(target)).reason,'source_freshness_unproven');
   await service.recordSourceObservation(owner,{...observation,revision});
   const result=await service.read(target);assert.equal(result.events[0].amountMinor,amountMinor);assert.equal(result.events[0].revision,revision);assert.equal(result.state,amountMinor===null?'incomplete':'available');
  }
 });
 await check('reader waiting for owner writer never reuses a pre-lock old revision',async()=>{
  let writerLocked,releaseWriter,readerLooked;const locked=new Promise(r=>writerLocked=r),hold=new Promise(r=>releaseWriter=r),looked=new Promise(r=>readerLooked=r);
  const writerDb={...db,connect:async()=>{const c=await db.connect();return {...c,query:async(sql,p)=>{const result=await c.query(sql,p);if(sql.startsWith('SELECT email FROM crewcheck_platform_profiles')&&sql.includes('FOR UPDATE')){writerLocked();await hold;}return result;}};}};
  const writing=appendFinancialRecord({store:createFinancialSqlStore(writerDb),identity:owner,input:{...input,expectedRevision:3,idempotencyKey:'synthetic-current-read',record:{...input.record,amountMinor:77777}}});await locked;
  const readerDb={...db,connect:async()=>{const c=await db.connect();return {...c,query:async(sql,p)=>{const result=await c.query(sql,p);if(sql.startsWith('SELECT payload FROM crewcheck_telegram_state')&&!sql.includes('FOR UPDATE'))readerLooked();return result;}};}};
  let settled=false;const reading=createFinancialChannelSqlService(readerDb,{now:()=>new Date(clock),maxSourceAgeMs:7200000}).read(target).then(value=>{settled=true;return value;});await looked;await pause(50);assert.equal(settled,false);releaseWriter();const receipt=await writing;
  const result=await reading;assert.equal(result.reason,'source_freshness_unproven');assert.deepEqual(result.events,[]);
  await service.recordSourceObservation(owner,{...observation,revision:receipt.revision});const current=await service.read(target);assert.equal(current.events[0].revision,4);assert.equal(current.events[0].amountMinor,77777);
 });
 await check('revocation persists across new service, stale regrant conflicts',async()=>{await service.changeConsent(owner,{action:'revoke',conversationId:target.conversationId,expectedRevision:1});const fresh=createFinancialChannelSqlService(db,{now:()=>new Date(clock),maxSourceAgeMs:7200000});assert.equal((await fresh.read(target)).reason,'consent_required');await assert.rejects(fresh.changeConsent(owner,grant));await fresh.changeConsent(owner,{...grant,expectedRevision:2});});
 await check('relink and conflicting durable directions discard old grant',async()=>{await links({...link,linkedAt:'2032-12-20T11:59:00.000Z'});assert.equal((await service.read(target)).reason,'consent_required');await links(link);await put('link-email:'+owner.ownerId,{...link,chatId:'999'});assert.equal((await service.read(target)).state,'unavailable');await links(link);});
 await check('read and revocation serialize under real InnoDB locks',async()=>{
  let started,release;const reading=new Promise(r=>started=r),hold=new Promise(r=>release=r);
  const wrapped={...db,connect:async()=>{const c=await db.connect();return {...c,query:async(sql,p)=>{if(sql.startsWith('SELECT r.snapshot')){started();await hold;}return c.query(sql,p);}};}};
  const pending=createFinancialChannelSqlService(wrapped,{now:()=>new Date(clock),maxSourceAgeMs:7200000}).read(target);await reading;
  let settled=false;const revoked=service.changeConsent(owner,{action:'revoke',conversationId:target.conversationId,expectedRevision:3}).then(x=>{settled=true;return x;});
  await pause(50);assert.equal(settled,false);release();assert.equal((await pending).state,'available');await revoked;assert.equal((await service.read(target)).reason,'consent_required');await service.changeConsent(owner,{...grant,expectedRevision:4});
 });
 await check('slow commit cannot outlive consent expiry',async()=>{
  const wrapped={...db,connect:async()=>{const c=await db.connect();return {...c,query:async(sql,p)=>{const result=await c.query(sql,p);if(sql==='COMMIT')clock=grant.expiresAt;return result;}};}};
  const result=await createFinancialChannelSqlService(wrapped,{now:()=>new Date(clock),maxSourceAgeMs:7200000}).read(target);assert.equal(result.reason,'source_or_consent_expired');assert.deepEqual(result.events,[]);clock=start;
 });
 await check('old source never becomes fresh from a read',async()=>{clock='2032-12-20T15:00:00.000Z';assert.equal((await service.read(target)).reason,'source_freshness_unproven');clock=start;});
 await check('rollback leaves prior consent intact',async()=>{const broken={...db,connect:async()=>{const c=await db.connect();return {...c,query:async(sql,p)=>{if(sql.startsWith('INSERT INTO crewcheck_financial_channel_consents'))throw Error('synthetic failure');return c.query(sql,p);}};}};await assert.rejects(createFinancialChannelSqlService(broken,{now:()=>new Date(clock)}).changeConsent(owner,{action:'revoke',conversationId:target.conversationId,expectedRevision:5}));assert.equal((await service.previewConsent(owner,target.conversationId)).consent.state,'granted');});
 await check('expiry and missing profile discard financial output',async()=>{clock=grant.expiresAt;assert.equal((await service.read(target)).reason,'consent_required');clock=start;const eraser=await db.connect();await eraser.query('BEGIN');await eraser.query('SELECT email FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE',[owner.ownerId]);let settled=false;const pending=service.read(target).then(value=>{settled=true;return value;});await pause(50);assert.equal(settled,false);for(const [sql,params] of financialLedgerErasureStatements(owner.ownerId))await eraser.query(sql,params);await eraser.query('DELETE FROM crewcheck_platform_profiles WHERE email=$1',[owner.ownerId]);await eraser.query('COMMIT');eraser.release();assert.equal((await pending).state,'unavailable');const [[remaining]]=await pool.query('SELECT COUNT(*) n FROM crewcheck_financial_channel_consents WHERE owner_id=?',[owner.ownerId]);assert.equal(remaining.n,0);});
 await check('inactive rollback removes only prepared tables, reapply grants no consent',async()=>{await pool.query('DROP TABLE crewcheck_financial_channel_consents');await pool.query('DROP TABLE crewcheck_financial_source_observations');const [[ledger]]=await pool.query('SELECT COUNT(*) n FROM crewcheck_financial_revisions WHERE owner_id=?',[other.ownerId]);assert.equal(ledger.n,1);await migrate('migrations/20261020_021_financial_channel_preparation_mysql.sql');const [[rows]]=await pool.query('SELECT COUNT(*) n FROM crewcheck_financial_channel_consents');assert.equal(rows.n,0);});
 console.log(JSON.stringify({result:'PASS',engine:server.version,checks:passed,transport:'new tmpfs database/private socket/network none',migrationReplay:true,productionAccess:false,realMessages:0}));
} finally {
 if(pool)await pool.end();if(launched)docker(['rm','--force',name]);rmSync(root,{recursive:true,force:true});
}
