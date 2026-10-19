// Prepared protocol model. No provider, native bridge, persistence or worker is bound.
// Receipts assume a validated adapter; this is not an authentication mechanism.
export const WAKE_CLOCK_AVAILABILITY=Object.freeze({localAlarm:false,externalClock:false,awakeConfirmation:false,fallbackCall:false,directCall:false});
const copy=value=>JSON.parse(JSON.stringify(value));
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const identity=value=>typeof value==='string'&&/^[a-zA-Z0-9:_-]{1,160}$/.test(value)&&!Object.prototype.hasOwnProperty.call(Object.prototype,value)&&value!=='prototype';
const same=(state,value)=>value?.owner===state.owner&&value?.occurrence===state.occurrence&&value?.planRevision===state.planRevision;
const advance=state=>({...copy(state),revision:state.revision+1});
const bound=(state,receipt,kind)=>same(state,receipt)&&receipt.kind===kind&&receipt.accepted===true;
const callSlots=['directCall','fallbackCall'];
const slots=['directCall','fallbackCall','directMessage'];
const stageKey=(state,slot)=>'wake:'+ [state.owner,state.occurrence,state.planRevision,slot,slot==='directMessage'?'telegram':state.options.callChannel].map(encodeURIComponent).join(':');

export function wakePlanBinding(plan){return JSON.stringify([plan.owner,plan.occurrence,plan.planRevision,plan.at,...['localAlarm','fallbackCall','directCall','directMessage','callChannel','confirmationWindowMs'].map(key=>plan.options[key])]);}

export function createWakeCycle(plan,receipts={},capabilities={}) {
  if(!identity(plan?.owner)||!identity(plan.occurrence)||!integer(plan.planRevision)||plan.planRevision<1||!identity(plan.device)||!integer(plan.at)||!integer(plan.createdAt)||plan.at<=plan.createdAt)throw Error('Invalid occurrence');
  const config=plan.options||{};
  if(Object.keys(config).some(key=>!['localAlarm','fallbackCall','directCall','directMessage','callChannel','confirmationWindowMs'].includes(key)))throw Error('Unknown option');
  if(['localAlarm','fallbackCall','directCall','directMessage'].some(key=>typeof config[key]!=='boolean'))throw Error('Explicit options required');
  if(!['phone-call','telegram-call'].includes(config.callChannel)||!integer(config.confirmationWindowMs)||config.confirmationWindowMs<60000||config.confirmationWindowMs>900000)throw Error('Invalid confirmation policy');
  if(config.fallbackCall&&!config.localAlarm)throw Error('Fallback requires an explicit local-alarm plan');
  const state={schemaVersion:1,owner:plan.owner,occurrence:plan.occurrence,planRevision:plan.planRevision,revision:0,at:plan.at,createdAt:plan.createdAt,valid:true,options:copy(config),
    local:{device:plan.device,confirmed:false,everConfirmed:false,phase:'unavailable',ringAt:plan.at,awakeAt:null,ticketId:null},devices:{},
    server:{confirmed:false,awakeAt:null,sequences:{},deadline:plan.at+config.confirmationWindowMs},
    effects:Object.fromEntries(slots.map(slot=>[slot,{status:'idle'}])),capabilities:copy(capabilities)};
  // An external Clock opening is neither an armed ticket nor a wake-up receipt.
  state.local.confirmed=capabilities.localAlarm===true&&bound(state,receipts.local,'local-armed')&&receipts.local.at===plan.at&&receipts.local.device===plan.device&&receipts.local.binding===wakePlanBinding(plan)&&identity(receipts.local.ticketId);
  state.local.everConfirmed=state.local.confirmed;
  if(state.local.confirmed)state.local.ticketId=receipts.local.ticketId;
  if(state.local.confirmed)state.local.phase='scheduled';
  state.server.confirmed=capabilities.serverReceipt===true&&bound(state,receipts.server,'server-plan')&&receipts.server.at===plan.at&&receipts.server.binding===wakePlanBinding(plan);
  return state;
}

export function wakeLocalAction(state,event) {
  if(!state.valid||!same(state,event)||!identity(event.device)||!integer(event.sequence)||event.sequence<1||!integer(event.now)||event.now<state.createdAt)return {status:'rejected',state};
  if(!['snooze','dismiss','awake'].includes(event.action))return {status:'rejected',state};
  const previous=state.devices[event.device];
  if(previous&&event.sequence<=previous.sequence)return {status:'stale',state};
  if(previous?.action==='awake')return {status:'already_awake',state};
  if(!bound(state,event.receipt,'local-interaction')||event.receipt.device!==event.device||event.receipt.sequence!==event.sequence||event.receipt.action!==event.action)return {status:'unconfirmed',state};
  if(event.action!=='awake'&&(!state.local.confirmed||event.device!==state.local.device))return {status:'rejected',state};
  if(event.action==='snooze'&&(!integer(event.ringAt)||event.ringAt<=event.now||event.ringAt>event.now+600000||event.receipt.ringAt!==event.ringAt))return {status:'rejected',state};
  const next=advance(state);next.devices[event.device]={sequence:event.sequence,action:event.action,at:event.now,...(event.action==='snooze'?{ringAt:event.ringAt}:{})};
  if(event.device===state.local.device){
    if(event.action==='awake'){next.local.awakeAt=event.now;next.local.phase='awake';}
    if(event.action==='dismiss')next.local.phase='dismissed';
    if(event.action==='snooze'){next.local.phase='snoozed';next.local.ringAt=event.ringAt;}
  }
  return {status:'local_only',state:next}; // Offline action never invents a server ACK.
}

export function wakeServerAction(state,ack) {
  if(!identity(ack?.device)||!integer(ack.sequence)||ack.sequence<1||!Object.hasOwn(state.devices,ack.device))return {status:'rejected',state};
  const action=state.devices[ack.device];
  if(!state.valid||!state.server.confirmed||state.capabilities.awakeConfirmation!==true||!same(state,ack)||!action||ack.sequence!==action.sequence||ack.sequence<=(state.server.sequences[ack.device]||0)||ack.action!==action.action||!integer(ack.receivedAt)||ack.receivedAt<state.createdAt||!bound(state,ack.receipt,'server-interaction')||ack.receipt.device!==ack.device||ack.receipt.sequence!==ack.sequence||ack.receipt.action!==ack.action)return {status:'rejected',state};
  const next=advance(state);next.server.sequences[ack.device]=ack.sequence;
  if(ack.action==='awake'){
    next.server.awakeAt=state.server.awakeAt??ack.receivedAt;
    if(next.effects.fallbackCall.status==='claimed')next.effects.fallbackCall.status='cancelled';
  }
  if(ack.action==='snooze'&&state.server.awakeAt===null){
    next.server.deadline=action.ringAt+state.options.confirmationWindowMs;
    if(next.effects.fallbackCall.status==='claimed')next.effects.fallbackCall.status='deferred';
  }
  return {status:next.effects.fallbackCall.status==='dispatching'?'confirmed_call_may_be_in_flight':'confirmed',state:next};
}

export function wakeRingReceipt(state,event) {
  if(!state.valid||!state.local.confirmed||!same(state,event)||!['scheduled','snoozed'].includes(state.local.phase)||event.at!==state.local.ringAt||!integer(event.now)||event.now<event.at||event.now>event.at+120000||!bound(state,event.receipt,'local-ring-attempt')||event.receipt.at!==event.at)return {status:'rejected',state};
  const next=advance(state);next.local.phase='ringing';return {status:'attempt_recorded',state:next};
}

function eligibility(state,slot,now) {
  if(!state.valid||!state.server.confirmed||state.capabilities.transportExecution!==true||!integer(now))return null;
  // Conservative initial policy: at most one phone/VoIP attempt per occurrence,
  // even when both direct and fallback were chosen. Unknown outcomes consume it.
  if(callSlots.includes(slot)&&callSlots.some(other=>other!==slot&&['claimed','dispatching','accepted','failed','uncertain'].includes(state.effects[other].status)))return null;
  if(slot==='directMessage'&&state.options.directMessage&&state.capabilities.directMessage===true)return {due:state.at};
  if(slot==='directCall'&&state.options.directCall&&state.capabilities.directCall===true)return {due:state.at};
  if(slot==='fallbackCall'&&state.options.fallbackCall&&state.local.everConfirmed&&state.capabilities.fallbackCall===true&&state.capabilities.awakeConfirmation===true&&state.server.awakeAt===null)return {due:state.server.deadline};
  return null;
}

export function proposeWakeClaim(state,slot,now) {
  if(!slots.includes(slot))return {status:'rejected',state,effect:null};
  const candidate=eligibility(state,slot,now);
  if(!candidate||!['idle','deferred'].includes(state.effects[slot].status)||now<candidate.due)return {status:'not_eligible',state,effect:null};
  const next=advance(state),key=stageKey(state,slot);
  if(now>candidate.due+120000){next.effects[slot]={status:'expired',key};return {status:'expired',state:next,effect:null};}
  next.effects[slot]={status:'claimed',key,due:candidate.due,claimedAt:now};
  return {status:'claim_proposed',state:next,reservation:{key,slot},effect:null};
}

function commit(store,expectedRevision,transition) {
  try {
    const saved=store.read();if(saved.revision!==expectedRevision)return {status:'conflict',effect:null};
    const proposal=transition(saved);
    if(proposal.state===saved)return {status:proposal.status,effect:null};
    if(!store.compareAndSwap(expectedRevision,proposal.state))return {status:'conflict',effect:null};
    if(JSON.stringify(store.read())!==JSON.stringify(proposal.state))return {status:'uncertain',effect:null};
    return {status:proposal.status,effect:proposal.status==='dispatch_committed'?proposal.effect||null:null,reservation:proposal.reservation||null};
  }catch{return {status:'uncertain',effect:null};}
}
export function commitWakeClaim(store,expectedRevision,slot,now){return commit(store,expectedRevision,state=>proposeWakeClaim(state,slot,now));}

export function beginWakeDispatch(store,expectedRevision,slot,now,currentScope) {
  return commit(store,expectedRevision,state=>{
    if(!slots.includes(slot)||state.effects[slot].status!=='claimed')return {status:'not_eligible',state};
    const candidate=eligibility(state,slot,now),next=advance(state);
    if(!same(state,currentScope)||currentScope.binding!==wakePlanBinding(state)||!candidate||candidate.due!==state.effects[slot].due||now<candidate.due||now>candidate.due+120000){next.effects[slot].status='cancelled';return {status:'cancelled',state:next};}
    next.effects[slot].status='dispatching';
    return {status:'dispatch_committed',state:next,effect:{key:next.effects[slot].key,slot}};
  });
}

export function wakeEffectReceipt(state,receipt) {
  const slot=receipt?.slot;
  if(!same(state,receipt)||!slots.includes(slot)||receipt.key!==state.effects[slot].key||!['accepted','failed','uncertain'].includes(receipt.status))return {status:'rejected',state};
  if(receipt.status==='accepted'&&(!identity(receipt.providerReference)))return {status:'rejected',state};
  if(state.effects[slot].providerReference&&receipt.providerReference!==state.effects[slot].providerReference)return {status:'rejected',state};
  if(state.effects[slot].status===receipt.status)return {status:'already_recorded',state,deliveryConfirmed:false};
  if(!['dispatching','uncertain'].includes(state.effects[slot].status))return {status:'rejected',state};
  const next=advance(state);next.effects[slot].status=receipt.status;if(receipt.providerReference)next.effects[slot].providerReference=receipt.providerReference;
  return {status:'recorded',state:next,deliveryConfirmed:false}; // Reconciliation only, never a retry.
}

export function invalidateWakeCycle(state,reason) {
  if(!['account','roster_revision','timezone_revision'].includes(reason))throw Error('Invalid invalidation');
  const next=advance(state);next.valid=false;next.local.confirmed=false;next.local.phase='needs_reconfirmation';next.server.confirmed=false;
  for(const slot of slots){if(next.effects[slot].status==='claimed')next.effects[slot].status='cancelled';if(next.effects[slot].status==='dispatching')next.effects[slot].status='uncertain';}
  return next;
}
export function wakeNativeUnavailable(state,reason) {
  if(!['reboot','force_stop','exact_alarm_revoked'].includes(reason))throw Error('Invalid native state');
  const next=advance(state);next.local.confirmed=false;next.local.phase='unavailable';next.local.reason=reason;
  return next; // Existing server fallback consent is not silently cancelled or newly created.
}
export function wakeCycleLabels(state,device=state.local.device) {
  return {local:state.local.phase,awake:state.server.awakeAt!==null?'confirmed':state.devices[device]?.action==='awake'?'local_pending_server':'not_confirmed',fallback:!state.options.fallbackCall?'off':state.server.awakeAt!==null?'suppressed':state.effects.fallbackCall.status,deliveryConfirmed:false};
}

export function reviseWakeCycle(state,plan,receipts,capabilities) {
  if(plan?.owner!==state.owner||plan?.occurrence!==state.occurrence||!integer(plan.planRevision)||plan.planRevision<=state.planRevision)return {status:'rejected',state};
  if(slots.some(slot=>['dispatching','accepted','uncertain'].includes(state.effects[slot].status)))return {status:'reconciliation_required',state:invalidateWakeCycle(state,'roster_revision')};
  if(state.local.everConfirmed&&(!bound(state,receipts?.previousLocalRevoked,'local-revoked')||receipts.previousLocalRevoked.device!==state.local.device||receipts.previousLocalRevoked.ticketId!==state.local.ticketId||receipts.previousLocalRevoked.at!==state.local.ringAt||receipts.previousLocalRevoked.binding!==wakePlanBinding(state)))return {status:'local_revocation_required',state};
  const next=createWakeCycle(plan,receipts,capabilities);
  // A definitive failure still consumed the occurrence's call attempt. Editing
  // a plan revision cannot reset that budget or manufacture another call key.
  for(const slot of callSlots)if(state.effects[slot].status==='failed')next.effects[slot]=structuredClone(state.effects[slot]);
  next.revision=state.revision+1;return {status:'revised',state:next};
}
