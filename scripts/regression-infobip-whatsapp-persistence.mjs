import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Readable} from 'node:stream';
import {createHash, createHmac} from 'node:crypto';
import {createInfobipSqlStore} from '../server/infobip-whatsapp-store.mjs';
import {configureWhatsAppConcierge} from '../server/whatsapp.mjs';
import {createInfobipSqlBudget} from '../server/infobip-whatsapp-sql-budget.mjs';
import {createOfflineInfobipDeliveryReceiver} from '../server/infobip-whatsapp-delivery.mjs';
import {createOfflineInfobipReceiver} from '../server/infobip-whatsapp-candidate.mjs';
import {buildInfobipTextRequest, createInfobipTextTransport} from '../server/infobip-whatsapp-transport.mjs';
import {composeInfobipWhatsAppForOfflineTests,createInfobipWhatsAppRuntime,INFOBIP_WHATSAPP_CALLBACK_PATH} from '../server/infobip-whatsapp-runtime.mjs';
import {eraseWhatsAppAccountState} from '../server/whatsapp-lifecycle.mjs';

// Real SQL adapter + real AEAD, exercised against a synthetic mysql2-shaped
// transaction fixture. No database engine/network/migrations are started.
globalThis.fetch = () => {throw Error('REAL_NETWORK_FORBIDDEN');};
const sender='12025550100', recipient='12025550101', other='12025550102';
const epoch=Date.parse('2032-01-01T12:00:00.000Z'), encryptionKey=Buffer.alloc(32, 7);
const linkHashKey='synthetic-existing-link-hash-secret-only';
const username='synthetic', password='synthetic-not-a-real-webhook-password';
const phoneHash=createHmac('sha256',linkHashKey).update(recipient).digest('hex');
const baseLink={email:'synthetic@example.invalid',consent_concierge:1,revoked_at:null,linked_at:'2031-12-31 12:00:00.000',updated_at:'2031-12-31 12:00:00.000'};
const event={from:recipient,to:sender,integrationType:'WHATSAPP',receivedAt:'2032-01-01T12:00:00.000Z',messageId:'synthetic-in-1',message:{type:'TEXT',text:'SYNTHETIC PRIVATE QUESTION'}};
const eventKey=createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,event.messageId])).digest('hex');
const stateKey='crewcheck-infobip-inbound-v1:'+eventKey;
const request=(item=event)=>({method:'POST',rawHeaders:['authorization','Basic '+Buffer.from(username+':'+password).toString('base64')],rawBody:Buffer.from(JSON.stringify({results:[item]}))});
function fixture() {
  const s={rows:new Map(),link:{...baseLink},owner:'synthetic-account-A',active:0,queries:[],commits:0,rollbacks:0,releases:0,
    failEnqueue:false,commitUncertain:false,failAfterSend:false,clock:epoch,changeClaim:false};
  let tail=Promise.resolve();
  const db={async getConnection(){
    let rows,unlock,began=false,released=false;
    return {
      async beginTransaction(){const previous=tail;tail=new Promise(resolve=>{unlock=resolve;});await previous;
        rows=structuredClone(s.rows);began=true;s.active++;},
      async query(sql,p){
        s.queries.push(sql);assert(!/CREATE|ALTER|DROP|TRUNCATE/i.test(sql),'no DDL or migrations');
        assert(began,'every query uses a transaction');
        if(sql.startsWith('SELECT email,consent_concierge')){assert(sql.endsWith('FOR UPDATE'));return [[p[0]===phoneHash&&s.link?{...s.link}:null].filter(Boolean)];}
        if(sql.startsWith('SELECT public_id')){assert(sql.endsWith('FOR UPDATE'));return [[s.owner&&s.link?.email===p[0]?{public_id:s.owner}:null].filter(Boolean)];}
        if(sql.startsWith('SELECT state_key FROM'))return [[...rows].filter(([,r])=>r.status==='held').slice(0,1).map(([state_key])=>({state_key}))];
        if(sql.startsWith('UPDATE crewcheck_whatsapp_links')){if(s.link?.email===p[0])s.link={...s.link,revoked_at:'now',consent_concierge:0};return [{affectedRows:1}];}
        if(sql.startsWith('DELETE FROM crewcheck_whatsapp_link_codes'))return [{affectedRows:1}];
        if(sql.startsWith('UPDATE crewcheck_telegram_state SET payload=JSON_SET')){
          for(const [k,r] of rows)if(k>p[0]&&k<p[1]&&r.ownerHash===p[2])rows.set(k,{...r,sealed:null,ownerHash:null,report:null,status:['held','dispatching'].includes(r.status)?'cancelled':r.status});return [{affectedRows:1}];
        }
        if(sql.startsWith('SELECT state_key,payload'))return [[...rows].filter(([k])=>k>p[0]&&k<p[1]).sort(([a],[b])=>a.localeCompare(b)).slice(0,p[2]).map(([state_key,payload])=>({state_key,payload:JSON.stringify(payload)}))];
        if(sql.startsWith('DELETE FROM crewcheck_telegram_state')){rows.delete(p[0]);return [{affectedRows:1}];}
        if(sql.startsWith('SELECT payload')){assert(sql.endsWith('FOR UPDATE'));return [[rows.has(p[0])?{payload:JSON.stringify(rows.get(p[0]))}:null].filter(Boolean)];}
        if(sql.startsWith('INSERT INTO crewcheck_telegram_state')){if(!rows.has(p[0]))rows.set(p[0],JSON.parse(p[1]));if(s.changeClaim)s.link={...s.link,updated_at:'2032-01-01 12:00:00.001'};return [{affectedRows:1}];}
        if(sql.startsWith('UPDATE crewcheck_telegram_state')){
          const next=JSON.parse(p[0]);if(s.failEnqueue&&next.status==='held')throw Error('raw SQL synthetic private failure');
          if(s.failAfterSend&&next.status==='accepted_unconfirmed')throw Error('raw SQL result failure');
          if(!rows.has(p[1]))return [{affectedRows:0}];rows.set(p[1],next);return [{affectedRows:1}];
        }
        assert.fail('unexpected SQL');
      },
      async commit(){s.rows=rows;s.commits++;if(s.commitUncertain||(s.failCommitStatus&&s.failCommitStatus===rows.get(stateKey)?.status)){s.commitUncertain=false;s.failCommitStatus=null;throw Error('raw uncertain synthetic commit');}},
      async rollback(){s.rollbacks++;},
      release(){if(released)return;released=true;s.releases++;if(began){s.active--;unlock();}},
      destroy(){this.release();},
    };
  }};
  const makeStore=sqlBudget=>createInfobipSqlStore({db,sender,encryptionKey,linkHashKey,now:()=>s.clock,sqlBudget});
  const store=makeStore(),receive=createOfflineInfobipReceiver({sender,username,password,store,now:()=>s.clock});
  return {s,store,receive,makeStore,db};
}
{
  const {s,receive,makeStore}=fixture();
  const results=await Promise.all(Array.from({length:12},()=>receive(request())));
  assert.equal(results.reduce((n,r)=>n+r.accepted,0),1);assert.equal(results.reduce((n,r)=>n+r.duplicates,0),11);
  assert.equal(s.rows.get(stateKey).status,'held');
  const stored=JSON.stringify([...s.rows.values()]);
  for(const privateValue of [recipient,sender,baseLink.email,s.owner,event.message.text])assert(!stored.includes(privateValue),'job and grant state are sealed');
  assert.equal(s.active,0);assert.equal(s.releases,12);
  const restarted=createOfflineInfobipReceiver({sender,username,password,store:makeStore(),now:()=>epoch});
  assert.equal((await restarted(request())).duplicates,1,'new adapter sees durable claim');
  assert.equal((await receive(request({...event,message:{type:'TEXT',text:'changed'}}))).status,503);
}
for(const change of [null,{...baseLink,consent_concierge:0},{...baseLink,revoked_at:'2032-01-01'}, {...baseLink,linked_at:null}]){
  const {s,receive}=fixture();s.link=change;assert.equal((await receive(request())).denied,1);assert(!s.rows.has(stateKey));
}
{const {receive}=fixture();assert.equal((await receive(request())).accepted,1,'existing authenticated WhatsApp consent sufficient without provider grant');}
{
  const {s,receive}=fixture();s.failEnqueue=true;assert.equal((await receive(request())).status,503);
  assert(!s.rows.has(stateKey));assert.equal(s.rollbacks,1);s.failEnqueue=false;assert.equal((await receive(request())).accepted,1);
}
{
  const {s,receive}=fixture();s.changeClaim=true;assert.equal((await receive(request())).status,503);assert(!s.rows.has(stateKey));
}
{
  const {s,receive}=fixture();s.commitUncertain=true;assert.equal((await receive(request())).status,503);
  assert.equal((await receive(request())).duplicates,1);assert.equal(s.rows.get(stateKey).status,'held');
}
{
  const {s,receive}=fixture();s.clock=epoch+41.5*3600_000;
  assert.equal((await receive(request())).denied,1,'old retry is durably acknowledged without reply authorization');
  assert.equal(s.rows.get(stateKey).status,'denied');assert.equal(s.rows.get(stateKey).sealed,null);
  assert.equal((await receive(request())).duplicates,1,'old retry does not enqueue text again');
}
{
  const {s,receive,store}=fixture();await receive(request());s.clock=epoch+900001;
  assert.equal((await store.expirePayload(eventKey)).status,'expired');assert.equal(s.rows.get(stateKey).sealed,null);
  assert.equal((await receive(request())).duplicates,1,'payload expiration preserves claim');
}
{
  const store=createInfobipSqlStore({db:{getConnection:async()=>{throw Error('private DSN phone text');}},sender,encryptionKey,linkHashKey});
  await assert.rejects(()=>store.transaction(()=>{}),{message:'INFOBIP_STATE_UNAVAILABLE'});
}
const configuration={sender,apiKey:'synthetic-outbound-api-key-only',baseUrl:'https://synthetic.api.infobip.com'};
const proposal={provider:'infobip',sender,recipient,replyToMessageId:event.messageId,messageId:'synthetic-out-1',text:'SYNTHETIC REPLY',bindingStamp:JSON.stringify(['synthetic-account-A','revision','infobip',sender,recipient])};
const pending=p=>new Response(JSON.stringify({to:p.recipient,messageId:p.messageId,status:{groupId:1,groupName:'PENDING',id:26,name:'PENDING_ACCEPTED'}}),{status:200});
{
  const {s,db}=fixture();let calls=0;
  const composition=composeInfobipWhatsAppForOfflineTests({db,configuration:{...configuration,encryptionKey,linkHashKey,webhookUsername:username,webhookPassword:password},
    now:()=>s.clock,concierge:async({accountId,text})=>{assert.equal(accountId,s.owner);assert.equal(text,event.message.text);return 'SYNTHETIC COMPOSED REPLY';},
    request:async(_url,{body})=>{calls++;const data=JSON.parse(body);assert.equal(data.to,recipient);assert.equal(data.from,sender);return pending({recipient:data.to,messageId:data.messageId});},
  });
  assert.equal((await composition.receive(request())).accepted,1);
  assert.equal((await composition.dispatch(eventKey)).status,'accepted_unconfirmed');
  await composition.dispatch(eventKey);assert.equal(calls,1,'composed pipeline retains no-retry guard');
  assert.equal((await composition.expire(eventKey)).status,'accepted_unconfirmed');
}
{
  const built=buildInfobipTextRequest(proposal,configuration);
  assert.equal(built.url,configuration.baseUrl+'/whatsapp/1/message/text');assert.equal(built.options.headers.authorization,'App '+configuration.apiKey);
  assert.equal(built.options.redirect,'error');assert.deepEqual(JSON.parse(built.options.body),{from:sender,to:recipient,messageId:proposal.messageId,content:{text:proposal.text}});
  for(const baseUrl of ['http://synthetic.api.infobip.com','https://example.invalid','https://infobip.com.evil.invalid','https://synthetic.api.infobip.com/path','https://synthetic.api.infobip.com?key=x','https://user@synthetic.api.infobip.com','https://synthetic.api.infobip.com:444'])assert.throws(()=>buildInfobipTextRequest(proposal,{...configuration,baseUrl}));
  for(const changed of [{sender:other},{recipient:other},{provider:'meta'},{messageId:''},{text:'x'.repeat(4001)},{bindingStamp:'[]'}])assert.throws(()=>buildInfobipTextRequest({...proposal,...changed},configuration));
}
{
  let calls=0;
  const transport=createInfobipTextTransport({...configuration,request:async()=>{calls++;return pending(proposal);}});
  assert.equal((await transport.send(proposal)).status,'disabled');assert.equal(calls,0);
  assert.equal((await transport.exercise(proposal)).status,'accepted_unconfirmed');assert.equal(calls,1);
}
for(const requestImpl of [async()=>new Response('private raw error',{status:500}),async()=>{throw Error('secret endpoint and phone');},async()=>new Response('{'),async()=>new Response('x'.repeat(16385)),async()=>new Response(JSON.stringify({messageId:'wrong',to:recipient})),async()=>new Response('',{status:302})]){
  const t=createInfobipTextTransport({...configuration,request:requestImpl});assert.deepEqual(await t.exercise(proposal),{status:'uncertain'});
}
{
  let aborted=false;const t=createInfobipTextTransport({...configuration,timeoutMs:2,request:async(_url,{signal})=>{signal.addEventListener('abort',()=>{aborted=true;});return new Promise(()=>{});}});
  assert.equal((await t.exercise(proposal)).status,'uncertain');assert(aborted);
}
{
  const {s,receive,store}=fixture();await receive(request());let calls=0;
  const transport=createInfobipTextTransport({...configuration,request:async(_url,options)=>{
    calls++;assert.equal(s.rows.get(stateKey).status,'dispatching','marker committed before request');assert.equal(s.active,1,'binding locks held through I/O');
    const body=JSON.parse(options.body);return pending({recipient:body.to,messageId:body.messageId});
  }});
  assert.equal((await store.dispatch(eventKey)).status,'disabled');assert.equal(calls,0);
  const deps={concierge:async({accountId,text})=>{assert.equal(accountId,s.owner);assert.equal(text,event.message.text);return 'SYNTHETIC REPLY';},send:transport.exercise};
  const results=await Promise.all([store.exerciseDispatch(eventKey,deps),store.exerciseDispatch(eventKey,deps)]);
  assert(results.some(x=>x.status==='accepted_unconfirmed'));assert.equal(calls,1);assert.equal(s.rows.get(stateKey).status,'accepted_unconfirmed');assert.equal(s.rows.get(stateKey).sealed,null);
  await store.exerciseDispatch(eventKey,deps);assert.equal(calls,1);
}
for(const mode of ['revoke','relink','account','consent','expire','failure','uncertain-commit','timeout']){
  const {s,receive,store}=fixture();await receive(request());let calls=0;
  const deps={timeoutMs:2,concierge:async()=>{
    if(mode==='revoke')s.link={...s.link,revoked_at:'now'};
    if(mode==='relink')s.link={...s.link,updated_at:'new'};
    if(mode==='account')s.owner='synthetic-account-B';
    if(mode==='consent')s.link={...s.link,consent_concierge:0};
    if(mode==='expire')s.clock=epoch+900001;
    return 'SYNTHETIC REPLY';
  },send:async()=>{calls++;if(mode==='failure')s.failAfterSend=true;if(mode==='uncertain-commit')s.commitUncertain=true;
    if(mode==='timeout')return new Promise(()=>{});return {status:'accepted_unconfirmed'};}};
  const result=await store.exerciseDispatch(eventKey,deps);
  if(['failure','uncertain-commit','timeout'].includes(mode)){assert.equal(result.status,'uncertain');assert.equal(calls,1);await store.exerciseDispatch(eventKey,deps);assert.equal(calls,1,'never retry ambiguous provider outcome');}
  else {assert.equal(calls,0);assert.equal(result.status,'blocked');}
  assert.equal(s.active,0);
}
{
  const {s,receive,store}=fixture();await receive(request());s.failCommitStatus='dispatching';let calls=0;
  const deps={concierge:async()=> 'SYNTHETIC REPLY',send:async()=>{calls++;return {status:'accepted_unconfirmed'};}};
  assert.equal((await store.exerciseDispatch(eventKey,deps)).status,'uncertain');assert.equal(calls,0);
  assert.equal(s.rows.get(stateKey).status,'dispatching');
  await store.exerciseDispatch(eventKey,deps);assert.equal(calls,0,'uncertain pre-I/O marker is never retried');
  s.clock=epoch+900001;assert.equal((await store.expirePayload(eventKey)).status,'uncertain');
  assert.equal(s.rows.get(stateKey).sealed,null);assert.equal((await receive(request())).duplicates,1);
}
{
  const {s,receive,store}=fixture();await receive(request());
  const state=s.rows.get(stateKey);state.sealed.tag=Buffer.alloc(16,1).toString('base64url');
  assert.equal((await store.exerciseDispatch(eventKey,{concierge:async()=>assert.fail('cipher tamper'),send:async()=>assert.fail('cipher tamper')})).status,'uncertain');
}
{
  // Execute the CURRENT canonical configure callback with synthetic snapshot and
  // reply-builder dependencies; then reach it through the real shared invoker.
  const source=fs.readFileSync('server.mjs','utf8');
  const binding=source.match(/configureWhatsAppConcierge\(async \(\{ email, text, location \}\) => \{[\s\S]*?\n\}\);(?=\n\nhttp\.createServer)/)?.[0];
  assert(binding,'prepare canonical server before this regression');
  const {s,db}=fixture();let engineCalls=0,requests=0;
  vm.runInNewContext(binding,{configureWhatsAppConcierge,conciergeLoadSnapshot:async profile=>{assert.equal(profile.email,baseLink.email);return {name:'Synthetic'};},
    buildTelegramConciergeReply:async(text,profile,snapshot)=>{engineCalls++;assert.equal(text,event.message.text);assert.equal(profile.channel,'whatsapp');assert.equal(snapshot.name,'Synthetic');return 'SYNTHETIC CANONICAL REPLY';}});
  const runtime=composeInfobipWhatsAppForOfflineTests({db,configuration:{...configuration,encryptionKey,linkHashKey,webhookUsername:username,webhookPassword:password},now:()=>s.clock,
    request:async(_url,{body})=>{requests++;const data=JSON.parse(body);assert.equal(data.content.text,'SYNTHETIC CANONICAL REPLY');return pending({recipient:data.to,messageId:data.messageId});}});
  await runtime.receive(request());assert.equal((await runtime.dispatch(eventKey)).status,'accepted_unconfirmed');assert.equal(engineCalls,1);assert.equal(requests,1);
  configureWhatsAppConcierge(null);
}
{
  const {s,receive,store}=fixture();await receive(request());
  const delivery=createOfflineInfobipDeliveryReceiver({username,password,store,now:()=>s.clock});
  const item={messageId:'cc-'+eventKey,to:recipient,sentAt:'2032-01-01T12:00:00.000Z',doneAt:'2032-01-01T12:00:01.000Z',status:{id:5,name:'DELIVERED_TO_HANDSET',groupId:3,groupName:'DELIVERED'}};
  const report=(changes={},headers=request().rawHeaders)=>({method:'POST',rawHeaders:headers,rawBody:Buffer.from(JSON.stringify({results:[{...item,...changes}]}))});
  assert.equal((await delivery(report())).ignored,1,'unsent held job cannot be delivered');
  await store.exerciseDispatch(eventKey,{concierge:async()=> 'SYNTHETIC',send:async()=>({status:'accepted_unconfirmed'})});s.clock+=1000;
  assert.equal((await delivery(report({},[]))).status,401);
  assert.equal((await delivery(report({to:other}))).ignored,1);
  assert.equal((await delivery(report({messageId:'cc-'+ 'a'.repeat(64)}))).ignored,1);
  assert.equal((await delivery(report({status:{id:26,groupId:1,name:'PENDING_ACCEPTED',groupName:'PENDING'}}))).status,200,'pending observation is accepted without delivery evidence');
  assert.equal((await delivery(report({seenAt:item.doneAt}))).status,400);
  assert.equal((await delivery(report({error:{id:1}}))).status,400);
  assert.equal((await delivery(report({contact:{phoneNumber:other}}))).status,400);
  assert.equal((await delivery(report({sentAt:'2031-12-31T12:00:00.000Z'}))).ignored,1,'correlate attempt time');
  assert.equal((await delivery(report())).recorded,1);assert.equal(s.rows.get(stateKey).status,'delivered');
  assert.equal((await delivery(report())).ignored,1,'repeated DLR idempotent');
  assert.equal((await delivery(report({status:{id:26,groupId:1,name:'PENDING_ACCEPTED',groupName:'PENDING'}}))).status,200);
  assert.equal(s.rows.get(stateKey).status,'delivered','late pending cannot downgrade delivery');
  let calls=0;await store.exerciseDispatch(eventKey,{concierge:async()=>assert.fail(),send:async()=>{calls++;}});assert.equal(calls,0);
  assert(!JSON.stringify(s.rows.get(stateKey)).includes(recipient),'correlation keeps no raw phone');
}
{
  const {s,receive,store}=fixture();await receive(request());s.clock=epoch+900001;
  assert.equal((await store.maintain()).scanned,1);assert.equal(s.rows.get(stateKey).sealed,null);
  assert.equal((await receive(request())).duplicates,1,'retention keeps replay tombstone');
  s.clock=epoch+12*24*3600_000;await store.maintain();assert(!s.rows.has(stateKey));
  assert.equal((await receive(request())).status,400,'old inbound rejected after tombstone deletion');
  await assert.rejects(()=>store.maintain({limit:21}),/STATE_UNAVAILABLE/);
}
{
  const {s,receive,store}=fixture();await receive(request());
  await store.maintain({forgetAccountId:s.owner});assert.equal(s.rows.get(stateKey).sealed,null);assert.equal(s.rows.get(stateKey).ownerHash,null);
  assert.equal((await receive(request())).duplicates,1);
}
{
  let resolve,release=0;
  const budget=createInfobipSqlBudget({getConnection:()=>new Promise(r=>resolve=r)},{transactionMs:5,queryMs:5});
  await assert.rejects(()=>budget(()=>assert.fail('late acquisition')),/STATE_UNAVAILABLE/);
  resolve({release(){release++;}});await new Promise(r=>setTimeout(r,1));assert.equal(release,1);
}
for(const phase of ['beginTransaction','query','commit','rollback']){
  let destroyed=0,commits=0;
  const raw={destroy(){destroyed++;},release(){},async beginTransaction(){},async query(){},async commit(){commits++;},async rollback(){}};
  raw[phase]=()=>new Promise(()=>{});
  const budget=createInfobipSqlBudget({getConnection:async()=>raw},{transactionMs:15,queryMs:3});
  await assert.rejects(()=>budget(async c=>{if(phase==='rollback')throw Error('PRIVATE');await c.query('synthetic');}),{message:'INFOBIP_STATE_UNAVAILABLE'});
  assert.equal(destroyed,1);if(phase!=='commit')assert.equal(commits,0);
}
{
  const {receive,makeStore}=fixture();await receive(request());let sends=0;
  const result=await makeStore({transactionMs:100,queryMs:100}).exerciseDispatch(eventKey,{timeoutMs:1,
    concierge:async()=> 'SYNTHETIC',send:async()=>{sends++;return {status:'accepted_unconfirmed'};}});
  assert.equal(result.status,'uncertain');assert.equal(sends,0,'no I/O without reserved SQL+send budget');
}
{
  let aborted=false,destroyed=0,releaseWork,commits=0;
  const budget=createInfobipSqlBudget({getConnection:async()=>({destroy(){destroyed++;},release(){},async beginTransaction(){},async commit(){commits++;},async rollback(){},async query(){}})},
    {transactionMs:10,queryMs:10});
  const result=budget(async c=>{c.signal.addEventListener('abort',()=>{aborted=true;});assert(c.remainingMs()>0);await new Promise(r=>releaseWork=r);await c.query('late');});
  await assert.rejects(()=>result,/STATE_UNAVAILABLE/);assert(aborted);assert.equal(destroyed,1);releaseWork();await new Promise(r=>setTimeout(r,1));assert.equal(commits,0,'late continuation cannot commit');
}
console.log('PASS Infobip OFF: canonical engine, existing authenticated consent, SQL deadlines, retention/account erasure, authenticated correlated DLR, no retry after uncertainty; synthetic dependencies only');
{
  const {s,db}=fixture();let callback,cleared=0,sends=0;
  const runtime=createInfobipWhatsAppRuntime({enabled:true,db,configuration:{...configuration,encryptionKey,linkHashKey,webhookUsername:username,webhookPassword:password},now:()=>s.clock,
    scheduler:{set:fn=>{callback=fn;return 7;},clear:id=>{assert.equal(id,7);cleared++;}},concierge:async()=> 'SYNTHETIC ENABLED',
    request:async(_url,{body})=>{sends++;const data=JSON.parse(body);return pending({recipient:data.to,messageId:data.messageId});}});
  const route=async(item,{tls=true,headers=request().rawHeaders,body,contentType='application/json'}={})=>{
    const req=Readable.from([body||request(item).rawBody]);Object.assign(req,{method:'POST',rawHeaders:headers,headers:{'content-type':contentType},socket:{encrypted:tls}});
    const res={writeHead(status){this.status=status;},end(value){this.body=value;this.writableEnded=true;}};
    await runtime.handleRoute(req,res,new URL(INFOBIP_WHATSAPP_CALLBACK_PATH,'https://example.invalid'));return res;
  };
  try{
    assert.equal((await route(event,{tls:false})).status,503);assert.equal((await route(event,{headers:[]})).status,401);assert.equal(s.queries.length,0);
    assert.equal((await route(event,{contentType:'text/plain'})).status,415);
    assert.equal((await route(event,{body:Buffer.alloc(65537)})).status,400);
    assert.equal((await route(event)).status,200);await runtime.maintain();assert.equal(sends,1);
    assert.equal(typeof callback,'function');await callback();await runtime.maintain();assert.equal(sends,1);
    const dlr={messageId:'cc-'+eventKey,to:recipient,sentAt:new Date(epoch).toISOString(),doneAt:new Date(epoch+1000).toISOString(),status:{id:5,name:'DELIVERED_TO_HANDSET',groupId:3,groupName:'DELIVERED'}};
    const reportBody=items=>Buffer.from(JSON.stringify({results:items}));
    const seen={messageId:dlr.messageId,to:recipient,from:sender,sentAt:dlr.sentAt,seenAt:new Date(epoch+2000).toISOString()};
    assert.equal((await route(event,{body:reportBody([dlr,dlr])})).status,200,'HTTP processes complete delivery batch');
    assert.equal(s.rows.get(stateKey).status,'delivered');
    assert.equal((await route(event,{body:reportBody([seen,seen])})).status,200,'HTTP routes every SEEN item independently');
    assert.equal(s.rows.get(stateKey).report.seenAt,epoch+2000);
    await runtime.maintain();const queries=s.queries.length;
    assert.equal((await route(event,{body:reportBody([dlr,seen])})).status,400,'mixed event shapes fail before SQL');
    assert.equal(s.queries.length,queries);
    await runtime.maintain();assert.equal(sends,1,'callbacks never enqueue a reply');

    await eraseWhatsAppAccountState(baseLink.email);assert.equal(s.rows.get(stateKey).ownerHash,null);assert.equal(s.link.consent_concierge,0);
    assert.throws(()=>createInfobipWhatsAppRuntime({enabled:true,db,configuration:{...configuration,encryptionKey,linkHashKey,webhookUsername:username,webhookPassword:password},request:async()=>{}}),/LIFECYCLE_OWNED/);
  }finally{await runtime.dispose();assert.equal(cleared,1);}
  assert.equal((await route(event)).status,503);
  const count=s.queries.length;
  assert.equal((await runtime.dispatch(eventKey)).status,'closed');assert.equal((await runtime.expire(eventKey)).status,'closed');assert.equal(s.queries.length,count);
  const platform=fs.readFileSync('server/platform.mjs','utf8'),deletion=platform.slice(platform.indexOf('async function handleAccountDeletion'));
  assert(deletion.indexOf('await eraseWhatsAppAccountState(context.identity.email, {client})')>deletion.indexOf("await client.query('BEGIN')"));
  assert(deletion.indexOf('await eraseWhatsAppAccountState(context.identity.email, {client})')<deletion.indexOf('DELETE FROM crewcheck_platform_profiles'));
}
{
  let scheduled=0;
  const {db}=fixture();
  for(const bad of [{webhookPassword:'short'},{webhookUsername:'bad:name'},{apiKey:'bad'},{baseUrl:'https://example.invalid'},{sender:'bad'},{encryptionKey:Buffer.alloc(1)}]){
    assert.throws(()=>createInfobipWhatsAppRuntime({enabled:true,db,configuration:{...configuration,encryptionKey,linkHashKey,webhookUsername:username,webhookPassword:password,...bad},
      scheduler:{set(){scheduled++;},clear(){}},request:async()=>{}}));
  }
  assert.equal(scheduled,0);
}
{
  const {db,receive,s}=fixture();await receive(request());let entered,release,done=false,sends=0;
  const waiting=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
  const runtime=createInfobipWhatsAppRuntime({enabled:true,db,configuration:{...configuration,encryptionKey,linkHashKey,webhookUsername:username,webhookPassword:password},now:()=>s.clock,
    scheduler:{set:()=>1,clear(){}},concierge:async()=>{entered();await hold;return 'SYNTHETIC';},request:async(_url,{body})=>{sends++;const m=JSON.parse(body);return pending({recipient:m.to,messageId:m.messageId});}});
  const dispatch=runtime.dispatch(eventKey);await waiting;
  const disposed=runtime.dispose().then(()=>{done=true;});await new Promise(r=>setTimeout(r,1));assert.equal(done,false);
  release();await dispatch;await disposed;const queries=s.queries.length;
  assert.equal((await runtime.dispatch(eventKey)).status,'closed');assert.equal((await runtime.expire(eventKey)).status,'closed');assert.equal(s.queries.length,queries);assert.equal(sends,1);
}

// Event contract: identifiers survive nine-day inbound retries while
// reply content expires independently. Restart is adapter recreation here.
for (const hours of [48,72,216,240]) {
  const {s,receive,store,makeStore}=fixture();
  s.clock=epoch+hours*3600_000;
  const response=await receive(request());assert.equal(response.denied,1);
  assert.equal(s.rows.get(stateKey).sealed,null);
  s.link=null; // ACK of old claims must not require or recreate a revoked link.
  const recreated=createOfflineInfobipReceiver({sender,username,password,store:makeStore(),now:()=>s.clock});
  const changedCounters={...request(),rawBody:Buffer.from(JSON.stringify({results:[event],messageCount:19,pendingMessageCount:7}))};
  const replies=await Promise.all(Array.from({length:6},()=>recreated(changedCounters)));
  assert(replies.every(r=>r.duplicates===1));
  assert.equal((await store.exerciseDispatch(eventKey,{concierge:async()=>assert.fail('OLD_REPLY'),send:async()=>assert.fail('OLD_SEND')})).status,'denied');
  assert(!JSON.stringify([...s.rows]).includes(event.message.text));
}
{
  const {s,receive,store,makeStore}=fixture();await receive(request());
  await store.exerciseDispatch(eventKey,{concierge:async()=> 'SYNTHETIC',send:async()=>({status:'accepted_unconfirmed'})});
  s.clock=epoch+10000;
  const item={messageId:'cc-'+eventKey,to:recipient,sentAt:new Date(epoch).toISOString(),doneAt:new Date(epoch+2000).toISOString(),status:{id:5,name:'DELIVERED_TO_HANDSET',groupId:3,groupName:'DELIVERED'}};
  const pendingItem={...item,doneAt:new Date(epoch+1000).toISOString(),status:{id:26,name:'PENDING_ACCEPTED',groupId:1,groupName:'PENDING'}};
  const packet=items=>({...request(),rawBody:Buffer.from(JSON.stringify({results:items}))});
  const seenItem={messageId:item.messageId,to:recipient,from:sender,sentAt:item.sentAt,seenAt:new Date(epoch+3000).toISOString()};
  const receiver=kind=>createOfflineInfobipDeliveryReceiver({kind,username,password,store:makeStore(),now:()=>s.clock});
  // SEEN alone changes only seenAt, never delivery or queue authorization.
  assert.equal((await receiver('seen')(packet([seenItem]))).status,200);
  assert.equal(s.rows.get(stateKey).status,'accepted_unconfirmed');
  const olderSeen={...seenItem,seenAt:new Date(epoch+2500).toISOString()};
  await receiver('seen')(packet([olderSeen,seenItem]));
  assert.equal(s.rows.get(stateKey).report.seenAt,epoch+3000);
  // First item commits; second fails. Whole batch retry must retain first claim.
  let calls=0;
  const partial=createOfflineInfobipDeliveryReceiver({username,password,now:()=>s.clock,store:{recordDelivery:async report=>{if(++calls===2)throw Error('SYNTHETIC_PARTIAL');return makeStore().recordDelivery(report);}}});
  assert.equal((await partial(packet([pendingItem,item]))).status,503);
  assert.equal(s.rows.get(stateKey).status,'accepted_unconfirmed');
  await Promise.all([receiver('delivery')(packet([item,pendingItem])),receiver('delivery')(packet([pendingItem,item]))]);
  assert.equal(s.rows.get(stateKey).status,'delivered');
  assert.equal(s.rows.get(stateKey).report.deliveryStatusId,5);
  const count=s.rows.size;
  await receiver('delivery')(packet([pendingItem]));await receiver('seen')(packet([seenItem]));
  assert.equal(s.rows.size,count,'regrouping and recreation create no duplicate receipts');
  assert.equal(s.rows.get(stateKey).report.deliveryStatusId,5);
  assert(!JSON.stringify([...s.rows]).includes(recipient));
  s.clock=epoch+12*24*3600_000;await store.maintain();assert.equal(s.rows.size,0);
}
console.log('PASS nine-day retry ACK without replies; durable per-item DLR/SEEN receipts, regrouping, partial-success retry, concurrent recreation, monotonic projections and cleanup (synthetic SQL fixture)');
