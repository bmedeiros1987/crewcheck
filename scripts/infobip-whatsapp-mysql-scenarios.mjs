import {createOfflineInfobipReceiver} from '../server/infobip-whatsapp-candidate.mjs';
// Invoked only AFTER the owned-socket/clean-HEAD checks in the SQL harness.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {createInfobipWhatsAppRuntime,INFOBIP_WHATSAPP_CALLBACK_PATH} from '../server/infobip-whatsapp-runtime.mjs';
import {eraseWhatsAppAccountState} from '../server/whatsapp-lifecycle.mjs';
import {mysqlAdapter} from '../server/mysql-platform-adapter.mjs';
import {createInfobipSqlStore} from '../server/infobip-whatsapp-store.mjs';

export async function runMysqlScenarios({run,db,reset,make,event,eventKey,stateKey,sender,recipient,email,owner,key,salt,password,epoch,setClock}) {
 const packet=item=>({method:'POST',rawHeaders:['Authorization','Basic '+Buffer.from('synthetic:'+password).toString('base64')],rawBody:Buffer.from(JSON.stringify({results:[item]}))});
 const raw=async()=>{const [r]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[stateKey]);return typeof r[0]?.payload==='string'?JSON.parse(r[0].payload):r[0]?.payload;};
 const configuration={sender,encryptionKey:key,linkHashKey:salt,webhookUsername:'synthetic',webhookPassword:password,baseUrl:'https://synthetic.api.infobip.com',apiKey:'synthetic-api-key-not-real'};
 await run('HMAC raw inbound keeps durable SQL dedup across recreation and key rotation',async()=>{
   await reset();
   const receive=secretKey=>createOfflineInfobipReceiver({sender,authentication:{mode:'hmac-sha256',secretKey},store:createInfobipSqlStore({db,sender,encryptionKey:key,linkHashKey:salt,now:()=>epoch}),now:()=>epoch});
   const signed=(secretKey,item=event)=>{const rawBody=Buffer.from(JSON.stringify({results:[item]}));return {method:'POST',rawHeaders:['x-hub-signature','SHA256='+createHmac('sha256',secretKey).update(rawBody).digest('hex').toUpperCase()],rawBody};};
   const first='synthetic-hmac-key-one',rotated='synthetic-hmac-key-two';
   const results=await Promise.all(Array.from({length:8},()=>receive(first)(signed(first))));
   assert.equal(results.reduce((n,r)=>n+r.accepted,0),1);assert.equal(results.reduce((n,r)=>n+r.duplicates,0),7);
   assert.equal((await receive(rotated)(signed(rotated))).duplicates,1);
   assert.equal((await receive(rotated)(signed(rotated,{...event,message:{type:'TEXT',text:'CONFLICTING SYNTHETIC'}}))).status,503);
   assert.equal((await raw()).status,'held');
 });
 await run('canonical authenticated link start and Infobip completion through enabled HTTP composition',async()=>{
   await reset();await db.query('DELETE FROM crewcheck_whatsapp_links');
   const source=fs.readFileSync(new URL('../server/whatsapp.mjs',import.meta.url),'utf8');
   const start=source.slice(source.indexOf('async function handleLinkStart('),source.indexOf('\nasync function handleLinkStatus('));
   let code,authorized=0,sent=0,scheduled,cleared=0;
   const ctx={requireIdentity:async req=>{authorized++;return req.identity;},readJsonBody:async req=>req.body,
     ensureWhatsAppTables:async()=>db,auditSecret:()=>salt,LINK_TTL_MINUTES:10,crypto:{randomInt:()=>654321},
     linkCodeHash:value=>createHmac('sha256',salt).update(`crewcheck-whatsapp-link|${value}`).digest('hex'),
     normalizePhone:value=>value,businessNumber:()=>sender,sendJson:(_res,status,payload)=>{code=payload.code;return {status,payload};}};
   vm.createContext(ctx);vm.runInContext(start,ctx);
   await ctx.handleLinkStart({method:'POST',identity:null,body:{consentConcierge:true}},{});
   assert.equal((await ctx.handleLinkStart({method:'POST',identity:{email},body:{consentConcierge:false}},{})).status,400);
   assert.equal((await ctx.handleLinkStart({method:'POST',identity:{email},body:{consentConcierge:true}},{})).status,200);
   assert.equal(authorized,3);assert.equal(code,'654321');
   const runtime=createInfobipWhatsAppRuntime({enabled:true,db,configuration,now:()=>epoch,
     scheduler:{set:fn=>{scheduled=fn;return 1;},clear:()=>{cleared++;}},concierge:async()=>assert.fail('link confirmation must not call engine'),
     request:async(_url,{body})=>{sent++;const m=JSON.parse(body);assert.equal(m.to,recipient);assert(!m.content.text.includes(code));return new Response(JSON.stringify({to:m.to,messageId:m.messageId,status:{groupId:1,groupName:'PENDING',id:26,name:'PENDING_ACCEPTED'}}));}});
   try {
     const item={...event,message:{type:'TEXT',text:code}},req=Readable.from([packet(item).rawBody]);
     Object.assign(req,{method:'POST',rawHeaders:packet(item).rawHeaders,headers:{'content-type':'application/json'},socket:{encrypted:true}});
     const res={writeHead(status){this.status=status;},end(body){this.body=body;this.writableEnded=true;}};
     assert.equal(await runtime.handleRoute(req,res,new URL(INFOBIP_WHATSAPP_CALLBACK_PATH,'https://example.invalid')),true);assert.equal(res.status,200);
     await runtime.maintain();assert.equal(sent,1);assert.equal(typeof scheduled,'function');
     const [[link]]=await db.query('SELECT email,consent_concierge,phone_cipher FROM crewcheck_whatsapp_links');assert.equal(link.email,email);assert.equal(link.consent_concierge,1);assert(!link.phone_cipher.includes(recipient));
     const [[count]]=await db.query('SELECT COUNT(*) AS n FROM crewcheck_whatsapp_link_codes');assert.equal(count.n,0);
     assert.equal((await make().receive(packet(item))).duplicates,1);await runtime.maintain();assert.equal(sent,1);
     const stored=JSON.stringify((await db.query('SELECT payload FROM crewcheck_telegram_state'))[0]);assert(!stored.includes('"text":"654321"'));
   } finally {await runtime.dispose();assert.equal(cleared,1);}
 });
 await run('link proof expiry, phone conflict and durable attempt bound',async()=>{
   for(const scenario of ['expired','conflict','rate']){
     await reset();if(scenario!=='conflict')await db.query('DELETE FROM crewcheck_whatsapp_links');
     const target=scenario==='conflict'?'other@example.invalid':email;
     if(scenario==='conflict')await db.query('INSERT INTO crewcheck_platform_profiles VALUES(?,?,NOW(3))',[target,'synthetic-other-owner']);
     const codeHash=createHmac('sha256',salt).update('crewcheck-whatsapp-link|654321').digest('hex');
     await db.query(`INSERT INTO crewcheck_whatsapp_link_codes(email,code_hash,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ${scenario==='expired'?-1:10} MINUTE))`,[target,codeHash]);
     const {receive}=make();
     if(scenario==='rate')for(let i=0;i<5;i++)assert.equal((await receive(packet({...event,messageId:'synthetic-bad-'+i,message:{type:'TEXT',text:'000000'}}))).denied,1);
     assert.equal((await receive(packet({...event,message:{type:'TEXT',text:'654321'}}))).denied,1);
     const [links]=await db.query('SELECT email FROM crewcheck_whatsapp_links');assert.equal(links.length,scenario==='conflict'?1:0);if(links.length)assert.equal(links[0].email,email);
   }
 });
 await run('real query deadline destroys waiting connection and pool remains usable',async()=>{
   await reset();const blocker=await db.getConnection();await blocker.beginTransaction();
   await blocker.query('SELECT email FROM crewcheck_whatsapp_links WHERE email=? FOR UPDATE',[email]);
   try {assert.equal((await make().receive(packet(event))).status,503);assert.equal(await raw(),undefined);}
   finally{await blocker.rollback();blocker.release();}
   assert.equal((await make().receive(packet(event))).accepted,1);
 });
 await run('real DLR correlation and retained replay tombstone then purge',async()=>{
   await reset();const {store,receive}=make();await receive(packet(event));await store.exerciseDispatch(eventKey,{concierge:async()=> 'SYNTHETIC',send:async()=>({status:'accepted_unconfirmed'})});
   assert.equal((await store.recordDelivery({eventKey,recipient,sentAt:epoch,doneAt:epoch+1000})).status,'delivered');
   assert.equal((await store.recordDelivery({eventKey,recipient,sentAt:epoch,doneAt:epoch+1000})).status,'duplicate');
   await reset();await make().receive(packet(event));setClock(epoch+900001);await store.maintain();assert.equal((await raw()).sealed,null);
   assert.equal((await make().receive(packet(event))).duplicates,1);setClock(epoch+73*3600_000);await store.maintain();assert.equal(await raw(),undefined);assert.equal((await make().receive(packet(event))).status,400);
 });
 await run('account erase joins actual platform transaction and rolls back atomically',async()=>{
   await reset();await make().receive(packet(event));
   const runtime=createInfobipWhatsAppRuntime({enabled:true,db,configuration,now:()=>epoch,scheduler:{set:()=>1,clear(){}},concierge:async()=>assert.fail(),request:async()=>assert.fail()});
   const client=await mysqlAdapter(db).connect();
   try{
     await client.query('BEGIN');await eraseWhatsAppAccountState(email,{client});
     const erased=await client.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=$1',[stateKey]);assert.equal(erased.rows[0].payload.sealed,null);
     await client.query('ROLLBACK');assert((await raw()).sealed);
     await client.query('BEGIN');await eraseWhatsAppAccountState(email,{client});await client.query('DELETE FROM crewcheck_platform_profiles WHERE email=$1',[email]);await client.query('COMMIT');
     assert.equal((await raw()).sealed,null);assert.equal((await raw()).ownerHash,null);assert.equal((await make().receive(packet(event))).denied,1);
   }finally{client.release();await runtime.dispose();}
 });
}

export async function verifyNamespaceIsolation({run,db,reset,make,event,sender,key,salt,email}) {
 await run('all three namespace scans use range index and leave foreign rows unlocked',async()=>{
  for(const operation of ['nextHeld','maintain','eraseAccount']){
   await reset();await make().receive({method:'POST',rawHeaders:['Authorization','Basic '+Buffer.from('synthetic:synthetic-webhook-password-not-real').toString('base64')],rawBody:Buffer.from(JSON.stringify({results:[event]}))});
   const values=Array.from({length:256},(_,i)=>['telegram-qa-foreign:'+String(i).padStart(4,'0'),JSON.stringify({n:0}),'2032-01-01 12:00:00.000']);
   await db.query('INSERT INTO crewcheck_telegram_state(state_key,payload,updated_at) VALUES ?',[values]);
   let enter,release;const entered=new Promise(r=>enter=r),hold=new Promise(r=>release=r);
   const wrapped={getConnection:async()=>{const c=await db.getConnection();return {
    beginTransaction:()=>c.beginTransaction(),commit:()=>c.commit(),rollback:()=>c.rollback(),release:()=>c.release(),destroy:()=>c.destroy(),
    async query(sql,params){
     const selected=operation==='nextHeld'?sql.startsWith('SELECT state_key FROM'):operation==='maintain'?sql.startsWith('SELECT state_key,payload'):sql.startsWith('UPDATE crewcheck_telegram_state SET payload=JSON_SET');
     if(selected){const [plan]=await c.query('EXPLAIN '+sql,params);assert(plan.length);assert(plan.every(row=>row.type==='range'&&row.key==='PRIMARY'),'prove indexed prefix range for '+operation);}
     const result=await c.query(sql,params);if(selected){enter();await hold;}return result;
    },
   };}};
   const store=createInfobipSqlStore({db:wrapped,sender,encryptionKey:key,linkHashKey:salt,now:()=>Date.parse(event.receivedAt)});
   const running=operation==='eraseAccount'?store.eraseAccount(email):store[operation]();
   try{await Promise.race([entered,running.then(()=>assert.fail('scan never reached lock'))]);
    const [updated]=await db.query({sql:"UPDATE crewcheck_telegram_state SET payload=JSON_SET(payload,'$.n',1) WHERE state_key='telegram-qa-foreign:0128'",timeout:500});
    assert.equal(updated.affectedRows,1,'foreign namespace update must succeed while Infobip locks held');
   }finally{release();await running;}
  }
 });
}
