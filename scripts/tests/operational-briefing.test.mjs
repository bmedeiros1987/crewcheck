import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildOperationalBriefingPreview as preview, planOperationalBriefingCandidate as plan } from '../../server/concierge/operational-briefing.mjs';

// Entirely synthetic 2099 fixtures. Compile the canonical bridge first:
// node scripts/p1-concierge-journey/compile.mjs
// node --test scripts/tests/operational-briefing.test.mjs
const MINUTE = 60_000;
const NOW = Date.parse('2099-10-06T07:00:00Z');
const iso = value => new Date(value).toISOString();
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = value => structuredClone(value);
const leg = (id, origin, destination, departureTime, arrivalTime, extra = {}) => ({
  id, flightNumber: `SYNTH-${id}`, origin, destination, departureTime, arrivalTime, workType: 'OP', ...extra,
});
function day(date, dutyReport, dutyDebrief, legs, extra = {}) {
  const [dayNumber, month, year] = date.split('/').map(Number);
  return { date, dayNumber, month, year, dayOfWeek: '', type: 'VOO', pairingCode: legs[0]?.flightNumber || '',
    dutyReport, dutyDebrief, dutyHours: null, flyingHours: null, isNextDay: false, hotel: null,
    base: 'AAA', rawText: '', legs, ...extra };
}
const roster = (days, extra = {}) => ({ month: 10, year: 2099, base: 'AAA', rank: 'CCM', rawText: '', days, ...extra });
const simple = () => roster([day('06/10/2099', '05:00', '08:35', [leg('ONE', 'AAA', 'BBB', '06:00', '08:00')])]);
const overnight = () => roster([
  day('04/10/2099', '02:40', '06:25', [leg('EARLIER', 'BBB', 'CCC', '02:40', '05:55')]),
  day('04/10/2099', '23:18', '03:20', [leg('MIDNIGHT', 'CCC', 'DDD', '00:05', '03:20')]),
  day('05/10/2099', '04:20', '07:35', [leg('CONTINUATION', 'DDD', 'AAA', '04:20', '07:05')]),
]);
function authorityFor(source = simple(), now = NOW, extra = {}) {
  return { ownerScope: 'synthetic-account-A', rosterId: 'synthetic-active-row-A',
    rosterKey: `${source.year}-${String(source.month).padStart(2, '0')}`, fingerprint: hash(source),
    activeRevision: iso(now - 2 * MINUTE), checkedAt: iso(now), active: true,
    completeDates: source.days.filter(item => typeof item.date === 'string').map(item => item.date.split('/').reverse().join('-')), ...extra };
}
function build(source = simple(), options = {}) {
  const now = options.now ?? NOW;
  return preview({ roster: source, authority: authorityFor(source, now), now, ...options });
}
function candidate(overrides = {}) {
  const source = simple();
  const authority = authorityFor(source);
  const current = preview({ roster: source, authority, now: NOW });
  return { preview: current, authority, now: NOW,
    bindingRevision: 'synthetic-telegram-binding-v1',
    consent: { enabled: true, topic: 'operational-next-duty', scopeHash: current.authority.scopeHash,
      bindingRevision: 'synthetic-telegram-binding-v1', revision: 'synthetic-operational-consent-v1',
      grantedAt: iso(Date.parse(current.window.opensAt) - MINUTE) },
    deliveryState: { available: true, seenEventIds: [] }, ...overrides };
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
const stationForAirport = airport => ({ AAA: 'ZAAA', BBB: 'ZBBB', CCC: 'ZCCC', DDD: 'ZDDD' })[airport] || '';
function observation(airport = 'AAA', observedAt = NOW - 10 * MINUTE, extra = {}) {
  const stamp = iso(observedAt), station = stationForAirport(airport);
  return { airport, report: { ok: true, official: true, provider: 'redemet', station,
    observedAt: stamp, raw: `METAR ${station} ${stamp.slice(8, 10)}${stamp.slice(11, 13)}${stamp.slice(14, 16)}Z 00000KT CAVOK 20/10 Q1013`, ...extra } };
}
function nextPublication(first, source, overrides = {}) {
  return build(source, { now: NOW + 10_000, previousPublication: first.publication, ...overrides });
}

test('overnight program retains previous-day presentation and every canonical continuation', () => {
  const result = build(overnight(), { now: Date.parse('2099-10-05T01:20:00Z') });
  assert.equal(result.status, 'preview');
  assert.deepEqual(result.duty.legs.map(item => item.flight), ['SYNTH-MIDNIGHT', 'SYNTH-CONTINUATION']);
  assert.equal(result.duty.presentationAt, '2099-10-05T02:18:00.000Z');
  assert.equal(result.duty.legs[0].departureAt, '2099-10-05T03:05:00.000Z');
  assert.equal(result.duty.plannedEndAt, '2099-10-05T10:35:00.000Z');
  assert.equal(result.duty.endKind, 'duty-debrief');
  assert.equal(result.window.opensAt, '2099-10-05T00:48:00.000Z');
  assert.equal(result.window.state, 'due');
  const active = build(overnight(), { now: Date.parse('2099-10-05T08:00:00Z') });
  assert.equal(active.duty.journeyId, result.duty.journeyId);
  assert.equal(active.window.state, 'in-progress');
  assert.equal(build(overnight(), { now: Date.parse('2099-10-06T12:00:00Z') }).window.state, 'no-upcoming-duty');
});

test('real boundaries select distinct journeys, including two in one published day', () => {
  for (const item of [
    { report: '04:00', departure: '04:20', origin: 'DDD' },
    { report: '15:20', departure: '15:20', origin: 'DDD' },
    { report: '04:20', departure: '04:20', origin: 'EEE' },
  ]) {
    const source = roster([overnight().days[1], day('05/10/2099', item.report, '18:00', [leg('SEPARATE', item.origin, 'AAA', item.departure, '17:30')])]);
    const result = build(source, { now: Date.parse('2099-10-04T12:00:00Z') });
    assert.deepEqual(result.duty.legs.map(item => item.flight), ['SYNTH-MIDNIGHT']);
  }
  const source = roster([day('06/10/2099', '05:00', '22:00', [
    leg('ONE', 'AAA', 'BBB', '06:00', '08:00'),
    leg('TWO', 'BBB', 'CCC', '20:00', '21:30', { presentationTime: '19:10' }),
  ])]);
  const early = build(source);
  assert.deepEqual(early.duty.legs.map(item => item.flight), ['SYNTH-ONE']);
  assert.equal(early.duty.endKind, 'arrival');
  assert.equal(early.duty.plannedEndAt, '2099-10-06T11:00:00.000Z');
  const late = build(source, { now: Date.parse('2099-10-06T21:00:00Z') });
  assert.deepEqual(late.duty.legs.map(item => item.flight), ['SYNTH-TWO']);
  assert.equal(late.duty.presentationAt, '2099-10-06T22:10:00.000Z');
  assert.equal(late.duty.endKind, 'duty-debrief');
  assert.notEqual(early.dutyKey, late.dutyKey);
});

test('missing, departure-equal or unsafe arrival-equal presentation never opens a briefing window', () => {
  for (const report of [null, '06:00', '08:00']) {
    const source = simple(); source.days[0].dutyReport = report;
    const result = build(source);
    assert.equal(result.duty.presentationAt, null);
    assert.equal(result.window.state, 'presentation-unconfirmed');
    assert.equal(result.window.opensAt, null);
    assert.equal(result.duty.legs[0].departureAt, '2099-10-06T09:00:00.000Z');
    assert.equal(plan(candidate({ preview: result, authority: authorityFor(source) })).eligible, false);
  }
});

test('missing or arrival-equal debrief remains a planned arrival without a confirmed duty end', () => {
  for (const debrief of [null, '08:00']) {
    const source = simple(); source.days[0].dutyDebrief = debrief;
    const result = build(source);
    assert.equal(result.duty.endKind, 'arrival');
    assert.equal(result.duty.plannedEndAt, '2099-10-06T11:00:00.000Z');
  }
});

test('an earlier reserve or independent nonflight duty blocks flight briefing selection', () => {
  for (const type of ['ASB', 'RES']) {
    const source = simple();
    source.days.unshift(day('06/10/2099', '03:00', '04:30', [], { type, pairingCode: type }));
    const result = build(source);
    assert.equal(result.window.state, 'unsupported-duty');
    assert.equal(result.duty, null);
    assert.deepEqual(result.weather, []);
    assert.equal(result.submissionAllowed, false);
  }
});

test('authority must be current, active, complete and tied to the roster period', () => {
  const source = simple();
  const base = authorityFor(source);
  for (const authority of [null, {}, { ...base, active: false }, { ...base, ownerScope: '' },
    { ...base, rosterId: '' }, { ...base, fingerprint: 'unverified' }, { ...base, rosterKey: '2099-13' },
    { ...base, checkedAt: iso(NOW - MINUTE - 1) }, { ...base, checkedAt: iso(NOW + 1) },
    { ...base, activeRevision: iso(NOW + 1) }, { ...base, checkedAt: '2099-10-06 07:00' }]) {
    const result = preview({ roster: source, authority, now: NOW });
    assert.equal(result.status, 'blocked');
    assert.equal(result.submissionAllowed, false);
  }
  assert.equal(build(source, { authority: { ...base, rosterKey: '2099-11' } }).reason, 'roster-period-mismatch');
  assert.equal(preview({ roster: source, authority: base }).status, 'blocked', 'wall clock is never inferred');
  const first = build(source);
  assert.equal(build(source, { authority: { ...base, activeRevision: iso(NOW - 3 * MINUTE) }, previousPublication: first.publication }).reason, 'older-active-revision');
});

test('canonical published period must match authority while real month-end continuations survive', () => {
  const contradicting = roster([day('06/11/2099', '05:00', '08:35', [leg('WRONG-MONTH', 'AAA', 'BBB', '06:00', '08:00')])]);
  const rejected = build(contradicting);
  assert.equal(rejected.status, 'blocked');
  assert.equal(rejected.reason, 'canonical-roster-period-mismatch');
  assert.equal(rejected.submissionAllowed, false);
  const continuation = roster([
    day('31/10/2099', '21:30', '23:55', [leg('MONTH-END', 'AAA', 'BBB', '22:00', '23:55')]),
    day('01/11/2099', '01:00', '04:35', [leg('NEXT-MONTH', 'BBB', 'CCC', '01:00', '04:00')]),
  ], { rawText: 'Synthetic CrewRosterReport 01-Oct-2099 to 31-Oct-2099' });
  const result = build(continuation, { now: Date.parse('2099-11-01T00:00:00Z') });
  assert.equal(result.status, 'preview');
  assert.equal(result.authority.rosterKey, '2099-10');
  assert.deepEqual(result.duty.legs.map(item => item.flight), ['SYNTH-MONTH-END', 'SYNTH-NEXT-MONTH']);
  assert.equal(result.duty.presentationAt, '2099-11-01T00:30:00.000Z');
  assert.equal(result.duty.plannedEndAt, '2099-11-01T07:35:00.000Z');
});

test('missing or invalid published dates and flight clocks never borrow canonical defaults', () => {
  for (const date of [null, '', '6/10/2099', '2099-10-06', '31/02/2099', '06/13/2099']) {
    const source = simple(); source.days[0].date = date;
    const result = build(source);
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'incomplete-published-dates-or-clocks');
    assert.equal(result.submissionAllowed, false);
  }
  for (const field of ['departureTime', 'arrivalTime']) {
    for (const value of [null, '', 'invalid', '24:00', '06:60', '6:0']) {
      const source = simple(); source.days[0].legs[0][field] = value;
      const result = build(source);
      assert.equal(result.status, 'blocked', `${field}: ${value}`);
      assert.equal(result.submissionAllowed, false);
    }
  }
  for (const value of [null, {}, undefined]) {
    const source = simple(); source.days[0].legs = value;
    assert.equal(build(source).status, 'blocked');
  }
});

test('invalid lead windows and malformed observations fail closed', () => {
  for (const leadMinutes of [0, 14, 181, 30.5, '90', NaN]) {
    assert.equal(build(simple(), { leadMinutes }).status, 'blocked');
  }
  for (const weather of [null, {}, Array.from({ length: 41 }, () => observation())]) {
    assert.equal(build(simple(), { weather }).status, 'blocked');
  }
  assert.equal(build(simple(), { stationForAirport: null }).status, 'blocked');
  assert.equal(build(simple(), { stationForAirport: () => { throw new Error('Synthetic unavailable resolver'); } }).status, 'blocked');
});

test('first observation establishes a silent baseline and never sends a historical backlog', () => {
  const source = simple();
  source.days.unshift(day('01/10/2099', '05:00', '08:35', [leg('PAST', 'AAA', 'BBB', '06:00', '08:00')]));
  const first = build(source);
  assert.equal(first.publication.baselineEstablished, true);
  assert.deepEqual(first.publication.changes, []);
  assert.deepEqual(first.publication.review.history, []);
  assert.deepEqual(first.duty.legs.map(item => item.flight), ['SYNTH-ONE']);
  assert.equal(first.submissionAllowed, false);
});

test('unreadable same-scope previous publication cannot silently become a new baseline', () => {
  const first = build();
  for (const review of [null, {}, { ...clone(first.publication.review), owner: 'other-scope' },
    { ...clone(first.publication.review), history: 'corrupt' },
    { ...clone(first.publication.review), publication: { items: [], completeDates: [], revision: 'wrong-revision' } }]) {
    const result = build(simple(), { previousPublication: { ...first.publication, review } });
    assert.equal(result.status, 'blocked');
    assert.equal(result.submissionAllowed, false);
  }
});

test('same active revision cannot represent a different roster fingerprint', () => {
  const source = simple(), first = build(source), changed = clone(source);
  changed.days[0].legs[0].arrivalTime = '08:15';
  const authority = authorityFor(changed, NOW + 10_000, { activeRevision: first.authority.activeRevision });
  assert.notEqual(authority.fingerprint, first.authority.fingerprint);
  const result = nextPublication(first, changed, { authority });
  assert.equal(result.status, 'blocked');
  assert.equal(result.submissionAllowed, false);
});

test('same fingerprint cannot represent changed canonical publication content', () => {
  const source = simple(), first = build(source), changed = clone(source);
  changed.days[0].legs[0].arrivalTime = '08:15';
  for (const activeRevision of [first.authority.activeRevision, iso(NOW + 9_000)]) {
    const authority = authorityFor(changed, NOW + 10_000, { fingerprint: first.authority.fingerprint, activeRevision });
    const result = nextPublication(first, changed, { authority });
    assert.equal(result.status, 'blocked');
    assert.equal(result.submissionAllowed, false);
  }
});

test('account and month switches establish isolated baselines without prior changes', () => {
  const initial = build();
  const changed = simple(); changed.days[0].legs[0].arrivalTime = '08:15';
  const history = nextPublication(initial, changed);
  assert.equal(history.publication.changes.length, 1);
  const otherAccount = nextPublication(history, changed, { authority: authorityFor(changed, NOW + 10_000, { ownerScope: 'synthetic-account-B' }) });
  assert.equal(otherAccount.publication.baselineEstablished, true);
  assert.deepEqual(otherAccount.publication.changes, []);
  assert.deepEqual(otherAccount.publication.review.history, []);
  const nextMonth = roster([day('06/11/2099', '05:00', '08:35', [leg('ONE', 'AAA', 'BBB', '06:00', '08:00')])], { month: 11 });
  const monthResult = nextPublication(history, nextMonth);
  assert.equal(monthResult.publication.baselineEstablished, true);
  assert.deepEqual(monthResult.publication.changes, []);
  assert.deepEqual(monthResult.publication.review.history, []);
});

test('IDs and input ordering cannot create publication changes or a new semantic duty', () => {
  const source = roster([day('06/10/2099', '05:00', '12:35', [
    leg('ONE', 'AAA', 'BBB', '06:00', '08:00'), leg('TWO', 'BBB', 'CCC', '10:00', '12:00'),
  ]), day('08/10/2099', '05:00', '08:35', [leg('LATER', 'AAA', 'BBB', '06:00', '08:00')])]);
  const first = build(source);
  const reimport = clone(source);
  reimport.days.reverse();
  for (const item of reimport.days) {
    item.id = 'new-parser-day-id'; item.legs.reverse();
    for (const flight of item.legs) flight.id = `new-parser-id-${flight.id}`;
  }
  const result = nextPublication(first, reimport);
  assert.equal(result.publication.baselineEstablished, false);
  assert.equal(result.publication.review.version, first.publication.review.version);
  assert.deepEqual(result.publication.changes, []);
  assert.equal(result.dutyKey, first.dutyKey);
  assert.equal(result.previewFingerprint, first.previewFingerprint);
});

test('a uniquely correlated semantic change is emitted once despite reused IDs', () => {
  const source = simple(), first = build(source);
  const changed = clone(source); changed.days[0].legs[0].arrivalTime = '08:15';
  const result = nextPublication(first, changed);
  assert.equal(result.publication.baselineEstablished, false);
  assert.equal(result.publication.changes.length, 1);
  const change = result.publication.changes[0];
  assert.equal(change.kind, 'changed');
  assert.equal(change.before.arrival, '08:00');
  assert.equal(change.after.arrival, '08:15');
  assert.match(change.eventId, /^[a-f0-9]{64}$/);
  const repeated = nextPublication(result, changed);
  assert.deepEqual(repeated.publication.changes, []);
  assert.equal(repeated.publication.review.version, result.publication.review.version);
  assert.equal(repeated.dutyKey, result.dutyKey);
});

test('recurring A to B transitions receive distinct change occurrence identities', () => {
  const original = simple(), changed = simple(); changed.days[0].legs[0].arrivalTime = '08:15';
  const baseline = build(original);
  const firstB = nextPublication(baseline, changed);
  const secondA = nextPublication(firstB, original, { now: NOW + 20_000,
    authority: authorityFor(original, NOW + 20_000) });
  const secondB = nextPublication(secondA, changed, { now: NOW + 30_000,
    authority: authorityFor(changed, NOW + 30_000) });
  for (const result of [firstB, secondA, secondB]) {
    assert.equal(result.status, 'preview');
    assert.equal(result.publication.changes.length, 1);
    assert.equal(result.publication.changes[0].kind, 'changed');
  }
  assert.deepEqual(firstB.publication.changes[0].before, secondB.publication.changes[0].before);
  assert.deepEqual(firstB.publication.changes[0].after, secondB.publication.changes[0].after);
  assert.equal(new Set([firstB, secondA, secondB].map(result => result.publication.changes[0].eventId)).size, 3);
  const reimport = nextPublication(secondB, changed, { now: NOW + 40_000,
    authority: authorityFor(changed, NOW + 40_000) });
  assert.deepEqual(reimport.publication.changes, []);
  assert.equal(reimport.publication.review.version, secondB.publication.review.version);
});

test('debrief-only updates refresh the duty end but remain outside publication-change detection', () => {
  // Scope limit: the existing comparison representation omits dutyDebrief.
  // The preview must disclose that limit instead of claiming exhaustive changes.
  const first = build(), changed = simple();
  changed.days[0].dutyDebrief = '08:50';
  const result = nextPublication(first, changed);
  assert.equal(result.status, 'preview');
  assert.equal(first.duty.plannedEndAt, '2099-10-06T11:35:00.000Z');
  assert.equal(result.duty.plannedEndAt, '2099-10-06T11:50:00.000Z');
  assert.equal(result.duty.endKind, 'duty-debrief');
  assert.deepEqual(result.publication.changes, []);
  assert.equal(result.publication.review.version, first.publication.review.version);
  assert.ok(result.unsupportedChanges.includes('duty-debrief'));
});

test('unique flight correlation retains a date-only publication change', () => {
  const first = build(), changed = simple();
  changed.days[0].date = '07/10/2099'; changed.days[0].dayNumber = 7;
  const result = nextPublication(first, changed);
  assert.equal(result.publication.changes.length, 1);
  assert.equal(result.publication.changes[0].kind, 'changed');
  assert.equal(result.publication.changes[0].before.date, '2099-10-06');
  assert.equal(result.publication.changes[0].after.date, '2099-10-07');
});

test('duplicate flight anchors stay ambiguous instead of inventing correspondence', () => {
  const source = roster([
    day('06/10/2099', '05:00', '08:35', [leg('REPEAT', 'AAA', 'BBB', '06:00', '08:00')]),
    day('07/10/2099', '05:00', '08:35', [leg('REPEAT', 'AAA', 'BBB', '06:00', '08:00')]),
  ]);
  const first = build(source), changed = clone(source);
  for (const item of changed.days) item.legs[0].arrivalTime = '08:15';
  const result = nextPublication(first, changed);
  assert.deepEqual(result.publication.changes, []);
  assert.equal(result.publication.uncertain, true);
  assert.equal(result.publication.unconfirmed.length, 4);
  assert.ok(result.publication.unconfirmed.every(item => item.kind === 'ambiguous'));
});

test('empty partial publication never confirms deletion or erases the last known baseline', () => {
  const first = build(), empty = roster([]);
  const result = nextPublication(first, empty, { authority: authorityFor(empty, NOW + 10_000, { completeDates: [] }) });
  assert.deepEqual(result.publication.changes, []);
  assert.equal(result.publication.uncertain, true);
  assert.equal(result.publication.unconfirmed[0].kind, 'not-observed');
  assert.deepEqual(result.publication.review.baseline.items, first.publication.review.baseline.items);
  // A repeated empty observation is compared to the exact prior observation,
  // whose fingerprint matches; the retained nonempty baseline is not that source.
  const repeatedEmpty = nextPublication(result, empty, { now: NOW + 15_000,
    authority: authorityFor(empty, NOW + 15_000, { completeDates: [] }) });
  assert.equal(repeatedEmpty.status, 'preview');
  assert.deepEqual(repeatedEmpty.publication.changes, []);
  assert.deepEqual(repeatedEmpty.publication.review.baseline.items, first.publication.review.baseline.items);
  const restored = nextPublication(repeatedEmpty, simple(), { now: NOW + 20_000,
    authority: authorityFor(simple(), NOW + 20_000) });
  assert.equal(restored.status, 'preview');
  assert.deepEqual(restored.publication.changes, []);
  assert.equal(restored.publication.unconfirmed.length, 0);
});

test('confirmed complete-date removal is distinguished from partial absence', () => {
  const first = build(), empty = roster([]);
  const result = nextPublication(first, empty, { authority: authorityFor(empty, NOW + 10_000, { completeDates: ['2099-10-06'] }) });
  assert.equal(result.publication.changes.length, 1);
  assert.equal(result.publication.changes[0].kind, 'removed');
});

test('equal duplicate rest removals preserve occurrence multiplicity with distinct event IDs', () => {
  const source = roster([
    day('06/10/2099', null, null, [], { type: 'DO', pairingCode: 'DO' }),
    day('06/10/2099', null, null, [], { type: 'do', pairingCode: 'do' }),
  ]);
  const first = build(source), empty = roster([]);
  assert.equal(first.publication.review.publication.items.length, 2);
  assert.deepEqual(first.publication.review.publication.items[0], first.publication.review.publication.items[1]);
  const result = nextPublication(first, empty, { authority: authorityFor(empty, NOW + 10_000, { completeDates: ['2099-10-06'] }) });
  assert.equal(result.status, 'preview');
  assert.equal(result.publication.changes.length, 2);
  assert.ok(result.publication.changes.every(item => item.kind === 'removed'));
  assert.deepEqual(result.publication.changes[0].before, result.publication.changes[1].before);
  assert.equal(new Set(result.publication.changes.map(item => item.eventId)).size, 2);
});

test('weather contains only supplied fresh official observations at a verified station', () => {
  const source = simple();
  const official = observation();
  const result = build(source, { weather: [official], stationForAirport });
  const current = result.weather.find(item => item.airport === 'AAA');
  assert.equal(current.state, 'available');
  assert.equal(current.station, 'ZAAA');
  assert.equal(current.provider, 'redemet');
  assert.equal(current.raw, official.report.raw);
  assert.equal(current.observedAt, official.report.observedAt);
  assert.equal(current.expiresAt, iso(NOW + 50 * MINUTE));
  const absent = result.weather.find(item => item.airport === 'BBB');
  assert.equal(absent.state, 'unavailable');
  assert.equal(absent.raw, undefined);
  assert.equal(result.submissionAllowed, false);
  assert.deepEqual(result.unsupportedSources, ['radar', 'transport', 'notam', 'operational-clearance']);
  assert.match(result.sourceLabel, /não comprova nova publicação/);
});

test('weather rejects wrong station, time mismatch, stale, future, unofficial and invented reports', () => {
  const invalid = [
    observation('AAA', NOW - 10 * MINUTE, { official: false }),
    observation('AAA', NOW - 10 * MINUTE, { ok: false }),
    observation('AAA', NOW - 10 * MINUTE, { provider: 'synthetic-untrusted' }),
    observation('AAA', NOW - 10 * MINUTE, { station: 'ZBBB' }),
    observation('AAA', NOW - 10 * MINUTE, { raw: 'METAR ZBBB 060650Z 00000KT CAVOK 20/10 Q1013' }),
    observation('AAA', NOW - 10 * MINUTE, { raw: 'METAR ZAAA 060649Z 00000KT CAVOK 20/10 Q1013' }),
    observation('AAA', NOW - 10 * MINUTE, { observedAt: 'not-a-time' }),
    observation('AAA', NOW - 10 * MINUTE, { raw: 'Probably fine at the airport' }),
    observation('AAA', NOW - 61 * MINUTE),
    observation('AAA', NOW + MINUTE),
  ];
  for (const item of invalid) {
    const result = build(simple(), { weather: [item], stationForAirport });
    assert.equal(result.weather.find(value => value.airport === 'AAA').state, 'unavailable');
    assert.equal(result.weather.find(value => value.airport === 'AAA').raw, undefined);
  }
  const unknown = build(simple(), { weather: [observation()], stationForAirport: () => '' });
  assert.equal(unknown.weather[0].reason, 'station-unconfirmed');
  assert.equal(unknown.weather[0].raw, undefined);
});

test('full station mappings are validated without truncating invalid station suffixes', () => {
  for (const mapping of ['ZAAA-BAD', 'ZAAA ZBBB', 'ZAAA123', 'ZAAA\u0000', 123, null]) {
    const result = build(simple(), { weather: [observation()], stationForAirport: () => mapping });
    assert.equal(result.weather[0].state, 'unavailable');
    assert.equal(result.weather[0].reason, 'station-unconfirmed');
    assert.equal(result.weather[0].raw, undefined);
  }
});

test('same-time official weather conflicts fail closed while latest uncontested reports win', () => {
  const first = observation(), conflict = observation('AAA', NOW - 10 * MINUTE, { provider: 'aviationweather', raw: 'METAR ZAAA 060650Z 30025KT 2000 +RA 20/10 Q1013' });
  const result = build(simple(), { weather: [first, conflict], stationForAirport });
  assert.equal(result.weather[0].reason, 'conflicting-observations');
  assert.equal(result.weather[0].raw, undefined);
  const duplicate = observation('AAA', NOW - 10 * MINUTE, { provider: 'aviationweather' });
  const one = build(simple(), { weather: [first, duplicate], stationForAirport });
  const two = build(simple(), { weather: [duplicate, first], stationForAirport });
  assert.equal(one.weather[0].state, 'available');
  assert.deepEqual(one.weather, two.weather);
  assert.equal(one.previewFingerprint, two.previewFingerprint);
  const newer = observation('AAA', NOW - 5 * MINUTE);
  const selected = build(simple(), { weather: [conflict, first, newer], stationForAirport });
  assert.equal(selected.weather[0].observedAt, newer.report.observedAt);
});

test('planning requires its own explicit topic consent and current account/channel binding', () => {
  const args = candidate();
  assert.equal(plan(args).eligible, true);
  for (const consent of [null, {}, { ...args.consent, enabled: false },
    { ...args.consent, topic: 'critical-weather' }, { ...args.consent, scopeHash: hash('synthetic-account-B') },
    { ...args.consent, bindingRevision: 'old-binding' }, { ...args.consent, revision: '' }]) {
    const result = plan({ ...args, consent });
    assert.equal(result.eligible, false);
    assert.equal(result.submissionAllowed, false);
  }
  assert.equal(plan({ ...args, bindingRevision: '' }).eligible, false);
  assert.equal(plan({ ...args, bindingRevision: 'new-binding' }).eligible, false);
});

test('consent must exist at the window start, preventing activation backfill', () => {
  const args = candidate(), opens = Date.parse(args.preview.window.opensAt);
  for (const grantedAt of [iso(opens + 1), iso(NOW), iso(NOW + 1), '2099-10-06 06:00', 'invalid']) {
    assert.equal(plan({ ...args, consent: { ...args.consent, grantedAt } }).eligible, false);
  }
  assert.equal(plan({ ...args, consent: { ...args.consent, grantedAt: iso(opens) } }).eligible, true);
});

test('current authority mismatch or stale read rejects an otherwise eligible candidate', () => {
  const args = candidate();
  for (const change of [
    { ownerScope: 'synthetic-account-B' }, { rosterId: 'synthetic-active-row-B' }, { rosterKey: '2099-11' },
    { fingerprint: 'b'.repeat(64) }, { activeRevision: iso(NOW - MINUTE) },
    { checkedAt: iso(NOW - MINUTE - 1) }, { active: false },
  ]) assert.equal(plan({ ...args, authority: { ...args.authority, ...change } }).eligible, false);
});

test('readable durable delivery state is mandatory and an unreadable ledger is never empty', () => {
  const args = candidate();
  for (const deliveryState of [undefined, null, {}, { available: false, seenEventIds: [] },
    { available: true }, { available: true, seenEventIds: null }, { available: true, seenEventIds: {} }]) {
    const result = plan({ ...args, deliveryState });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, 'delivery-state-unavailable');
    assert.equal(result.submissionAllowed, false);
  }
});

test('malformed durable ledger event IDs are rejected instead of treated as unseen', () => {
  const args = candidate();
  for (const seenEventIds of [[null], [123], [''], ['not-an-event-id'], ['a'.repeat(63)],
    ['a'.repeat(65)], ['A'.repeat(64)], [' ' + 'a'.repeat(64)], ['a'.repeat(64), {}]]) {
    const result = plan({ ...args, deliveryState: { available: true, seenEventIds } });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, 'delivery-state-unavailable');
    assert.equal(result.submissionAllowed, false);
  }
});

test('malformed, zero-length or reversed briefing windows reject without throwing', () => {
  const args = candidate(), original = args.preview.window;
  const windows = [null, {}, { ...original, opensAt: null }, { ...original, expiresAt: null },
    { ...original, opensAt: 'invalid' }, { ...original, expiresAt: 'invalid' },
    { ...original, opensAt: NOW - MINUTE }, { ...original, expiresAt: NOW + MINUTE },
    { ...original, opensAt: '2099-10-06 06:30' },
    { ...original, opensAt: original.expiresAt, expiresAt: original.opensAt },
    { ...original, expiresAt: original.opensAt }];
  for (const window of windows) {
    let result;
    assert.doesNotThrow(() => { result = plan({ ...args, preview: { ...args.preview, window } }); });
    assert.equal(result.eligible, false);
    assert.equal(result.reason, 'outside-briefing-window');
    assert.equal(result.submissionAllowed, false);
  }
});

test('identical reimports retain event identity and recorded events are rejected', () => {
  const args = candidate(), first = plan(args);
  const source = simple(); source.days[0].id = 'changed-parser-id'; source.days[0].legs[0].id = 'new-leg-id';
  const authority = authorityFor(source, NOW + 10_000, { rosterId: 'synthetic-reimport-row', activeRevision: iso(NOW + 9_000) });
  const current = build(source, { now: NOW + 10_000, authority, previousPublication: args.preview.publication });
  const next = plan({ ...args, preview: current, authority, now: NOW + 10_000 });
  assert.equal(next.eligible, true);
  assert.equal(next.event.eventId, first.event.eventId);
  assert.equal(next.event.previewFingerprint, first.event.previewFingerprint);
  const repeated = plan({ ...args, deliveryState: { available: true, seenEventIds: [first.event.eventId] } });
  assert.equal(repeated.eligible, false);
  assert.equal(repeated.reason, 'already-recorded');
  assert.equal(repeated.submissionAllowed, false);
});

test('weather refresh changes preview evidence without creating a second duty event', () => {
  const args = candidate(), first = plan(args);
  const current = build(simple(), { weather: [observation()], stationForAirport });
  const fresh = plan({ ...args, preview: current });
  assert.equal(fresh.eligible, true);
  assert.equal(fresh.event.eventId, first.event.eventId);
  assert.notEqual(fresh.event.previewFingerprint, first.event.previewFingerprint);
  assert.equal(plan({ ...args, preview: current, deliveryState: { available: true, seenEventIds: [first.event.eventId] } }).reason, 'already-recorded');
});

test('preview, presentation window and official observation expiry prevent stale candidates', () => {
  const args = candidate();
  const expiry = Date.parse(args.preview.validUntil);
  const expired = plan({ ...args, now: expiry, authority: { ...args.authority, checkedAt: iso(expiry) } });
  assert.equal(expired.eligible, false);
  assert.equal(expired.reason, 'preview-expired');
  for (const now of [Date.parse(args.preview.window.opensAt) - 1, Date.parse(args.preview.window.expiresAt)]) {
    const source = simple(), authority = authorityFor(source, now);
    const current = build(source, { now, authority });
    assert.equal(plan({ ...args, preview: current, authority, now }).eligible, false);
  }
  const almostStale = observation('AAA', NOW - 60 * MINUTE + 30_000);
  const current = build(simple(), { weather: [almostStale], stationForAirport });
  assert.equal(current.weather[0].state, 'available');
  assert.equal(current.validUntil, iso(NOW + 30_000));
  assert.equal(plan({ ...args, preview: current }).eligible, true);
  const sourceExpired = plan({ ...args, preview: current, now: NOW + 30_000 });
  assert.equal(sourceExpired.eligible, false, 'an official observation expires before the normal one-minute preview TTL');
  assert.equal(sourceExpired.submissionAllowed, false);
  const agedRead = { ...args.authority, checkedAt: iso(NOW - 45_000) };
  const agedPreview = build(simple(), { authority: agedRead });
  assert.equal(agedPreview.validUntil, iso(NOW + 15_000));
  assert.equal(plan({ ...args, preview: agedPreview, authority: agedRead, now: NOW + 15_000 }).eligible, false);
  const futurePreview = { ...args.preview, generatedAt: iso(NOW + 1) };
  assert.equal(plan({ ...args, preview: futurePreview }).eligible, false);
});

test('eligible means reviewable candidate only; no output ever authorizes submission', () => {
  const args = candidate(), result = plan(args);
  assert.equal(args.preview.submissionAllowed, false);
  assert.equal(result.eligible, true);
  assert.equal(result.submissionAllowed, false);
  assert.equal(result.event.kind, 'operational-next-duty');
  assert.equal(result.event.occurredAt, args.preview.window.opensAt);
  assert.equal(result.event.expiresAt, args.preview.validUntil);
  assert.ok(Date.parse(result.event.expiresAt) <= Date.parse(args.preview.window.expiresAt));
  assert.equal(result.event.bindingRevision, args.bindingRevision);
  assert.equal(result.event.consentRevision, args.consent.revision);
  assert.equal(result.event.authority.ownerScope, undefined, 'raw account identity is not returned');
  assert.match(result.event.eventId, /^[a-f0-9]{64}$/);
});

test('preview and planning preserve frozen roster, authority, consent, previous state and observations', () => {
  const source = simple(), first = build(source);
  const args = deepFreeze({ roster: source, authority: authorityFor(source), now: NOW,
    previousPublication: first.publication, weather: [observation()], stationForAirport });
  const before = JSON.stringify(args);
  const result = preview(args);
  assert.equal(result.status, 'preview');
  assert.equal(JSON.stringify(args), before);
  const planning = deepFreeze(candidate());
  const saved = JSON.stringify(planning), planned = plan(planning);
  assert.equal(planned.eligible, true);
  assert.equal(JSON.stringify(planning), saved);
  planned.event.authority.rosterId = 'changed-output';
  assert.equal(planning.preview.authority.rosterId, 'synthetic-active-row-A');
});

test('runtime import and calls do not write, fetch, schedule timers or reach legacy delivery wiring', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const moduleUrl = new URL('../../server/concierge/operational-briefing.mjs', import.meta.url);
  const moduleSource = readFileSync(moduleUrl, 'utf8');
  assert.doesNotMatch(moduleSource, /telegram-fast-ack|setInterval\s*\(|setTimeout\s*\(|process\.env/);
  const imports = [...moduleSource.matchAll(/(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
  const allowed = new Set(['node:crypto', './generated/canonicalRoster.mjs', './generated/rosterPublicationReview.mjs', './journey-programs.mjs', '../weather/critical-observation.mjs']);
  assert.ok(imports.every(item => allowed.has(item)), `unexpected runtime dependency: ${imports.join(', ')}`);
  const generated = new URL('../../server/concierge/generated/', import.meta.url);
  const metadata = () => readdirSync(generated).sort().map(name => [name, statSync(new URL(name, generated)).mtimeMs]);
  const before = metadata();
  const script = `
    import fs from 'node:fs';
    import fsPromises from 'node:fs/promises';
    import http from 'node:http';
    import https from 'node:https';
    import net from 'node:net';
    import timers from 'node:timers';
    import { syncBuiltinESMExports } from 'node:module';
    const effects = [];
    const deny = name => (...args) => { effects.push(name); throw new Error('Forbidden side effect: ' + name); };
    globalThis.fetch = deny('fetch');
    for (const name of ['setTimeout', 'setInterval', 'setImmediate']) {
      globalThis[name] = deny(name); timers[name] = deny(name);
    }
    for (const name of ['writeFile', 'appendFile', 'mkdir', 'rm', 'unlink', 'rename']) {
      fs[name] = deny('fs.' + name); fs[name + 'Sync'] = deny('fs.' + name + 'Sync');
      fsPromises[name] = deny('fsPromises.' + name);
    }
    fs.createWriteStream = deny('fs.createWriteStream');
    http.request = deny('http.request'); https.request = deny('https.request');
    net.connect = deny('net.connect'); net.createConnection = deny('net.createConnection');
    syncBuiltinESMExports();
    const api = await import(${JSON.stringify(moduleUrl.href)});
    const built = api.buildOperationalBriefingPreview(${JSON.stringify({ roster: simple(), authority: authorityFor(simple()), now: NOW })});
    if (built.status !== 'preview') throw new Error('Valid preview failed in side-effect probe');
    const args = ${JSON.stringify(candidate())};
    args.preview = built;
    const planned = api.planOperationalBriefingCandidate(args);
    if (!planned.eligible || planned.submissionAllowed !== false) throw new Error('Candidate probe failed');
    if (effects.length) throw new Error('Observed side effects: ' + effects.join(', '));
  `;
  const processResult = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  assert.equal(processResult.status, 0, processResult.stderr || processResult.error?.message);
  assert.deepEqual(metadata(), before, 'runtime import never regenerates prepared source artifacts');
});
