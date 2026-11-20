// Unwired preparation: no HTTP/native route, real auth/provider adapter or token storage.
import {createHash} from 'node:crypto';
import {createBillingVerificationFlight} from './billing-verification-flight.mjs';
import {requireBillingPrincipal,billingAuthorityCurrent,prepareBillingAdmission} from './billing-admission.mjs';
import {readOwnedBillingIntent,recordBillingIntentOutcome} from './billing-contracting-intent.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>Object.assign(new Error(code),{code,status:503});
export function createGoogleAsyncAdmission({db,resolvePrincipal,verifyPurchase,verifyLaunchBinding,products,verificationConcurrency}){
 if(!db||typeof resolvePrincipal!=='function'||typeof verifyPurchase!=='function'||typeof verifyLaunchBinding!=='function'||!(products instanceof Map))throw fail('GOOGLE_ASYNC_CONFIGURATION_REQUIRED');
 const runVerification=createBillingVerificationFlight({maxConcurrent:verificationConcurrency});
 const catalog=new Map(products);
 if(!catalog.size||[...catalog].some(([product,plan])=>typeof product!=='string'||!product||!['premium_monthly','premium_annual'].includes(plan)))throw fail('GOOGLE_ASYNC_CONFIGURATION_REQUIRED');
 return {
  async begin(context,request){
   const principal=await requireBillingPrincipal(resolvePrincipal,context);
   if(![...catalog.values()].includes(request?.plan))throw fail('GOOGLE_ASYNC_CORRELATION_REQUIRED');
   const {admission,authorized}=await prepareBillingAdmission(db,principal,{operationId:request?.operationId,provider:'google_play',plan:request?.plan});
   // This authorizes one simulated/native launch, not payment, delivery or access.
   return {...admission,launchAuthorized:authorized};
  },
  async complete(context,request){
   const principal=await requireBillingPrincipal(resolvePrincipal,context);
   const operationId=request?.operationId,purchaseToken=request?.purchaseToken;
   if(typeof operationId!=='string'||!/^[a-f0-9]{64}$/.test(operationId)||typeof purchaseToken!=='string'||!purchaseToken||purchaseToken.length>5000)throw fail('GOOGLE_ASYNC_CORRELATION_REQUIRED');
   const input={email:principal.email,expectedPublicId:principal.publicId,operationId,provider:'google_play'};
   const publicResult=operation=>({operationId:operation.operationId,provider:operation.provider,plan:operation.plan,state:operation.state,referenceRecorded:operation.state==='created'});
   const check=operation=>{
    if(operation.provider!=='google_play'||!['dispatching','uncertain','created'].includes(operation.state))throw fail('GOOGLE_ASYNC_CORRELATION_REQUIRED');
   };
   const tokenHash=digest(purchaseToken),observed=await readOwnedBillingIntent(db,input);check(observed);
   if(!billingAuthorityCurrent(principal))throw fail('BILLING_ADMISSION_AUTHORITY_REQUIRED');
   // A client echo/account/profile match is not proof of the native launch's origin.
   // This trusted adapter is deliberately not implemented/configured for real Google.
   let bindingHash;
   try{
    const binding=await verifyLaunchBinding(Object.freeze({operationId,publicId:principal.publicId,tokenHash,plan:observed.plan}));
    const {source,operationId:boundOperation,publicId:boundOwner,tokenHash:boundToken,evidenceHash}=binding||{};
    if(source!=='verified_native_provider_binding'||boundOperation!==operationId||boundOwner!==principal.publicId||boundToken!==tokenHash||typeof evidenceHash!=='string'||!/^[a-f0-9]{64}$/.test(evidenceHash))throw Error('unbound');
    bindingHash=evidenceHash;
   }catch{throw fail('GOOGLE_ASYNC_LAUNCH_ORIGIN_UNCONFIRMED');}
   if(!billingAuthorityCurrent(principal))throw fail('BILLING_ADMISSION_AUTHORITY_REQUIRED');
   // This is durable correlation evidence, never a cached current payment status.
   const boundOperation=await readOwnedBillingIntent(db,input);check(boundOperation);
   if(!billingAuthorityCurrent(principal))throw fail('BILLING_ADMISSION_AUTHORITY_REQUIRED');
   if(boundOperation.state==='created'&&boundOperation.referenceHash===tokenHash)return {...publicResult(boundOperation),duplicate:true};
   const key=digest(JSON.stringify([principal.email,principal.publicId,operationId,tokenHash]));
   await runVerification(key,async()=>{
    // A waiter may have observed dispatching before an earlier flight committed.
    const operation=await readOwnedBillingIntent(db,input);check(operation);
    if(operation.state==='created'&&operation.referenceHash===tokenHash)return;
    if(!billingAuthorityCurrent(principal))throw fail('BILLING_ADMISSION_AUTHORITY_REQUIRED');
    let verified;
    try{
     const result=await verifyPurchase(Object.freeze({purchaseToken,plan:operation.plan}));
     const {productId,publicId,tokenHash:verifiedTokenHash,evidenceHash}=result||{};
     if(typeof productId!=='string'||catalog.get(productId)!==operation.plan||typeof publicId!=='string'||publicId!==principal.publicId||typeof verifiedTokenHash!=='string'||verifiedTokenHash!==tokenHash||typeof evidenceHash!=='string'||!/^[a-f0-9]{64}$/.test(evidenceHash))throw Error('invalid');
     verified={tokenHash:verifiedTokenHash,evidenceHash:digest(JSON.stringify([evidenceHash,bindingHash]))};
    }catch{throw fail('GOOGLE_ASYNC_VERIFICATION_UNCONFIRMED');}
    if(!billingAuthorityCurrent(principal))throw fail('BILLING_ADMISSION_AUTHORITY_REQUIRED');
    // Recheck the profile after provider verification; never adopt a recreated account.
    await readOwnedBillingIntent(db,input);
    if(!billingAuthorityCurrent(principal))throw fail('BILLING_ADMISSION_AUTHORITY_REQUIRED');
    try{await recordBillingIntentOutcome(db,{...input,kind:'created',providerRef:verified.tokenHash,evidenceHash:verified.evidenceHash,receiptId:digest(JSON.stringify([operationId,'google_play',verified.tokenHash,verified.evidenceHash]))});}
    catch{throw Object.assign(fail('GOOGLE_ASYNC_OUTCOME_UNCONFIRMED'),{operationId});}
   });
   // Each caller retains its own authority, even if it shared another caller's flight.
   if(!billingAuthorityCurrent(principal))throw fail('BILLING_ADMISSION_AUTHORITY_REQUIRED');
   const finalOperation=await readOwnedBillingIntent(db,input);
   if(!billingAuthorityCurrent(principal))throw fail('BILLING_ADMISSION_AUTHORITY_REQUIRED');
   return publicResult(finalOperation);
  },
 };
}
