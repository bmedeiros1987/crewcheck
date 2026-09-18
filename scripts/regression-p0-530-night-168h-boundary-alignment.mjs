/**
 * #530 — 168h boundary must be identical in committed source and prepared runtime.
 *
 * The shipped v14.3.59 contract is a half-open rolling interval [start, start+168h):
 * an occurrence exactly 168h later belongs to the next window, not both. This file
 * guards source/prepared parity; it is synthetic QA, not a roster oracle.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB } from './lib/ts-module-harness.mjs';

const helper = fs.readFileSync('scripts/v14359/compliance-temporal-helpers.txt', 'utf8');
const apply = fs.readFileSync('scripts/v14359/apply.mjs', 'utf8');
assert.match(helper, /candidate\.timestamp\s*<\s*end/, 'prepared v14.3.59 must keep a half-open 168h window');
assert.match(apply, /semiaberta/, 'prepared user-facing compliance text must describe the half-open window');

const harness = loadClientModules({
  prefix: 'crewcheck-530-168h-boundary-',
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  files: [
    'client/src/lib/rosterCodes.ts',
    'client/src/lib/actRules.ts',
    'client/src/lib/rosterContinuity.ts',
    'client/src/lib/canonicalRoster.ts',
    'client/src/lib/embeddedFormalDaysOff.ts',
    'client/src/lib/rollingFlightHours.ts',
    'client/src/lib/complianceEngine.ts',
  ],
});
const { analyzeCompliance } = harness.load('complianceEngine');

const ground = (date, report='00:00', debrief='02:00') => ({
  date, dayNumber:Number(date.slice(0,2)), month:Number(date.slice(3,5)), year:Number(date.slice(6)),
  dayOfWeek:'synthetic', type:'OTHER', pairingCode:'CRM', dutyReport:report, dutyDebrief:debrief,
  dutyHours:2, flyingHours:0, isNextDay:false, hotel:null, base:'AAA', legs:[], rawText:'CRM synthetic',
});
const bridge = (date) => ground(date, '12:00', '13:00');
// Keep less than 48h free between operational intervals so the prepared
// resetAfterFreeHours segmentation does not hide the 168h endpoint semantics.
const bridges = [bridge('02/09/2026'), bridge('04/09/2026'), bridge('06/09/2026')];
const flight = (date, departure='00:00') => ({
  date, dayNumber:Number(date.slice(0,2)), month:Number(date.slice(3,5)), year:Number(date.slice(6)),
  dayOfWeek:'synthetic', type:'VOO', pairingCode:'SYNTH', dutyReport:departure, dutyDebrief:'01:00',
  dutyHours:1, flyingHours:1, isNextDay:false, hotel:null, base:'AAA', rawText:'synthetic flight',
  legs:[{flightNumber:'LA9002',origin:'AAA',destination:'BBB',departureTime:departure,arrivalTime:'01:00',presentationTime:departure,workType:'OP'}],
});
const roster = (days) => ({crewName:'Synthetic Crew',crewId:'qa-only',base:'AAA',month:9,year:2026,rawText:'',days});

try {
  const exact = analyzeCompliance(roster([ground('01/09/2026'), ...bridges, flight('08/09/2026')]));
  assert.equal(
    exact.metrics.maxNightOps168hCount,
    1,
    'half-open [start,start+168h): an occurrence exactly +168h must not be counted in the same rolling window',
  );

  const inside = analyzeCompliance(roster([ground('01/09/2026'), ...bridges, flight('07/09/2026')]));
  assert.equal(
    inside.metrics.maxNightOps168hCount,
    2,
    'two qualifying occurrences strictly inside 168h must still both count',
  );

  const sameNightA = flight('03/09/2026','00:10');
  const sameNightB = {
    ...flight('03/09/2026','02:10'),
    pairingCode:'SYNTH2',
    legs:[{flightNumber:'LA9003',origin:'BBB',destination:'CCC',departureTime:'02:10',arrivalTime:'03:10',presentationTime:'02:10',workType:'OP'}],
  };
  const sameNight = analyzeCompliance(roster([sameNightA, sameNightB]));
  assert.equal(sameNight.metrics.maxNightOps168hCount, 2, 'distinct qualifying journeys in the same night remain two occurrences');

  console.log('PASS #530 168h boundary parity: exact boundary excluded, interior and same-night occurrences preserved');
} finally {
  harness.cleanup();
}
