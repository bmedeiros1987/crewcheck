import assert from 'node:assert/strict';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
const socketPath='/tmp/crewcheck-notification-qa-socket/mysqld.sock',database='crewcheck_telegram_binding_qa';
export async function telegramBindingMysqlFactory(){
 assert.equal(process.env.CREWCHECK_NOTIFICATION_QA,'isolated-mysql');assert.equal(process.env.CREWCHECK_QA_MYSQL_SOCKET,socketPath);assert(fs.statSync(socketPath).isSocket());
 const setup=await mysql.createConnection({socketPath,user:'root',password:''});await setup.query('CREATE DATABASE IF NOT EXISTS crewcheck_telegram_binding_qa');await setup.end();
 const db=mysql.createPool({socketPath,user:'root',password:'',database,connectionLimit:24});assert.equal((await db.query('SELECT DATABASE() AS name'))[0][0].name,database);
 const parse=p=>typeof p==='string'?JSON.parse(p):p;
 return {close:()=>db.end(),async make(){
  await db.query('DROP TABLE IF EXISTS crewcheck_telegram_state');await db.query('CREATE TABLE crewcheck_telegram_state(state_key VARCHAR(255) PRIMARY KEY,payload JSON NOT NULL,updated_at DATETIME(3) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  let faults=[];const stats={released:0,destroyed:0,commits:0,rollbacks:0};const inject=tag=>{if(faults[0]===tag){faults.shift();throw Error('SYNTHETIC_DB_FAILURE');}};
  const pool={query:(...args)=>db.query(...args),async getConnection(){inject('connect');const connection=await db.getConnection();return {async beginTransaction(){inject('begin');return connection.beginTransaction();},async query(sql,p=[]){inject('query');if(sql.startsWith('INSERT INTO'))inject('write:'+String(p[0]).split(':')[0]);if(sql.startsWith('DELETE FROM'))inject('delete:'+String(p[0]).split(':')[0]);return connection.query(sql,p);},async commit(){inject('commit-before');await connection.commit();stats.commits++;inject('commit-after');},async rollback(){stats.rollbacks++;inject('rollback');return connection.rollback();},release(){stats.released++;connection.release();},destroy(){stats.destroyed++;connection.destroy();}};}};
  const seed=async rows=>{for(const[key,value]of Object.entries(rows))await db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload)',[key,JSON.stringify(value)]);};
  return {pool,stats,failNext:tag=>{faults=Array.isArray(tag)?[...tag]:[tag];},seed,async seedLink(value){await seed(Object.fromEntries(['link-email:'+value.email,'link-chat:'+value.chatId,'link-code:'+value.code].map(key=>[key,value])));},async state(){return Object.fromEntries((await db.query('SELECT state_key,payload FROM crewcheck_telegram_state ORDER BY state_key'))[0].map(row=>[row.state_key,parse(row.payload)]));}};
 }};
}
