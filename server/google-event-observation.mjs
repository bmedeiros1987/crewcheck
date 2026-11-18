import {googleSubscriptionStatus} from './google-subscription-status.mjs';
// Known-owner observation protocol. Adapter is a trusted server dependency,
// never a source tag or normalized state supplied by the client/webhook body.
import {createHash,randomBytes} from 'node:crypto';
import {withProfileLocks} from './profile-locks.mjs';
import {readLockedPlatformEntitlement} from './platform-entitlement.mjs';
import {requireGoogleEventSchema,commitObservedGoogleEvent,googleStateObservationHash,hasGoogleEventReceipt} from './google-event-transaction.mjs';
import {createBillingVerificationFlight} from './billing-verification-flight.mjs';
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),fail=(code,status=503)=>Object.assign(new Error(code),{code,status});
function identity(value){const {email,expectedPublicId,tokenHash}=value||{};if(typeof email!=='string'||!email||typeof expectedPublicId!=='string'||!expectedPublicId||expectedPublicId.length>24||!digest(tokenHash))throw fail('GOOGLE_OBSERVATION_OWNER_REQUIRED');return Object.freeze({email,expectedPublicId,tokenHash});}
export async function captureGoogleStateFence(db,owner){return (await capture(db,owner,null)).fence;}
async function capture(db,owner,event){
 const known=identity(owner);await requireGoogleEventSchema(db);
 return withProfileLocks(db,[known.email],async client=>{
  const current=await readLockedPlatformEntitlement(client,known),sub=current.subscription;
  if(sub?.provider!=='google_play'||sub.purchase_token_hash!==known.tokenHash)throw fail('BILLING_PROVIDER_RECONCILIATION_REQUIRED');
  if(event&&await hasGoogleEventReceipt(client,event,true))return {duplicate:true};
  const metadata=sub.metadata??{};
  if(typeof metadata!=='object'||Array.isArray(metadata)||Object.keys(metadata).some(k=>!['subscriptionState','acknowledgementState','googleStateFence'].includes(k))||(metadata.subscriptionState!==undefined&&(typeof metadata.subscriptionState!=='string'||!/^SUBSCRIPTION_STATE_[A-Z_]{1,64}$/.test(metadata.subscriptionState)))||(metadata.acknowledgementState!==undefined&&(typeof metadata.acknowledgementState!=='string'||!/^ACKNOWLEDGEMENT_STATE_[A-Z_]{1,64}$/.test(metadata.acknowledgementState))))throw fail('GOOGLE_OBSERVATION_METADATA_UNCONFIRMED');
  if(metadata.googleStateFence!==undefined){if(!digest(metadata.googleStateFence))throw fail('GOOGLE_OBSERVATION_METADATA_UNCONFIRMED');return {fence:googleStateObservationHash(sub)};}
  // Legacy bootstrap changes no entitlement and installs no schema or expiry.
  const fence=randomBytes(32).toString('hex');await client.query("UPDATE crewcheck_platform_subscriptions SET metadata=$2,updated_at=NOW(3) WHERE email=$1 AND provider='google_play' AND purchase_token_hash=$3",[known.email,JSON.stringify({...metadata,googleStateFence:fence}),known.tokenHash]);return {fence:googleStateObservationHash({...sub,metadata:{...metadata,googleStateFence:fence}})};
 },{repeatableRead:true});
}
export function createGoogleEventObserver({db,verifyCurrent,verificationConcurrency,products}){
 if(!(products instanceof Map)||!products.size||[...products].some(([product,plan])=>typeof product!=='string'||!product||product.length>100||!['premium_monthly','premium_annual'].includes(plan)))throw fail('GOOGLE_OBSERVATION_CONFIGURATION_REQUIRED');
 const catalog=new Map(products);
 if(!db||typeof verifyCurrent!=='function')throw fail('GOOGLE_OBSERVATION_CONFIGURATION_REQUIRED');
 const flight=createBillingVerificationFlight({maxConcurrent:verificationConcurrency});
 return function observe(knownOwner,event,purchaseToken){
  const known=identity(knownOwner),{eventId,payloadHash}=event||{};
  if(typeof eventId!=='string'||!/^[\x21-\x7e]{1,180}$/.test(eventId)||!digest(payloadHash))throw fail('GOOGLE_EVENT_EVIDENCE_REQUIRED');
  const key=createHash('sha256').update(JSON.stringify([known,eventId,payloadHash])).digest('hex');
  return flight(key,async()=>{
   const captured=await capture(db,known,{eventId,payloadHash});if(captured.duplicate)return {duplicate:true};const fence=captured.fence;
   let subscription;
   try{
    const result=await verifyCurrent(known,purchaseToken),{source,subscription:record}=result||{};
    if(source!=='google_play_subscriptions_v2'||!record)throw Error('unverified source');
    // Read untrusted adapter fields once into an explicit bounded record.
    const {email,expectedPublicId,verifiedPublicId,tokenHash,plan,productId,status,active,periodEnd,cancelAtPeriodEnd,providerRef,metadata}=record;
    const {subscriptionState,acknowledgementState}=metadata||{};
    if(catalog.get(productId)!==plan||email!==known.email||expectedPublicId!==known.expectedPublicId||verifiedPublicId!==known.expectedPublicId||tokenHash!==known.tokenHash)throw Error('unverified owner');
    if(!['ACTIVE','IN_GRACE_PERIOD','CANCELED','PENDING','ON_HOLD','PAUSED','EXPIRED'].some(state=>subscriptionState==='SUBSCRIPTION_STATE_'+state))throw Error('unsupported authoritative state');
    const expiry=typeof periodEnd==='string'?new Date(periodEnd.replace(' ','T')+'Z'):null;
    const normalized=googleSubscriptionStatus(subscriptionState,expiry);
    if(normalized.status!==status||normalized.active!==active||normalized.cancelAtPeriodEnd!==cancelAtPeriodEnd)throw Error('incoherent authoritative state');
    subscription={email,expectedPublicId,verifiedPublicId,tokenHash,plan,productId,status,active,periodEnd,cancelAtPeriodEnd,providerRef,metadata:{subscriptionState,acknowledgementState}};
   }catch{throw fail('GOOGLE_OBSERVATION_STATE_UNCONFIRMED');}
   // No automatic read retry: a different local write requires another authoritative
   // observation, not application of an older result or a notification timestamp.
   return commitObservedGoogleEvent(db,{eventId,payloadHash,subscription,expectedStateFence:fence});
  });
 };
}
