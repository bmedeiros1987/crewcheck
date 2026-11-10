import assert from 'node:assert/strict';
import test from 'node:test';
import * as policy from '../../shared/operational-weather-pulse.mjs';
import * as sourceTime from '../../shared/weather-observation-source-time.mjs';
import { loadWeatherTs } from './weather-test-loader.mjs';
const { createOperationalWeatherController, operationalWeatherReports, WEATHER_PREFERENCE_EVENT } = loadWeatherTs('client/src/lib/operationalWeatherController.ts', {
  '../../../shared/operational-weather-pulse.mjs': policy, '../../../shared/weather-observation-source-time.mjs': sourceTime,
  './alertReviewStore': { ALERT_REVIEW_EVENT: 'crewcheck:alert-review-changed' }, './operationalWeatherNotices': { projectOperationalWeatherNotices() {} },
}, { AbortController, queueMicrotask });
const NOW = Date.parse('2032-02-02T17:30:00Z');
const snapshot = (revision = 'revision-a', owner = 'owner-a', offset = 0) => ({ context: {
  ownerId: owner, sourceId: 'synthetic-source', sourceRevision: revision,
  flights: [{ id: 'qa-flight', journeyId: 'qa-journey', kind: 'flight', departure: NOW + offset + 30 * 60_000, arrival: NOW + offset + 90 * 60_000,
    departureClock: '18:00', arrivalClock: '19:00', origin: 'SBGR', destination: 'SBPS' }],
}, flights: {} });
const payload = (at = NOW, severity = 2) => ({ stations: Object.fromEntries(['SBGR', 'SBPS'].map(icao => {
  const date = new Date(at), group = [date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes()].map(v => String(v).padStart(2, '0')).join('');
  return [icao, { icao, metar: `METAR ${icao} ${group}Z 02015G30KT 9000 -RA BKN042`, taf: `TAF ${icao} synthetic`,
    provider: { metar: 'aviationweather' }, available: { metar: true }, official: { metar: true },
    observationTimeSource: { metar: { field: 'obsTime', value: at / 1000 } }, monitoring: { severity, hazards: [] } }];
})) });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function harness(handler) {
  let now = NOW, selected = snapshot(), enabled = true, timerId = 0;
  const calls = [], projections = [], queue = [], timers = new Map(), events = new EventTarget();
  const controller = createOperationalWeatherController({ now: () => now, events,
    fetch: (url, options) => { calls.push({ url, options }); return handler ? handler({ url, options, now, calls }) : Promise.resolve({ ok: true, json: async () => payload(now) }); },
    set(callback, delay) { assert.ok(delay > 0 && delay <= 2_147_483_647); const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
    clear: id => timers.delete(id), enqueue: callback => queue.push(callback),
    project: (intents, current, legacy, at, isCurrent) => projections.push({ intents: [...intents], snapshot: current, legacy: new Map(legacy), at, current: isCurrent() }),
  });
  const reader = () => enabled ? selected : null;
  let lease = controller.attach(reader);
  const flush = async () => { for (let rounds = 0; rounds < 20; rounds++) { while (queue.length) queue.shift()(); for (let i = 0; i < 8; i++) await Promise.resolve(); if (!queue.length) return; } throw Error('zero-delay loop'); };
  return { controller, calls, projections, events, timers, reader, flush, get lease() { return lease; },
    get latest() { return projections.at(-1); },
    replace(value) { selected = value; lease.update(reader); },
    preference(value, landing = false) { if (!landing) enabled = value; events.dispatchEvent(new CustomEvent(WEATHER_PREFERENCE_EVENT, { detail: { key: landing ? 'crewcheck_weather_landing_alerts' : 'crewcheck_weather_hourly' } })); },
    remount() { lease.detach(); lease = controller.attach(reader); lease.update(reader); },
    time(value) { now = value; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } },
  };
}
test('initial StrictMode attach/update/detach/attach coalesces one <=2-station request', async () => {
  const h = harness(); h.lease.update(h.reader); h.remount(); await h.flush();
  assert.equal(h.calls.length, 1); assert.match(h.calls[0].url, /airports=SBGR%2CSBPS/);
  assert.equal(h.latest.intents.length, 2);
  assert.ok(h.calls[0].options.signal instanceof AbortSignal);
});
test('event storms, channel preferences and dormant landing do not spend extra quota', async () => {
  const h = harness(); await h.flush();
  for (const name of ['focus', 'pageshow', 'online', 'visibilitychange', 'crewcheck:notification-preferences-changed', 'crewcheck:alert-review-changed'])
    for (let i = 0; i < 10; i++) h.events.dispatchEvent(new Event(name));
  h.preference(false, true); await h.flush(); assert.equal(h.calls.length, 1); assert.equal(h.latest.intents.length, 2);
  h.time(NOW + 60 * 60_000); await h.flush(); assert.equal(h.calls.length, 2);
});
test('settled same-context remount reconstructs facts without another request', async () => {
  const h = harness(); await h.flush(); h.remount(); await h.flush();
  assert.equal(h.calls.length, 1); assert.equal(h.latest.intents.length, 2);
});
test('tomorrow outside absolute windows causes no automatic request', async () => {
  const h = harness(); h.replace(snapshot('tomorrow', 'owner-a', 24 * 60 * 60_000)); await h.flush();
  assert.equal(h.calls.length, 0); assert.equal(h.latest.intents.length, 0);
});
test('arrival remains eligible to +45 minutes and expires without a recovery notification', async () => {
  const h = harness(); await h.flush(); h.time(NOW + 90 * 60_000); await h.flush();
  assert.equal(h.latest.intents.length, 1); assert.equal(h.latest.intents[0].role, 'destination');
  h.time(NOW + 135 * 60_000 + 1); await h.flush(); assert.equal(h.latest.intents.length, 0);
});
test('never-settling revoked fetch retains its slot across source changes and quota', async () => {
  const pending = deferred(), h = harness(() => pending.promise); await h.flush();
  h.replace(snapshot('revision-b')); await h.flush(); assert.equal(h.calls[0].options.signal.aborted, true);
  h.time(NOW + 60 * 60_000 + 1); await h.flush(); assert.equal(h.calls.length, 1);
  pending.resolve({ ok: true, json: async () => payload(NOW) }); await h.flush();
  assert.equal(h.calls.length, 2); // terminal acknowledgement, not abort(), frees the slot
  assert.equal(h.latest.intents.length, 0);
});
test('source changes while JSON is pending discard the old payload', async () => {
  const body = deferred(), h = harness(() => Promise.resolve({ ok: true, json: () => body.promise })); await h.flush();
  h.replace(snapshot('new-source')); body.resolve(payload()); await h.flush();
  assert.equal(h.latest.intents.length, 0); assert.equal(h.calls.length, 1);
});
test('same-tab hourly OFF immediately withdraws and aborts; ON cannot reset quota', async () => {
  const pending = deferred(), h = harness(() => pending.promise); await h.flush();
  h.preference(false); assert.equal(h.latest.intents.length, 0); assert.equal(h.calls[0].options.signal.aborted, true);
  h.preference(true); pending.reject(new Error('synthetic terminal abort')); await h.flush(); assert.equal(h.calls.length, 1);
});
test('auth-will-change cannot reread old account and re-admit before changed', async () => {
  const h = harness(); h.events.dispatchEvent(new Event('crewcheck:auth-will-change')); await h.flush(); assert.equal(h.calls.length, 0);
  h.events.dispatchEvent(new Event('focus')); await h.flush(); assert.equal(h.calls.length, 0);
  h.replace(snapshot('new-owner-source', 'owner-b')); h.events.dispatchEvent(new Event('crewcheck:auth-changed')); await h.flush();
  assert.equal(h.calls.length, 1); assert.equal(h.latest.intents[0].ownerId, 'owner-b');
});
test('old cleanup cannot detach the newer lease', async () => {
  const h = harness(), old = h.lease; h.remount(); old.detach(); await h.flush(); assert.equal(h.calls.length, 1);
});
test('HTTP/JSON failure never fabricates benign recovery or immediate retry', async () => {
  for (const response of [{ ok: false, json: async () => payload() }, { ok: true, json: async () => { throw Error('synthetic JSON failure'); } }]) {
    const h = harness(async () => response); await h.flush(); assert.equal(h.calls.length, 1); assert.equal(h.latest.intents.length, 0);
  }
});
test('wall clock rollback withdraws and never creates an elapsed-hour retry', async () => {
  const h = harness(); await h.flush(); h.time(NOW - 1); h.events.dispatchEvent(new Event('focus')); await h.flush();
  assert.equal(h.latest.intents.length, 0); assert.equal(h.calls.length, 1);
});
test('API aliases cannot duplicate stations and TAF/aggregate ok cannot certify METAR', () => {
  const ticket = policy.advanceWeatherPulse(policy.createWeatherPulseState(), snapshot().context, NOW).request;
  const data = payload(); data.stations.GRU = data.stations.SBGR;
  assert.equal(operationalWeatherReports(data, ticket).reports.length, 2);
  data.stations.SBGR.ok = true; data.stations.SBGR.available = { metar: false, taf: true };
  let reports = operationalWeatherReports(data, ticket).reports; assert.equal(reports.find(x => x.report.station === 'SBGR').report.ok, false);
  delete data.stations.SBGR.monitoring.severity; reports = operationalWeatherReports(data, ticket).reports;
  assert.equal(reports.length, 1); // missing classifier never coerces to recovery severity zero
});
test('HTTP-error or revoked headers never release an abort-ignoring body before acknowledgement', async () => {
  for (const ok of [false, true]) {
    const body = deferred();
    const h = harness(({ calls, now }) => Promise.resolve({ ok: calls.length === 1 ? ok : true,
      json: () => calls.length === 1 ? body.promise : Promise.resolve(payload(now)) }));
    await h.flush();
    if (ok) h.replace(snapshot('revoked-after-headers'));
    await h.flush(); assert.equal(h.calls[0].options.signal.aborted, true);
    h.time(NOW + 60 * 60_000 + 1); await h.flush(); assert.equal(h.calls.length, 1);
    body.reject(new Error('synthetic terminal body acknowledgement')); await h.flush();
    assert.equal(h.calls.length, 2);
    assert.ok(h.latest.intents.every(intent => intent.observedAt > NOW));
  }
});
test('account transition completed while detached is observed without querying until a new lease', async () => {
  const h = harness(); await h.flush(); h.lease.detach();
  h.events.dispatchEvent(new Event('crewcheck:auth-will-change'));
  h.replace(snapshot('new-account', 'owner-b'));
  h.events.dispatchEvent(new Event('crewcheck:auth-changed'));
  h.time(NOW + 60 * 60_000); await h.flush(); assert.equal(h.calls.length, 1);
  h.remount(); await h.flush(); assert.equal(h.calls.length, 2);
  assert.ok(h.latest.intents.every(intent => intent.ownerId === 'owner-b'));
});
test('stale lease update and cleanup cannot replace current admission; throwing readers fail closed', async () => {
  const h = harness(), old = h.lease; h.remount();
  old.update(() => snapshot('foreign', 'owner-b')); old.detach(); await h.flush();
  assert.ok(h.latest.intents.every(intent => intent.ownerId === 'owner-a'));
  h.lease.update(() => { throw Error('unavailable selection'); }); await h.flush();
  assert.equal(h.latest.intents.length, 0); assert.equal(h.calls.length, 1);
});
