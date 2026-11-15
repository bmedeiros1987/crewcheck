// Internal server-verified evidence only. No provider I/O, token storage or migration.
import {withProfileLocks} from './profile-locks.mjs';
const fail=(code,status=409)=>Object.assign(new Error(code),{code,status});
export async function writeVerifiedGoogleSubscription(db,input){
 const {email,expectedPublicId,verifiedPublicId,tokenHash,plan,productId,status,active,periodEnd,cancelAtPeriodEnd,providerRef,metadata,existingOnly=false}=input||{};
 if(typeof email!=='string'||!email||typeof expectedPublicId!=='string'||!expectedPublicId||expectedPublicId.length>24||typeof verifiedPublicId!=='string'||verifiedPublicId!==expectedPublicId||! /^[a-f0-9]{64}$/.test(tokenHash||''))throw fail('GOOGLE_OWNER_EVIDENCE_REQUIRED');
 if(!['premium_monthly','premium_annual'].includes(plan)||typeof productId!=='string'||!productId||!['active','grace_period','pending','past_due','paused','expired'].includes(status)||typeof active!=='boolean'||active!==['active','grace_period'].includes(status)||typeof cancelAtPeriodEnd!=='boolean'||typeof providerRef!=='string'||!providerRef||providerRef.length>180||!metadata||typeof metadata!=='object')throw fail('GOOGLE_VERIFIED_RECORD_INVALID',400);
 if(typeof periodEnd!=='string'||!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/.test(periodEnd)||!Number.isFinite(Date.parse(periodEnd.replace(' ','T')+'Z'))||new Date(periodEnd.replace(' ','T')+'Z').toISOString()!==periodEnd.replace(' ','T')+'Z'||(active&&Date.parse(periodEnd.replace(' ','T')+'Z')<=Date.now()))throw fail('GOOGLE_VERIFIED_RECORD_INVALID',400);
 // A unique token constraint is necessary even against writers not using this helper.
 const engines=await db.query("SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('crewcheck_platform_profiles','crewcheck_platform_subscriptions')");
 if(!['crewcheck_platform_profiles','crewcheck_platform_subscriptions'].every(name=>engines.rows.some(row=>row.name===name&&row.engine==='InnoDB')))throw fail('GOOGLE_TOKEN_SCHEMA_UNAVAILABLE',503);
 const indexes=await db.query("SELECT INDEX_NAME AS name,NON_UNIQUE AS non_unique,COLUMN_NAME AS column_name,SEQ_IN_INDEX AS position FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crewcheck_platform_subscriptions'");
 const groups=new Map();for(const row of indexes.rows){if(!groups.has(row.name))groups.set(row.name,[]);groups.get(row.name).push(row);}
 if(![...groups.values()].some(rows=>rows.length===1&&Number(rows[0].non_unique)===0&&rows[0].column_name==='purchase_token_hash'))throw fail('GOOGLE_TOKEN_SCHEMA_UNAVAILABLE',503);
 try{return await withProfileLocks(db,[email],async client=>{
  const profile=(await client.query('SELECT email,public_id,plan FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE',[email])).rows[0];
  if(!profile||profile.public_id!==expectedPublicId)throw fail('GOOGLE_ACCOUNT_MISMATCH');
  const current=(await client.query('SELECT * FROM crewcheck_platform_subscriptions WHERE email=$1 FOR UPDATE',[email])).rows;
  const linked=(await client.query('SELECT email FROM crewcheck_platform_subscriptions WHERE purchase_token_hash=$1 FOR UPDATE',[tokenHash])).rows;
  if(current.length>1||linked.length>1)throw fail('GOOGLE_OWNER_EVIDENCE_REQUIRED');
  if(linked.some(row=>row.email!==email))throw fail('PURCHASE_ALREADY_LINKED');
  const previous=current[0];
  if(previous&&(previous.provider!=='google_play'||previous.purchase_token_hash!==tokenHash))throw fail('BILLING_PROVIDER_RECONCILIATION_REQUIRED');
  if(!previous&&(existingOnly||profile.plan==='premium_unlimited'))throw fail('BILLING_PROVIDER_RECONCILIATION_REQUIRED');
  const values=[email,plan,status,productId,providerRef,tokenHash,periodEnd,cancelAtPeriodEnd,JSON.stringify(metadata)];
  if(previous)await client.query("UPDATE crewcheck_platform_subscriptions SET plan=$2,status=$3,product_id=$4,provider_ref=$5,current_period_end=$7,cancel_at_period_end=$8,metadata=$9,updated_at=CURRENT_TIMESTAMP(3) WHERE email=$1 AND provider='google_play' AND purchase_token_hash=$6",values);
  else await client.query("INSERT INTO crewcheck_platform_subscriptions(email,plan,status,provider,product_id,provider_ref,purchase_token_hash,current_period_end,cancel_at_period_end,metadata) VALUES($1,$2,$3,'google_play',$4,$5,$6,$7,$8,$9)",values);
  if(profile.plan!=='premium_unlimited')await client.query('UPDATE crewcheck_platform_profiles SET plan=$2,updated_at=NOW() WHERE email=$1',[email,active?plan:'free']);
  return {plan,status,active,cancelAtPeriodEnd};
 },{repeatableRead:true});}catch(error){if(error?.code==='ER_DUP_ENTRY')throw fail('PURCHASE_ALREADY_LINKED');
  // Shared transaction helper exhausted its single safe retry after confirmed rollback.
  // Contention alone does not prove this purchase belongs to another account.
  if(error?.code==='ER_LOCK_DEADLOCK')throw Object.assign(fail('GOOGLE_RECONCILIATION_BUSY',503),{message:'A conciliação está ocupada. O acesso ainda não foi confirmado; confira o status antes de tentar novamente.'});
  throw error;}
}
