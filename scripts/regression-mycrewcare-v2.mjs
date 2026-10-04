import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createMyCrewCareSession, isMyCrewCareTravelUrl, myCrewCareLocalInstant, MYCREWCARE_MAX_AGE_MS } from '../shared/myCrewCare.mjs';
import { createMyCrewCareNativeAdapter } from '../shared/myCrewCareNativeAdapter.mjs';

// Synthetic only. The exact asset executed by the Android portal is the parser under test.
const assetPath = 'android-wrapper/app/src/main/assets/mycrewcare-transport-v2.js';
const parser = fs.readFileSync(new URL('../' + assetPath, import.meta.url), 'utf8');
const parse = (cards, selector = '.synthetic-transport-card') => JSON.parse(vm.runInNewContext(`(${parser})(${JSON.stringify(selector)})`, { document: { querySelectorAll: () => cards.map((value) => typeof value === 'string' ? { innerText: value, querySelectorAll: () => [] } : value) } }, { timeout: 1000 }));
const card = (patch = '') => `Transportation To Airport\nPick-up date: 05/10/2026\nPick-up time: 07:30\nAirport: GRU\nPairing ID: SYNTH-42\nHotel: Synthetic Hotel\nTravel time: 45 minutes${patch}`;
const context = { accountId: 'account-A', rosterId: 'roster-A', rosterRevision: 'checksum-A', providerSubject: 'subject-A' };
const stay = { id: 'platform-stay-A', rosterEventId: 'roster-event-A', rosterEventKind: 'stay', source: 'persisted-platform-stay', accountId: 'account-A', rosterId: 'roster-A', rosterRevision: 'checksum-A', airport: 'GRU', pairingId: 'SYNTH-42', hotelName: 'Synthetic Hotel', timeZone: 'America/Sao_Paulo', startAt: '2026-10-04T20:00:00Z', endAt: '2026-10-05T12:00:00Z' };
const record = parse([card()]).records[0];
const clock = Date.parse('2026-10-05T09:00:00Z');
const envelope = (request, patch = {}) => ({ schemaVersion: 2, requestId: request.requestId, context: request.context, authenticated: true, emptyConfirmed: true, providerSubject: 'subject-A', url: 'https://api2.apicrewcare.com/LATAM/mytravel.aspx', syncedAt: new Date(clock).toISOString(), records: [record], ...patch });
function setup(patch = {}, registry = [stay]) {
  let time = clock;
  let reads = 0;
  let disconnects = 0;
  const adapter = { read: async (request) => { reads++; return envelope(request, patch); }, disconnect: () => { disconnects++; } };
  const session = createMyCrewCareSession({ adapter, now: () => time });
  session.setContext(context, registry);
  session.setAutomatic(true);
  return { session, adapter, time: (value) => { time = value; }, reads: () => reads, disconnects: () => disconnects };
}

test('real Android asset extracts only complete minimal transport, never raw text or authentication', () => {
  const result = parse([card('\nPassword: secret-synthetic\nRoom: 4242')]);
  assert.deepEqual(Object.keys(result), ['records']);
  assert.deepEqual(Object.keys(result.records[0]).sort(), ['airport', 'date', 'direction', 'hotel', 'pairingId', 'time', 'transitMinutes']);
  assert.equal(JSON.stringify(result).includes('secret-synthetic'), false);
  assert.equal(result.records[0].date, '2026-10-05');
});
test('nested duplicates dedupe only with all identity fields, including airport and hotel', () => {
  assert.equal(parse([card(), card()]).records.length, 1);
  assert.equal(parse([card(), card().replace('Airport: GRU', 'Airport: CGH')]).records.length, 2);
  assert.equal(parse([card(), card().replace('Synthetic Hotel', 'Other Hotel')]).records.length, 2);
});
test('parser refuses mixed sections and duplicated labels; no body fallback can mix records', () => {
  assert.deepEqual(parse([card() + '\n' + card().replace('07:30', '09:30')]).records, []);
  assert.deepEqual(parse([card('\nAirport: CGH')]).records, []);
  assert.deepEqual(parse([card().replace('Transportation To Airport', 'Transportation To Hotel')]).records, []);
});
for (const [name, from, to] of [
  ['missing date', 'Pick-up date: 05/10/2026', ''], ['invalid date', '05/10/2026', '31/02/2026'],
  ['missing airport', 'Airport: GRU', ''], ['missing pairing', 'Pairing ID: SYNTH-42', ''],
  ['missing hotel', 'Hotel: Synthetic Hotel', ''], ['invalid time', '07:30', '25:30'],
]) test(`parser rejects ${name}`, () => assert.deepEqual(parse([card().replace(from, to)]).records, []));
test('empty and changing dynamic DOM are separate reads, with no cached former transport', () => {
  assert.deepEqual(parse([]).records, []);
  assert.equal(parse([card()]).records.length, 1);
  assert.deepEqual(parse([]).records, []);
});
for (const url of ['http://api2.apicrewcare.com/LATAM/mytravel.aspx', 'https://evil.apicrewcare.com/LATAM/mytravel.aspx', 'https://api2.apicrewcare.com.evil.test/LATAM/mytravel.aspx', 'https://api2.apicrewcare.com/login.aspx', 'https://api2.apicrewcare.com:8443/LATAM/mytravel.aspx', 'https://user:pass@api2.apicrewcare.com/LATAM/mytravel.aspx', 'file:///LATAM/mytravel.aspx']) {
  test(`reject origin/path ${url}`, () => assert.equal(isMyCrewCareTravelUrl(url), false));
}
test('requires a unique persisted canonical stay, not a roster event id', async () => {
  const { session } = setup(); assert.equal(await session.sync(), true);
  assert.equal(session.pickup('roster-event-A'), null);
  assert.equal(session.pickup('platform-stay-A').pickupAt, '2026-10-05T10:30:00.000Z');
  assert.equal(session.pickup('platform-stay-A').rosterEventId, 'roster-event-A');
});
for (const [name, patch] of [
  ['wrong airport', { airport: 'CGH' }], ['wrong pairing', { pairingId: 'OTHER-PAIRING' }],
  ['wrong hotel', { hotel: 'Other Hotel' }], ['other day', { date: '2026-10-06' }],
  ['outside stay', { time: '12:30' }], ['airport missing', { airport: '' }], ['date missing', { date: '' }],
  ['pairing missing', { pairingId: '' }], ['invalid time', { time: '25:00' }],
  ['ambiguous date format', { date: '05/10/2026' }],
]) test(`never associates ${name}`, async () => { const { session } = setup({ records: [{ ...record, ...patch }] }); await session.sync(); assert.equal(session.pickup(stay.id), null); });
test('ambiguous stay registry fails closed regardless of input order', async () => {
  const other = { ...stay, id: 'platform-stay-B', rosterEventId: 'roster-event-B' };
  for (const registry of [[stay, other], [other, stay]]) { const { session } = setup({}, registry); await session.sync(); assert.equal(session.pickup(stay.id), null); assert.equal(session.pickup(other.id), null); }
});
test('conflicting pickup records fail closed instead of selecting first', async () => {
  const { session } = setup({ records: [record, { ...record, time: '08:00' }] }); await session.sync(); assert.equal(session.pickup(stay.id), null);
});
test('identical records from nested DOM cards are not falsely ambiguous', async () => {
  const { session } = setup({ records: [record, record] }); await session.sync(); assert.ok(session.pickup(stay.id));
});
for (const patch of [{ id: '' }, { source: 'roster-event' }, { localOnly: true }, { accountId: 'account-B' }, { rosterRevision: 'checksum-B' }, { rosterId: '' }, { rosterEventId: '' }, { timeZone: 'Invalid/Zone' }, { startAt: '2026-10-04T20:00:00' }]) {
  test(`reject unbound registry ${JSON.stringify(patch)}`, async () => { const { session, reads } = setup({}, [{ ...stay, ...patch }]); assert.equal(await session.sync(), false); assert.equal(reads(), 0); });
}
test('duplicate persisted ids invalidate the entire registry', async () => { const { session } = setup({}, [stay, { ...stay }]); assert.equal(await session.sync(), false); });
test('local date conversion uses stay timezone instead of device timezone', () => {
  assert.equal(new Date(myCrewCareLocalInstant('2026-10-05', '00:30', 'Pacific/Kiritimati')).toISOString(), '2026-10-04T10:30:00.000Z');
  assert.equal(new Date(myCrewCareLocalInstant('2026-10-05', '00:30', 'America/Sao_Paulo')).toISOString(), '2026-10-05T03:30:00.000Z');
  assert.equal(new Date(myCrewCareLocalInstant('2026-10-05', '00:30', 'Asia/Kathmandu')).toISOString(), '2026-10-04T18:45:00.000Z');
});
test('DST repeated and nonexistent wall-clock times reject instead of guessing', () => {
  assert.equal(myCrewCareLocalInstant('2026-11-01', '01:30', 'America/New_York'), null);
  assert.equal(myCrewCareLocalInstant('2026-03-08', '02:30', 'America/New_York'), null);
  assert.equal(myCrewCareLocalInstant('2026-02-31', '02:30', 'UTC'), null);
});
for (const patch of [{ authenticated: false }, { providerSubject: 'subject-B' }, { requestId: 'old' }, { schemaVersion: 1 }, { error: 'expired' }, { records: undefined }, { syncedAt: '' }, { syncedAt: new Date(clock - MYCREWCARE_MAX_AGE_MS - 1).toISOString() }, { syncedAt: new Date(clock + 31_000).toISOString() }]) {
  test(`reject unverified snapshot ${JSON.stringify(patch)}`, async () => { const { session } = setup(patch); assert.equal(await session.sync(), false); assert.equal(session.state().connected, false); assert.equal(session.pickup(stay.id), null); });
}
test('status pings cannot renew freshness and expired data is cleared', async () => {
  const { session, time } = setup(); await session.sync(); time(clock + MYCREWCARE_MAX_AGE_MS + 1);
  assert.equal(session.pickup(stay.id), null); assert.equal(session.state().status, 'expired');
});
test('explicit empty sync replaces old transport without marking the session invalid', async () => {
  const { session, adapter } = setup(); await session.sync(); assert.ok(session.pickup(stay.id));
  adapter.read = async (request) => envelope(request, { records: [] }); assert.equal(await session.sync(), true); assert.equal(session.pickup(stay.id), null);
});
test('error after good sync immediately clears old transport', async () => {
  const { session, adapter } = setup(); await session.sync(); adapter.read = async () => { throw new Error('synthetic failure'); };
  assert.equal(await session.sync(), false); assert.equal(session.pickup(stay.id), null);
});
test('off consent and disconnect both stop reads and clear prior pickup', async () => {
  for (const stop of [(s) => s.setAutomatic(false), (s) => s.disconnect(), (s) => s.logout()]) {
    const { session, reads } = setup(); await session.sync(); stop(session); assert.equal(session.pickup(stay.id), null); assert.equal(await session.sync(), false); assert.equal(reads(), 1);
  }
});
test('an identical context does not silently reset user consent', async () => {
  const { session } = setup(); session.setContext({ ...context }, [{ ...stay }]); assert.equal(await session.sync(), true);
});
test('scope or stay changes while async rejects the stale result and resets consent', async () => {
  for (const mutate of [(s) => s.setContext({ ...context, accountId: 'account-B' }, []), (s) => s.setContext({ ...context, rosterRevision: 'checksum-B' }, []), (s) => s.setContext(context, [{ ...stay, hotelName: 'New Hotel' }]), (s) => s.setAutomatic(false), (s) => s.disconnect(), (s) => s.logout()]) {
    const { session, adapter } = setup(); let resolve; let request;
    adapter.read = (value) => { request = value; return new Promise((done) => { resolve = done; }); };
    const syncing = session.sync(); mutate(session); resolve(envelope(request));
    assert.equal(await syncing, false); assert.equal(session.pickup(stay.id), null); assert.equal(session.state().connected, false);
  }
});
test('overlapping reads accept only the newest request', async () => {
  const { session, adapter } = setup(); const pending = [];
  adapter.read = (request) => new Promise((resolve) => pending.push({ request, resolve }));
  const older = session.sync(); const newer = session.sync();
  pending[1].resolve(envelope(pending[1].request, { records: [] })); assert.equal(await newer, true);
  pending[0].resolve(envelope(pending[0].request)); assert.equal(await older, false); assert.equal(session.pickup(stay.id), null);
});
test('timeout aborts the adapter and cannot leave a connected old snapshot', async () => {
  let signal;
  const session = createMyCrewCareSession({ now: () => clock, timeoutMs: 5, adapter: { read: (_, value) => { signal = value; return new Promise(() => {}); }, disconnect() {} } });
  session.setContext(context, [stay]); session.setAutomatic(true);
  assert.equal(await session.sync(), false); assert.equal(signal.aborted, true); assert.equal(session.state().connected, false);
});
test('public pickup has no credential/raw fields and cannot mutate internal transport', async () => {
  const { session } = setup({ records: [{ ...record, rawText: 'secret', password: 'secret' }] }); await session.sync();
  const pickup = session.pickup(stay.id); assert.equal(JSON.stringify(pickup).includes('secret'), false); assert.throws(() => { pickup.time = '09:00'; });
});
test('legacy or disabled native bridges never open a portal', async () => {
  for (const version of [undefined, 1, 2]) {
    let opened = 0;
    const bridge = { myCrewCareProtocolVersion: () => version, myCrewCareReleaseEnabled: () => false, openMyCrewCareV2: () => { opened++; return true; } };
    const adapter = createMyCrewCareNativeAdapter({ bridge, events: new EventTarget() });
    await assert.rejects(adapter.read({ requestId: 'synthetic', context }, new AbortController().signal)); assert.equal(opened, 0);
  }
});
test('real protocol adapter carries extracted asset data through the session controller', async () => {
  const events = new EventTarget(); let opens = 0;
  const bridge = { myCrewCareProtocolVersion: () => 2, myCrewCareReleaseEnabled: () => true, disconnectMyCrewCareV2() {}, openMyCrewCareV2(json, consent) {
    opens++; assert.equal(consent, true); const request = JSON.parse(json);
    events.dispatchEvent(new CustomEvent('crewcheck:mycrewcare-update', { detail: envelope(request, { records: [] }) }));
    events.dispatchEvent(new CustomEvent('crewcheck:mycrewcare-v2', { detail: envelope({ requestId: 'wrong' }) }));
    queueMicrotask(() => events.dispatchEvent(new CustomEvent('crewcheck:mycrewcare-v2', { detail: envelope(request, { records: parse([card()]).records }) })));
    return true;
  } };
  const session = createMyCrewCareSession({ adapter: createMyCrewCareNativeAdapter({ bridge, events }), now: () => clock });
  session.setContext(context, [stay]); session.setAutomatic(true); assert.equal(await session.sync(), true); assert.equal(opens, 1); assert.ok(session.pickup(stay.id));
});
test('native adapter cancellation removes listeners and refuses late responses', async () => {
  const events = new EventTarget(); let request;
  const bridge = { myCrewCareProtocolVersion: () => 2, myCrewCareReleaseEnabled: () => true, disconnectMyCrewCareV2() {}, openMyCrewCareV2(json) { request = JSON.parse(json); return true; } };
  const adapter = createMyCrewCareNativeAdapter({ bridge, events }); const abort = new AbortController();
  const pending = adapter.read({ requestId: 'cancel', context }, abort.signal); abort.abort();
  events.dispatchEvent(new CustomEvent('crewcheck:mycrewcare-v2', { detail: envelope(request) })); await assert.rejects(pending, /cancelled/);
});
test('native source keeps release gate shut and executes the tested asset without global cookie/pref state', () => {
  const source = fs.readFileSync(new URL('../android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCarePortal.java', import.meta.url), 'utf8');
  assert.match(source, /RELEASE_ENABLED = false/); assert.match(source, /mycrewcare-transport-v2\.js/);
  assert.doesNotMatch(source, /addJavascriptInterface|CookieManager|getSharedPreferences|\.endsWith\(/);
  assert.match(source, /handler\.cancel\(\)/); assert.match(source, /generation/);
  assert.match(source, /crewcheck:mycrewcare-v2/); assert.doesNotMatch(source, /crewcheck:mycrewcare-update/);
});

test('review: parser requires explicit provider-verified roots and rejects nested partial-card wrapper', () => {
  assert.equal(parse([card()], '').error, 'unverified-dom-contract');
  const partial = { innerText: 'Transportation To Airport\nPick-up date: 05/10/2026\nPick-up time: 07:30', querySelectorAll: () => [] };
  const outer = { innerText: partial.innerText + '\nOTHER RESERVATION\nAirport: GRU\nPairing ID: SYNTH-42\nHotel: Synthetic Hotel', querySelectorAll: () => [partial] };
  assert.deepEqual(parse([outer, partial]).records, []);
});
test('review: request IDs cannot collide across simultaneous controller instances', async () => {
  const events = new EventTarget(); const requests = [];
  const bridge = { myCrewCareProtocolVersion: () => 2, myCrewCareReleaseEnabled: () => true, disconnectMyCrewCareV2() {}, openMyCrewCareV2(json) { requests.push(JSON.parse(json)); return true; } };
  const make = () => createMyCrewCareSession({ adapter: createMyCrewCareNativeAdapter({ bridge, events }), now: () => clock });
  const a = make(); const b = make(); a.setContext(context, [stay]); b.setContext(context, [stay]); a.setAutomatic(true); b.setAutomatic(true);
  const pa = a.sync(); const pb = b.sync(); assert.notEqual(requests[0].requestId, requests[1].requestId);
  events.dispatchEvent(new CustomEvent('crewcheck:mycrewcare-v2', { detail: envelope(requests[1]) }));
  assert.equal(await pb, true); assert.equal(a.state().connected, false); a.disconnect(); assert.equal(await pa, false);
});
test('review: matching request ID cannot override account/roster scope proof', async () => {
  const { session } = setup({ context: { ...context, rosterRevision: 'wrong' } }); assert.equal(await session.sync(), false);
});
test('review: native cancel revokes consent and prevents subsequent sync', async () => {
  const events = new EventTarget(); let opens = 0;
  const bridge = { myCrewCareProtocolVersion: () => 2, myCrewCareReleaseEnabled: () => true, disconnectMyCrewCareV2() {}, openMyCrewCareV2(json) {
    opens++; const request = JSON.parse(json); queueMicrotask(() => events.dispatchEvent(new CustomEvent('crewcheck:mycrewcare-v2', { detail: { schemaVersion: 2, requestId: request.requestId, context: request.context, cancelled: true } }))); return true;
  } };
  const session = createMyCrewCareSession({ adapter: createMyCrewCareNativeAdapter({ bridge, events }), now: () => clock });
  session.setContext(context, [stay]); session.setAutomatic(true); assert.equal(await session.sync(), false);
  assert.equal(session.state().automatic, false); assert.equal(await session.sync(), false); assert.equal(opens, 1);
});
test('review: native submillisecond timestamps are valid and time parsing never normalizes 24:00', async () => {
  const { session } = setup({ syncedAt: '2026-10-05T09:00:00.123456789Z' }); assert.equal(await session.sync(), true);
  const bad = setup({ syncedAt: '2026-10-04T24:00:00Z' }); assert.equal(await bad.session.sync(), false);
});
test('review: sparse malformed records fail closed without throwing from pickup', async () => {
  const { session } = setup({ records: Array(1) }); assert.equal(await session.sync(), false); assert.equal(session.pickup(stay.id), null);
});
test('review: normalized date/time whitespace does not throw', () => {
  assert.equal(myCrewCareLocalInstant(' 2026-10-05 ', '10:00', 'UTC'), Date.parse('2026-10-05T10:00:00Z'));
});

test('review: canonical stay binding is one-to-one and only accepts existing stay events', async () => {
  const duplicate = setup({}, [stay, { ...stay, id: 'platform-stay-B', startAt: '2026-10-05T20:00:00Z', endAt: '2026-10-06T12:00:00Z' }]);
  assert.equal(await duplicate.session.sync(), false);
  for (const rosterEventKind of [undefined, 'journey-rest', 'flight']) {
    const { session } = setup({}, [{ ...stay, rosterEventKind }]); assert.equal(await session.sync(), false);
  }
});

test('review: cancelled/historical heading variants are rejected by the real asset', () => {
  for (const heading of ['Transportation To Airport CANCELLED', 'Cancelled Transportation To Airport', 'Transportation To Airport (historical)']) {
    assert.deepEqual(parse([card().replace('Transportation To Airport', heading)]).records, []);
  }
  assert.deepEqual(parse([card('\nStatus: Cancelled')]).records, []);
});
test('review: empty records need an explicit verified empty-state proof', async () => {
  const { session } = setup({ records: [], emptyConfirmed: false }); assert.equal(await session.sync(), false);
});
