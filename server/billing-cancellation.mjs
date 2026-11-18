// Server-owned cancellation reconciliation; no provider I/O, token storage or schema writes.
import {withPlatformEntitlements,readLockedPlatformEntitlement} from './platform-entitlement.mjs';
import {assertTransactionClient} from './profile-locks.mjs';
const fail=(code,status=409)=>Object.assign(new Error('Não foi possível conciliar esta assinatura. Confira o status antes de tentar novamente.'),{code,status});
const paidStatuses=new Set(['active','trialing','grace_period']);
function endUtc(value){
 if(value==null)return null;
 if(value instanceof Date){if(Number.isFinite(value.getTime()))return value.toISOString();throw fail('BILLING_CANCELLATION_PERIOD_UNCONFIRMED');}
 if(typeof value!=='string')throw fail('BILLING_CANCELLATION_PERIOD_UNCONFIRMED');
 const sql=value.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?$/);
 const iso=sql?sql[1].replace(' ','T')+'.'+(sql[2]||'').padEnd(3,'0')+'Z':value;
 const date=new Date(iso);
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(iso)||!Number.isFinite(date.getTime())||date.toISOString()!==iso)throw fail('BILLING_CANCELLATION_PERIOD_UNCONFIRMED');
 return iso;
}
async function ownedSnapshot(client,snapshot,email,now){
 const row=snapshot.subscription;
 if(!row)throw fail('BILLING_CANCELLATION_SUBSCRIPTION_MISSING',404);
 if(row.provider==='google_play')return {provider:'google_play',productId:row.product_id||''};
 if(row.provider!=='asaas'||typeof row.provider_ref!=='string'||!/^sub_[A-Za-z0-9_:-]{1,250}$/.test(row.provider_ref))throw fail('BILLING_CANCELLATION_RECONCILIATION_REQUIRED');
 if(!['premium_monthly','premium_annual'].includes(row.plan)||!['active','trialing','grace_period','pending','past_due','refunded','canceled','cancelled','expired','paused'].includes(row.status))throw fail('BILLING_CANCELLATION_RECONCILIATION_REQUIRED');
 const owners=(await client.query("SELECT email FROM crewcheck_platform_subscriptions WHERE provider='asaas' AND provider_ref=$1 FOR UPDATE",[row.provider_ref])).rows;
 if(owners.length!==1||owners[0].email!==email)throw fail('BILLING_CANCELLATION_RECONCILIATION_REQUIRED');
 const periodEnd=endUtc(row.current_period_end);
 if(paidStatuses.has(row.status)&&!periodEnd)throw fail('BILLING_CANCELLATION_PERIOD_UNCONFIRMED');
 if(!Number.isFinite(now))throw fail('BILLING_CANCELLATION_PERIOD_UNCONFIRMED');
 return {provider:'asaas',providerRef:row.provider_ref,currentPeriodEnd:periodEnd,keepsPaidAccess:paidStatuses.has(row.status)&&Date.parse(periodEnd)>now,cancelAtPeriodEnd:row.cancel_at_period_end===true||Number(row.cancel_at_period_end)===1};
}
async function requireTransactionalSchema(db){
 const tables=(await db.query("SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('crewcheck_platform_profiles','crewcheck_platform_subscriptions')")).rows;
 if(!['crewcheck_platform_profiles','crewcheck_platform_subscriptions'].every(name=>tables.some(row=>row.name===name&&row.engine==='InnoDB')))throw fail('BILLING_CANCELLATION_SCHEMA_UNAVAILABLE',503);
}
// Internal helpers require the same live transaction client, never a pool/escaped client.
export async function readOwnedBillingCancellation(client,owner,{now=Date.now()}={}){
 assertTransactionClient(client);
 const snapshot=await readLockedPlatformEntitlement(client,owner);
 return ownedSnapshot(client,snapshot,owner.email,now);
}
export async function applyAcknowledgedAsaasCancellation(client,input,{now=Date.now(),assertCurrent=()=>{}}={}){
 assertTransactionClient(client);
 const snapshot=await readLockedPlatformEntitlement(client,input),current=await ownedSnapshot(client,snapshot,input.email,now);
 if(current.provider!=='asaas'||current.providerRef!==input.providerRef)throw fail('BILLING_CANCELLATION_RECONCILIATION_REQUIRED');
 const status=paidStatuses.has(snapshot.subscription.status)&&!current.keepsPaidAccess?'expired':snapshot.subscription.status;
 assertCurrent();
 await client.query("UPDATE crewcheck_platform_subscriptions SET status=$3,cancel_at_period_end=TRUE,updated_at=NOW(3) WHERE email=$1 AND provider='asaas' AND provider_ref=$2",[input.email,input.providerRef,status]);
 if(!current.keepsPaidAccess&&snapshot.profile.plan!=='premium_unlimited')await client.query("UPDATE crewcheck_platform_profiles SET plan='free',updated_at=NOW(3) WHERE email=$1",[input.email]);
 return {canceled:true,currentPeriodEnd:current.currentPeriodEnd,keepsPaidAccess:current.keepsPaidAccess};
}
export async function readBillingCancellation(db,owner,options={}){
 await requireTransactionalSchema(db);
 return withPlatformEntitlements(db,[owner],client=>readOwnedBillingCancellation(client,owner,options));
}
export async function commitAcknowledgedAsaasCancellation(db,input,options={}){
 await requireTransactionalSchema(db);
 return withPlatformEntitlements(db,[input],client=>applyAcknowledgedAsaasCancellation(client,input,options));
}
