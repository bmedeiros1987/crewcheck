// Isolated known-owner composition, not a configured receiver or unknown-event inbox.
// No provider I/O, raw purchase token, schema installation, timers or retention policy.
import {createHash} from 'node:crypto';
import {withProfileLocks,assertTransactionClient} from './profile-locks.mjs';
import {readLockedPlatformEntitlement} from './platform-entitlement.mjs';
import {requireGoogleSubscriptionSchema,writeVerifiedGoogleSubscriptionInTransaction,validateVerifiedGoogleSubscriptionRecord} from './google-subscription-write.mjs';
const fail=(code,status=409)=>Object.assign(new Error(code),{code,status});
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function googleStateObservationHash(sub){
 const metadata=sub?.metadata;if(!metadata||!digest(metadata.googleStateFence))return null;
 const end=sub.current_period_end instanceof Date?sub.current_period_end.toISOString():sub.current_period_end;
 return createHash('sha256').update(JSON.stringify([metadata.googleStateFence,sub.provider,sub.provider_ref,sub.purchase_token_hash,sub.plan,sub.status,sub.product_id,end,sub.cancel_at_period_end===true||Number(sub.cancel_at_period_end)===1,metadata.subscriptionState??null,metadata.acknowledgementState??null])).digest('hex');
}
function snapshot(input){
 const {eventId,payloadHash,subscription}=input||{};
 if(typeof eventId!=='string'||!/^[\x21-\x7e]{1,180}$/.test(eventId)||!digest(payloadHash)||!subscription)throw fail('GOOGLE_EVENT_EVIDENCE_REQUIRED');
 const {email,expectedPublicId,verifiedPublicId,tokenHash,plan,productId,status,active,periodEnd,cancelAtPeriodEnd,providerRef,metadata}=subscription;
 const {subscriptionState,acknowledgementState}=metadata||{};
 if(typeof subscriptionState!=='string'||!/^SUBSCRIPTION_STATE_[A-Z_]{1,64}$/.test(subscriptionState)||typeof acknowledgementState!=='string'||!/^ACKNOWLEDGEMENT_STATE_[A-Z_]{1,64}$/.test(acknowledgementState)||typeof email!=='string'||!email||typeof expectedPublicId!=='string'||!expectedPublicId||expectedPublicId.length>24||verifiedPublicId!==expectedPublicId||!digest(tokenHash))throw fail('GOOGLE_EVENT_EVIDENCE_REQUIRED');
 // Explicit allowlist: no client token/raw payload or metadata toJSON crosses persistence.
 const record=Object.freeze({email,expectedPublicId,verifiedPublicId,tokenHash,plan,productId,status,active,periodEnd,cancelAtPeriodEnd,providerRef,existingOnly:true,metadata:Object.freeze({subscriptionState,acknowledgementState})});
 validateVerifiedGoogleSubscriptionRecord(record);return Object.freeze({eventId,payloadHash,subscription:record});
}
export async function requireGoogleEventSchema(db){
 await requireGoogleSubscriptionSchema(db);
 const tables=(await db.query("SELECT ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crewcheck_platform_webhook_events'")).rows;
 const columns=(await db.query("SELECT COLUMN_NAME AS name,DATA_TYPE AS type,CHARACTER_MAXIMUM_LENGTH AS size,IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crewcheck_platform_webhook_events'")).rows;
 const indexes=(await db.query("SELECT INDEX_NAME AS name,NON_UNIQUE AS non_unique,COLUMN_NAME AS column_name,SEQ_IN_INDEX AS position FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crewcheck_platform_webhook_events'")).rows;
 const pk=indexes.filter(x=>x.name==='PRIMARY').sort((a,b)=>Number(a.position)-Number(b.position));
 if(tables.length!==1||tables[0].engine!=='InnoDB'||pk.length!==2||pk.some((x,i)=>Number(x.non_unique)!==0||x.column_name!==['provider','event_id'][i])||![['provider','varchar',40],['event_id','varchar',255],['payload_hash','char',64]].every(([name,type,size])=>columns.some(c=>c.name===name&&c.type===type&&Number(c.size)===size&&c.nullable==='NO')))throw fail('GOOGLE_EVENT_SCHEMA_UNAVAILABLE',503);
}
export async function commitVerifiedGoogleEvent(db,input){return commit(db,input,null);}
export async function commitObservedGoogleEvent(db,input){
 const fence=input?.expectedStateFence;if(!digest(fence))throw fail('GOOGLE_STATE_FENCE_REQUIRED');
 return commit(db,input,fence);
}
async function commit(db,input,expectedStateFence){
 const prepared=snapshot(input),sub=prepared.subscription;await requireGoogleEventSchema(db);
 try{return await withProfileLocks(db,[sub.email],async client=>{
  assertTransactionClient(client);
  const current=await readLockedPlatformEntitlement(client,sub);
  if(current.subscription?.provider!=='google_play'||current.subscription.purchase_token_hash!==sub.tokenHash)throw fail('BILLING_PROVIDER_RECONCILIATION_REQUIRED');
  const receipts=(await client.query("SELECT event_id,payload_hash FROM crewcheck_platform_webhook_events WHERE provider='google_play' AND event_id=$1 FOR UPDATE",[prepared.eventId])).rows;
  if(receipts.length){if(receipts.length!==1||receipts[0].event_id!==prepared.eventId||receipts[0].payload_hash!==prepared.payloadHash)throw fail('GOOGLE_EVENT_RECEIPT_CONFLICT');return {duplicate:true};}
  if(expectedStateFence!==null&&googleStateObservationHash(current.subscription)!==expectedStateFence)throw fail('GOOGLE_STATE_RECHECK_REQUIRED');
  const saved=await writeVerifiedGoogleSubscriptionInTransaction(client,sub);
  await client.query("INSERT INTO crewcheck_platform_webhook_events(provider,event_id,payload_hash) VALUES('google_play',$1,$2)",[prepared.eventId,prepared.payloadHash]);
  return {duplicate:false,active:saved.active};
 },{repeatableRead:true});}catch(error){
  if(error?.code==='ER_LOCK_DEADLOCK')throw fail('GOOGLE_EVENT_RECONCILIATION_BUSY',503);
  if(error?.code==='ER_DUP_ENTRY')throw fail('GOOGLE_EVENT_STORAGE_CONFLICT',503);
  throw error;
 }
}
