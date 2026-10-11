import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MYCREWCARE_UI_ENABLED, createMyCrewCareController } from '../shared/myCrewCareController.mjs';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const ctx = (accountId = 'account-1') => ({ accountId, rosterId: 'roster-1', rosterRevision: 'rev-1', providerSubject: `subject-${accountId}` });
const stayFor = (c) => ({
  id: `stay-${c.accountId}`, rosterEventId: 'event-1', rosterEventKind: 'stay', source: 'persisted-platform-stay', localOnly: false,
  ...c, airport: 'FOR', pairingId: 'PAIR-1', hotelName: null, timeZone: 'America/Fortaleza',
  startAt: '2026-10-09T18:00:00Z', endAt: '2026-10-10T12:00:00Z',
});
const record = {
  direction: 'to_airport', date: '2026-10-10', time: '05:10', airport: 'FOR', pairingId: 'PAIR-1',
  hotelName: 'Hotel Atlântico', providerRecordId: 'transport-1', hotelAddress: null, hotelPhone: null,
  pickupLocation: null, transportProvider: null, transportPhone: null, transitMinutes: null, status: 'published',
};

// In-memory stand-in for the Android bridge; counts every call.
function fakeBridge({ release = true, store = new Map(), authenticated = true } = {}) {
  const results = new Map();
  let cleanupOk = true;
  const calls = { open: 0, disconnect: [], clear: [], save: 0 };
  const listeners = new Set();
  const events = {
    addEventListener: (_n, fn) => listeners.add(fn),
    removeEventListener: (_n, fn) => listeners.delete(fn),
  };
  const bridge = {
    myCrewCareProtocolVersion: () => 3,
    myCrewCareReleaseEnabled: () => release,
    openMyCrewCareV3(json) {
      calls.open += 1;
      const request = JSON.parse(json);
      queueMicrotask(() => {
        const detail = authenticated
          ? {
            schemaVersion: 3, requestId: request.requestId, context: request.context, authenticated: true,
            providerSubject: request.context.providerSubject,
            url: 'https://api2.apicrewcare.com/LATAM/mytravel.aspx',
            observedAt: new Date(NOW).toISOString(), records: [record], emptyConfirmed: false,
          }
          : { schemaVersion: 3, requestId: request.requestId, context: request.context, authenticated: false, error: 'login-required', records: [] };
        for (const fn of [...listeners]) fn({ detail });
      });
      return true;
    },
    startMyCrewCareCleanupV3(accountId, forget, operationId) {
      calls.disconnect.push([accountId, forget]);
      results.set(`${accountId}|${operationId}`, cleanupOk ? 'ok' : 'failed:profile-clear-failed');
      if (forget) store.delete(accountId);
      return true;
    },
    myCrewCareCleanupResultV3: (accountId, operationId) => results.get(`${accountId}|${operationId}`) ?? 'unknown',
    loadMyCrewCareV3State: (accountId) => store.get(accountId) ?? null,
    saveMyCrewCareV3State(accountId, payload) { calls.save += 1; store.set(accountId, payload); return true; },
    clearMyCrewCareV3State(accountId) { calls.clear.push(accountId); store.delete(accountId); return true; },
  };
  return { bridge, events, calls, store, setCleanupOk: (value) => { cleanupOk = value; } };
}

const make = (fake, extra = {}) => createMyCrewCareController({ bridge: fake.bridge, events: fake.events, uiEnabled: true, now: () => NOW, ...extra });

test('the interface key is off in the shipped build', () => {
  assert.equal(MYCREWCARE_UI_ENABLED, false);
  const source = readFileSync(new URL('../client/src/lib/myCrewCareV3Runtime.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /uiEnabled/, 'production wiring must not override the feature key');
});

test('disabled by default: nothing touches the bridge, panel state is inert', async () => {
  const fake = fakeBridge();
  let touched = 0;
  const spy = new Proxy(fake.bridge, { get(target, key) { touched += 1; return target[key]; } });
  const controller = createMyCrewCareController({ bridge: spy, events: fake.events, now: () => NOW });
  touched = 0;
  assert.equal(controller.getSnapshot().capability, 'disabled');
  await controller.bind(ctx(), [stayFor(ctx())]);
  controller.setAutomatic(true);
  assert.equal(await controller.refresh({ userInitiated: true }), false);
  assert.equal(touched, 0);
  assert.equal(fake.calls.open, 0);
  assert.equal(controller.hotel('x'), null);
});

test('native release flag off keeps it disabled even with the interface key on', async () => {
  const fake = fakeBridge({ release: false });
  const controller = make(fake);
  assert.equal(controller.getSnapshot().capability, 'disabled');
  controller.setAutomatic(true);
  await controller.refresh({ userInitiated: true });
  assert.equal(fake.calls.open, 0);
  const noBridge = createMyCrewCareController({ uiEnabled: true });
  assert.equal(noBridge.getSnapshot().capability, 'disabled');
});

test('consent and automatic triggers never open the provider; only a user tap does', async () => {
  const fake = fakeBridge();
  const c = ctx();
  const controller = make(fake);
  await controller.bind(c, [stayFor(c)]);
  controller.setAutomatic(true);
  assert.equal(fake.calls.open, 0, 'enabling is not a connection');
  assert.equal(controller.getSnapshot().refreshSuggested, true);
  assert.equal(await controller.refresh(), false, 'non-user refresh is a no-op');
  assert.equal(await controller.refresh({ userInitiated: false }), false);
  assert.equal(fake.calls.open, 0);
  assert.equal(await controller.refresh({ userInitiated: true }), true);
  assert.equal(fake.calls.open, 1);
  const snap = controller.getSnapshot();
  assert.equal(snap.status, 'connected');
  assert.equal(snap.connected, true);
  assert.equal(controller.hotel(`stay-${c.accountId}`).dataState, 'fresh');
  assert.equal(controller.pickup(`stay-${c.accountId}`).source, 'mycrewcare');
});

test('background (app not visible) never syncs, even on user-initiated call', async () => {
  const fake = fakeBridge();
  const c = ctx();
  const controller = make(fake, { isForeground: () => false });
  await controller.bind(c, [stayFor(c)]);
  controller.setAutomatic(true);
  assert.equal(await controller.refresh({ userInitiated: true }), false);
  assert.equal(fake.calls.open, 0);
});

test('offline never opens the provider', async () => {
  const fake = fakeBridge();
  const c = ctx();
  const controller = make(fake, { isOnline: () => false });
  await controller.bind(c, [stayFor(c)]);
  controller.setAutomatic(true);
  assert.equal(await controller.refresh({ userInitiated: true }), false);
  assert.equal(fake.calls.open, 0);
});

test('expired SSO/MFA: unauthenticated answer => reconnect-required, cached data preserved, no loop', async () => {
  const fake = fakeBridge();
  const c = ctx();
  const controller = make(fake);
  await controller.bind(c, [stayFor(c)]);
  controller.setAutomatic(true);
  assert.equal(await controller.refresh({ userInitiated: true }), true);
  fake.bridge.myCrewCareReleaseEnabled = () => true;
  const expired = fakeBridge({ authenticated: false, store: fake.store });
  const second = make(expired);
  await second.bind(c, [stayFor(c)]);
  second.setAutomatic(true);
  assert.equal(second.getSnapshot().hasCachedData, true, 'restored from encrypted cache');
  assert.notEqual(second.getSnapshot().status, 'connected', 'restored cache is never a live connection');
  assert.equal(await second.refresh({ userInitiated: true }), false);
  assert.equal(second.getSnapshot().status, 'reconnect-required');
  assert.equal(second.getSnapshot().requiresInteraction, true);
  assert.ok(second.hotel(`stay-${c.accountId}`), 'last valid data is kept');
  assert.equal(expired.calls.open, 1, 'one attempt per tap, no retries');
});

test('restart: a fresh controller restores the account cache without opening the provider', async () => {
  const fake = fakeBridge();
  const c = ctx();
  const first = make(fake);
  await first.bind(c, [stayFor(c)]);
  first.setAutomatic(true);
  await first.refresh({ userInitiated: true });
  assert.equal(fake.calls.save, 1);

  const restarted = make(fake);
  assert.equal(await restarted.bind(c, [stayFor(c)]), true);
  restarted.setAutomatic(true);
  const snap = restarted.getSnapshot();
  assert.equal(snap.hasCachedData, true);
  assert.equal(snap.connected, false);
  assert.equal(fake.calls.open, 1, 'restore did not touch the provider');
  assert.equal(restarted.hotel(`stay-${c.accountId}`).dataState, 'fresh');
});

test('account switch: previous account data is unreachable and its cache is not read for the new one', async () => {
  const fake = fakeBridge();
  const a = ctx('account-a');
  const b = ctx('account-b');
  const controller = make(fake);
  await controller.bind(a, [stayFor(a)]);
  controller.setAutomatic(true);
  await controller.refresh({ userInitiated: true });
  assert.ok(controller.hotel('stay-account-a'));

  await controller.bind(b, [stayFor(b)]);
  assert.equal(controller.hotel('stay-account-a'), null);
  assert.equal(controller.getSnapshot().hasCachedData, false);
  assert.equal(fake.store.has('account-b'), false);
  assert.equal(fake.store.has('account-a'), true, 'switching does not erase the other account cache');

  await controller.bind(a, [stayFor(a)]);
  assert.ok(controller.hotel('stay-account-a'), 'returning restores only account-a from its own cache');
});

test('in-flight sync is discarded when the account changes', async () => {
  const fake = fakeBridge();
  const a = ctx('account-a');
  const b = ctx('account-b');
  const controller = make(fake);
  await controller.bind(a, [stayFor(a)]);
  controller.setAutomatic(true);
  const pending = controller.refresh({ userInitiated: true });
  await controller.bind(b, [stayFor(b)]);
  assert.equal(await pending, false);
  assert.equal(controller.hotel('stay-account-a'), null);
  assert.equal(fake.store.has('account-a'), false, 'late result never written for the old account');
});

test('disconnect and logout clear cache and profile; failures are surfaced, not hidden', async () => {
  const fake = fakeBridge();
  const c = ctx();
  const controller = make(fake);
  await controller.bind(c, [stayFor(c)]);
  controller.setAutomatic(true);
  await controller.refresh({ userInitiated: true });
  await controller.disconnect({ forgetData: true });
  assert.deepEqual(fake.calls.disconnect.at(-1), ['account-1', true]);
  assert.equal(fake.store.size, 0);
  assert.equal(controller.getSnapshot().hasCachedData, false);
  assert.equal(controller.getSnapshot().automatic, false);

  const failing = fakeBridge();
  failing.bridge.clearMyCrewCareV3State = () => false;
  const broken = make(failing);
  await broken.bind(c, [stayFor(c)]);
  broken.setAutomatic(true);
  await assert.rejects(broken.logout());
  assert.equal(broken.getSnapshot().status, 'cleanup-error');
  assert.equal(broken.getSnapshot().automatic, false);
});

test('subscribers are notified and snapshots are referentially stable between changes', async () => {
  const fake = fakeBridge();
  const c = ctx();
  const controller = make(fake);
  let notifications = 0;
  const unsubscribe = controller.subscribe(() => { notifications += 1; });
  const before = controller.getSnapshot();
  assert.equal(controller.getSnapshot(), before);
  await controller.bind(c, [stayFor(c)]);
  assert.ok(notifications >= 1);
  assert.notEqual(controller.getSnapshot(), before);
  const stable = controller.getSnapshot();
  assert.equal(controller.getSnapshot(), stable);
  unsubscribe();
});

test('no background machinery in the interface wiring', () => {
  for (const file of [
    '../shared/myCrewCareController.mjs',
    '../client/src/lib/myCrewCareV3Runtime.ts',
    '../client/src/hooks/useMyCrewCareV3.ts',
    '../client/src/components/mycrewcare/MyCrewCareV3Panel.tsx',
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /setInterval|WorkManager|serviceWorker|requestIdleCallback|sync\.register|visibilitychange/, file);
    assert.doesNotMatch(source, /password|senha:|document\.body|innerHTML|localStorage|sessionStorage/i, file);
  }
});
test('an unchanged state is not re-published, so a mount effect cannot loop', async () => {
  const fake = fakeBridge();
  const c = ctx();
  const controller = make(fake);
  let notifications = 0;
  controller.subscribe(() => { notifications += 1; });
  await controller.bind(c, [stayFor(c)]);
  const afterFirstBind = notifications;
  const stable = controller.getSnapshot();
  assert.ok(afterFirstBind >= 1);
  await controller.bind(c, [stayFor(c)]);
  await controller.bind(c, [stayFor(c)]);
  assert.equal(notifications, afterFirstBind, 'rebinding the same account publishes nothing');
  assert.equal(controller.getSnapshot(), stable, 'getSnapshot stays referentially stable');
});
test('data that was just updated is never labelled stale', async () => {
  const fake = fakeBridge();
  const c = ctx();
  const controller = make(fake);
  await controller.bind(c, [stayFor(c)]);
  controller.setAutomatic(true);
  assert.equal(controller.getSnapshot().refreshSuggested, true, 'no data yet: a refresh is genuinely due');
  assert.equal(await controller.refresh({ userInitiated: true }), true);
  assert.equal(controller.getSnapshot().refreshSuggested, false);
  controller.setAutomatic(false);
  controller.setAutomatic(true);
  assert.equal(controller.getSnapshot().refreshSuggested, false, 'just-updated data must not be called stale');
});
test('the panel binds on a stable identity key instead of prop identity', () => {
  const source = readFileSync(new URL('../client/src/components/mycrewcare/MyCrewCareV3Panel.tsx', import.meta.url), 'utf8');
  assert.match(source, /const bindKey = \[/);
  assert.match(source, /\}, \[controller, bindKey\]\);/);
  assert.doesNotMatch(source, /\}, \[controller, context, stays\]\);/);
});

test('cleanup-error keeps a retry available, and the retry can really finish the cleanup', async () => {
  const fake = fakeBridge();
  const c = ctx();
  const controller = make(fake);
  await controller.bind(c, [stayFor(c)]);
  controller.setAutomatic(true);
  await controller.refresh({ userInitiated: true });

  fake.setCleanupOk(false); // native profile cleanup fails for real
  await assert.rejects(controller.disconnect({ forgetData: true }));
  let snap = controller.getSnapshot();
  assert.equal(snap.status, 'cleanup-error');
  assert.equal(snap.canRetryCleanup, true, 'the interface must offer "try again"');
  assert.equal(snap.automatic, false);

  // Same for logout: the account must stay targetable after the context is cleared.
  await assert.rejects(controller.logout());
  snap = controller.getSnapshot();
  assert.equal(snap.status, 'cleanup-error');
  assert.equal(snap.canRetryCleanup, true);

  fake.setCleanupOk(true);
  await controller.disconnect({ forgetData: true });
  snap = controller.getSnapshot();
  assert.equal(snap.canRetryCleanup, false);
  assert.notEqual(snap.status, 'cleanup-error');
  assert.deepEqual(fake.calls.disconnect.at(-1), ['account-1', true], 'retry targeted the original account');
});

test('the panel offers the retry action in cleanup-error', () => {
  const source = readFileSync(new URL('../client/src/components/mycrewcare/MyCrewCareV3Panel.tsx', import.meta.url), 'utf8');
  assert.match(source, /snapshot\.canRetryCleanup/);
  assert.match(source, /Tentar desconectar novamente/);
});

test('late logout completion cannot reset a newer B controller binding', async () => {
  const { createMyCrewCarePersistentSession } = await import('../shared/myCrewCarePersistentSession.mjs');
  let finishCleanup;
  const cleanupGate = new Promise((resolve) => { finishCleanup = resolve; });
  const store = new Map();
  const engine = createMyCrewCarePersistentSession({ now: () => NOW, storage: {
    read: (accountId) => store.get(accountId),
    write: (accountId, payload) => store.set(accountId, payload),
    clear: (accountId) => store.delete(accountId),
  }, adapter: {
    disconnect: () => cleanupGate,
    read: async (request) => ({ schemaVersion: 3, requestId: request.requestId, context: request.context,
      authenticated: true, providerSubject: request.context.providerSubject,
      url: 'https://api2.apicrewcare.com/LATAM/mytravel.aspx', observedAt: new Date(NOW).toISOString(),
      records: [record], emptyConfirmed: false }),
  } });
  const fake = fakeBridge();
  const controller = make(fake, { session: engine });
  const a = ctx('A'), b = ctx('B');
  await controller.bind(a, [stayFor(a)]);
  const cleanup = controller.logout();
  await controller.bind(b, [stayFor(b)]);
  controller.setAutomatic(true);
  assert.equal(await controller.refresh({ userInitiated: true }), true);
  const before = controller.getSnapshot();
  finishCleanup();
  await cleanup;
  assert.equal(controller.getSnapshot(), before);
  assert.ok(controller.hotel(stayFor(b).id));
  // Binding B again must keep the snapshot and data, rather than treating B as unbound.
  await controller.bind(b, [stayFor(b)]);
  assert.ok(controller.hotel(stayFor(b).id));
});

test('disconnect publishes busy immediately and preserves cleanup retry after consent changes', async () => {
  const { createMyCrewCarePersistentSession } = await import('../shared/myCrewCarePersistentSession.mjs');
  let rejectCleanup;
  const gate = new Promise((_, reject) => { rejectCleanup = reject; });
  const engine = createMyCrewCarePersistentSession({ now: () => NOW, adapter: { disconnect: () => gate } });
  const controller = make(fakeBridge(), { session: engine });
  const a = ctx('A');
  await controller.bind(a, [stayFor(a)]);
  controller.setAutomatic(true);
  const cleanup = controller.disconnect();
  const observed = cleanup.then(() => null, (error) => error);
  assert.equal(controller.getSnapshot().busy, true);
  assert.equal(controller.getSnapshot().canRetryCleanup, false);
  controller.setAutomatic(false); // core remains safe even when called directly
  rejectCleanup(new Error('synthetic failure'));
  assert.equal((await observed).code, 'profile-disconnect-failed');
  assert.equal(controller.getSnapshot().busy, false);
  assert.equal(controller.getSnapshot().status, 'cleanup-error');
  assert.equal(controller.getSnapshot().canRetryCleanup, true);
});
