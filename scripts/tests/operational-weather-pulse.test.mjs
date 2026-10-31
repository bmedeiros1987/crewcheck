// Synthetic offline policy/lifecycle fixtures. No provider, account or roster data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createWeatherPulseState, advanceWeatherPulse, settleWeatherPulse, selectWeatherPulseBindings,
  WEATHER_PULSE_SCOPE, WEATHER_PULSE_REQUEST_INTERVAL_MS, WEATHER_PULSE_STATION_LIMIT } from '../../shared/operational-weather-pulse.mjs';
import { evaluateWeatherObservation, weatherFlightWindow } from '../../server/weather/critical-observation.mjs';

const MIN = 60_000, HOUR = 60 * MIN, D = Date.parse('2032-02-02T12:00:00Z'), A = D + HOUR;
const flight = (overrides = {}) => ({ id: 'qa-leg-a', journeyId: 'qa-journey', kind: 'flight', departure: D, arrival: A,
  departureClock: '09:00', arrivalClock: '10:00', origin: 'ZZAA', destination: 'ZZBB', ...overrides });
const context = (flights = [flight()], overrides = {}) => ({ ownerId: 'qa-owner', sourceId: 'qa-source', sourceRevision: 'qa-v1', flights, ...overrides });
const report = (now = D, airport = 'ZZBB', overrides = {}) => {
  const observed = new Date(now), group = [observed.getUTCDate(), observed.getUTCHours(), observed.getUTCMinutes()].map(x => String(x).padStart(2, '0')).join('');
  return { ok: true, official: true, provider: 'redemet', station: airport, observedAt: observed.toISOString(), raw: `METAR ${airport} ${group}Z 09015G30KT 3000 TSRA BKN008`, ...overrides };
};
const assessment = (now = D, airport = 'ZZBB', severity = 2, overrides = {}) => ({ report: report(now, airport, overrides), severity });
const start = (ctx = context(), now = D) => advanceWeatherPulse(createWeatherPulseState(), ctx, now);
const complete = (result, ctx = context(), now = D, entries = [assessment(now)], outcome = 'success') => settleWeatherPulse(result.state, ctx, result.request, outcome, entries, now);
const stations = selection => selection.bindings.map(x => x.station);
const select = (ctx = context(), now = D) => selectWeatherPulseBindings(ctx, now);
const onlyDestination = () => context([flight({ departure: D - 2 * HOUR, arrival: D + 45 * MIN })]);

test('fixed quota/station cap are existing conservative limits', () => {
  assert.equal(WEATHER_PULSE_REQUEST_INTERVAL_MS, HOUR); assert.equal(WEATHER_PULSE_STATION_LIMIT, 2);
});
for (const [role, open, close] of [['origin', D - 3 * HOUR, D + 30 * MIN], ['destination', A - 2 * HOUR, A + 45 * MIN]]) {
  for (const [now, eligible] of [[open - 1, false], [open, true], [close, true], [close + 1, false]]) {
    test(`${role} existing inclusive operational boundary ${now}`, () => {
      assert.equal(weatherFlightWindow({ departure: D, arrival: A, role, now }).eligible, eligible);
      assert.equal(select(context(), now).bindings.some(x => x.role === role), eligible);
    });
  }
}
test('recent arrival takes precedence over tomorrow without changing global next-flight', () => {
  const ctx = context([flight(), flight({ id: 'qa-tomorrow', departure: D + 24 * HOUR, arrival: A + 24 * HOUR, origin: 'ZZCC', destination: 'ZZDD' })]);
  const recent = select(ctx, A + 1); assert.equal(recent.bindings[0].role, 'destination'); assert.equal(recent.bindings[0].phase, 0);
  assert.deepEqual(stations(recent), ['ZZBB']); assert.equal(start(ctx, A + 45 * MIN + 1).request, null);
});
test('no date-only cutoff across overnight, month and year boundaries', () => {
  for (const departure of ['2032-02-29T23:45:00Z', '2032-12-31T23:45:00Z']) {
    const dep = Date.parse(departure), arr = dep + 90 * MIN;
    const ctx = context([flight({ departure, arrival: new Date(arr).toISOString(), departureClock: '23:45', arrivalClock: '01:15 (+1)' })]);
    assert.ok(select(ctx, dep + 30 * MIN).bindings.some(x => x.phase === 1));
    assert.equal(select(ctx, arr + 45 * MIN).bindings[0].phase, 0);
    assert.equal(select(ctx, arr + 45 * MIN + 1).bindings.length, 0);
  }
});
test('tomorrow shortly after midnight is eligible only inside its absolute preflight horizon', () => {
  const departure = Date.parse('2032-03-01T00:30:00Z');
  const ctx = context([flight({ departure, arrival: departure + HOUR, departureClock: '00:30 (+1)', arrivalClock: '01:30 (+1)' })]);
  assert.equal(start(ctx, departure - 3 * HOUR - 1).request, null);
  assert.ok(start(ctx, departure - 3 * HOUR).request);
});
for (const clock of ['2:00', '02:00+1', '02:00 +1', '02:00(+1)', '02:00 (+1)', '02h00', '02H00', '24:00', '24:00 (+1)']) {
  test(`published clock proof accepts canonical notation ${clock}`, () => assert.equal(select(context([flight({ departureClock: clock, arrivalClock: clock })])).bindings.length, 2));
}
for (const clock of ['', undefined, '25:00', '24:01', '12:60', '-1:00', '12', 'meia-noite', '02:00 +2']) {
  test(`missing/invalid published clock rejects rather than inferring ${clock}`, () => assert.equal(start(context([flight({ departureClock: clock })])).request, null));
}
test('published departure, never presentation/APZ, determines windows', () => {
  const ctx = context([flight({ presentation: D - 2 * HOUR })]);
  assert.equal(start(ctx, D - 3 * HOUR - 1).request, null); assert.ok(start(ctx, D - 3 * HOUR).request);
});
test('absolute canonical inputs reject zoneless/invalid dates, reversed intervals and unmapped stations', () => {
  for (const overrides of [{ departure: '2032-02-02T12:00:00' }, { departure: '2032-02-31T12:00:00Z' }, { departure: NaN }, { arrival: Infinity },
    { arrival: D }, { origin: 'AAA' }, { destination: '' }, { placeholder: true }, { kind: 'reserve' }, { journeyId: '' }]) {
    assert.equal(start(context([flight(overrides)])).request, null, JSON.stringify(overrides));
  }
  assert.equal(select(context([flight({ departure: '2032-02-02T09:00:00-03:00', arrival: '2032-02-02T10:00:00-03:00' })])).bindings.length, 2);
});
test('missing owner/source/revision is silent and withdraws existing owned intents', () => {
  const good = complete(start());
  for (const override of [{ ownerId: '' }, { sourceId: '' }, { sourceRevision: '' }, { flights: null }]) {
    const out = advanceWeatherPulse(good.state, context(undefined, override), D + 1);
    assert.equal(out.request, null); assert.deepEqual(out.activeIntents, []);
  }
});
test('duplicate occurrence identity is deterministic, conflicting or incomplete duplicates fail closed', () => {
  assert.deepEqual(stations(select(context([flight(), flight()]))), stations(select()));
  for (const other of [flight({ arrival: A + MIN }), flight({ destination: 'ZZCC' }), flight({ departureClock: '' })]) {
    assert.equal(select(context([flight(), other])).bindings.length, 0);
    assert.equal(select(context([other, flight()])).bindings.length, 0);
  }
});
test('stable tie-breaks and ICAO dedupe cap selection at two airports', () => {
  const legs = ['b', 'a', 'c'].map((id, index) => flight({ id, origin: 'ZZAA', destination: ['ZZBB', 'ZZCC', 'ZZDD'][index] }));
  assert.deepEqual(select(context(legs)), select(context([...legs].reverse())));
  assert.equal(select(context(legs)).bindings.length, 2);
  assert.equal(select(context([flight({ destination: 'ZZAA' })])).bindings.length, 1);
});
test('complete role-phase table includes the short-flight origin tail', () => {
  const ctx = context([flight({ arrival: D + 10 * MIN })]);
  assert.ok(select(ctx, D - 1).bindings.every(x => x.phase === 2));
  assert.ok(select(ctx, D).bindings.every(x => x.phase === 1));
  assert.ok(select(ctx, D + 10 * MIN).bindings.every(x => x.phase === 1));
  const after = select(ctx, D + 10 * MIN + 1).bindings;
  assert.deepEqual(after.map(x => [x.role, x.phase]), [['destination', 0], ['origin', 3]]);
});
test('wakes include departure and arrival+1 phase transitions, not just window edges', () => {
  const short = context([flight({ arrival: D + 10 * MIN })]);
  assert.equal(select(short, D - 1).nextSelectionAt, D);
  assert.equal(select(short, D).nextSelectionAt, D + 10 * MIN + 1);
  assert.equal(select(short, D + 10 * MIN).nextSelectionAt, D + 10 * MIN + 1);
  assert.equal(select(context(), D - 4 * HOUR).nextSelectionAt, D - 3 * HOUR);
});
test('fractional caller/canonical epochs fail closed rather than preceding the advertised successor wake', () => {
  for (const now of [D + 0.5, A + 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    const out = start(context(), now);
    assert.equal(out.request, null); assert.deepEqual(out.activeIntents, []); assert.equal(out.nextWakeAt, null);
    assert.deepEqual(select(context(), now).bindings, []);
  }
  for (const override of [{ departure: D + 0.5 }, { arrival: A + 0.5 }]) assert.equal(start(context([flight(override)])).request, null);
  assert.equal(select(context(), A).bindings[0].phase, 1);
  assert.equal(select(context(), A).nextSelectionAt, A + 1);
  assert.equal(select(context(), A + 1).bindings[0].phase, 0);
});
test('state/results are immutable and do not freeze or mutate caller inputs', () => {
  const state = createWeatherPulseState(), ctx = context(), snapshot = JSON.stringify(ctx), out = advanceWeatherPulse(state, ctx, D);
  assert.equal(state.pending, null); assert.equal(state.lastAttemptAt, null); assert.equal(JSON.stringify(ctx), snapshot);
  assert.equal(Object.isFrozen(ctx), false); assert.ok(Object.isFrozen(out.request.bindings[0]));
  assert.throws(() => out.request.stations.push('ZZCC'), TypeError);
});
test('failed attempt consumes the fixed quota; only exact boundary permits a next ticket', () => {
  const ctx = onlyDestination(), first = start(ctx), failed = complete(first, ctx, D, null, 'failure');
  assert.equal(advanceWeatherPulse(failed.state, ctx, D + HOUR - 1).request, null);
  const next = advanceWeatherPulse(failed.state, ctx, D + HOUR); assert.equal(next.request.id, 2);
  assert.equal(next.request.issuedAt - first.request.issuedAt, HOUR);
});
test('revoked pending request retains its slot beyond quota until terminal acknowledgement', () => {
  const ctx = onlyDestination(), first = start(ctx), changed = { ...ctx, ownerId: 'qa-other' };
  let out = advanceWeatherPulse(first.state, changed, D + MIN);
  assert.equal(out.state.pending.revoked, true); assert.equal(out.request, null);
  out = advanceWeatherPulse(out.state, changed, D + HOUR); assert.equal(out.request, null);
  out = settleWeatherPulse(out.state, changed, first.request, 'success', [assessment(D + HOUR)], D + HOUR);
  assert.equal(out.state.pending, null); assert.deepEqual(out.activeIntents, []); assert.equal(out.request, null);
  const next = advanceWeatherPulse(out.state, changed, D + HOUR); assert.equal(next.request.id, 2);
  const lateAgain = settleWeatherPulse(next.state, changed, first.request, 'failure', null, D + HOUR + 1);
  assert.equal(lateAgain.state.pending.ticket, next.request, 'old completion cannot clear new ticket');
});
test('never-settling expired request cannot overlap tomorrow even when its quota boundary is past', () => {
  const ctx = context([flight(), flight({ id: 'qa-tomorrow', departure: D + 24 * HOUR, arrival: A + 24 * HOUR })]);
  const first = start(ctx), expired = advanceWeatherPulse(first.state, ctx, A + 45 * MIN + 1);
  assert.equal(expired.state.pending.revoked, true); assert.deepEqual(expired.activeIntents, []);
  const tomorrowOpen = D + 21 * HOUR, pending = advanceWeatherPulse(expired.state, ctx, tomorrowOpen);
  assert.equal(pending.request, null); assert.ok(pending.nextWakeAt === null || pending.nextWakeAt > tomorrowOpen);
  const acknowledged = settleWeatherPulse(pending.state, ctx, first.request, 'aborted-ack', null, tomorrowOpen);
  assert.equal(advanceWeatherPulse(acknowledged.state, ctx, tomorrowOpen).request.id, 2);
});
test('abort requested/unknown outcome and a copied ticket cannot free an actual pending request', () => {
  const ctx = onlyDestination(), first = start(ctx);
  for (const [ticket, outcome] of [[first.request, 'abort-requested'], [{ ...first.request }, 'aborted-ack']]) {
    const out = settleWeatherPulse(first.state, ctx, ticket, outcome, null, D + MIN);
    assert.equal(out.state.pending.ticket, first.request);
  }
  const ack = settleWeatherPulse(first.state, ctx, first.request, 'aborted-ack', null, D + MIN);
  assert.equal(ack.state.pending, null); assert.equal(advanceWeatherPulse(ack.state, ctx, D + 2 * MIN).request, null);
});
test('absent/wrong ticket with no pending request cannot admit or release anything', () => {
  for (const ticket of [undefined, null, {}, { id: 1 }]) {
    const out = settleWeatherPulse(createWeatherPulseState(), context(), ticket, 'success', [assessment()], D);
    assert.equal(out.state.pending, null); assert.deepEqual(out.activeIntents, []); assert.equal(out.state.lastAttemptAt, null);
  }
});
test('source/owner/revision/clock replacement fences late responses without resetting quota', () => {
  for (const changed of [context(undefined, { ownerId: 'qa-other' }), context(undefined, { sourceId: 'qa-new-source' }),
    context(undefined, { sourceRevision: 'qa-v2' }), context([flight({ arrival: A + MIN })])]) {
    const first = start(), out = settleWeatherPulse(first.state, changed, first.request, 'success', [assessment()], D + 1);
    assert.deepEqual(out.activeIntents, []); assert.equal(out.state.pending, null);
    assert.equal(out.state.lastAttemptAt, D); assert.equal(advanceWeatherPulse(out.state, changed, D + 2).request, null);
  }
});
test('owner A→B→A cannot readmit an old A ticket or resurrect its observation', () => {
  const first = start(), other = advanceWeatherPulse(first.state, context(undefined, { ownerId: 'qa-other' }), D + 1);
  const returned = advanceWeatherPulse(other.state, context(), D + 2);
  assert.equal(returned.state.pending.revoked, true);
  assert.equal(settleWeatherPulse(returned.state, context(), first.request, 'success', [assessment()], D + 3).activeIntents.length, 0);
});
test('same normalized event order retains context and admission', () => {
  const legs = [flight(), flight({ id: 'qa-later', departure: D + 24 * HOUR, arrival: A + 24 * HOUR })];
  const first = start(context(legs));
  const out = settleWeatherPulse(first.state, context([...legs].reverse()), first.request, 'success', [assessment()], D + 1);
  assert.equal(out.activeIntents.length, 1);
});
test('response after last inclusive arrival window is ignored without another query', () => {
  const first = start(context(), A + 45 * MIN);
  assert.ok(first.request);
  const out = complete(first, context(), A + 45 * MIN + 1, [assessment(A + 45 * MIN)]);
  assert.deepEqual(out.activeIntents, []); assert.equal(out.state.pending, null); assert.equal(out.nextWakeAt, null);
});
test('verified observation yields only bounded producer-owned intents and excludes unknown report fields', () => {
  const out = complete(start(), context(), D, [assessment(D, 'ZZAA'), assessment(D, 'ZZBB', 3, { ignoredPrivateField: 'not-to-be-carried' }), assessment(D, 'ZZCC')]);
  assert.equal(out.activeIntents.length, 2); assert.equal(out.state.observations.length, 2);
  assert.ok(out.activeIntents.every(x => x.scope === WEATHER_PULSE_SCOPE));
  assert.doesNotMatch(JSON.stringify(out), /not-to-be-carried/);
  assert.ok(out.activeIntents.every(x => x.expiresAt <= D + HOUR));
});
for (const [name, overrides] of [
  ['unavailable', { ok: false }], ['unofficial', { official: false }], ['provider', { provider: 'unknown' }],
  ['station', { station: 'ZZCC' }], ['raw station', { raw: report().raw.replace('ZZBB', 'ZZCC') }],
  ['TAF', { raw: 'TAF ZZBB 021200Z 0212/0312 3000 TSRA' }], ['missing date', { observedAt: undefined }],
  ['zoneless date', { observedAt: '2032-02-02T12:00:00' }], ['date-only', { observedAt: '2032-02-02' }],
  ['wrong UTC group', { observedAt: '2032-02-02T12:01:00Z' }], ['invalid date', { observedAt: '2032-02-31T12:00:00Z' }]
]) test(`observation admission rejects ${name}`, () => assert.deepEqual(complete(start(), context(), D, [assessment(D, 'ZZBB', 2, overrides)]).activeIntents, []));
test('future/stale observations fail; freshness is inclusive at 60 minutes', () => {
  assert.equal(complete(start(), context(), D, [assessment(D + 1)]).activeIntents.length, 0);
  assert.equal(complete(start(), context(), D, [assessment(D - HOUR - 1)]).activeIntents.length, 0);
  assert.equal(complete(start(), context(), D, [assessment(D - HOUR)]).activeIntents.length, 1);
});
for (const severity of [NaN, -1, 1.5, 4, '2', undefined]) test(`invalid assessment severity ${severity} fails closed`, () => {
  const input = { report: report(), severity };
  assert.deepEqual(complete(start(), context(), D, [input]).activeIntents, []);
});
test('explicit offset ISO and epoch seconds/milliseconds representations agree', () => {
  const values = ['2032-02-02T09:00:00-03:00', D / 1000, String(D / 1000), D];
  const keys = values.map(observedAt => complete(start(), context(), D, [assessment(D, 'ZZBB', 2, { observedAt })]).activeIntents[0].materialKey);
  assert.ok(keys.every(value => value === keys[0]));
});
test('observation epoch precision must normalize to integer milliseconds', () => {
  for (const observedAt of [D + 0.5, D / 1000 + 0.0005, String(D / 1000 + 0.0005), '2032-02-02T12:00:00.0005Z']) {
    assert.equal(complete(start(), context(), D + 1, [assessment(D, 'ZZBB', 2, { observedAt })]).activeIntents.length, 0);
  }
  for (const observedAt of [D + 1, D / 1000 + 0.001, '2032-02-02T12:00:00.001Z']) {
    assert.equal(complete(start(), context(), D + 1, [assessment(D, 'ZZBB', 2, { observedAt })]).activeIntents[0].observedAt, D + 1);
  }
});
test('duplicate station responses are rejected rather than order-dependent', () => {
  for (const entries of [[assessment(), assessment(D, 'ZZBB', 0)], [assessment(D, 'ZZBB', 0), assessment()]]) {
    assert.deepEqual(complete(start(), context(), D, entries).activeIntents, []);
  }
});
test('failure or invalid response is not recovery; proven calm observation is', () => {
  const ctx = onlyDestination(), first = start(ctx), good = complete(first, ctx, D + 20 * MIN, [assessment(D + 20 * MIN)]);
  const next = advanceWeatherPulse(good.state, ctx, D + HOUR);
  for (const [entries, outcome] of [[null, 'failure'], [null, 'success'], [[assessment(D + HOUR, 'ZZBB', 2, { official: false })], 'success']]) {
    assert.equal(complete(next, ctx, D + HOUR, entries, outcome).activeIntents.length, 1);
  }
  assert.equal(complete(next, ctx, D + HOUR, [assessment(D + HOUR, 'ZZBB', 0)]).activeIntents.length, 0);
  assert.equal(complete(next, ctx, D + HOUR, [assessment(D + HOUR, 'ZZBB', 1)]).activeIntents.length, 0);
});
test('older observations cannot overwrite newer accepted facts or invent recovery', () => {
  const ctx = onlyDestination(), good = complete(start(ctx), ctx, D + 20 * MIN, [assessment(D + 20 * MIN)]);
  const next = advanceWeatherPulse(good.state, ctx, D + HOUR), older = complete(next, ctx, D + HOUR, [assessment(D + 10 * MIN, 'ZZBB', 0)]);
  assert.equal(older.activeIntents.length, 1); assert.equal(older.activeIntents[0].observedAt, D + 20 * MIN);
});
test('official same-minute correction can update material facts without weakening freshness', () => {
  const ctx = onlyDestination(), good = complete(start(ctx), ctx, D + 20 * MIN, [assessment(D + 20 * MIN)]);
  const next = advanceWeatherPulse(good.state, ctx, D + HOUR);
  const raw = report(D + 20 * MIN).raw.replace('METAR ', 'METAR COR ').replace('G30KT', 'G40KT');
  const corrected = complete(next, ctx, D + HOUR, [assessment(D + 20 * MIN, 'ZZBB', 3, { raw })]);
  assert.equal(corrected.activeIntents[0].severity, 3);
  assert.equal(corrected.activeIntents[0].observedAt, good.activeIntents[0].observedAt);
  assert.notEqual(corrected.activeIntents[0].materialKey, good.activeIntents[0].materialKey);
});
test('TAF-only material changes do not create a new observation intent identity', () => {
  const ctx = onlyDestination(), good = complete(start(ctx), ctx, D, [assessment(D, 'ZZBB', 2, { taf: 'synthetic TAF A' })]);
  const next = advanceWeatherPulse(good.state, ctx, D + HOUR), same = complete(next, ctx, D + HOUR, [assessment(D, 'ZZBB', 2, { taf: 'synthetic TAF B' })]);
  assert.equal(same.activeIntents[0].materialKey, good.activeIntents[0].materialKey);
});
test('age expiry removes intents while a request remains pending; wakes never repeat now', () => {
  const ctx = onlyDestination(), good = complete(start(ctx), ctx, D, [assessment()]);
  const waiting = advanceWeatherPulse(good.state, ctx, D + HOUR);
  assert.ok(waiting.request); assert.equal(waiting.activeIntents.length, 1); assert.equal(waiting.nextWakeAt, D + HOUR + 1);
  const expired = advanceWeatherPulse(waiting.state, ctx, D + HOUR + 1);
  assert.equal(expired.activeIntents.length, 0); assert.equal(expired.request, null); assert.ok(expired.state.pending);
  assert.ok(expired.nextWakeAt === null || expired.nextWakeAt > D + HOUR + 1);
});
test('accepted same-context station facts explicitly rebind; late old occurrence replies cannot', () => {
  const ctx = context([flight(), flight({ id: 'qa-leg-b', journeyId: 'qa-next-journey', departure: D + 2 * HOUR, arrival: D + 3 * HOUR, origin: 'ZZBB', destination: 'ZZCC' })]);
  const now = A + 30 * MIN, first = start(ctx, now), good = complete(first, ctx, now, [assessment(now)]);
  const changedAt = A + 45 * MIN + 1, rebound = advanceWeatherPulse(good.state, ctx, changedAt);
  assert.equal(rebound.request, null); assert.equal(rebound.activeIntents[0].flightId, 'qa-leg-b');
  assert.notEqual(rebound.activeIntents[0].bindingKey, good.activeIntents[0].bindingKey);
  const pending = advanceWeatherPulse(first.state, ctx, changedAt);
  assert.equal(pending.state.pending.revoked, true);
  assert.equal(settleWeatherPulse(pending.state, ctx, first.request, 'success', [assessment(now)], changedAt).activeIntents.length, 0);
});
test('rollback fails closed without quota reset, pending-slot release or old fact resurrection', () => {
  const ctx = onlyDestination(), good = complete(start(ctx), ctx, D + 10 * MIN, [assessment(D + 10 * MIN)]);
  const rollback = advanceWeatherPulse(good.state, ctx, D + 5 * MIN);
  assert.equal(rollback.reason, 'clock_rollback'); assert.equal(rollback.request, null); assert.deepEqual(rollback.activeIntents, []);
  assert.equal(rollback.state.lastAttemptAt, D); assert.equal(rollback.nextWakeAt, D + 10 * MIN);
  const recovered = advanceWeatherPulse(rollback.state, ctx, D + 10 * MIN);
  assert.deepEqual(recovered.activeIntents, []); assert.equal(recovered.request, null);
  const pending = start(ctx), reversed = advanceWeatherPulse(pending.state, ctx, D - 1);
  assert.equal(reversed.state.pending.revoked, true); assert.equal(reversed.request, null);
});
test('invalid now revokes admission; terminal acknowledgement still releases only that slot', () => {
  const first = start(), invalid = advanceWeatherPulse(first.state, context(), NaN);
  assert.equal(invalid.nextWakeAt, null); assert.equal(invalid.request, null); assert.equal(invalid.state.pending.revoked, true);
  const done = settleWeatherPulse(invalid.state, context(), first.request, 'aborted-ack', null, NaN);
  assert.equal(done.state.pending, null); assert.equal(done.state.lastAttemptAt, D);
});
test('bounded outputs and strictly future wakes over a dense synthetic roster timeline', () => {
  const legs = Array.from({ length: 120 }, (_, index) => flight({ id: `qa-${String(index).padStart(3, '0')}`, departure: D + index * 5 * MIN,
    arrival: A + index * 5 * MIN, origin: 'ZZAA', destination: index % 2 ? 'ZZBB' : 'ZZCC' }));
  const ctx = context(legs); let state = createWeatherPulseState(), lastAttempt = -Infinity;
  for (let now = D - 4 * HOUR; now < D + 14 * HOUR; now += 7 * MIN) {
    let out = advanceWeatherPulse(state, ctx, now);
    if (out.request) {
      assert.ok(now - lastAttempt >= HOUR); lastAttempt = now;
      const entries = out.request.stations.map(airport => assessment(now, airport));
      out = settleWeatherPulse(out.state, ctx, out.request, 'success', entries, now);
    }
    assert.ok(out.activeIntents.length <= 2 && out.state.selected.length <= 2 && out.state.observations.length <= 2);
    assert.ok(out.nextWakeAt === null || out.nextWakeAt > now); state = out.state;
  }
});
test('explicit observation admission is timezone invariant; extraction behavior is not silently changed', () => {
  const moduleUrl = new URL('../../shared/operational-weather-pulse.mjs', import.meta.url).href;
  const policyUrl = new URL('../../server/weather/critical-observation.mjs', import.meta.url).href;
  const source = `import {createWeatherPulseState,advanceWeatherPulse,settleWeatherPulse} from ${JSON.stringify(moduleUrl)};
    import {evaluateWeatherObservation} from ${JSON.stringify(policyUrl)};
    const ctx=${JSON.stringify(context())}, now=${D}, report=${JSON.stringify(report())};
    const outputs=['2032-02-02T12:00:00','2032-02-02T12:00:00Z','2032-02-02T09:00:00-03:00',${D / 1000}].map(observedAt=>{
      const r=advanceWeatherPulse(createWeatherPulseState(),ctx,now);
      return settleWeatherPulse(r.state,ctx,r.request,'success',[{report:{...report,observedAt},severity:2}],now).activeIntents.length;
    });console.log(JSON.stringify(outputs));`;
  for (const TZ of ['UTC', 'America/Sao_Paulo', 'Pacific/Auckland']) {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr); assert.deepEqual(JSON.parse(child.stdout), [0, 1, 1, 1]);
  }
  assert.equal(typeof evaluateWeatherObservation, 'function');
});
test('pure production module has no transport/timer/storage/global clock side effects', () => {
  const source = fs.readFileSync(new URL('../../shared/operational-weather-pulse.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|setTimeout|setInterval|localStorage|sessionStorage|navigator|document|window)\s*[.(]/);
  assert.doesNotMatch(source, /Date\.now|new Date\(\)/);
  const imports = [...source.matchAll(/from '([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(imports, ['../server/weather/critical-observation.mjs']);
  assert.ok(fileURLToPath(import.meta.url).endsWith('operational-weather-pulse.test.mjs'));
});
