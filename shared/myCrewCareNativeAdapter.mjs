/** Protocol adapter for the gated Android portal; no legacy global snapshot events. */
export function createMyCrewCareNativeAdapter({ bridge, events } = {}) {
  let cancelPending = null;
  return Object.freeze({
    disconnect() {
      cancelPending?.();
      cancelPending = null;
      try { bridge?.disconnectMyCrewCareV2?.(); } catch {}
    },
    read(request, signal) {
      return new Promise((resolve, reject) => {
        if (cancelPending) { reject(new Error('sync-in-progress')); return; }
        if (signal?.aborted || bridge?.myCrewCareProtocolVersion?.() !== 2 || bridge?.myCrewCareReleaseEnabled?.() !== true
          || typeof bridge?.openMyCrewCareV2 !== 'function' || typeof events?.addEventListener !== 'function') {
          reject(new Error('native-validation-required')); return;
        }
        const finish = (error, payload) => {
          events.removeEventListener('crewcheck:mycrewcare-v2', receive);
          signal?.removeEventListener('abort', cancel);
          if (cancelPending === cancel) cancelPending = null;
          if (error) reject(error); else resolve(payload);
        };
        const receive = (event) => {
          if (event?.detail?.requestId !== request.requestId) return;
          finish(null, event.detail);
        };
        const cancel = () => finish(new Error('cancelled'));
        cancelPending = cancel;
        events.addEventListener('crewcheck:mycrewcare-v2', receive);
        signal?.addEventListener('abort', cancel, { once: true });
        try {
          if (bridge.openMyCrewCareV2(JSON.stringify(request), true) !== true) finish(new Error('native-validation-required'));
        } catch { finish(new Error('native-open-failed')); }
      });
    },
  });
}
