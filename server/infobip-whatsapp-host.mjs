import https from 'node:https';
import {Readable} from 'node:stream';
import {createHeldInfobipWhatsAppRuntime} from './infobip-whatsapp-runtime.mjs';
import {createInfobipWhatsAppProduction} from './infobip-whatsapp-production.mjs';

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
  let runtime = held, starting, disposal, closed = false, failed = false, unregister;
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
  const start = () => {
    if (closed) return Promise.reject(Error('INFOBIP_HOST_CLOSED'));
    if (starting) return starting;
    starting = Promise.resolve().then(async () => {
      try {
        // Only direct socket TLS has an implementation here. The deployed HTTP
        // listener cannot satisfy it; trusted-boundary needs a separate review.
        const ingress = options.ingress;
        if (ingress?.mode !== 'direct-tls' || !(options.listener instanceof https.Server) || typeof options.load !== 'function' ||
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
          ingress, scheduler:dependencies.scheduler ?? createInfobipNodeScheduler(),
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
