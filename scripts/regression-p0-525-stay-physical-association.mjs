/**
 * #525/#530 residual physical-association gate.
 *
 * Synthetic only: proves that an overnight between two physically continuous
 * journeys is anchored to the station where the first journey ended / next
 * journey starts, and cannot inherit an unrelated next-day base/hotel/station.
 */
import assert from 'node:assert/strict';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB } from './lib/ts-module-harness.mjs';

const harness = loadClientModules({
  prefix: 'crewcheck-525-stay-physical-association-',
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

const { buildCanonicalRosterEvents } = harness.load('canonicalRoster');

const day = (date, base, legs, extra = {}) => ({
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
  base,
  rawText: '',
  ...extra,
});

const leg = (flightNumber, origin, destination, departureTime, arrivalTime, extra = {}) => ({
  flightNumber,
  origin,
  destination,
  departureTime,
  arrivalTime,
  workType: 'OP',
  ...extra,
});

const roster = {
  crewName: 'Synthetic crew',
  crewId: 'synthetic-id',
  base: 'HOME_A',
  rank: 'CCM',
  month: 10,
  year: 2099,
  rawText: '',
  days: [
    day('20/10/2099', 'HOME_A', [
      leg('SYNTH-A1', 'HOME_A', 'MID_B', '14:00', '16:00'),
      leg('SYNTH-A2', 'MID_B', 'STAY_C', '17:00', '18:00'),
    ], {
      dutyReport: '13:00',
      dutyDebrief: '18:30',
    }),
    // Intentionally misleading day-level metadata. Physical continuity is C→C,
    // so no consumer may manufacture a stay at WRONG_D from these fields.
    day('21/10/2099', 'WRONG_D', [
      leg('SYNTH-B1', 'STAY_C', 'NEXT_E', '09:00', '10:30', { presentationTime: '08:10' }),
    ], {
      dutyReport: '08:10',
      dutyDebrief: '11:00',
      hotel: 'UNRELATED-HOTEL-D',
    }),
  ],
};

const events = buildCanonicalRosterEvents(roster);
const stays = events.filter((event) => event.kind === 'stay');
const flights = events.filter((event) => event.kind === 'flight');

assert.equal(stays.length, 1, '13h40 physical continuity must yield exactly one overnight/stay');
const stay = stays[0];
assert.equal(stay.origin, 'STAY_C', 'stay origin must be the previous journey physical destination');
assert.equal(stay.destination, 'STAY_C', 'stay destination must remain the physical continuity station');
assert.notEqual(stay.origin, 'WRONG_D', 'stay must never inherit unrelated next-day base metadata');
assert.equal(stay.publishedDay.base, 'STAY_C', 'synthetic continuity day must be anchored to the physical station');
assert.equal(stay.publishedDay.hotel, null, 'synthetic stay must not inherit an unrelated next-day hotel');

const previous = flights.find((event) => event.flightNumber === 'SYNTH-A2');
const next = flights.find((event) => event.flightNumber === 'SYNTH-B1');
assert.ok(previous && next, 'both adjacent physical journeys must remain present');
assert.ok(new Date(previous.endDateTime).getTime() <= new Date(stay.startDateTime).getTime(), 'stay cannot be ordered before the journey that creates it');
assert.ok(new Date(stay.endDateTime).getTime() <= new Date(next.startDateTime).getTime(), 'stay cannot extend beyond the next physical journey');
assert.equal(next.origin, 'STAY_C', 'next journey must begin at the same physical station');
assert.equal(events.some((event) => event.kind === 'stay' && (event.origin === 'WRONG_D' || event.destination === 'WRONG_D')), false, 'no false stay may be created at unrelated station metadata');

harness.cleanup();
console.log('OK regression-p0-525-stay-physical-association');
