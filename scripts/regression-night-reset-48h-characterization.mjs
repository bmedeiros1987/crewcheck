// Characterization only (no rule change): how the PREPARED compliance engine resets the madrugada
// count after a free period, on a synthetic independent scenario. It pins today's behaviour so a
// future, validated regulatory change has to flip it consciously.
//
// Today the engine applies ACT Aeronautas 2025/2027 cláusula 3.3.14 parágrafo segundo as cited in
// client/src/lib/actRules.ts (resetAfterFreeHours = 48): any 48 h free of activity restarts the
// 168 h madrugada count, with NO local-night condition. RBAC 117 (EMD 01) 117.3(p) / B117.29(b)
// requiring two local nights in that 48 h is NOT implemented: its applicability to the approved
// operator profile and the primary text are pending validation, so nothing here infers LATAM,
// SGRF or Appendix B, changes limits, or adds a rule.
//
// Scenario (synthetic, cabin crew, base GRU, BRT): J1 01/02/2027 00:00–01:00, J2 03/02/2027
// 01:00–02:00. Free gap = exactly 48 h. Local-night fragments of 22:00–08:00 inside the gap:
// 7 h (31/01→01/02), 10 h (01→02/02), 3 h (02→03/02): only ONE has ≥ 8 h consecutive.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

assert.match(fs.readFileSync('client/src/lib/complianceEngine.ts', 'utf8'), /function summarizeRegulatoryNightEvents\(/, 'run after node scripts/v139/apply.mjs (prepared sources)');
const actRules = fs.readFileSync('client/src/lib/actRules.ts', 'utf8');
assert.match(actRules, /resetAfterFreeHours: 48,[\s\S]{0,120}legalReference: 'ACT Aeronautas Comissários 2025\/2027, cláusula 3\.3\.14'/, 'cabin rule cites ACT 3.3.14 with a 48 h reset');
assert.match(actRules, /resetAfterFreeHours: 48,[\s\S]{0,120}legalReference: 'ACT Aeronautas Pilotos 2025\/2027, cláusula 3\.3\.14'/, 'pilot rule cites its own ACT 3.3.14');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'night-reset-48h-'));
await build({ stdin: { contents: "export { analyzeCompliance } from './client/src/lib/complianceEngine.ts'; export { publishedNightJourneySequence } from './client/src/lib/publishedNightJourneys.ts'; export { buildCanonicalRosterEvents } from './client/src/lib/canonicalRoster.ts';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: path.join(dir, 'engine.mjs'), logLevel: 'silent', alias: { '@': path.resolve('client/src') } });
const { analyzeCompliance } = await import(path.join(dir, 'engine.mjs'));

const pad = value => String(value).padStart(2, '0');
const hhmm = minutes => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
// One short journey: report at `start` minutes after 00:00 of that civil day, release 60 min later.
const journey = (day, start, flightNumber) => ({ date: `${pad(day)}/02/2027`, type: 'FLIGHT', pairingCode: flightNumber, dutyReport: hhmm(start), dutyDebrief: hhmm(start + 60), dutyReportSource: 'published', dutyDebriefSource: 'published',
  legs: [{ flightNumber, origin: 'GRU', destination: 'BSB', departureTime: hhmm(start + 10), arrivalTime: hhmm(start + 50), presentationTime: hhmm(start), duration: 40 / 60, workType: 'OP' }] });
function roster(secondDay, secondStart) {
  const work = { 1: journey(1, 0, 'LA9001'), [secondDay]: journey(secondDay, secondStart, 'LA9002') };
  const days = [];
  for (let day = 1; day <= 28; day += 1) days.push(work[day] || { date: `${pad(day)}/02/2027`, type: 'DO', pairingCode: 'DO', isDayOff: true, legs: [] });
  return { crewId: 'BP00000001', crewName: 'TRIPULANTE SINTETICO', base: 'GRU', rank: 'CC', airline: 'LATAM', year: 2027, month: 2, rawText: 'A320', days };
}
const nightMetrics = r => { const result = analyzeCompliance(JSON.parse(JSON.stringify(r)), 'cabin'); return { count168h: result.metrics.maxNightOps168hCount, consecutive: result.metrics.maxConsecutiveNights }; };

// Local-night arithmetic of the scenario (documentation of the gap; not a rule evaluation).
const H = 3_600_000, gapStart = Date.UTC(2027, 1, 1, 4), gapEnd = Date.UTC(2027, 1, 3, 4); // 01:00 BRT = 04:00 UTC
const fragments = [Date.UTC(2027, 0, 31, 22 + 3), Date.UTC(2027, 1, 1, 22 + 3), Date.UTC(2027, 1, 2, 22 + 3)].map(start => (Math.min(start + 10 * H, gapEnd) - Math.max(start, gapStart)) / H);
assert.deepEqual(fragments, [7, 10, 3], 'free parts of the 22:00–08:00 windows inside the 48 h gap');
assert.equal(fragments.filter(hours => hours >= 8).length, 1, 'only one local night of 8 h consecutive inside the gap');

// Exactly 48 h free (J2 03/02 01:00): CURRENT engine resets, so each journey is alone in its window.
assert.deepEqual(nightMetrics(roster(3, 60)), { count168h: 1, consecutive: 1 }, 'CURRENT (ACT 3.3.14 §2 as implemented): 48 h free restarts the 168 h madrugada count, with no local-night condition');
// 48 h − 1 min free (J2 03/02 00:59): no reset, both madrugadas in the same 168 h window.
// Observation (pinned, NOT investigated here): without a reset the engine counts these two night
// journeys as "consecutive" although 02/02 has no activity, because only a 48 h reset or a proven
// daytime journey breaks the published sequence. Separate question for review; no change here.
assert.deepEqual(nightMetrics(roster(3, 59)), { count168h: 2, consecutive: 2 }, 'CURRENT: 47 h 59 min free: no reset; both in the 168 h window and in one published sequence');
// 48 h + 1 min free (J2 03/02 01:01): reset.
assert.deepEqual(nightMetrics(roster(3, 61)), { count168h: 1, consecutive: 1 }, '48 h 01 min free: reset');
// 06:00–08:00 is outside the madrugada window (ACT 3.3.14 §3: 00:00–06:00 Brasília); not counted, not widened.
assert.deepEqual(nightMetrics(roster(2, 6 * 60)), { count168h: 1, consecutive: 1 }, 'a 06:00–07:00 journey is not a madrugada');

console.log('PASS night reset characterization (prepared engine): 48 h free restarts the 168 h madrugada count without any local-night condition (scenario has only one 8 h local night: 7/10/3 h), 47 h 59 min does not reset (and is one published sequence of 2), 48 h 01 min does; 06:00–08:00 not a madrugada. RBAC 117 two-local-night reset NOT implemented; pending validated source and profile.');
