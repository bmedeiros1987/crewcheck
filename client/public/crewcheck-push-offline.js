/* Offline preparation only. sw.js does not import this file. No production
 * listener, permission, receipt endpoint or sender is activated by this PR. */
(function (root) {
  const sameBinding = (a, b) => a && b && a.ownerId === b.ownerId && a.installationId === b.installationId && a.consentRevision === b.consentRevision;
  const valid = value => value && value.schema === 'crewcheck-notice-v1' && ['ownerId', 'installationId', 'eventKey'].every(key => typeof value[key] === 'string' && value[key].length >= 8 && value[key].length <= 160) && Number.isSafeInteger(value.consentRevision) && value.consentRevision > 0 && value.route === '/app';
  function indexedStore(indexedDB) {
    const database = new Promise((resolve, reject) => {
      const request = indexedDB.open('crewcheck-notification-installation-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const transaction = async (operation) => {
      const db = await database;
      return new Promise((resolve, reject) => {
        const tx = db.transaction('state', 'readwrite'), store = tx.objectStore('state'); let value;
        tx.oncomplete = () => resolve(value); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
        operation(store, result => { value = result; });
      });
    };
    return {
      binding: () => transaction((store, done) => { const req = store.get('binding'); req.onsuccess = () => done(req.result || null); }),
      setBinding: binding => transaction((store, done) => { store.put(binding, 'binding'); done(null); }),
      claim: (key, envelope) => transaction((store, done) => {
        const binding = store.get('binding'); binding.onsuccess = () => {
          if (!sameBinding(binding.result, envelope)) return done(false);
          const req = store.get('event:' + key); req.onsuccess = () => { if (req.result) return done(false); store.put({ status: 'displaying', expiresAt: envelope.expiresAt }, 'event:' + key); done(true); };
        };
      }),
      record: (key, status) => transaction((store, done) => { store.put({ status }, 'event:' + key); done(null); }),
    };
  }
  async function processPush({ enabled = false, envelope, store, registration, now = Date.now() }) {
    if (enabled !== true || !valid(envelope) || !Number.isFinite(now) || !Number.isFinite(Date.parse(envelope.expiresAt)) || Date.parse(envelope.expiresAt) <= now || !sameBinding(await store.binding(), envelope)) return { status: 'blocked', received: null };
    const key = JSON.stringify([envelope.ownerId, envelope.eventKey, envelope.installationId, envelope.consentRevision]);
    if (!await store.claim(key, envelope)) return { status: 'duplicate_or_revoked', received: null };
    // Check binding again after the persistent claim. Never show account details.
    if (!sameBinding(await store.binding(), envelope)) { await store.record(key, 'revoked'); return { status: 'revoked', received: null }; }
    try {
      await registration.showNotification('CrewCheck', { body: 'Há uma atualização para conferir no CrewCheck.', tag: key, data: { route: '/app', binding: { ownerId: envelope.ownerId, installationId: envelope.installationId, consentRevision: envelope.consentRevision } } });
      await store.record(key, 'display_api_resolved');
      return { status: 'display_api_resolved', received: null }; // Not proof the user received/read it.
    } catch { await store.record(key, 'uncertain'); return { status: 'uncertain', received: null }; }
  }
  async function processClick({ notification, store, clients, origin }) {
    notification.close();
    if (notification.data?.route !== '/app' || !sameBinding(await store.binding(), notification.data.binding)) return { opened: false };
    const target = new URL('/app', origin).href;
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const own = windows.find(client => { try { return new URL(client.url).origin === origin; } catch { return false; } });
    if (own) { await own.navigate(target); await own.focus(); } else await clients.openWindow(target);
    return { opened: true }; // Opening does not declare BIDS complete or acknowledge reading.
  }
  root.CrewCheckPushOffline = { indexedStore, processPush, processClick };
})(typeof self !== 'undefined' ? self : globalThis);
