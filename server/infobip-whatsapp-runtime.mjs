import { createOfflineInfobipReceiver, INFOBIP_WHATSAPP_RELEASE_ENABLED } from './infobip-whatsapp-candidate.mjs';
import { createInfobipSqlStore } from './infobip-whatsapp-store.mjs';
import { createInfobipTextTransport } from './infobip-whatsapp-transport.mjs';

export const INFOBIP_WHATSAPP_CALLBACK_PATH = '/api/infobip/whatsapp/webhook';

// Production composition is a sealed OFF surface. No configuration/env access,
// body consumption, credential lookup, pool, engine, worker, timer or request.
// Enabling the constant alone intentionally cannot activate this composition.
export function createHeldInfobipWhatsAppRuntime() {
  return Object.freeze({
    health: () => ({enabled: false, ready: false, code: 'INFOBIP_WHATSAPP_DISABLED'}),
    dispatch: async () => ({status: 'disabled'}),
    expire: async () => ({status: 'disabled'}),
    async handleRoute(_req, res, url) {
      if (url.pathname !== INFOBIP_WHATSAPP_CALLBACK_PATH) return false;
      res.writeHead(503, {'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store', 'x-content-type-options': 'nosniff'});
      res.end(JSON.stringify({ok: false, code: 'INFOBIP_WHATSAPP_DISABLED'}));
      return true;
    },
  });
}

// Shared adapter composition exercised ONLY with synthetic dependencies. This is
// not reachable from the production runtime object or public server routes.
export function composeInfobipWhatsAppForOfflineTests({db, configuration, concierge, request, now = Date.now}) {
  if (INFOBIP_WHATSAPP_RELEASE_ENABLED !== false || typeof concierge !== 'function') throw Error('INFOBIP_OFFLINE_ONLY');
  const {sender, encryptionKey, linkHashKey, webhookUsername, webhookPassword, baseUrl, apiKey} = configuration;
  const store = createInfobipSqlStore({db, sender, encryptionKey, linkHashKey, now});
  const transport = createInfobipTextTransport({sender, baseUrl, apiKey, request});
  const receive = createOfflineInfobipReceiver({sender, username: webhookUsername, password: webhookPassword, store, now});
  return Object.freeze({
    receive,
    dispatch: eventKey => store.exerciseDispatch(eventKey, {concierge, send: transport.exercise, clock: now}),
    expire: eventKey => store.expirePayload(eventKey),
  });
}
