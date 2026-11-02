import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';

// Block networking before importing the real receiver/store/adapter. No live
// provider, account, recipient, grant, secret or database is used by this suite.
globalThis.fetch=()=>assert.fail('EXTERNAL_NETWORK_FORBIDDEN');
const {createFiniteReserveAdmission,FINITE_ADMISSION_SHIPPING}=await import('../server/concierge-finite-admission-off.mjs');
const {createFiniteReservePrefunder,finiteReserveManifest,FINITE_RESERVE_SHIPPING}=await import('../server/concierge-finite-reserve-off.mjs');
const {sharedCreditKey:key}=await import('../server/concierge-shared-credit-candidate.mjs');
const {createInfobipSqlStore}=await import('../server/infobip-whatsapp-store.mjs');
const {createInfobipInboundReceiver,INFOBIP_WHATSAPP_RELEASE_ENABLED}=await import('../server/infobip-whatsapp-candidate.mjs');
const {createInfobipSqlBudget}=await import('../server/infobip-whatsapp-sql-budget.mjs');
const {fixture,sender,recipient,other,epoch,secrets}=await import('./fixtures/infobip-production-sql.mjs');
const hash=value=>createHash('sha256').update(value).digest('hex');
const programId='synthetic-finite-dispatch',ownerKey=hash('synthetic-owner');
let stubProviderCalls=0;
const policy=()=>({v:1,basis:'explicit-risk-reserve',residualRiskAccepted:true,riskDisclosureVersion:'provisional-provider-cost-v1',
 approvalId:'synthetic-finite-dispatch-approval',evidenceReference:'synthetic-no-real-authority',programId,ownerAccountKey:ownerKey,
 grantManifest:'c'.repeat(64),sender,recipient,approvedAt:epoch,validFrom:epoch,validUntil:epoch+86400000,
 maxAttempts:2,perAttemptMicroUsd:15000,totalMicroUsd:30000,monthlyBudgetMicroUsd:100000,
 observedTariff:{evidenceSha256:'d'.repeat(64),observedAt:epoch,validUntil:epoch+4*3600000,observedUnitMicroUsd:9000},
 observedBudget:{evidenceSha256:'e'.repeat(64),observedAt:epoch,knownSpentMicroUsd:4000,outsideConsumersReserveMicroUsd:10000}});

async function setup({enabled=true}={}){
 const {state,db}=fixture(),p=policy();
 let engine=0,sends=0,gateWrites=0,contextReads=0,engineEffect=()=>{},sqlEffect=()=>{},contextEffect=x=>x;
 let provider=async()=>({status:'accepted_unconfirmed'}),commitFault=null;
 const accountKey=key('account',[programId,ownerKey]),globalKey=key('global',[programId,'2032-01']);
 const tariffKey=key('tariff',[programId,sender,'BR','service-text']),authorityKey=key('finite-reserve-authorization',[p.approvalId]);
 state.rows.set(accountKey,{v:1,kind:'account-credit',accountKey:ownerKey,grantManifest:p.grantManifest,availableMicroUsd:30000,reservedMicroUsd:0,validFrom:epoch,expiresAt:epoch+6*3600000});
 state.rows.set(globalKey,{v:1,kind:'global-credit',period:'2032-01',budgetMicroUsd:100000,knownSpentMicroUsd:4000,reservedMicroUsd:0,reconciled:true,reconciledAt:epoch,billingEvidenceSha256:p.observedBudget.evidenceSha256});
 state.rows.set(tariffKey,{v:1,kind:'verified-tariff',channel:'whatsapp',currency:'USD',country:'BR',sender,category:'service-text',sourceId:'synthetic-observed-tariff',evidenceSha256:p.observedTariff.evidenceSha256,verifiedAt:epoch,unitMicroUsd:9000,validUntil:p.observedTariff.validUntil});
 state.rows.set(authorityKey,{v:1,kind:'finite-reserve-authorization',status:'approved',manifest:finiteReserveManifest(p),approvedAt:epoch,evidenceReference:p.evidenceReference});
 const acquire=db.getConnection.bind(db);
 db.getConnection=async()=>{
  const c=await acquire(),query=c.query.bind(c),commit=c.commit.bind(c);
  c.query=async(sql,args)=>{
   const result=await query(sql,args);
   if(sql.startsWith('UPDATE crewcheck_telegram_state SET payload=?')&&JSON.parse(args[0]).state==='send-authorized')gateWrites++;
   await sqlEffect(sql,args);
   return result;
  };
  c.commit=async()=>{
   if(sends&&commitFault==='before'){commitFault=null;throw Error('SYNTHETIC_COMMIT_NOT_APPLIED');}
   await commit();
   if(sends&&commitFault==='after'){commitFault=null;throw Error('SYNTHETIC_COMMIT_ACK_LOST');}
  };
  return c;
 };
 const transaction=createInfobipSqlBudget(db);
 assert.equal((await transaction(createFiniteReservePrefunder(p,{enabled:true,now:()=>state.clock}))).status,'reserved');
 // The observed records deliberately stay one hour old. This is a synthetic
 // finite-authority test, NOT a production resolver or fabricated refresh.
 state.clock=epoch+3600000;
 const resolveTrustedContext=async(c,j)=>{
  contextReads++;
  const [links]=await c.query('SELECT email,consent_concierge,revoked_at,linked_at,updated_at FROM crewcheck_whatsapp_links WHERE phone_hash=? FOR UPDATE',[createHmac('sha256',secrets.linkHashKey).update(j.recipient).digest('hex')]);
  const link=links[0];if(links.length!==1)return null;
  const [owners]=await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE BINARY email=BINARY ? FOR UPDATE',[link.email]);
  const [prices]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[tariffKey]);
  const recorded=prices.length===1?JSON.parse(prices[0].payload):null;
  if(owners.length!==1||!recorded)return null;
  return contextEffect({accountKey:hash(owners[0].public_id),linked:link.revoked_at===null,consent:Number(link.consent_concierge)===1,
   bindingStamp:JSON.stringify([owners[0].public_id,JSON.stringify([String(link.linked_at),String(link.updated_at)]),'infobip',sender,recipient]),sender,recipient,
   quote:{...recorded,sessionUntil:j.receivedAt+24*3600000}});
 };
 const admission=createFiniteReserveAdmission(p,{enabled,now:()=>state.clock,resolveTrustedContext});
 const make=()=>createInfobipSqlStore({db,sender,encryptionKey:secrets.encryptionKey,linkHashKey:secrets.linkHashKey,now:()=>state.clock});
 const eventKey=id=>hash(JSON.stringify(['infobip-inbound-v1',sender,id]));
 const requestKey=id=>key('request',[programId,eventKey(id)]),jobKey=id=>'crewcheck-infobip-inbound-v1:'+eventKey(id);
 async function receive(store,id,{from=recipient,receivedAt=state.clock}={}){
  const rawBody=Buffer.from(JSON.stringify({results:[{from,to:sender,integrationType:'WHATSAPP',receivedAt:new Date(receivedAt).toISOString(),messageId:id,message:{type:'TEXT',text:'SYNTHETIC OWN SCHEDULE'}}]}));
  return createInfobipInboundReceiver({sender,authentication:{mode:'hmac-sha256',secretKey:secrets.webhookSecret},store,now:()=>state.clock,queueLinkConfirmation:false})({method:'POST',rawBody,rawHeaders:['x-hub-signature','SHA256='+createHmac('sha256',secrets.webhookSecret).update(rawBody).digest('hex')]});
 }
 const send=async(proposal,{signal})=>{
  sends++;stubProviderCalls++;
  assert.equal(proposal.recipient,recipient);
  assert.equal(state.rows.get(jobKey(proposal.replyToMessageId)).status,'dispatching','durable no-retry marker precedes provider');
  assert.equal(state.rows.get(accountKey).reservedMicroUsd>=15000,true,'reservation committed before provider');
  assert.equal(gateWrites,sends,'finite gate consumed this attempt before provider');
  return provider(proposal,{signal});
 };
 const dispatch=(store,id,options={})=>store.exerciseDispatch(eventKey(id),{admission,clock:()=>state.clock,timeoutMs:20,
  concierge:async()=>{engine++;await engineEffect();return 'SYNTHETIC READ ONLY RESULT';},send,...options});
 return {state,db,p,admission,make,receive,dispatch,eventKey,requestKey,jobKey,accountKey,globalKey,tariffKey,authorityKey,transaction,
  stats:()=>({engine,sends,gateWrites,contextReads}),setEngine:fn=>engineEffect=fn,setSql:fn=>sqlEffect=fn,
  setContext:fn=>contextEffect=fn,setProvider:fn=>provider=fn,setCommitFault:x=>commitFault=x};
}
const groups=[];
async function test(name,run){await run();groups.push(name);}
function retained(f,id,{marker='send-authorized',attempts=1}={}){
 assert.equal(f.state.rows.get(f.accountKey).reservedMicroUsd,attempts*15000);
 assert.equal(f.state.rows.get(f.accountKey).availableMicroUsd,30000-attempts*15000);
 const global=f.state.rows.get(f.globalKey);
 assert.equal(global.reservedMicroUsd,40000,'upfront hold is not charged twice or released');
 assert.equal(global.finiteReserve.attempts,attempts);assert.equal(global.finiteReserve.usedMicroUsd,attempts*15000);
 assert.equal(global.reconciledAt,epoch);assert.equal(f.state.rows.get(f.tariffKey).verifiedAt,epoch);
 assert.equal(f.state.rows.get(f.requestKey(id))?.state,marker);
}

await test('default and nonliteral enable remain inert',async()=>{
 assert.equal(FINITE_ADMISSION_SHIPPING,false);assert.equal(FINITE_RESERVE_SHIPPING,false);assert.equal(INFOBIP_WHATSAPP_RELEASE_ENABLED,false);
 for(const enabled of [undefined,false,1,'true']){
  const poison=new Proxy({},{get(){assert.fail('OFF_NO_DEPENDENCY_ACCESS');}});
  const off=createFiniteReserveAdmission(undefined,{enabled,resolveTrustedContext:()=>assert.fail('OFF_NO_RESOLVER')});
  assert.equal(off.allows(poison),false);assert.equal(await off.reserve(poison,poison),false);assert.equal(await off.checkSend(poison,poison),false);
 }
 assert.throws(()=>createFiniteReserveAdmission(policy(),{enabled:true}),/FINITE_ADMISSION_CONFIGURATION/);
 const f=await setup({enabled:false}),store=f.make();await f.receive(store,'off');
 assert.deepEqual(await store.dispatch(f.eventKey('off')),{status:'disabled'});
 assert.equal((await f.dispatch(store,'off')).status,'blocked');assert.equal(f.stats().sends,0);assert.equal(f.stats().contextReads,0);
});

for(const outcome of ['accepted_unconfirmed','rejected','uncertain','throw','timeout'])await test('actual dispatch '+outcome+' is single-use, with retained exposure',async()=>{
 const f=await setup(),store=f.make();let late,providerSignal;
 f.setProvider(async(_proposal,{signal})=>{providerSignal=signal;if(outcome==='throw')throw Error('SYNTHETIC_PROVIDER_REJECTION');if(outcome==='timeout')return new Promise(resolve=>late=resolve);return {status:outcome};});
 assert.equal((await f.receive(store,outcome)).accepted,1);
 const result=await f.dispatch(store,outcome);assert.equal(result.status,outcome==='accepted_unconfirmed'?outcome:'uncertain');
 if(outcome==='timeout'){assert.equal(providerSignal.aborted,true);late({status:'accepted_unconfirmed'});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.state.rows.get(f.jobKey(outcome)).status,'uncertain','late response cannot rewrite settled uncertainty');}
 retained(f,outcome);assert.equal(f.state.rows.get(f.jobKey(outcome)).sealed,null);
 const snapshot=structuredClone(f.state.rows),stats=f.stats();
 await f.dispatch(store,outcome);await f.dispatch(f.make(),outcome);
 assert.deepEqual(f.state.rows,snapshot);assert.deepEqual(f.stats(),stats,'retry/recreated store cannot run engine/gate/provider again');
});

await test('concurrent duplicate dispatch and finite quantity reuse existing ledger only',async()=>{
 const f=await setup(),store=f.make();await f.receive(store,'same');
 await Promise.all(Array.from({length:12},()=>f.dispatch(store,'same')));
 assert.equal(f.stats().sends,1);retained(f,'same');
 for(const id of ['second','exhausted']){await f.receive(store,id);await f.dispatch(store,id);}
 assert.equal(f.stats().sends,2);assert.equal(f.stats().engine,2);retained(f,'second',{attempts:2});
 assert.equal(f.state.rows.get(f.jobKey('exhausted')).status,'cancelled');
 assert(![...f.state.rows.values()].some(row=>row.kind==='promotional-admission'),'no second admission counter');
});

for(const failure of ['owner','consent','binding','account-missing','budget','authority','expiry','tariff-expiry','stale-message','future-message','foreign-recipient'])await test('before reservation denies '+failure,async()=>{
 const f=await setup(),store=f.make(),id='pre-'+failure;
 await f.receive(store,id,{...(failure==='foreign-recipient'?{from:other}:{}),...(failure==='future-message'?{receivedAt:f.state.clock+1}:{})});
 if(failure==='owner')f.state.owner='synthetic-other-owner';
 if(failure==='consent')f.state.link.consent_concierge=0;
 if(failure==='binding')f.state.link.updated_at='synthetic-new-revision';
 if(failure==='account-missing')f.state.rows.delete(f.accountKey);
 if(failure==='budget')f.state.rows.get(f.globalKey).knownSpentMicroUsd=100000;
 if(failure==='authority')f.state.rows.get(f.authorityKey).status='revoked';
 if(failure==='expiry')f.state.clock=f.p.validUntil;
 if(failure==='tariff-expiry')f.state.clock=f.p.observedTariff.validUntil;
 if(failure==='stale-message')f.state.clock+=900001;
 await f.dispatch(store,id);assert.equal(f.stats().engine,0);assert.equal(f.stats().sends,0);
 assert.equal(f.state.rows.get(f.globalKey).finiteReserve.attempts,0);assert.equal(f.state.rows.get(f.requestKey(id))?.state==='reserved',false);
});

for(const failure of ['authority','account-expiry','tariff-expiry','tariff-observation','budget','usage','marker-account','context-owner','context-consent','context-link','context-binding','session','abort','stale-message'])await test('final gate after reservation denies '+failure+' without refund',async()=>{
 const f=await setup(),store=f.make(),id='post-'+failure,controller=new AbortController();await f.receive(store,id);
 f.setEngine(()=>{
  if(failure==='authority')f.state.rows.get(f.authorityKey).status='revoked';
  if(failure==='account-expiry')f.state.rows.get(f.accountKey).expiresAt=f.state.clock;
  if(failure==='tariff-expiry')f.state.rows.get(f.tariffKey).validUntil=f.state.clock;
  if(failure==='tariff-observation')f.state.rows.get(f.tariffKey).verifiedAt=epoch+1;
  if(failure==='budget')f.state.rows.get(f.globalKey).knownSpentMicroUsd=100000;
  if(failure==='usage')f.state.rows.get(f.globalKey).finiteReserve.usedMicroUsd++;
  if(failure==='marker-account')f.state.rows.get(f.requestKey(id)).accountKey='f'.repeat(64);
  if(failure.startsWith('context-'))f.setContext(x=>({...x,...({'context-owner':{accountKey:'f'.repeat(64)},'context-consent':{consent:false},'context-link':{linked:false},'context-binding':{bindingStamp:'wrong'}}[failure])}));
  if(failure==='session')f.setContext(x=>({...x,quote:{...x.quote,sessionUntil:f.state.clock}}));
  if(failure==='abort')controller.abort();
  if(failure==='stale-message')f.state.clock+=900001;
 });
 await f.dispatch(store,id,{signal:controller.signal});assert.equal(f.stats().engine,1);assert.equal(f.stats().sends,0);
 assert.equal(f.state.rows.get(f.accountKey).reservedMicroUsd,15000);assert.equal(f.state.rows.get(f.globalKey).reservedMicroUsd,40000);
 assert.equal(f.state.rows.get(f.requestKey(id)).state,'reserved');assert.equal(f.state.rows.get(f.jobKey(id)).status,'cancelled');
 const snapshot=structuredClone(f.state.rows);await f.dispatch(f.make(),id);assert.deepEqual(f.state.rows,snapshot);assert.equal(f.stats().sends,0);
});

await test('grant expires during final gate UPDATE: rollback, dispatching remains no-retry',async()=>{
 const f=await setup(),store=f.make(),id='gate-expiry';await f.receive(store,id);
 f.state.rows.get(f.accountKey).expiresAt=f.state.clock+5;
 f.setSql((sql,args)=>{if(sql.startsWith('UPDATE crewcheck_telegram_state SET payload=?')&&JSON.parse(args[0]).state==='send-authorized')f.state.clock+=5;});
 assert.equal((await f.dispatch(store,id)).status,'uncertain');assert.equal(f.stats().sends,0);retained(f,id,{marker:'reserved'});
 assert.equal(f.state.rows.get(f.jobKey(id)).status,'dispatching');
 await f.dispatch(f.make(),id);assert.equal(f.stats().engine,1);assert.equal(f.stats().gateWrites,1);assert.equal(f.stats().sends,0);
});

for(const fault of ['save','before','after'])await test('provider accepted then '+fault+' failure never permits retry/refund',async()=>{
 const f=await setup(),store=f.make(),id='ack-'+fault;await f.receive(store,id);
 if(fault==='save')f.setSql((sql,args)=>{if(sql.startsWith('UPDATE crewcheck_telegram_state SET payload=?')&&JSON.parse(args[0]).status==='accepted_unconfirmed')throw Error('SYNTHETIC_SAVE_FAILURE_AFTER_PROVIDER');});
 else f.setCommitFault(fault);
 assert.equal((await f.dispatch(store,id)).status,'uncertain');assert.equal(f.stats().sends,1);
 retained(f,id,{marker:fault==='after'?'send-authorized':'reserved'});
 assert.equal(f.state.rows.get(f.jobKey(id)).status,fault==='after'?'accepted_unconfirmed':'dispatching');
 const snapshot=structuredClone(f.state.rows);await f.dispatch(f.make(),id);assert.deepEqual(f.state.rows,snapshot);assert.equal(f.stats().sends,1);
});

await test('reservation rollback and committed reservation ACK loss keep existing lifecycle semantics',async()=>{
 for(const fault of ['rollback','lost-ack']){
  const f=await setup(),store=f.make(),id='reserve-'+fault;await f.receive(store,id);
  f.state[fault==='rollback'?'failMarker':'lostAck']=true;
  assert.equal((await f.dispatch(store,id)).status,'uncertain');assert.equal(f.stats().engine,0);assert.equal(f.stats().sends,0);
  assert.equal(f.state.rows.get(f.accountKey).reservedMicroUsd,fault==='rollback'?0:15000);
  if(fault==='lost-ack'){retained(f,id,{marker:'reserved'});await f.dispatch(f.make(),id);assert.equal(f.stats().engine,0);}
 }
});

assert.equal(stubProviderCalls,10,'the positive, failure and uncertain-send controls must reach the injected provider stub');
console.log(JSON.stringify({suite:'OFF finite admission through actual receiver and dispatchAttempt',groups:groups.length,checks:groups,
 syntheticSqlModel:true,realMysql:false,productionResolverSupplied:false,externalCalls:0,realProviderCalls:0,stubProviderCalls}));
