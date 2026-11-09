import {validateInfobipPromotionalPolicy} from './infobip-whatsapp-promotional-beta.mjs';
import {validateInfobipFinitePolicy} from './infobip-whatsapp-finite-beta.mjs';
import {createInfobipWhatsAppApplicationHost} from './infobip-whatsapp-application.mjs';
import {createInfobipWhatsAppHost} from './infobip-whatsapp-host.mjs';
import {validateInfobipOperationalPilotPolicy} from './infobip-whatsapp-operational-pilot.mjs';
export {createInfobipRenderHttpServer} from './infobip-whatsapp-host.mjs';

export const INFOBIP_SINGLE_TEST_INPUT = 'Teste CrewCierge';
export const INFOBIP_SINGLE_TEST_REPLY = 'Teste de conexão CrewCierge.';
// One approval, one durable quota namespace. Never mint a new ID on restart.
export const INFOBIP_SINGLE_TEST_APPROVAL = 'Sentinel_10aa5ad9a34c8191a6e281567212d30a';

export function validateInfobipSingleTestPolicy(policy) {
  const admission=policy?.admission;
  if(policy?.version!==1 || policy.mode!=='single-neutral-reply-v1' ||
     policy.maxCostUsd!=='0.02' || policy.configuration?.singleMessageTest!==true ||
     (policy.configuration?.canonicalLinkHandshake!==undefined&&typeof policy.configuration.canonicalLinkHandshake!=='boolean') ||
     (policy.configuration?.canonicalLinkHandshakeOnly!==undefined&&typeof policy.configuration.canonicalLinkHandshakeOnly!=='boolean') ||
     (policy.configuration?.canonicalLinkHandshakeOnly===true&&policy.configuration.canonicalLinkHandshake!==true) ||
     admission?.id!==INFOBIP_SINGLE_TEST_APPROVAL || admission.maxAttempts!==1 ||
     !Array.isArray(admission.recipients) || admission.recipients.length!==1 ||
     !/^[1-9]\d{7,14}$/.test(admission.recipients[0]) ||
     !Number.isSafeInteger(admission.validFrom) || !Number.isSafeInteger(admission.validUntil) ||
     admission.validUntil<=admission.validFrom || admission.validUntil-admission.validFrom>15*60_000)
    throw Error('INFOBIP_SINGLE_TEST_POLICY');
  return policy;
}
export function validateInfobipRestrictedPolicy(policy) {
  if(policy?.configuration?.finiteBeta!==undefined&&typeof policy.configuration.finiteBeta!=='boolean')throw Error('INFOBIP_FINITE_POLICY');
  if(policy?.configuration?.finiteBeta===true&&policy?.mode!=='finite-risk-beta-v1')throw Error('INFOBIP_FINITE_POLICY');
  if(policy?.mode==='finite-risk-beta-v1')return validateInfobipFinitePolicy(policy);
  return policy?.mode==='promotional-beta-v1'?validateInfobipPromotionalPolicy(policy):policy?.mode==='operational-pilot-v1'
    ?validateInfobipOperationalPilotPolicy(policy):validateInfobipSingleTestPolicy(policy);
}

// Explicitly restricted caller: original neutral approval OR the separately
// approved three-category operational pilot. Missing/malformed policy is OFF, without
// resolving secrets, SQL, timers or HTTP. The general application host remains
// no-options/OFF. No phone number or secret is embedded in source.
export function createInfobipWhatsAppSingleTestHost(options={}) {
  const environment=options.environment??process.env;
  let policy;
  try {
    const raw=environment.CREWCHECK_INFOBIP_WHATSAPP_POLICY;
    if(!raw)return createInfobipWhatsAppHost();
    policy=validateInfobipRestrictedPolicy(JSON.parse(raw));
  } catch {return createInfobipWhatsAppHost();}
  const application=createInfobipWhatsAppApplicationHost({...options,environment,enabled:true,policy});
  const held=createInfobipWhatsAppHost();
  let unavailable=false,starting,listener,closed=false,stage;
  const health=()=>unavailable
    ? {enabled:false,ready:false,code:'INFOBIP_APPLICATION_UNAVAILABLE',stage} : application.health();
  // Only this optional web caller contains its own startup rejection. The strict
  // application host still rejects invalid configuration; no global error handler,
  // credential fallback, automatic retry or relaxed activation policy is added.
  return Object.freeze({
    health,
    start(servingListener) {
      if(closed || (starting && servingListener!==listener))return Promise.reject(Error('INFOBIP_APPLICATION_UNAVAILABLE'));
      if(starting)return starting;
      listener=servingListener;
      starting=application.start(listener).catch(async error=>{
        if(error?.message!=='INFOBIP_APPLICATION_UNAVAILABLE')throw error;
        unavailable=true;
        stage=['policy','deployment-binding','host-preflight'].includes(error.stage)?error.stage:'host-preflight';
        await application.dispose();
        console.warn('[infobip] optional integration unavailable; stage='+stage+'; callbacks and sends held');
        return health();
      });
      return starting;
    },
    handleRoute:(...args)=>(unavailable?held:application).handleRoute(...args),
    dispatch:(...args)=>(unavailable?held:application).dispatch(...args),
    dispose:()=>{closed=true;return application.dispose();},
  });
}
