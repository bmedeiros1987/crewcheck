import {createHeldInfobipWhatsAppRuntime,bindInfobipWhatsAppRuntime} from './infobip-whatsapp-runtime.mjs';
import {createInfobipRenderIngressPolicy} from './infobip-whatsapp-render-ingress.mjs';
import {createInfobipWebhookAuthenticator} from './infobip-whatsapp-auth.mjs';
import {createInfobipInboundReceiver} from './infobip-whatsapp-candidate.mjs';
import {createInfobipReportReceiver} from './infobip-whatsapp-delivery.mjs';
import {createInfobipProductionStore} from './infobip-whatsapp-store.mjs';
import {createInfobipProductionTextTransport} from './infobip-whatsapp-transport.mjs';
import {createInfobipSendAdmission} from './infobip-whatsapp-admission.mjs';
import {preflightInfobipWhatsAppStorage} from './infobip-whatsapp-preflight.mjs';
import {invokeConfiguredWhatsAppConcierge,isWhatsAppConciergeConfigured,withWhatsAppConciergeQuiesced} from './whatsapp.mjs';

const singleTestInput='Teste CrewCierge',singleTestReply='Teste de conexão CrewCierge.';

const fail=()=>{throw Error('INFOBIP_PRODUCTION_CONFIGURATION');};
const reference=value=>typeof value==='string'&&/^[A-Za-z0-9_.:/-]{1,160}$/.test(value);
function httpsOrigin(value) {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)fail();
  return url.origin;
}
function ingressVerifier(ingress) {
  const origin=httpsOrigin(ingress?.publicOrigin),host=new URL(origin).host;
  const mode=ingress.mode,attested=ingress.attestedRequests;
  if(mode!=='direct-tls'&&(mode!=='trusted-boundary'||!(attested instanceof WeakSet)))fail();
  // Membership must be marked by the trusted listener after ingress validation.
  // No request field or forwarded header can grant membership to this WeakSet.
  return req=>typeof req?.headers?.host==='string'&&req.headers.host.toLowerCase()===host&&
    (mode==='direct-tls'?req.socket?.encrypted===true:attested.has(req));
}
async function resolveCredentials(provider,refs) {
  if(typeof provider?.resolve!=='function')fail();
  const resolve=provider.resolve.bind(provider),controller=new AbortController();let timer;
  try {
    return await Promise.race([
      Promise.all(Object.entries(refs).map(async([purpose,ref])=>[purpose,await resolve(ref,{purpose,signal:controller.signal})])).then(Object.fromEntries),
      new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('INFOBIP_CREDENTIALS_UNAVAILABLE'));},2000);}),
    ]);
  } finally {clearTimeout(timer);controller.abort();}
}

// No production caller is installed. Default OFF returns before reading any
// other option. Explicit enablement still requires every injected authority.
export async function createInfobipWhatsAppProduction(options={}) {
  if(options.enabled!==true)return createHeldInfobipWhatsAppRuntime();
  try {
    const input=options.configuration,now=options.now||Date.now;
    const sender=input?.sender,baseUrl=httpsOrigin(input?.baseUrl);
    if(!Array.isArray(input?.allowedSenders)||!input.allowedSenders.includes(sender)||
      !Array.isArray(input?.allowedBaseUrls)||!input.allowedBaseUrls.includes(baseUrl)||
      !input.allowedBaseUrls.every(value=>httpsOrigin(value)===value)||
      !/^[1-9]\d{7,14}$/.test(sender))fail();
    const refs=Object.freeze({...input.credentialReferences});
    if(Object.keys(refs).sort().join(',')!=='apiKey,encryptionKey,linkHashKey,webhookSecret'||!Object.values(refs).every(reference)||new Set(Object.values(refs)).size!==4)fail();
    if(input.authentication!=='hmac-sha256')fail();
    const ingress=options.ingress;
    const binding=input.deploymentBinding;
    const renderPolicy=ingress?.mode==='render-managed-hmac'
      ? createInfobipRenderIngressPolicy(ingress,options.listener,binding) : null;
    const verifyTls=renderPolicy ? undefined : ingressVerifier(ingress);
    if(!binding||!reference(binding.profileId)||!Array.isArray(binding.subscriptionIds)||!binding.subscriptionIds.length||
      !binding.subscriptionIds.every(reference)||binding.sender!==sender||binding.baseUrl!==baseUrl||
      binding.publicOrigin!==httpsOrigin(ingress.publicOrigin)||binding.linkHashKeyReference!==refs.linkHashKey)fail();
    const singleTest=input.singleMessageTest===true;
    const linkHandshake=singleTest&&input.canonicalLinkHandshake===true;
    if(input.canonicalLinkHandshake!==undefined&&typeof input.canonicalLinkHandshake!=='boolean')fail();
    if(singleTest&&(options.admission?.maxAttempts!==1||options.admission?.recipients?.length!==1))fail();
    const quantity=createInfobipSendAdmission(options.admission,{sender,now});
    const testFrom=options.admission.validFrom;
    const testInput=job=>job?.text===singleTestInput&&job.receivedAt>=testFrom;
    const admission=singleTest?Object.freeze({
      allows:job=>testInput(job)&&quantity.allows(job),
      reserve:(c,job)=>testInput(job)?quantity.reserve(c,job):Promise.resolve(false),
    }):quantity;
    const scheduler=options.scheduler;
    if(typeof scheduler?.set!=='function'||typeof scheduler?.clear!=='function'||typeof options.request!=='function'||
      !isWhatsAppConciergeConfigured())fail();
    // Capture callable capabilities before asynchronous resolution/preflight.
    const fixedScheduler=Object.freeze({set:scheduler.set.bind(scheduler),clear:scheduler.clear.bind(scheduler)});
    const request=options.request,sourceDb=options.db,sqlBudget=options.sqlBudget?Object.freeze({...options.sqlBudget}):undefined;
    if(typeof sourceDb?.getConnection!=='function')fail();
    const db=Object.freeze({getConnection:sourceDb.getConnection.bind(sourceDb)});
    const credentials=await resolveCredentials(options.credentials,refs);
    const configuration=Object.freeze({sender,baseUrl,apiKey:credentials.apiKey,
      encryptionKey:Buffer.isBuffer(credentials.encryptionKey)?Buffer.from(credentials.encryptionKey):null,
      linkHashKey:credentials.linkHashKey,webhookAuthentication:Object.freeze({mode:'hmac-sha256',secretKey:credentials.webhookSecret})});
    const auth=createInfobipWebhookAuthenticator(configuration.webhookAuthentication);
    const transport=createInfobipProductionTextTransport({...configuration,request});
    // Neutral transport smoke test uses the same binding/consent, durable
    // reservation, lifecycle and send locks, without invoking account tools.
    const store=createInfobipProductionStore({...configuration,db,now,sqlBudget},{concierge:singleTest?async()=>singleTestReply:invokeConfiguredWhatsAppConcierge,
      send:singleTest?(proposal,context)=>proposal.text===singleTestReply?transport.send(proposal,context):Promise.resolve({status:'blocked'}):transport.send,admission});
    await preflightInfobipWhatsAppStorage(db,sqlBudget); // SELECT only; never create or repair tables.
    const receive=createInfobipInboundReceiver({sender,authentication:configuration.webhookAuthentication,store,now,
      ...(singleTest?{queueLinkConfirmation:!linkHandshake,acceptEvent:event=>(event.text===singleTestInput&&admission.allows(event)) ||
        (linkHandshake&&/^\d{6}$/.test(event.text)&&event.receivedAt>=testFrom&&quantity.allows(event))}:{})});
    const report=kind=>createInfobipReportReceiver({kind,authentication:configuration.webhookAuthentication,store,now});
    const pipeline=Object.freeze({receive,receiveDelivery:report('delivery'),receiveSeen:report('seen'),
      dispatch:store.dispatch,expire:store.expirePayload,maintain:store.maintain,nextHeld:store.nextHeld,eraseAccount:(email,context)=>withWhatsAppConciergeQuiesced(email,async()=>{await store.waitForLocalPreparations(email);return store.eraseAccount(email,context);})});
    return bindInfobipWhatsAppRuntime({pipeline,auth,scheduler:fixedScheduler,verifyTls,ingressPolicy:renderPolicy});
  } catch {throw Error('INFOBIP_PRODUCTION_UNAVAILABLE');}
}
