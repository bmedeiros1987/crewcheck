import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

const helperPath = path.join(process.cwd(), 'client/src/lib/localRosterOverlap.ts');
const helperSource = fs.readFileSync(helperPath, 'utf8');
const helperJs = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-580-invalid-placeholders-'));
const tempModule = path.join(tempDir, 'localRosterOverlap.mjs');
fs.writeFileSync(tempModule, helperJs);
const { dedupeAdjacentRosterDays } = await import(`${pathToFileURL(tempModule).href}?v=${Date.now()}`);

const invalidActivityPrimary = [
  { date: '12/09/2026', type: 'INVALID', pairingCode: 'INVALID', legs: [] },
];
const invalidActivityAdjacent = [
  { date: '2026-09-12', type: 'INVALID', pairingCode: 'INVALID', legs: [] },
];
assert.equal(
  dedupeAdjacentRosterDays(invalidActivityPrimary, invalidActivityAdjacent).length,
  1,
  'INVALID activity sentinel must remain non-deduplicable',
);

const leg = (origin) => ({ flightNumber: 'LA9060', origin, destination: 'BBB', departureTime: '10:00' });
const placeholderAirportPrimary = [
  { date: '13/09/2026', type: 'FLIGHT', legs: [leg('XXX')] },
];
const placeholderAirportAdjacent = [
  { date: '2026-09-13', type: 'FLIGHT', legs: [leg('XXX')] },
];
const placeholderAirportResult = dedupeAdjacentRosterDays(placeholderAirportPrimary, placeholderAirportAdjacent);
assert.equal(placeholderAirportResult.length, 1, 'XXX airport placeholder must remain non-deduplicable');
assert.equal(placeholderAirportResult[0].legs.length, 1);

assert.match(helperSource, /'INVALID'/, 'invalid sentinel must be explicitly non-identifying');
assert.match(helperSource, /NON_IDENTIFYING_AIRPORT_TOKENS/, 'airport placeholders need a dedicated fail-closed guard');
assert.match(helperSource, /'XXX'/, 'XXX airport placeholder must not authorize overlap deletion');

console.log('[P0-580] invalid identity/activity and airport placeholders: PASS');
