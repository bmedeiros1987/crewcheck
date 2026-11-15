// Isolated decision policy only: no route, persistence, provider or access mutation.
// Authoritative readers and atomic consume/grant are still required for activation.
const DURATION = 7 * 24 * 60 * 60 * 1000;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const instant = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const result = (state, extra = {}) => Object.freeze({state, trialDays:7, automaticCharge:false, providerOperation:'none', accessMutation:'none', ...extra});
export function createTrialPolicy({readTrialHistory, readCurrentEntitlement, clock = Date.now} = {}) {
 if(typeof readTrialHistory !== 'function' || typeof readCurrentEntitlement !== 'function' || typeof clock !== 'function') throw new TypeError('Trusted trial readers required');
 return async owner => {
  if(!owner || typeof owner.email !== 'string' || !owner.email || typeof owner.publicId !== 'string' || !owner.publicId) return result('reconciliation_required',{reason:'owner_unconfirmed'});
  const identity = Object.freeze({email:owner.email, publicId:owner.publicId});
  try {
   const started = clock();
   const history = {...await readTrialHistory(identity)};
   const entitlement = {...await readCurrentEntitlement(identity)};
   const now = clock();
   if(!Number.isFinite(started)||!Number.isFinite(now)||now<started) return result('reconciliation_required',{reason:'clock_unconfirmed'});
   for(const evidence of [history,entitlement]) {
    if(evidence.email!==identity.email || evidence.publicId!==identity.publicId || !hash(evidence.sourceVersionHash)) return result('reconciliation_required',{reason:'evidence_unconfirmed'});
    if(!instant(evidence.observedAt)||!instant(evidence.validUntil)||Date.parse(evidence.observedAt)>started||Date.parse(evidence.validUntil)<=now) return result('reconciliation_required',{reason:'evidence_expired'});
   }
   // A free current account does not prove trial eligibility. The history reader
   // must independently prove non-use; deleted/recreated or missing history is unknown.
   if(!['free','paid','unlimited','trial'].includes(entitlement.kind)) return result('reconciliation_required',{reason:'entitlement_unknown'});
   if(!['never_used','consumed'].includes(history.state)) return result('reconciliation_required',{reason:'trial_history_unknown'});
   if(history.state==='consumed') {
    if(!instant(history.startedAt)||!instant(history.endsAt)||Date.parse(history.endsAt)-Date.parse(history.startedAt)!==DURATION||Date.parse(history.startedAt)>now) return result('reconciliation_required',{reason:'trial_period_unconfirmed'});
    return result(Date.parse(history.endsAt)>now?'trial_already_started':'trial_already_used',{trialStartedAt:history.startedAt,trialEndsAt:history.endsAt});
   }
   if(history.startedAt!=null||history.endsAt!=null) return result('reconciliation_required',{reason:'conflicting_trial_history'});
   if(entitlement.kind!=='free') return result('trial_not_available',{reason:'existing_entitlement_preserved'});
   const end = now+DURATION;
   if(!Number.isFinite(end)||Math.abs(end)>8.64e15) return result('reconciliation_required',{reason:'clock_unconfirmed'});
   // Proposal only. A later atomic action must revalidate current identity,
   // entitlement and unused history; this output is never a grant or reservation.
   return result('eligible_for_trial',{proposedStart:new Date(now).toISOString(),proposedEnd:new Date(end).toISOString(),requiresAtomicConsumption:true});
  } catch {return result('reconciliation_required',{reason:'evidence_unavailable'});}
 };
}
