// Unwired read adapters. Only injected authenticated readJson transport; no defaults,
// env/secrets, raw response persistence, retries, timers or entitlement side effects.
import {createHash} from 'node:crypto';
import {cancellationContractHash} from './billing-cancellation-intent.mjs';
import {googleSubscriptionStatus} from './google-subscription-status.mjs';
import {validateVerifiedGoogleSubscriptionRecord} from './google-subscription-write.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),object=x=>x&&typeof x==='object'&&!Array.isArray(x),opaque=(x,max=180)=>typeof x==='string'&&new RegExp('^[\\x21-\\x7e]{1,'+max+'}$').test(x),fail=code=>Object.assign(new Error(code),{code,status:503});
function expiry(value){
 const p=typeof value==='string'&&value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/);
 if(!p)return null;const [year,month,day,hour,minute,second]=p.slice(1,7).map(Number),millis=Number((p[7]||'').padEnd(3,'0').slice(0,3)),oh=Number(p[10]||0),om=Number(p[11]||0);
 if(year<1||oh>23||om>59)return null;const wall=new Date(0);wall.setUTCFullYear(year,month-1,day);wall.setUTCHours(hour,minute,second,millis);
 if(wall.getUTCFullYear()!==year||wall.getUTCMonth()!==month-1||wall.getUTCDate()!==day||wall.getUTCHours()!==hour||wall.getUTCMinutes()!==minute||wall.getUTCSeconds()!==second)return null;
 const result=new Date(wall.getTime()-(p[9]==='-'?-1:1)*(oh*60+om)*60000);return Number.isFinite(result.getTime())&&result.getUTCFullYear()>=1&&/^\d{4}-/.test(result.toISOString())?result:null;
}
function civil(value){if(value==null)return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('invalid civil date');const date=new Date(value+'T12:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw Error('invalid civil date');return value;}
export function createGoogleCurrentReadAdapter({readJson,packageName,products,expectedPlanType}){
 if(typeof readJson!=='function'||typeof packageName!=='string'||packageName.length>255||!/^\w+(?:\.\w+)+$/.test(packageName)||!(products instanceof Map)||!products.size||[...products].some(([id,plan])=>!opaque(id,100)||!['premium_monthly','premium_annual'].includes(plan))||expectedPlanType!=='autoRenewingPlan')throw fail('GOOGLE_CURRENT_READ_CONFIGURATION_REQUIRED');
 const catalog=new Map(products);
 return async function read({purchaseToken,known}={}){
  try{
   const {email,expectedPublicId,tokenHash}=known||{};
   if(typeof purchaseToken!=='string'||!purchaseToken||purchaseToken.length>5000||!digest(tokenHash)||hash(purchaseToken)!==tokenHash||typeof email!=='string'||!email||typeof expectedPublicId!=='string'||!expectedPublicId||expectedPublicId.length>24)throw Error('unbound token');
   const response=await readJson(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,{method:'GET'});
   const {status,body}=response||{};if(status!==200||!object(body))throw Error('unconfirmed read');
   const {lineItems,subscriptionState,acknowledgementState,externalAccountIdentifiers,etag}=body;
   if(!['ACTIVE','IN_GRACE_PERIOD','CANCELED','PENDING','ON_HOLD','PAUSED','EXPIRED'].some(x=>subscriptionState==='SUBSCRIPTION_STATE_'+x)||!['ACKNOWLEDGEMENT_STATE_PENDING','ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'].includes(acknowledgementState)||externalAccountIdentifiers?.obfuscatedExternalAccountId!==expectedPublicId||typeof etag!=='string'||!etag||etag.length>4096||!Array.isArray(lineItems)||lineItems.length!==1)throw Error('unconfirmed resource');
   const lines=lineItems.map(value=>{if(!object(value))return null;const {productId,expiryTime,latestSuccessfulOrderId,autoRenewingPlan,prepaidPlan}=value;const hasAuto=Boolean(object(autoRenewingPlan));return {productId,expiryTime,latestSuccessfulOrderId,hasAuto,hasPrepaid:prepaidPlan!=null,autoRenewEnabled:hasAuto?autoRenewingPlan.autoRenewEnabled:undefined};});
   const eligible=lines.filter(x=>x&&catalog.has(x.productId));if(eligible.length!==1)throw Error('ambiguous product');
   const {productId,expiryTime,latestSuccessfulOrderId,hasAuto,hasPrepaid,autoRenewEnabled}=eligible[0];
   if(!hasAuto||hasPrepaid||typeof autoRenewEnabled!=='boolean'||!opaque(latestSuccessfulOrderId))throw Error('unsupported plan/order');
   if((subscriptionState==='SUBSCRIPTION_STATE_ACTIVE'&&autoRenewEnabled!==true)||(subscriptionState==='SUBSCRIPTION_STATE_CANCELED'&&autoRenewEnabled!==false))throw Error('incoherent renewal state');
   const end=expiry(expiryTime);if(!end)throw Error('unconfirmed expiry');const normalized=googleSubscriptionStatus(subscriptionState,end);
   const subscription={email,expectedPublicId,verifiedPublicId:expectedPublicId,tokenHash,plan:catalog.get(productId),productId,...normalized,periodEnd:end.toISOString().slice(0,23).replace('T',' '),providerRef:latestSuccessfulOrderId,metadata:{subscriptionState,acknowledgementState}};
   validateVerifiedGoogleSubscriptionRecord(subscription);
   return {source:'google_play_subscriptions_v2',subscription,version:{kind:'opaque_etag_hash',hash:hash(etag),orderingEstablished:false}};
  }catch{throw fail('GOOGLE_CURRENT_READ_UNCONFIRMED');}
 };
}
export function createAsaasCurrentReadAdapter({readJson}){
 if(typeof readJson!=='function')throw fail('ASAAS_CURRENT_READ_CONFIGURATION_REQUIRED');
 return async function read({paymentRef,subscriptionRef}={}){
  try{
   if(!opaque(paymentRef)||!opaque(subscriptionRef))throw Error('missing references');
   const paymentResponse=await readJson('/payments/'+encodeURIComponent(paymentRef),{method:'GET'});const {status:paymentHttp,body:payment}=paymentResponse||{};
   if(paymentHttp!==200||!object(payment))throw Error('unconfirmed payment');
   const {id,subscription,status,deleted,paymentDate,clientPaymentDate,customer}=payment;
   if(id!==paymentRef||subscription!==subscriptionRef||!['PENDING','RECEIVED','CONFIRMED','OVERDUE','REFUNDED','RECEIVED_IN_CASH','REFUND_REQUESTED','REFUND_IN_PROGRESS','CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE','AWAITING_CHARGEBACK_REVERSAL','DUNNING_REQUESTED','DUNNING_RECEIVED','AWAITING_RISK_ANALYSIS'].includes(status)||typeof deleted!=='boolean')throw Error('unconfirmed payment reference/state');
   const paidCivil=civil(paymentDate),clientCivil=civil(clientPaymentDate);
   const subResponse=await readJson('/subscriptions/'+encodeURIComponent(subscriptionRef),{method:'GET'});const {status:subHttp,body:sub}=subResponse||{};
   if(subHttp!==200||!object(sub))throw Error('unconfirmed subscription');
   const {id:subId,status:subStatus,deleted:subDeleted,customer:subCustomer}=sub;
   if(subId!==subscriptionRef||!['ACTIVE','EXPIRED','INACTIVE'].includes(subStatus)||typeof subDeleted!=='boolean'||(customer!=null&&subCustomer!=null&&customer!==subCustomer))throw Error('unconfirmed subscription reference/state');
   // Two independent current reads are not an atomic provider snapshot or a funded period.
   return {source:'asaas_payment_and_subscription',paymentRefHash:hash(paymentRef),subscriptionRefHash:hash(subscriptionRef),paymentStatus:status,paymentDeleted:deleted,subscriptionStatus:subStatus,subscriptionDeleted:subDeleted,paymentDate:paidCivil,clientPaymentDate:clientCivil,orderingEstablished:false,atomicProviderSnapshot:false,entitlementDecision:'not_made'};
  }catch{throw fail('ASAAS_CURRENT_READ_UNCONFIRMED');}
 };
}

// Isolated positive-only probe for an already dispatched removal. No default
// credentials or transport. The injected reader must perform an authenticated,
// current GET without using a cache. Absence, suspension or inaccessibility
// leaves the earlier write uncertain.
export function createAsaasRemovedSubscriptionProbe({readJson}){
 if(typeof readJson!=='function')throw fail('ASAAS_CURRENT_READ_CONFIGURATION_REQUIRED');
 return async function probe({providerRef}={}){
  if(typeof providerRef!=='string'||!/^sub_[A-Za-z0-9_:-]{1,250}$/.test(providerRef))return null;
  const {status,body}=await readJson('/subscriptions/'+encodeURIComponent(providerRef),{method:'GET'})||{};
  if(status!==200||!object(body))return null;
  const {object:kind,id,deleted,status:subscriptionStatus}=body;
  if(kind!=='subscription'||id!==providerRef||deleted!==true||!['INACTIVE','EXPIRED'].includes(subscriptionStatus))return null;
  const contractHash=cancellationContractHash(providerRef);
  return {
   acknowledged:true,
   contractHash,
   evidenceHash:hash(JSON.stringify(['asaas_subscription_removal',contractHash,true])),
  };
 };
}
