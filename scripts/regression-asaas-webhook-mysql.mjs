import assert from 'node:assert/strict';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import {mysqlAdapter} from '../server/mysql-platform-adapter.mjs';
import {runAsaasScenarios} from './asaas-inbox-scenarios.mjs';
globalThis.fetch=()=>{throw Error('Provider/network forbidden in Asaas MySQL fixture');};
const socketPath='/tmp/crewcheck-notification-qa-socket/mysqld.sock';
assert.equal(process.env.CREWCHECK_NOTIFICATION_QA,'isolated-mysql');
assert.equal(process.env.CREWCHECK_QA_MYSQL_SOCKET,socketPath);
assert(fs.statSync(socketPath).isSocket());
const native=mysql.createPool({socketPath,user:'root',password:'',database:'crewcheck_notification_qa',connectionLimit:8,dateStrings:true});
const db=mysqlAdapter(native),migration=fs.readFileSync('migrations/20261018_001_asaas_webhook_inbox.sql','utf8');
try {
  assert.equal((await native.query('SELECT DATABASE() AS name'))[0][0].name,'crewcheck_notification_qa');
  for(const name of ['crewcheck_asaas_webhook_inbox','crewcheck_asaas_subscription_locks','crewcheck_platform_subscriptions','crewcheck_platform_profiles','crewcheck_platform_webhook_events'])await native.query('DROP TABLE IF EXISTS '+name);
  for(let repeat=0;repeat<2;repeat++)for(const statement of migration.split(';').map(x=>x.trim()).filter(Boolean))await native.query(statement);
  const platform=fs.readFileSync('migrations/20260715_003_aiven_mysql_full_platform.sql','utf8');
  for(const name of ['crewcheck_platform_subscriptions','crewcheck_platform_webhook_events'])await native.query(platform.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+'[\\s\\S]*?ENGINE=InnoDB[^;]*;'))[0]);
  await native.query('CREATE TABLE crewcheck_platform_profiles(email VARCHAR(254) PRIMARY KEY,plan VARCHAR(40),updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB');
  await runAsaasScenarios({db,
    async reset(){for(const name of ['crewcheck_asaas_webhook_inbox','crewcheck_asaas_subscription_locks','crewcheck_platform_subscriptions','crewcheck_platform_profiles','crewcheck_platform_webhook_events'])await native.query('DELETE FROM '+name);},
    async seed(row={}){const s={email:'fictional@example.test',plan:'premium_monthly',status:'pending',provider:'asaas',provider_ref:'sub_synthetic',metadata:{},current_period_end:null,...row};await native.query('INSERT INTO crewcheck_platform_subscriptions(email,plan,status,provider,provider_ref,current_period_end,metadata) VALUES(?,?,?,?,?,?,?)',[s.email,s.plan,s.status,s.provider,s.provider_ref,s.current_period_end,JSON.stringify(s.metadata)]);if(!s.noProfile)await native.query('INSERT INTO crewcheck_platform_profiles(email,plan) VALUES(?,?)',[s.email,s.profilePlan||'free']);},
    async legacy(id){await native.query("INSERT INTO crewcheck_platform_webhook_events(provider,event_id,payload_hash) VALUES('asaas',?,?)",[id,'0'.repeat(64)]);},
    async state(){const receipts=Object.fromEntries((await native.query('SELECT * FROM crewcheck_asaas_webhook_inbox'))[0].map(x=>[x.event_id,x]));const subscriptions=(await db.query('SELECT * FROM crewcheck_platform_subscriptions')).rows;const profiles=Object.fromEntries((await native.query('SELECT * FROM crewcheck_platform_profiles'))[0].map(x=>[x.email,x.plan]));return {receipts,subscriptions,profiles};},
  });
  console.log('PASS actual isolated MySQL8.4: atomic receipt, order, concurrent duplicate, rollback and explicit retry.');
}finally{await native.end();}
