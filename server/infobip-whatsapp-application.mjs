import {createInfobipWhatsAppHost} from './infobip-whatsapp-host.mjs';
import {dbPool} from './v139/common.mjs';
import {matchesCanonicalWhatsAppLinkSecret} from './whatsapp.mjs';
export {createInfobipRenderHttpServer} from './infobip-whatsapp-host.mjs';

const allowedReferences={apiKey:new Set(['INFOBIP_API_KEY','CREWCHECK_INFOBIP_WHATSAPP_API_KEY']),
  encryptionKey:new Set(['CREWCHECK_INFOBIP_WHATSAPP_CONTENT_KEY']),
  linkHashKey:new Set(['CREWCHECK_WHATSAPP_AUDIT_SALT','CREWCHECK_DATA_ENCRYPTION_KEY','CREWCHECK_AUTH_SECRET','META_APP_SECRET']),
  webhookSecret:new Set(['CREWCHECK_INFOBIP_WHATSAPP_HMAC_SECRET'])};
const unavailable=()=>Error('INFOBIP_APPLICATION_UNAVAILABLE');
function credentialProvider(environment,matchesLinkKey) {
 return {async resolve(reference,{purpose,signal}) {
  if(signal.aborted)throw unavailable();
  const name=/^env:([A-Z][A-Z0-9_]+)$/.exec(reference)?.[1];
  if(!allowedReferences[purpose]?.has(name))throw unavailable();
  const value=environment[name];
  if(typeof value!=='string'||!value.length||signal.aborted)throw unavailable();
  if(purpose==='encryptionKey'){
   const bytes=Buffer.from(value,'base64');
   if(bytes.length!==32||bytes.toString('base64')!==value)throw unavailable();
   return bytes;
  }
  if(purpose==='linkHashKey'){
   const canonical=value.trim();if(!matchesLinkKey(canonical))throw unavailable();return canonical;
  }
  return value; // HMAC uses literal UTF-8; never trim or reinterpret it.
 }};
}
// The actual server calls this with no options. No env/reference/pool/signal
// access while OFF. A reviewed enabled caller is a separate release action.
export function createInfobipWhatsAppApplicationHost(options={}) {
 if(options.enabled!==true)return createInfobipWhatsAppHost();
 let host,listener,starting,stopping,closed=false;
 const held=createInfobipWhatsAppHost();
 const environment=options.environment??process.env,signals=options.signals??process;
 const lifecycle={registerShutdown(dispose){
  const onSignal=()=>{void stop().then(()=>signals.exit(0),()=>signals.exit(1));};
  const stop=()=>{
   if(stopping)return stopping;
   closed=true;
   const closeIngress=new Promise((resolve,reject)=>listener.close(error=>{
    if(!error||error.code==='ERR_SERVER_NOT_RUNNING')resolve();else reject(unavailable());
   }));
   listener.closeIdleConnections?.();
   stopping=Promise.all([dispose(),closeIngress]).then(()=>undefined);
   return stopping;
  };
  signals.once('SIGTERM',onSignal);signals.once('SIGINT',onSignal);
  return ()=>{signals.removeListener('SIGTERM',onSignal);signals.removeListener('SIGINT',onSignal);};
 }};
 const start=servingListener=>{
  if(closed)return Promise.reject(unavailable());
  if(starting)return servingListener===listener?starting:Promise.reject(unavailable());
  listener=servingListener;
  starting=Promise.resolve().then(async()=>{
   try{
    if(closed)throw unavailable();
    const policy=options.policy??JSON.parse(environment.CREWCHECK_INFOBIP_WHATSAPP_POLICY);
    if(policy.version!==1||policy.ingress?.mode!=='render-managed-hmac'||
       environment.RENDER_SERVICE_ID!==policy.ingress.serviceId)throw unavailable();
    host=createInfobipWhatsAppHost({enabled:true,ingress:policy.ingress,lifecycle,
     load:async()=>({configuration:policy.configuration,admission:policy.admission,
      credentials:credentialProvider(environment,options.matchesLinkKey??matchesCanonicalWhatsAppLinkSecret),
      getPool:options.getPool??dbPool,...(options.request?{request:options.request}:{}),
      ...(options.scheduler?{scheduler:options.scheduler}:{}),...(options.now?{now:options.now}:{})})});
    const health=await host.start(listener);
    if(closed||health.ready!==true)throw unavailable();
    return health;
   }catch{throw unavailable();}
  });return starting;
 };
 return Object.freeze({start,health:()=>host?.health()??held.health(),
  handleRoute:(...args)=>(closed?held:host??held).handleRoute(...args),
  dispatch:(...args)=>(closed?held:host??held).dispatch(...args),
  async dispose(){closed=true;const draining=host?.dispose();await starting?.catch(()=>{});if(draining)await draining;else await host?.dispose();},
 });
}
