import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import spans from './telegram-binding/source-spans.mjs';
import {mysqlAdapter} from '../server/mysql-platform-adapter.mjs';
const sql=process.env.TELEGRAM_BINDING_QA==='isolated-mysql'?await(await import('./fixtures/telegram-binding-mysql.mjs')).telegramBindingMysqlFactory():null;
const source=fs.readFileSync('server/platform.mjs','utf8');
const fn=spans.createSourceFile('server/platform.mjs',source).statements.find(n=>n.name?.text==='handlePlatformVisitorTelegram');
assert(fn);const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const token='synthetic_visitor_invite_123',initial={id:'visitor-synthetic',owner_email:'owner@example.invalid',status:'active',telegram_token_hash:hash(token),telegram_chat_id:''};
const X='9000012345',Y='9000012346';let checks=0;
async function scenario(mode){
 let row=structuredClone(initial),lookups=0,writes=0;const sent=[];let release;const barrier=new Promise(r=>release=r);
 let real=null;
 if(sql){const fixture=await sql.make();real=mysqlAdapter(fixture.pool);await real.query('DROP TABLE IF EXISTS crewcheck_platform_visitors');await real.query('CREATE TABLE crewcheck_platform_visitors(id VARCHAR(80) PRIMARY KEY,owner_email VARCHAR(254),status VARCHAR(20),telegram_token_hash VARCHAR(64),telegram_chat_id VARCHAR(30),updated_at DATETIME(3)) ENGINE=InnoDB');await real.query('INSERT INTO crewcheck_platform_visitors VALUES($1,$2,$3,$4,$5,NOW(3))',[row.id,row.owner_email,row.status,row.telegram_token_hash,row.telegram_chat_id]);}
 const db={async query(sql,args){
  if(sql.startsWith('SELECT * FROM crewcheck_platform_visitors WHERE telegram_token_hash=')){
   const snapshot=real?(await real.query(sql,args)).rows[0]:structuredClone(row);lookups++;
   if(mode==='concurrent'){if(lookups===2)release();await barrier;}
   else if(mode==='revoked')row.status='revoked';
   else if(mode==='rotated')row.telegram_token_hash=hash('new synthetic token');
   else if(mode==='deleted')row=null;
   if(real&&mode!=='concurrent'){
    if(!row)await real.query('DELETE FROM crewcheck_platform_visitors WHERE id=$1',[initial.id]);
    else await real.query('UPDATE crewcheck_platform_visitors SET status=$2,telegram_token_hash=$3 WHERE id=$1',[row.id,row.status,row.telegram_token_hash]);
   }
   return{rows:[snapshot]};
  }
  if(sql.startsWith('UPDATE crewcheck_platform_visitors')){
   if(real){const result=await real.query(sql,args);writes+=result.rowCount;return result;}
   const conditional=sql.includes('AND telegram_token_hash=$4')&&sql.includes("status IN ('invited','active')");
   if(!row||(conditional&&(row.telegram_token_hash!==args[3]||!['invited','active'].includes(row.status))))return{rows:[],rowCount:0};
   row.telegram_chat_id=args[1];row.telegram_token_hash=args[2];writes++;return{rows:[],rowCount:1};
  }
  assert.fail('unexpected visitor-only query');
 }};
 const ctx=vm.createContext({pool:async()=>db,sha256:hash,retiredTokenHash:()=>hash('synthetic retired token')});vm.runInContext(fn.getText().replace(/^export /,'')+'\nglobalThis.handle=handlePlatformVisitorTelegram',ctx);
 const run=id=>ctx.handle({chat:{id,type:'private'},from:{id}},'/start visitor_'+token,async(chat,text)=>{sent.push({chat,text});});
 await Promise.all(mode==='concurrent'?[run(X),run(Y)]:[run(X)]);
 if(real)row=(await real.query('SELECT * FROM crewcheck_platform_visitors WHERE id=$1',[initial.id])).rows[0]||null;
 const successes=sent.filter(x=>x.text.startsWith('Telegram vinculado'));
 assert.equal(writes,mode==='concurrent'?1:0,mode+' atomic token consumption');
 assert.equal(successes.length,mode==='concurrent'?1:0,mode+' truthful response');
 if(mode==='concurrent'){assert.equal(sent.length,2);assert.equal(row.telegram_chat_id,successes[0].chat);}
 else assert(sent.every(x=>!x.text.startsWith('Telegram vinculado')));
 checks++;
}
try{for(const mode of['concurrent','revoked','rotated','deleted'])await scenario(mode);}finally{if(sql)await sql.close();}
console.log(`PASS actual prepared visitor invite CAS: ${checks} synthetic races; single token consumption and no success after revocation/rotation/deletion; ${sql?'isolated MySQL + actual platform adapter':'SQL adapter double'}, no real binding`);
