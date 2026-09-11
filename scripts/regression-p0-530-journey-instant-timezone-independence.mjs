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
