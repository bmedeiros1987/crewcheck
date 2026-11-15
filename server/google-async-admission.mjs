// Unwired preparation: no HTTP/native route, real auth/provider adapter or token storage.
import {createHash} from 'node:crypto';
import {requireBillingPrincipal,billingAuthorityCurrent,prepareBillingAdmission} from './billing-admission.mjs';
import {readOwnedBillingIntent,recordBillingIntentOutcome} from './billing-contracting-intent.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>Object.assign(new Error(code),{code,status:503});
export function createGoogleAsyncAdmission({db,resolvePrincipal,verifyPurchase,products}){
 if(!db||typeof resolvePrincipal!=='function'||typeof verifyPurchase!=='function'||!(products instanceof Map))throw fail('GOOGLE_ASYNC_CONFIGURATION_REQUIRED');
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
   const operation=await readOwnedBillingIntent(db,input);
   if(operation.provider!=='google_play'||!['dispatching','uncertain','created','reconciliation_required'].includes(operation.state))throw fail('GOOGLE_ASYNC_CORRELATION_REQUIRED');
   if(!billingAuthorityCurrent(principal))throw fail('BILLING_ADMISSION_AUTHORITY_REQUIRED');
   let verified;
   try{
    const result=await verifyPurchase(Object.freeze({purchaseToken,plan:operation.plan}));
    const {productId,publicId,tokenHash,evidenceHash}=result||{};
    if(typeof productId!=='string'||catalog.get(productId)!==operation.plan||typeof publicId!=='string'||publicId!==principal.publicId||typeof tokenHash!=='string'||tokenHash!==digest(purchaseToken)||typeof evidenceHash!=='string'||!/^[a-f0-9]{64}$/.test(evidenceHash))throw Error('invalid');
    verified={tokenHash,evidenceHash};
   }catch{throw fail('GOOGLE_ASYNC_VERIFICATION_UNCONFIRMED');}
   if(!billingAuthorityCurrent(principal))throw fail('BILLING_ADMISSION_AUTHORITY_REQUIRED');
   // Recheck the current profile after provider verification; no account recreation adoption.
   await readOwnedBillingIntent(db,input);
   try{return await recordBillingIntentOutcome(db,{...input,kind:'created',providerRef:verified.tokenHash,evidenceHash:verified.evidenceHash,receiptId:digest(JSON.stringify([operationId,'google_play',verified.tokenHash,verified.evidenceHash]))});}
   catch{throw Object.assign(fail('GOOGLE_ASYNC_OUTCOME_UNCONFIRMED'),{operationId});}
  },
 };
}
