import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const helperPath = path.join(ROOT, 'client/src/lib/localRosterOverlap.ts');
const databasePath = path.join(ROOT, 'client/src/lib/databaseClient.ts');
const applyPath = path.join(ROOT, 'scripts/p0-580-transposed-vc-boundary/apply.mjs');
const parserPath = path.join(ROOT, 'client/src/lib/pdfParser.ts');

for (const file of [helperPath, databasePath, applyPath, parserPath]) {
  assert.ok(fs.existsSync(file), `missing regression dependency: ${file}`);
}

const helperSource = fs.readFileSync(helperPath, 'utf8');
const helperJs = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tempModuleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-overlap-helper-'));
const tempModule = path.join(tempModuleDir, 'localRosterOverlap.mjs');
fs.writeFileSync(tempModule, helperJs);
const { dedupeAdjacentRosterDays } = await import(`${pathToFileURL(tempModule).href}?v=${Date.now()}`);

const leg = (flightNumber, origin, destination) => ({ flightNumber, origin, destination, departureTime: '10:00' });
const primary = [
  { date: '29/08/2026', type: 'FLIGHT', pairingCode: 'P-A', dutyReport: '08:10', legs: [leg('LA9001', 'AAA', 'BBB')] },
  { date: '01/09/2026', type: 'FLIGHT', pairingCode: 'P-A', dutyReport: '08:20', legs: [leg('LA9002', 'BBB', 'CCC')] },
  { date: '02/09/2026', type: 'FLIGHT', pairingCode: 'P-A', dutyReport: '09:00', legs: [leg('LA9003', 'CCC', 'DDD')] },
  { date: '04/09/2026', type: 'VC', pairingCode: 'VC-A', legs: [] },
];
const adjacent = [
  // Same operational facts, but reimport changed pairing/report metadata.
  { date: '2026-08-29', type: 'FLIGHT', pairingCode: 'P-B', dutyReport: '08:15', legs: [leg('LA9001', 'AAA', 'BBB')] },
  { date: '2026-09-01', type: 'FLIGHT', pairingCode: 'P-B', dutyReport: '08:30', legs: [leg('LA9002', 'BBB', 'CCC')] },
  // Partial overlap: duplicate first leg plus a legitimate new leg.
  { date: '2026-09-02', type: 'FLIGHT', pairingCode: 'P-B', dutyReport: '09:10', legs: [leg('LA9003', 'CCC', 'DDD'), leg('LA9004', 'DDD', 'EEE')] },
  { date: '2026-09-03', type: 'FLIGHT', pairingCode: 'P-B', dutyReport: '11:00', legs: [leg('LA9005', 'EEE', 'FFF')] },
  { date: '2026-09-04', type: 'VC', pairingCode: 'VC-B', legs: [] },
];

const filtered = dedupeAdjacentRosterDays(primary, adjacent);
assert.equal(filtered.length, 2, 'overlap reimport must retain only genuinely new operational days/legs');
assert.equal(filtered[0].date, '2026-09-02');
assert.deepEqual(filtered[0].legs.map((item) => item.flightNumber), ['LA9004'], 'partial overlap must keep only the new leg');
assert.equal(filtered[1].date, '2026-09-03');
assert.deepEqual(filtered[1].legs.map((item) => item.flightNumber), ['LA9005']);

const databaseSource = fs.readFileSync(databasePath, 'utf8');
assert.match(databaseSource, /P0_580_OVERLAP_ACTIVITY_DEDUPE/, 'prepared database source must contain overlap marker');
assert.match(databaseSource, /dedupeAdjacentRosterDays\(previousRoster\.days \|\| \[\], nextRoster\.days \|\| \[\]\)/, 'continuation detection must ignore overlap copies first');
assert.match(databaseSource, /const adjacentDays = dedupeAdjacentRosterDays\(primary\.days \|\| \[\], adjacent\.days \|\| \[\]\)/, 'merge must dedupe by operational activity identity');
assert.doesNotMatch(databaseSource, /next\.roster\.days\.slice\(0, 5\)/, 'blind fixed-slice fallback must not survive');

// Fail-closed counterproof: a source carrying the marker but missing one mandatory
// structural fragment must be rejected by the apply step instead of returning green.
const tempApplyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-apply-failclosed-'));
fs.mkdirSync(path.join(tempApplyDir, 'client/src/lib'), { recursive: true });
fs.mkdirSync(path.join(tempApplyDir, 'scripts/p0-580-transposed-vc-boundary'), { recursive: true });
const preparedParser = fs.readFileSync(parserPath, 'utf8');
assert.match(preparedParser, /P0_580_TRANSPOSED_STRUCTURE_GUARD/, 'prepared parser must carry structural marker');
const damagedParser = preparedParser.replace('&& transposedStructurallySound', '&& true /* damaged regression */');
assert.notEqual(damagedParser, preparedParser, 'regression must actually damage a required fragment');
fs.writeFileSync(path.join(tempApplyDir, 'client/src/lib/pdfParser.ts'), damagedParser);
fs.writeFileSync(path.join(tempApplyDir, 'client/src/lib/databaseClient.ts'), databaseSource);
fs.writeFileSync(path.join(tempApplyDir, 'client/src/lib/localRosterOverlap.ts'), helperSource);
fs.copyFileSync(applyPath, path.join(tempApplyDir, 'scripts/p0-580-transposed-vc-boundary/apply.mjs'));
let failedClosed = false;
try {
  execFileSync(process.execPath, ['scripts/p0-580-transposed-vc-boundary/apply.mjs'], { cwd: tempApplyDir, stdio: 'pipe' });
} catch (error) {
  failedClosed = true;
  const output = `${error?.stdout || ''}\n${error?.stderr || ''}`;
  assert.match(output, /P0_580_TRANSPOSED_STRUCTURE_GUARD/, 'fail-closed error must identify the missing structural contract');
}
assert.equal(failedClosed, true, 'partially applied marker state must fail closed');

console.log('[P0-580] overlap/reimport dedupe + fail-closed apply: PASS');
