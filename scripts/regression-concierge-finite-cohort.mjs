import assert from 'node:assert/strict';
globalThis.fetch=()=>assert.fail('EXTERNAL_NETWORK_FORBIDDEN');
const {finiteCohortPolicy,finiteCohortManifest,finiteCohortState,finiteCohortMemberId,finiteCohortTariffKey,createFiniteCohortPrefunder,createFiniteCohortSendGate}=await import('../server/concierge-finite-reserve-off.mjs');
assert.equal(typeof finiteCohortPolicy,'function','COHORT_POLICY_MISSING');
assert.equal(typeof createFiniteCohortPrefunder,'function','COHORT_PREFUNDER_MISSING');
assert.equal(typeof createFiniteCohortSendGate,'function','COHORT_SEND_GATE_MISSING');
const {cohortPolicy,cohortFixture,hash,phoneHash,ownerId,ownerEmail,epoch,secrets,programId,sender}=await import('./fixtures/infobip-cohort-sql.mjs');
const {promotionalGrantManifest,createPromotionalCreditSqlResolver,createPromotionalGrantWriter,lockCanonicalCreditIdentities}=await import('../server/concierge-promotional-credit-sql.mjs');
const {createFiniteCohortSqlResolver}=await import('../server/concierge-finite-credit-sql.mjs');
const {createInfobipWhatsAppProduction}=await import('../server/infobip-whatsapp-production.mjs');
const {validateInfobipRestrictedPolicy}=await import('../server/infobip-whatsapp-single-test.mjs');
const {createSharedCreditCandidate,sharedCreditKey:key}=await import('../server/concierge-shared-credit-candidate.mjs');
const {createInfobipSqlBudget}=await import('../server/infobip-whatsapp-sql-budget.mjs');
const {infobipCanonicalLinkStatus}=await import('../server/infobip-whatsapp-link-policy.mjs');
const checks=[];let stubCalls=0;
const test=async(name,run)=>{await run();checks.push(name);};
const snapshot=f=>JSON.stringify([...f.state.rows]);
async function runtime(f,run){const r=await createInfobipWhatsAppProduction(f.options);try{return await run(r);}finally{await r.dispose();}}
async function send(f,r,i,id){const received=await f.stage(i,id);assert.equal(received.status,200);assert.equal(received.accepted,1);return r.dispatch(f.eventKey(id));}
function conservation(f,counts){
 const g=f.state.rows.get(f.globalKey),rows=finiteCohortState(f.p,g,f.state.clock);assert(rows);
 let used=0,attempts=0;
 for(const [i,m]of f.p.members.entries()){
  const row=rows.get(f.memberId(m)),a=f.state.rows.get(f.accountKey(m));
  assert.equal(row.attempts,counts[i]);assert.equal(row.usedMicroUsd,counts[i]*m.perAttemptMicroUsd);
  assert.equal(a.availableMicroUsd,m.totalMicroUsd-row.usedMicroUsd);assert.equal(a.reservedMicroUsd,row.usedMicroUsd);
  used+=row.usedMicroUsd;attempts+=row.attempts;
 }
 assert.equal(g.finiteReserve.usedMicroUsd,used);assert.equal(g.finiteReserve.attempts,attempts);
 assert(g.reservedMicroUsd>=f.p.observedBudget.initialReservedMicroUsd+f.p.totalMicroUsd+f.p.observedBudget.outsideConsumersReserveMicroUsd);
 assert.equal(g.reconciledAt,epoch);
}

await test('explicit versioned policy, unique identities, max8 and aggregate10k independent of cost',async()=>{
 const p=cohortPolicy();assert.deepEqual(finiteCohortPolicy(p),p);
 const invalid=[p=>p.v=1,p=>p.programId='reset-program',p=>p.monthlyBudgetMicroUsd=40000000,
  p=>p.members.push(structuredClone(p.members[0])),p=>p.members[1].ownerAccountKey=p.members[0].ownerAccountKey,
  p=>p.members[1].recipient=p.members[0].recipient,p=>p.members[1].recipientHash=p.members[0].recipientHash,
  p=>p.members[1].grant.approvalId=p.members[0].grant.approvalId,p=>delete p.members[0].bindingHash,
  p=>p.totalMicroUsd++,p=>p.maxAttempts++,p=>p.members[0].perAttemptMicroUsd=1,
  p=>p.members[0].grant.amountMicroUsd++,p=>p.members[0].observedTariff.setupMicroUsd=undefined,
  p=>p.observedBudget.initialReservedMicroUsd=-1,p=>p.validUntil=p.validFrom+8*86400000,
  p=>p.validUntil=Date.parse('2032-02-01T03:00:01Z'),p=>p.members[0].observedTariff.observedAt=p.approvedAt+1];
 for(const change of invalid){const bad=structuredClone(p);change(bad);assert.throws(()=>finiteCohortPolicy(bad));}
 assert.throws(()=>finiteCohortPolicy(cohortPolicy(9)));assert.equal(finiteCohortPolicy(cohortPolicy(8)).members.length,8);
 const cheap=cohortPolicy();for(const m of cheap.members){m.perAttemptMicroUsd=1;m.maxAttempts=5000;m.totalMicroUsd=5000;m.grant.amountMicroUsd=5000;m.grantManifest=promotionalGrantManifest(m.grant);Object.assign(m.observedTariff,{observedUnitMicroUsd:1,setupMicroUsd:0,markupMicroUsd:0});}
 cheap.maxAttempts=cheap.totalMicroUsd=10000;assert(finiteCohortPolicy(cheap));
 cheap.members[0].maxAttempts++;cheap.members[0].totalMicroUsd++;cheap.members[0].grant.amountMicroUsd++;cheap.members[0].grantManifest=promotionalGrantManifest(cheap.members[0].grant);cheap.maxAttempts++;cheap.totalMicroUsd++;
 assert.throws(()=>finiteCohortPolicy(cheap));
 assert.equal((await createFiniteCohortPrefunder()()).status,'disabled');
});

await test('max8 real grant writer plus one all-member prefund, 12 explicit identical replays never refill',async()=>{
 const f=await cohortFixture({count:8,fund:false}),before=f.state.rows.get(f.globalKey).reservedMicroUsd;
 const results=await Promise.all(Array.from({length:12},()=>f.transaction(f.prefund)));
 assert.equal(results.filter(r=>r.status==='reserved').length,1);assert.equal(results.filter(r=>r.status==='already-reserved').length,11);
 assert.equal(f.state.rows.get(f.globalKey).reservedMicroUsd,before+f.p.totalMicroUsd+f.p.observedBudget.outsideConsumersReserveMicroUsd);
 conservation(f,Array(8).fill(0));
 const payload=JSON.stringify(f.state.rows.get(f.globalKey));for(const m of f.p.members)assert(!payload.includes(m.recipient));assert(!payload.includes('@synthetic'));
});

for(const fault of ['link','consent','profile','owner','binding','account','consumed','grant-revoked','receipt','receipt-amount','tariff-target','tariff-source','tariff-fee','cohort-revoked','r0-drift','s0-drift','v1-existing'])await test('one invalid last member blocks entire initial prefund: '+fault,async()=>{
 const f=await cohortFixture({fund:false}),m=f.p.members.at(-1),a=f.state.rows.get(f.accountKey(m));
 if(fault==='link')f.state.links.delete(m.recipientHash);
 if(fault==='consent')f.state.links.get(m.recipientHash).consent_concierge=0;
 if(fault==='profile')f.state.profiles.delete(ownerEmail(1));
 if(fault==='owner')f.state.profiles.get(ownerEmail(1)).public_id='synthetic-replacement-owner';
 if(fault==='binding')f.state.links.get(m.recipientHash).updated_at='synthetic-relinked';
 if(fault==='account')f.state.rows.delete(f.accountKey(m));
 if(fault==='consumed'){a.availableMicroUsd-=m.perAttemptMicroUsd;a.reservedMicroUsd+=m.perAttemptMicroUsd;}
 if(fault==='grant-revoked')f.state.rows.get(f.authorityKey(m)).status='revoked';
 if(fault==='receipt')f.state.rows.get(f.receiptKey(m)).manifest='f'.repeat(64);
 if(fault==='receipt-amount')f.state.rows.get(f.receiptKey(m)).amountMicroUsd++;
 if(fault==='tariff-target')f.state.rows.get(finiteCohortTariffKey(f.p,m)).recipientHash=f.p.members[0].recipientHash;
 if(fault==='tariff-source')f.state.rows.get(finiteCohortTariffKey(f.p,m)).sourceId='substitute';
 if(fault==='tariff-fee')f.state.rows.get(finiteCohortTariffKey(f.p,m)).markupMicroUsd=0;
 if(fault==='cohort-revoked')f.state.rows.get(f.cohortAuthorityKey).status='revoked';
 if(fault==='r0-drift')f.state.rows.get(f.globalKey).reservedMicroUsd++;
 if(fault==='s0-drift')f.state.rows.get(f.globalKey).knownSpentMicroUsd++;
 if(fault==='v1-existing')f.state.rows.get(f.globalKey).finiteReserve={v:1,manifest:finiteCohortManifest(f.p)};
 const before=snapshot(f);assert.equal((await f.transaction(f.prefund)).status,'denied');assert.equal(snapshot(f),before);
});

await test('present malformed allocation is never treated as missing or repaired',async()=>{
 for(const value of [null,false,0,'',[],{},'reserved']){
  const f=await cohortFixture({fund:false});f.state.rows.get(f.globalKey).finiteReserve=value;
  const before=snapshot(f);assert.equal((await f.transaction(f.prefund)).status,'denied');
  assert.equal(snapshot(f),before);assert(Object.hasOwn(f.state.rows.get(f.globalKey),'finiteReserve'));
 }
});

await test('initial observation expiry after reads denies and expiry after last UPDATE rolls back',async()=>{
 for(const phase of ['read','write']){
  const f=await cohortFixture({fund:false}),before=snapshot(f);
  f.setSql((sql,args)=>{if(phase==='read'&&args[0]===f.cohortAuthorityKey||phase==='write'&&sql.startsWith('UPDATE')&&args[1]===f.globalKey)f.state.clock=epoch+900001;});
  if(phase==='write')await assert.rejects(f.transaction(f.prefund));else assert.equal((await f.transaction(f.prefund)).status,'denied');
  assert.equal(snapshot(f),before);
 }
});

await test('unknown initial COMMIT does not authorize automatic retry or a second hold',async()=>{
 for(const phase of ['before-any','after-any']){
  const f=await cohortFixture({fund:false}),before=snapshot(f);f.setCommitFailure(phase);await assert.rejects(f.transaction(f.prefund));
  if(phase==='before-any')assert.equal(snapshot(f),before);
  else{conservation(f,[0,0]);const retained=snapshot(f);assert.equal((await f.transaction(f.prefund)).status,'already-reserved');assert.equal(snapshot(f),retained);}
 }
});

await test('reader and original grant writer retain exact identity under indexed point predicates',async()=>{
 const f=await cohortFixture(),m=f.p.members[0],seen=[];
 f.setSql((sql,args)=>{if(sql.startsWith('SELECT public_id'))seen.push({sql,args:structuredClone(args)});});
 const before=snapshot(f);
 assert(await f.transaction(c=>lockCanonicalCreditIdentities(c,[{ownerAccountKey:m.ownerAccountKey,sender,recipient:m.recipient,phoneHash:m.recipientHash}])));
 assert.equal((await f.transaction(c=>createPromotionalGrantWriter({...m.grant,enabled:true},{now:()=>f.state.clock})(c,{ownerPublicId:ownerId(0)}))).status,'already-granted');
 assert.deepEqual(seen,[
  {sql:'SELECT public_id FROM crewcheck_platform_profiles WHERE email=? AND BINARY email=BINARY ? FOR UPDATE',args:[ownerEmail(0),ownerEmail(0)]},
  {sql:'SELECT public_id FROM crewcheck_platform_profiles WHERE public_id=? AND BINARY public_id=BINARY ? FOR UPDATE',args:[ownerId(0),ownerId(0)]},
  {sql:'SELECT public_id FROM crewcheck_platform_profiles WHERE public_id=? AND BINARY public_id=BINARY ? FOR UPDATE',args:[ownerId(0),ownerId(0)]},
 ]);assert.equal(snapshot(f),before);
});

await test('new explicit mode uses authenticated staging and actual production dispatcher for different-cost members without fanout',async()=>{
 const f=await cohortFixture();f.state.clock=epoch+3600000;assert.equal(validateInfobipRestrictedPolicy(f.envelope),f.envelope);
 for(const change of [p=>p.mode='finite-risk-beta-v1',p=>p.configuration.finiteBeta=false,p=>p.configuration.promotionalBeta=true,p=>p.configuration.operationalPilotRenewal={},p=>p.admission.grant={},p=>p.admission.finiteReserve={},p=>p.maxCostUsd='20']){
  const bad=structuredClone(f.envelope);change(bad);assert.throws(()=>validateInfobipRestrictedPolicy(bad));
 }
 const legacy=f.state.rows.get(finiteCohortTariffKey(f.p,f.p.members[0]));f.state.rows.set(key('tariff',[programId,sender,'BR','service-text']),legacy);
 const m=f.p.members[0],ordinary=createPromotionalCreditSqlResolver({programId,approvalId:m.grant.approvalId,ownerAccountKey:m.ownerAccountKey,sender,recipient:m.recipient,linkHashKey:secrets.linkHashKey,expectedGrantManifest:m.grantManifest,expectedValidFrom:m.grant.validFrom,expectedValidUntil:m.grant.validUntil,now:()=>f.state.clock});
 assert.equal(await f.transaction(c=>ordinary(c,f.job(0,'ordinary-stale'))),null);f.state.clock=epoch;assert(await f.transaction(c=>ordinary(c,f.job(0,'ordinary-fresh'))));f.state.clock=epoch+3600000;
 await runtime(f,async r=>{
  assert.equal(await f.route(r,0,'bad-hmac','menu',{validHmac:false}),401);
  assert.equal((await f.stage(0,'first')).accepted,1);await Promise.all(Array.from({length:12},()=>r.dispatch(f.eventKey('first'))));
  await f.stage(1,'first');await r.dispatch(f.eventKey('first'));assert.deepEqual(f.calls,[m.recipient]);
  assert.equal((await send(f,r,1,'second')).status,'accepted_unconfirmed');conservation(f,[1,1]);
 });
 await runtime(f,async r=>{await r.dispatch(f.eventKey('first'));await r.dispatch(f.eventKey('second'));assert.equal(f.stats().sends,2);
  await send(f,r,0,'third');await send(f,r,1,'fourth');await send(f,r,0,'exhausted');});
 conservation(f,[2,2]);assert.equal(f.stats().sends,4);assert.equal(f.state.rows.get(f.globalKey).finiteReserve.usedMicroUsd,50000);stubCalls+=f.stats().sends;
});

await test('ingress-only staging retains HMAC and canonical owner guards without debiting',async()=>{
 const f=await cohortFixture(),before=snapshot(f);
 assert.equal((await f.stage(0,'staging-bad-hmac','menu',{validHmac:false})).status,401);assert.equal(snapshot(f),before);
 f.state.profiles.get(ownerEmail(0)).public_id='synthetic-not-approved-owner';
 const denied=await f.stage(0,'staging-wrong-owner');assert.equal(denied.status,200);assert.equal(denied.accepted,0);assert.equal(denied.denied,1);
 assert.equal(snapshot(f),before);assert.deepEqual(f.stats(),{engines:0,sends:0});
});

await test('full HTTP route auto-tick and one explicit contender conserve exactly one attempt',async()=>{
 const f=await cohortFixture(),id='automatic-explicit-contention',inboundKey='crewcheck-infobip-inbound-v1:'+f.eventKey(id);
 let selected=false,explicit,heldReads=0,started;const automaticStarted=new Promise(resolve=>started=resolve);
 await runtime(f,async r=>{
  f.setSql((sql,args,result)=>{
   if(sql.startsWith('SELECT state_key FROM')&&sql.includes("'held'")&&result[0].some(row=>row.state_key===inboundKey))selected=true;
   if(selected&&sql.startsWith('SELECT payload')&&args[0]===inboundKey){
    const row=result[0][0],state=row&&(typeof row.payload==='string'?JSON.parse(row.payload):row.payload);
    if(state?.status==='held')heldReads++;
    // Queue exactly one explicit attempt during the automatic initial read.
    // The serial fixture then lets both initial reads observe held, while the
    // automatic preparation wins. Real runtime/store behavior is unchanged.
    if(!explicit){started();explicit=r.dispatch(f.eventKey(id));}
   }
  });
  assert.equal(await f.route(r,0,id),200);
  let timer;try{await Promise.race([automaticStarted,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('HTTP_AUTOMATIC_DISPATCH_NOT_SEEN')),500);})]);}finally{clearTimeout(timer);}
  await r.maintain(); // Only join after the HTTP-triggered dispatch is proven.
  assert(explicit,'HTTP route must dispatch despite the no-op scheduler');
  assert.equal((await explicit).status,'blocked');assert(heldReads>=2);
  assert.equal(f.state.rows.get(inboundKey).status,'accepted_unconfirmed');
  assert.equal(f.state.rows.get(inboundKey).engineActive,false);
  assert.equal(f.state.rows.get(f.requestKey(id)).state,'send-authorized');
  assert.deepEqual(f.stats(),{engines:1,sends:1});conservation(f,[1,0]);
 });stubCalls++;
});

for(const fault of ['missing-member','extra-member','used-sum','attempt-sum','member-product','balanced-product','member-cap','account-drift','r0','hold','spent-floor','budget-time','grant-revoked','receipt-amount','cohort-revoked','binding','target-tariff'])await test('same-manifest replay and direct resolver reject corrupt state without repair: '+fault,async()=>{
 const f=await cohortFixture(),m=f.p.members[0],g=f.state.rows.get(f.globalKey),e=g.finiteReserve;
 if(fault==='missing-member')e.members.pop();if(fault==='extra-member')e.members.push(structuredClone(e.members[0]));
 if(fault==='used-sum')e.usedMicroUsd++;if(fault==='attempt-sum')e.attempts++;
 if(fault==='member-product')e.members[0].usedMicroUsd++;
 if(fault==='balanced-product'){e.members[0].usedMicroUsd++;e.usedMicroUsd++;const a=f.state.rows.get(f.accountKey(m));a.availableMicroUsd--;a.reservedMicroUsd++;}
 if(fault==='member-cap')e.members[0].maxAttempts++;
 if(fault==='account-drift')f.state.rows.get(f.accountKey(m)).availableMicroUsd--;
 if(fault==='r0')e.initialReservedMicroUsd=0;if(fault==='hold')g.reservedMicroUsd--;
 if(fault==='spent-floor')g.knownSpentMicroUsd--;if(fault==='budget-time')g.reconciledAt++;
 if(fault==='grant-revoked')f.state.rows.get(f.authorityKey(m)).status='revoked';
 if(fault==='receipt-amount')f.state.rows.get(f.receiptKey(m)).amountMicroUsd++;
 if(fault==='cohort-revoked')f.state.rows.get(f.cohortAuthorityKey).status='revoked';
 if(fault==='binding')f.state.links.get(m.recipientHash).updated_at='synthetic-relinked-same-phone';
 if(fault==='target-tariff')f.state.rows.get(finiteCohortTariffKey(f.p,m)).recipientHash=f.p.members[1].recipientHash;
 const before=snapshot(f);assert.equal((await f.transaction(f.prefund)).status,'denied');
 const resolve=createFiniteCohortSqlResolver(f.p,f.memberId(m),{linkHashKey:secrets.linkHashKey,now:()=>f.state.clock});
 assert.equal(await f.transaction(c=>resolve(c,f.job(0,'direct'))),null);assert.equal(snapshot(f),before);
});

for(const field of ['memberId','targetHash','accountKey','cohortManifest','tariffEvidenceSha256','quoteSourceId','amountMicroUsd','period','channel'])await test('final gate rejects transplanted request '+field+' without retry/refund',async()=>{
 const f=await cohortFixture(),id='request-'+field;f.setEngine(()=>{const r=f.state.rows.get(f.requestKey(id));r[field]=field==='amountMicroUsd'?r[field]+1:field==='memberId'?f.memberId(f.p.members[1]):'synthetic-wrong-binding';});
 await runtime(f,async r=>{await send(f,r,0,id);await r.dispatch(f.eventKey(id));});
 conservation(f,[1,0]);assert.equal(f.stats().sends,0);
});

for(const fault of ['grant','cohort','owner','profile-deletion','account-deletion','consent','binding','expiry'])await test('post-engine '+fault+' blocks provider and retains attempted exposure',async()=>{
 const f=await cohortFixture(),m=f.p.members[0],id='post-'+fault;
 f.setEngine(()=>{
  if(fault==='grant')f.state.rows.get(f.authorityKey(m)).status='revoked';if(fault==='cohort')f.state.rows.get(f.cohortAuthorityKey).status='revoked';
  if(fault==='owner')f.state.profiles.get(ownerEmail(0)).public_id='synthetic-changed-owner';if(fault==='profile-deletion')f.state.profiles.delete(ownerEmail(0));
  if(fault==='account-deletion')f.state.rows.delete(f.accountKey(m));if(fault==='consent')f.state.links.get(m.recipientHash).consent_concierge=0;
  if(fault==='binding')f.state.links.get(m.recipientHash).updated_at='synthetic-new-generation';if(fault==='expiry')f.state.clock=f.p.validUntil;
 });
 if(fault==='expiry')f.state.clock=f.p.validUntil-5;
 await runtime(f,async r=>{await send(f,r,0,id);await r.dispatch(f.eventKey(id));});assert.equal(f.stats().sends,0);
 const e=f.state.rows.get(f.globalKey).finiteReserve;assert.equal(e.attempts,1);assert.equal(e.usedMicroUsd,m.perAttemptMicroUsd);
 assert.equal(f.state.rows.get(f.requestKey(id)).state,'reserved');if(fault==='account-deletion')assert(!f.state.rows.has(f.accountKey(m)));else assert.equal(f.state.rows.get(f.accountKey(m)).reservedMicroUsd,m.perAttemptMicroUsd);
});

for(const fault of ['reject','throw','timeout','commit-before','commit-after'])await test('provider '+fault+' retains member/global debit across host reconstruction',async()=>{
 const f=await cohortFixture(),id='provider-'+fault;
 if(fault==='reject')f.setRequest(async()=>new Response('{}',{status:400}));if(fault==='throw')f.setRequest(async()=>{throw Error('SYNTHETIC_PROVIDER_FAILURE');});
 if(fault==='timeout')f.setRequest(()=>new Promise(()=>{}));
 if(fault==='commit-before')f.setCommitFailure('before');if(fault==='commit-after')f.setCommitFailure('after');
 await runtime(f,async r=>{assert.equal((await send(f,r,0,id)).status,'uncertain');});
 await runtime(f,async r=>{await r.dispatch(f.eventKey(id));});conservation(f,[1,0]);assert.equal(f.stats().sends,1);stubCalls++;
});

await test('revoking sibling blocks replay but not another valid member; status never enumerates cohort',async()=>{
 const f=await cohortFixture(),m=f.p.members[0],other=f.p.members[1];f.state.rows.get(f.authorityKey(other)).status='revoked';
 assert.equal((await f.transaction(f.prefund)).status,'denied');await runtime(f,async r=>{assert.equal((await send(f,r,0,'valid-member')).status,'accepted_unconfirmed');await send(f,r,1,'revoked-member');});
 conservation(f,[1,0]);assert.equal(f.stats().sends,1);stubCalls++;
 const options={environment:{CREWCHECK_INFOBIP_WHATSAPP_POLICY:JSON.stringify(f.envelope)},now:f.state.clock,ownerReady:true,ownerPublicId:ownerId(0),hashPhone:phoneHash};
 const link=f.state.links.get(m.recipientHash),result=await infobipCanonicalLinkStatus(link,options);assert.equal(result.canonicalVerified,true);
 assert(!JSON.stringify(result).includes(m.recipient));assert(!JSON.stringify(result).includes(other.recipient));
 assert.equal((await infobipCanonicalLinkStatus(link,{...options,ownerPublicId:ownerId(1)})).canonicalVerified,false);
 link.updated_at='synthetic-relinked-original-number';assert.equal((await infobipCanonicalLinkStatus(link,options)).canonicalVerified,false);
 await runtime(f,async r=>{await send(f,r,0,'new-job-after-relink');});assert.equal(f.stats().sends,1);conservation(f,[1,0]);
});

await test('cohort A/B and ordinary consumer share boundary without reserving cohort twice',async()=>{
 const p=cohortPolicy();p.observedBudget.outsideConsumersReserveMicroUsd=20000000-p.observedBudget.knownSpentMicroUsd-p.observedBudget.initialReservedMicroUsd-p.totalMicroUsd-10000;
 const f=await cohortFixture({policy:p}),ordinaryOwner=hash('synthetic-ordinary-consumer');
 f.state.rows.set(key('account',[programId,ordinaryOwner]),{v:1,kind:'account-credit',accountKey:ordinaryOwner,availableMicroUsd:20000,reservedMicroUsd:0});
 const context={accountKey:ordinaryOwner,linked:true,consent:true,bindingStamp:'synthetic-ordinary-binding',sender,recipient:'12025559999',quote:{sourceId:'synthetic-fresh-voice',currency:'USD',channel:'voice',sender,country:'BR',verifiedAt:epoch,validUntil:epoch+900000,unitMicroUsd:10000,quantumSeconds:60,maxDurationSeconds:60,setupMicroUsd:0,markupMicroUsd:0}};
 const credit=createSharedCreditCandidate({enabled:true,budgetApproved:true,programId,monthlyBudgetMicroUsd:20000000,allowedChannels:['voice']},{now:()=>f.state.clock,resolveTrustedContext:async()=>context});
 const job={...context,eventKey:hash('synthetic-ordinary-first'),channel:'voice'};
 await runtime(f,async r=>{
  assert.equal((await f.stage(0,'boundary-A')).accepted,1);assert.equal((await f.stage(1,'boundary-B')).accepted,1);
  assert.deepEqual(f.stats(),{engines:0,sends:0});conservation(f,[0,0]);
  const [a,b,reserved]=await Promise.all([r.dispatch(f.eventKey('boundary-A')),r.dispatch(f.eventKey('boundary-B')),f.transaction(c=>credit.reserve(c,job))]);assert.equal(a.status,'accepted_unconfirmed');assert.equal(b.status,'accepted_unconfirmed');assert.equal(reserved,true);
  assert.equal(await f.transaction(c=>credit.reserve(c,{...job,eventKey:hash('synthetic-ordinary-second')})),false);
 });
 conservation(f,[1,1]);assert.equal(f.state.rows.get(f.globalKey).reservedMicroUsd,20000000-p.observedBudget.knownSpentMicroUsd);assert.equal(f.stats().sends,2);stubCalls+=2;
});

await test('bounded query timeout destroys synthetic connection without partial cohort hold',async()=>{
 const f=await cohortFixture({count:8,fund:false}),before=snapshot(f);f.setSql(async sql=>{if(sql.startsWith('SELECT email,consent'))await new Promise(resolve=>setTimeout(resolve,30));});
 const short=createInfobipSqlBudget(f.db,{transactionMs:40,queryMs:10,repeatableRead:true});await assert.rejects(short(f.prefund));await new Promise(resolve=>setTimeout(resolve,50));assert.equal(snapshot(f),before);
});

await test('maximum eight selected canonical owners each spend only their own fixed allocation',async()=>{
 const f=await cohortFixture({count:8});
 await runtime(f,async r=>{
  for(let round=0;round<2;round++)for(let i=0;i<8;i++)assert.equal((await send(f,r,i,`max-eight-${round}-${i}`)).status,'accepted_unconfirmed');
  for(let i=0;i<8;i++)await send(f,r,i,`max-eight-exhausted-${i}`);
 });
 conservation(f,Array(8).fill(2));assert.equal(f.stats().sends,16);stubCalls+=16;
 assert.equal((await f.transaction(f.prefund)).status,'already-reserved');
});

await test('captured policy and callable capabilities cannot be broadened after construction',async()=>{
 const f=await cohortFixture(),m=structuredClone(f.p.members[0]),id=f.memberId(m),job=f.job(0,'immutable');
 const resolve=createFiniteCohortSqlResolver(f.p,id,{linkHashKey:secrets.linkHashKey,now:()=>f.state.clock});
 await runtime(f,async r=>{
  f.p.members[0].recipient='12025559991';f.p.members[0].maxAttempts=9999;f.p.maxAttempts=10000;
  f.options.request=()=>assert.fail('REPLACED_REQUEST_USED');f.options.configuration.allowedSenders.push('12025559992');
  assert(await f.transaction(c=>resolve(c,job)));
  assert.equal(await f.transaction(c=>resolve(c,{...job,recipient:f.p.members[0].recipient})),null);
  assert.equal((await f.stage(0,'immutable','menu',{from:m.recipient})).accepted,1);
  assert.equal((await r.dispatch(f.eventKey('immutable'))).status,'accepted_unconfirmed');
  assert.equal((await f.stage(0,'not-enrolled','menu')).denied,1);await r.dispatch(f.eventKey('not-enrolled'));assert.equal(f.stats().sends,1);
 });stubCalls++;
});

await test('MySQL JSON object key normalization does not change exact readback validation',async()=>{
 const f=await cohortFixture();const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;
 f.setSql((sql,_args,result)=>{if(sql.startsWith('SELECT payload'))for(const row of result[0])if(row.payload)row.payload=ordered(typeof row.payload==='string'?JSON.parse(row.payload):row.payload);});
 await runtime(f,async r=>assert.equal((await send(f,r,0,'normalized-json')).status,'accepted_unconfirmed'));
 conservation(f,[1,0]);assert.equal(f.stats().sends,1);stubCalls++;
});

await test('gate marker is single-use and independently rejects authority or awaited clock substitution',async()=>{
 const f=await cohortFixture(),m=f.p.members[0],job=f.job(0,'standalone-gate'),id=f.memberId(m);
 const resolve=createFiniteCohortSqlResolver(f.p,id,{linkHashKey:secrets.linkHashKey,now:()=>f.state.clock});
 const credit=createSharedCreditCandidate({enabled:true,budgetApproved:true,programId,monthlyBudgetMicroUsd:20000000,allowedChannels:['whatsapp'],finiteCohort:f.p,cohortMemberId:id},{now:()=>f.state.clock,resolveTrustedContext:resolve});
 assert.equal(await f.transaction(c=>credit.reserve(c,{...job,accountKey:m.ownerAccountKey,channel:'whatsapp'})),true);
 const gate=createFiniteCohortSendGate(f.p,id,{enabled:true,now:()=>f.state.clock,resolveTrustedContext:resolve});
 const auth=f.state.rows.get(f.cohortAuthorityKey);
 for(const field of ['v','manifest','evidenceReference','approvedAt']){
  const bad=structuredClone(auth);bad[field]=field==='v'?1:field==='approvedAt'?auth[field]+1:'synthetic-substitution';f.state.rows.set(f.cohortAuthorityKey,bad);
  assert.equal(await f.transaction(c=>gate.checkSend(c,job)),false);f.state.rows.set(f.cohortAuthorityKey,structuredClone(auth));
 }
 f.state.clock=epoch+10;
 f.setSql((_sql,args)=>{if(args[0]===f.cohortAuthorityKey)f.state.clock=epoch;});
 assert.equal(await f.transaction(c=>gate.checkSend(c,{...job,receivedAt:epoch})),false);
 f.setSql(()=>{});f.state.clock=epoch;
 assert.equal(await f.transaction(c=>gate.checkSend(c,job)),true);
 const retained=snapshot(f);assert.equal(await f.transaction(c=>gate.checkSend(c,job)),false);assert.equal(snapshot(f),retained);
 conservation(f,[1,0]);assert.equal(f.stats().sends,0);
});

console.log(JSON.stringify({suite:'OFF finite cohort contract and actual production caller',groups:checks.length,checks,stubProviderCalls:stubCalls,realProviderCalls:0,externalCalls:0,syntheticSql:true,realMysql:false,maxMembers:8,aggregateAttemptCap:10000}));
