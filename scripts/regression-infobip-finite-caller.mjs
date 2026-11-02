import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {Readable} from 'node:stream';

// Set the network tripwire before importing the actual production composition.
// The request capability below is a stub; no real account/recipient/grant exists.
globalThis.fetch=()=>assert.fail('EXTERNAL_NETWORK_FORBIDDEN');
const {validateInfobipRestrictedPolicy,createInfobipWhatsAppSingleTestHost}=await import('../server/infobip-whatsapp-single-test.mjs');
const {createInfobipWhatsAppProduction}=await import('../server/infobip-whatsapp-production.mjs');
const {createPromotionalGrantWriter,promotionalGrantManifest,createPromotionalCreditSqlResolver}=await import('../server/concierge-promotional-credit-sql.mjs');
const {createFiniteReservePrefunder,finiteReserveManifest}=await import('../server/concierge-finite-reserve-off.mjs');
const {createFiniteCreditSqlResolver}=await import('../server/concierge-finite-credit-sql.mjs');
const {createInfobipFiniteBetaScope}=await import('../server/infobip-whatsapp-finite-beta.mjs');
const {createInfobipSqlBudget}=await import('../server/infobip-whatsapp-sql-budget.mjs');
const {CONCIERGE_GLOBAL_BUDGET_PROGRAM:programId}=await import('../server/infobip-whatsapp-promotional-beta.mjs');
const {configureWhatsAppConcierge}=await import('../server/whatsapp.mjs');
const {isConciergeConversationWritesOnly}=await import('../server/concierge-read-only-scope.mjs');
const {infobipCanonicalLinkStatus}=await import('../server/infobip-whatsapp-link-policy.mjs');
const {sharedCreditKey:key}=await import('../server/concierge-shared-credit-candidate.mjs');
const {fixture,sender,recipient,other,epoch,secrets}=await import('./fixtures/infobip-production-sql.mjs');
const hash=s=>createHash('sha256').update(s).digest('hex'),owner='synthetic-owner',ownerKey=hash(owner);
const baseUrl='https://synthetic.api.infobip.com',publicOrigin='https://crewcheck.example.invalid';
let allStubCalls=0;

async function setup({fund=true}={}){
 const {state,db}=fixture();let engines=0,sends=0,engineEffect=()=>{},sqlEffect=()=>{},commitFailure=null,profileFault=null;
 let requestResult=async m=>new Response(JSON.stringify({to:m.to,messageId:m.messageId,status:{groupId:1,groupName:'PENDING',id:26,name:'PENDING_ACCEPTED'}}));
 const grant={version:1,approvalId:'synthetic-original-grant-approval',programId,ownerAccountKey:ownerKey,amountMicroUsd:30000,validFrom:epoch,validUntil:epoch+86400000,monthlyBudgetMicroUsd:20000000};
 const finiteReserve={v:1,basis:'explicit-risk-reserve',residualRiskAccepted:true,riskDisclosureVersion:'provisional-provider-cost-v1',
  approvalId:'synthetic-distinct-finite-approval',evidenceReference:'synthetic-specific-risk-approval',programId,ownerAccountKey:ownerKey,grantManifest:promotionalGrantManifest(grant),sender,recipient,
  approvedAt:epoch,validFrom:epoch,validUntil:epoch+6*3600000,maxAttempts:2,perAttemptMicroUsd:15000,totalMicroUsd:30000,monthlyBudgetMicroUsd:20000000,
  observedTariff:{evidenceSha256:'a'.repeat(64),observedAt:epoch,validUntil:epoch+4*3600000,observedUnitMicroUsd:9000,sourceId:'synthetic-original-price',setupMicroUsd:1000,markupMicroUsd:2000},
  observedBudget:{evidenceSha256:'b'.repeat(64),observedAt:epoch,knownSpentMicroUsd:4000000,outsideConsumersReserveMicroUsd:1000000}};
 const configuration={finiteBeta:true,sender,baseUrl,allowedSenders:[sender],allowedBaseUrls:[baseUrl],authentication:'hmac-sha256',
  credentialReferences:{apiKey:'fixture/api',encryptionKey:'fixture/content',linkHashKey:'fixture/link',webhookSecret:'fixture/webhook'},
  deploymentBinding:{profileId:'synthetic-profile',subscriptionIds:['synthetic-subscription'],sender,baseUrl,publicOrigin,linkHashKeyReference:'fixture/link'}};
 const admission={enabled:true,grant,finiteReserve},policy={version:1,mode:'finite-risk-beta-v1',maxCostUsd:'0.03',configuration,admission};
 const accountKey=key('account',[programId,ownerKey]),globalKey=key('global',[programId,'2032-01']);
 const grantAuthKey=key('grant-authorization',[grant.approvalId]),receiptKey=key('grant-receipt',[grant.approvalId]),finiteAuthKey=key('finite-reserve-authorization',[finiteReserve.approvalId]);
 const tariffKey=key('tariff',[programId,sender,'BR','service-text']),phoneHash=createHmac('sha256',secrets.linkHashKey).update(recipient).digest('hex');
 state.rows.set(globalKey,{v:1,kind:'global-credit',period:'2032-01',budgetMicroUsd:20000000,knownSpentMicroUsd:4000000,reservedMicroUsd:0,reconciled:true,reconciledAt:epoch,billingEvidenceSha256:finiteReserve.observedBudget.evidenceSha256});
 state.rows.set(grantAuthKey,{v:1,kind:'promotional-grant-authorization',status:'approved',manifest:promotionalGrantManifest(grant),approvedAt:epoch,evidenceReference:'synthetic-original-grant-authority'});
 state.rows.set(finiteAuthKey,{v:1,kind:'finite-reserve-authorization',status:'approved',manifest:finiteReserveManifest(finiteReserve),approvedAt:epoch,evidenceReference:finiteReserve.evidenceReference});
 state.rows.set(tariffKey,{v:1,kind:'verified-tariff',channel:'whatsapp',currency:'USD',country:'BR',sender,recipientHash:phoneHash,category:'service-text',sourceId:'synthetic-original-price',evidenceSha256:'a'.repeat(64),verifiedAt:epoch,validUntil:epoch+4*3600000,unitMicroUsd:9000,setupMicroUsd:1000,markupMicroUsd:2000});
 const acquire=db.getConnection.bind(db);
 db.getConnection=async()=>{
  const c=await acquire(),query=c.query.bind(c),commit=c.commit.bind(c);
  c.query=async(sql,args)=>{
   const result=await query(sql,args);
   if(sql.startsWith('SELECT public_id')&&profileFault==='absent')return [[]];
   if(sql.startsWith('SELECT public_id')&&profileFault==='ambiguous')return [[{public_id:state.owner},{public_id:state.owner}]];
   await sqlEffect(sql,args);return result;
  };
  c.commit=async()=>{
   if(sends&&commitFailure==='before'){commitFailure=null;throw Error('SYNTHETIC_FINAL_COMMIT_NOT_APPLIED');}
   await commit();if(sends&&commitFailure==='after'){commitFailure=null;throw Error('SYNTHETIC_FINAL_COMMIT_ACK_LOST');}
  };return c;
 };
 const transaction=createInfobipSqlBudget(db);
 if(fund){
  assert.equal((await transaction(c=>createPromotionalGrantWriter({...grant,enabled:true},{now:()=>state.clock})(c,{ownerPublicId:owner}))).status,'granted');
  assert.equal((await transaction(createFiniteReservePrefunder(finiteReserve,{enabled:true,now:()=>state.clock}))).status,'reserved');
 }
 // Old observations remain exactly original; only the synthetic application
 // clock advances. This is not a fake provider timestamp refresh.
 state.clock=epoch+3600000;
 configureWhatsAppConcierge(async input=>{engines++;assert(isConciergeConversationWritesOnly({email:input.email}));await engineEffect();return 'SYNTHETIC OWN SAVED SCHEDULE';});
 const options={enabled:true,configuration,admission,db,now:()=>state.clock,ingress:{mode:'direct-tls',publicOrigin},credentials:{resolve:async(_ref,{purpose})=>secrets[purpose]},scheduler:{set:()=>1,clear(){}},
  request:async(_url,{body})=>{sends++;allStubCalls++;const m=JSON.parse(body);assert.equal(m.to,recipient);assert.equal(state.rows.get(accountKey).reservedMicroUsd>=15000,true);return requestResult(m);}};
 const eventKey=id=>hash(JSON.stringify(['infobip-inbound-v1',sender,id])),requestKey=id=>key('request',[programId,eventKey(id)]),jobKey=id=>'crewcheck-infobip-inbound-v1:'+eventKey(id);
 const job=id=>({provider:'infobip',kind:'text',sender,recipient,eventKey:eventKey(id),receivedAt:state.clock,bindingStamp:JSON.stringify([state.owner,JSON.stringify([String(state.link.linked_at),String(state.link.updated_at)]),'infobip',sender,recipient])});
 const resolver=()=>createFiniteCreditSqlResolver({finiteReserve,grant,linkHashKey:secrets.linkHashKey,now:()=>state.clock});
 async function route(runtime,id,text='qual minha próxima jornada?',{from=recipient,validHmac=true}={}){
  const rawBody=Buffer.from(JSON.stringify({results:[{from,to:sender,integrationType:'WHATSAPP',receivedAt:new Date(state.clock).toISOString(),messageId:id,message:{type:'TEXT',text}}]}));
  const req=Readable.from([rawBody]);Object.assign(req,{method:'POST',rawHeaders:['x-hub-signature','SHA256='+(validHmac?createHmac('sha256',secrets.webhookSecret).update(rawBody).digest('hex'):'0'.repeat(64))],headers:{host:new URL(publicOrigin).host,'content-type':'application/json'},socket:{encrypted:true}});
  const res={writeHead(status){this.status=status;},end(){this.writableEnded=true;}};await runtime.handleRoute(req,res,new URL('/api/infobip/whatsapp/webhook',publicOrigin));return res.status;
 }
 return {state,db,policy,grant,finiteReserve,options,accountKey,globalKey,grantAuthKey,receiptKey,finiteAuthKey,tariffKey,phoneHash,eventKey,requestKey,jobKey,job,resolver,transaction,route,
  stats:()=>({engines,sends}),setEngine:fn=>engineEffect=fn,setSql:fn=>sqlEffect=fn,setCommitFailure:value=>commitFailure=value,setProfileFault:value=>profileFault=value,setRequest:fn=>requestResult=fn};
}
const checks=[];const test=async(name,run)=>{await run();checks.push(name);};
async function withRuntime(f,run){const runtime=await createInfobipWhatsAppProduction(f.options);try{return await run(runtime);}finally{await runtime.dispose();}}
function retained(f,id,{state='send-authorized',attempts=1}={}){
 assert.equal(f.state.rows.get(f.accountKey).availableMicroUsd,30000-attempts*15000);assert.equal(f.state.rows.get(f.accountKey).reservedMicroUsd,attempts*15000);
 const global=f.state.rows.get(f.globalKey);assert.equal(global.reservedMicroUsd,1030000);assert.equal(global.finiteReserve.attempts,attempts);assert.equal(global.finiteReserve.usedMicroUsd,attempts*15000);
 assert.equal(f.state.rows.get(f.requestKey(id)).state,state);assert.equal(global.reconciledAt,epoch);assert.equal(f.state.rows.get(f.tariffKey).verifiedAt,epoch);
}

await test('default OFF, explicit mode and immutable paired grant/finite policy',async()=>{
 const held=await createInfobipWhatsAppProduction({enabled:false,get configuration(){assert.fail('OFF_CONFIGURATION_READ');}});assert.equal(held.health().enabled,false);await held.dispose();
 const f=await setup();assert.equal(validateInfobipRestrictedPolicy(f.policy),f.policy);
 for(const change of [p=>p.configuration.promotionalBeta=true,p=>p.configuration.operationalPilot=true,p=>p.configuration.operationalPilotRenewal={},p=>p.configuration.singleMessageTest=true,p=>p.configuration.canonicalLinkHandshake=true,p=>p.configuration.canonicalLinkHandshakeOnly=true,p=>p.configuration.finiteBeta='true',p=>p.configuration.finiteBeta=false,p=>p.mode='promotional-beta-v1',p=>p.maxCostUsd='0.04',p=>p.admission.finiteReserve.programId='new-program-reset',p=>p.admission.grant.approvalId='substitute-grant',p=>p.admission.finiteReserve.approvalId=p.admission.grant.approvalId,p=>p.admission.grant.amountMicroUsd++,p=>p.admission.grant.validUntil=p.admission.finiteReserve.validUntil-1,p=>p.admission.finiteReserve.observedTariff.sourceId='',p=>p.admission.finiteReserve.observedTariff.setupMicroUsd=undefined,p=>p.admission.finiteReserve.observedTariff.setupMicroUsd=-1,p=>p.admission.finiteReserve.observedTariff.markupMicroUsd=1.5,p=>p.admission.finiteReserve.perAttemptMicroUsd=10000]){
  const bad=structuredClone(f.policy);change(bad);assert.throws(()=>validateInfobipRestrictedPolicy(bad));
 }
 const off=createInfobipWhatsAppSingleTestHost({environment:{CREWCHECK_INFOBIP_WHATSAPP_POLICY:JSON.stringify({...f.policy,mode:'unknown-finite-mode'}),get CREWCHECK_INFOBIP_WHATSAPP_HMAC_SECRET(){assert.fail('INVALID_MODE_SECRET_READ');}}});assert.equal(off.health().enabled,false);await off.dispose();
});

await test('actual grant → prefund → finite resolver → receiver → production dispatch, no timestamp refresh',async()=>{
 const f=await setup();const resolve=f.resolver(),j=f.job('direct');
 const context=await f.transaction(c=>resolve(c,j));assert(context);assert.equal(context.quote.verifiedAt,epoch);assert.equal(context.quote.validUntil,epoch+4*3600000);
 const ordinary=createPromotionalCreditSqlResolver({programId,approvalId:f.grant.approvalId,ownerAccountKey:ownerKey,sender,recipient,linkHashKey:secrets.linkHashKey,expectedGrantManifest:promotionalGrantManifest(f.grant),expectedValidFrom:f.grant.validFrom,expectedValidUntil:f.grant.validUntil,now:()=>f.state.clock});
 assert.equal(await f.transaction(c=>ordinary(c,j)),null,'ordinary path continues denying observation older than15min');
 f.state.clock=epoch;assert(await f.transaction(c=>ordinary(c,f.job('fresh'))));f.state.clock=epoch+3600000;
 await withRuntime(f,async runtime=>{assert.equal(await f.route(runtime,'bad-hmac','menu',{validHmac:false}),401);assert.equal(await f.route(runtime,'first'),200);assert.equal((await runtime.dispatch(f.eventKey('first'))).status,'accepted_unconfirmed');retained(f,'first');});
 assert.deepEqual(f.stats(),{engines:1,sends:1});
});

await test('runtime never creates a grant or prefund',async()=>{
 const f=await setup({fund:false});await withRuntime(f,async runtime=>{await f.route(runtime,'unfunded');await runtime.dispatch(f.eventKey('unfunded'));});
 assert.deepEqual(f.stats(),{engines:0,sends:0});assert.equal(f.state.rows.has(f.accountKey),false);assert.equal(f.state.rows.has(f.receiptKey),false);assert.equal(f.state.rows.get(f.globalKey).finiteReserve,undefined);
});

await test('runtime and resolver capture approved policy and callback capabilities without later broadening',async()=>{
 const f=await setup(),scopeOptions={now:()=>f.state.clock},scope=createInfobipFiniteBetaScope(f.policy.configuration,f.policy.admission,scopeOptions),resolve=f.resolver();
 await withRuntime(f,async runtime=>{
  const poison=()=>assert.fail('MUTATED_OPTION_CALLBACK_USED');
  f.grant.ownerAccountKey=hash('synthetic-other-owner');f.grant.amountMicroUsd=20000000;f.grant.validUntil+=86400000;
  f.finiteReserve.ownerAccountKey=f.grant.ownerAccountKey;f.finiteReserve.recipient=other;f.finiteReserve.totalMicroUsd=20000000;f.finiteReserve.perAttemptMicroUsd=1;f.finiteReserve.maxAttempts=20000000;f.finiteReserve.validUntil+=86400000;
  f.finiteReserve.observedTariff.observedAt=f.state.clock;f.finiteReserve.observedTariff.validUntil+=86400000;
  f.options.configuration.sender=other;f.options.configuration.finiteBeta=false;
  scopeOptions.now=poison;f.options.now=poison;f.options.request=poison;f.options.scheduler.set=poison;f.options.scheduler.clear=poison;f.options.credentials.resolve=poison;
  assert.equal(scope.allowsOwner(owner),true);assert.equal(scope.allowsOwner('synthetic-other-owner'),false);
  assert.equal(scope.acceptEvent({...f.job('scope'),text:'menu'}),true);assert.equal(scope.acceptEvent({...f.job('scope'),recipient:other,text:'menu'}),false);
  const context=await f.transaction(c=>resolve(c,f.job('captured')));assert(context);assert.equal(context.accountKey,ownerKey);assert.equal(context.quote.verifiedAt,epoch);assert.equal(context.quote.validUntil,epoch+4*3600000);
  // The production runtime has already captured its database capability too.
  f.options.db.getConnection=poison;
  await f.route(runtime,'captured');assert.equal((await runtime.dispatch(f.eventKey('captured'))).status,'accepted_unconfirmed');retained(f,'captured');
  assert.deepEqual(f.stats(),{engines:1,sends:1});
  f.state.clock=epoch+6*3600000;assert.equal(scope.acceptEvent({...f.job('late'),text:'menu'}),false);
 });
});

for(const fault of ['grant-status','grant-version','grant-manifest','grant-reference','grant-approved-at','receipt-version','receipt-state','receipt-manifest','finite-status','finite-version','finite-manifest','finite-reference','finite-approved-at'])await test('direct finite resolver independently rejects '+fault+' without writes',async()=>{
 const f=await setup(),resolve=f.resolver(),grant=f.state.rows.get(f.grantAuthKey),finite=f.state.rows.get(f.finiteAuthKey),receipt=f.state.rows.get(f.receiptKey);
 if(fault==='grant-status')grant.status='revoked';if(fault==='grant-version')delete grant.v;if(fault==='grant-manifest')grant.manifest='f'.repeat(64);if(fault==='grant-reference')grant.evidenceReference=' ';if(fault==='grant-approved-at')grant.approvedAt=f.state.clock+1;
 if(fault==='receipt-version')delete receipt.v;if(fault==='receipt-state')receipt.state='empty';if(fault==='receipt-manifest')receipt.manifest='f'.repeat(64);
 if(fault==='finite-status')finite.status='revoked';if(fault==='finite-version')delete finite.v;if(fault==='finite-manifest')finite.manifest='f'.repeat(64);if(fault==='finite-reference')finite.evidenceReference='substituted-approval';if(fault==='finite-approved-at')finite.approvedAt++;
 const before=structuredClone(f.state.rows);assert.equal(await f.transaction(c=>resolve(c,f.job('resolver-'+fault))),null);assert.deepEqual(f.state.rows,before);assert.deepEqual(f.stats(),{engines:0,sends:0});
});

await test('duplicate and reconstructed runtime spend only remaining original finite quantity',async()=>{
 const f=await setup();await withRuntime(f,async runtime=>{await f.route(runtime,'duplicate');await Promise.all(Array.from({length:12},()=>runtime.dispatch(f.eventKey('duplicate'))));retained(f,'duplicate');assert.deepEqual(f.stats(),{engines:1,sends:1});});
 await withRuntime(f,async runtime=>{await runtime.dispatch(f.eventKey('duplicate'));for(const id of ['remaining','exhausted']){await f.route(runtime,id);await runtime.dispatch(f.eventKey(id));}retained(f,'remaining',{attempts:2});});
 assert.deepEqual(f.stats(),{engines:2,sends:2});assert.equal(f.state.rows.get(f.jobKey('exhausted')).status,'cancelled');
});

for(const fault of ['grant-revoked','finite-revoked','grant-id','grant-manifest','receipt','finite-manifest','missing-account','owner','profile-absent','profile-ambiguous','consent','target','tariff-hash','tariff-time','tariff-validity','tariff-source','tariff-setup','tariff-markup','tariff-unit','grant-expired','finite-expired','budget','budget-time'])await test('before reserve denies '+fault,async()=>{
 const f=await setup();
 if(fault==='grant-revoked')f.state.rows.get(f.grantAuthKey).status='revoked';if(fault==='finite-revoked')f.state.rows.get(f.finiteAuthKey).status='revoked';
 if(fault==='grant-id')f.state.rows.get(f.accountKey).grantApprovalId=f.finiteReserve.approvalId;if(fault==='grant-manifest')f.state.rows.get(f.accountKey).grantManifest='f'.repeat(64);
 if(fault==='receipt')f.state.rows.get(f.receiptKey).manifest='f'.repeat(64);if(fault==='finite-manifest')f.state.rows.get(f.finiteAuthKey).manifest='f'.repeat(64);
 if(fault==='missing-account')f.state.rows.delete(f.accountKey);if(fault==='owner')f.state.owner='synthetic-other';
 if(fault==='profile-absent')f.setProfileFault('absent');if(fault==='profile-ambiguous')f.setProfileFault('ambiguous');
 if(fault==='consent')f.state.link.consent_concierge=0;if(fault==='target')f.state.rows.get(f.tariffKey).recipientHash='f'.repeat(64);
 const fields={'tariff-hash':['evidenceSha256','f'.repeat(64)],'tariff-time':['verifiedAt',f.state.clock],'tariff-validity':['validUntil',f.state.clock+900000],'tariff-source':['sourceId','rewritten-source'],'tariff-setup':['setupMicroUsd',0],'tariff-markup':['markupMicroUsd',0],'tariff-unit':['unitMicroUsd',8000]};
 if(fields[fault])f.state.rows.get(f.tariffKey)[fields[fault][0]]=fields[fault][1];
 if(fault==='grant-expired')f.state.rows.get(f.accountKey).expiresAt=f.state.clock;if(fault==='finite-expired')f.state.clock=f.finiteReserve.validUntil;
 if(fault==='budget')f.state.rows.get(f.globalKey).knownSpentMicroUsd=20000000;
 if(fault==='budget-time')f.state.rows.get(f.globalKey).reconciledAt=f.state.clock;
 await withRuntime(f,async runtime=>{await f.route(runtime,'deny-'+fault);await runtime.dispatch(f.eventKey('deny-'+fault));});
 assert.deepEqual(f.stats(),{engines:0,sends:0},fault);assert.equal(f.state.rows.get(f.globalKey).finiteReserve.attempts,0);
});

await test('grant expiry during awaited original receipt read returns no authority or debit',async()=>{
 const f=await setup(),before=structuredClone(f.state.rows),job=f.job('grant-read-expiry');
 f.setSql((sql,args)=>{if(sql.startsWith('SELECT payload')&&args[0]===f.receiptKey)f.state.clock=f.grant.validUntil;});
 assert.equal(await f.transaction(c=>f.resolver()(c,job)),null);assert.deepEqual(f.state.rows,before);
});

for(const fault of ['grant-revoked','finite-revoked','owner','profile-absent','consent','binding','tariff-expiry','grant-expiry'])await test('post-engine '+fault+' retains reserve and blocks provider',async()=>{
 const f=await setup(),id='post-'+fault;
 f.setEngine(()=>{if(fault==='grant-revoked')f.state.rows.get(f.grantAuthKey).status='revoked';if(fault==='finite-revoked')f.state.rows.get(f.finiteAuthKey).status='revoked';if(fault==='owner')f.state.owner='synthetic-new-owner';if(fault==='profile-absent')f.setProfileFault('absent');if(fault==='consent')f.state.link.consent_concierge=0;if(fault==='binding')f.state.link.updated_at='synthetic-new-revision';if(fault==='tariff-expiry')f.state.clock=f.finiteReserve.observedTariff.validUntil;if(fault==='grant-expiry')f.state.rows.get(f.accountKey).expiresAt=f.state.clock;});
 await withRuntime(f,async runtime=>{await f.route(runtime,id);await runtime.dispatch(f.eventKey(id));});
 assert.deepEqual(f.stats(),{engines:1,sends:0});retained(f,id,{state:'reserved'});
});

await test('post-engine account deletion blocks provider without recreating account or refunding retained request/global debit',async()=>{
 const f=await setup(),id='post-account-deletion';f.setEngine(()=>{assert.equal(f.state.rows.get(f.accountKey).reservedMicroUsd,15000);f.state.rows.delete(f.accountKey);});
 await withRuntime(f,async runtime=>{await f.route(runtime,id);await runtime.dispatch(f.eventKey(id));});
 assert.deepEqual(f.stats(),{engines:1,sends:0});assert.equal(f.state.rows.has(f.accountKey),false);
 const request=f.state.rows.get(f.requestKey(id)),global=f.state.rows.get(f.globalKey);assert.equal(request.state,'reserved');assert.equal(request.amountMicroUsd,15000);assert.equal(global.reservedMicroUsd,1030000);assert.equal(global.finiteReserve.attempts,1);assert.equal(global.finiteReserve.usedMicroUsd,15000);
});

for(const fault of ['rejected','throw','commit-before','commit-after'])await test('provider '+fault+' retains debit and never retries',async()=>{
 const f=await setup(),id='uncertain-'+fault;
 if(fault==='rejected')f.setRequest(async()=>new Response('{}',{status:400}));if(fault==='throw')f.setRequest(async()=>{throw Error('SYNTHETIC_REQUEST_FAILURE');});
 if(fault==='commit-before')f.setCommitFailure('before');if(fault==='commit-after')f.setCommitFailure('after');
 await withRuntime(f,async runtime=>{await f.route(runtime,id);assert.equal((await runtime.dispatch(f.eventKey(id))).status,'uncertain');});
 retained(f,id,{state:fault==='commit-before'?'reserved':'send-authorized'});assert.deepEqual(f.stats(),{engines:1,sends:1});
 const before=structuredClone(f.state.rows);await withRuntime(f,async runtime=>{await runtime.dispatch(f.eventKey(id));});assert.deepEqual(f.state.rows,before);assert.deepEqual(f.stats(),{engines:1,sends:1});
});

await test('finite singular recipient status is bound to exact canonical owner',async()=>{
 const f=await setup(),link={...f.state.link,phone_hash:f.phoneHash,phone_last4:recipient.slice(-4)},options={environment:{CREWCHECK_INFOBIP_WHATSAPP_POLICY:JSON.stringify(f.policy)},now:f.state.clock,ownerReady:true,ownerPublicId:owner,hashPhone:value=>createHmac('sha256',secrets.linkHashKey).update(value).digest('hex')};
 const status=await infobipCanonicalLinkStatus(link,options);assert.equal(status.canonicalVerified,true);assert.equal(status.linked,true);assert.equal(status.linkStartAvailable,false);
 for(const ownerPublicId of [undefined,'synthetic-other-owner'])assert.equal((await infobipCanonicalLinkStatus(link,{...options,ownerPublicId})).canonicalVerified,false);
 assert.equal((await infobipCanonicalLinkStatus({...link,revoked_at:'synthetic-revocation'},options)).canonicalVerified,false);
});

await test('ordinary promotional singular recipient status also requires exact canonical owner',async()=>{
 const f=await setup(),configuration={...f.policy.configuration,promotionalBeta:true};delete configuration.finiteBeta;
 const admission={enabled:true,version:1,approvalId:f.grant.approvalId,programId,ownerAccountKey:ownerKey,sender,recipient,validFrom:f.grant.validFrom,validUntil:f.grant.validUntil,maxReplies:2,maxCreditMicroUsd:30000,monthlyBudgetMicroUsd:20000000};
 const policy={version:1,mode:'promotional-beta-v1',maxCostUsd:'0.03',configuration,admission};assert.equal(validateInfobipRestrictedPolicy(policy),policy);
 const link={...f.state.link,phone_hash:f.phoneHash,phone_last4:recipient.slice(-4)},options={environment:{CREWCHECK_INFOBIP_WHATSAPP_POLICY:JSON.stringify(policy)},now:f.state.clock,ownerReady:true,ownerPublicId:owner,hashPhone:value=>createHmac('sha256',secrets.linkHashKey).update(value).digest('hex')};
 assert.equal((await infobipCanonicalLinkStatus(link,options)).canonicalVerified,true);
 for(const ownerPublicId of [undefined,'synthetic-other-owner']){const status=await infobipCanonicalLinkStatus(link,{...options,ownerPublicId});assert.equal(status.canonicalVerified,false);assert.equal(status.linked,false);}
});

assert.equal(allStubCalls,8,'positive controls actually traverse the production transport with a stub');
console.log(JSON.stringify({suite:'OFF finite restricted production caller',groups:checks.length,checks,stubProviderCalls:allStubCalls,realProviderCalls:0,externalCalls:0,syntheticSql:true,realMysql:false}));
