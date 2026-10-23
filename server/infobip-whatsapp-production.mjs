import {createHeldInfobipWhatsAppRuntime,bindInfobipWhatsAppRuntime} from './infobip-whatsapp-runtime.mjs';
import {createInfobipWebhookAuthenticator} from './infobip-whatsapp-auth.mjs';
import {createInfobipInboundReceiver} from './infobip-whatsapp-candidate.mjs';
import {createInfobipReportReceiver} from './infobip-whatsapp-delivery.mjs';
import {createInfobipProductionStore} from './infobip-whatsapp-store.mjs';
import {createInfobipProductionTextTransport} from './infobip-whatsapp-transport.mjs';
import {createInfobipSendAdmission} from './infobip-whatsapp-admission.mjs';
import {createInfobipSqlBudget} from './infobip-whatsapp-sql-budget.mjs';
import {invokeConfiguredWhatsAppConcierge,isWhatsAppConciergeConfigured} from './whatsapp.mjs';

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
const required={
  crewcheck_telegram_state:['state_key','payload','updated_at'],
  crewcheck_platform_profiles:['email','public_id'],
  crewcheck_whatsapp_links:['email','phone_hash','phone_cipher','consent_concierge','consent_alerts','revoked_at','linked_at','updated_at'],
  crewcheck_whatsapp_link_codes:['email','code_hash','expires_at'],
};
async function verifyStorage(db,sqlBudget) {
  await createInfobipSqlBudget(db,sqlBudget)(async c=>{
    const names=Object.keys(required);
    const [tables]=await c.query('SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?,?)',names);
    if(tables.length!==names.length||names.some(name=>!tables.some(row=>row.name===name&&row.engine==='InnoDB')))fail();
    const [columns]=await c.query('SELECT TABLE_NAME AS name,COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?,?)',names);
    if(names.some(name=>required[name].some(column=>!columns.some(row=>row.name===name&&row.column_name===column))))fail();
    const [indexes]=await c.query('SELECT TABLE_NAME AS name,INDEX_NAME AS index_name,COLUMN_NAME AS column_name,NON_UNIQUE AS non_unique,SEQ_IN_INDEX AS sequence_no FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?,?)',names);
    // State uniqueness is the durable claim/quota fence. Composite indexes
    // containing state_key alone do not establish uniqueness of state_key.
    const uniqueState=indexes.filter(row=>row.name==='crewcheck_telegram_state'&&Number(row.non_unique)===0);
    if(!uniqueState.some(row=>row.column_name==='state_key'&&Number(row.sequence_no)===1&&uniqueState.filter(other=>other.index_name===row.index_name).length===1))fail();
  });
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
    const ingress=options.ingress,verifyTls=ingressVerifier(ingress);
    const binding=input.deploymentBinding;
    if(!binding||!reference(binding.profileId)||!Array.isArray(binding.subscriptionIds)||!binding.subscriptionIds.length||
      !binding.subscriptionIds.every(reference)||binding.sender!==sender||binding.baseUrl!==baseUrl||
      binding.publicOrigin!==httpsOrigin(ingress.publicOrigin)||binding.linkHashKeyReference!==refs.linkHashKey)fail();
    const admission=createInfobipSendAdmission(options.admission,{sender,now});
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
    const store=createInfobipProductionStore({...configuration,db,now,sqlBudget},{concierge:invokeConfiguredWhatsAppConcierge,send:transport.send,admission});
    await verifyStorage(db,sqlBudget); // SELECT only; never create or repair tables.
    const receive=createInfobipInboundReceiver({sender,authentication:configuration.webhookAuthentication,store,now});
    const report=kind=>createInfobipReportReceiver({kind,authentication:configuration.webhookAuthentication,store,now});
    const pipeline=Object.freeze({receive,receiveDelivery:report('delivery'),receiveSeen:report('seen'),
      dispatch:store.dispatch,expire:store.expirePayload,maintain:store.maintain,nextHeld:store.nextHeld,eraseAccount:store.eraseAccount});
    return bindInfobipWhatsAppRuntime({pipeline,auth,scheduler:fixedScheduler,verifyTls});
  } catch {throw Error('INFOBIP_PRODUCTION_UNAVAILABLE');}
}
