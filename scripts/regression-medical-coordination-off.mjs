import test from 'node:test';
import assert from 'node:assert/strict';
const originalFetch = globalThis.fetch;
let externalCalls = 0;
globalThis.fetch = () => { externalCalls++; throw Error('NETWORK_FORBIDDEN'); };
const { medicalCoordinationDraft, createMedicalEmergencyCoordinator } = await import('../server/emergency/medical-coordination-off.mjs');
const { emergencyAvailability } = await import('../shared/emergency-availability.mjs');
test.after(() => { globalThis.fetch = originalFetch; assert.equal(externalCalls,0); });

// In-memory atomic repository proves the coordinator contract, NOT real SQL durability.
function fixture() {
  let state = medicalCoordinationDraft({ alertId:'alertA',ownerId:'ownerA',previewId:'previewA',recipientIds:['helperA','helperB','helperC'],createdAt:1000,draftExpiresAt:2000 });
  let outbox = [], reservations = 0, clock = 1100, version = 1, budget = true, tail = Promise.resolve(), afterReserve;
  const policy = {maxRecipients:3,maxRounds:3,minRepeatMs:100,alertTtlMs:1000}; // invented test values only
  const repository = {transact:(_id, update)=>{
    const work = tail.then(async()=>{
      let draft = structuredClone(state), effects = structuredClone(outbox), reserved = reservations;
      const result = await update({read:()=>structuredClone(draft),write:value=>{draft=structuredClone(value);},
        reserveMedicalEffects:async(items,scope)=>{assert.equal(scope.purpose,'medical_emergency');assert.equal(scope.ordinaryQuota,false);if(afterReserve)await afterReserve();if(!budget)return false;reserved+=items.length;return true;},
        cancelPendingRequests:round=>{for(const effect of effects)if(effect.event==='request_help'&&effect.round===round&&effect.status==='reserved')effect.status='cancelled';},
        enqueueEffects:items=>{for(const item of items){assert(!effects.some(x=>x.id===item.id));effects.push({...structuredClone(item),status:'reserved'});}},
      });state=draft;outbox=effects;reservations=reserved;return result;
    });tail=work.catch(()=>{});return work;
  }};
  const actor = (actorId='ownerA', options={})=>createMedicalEmergencyCoordinator({enabled:true,repository,policy,clock:()=>clock,
    admit:async command=>Object.freeze({ownerId:options.ownerId||'ownerA',actorId,version,alertId:options.alertId||command.alertId,
      channel:'whatsapp',previewId:'previewA',authorizedRecipientIds:options.recipients||['helperA','helperB','helperC'],
      recipientConsentCurrent:options.consent!==false,recipientIntentCurrent:options.intent!==false,availableNow:options.available!==false,
      contactedRecipientIds:options.contacted||['helperA','helperB'],plan:options.plan||'basic',ordinaryQuota:0,
      round:options.round??1,confirmation:options.confirm===false?null:{action:command.action,alertId:command.alertId,revision:options.revision??state.revision},
    }),isCurrent:auth=>auth.version===version});
  return {actor,repository,state:()=>state,outbox:()=>outbox,reservations:()=>reservations,
    time:value=>{clock=value;},budget:value=>{budget=value;},invalidate:()=>{version++;},reserveHook:fn=>{afterReserve=fn;},
    accepted:(status='accepted',count=2)=>{outbox.slice(0,count).forEach(x=>{x.status=status;});}};
}
const command=(action,requestId,extra={})=>({alertId:'alertA',action,requestId,...extra});

test('OFF touches no authority, store, clock, sender or personal quota',async()=>{
  const fail=()=>{throw Error('must remain OFF');};
  const run=createMedicalEmergencyCoordinator({repository:{transact:fail},admit:fail,isCurrent:fail,clock:fail});
  assert.deepEqual(await run(command('confirm','one')),{handled:false});
});
test('first concurrent offers coordinate once; additional offers do not claim exclusivity or mark assisted',async()=>{
  const f=fixture();await f.actor()(command('confirm','start'));f.accepted();
  const results=await Promise.all([f.actor('helperA')(command('offer-help','helpA')),f.actor('helperB')(command('offer-help','helpB'))]);
  assert(results.every(x=>x.exclusiveAssistance===false));assert.equal(f.state().phase,'help_on_way');assert.equal(f.state().primaryHelperId,'helperA');
  assert.equal(Object.keys(f.state().offers).length,2);assert.equal(f.outbox().filter(x=>x.event==='help_on_way').length,2);
  assert.equal(f.outbox().filter(x=>x.event==='additional_help_offer').length,1);assert.equal(f.outbox()[0].status,'accepted','cannot recall an already attempted notification');
  assert.equal(f.outbox().filter(x=>x.event==='request_help')[1].status,'accepted');
  assert.equal(f.outbox().filter(x=>x.event==='request_help')[2].status,'cancelled');
  const before=JSON.stringify(f.outbox());await f.actor('helperA')(command('offer-help','same-person-new-id'));await f.actor('helperB')(command('offer-help','helpB'));assert.equal(JSON.stringify(f.outbox()),before);
});
test('double confirmation and missing/stale confirmation cannot duplicate the request',async()=>{
  const f=fixture();await Promise.all([f.actor()(command('confirm','one')),f.actor()(command('confirm','two'))]);assert.equal(f.state().round,1);assert.equal(f.outbox().length,3);
  const g=fixture();assert.equal((await g.actor('ownerA',{confirm:false})(command('confirm','one'))).code,'CONFIRMATION_REQUIRED');assert.equal(g.outbox().length,0);
});
test('command snapshot and alert-bound admission cannot be reused across alerts during awaits',async()=>{
  const f=fixture(),input=command('confirm','start'),pending=f.actor()(input);input.action='cancel';input.alertId='otherAlert';await pending;assert.equal(f.state().phase,'requesting');
  const g=fixture();assert.equal((await g.actor('ownerA',{alertId:'otherAlert'})(command('confirm','start'))).code,'SCOPE_DENIED');assert.equal(g.outbox().length,0);
  assert.throws(()=>medicalCoordinationDraft({alertId:'a',ownerId:'o',previewId:'p',recipientIds:['__proto__'],createdAt:1,draftExpiresAt:2}),/MEDICAL_DRAFT_INVALID/);
});
test('multiple additional helpers have distinct effect identities; each offer remains recorded',async()=>{
  const f=fixture();await f.actor()(command('confirm','start'));
  await Promise.all(['helperA','helperB','helperC'].map((actor,i)=>f.actor(actor,{contacted:['helperA','helperB','helperC']})(command('offer-help','offer'+i))));
  assert.equal(Object.keys(f.state().offers).length,3);assert.equal(f.outbox().filter(x=>x.event==='additional_help_offer').length,2);
  assert.equal(new Set(f.outbox().map(x=>x.id)).size,f.outbox().length);
});
test('cancel draft sends nothing; only owner can cancel/assist; terminal alert stays closed',async()=>{
  const f=fixture();assert.equal((await f.actor()(command('assist','notactive'))).code,'NOT_ACTIVE');
  assert.equal((await f.actor()(command('cancel','abort'))).notificationState,'not_required');assert.equal(f.outbox().length,0);assert.equal(f.reservations(),0);
  const g=fixture();await g.actor()(command('confirm','start'));assert.equal((await g.actor('helperA')(command('assist','fakeclose'))).code,'CONFIRMATION_REQUIRED');
  await g.actor()(command('assist','close'));assert.equal(g.state().phase,'assisted');assert.equal((await g.actor('helperB')(command('offer-help','late'))).code,'CLOSED');
});
test('cancel/help races preserve the winner; stale owner preview must reconfirm, not silently close updated coordination',async()=>{
  const f=fixture();await f.actor()(command('confirm','start'));
  await Promise.all([f.actor()(command('cancel','cancel')),f.actor('helperA')(command('offer-help','help'))]);
  assert.equal(f.state().phase,'cancelled');assert.equal(f.outbox().filter(x=>x.event==='help_on_way').length,0);
  const g=fixture();await g.actor()(command('confirm','start'));
  const [,close]=await Promise.all([g.actor('helperA')(command('offer-help','help')),g.actor()(command('cancel','staleclose'))]);
  assert.equal(g.state().phase,'help_on_way');assert.equal(close.code,'CONFIRMATION_REQUIRED');
  await g.actor()(command('cancel','freshclose'));assert.equal(g.state().phase,'cancelled');
});
test('more help needs fresh owner confirmation/cooldown and preserves previous helpers, without recalling them',async()=>{
  const f=fixture();await f.actor()(command('confirm','start'));await f.actor('helperA')(command('offer-help','offer'));
  assert.equal((await f.actor()(command('more-help','early'))).code,'REPEAT_LIMIT');f.time(1250);
  assert.equal((await f.actor('ownerA',{revision:0})(command('more-help','old'))).code,'CONFIRMATION_REQUIRED');
  await f.actor()(command('more-help','more'));assert.equal(f.state().phase,'requesting');assert.equal(f.state().round,2);assert.equal(f.state().offerHistory[0].primaryHelperId,'helperA');
  assert.deepEqual(f.outbox().filter(x=>x.round===2&&x.event==='request_help').map(x=>x.recipientId),['helperB','helperC']);
  assert.equal((await f.actor('helperA',{round:2})(command('offer-help','repeatedhelper'))).code,'HELP_DENIED');
  assert.equal((await f.actor('helperB',{round:1})(command('offer-help','oldround'))).code,'HELP_DENIED');
});
test('repeated requests cannot exceed reviewed round limits even with new request IDs',async()=>{
  const f=fixture();await f.actor()(command('confirm','start'));f.time(1250);await f.actor()(command('more-help','round2'));
  f.time(1400);await f.actor()(command('more-help','round3'));f.time(1550);
  assert.equal((await f.actor()(command('more-help','round4'))).code,'REPEAT_LIMIT');assert.equal(f.state().round,3);
});
test('separate medical reserve blocks new requests at global exhaustion, never consumes personal quota; local closure still records truth',async()=>{
  const f=fixture();f.budget(false);const r=await f.actor()(command('confirm','start'));assert.equal(r.code,'COORDINATION_UNAVAILABLE');assert.equal(f.state().phase,'draft');assert.equal(f.outbox().length,0);
  const g=fixture();await g.actor()(command('confirm','start'));g.budget(false);const offer=await g.actor('helperA')(command('offer-help','offer'));
  assert.equal(offer.notificationState,'blocked_budget');assert.equal(g.state().phase,'help_on_way');assert.equal(g.outbox().filter(x=>x.event==='help_on_way').length,0);
  const close=await g.actor()(command('cancel','close'));assert.equal(close.notificationState,'blocked_budget');assert.equal(g.state().phase,'cancelled');
});
test('uncertain delivery is never recalled or replayed; all plans with zero common quota use the same medical reservation',async()=>{
  for(const plan of ['basic','unlimited','premium']){const f=fixture();await f.actor('ownerA',{plan})(command('confirm','start'));assert.equal(f.state().phase,'requesting');assert.equal(f.reservations(),3);}
  const f=fixture();await f.actor()(command('confirm','start'));f.accepted('unknown',1);await f.actor('helperA')(command('offer-help','help'));
  assert.equal(f.outbox()[0].status,'unknown');const count=f.outbox().length;await f.actor('helperA')(command('offer-help','help'));assert.equal(f.outbox().length,count);
  const g=fixture();await g.actor()(command('confirm','start'));assert.equal((await g.actor('helperC')(command('offer-help','uncontacted'))).code,'HELP_DENIED');
});
test('consent/availability/account/expiry changes fail closed and reservation rolls back on session changes',async()=>{
  for(const opts of [{consent:false},{available:false},{intent:false},{ownerId:'ownerB'}]){const f=fixture();await f.actor()(command('confirm','start'));assert.notEqual((await f.actor('helperA',opts)(command('offer-help','offer'))).code,'RECORDED');}
  const f=fixture();assert.equal((await f.actor('ownerA',{recipients:['helperA']})(command('confirm','start'))).code,'RECIPIENTS_OR_CONSENT_CHANGED');
  const g=fixture();g.reserveHook(async()=>g.invalidate());await g.actor()(command('confirm','start'));assert.equal(g.reservations(),0);assert.equal(g.outbox().length,0);assert.equal(g.state().phase,'draft');
  const h=fixture();h.reserveHook(async()=>h.time(2000));await h.actor()(command('confirm','start'));assert.equal(h.outbox().length,0);assert.equal(h.state().phase,'draft');
});
test('street/trusted contacts need no hotel; no arbitrary medical/location/room payload is accepted or emitted',async()=>{
  const f=fixture();await f.actor()(command('confirm','start',{medical:'must-not-copy',location:'must-not-copy',room:'must-not-copy',plan:'basic',ordinaryQuota:0}));
  assert.equal(f.state().phase,'requesting');assert(!JSON.stringify(f.outbox()).includes('must-not-copy'));
  assert.throws(()=>medicalCoordinationDraft({alertId:'a',ownerId:'o',previewId:'p',recipientIds:['h'],createdAt:1,draftExpiresAt:2,kind:'fire'}),/MEDICAL_DRAFT_INVALID/);
});
test('habitual/per-stay override, canonical expiry, owner scope and explicit rest preference remain separate from channel/data consent',()=>{
  const preferences={ownerId:'A',available:true,receiveDuringRest:false},stay={ownerId:'A',id:'stay1',revision:'r1',startsAt:100,endsAt:200};
  const read=extra=>emergencyAvailability({ownerId:'A',preferences,at:150,rest:'awake',...extra});
  assert.equal(read().available,true,'street is independent of hotel');assert.equal(read({rest:'resting'}).available,false);assert.equal(read({rest:'unknown'}).available,false);
  assert.equal(read({preferences:{...preferences,receiveDuringRest:true},rest:'resting'}).available,true);
  const override={ownerId:'A',stayId:'stay1',revision:'r1',value:'off',expiresAt:200};
  assert.equal(read({stay,override}).available,false);assert.equal(read({stay,override,at:200}).available,true,'expired override returns to habitual preference');
  assert.equal(read({preferences:{...preferences,available:false},stay,override:{...override,value:'on'}}).available,true);
  assert.equal(read({stay,override:{...override,revision:'old'}}).available,false);assert.equal(read({ownerId:'B'}).available,false);
  assert.equal(read({stay,override:{...override,expiresAt:201}}).available,false);assert.equal(read({stay,override:{...override,value:'on'},rest:'resting'}).available,false,'stay ON does not authorize disturbing rest');
  assert.equal(read({preferences:{...preferences,available:false,whatsappConsent:true,medicalConsent:true}}).available,false,'consents cannot create availability');
});
