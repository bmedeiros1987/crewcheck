import https from 'node:https';
import {snapshotInfobipRenderIngress} from './infobip-whatsapp-render-ingress.mjs';
export {createInfobipRenderHttpServer} from './infobip-whatsapp-render-ingress.mjs';
import {Readable} from 'node:stream';
import {createHeldInfobipWhatsAppRuntime} from './infobip-whatsapp-runtime.mjs';
import {createInfobipWhatsAppProduction} from './infobip-whatsapp-production.mjs';

// Private provenance of construction, not public-host/certificate attestation.
// No API registers an arbitrary object or marks incoming requests as trusted.
const directTlsListeners = new WeakSet();
const createNativeHttpsServer = https.createServer.bind(https);
export function createInfobipDirectTlsListener(tlsOptions = {}, onRequest) {
  const listener = createNativeHttpsServer(tlsOptions, onRequest);
  directTlsListeners.add(listener);
  return listener;
}

// One native HTTPS request. No proxy discovery, redirects, retries or background
// queue. The production transport owns the whole-operation timeout/body budget.
// open is a trusted test/host capability, never selected by request input.
export function createInfobipNodeRequest(open = https.request) {
  return (address, options) => new Promise((resolve, reject) => {
    const fail = () => reject(Error('INFOBIP_HTTP_UNAVAILABLE'));
    let url;
    try {
      url = new URL(address);
      if (url.protocol !== 'https:' || url.username || url.password || options?.method !== 'POST' ||
          options.redirect !== 'error' || !options.signal || options.signal.aborted) return fail();
      const request = open(url, {method:'POST', headers:options.headers, signal:options.signal, agent:false}, response => {
        const status = response.statusCode;
        // Do not read or retain error/redirect bodies, and never follow Location.
        if (!Number.isInteger(status) || status < 200 || status >= 300) {
          response.destroy();
          return resolve({status, redirected:false, body:null});
        }
        resolve({status, redirected:false, body:Readable.toWeb(response)});
      });
      request.once('error', fail);
      request.end(options.body);
    } catch { fail(); }
  });
}

export function createInfobipNodeScheduler(timers = {setInterval, clearInterval}) {
  return Object.freeze({set:fn => timers.setInterval(fn, 10_000), clear:id => timers.clearInterval(id)});
}

// The installed caller supplies no options: OFF before reading any capabilities.
// There is intentionally no env switch, secret discovery or Render proxy trust.
export function createInfobipWhatsAppHost(options = {}) {
  const held = createHeldInfobipWhatsAppRuntime();
  if (options.enabled !== true) return Object.freeze({...held, start:async () => held.health()});
  let runtime = held, starting, disposal, servingListener, closed = false, failed = false, unregister;
  const health = () => closed || failed
    ? {enabled:false, ready:false, code:closed?'INFOBIP_HOST_CLOSED':'INFOBIP_HOST_UNAVAILABLE'} : runtime.health();
  const dispose = () => {
    if (disposal) return disposal;
    closed = true;
    disposal = (async () => {
      let failure=false;
      try { await starting?.catch(() => {}); await runtime.dispose(); } catch {failure=true;}
      finally { if (unregister) {const remove=unregister;unregister=null;try {remove();} catch {failure=true;}} }
      if (failure) throw Error('INFOBIP_HOST_SHUTDOWN');
    })();
    return disposal;
  };
  const start = (listener=options.listener) => {
    if (closed) return Promise.reject(Error('INFOBIP_HOST_CLOSED'));
    if (starting) return listener===servingListener ? starting : Promise.reject(Error('INFOBIP_HOST_LISTENER'));
    servingListener=listener;
    starting = Promise.resolve().then(async () => {
      try {
        const inputIngress=options.ingress;
        const ingress=inputIngress?.mode==='render-managed-hmac'
          ? snapshotInfobipRenderIngress(inputIngress,servingListener) : inputIngress;
        if ((ingress?.mode !== 'render-managed-hmac'&&(ingress?.mode!=='direct-tls'||!directTlsListeners.has(servingListener))) || typeof options.load !== 'function' ||
            typeof options.lifecycle?.registerShutdown !== 'function') throw Error();
        unregister = options.lifecycle.registerShutdown(dispose);
        if (typeof unregister !== 'function') throw Error();
        if (closed) return health();
        const dependencies = await options.load();
        if (closed) return health();
        // getPool must supply the existing native pool, without DDL; never the
        // platform SQL/result adapter. Nothing here owns or closes shared pools.
        if (typeof dependencies?.getPool !== 'function') throw Error();
        const db = await dependencies.getPool();
        if (closed) return health();
        runtime = await createInfobipWhatsAppProduction({...dependencies, enabled:true, db,
          ingress, listener:servingListener, scheduler:dependencies.scheduler ?? createInfobipNodeScheduler(),
          request:dependencies.request ?? createInfobipNodeRequest()});
        // A stop during resolution/preflight must drain before startup settles.
        if (closed) await runtime.dispose();
        return health();
      } catch {
        failed = true;
        if (unregister) {const remove=unregister;unregister=null;try {remove();} catch {}}
        throw Error('INFOBIP_HOST_UNAVAILABLE');
      }
    });
    return starting;
  };
  return Object.freeze({start, dispose, health,
    handleRoute:(...args) => (closed || failed ? held : runtime).handleRoute(...args),
    dispatch:(...args) => closed || failed ? Promise.resolve({status:'closed'}) : runtime.dispatch(...args),
    expire:(...args) => closed || failed ? Promise.resolve({status:'closed'}) : runtime.expire(...args),
  });
}
