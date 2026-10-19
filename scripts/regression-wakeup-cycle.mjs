import assert from 'node:assert/strict';
import fs from 'node:fs';
import {WAKE_CLOCK_AVAILABILITY,wakePlanBinding,createWakeCycle,wakeLocalAction,wakeServerAction,wakeRingReceipt,commitWakeClaim,beginWakeDispatch,wakeEffectReceipt,invalidateWakeCycle,wakeNativeUnavailable,wakeCycleLabels,reviseWakeCycle} from '../shared/wakeupCycle.mjs';
let checks=0;const eq=(a,b)=>{checks++;assert.deepEqual(a,b);};
const AT=1900000000000,scope={owner:'synthetic-owner',occurrence:'synthetic-occurrence',planRevision:1};
const capabilities={localAlarm:true,serverReceipt:true,awakeConfirmation:true,transportExecution:true,fallbackCall:true,directCall:true,directMessage:true};
const plan={...scope,device:'device-a',createdAt:AT-60000,at:AT,options:{localAlarm:true,fallbackCall:true,directCall:false,directMessage:false,callChannel:'phone-call',confirmationWindowMs:300000}};
const receipt=(kind,extra={})=>({...scope,kind,accepted:true,...extra});
const arm={local:receipt('local-armed',{device:'device-a',at:AT,binding:wakePlanBinding(plan),ticketId:'synthetic-ticket-a-r1'}),server:receipt('server-plan',{at:AT,binding:wakePlanBinding(plan)})};
const make=(options={},caps=capabilities)=>{const selected={...plan,options:{...plan.options,...options}};const binding=wakePlanBinding(selected);return createWakeCycle(selected,{local:{...arm.local,binding},server:{...arm.server,binding}},caps);};
const local=(state,action,sequence=1,device='device-a',extra={})=>wakeLocalAction(state,{...scope,device,action,sequence,now:AT+1000,...extra,receipt:receipt('local-interaction',{device,action,sequence,...(extra.ringAt?{ringAt:extra.ringAt}:{})})});
const ack=(state,action,sequence=1,device='device-a',receivedAt=AT+2000)=>wakeServerAction(state,{...scope,device,action,sequence,receivedAt,receipt:receipt('server-interaction',{device,action,sequence})});
const memory=state=>({state:structuredClone(state),read(){return structuredClone(this.state);},compareAndSwap(revision,next){if(this.state.revision!==revision)return false;this.state=structuredClone(next);return true;}});
const reserve=(store,slot,now)=>commitWakeClaim(store,store.state.revision,slot,now);
const dispatch=(store,slot,now,current={...scope,binding:wakePlanBinding(store.state)})=>beginWakeDispatch(store,store.state.revision,slot,now,current);
const done=(state,slot,status)=>wakeEffectReceipt(state,{...scope,slot,key:state.effects[slot].key,status,...(status==='accepted'?{providerReference:'synthetic-provider-reference'}:{})});
for(const value of Object.values(WAKE_CLOCK_AVAILABILITY))eq(value,false);
eq(wakeLocalAction(make(),{...scope,device:'__proto__',sequence:1,action:'awake',now:AT,receipt:receipt('local-interaction',{device:'__proto__',action:'awake',sequence:1})}).status,'rejected');eq(wakeServerAction(make(),{...scope,device:'constructor',receivedAt:AT,receipt:receipt('server-interaction',{device:'constructor'})}).status,'rejected');
eq(createWakeCycle(plan,{},capabilities).local.confirmed,false);eq(createWakeCycle(plan,{},capabilities).server.confirmed,false);
eq(createWakeCycle({...plan,options:{...plan.options,directCall:true}},arm,capabilities).server.confirmed,false);eq(createWakeCycle(plan,{...arm,server:{...arm.server,binding:'unrelated-plan'}},capabilities).server.confirmed,false);eq(createWakeCycle(plan,{...arm,local:{...arm.local,binding:'unrelated-plan'}},capabilities).local.confirmed,false);
const external=createWakeCycle(plan,{local:receipt('external-clock-opened',{device:'device-a',at:AT}),server:arm.server},capabilities);eq(external.local.confirmed,false);eq(reserve(memory(external),'fallbackCall',AT+300000).effect,null);
eq(reserve(memory(make({},{})),'fallbackCall',AT+300000).effect,null);
let state=make();eq(state.local.phase,'scheduled');
let ring=wakeRingReceipt(state,{...scope,at:AT,now:AT,receipt:receipt('local-ring-attempt',{at:AT})});eq(ring.status,'attempt_recorded');eq(ring.state.local.phase,'ringing');eq(wakeCycleLabels(ring.state).deliveryConfirmed,false);eq(wakeRingReceipt(ring.state,{...scope,at:AT,now:AT,receipt:receipt('local-ring-attempt',{at:AT})}).status,'rejected');
let asleep=local(make(),'dismiss');eq(asleep.state.local.phase,'dismissed');eq(wakeCycleLabels(asleep.state).awake,'not_confirmed');eq(ack(asleep.state,'dismiss').state.server.awakeAt,null);eq(reserve(memory(asleep.state),'fallbackCall',AT+300000).status,'claim_proposed');
let awake=local(make(),'awake');eq(wakeCycleLabels(awake.state).awake,'local_pending_server');eq(awake.state.server.awakeAt,null);eq(reserve(memory(awake.state),'fallbackCall',AT+300000).status,'claim_proposed','offline ACK does not claim server suppression');
awake=ack(awake.state,'awake');eq(wakeCycleLabels(awake.state).awake,'confirmed');eq(reserve(memory(awake.state),'fallbackCall',AT+300000).status,'not_eligible');eq(local(awake.state,'dismiss',2).status,'already_awake');
const otherOwner={...scope,owner:'other-owner',device:'device-a',action:'awake',sequence:1,now:AT,receipt:receipt('local-interaction',{action:'awake',device:'device-a',sequence:1})};eq(wakeLocalAction(make(),otherOwner).status,'rejected');eq(local(make(),'awake',1,'device-b').status,'local_only');
let two=local(make(),'dismiss',1,'device-a').state;two=local(two,'awake',1,'device-b').state;two=ack(two,'awake',1,'device-b').state;eq(two.server.awakeAt,AT+2000);eq(reserve(memory(two),'fallbackCall',AT+300000).status,'not_eligible');eq(local(two,'awake',1,'device-b').status,'stale');
let snoozed=local(make(),'snooze',1,'device-a',{ringAt:AT+600000});eq(snoozed.state.local.ringAt,AT+600000);eq(snoozed.state.server.deadline,AT+300000);snoozed=ack(snoozed.state,'snooze');eq(snoozed.state.server.deadline,AT+900000);eq(reserve(memory(snoozed.state),'fallbackCall',AT+300000).status,'not_eligible');
const store=memory(make()),before=store.state.revision;const first=commitWakeClaim(store,before,'fallbackCall',AT+300000);eq(first.status,'claim_proposed');eq(first.effect,null,'reservation cannot authorize a provider call');assert(first.reservation.key.includes(':1:fallbackCall:phone-call'));checks++;
eq(commitWakeClaim(store,before,'fallbackCall',AT+300000).status,'conflict');eq(reserve(store,'fallbackCall',AT+300000).status,'not_eligible');
const inFlight=dispatch(store,'fallbackCall',AT+300000);eq(inFlight.status,'dispatch_committed');assert(inFlight.effect.key===first.reservation.key);checks++;eq(dispatch(store,'fallbackCall',AT+300000).effect,null);
let uncertain=done(store.state,'fallbackCall','uncertain');eq(uncertain.state.effects.fallbackCall.status,'uncertain');eq(reserve(memory(uncertain.state),'fallbackCall',AT+300000).effect,null);let reconciled=done(uncertain.state,'fallbackCall','accepted');eq(reconciled.status,'recorded');eq(reconciled.deliveryConfirmed,false);eq(wakeEffectReceipt(uncertain.state,{...scope,slot:'fallbackCall',key:uncertain.state.effects.fallbackCall.key,status:'accepted'}).status,'rejected');eq(wakeEffectReceipt(reconciled.state,{...scope,slot:'fallbackCall',key:reconciled.state.effects.fallbackCall.key,status:'accepted',providerReference:'different-provider-reference'}).status,'rejected');eq(done(reconciled.state,'fallbackCall','accepted').status,'already_recorded');
// Deadline race: ACK after reservation cancels only work not yet dispatched.
let race=memory(make());reserve(race,'fallbackCall',AT+300000);race.state=local(race.state,'awake').state;race.state=ack(race.state,'awake',1,'device-a',AT+300001).state;eq(race.state.effects.fallbackCall.status,'cancelled');eq(dispatch(race,'fallbackCall',AT+300002).effect,null);
race=memory(make());reserve(race,'fallbackCall',AT+300000);dispatch(race,'fallbackCall',AT+300000);race.state=local(race.state,'awake').state;const late=ack(race.state,'awake',1,'device-a',AT+300001);eq(late.status,'confirmed_call_may_be_in_flight');eq(late.state.effects.fallbackCall.status,'dispatching');
// Concurrent snooze receipt defers the same reserved stage; old worker revision is fenced.
race=memory(make());reserve(race,'fallbackCall',AT+300000);const oldRevision=race.state.revision;race.state=local(race.state,'snooze',1,'device-a',{ringAt:AT+600000}).state;race.state=ack(race.state,'snooze').state;eq(race.state.effects.fallbackCall.status,'deferred');eq(beginWakeDispatch(race,oldRevision,'fallbackCall',AT+300001,{...scope,binding:wakePlanBinding(race.state)}).status,'conflict');eq(reserve(race,'fallbackCall',AT+300001).status,'not_eligible');eq(reserve(race,'fallbackCall',AT+900000).status,'claim_proposed');eq(dispatch(race,'fallbackCall',AT+900000).status,'dispatch_committed');
// Independent direct message stage; conservative one-call budget spans direct/fallback.
let direct=memory(make({directCall:true,directMessage:true}));eq(reserve(direct,'directCall',AT).status,'claim_proposed');eq(dispatch(direct,'directCall',AT).status,'dispatch_committed');eq(reserve(direct,'directMessage',AT).status,'claim_proposed');eq(dispatch(direct,'directMessage',AT).status,'dispatch_committed');eq(reserve(direct,'fallbackCall',AT+300000).status,'not_eligible');
// Unknown durable write receipt never authorizes transport and never replays a dispatch.
let disk=memory(make());const originalRead=disk.read;let reads=0;disk.read=function(){reads++;if(reads===2)throw Error('synthetic lost readback');return originalRead.call(this);};eq(commitWakeClaim(disk,0,'fallbackCall',AT+300000).status,'uncertain');disk.read=originalRead;eq(reserve(disk,'fallbackCall',AT+300000).effect,null);eq(dispatch(disk,'fallbackCall',AT+300000).status,'dispatch_committed');
disk=memory(make());reserve(disk,'fallbackCall',AT+300000);reads=0;disk.read=function(){reads++;if(reads===2)throw Error('synthetic dispatch receipt loss');return originalRead.call(this);};eq(dispatch(disk,'fallbackCall',AT+300000).status,'uncertain');disk.read=originalRead;eq(dispatch(disk,'fallbackCall',AT+300000).effect,null);
for(const reason of ['account','roster_revision','timezone_revision']){const revoked=invalidateWakeCycle(make(),reason);eq(reserve(memory(revoked),'fallbackCall',AT+300000).effect,null);eq(wakeRingReceipt(revoked,{...scope,at:AT,now:AT,receipt:receipt('local-ring-attempt',{at:AT})}).status,'rejected');}
for(const reason of ['reboot','force_stop','exact_alarm_revoked']){const reset=wakeNativeUnavailable(make(),reason);eq(reset.local.confirmed,false);eq(reset.local.phase,'unavailable');eq(reserve(memory(reset),'fallbackCall',AT+300000).status,'claim_proposed','existing opt-in is preserved, not invented by reboot');}
eq(reserve(memory(make()),'fallbackCall',AT+420001).status,'expired');
let scoped=memory(make());reserve(scoped,'fallbackCall',AT+300000);eq(dispatch(scoped,'fallbackCall',AT+300000,{...scope,planRevision:2}).status,'cancelled');
let wrongBinding=memory(make());reserve(wrongBinding,'fallbackCall',AT+300000);eq(dispatch(wrongBinding,'fallbackCall',AT+300000,{...scope,binding:'changed-time-or-options'}).status,'cancelled');
const changedPlan={...plan,planRevision:2,at:AT+3600000};const changedReceipts={local:{...arm.local,planRevision:2,ticketId:'synthetic-ticket-a-r2',at:changedPlan.at,binding:wakePlanBinding(changedPlan)},server:{...arm.server,planRevision:2,at:changedPlan.at,binding:wakePlanBinding(changedPlan)},previousLocalRevoked:receipt('local-revoked',{device:'device-a',ticketId:'synthetic-ticket-a-r1',at:AT,binding:wakePlanBinding(plan)})};
eq(reviseWakeCycle(make(),changedPlan,changedReceipts,capabilities).status,'revised');eq(reviseWakeCycle(make(),changedPlan,{...changedReceipts,previousLocalRevoked:null},capabilities).status,'local_revocation_required');eq(reviseWakeCycle(uncertain.state,changedPlan,changedReceipts,capabilities).status,'reconciliation_required');
// Invalidation withdraws confidence, never proof that the previous native ticket was revoked.
for(const reason of ['account','roster_revision','timezone_revision']){
 const invalid=invalidateWakeCycle(make(),reason);eq(invalid.local.confirmed,false);eq(invalid.local.everConfirmed,true);
 eq(reviseWakeCycle(invalid,changedPlan,{...changedReceipts,previousLocalRevoked:null},capabilities).status,'local_revocation_required');
 eq(reviseWakeCycle(invalid,changedPlan,changedReceipts,capabilities).status,'revised');
 eq(reviseWakeCycle(invalid,changedPlan,{...changedReceipts,previousLocalRevoked:{...changedReceipts.previousLocalRevoked,planRevision:2}},capabilities).status,'local_revocation_required');
}
for(const reason of ['reboot','force_stop','exact_alarm_revoked'])eq(reviseWakeCycle(wakeNativeUnavailable(make(),reason),changedPlan,{...changedReceipts,previousLocalRevoked:null},capabilities).status,'local_revocation_required');
eq(reviseWakeCycle(invalidateWakeCycle(createWakeCycle(plan,{},capabilities),'roster_revision'),changedPlan,{...changedReceipts,previousLocalRevoked:null},capabilities).status,'revised');
for(const patch of [{device:'device-b'},{ticketId:'other-ticket'},{at:AT+1},{binding:'other-binding'},{planRevision:2}]){
 const wrong={...changedReceipts,previousLocalRevoked:{...changedReceipts.previousLocalRevoked,...patch}};
 eq(reviseWakeCycle(make(),changedPlan,wrong,capabilities).status,'local_revocation_required');
 eq(reviseWakeCycle(invalidateWakeCycle(make(),'roster_revision'),changedPlan,wrong,capabilities).status,'local_revocation_required');
}
eq(createWakeCycle(plan,{...arm,local:{...arm.local,ticketId:undefined}},capabilities).local.confirmed,false);
// A failed call consumes the occurrence budget across plan revisions, without blocking editing.
for(const slot of ['directCall','fallbackCall']){
 const initial=memory(make({directCall:true}));const when=slot==='directCall'?AT:AT+300000;
 eq(reserve(initial,slot,when).status,'claim_proposed');eq(dispatch(initial,slot,when).status,'dispatch_committed');
 const failed=done(initial.state,slot,'failed');eq(failed.status,'recorded');
 const newPlan={...changedPlan,options:{...changedPlan.options,directCall:true}};
 const binding=wakePlanBinding(newPlan),receipts={...changedReceipts,local:{...changedReceipts.local,binding},server:{...changedReceipts.server,binding},previousLocalRevoked:{...changedReceipts.previousLocalRevoked,binding:wakePlanBinding(failed.state)}};
 const revised=reviseWakeCycle(failed.state,newPlan,receipts,capabilities);eq(revised.status,'revised');eq(revised.state.effects[slot].status,'failed');eq(revised.state.effects[slot].key,failed.state.effects[slot].key);
 const revisedStore=memory(revised.state),current={owner:newPlan.owner,occurrence:newPlan.occurrence,planRevision:2,binding:wakePlanBinding(revised.state)};
 for(const nextSlot of ['directCall','fallbackCall']){const at=newPlan.at+(nextSlot==='fallbackCall'?300000:0);eq(reserve(revisedStore,nextSlot,at).status,'not_eligible');eq(beginWakeDispatch(revisedStore,revisedStore.state.revision,nextSlot,at,current).effect,null);}
 const thirdPlan={...newPlan,planRevision:3};const thirdBinding=wakePlanBinding(thirdPlan),thirdReceipts={local:{...receipts.local,planRevision:3,binding:thirdBinding},server:{...receipts.server,planRevision:3,binding:thirdBinding},previousLocalRevoked:{...receipt('local-revoked'),planRevision:2,device:'device-a',ticketId:revised.state.local.ticketId,at:revised.state.local.ringAt,binding:wakePlanBinding(revised.state)}};
 const third=reviseWakeCycle(revised.state,thirdPlan,thirdReceipts,capabilities);eq(third.status,'revised');eq(reserve(memory(third.state),'directCall',thirdPlan.at).status,'not_eligible');
}
assert.doesNotMatch(fs.readFileSync('shared/wakeupCycle.mjs','utf8'),/\bfetch\s*\(|setInterval\s*\(|setTimeout\s*\(/);checks++;
console.log(`PASS ${checks} prepared Wake cycle assertions: two devices, offline/late ACK, snooze vs silence vs awake, deadline/CAS races, revision/fuso fences, unknown receipt reconciliation, duplicate callbacks, one-call budget, reboot/force-stop unavailable; no native/provider/worker bound.`);
