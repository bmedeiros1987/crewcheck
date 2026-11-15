// Single status normalizer extracted from platform.mjs. No I/O or event ordering.
export function googleSubscriptionStatus(stateName,expiry,{now=Date.now()}={}){
 const inFuture=expiry instanceof Date&&expiry.getTime()>now;
 if(stateName==='SUBSCRIPTION_STATE_IN_GRACE_PERIOD'&&inFuture)return {status:'grace_period',active:true,cancelAtPeriodEnd:false};
 if(stateName==='SUBSCRIPTION_STATE_CANCELED'&&inFuture)return {status:'active',active:true,cancelAtPeriodEnd:true};
 if(stateName==='SUBSCRIPTION_STATE_ACTIVE'&&inFuture)return {status:'active',active:true,cancelAtPeriodEnd:false};
 if(stateName==='SUBSCRIPTION_STATE_PENDING')return {status:'pending',active:false,cancelAtPeriodEnd:false};
 if(stateName==='SUBSCRIPTION_STATE_ON_HOLD')return {status:'past_due',active:false,cancelAtPeriodEnd:false};
 if(stateName==='SUBSCRIPTION_STATE_PAUSED')return {status:'paused',active:false,cancelAtPeriodEnd:false};
 return {status:'expired',active:false,cancelAtPeriodEnd:false};
}
