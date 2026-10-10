import { MYCREWCARE_PROTOCOL } from './myCrewCarePersistentSession.mjs';

function bridgeMethod(bridge, name) {
  return typeof bridge?.[name] === 'function' ? bridge[name].bind(bridge) : null;
}

const CLEANUP_POLL_MS = 100;
const CLEANUP_TIMEOUT_MS = 15_000;

function operationId() {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === 'function') return `cleanup-${crypto.randomUUID()}`;
  throw Object.assign(new Error('secure-random-unavailable'), { code: 'secure-random-unavailable' });
}

function cleanupFailure(code) {
  return Object.assign(new Error(code), { code });
}

/**
 * Adapter for the gated Android portal. It never accepts legacy v1/v2 events.
 *
 * Native cleanup is asynchronous (the WebView profile finishes on its own thread), so a
 * disconnect starts an operation scoped to one account + one operation id and then waits
 * for that operation's real result. A bounded wait during an explicit user action is the
 * only waiting here; there is no recurring polling.
 */
export function createMyCrewCareNativeAdapter({
  bridge,
  events = globalThis.window,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  cleanupTimeoutMs = CLEANUP_TIMEOUT_MS,
  newOperationId = operationId,
} = {}) {
  let cancelPending = null;
  return Object.freeze({
    async disconnect(accountId, forgetData) {
      cancelPending?.();
      cancelPending = null;
      if (!accountId) return;
      const start = bridgeMethod(bridge, 'startMyCrewCareCleanupV3');
      const result = bridgeMethod(bridge, 'myCrewCareCleanupResultV3');
      if (!start || !result) throw cleanupFailure('native-disconnect-failed');
      const id = newOperationId();
      if (start(accountId, forgetData === true, id) !== true) throw cleanupFailure('native-disconnect-failed');
      const deadline = Date.now() + Math.max(1, cleanupTimeoutMs);
      for (;;) {
        const value = String(result(accountId, id) ?? '');
        if (value === 'ok') return;
        if (value.startsWith('failed')) throw cleanupFailure('native-disconnect-failed');
        if (value !== 'pending') throw cleanupFailure('native-disconnect-failed');
        if (Date.now() >= deadline) throw cleanupFailure('native-disconnect-timeout');
        await wait(CLEANUP_POLL_MS);
      }
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
