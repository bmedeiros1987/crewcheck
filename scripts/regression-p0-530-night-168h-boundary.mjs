import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

/**
 * #530 — exact 168h boundary contract for night-operation counting.
 *
 * Normative text in Lei 13.475/2017 art. 42 and RBAC 117 EMD 01 A117.15(m)
 * defines a maximum in a period of 168 consecutive hours counted from crew
 * presentation, but does not spell out endpoint notation. CrewCheck therefore
 * uses the conservative safety convention already present in the committed
 * source engine/test: an occurrence exactly 168h after the first presentation
 * is still surfaced in the observed count. One minute after is outside.
 *
 * This test protects SOURCE/PREPARED parity. Do not weaken it merely to make
 * the v14.3.59 materializer green; if the product/legal convention changes,
 * adjudicate that explicitly with a new normative decision first.
 */

const helper = fs.readFileSync('scripts/v14359/compliance-temporal-helpers.txt', 'utf8');
const officialRegression = fs.readFileSync('scripts/regression-v14-3-59-official-roster-compliance.mjs', 'utf8');
assert.match(helper, /candidate\.timestamp\s*<=\s*end/, 'prepared helper must use the same inclusive exact-168h convention as source');
assert.doesNotMatch(helper, /candidate\.timestamp\s*<\s*end/, 'half-open prepared helper would diverge at the exact 168h boundary');
assert.match(officialRegression, /candidate\\\.timestamp\s*<=\s*end|candidate\\\.timestamp <= end|candidate\\\.timestamp\\s*<=\\s*end/, 'official prepared regression must pin the inclusive exact-boundary operator');

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

  const first = {
    date: '01/09/2026', dayNumber: 1, month: 9, year: 2026, dayOfWeek: 'ter',
    type: 'OTHER', pairingCode: 'CRM', dutyReport: '00:01', dutyDebrief: '02:00',
    dutyHours: 2, flyingHours: 0, isNextDay: false, hotel: null, base: 'BSB', legs: [], rawText: 'CRM synthetic',
  };

  const second = (clock) => ({
    date: '08/09/2026', dayNumber: 8, month: 9, year: 2026, dayOfWeek: 'ter',
    type: 'VOO', pairingCode: 'SYNTH', dutyReport: clock, dutyDebrief: '01:00',
    dutyHours: 1, flyingHours: 1, isNextDay: false, hotel: null, base: 'BSB', rawText: 'synthetic flight',
    legs: [{ flightNumber: 'LA9002', origin: 'BSB', destination: 'GRU', departureTime: clock, arrivalTime: '01:00', presentationTime: clock }],
  });

  const count = (clock) => analyzeCompliance({
    crewName: 'Synthetic Crew', crewId: 'qa-only', base: 'BSB', month: 9, year: 2026, rawText: '', days: [first, second(clock)],
  }).metrics.maxNightOps168hCount;

  assert.equal(count('00:00'), 2, '167h59m: both night occurrences must be inside the same 168h observation');
  assert.equal(count('00:01'), 2, 'exactly 168h: conservative CrewCheck boundary convention must still surface both occurrences');
  assert.equal(count('00:02'), 1, '168h01m: second occurrence must be outside the first 168h window');
  console.log('PASS #530 exact 168h boundary: 167h59=2, 168h00=2, 168h01=1');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
