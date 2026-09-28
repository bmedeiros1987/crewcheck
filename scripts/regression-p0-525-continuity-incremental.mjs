/** #525/#530: synthetic behavioral coverage; never a published-source oracle. */
import assert from 'node:assert/strict';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB } from './lib/ts-module-harness.mjs';

const harness = loadClientModules({
  prefix: 'crewcheck-525-incremental-',
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  files: ['client/src/lib/rosterContinuity.ts'],
});
const { completeContinuityDays: complete } = harness.load('rosterContinuity');

function flightDay(date, number, origin, destination, report, departure, arrival, debrief) {
  return {
    date, dayNumber: Number(date.slice(0, 2)), month: 10, year: 2099,
    dayOfWeek: 'synthetic', type: 'VOO', pairingCode: number,
    dutyReport: report, dutyDebrief: debrief, isNextDay: false,
    base: 'WRONG', hotel: 'UNRELATED-HOTEL', rawText: '',
    legs: [{ flightNumber: number, origin, destination,
      departureTime: departure, arrivalTime: arrival, workType: 'OP' }],
  };
}
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
const a = flightDay('20/10/2099', 'QA001', 'BSB', 'BEL', '13:00', '14:00', '18:00', '18:30');
const b = flightDay('21/10/2099', 'QA002', 'BEL', 'GRU', '08:10', '09:00', '10:30', '11:00');
const c = flightDay('23/10/2099', 'QA003', 'REC', 'FLN', '13:00', '14:00', '18:00', '18:30');
const d = flightDay('24/10/2099', 'QA004', 'FLN', 'BSB', '08:10', '09:00', '10:30', '11:00');
const roster = deepFreeze({ crewId: 'qa-only', crewName: 'Synthetic crew', base: 'BSB', month: 10, year: 2099, days: [a, b, c, d] });
const markers = (days) => days.filter((day) => day.continuityInferred);
const signatures = (days) => markers(days).map((day) => [
  day.date, day.continuityLocation, day.continuityStart, day.continuityEnd, day.hotel,
]);
const expected = [
  ['20/10/2099', 'BEL', '2099-10-20T21:30:00.000Z', '2099-10-21T11:10:00.000Z', null],
  ['23/10/2099', 'FLN', '2099-10-23T21:30:00.000Z', '2099-10-24T11:10:00.000Z', null],
];

try {
  const before = JSON.stringify(roster);
  const fresh = complete(roster.days, roster);
  assert.deepEqual(signatures(fresh), expected, 'fresh: two independently specified physical boundaries');
  const first = complete([a, b], roster);
  deepFreeze(first);
  const staged = complete([...first, c, d], roster);
  assert.deepEqual(signatures(staged), expected, 'staged normalization must complete FLN even when BEL was already inferred');
  assert.deepEqual(staged, fresh, 'fresh and staged normalization must converge without duplicate markers');
  assert.strictEqual(markers(staged)[0], markers(first)[0], 'existing inferred marker must be preserved, not mutated/replaced');
  assert.deepEqual(complete(staged, roster), staged, 'repeated normalization must remain idempotent');
  assert.deepEqual(complete([...staged].reverse(), roster), staged, 'input order cannot change physical completion');
  assert.equal(JSON.stringify(roster), before, 'published inputs/APZ/legs must remain byte-for-byte unchanged');
  assert.ok(markers(staged).every((day) => day.base !== 'WRONG' && day.hotel === null), 'new stays never inherit unrelated metadata');
  assert.deepEqual(staged.filter((day) => !day.continuityInferred), roster.days, 'no source day may disappear');

  // Missing civil dates produce multiple segments. Their identities must use
  // actual interval bounds, not an index that changes on the next pass.
  const laterB = { ...b, date: '23/10/2099', dayNumber: 23 };
  const laterC = { ...c, date: '25/10/2099', dayNumber: 25 };
  const laterD = { ...d, date: '26/10/2099', dayNumber: 26 };
  const gapPart = complete([a, laterB], roster);
  assert.equal(markers(gapPart).length, 2, 'two missing dates must keep their separate segments');
  const gapFull = complete([a, laterB, laterC, laterD], roster);
  const gapStaged = complete([...gapPart, laterC, laterD], roster);
  assert.equal(markers(gapStaged).length, 3, 'existing multiday segments must not suppress a later physical stay');
  assert.deepEqual(gapStaged, gapFull, 'segmented fresh/staged normalization must converge');
  assert.deepEqual(complete(gapStaged, roster), gapStaged, 'segment reprocessing must not duplicate stays');

  // A republication can insert a source day inside an old inferred interval or
  // change its end. Recomposition must not preserve now-contradicted derivatives.
  const withInsertedDay = complete([...gapPart, b], roster);
  assert.deepEqual(withInsertedDay, complete([a, b, laterB], roster), 'new published activity inside old gap must invalidate stale inferred segments');
  assert.equal(markers(withInsertedDay).length, 1, 'old multiday stays cannot survive an intervening published flight');
  const revisedB = { ...b, dutyReport: '09:10' };
  const withRevisedBoundary = complete([...first.filter((day) => day !== b), revisedB, c, d], roster);
  assert.deepEqual(withRevisedBoundary, complete([a, revisedB, c, d], roster), 'changed boundary must replace old derived interval, not duplicate it');
  assert.equal(markers(withRevisedBoundary).length, 2, 'a revised report time must not add a third stay');

  // An inferred marker is never an operational source from which to infer more
  // stays. Preserve projections containing only that marker without expanding it.
  const inferredOnly = markers(first);
  assert.deepEqual(complete(inferredOnly, roster), inferredOnly, 'inferred-only projection must remain intact');
  const unrelated = { ...c, date: '21/10/2099', dayNumber: 21, dutyReport: '18:00' };
  assert.deepEqual(complete([...inferredOnly, unrelated], roster), [...inferredOnly, unrelated], 'inferred days cannot act as published journey anchors');

  const off = { ...b, type: 'DO', pairingCode: 'DO', legs: [], dutyReport: null, dutyDebrief: null };
  assert.equal(markers(complete([a, off, c, d], roster)).length, 1, 'published rest still blocks continuity across the rest day');
  const shortB = { ...b, dutyReport: '05:00' };
  assert.equal(markers(complete([a, shortB], roster)).length, 0, 'sub-12h interval remains outside continuity-stay inference');
  assert.deepEqual(complete([], roster), [], 'empty input remains empty');
  console.log('PASS #525 incremental continuity: physical boundaries, staged equivalence, segments, idempotence, immutability and exclusions');
} finally {
  harness.cleanup();
}
