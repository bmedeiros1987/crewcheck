import {createFinancialChannelSqlService} from './financial-channel-sql.mjs';
import {FinancialLedgerError,ledgerOwner} from './financial-ledger.mjs';
const fail=(code,status=400)=>{throw new FinancialLedgerError(code,status);};
const object=value=>value&&Object.getPrototypeOf(value)===Object.prototype;
const chat=value=>typeof value==='string'&&/^[1-9]\d{0,19}$/.test(value);
// Consumer of the real SQL adapter. Identity is supplied only by the existing
// owner-authenticated financial route; no independent auth scheme/route/sender.
export function createFinancialConsentHost({enabled=()=>false,poolProvider,now=()=>new Date(),maxConsentTtlMs=86400000,serviceFactory=createFinancialChannelSqlService}={}){
 return async function manage(identity,request){
  ledgerOwner(identity);
  if(!enabled())fail('FINANCIAL_CONSENT_HOST_NOT_ENABLED',503);
  const input=structuredClone(request),time=now().getTime();
  if(!Number.isFinite(time)||!Number.isSafeInteger(maxConsentTtlMs)||maxConsentTtlMs<=0||maxConsentTtlMs>86400000)fail('FINANCIAL_CONSENT_POLICY_UNAVAILABLE',503);
  if(!object(input)||!chat(input.conversationId)||!['preview','grant','revoke'].includes(input.action))fail('FINANCIAL_INVALID_CONSENT');
  const fields={preview:['action','conversationId'],grant:['action','conversationId','binding','expectedRevision','confirmed','categories','expiresAt'],revoke:['action','conversationId','expectedRevision']};
  if(Object.keys(input).some(key=>!fields[input.action].includes(key)))fail('FINANCIAL_INVALID_CONSENT');
  if(input.action==='grant'&&(!Number.isFinite(Date.parse(input.expiresAt))||Date.parse(input.expiresAt)<=time||Date.parse(input.expiresAt)>time+maxConsentTtlMs))fail('FINANCIAL_CONSENT_TTL_REQUIRED');
  const db=await poolProvider();if(!db)fail('FINANCIAL_HISTORY_UNAVAILABLE',503);
  const service=serviceFactory(db,{now});
  let result;
  if(input.action==='preview'){
   try{result={...await service.previewConsent(identity,input.conversationId),linked:true};}
   catch(error){
    if(error?.code!=='FINANCIAL_PRIVATE_BINDING_REQUIRED')throw error;
    const existing=await service.inspectConsent(identity,input.conversationId);
    if(!existing.consent)throw error;
    result={...existing,binding:null,linked:false};
   }
  }else result={consent:await service.changeConsent(identity,input)};
  // Owner-only app response contains no amounts, document, source evidence or
  // opaque binding from another account. Scope and expiry remain inspectable.
  return {...result,channel:'telegram',delivery:'private_text',scope:'financial_forecast_on_request',maxConsentTtlMs};
 };
}
