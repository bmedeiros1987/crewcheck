// Disposable socket only. No provider, app bootstrap, credentials or real account.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createSharedCreditCandidate,sharedCreditKey as key,CONCIERGE_SHARED_CREDIT_SHIPPING} from '../server/concierge-shared-credit-candidate.mjs';
import {createPromotionalConciergeAdmission} from '../server/concierge-promotional-admission.mjs';
import {createInfobipSqlBudget} from '../server/infobip-whatsapp-sql-budget.mjs';
const [mode,rootArg,socketArg,head,modulesRoot=process.cwd()]=process.argv.slice(2);
assert(['suite','restart','worker'].includes(mode));assert(/^[a-f0-9]{40}$/.test(head));
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),head);
const root=fs.realpathSync(rootArg),socket=fs.realpathSync(socketArg);
assert.equal(path.dirname(root),fs.realpathSync('/tmp'));assert(/^crewcheck-credit-sql\.[A-Za-z0-9_]+$/.test(path.basename(root)));
assert.equal(fs.readFileSync(path.join(root,'.owned-qa'),'utf8').trim(),head);
assert.equal(path.dirname(socket),root);assert(fs.statSync(socket).isSocket());
const mysql=createRequire(path.join(fs.realpathSync(modulesRoot),'package.json'))('mysql2/promise');
globalThis.fetch=()=>assert.fail('NETWORK_FORBIDDEN');
const admin=await mysql.createConnection({socketPath:socket,user:'root',password:'',connectTimeout:2000});
const [[identity]]=await admin.query('SELECT VERSION() AS version,@@datadir AS datadir,@@skip_networking AS no_tcp');
assert(/^8\.4\./.test(identity.version));assert.equal(Number(identity.no_tcp),1);assert.equal(fs.realpathSync(identity.datadir),path.join(root,'data'));
if(mode==='suite')await admin.query('CREATE DATABASE crewcheck_credit_qa');await admin.end();
const db=mysql.createPool({socketPath:socket,user:'root',password:'',database:'crewcheck_credit_qa',connectionLimit:40,connectTimeout:2000});
const epoch=Date.parse('2032-10-24T12:00:00Z'),hash=x=>createHash('sha256').update(x).digest('hex');
const sender='12025550100',recipient='12025550101',phoneHash=hash(recipient),owner='SYNTHETIC-A',other='SYNTHETIC-B';
const account=hash(owner),otherAccount=hash(other),event=n=>hash('synthetic-event-'+n);
const job=(n,channel='whatsapp')=>({accountKey:account,sender,recipient,bindingStamp:'synthetic-revision-1',eventKey:event(n),channel});
const quote=channel=>({channel,currency:'USD',country:'BR',sender,sourceId:'synthetic-fixture-not-live-tariff',verifiedAt:epoch,category:'service-text',sessionUntil:epoch+60000,unitMicroUsd:12000,markupMicroUsd:0,setupMicroUsd:0,...(channel==='voice'?{unitMicroUsd:30000,quantumSeconds:60,maxDurationSeconds:61}: {})});
// Test-only resolver demonstrates exact canonical association and row locks.
// A production resolver/entitlement source is intentionally not installed.
async function context(c,j){
 const [links]=await c.query('SELECT email,consent_concierge,revoked_at,revision FROM credit_qa_links WHERE BINARY phone_hash=BINARY ? FOR UPDATE',[hash(j.recipient)]);
 if(links.length!==1||links[0].consent_concierge!==1||links[0].revoked_at!==null)return null;
 const [profiles]=await c.query('SELECT public_id FROM credit_qa_profiles WHERE BINARY email=BINARY ? FOR UPDATE',[links[0].email]);
 if(profiles.length!==1||!profiles[0].public_id)return null;
 const [same]=await c.query('SELECT public_id FROM credit_qa_profiles WHERE BINARY public_id=BINARY ? FOR UPDATE',[profiles[0].public_id]);
 if(same.length!==1)return null;
 return {accountKey:hash(profiles[0].public_id),linked:true,consent:true,bindingStamp:j.bindingStamp.startsWith('[')?JSON.stringify([profiles[0].public_id,links[0].revision,'infobip',sender,j.recipient]):links[0].revision,sender,recipient:j.recipient,quote:quote(j.channel)};
}
const policy=id=>({enabled:true,budgetApproved:true,monthlyBudgetMicroUsd:50000,programId:id,allowedChannels:['whatsapp','voice']});
const candidate=(id,overrides={})=>createSharedCreditCandidate({...policy(id),...overrides},{now:()=>epoch,resolveTrustedContext:context});
const transaction=createInfobipSqlBudget(db);
const read=async k=>{const [rows]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[k]);return rows.length?(typeof rows[0].payload==='string'?JSON.parse(rows[0].payload):rows[0].payload):null;};
const write=(k,v)=>db.query('INSERT INTO crewcheck_telegram_state(state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload)',[k,JSON.stringify(v)]);
async function seed(id,{balance=1000000,budget=50000,spent=0}={}){
 await write(key('account',[id,account]),{v:1,kind:'account-credit',accountKey:account,availableMicroUsd:balance,reservedMicroUsd:0});
 await write(key('global',[id,'2032-10']),{v:1,kind:'global-credit',period:'2032-10',budgetMicroUsd:budget,knownSpentMicroUsd:spent,reservedMicroUsd:0,reconciled:true,reconciledAt:epoch});
}
const reserve=(id,n,channel='whatsapp')=>transaction(c=>candidate(id).reserve(c,job(n,channel)));
const promoPolicy={enabled:true,version:1,approvalId:'synthetic-promotional-approval',programId:'promotional',ownerAccountKey:account,sender,recipient,validFrom:epoch-1000,validUntil:epoch+86400000,maxReplies:2,monthlyBudgetMicroUsd:50000};
const promo=()=>createPromotionalConciergeAdmission(promoPolicy,{now:()=>epoch,resolveTrustedContext:context});
const promoJob=n=>({...job(n),provider:'infobip',receivedAt:epoch,bindingStamp:JSON.stringify([owner,'synthetic-revision-1','infobip',sender,recipient])});
const passed=[];assert.equal(CONCIERGE_SHARED_CREDIT_SHIPPING,false);
try{
 if(mode==='suite'){
  await db.query('CREATE TABLE crewcheck_telegram_state(state_key VARCHAR(255) PRIMARY KEY,payload JSON NOT NULL,updated_at DATETIME(3) NOT NULL) ENGINE=InnoDB');
  await db.query('CREATE TABLE credit_qa_profiles(email VARCHAR(160) PRIMARY KEY,public_id VARCHAR(80) NOT NULL,INDEX(public_id)) ENGINE=InnoDB');
  await db.query('CREATE TABLE credit_qa_links(phone_hash CHAR(64) PRIMARY KEY,email VARCHAR(160) NOT NULL,consent_concierge TINYINT NOT NULL,revoked_at DATETIME(3),revision VARCHAR(80) NOT NULL) ENGINE=InnoDB');
  await db.query('INSERT INTO credit_qa_profiles VALUES(?,?),(?,?)',['a@synthetic.invalid',owner,'b@synthetic.invalid',other]);
  await db.query('INSERT INTO credit_qa_links VALUES(?,?,1,NULL,?)',[phoneHash,'a@synthetic.invalid','synthetic-revision-1']);
  await seed('concurrent');const users=[];
  for(let n=0;n<35;n++){
   const publicId='SYNTHETIC-CONCURRENT-'+n,email='concurrent-'+n+'@synthetic.invalid',to=String(12025550200+n),a=hash(publicId);users.push({a,to});
   await db.query('INSERT INTO credit_qa_profiles VALUES(?,?)',[email,publicId]);
   await db.query('INSERT INTO credit_qa_links VALUES(?,?,1,NULL,?)',[hash(to),email,'synthetic-revision-1']);
   await write(key('account',['concurrent',a]),{v:1,kind:'account-credit',accountKey:a,availableMicroUsd:1000000,reservedMicroUsd:0});
  }
  const results=await Promise.all(users.map(({a,to},n)=>transaction(c=>candidate('concurrent').reserve(c,{...job(n),accountKey:a,recipient:to}))));
  assert.equal(results.filter(Boolean).length,4);assert.equal((await read(key('global',['concurrent','2032-10']))).reservedMicroUsd,48000);
  let sum=0;for(const {a} of users)sum+=(await read(key('account',['concurrent',a]))).reservedMicroUsd;assert.equal(sum,48000);
  passed.push('35 distinct canonical accounts share one global SQL budget');
  await seed('duplicate');assert.equal((await Promise.all(Array.from({length:24},()=>reserve('duplicate',1)))).filter(Boolean).length,1);passed.push('24 concurrent copies reserve once');
  assert.equal(await reserve('duplicate',1,'voice'),false);assert.equal((await read(key('account',['duplicate',account]))).reservedMicroUsd,12000);passed.push('channel change cannot mint balance or repeat event');
  for(let boundary=1;boundary<=4;boundary++){
   const id='rollback-'+boundary;await seed(id);let updates=0;
   await assert.rejects(transaction(async c=>{
    const wrapped={...c,query:async(sql,args)=>{if(sql.startsWith('UPDATE crewcheck_telegram_state')&&++updates===boundary)throw Error('SYNTHETIC_UPDATE_FAILURE');return c.query(sql,args);}};
    assert(await candidate(id).reserve(wrapped,job(boundary)));
    if(boundary===4){await c.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3))',['synthetic-preparing-'+boundary,'{"status":"preparing"}']);throw Error('SYNTHETIC_AFTER_PREPARING');}
   }));
   assert.equal((await read(key('account',[id,account]))).reservedMicroUsd,0);assert.equal((await read(key('global',[id,'2032-10']))).reservedMicroUsd,0);assert.equal(await read(key('request',[id,event(boundary)])),null);assert.equal(await read('synthetic-preparing-'+boundary),null);
  }passed.push('three update boundaries and post-preparing rollback are atomic');
  await seed('owner');await db.query('UPDATE credit_qa_links SET email=? WHERE phone_hash=?',['b@synthetic.invalid',phoneHash]);assert.equal(await reserve('owner',1),false);await db.query('UPDATE credit_qa_links SET email=? WHERE phone_hash=?',['a@synthetic.invalid',phoneHash]);
  await db.query('UPDATE credit_qa_links SET consent_concierge=0 WHERE phone_hash=?',[phoneHash]);assert.equal(await reserve('owner',2),false);await db.query('UPDATE credit_qa_links SET consent_concierge=1 WHERE phone_hash=?',[phoneHash]);
  await db.query('INSERT INTO credit_qa_profiles VALUES(?,?)',['duplicate@synthetic.invalid',owner]);assert.equal(await reserve('owner',3),false);await db.query('DELETE FROM credit_qa_profiles WHERE email=?',['duplicate@synthetic.invalid']);
  assert.equal(await transaction(c=>candidate('owner').reserve(c,{...job(4),bindingStamp:'stale-revision'})),false);passed.push('owner reassignment, revoked consent, ambiguous canonical identity and stale binding deny');
  await seed('missing');await db.query('DELETE FROM crewcheck_telegram_state WHERE state_key=?',[key('account',['missing',account])]);assert.equal(await reserve('missing',1),false);assert.equal(await transaction(c=>candidate('missing',{monthlyBudgetMicroUsd:100000}).reserve(c,job(2))),false);passed.push('no implicit grant or enlarged budget');
  await seed('uncertain');let loseAck=true;
  const ackDb={async getConnection(){const c=await db.getConnection();return {query:c.query.bind(c),beginTransaction:c.beginTransaction.bind(c),rollback:c.rollback.bind(c),release:c.release.bind(c),destroy:c.destroy.bind(c),async commit(){await c.commit();if(loseAck){loseAck=false;throw Error('SYNTHETIC_ACK_LOST_AFTER_REAL_COMMIT');}}};}};
  await assert.rejects(createInfobipSqlBudget(ackDb)(c=>candidate('uncertain').reserve(c,job(1))));assert.equal(await reserve('uncertain',1),false);assert.equal((await read(key('global',['uncertain','2032-10']))).reservedMicroUsd,12000);passed.push('lost real COMMIT acknowledgement retains reservation, no retry debit');
  await seed('promotional-expiry',{balance:24000});let delayedClock=epoch;const expiring=createPromotionalConciergeAdmission({...promoPolicy,approvalId:'synthetic-expiring-approval',programId:'promotional-expiry',validUntil:epoch+10},{now:()=>delayedClock,resolveTrustedContext:async(c,j)=>{const r=await context(c,j);delayedClock=epoch+10;return r;}});
  await assert.rejects(transaction(c=>expiring.reserve(c,promoJob(9))));assert.equal((await read(key('account',['promotional-expiry',account]))).reservedMicroUsd,0);assert.equal(await read(key('promotional-admission',['synthetic-expiring-approval'])),null);passed.push('expiry during awaited credit reservation rolls back all credit and quantity writes');
  await seed('promotional',{balance:24000});assert.equal(await transaction(c=>promo().reserve(c,promoJob(1))),true);
  assert.equal(await transaction(c=>promo().reserve(c,promoJob(1))),false);passed.push('integrated promotional quantity and credit reserve once in SQL');
  await seed('lock-expiry');let waitedClock=epoch,enteredResolve;const entered=new Promise(r=>enteredResolve=r);
  const blocking=await db.getConnection();await blocking.beginTransaction();await blocking.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[key('global',['lock-expiry','2032-10'])]);
  let settled=false;const delayed=createSharedCreditCandidate(policy('lock-expiry'),{now:()=>waitedClock,resolveTrustedContext:context});
  const waiting=transaction(c=>delayed.reserve({...c,query:async(sql,args)=>{if(sql.startsWith('SELECT payload')&&args[0]===key('global',['lock-expiry','2032-10']))enteredResolve();return c.query(sql,args);}},job(51))).finally(()=>{settled=true;});
  await entered;await new Promise(r=>setTimeout(r,100));assert.equal(settled,false,'real SELECT FOR UPDATE is blocked by owned connection');waitedClock=epoch+60000;await blocking.commit();blocking.release();assert.equal(await waiting,false);
  assert.equal((await read(key('account',['lock-expiry',account]))).reservedMicroUsd,0);assert.equal(await read(key('request',['lock-expiry',event(51)])),null);
  await seed('last-write-expiry');let updateClock=epoch,count=0;const lastWrite=createSharedCreditCandidate(policy('last-write-expiry'),{now:()=>updateClock,resolveTrustedContext:context});
  await assert.rejects(transaction(c=>lastWrite.reserve({...c,query:async(sql,args)=>{const result=await c.query(sql,args);if(sql.startsWith('UPDATE crewcheck_telegram_state')&&++count===3)updateClock=epoch+60000;return result;}},job(52))));
  assert.equal((await read(key('account',['last-write-expiry',account]))).reservedMicroUsd,0);assert.equal((await read(key('global',['last-write-expiry','2032-10']))).reservedMicroUsd,0);assert.equal(await read(key('request',['last-write-expiry',event(52)])),null);
  passed.push('real SQL lock wait expires session without debit; expiry after final real UPDATE throws and rolls back all writes');
  await seed('restart');assert.equal(await reserve('restart',1),true);
  execFileSync(process.execPath,[...process.execArgv,process.argv[1],'worker',root,socket,head,modulesRoot],{stdio:'pipe',timeout:10000});passed.push('separate Node process cannot repeat retained event');
 }else{
  assert.equal(await reserve('restart',1),false);assert.equal(await reserve('uncertain',1),false);
  assert.equal((await read(key('global',['restart','2032-10']))).reservedMicroUsd,12000);assert.equal((await read(key('global',['uncertain','2032-10']))).reservedMicroUsd,12000);
  if(mode==='restart'){assert.equal(await transaction(c=>promo().reserve(c,promoJob(1))),false);assert.equal(await transaction(c=>promo().reserve(c,promoJob(2))),true);assert.equal(await transaction(c=>promo().reserve(c,promoJob(3))),false);assert.equal((await read(key('account',['promotional',account]))).reservedMicroUsd,24000);passed.push('promotional limit survives actual restart and spends only remaining credit');}
  passed.push(mode==='restart'?'actual MySQL restart preserves normal and uncertain reservation':'separate process retains idempotency');
 }
 console.log(JSON.stringify({head,phase:mode,mysql:identity.version,passed,shipping:false,externalCalls:0,providerCalls:0}));
}finally{await db.end();}
