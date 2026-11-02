import assert from 'node:assert/strict';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import {mysqlAdapter} from '../server/mysql-platform-adapter.mjs';
import {withProfileLocks} from '../server/profile-locks.mjs';
import {readLockedPlatformEntitlement} from '../server/platform-entitlement.mjs';
// No DATABASE_URL, TCP or provider. Existing disposable CI database only.
globalThis.fetch=()=>{throw Error('External network forbidden');};
const socketPath='/tmp/crewcheck-notification-qa-socket/mysqld.sock';
assert.equal(process.env.CREWCHECK_NOTIFICATION_QA,'isolated-mysql');
assert.equal(process.env.CREWCHECK_QA_MYSQL_SOCKET,socketPath);
assert(fs.statSync(socketPath).isSocket());
const native=mysql.createPool({socketPath,user:'root',password:'',database:'crewcheck_notification_qa',connectionLimit:8});
const db=mysqlAdapter(native),email='entitlement@example.test',owner='ENTITLEMENT';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const bounded=(promise)=>Promise.race([promise,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('fixture barrier timed out')),5000);timer.unref();})]);
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const run=(fn)=>withProfileLocks(db,[email],fn,{repeatableRead:true});
const read=client=>readLockedPlatformEntitlement(client,{email,expectedPublicId:owner});
try{
 assert.equal((await native.query('SELECT DATABASE() name'))[0][0].name,'crewcheck_notification_qa');
 // Separate fixture tables reconstructed from canonical schema in this disposable DB.
 for(const table of ['crewcheck_platform_subscriptions','crewcheck_platform_profiles'])await native.query(`DROP TABLE IF EXISTS ${table}`);
 const migration=fs.readFileSync('migrations/20260715_003_aiven_mysql_full_platform.sql','utf8');
 for(const table of ['crewcheck_platform_profiles','crewcheck_platform_subscriptions'])await native.query(migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}[\\s\\S]*?;`))[0]);
 await native.query('INSERT INTO crewcheck_platform_profiles(email,public_id,display_name) VALUES(?,?,?)',[email,owner,'Synthetic']);
 const insert=()=>native.query("INSERT INTO crewcheck_platform_subscriptions(email,plan,status,provider) VALUES(?,'premium_monthly','active','synthetic')",[email]);
 // Missing unique-email RR gap must stop a subscription INSERT until commit.
 const locked=deferred(),release=deferred();
 const holding=run(async client=>{assert.equal((await read(client)).billing.premiumAccess,false);locked.resolve();await release.promise;});
 let inserted=false,writeError,writing;holding.catch(()=>{});
 try { await bounded(locked.promise);writing=insert().then(()=>{inserted=true;},error=>{writeError=error;});
  await pause(150);if(writeError)throw writeError;assert.equal(inserted,false,'missing subscription gap protects concurrent insert');
 } finally { release.resolve();await bounded(Promise.allSettled([holding,writing])); }
 await holding;if(writeError)throw writeError;assert.equal(inserted,true);
 assert.equal((await run(read)).billing.premiumAccess,true);
 // Existing subscription lock must block a downgrade that does not use our helper.
 const got=deferred(),done=deferred();
 const allocation=run(async client=>{assert.equal((await read(client)).billing.premiumAccess,true);got.resolve();await done.promise;});
 let downgraded=false,downgradeError,downgrade;allocation.catch(()=>{});
 try { await bounded(got.promise);downgrade=native.query("UPDATE crewcheck_platform_subscriptions SET status='canceled' WHERE email=?",[email]).then(()=>{downgraded=true;},error=>{downgradeError=error;});
  await pause(150);if(downgradeError)throw downgradeError;assert.equal(downgraded,false);
 } finally { done.resolve();await bounded(Promise.allSettled([allocation,downgrade])); }
 await allocation;if(downgradeError)throw downgradeError;
 assert.equal((await run(read)).billing.premiumAccess,false,'committed downgrade read is canonical, stale profile cannot elevate');
 await native.query("UPDATE crewcheck_platform_profiles SET plan='premium_monthly' WHERE email=?",[email]);
 assert.equal((await run(read)).billing.premiumAccess,false);
 await native.query("UPDATE crewcheck_platform_profiles SET plan='premium_unlimited' WHERE email=?",[email]);
 assert.equal((await run(read)).billing.premiumAccess,true);
 await native.query("UPDATE crewcheck_platform_profiles SET public_id='RECREATED' WHERE email=?",[email]);
 await assert.rejects(run(read),{code:'ENTITLEMENT_OWNER_MISMATCH'});
 await native.query('UPDATE crewcheck_platform_profiles SET public_id=? WHERE email=?',[owner,email]);
 // Actual Asaas-shaped subscription->profile inversion vs profile->subscription.
 const one=await native.getConnection(),two=await native.getConnection();
 try{
  await one.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await one.beginTransaction();
  await two.beginTransaction();
  await one.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[email]);
  await two.query('SELECT email FROM crewcheck_platform_subscriptions WHERE email=? FOR UPDATE',[email]);
  const first=one.query('SELECT email FROM crewcheck_platform_subscriptions WHERE email=? FOR UPDATE',[email]).then(()=>one.commit(),async error=>{await one.rollback();throw error;});
  const second=two.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE',[email]).then(()=>two.commit(),async error=>{await two.rollback();throw error;});
  const results=await Promise.allSettled([first,second]);
  assert.equal(results.filter(x=>x.status==='rejected'&&x.reason.code==='ER_LOCK_DEADLOCK').length,1);
 }finally{await one.rollback();await two.rollback();one.release();two.release();}
 console.log('PASS real MySQL canonical row/gap lock, downgrade serialization, current owner binding and Asaas-shaped lock inversion');
}finally{await native.end();}
