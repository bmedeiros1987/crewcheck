// Unwired, read-only assessment inside the existing entitlement transaction.
// The injected reader must read trusted local evidence using this same client;
// it MUST NOT perform network calls or irreversible effects inside a retriable tx.
import {assertTransactionClient} from './profile-locks.mjs';
import {readLockedPlatformEntitlement} from './platform-entitlement.mjs';
import {createPaidCancellationPolicy} from './billing-paid-cancellation-policy.mjs';
const pending=reason=>({state:'reconciliation_required',reason,accessMutation:'none',renewalConfirmed:false});
function end(value){
 if(value instanceof Date)return Number.isFinite(value.getTime())?value.toISOString():null;
 if(typeof value!=='string')return null;
 const sql=/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?$/.exec(value);
 return sql?`${sql[1]}T${sql[2]}.${(sql[3]||'').padEnd(3,'0')}Z`:value;
}
export function createPaidCancellationAssessment({readLockedVerifiedCoverage,clock=Date.now}={}){
 if(typeof readLockedVerifiedCoverage!=='function')throw Error('LOCKED_PAID_COVERAGE_READER_REQUIRED');
 return async function assess(client,owner){
  assertTransactionClient(client);
  const snapshot=await readLockedPlatformEntitlement(client,owner),sub=snapshot.subscription;
  if(!sub||!['asaas','google_play'].includes(sub.provider))return pending('subscription_unconfirmed');
  // No trial/grace-to-paid conversion, free-profile grant or lifetime mutation.
  if(sub.status!=='active'||snapshot.profile.plan!==sub.plan||!['premium_monthly','premium_annual'].includes(sub.plan))return pending('existing_paid_entitlement_unconfirmed');
  const paymentRef=sub.provider==='asaas'?sub.metadata?.lastAsaasPaidPaymentId:sub.provider_ref;
  const selected={email:snapshot.profile.email,publicId:snapshot.profile.public_id,provider:sub.provider,providerRef:sub.provider_ref,paymentRef,currentPeriodEnd:end(sub.current_period_end)};
  const evaluate=createPaidCancellationPolicy({clock,readVerifiedCoverage:selection=>readLockedVerifiedCoverage(client,selection)});
  return evaluate(selected);
 };
}
