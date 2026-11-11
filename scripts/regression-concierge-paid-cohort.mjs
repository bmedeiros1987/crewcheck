import assert from 'node:assert/strict';
globalThis.fetch=()=>assert.fail('EXTERNAL_NETWORK_FORBIDDEN');
const {cohortFixture,ownerEmail,secrets,epoch,sender}=await import('./fixtures/infobip-cohort-sql.mjs');
const {createInfobipWhatsAppProduction}=await import('../server/infobip-whatsapp-production.mjs');
const {createInfobipProductionTextTransport}=await import('../server/infobip-whatsapp-transport.mjs');
const {createInfobipSqlBudget,isOwnedInfobipRepeatableRead}=await import('../server/infobip-whatsapp-sql-budget.mjs');
const {lockCanonicalCreditIdentities}=await import('../server/concierge-promotional-credit-sql.mjs');
const {readPaidCanonicalEntitlement,paidEntitlementValid}=await import('../server/concierge-paid-entitlement.mjs');
const {resolvePlatformEntitlement}=await import('../server/platform-entitlement.mjs');
const checks=[];let stubProviderCalls=0;
const test=async(name,run)=>{await run();checks.push(name);};
const financial=f=>JSON.stringify([...f.state.rows]);
const consumed=(f,n)=>{
 const m=f.p.members[0],g=f.state.rows.get(f.globalKey),a=f.state.rows.get(f.accountKey(m));
 assert.equal(g.finiteReserve.attempts,n);assert.equal(g.finiteReserve.usedMicroUsd,n*m.perAttemptMicroUsd);
 assert.equal(a.reservedMicroUsd,n*m.perAttemptMicroUsd);
};
async function dispatch(f,id){
 const runtime=await createInfobipWhatsAppProduction(f.options);
 try {assert.equal((await f.stage(0,id)).accepted,1);return await runtime.dispatch(f.eventKey(id));}
 finally {await runtime.dispose();stubProviderCalls+=f.stats().sends;}
}
async function proof(f,c){
 const m=f.p.members[0],identities=await lockCanonicalCreditIdentities(c,[{ownerAccountKey:m.ownerAccountKey,sender,recipient:m.recipient,phoneHash:m.recipientHash}]);
 const identity=identities.get(m.ownerAccountKey),paid=await readPaidCanonicalEntitlement(c,identity,{now:()=>f.state.clock});
 return {identity,paid,binding:{accountKey:m.ownerAccountKey,bindingStamp:identity.bindingStamp}};
}

const cases=[
 ['free',p=>p.plan='free',s=>s.plan='free',false],
 ['missing',p=>p.plan='free',()=>null,false],
 ['stale profile',p=>p.plan='premium_monthly',s=>s.status='canceled',false],
 ['unknown status',()=>{},s=>s.status='invented',false],
 ['unknown plan',()=>{},s=>s.plan='invented',false],
 ['expired boundary',()=>{},s=>s.current_period_end=new Date(epoch),false],
 ['invalid period',()=>{},s=>s.current_period_end='invalid',false],
 ['active',()=>{},()=>{},true],
 ['trialing',()=>{},s=>s.status='trialing',true],
 ['grace',()=>{},s=>s.status='grace_period',true],
 ['lifetime canonical override',p=>p.plan='premium_unlimited',s=>s.status='canceled',true],
 ['legacy default denied',p=>p.plan='premium_annual',()=>null,false],
 ['existing trusted legacy',p=>p.plan='premium_annual',()=>null,true,true],
];
for(const [name,changeProfile,changeSubscription,allowed,legacy=false] of cases)await test('actual caller canonical plan: '+name,async()=>{
 const f=await cohortFixture(),email=ownerEmail(0),p=f.state.profiles.get(email),s=f.state.subscriptions.get(email);
 changeProfile(p);if(changeSubscription(s)===null)f.state.subscriptions.delete(email);
 f.options.trustLegacyPremiumProfile=legacy;
 assert.equal(resolvePlatformEntitlement(p,f.state.subscriptions.get(email)||null,{now:epoch,trustLegacyPremiumProfile:legacy}).premiumAccess,allowed);
 await dispatch(f,'plan-'+checks.length);
 assert.equal(f.stats().engines,Number(allowed),'FREE_MEMBER_MUST_NOT_INVOKE_ENGINE');assert.equal(f.stats().sends,Number(allowed));consumed(f,Number(allowed));
});

for(const phase of ['initial','replay'])await test('all8 '+phase+' one free member denies without repair/refill',async()=>{
 const f=await cohortFixture({count:8,fund:phase==='replay'});f.state.subscriptions.delete(ownerEmail(7));
 const before=financial(f);assert.equal((await f.transaction(f.prefund)).status,'denied');assert.equal(financial(f),before);
});
for(const field of ['paidSchemaMissing','paidColumnMissing','paidIndexMissing','schemaMissing','indexMissing','columnMissing'])await test('canonical subscription schema fails closed: '+field,async()=>{
 const f=await cohortFixture({fund:false});f.state[field]=true;const before=financial(f);
 await assert.rejects(f.transaction(f.prefund));await assert.rejects(createInfobipWhatsAppProduction(f.options));assert.equal(financial(f),before);assert.deepEqual(f.stats(),{engines:0,sends:0});
});
await test('postwrite paid expiry rolls back prefund and atomic reserve/preparing',async()=>{
 const f=await cohortFixture({fund:false}),before=financial(f);f.state.subscriptions.get(ownerEmail(0)).current_period_end=new Date(epoch+1);
 f.setSql(sql=>{if(sql.startsWith('UPDATE crewcheck_telegram_state'))f.state.clock=epoch+1;});
 await assert.rejects(f.transaction(f.prefund));assert.equal(financial(f),before);
 const d=await cohortFixture();d.state.subscriptions.get(ownerEmail(0)).current_period_end=new Date(epoch+1);
 d.setSql((sql,args)=>{if(sql.startsWith('UPDATE crewcheck_telegram_state')&&JSON.parse(args[0]).status==='preparing')d.state.clock=epoch+1;});
 await dispatch(d,'paid-last-preparing');consumed(d,0);assert.deepEqual(d.stats(),{engines:0,sends:0});assert(!d.state.rows.has(d.requestKey('paid-last-preparing')));
});
await test('downgrade after reservation denies engine and retains one attempt',async()=>{
 const f=await cohortFixture();f.setSql((sql,args)=>{if(sql.startsWith('UPDATE crewcheck_telegram_state')&&JSON.parse(args[0]).status==='preparing')f.state.subscriptions.get(ownerEmail(0)).status='canceled';});
 await dispatch(f,'downgrade-before-engine');assert.deepEqual(f.stats(),{engines:0,sends:0});consumed(f,1);
});
await test('downgrade after engine denies provider and retains debit across reconstruction',async()=>{
 const f=await cohortFixture();f.setEngine(()=>{f.state.subscriptions.get(ownerEmail(0)).status='canceled';});
 await dispatch(f,'downgrade-after-engine');assert.deepEqual(f.stats(),{engines:1,sends:0});consumed(f,1);
 const r=await createInfobipWhatsAppProduction(f.options);try{await r.dispatch(f.eventKey('downgrade-after-engine'));}finally{await r.dispose();}
 assert.deepEqual(f.stats(),{engines:1,sends:0});consumed(f,1);
});
await test('expiry after awaited send marker denies provider without refund',async()=>{
 const f=await cohortFixture();f.state.subscriptions.get(ownerEmail(0)).current_period_end=new Date(epoch+1);
 f.setSql((sql,args)=>{if(sql.startsWith('UPDATE crewcheck_telegram_state')&&JSON.parse(args[0]).state==='send-authorized')f.state.clock=epoch+1;});
 await dispatch(f,'expiry-gate-update');assert.deepEqual(f.stats(),{engines:1,sends:0});consumed(f,1);
});
await test('expiry during synchronous request construction denies actual request',async()=>{
 const f=await cohortFixture();f.state.subscriptions.get(ownerEmail(0)).current_period_end=new Date(epoch+1);
 const stringify=JSON.stringify;let built=0;
 JSON.stringify=function(value,...args){const result=stringify.call(this,value,...args);if(value?.from===sender&&value?.content?.text){built++;f.state.clock=epoch+1;}return result;};
 try{await dispatch(f,'expiry-during-build');}finally{JSON.stringify=stringify;}
 assert.equal(built,1);assert.deepEqual(f.stats(),{engines:1,sends:0});consumed(f,1);
});
for(const failure of ['before-any','after-any'])await test('engine invocation plus '+failure+' authorization COMMIT never repeats or sends',async()=>{
 const f=await cohortFixture();let started=0;f.setEngine(()=>{started++;});
 // The canonical engine invocation increments engines synchronously, before
 // its independent fixture DB work can run. Arm only its authorization COMMIT.
 f.setSql((sql,args,result)=>{if(sql.startsWith('SELECT payload')&&result[0]?.[0]){const row=JSON.parse(result[0][0].payload);if(row.status==='preparing'&&row.engineActive===true)f.setCommitFailure(failure);}});
 await dispatch(f,'engine-commit-'+failure);assert.equal(f.stats().engines,1);assert.equal(started,1);assert.equal(f.stats().sends,0);consumed(f,1);
 const r=await createInfobipWhatsAppProduction(f.options);try{await r.dispatch(f.eventKey('engine-commit-'+failure));}finally{await r.dispose();}assert.equal(f.stats().engines,1);
});
await test('preparation 5s input abort during authorization SQL prevents engine start',async()=>{
 const f=await cohortFixture();let authorization=0,delays=0;
 f.setSql(async(sql)=>{
  const preparing=[...f.state.rows.values()].some(row=>row.status==='preparing'&&row.engineActive===true);
  if(preparing&&sql==='SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')authorization++;
  if(authorization===2&&sql.startsWith('SELECT')&&delays<6){delays++;await new Promise(resolve=>setTimeout(resolve,900));}
 });
 await dispatch(f,'engine-preparation-abort');assert.equal(delays,6);assert.deepEqual(f.stats(),{engines:0,sends:0});consumed(f,1);
});
await test('expiry after actual provider invocation retains accepted debit and no retry',async()=>{
 const f=await cohortFixture();f.setRequest(message=>{f.state.clock=f.p.validUntil;f.state.subscriptions.get(ownerEmail(0)).status='canceled';return new Response(JSON.stringify({to:message.to,messageId:message.messageId,status:{groupId:1,groupName:'PENDING',id:26,name:'PENDING_ACCEPTED'}}));});
 assert.equal((await dispatch(f,'expiry-after-request')).status,'accepted_unconfirmed');consumed(f,1);assert.equal(f.stats().sends,1);
 const r=await createInfobipWhatsAppProduction(f.options);try{await r.dispatch(f.eventKey('expiry-after-request'));}finally{await r.dispose();}assert.equal(f.stats().sends,1);
});

await test('RR proof is same-client, private, active and snapshots are not mutable externally',async()=>{
 const f=await cohortFixture();let saved;
 await f.transaction(async c=>{assert(isOwnedInfobipRepeatableRead(c));assert(!isOwnedInfobipRepeatableRead({...c}));
  const p=await proof(f,c);saved={c,...p};assert(paidEntitlementValid(c,p.paid,p.binding));assert(!paidEntitlementValid({...c},p.paid,p.binding));assert(!paidEntitlementValid(c,{},p.binding));
  f.state.subscriptions.get(ownerEmail(0)).current_period_end.setTime(0);assert(paidEntitlementValid(c,p.paid,p.binding),'snapshot must be private');
 });
 assert(!paidEntitlementValid(saved.c,saved.paid,saved.binding));await assert.rejects(saved.c.query('SELECT expired'));
 await createInfobipSqlBudget(f.db)(async c=>{assert(!isOwnedInfobipRepeatableRead(c));await assert.rejects(proof(f,c));});
});
await test('only the real gate mints an exact attempt/request-bound one-shot transport fence',async()=>{
 const {createInfobipFiniteBetaScope}=await import('../server/infobip-whatsapp-finite-beta.mjs');
 assert.equal((await import('../server/concierge-paid-entitlement.mjs')).createPaidRequestFence,undefined);
 for(const kind of ['good','wrong-target','wrong-attempt','wrong-marker','missing-version','wrong-version','engine-active','engine-owner','copied','ended']){
  const f=await cohortFixture(),job=f.job(0,'fence-'+kind),attemptId='synthetic-attempt';let calls=0,savedFence;
  const admission=createInfobipFiniteBetaScope(f.options.configuration,f.options.admission,{now:()=>f.state.clock}).createAdmission(secrets.linkHashKey);
  assert.equal((await f.stage(0,'fence-'+kind)).accepted,1);
  await f.transaction(async c=>assert.equal(await admission.reserve(c,job),true));
  const markerKey='crewcheck-infobip-inbound-v1:'+job.eventKey,marker={...f.state.rows.get(markerKey),status:kind==='wrong-marker'?'preparing':'dispatching',attemptId,preparationId:'synthetic-completed-preparation',engineActive:kind==='engine-active',engineOwner:kind==='engine-owner'?'unexpected':null};
  if(kind==='missing-version')delete marker.v;if(kind==='wrong-version')marker.v=2;f.state.rows.set(markerKey,marker);
  const badMarker=['wrong-marker','missing-version','wrong-version','engine-active','engine-owner'].includes(kind);
  const proposal={...job,text:'synthetic',messageId:`cc-${job.eventKey}`,replyToMessageId:'fence-'+kind};
  const transport=createInfobipProductionTextTransport({baseUrl:'https://synthetic.api.infobip.com',sender,apiKey:secrets.apiKey,requirePaidEntitlement:true,request:async()=>{calls++;return new Response('{}');}});
  await f.transaction(async c=>{
   assert.equal(await admission.checkSend(c,job,attemptId),!badMarker);
   const fence=admission.requestFence(c,job,attemptId,[],5000);if(badMarker){assert.equal(fence,null);return;}assert(fence);
   if(kind==='ended'){savedFence=fence;return;}
   const context={paidFence:kind==='copied'?{...fence}:fence,attemptId:kind==='wrong-attempt'?'other-attempt':attemptId};
   let target=proposal;if(kind==='wrong-target'){const binding=JSON.parse(proposal.bindingStamp);binding[4]=f.p.members[1].recipient;target={...proposal,recipient:binding[4],bindingStamp:JSON.stringify(binding)};}
   await transport.send(target,context);
   if(kind==='copied'){assert.equal(calls,0);await transport.send(proposal,{paidFence:fence,attemptId});}
   await transport.send(proposal,{paidFence:fence,attemptId});
  });
  if(savedFence)await transport.send(proposal,{paidFence:savedFence,attemptId});
  assert.equal(calls,['good','copied'].includes(kind)?1:0);stubProviderCalls+=calls;consumed(f,1);
 }
});
await test('owned RR SET precedes BEGIN, errors discard and no retry/setting leak',async()=>{
 for(const failure of [null,'set','begin','rollback']){
  const trace=[];let acquired=0;
  const raw={async query(sql){trace.push('set');assert.equal(sql,'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');if(failure==='set')throw Error('synthetic');return [[]];},async beginTransaction(){trace.push('begin');if(failure==='begin')throw Error('synthetic');},async commit(){trace.push('commit');},async rollback(){trace.push('rollback');if(failure==='rollback')throw Error('synthetic');},release(){trace.push('release');},destroy(){trace.push('destroy');}};
  const run=createInfobipSqlBudget({async getConnection(){acquired++;return raw;}},{repeatableRead:true});
  const action=()=>run(c=>{assert(isOwnedInfobipRepeatableRead(c));trace.push('action');if(failure==='rollback')throw Error('synthetic');});
  if(failure)await assert.rejects(action());else await action();
  assert.equal(acquired,1);assert.equal(trace[0],'set');if(failure!=='set')assert.equal(trace[1],'begin');
  if(failure){assert(trace.includes('destroy'));assert(!trace.includes('release'));}else assert.deepEqual(trace,['set','begin','action','commit','release']);
 }
});

await test('async construction cannot strip captured cohort mode or its paid preflight',async()=>{
 for(const schema of [false,true]){
  const f=await cohortFixture();f.state.subscriptions.get(ownerEmail(0)).current_period_end=new Date(epoch+1);
  const resolve=f.options.credentials.resolve;f.options.credentials={resolve:async(...args)=>{delete f.options.admission.finiteCohort;f.options.configuration.finiteBeta=false;f.state.paidIndexMissing=schema;return resolve(...args);}};
  if(schema){await assert.rejects(createInfobipWhatsAppProduction(f.options));assert.deepEqual(f.stats(),{engines:0,sends:0});continue;}
  const stringify=JSON.stringify;let built=0;
  JSON.stringify=function(value,...args){const result=stringify.call(this,value,...args);if(value?.from===sender&&value?.content?.text){built++;f.state.clock=epoch+1;}return result;};
  try{await dispatch(f,'mutated-construction');}finally{JSON.stringify=stringify;}
  assert.equal(built,1);assert.deepEqual(f.stats(),{engines:1,sends:0});consumed(f,1);
 }
});
await test('owned RR acquisition has original2s deadline and cleans late connection once',async()=>{
 for(const [transactionMs,queryMs,delay]of [[8000,2000,2200],[15,20,35]]){
  let acquired=0,released=0,destroyed=0,called=0,sql=0;
  const raw={query(){sql++;return Promise.resolve([[]]);},beginTransaction(){sql++;return Promise.resolve();},commit(){sql++;return Promise.resolve();},rollback(){sql++;return Promise.resolve();},release(){released++;},destroy(){destroyed++;}};
  const run=createInfobipSqlBudget({async getConnection(){acquired++;await new Promise(resolve=>setTimeout(resolve,delay));return raw;}},{transactionMs,queryMs,repeatableRead:true});
  await assert.rejects(run(()=>{called++;}));await new Promise(resolve=>setTimeout(resolve,delay-queryMs+60));
  assert.deepEqual({acquired,released,destroyed,called,sql},{acquired:1,released:1,destroyed:0,called:0,sql:0});
 }
 // Preserve ordinary/v1's total-only acquisition behavior.
 let called=0;const raw={async query(){return [[]];},async beginTransaction(){},async commit(){},async rollback(){},release(){},destroy(){}};
 await createInfobipSqlBudget({async getConnection(){await new Promise(resolve=>setTimeout(resolve,25));return raw;}},{transactionMs:100,queryMs:10})(()=>{called++;});assert.equal(called,1);
});
await test('engine fence honors outer cancellation and owned-query abort independently',async()=>{
 for(const mode of ['outer','owned']){
  const f=await cohortFixture();let reads=0,r,stopping;
  if(mode==='owned')f.options.sqlBudget={queryMs:20,transactionMs:8000};
  f.setSql(async sql=>{if(sql.startsWith('SELECT * FROM crewcheck_platform_subscriptions')&&++reads===2){if(mode==='outer')stopping=r.dispose();else await new Promise(resolve=>setTimeout(resolve,40));}});
  r=await createInfobipWhatsAppProduction(f.options);try{await f.stage(0,'engine-abort-'+mode);await r.dispatch(f.eventKey('engine-abort-'+mode));}finally{await (stopping||r.dispose());}
  await new Promise(resolve=>setTimeout(resolve,50));assert.deepEqual(f.stats(),{engines:0,sends:0});consumed(f,1);
 }
});
await test('engine ignoring abort keeps quiescence ownership until actual settle',async()=>{
 const f=await cohortFixture();let begin,finish,stopping;
 const began=new Promise(resolve=>begin=resolve),pending=new Promise(resolve=>finish=resolve);
 f.setEngine(async()=>{begin();await pending;});const r=await createInfobipWhatsAppProduction(f.options);let done=false;
 try{
  await f.stage(0,'slow-engine');const work=r.dispatch(f.eventKey('slow-engine'));work.finally(()=>{done=true;});await began;stopping=r.dispose();
  await new Promise(resolve=>setTimeout(resolve,30));assert.equal(done,false);assert.equal(f.state.rows.get('crewcheck-infobip-inbound-v1:'+f.eventKey('slow-engine')).engineActive,true);
  finish();await work;assert.equal(f.state.rows.get('crewcheck-infobip-inbound-v1:'+f.eventKey('slow-engine')).engineActive,false);assert.deepEqual(f.stats(),{engines:1,sends:0});consumed(f,1);
 }finally{finish();await (stopping||r.dispose());}
});
await test('reviewed grant composition rolls back original writer on postwrite paid expiry',async()=>{
 const {createPromotionalGrantWriter}=await import('../server/concierge-promotional-credit-sql.mjs');
 const f=await cohortFixture({fund:false,grant:false}),before=financial(f),m=f.p.members[0];
 f.state.subscriptions.get(ownerEmail(0)).current_period_end=new Date(epoch+1);
 f.setSql((sql,args)=>{if(sql.startsWith('UPDATE crewcheck_telegram_state')&&JSON.parse(args[0]).kind==='promotional-grant-receipt')f.state.clock=epoch+1;});
 await assert.rejects(f.transaction(async c=>{const p=await proof(f,c);assert(p.paid);assert.equal((await createPromotionalGrantWriter({...m.grant,enabled:true},{now:()=>f.state.clock})(c,{ownerPublicId:p.identity.publicId})).status,'granted');if(!paidEntitlementValid(c,p.paid,p.binding))throw Error('PAID_GRANT_EXPIRED');}));
 assert.equal(financial(f),before);
});
console.log(JSON.stringify({suite:'paid canonical cohort',groups:checks.length,checks,stubProviderCalls,realProviderCalls:0,externalCalls:0,syntheticSql:true,realMysql:false}));
