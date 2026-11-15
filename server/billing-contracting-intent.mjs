// Isolated preparation only. No route, provider, timer, environment read or migration.
import { createHash } from 'node:crypto';
import { withTransaction, assertTransactionClient } from './profile-locks.mjs';
import { withPlatformEntitlements } from './platform-entitlement.mjs';
const INTENTS='crewcheck_billing_contracting_intents', EVIDENCE='crewcheck_billing_intent_evidence';
const columns={
 [INTENTS]:['operation_id','account_key','owner_digest','owner_email','owner_public_id','owner_redacted','provider','plan','state','active_slot','provider_ref','created_at','updated_at'],
 [EVIDENCE]:['receipt_id','operation_id','provider','kind','provider_ref','evidence_hash','recorded_at'],
};
const error=(code,status=409)=>Object.assign(new Error(code),{code,status});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const accountKey=input=>hash(input.email);
const ownerDigest=input=>hash([input.email,input.expectedPublicId]);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const reference=(provider,value)=>provider==='google_play'?digest(value):typeof value==='string'&&/^sub_[A-Za-z0-9_:-]{1,250}$/.test(value);
function identity(input){
 if(!input||typeof input.email!=='string'||!input.email||input.email.length>254||typeof input.expectedPublicId!=='string'||!input.expectedPublicId||input.expectedPublicId.length>24||!digest(input.operationId))throw error('BILLING_INTENT_IDENTITY_REQUIRED',400);
 return {email:input.email,expectedPublicId:input.expectedPublicId};
}
export async function inspectBillingIntentSchema(db){
 const missing=[];
 const found=await db.query('SELECT TABLE_NAME AS table_name,COLUMN_NAME AS column_name,DATA_TYPE AS data_type,CHARACTER_MAXIMUM_LENGTH AS max_length,IS_NULLABLE AS nullable,COLLATION_NAME AS collation_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ($1,$2)',[INTENTS,EVIDENCE]);
 const available=new Set(found.rows.map(row=>`${row.table_name}.${row.column_name}`));
 for(const [table,names] of Object.entries(columns))for(const name of names)if(!available.has(`${table}.${name}`))missing.push(`${table}.${name}`);
 const expected={
  [INTENTS]:{operation_id:['char',64,false],account_key:['char',64,false],owner_digest:['char',64,false],owner_email:['varchar',254,true],owner_public_id:['varchar',24,true],owner_redacted:['tinyint',null,false],provider:['varchar',20,false],plan:['varchar',40,false],state:['varchar',24,false],active_slot:['tinyint',null,false],provider_ref:['varchar',255,true],created_at:['datetime',null,false],updated_at:['datetime',null,false]},
  [EVIDENCE]:{receipt_id:['char',64,false],operation_id:['char',64,false],provider:['varchar',20,false],kind:['varchar',24,false],provider_ref:['varchar',255,true],evidence_hash:['char',64,false],recorded_at:['datetime',null,false]},
 };
 for(const [table,fields] of Object.entries(expected))for(const [name,[type,length,nullable]] of Object.entries(fields)){
  const row=found.rows.find(value=>value.table_name===table&&value.column_name===name);
  if(row&&(row.data_type!==type||(length!==null&&Number(row.max_length)!==length)||(row.nullable==='YES')!==nullable))missing.push(`${table}.${name}:type`);
  if(row&&['operation_id','account_key','owner_digest','receipt_id','provider_ref','evidence_hash'].includes(name)&&row.collation_name!=='ascii_bin')missing.push(`${table}.${name}:binary`);
 }
 const engines=await db.query('SELECT TABLE_NAME AS table_name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ($1,$2)',[INTENTS,EVIDENCE]);
 for(const table of Object.keys(columns))if(!engines.rows.some(row=>row.table_name===table&&row.engine==='InnoDB'))missing.push(`${table}:InnoDB`);
 const indexes=await db.query('SELECT TABLE_NAME AS table_name,INDEX_NAME AS index_name,NON_UNIQUE AS non_unique,COLUMN_NAME AS column_name,SEQ_IN_INDEX AS position FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ($1,$2)',[INTENTS,EVIDENCE]);
 for(const [table,name,names] of [[INTENTS,'PRIMARY',['operation_id']],[INTENTS,'billing_intent_open_owner_uq',['account_key','active_slot']],[INTENTS,'billing_intent_provider_ref_uq',['provider','provider_ref']],[EVIDENCE,'PRIMARY',['receipt_id']]]){
  const rows=indexes.rows.filter(row=>row.table_name===table&&row.index_name===name).sort((a,b)=>a.position-b.position);
  if(rows.some(row=>Number(row.non_unique)!==0)||rows.map(row=>row.column_name).join('|')!==names.join('|'))missing.push(`${table}:${name}`);
 }
 return {ready:missing.length===0,missing};
}
function storageFailure(cause){
 if(/^(BILLING_|ENTITLEMENT_)/.test(cause?.code||''))throw cause;
 if(cause?.code==='ER_DUP_ENTRY')throw error('BILLING_INTENT_STORAGE_CONFLICT');
 throw error('BILLING_INTENT_STORAGE_UNCERTAIN',503);
}
async function boundary(db,input,action){
 const owner=identity(input),schema=await inspectBillingIntentSchema(db);
 if(!schema.ready)throw error('BILLING_INTENT_SCHEMA_UNAVAILABLE',503);
 return withPlatformEntitlements(db,[owner],async(client,snapshots)=>action(client,snapshots.get(owner.email))).catch(storageFailure);
}
async function evidenceBoundary(db,input,action){
 identity(input);const schema=await inspectBillingIntentSchema(db);
 if(!schema.ready)throw error('BILLING_INTENT_SCHEMA_UNAVAILABLE',503);
 // Immutable operation ownership, not a recreated current profile. This can only
 // append evidence; it never grants access or changes a current subscription.
 return withTransaction(db,action,{repeatableRead:true}).catch(storageFailure);
}
function owned(row,input,allowRedacted=false){
 if(!row||row.account_key!==accountKey(input)||row.owner_digest!==ownerDigest(input))throw error('BILLING_INTENT_OWNER_MISMATCH');
 const redacted=Number(row.owner_redacted)===1;
 if(redacted?(!allowRedacted||row.owner_email!==null||row.owner_public_id!==null):(Number(row.owner_redacted)!==0||row.owner_email!==input.email||row.owner_public_id!==input.expectedPublicId))throw error('BILLING_INTENT_OWNER_MISMATCH');
 if(!digest(row.operation_id)||Number(row.active_slot)!==1||!['reserved','dispatching','uncertain','created','reconciliation_required'].includes(row.state)||!['asaas','google_play'].includes(row.provider)||!['premium_monthly','premium_annual'].includes(row.plan))throw error('BILLING_INTENT_RECORD_INVALID',503);
 if(row.state==='created'?!reference(row.provider,row.provider_ref):row.state==='reconciliation_required'?(row.provider_ref!==null&&!reference(row.provider,row.provider_ref)):row.provider_ref!=null)throw error('BILLING_INTENT_RECORD_INVALID',503);
 return row;
}
function view(row,reused=true){return {operationId:row.operation_id,provider:row.provider,plan:row.plan,state:row.state,reused};}
export async function reserveBillingIntent(db,input){
 if(!['asaas','google_play'].includes(input?.provider)||!['premium_monthly','premium_annual'].includes(input?.plan))throw error('BILLING_INTENT_PRODUCT_INVALID',400);
 return boundary(db,input,async(client,snapshot)=>{
  const byId=(await client.query(`SELECT * FROM ${INTENTS} WHERE operation_id=$1 FOR UPDATE`,[input.operationId])).rows[0];
  if(byId){owned(byId,input);if(byId.provider!==input.provider||byId.plan!==input.plan)throw error('BILLING_INTENT_REUSE_MISMATCH');return view(byId);}
  const existing=(await client.query(`SELECT * FROM ${INTENTS} WHERE account_key=$1 FOR UPDATE`,[accountKey(input)])).rows;
  if(existing.length){if(existing.length!==1)throw error('BILLING_INTENT_AMBIGUOUS');const row=owned(existing[0],input);if(row.provider!==input.provider||row.plan!==input.plan)throw error('BILLING_PROVIDER_RECONCILIATION_REQUIRED');return view(row);}
  // Existing provider evidence is never overwritten or interpreted as permission
  // to switch provider. Terminal-state reconciliation is a separate future gate.
  if(snapshot.billing.premiumAccess||snapshot.subscription)throw error('BILLING_PROVIDER_RECONCILIATION_REQUIRED');
  await client.query(`INSERT INTO ${INTENTS}(operation_id,account_key,owner_digest,owner_email,owner_public_id,provider,plan,state,active_slot) VALUES($1,$2,$3,$4,$5,$6,$7,'reserved',1)`,[input.operationId,accountKey(input),ownerDigest(input),input.email,input.expectedPublicId,input.provider,input.plan]);
  return {operationId:input.operationId,provider:input.provider,plan:input.plan,state:'reserved',reused:false};
 });
}
// Internal read-only lookup: an unknown operation must never be reserved/adopted.
export async function readOwnedBillingIntent(db,input){
 return boundary(db,input,async client=>view(owned((await client.query(`SELECT * FROM ${INTENTS} WHERE operation_id=$1 FOR UPDATE`,[input.operationId])).rows[0],input)));
}
export async function claimBillingIntent(db,input){
 return boundary(db,input,async(client,snapshot)=>{
  const row=owned((await client.query(`SELECT * FROM ${INTENTS} WHERE operation_id=$1 FOR UPDATE`,[input.operationId])).rows[0],input);
  if(row.state!=='reserved')return {...view(row),admitted:false};
  if(snapshot.billing.premiumAccess||snapshot.subscription)throw error('BILLING_PROVIDER_RECONCILIATION_REQUIRED');
  await client.query(`UPDATE ${INTENTS} SET state='dispatching' WHERE operation_id=$1`,[input.operationId]);
  return {...view({...row,state:'dispatching'}),admitted:true};
 });
}
export async function recordBillingIntentOutcome(db,input){
 const created=input?.kind==='created';
 if(!['created','uncertain'].includes(input?.kind)||!digest(input.receiptId)||!digest(input.evidenceHash)||(!created&&input.providerRef!=null)||(input.provider!==undefined&&!['asaas','google_play'].includes(input.provider)))throw error('BILLING_INTENT_EVIDENCE_INVALID',400);
 return evidenceBoundary(db,input,async(client)=>{
  const row=owned((await client.query(`SELECT * FROM ${INTENTS} WHERE operation_id=$1 FOR UPDATE`,[input.operationId])).rows[0],input,true);
  const provider=input.provider||row.provider;
  if(created&&!reference(provider,input.providerRef))throw error('BILLING_INTENT_REFERENCE_INVALID',400);
  if(row.state==='reserved')throw error('BILLING_INTENT_TRANSITION_INVALID');
  const old=(await client.query(`SELECT * FROM ${EVIDENCE} WHERE receipt_id=$1 FOR UPDATE`,[input.receiptId])).rows[0];
  if(old){if(old.operation_id!==input.operationId||old.provider!==provider||old.kind!==input.kind||old.evidence_hash!==input.evidenceHash||(old.provider_ref||null)!==(input.providerRef||null))throw error('BILLING_INTENT_RECEIPT_CONFLICT');return view(row);}
  let conflict=provider!==row.provider||row.state==='reconciliation_required'||(created&&row.provider_ref!==null&&row.provider_ref!==input.providerRef);
  if(created&&!conflict){
   const claimed=await client.query(`SELECT operation_id FROM ${INTENTS} WHERE provider=$1 AND provider_ref=$2 FOR UPDATE`,[provider,input.providerRef]);
   if(claimed.rows.some(value=>value.operation_id!==input.operationId))conflict=true;
  }
  // Preserve every admitted, owner-bound outcome before changing the operation.
  // A conflict is evidence for reconciliation, never permission to switch provider.
  await client.query(`INSERT INTO ${EVIDENCE}(receipt_id,operation_id,provider,kind,provider_ref,evidence_hash) VALUES($1,$2,$3,$4,$5,$6)`,[input.receiptId,input.operationId,provider,input.kind,input.providerRef||null,input.evidenceHash]);
  const next=conflict?'reconciliation_required':created?'created':row.state==='created'?'created':'uncertain';
  const ref=conflict||!created?row.provider_ref:input.providerRef;
  await client.query(`UPDATE ${INTENTS} SET state=$2,provider_ref=$3 WHERE operation_id=$1`,[input.operationId,next,ref]);
  return view({...row,state:next,provider_ref:ref});
 });
}

// Caller must already hold this profile lock in the SAME account-deletion
// transaction. No separate connection or commit is introduced here.
export async function redactBillingIntentOwner(client,owner){
 assertTransactionClient(client);
 identity({...owner,operationId:'0'.repeat(64)});
 const profile=(await client.query('SELECT email,public_id FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE',[owner.email])).rows[0];
 if(!profile||profile.email!==owner.email||profile.public_id!==owner.expectedPublicId)throw error('BILLING_INTENT_OWNER_MISMATCH');
 const rows=(await client.query(`SELECT * FROM ${INTENTS} WHERE account_key=$1 FOR UPDATE`,[accountKey(owner)])).rows;
 for(const row of rows){
  owned(row,{...owner,operationId:row.operation_id});
  await client.query(`UPDATE ${INTENTS} SET owner_email=NULL,owner_public_id=NULL,owner_redacted=1 WHERE operation_id=$1`,[row.operation_id]);
 }
 return {redacted:rows.length};
}
