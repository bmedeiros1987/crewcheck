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

const leg = (flightNumber, origin, destination, departureTime = '10:00') => ({ flightNumber, origin, destination, departureTime });
const primary = [
  { date: '29/08/2026', type: 'FLIGHT', pairingCode: 'P-A', dutyReport: '08:10', legs: [leg('LA9001', 'AAA', 'BBB')] },
  { date: '01/09/2026', type: 'FLIGHT', pairingCode: 'P-A', dutyReport: '08:20', legs: [leg('LA9002', 'BBB', 'CCC')] },
  { date: '02/09/2026', type: 'FLIGHT', pairingCode: 'P-A', dutyReport: '09:00', legs: [leg('LA9003', 'CCC', 'DDD')] },
  { date: '04/09/2026', type: 'VC', pairingCode: 'VC-A', legs: [] },
  { date: '05/09/2026', type: 'FLIGHT', pairingCode: 'P-A', dutyReport: '07:00', legs: [leg('LA9010', 'GGG', 'HHH', '08:00')] },
];
const adjacent = [
  { date: '2026-08-29', type: 'FLIGHT', pairingCode: 'P-B', dutyReport: '08:15', legs: [leg('LA9001', 'AAA', 'BBB')] },
  { date: '2026-09-01', type: 'FLIGHT', pairingCode: 'P-B', dutyReport: '08:30', legs: [leg('LA9002', 'BBB', 'CCC')] },
  { date: '2026-09-02', type: 'FLIGHT', pairingCode: 'P-B', dutyReport: '09:10', dutyDebrief: '12:30', dutyHours: 200, flyingHours: 120, rawText: 'full stale duty text', legs: [leg('LA9003', 'CCC', 'DDD'), leg('LA9004', 'DDD', 'EEE')] },
  { date: '2026-09-03', type: 'FLIGHT', pairingCode: 'P-B', dutyReport: '11:00', legs: [leg('LA9005', 'EEE', 'FFF')] },
  { date: '2026-09-04', type: 'VC', pairingCode: 'VC-B', legs: [] },
  { date: '2026-09-05', type: 'FLIGHT', pairingCode: 'P-C', dutyReport: '07:05', legs: [leg('LA9010', 'GGG', 'HHH', '08h00'), leg('LA9010', 'GGG', 'HHH', '18:00')] },
];

const filtered = dedupeAdjacentRosterDays(primary, adjacent);
assert.equal(filtered.length, 3, 'overlap reimport must retain only genuinely new operational days/legs');
assert.equal(filtered[0].date, '2026-09-02');
assert.deepEqual(filtered[0].legs.map((item) => item.flightNumber), ['LA9004'], 'partial overlap must keep only the new leg');
assert.equal(filtered[0].dutyReport, null, 'partial duty must invalidate stale dutyReport');
assert.equal(filtered[0].dutyDebrief, null, 'partial duty must invalidate stale dutyDebrief');
assert.equal(filtered[0].dutyHours, null, 'partial duty must invalidate stale dutyHours');
assert.equal(filtered[0].flyingHours, null, 'partial duty must invalidate stale flyingHours');
assert.equal(filtered[0].rawText, null, 'partial duty must invalidate stale rawText');
assert.equal(filtered[1].date, '2026-09-03');
assert.deepEqual(filtered[1].legs.map((item) => item.flightNumber), ['LA9005']);
assert.equal(filtered[2].date, '2026-09-05');
assert.equal(filtered[2].legs.length, 1, 'same flight/date/route at a different time must remain distinct');
assert.equal(filtered[2].legs[0].departureTime, '18:00');

// Unknown/invalid time cannot prove identity. Preserve both occurrences rather
// than collapsing uncertain data.
const unknownTimePrimary = [
  { date: '06/09/2026', type: 'FLIGHT', legs: [leg('LA9020', 'III', 'JJJ', '')] },
];
const unknownTimeAdjacent = [
  { date: '2026-09-06', type: 'FLIGHT', legs: [leg('LA9020', 'III', 'JJJ', 'invalid')] },
];
const unknownTimeFiltered = dedupeAdjacentRosterDays(unknownTimePrimary, unknownTimeAdjacent);
assert.equal(unknownTimeFiltered.length, 1, 'unknown/invalid time must remain fail-safe and non-deduplicable');
assert.equal(unknownTimeFiltered[0].legs.length, 1);

// Unknown, missing or civilly impossible dates are incomplete factual identity.
// Fail-before on 289d7f18fc0ced132ed0a22f2e56df1c7b562060: UNKNOWN was
// normalized as an ordinary token and equal occurrences were silently deleted.
for (const [label, primaryDate, adjacentDate] of [
  ['unknown', 'UNKNOWN', 'unknown'],
  ['missing', null, undefined],
  ['impossible', '31/02/2026', '2026-02-31'],
]) {
  const uncertainDatePrimary = [
    { date: primaryDate, type: 'FLIGHT', legs: [leg('LA9021', 'III', 'JJJ', '10:00')] },
  ];
  const uncertainDateAdjacent = [
    { date: adjacentDate, type: 'FLIGHT', legs: [leg('LA9021', 'III', 'JJJ', '10:00')] },
  ];
  const uncertainDateFiltered = dedupeAdjacentRosterDays(uncertainDatePrimary, uncertainDateAdjacent);
  assert.equal(uncertainDateFiltered.length, 1, `${label} factual date must remain fail-safe and non-deduplicable`);
  assert.equal(uncertainDateFiltered[0].legs.length, 1);
}

// Flight-like rows without parsed legs are incomplete evidence. They may be the
// exact data-loss symptom being recovered, so activity-level equality is not
// sufficient to delete them during overlap reconciliation.
const leglessFlightPrimary = [
  { date: '08/09/2026', type: 'VOO', pairingCode: 'LA9040', legs: [] },
];
const leglessFlightAdjacent = [
  { date: '2026-09-08', type: 'OTHER', pairingCode: 'LA9040', legs: [] },
];
const leglessFlightFiltered = dedupeAdjacentRosterDays(leglessFlightPrimary, leglessFlightAdjacent);
assert.equal(leglessFlightFiltered.length, 1, 'flight-like activity without parsed legs must be preserved fail-closed');
assert.equal(leglessFlightFiltered[0].pairingCode, 'LA9040');

// Count-aware overlap: one occurrence in primary consumes only one identical
// adjacent occurrence; an additional real repeated occurrence must survive.
const multiplicityPrimary = [
  { date: '07/09/2026', type: 'FLIGHT', legs: [leg('LA9030', 'KKK', 'LLL', '09:00')] },
];
const multiplicityAdjacent = [
  { date: '2026-09-07', type: 'FLIGHT', legs: [leg('LA9030', 'KKK', 'LLL', '09:00'), leg('LA9030', 'KKK', 'LLL', '09:00')] },
];
const multiplicityFiltered = dedupeAdjacentRosterDays(multiplicityPrimary, multiplicityAdjacent);
assert.equal(multiplicityFiltered.length, 1, 'one extra repeated occurrence must survive count-aware dedupe');
assert.equal(multiplicityFiltered[0].legs.length, 1, 'primary occurrence may consume at most one matching adjacent copy');
assert.equal(multiplicityFiltered[0].dutyReport ?? null, null, 'partial repeated duty must not retain stale duty metadata');

const databaseSource = fs.readFileSync(databasePath, 'utf8');
assert.match(databaseSource, /P0_580_OVERLAP_ACTIVITY_DEDUPE/, 'prepared database source must contain overlap marker');
assert.match(databaseSource, /dedupeAdjacentRosterDays\(previousRoster\.days \|\| \[\], nextRoster\.days \|\| \[\]\)/, 'continuation detection must ignore overlap copies first');
assert.match(databaseSource, /const adjacentDays = dedupeAdjacentRosterDays\(primary\.days \|\| \[\], originalAdjacentDays\)/, 'merge must dedupe by operational activity identity');
assert.match(databaseSource, /if \(adjacentWasFiltered\) adjacent = \{ \.\.\.adjacent, rawText: '' \};/, 'filtered adjacent publication must invalidate stale aggregate rawText');
assert.doesNotMatch(databaseSource, /next\.roster\.days\.slice\(0, 5\)/, 'blind fixed-slice fallback must not survive');
assert.doesNotMatch(helperSource, /TIME-UNKNOWN/, 'unknown operational time must never become a deduplicable identity');
assert.match(helperSource, /function normalizeDateKey\(value\?: string \| null\): string \| null/, 'unknown factual date must be represented as non-deduplicable');
assert.match(helperSource, /function validDateKey\(/, 'date identity must reject civilly impossible calendar dates');
assert.match(helperSource, /new Map<string, number>/, 'overlap dedupe must use count-aware multiplicity tracking');
assert.match(helperSource, /looksLikeFlightWithoutLegs/, 'flight-like activity without parsed legs must be preserved fail-closed');

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

// False-positive counterproof: postconditions must inspect only the production
// function they protect. Similar Set/slice/firstNext constructs in an unrelated
// helper cannot reject a valid, already materialized source.
const tempApplyScopeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-apply-scope-'));
fs.mkdirSync(path.join(tempApplyScopeDir, 'client/src/lib'), { recursive: true });
fs.mkdirSync(path.join(tempApplyScopeDir, 'scripts/p0-580-transposed-vc-boundary'), { recursive: true });
fs.writeFileSync(path.join(tempApplyScopeDir, 'client/src/lib/pdfParser.ts'), preparedParser);
fs.writeFileSync(path.join(tempApplyScopeDir, 'client/src/lib/localRosterOverlap.ts'), helperSource);
fs.writeFileSync(path.join(tempApplyScopeDir, 'client/src/lib/databaseClient.ts'), `${databaseSource}\n\nfunction unrelatedPreviewHelper(nextAnchors: unknown[], next: { roster: { days: unknown[] } }) {\n  const seen = new Set<string>();\n  const firstNext = nextAnchors[0];\n  return { seen, firstNext, preview: next.roster.days.slice(0, 5) };\n}\n`);
fs.copyFileSync(applyPath, path.join(tempApplyScopeDir, 'scripts/p0-580-transposed-vc-boundary/apply.mjs'));
execFileSync(process.execPath, ['scripts/p0-580-transposed-vc-boundary/apply.mjs'], { cwd: tempApplyScopeDir, stdio: 'pipe' });

console.log('[P0-580] overlap/reimport dedupe + fail-safe time/date + legless-flight + multiplicity + stale-duty + scoped fail-closed apply: PASS');
