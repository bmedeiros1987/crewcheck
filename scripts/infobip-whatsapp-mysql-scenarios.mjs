import {createInfobipSendAdmission} from '../server/infobip-whatsapp-admission.mjs';
import {preflightInfobipWhatsAppStorage} from '../server/infobip-whatsapp-preflight.mjs';
import {EventEmitter} from 'node:events';
import {createInfobipWhatsAppApplicationHost,createInfobipRenderHttpServer} from '../server/infobip-whatsapp-application.mjs';
import {createInfobipWhatsAppHost,createInfobipDirectTlsListener} from '../server/infobip-whatsapp-host.mjs';
import {createInfobipWhatsAppProduction} from '../server/infobip-whatsapp-production.mjs';
import {INFOBIP_SINGLE_TEST_APPROVAL,INFOBIP_SINGLE_TEST_INPUT} from '../server/infobip-whatsapp-single-test.mjs';
import {configureWhatsAppConcierge,invokeConfiguredWhatsAppConcierge,withWhatsAppConciergeQuiesced} from '../server/whatsapp.mjs';
import {createOfflineInfobipDeliveryReceiver} from '../server/infobip-whatsapp-delivery.mjs';
import {createOfflineInfobipReceiver} from '../server/infobip-whatsapp-candidate.mjs';
// Invoked only AFTER the owned-socket/clean-HEAD checks in the SQL harness.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHmac,createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {createInfobipWhatsAppRuntime,INFOBIP_WHATSAPP_CALLBACK_PATH} from '../server/infobip-whatsapp-runtime.mjs';
import {eraseWhatsAppAccountState,installWhatsAppLifecycle} from '../server/whatsapp-lifecycle.mjs';
import {mysqlAdapter} from '../server/mysql-platform-adapter.mjs';
import {createInfobipSqlStore,createInfobipProductionStore} from '../server/infobip-whatsapp-store.mjs';
import {createOperationalPilotScope,INFOBIP_OPERATIONAL_PILOT_INPUTS} from '../server/infobip-whatsapp-operational-pilot.mjs';
import {createInfobipSqlBudget} from '../server/infobip-whatsapp-sql-budget.mjs';
import {configureSyntheticOperationalPilot} from './fixtures/infobip-operational-pilot.mjs';

export async function runMysqlScenarios({run,db,reset,make,event,eventKey,stateKey,sender,recipient,email,owner,key,salt,password,epoch,setClock}) {
 const packet=item=>({method:'POST',rawHeaders:['Authorization','Basic '+Buffer.from('synthetic:'+password).toString('base64')],rawBody:Buffer.from(JSON.stringify({results:[item]}))});
 const raw=async()=>{const [r]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[stateKey]);return typeof r[0]?.payload==='string'?JSON.parse(r[0].payload):r[0]?.payload;};
 const configuration={sender,encryptionKey:key,linkHashKey:salt,webhookUsername:'synthetic',webhookPassword:password,baseUrl:'https://synthetic.api.infobip.com',apiKey:'synthetic-api-key-not-real'};
 await run('operational pilot slots and distinct quota commit atomically under concurrent InnoDB dispatch',async()=>{
  await reset();let engine=0,sends=0;
  const f=configureSyntheticOperationalPilot({state:{clock:epoch},stats:{},dependencies:{configuration:{sender},admission:{recipients:[recipient]}}});
  const scope=createOperationalPilotScope(f.dependencies.configuration,f.dependencies.admission,{now:()=>epoch});
  const quantity=createInfobipSendAdmission(f.dependencies.admission,{sender,now:()=>epoch});
  const old=createInfobipSendAdmission({id:INFOBIP_SINGLE_TEST_APPROVAL,recipients:[recipient],maxAttempts:1,validFrom:epoch-1000,validUntil:epoch+600000},{sender,now:()=>epoch});
  assert.equal(await createInfobipSqlBudget(db)(c=>old.reserve(c,{sender,recipient})),true);
  const makePilot=()=>createInfobipProductionStore({db,sender,encryptionKey:key,linkHashKey:salt,now:()=>epoch},{
   allowsOwner:scope.allowsOwner,admission:{allows:j=>scope.allows(j)&&quantity.allows(j),reserve:(c,j)=>scope.reserve(c,j,quantity.reserve)},
   concierge:async input=>{assert(scope.command(input.text));engine++;return 'SYNTHETIC OPERATIONAL SQL';},
   send:async()=>{sends++;return {status:'accepted_unconfirmed'};}});
  let store=makePilot();
  const receive=createOfflineInfobipReceiver({sender,authentication:{mode:'hmac-sha256',secretKey:password},store,now:()=>epoch,acceptEvent:scope.allows,queueLinkConfirmation:false});
  const receiveText=async(id,text)=>{const rawBody=Buffer.from(JSON.stringify({results:[{...event,messageId:id,message:{type:'TEXT',text}}]}));return receive({method:'POST',rawHeaders:['X-Hub-Signature','SHA256='+createHmac('sha256',password).update(rawBody).digest('hex')],rawBody});};
  const keys=[];
  for(const [i,text]of INFOBIP_OPERATIONAL_PILOT_INPUTS.entries()){
   const id='synthetic-pilot-sql-'+i;await receiveText(id,text);keys.push(createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,id])).digest('hex'));
  }
  await Promise.all(keys.flatMap(k=>[store.dispatch(k),store.dispatch(k)]));
  assert.equal(sends,3);assert.equal(engine,3);
  store=makePilot();await Promise.all(keys.map(k=>store.dispatch(k)));assert.equal(sends,3);
  await receiveText('synthetic-pilot-same-menu-new-message','menu');
  await store.dispatch(createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,'synthetic-pilot-same-menu-new-message'])).digest('hex'));assert.equal(sends,3);
  const [rows]=await db.query("SELECT payload FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-infobip-admission-v1:%'");
  const quotas=rows.map(r=>typeof r.payload==='string'?JSON.parse(r.payload):r.payload);
  assert.equal(quotas.find(q=>q.limit===1).used,1,'old neutral quota never reset');assert.equal(quotas.find(q=>q.limit===3).used,3);
  const [slots]=await db.query("SELECT payload FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-infobip-pilot-v1:%'");assert.equal(slots.length,3);assert(slots.every(r=>(typeof r.payload==='string'?JSON.parse(r.payload):r.payload).used===true));
 });
 await run('operational slot and quantity roll back with actual preparing transaction on SQL failure',async()=>{
  await reset();let engine=0,sends=0;
  const f=configureSyntheticOperationalPilot({state:{clock:epoch},stats:{},dependencies:{configuration:{sender},admission:{recipients:[recipient]}}});
  const scope=createOperationalPilotScope(f.dependencies.configuration,f.dependencies.admission,{now:()=>epoch}),quantity=createInfobipSendAdmission(f.dependencies.admission,{sender,now:()=>epoch});
  const store=createInfobipProductionStore({db,sender,encryptionKey:key,linkHashKey:salt,now:()=>epoch},{allowsOwner:scope.allowsOwner,admission:{allows:scope.allows,reserve:async(c,j)=>{assert(await scope.reserve(c,j,quantity.reserve));throw Error('SYNTHETIC_ROLLBACK_AFTER_SLOT');}},concierge:async()=>{engine++;return 'SYNTHETIC';},send:async()=>{sends++;return {status:'accepted_unconfirmed'};}});
  const receive=createOfflineInfobipReceiver({sender,authentication:{mode:'hmac-sha256',secretKey:password},store,now:()=>epoch,queueLinkConfirmation:false});
  const id='synthetic-pilot-rollback',rawBody=Buffer.from(JSON.stringify({results:[{...event,messageId:id,message:{type:'TEXT',text:'menu'}}]}));
  assert.equal((await receive({method:'POST',rawHeaders:['X-Hub-Signature','SHA256='+createHmac('sha256',password).update(rawBody).digest('hex')],rawBody})).accepted,1);
  assert.equal((await store.dispatch(createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,id])).digest('hex'))).status,'uncertain');
  const [[count]]=await db.query("SELECT COUNT(*) n FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-infobip-admission-v1:%' OR state_key LIKE 'crewcheck-infobip-pilot-v1:%'");assert.equal(count.n,0);assert.equal(engine,0);assert.equal(sends,0);
 });
 for(const phase of ['before-receipt','after-enqueue'])await run('operational owner pin rejects reassignment '+phase+' under InnoDB',async()=>{
  await reset();let engine=0,sends=0;
  const f=configureSyntheticOperationalPilot({state:{clock:epoch,owner},stats:{},dependencies:{configuration:{sender},admission:{recipients:[recipient]}}});
  const scope=createOperationalPilotScope(f.dependencies.configuration,f.dependencies.admission,{now:()=>epoch}),quantity=createInfobipSendAdmission(f.dependencies.admission,{sender,now:()=>epoch});
  const store=createInfobipProductionStore({db,sender,encryptionKey:key,linkHashKey:salt,now:()=>epoch},{allowsOwner:scope.allowsOwner,admission:{allows:scope.allows,reserve:(c,j)=>scope.reserve(c,j,quantity.reserve)},concierge:async()=>{engine++;return 'SYNTHETIC';},send:async()=>{sends++;return {status:'accepted_unconfirmed'};}});
  const receive=createOfflineInfobipReceiver({sender,authentication:{mode:'hmac-sha256',secretKey:password},store,now:()=>epoch,queueLinkConfirmation:false});
  const id='synthetic-owner-pin-'+phase,rawBody=Buffer.from(JSON.stringify({results:[{...event,messageId:id,message:{type:'TEXT',text:'menu'}}]}));
  if(phase==='before-receipt')await db.query('UPDATE crewcheck_platform_profiles SET public_id=? WHERE email=?',['synthetic-other-owner',email]);
  const result=await receive({method:'POST',rawHeaders:['X-Hub-Signature','SHA256='+createHmac('sha256',password).update(rawBody).digest('hex')],rawBody});
  assert.equal(result.accepted,phase==='before-receipt'?0:1);
  if(phase==='after-enqueue'){await db.query('UPDATE crewcheck_platform_profiles SET public_id=? WHERE email=?',['synthetic-other-owner',email]);await store.dispatch(createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,id])).digest('hex'));}
  assert.equal(engine,0);assert.equal(sends,0);
  const [[count]]=await db.query("SELECT COUNT(*) n FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-infobip-admission-v1:%' OR state_key LIKE 'crewcheck-infobip-pilot-v1:%'");assert.equal(count.n,0);
 });
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
 await run('handshake-only production commits proof and fences prior held paid work under InnoDB recreation without reply or quota',async()=>{
   await reset();await db.query('DELETE FROM crewcheck_whatsapp_links');
   const code='654321',codeHash=createHmac('sha256',salt).update('crewcheck-whatsapp-link|'+code).digest('hex');
   await db.query('INSERT INTO crewcheck_whatsapp_link_codes(email,code_hash,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE))',[email,codeHash]);
   let calls=0,engineCalls=0;
   configureWhatsAppConcierge(async()=>{engineCalls++;return 'SYNTHETIC';});
   const publicOrigin='https://crewcheck.example.invalid',baseUrl='https://synthetic.api.infobip.com';
   const options={enabled:true,db,now:()=>epoch,configuration:{sender,baseUrl,allowedSenders:[sender],allowedBaseUrls:[baseUrl],authentication:'hmac-sha256',singleMessageTest:true,canonicalLinkHandshake:true,canonicalLinkHandshakeOnly:true,
     credentialReferences:{apiKey:'fixture/api',encryptionKey:'fixture/encryption',linkHashKey:'fixture/link',webhookSecret:'fixture/webhook'},
     deploymentBinding:{profileId:'synthetic-profile',subscriptionIds:['synthetic-subscription'],sender,baseUrl,publicOrigin,linkHashKeyReference:'fixture/link'}},
     credentials:{resolve:async(_ref,{purpose})=>({apiKey:'synthetic-not-real',encryptionKey:key,linkHashKey:salt,webhookSecret:password})[purpose]},
     ingress:{mode:'direct-tls',publicOrigin},admission:{id:INFOBIP_SINGLE_TEST_APPROVAL,recipients:[recipient],maxAttempts:1,validFrom:epoch-1000,validUntil:epoch+60000},
     scheduler:{set:()=>1,clear(){}},request:async()=>{calls++;throw Error('NO_PROVIDER_IN_HANDSHAKE_ONLY');}};
   let runtime=await createInfobipWhatsAppProduction(options);
   const post=async(id,text)=>{
     const rawBody=Buffer.from(JSON.stringify({results:[{...event,messageId:id,message:{type:'TEXT',text}}]}));
     const req=Readable.from([rawBody]);Object.assign(req,{method:'POST',headers:{host:new URL(publicOrigin).host,'content-type':'application/json'},rawHeaders:['X-Hub-Signature','SHA256='+createHmac('sha256',password).update(rawBody).digest('hex')],socket:{encrypted:true}});
     const res={writeHead(status){this.status=status;},end(body){this.payload=JSON.parse(body);this.writableEnded=true;}};
     await runtime.handleRoute(req,res,new URL('/api/infobip/whatsapp/webhook',publicOrigin));return res;
   };
   try{
     assert((await Promise.all(Array.from({length:4},()=>post('synthetic-link-only',code)))).every(r=>r.status===200));
     const [links]=await db.query('SELECT email,consent_concierge,consent_alerts FROM crewcheck_whatsapp_links');assert.equal(links.length,1);assert.equal(links[0].email,email);assert.equal(links[0].consent_alerts,0);
     await runtime.dispose();
     const held={...event,messageId:'synthetic-prior-held-paid',message:{type:'TEXT',text:INFOBIP_SINGLE_TEST_INPUT}};
     assert.equal((await make().receive(packet(held))).accepted,1);
     const heldKey=createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,held.messageId])).digest('hex');
     const readHeld=async()=>{const [[row]]=await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',['crewcheck-infobip-inbound-v1:'+heldKey]);return typeof row.payload==='string'?JSON.parse(row.payload):row.payload;};
     assert.equal((await readHeld()).status,'held');assert((await readHeld()).sealed);
     runtime=await createInfobipWhatsAppProduction(options);
     assert.equal((await runtime.dispatch(heldKey)).status,'blocked');
     assert.equal((await readHeld()).status,'cancelled');assert.equal((await readHeld()).sealed,null);
     const [[before]]=await db.query('SELECT COUNT(*) n FROM crewcheck_telegram_state');
     assert.equal((await post('synthetic-paid-denied',INFOBIP_SINGLE_TEST_INPUT)).status,200);
     await runtime.dispose();runtime=await createInfobipWhatsAppProduction(options);
     assert.equal((await runtime.dispatch(heldKey)).status,'cancelled');
     assert.equal((await post('synthetic-paid-denied-recreated',INFOBIP_SINGLE_TEST_INPUT)).status,200);
     const [[after]]=await db.query('SELECT COUNT(*) n FROM crewcheck_telegram_state');assert.equal(after.n,before.n);
     const [[quota]]=await db.query("SELECT COUNT(*) n FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-infobip-admission-v1:%'");assert.equal(quota.n,0);
     assert.equal(calls,0);assert.equal(engineCalls,0);
   }finally{await runtime.dispose();}
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
   assert.equal((await store.recordDelivery({eventKey,recipient,sentAt:epoch,doneAt:epoch+1000,kind:'delivery',deliveryState:'delivered',statusId:5,receiptKey:['cc-'+eventKey,5,new Date(epoch+1000).toISOString()]})).status,'delivered');
   assert.equal((await store.recordDelivery({eventKey,recipient,sentAt:epoch,doneAt:epoch+1000,kind:'delivery',deliveryState:'delivered',statusId:5,receiptKey:['cc-'+eventKey,5,new Date(epoch+1000).toISOString()]})).status,'duplicate');
   await reset();await make().receive(packet(event));setClock(epoch+900001);await store.maintain();assert.equal((await raw()).sealed,null);
   assert.equal((await make().receive(packet(event))).duplicates,1);setClock(epoch+12*24*3600_000);await store.maintain();assert.equal(await raw(),undefined);assert.equal((await make().receive(packet(event))).status,400);
 });
 await run('real receipt and projection rollback together then regrouped retry',async()=>{
   await reset();const {store,receive}=make();await receive(packet(event));
   await store.exerciseDispatch(eventKey,{concierge:async()=> 'SYNTHETIC',send:async()=>({status:'accepted_unconfirmed'})});
   const item={messageId:'cc-'+eventKey,to:recipient,sentAt:new Date(epoch).toISOString(),doneAt:new Date(epoch+1000).toISOString(),status:{id:5,name:'DELIVERED_TO_HANDSET',groupId:3,groupName:'DELIVERED'}};
   const seen={messageId:item.messageId,from:sender,to:recipient,sentAt:item.sentAt,seenAt:new Date(epoch+2000).toISOString()};
   const reports=items=>({...packet(event),rawBody:Buffer.from(JSON.stringify({results:items}))});
   const wrapped={getConnection:async()=>{const c=await db.getConnection();return {beginTransaction:()=>c.beginTransaction(),commit:()=>c.commit(),rollback:()=>c.rollback(),release:()=>c.release(),destroy:()=>c.destroy(),query:(sql,p)=>{
     if(sql.startsWith('UPDATE crewcheck_telegram_state')&&p[1]===stateKey)throw Error('SYNTHETIC_PROJECTION_FAILURE');return c.query(sql,p);
   }};}};
   const failedStore=createInfobipSqlStore({db:wrapped,sender,encryptionKey:key,linkHashKey:salt,now:()=>epoch+3000});
   const receiver=(kind,target=make().store)=>createOfflineInfobipDeliveryReceiver({kind,username:'synthetic',password,store:target,now:()=>epoch+3000});
   for(const [kind,report] of [['delivery',item],['seen',seen]]){
     const [[before]]=await db.query('SELECT COUNT(*) AS n FROM crewcheck_telegram_state');
     assert.equal((await receiver(kind,failedStore)(reports([report]))).status,503);
     const [[after]]=await db.query('SELECT COUNT(*) AS n FROM crewcheck_telegram_state');assert.equal(after.n,before.n);
     assert.equal((await raw()).status,'accepted_unconfirmed');assert.equal((await raw()).report.seenAt,undefined);
   }
   const foreign={...item,messageId:'synthetic-foreign'};
   const result=await receiver('delivery')(reports([foreign,item]));assert.equal(result.recorded,1);assert.equal(result.ignored,1);
   const concurrent=await Promise.all(Array.from({length:8},()=>receiver('seen')(reports([seen,seen]))));assert(concurrent.every(r=>r.status===200));
   assert.equal((await raw()).status,'delivered');assert.equal((await raw()).report.seenAt,epoch+2000);
   assert.equal((await receiver('delivery')(reports([item,foreign]))).duplicates,1);
 });
 await run('real old inbound ACK at 48h 72h nine and ten days never creates content or reply',async()=>{
   for(const hours of [48,72,216,240]){
     await reset();setClock(epoch+hours*3600_000);
     assert.equal((await make().receive(packet(event))).denied,1);
     assert.equal((await raw()).sealed,null);assert.equal((await raw()).status,'denied');
     const rs=await Promise.all(Array.from({length:8},()=>make().receive({...packet(event),rawBody:Buffer.from(JSON.stringify({results:[event],messageCount:17,pendingMessageCount:3}))})));
     assert(rs.every(r=>r.duplicates===1));assert.equal((await raw()).sealed,null);
     setClock(epoch+(hours+12*24)*3600_000);await make().store.maintain();assert.equal(await raw(),undefined);
     assert.equal((await make().receive(packet(event))).status,400);
   }
 });
 await run('production composition admits only durable quantity under actual InnoDB concurrency and recreation',async()=>{
   await reset();let attempts=0,engineCalls=0;
   configureWhatsAppConcierge(async()=> {engineCalls++;return 'SYNTHETIC PRODUCTION REPLY';});
   const publicOrigin='https://crewcheck.example.invalid';
   const options={enabled:true,db,now:()=>epoch,configuration:{sender,baseUrl:'https://synthetic.api.infobip.com',allowedSenders:[sender],allowedBaseUrls:['https://synthetic.api.infobip.com'],authentication:'hmac-sha256',
     credentialReferences:{apiKey:'fixture/api',encryptionKey:'fixture/encryption',linkHashKey:'fixture/link',webhookSecret:'fixture/webhook'},
     deploymentBinding:{profileId:'synthetic-profile',subscriptionIds:['synthetic-subscription'],sender,baseUrl:'https://synthetic.api.infobip.com',publicOrigin,linkHashKeyReference:'fixture/link'}},
     credentials:{resolve:async(_ref,{purpose})=>({apiKey:'synthetic-outbound-api-key-not-real',encryptionKey:key,linkHashKey:salt,webhookSecret:'synthetic-production-hmac-key-not-real'})[purpose]},
     ingress:{mode:'direct-tls',publicOrigin},admission:{id:'synthetic-mysql-approval',recipients:[recipient],maxAttempts:1,validFrom:epoch-1000,validUntil:epoch+60000},scheduler:{set:()=>1,clear(){}},
     request:async(_url,{body})=>{attempts++;const message=JSON.parse(body);return new Response(JSON.stringify({to:message.to,messageId:message.messageId,status:{groupId:1,groupName:'PENDING',id:26,name:'PENDING_ACCEPTED'}}));}};
   const enqueue=async prefix=>{for(let i=0;i<4;i++)assert.equal((await make().receive(packet({...event,messageId:prefix+i}))).accepted,1);};
   const eventKeys=prefix=>Array.from({length:4},(_,i)=>createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,prefix+i])).digest('hex'));
   let runtime;
   try {await enqueue('synthetic-production-');runtime=await createInfobipWhatsAppProduction(options);
     await Promise.all(eventKeys('synthetic-production-').map(id=>runtime.dispatch(id)));assert.equal(attempts,1);assert.equal(engineCalls,1);
     const [rows]=await db.query("SELECT payload FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-infobip-admission-v1:%'");assert.equal(rows.length,1);const row=typeof rows[0].payload==='string'?JSON.parse(rows[0].payload):rows[0].payload;assert.equal(row.used,1);
     await runtime.dispose();runtime=await createInfobipWhatsAppProduction(options);await enqueue('synthetic-production-recreated-');await Promise.all(eventKeys('synthetic-production-recreated-').map(id=>runtime.dispatch(id)));assert.equal(attempts,1);
     await runtime.dispose();let registered=0,removed=0;
     runtime=createInfobipWhatsAppHost({enabled:true,listener:createInfobipDirectTlsListener(),ingress:options.ingress,
       lifecycle:{registerShutdown(){registered++;return ()=>{removed++;};}},
       load:async()=>({...options,getPool:async()=>db})});
     await runtime.start();assert.equal(registered,1);await enqueue('synthetic-host-recreated-');
     await Promise.all(eventKeys('synthetic-host-recreated-').map(id=>runtime.dispatch(id)));assert.equal(attempts,1,'host recreation cannot reset the durable quantity');
     assert.equal(engineCalls,1);await runtime.dispose();assert.equal(removed,1);
     const renderConfiguration=structuredClone(options.configuration);
     renderConfiguration.credentialReferences={apiKey:'env:CREWCHECK_INFOBIP_WHATSAPP_API_KEY',encryptionKey:'env:CREWCHECK_INFOBIP_WHATSAPP_CONTENT_KEY',linkHashKey:'env:CREWCHECK_WHATSAPP_AUDIT_SALT',webhookSecret:'env:CREWCHECK_INFOBIP_WHATSAPP_HMAC_SECRET'};
     Object.assign(renderConfiguration.deploymentBinding,{renderServiceId:'srv-syntheticcrewcheck',callbackPaths:['/api/infobip/whatsapp/webhook'],linkHashKeyReference:renderConfiguration.credentialReferences.linkHashKey});
     const environment={RENDER_SERVICE_ID:'srv-syntheticcrewcheck',CREWCHECK_INFOBIP_WHATSAPP_API_KEY:'synthetic-outbound-api-key-not-real',CREWCHECK_INFOBIP_WHATSAPP_CONTENT_KEY:key.toString('base64'),CREWCHECK_WHATSAPP_AUDIT_SALT:salt,CREWCHECK_INFOBIP_WHATSAPP_HMAC_SECRET:'synthetic-production-hmac-key-not-real',
       CREWCHECK_INFOBIP_WHATSAPP_POLICY:JSON.stringify({version:1,configuration:renderConfiguration,admission:options.admission,
         ingress:{mode:'render-managed-hmac',trustModel:'render-edge-tls-private-http',serviceId:'srv-syntheticcrewcheck',publicOrigin,callbackPaths:['/api/infobip/whatsapp/webhook']}})};
     const signals=new EventEmitter();signals.exit=()=>assert.fail('no real signal');
     runtime=createInfobipWhatsAppApplicationHost({enabled:true,environment,signals,getPool:async()=>db,matchesLinkKey:value=>value===salt,now:()=>epoch,request:options.request,scheduler:options.scheduler});
     await runtime.start(createInfobipRenderHttpServer());await enqueue('synthetic-render-recreated-');
     await Promise.all(eventKeys('synthetic-render-recreated-').map(id=>runtime.dispatch(id)));assert.equal(attempts,1);assert.equal(engineCalls,1);
     await runtime.dispose();assert.equal(signals.listenerCount('SIGTERM'),0);


   } finally {await runtime?.dispose();configureWhatsAppConcierge(null);}
 });
 await run('local completion fence clears before post-engine lookup while deletion owns profile lock',async()=>{
   await reset();await preflightInfobipWhatsAppStorage(db);await make().receive(packet(event));
   let enter,release;const entered=new Promise(r=>enter=r),hold=new Promise(r=>release=r);
   configureWhatsAppConcierge(async()=>{enter();await hold;return 'SYNTHETIC';});
   const store=createInfobipProductionStore({db,sender,encryptionKey:key,linkHashKey:salt,now:()=>epoch},
     {concierge:invokeConfiguredWhatsAppConcierge,send:async()=>assert.fail('no send during erasure'),
      admission:createInfobipSendAdmission({id:'synthetic-local-erasure',recipients:[recipient],maxAttempts:1,validFrom:epoch-1000,validUntil:epoch+60000},{sender,now:()=>epoch})});
   const uninstall=installWhatsAppLifecycle((target,context)=>withWhatsAppConciergeQuiesced(target,async()=>{await store.waitForLocalPreparations(target);return store.eraseAccount(target,context);}));
   const dispatch=store.dispatch(eventKey);const client=await mysqlAdapter(db).connect();let erasing;
   try{
     await entered;await client.query('BEGIN');await client.query('SELECT email FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE',[email]);
     let completed=false;erasing=eraseWhatsAppAccountState(email,{client}).then(()=>{completed=true;});
     await new Promise(r=>setTimeout(r,0));assert.equal(completed,false);release();await erasing;
     await client.query('COMMIT');await dispatch;assert.equal((await raw()).engineActive,false);assert.equal((await raw()).sealed,null);
   }finally{release();await erasing?.catch(()=>{});await client.query('ROLLBACK').catch(()=>{});client.release();await dispatch;uninstall();configureWhatsAppConcierge(null);}
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
