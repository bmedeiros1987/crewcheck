import {createInfobipWebhookAuthenticator} from './infobip-whatsapp-auth.mjs';
import { createOfflineInfobipReceiver, INFOBIP_WHATSAPP_RELEASE_ENABLED } from './infobip-whatsapp-candidate.mjs';
import { createInfobipSqlStore } from './infobip-whatsapp-store.mjs';
import { createInfobipTextTransport } from './infobip-whatsapp-transport.mjs';
import {invokeConfiguredWhatsAppConcierge} from './whatsapp.mjs';
import {createOfflineInfobipDeliveryReceiver} from './infobip-whatsapp-delivery.mjs';
import {installWhatsAppLifecycle} from './whatsapp-lifecycle.mjs';

export const INFOBIP_WHATSAPP_CALLBACK_PATH = '/api/infobip/whatsapp/webhook';
export const INFOBIP_WHATSAPP_SEEN_PATH = '/api/infobip/whatsapp/seen';
export const INFOBIP_WHATSAPP_DELIVERY_PATH = '/api/infobip/whatsapp/delivery';

// Production composition is a sealed OFF surface. No configuration/env access,
// body consumption, credential lookup, pool, engine, worker, timer or request.
// Enabling the constant alone intentionally cannot activate this composition.
export function createHeldInfobipWhatsAppRuntime() {
  return Object.freeze({
    health: () => ({enabled: false, ready: false, code: 'INFOBIP_WHATSAPP_DISABLED'}),
    dispatch: async () => ({status: 'disabled'}),
    expire: async () => ({status: 'disabled'}),
    dispose: async () => {},
    async handleRoute(_req, res, url) {
      if (![INFOBIP_WHATSAPP_CALLBACK_PATH, INFOBIP_WHATSAPP_DELIVERY_PATH, INFOBIP_WHATSAPP_SEEN_PATH].includes(url.pathname)) return false;
      res.writeHead(503, {'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store', 'x-content-type-options': 'nosniff'});
      res.end(JSON.stringify({ok: false, code: 'INFOBIP_WHATSAPP_DISABLED'}));
      return true;
    },
  });
}

// Shared adapter composition exercised ONLY with synthetic dependencies. This is
// not reachable from the production runtime object or public server routes.
export function composeInfobipWhatsAppForOfflineTests({db, configuration, concierge = invokeConfiguredWhatsAppConcierge, request, now = Date.now}) {
  if (INFOBIP_WHATSAPP_RELEASE_ENABLED !== false || typeof concierge !== 'function') throw Error('INFOBIP_OFFLINE_ONLY');
  const {sender, encryptionKey, linkHashKey, webhookUsername, webhookPassword, baseUrl, apiKey} = configuration;
  const store = createInfobipSqlStore({db, sender, encryptionKey, linkHashKey, now});
  const transport = createInfobipTextTransport({sender, baseUrl, apiKey, request});
  const receive = createOfflineInfobipReceiver({sender, username: webhookUsername, password: webhookPassword, authentication: configuration.webhookAuthentication, store, now});
  return Object.freeze({
    receive,
    receiveSeen: createOfflineInfobipDeliveryReceiver({kind:'seen', username:webhookUsername,password:webhookPassword,authentication:configuration.webhookAuthentication,store,now}),
    receiveDelivery: createOfflineInfobipDeliveryReceiver({username: webhookUsername, password: webhookPassword, authentication: configuration.webhookAuthentication, store, now}),
    dispatch: eventKey => store.exerciseDispatch(eventKey, {concierge, send: transport.exercise, clock: now}),
    expire: eventKey => store.expirePayload(eventKey),
    maintain: options => store.maintain(options),
    nextHeld: () => store.nextHeld(),
    eraseAccount: (email,context) => store.eraseAccount(email,context),
  });
}

function readBoundedBody(req) {
  return new Promise((resolve,reject) => {
    const chunks=[];let bytes=0,finished=false;
    const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);
      req.removeListener('data',data);req.removeListener('end',end);req.removeListener('error',failed);req.removeListener('aborted',failed);
      if(error){req.resume?.();reject(Error('INFOBIP_BODY'));}else resolve(value);};
    const data=chunk=>{const buffer=Buffer.from(chunk);bytes+=buffer.length;if(bytes>65_536)finish(true);else chunks.push(buffer);};
    const end=()=>finish(false,Buffer.concat(chunks));const failed=()=>finish(true);
    const timer=setTimeout(()=>finish(true),5_000);
    req.on('data',data);req.once('end',end);req.once('error',failed);req.once('aborted',failed);
  });
}

// Complete composition, explicitly enabled only by its caller. The production
// writer calls this with NO arguments: false by default, no env gate or I/O.
// No credentials/pool/request are discovered implicitly. TLS proxy verification
// must be explicitly supplied by a deployment boundary; forwarded headers alone
// never authorize it. Account profile/routing/cost verification remains external.
export function createInfobipWhatsAppRuntime(options = {}) {
  if (options.enabled !== true) return createHeldInfobipWhatsAppRuntime();
  const {scheduler = {set:fn=>setInterval(fn,10_000),clear:id=>clearInterval(id)},
    verifyTls = req=>req.socket?.encrypted === true} = options;
  const input = options.configuration;
  const configuration=Object.freeze({...input, ...(input?.webhookAuthentication === undefined ? {} : {webhookAuthentication:Object.freeze({...input.webhookAuthentication})})});
  const auth = createInfobipWebhookAuthenticator(configuration.webhookAuthentication === undefined
    ? {mode:'basic', username:configuration.webhookUsername, password:configuration.webhookPassword} : configuration.webhookAuthentication);
  if (typeof verifyTls !== 'function' || typeof scheduler?.set !== 'function' || typeof scheduler?.clear !== 'function') throw Error('INFOBIP_CONFIGURATION');
  const pipeline = composeInfobipWhatsAppForOfflineTests({...options,configuration});
  return bindInfobipWhatsAppRuntime({pipeline,auth,scheduler,verifyTls});
}

// Shared HTTP/lifecycle boundary. Callers supply a fully admitted pipeline;
// production wiring does not call the offline composition or exercise methods.
export function bindInfobipWhatsAppRuntime({pipeline,auth,scheduler,verifyTls,ingressPolicy}) {
  if(ingressPolicy&&(ingressPolicy.mode!=='render-managed-hmac'||ingressPolicy.requiresHmac!==true||auth.mode!=='hmac-sha256'||typeof ingressPolicy.inspect!=='function'))throw Error('INFOBIP_INGRESS_POLICY');
  const shutdown=new AbortController();
  let closed=false,running=null,cursor='',timer,disposal;
  const active=new Set();
  const tracked=run=>{
    if(closed)return Promise.resolve({status:'closed'});
    const task=Promise.resolve().then(run);active.add(task);
    return task.finally(()=>active.delete(task));
  };
  const tick=()=>{
    if(closed)return Promise.resolve({status:'closed'});
    if(running)return running;
    running=(async()=>{
      const result=await pipeline.maintain({cursor});cursor=result.cursor||'';
      if(closed)return {status:'closed'};
      const eventKey=await pipeline.nextHeld();if(eventKey&&!closed)await pipeline.dispatch(eventKey,{signal:shutdown.signal});
      return {status:'processed'};
    })().catch(()=>({status:'unavailable'})).finally(()=>{running=null;});
    return running;
  };
  const uninstall=installWhatsAppLifecycle((email,context)=>{
    if(closed)throw Error('INFOBIP_CLOSED');
    return tracked(()=>pipeline.eraseAccount(email,context));
  });
  try {timer=scheduler.set(()=>{void tick();});timer?.unref?.();}
  catch {uninstall();throw Error('INFOBIP_SCHEDULER');}
  const respond=(res,status,code)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify({ok:status===200,code}));};
  return Object.freeze({
    health:()=>({enabled:true,ready:!closed,code:closed?'INFOBIP_CLOSED':'INFOBIP_COMPOSED',...(ingressPolicy?{ingressMode:ingressPolicy.mode,transport:ingressPolicy.transport,proxyAuthenticated:false}:{})}),
    dispatch:eventKey=>tracked(()=>pipeline.dispatch(eventKey,{signal:shutdown.signal})),
    expire:eventKey=>tracked(()=>pipeline.expire(eventKey)),maintain:tick,
    async handleRoute(req,res,url){
      if(![INFOBIP_WHATSAPP_CALLBACK_PATH,INFOBIP_WHATSAPP_DELIVERY_PATH,INFOBIP_WHATSAPP_SEEN_PATH].includes(url.pathname))return false;
      const task=(async()=>{
        if(closed)return respond(res,503,'INFOBIP_CLOSED');
        if(req.method!=='POST')return respond(res,405,'METHOD');
        if(ingressPolicy){if(ingressPolicy.inspect(req,url)!==true)return respond(res,503,'INGRESS_REQUIRED');}
        else if(verifyTls(req)!==true)return respond(res,503,'TLS_REQUIRED');
        if(!auth.acceptsHeaders(req.rawHeaders))return respond(res,401,'AUTH');
        if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))return respond(res,415,'CONTENT_TYPE');
        let rawBody,kind;
        try {rawBody=await readBoundedBody(req);}
        catch{return respond(res,400,'INVALID_BODY');}
        if(!auth.verify(req.rawHeaders,rawBody))return respond(res,401,'AUTH');
        try {
          const body=JSON.parse(rawBody);
          if(!Array.isArray(body?.results)||!body.results.length||body.results.length>20)throw Error();
          const kinds=body.results.map(item=>{
            const matches=[Object.hasOwn(item||{},'status'),Object.hasOwn(item||{},'seenAt'),
              Object.hasOwn(item||{},'integrationType')&&Object.hasOwn(item||{},'receivedAt')&&Object.hasOwn(item||{},'message')];
            if(matches.filter(Boolean).length!==1)throw Error();
            return ['delivery','seen','inbound'][matches.indexOf(true)];
          });
          kind=kinds[0];if(kinds.some(value=>value!==kind))throw Error();
          if(url.pathname===INFOBIP_WHATSAPP_DELIVERY_PATH&&kind!=='delivery')throw Error();
          if(url.pathname===INFOBIP_WHATSAPP_SEEN_PATH&&kind!=='seen')throw Error();
        } catch{return respond(res,400,'INVALID_BODY');}
        if(closed)return respond(res,503,'INFOBIP_CLOSED');
        const receive=kind==='delivery'?pipeline.receiveDelivery:kind==='seen'?pipeline.receiveSeen:pipeline.receive;
        const result=await receive({method:req.method,rawHeaders:req.rawHeaders,rawBody});
        respond(res,result.status,result.code);
        if(result.status===200&&kind==='inbound'&&result.accepted>0)void tick();
      })();
      active.add(task);try{await task;}catch{if(!res.writableEnded)respond(res,503,'UNAVAILABLE');}finally{active.delete(task);}return true;
    },
    dispose(){
      if(disposal)return disposal;
      closed=true;shutdown.abort();
      disposal=(async()=>{let clearFailed=false;
        try{scheduler.clear(timer);}catch{clearFailed=true;}
        try{await Promise.allSettled([...active,...(running?[running]:[])]);}finally{uninstall();}
        if(clearFailed)throw Error('INFOBIP_SHUTDOWN');
      })();return disposal;
    },
  });
}
