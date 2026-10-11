import assert from 'node:assert/strict';
import test from 'node:test';

import {
  diffMyCrewCareFacts,
  isMyCrewCareTravelUrl,
  reconcileMyCrewCareLogistics,
  selectMyCrewCareHotel,
  selectMyCrewCarePickup,
} from '../shared/myCrewCareLogistics.mjs';
import { createMyCrewCarePersistentSession } from '../shared/myCrewCarePersistentSession.mjs';
import { MYCREWCARE_BACKGROUND_CAPABILITY, planMyCrewCareSync } from '../shared/myCrewCareSyncPolicy.mjs';
import { createMyCrewCareNativeAdapter } from '../shared/myCrewCareNativeAdapter.mjs';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const context = Object.freeze({
  accountId: 'account-1',
  rosterId: 'roster-2026-10',
  rosterRevision: 'rev-42',
  providerSubject: 'provider-subject-7',
});
const stay = Object.freeze({
  id: 'stay-1',
  rosterEventId: 'event-1',
  rosterEventKind: 'stay',
  source: 'persisted-platform-stay',
  localOnly: false,
  ...context,
  airport: 'FOR',
  pairingId: 'PAIR-22',
  hotelName: null,
  timeZone: 'America/Fortaleza',
  startAt: '2026-10-09T18:00:00Z',
  endAt: '2026-10-10T12:00:00Z',
});
const record = Object.freeze({
  direction: 'to_airport',
  date: '2026-10-10',
  time: '05:10',
  airport: 'FOR',
  pairingId: 'PAIR-22',
  hotelName: 'Hotel Atlântico',
  providerRecordId: 'transport-91',
  hotelAddress: 'Av. Beira Mar, 100',
  hotelPhone: '+55 85 3000-0000',
  pickupLocation: 'Recepção do hotel',
  transportProvider: 'Van Operacional',
  transportPhone: '+55 85 99999-0000',
  transitMinutes: 35,
  status: 'published',
});

function envelope(request, records = [record], extra = {}) {
  return {
    schemaVersion: 3,
    requestId: request.requestId,
    context: request.context,
    authenticated: true,
    providerSubject: context.providerSubject,
    url: 'https://api2.apicrewcare.com/LATAM/mytravel.aspx',
    observedAt: new Date(NOW).toISOString(),
    records,
    emptyConfirmed: records.length === 0,
    ...extra,
  };
}

class MemoryStorage {
  constructor() { this.values = new Map(); }
  read(accountId) { return this.values.get(accountId) ?? null; }
  write(accountId, value) { this.values.set(accountId, value); }
  clear(accountId) { this.values.delete(accountId); }
}

test('travel URL is exact and HTTPS-only', () => {
  assert.equal(isMyCrewCareTravelUrl('https://api2.apicrewcare.com/LATAM/mytravel.aspx'), true);
  assert.equal(isMyCrewCareTravelUrl('http://api2.apicrewcare.com/LATAM/mytravel.aspx'), false);
  assert.equal(isMyCrewCareTravelUrl('https://api2.apicrewcare.com.evil.test/LATAM/mytravel.aspx'), false);
  assert.equal(isMyCrewCareTravelUrl('https://identity@api2.apicrewcare.com/LATAM/mytravel.aspx'), false);
});

test('reconciliation creates separate hotel and pickup facts for one persisted stay', () => {
  const result = reconcileMyCrewCareLogistics({
    context,
    stays: [stay],
    snapshot: { observedAt: new Date(NOW).toISOString(), records: [record] },
    now: NOW,
  });
  assert.equal(result.accepted, true);
  assert.equal(result.facts.length, 2);
  const hotel = selectMyCrewCareHotel(result.facts, stay.id, { now: NOW });
  const pickup = selectMyCrewCarePickup(result.facts, stay.id, { now: NOW });
  assert.equal(hotel.hotelName, 'Hotel Atlântico');
  assert.equal(hotel.hotelAddress, 'Av. Beira Mar, 100');
  assert.equal(pickup.pickupAt, '2026-10-10T08:10:00.000Z');
  assert.equal(pickup.pickupLocation, 'Recepção do hotel');
  assert.equal(pickup.dataState, 'fresh');
});

test('overlapping candidate stays fail conservatively', () => {
  const second = { ...stay, id: 'stay-2', rosterEventId: 'event-2' };
  const result = reconcileMyCrewCareLogistics({
    context,
    stays: [stay, second],
    snapshot: { observedAt: new Date(NOW).toISOString(), records: [record] },
    now: NOW,
  });
  assert.equal(result.accepted, false);
  assert.equal(result.error, 'ambiguous-provider-data');
  assert.equal(result.conflicts[0].reason, 'ambiguous-stay');
});

test('cancelled pickup remains auditable but is not selected as active', () => {
  const result = reconcileMyCrewCareLogistics({
    context,
    stays: [stay],
    snapshot: { observedAt: new Date(NOW).toISOString(), records: [{ ...record, status: 'cancelled' }] },
    now: NOW,
  });
  assert.equal(result.accepted, true);
  assert.equal(selectMyCrewCarePickup(result.facts, stay.id, { now: NOW }), null);
  assert.equal(selectMyCrewCarePickup(result.facts, stay.id, { now: NOW, includeCancelled: true }).status, 'cancelled');
});

test('fact diff reports provider changes without mutating previous facts', () => {
  const before = reconcileMyCrewCareLogistics({
    context,
    stays: [stay],
    snapshot: { observedAt: new Date(NOW).toISOString(), records: [record] },
    now: NOW,
  }).facts;
  const after = reconcileMyCrewCareLogistics({
    context,
    stays: [stay],
    snapshot: { observedAt: new Date(NOW + 60_000).toISOString(), records: [{ ...record, time: '04:50', status: 'changed' }] },
    now: NOW + 60_000,
  }).facts;
  const diff = diffMyCrewCareFacts(before, after);
  assert.equal(diff.hasChanges, true);
  assert.equal(diff.changed.length, 2);
  assert.equal(before.find((fact) => fact.kind === 'pickup').pickupAt, '2026-10-10T08:10:00.000Z');
});

test('persistent session stores only normalized facts and restores them as cache', async () => {
  const storage = new MemoryStorage();
  const adapter = { read: async (request) => envelope(request) };
  const session = createMyCrewCarePersistentSession({ adapter, storage, now: () => NOW });
  session.setContext(context, [stay]);
  session.setAutomatic(true);
  assert.equal(await session.sync({ reason: 'connected' }), true);
  assert.equal(session.state().connected, true);
  assert.equal(session.hotel(stay.id).hotelName, 'Hotel Atlântico');
  assert.equal(session.hotel(stay.id).hotelAddress, 'Av. Beira Mar, 100');
  assert.equal(session.pickup(stay.id).pickupLocation, 'Recepção do hotel');

  const persisted = storage.read(context.accountId);
  assert.ok(persisted);
  const parsed = JSON.parse(persisted);
  assert.deepEqual(Object.keys(parsed).sort(), ['emptyConfirmed', 'facts', 'schemaVersion', 'scope', 'syncedAt']);
  assert.equal(parsed.facts.length, 2);
  for (const fact of parsed.facts) {
    assert.equal(fact.source, 'mycrewcare');
    assert.equal(fact.accountId, context.accountId);
    assert.equal(fact.stayId, stay.id);
  }

  const restored = createMyCrewCarePersistentSession({ adapter, storage, now: () => NOW + 20 * 60_000 });
  restored.setContext(context, [stay]);
  restored.setAutomatic(true);
  assert.equal(await restored.restore(), true);
  assert.equal(restored.state().status, 'cached');
  assert.equal(restored.state().connected, false);
  assert.equal(restored.pickup(stay.id).dataState, 'cached');
});

test('temporary failure preserves previously verified cache', async () => {
  const storage = new MemoryStorage();
  let fail = false;
  const adapter = {
    read: async (request) => {
      if (fail) throw Object.assign(new Error('network offline'), { code: 'temporary-error' });
      return envelope(request);
    },
  };
  const session = createMyCrewCarePersistentSession({ adapter, storage, now: () => NOW });
  session.setContext(context, [stay]);
  session.setAutomatic(true);
  assert.equal(await session.sync(), true);
  fail = true;
  assert.equal(await session.sync(), false);
  assert.equal(session.state().status, 'offline-cache');
  assert.equal(session.pickup(stay.id).pickupAt, '2026-10-10T08:10:00.000Z');
});

test('verified empty response clears previous facts instead of inventing data', async () => {
  const storage = new MemoryStorage();
  let empty = false;
  const adapter = { read: async (request) => envelope(request, empty ? [] : [record]) };
  const session = createMyCrewCarePersistentSession({ adapter, storage, now: () => NOW });
  session.setContext(context, [stay]);
  session.setAutomatic(true);
  assert.equal(await session.sync(), true);
  empty = true;
  assert.equal(await session.sync(), true);
  assert.equal(session.pickup(stay.id), null);
  assert.equal(JSON.parse(storage.read(context.accountId)).facts.length, 0);
  assert.equal(session.state().changes.removed.length, 2);
});

test('scope change rejects and removes stale cache for the same account', async () => {
  const storage = new MemoryStorage();
  const adapter = { read: async (request) => envelope(request) };
  const first = createMyCrewCarePersistentSession({ adapter, storage, now: () => NOW });
  first.setContext(context, [stay]);
  first.setAutomatic(true);
  assert.equal(await first.sync(), true);

  const nextContext = { ...context, rosterRevision: 'rev-43' };
  const nextStay = { ...stay, rosterRevision: 'rev-43' };
  const second = createMyCrewCarePersistentSession({ adapter, storage, now: () => NOW });
  second.setContext(nextContext, [nextStay]);
  second.setAutomatic(true);
  assert.equal(await second.restore(), false);
  assert.equal(storage.read(context.accountId), null);
});

test('logout clears cache and asks native adapter to forget the account profile', async () => {
  const storage = new MemoryStorage();
  const disconnects = [];
  const adapter = {
    read: async (request) => envelope(request),
    disconnect: async (...args) => disconnects.push(args),
  };
  const session = createMyCrewCarePersistentSession({ adapter, storage, now: () => NOW });
  session.setContext(context, [stay]);
  session.setAutomatic(true);
  await session.sync();
  await session.logout();
  assert.deepEqual(disconnects, [[context.accountId, true]]);
  assert.equal(storage.read(context.accountId), null);
  assert.equal(session.state().hasCachedData, false);
});

test('sync policy never launches an interactive WebView in background', () => {
  const webViewPlan = planMyCrewCareSync({
    now: NOW,
    automatic: true,
    networkAvailable: true,
    foreground: false,
    sessionState: 'validated',
    backgroundCapability: MYCREWCARE_BACKGROUND_CAPABILITY.INTERACTIVE_WEBVIEW,
    lastSuccessAt: NOW - 2 * 24 * 60 * 60_000,
  });
  assert.equal(webViewPlan.action, 'defer-to-foreground');
  assert.equal(webViewPlan.mayOpenInteractiveUi, false);

  const httpPlan = planMyCrewCareSync({
    now: NOW,
    automatic: true,
    networkAvailable: true,
    foreground: false,
    sessionState: 'validated',
    backgroundCapability: MYCREWCARE_BACKGROUND_CAPABILITY.AUTHORIZED_HTTP,
    lastSuccessAt: NOW - 2 * 24 * 60 * 60_000,
  });
  assert.equal(httpPlan.action, 'background-sync');
  assert.equal(httpPlan.backgroundEligible, true);
});

test('rate-limit retry is anchored to the last attempt, not perpetually moved forward', () => {
  const lastAttemptAt = NOW - 2 * 60_000;
  const plan = planMyCrewCareSync({
    now: NOW,
    automatic: true,
    foreground: true,
    networkAvailable: true,
    sessionState: 'validated',
    lastFailure: 'rate-limited',
    retryCount: 0,
    lastAttemptAt,
    lastSuccessAt: NOW - 2 * 24 * 60 * 60_000,
  });
  assert.equal(plan.action, 'idle');
  assert.equal(plan.dueAt, lastAttemptAt + 5 * 60_000);
});

// ---- review round 2: restore races and native cleanup -----------------------
const contextB = Object.freeze({ ...context, accountId: 'account-2', providerSubject: 'provider-subject-8' });
const stayB = Object.freeze({ ...stay, ...contextB, id: 'stay-2' });

async function seed(storage, ctx, st) {
  const session = createMyCrewCarePersistentSession({
    adapter: { read: async (request) => envelope(request, [record], { providerSubject: ctx.providerSubject }) }, storage, now: () => NOW,
  });
  session.setContext(ctx, [st]);
  session.setAutomatic(true);
  assert.equal(await session.sync(), true);
}

// Storage whose reads are released by hand, so completion order is controlled by the test.
class GatedStorage extends MemoryStorage {
  constructor() { super(); this.gates = []; this.clears = []; }
  read(accountId) {
    const value = this.values.get(accountId) ?? null;
    return new Promise((resolve) => this.gates.push(() => resolve(value)));
  }
  clear(accountId) { this.clears.push(accountId); return super.clear(accountId); }
}

test('late restore(A) after switching to B never clears or publishes into B', async () => {
  const storage = new GatedStorage();
  // A holds an unreadable/corrupt payload, which would trigger storage.clear(<account>).
  storage.values.set(context.accountId, '{"corrupt":true}');
  await seed(storage, contextB, stayB);
  const bBefore = storage.values.get(contextB.accountId);
  assert.ok(bBefore);

  const session = createMyCrewCarePersistentSession({ adapter: {}, storage, now: () => NOW });
  session.setContext(context, [stay]);
  session.setAutomatic(true);
  const lateA = session.restore();
  session.setContext(contextB, [stayB]);
  const restoreB = session.restore();
  storage.gates[1](); // B finishes first
  assert.equal(await restoreB, true);
  storage.gates[0](); // A's read finishes after the switch
  assert.equal(await lateA, false);

  assert.deepEqual(storage.clears, [], 'stale restore must not clear anything');
  assert.equal(storage.values.get(contextB.accountId), bBefore, "B's stored cache is untouched");
  assert.equal(session.state().hasCachedData, true, "B's restored cache is not replaced or dropped");
  assert.ok(session.hotel(stayB.id));
  assert.equal(session.hotel(stay.id), null);
});

test('late restore(A) after logout cannot resurrect or clear anything', async () => {
  const storage = new GatedStorage();
  await seed(storage, context, stay);
  const session = createMyCrewCarePersistentSession({ adapter: {}, storage, now: () => NOW });
  session.setContext(context, [stay]);
  session.setAutomatic(true);
  const late = session.restore();
  await session.logout();
  const clearsAfterLogout = storage.clears.length;
  storage.gates[0]();
  assert.equal(await late, false);
  assert.equal(session.state().hasCachedData, false, 'logout data must not come back');
  assert.equal(storage.clears.length, clearsAfterLogout);
  assert.equal(session.state().status, 'disconnected');
});

test('A -> B -> A out of order: only the newest restore may publish or clear', async () => {
  const storage = new GatedStorage();
  await seed(storage, context, stay);
  const goodA = storage.values.get(context.accountId);
  const session = createMyCrewCarePersistentSession({ adapter: {}, storage, now: () => NOW });
  session.setContext(context, [stay]);
  session.setAutomatic(true);
  const first = session.restore();            // gate 0
  session.setContext(contextB, [stayB]);
  const second = session.restore();           // gate 1
  session.setContext(context, [stay]);
  const third = session.restore();            // gate 2
  storage.gates[2]();
  assert.equal(await third, true);
  // Older reads finish afterwards, in the "wrong" order.
  storage.gates[0]();
  storage.gates[1]();
  assert.equal(await first, false);
  assert.equal(await second, false);
  assert.deepEqual(storage.clears, []);
  assert.equal(storage.values.get(context.accountId), goodA);
  assert.ok(session.hotel(stay.id));
});

test('a stale restore that failed to read does not set storage-error on the new account', async () => {
  let rejectA;
  const storage = {
    read: (accountId) => (accountId === context.accountId ? new Promise((_, reject) => { rejectA = reject; }) : null),
    clear: () => assert.fail('nothing may be cleared'),
    write: () => {},
  };
  const session = createMyCrewCarePersistentSession({ adapter: {}, storage, now: () => NOW });
  session.setContext(context, [stay]);
  const late = session.restore();
  session.setContext(contextB, [stayB]);
  await session.restore();
  rejectA(new Error('boom'));
  assert.equal(await late, false);
  assert.notEqual(session.state().status, 'storage-error');
  assert.equal(session.state().lastError, null);
});

test('disconnect during a restore keeps the data erased', async () => {
  const storage = new GatedStorage();
  await seed(storage, context, stay);
  const session = createMyCrewCarePersistentSession({ adapter: {}, storage, now: () => NOW });
  session.setContext(context, [stay]);
  session.setAutomatic(true);
  const late = session.restore();
  await session.disconnect({ forgetData: true });
  storage.gates[0]();
  assert.equal(await late, false);
  assert.equal(session.state().hasCachedData, false);
});

test('cleanup-error stays retryable for the same account, including after logout', async () => {
  let fail = true;
  const cleared = [];
  const disconnected = [];
  const session = createMyCrewCarePersistentSession({
    adapter: { disconnect: async (accountId) => { disconnected.push(accountId); if (fail) throw new Error('profile'); } },
    storage: { clear: async (accountId) => { cleared.push(accountId); }, read: () => null, write: () => {} },
    now: () => NOW,
  });
  session.setContext(context, [stay]);
  session.setAutomatic(true);
  await assert.rejects(session.logout(), /profile-disconnect-failed/);
  assert.equal(session.state().status, 'cleanup-error');
  assert.equal(session.state().cleanupPending, true);
  fail = false;
  await session.disconnect({ forgetData: true });
  assert.equal(session.state().cleanupPending, false);
  assert.deepEqual(disconnected, [context.accountId, context.accountId]);
  assert.deepEqual(cleared, [context.accountId, context.accountId]);
});

// Native bridge double whose cleanup finishes later, like the WebView profile does.
function asyncCleanupBridge({ outcome = 'ok', completeAfterPolls = 2 } = {}) {
  const operations = new Map();
  const polls = [];
  return {
    operations, polls,
    bridge: {
      startMyCrewCareCleanupV3(accountId, forget, id) {
        if (!/^[\w-]{8,80}$/.test(id) || operations.has(`${accountId}|${id}`)) return false;
        operations.set(`${accountId}|${id}`, { polls: 0, forget });
        return true;
      },
      myCrewCareCleanupResultV3(accountId, id) {
        const op = operations.get(`${accountId}|${id}`);
        polls.push([accountId, id]);
        if (!op) return 'unknown';
        op.polls += 1;
        return op.polls > completeAfterPolls ? outcome : 'pending';
      },
    },
  };
}
const instantWait = () => Promise.resolve();

test('native cleanup is awaited until it really finishes (no early success)', async () => {
  const fake = asyncCleanupBridge({ completeAfterPolls: 3 });
  const adapter = createMyCrewCareNativeAdapter({ bridge: fake.bridge, wait: instantWait });
  await adapter.disconnect('account-1', true);
  assert.equal(fake.polls.length, 4, 'kept asking until the native result was ok');
});

test('native cleanup failures and unknown results are propagated, scoped to account + operation', async () => {
  const failing = asyncCleanupBridge({ outcome: 'failed:profile-clear-failed', completeAfterPolls: 1 });
  await assert.rejects(
    createMyCrewCareNativeAdapter({ bridge: failing.bridge, wait: instantWait }).disconnect('account-1', true),
    /native-disconnect-failed/,
  );
  const unknown = asyncCleanupBridge();
  unknown.bridge.myCrewCareCleanupResultV3 = () => 'unknown';
  await assert.rejects(
    createMyCrewCareNativeAdapter({ bridge: unknown.bridge, wait: instantWait }).disconnect('account-1', true),
    /native-disconnect-failed/,
  );
  // Two concurrent cleanups for different accounts never see each other's result.
  const shared = asyncCleanupBridge({ completeAfterPolls: 1 });
  let n = 0;
  const make = () => createMyCrewCareNativeAdapter({ bridge: shared.bridge, wait: instantWait, newOperationId: () => `operation-${++n}-abcdef` });
  await Promise.all([make().disconnect('account-1', true), make().disconnect('account-2', true)]);
  assert.deepEqual([...shared.operations.keys()].sort(), ['account-1|operation-1-abcdef', 'account-2|operation-2-abcdef']);
  assert.ok(shared.polls.every(([account, id]) => shared.operations.has(`${account}|${id}`)));
});

test('native cleanup that never finishes times out as a failure', async () => {
  const stuck = asyncCleanupBridge({ completeAfterPolls: Infinity });
  await assert.rejects(
    createMyCrewCareNativeAdapter({ bridge: stuck.bridge, wait: () => new Promise((r) => setTimeout(r, 2)), cleanupTimeoutMs: 20 }).disconnect('account-1', true),
    /native-disconnect-timeout/,
  );
  // Rejected start and a bridge without the new methods are failures too, never silent success.
  await assert.rejects(createMyCrewCareNativeAdapter({ bridge: { startMyCrewCareCleanupV3: () => false, myCrewCareCleanupResultV3: () => 'ok' }, wait: instantWait }).disconnect('account-1', true), /native-disconnect-failed/);
  await assert.rejects(createMyCrewCareNativeAdapter({ bridge: {}, wait: instantWait }).disconnect('account-1', true), /native-disconnect-failed/);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

for (const action of ['logout', 'disconnect']) {
  for (const writeFails of [false, true]) {
    test(`${action} drains an in-flight ${writeFails ? 'failed' : 'successful'} write before clearing A`, async () => {
      const storage = new MemoryStorage();
      const entered = deferred();
      const finish = deferred();
      const order = [];
      storage.write = async (accountId, payload) => {
        entered.resolve();
        await finish.promise;
        if (writeFails) { order.push('write-failed'); throw new Error('synthetic write failure'); }
        storage.values.set(accountId, payload);
        order.push('write');
      };
      storage.clear = (accountId) => { order.push('clear'); storage.values.delete(accountId); };
      const session = createMyCrewCarePersistentSession({ storage, adapter: { read: async (request) => envelope(request) }, now: () => NOW });
      session.setContext(context, [stay]);
      session.setAutomatic(true);
      const sync = session.sync();
      await entered.promise;
      let cleanupDone = false;
      const cleanup = session[action]().then(() => { cleanupDone = true; });
      await new Promise(setImmediate);
      const completedBeforeWrite = cleanupDone;
      finish.resolve();
      assert.equal(await sync, false);
      await cleanup;
      assert.equal(completedBeforeWrite, false, 'cleanup cannot claim completion while a write can still persist');
      assert.deepEqual(order, [writeFails ? 'write-failed' : 'write', 'clear']);
      assert.equal(storage.values.has(context.accountId), false);
      assert.equal(session.state().hasCachedData, false);
      const restarted = createMyCrewCarePersistentSession({ storage, adapter: {}, now: () => NOW });
      restarted.setContext(context, [stay]);
      assert.equal(await restarted.restore(), false, 'no logged-out cache survives restart');
    });
  }
}

for (const fails of [false, true]) {
  test(`late logout(A) ${fails ? 'failure' : 'success'} preserves B context, cache and consent`, async () => {
    const storage = new MemoryStorage();
    await seed(storage, contextB, stayB);
    const bCache = storage.values.get(contextB.accountId);
    const finish = deferred();
    const session = createMyCrewCarePersistentSession({ storage, adapter: {
      disconnect: () => finish.promise,
      read: async (request) => envelope(request, [record], { providerSubject: request.context.providerSubject }),
    }, now: () => NOW });
    session.setContext(context, [stay]);
    session.setAutomatic(true);
    const cleanup = session.logout();
    const observed = cleanup.then(() => null, (error) => error);
    session.setContext(contextB, [stayB]);
    session.setAutomatic(true);
    assert.equal(await session.restore(), true);
    const before = session.state();
    if (fails) finish.reject(new Error('synthetic cleanup failure')); else finish.resolve();
    const error = await observed;
    assert.equal(Boolean(error), fails);
    assert.deepEqual(session.state(), before);
    assert.equal(storage.values.get(contextB.accountId), bCache);
    assert.ok(session.hotel(stayB.id));
    assert.equal(await session.sync(), true, 'B remains bound and can sync without rebinding');
  });
}

for (const firstFails of [false, true]) {
  test(`repeated disconnect retains the barrier until the oldest cleanup settles (${firstFails ? 'failure' : 'success'})`, async () => {
    const first = deferred(), second = deferred();
    let cleanups = 0, reads = 0;
    const session = createMyCrewCarePersistentSession({ now: () => NOW, storage: new MemoryStorage(), adapter: {
      disconnect: () => (++cleanups === 1 ? first.promise : second.promise),
      read: async (request) => { reads += 1; return envelope(request); },
    } });
    session.setContext(context, [stay]);
    session.setAutomatic(true);
    const earlier = session.disconnect();
    const observed = earlier.then(() => null, (error) => error);
    const later = session.disconnect();
    second.resolve();
    await later;
    assert.equal(session.state().cleanupInProgress, true);
    session.setAutomatic(true);
    assert.equal(await session.sync(), false);
    assert.equal(reads, 0, 'native read must not overlap any pending cleanup');
    if (firstFails) first.reject(new Error('synthetic failure')); else first.resolve();
    assert.equal(Boolean(await observed), firstFails);
    assert.equal(session.state().cleanupInProgress, false);
    assert.equal(session.state().cleanupPending, firstFails);
    assert.equal(session.state().status, firstFails ? 'cleanup-error' : 'disconnected');
    assert.equal(session.state().lastError, firstFails ? 'profile-disconnect-failed' : null);
  });
}

for (const enabled of [false, true]) {
  test(`consent ${enabled} while same-account cleanup fails cannot hide the retry target`, async () => {
    const finish = deferred();
    const targets = [];
    let fail = true;
    const session = createMyCrewCarePersistentSession({ now: () => NOW, storage: new MemoryStorage(), adapter: {
      disconnect: (accountId) => { targets.push(accountId); return fail ? finish.promise : Promise.resolve(); },
    } });
    session.setContext(context, [stay]);
    session.setAutomatic(true);
    const cleanup = session.disconnect();
    const observed = cleanup.then(() => null, (error) => error);
    session.setAutomatic(enabled);
    finish.reject(new Error('synthetic failure'));
    assert.equal((await observed).code, 'profile-disconnect-failed');
    assert.equal(session.state().status, 'cleanup-error');
    assert.equal(session.state().cleanupPending, true);
    assert.equal(session.state().lastError, 'profile-disconnect-failed');
    fail = false;
    await session.disconnect();
    assert.deepEqual(targets, [context.accountId, context.accountId]);
    assert.equal(session.state().cleanupPending, false);
  });
}


test('native timeout releases listener and permits a successful retry', async () => {
  const listeners = new Set();
  const requests = [];
  const events = {
    addEventListener: (_name, fn) => listeners.add(fn),
    removeEventListener: (_name, fn) => listeners.delete(fn),
  };
  const bridge = {
    myCrewCareProtocolVersion: () => 3,
    myCrewCareReleaseEnabled: () => true,
    openMyCrewCareV3(json) {
      const request = JSON.parse(json);
      requests.push(request);
      if (requests.length > 1) queueMicrotask(() => {
        // A late answer from the timed-out request must not satisfy this retry.
        for (const fn of [...listeners]) fn({ detail: envelope(requests[0]) });
        for (const fn of [...listeners]) fn({ detail: envelope(request) });
      });
      return true;
    },
  };
  const session = createMyCrewCarePersistentSession({
    adapter: createMyCrewCareNativeAdapter({ bridge, events }),
    storage: new MemoryStorage(), now: () => NOW, timeoutMs: 10,
  });
  session.setContext(context, [stay]);
  session.setAutomatic(true);
  assert.equal(await session.sync(), false);
  assert.equal(session.state().lastError, 'temporary-error');
  assert.equal(listeners.size, 0, 'timed-out native listener must be removed');
  assert.equal(await session.sync(), true);
  assert.equal(requests.length, 2);
  assert.notEqual(requests[0].requestId, requests[1].requestId);
  assert.equal(listeners.size, 0);
  assert.equal(session.hotel(stay.id).hotelName, record.hotelName);
});
