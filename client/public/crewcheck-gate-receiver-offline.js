/* Gate receiver fence shared by the shipping worker and isolated harnesses.
 * No sender, permission or subscription creation. A topic binding is synchronized
 * only against the existing installation generation; it does not authenticate an account. */
(function (root) {
  const fields = ['ownerId', 'installationId', 'consentRevision', 'topicRevision', 'authorityEpoch'];
  const same = (a, b) => a && b && fields.every(key => a[key] === b[key]);
  const valid = value => value && ['ownerId', 'installationId', 'authorityEpoch'].every(key => typeof value[key] === 'string' && /^[a-zA-Z0-9_-]{8,160}$/.test(value[key]))
    && ['consentRevision', 'topicRevision'].every(key => Number.isSafeInteger(value[key]) && value[key] > 0);
  const scope = value => Object.fromEntries(fields.map(key => [key, value[key]]));
  const gateEnvelope = value => valid(value) && Object.keys(value).length === 9 && typeof value.eventKey === 'string' && /^gate-change-v1:[a-f0-9]{64}$/.test(value.eventKey);
  const blocked = status => ({ status, received: null });
  function matchesAck(ack, request) {
    return Boolean(valid(request) && typeof request.requestId === 'string' && /^[a-zA-Z0-9_-]{8,160}$/.test(request.requestId) && ack?.schema === 'crewcheck.gate-revoked.v1'
      && ack.requestId === request.requestId && same(ack, request) && ack.received === null);
  }
  function withGateStore(base, indexedDB) {
    const opened = new Promise((resolve, reject) => {
      const request = indexedDB.open('crewcheck-notification-installation-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const transaction = async run => {
      const db = await opened;
      return new Promise((resolve, reject) => {
        const tx = db.transaction('state', 'readwrite'), state = tx.objectStore('state'); let result;
        tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(tx.error);
        run(state, value => { result = value; });
      });
    };
    return { ...base,
      gateBinding: () => transaction((state, done) => { const read = state.get('gate-binding:v1'); read.onsuccess = () => done(read.result || null); }),
      syncGate: (next, expected, generation) => transaction((state, done) => {
        const base = state.get('binding'), currentGeneration = state.get('generation'), previous = state.get('gate-binding:v1');
        previous.onsuccess = () => {
          const matchesBase = value => value && expected && ['ownerId','installationId','consentRevision'].every(key => value[key] === expected[key]);
          if (!matchesBase(base.result) || expected?.subscriptionHash && base.result?.subscriptionHash !== expected.subscriptionHash || currentGeneration.result !== generation || !Number.isSafeInteger(generation)) return done({ok:false});
          const old = previous.result;
          if (next !== null && (!valid(next) || next.active !== true || !matchesBase(next))) return done({ok:false});
          if (next && matchesBase(old) && (old.topicRevision > next.topicRevision || old.topicRevision === next.topicRevision && (!same(old,next) || old.active !== true))) return done({ok:false});
          const value = next ? {...scope(next),active:true} : old ? {...scope(old),active:false} : null;
          state.put(value,'gate-binding:v1'); done({ok:true,previous:old});
        };
      }),
      invalidateGate: expected => transaction((state, done) => {
        const read = state.get('gate-binding:v1'); read.onsuccess = () => {
          if (!valid(expected) || !same(read.result, expected)) return done(false);
          state.put({ ...scope(expected), active: false }, 'gate-binding:v1'); done(true);
        };
      })
    };
  }
  function create(options = {}) {
    if (options.enabled !== true) return Object.freeze({ sync: async () => ({ok:false}), receive: async () => blocked('disabled'), revoke: async () => ({ status: 'disabled', ack: null }) });
    const { store, registration, locks, processPush, clock = () => Date.now() } = options;
    if (typeof locks?.request !== 'function' || typeof store?.gateBinding !== 'function'
      || typeof store?.invalidateGate !== 'function' || typeof processPush !== 'function') throw Error('Gate receiver fence unavailable');
    // Origin-wide lock, shared by display and revocation across worker/page
    // instances. Never fall back to a per-module queue or acknowledge without it.
    const exclusive = run => locks.request('crewcheck:gate-notice:v1', { mode: 'exclusive' }, run);
    return Object.freeze({
      async sync(next, expected, generation) {
        if (typeof store.syncGate !== 'function') return {ok:false};
        try { return await exclusive(async () => {
          const result = await store.syncGate(next, expected, generation);
          if (!result.ok) return result;
          if (result.previous && (!next || !same(result.previous,next))) {
            for (const notice of await registration.getNotifications()) {
              if (gateEnvelope(notice.data?.envelope) && same(notice.data.envelope,result.previous)) await notice.close();
            }
          }
          return {ok:true};
        }); } catch { return {ok:false}; }
      },
      async receive(input) {
        const envelope = structuredClone(input);
        if (!gateEnvelope(envelope)) return blocked('blocked');
        return exclusive(async () => {
          const current = async () => {
            const topic = await store.gateBinding(), binding = await store.binding();
            return topic?.active === true && same(topic, envelope) && binding
              && ['ownerId', 'installationId', 'consentRevision'].every(key => binding[key] === envelope[key]);
          };
          if (!await current()) return blocked('revoked');
          const guarded = { gateBinding: async () => await current() ? store.gateBinding() : null, binding: async () => await current() ? store.binding() : null,
            claim: store.claim.bind(store), record: store.record.bind(store),
            ...(store.report ? { report: store.report.bind(store) } : {}) };
          // Keep the SAME lock through showNotification resolution. A revocation
          // ACK cannot overtake a pending display; it closes that display next.
          return processPush({ enabled: true, envelope, store: guarded, registration, now: clock(), clock });
        });
      },
      async revoke(input) {
        const request = structuredClone(input);
        if (!valid(request) || typeof request.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,160}$/.test(request.requestId)) return { status: 'blocked', ack: null };
        try {
          return await exclusive(async () => {
            // Host transaction must compare all five fields and persist an
            // inactive tombstone BEFORE returning. Stale A cannot invalidate B.
            if (!await store.invalidateGate(scope(request))) return { status: 'stale', ack: null };
            const notifications = await registration.getNotifications();
            for (const notification of notifications) {
              if (gateEnvelope(notification.data?.envelope) && same(notification.data.envelope, request)) await notification.close();
            }
            const after = await store.gateBinding();
            if (!after || after.active !== false || !same(after, request)) return { status: 'changed', ack: null };
            return { status: 'local_fence_confirmed', ack: { schema: 'crewcheck.gate-revoked.v1',
              requestId: request.requestId, ...scope(request), received: null } };
          });
        } catch { return { status: 'local_revocation_unconfirmed', ack: null }; }
      }
    });
  }
  root.CrewCheckGateReceiverOffline = { create, withGateStore, matchesAck };
})(typeof self !== 'undefined' ? self : globalThis);
