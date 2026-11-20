// Isolated cross-check. Accounting observation only, NEVER an entitlement proof.
// Inject authenticated readers outside any retriable SQL transaction; no defaults.
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=()=>Object.assign(new Error('GOOGLE_PAID_PERIOD_UNCONFIRMED'),{code:'GOOGLE_PAID_PERIOD_UNCONFIRMED',status:503});
function instant(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))throw fail();
 const n=Date.parse(value);if(!Number.isFinite(n)||new Date(n).toISOString()!==value)throw fail();return n;
}
function positiveMoney(value){
 if(!value||typeof value!=='object'||!/^([A-Z]{3})$/.test(value.currencyCode)||typeof value.units!=='string'||!/^\d{1,18}$/.test(value.units)||!Number.isInteger(value.nanos)||value.nanos<0||value.nanos>999999999)throw fail();
 return BigInt(value.units)*1000000000n+BigInt(value.nanos)>0n;
}
export function createGooglePaidPeriodObservation({readCurrent,readOrder}={}){
 if(typeof readCurrent!=='function'||typeof readOrder!=='function')throw fail();
 return async function observe({purchaseToken,known}={}){
  try{
   // The existing current reader establishes owner/token/catalog binding.
   const current=await readCurrent({purchaseToken,known});const s=current?.subscription;
   if(current?.source!=='google_play_subscriptions_v2'||!s||typeof purchaseToken!=='string'||!purchaseToken||hash(purchaseToken)!==known?.tokenHash||s.tokenHash!==known.tokenHash||s.email!==known.email||s.expectedPublicId!==known.expectedPublicId||!s.providerRef||typeof current.version?.hash!=='string'||!/^[a-f0-9]{64}$/.test(current.version.hash))throw fail();
   const response=await readOrder(s.providerRef),order=response?.body;
   if(response?.status!==200||!order||order.orderId!==s.providerRef||order.purchaseToken!==purchaseToken||order.state!=='PROCESSED'||!Array.isArray(order.lineItems)||order.lineItems.length!==1)throw fail();
   const line=order.lineItems[0],details=line?.subscriptionDetails;
   if(line?.productId!==s.productId||!details||!positiveMoney(line.total)||!positiveMoney(order.total)||line.total.currencyCode!==order.total.currencyCode)throw fail();
   // Conservative supported subset: one base-price phase, no proration/trial/intro
   // or multi-item replacement. Other valid products require separate support.
   const phase=details.offerPhaseDetails;
   if(!phase||Object.keys(phase).length!==1||!phase.baseDetails||typeof phase.baseDetails!=='object'||Array.isArray(phase.baseDetails))throw fail();
   const start=instant(details.servicePeriodStartTime),end=instant(details.servicePeriodEndTime);
   if(start>=end)throw fail();
   const currentEnd=String(s.periodEnd).replace(' ','T')+'Z';instant(currentEnd);
   const observation={source:'google_order_and_current_subscription',orderRefHash:hash(s.providerRef),productId:s.productId,accountingStart:details.servicePeriodStartTime,accountingEnd:details.servicePeriodEndTime,currentEnd,currentState:s.metadata?.subscriptionState||'',matchingAccountingPeriod:currentEnd===details.servicePeriodEndTime,currentVersionHash:current.version.hash,atomicProviderSnapshot:false,orderingEstablished:false,entitlementDecision:'not_made'};
   // No token, raw response, account identity, amount or address escapes.
   return Object.freeze(observation);
  }catch{throw fail();}
 };
}
