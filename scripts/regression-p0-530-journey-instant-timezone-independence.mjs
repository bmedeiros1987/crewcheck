import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// P0 #530: every assertion below must remain invariant across process.env.TZ.
const root = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-p0-530-tz-'));
const bundle = path.join(tmp, 'canonical.mjs');
execFileSync(path.join(root, 'node_modules', '.bin', 'esbuild'), [
  'client/src/lib/canonicalRoster.ts', '--bundle', '--platform=node', '--format=esm',
  '--outfile=' + bundle,
], { stdio: 'inherit' });

const mod = await import(pathToFileURL(bundle).href + '?v=' + Date.now());
const roster = {
  crewName: 'Synthetic Crew', base: 'AAA', month: 9, year: 2026, rawText: '',
  days: [{
    date: '10/09/2026', dayNumber: 10, month: 9, year: 2026, dayOfWeek: 'qui',
    type: 'VOO', pairingCode: 'SYNTH', dutyReport: '17:30', dutyDebrief: '22:30',
    legs: [{ flightNumber: 'LA9001', origin: 'AAA', destination: 'BBB', departureTime: '18:00', arrivalTime: '21:00', presentationTime: '17:30' }],
    dutyHours: 5, flyingHours: 3, isNextDay: false, hotel: null, base: 'AAA', rawText: 'synthetic',
  }],
};
const events = mod.buildCanonicalRosterEvents(roster).filter(e => e.kind === 'flight');
assert.equal(events.length, 1);
assert.equal(events[0].startDateTime, '2026-09-10T21:00:00.000Z');
assert.equal(events[0].endDateTime, '2026-09-11T00:00:00.000Z');
const active = mod.selectNextRosterEvent(events, new Date('2026-09-10T22:00:00.000Z'));
assert.equal(active?.flightNumber, 'LA9001');
console.log(JSON.stringify({ start: events[0].startDateTime, end: events[0].endDateTime, active: active?.flightNumber }));

const continuityBundle = path.join(tmp, 'continuity.mjs');
execFileSync(path.join(root, 'node_modules', '.bin', 'esbuild'), [
  'client/src/lib/rosterContinuity.ts', '--bundle', '--platform=node', '--format=esm',
  '--outfile=' + continuityBundle,
], { stdio: 'inherit' });
const continuity = await import(pathToFileURL(continuityBundle).href + '?v=' + Date.now());
const continuityRoster = {
  crewName: 'Synthetic Crew', base: 'AAA', month: 9, year: 2026, rawText: '',
  days: [
    {
      date: '10/09/2026', dayNumber: 10, month: 9, year: 2026, dayOfWeek: 'qui',
      type: 'VOO', pairingCode: 'SYNTH-A', dutyReport: '17:30', dutyDebrief: '22:30',
      legs: [{ flightNumber: 'LA9101', origin: 'AAA', destination: 'BBB', departureTime: '18:00', arrivalTime: '22:00', presentationTime: '17:30' }],
      dutyHours: 5, flyingHours: 4, isNextDay: false, hotel: null, base: 'AAA', rawText: 'synthetic A',
    },
    {
      date: '11/09/2026', dayNumber: 11, month: 9, year: 2026, dayOfWeek: 'sex',
      type: 'VOO', pairingCode: 'SYNTH-B', dutyReport: '10:30', dutyDebrief: '13:00',
      legs: [{ flightNumber: 'LA9102', origin: 'BBB', destination: 'AAA', departureTime: '11:00', arrivalTime: '12:30', presentationTime: '10:30' }],
      dutyHours: 2.5, flyingHours: 1.5, isNextDay: false, hotel: null, base: 'AAA', rawText: 'synthetic B',
    },
  ],
};
const continuityDays = continuity.completeContinuityDays(continuityRoster.days, continuityRoster);
const inferred = continuityDays.find(day => day.continuityInferred);
assert.ok(inferred, 'intervalo de 12h entre jornadas no mesmo local deve produzir continuidade inferida');
assert.equal(inferred.date, '10/09/2026', 'data operacional da continuidade deve permanecer em 10/09 em qualquer TZ do runtime');
assert.equal(inferred.dutyReport, '22:30');
assert.equal(inferred.dutyDebrief, '10:30');
assert.equal(inferred.continuityStart, '2026-09-11T01:30:00.000Z');
assert.equal(inferred.continuityEnd, '2026-09-11T13:30:00.000Z');
assert.equal(inferred.isNextDay, true);
console.log(JSON.stringify({ tz: process.env.TZ, continuityDate: inferred.date, continuityStart: inferred.continuityStart, continuityEnd: inferred.continuityEnd }));

const complianceBundle = path.join(tmp, 'compliance.mjs');
execFileSync(path.join(root, 'node_modules', '.bin', 'esbuild'), [
  'client/src/lib/complianceEngine.ts', '--bundle', '--platform=node', '--format=esm',
  '--outfile=' + complianceBundle,
], { stdio: 'inherit' });
const compliance = await import(pathToFileURL(complianceBundle).href + '?v=' + Date.now());
const boundaryRoster = {
  crewName: 'Synthetic Crew', base: 'AAA', month: 9, year: 2026, rawText: '',
  days: [
    {
      date: '01/09/2026', dayNumber: 1, month: 9, year: 2026, dayOfWeek: 'ter',
      type: 'OTHER', pairingCode: 'CRM', dutyReport: '00:00', dutyDebrief: '02:00',
      dutyHours: 2, flyingHours: 0, isNextDay: false, hotel: null, base: 'AAA', legs: [], rawText: 'CRM synthetic',
    },
    {
      date: '02/09/2026', dayNumber: 2, month: 9, year: 2026, dayOfWeek: 'qua',
      type: 'VOO', pairingCode: 'SYNTH', dutyReport: '00:00', dutyDebrief: '01:00',
      dutyHours: 1, flyingHours: 1, isNextDay: false, hotel: null, base: 'AAA', rawText: 'synthetic flight',
      legs: [{ flightNumber: 'LA9002', origin: 'AAA', destination: 'BBB', departureTime: '00:00', arrivalTime: '01:00', presentationTime: '00:00' }],
    },
  ],
};
const complianceResult = compliance.analyzeCompliance(boundaryRoster);
assert.equal(complianceResult.metrics.maxNightOps168hCount, 2, 'atividade não-voo + voo em 24h deve permanecer invariável por TZ sem depender da semântica do limite exato de 168h');
console.log(JSON.stringify({ tz: process.env.TZ, maxNightOps168hCount: complianceResult.metrics.maxNightOps168hCount }));
