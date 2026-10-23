import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = { URL, Date, structuredClone }; vm.createContext(context);
vm.runInContext(fs.readFileSync('client/public/crewcheck-push-offline.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('client/public/crewcheck-gate-receiver-offline.js', 'utf8'), context);
globalThis.fetch = () => { throw Error('External network forbidden'); };
const api = context.CrewCheckGateReceiverOffline, now = Date.parse('2032-10-14T12:00:00Z');
const binding = { ownerId: 'owner_fixture_A', installationId: 'installation_fixture_01', consentRevision: 2, topicRevision: 3, authorityEpoch: 'epoch_fixture_01' };
const envelope = { schema: 'crewcheck-notice-v1', ...binding, eventKey: 'gate-change-v1:' + 'a'.repeat(64), expiresAt: new Date(now + 60_000).toISOString(), route: '/app' };
const request = { ...binding, requestId: 'revocation_fixture_01' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const turn = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  let topic = { ...binding, active: true }, global = { ...binding }, clock = now, tail = Promise.resolve();
  const rows = new Map(), notifications = [], faults = {};
  let shown = 0, commits = 0;
  const locks = { request(name, options, run) { assert.equal(name, 'crewcheck:gate-notice:v1'); assert.equal(options.mode, 'exclusive'); const result = tail.then(run); tail = result.catch(() => {}); return result; } };
  const store = { binding: async () => global, gateBinding: async () => structuredClone(topic),
    invalidateGate: async expected => {
      if (faults.persist) throw Error('synthetic persistence unavailable');
      if (!topic || !Object.keys(binding).every(key => expected[key] === topic[key])) return false;
      topic = { ...topic, active: false }; commits++; return true;
    }, claim: async key => { if (rows.has(key)) return false; rows.set(key, 'claimed'); return true; }, record: async (key, status) => rows.set(key, status) };
  const registration = { getNotifications: async () => { if (faults.enumerate) throw Error('synthetic enumeration unavailable'); return notifications; },
    showNotification: async (_title, options) => {
      if (faults.displayGate) { faults.displayEntered.resolve(); await faults.displayGate.promise; }
      shown++; notifications.push({ ...options, closed: false, close() { if (faults.dismiss) throw Error('synthetic dismissal unavailable'); this.closed = true; } });
    } };
  const create = () => api.create({ enabled: true, locks, store, registration, processPush: context.CrewCheckPushOffline.processPush, clock: () => clock });
  return { create, store, locks, registration, faults, notifications, get topic() { return topic; }, set topic(v) { topic = v; },
    get shown() { return shown; }, get commits() { return commits; }, set clock(v) { clock = v; }, set global(v) { global = v; } };
}
let passed = 0; const test = async (name, fn) => { await fn(); passed++; console.log('PASS ' + name); };
await test('OFF does not read dependency getters; no lock means no enabled receiver', async () => {
  const forbidden = new Proxy({}, { get() { throw Error('OFF touched dependency'); } });
  assert.equal((await api.create({ store: forbidden, locks: forbidden }).revoke(request)).ack, null);
  assert.throws(() => api.create({ enabled: true }));
  assert(fs.readFileSync('client/public/sw.js', 'utf8').includes('crewcheck-gate-receiver-offline'), 'shipping worker reuses existing fence; server host remains OFF');
  assert.match(fs.readFileSync('server/web-push/gateHost.mjs','utf8'), /CREWCHECK_GATE_HOST_ENABLED = false/);
});
await test('revocation ACK cannot overtake pending display; late in-flight notice is blocked after ACK', async () => {
  const f = fixture(), receiver = f.create(); f.faults.displayGate = deferred(); f.faults.displayEntered = deferred();
  const display = receiver.receive(envelope); await f.faults.displayEntered.promise;
  let acknowledged = false; const revoke = receiver.revoke(request).then(value => { acknowledged = true; return value; });
  const inTransit = f.create().receive({ ...envelope, eventKey: 'gate-change-v1:' + 'b'.repeat(64) });
  await turn(); assert.equal(acknowledged, false); assert.equal(f.commits, 0);
  f.faults.displayGate.resolve(); assert.equal((await display).status, 'display_api_resolved');
  const result = await revoke; assert.equal(result.ack.requestId, request.requestId); assert.equal(result.ack.received, null);
  assert.equal(f.topic.active, false); assert(f.notifications.every(n => n.closed));
  assert.equal((await inTransit).status, 'revoked'); assert.equal(f.shown, 1);
  assert.equal((await f.create().receive({ ...envelope, eventKey: 'gate-change-v1:' + 'c'.repeat(64) })).status, 'revoked');
});
await test('revocation queued first blocks display before entering platform API', async () => {
  const f = fixture(); const revoked = f.create().revoke(request), display = f.create().receive(envelope);
  assert.equal((await revoked).status, 'local_fence_confirmed'); assert.equal((await display).status, 'revoked'); assert.equal(f.shown, 0);
});
await test('stale owner/revision revoke cannot erase a newer binding', async () => {
  for (const delta of [{ ownerId: 'owner_fixture_B' }, { installationId: 'installation_fixture_02' }, { consentRevision: 3 }, { topicRevision: 4 }, { authorityEpoch: 'epoch_fixture_02' }]) {
    const f = fixture(); f.topic = { ...f.topic, ...delta }; const before = structuredClone(f.topic);
    assert.equal((await f.create().revoke(request)).ack, null); assert.deepEqual(f.topic, before); assert.equal(f.commits, 0);
  }
});
for (const fault of ['persist', 'enumerate', 'dismiss']) await test(fault + ' failure never returns a confirmation ACK', async () => {
  const f = fixture(); await f.create().receive(envelope); f.faults[fault] = true;
  assert.equal((await f.create().revoke(request)).ack, null);
  if (fault !== 'persist') { assert.equal(f.topic.active, false); assert.equal((await f.create().receive({ ...envelope, eventKey: 'gate-change-v1:' + 'd'.repeat(64) })).status, 'revoked'); }
});
await test('retry ACK is correlated and idempotent; it cannot grant or renew a binding', async () => {
  const f = fixture(); const first = await f.create().revoke(request);
  const retry = await f.create().revoke({ ...request, requestId: 'revocation_fixture_02' });
  assert.equal(first.ack.requestId, request.requestId); assert.equal(retry.ack.requestId, 'revocation_fixture_02'); assert.equal(f.topic.active, false);
  assert(api.matchesAck(first.ack, request));
  assert(!api.matchesAck(first.ack, { ...request, requestId: 'revocation_fixture_02' }));
  for (const delta of [{ ownerId: 'owner_fixture_B' }, { installationId: 'installation_fixture_02' }, { consentRevision: 3 }, { topicRevision: 4 }, { authorityEpoch: 'epoch_fixture_02' }]) assert(!api.matchesAck(first.ack, { ...request, ...delta }));
});
await test('unknown/absent topic binding is not acknowledged as revoked or silently admitted', async () => {
  const f = fixture(); f.topic = null; assert.equal((await f.create().receive(envelope)).status, 'revoked'); assert.equal((await f.create().revoke(request)).ack, null);
});
await test('only matching gate tray entries are closed; other topic/account entries remain', async () => {
  const f = fixture(); const unrelated = [{ ...envelope, eventKey: 'bids_fixture_event' }, { ...envelope, ownerId: 'owner_fixture_B' }].map(value => ({ data: { envelope: value }, closed: false, close() { this.closed = true; } }));
  f.notifications.push(...unrelated); await f.create().receive(envelope); assert.equal((await f.create().revoke(request)).status, 'local_fence_confirmed');
  assert(unrelated.every(n => !n.closed)); assert.equal(f.notifications.at(-1).closed, true);
});
await test('expired or wrong binding envelope never reaches platform display', async () => {
  for (const delta of [{ topicRevision: 4 }, { ownerId: 'owner_fixture_B' }, { expiresAt: new Date(now).toISOString() }, { topicRevision: undefined }, { authorityEpoch: undefined }, { authorityEpoch: 'epoch_fixture_02' }, { authorityEpoch: 'Epoch_fixture_01' }, { authorityEpoch: { value: binding.authorityEpoch } }]) {
    const f = fixture(); await f.create().receive({ ...envelope, ...delta }); assert.equal(f.shown, 0);
  }
});
await test('mutable request cannot redirect a queued revocation to another account', async () => {
  const f = fixture(), mutable = { ...request }; const result = f.create().revoke(mutable); mutable.ownerId = 'owner_fixture_B';
  assert.equal((await result).ack.ownerId, binding.ownerId);
});
await test('epoch replacement rejects in-transit old envelopes and stale ACKs without touching new owner scope', async () => {
  const f = fixture(); const oldAck = (await f.create().revoke(request)).ack;
  f.topic = { ...binding, authorityEpoch: 'epoch_fixture_02', active: true };
  const current = { ...envelope, authorityEpoch: 'epoch_fixture_02' };
  assert.equal((await f.create().receive(envelope)).status, 'revoked');
  assert.equal((await f.create().revoke(request)).ack, null);
  assert.equal(f.topic.active, true);
  assert(!api.matchesAck(oldAck, { ...request, authorityEpoch: current.authorityEpoch }));
  assert.equal((await f.create().receive(current)).status, 'display_api_resolved');
  assert.equal(f.shown, 1);
  assert.equal((await f.create().receive(current)).status, 'duplicate_or_revoked');
});
await test('epoch changed during persistent claim is revalidated before display', async () => {
  const f=fixture(),claim=f.store.claim;
  f.store.claim=async (...args)=>{const result=await claim(...args);f.topic={...f.topic,authorityEpoch:'epoch_fixture_02'};return result;};
  assert.equal((await f.create().receive(envelope)).status,'revoked');assert.equal(f.shown,0);
});
await test('generic worker and click handler cannot admit gate envelopes without verified topic scope', async () => {
  const f = fixture();
  const generic = { ...f.store }; delete generic.gateBinding;
  assert.equal((await context.CrewCheckPushOffline.processPush({enabled:true,envelope,store:generic,registration:f.registration,now})).status, 'blocked');
  const n = { close(){}, data:{route:'/app',envelope,binding} };
  const clients = {matchAll(){throw Error('stale click must not navigate');}};
  assert.equal((await context.CrewCheckPushOffline.processClick({notification:n,store:generic,clients,origin:'https://fixture.test'})).opened,false);
  f.topic = { ...binding, authorityEpoch:'epoch_fixture_02', active:true };
  assert.equal((await context.CrewCheckPushOffline.processClick({notification:n,store:f.store,clients,origin:'https://fixture.test'})).opened,false);
  assert.equal(f.shown,0);
});
console.log(JSON.stringify({ passed, externalCalls: 0, physicalDelivery: false, nativeIntegration: false, productionEnabled: false }));
