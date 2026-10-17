import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stayInstant, stayLocalInstant, selectStayForEdit, reconcileStayDraft, editStayDraft, inspectStayPickup, resolveStayAlarmChoice, calculateStayWakeup, planStayAlarm } from '../shared/stay-edit-plan.mjs';

const scope = { accountId: 'synthetic-account', rosterId: 'synthetic-roster', rosterRevision: 'r1' };
const now = Date.parse('2030-10-10T20:00:00Z');
const stay = { ...scope, id: 'saved-stay', eventId: 'event-stay', kind: 'stay', airport: 'FOR', pairingId: 'synthetic-pair', timeZone: 'America/Fortaleza', startAt: '2030-10-10T18:00:00Z', endAt: '2030-10-11T12:00:00Z' };
const pickup = { ...scope, schemaVersion: 1, source: 'mycrewcare', kind: 'pickup', status: 'published', stayId: stay.id, rosterEventId: stay.eventId, airport: 'FOR', pairingId: stay.pairingId, observedAt: '2030-10-10T19:59:00Z', contentFingerprint: 'synthetic-fingerprint', timeZone: stay.timeZone, pickupAt: '2030-10-11T08:30:00Z' };
const hotelApz = { ...scope, source: 'manual', stayId: stay.id, rosterEventId: stay.eventId, timeZone: stay.timeZone, hotelReportAt: '2030-10-11T00:30:00-03:00', confirmed: true };
const args = { enabled: true, scope, stay, hotelApz, now, leadMinutes: 90, automaticConfigured: true, channelConfigured: true, devicePermission: 'granted', manualScheduleRequested: true };
const incoming = { ...scope, eventId: stay.eventId, values: { hotelName: 'Hotel sintético', apzAt: hotelApz.hotelReportAt, pickupAt: pickup.pickupAt, leadMinutes: 90 }, provenance: { hotelName: 'saved', apzAt: 'manual', pickupAt: 'confirmed', leadMinutes: 'configured' } };

test('explicit touch identity is independent of list position and date; removal never selects another stay', () => {
  const a = { ...stay, id: 'a' }, b = { ...stay, id: 'b' };
  assert.equal(selectStayForEdit([b, a], 'a', now).selected, a);
  assert.equal(selectStayForEdit([a, b], 'a', now).selected, a);
  assert.equal(selectStayForEdit([b], 'a', now).selected, null);
  assert.equal(selectStayForEdit([a, { ...a }], 'a', now).reason, 'ambiguous-identity');
  assert.equal(selectStayForEdit([{ ...a, kind: 'flight' }], 'a', now).selected, null);
});
test('current interval uses exact instants, inclusive start/exclusive end and reveals overlaps', () => {
  assert.deepEqual(selectStayForEdit([stay], stay.id, stayInstant(stay.startAt)).currentIds, [stay.id]);
  assert.deepEqual(selectStayForEdit([stay], stay.id, stayInstant(stay.endAt)).currentIds, []);
  assert.equal(selectStayForEdit([stay, { ...stay, id: 'other' }], stay.id, now).ambiguousCurrent, true);
  assert.deepEqual(selectStayForEdit([{ ...stay, startAt: '2030-10-10T18:00:00' }], stay.id, now).currentIds, []);
});
test('reload preserves touched manual values including cleared fields; untouched fields refresh', () => {
  const original = reconcileStayDraft(null, incoming, scope);
  const edited = editStayDraft(original, { hotelName: '', apzAt: '2030-10-11T01:00:00-03:00' });
  const refreshed = reconcileStayDraft(edited, { ...incoming, values: { ...incoming.values, hotelName: 'Other', pickupAt: '2030-10-11T09:00:00Z' } }, scope);
  assert.equal(refreshed.values.hotelName, '');
  assert.equal(refreshed.values.apzAt, edited.values.apzAt);
  assert.equal(refreshed.values.pickupAt, '2030-10-11T09:00:00Z');
  assert.equal(refreshed.provenance.apzAt, 'manual');
  assert.equal(original.values.hotelName, 'Hotel sintético');
});
test('roster revision keeps manual edits and marks review; account/roster/item change cannot leak drafts', () => {
  const edited = editStayDraft(reconcileStayDraft(null, incoming, scope), { apzAt: '2030-10-11T01:00:00Z' });
  const nextScope = { ...scope, rosterRevision: 'r2' };
  const next = reconcileStayDraft(edited, { ...incoming, ...nextScope }, nextScope);
  assert.equal(next.values.apzAt, edited.values.apzAt); assert.equal(next.needsReview, true);
  for (const changed of [{ accountId: 'other' }, { rosterId: 'other' }]) {
    const other = { ...scope, ...changed };
    assert.equal(reconcileStayDraft(edited, { ...incoming, ...other }, other).values.apzAt, incoming.values.apzAt);
  }
  assert.equal(reconcileStayDraft(edited, { ...incoming, eventId: 'other' }, scope).values.apzAt, incoming.values.apzAt);
  assert.equal(reconcileStayDraft(edited, incoming, { ...scope, accountId: 'other' }), null);
});
test('existing provider pickup has separate confirmed/unconfirmed/obsolete states', () => {
  const options = { fact: pickup, stay, scope, now, freshnessMs: 300_000, acquisitionConfirmed: true };
  assert.equal(inspectStayPickup(options).dataState, 'confirmed');
  assert.equal(inspectStayPickup({ ...options, acquisitionConfirmed: false }).dataState, 'unconfirmed');
  assert.equal(inspectStayPickup({ ...options, now: now + 300_000 }).dataState, 'obsolete');
  assert.equal(inspectStayPickup({ ...options, fact: { ...pickup, observedAt: '2030-10-10T20:01:00Z' } }).dataState, 'obsolete');
  for (const mismatch of [{ accountId: 'other' }, { rosterRevision: 'r0' }, { rosterEventId: 'other' }, { stayId: 'other' }, { airport: 'GRU' }, { pairingId: 'other' }]) {
    assert.equal(inspectStayPickup({ ...options, fact: { ...pickup, ...mismatch } }).reason, 'scope-mismatch');
  }
  assert.equal(inspectStayPickup({ ...options, fact: { ...pickup, status: 'cancelled' } }).reason, 'provider-cancelled');
  assert.equal(inspectStayPickup({ ...options, fact: { ...pickup, timeZone: 'bad-zone' } }).reason, 'invalid-contract');
});
test('disabled integration is the default; pickup, reservation, departure and roster APZ never supply hotel APZ', () => {
  assert.equal(planStayAlarm().reason, 'integration-disabled');
  assert.equal(planStayAlarm({ ...args, enabled: false }).reason, 'integration-disabled');
  const misleading = { ...args, hotelApz: null, fact: pickup, checkIn: '2030-10-11T08:00:00Z', checkOut: '2030-10-11T09:00:00Z', rosterApz: '2030-10-11T10:00:00Z', departure: '2030-10-11T11:00:00Z' };
  assert.equal(planStayAlarm(misleading).reason, 'hotel-apz-missing-manual-required');
  assert.equal(planStayAlarm({ ...args, hotelApz: pickup }).reason, 'hotel-apz-provider-contract-unavailable');
  assert.equal(planStayAlarm({ ...args, hotelApz: { ...hotelApz, source: 'mycrewcare' } }).reason, 'hotel-apz-provider-contract-unavailable');
});
test('alarm uses manual hotel APZ minus lead across midnight, not the distinct pickup or roster APZ', () => {
  const result = planStayAlarm({ ...args, pickupAt: pickup.pickupAt, rosterApz: '2030-10-11T10:00:00Z' });
  assert.equal(result.targetKind, 'hotel-apz');
  assert.equal(result.hotelReportAt, '2030-10-11T03:30:00.000Z');
  assert.equal(result.scheduledAt, '2030-10-11T02:00:00.000Z'); // 23:00 previous local day.
  assert.equal(planStayAlarm({ ...args, hotelApz: { ...hotelApz, hotelReportAt: '2030-10-11T03:30:00Z' } }).scheduledAt, result.scheduledAt);
  assert.notEqual(result.scheduledAt, new Date(stayInstant(pickup.pickupAt) - 90 * 60_000).toISOString());
});
test('missing/unconfirmed/manual permission and capability gates fail closed', () => {
  assert.equal(planStayAlarm({ ...args, manualScheduleRequested: false }).reason, 'manual-confirmation-required');
  assert.equal(planStayAlarm({ ...args, hotelApz: { ...hotelApz, confirmed: false } }).reason, 'hotel-apz-unconfirmed');
  for (const permission of ['denied', 'default', 'unknown', true]) assert.equal(planStayAlarm({ ...args, devicePermission: permission }).reason, 'device-permission-unconfirmed');
  for (const leadMinutes of [null, '90', -1, 721, 1.5]) assert.equal(planStayAlarm({ ...args, leadMinutes }).reason, 'lead-not-configured');
  assert.equal(planStayAlarm({ ...args, channelConfigured: false }).reason, 'capability-not-configured');
  assert.equal(planStayAlarm({ ...args, automaticConfigured: false }).reason, 'capability-not-configured');
  assert.equal(planStayAlarm({ ...args, now: Date.parse('2030-10-11T02:00:00Z') }).reason, 'trigger-expired');
});
test('job identity is stable across APZ/lead edits, handles repeat, cancellation and terminal state', () => {
  const result = planStayAlarm(args);
  const job = { ...scope, jobKey: result.jobKey, scheduledAt: result.scheduledAt, status: 'pending' };
  assert.equal(planStayAlarm({ ...args, jobs: [job] }).reason, 'already-pending');
  const changed = planStayAlarm({ ...args, leadMinutes: 60, jobs: [job] });
  assert.equal(changed.action, 'update-pending'); assert.equal(changed.jobKey, result.jobKey);
  assert.equal(planStayAlarm({ ...args, jobs: [{ ...job, status: 'cancelled' }] }).reason, 'cancellation-preserved');
  for (const status of ['sent', 'failed', 'processing', 'dispatching', 'partial', 'uncertain']) assert.equal(planStayAlarm({ ...args, jobs: [{ ...job, status }] }).reason, 'terminal-or-inflight-job');
  assert.equal(planStayAlarm({ ...args, jobs: [job, job] }).reason, 'duplicate-jobs-require-review');
  assert.equal(planStayAlarm({ ...args, jobs: [{ ...job, rosterRevision: 'r0' }] }).reason, 'obsolete-job-requires-cancellation');
});
test('strict instants reject invalid date and missing offset independent of process timezone', () => {
  for (const value of ['2030-02-30T08:00:00Z', '2030-10-11T24:00:00Z', '2030-10-11T08:00:00', '08:00', '', null]) assert.equal(stayInstant(value), null);
  assert.equal(stayInstant('2030-10-11T00:30:00-03:00'), Date.parse('2030-10-11T03:30:00Z'));
});
test('default and individual 90/60/custom lead are independent and do not mutate the preference', () => {
  const override = Object.freeze({ mode: 'relative', leadMinutes: 47 });
  assert.equal(resolveStayAlarmChoice(90).source, 'default');
  assert.equal(resolveStayAlarmChoice(60).leadMinutes, 60);
  assert.equal(resolveStayAlarmChoice(90, override).leadMinutes, 47);
  assert.equal(resolveStayAlarmChoice(60, override).leadMinutes, 47);
  assert.equal(resolveStayAlarmChoice(90, { mode: 'relative', leadMinutes: 0 }).leadMinutes, 0);
  assert.equal(resolveStayAlarmChoice(90, { mode: 'unexpected' }).reason, 'invalid-mode');
});
test('relative follows hotel APZ while absolute preserves exact date/time and flags incompatibility', () => {
  const relative = { scope, stay, hotelApz, now, defaultLeadMinutes: 90 };
  const first = calculateStayWakeup(relative);
  const laterApz = { ...hotelApz, hotelReportAt: '2030-10-11T01:30:00-03:00' };
  assert.equal(calculateStayWakeup({ ...relative, hotelApz: laterApz }).scheduledAt, '2030-10-11T03:00:00.000Z');
  const choice = Object.freeze({ mode: 'absolute', alarmAt: first.scheduledAt });
  const absolute = calculateStayWakeup({ ...relative, choice, hotelApz: laterApz });
  assert.equal(absolute.scheduledAt, first.scheduledAt); assert.equal(absolute.mode, 'absolute');
  assert.deepEqual(absolute.display, { date: '2030-10-10', clock: '23:00', timeZone: 'America/Fortaleza', instant: first.scheduledAt });
  const earlierApz = { ...hotelApz, hotelReportAt: '2030-10-10T22:00:00-03:00' };
  const incompatible = calculateStayWakeup({ ...relative, choice, hotelApz: earlierApz });
  assert.equal(incompatible.scheduledAt, first.scheduledAt);
  assert.ok(incompatible.warnings.includes('alarm-not-before-hotel-apz')); assert.equal(incompatible.eligible, false);
  assert.equal(planStayAlarm({ ...args, choice, hotelApz: earlierApz }).reason, 'absolute-time-incompatible');
});
test('unknown hotel APZ: relative requires manual entry; absolute remains visible but cannot schedule', () => {
  const options = { scope, stay, hotelApz: null, now, defaultLeadMinutes: 90 };
  assert.equal(calculateStayWakeup(options).reason, 'hotel-apz-missing-manual-required');
  const choice = { mode: 'absolute', alarmAt: '2030-10-11T02:00:00Z' };
  const result = calculateStayWakeup({ ...options, choice });
  assert.equal(result.scheduledAt, choice.alarmAt.replace('Z', '.000Z')); assert.equal(result.eligible, false);
  assert.equal(result.schedulingState, 'not-programmed'); assert.ok(result.warnings.includes('hotel-apz-missing-manual-required'));
  assert.equal(planStayAlarm({ ...args, choice, hotelApz: null }).action, 'none');
  assert.equal(calculateStayWakeup({ ...options, choice: { mode: 'absolute', alarmAt: '02:00' } }).reason, 'absolute-instant-invalid');
});
test('calculation does not claim device programming; past absolute choice is preserved with warning', () => {
  const result = calculateStayWakeup({ scope, stay, hotelApz, now, choice: { mode: 'absolute', alarmAt: '2030-10-10T19:00:00Z' } });
  assert.equal(result.scheduledAt, '2030-10-10T19:00:00.000Z');
  assert.ok(result.warnings.includes('alarm-past')); assert.equal(result.schedulingState, 'not-programmed');
  const blocked = planStayAlarm({ ...args, devicePermission: 'denied' });
  assert.equal(blocked.calculated.schedulingState, 'not-programmed');
  assert.equal(blocked.calculated.display.clock, '23:00');
});
test('mode edits reuse the same job key and cancelled jobs are not resurrected', () => {
  const original = planStayAlarm(args);
  const job = { ...scope, jobKey: original.jobKey, scheduledAt: original.scheduledAt, status: 'pending' };
  const choice = { mode: 'absolute', alarmAt: '2030-10-11T02:15:00Z' };
  const next = planStayAlarm({ ...args, choice, jobs: [job] });
  assert.equal(next.jobKey, original.jobKey); assert.equal(next.action, 'update-pending');
  assert.equal(planStayAlarm({ ...args, choice, jobs: [{ ...job, status: 'cancelled' }] }).reason, 'cancellation-preserved');
});
test('absolute APZ gap uses full instants across midnight; equal/late conflict and absent APZ has no invented gap', () => {
  const options = { scope, stay, hotelApz: { ...hotelApz, hotelReportAt: '2030-10-11T05:30:00-03:00' }, now,
    choice: { mode: 'absolute', alarmAt: '2030-10-11T04:00:00-03:00' } };
  assert.equal(calculateStayWakeup(options).differenceMinutes, 90);
  assert.equal(calculateStayWakeup({ ...options, choice: { mode: 'absolute', alarmAt: '2030-10-10T23:30:00-03:00' } }).differenceMinutes, 360);
  const equal = calculateStayWakeup({ ...options, choice: { mode: 'absolute', alarmAt: options.hotelApz.hotelReportAt } });
  assert.equal(equal.differenceMinutes, 0); assert.ok(equal.warnings.includes('alarm-not-before-hotel-apz'));
  const late = calculateStayWakeup({ ...options, choice: { mode: 'absolute', alarmAt: '2030-10-11T06:00:00-03:00' } });
  assert.equal(late.differenceMinutes, -30); assert.ok(late.warnings.includes('alarm-not-before-hotel-apz'));
  assert.equal(calculateStayWakeup({ ...options, hotelApz: null }).differenceMinutes, null);
});
test('local wall clock conversion rejects DST folds/gaps and does not use device timezone', () => {
  assert.equal(stayLocalInstant('2030-10-11', '05:30', 'America/Fortaleza'), Date.parse('2030-10-11T08:30:00Z'));
  assert.equal(stayLocalInstant('2026-11-01', '01:30', 'America/New_York'), null);
  assert.equal(stayLocalInstant('2026-03-08', '02:30', 'America/New_York'), null);
  assert.equal(stayLocalInstant('2030-02-30', '05:30', 'America/Fortaleza'), null);
  assert.equal(stayLocalInstant('2030-10-11', '05:30', 'invalid'), null);
});
test('module is unwired, pure, contains no scheduling/network/storage/native/provider import', () => {
  const source = readFileSync(new URL('../shared/stay-edit-plan.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bimport\s|\bfetch\s*\(|localStorage|sessionStorage|setTimeout|setInterval|window\.|document\.|\/api\/alarm|CrewCheckNative/);
});
test('absolute alarm preserves its own zone when hotel zone changes or is unknown', () => {
  const choice = { mode: 'absolute', alarmAt: '2030-10-11T07:00:00Z', timeZone: 'America/Fortaleza' };
  const original = calculateStayWakeup({scope,stay,hotelApz:null,now,choice});
  const changed = calculateStayWakeup({scope,stay:{...stay,timeZone:''},hotelApz:null,now,choice});
  assert.equal(changed.action,'calculated'); assert.equal(changed.scheduledAt,original.scheduledAt);
  assert.equal(changed.display.clock,'04:00'); assert.equal(changed.display.timeZone,choice.timeZone);
  assert.equal(changed.differenceMinutes,null); assert.equal(changed.eligible,false);
});

test('zero relative lead conflicts with hotel APZ and cannot propose an alarm', () => {
  const choice = { mode: 'relative', leadMinutes: 0 };
  const preview = calculateStayWakeup({scope,stay,hotelApz,now,choice});
  assert.equal(preview.differenceMinutes,0); assert.equal(preview.eligible,false);
  assert.ok(preview.warnings.includes('alarm-not-before-hotel-apz'));
  assert.equal(planStayAlarm({...args,choice}).reason,'absolute-time-incompatible');
});

test('explicit breakfast Auto defaults are 90/60 and independently editable', () => {
  const input = { scope, stay, hotelApz, now, defaultLeadMinutes: 90, defaultWithoutBreakfastMinutes: 60 };
  assert.equal(calculateStayWakeup({ ...input, breakfastPlan: 'with' }).differenceMinutes, 90);
  assert.equal(calculateStayWakeup({ ...input, breakfastPlan: 'without' }).differenceMinutes, 60);
  assert.equal(calculateStayWakeup({ ...input, breakfastPlan: 'without' }).scheduledAt, '2030-10-11T02:30:00.000Z');
  assert.equal(calculateStayWakeup({ ...input, breakfastPlan: 'with', defaultLeadMinutes: 105 }).differenceMinutes, 105);
  assert.equal(calculateStayWakeup({ ...input, breakfastPlan: 'without', defaultWithoutBreakfastMinutes: 45 }).differenceMinutes, 45);
  for (const breakfastPlan of ['unknown', null, true, '05:30']) {
    assert.equal(calculateStayWakeup({ ...input, breakfastPlan }).reason, 'breakfast-plan-unconfirmed');
  }
});

test('breakfast choice never invents hall time or uses departure/pickup; manual overrides survive updates', () => {
  const input = { scope, stay: { ...stay, departure: '05:30', pickupAt: pickup.pickupAt }, hotelApz, now,
    breakfastPlan: 'without', defaultLeadMinutes: 90, defaultWithoutBreakfastMinutes: 60 };
  assert.equal(calculateStayWakeup({ ...input, hotelApz: null }).reason, 'hotel-apz-missing-manual-required');
  assert.equal(calculateStayWakeup({ ...input, hotelApz: { ...hotelApz, confirmed: false } }).reason, 'hotel-apz-unconfirmed');
  assert.equal(calculateStayWakeup({ ...input, hotelApz: pickup }).reason, 'hotel-apz-provider-contract-unavailable');
  const relative = Object.freeze({ mode: 'relative', leadMinutes: 47 });
  assert.equal(calculateStayWakeup({ ...input, choice: relative, breakfastPlan: 'unknown' }).differenceMinutes, 47);
  const absolute = Object.freeze({ mode: 'absolute', alarmAt: '2030-10-11T02:00:00Z', timeZone: stay.timeZone });
  const changed = calculateStayWakeup({ ...input, choice: absolute, breakfastPlan: 'with',
    defaultLeadMinutes: 120, hotelApz: { ...hotelApz, hotelReportAt: '2030-10-11T01:30:00-03:00' } });
  assert.equal(changed.scheduledAt, '2030-10-11T02:00:00.000Z');
  assert.equal(changed.schedulingState, 'not-programmed');
  assert.equal(calculateStayWakeup({ ...input, stay: { ...stay, accountId: 'other' } }).reason, 'scope-mismatch');
  assert.equal(planStayAlarm({ ...args, breakfastPlan: 'without', defaultWithoutBreakfastMinutes: 60 }).calculated.differenceMinutes, 60);
});

test('breakfast defaults cross to previous local day in explicit hotel zones', () => {
  for (const timeZone of ['America/Fortaleza', 'Asia/Tokyo', 'Pacific/Auckland']) {
    const apz = stayLocalInstant('2030-10-11', '00:30', timeZone);
    const input = { scope, stay: { ...stay, timeZone }, hotelApz: { ...hotelApz, timeZone, hotelReportAt: new Date(apz).toISOString() },
      now: apz - 86400000, defaultLeadMinutes: 90, defaultWithoutBreakfastMinutes: 60 };
    for (const [breakfastPlan, clock] of [['with', '23:00'], ['without', '23:30']]) {
      const calculated = calculateStayWakeup({ ...input, breakfastPlan });
      assert.equal(calculated.display.date, '2030-10-10');
      assert.equal(calculated.display.clock, clock);
      assert.equal(calculated.display.timeZone, timeZone);
    }
  }
});
