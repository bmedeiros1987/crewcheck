// Unwired proposal. No provider client, secret, timer, automatic retry or schema installation.
import {createHash} from 'node:crypto';
import {withTransaction} from './profile-locks.mjs';
import {withPlatformEntitlements} from './platform-entitlement.mjs';
import {readOwnedBillingCancellation,applyAcknowledgedAsaasCancellation} from './billing-cancellation.mjs';
const I='crewcheck_billing_cancellation_intents',E='crewcheck_billing_cancellation_evidence';
export const cancellationContractHash=ref=>hash(['asaas',ref]);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),fail=(code,status=409)=>Object.assign(new Error(code),{code,status});
const account=x=>hash(x.email),owner=x=>hash([x.email,x.expectedPublicId]);
function identity(x){if(!x||typeof x.email!=='string'||!x.email||x.email.length>254||typeof x.expectedPublicId!=='string'||!x.expectedPublicId||x.expectedPublicId.length>24||!digest(x.operationId))throw fail('CANCELLATION_IDENTITY_REQUIRED');}
const view=row=>({operationId:row.operation_id,state:row.state});
function owned(row,input){
 if(!row||row.account_key!==account(input)||row.owner_digest!==owner(input))throw fail('CANCELLATION_OWNER_MISMATCH');
 if(!digest(row.operation_id)||!digest(row.contract_hash)||!['reserved','dispatching','uncertain','acknowledged','applied','reconciliation_required'].includes(row.state))throw fail('CANCELLATION_RECORD_INVALID',503);
 if(input.providerRef!==undefined&&row.contract_hash!==cancellationContractHash(input.providerRef))throw fail('CANCELLATION_CONTRACT_MISMATCH');return row;
}
export async function inspectCancellationIntentSchema(db){
 const required={ [I]:{operation_id:['char',64],account_key:['char',64],owner_digest:['char',64],contract_hash:['char',64],state:['varchar',24],created_at:['datetime',null],updated_at:['datetime',null]},[E]:{receipt_id:['char',64],operation_id:['char',64],kind:['varchar',20],source:['varchar',24],evidence_hash:['char',64],recorded_at:['datetime',null]}};
 const rows=(await db.query('SELECT TABLE_NAME AS table_name,COLUMN_NAME AS name,DATA_TYPE AS type,CHARACTER_MAXIMUM_LENGTH AS size,IS_NULLABLE AS nullable,COLLATION_NAME AS collation_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ($1,$2)',[I,E])).rows;
 let ready=true;for(const [table,fields]of Object.entries(required))for(const [name,[type,size]]of Object.entries(fields)){const r=rows.find(x=>x.table_name===table&&x.name===name);if(!r||r.type!==type||(size!==null&&Number(r.size)!==size)||r.nullable!=='NO'||(type==='char'&&r.collation_name!=='ascii_bin'))ready=false;}
 const tables=(await db.query('SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ($1,$2,$3,$4)',[I,E,'crewcheck_platform_profiles','crewcheck_platform_subscriptions'])).rows;
 for(const name of [I,E,'crewcheck_platform_profiles','crewcheck_platform_subscriptions'])if(!tables.some(t=>t.name===name&&t.engine==='InnoDB'))ready=false;
 const indexes=(await db.query('SELECT TABLE_NAME AS table_name,INDEX_NAME AS name,NON_UNIQUE AS non_unique,COLUMN_NAME AS column_name,SEQ_IN_INDEX AS position FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ($1,$2)',[I,E])).rows;
 for(const [table,name,column]of [[I,'PRIMARY','operation_id'],[I,'cancellation_contract_uq','contract_hash'],[E,'PRIMARY','receipt_id']]){const ix=indexes.filter(x=>x.table_name===table&&x.name===name);if(ix.length!==1||Number(ix[0].non_unique)!==0||ix[0].column_name!==column)ready=false;}
 return {ready};
}
async function schema(db,input){identity(input);if(!(await inspectCancellationIntentSchema(db)).ready)throw fail('CANCELLATION_SCHEMA_UNAVAILABLE',503);}
const wrap=async action=>{try{return await action();}catch(e){if(e?.code?.startsWith('CANCELLATION_')||e?.code?.startsWith('BILLING_')||e?.code?.startsWith('ENTITLEMENT_'))throw e;throw fail('CANCELLATION_STORAGE_UNCERTAIN',503);}};
async function boundary(db,input,action){await schema(db,input);return wrap(()=>withPlatformEntitlements(db,[input],client=>action(client)));}
export async function reserveCancellation(db,input){return boundary(db,input,async client=>{
 const current=await readOwnedBillingCancellation(client,input);
 if(current.provider!=='asaas')throw fail('CANCELLATION_CONTRACT_MISMATCH');
 const contract=cancellationContractHash(current.providerRef),byId=(await client.query(`SELECT * FROM ${I} WHERE operation_id=$1 FOR UPDATE`,[input.operationId])).rows[0];
 if(byId){owned(byId,{...input,providerRef:current.providerRef});return {...view(byId),providerRef:current.providerRef};}
 const existing=(await client.query(`SELECT * FROM ${I} WHERE contract_hash=$1 FOR UPDATE`,[contract])).rows;
 if(existing.length){if(existing.length!==1)throw fail('CANCELLATION_RECORD_INVALID');const row=owned(existing[0],{...input,providerRef:current.providerRef});return {...view(row),providerRef:current.providerRef};}
 if(current.cancelAtPeriodEnd)return {state:'already_recorded',alreadyRecorded:true};
 await client.query(`INSERT INTO ${I}(operation_id,account_key,owner_digest,contract_hash,state) VALUES($1,$2,$3,$4,'reserved')`,[input.operationId,account(input),owner(input),contract]);
 return {operationId:input.operationId,state:'reserved',providerRef:current.providerRef};
});}
export async function claimCancellation(db,input){return boundary(db,input,async client=>{
 const row=owned((await client.query(`SELECT * FROM ${I} WHERE operation_id=$1 FOR UPDATE`,[input.operationId])).rows[0],input);
 if(row.state!=='reserved')return {...view(row),admitted:false};
 const current=await readOwnedBillingCancellation(client,input);
 if(current.provider!=='asaas'||cancellationContractHash(current.providerRef)!==row.contract_hash)throw fail('CANCELLATION_CONTRACT_MISMATCH');
 if(current.cancelAtPeriodEnd){await client.query(`UPDATE ${I} SET state='reconciliation_required' WHERE operation_id=$1`,[input.operationId]);return {...view(row),state:'reconciliation_required',admitted:false};}
 await client.query(`UPDATE ${I} SET state='dispatching' WHERE operation_id=$1`,[input.operationId]);return {...view(row),state:'dispatching',admitted:true};
});}
export async function readCancellationOperation(db,input){return boundary(db,input,async client=>{
 const row=owned((await client.query(`SELECT * FROM ${I} WHERE operation_id=$1 FOR UPDATE`,[input.operationId])).rows[0],input),current=await readOwnedBillingCancellation(client,input);
 if(current.provider!=='asaas'||cancellationContractHash(current.providerRef)!==row.contract_hash)throw fail('CANCELLATION_CONTRACT_MISMATCH');
 return {...view(row),providerRef:current.providerRef};
});}
export async function recordCancellationOutcome(db,input){
 await schema(db,input);
 if(!digest(input.receiptId)||!digest(input.evidenceHash)||!['acknowledged','uncertain'].includes(input.kind)||!['http_ack','provider_probe','transport_uncertain'].includes(input.source)||(input.kind==='acknowledged'&&input.source==='transport_uncertain'))throw fail('CANCELLATION_EVIDENCE_INVALID');
 return wrap(()=>withTransaction(db,async client=>{
  const row=owned((await client.query(`SELECT * FROM ${I} WHERE operation_id=$1 FOR UPDATE`,[input.operationId])).rows[0],input);if(row.state==='reserved')throw fail('CANCELLATION_TRANSITION_INVALID');
  const previous=(await client.query(`SELECT * FROM ${E} WHERE receipt_id=$1 FOR UPDATE`,[input.receiptId])).rows[0];
  if(previous){if(previous.operation_id!==input.operationId||previous.kind!==input.kind||previous.source!==input.source||previous.evidence_hash!==input.evidenceHash)throw fail('CANCELLATION_RECEIPT_CONFLICT');return view(row);}
  await client.query(`INSERT INTO ${E}(receipt_id,operation_id,kind,source,evidence_hash) VALUES($1,$2,$3,$4,$5)`,[input.receiptId,input.operationId,input.kind,input.source,input.evidenceHash]);
  const state=['applied','reconciliation_required'].includes(row.state)?row.state:input.kind==='acknowledged'?'acknowledged':row.state==='acknowledged'?'acknowledged':'uncertain';
  await client.query(`UPDATE ${I} SET state=$2 WHERE operation_id=$1`,[input.operationId,state]);return {...view(row),state};
 },{repeatableRead:true}));
}
export async function applyCancellationOutcome(db,input){return boundary(db,input,async client=>{
 const row=owned((await client.query(`SELECT * FROM ${I} WHERE operation_id=$1 FOR UPDATE`,[input.operationId])).rows[0],input);
 if(row.state==='applied')return {...view(row),alreadyApplied:true};
 if(row.state!=='acknowledged')return {...view(row),localApplied:false};
 const proof=(await client.query(`SELECT receipt_id FROM ${E} WHERE operation_id=$1 AND kind='acknowledged' LIMIT 1`,[input.operationId])).rows;if(!proof.length)throw fail('CANCELLATION_EVIDENCE_INVALID');
 const current=await readOwnedBillingCancellation(client,input);
 if(current.provider!=='asaas'||cancellationContractHash(current.providerRef)!==row.contract_hash){await client.query(`UPDATE ${I} SET state='reconciliation_required' WHERE operation_id=$1`,[input.operationId]);return {...view(row),state:'reconciliation_required',localApplied:false};}
 const applied=await applyAcknowledgedAsaasCancellation(client,{...input,providerRef:current.providerRef});
 await client.query(`UPDATE ${I} SET state='applied' WHERE operation_id=$1`,[input.operationId]);return {...view(row),state:'applied',localApplied:true,...applied};
});}
