import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

/**
 * #530 — exact 168h boundary contract for night-operation counting.
 *
 * Lei 13.475/2017 art. 42 and RBAC 117 EMD 01 A117.15(m) allow the
 * 168h count to restart after at least 48h free of activity. Therefore an
 * exact-boundary test must keep the crew active often enough to prevent that
 * reset, otherwise the endpoint comparison is never reached.
 *
 * The shipped v14.3.59 convention is half-open: [start, start+168h).
 * This avoids counting the same instant in two adjacent 168h periods.
 */

const helper = fs.readFileSync('scripts/v14359/compliance-temporal-helpers.txt', 'utf8');
const officialRegression = fs.readFileSync('scripts/regression-v14-3-59-official-roster-compliance.mjs', 'utf8');
assert.match(helper, /candidate\.timestamp\s*<\s*end/, 'prepared helper must retain the half-open exact-168h convention');
assert.doesNotMatch(helper, /candidate\.timestamp\s*<=\s*end/, 'inclusive prepared helper would double-count the shared endpoint of adjacent 168h windows');
assert.match(officialRegression, /candidate\\\.timestamp < end|candidate\\\.timestamp\\s\*<\\s\*end/, 'official prepared regression must pin the half-open operator');

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-530-168h-'));
try {
  await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { '@shared': path.resolve('shared') } },
    build: {
      lib: { entry: path.resolve('client/src/lib/complianceEngine.ts'), formats: ['es'], fileName: () => 'compliance.mjs' },
      outDir,
      emptyOutDir: true,
      minify: false,
    },
  });
  const { analyzeCompliance } = await import(pathToFileURL(path.join(outDir, 'compliance.mjs')).href + '?v=' + Date.now());

  const activity = (date, pairingCode, report, debrief) => ({
    date,
    dayNumber: Number(date.slice(0,2)),
    month: 9,
    year: 2026,
    dayOfWeek: 'qa',
    type: 'OTHER',
    pairingCode,
    dutyReport: report,
    dutyDebrief: debrief,
    dutyHours: 1,
    flyingHours: 0,
    isNextDay: false,
    hotel: null,
    base: 'BSB',
    legs: [],
    rawText: pairingCode + ' synthetic',
  });

  const first = activity('01/09/2026', 'CRM', '00:01', '02:00');
  // Non-night activities keep every free interval below 48h, so the 168h
  // endpoint itself — not the statutory reset — decides the result.
  const bridges = [
    activity('02/09/2026', 'MCK', '12:00', '13:00'),
    activity('04/09/2026', 'MCK', '12:00', '13:00'),
    activity('06/09/2026', 'MCK', '12:00', '13:00'),
  ];
  const second = (clock) => ({
    date: '08/09/2026', dayNumber: 8, month: 9, year: 2026, dayOfWeek: 'qa',
    type: 'VOO', pairingCode: 'SYNTH', dutyReport: clock, dutyDebrief: '01:00',
    dutyHours: 1, flyingHours: 1, isNextDay: false, hotel: null, base: 'BSB', rawText: 'synthetic flight',
    legs: [{ flightNumber: 'LA9002', origin: 'BSB', destination: 'GRU', departureTime: clock, arrivalTime: '01:00', presentationTime: clock }],
  });

  const count = (clock) => analyzeCompliance({
    crewName: 'Synthetic Crew', crewId: 'qa-only', base: 'BSB', month: 9, year: 2026, rawText: '', days: [first, ...bridges, second(clock)],
  }).metrics.maxNightOps168hCount;

  assert.equal(count('00:00'), 2, '167h59m: both qualifying nights must share a rolling 168h window');
  assert.equal(count('00:01'), 1, 'exactly 168h: half-open window excludes the shared endpoint');
  assert.equal(count('00:02'), 1, '168h01m: second occurrence remains outside the first window');
  console.log('PASS #530 exact 168h boundary: no 48h reset; 167h59=2, 168h00=1, 168h01=1');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
