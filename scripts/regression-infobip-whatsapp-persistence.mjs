import assert from 'node:assert/strict';
import {createHash, createHmac} from 'node:crypto';
import {sealSubscription as seal} from '../server/web-push/installationRegistry.mjs';
import {createInfobipSqlStore, infobipGrantKey} from '../server/infobip-whatsapp-store.mjs';
import {createOfflineInfobipReceiver} from '../server/infobip-whatsapp-candidate.mjs';
import {buildInfobipTextRequest, createInfobipTextTransport} from '../server/infobip-whatsapp-transport.mjs';

// Real SQL adapter + real AEAD, exercised against a synthetic mysql2-shaped
// transaction fixture. No database engine/network/migrations are started.
globalThis.fetch = () => {throw Error('REAL_NETWORK_FORBIDDEN');};
const sender='12025550100', recipient='12025550101', other='12025550102';
const epoch=Date.parse('2032-01-01T12:00:00.000Z'), encryptionKey=Buffer.alloc(32, 7);
const linkHashKey='synthetic-existing-link-hash-secret-only';
const username='synthetic', password='synthetic-not-a-real-webhook-password';
const phoneHash=createHmac('sha256',linkHashKey).update(recipient).digest('hex');
const baseLink={email:'synthetic@example.invalid',consent_concierge:1,revoked_at:null,linked_at:'2031-12-31 12:00:00.000',updated_at:'2031-12-31 12:00:00.000'};
const grantKey=infobipGrantKey(sender,phoneHash);
const event={from:recipient,to:sender,integrationType:'WHATSAPP',receivedAt:'2032-01-01T12:00:00.000Z',messageId:'synthetic-in-1',message:{type:'TEXT',text:'SYNTHETIC PRIVATE QUESTION'}};
const eventKey=createHash('sha256').update(JSON.stringify(['infobip-inbound-v1',sender,event.messageId])).digest('hex');
const stateKey='crewcheck-infobip-inbound-v1:'+eventKey;
const request=(item=event)=>({method:'POST',rawHeaders:['authorization','Basic '+Buffer.from(username+':'+password).toString('base64')],rawBody:Buffer.from(JSON.stringify({results:[item]}))});
function fixture() {
  const s={rows:new Map(),link:{...baseLink},owner:'synthetic-account-A',active:0,queries:[],commits:0,rollbacks:0,releases:0,
    failEnqueue:false,commitUncertain:false,failAfterSend:false,clock:epoch,changeClaim:false};
  const seedGrant=(changes={})=>{
    const grant={provider:'infobip',sender,phoneHash,email:baseLink.email,accountId:s.owner,
      linkRevision:JSON.stringify([baseLink.linked_at,baseLink.updated_at]),consentConcierge:true,active:true,revision:'grant-1',...changes};
    s.rows.set(grantKey,{sealed:seal(grant,encryptionKey,['crewcheck-infobip-state-v1',grantKey])});
  };
  seedGrant(); let tail=Promise.resolve();
  const db={async getConnection(){
    let rows,unlock,began=false;
    return {
      async beginTransaction(){const previous=tail;tail=new Promise(resolve=>{unlock=resolve;});await previous;
        rows=structuredClone(s.rows);began=true;s.active++;},
      async query(sql,p){
        s.queries.push(sql);assert(!/CREATE|ALTER|DROP|DELETE|TRUNCATE/i.test(sql),'no DDL, migrations or claim cleanup');
        assert(began,'every query uses a transaction');
        if(sql.startsWith('SELECT email,consent_concierge')){assert(sql.endsWith('FOR UPDATE'));return [[p[0]===phoneHash&&s.link?{...s.link}:null].filter(Boolean)];}
        if(sql.startsWith('SELECT public_id')){assert(sql.endsWith('FOR UPDATE'));return [[s.owner&&s.link?.email===p[0]?{public_id:s.owner}:null].filter(Boolean)];}
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
      release(){s.releases++;if(began){s.active--;unlock();}},
    };
  }};
  const makeStore=()=>createInfobipSqlStore({db,sender,encryptionKey,linkHashKey,now:()=>s.clock});
  const store=makeStore(),receive=createOfflineInfobipReceiver({sender,username,password,store,now:()=>s.clock});
  return {s,store,receive,makeStore,seedGrant};
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
for(const change of [null,{...baseLink,consent_concierge:0},{...baseLink,revoked_at:'2032-01-01'}, {...baseLink,updated_at:'new'}]){
  const {s,receive}=fixture();s.link=change;assert.equal((await receive(request())).denied,1);assert(!s.rows.has(stateKey));
}
for(const grant of [null,{provider:'meta'},{sender:other},{phoneHash:'wrong'},{accountId:'synthetic-B'},{consentConcierge:false},{active:false}]){
  const {s,receive,seedGrant}=fixture();if(grant===null)s.rows.delete(grantKey);else seedGrant(grant);
  assert.equal((await receive(request())).denied,1);assert(!s.rows.has(stateKey));
}
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
  assert.equal((await receive(request())).accepted,1,'candidate policy accepts 41h30; profile applicability unverified');
  assert.equal(s.rows.get(stateKey).status,'expired');assert.equal(s.rows.get(stateKey).sealed,null);
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
for(const mode of ['revoke','relink','account','grant','expire','failure','uncertain-commit','timeout']){
  const {s,receive,store,seedGrant}=fixture();await receive(request());let calls=0;
  const deps={timeoutMs:2,concierge:async()=>{
    if(mode==='revoke')s.link={...s.link,revoked_at:'now'};
    if(mode==='relink')s.link={...s.link,updated_at:'new'};
    if(mode==='account')s.owner='synthetic-account-B';
    if(mode==='grant')seedGrant({active:false});
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
console.log('PASS Infobip SQL adapter/AEAD + mock transport: no DDL/network, locked binding/grant, atomic enqueue, retry horizon, concurrency, redaction, bounded single attempt, no retry after uncertainty; runtime OFF');
