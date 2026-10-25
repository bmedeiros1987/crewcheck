import assert from 'node:assert/strict';
import test from 'node:test';
import { loadWeatherTs } from './weather-test-loader.mjs';
import { selectWeatherPulseBindings } from '../../shared/operational-weather-pulse.mjs';
const NOW = Date.parse('2032-02-02T17:30:00Z');
const roster = () => ({ year: 2032, month: 2, days: [{ date: '02/02/2032', legs: [{ flightNumber: 'TEST1' }] }] });
const event = () => ({ id: 'qa-flight', kind: 'flight', flightNumber: 'TEST1', origin: 'GRU', destination: 'BPS',
  canonical: { kind: 'flight', journeyId: 'qa-journey', startDateTime: '2032-02-02T18:00:00Z', endDateTime: '2032-02-02T19:00:00Z',
    leg: { departureTime: '18:00', arrivalTime: '19:00' } } });
function harness() {
  let user = { id: 'synthetic-a' }, token = 'synthetic-token-a', enabled = true, blocked = false, sequence = 0;
  const data = new Map(), window = new EventTarget(), localStorage = {
    getItem(key) { if (blocked) throw Error('synthetic storage blocked'); return data.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw Error('synthetic storage blocked'); data.set(key, String(value)); },
    removeItem: key => data.delete(key),
  };
  const globals = { localStorage, window, Event, CustomEvent, crypto: { randomUUID: () => `synthetic-choice-${++sequence}` } };
  const startup = loadWeatherTs('client/src/lib/rosterStartup.ts', {
    './authClient': { getToken: () => token, getStoredUser: () => user, authFetch: () => { throw Error('No requests permitted'); } },
    '@shared/rosterStartup.mjs': { newestImports: value => value },
  }, globals);
  const reviews = loadWeatherTs('client/src/lib/alertReviewStore.ts', {}, globals);
  const owned = loadWeatherTs('client/src/lib/alertRosterOwnership.ts', { './rosterStartup': startup, './alertReviewStore': reviews }, globals);
  const context = loadWeatherTs('client/src/lib/operationalWeatherContext.ts', { './rosterStartup': startup, './alertReviewStore': reviews, './alertRosterOwnership': owned }, globals);
  const select = (value, source = 'Synthetic.pdf') => localStorage.setItem(startup.startupKey(), JSON.stringify({ owner: startup.startupOwner(), selection: 'explicit', roster: value, sourceFileName: source }));
  const setOwner = id => { user = { id }; token = `synthetic-token-${id}`; localStorage.setItem('crewcheck_auth_user', JSON.stringify(user)); localStorage.setItem('crewcheck_auth_token', token); };
  setOwner(user.id);
  return { context, reviews, owned, startup, select, localStorage, setOwner,
    reader(value, events = [event()]) { return context.createOperationalWeatherContextReader(value, 'Synthetic.pdf', events, code => ({ GRU: 'SBGR', BPS: 'SBPS' })[code] || code, () => enabled); },
    disable() { enabled = false; }, block() { blocked = true; }, refreshToken() { token = 'synthetic-refreshed-token'; localStorage.setItem('crewcheck_auth_token', token); },
  };
}
test('real read-only ownership/choice guards yield the existing Pulse account digest', () => {
  const h = harness(), value = roster(); h.select(value); const read = h.reader(value), snapshot = read();
  assert.ok(snapshot); assert.equal(snapshot.context.ownerId, h.reviews.alertAccount()); assert.notEqual(snapshot.context.ownerId, 'synthetic-a');
  assert.equal(selectWeatherPulseBindings(snapshot.context, NOW).bindings.length, 2);
  assert.ok(Object.isFrozen(snapshot.context)); assert.ok(Object.isFrozen(snapshot.context.flights));
});
test('exact source-choice change invalidates even when roster days are identical', () => {
  const h = harness(), value = roster(); h.select(value); const read = h.reader(value); assert.ok(read());
  h.select(value, 'Another-synthetic-source.pdf'); assert.equal(h.owned.alertRosterOwned(value), true); assert.equal(read(), null);
});
test('real begin-choice guard revokes old context and blocks admission until terminal choice', () => {
  const h = harness(), value = roster(); h.select(value); const read = h.reader(value), choice = h.startup.beginRosterChoice();
  assert.equal(read(), null); assert.equal(h.reader(value)(), null); choice.finish(); assert.ok(h.reader(value)());
});
test('account and same-owner token refresh fences are checked without parsing credentials', () => {
  const h = harness(), value = roster(); h.select(value); const old = h.reader(value); h.refreshToken(); assert.equal(old(), null);
  const fresh = h.reader(value); assert.ok(fresh()); h.setOwner('synthetic-b'); h.select(value); assert.equal(fresh(), null);
  assert.equal(h.reader(value)().context.ownerId, h.reviews.alertAccount());
});
test('missing ownership, blocked storage and operational OFF fail closed', () => {
  const h = harness(), value = roster(); assert.equal(h.reader(value)(), null); h.select(value);
  const read = h.reader(value); h.disable(); assert.equal(read(), null); h.block(); assert.equal(read(), null);
});
test('published canonical clocks are required; presentation and local date cannot substitute', () => {
  const h = harness(), value = roster(); h.select(value);
  const e = event(); e.presentation = '17:30'; e.departure = '18:00'; delete e.canonical.leg.departureTime;
  assert.equal(selectWeatherPulseBindings(h.reader(value, [e])().context, NOW).bindings.length, 0);
  e.canonical.leg.departureTime = '18:00'; e.canonical.startDateTime = '2032-02-02T18:00:00';
  assert.equal(selectWeatherPulseBindings(h.reader(value, [e])().context, NOW).bindings.length, 0);
});
test('new revision serializes source and canonical clocks, not render-array identity', () => {
  const h = harness(), value = roster(); h.select(value);
  const a = h.reader(value, [event()])(), b = h.reader(value, [event()])(); assert.equal(a.context.sourceRevision, b.context.sourceRevision);
  const changed = event(); changed.canonical.endDateTime = '2032-02-02T19:01:00Z';
  assert.notEqual(h.reader(value, [changed])().context.sourceRevision, a.context.sourceRevision);
});
test('only completed authority storage keys rebuild a read fence, never pending intent epochs', () => {
  const h = harness(), key = h.startup.startupKey();
  for (const value of [key + '_intent_epoch', key + '_clear_epoch', 'crewcheck_weather_hourly', 'unrelated'])
    assert.equal(h.context.weatherContextRefreshEvent({ type: 'storage', key: value }), false);
  for (const value of [key, 'crewcheck_auth_token', 'crewcheck_auth_user', null])
    assert.equal(h.context.weatherContextRefreshEvent({ type: 'storage', key: value }), true);
});
test('newly captured choice must name the committed source, with strict primary/legacy precedence', () => {
  const h = harness(), value = roster();
  const write = fields => h.localStorage.setItem(h.startup.startupKey(), JSON.stringify({ owner: h.startup.startupOwner(), selection: 'explicit', roster: value, ...fields }));
  for (const fields of [{ sourceFileName: 'Other.pdf' }, { source: 'Other.pdf' }, {}, { sourceFileName: '' }, { source: '' }, { source: '   ' }, { sourceFileName: '   ', source: 'Synthetic.pdf' }, { sourceFileName: null, source: 'Synthetic.pdf' }, { sourceFileName: false, source: 'Synthetic.pdf' }, { sourceFileName: 0, source: 'Synthetic.pdf' }, { sourceFileName: 7, source: 'Synthetic.pdf' }, { sourceFileName: 'Other.pdf', source: 'Synthetic.pdf' }]) {
    write(fields); assert.equal(h.reader(value)(), null);
  }
  for (const fields of [{ sourceFileName: 'Synthetic.pdf' }, { source: 'Synthetic.pdf' }, { sourceFileName: '', source: 'Synthetic.pdf' }]) {
    write(fields); assert.ok(h.reader(value)());
  }
});
