// Unwired preparation. Dependencies must be trusted server adapters, never request fields.
// This module does not authenticate a provider, grant access, install schema or retry transport.
import {createHash} from 'node:crypto';
import {reserveBillingIntent,claimBillingIntent,recordBillingIntentOutcome} from './billing-contracting-intent.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=code=>Object.assign(new Error(code),{code,status:503});
function current(principal){try{return principal?.isCurrent?.()===true;}catch{return false;}}
function verifiedResult(provider,value){
 if(!value||typeof value!=='object')return null;
 // Read adapter fields once. Never validate one getter value and store another.
 const {providerRef,evidenceHash}=value;
 if(typeof evidenceHash!=='string'||!/^[a-f0-9]{64}$/.test(evidenceHash)||typeof providerRef!=='string')return null;
 if(provider==='google_play'?!/^[a-f0-9]{64}$/.test(providerRef):!/^sub_[A-Za-z0-9_:-]{1,250}$/.test(providerRef))return null;
 return {providerRef,evidenceHash};
}
export function createBillingAdmission({db,resolvePrincipal,transports}){
 if(!db||typeof resolvePrincipal!=='function'||!transports)throw fail('BILLING_ADMISSION_CONFIGURATION_REQUIRED');
 return async function admit(context,request){
  const principal=await resolvePrincipal(context);
  if(principal?.kind!=='main'||typeof principal.email!=='string'||!principal.email||typeof principal.publicId!=='string'||!principal.publicId||!current(principal))throw fail('BILLING_ADMISSION_AUTHORITY_REQUIRED');
  const {provider,plan,operationId}=request||{};
  if(!['asaas','google_play'].includes(provider)||typeof transports[provider]!=='function')throw fail('BILLING_ADMISSION_PROVIDER_UNAVAILABLE');
  const transport=transports[provider];
  // The request cannot choose the owner, session authority, adapter or evidence.
  const input={email:principal.email,expectedPublicId:principal.publicId,provider,plan,operationId};
  const reservation=await reserveBillingIntent(db,input);input.operationId=reservation.operationId;
  if(!current(principal))throw fail('BILLING_ADMISSION_AUTHORITY_REQUIRED');
  const admission=await claimBillingIntent(db,input);
  if(!admission.admitted)return {...admission,effectPerformed:false};
  // Revocation here keeps the occupied slot: it never means a safe retry/release.
  if(!current(principal))return {...admission,effectPerformed:false,reason:'authority_revoked'};
  let result,kind='uncertain';
  try{result=verifiedResult(provider,await transport(Object.freeze({...input})));if(result)kind='created';}catch{}
  const evidenceHash=kind==='created'?result.evidenceHash:hash(['transport_outcome_unconfirmed',input.operationId,provider]);
  const providerRef=kind==='created'?result.providerRef:undefined;
  try{
   const outcome=await recordBillingIntentOutcome(db,{...input,kind,providerRef,evidenceHash,receiptId:hash([input.operationId,provider,kind,evidenceHash,providerRef||null])});
   return {...outcome,effectPerformed:true};
  }catch{
   // No inferred rollback, state, retry, cancellation or provider success.
   throw Object.assign(fail('BILLING_ADMISSION_OUTCOME_UNCONFIRMED'),{operationId:input.operationId});
  }
 };
}
