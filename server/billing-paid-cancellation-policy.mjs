// Isolated policy preparation. No route, provider transport, persistence or access writer.
// readVerifiedCoverage is a trusted server adapter, never request/body evidence.
// The caller must revalidate live account authority and coverage in its write
// transaction; a detached decision is not a session capability or grant command.
const instant=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))return NaN;
 const time=Date.parse(value);return Number.isFinite(time)&&new Date(time).toISOString()===value?time:NaN;
};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const text=value=>typeof value==='string'&&value.length>0&&value.length<=300;
const pending=reason=>Object.freeze({state:'reconciliation_required',reason,accessMutation:'none',renewalConfirmed:false});
const snapshotCoverage=value=>Object.freeze(Object.fromEntries(['email','publicId','provider','providerRef','paymentRef','paid','start','end','observedAt','validUntil','source','sourceVersionHash','refundState','renewalStopped'].map(key=>[key,value[key]])));
// Shared evidence check, not an exported request validator or access capability.
function coverageReason(selected,proof,now){
 const {email,publicId,provider,providerRef,paymentRef,paid,start,end,observedAt,validUntil,source,sourceVersionHash,refundState}=proof;
 if(email!==selected.email||publicId!==selected.publicId||provider!==selected.provider||providerRef!==selected.providerRef||paymentRef!==selected.paymentRef)return 'coverage_identity_mismatch';
 if(!['provider_verified_paid_period','reviewed_payment_coverage'].includes(source)||!hash(sourceVersionHash)||paid!==true)return 'paid_coverage_unconfirmed';
 const from=instant(start),until=instant(end),observed=instant(observedAt),valid=instant(validUntil);
 if(![from,until,observed,valid].every(Number.isFinite)||from>=until||observed>now||valid<=now||valid<observed)return 'coverage_time_unconfirmed';
 if(refundState!=='none')return 'refund_requires_separate_reconciliation';
 return null;
}
export function createPaidCancellationPolicy({readVerifiedCoverage,clock=Date.now}={}){
 if(typeof readVerifiedCoverage!=='function'||typeof clock!=='function')throw new Error('PAID_COVERAGE_ADAPTER_REQUIRED');
 return async function evaluate(input){
  let now;try{now=clock();}catch{return pending('clock_unavailable');}
  // Snapshot the selected account/contract before the asynchronous authoritative read.
  const selected=Object.freeze({email:input?.email,publicId:input?.publicId,provider:input?.provider,providerRef:input?.providerRef,paymentRef:input?.paymentRef,currentPeriodEnd:input?.currentPeriodEnd});
  if(!Number.isFinite(now)||!['asaas','google_play'].includes(selected.provider)||!['email','publicId','providerRef','paymentRef'].every(k=>text(selected[k])))return pending('identity_unconfirmed');
  const currentEnd=instant(selected.currentPeriodEnd);
  if(!Number.isFinite(currentEnd))return pending('existing_period_unconfirmed');
  let proof;try{proof=await readVerifiedCoverage(selected);}catch{return pending('coverage_unavailable');}
  if(!proof||typeof proof!=='object')return pending('coverage_unavailable');
  try{proof=snapshotCoverage(proof);}catch{return pending('coverage_unavailable');}
  const started=now;try{now=clock();}catch{return pending('clock_unavailable');}
  if(!Number.isFinite(now)||now<started)return pending('clock_unavailable');
  // A paid receipt, trial/grace status or locally derived 31/366-day expiry alone
  // cannot satisfy this contract. The adapter must establish the actual paid bounds.
  const reason=coverageReason(selected,proof,now);if(reason)return pending(reason);
  const {start,end,sourceVersionHash,renewalStopped}=proof,from=instant(start),until=instant(end);
  if(renewalStopped!==true)return pending('renewal_stop_unconfirmed');
  // Do not silently extend/grant an existing entitlement or repair a conflicting
  // period under the guise of cancellation. Such cases need separate reconciliation.
  if(until!==currentEnd)return pending('existing_period_differs_from_paid_coverage');
  if(from>now)return pending('paid_period_not_started');
  return Object.freeze({state:until>now?'preserve_paid_access':'paid_period_ended',accessMutation:'none',renewalConfirmed:true,cancelAtPeriodEnd:true,paidThrough:end,coverageVersionHash:sourceVersionHash});
 };
}

// Separate prospective product decision: an old paid reference never buys a new
// window. Readers are trusted LOCAL server evidence adapters, not client claims.
// No benefit tier, trial policy, new charge or 30-day/year calculation is created.
export function createReferencePaymentPolicy({readVerifiedCoverage,readBaselineGrant,clock=Date.now}={}){
 if(typeof readVerifiedCoverage!=='function'||typeof readBaselineGrant!=='function'||typeof clock!=='function')throw Error('REFERENCE_PAYMENT_ADAPTERS_REQUIRED');
 return async function evaluate(input){
  const selected=Object.freeze({email:input?.email,publicId:input?.publicId,provider:input?.provider,providerRef:input?.providerRef,paymentRef:input?.paymentRef});
  if(!['asaas','google_play'].includes(selected.provider)||!['email','publicId','providerRef','paymentRef'].every(k=>text(selected[k])))return pending('identity_unconfirmed');
  let began,proof,base,now;try{began=clock();proof=await readVerifiedCoverage(selected);if(proof&&typeof proof==='object')proof=snapshotCoverage(proof);const grant=await readBaselineGrant(selected);if(grant&&typeof grant==='object')base=Object.freeze(Object.fromEntries(['email','publicId','plan','sourceVersionHash','validUntil'].map(key=>[key,grant[key]])));now=clock();}catch{return pending('reference_evidence_unavailable');}
  if(!Number.isFinite(began)||!Number.isFinite(now)||now<began)return pending('clock_unavailable');
  if(!proof||typeof proof!=='object')return pending('coverage_unavailable');
  const reason=coverageReason(selected,proof,now);if(reason)return pending(reason);
  if(!base||base.email!==selected.email||base.publicId!==selected.publicId||!['free','premium_unlimited'].includes(base.plan)||!hash(base.sourceVersionHash)||!Number.isFinite(instant(base.validUntil))||instant(base.validUntil)<=now)return pending('baseline_grant_unconfirmed');
  const from=instant(proof.start),until=instant(proof.end);
  return Object.freeze({state:from>now?'reference_not_started':until>now?'reference_access_available':'new_payment_required',paymentRequirementScope:'paid_reference_only',baselinePlan:base.plan,referenceStart:proof.start,referenceEnd:proof.end,coverageVersionHash:proof.sourceVersionHash,accessMutation:'none',automaticExtension:false});
 };
}
