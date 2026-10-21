import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createOfflineGatePushCandidate } from '../server/web-push/gateCandidate.mjs';

globalThis.fetch = () => { throw Error('Real network forbidden'); };
const NOW = Date.parse('2032-10-14T12:00:00Z');
const identity = { flight: 'LA100', origin: 'GRU', destination: 'REC', departureDate: '2032-10-14', scheduledDepartureUtc: '2032-10-14T13:00:00Z' };
const observation = (gate = '24', offset = -60_000) => ({ ok: true, provider: 'custom', ...identity, gate,
  departureGateUpdate: { schema: 'crewcheck.departure-gate-update.v1', ...identity, gate, updatedAt: new Date(NOW + offset).toISOString() } });
const state = () => ({ ownerId: 'owner_fixture_A', rosterRevision: 'roster_fixture_v1', identity,
  manualGate: '17', installation: { ownerId: 'owner_fixture_A', installationId: 'installation_fixture_01', revision: 1, active: true },
  consent: { ownerId: 'owner_fixture_A', installationId: 'installation_fixture_01', installationRevision: 1, revision: 1, enabled: true, topic: 'departure-gate-change' }, observation: observation() });
let passed = 0;
const test = async (name, run) => { await run(); passed++; console.log('PASS ' + name); };
function fixture() {
  let current = state(), now = NOW, reads = 0, sends = 0, displays = 0, hook = () => {}, throwSend = false;
  const records = new Map(), tails = new Map(), displayed = new Set(), envelopes = [];
  const worker = { URL, Date }; vm.createContext(worker);
  vm.runInContext(fs.readFileSync('client/public/crewcheck-push-offline.js', 'utf8'), worker);
  const store = { binding: async () => ({ ownerId: current.ownerId, installationId: current.installation.installationId, consentRevision: current.installation.revision }),
    claim: async key => { if (displayed.has(key)) return false; displayed.add(key); return true; }, record: async () => {} };
  const repository = {
    isCurrent: async installation => current.installation.active && installation.ownerId === current.ownerId && installation.revision === current.installation.revision,
    async transaction(key, run) {
      const before = tails.get(key) || Promise.resolve(); let release;
      const tail = new Promise(resolve => { release = resolve; }); tails.set(key, tail);
      await before;
      try { let saved; const result = await run({ ...structuredClone(records.get(key)), save: async value => { saved = structuredClone(value); } });
        if (saved) records.set(key, saved); return result;
      } finally { release(); if (tails.get(key) === tail) tails.delete(key); }
    }
  };
  const host = { kind: 'isolated-gate-authority', read: async () => { reads++; hook(reads); return structuredClone(current); } };
  const mockProvider = { kind: 'isolated-web-push-mock', send: async envelope => {
    sends++; envelopes.push(structuredClone(envelope)); if (throwSend) throw Error('synthetic unknown outcome');
    await worker.CrewCheckPushOffline.processPush({ enabled: true, envelope, store, now, clock: () => now,
      registration: { showNotification: async (title, options) => { displays++; assert.equal(title, 'CrewCheck'); assert.equal(options.body, 'Há uma atualização para conferir no CrewCheck.'); } } });
    return { accepted: true };
  } };
  const create = () => createOfflineGatePushCandidate({ enabled: true, host, repository, mockProvider, clock: () => now });
  return { create, records, envelopes, store, worker, get current() { return current; }, set current(v) { current = v; },
    get sends() { return sends; }, get displays() { return displays; }, set hook(v) { hook = v; }, set now(v) { now = v; }, set throwSend(v) { throwSend = v; } };
}
await test('default OFF touches no host/repository/provider/configuration', async () => {
  const forbidden = new Proxy({}, { get() { throw Error('OFF must not inspect dependencies'); } });
  assert.deepEqual(await createOfflineGatePushCandidate({ host: forbidden, repository: forbidden, mockProvider: forbidden }).process(), { status: 'disabled', received: null });
  assert.throws(() => createOfflineGatePushCandidate({ enabled: true, host: { kind: 'live' } }));
});
await test('producer -> existing dispatcher -> actual worker: baseline then one change, concurrent dedup and recreation', async () => {
  const f = fixture(), p = f.create(); assert.equal((await p.process()).status, 'baseline'); assert.equal(f.sends, 0);
  f.current.observation = observation('25', -30_000);
  const results = await Promise.all(Array.from({ length: 8 }, () => p.process()));
  assert.equal(f.sends, 1); assert.equal(f.displays, 1); assert(results.every(r => r.received === null));
  await f.create().process(); assert.equal(f.sends, 1, 'recreated producer preserves host claims');
  assert.equal(f.current.manualGate, '17', 'manual gate remains untouched');
  const serialized = JSON.stringify(f.envelopes[0]);
  for (const secret of ['LA100', 'GRU', 'REC', '24', '25', 'owner_fixture_A@example.test', 'manualGate']) {
    if (/^\d+$/.test(secret)) continue; assert(!serialized.includes(secret), 'opaque lock-screen envelope');
  }
});
const invalidCases = [
  ['no topic consent', s => { s.consent.enabled = false; }],
  ['BIDS consent is not gate consent', s => { s.consent.topic = 'bids'; }],
  ['other owner consent', s => { s.consent.ownerId = 'owner_fixture_B'; }],
  ['old installation revision consent', s => { s.consent.installationRevision = 2; }],
  ['revoked installation', s => { s.installation.active = false; }],
  ['other flight', s => { s.observation.flight = 'LA101'; }],
  ['other route', s => { s.observation.destination = 'SSA'; }],
  ['other day', s => { s.observation.scheduledDepartureUtc = '2032-10-15T13:00:00Z'; }],
  ['source lacks gate field proof', s => { delete s.observation.departureGateUpdate; s.observation.updatedAt = NOW; }],
  ['arrival gate only', s => { delete s.observation.gate; s.observation.arrival = { gate: '99' }; }],
  ['generic provider update is not field proof', s => { delete s.observation.departureGateUpdate; s.observation.lastUpdatedUtc = new Date(NOW).toISOString(); }],
  ['future source', s => { s.observation.departureGateUpdate.updatedAt = new Date(NOW + 1).toISOString(); }],
  ['stale source', s => { s.observation.departureGateUpdate.updatedAt = new Date(NOW - 31 * 60_000).toISOString(); }],
  ['source disagreement', s => { s.observation.operationalConflicts = ['gate']; }],
  ['unknown label', s => { s.observation = observation('A CONFIRMAR', -30_000); }],
  ['aircraft position', s => { s.observation = observation('POS 42', -30_000); }],
];
for (const [name, mutate] of invalidCases) await test(name + ' cannot enqueue/display', async () => {
  const f = fixture(); await f.create().process(); f.current.observation = observation('25', -30_000); mutate(f.current);
  assert.equal((await f.create().process()).status, 'blocked'); assert.equal(f.sends, 0); assert.equal(f.displays, 0);
});
await test('out of order and equal-time conflict do not announce an arbitrary gate', async () => {
  const f = fixture(), p = f.create(); await p.process();
  f.current.observation = observation('25', -90_000); assert.equal((await p.process()).reason, 'older-source');
  f.current.observation = observation('25', -60_000); assert.equal((await p.process()).reason, 'equal-time-conflict');
  f.current.observation = observation('26', -30_000); assert.equal((await p.process()).status, 'baseline'); assert.equal(f.sends, 0);
  f.current.observation = observation('27', -10_000); await p.process(); assert.equal(f.sends, 1);
});
await test('same gate with newer evidence is not another event', async () => {
  const f = fixture(), p = f.create(); await p.process(); f.current.observation = observation('24', -30_000);
  assert.equal((await p.process()).status, 'baseline'); assert.equal(f.sends, 0);
});
await test('stale baseline cannot manufacture a new change from a fresh source', async () => {
  const f = fixture(); await f.create().process(); f.now = NOW + 30 * 60_000;
  f.current.observation = observation('25', 29 * 60_000);
  assert.equal((await f.create().process()).status, 'baseline'); assert.equal(f.sends, 0);
});
await test('expiry during asynchronous host admission suppresses dispatch', async () => {
  const f = fixture(); await f.create().process(); f.current.observation = observation('25', -30_000);
  let n = 0; f.hook = () => { if (++n === 3) f.now = NOW + 31 * 60_000; };
  await f.create().process(); assert.equal(f.sends, 0);
});
for (const cut of [2, 3, 4, 5]) await test('revocation at host read ' + cut + ' suppresses dispatch', async () => {
  const f = fixture(); await f.create().process(); f.current.observation = observation('25', -30_000);
  let n = 0; f.hook = () => { if (++n === cut) f.current.installation.active = false; };
  await f.create().process(); assert.equal(f.sends, 0); assert.equal(f.displays, 0);
});
await test('owner, consent and roster replacements establish a fresh baseline without backfill', async () => {
  for (const field of ['owner', 'consent', 'roster']) {
    const f = fixture(); await f.create().process(); f.current.observation = observation('25', -30_000);
    if (field === 'owner') { f.current.ownerId = 'owner_fixture_B'; f.current.installation.ownerId = 'owner_fixture_B'; f.current.consent.ownerId = 'owner_fixture_B'; }
    if (field === 'consent') f.current.consent.revision++;
    if (field === 'roster') f.current.rosterRevision = 'roster_fixture_v2';
    assert.equal((await f.create().process()).status, 'baseline'); assert.equal(f.sends, 0);
  }
});
await test('uncertain provider outcome is held, never automatically retried', async () => {
  const f = fixture(); await f.create().process(); f.current.observation = observation('25', -30_000); f.throwSend = true;
  assert.equal((await f.create().process()).results[0].status, 'uncertain');
  await f.create().process(); assert.equal(f.sends, 1); assert.equal(f.displays, 0);
});
await test('existing receiver rejects other binding and expired gate envelope', async () => {
  const f = fixture(); await f.create().process(); f.current.observation = observation('25', -30_000); await f.create().process();
  const envelope = { ...f.envelopes[0], eventKey: 'different_fixture_event' };
  const run = extra => f.worker.CrewCheckPushOffline.processPush({ enabled: true, envelope, store: f.store, now: NOW, registration: { showNotification: () => { throw Error('unexpected'); } }, ...extra });
  assert.equal((await run({ envelope: { ...envelope, ownerId: 'owner_fixture_B' } })).status, 'blocked');
  assert.equal((await run({ now: Date.parse(envelope.expiresAt) })).status, 'blocked');
});
console.log(JSON.stringify({ passed, networkCalls: 0, realMessages: 0, physicalDelivery: false, productionEnabled: false, repository: 'synthetic transactional adapter; not SQL durability certification' }));
