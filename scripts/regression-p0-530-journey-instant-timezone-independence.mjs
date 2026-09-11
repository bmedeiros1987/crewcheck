import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

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
      date: '08/09/2026', dayNumber: 8, month: 9, year: 2026, dayOfWeek: 'ter',
      type: 'VOO', pairingCode: 'SYNTH', dutyReport: '00:00', dutyDebrief: '01:00',
      dutyHours: 1, flyingHours: 1, isNextDay: false, hotel: null, base: 'AAA', rawText: 'synthetic flight',
      legs: [{ flightNumber: 'LA9002', origin: 'AAA', destination: 'BBB', departureTime: '00:00', arrivalTime: '01:00', presentationTime: '00:00' }],
    },
  ],
};
const complianceResult = compliance.analyzeCompliance(boundaryRoster);
assert.equal(complianceResult.metrics.maxNightOps168hCount, 2, 'atividade não-voo + voo exatamente a 168h deve ser invariável por TZ');
console.log(JSON.stringify({ tz: process.env.TZ, maxNightOps168hCount: complianceResult.metrics.maxNightOps168hCount }));
