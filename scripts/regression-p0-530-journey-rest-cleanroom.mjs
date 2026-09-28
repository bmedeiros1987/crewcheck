/**
 * #530/#525 clean-room contract: keep ground time, journey rest, and overnight
 * as three distinct canonical concepts.
 *
 * This test is deliberately synthetic. It uses generated symbolic stations and
 * a synthetic calendar period rather than an official roster, user, flight, or
 * protected fixture. The source of truth under test is canonicalRoster.ts.
 */
import assert from 'node:assert/strict';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB } from './lib/ts-module-harness.mjs';

const harness = loadClientModules({
  prefix: 'crewcheck-530-cleanroom-contract-',
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  files: [
    'client/src/lib/rosterCodes.ts',
    'client/src/lib/actRules.ts',
    'client/src/lib/embeddedFormalDaysOff.ts',
    'client/src/lib/scheduleActivityClassification.ts',
    'client/src/lib/rosterContinuity.ts',
    'client/src/lib/canonicalRoster.ts',
  ],
});

const canonical = harness.load('canonicalRoster');
const classification = harness.load('scheduleActivityClassification');
const { buildCanonicalRosterEvents, selectNextRosterEvent } = canonical;

const stations = Object.freeze({ home: 'ORIGIN_A', base: 'STATION_B', next: 'DESTINATION_C' });
const syntheticDate = '15/10/2099';
const nextSyntheticDate = '16/10/2099';
const leg = (id, origin, destination, departureTime, arrivalTime, extra = {}) => ({
  flightNumber: `SYNTH-${id}`,
  origin,
  destination,
  departureTime,
  arrivalTime,
  workType: 'OP',
  ...extra,
});
const day = (date, legs, extra = {}) => ({
  date,
  dayNumber: Number(date.slice(0, 2)),
  month: Number(date.slice(3, 5)),
  year: Number(date.slice(6)),
  dayOfWeek: 'synthetic',
  type: 'VOO',
  pairingCode: legs[0]?.flightNumber || '',
  dutyReport: null,
  dutyDebrief: null,
  legs,
  dutyHours: null,
  flyingHours: 0,
  isNextDay: false,
  hotel: null,
  base: stations.base,
  rawText: '',
  ...extra,
});
const roster = (days) => ({
  crewName: 'Synthetic crew',
  crewId: 'synthetic-id',
  base: stations.base,
  rank: 'CCM',
  month: 10,
  year: 2099,
  rawText: '',
  days,
});
const flightEvents = (events) => events.filter((event) => event.kind === 'flight');
const journeyRest = (events) => events.filter((event) => event.kind === 'journey-rest');

// Ground time is only an intra-journey interval.
{
  const events = buildCanonicalRosterEvents(roster([
    day(syntheticDate, [
      leg('GROUND-A', stations.home, stations.base, '08:00', '09:30'),
      leg('GROUND-B', stations.base, stations.next, '11:00', '11:40'),
    ], { dutyReport: '07:00', dutyDebrief: '12:10' }),
  ]));
  const second = flightEvents(events).find((event) => event.flightNumber === 'SYNTH-GROUND-B');
  assert.equal(second?.groundBeforeMinutes, 90, 'same-jornada connection must remain ground time');
  assert.equal(journeyRest(events).length, 0, 'same-jornada connection must not create journey rest');
}

// Short real boundary: the interval must remain visible, but not as a stay.
{
  const events = buildCanonicalRosterEvents(roster([
    day(syntheticDate, [leg('SHORT-A', stations.home, stations.base, '16:00', '18:00')], {
      dutyReport: '15:00',
      dutyDebrief: '18:30',
    }),
    day(nextSyntheticDate, [leg('SHORT-B', stations.base, stations.next, '04:00', '06:00', { presentationTime: '03:10' })], {
      dutyReport: '03:10',
      dutyDebrief: '06:30',
      base: stations.next,
      hotel: 'NEXT-DAY-HOTEL-MUST-NOT-INHERIT',
    }),
  ]));
  const rest = journeyRest(events);
  assert.equal(rest.length, 1, 'short boundary must not disappear');
  assert.equal(rest[0].restMinutes, 520, 'proven endpoints must be debrief 18:30 to presentation 03:10');
  assert.equal(rest[0].origin, stations.base, 'rest station must use the physical boundary station');
  assert.equal(rest[0].destination, stations.base, 'rest station must use the physical boundary station');
  assert.equal(rest[0].flightNumber, '', 'rest must not inherit the next pairing/flight');
  assert.equal(rest[0].presentation, '', 'rest has no operational presentation');
  assert.equal(rest[0].showPresentation, false, 'rest cannot become a presentation event');
  const nextFlight = flightEvents(events).find((event) => event.flightNumber === 'SYNTH-SHORT-B');
  assert.equal(nextFlight?.publishedDay.hotel, 'NEXT-DAY-HOTEL-MUST-NOT-INHERIT', 'fixture proves next-day metadata exists');
  assert.equal(rest[0].publishedDay.hotel, null, 'rest event must not carry next-day hotel metadata');
  assert.notEqual(rest[0].origin, stations.next, 'rest must not inherit the next day base');
  assert.equal(events.filter((event) => event.kind === 'stay').length, 0, 'short rest must not become a stay/overnight');

  const selected = selectNextRosterEvent(events, new Date('2099-10-15T22:00:00.000Z'));
  assert.equal(selected?.kind, 'flight', 'operational selector must skip active journey-rest');
  assert.equal(selected?.flightNumber, 'SYNTH-SHORT-B', 'operational selector must return the next real flight');
  assert.equal(selectNextRosterEvent(rest, new Date('2099-10-15T22:00:00.000Z')), null, 'rest alone is not an operational event');
}

// Cross-midnight boundary inside one published roster day. The parser may have
// consumed a (+1) marker from the next presentation, but the canonical event
// must still place that presentation on the unique occurrence after the prior
// journey and at/before the next departure. It must never produce end < start.
{
  const events = buildCanonicalRosterEvents(roster([
    day(syntheticDate, [
      leg('MIDNIGHT-A', stations.home, stations.base, '16:00', '18:00'),
      leg('MIDNIGHT-B', stations.base, stations.next, '04:00', '06:00', { presentationTime: '03:10' }),
    ], { dutyReport: '15:00', dutyDebrief: null }),
  ]));
  const rest = journeyRest(events);
  const nextFlight = flightEvents(events).find((event) => event.flightNumber === 'SYNTH-MIDNIGHT-B');
  assert.equal(rest.length, 1, 'cross-midnight boundary must create one journey-rest');
  assert.equal(nextFlight?.startDateTime, '2099-10-16T07:00:00.000Z', 'next flight must be physically placed on the following day');
  assert.equal(rest[0].endDateTime, '2099-10-16T06:10:00.000Z', '03:10 presentation must inherit the next-day occurrence before the 04:00 departure');
  assert.ok(new Date(rest[0].endDateTime).getTime() > new Date(rest[0].startDateTime).getTime(), 'journey-rest must never end before it starts');
  assert.ok(new Date(rest[0].endDateTime).getTime() <= new Date(nextFlight.startDateTime).getTime(), 'journey-rest end must not pass the next flight start');
  assert.equal(rest[0].restMinutes, undefined, 'missing debrief remains fail-closed; chronology repair must not invent rest duration');
}

// A same-civil-day boundary is also represented; without a provable debrief,
// duration remains absent rather than being fabricated from arrival to STD.
{
  const events = buildCanonicalRosterEvents(roster([
    day(syntheticDate, [
      leg('SAME-A', stations.home, stations.base, '06:45', '08:20'),
      leg('SAME-B', stations.base, stations.next, '23:50', '00:35', { presentationTime: '23:03', isNextDay: true }),
    ], { dutyReport: '06:00', dutyDebrief: null }),
  ]));
  const second = flightEvents(events).find((event) => event.flightNumber === 'SYNTH-SAME-B');
  const rest = journeyRest(events);
  assert.equal(second?.groundBeforeMinutes, null, 'same-day boundary must not be reported as ground time');
  assert.equal(rest.length, 1, 'same-civil-day boundary must be represented');
  assert.equal(rest[0].restMinutes, undefined, 'unknown debrief must not fabricate duration');
}

// A legitimate overnight remains a stay and must not be duplicated by rest.
{
  const events = buildCanonicalRosterEvents(roster([
    day(syntheticDate, [leg('STAY-A', stations.home, stations.base, '16:00', '18:00')], {
      dutyReport: '15:00',
      dutyDebrief: '18:30',
    }),
    day(nextSyntheticDate, [leg('STAY-B', stations.base, stations.next, '09:00', '11:00', { presentationTime: '08:10' })], {
      dutyReport: '08:10',
      dutyDebrief: '11:30',
    }),
  ]));
  assert.equal(events.filter((event) => event.kind === 'stay').length, 1, 'legitimate overnight must remain one stay');
  assert.equal(journeyRest(events).length, 0, 'legitimate overnight must not duplicate as journey-rest');
}

assert.equal(typeof canonical.isOperationalCanonicalEvent, 'function', 'canonical operational predicate must exist');
assert.equal(canonical.isOperationalCanonicalEvent({ kind: 'journey-rest' }), false, 'journey-rest is not operational');
assert.equal(canonical.isOperationalCanonicalEvent({ kind: 'rest' }), false, 'published rest is not operational');
for (const kind of ['flight', 'duty', 'stay']) {
  assert.equal(canonical.isOperationalCanonicalEvent({ kind }), true, `${kind} operational compatibility must remain intact`);
}
assert.equal(typeof classification.isJourneyRestScheduleActivity, 'function', 'shared classification must recognize journey-rest');
assert.equal(classification.isJourneyRestScheduleActivity({ kind: 'duty', canonical: { kind: 'journey-rest' } }), true);
assert.equal(classification.isSmartDepartureEligible({ kind: 'duty', canonical: { kind: 'journey-rest' } }), false);

// Event-local identity wins over unrelated aggregate day.rawText: ASB/RES is
// eligible, while unactivated HSB never inherits activation from sibling text.
// A proven activated HSB preserves the #533 contract and may anchor departure.
assert.equal(classification.isSmartDepartureEligible({
  kind: 'duty',
  title: 'ASB',
  presentation: '08:00',
  day: { type: 'VOO', pairingCode: 'SYNTH', rawText: 'HSB ACIONADO em outro evento' },
}), true, 'event-local ASB must remain eligible');
assert.equal(classification.isSmartDepartureEligible({
  kind: 'duty',
  title: 'HSB',
  presentation: '08:00',
  day: { type: 'VOO', pairingCode: 'SYNTH', rawText: 'ASB ACIONADO em outro evento' },
}), false, 'unactivated HSB must not inherit activation from day.rawText');
assert.equal(classification.isSmartDepartureEligible({
  kind: 'duty',
  title: 'HSB',
  presentation: '08:00',
  activated: true,
  day: { type: 'VOO', pairingCode: 'SYNTH', rawText: 'ASB ACIONADO em outro evento' },
}), true, 'proven activated HSB must preserve the #533 smart-departure contract');

const selectorEvent = (id, kind, startDateTime, endDateTime, flightNumber = id) => ({
  id,
  kind,
  startDateTime,
  endDateTime,
  flightNumber,
  origin: stations.base,
  destination: stations.base,
});
const hsb = selectorEvent('HSB-0300-0700', 'duty', '2099-10-15T06:00:00.000Z', '2099-10-15T10:00:00.000Z');
const asb = selectorEvent('ASB-0830-1430', 'duty', '2099-10-15T11:30:00.000Z', '2099-10-15T17:30:00.000Z');
const rest = selectorEvent('REST-1430-0730', 'journey-rest', '2099-10-15T17:30:00.000Z', '2099-10-16T10:30:00.000Z', '');
const atEightFifty = selectNextRosterEvent([hsb, asb, rest], new Date('2099-10-15T11:50:00.000Z'));
assert.equal(atEightFifty?.id, asb.id, 'at 08:50 ASB is Agora and ended HSB is not current');
assert.notEqual(atEightFifty?.kind, 'journey-rest', 'journey-rest remains next-only timeline data');

harness.cleanup();
console.log('OK regression-p0-530-journey-rest-cleanroom');
