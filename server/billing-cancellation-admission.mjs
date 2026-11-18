// Cancellation coordinates durable storage and trusted, injected provider evidence.
import {createHash} from 'node:crypto';
import {requireBillingPrincipal,billingAuthorityCurrent} from './billing-admission.mjs';
import {reserveCancellation,claimCancellation,readCancellationOperation,recordCancellationOutcome,applyCancellationOutcome,cancellationContractHash} from './billing-cancellation-intent.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const fail=code=>Object.assign(new Error(code),{code,status:503});
function current(principal){if(!billingAuthorityCurrent(principal))throw fail('BILLING_ADMISSION_AUTHORITY_REQUIRED');}
const publicView=row=>({operationId:row.operationId,state:row.state});
function evidence(value,ref){
 if(!value||typeof value!=='object')return null;
 // Snapshot once, including getters; provider payload and reference never enter receipts.
 const {acknowledged,contractHash,evidenceHash}=value;
 return acknowledged===true&&contractHash===cancellationContractHash(ref)&&digest(evidenceHash)?evidenceHash:null;
}
export function createCancellationAdmission({db,resolvePrincipal,transport,probe=async()=>null,expectedProviderRef}){
 if(!db||typeof resolvePrincipal!=='function'||typeof transport!=='function'||typeof probe!=='function')throw fail('CANCELLATION_ADMISSION_CONFIGURATION_REQUIRED');
 async function principalInput(context,request){
  const principal=await requireBillingPrincipal(resolvePrincipal,context),operationId=request?.operationId;
  if(!digest(operationId))throw fail('CANCELLATION_IDENTITY_REQUIRED');
  return {principal,input:{email:principal.email,expectedPublicId:principal.publicId,operationId}};
 }
 async function save(input,proof,source){
  const kind=proof?'acknowledged':'uncertain',evidenceHash=proof||hash(['unconfirmed',input.operationId,source]);
  try{return await recordCancellationOutcome(db,{...input,kind,source:proof?source:'transport_uncertain',evidenceHash,receiptId:hash([input.operationId,kind,source,evidenceHash])});}
  catch{throw fail('CANCELLATION_ADMISSION_OUTCOME_UNCONFIRMED');}
 }
 async function finish(principal,input){
  const assertCurrent=()=>current(principal);
  assertCurrent();
  const applied=await applyCancellationOutcome(db,input,{assertCurrent});
  assertCurrent();
  return publicView(applied);
 }
 return {
  async cancel(context,request){
   const {principal,input}=await principalInput(context,request);
   // An HTTP caller's prior read binds this operation to the same contract under lock.
   // The expected reference comes from the trusted adapter, never the request body.
   const reserved=await reserveCancellation(db,{...input,providerRef:expectedProviderRef});current(principal);
   if(reserved.alreadyRecorded)return {state:'already_recorded'};
   input.operationId=reserved.operationId;input.providerRef=reserved.providerRef;
   const admission=await claimCancellation(db,input);current(principal);
   if(!admission.admitted){
    if(admission.state==='acknowledged')return finish(principal,input);
    if(admission.state==='applied')return {...publicView(admission),state:'already_recorded'};
    return publicView(admission);
   }
   let proof=null;try{proof=evidence(await transport(Object.freeze({...input})),input.providerRef);}catch{}
   // Preserve immutable evidence even after revocation; never apply access changes for it.
   const recorded=await save(input,proof,'http_ack');current(principal);
   return proof?finish(principal,input):publicView(recorded);
  },
  async reconcile(context,request){
   const {principal,input}=await principalInput(context,request);
   const operation=await readCancellationOperation(db,input);current(principal);input.providerRef=operation.providerRef;
   if(operation.state==='acknowledged')return finish(principal,input);
   if(!['dispatching','uncertain'].includes(operation.state))return publicView(operation);
   let proof=null;try{proof=evidence(await probe(Object.freeze({...input})),input.providerRef);}catch{}
   // A negative/unknown probe never establishes that the earlier DELETE had no effect.
   if(!proof){current(principal);const latest=await readCancellationOperation(db,input);current(principal);return publicView(latest);}
   // As with transport ACK, keep verified evidence for the original immutable owner,
   // but a revoked caller cannot apply or receive a successful result.
   await save(input,proof,'provider_probe');current(principal);return finish(principal,input);
  },
 };
}
