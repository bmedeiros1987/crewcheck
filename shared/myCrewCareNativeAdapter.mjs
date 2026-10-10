import { MYCREWCARE_PROTOCOL } from './myCrewCarePersistentSession.mjs';

function bridgeMethod(bridge, name) {
  return typeof bridge?.[name] === 'function' ? bridge[name].bind(bridge) : null;
}

/** Adapter for the gated Android portal. It never accepts legacy v1/v2 events. */
export function createMyCrewCareNativeAdapter({ bridge, events = globalThis.window } = {}) {
  let cancelPending = null;
  return Object.freeze({
    async disconnect(accountId, forgetData) {
      cancelPending?.();
      cancelPending = null;
      const method = bridgeMethod(bridge, 'disconnectMyCrewCareV3');
      if (!method || !accountId) return;
      const result = method(accountId, forgetData === true);
      if (result === false) throw Object.assign(new Error('native-disconnect-failed'), { code: 'native-disconnect-failed' });
    },

    read(request, signal) {
      return new Promise((resolve, reject) => {
        if (cancelPending) {
          reject(Object.assign(new Error('sync-in-progress'), { code: 'sync-in-progress' }));
          return;
        }
        const open = bridgeMethod(bridge, 'openMyCrewCareV3');
        const version = bridgeMethod(bridge, 'myCrewCareProtocolVersion');
        const enabled = bridgeMethod(bridge, 'myCrewCareReleaseEnabled');
        if (signal?.aborted
          || version?.() !== MYCREWCARE_PROTOCOL
          || enabled?.() !== true
          || !open
          || typeof events?.addEventListener !== 'function') {
          reject(Object.assign(new Error('native-validation-required'), { code: 'native-validation-required' }));
          return;
        }
        let finished = false;
        const finish = (error, payload) => {
          if (finished) return;
          finished = true;
          events.removeEventListener('crewcheck:mycrewcare-v3', receive);
          signal?.removeEventListener('abort', cancel);
          if (cancelPending === cancel) cancelPending = null;
          if (error) reject(error); else resolve(payload);
        };
        const receive = (event) => {
          if (event?.detail?.requestId !== request.requestId) return;
          finish(null, event.detail);
        };
        const cancel = () => finish(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
        cancelPending = cancel;
        events.addEventListener('crewcheck:mycrewcare-v3', receive);
        signal?.addEventListener('abort', cancel, { once: true });
        try {
          if (open(JSON.stringify(request), true) !== true) {
            finish(Object.assign(new Error('native-validation-required'), { code: 'native-validation-required' }));
          }
        } catch {
          finish(Object.assign(new Error('native-open-failed'), { code: 'native-open-failed' }));
        }
      });
    },
  });
}

/** Encrypted normalized-cache bridge. Provider cookies remain inside the WebView profile. */
export function createMyCrewCareNativeStorage({ bridge } = {}) {
  return Object.freeze({
    read(accountId) {
      const method = bridgeMethod(bridge, 'loadMyCrewCareV3State');
      if (!method) return null;
      const value = method(accountId);
      return typeof value === 'string' && value ? value : null;
    },
    write(accountId, payload) {
      const method = bridgeMethod(bridge, 'saveMyCrewCareV3State');
      if (!method || method(accountId, payload) !== true) {
        throw Object.assign(new Error('native-cache-write-failed'), { code: 'native-cache-write-failed' });
      }
    },
    clear(accountId) {
      const method = bridgeMethod(bridge, 'clearMyCrewCareV3State');
      if (method && method(accountId) !== true) {
        throw Object.assign(new Error('native-cache-clear-failed'), { code: 'native-cache-clear-failed' });
      }
    },
  });
}
