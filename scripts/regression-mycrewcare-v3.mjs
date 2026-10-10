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
