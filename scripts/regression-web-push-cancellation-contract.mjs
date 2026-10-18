import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { build } from 'esbuild';
import { webcrypto, randomUUID } from 'node:crypto';

// Offline contract fixture: real auth/runtime, worker handler, IndexedDB adapter,
// receiver and registry reducer. Browser primitives, storage, network and time are doubles.
import { changeInstallation, revokeAccountInstallations } from '../server/web-push/installationRegistry.mjs';
const compiled = await build({ stdin: { contents: "export{clearSession,expireSession}from'./client/src/lib/authClient';export{installCrewCheckPushLifecycle,cancelCrewCheckPushDevice}from'./client/src/lib/crewcheckPushRuntime';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false });
const workerSource = fs.readFileSync('client/public/crewcheck-push-offline.js', 'utf8');
const A = 'owner_fixture_A', B = 'owner_fixture_B', installationId = 'installation_fixture_01';
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };

function databaseDouble(state, faults) {
  return { open() { const open = {}; queueMicrotask(() => { open.result = { transaction() {
    const tx = {}; let pending = 0;
    const complete = () => queueMicrotask(() => { if (!pending) tx.oncomplete?.(); });
    const request = run => { const req = {}; pending++; queueMicrotask(() => {
      try { if (faults.database) throw Error('synthetic IndexedDB unavailable'); req.result = run(); req.onsuccess?.(); }
      catch (error) { tx.error = error; tx.onerror?.(); }
      finally { pending--; complete(); }
    }); return req; };
    const store = { get: key => request(() => state.get(key)), put: (value, key) => request(() => state.set(key, structuredClone(value))), count: () => request(() => state.size),
      openCursor() { const entries = [...state]; let index = 0; const req = {}; const next = () => { pending++; queueMicrotask(() => { const item = entries[index++]; req.result = item ? { key: item[0], value: item[1], delete: () => state.delete(item[0]), continue: next } : null; req.onsuccess?.(); pending--; complete(); }); }; next(); return req; } };
    tx.objectStore = () => store; complete(); return tx;
  } }; open.onsuccess?.(); }); return open; } };
}

async function fixture() {
  const binding = { ownerId: A, installationId, consentRevision: 1 };
  const state = new Map([['binding', binding], ['candidateOwner', A], ['generation', 1]]), faults = {};
  const local = new Map([['crewcheck_auth_token', 'synthetic_token_A'], ['crewcheck_auth_user', JSON.stringify({ id: A })], ['crewcheck:notification-installation:v1', installationId]]);
  const storage = { getItem: key => local.get(key) || null, setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k) };
  const window = new EventTarget(); window.location = { origin: 'https://fixture.invalid' };
  const messages = [], acknowledgements = [], requests = [], notifications = [], pending = new Set(), timers = new Map(); let timerId = 0, unsubscribeCalls = 0, subscriptionLookups = 0, lockTail = Promise.resolve(), heldAck;
  const subscription = { unsubscribe: async () => { unsubscribeCalls++; if (faults.unsubscribeThrow) throw Error('synthetic unsubscribe failure'); return !faults.unsubscribeFalse; } };
  const registration = { getNotifications: async () => { if (faults.notifications) throw Error('synthetic notification enumeration failure'); return notifications; }, showNotification: async (title, options) => { notifications.push({ title, ...options, closed: false, close() { this.closed = true; } }); }, pushManager: { getSubscription: async () => { subscriptionLookups++; if (faults.lookupGate) { faults.lookupGate.entered.resolve(); await faults.lookupGate.release.promise; } if (faults.getSubscription) throw Error('synthetic PushManager failure'); return faults.absentSubscription ? null : subscription; } } };
  class Scope {} const self = new Scope(); self.location = window.location; self.indexedDB = databaseDouble(state, faults); self.registration = registration; self.clients = { matchAll: async () => [], openWindow: async () => { throw Error('unexpected navigation'); } };
  const handlers = {}; self.addEventListener = (name, handler) => handlers[name] = handler;
  vm.runInNewContext(workerSource, { self, ServiceWorkerGlobalScope: Scope, URL, Date });
  class Channel { constructor() { this.port1 = { onmessage: null }; this.port2 = { postMessage: data => { const deliver = () => { acknowledgements.push({ action: this.port2.action, data }); this.port1.onmessage?.({ data }); }; if (faults.holdAck && this.port2.action === 'cancel') heldAck = deliver; else queueMicrotask(deliver); } }; } }
  const send = (data, ports = []) => { messages.push(data); if (ports[0]) ports[0].action = data.action; const event = { data, ports, source: { url: 'https://fixture.invalid/app', type: 'window' }, waitUntil(promise) { pending.add(promise); promise.finally(() => pending.delete(promise)); } }; handlers.message(event); };
  registration.active = { postMessage: send };
  const navigator = { locks: { request: (name, run) => { assert.equal(name, 'crewcheck:push-subscription:v1'); const result = lockTail.then(run); lockTail = result.catch(() => {}); return result; } }, serviceWorker: { ready: Promise.resolve(registration), controller: { postMessage: data => send(data) } } };
  let serverRecord = { ownerId: A, email: 'synthetic@fixture.invalid', installationId, revision: 1, active: true };
  const fetch = async (url, options) => {
    assert.equal(url, '/api/platform/notifications/crewcheck-installation'); const body = JSON.parse(options.body); requests.push({ body, authorization: options.headers.authorization });
    assert.equal(body.action, 'revoke'); assert.equal(options.headers.authorization, 'Bearer synthetic_token_A');
    if (faults.network) throw Error('synthetic network offline');
    if (!faults.http401) serverRecord = changeInstallation({ identity: { ownerId: A, email: 'synthetic@fixture.invalid' }, installationId: body.installationId, expectedRevision: serverRecord.revision, action: 'revoke', previous: serverRecord, now: Date.now() });
    return { ok: !faults.http401, status: faults.http401 ? 401 : 200, json: async () => ({}) };
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, window, navigator, localStorage: storage, sessionStorage: storage, Event, CustomEvent: Event, URL, MessageChannel: Channel, console, fetch, setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id), crypto: { ...webcrypto, randomUUID } });
  const api = module.exports, stop = api.installCrewCheckPushLifecycle();
  const drain = async () => { for (let i = 0; i < 12; i++) await turn(); };
  await drain();
  const workerStore = self.CrewCheckPushOffline.indexedStore(self.indexedDB);
  const push = async (eventKey, gate) => self.CrewCheckPushOffline.processPush({ enabled: true, envelope: { schema: 'crewcheck-notice-v1', ...binding, eventKey, route: '/app', expiresAt: new Date(Date.now() + 60000).toISOString(), privateText: 'never-display@fixture.invalid' }, store: gate ? { ...workerStore, claim: async (...args) => { const result = await workerStore.claim(...args); gate.entered.resolve(); await gate.release.promise; return result; } } : workerStore, registration });
  return { workerAPI: self.CrewCheckPushOffline, workerStore, api, state, faults, local, window, navigator, registration, messages, acknowledgements, requests, notifications, timers, push, stop, drain, subscription, unsubscribeCalls: () => unsubscribeCalls, subscriptionLookups: () => subscriptionLookups, serverRecord: () => serverRecord, releaseAck: () => { faults.holdAck = false; heldAck?.(); }, switchOwner(owner) { local.set('crewcheck_auth_token', 'synthetic_token_' + (owner === A ? 'A' : 'B')); local.set('crewcheck_auth_user', JSON.stringify({ id: owner })); window.dispatchEvent(new Event('crewcheck:auth-changed')); }, clearElsewhere() { local.clear(); window.dispatchEvent(Object.assign(new Event('storage'), { key: null })); } };
}

// Normal explicit logout: old token is used only by the existing revoke endpoint;
// actual worker ACK invalidates binding, closes old notices and precedes unsubscribe.
{
  const f = await fixture(); await f.push('before_logout_01'); assert.equal(f.notifications.length, 1); assert(!JSON.stringify({ title: f.notifications[0].title, body: f.notifications[0].body }).includes('@'));
  f.api.clearSession(); await f.drain();
  assert.equal(f.state.get('binding'), null); assert.equal(f.notifications[0].closed, true); assert.equal(f.unsubscribeCalls(), 1); assert(f.acknowledgements.some(v => v.action === 'cancel' && v.data.ok === true)); assert.equal(f.serverRecord().active, false); assert.equal(f.requests.length, 1);
  assert.equal((await f.push('after_logout_001')).status, 'blocked');
  f.api.clearSession(); f.window.dispatchEvent(new Event('crewcheck:auth-expired')); await f.drain(); assert.equal(f.requests.length, 1, 'no credential means no revoke retry'); assert.equal(f.unsubscribeCalls(), 1); f.stop();
}
// Cross-tab localStorage.clear has no old token: local ACK/unsubscribe only.
{
  const f = await fixture(); await f.push('before_clear_001'); f.clearElsewhere(); await f.drain();
  assert.equal(f.state.get('binding'), null); assert.equal(f.notifications[0].closed, true); assert.equal(f.unsubscribeCalls(), 1); assert.equal(f.requests.length, 0); assert.equal(f.serverRecord().active, true, 'local clear cannot claim remote revocation'); assert.equal((await f.push('after_clear_0001')).status, 'blocked'); f.stop();
}
// Worker ACK is necessary before unsubscribe, including a delayed ACK.
{
  const f = await fixture(); f.faults.holdAck = true; f.clearElsewhere(); await f.drain(); assert.equal(f.unsubscribeCalls(), 0); assert.equal(f.state.get('binding'), null); f.releaseAck(); await f.drain(); assert.equal(f.unsubscribeCalls(), 1); f.stop();
}
// A missing ACK times out without unsubscribe or synthetic remote confirmation.
{
  const f = await fixture(); f.faults.holdAck = true; f.clearElsewhere(); await f.drain(); for (const timeout of [...f.timers.values()]) timeout(); await f.drain(); assert.equal(f.unsubscribeCalls(), 0); assert.equal(f.requests.length, 0); f.releaseAck(); await f.drain(); assert.equal(f.unsubscribeCalls(), 0, 'late ACK cannot turn timed-out cleanup into success'); f.stop();
}
// Local cancellation still protects the old binding when PushManager lookup fails.
{
  const f = await fixture(); f.faults.getSubscription = true; f.clearElsewhere(); await f.drain(); assert.equal(f.state.get('binding'), null, 'PushManager failure must not prevent worker cancellation'); assert.equal((await f.push('after_lookupfail')).status, 'blocked'); assert.equal(f.unsubscribeCalls(), 0); f.stop();
}
// Lookup failure cannot leave previously displayed notifications open either.
{
  const f = await fixture(); await f.push('before_fault_001'); f.faults.getSubscription = true; f.clearElsewhere(); await f.drain(); assert.equal(f.notifications[0].closed, true); f.stop();
}
// B's existing binding rejects late cancellation from A, before subscription access.
{
  const f = await fixture(), ready = deferred(); f.navigator.serviceWorker.ready = ready.promise;
  f.switchOwner(B); await f.drain();
  f.state.set('binding', { ownerId: B, installationId, consentRevision: 2 }); f.state.set('candidateOwner', B); f.state.set('generation', 2);
  ready.resolve(f.registration); await f.drain(); assert.equal(f.state.get('binding').ownerId, B); assert.equal(f.unsubscribeCalls(), 0); assert.equal(f.subscriptionLookups(), 0); assert.equal(f.requests.length, 0); assert.equal((await f.push('old_A_after_B_01')).status, 'blocked'); f.stop();
}
// A→B→A renewal while old cleanup waits must preserve renewed A.
{
  const f = await fixture(), ready = deferred(); f.navigator.serviceWorker.ready = ready.promise;
  f.switchOwner(B); await f.drain(); f.switchOwner(A); ready.resolve(f.registration); await f.drain();
  assert.equal(f.state.get('binding').ownerId, A); assert.equal(f.unsubscribeCalls(), 0); assert.equal(f.messages.filter(v => v.action === 'cancel').length, 1, 'only stale B cleanup reaches worker; A cleanup exits'); f.stop();
}
// Renewal after ACK was sent but before it is consumed also prevents unsubscribe.
{
  const f = await fixture(); f.faults.holdAck = true; f.switchOwner(B); await f.drain(); f.switchOwner(A);
  f.state.set('binding', { ownerId: A, installationId, consentRevision: 3 }); f.state.set('candidateOwner', A); f.releaseAck(); await f.drain(); assert.equal(f.state.get('binding').consentRevision, 3); assert.equal(f.unsubscribeCalls(), 0); f.stop();
}
// Renewal while PushManager lookup awaits also fences the final unsubscribe.
{
  const f = await fixture(), gate = { entered: deferred(), release: deferred() }; f.faults.lookupGate = gate;
  f.switchOwner(B); await gate.entered.promise; f.switchOwner(A); f.state.set('binding', { ownerId: A, installationId, consentRevision: 4 }); f.state.set('candidateOwner', A);
  gate.release.resolve(); await f.drain(); assert.equal(f.unsubscribeCalls(), 0); assert.equal(f.state.get('binding').consentRevision, 4); f.stop();
}
// Offline/401 server replies do not recurse, retry automatically, or stop local cleanup.
for (const failure of ['network', 'http401']) {
  const f = await fixture(); f.faults[failure] = true; f.api.expireSession(); await f.drain();
  assert.equal(f.requests.length, 1); assert.equal(f.serverRecord().active, true); assert.equal(f.state.get('binding'), null); assert.equal(f.unsubscribeCalls(), 1);
  f.window.dispatchEvent(new Event('focus')); f.window.dispatchEvent(new Event('online')); f.api.expireSession(); await f.drain(); assert.equal(f.requests.length, 1, 'no background revoke retries after credential loss'); f.stop();
}
// Subscription absent, false or rejected: binding stays cancelled, no invented retry.
for (const failure of ['absentSubscription', 'unsubscribeFalse', 'unsubscribeThrow']) {
  const f = await fixture(); f.faults[failure] = true; f.clearElsewhere(); await f.drain();
  assert.equal(f.state.get('binding'), null); assert.equal(f.unsubscribeCalls(), failure === 'absentSubscription' ? 0 : 1); assert.equal(f.requests.length, 0);
  assert.equal((await f.push('after_unsubfault')).status, 'blocked'); f.window.dispatchEvent(new Event('focus')); await f.drain(); assert.equal(f.unsubscribeCalls(), failure === 'absentSubscription' ? 0 : 1); f.stop();
}
// Database rejection yields a negative worker ACK; never unsubscribe blindly.
{
  const f = await fixture(); f.faults.database = true; f.clearElsewhere(); await f.drain(); assert.equal(f.unsubscribeCalls(), 0); assert.equal(f.requests.length, 0); assert.equal(f.state.get('binding').ownerId, A, 'storage failure cannot be claimed as durable cancellation'); f.stop();
}
// Revocation between durable claim and final display check suppresses stale notice.
{
  const f = await fixture(), gate = { entered: deferred(), release: deferred() };
  const pending = f.push('race_claim_00001', gate); await gate.entered.promise; f.switchOwner(B); await f.drain(); gate.release.resolve();
  assert.equal((await pending).status, 'revoked'); assert.equal(f.notifications.length, 0); f.stop();
}
// A stale displayed notice can only close after switching accounts, never navigate.
{
  const f = await fixture(); await f.push('stale_click_0001'); const notice = f.notifications[0]; f.switchOwner(B); await f.drain();
  let opened = 0;
  const result = await f.workerAPI.processClick({ notification: notice, store: f.workerStore, clients: { matchAll: async () => { opened++; return []; }, openWindow: async () => { opened++; } }, origin: 'https://fixture.invalid' });
  assert.equal(result.opened, false); assert.equal(opened, 0); assert.equal(notice.closed, true); f.stop();
}
// An unavailable registration cannot be represented as confirmed cancellation.
{
  const f = await fixture(); f.navigator.serviceWorker.ready = Promise.reject(Error('synthetic worker unavailable')); f.clearElsewhere(); await f.drain();
  assert.equal(f.state.get('binding').ownerId, A); assert.equal(f.unsubscribeCalls(), 0); assert.equal(f.requests.length, 0); f.stop();
}
// Explicit cancel uses the same safety boundary even if PushManager lookup fails.
{
  const f = await fixture(); f.faults.getSubscription = true;
  const result = await f.api.cancelCrewCheckPushDevice().catch(() => ({ status: 'threw' }));
  assert.equal(f.state.get('binding'), null, 'explicit cancel: PushManager failure must not prevent worker cancellation');
  assert.equal(result.status, 'local_cancellation_unconfirmed'); assert.equal(result.serverRevocationConfirmed, true); assert.equal(f.serverRecord().active, false); assert.equal(f.requests.length, 1); assert.equal(f.unsubscribeCalls(), 0); f.stop();
}
for (const failure of ['none', 'absentSubscription', 'unsubscribeFalse', 'unsubscribeThrow']) {
  const f = await fixture(); f.faults[failure] = true; const result = await f.api.cancelCrewCheckPushDevice();
  assert.equal(result.status, ['none', 'absentSubscription'].includes(failure) ? 'inactive' : 'local_cancellation_unconfirmed');
  assert.equal(result.serverRevocationConfirmed, true); assert.equal(f.state.get('binding'), null); assert.equal(f.serverRecord().active, false); assert.equal(f.requests.length, 1); f.stop();
}
// Account switch while explicit cancellation awaits lookup preserves B's binding.
{
  const f = await fixture(), gate = { entered: deferred(), release: deferred() }; f.faults.lookupGate = gate;
  const cancelling = f.api.cancelCrewCheckPushDevice(); await gate.entered.promise; f.switchOwner(B); f.state.set('binding', { ownerId: B, installationId, consentRevision: 5 }); f.state.set('candidateOwner', B);
  gate.release.resolve(); const result = await cancelling; await f.drain(); assert.equal(result.status, 'account_changed'); assert.equal(result.serverRevocationConfirmed, true); assert.equal(f.unsubscribeCalls(), 0); assert.equal(f.state.get('binding').ownerId, B); assert.equal(f.requests.length, 1); f.stop();
}
// Explicit cancellation rejected by B's binding cannot touch B's subscription/server.
{
  const f = await fixture(); f.state.set('binding', { ownerId: B, installationId, consentRevision: 2 }); f.state.set('candidateOwner', B);
  const result = await f.api.cancelCrewCheckPushDevice(); assert.equal(result.status, 'local_cancellation_unconfirmed'); assert.equal(result.serverRevocationConfirmed, false); assert.equal(f.state.get('binding').ownerId, B); assert.equal(f.subscriptionLookups(), 0); assert.equal(f.requests.length, 0); assert.equal(f.unsubscribeCalls(), 0); f.stop();
}
// Actual server revocation function with transaction/query doubles: repeated revoke
// is idempotent for an already inactive record (not an HTTP/auth integration test).
{
  const identity = { ownerId: A, email: 'synthetic@fixture.invalid' };
  let record = { ...identity, installationId, revision: 1, active: true }, binding = { ...record }, commits = 0;
  const connection = { beginTransaction: async () => {}, commit: async () => { commits++; }, rollback: async () => { throw Error('unexpected rollback'); }, release() {}, query: async (sql, args) => {
    if (sql.startsWith('SELECT public_id')) return [[{ public_id: A }]];
    if (sql.startsWith('SELECT payload')) return [[{ payload: binding }]];
    if (sql.startsWith('SELECT state_key')) return [[{ state_key: 'fixture_endpoint', payload: record }]];
    if (sql.startsWith('UPDATE')) { if (args[1] === 'fixture_endpoint') record = JSON.parse(args[0]); else binding = JSON.parse(args[0]); return [{}]; }
    throw Error('unexpected SQL');
  } };
  const db = { getConnection: async () => connection };
  assert.equal((await revokeAccountInstallations(db, identity, installationId, Date.now())).revoked, 1);
  assert.equal((await revokeAccountInstallations(db, identity, installationId, Date.now())).revoked, 0);
  assert.equal(record.active, false); assert.equal(record.revision, 2); assert.equal(binding.active, false); assert.equal(binding.revision, 2); assert.equal(commits, 2);
}
console.log('PASS 27 synthetic cancellation runtime→worker/server scenarios; no browser, network, provider, credentials or physical delivery.');
