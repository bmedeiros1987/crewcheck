import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createGoogleCurrentReadAdapter} from '../server/billing-current-read-adapters.mjs';
import {createGooglePaidPeriodObservation} from '../server/google-paid-period-observation.mjs';
const token='SYNTHETIC_TOKEN',known={email:'synthetic@example.invalid',expectedPublicId:'SYNTHETIC_OWNER',tokenHash:createHash('sha256').update(token).digest('hex')};let count=0;
function fixture(){return {current:{lineItems:[{productId:'synthetic.monthly',expiryTime:'2032-11-01T00:00:00.000Z',latestSuccessfulOrderId:'GPA.SYNTHETIC',autoRenewingPlan:{autoRenewEnabled:false}}],subscriptionState:'SUBSCRIPTION_STATE_CANCELED',acknowledgementState:'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',externalAccountIdentifiers:{obfuscatedExternalAccountId:known.expectedPublicId},etag:'synthetic-etag'},order:{orderId:'GPA.SYNTHETIC',purchaseToken:token,state:'PROCESSED',total:{currencyCode:'BRL',units:'12',nanos:0},lineItems:[{productId:'synthetic.monthly',total:{currencyCode:'BRL',units:'12',nanos:0},subscriptionDetails:{basePlanId:'synthetic-base',offerPhaseDetails:{baseDetails:{}},servicePeriodStartTime:'2032-10-01T00:00:00.000Z',servicePeriodEndTime:'2032-11-01T00:00:00.000Z'}}]}};}
async function run(change=()=>{},reject=false){const f=fixture();change(f);let reads=0;const current=createGoogleCurrentReadAdapter({packageName:'com.synthetic.app',expectedPlanType:'autoRenewingPlan',products:new Map([['synthetic.monthly','premium_monthly']]),readJson:async()=>({status:200,body:f.current})});const observe=createGooglePaidPeriodObservation({readCurrent:current,readOrder:async ref=>{reads++;assert.equal(ref,'GPA.SYNTHETIC');return {status:200,body:f.order};}});const promise=observe({purchaseToken:token,known});if(reject){await assert.rejects(promise,{code:'GOOGLE_PAID_PERIOD_UNCONFIRMED'});count++;return;}const result=await promise;assert.equal(reads,1);assert.equal(result.entitlementDecision,'not_made');assert.equal(result.atomicProviderSnapshot,false);assert(!JSON.stringify(result).includes(token));assert(!JSON.stringify(result).includes(known.email));count++;return result;}
assert.equal((await run()).matchingAccountingPeriod,true);
assert.equal((await run(f=>f.current.lineItems[0].expiryTime='2032-11-08T00:00:00.000Z')).matchingAccountingPeriod,false);
for(const state of ['PENDING','CANCELED','PENDING_REFUND','PARTIALLY_REFUNDED','REFUNDED'])await run(f=>f.order.state=state,true);
await run(f=>f.order.purchaseToken='OTHER',true);await run(f=>f.order.orderId='OTHER',true);
await run(f=>f.order.lineItems[0].productId='OTHER',true);
await run(f=>f.order.lineItems.push(structuredClone(f.order.lineItems[0])),true);
for(const phase of [{freeTrialDetails:{}},{introductoryPriceDetails:{}},{prorationPeriodDetails:{}},{baseDetails:{},freeTrialDetails:{}}])await run(f=>f.order.lineItems[0].subscriptionDetails.offerPhaseDetails=phase,true);
await run(f=>f.order.total.units='0',true);await run(f=>f.order.lineItems[0].total.nanos=-1,true);
await run(f=>f.order.lineItems[0].subscriptionDetails.servicePeriodEndTime='2032-02-30T00:00:00.000Z',true);
await run(f=>f.current.externalAccountIdentifiers.obfuscatedExternalAccountId='OTHER_OWNER',true);
console.log(`PASS ${count} synthetic Google order/current-state cross-checks; no actual provider, entitlement proof or access mutation`);
