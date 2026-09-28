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
const { dedupeAdjacentRosterDays, isOperationalLegChainVerifiable } = await import(`${pathToFileURL(tempModule).href}?v=${Date.now()}`);

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

const leg = (origin, destination = 'BBB') => ({ flightNumber: 'LA9060', origin, destination, departureTime: '10:00' });
const placeholderAirportPrimary = [
  { date: '13/09/2026', type: 'FLIGHT', legs: [leg('XXX')] },
];
const placeholderAirportAdjacent = [
  { date: '2026-09-13', type: 'FLIGHT', legs: [leg('XXX')] },
];
const placeholderAirportResult = dedupeAdjacentRosterDays(placeholderAirportPrimary, placeholderAirportAdjacent);
assert.equal(placeholderAirportResult.length, 1, 'XXX airport placeholder must remain non-deduplicable');
assert.equal(placeholderAirportResult[0].legs.length, 1);

// Airport sentinels are contextual. UNK is a legitimate IATA code and must not
// inherit the generic UNKNOWN/UNK placeholder policy used for non-airport fields.
const legitimateIataPrimary = [
  { date: '14/09/2026', type: 'FLIGHT', legs: [leg('UNK', 'BBB')] },
];
const legitimateIataAdjacent = [
  { date: '2026-09-14', type: 'FLIGHT', legs: [leg('UNK', 'BBB')] },
];
assert.equal(
  dedupeAdjacentRosterDays(legitimateIataPrimary, legitimateIataAdjacent).length,
  0,
  'legitimate UNK IATA identity must deduplicate an exact carry-in copy',
);

// Explicit missing-data labels are not operational identity. They must neither
// authorize continuity nor delete an adjacent copy merely because date/route/time
// happen to match.
const missingIdentityDay = {
  date: '2026-09-14',
  type: 'FLIGHT',
  legs: [{ flightNumber: 'MISSING', origin: 'UNK', destination: 'BBB', departureTime: '10:00' }],
};
assert.equal(
  isOperationalLegChainVerifiable(missingIdentityDay),
  false,
  'MISSING flight identity must fail closed for continuation',
);
assert.equal(
  dedupeAdjacentRosterDays([missingIdentityDay], [missingIdentityDay]).length,
  1,
  'MISSING flight identity must remain non-deduplicable',
);

for (const flightNumber of ['UNKNOWN1', 'INVALID1', 'MISSING1']) {
  const variant = {
    date: '2026-09-14',
    type: 'FLIGHT',
    legs: [{ flightNumber, origin: 'UNK', destination: 'BBB', departureTime: '10:00' }],
  };
  assert.equal(
    isOperationalLegChainVerifiable(variant),
    false,
    `${flightNumber} placeholder family must fail closed for continuation`,
  );
  assert.equal(
    dedupeAdjacentRosterDays([variant], [variant]).length,
    1,
    `${flightNumber} placeholder family must remain non-deduplicable`,
  );
}

// Preserve the earlier contract that a stable non-numeric published identifier can
// still be valid when it is not a sentinel and all other operational fields verify.
const alphaIdentityDay = {
  date: '2026-09-14',
  type: 'FLIGHT',
  legs: [{ flightNumber: 'ABCD', origin: 'UNK', destination: 'BBB', departureTime: '10:00' }],
};
assert.equal(
  isOperationalLegChainVerifiable(alphaIdentityDay),
  true,
  'stable non-numeric operational identifiers must remain supported',
);

// CRM is a broad parser category. The published pairing code carries the specific
// ground activity identity, so CBF and EMER on the same date must coexist instead
// of one being deleted merely because both normalize to type CRM.
const crmPrimary = [
  { date: '15/09/2026', type: 'CRM', pairingCode: 'CBF', legs: [] },
];
const crmAdjacent = [
  { date: '2026-09-15', type: 'CRM', pairingCode: 'EMER', legs: [] },
];
const crmResult = dedupeAdjacentRosterDays(crmPrimary, crmAdjacent);
assert.equal(crmResult.length, 1, 'distinct CRM ground activities must remain distinct by published specific code');
assert.equal(crmResult[0].pairingCode, 'EMER');

for (const pairingCode of [undefined, 'UNKNOWN', 'UNKNOWN1', 'MISSING', '???']) {
  const primary = [{ date: '16/09/2026', type: 'CRM', pairingCode, legs: [] }];
  const adjacent = [{ date: '2026-09-16', type: 'CRM', pairingCode, legs: [] }];
  assert.equal(
    dedupeAdjacentRosterDays(primary, adjacent).length,
    1,
    `CRM without a verifiable specific code (${String(pairingCode)}) must remain non-deduplicable`,
  );
}

const sameSpecificCrmPrimary = [{ date: '17/09/2026', type: 'CRM', pairingCode: 'CBF', legs: [] }];
const sameSpecificCrmAdjacent = [{ date: '2026-09-17', type: 'CRM', pairingCode: 'CBF', legs: [] }];
assert.equal(
  dedupeAdjacentRosterDays(sameSpecificCrmPrimary, sameSpecificCrmAdjacent).length,
  0,
  'CRM with the same verified specific code must still deduplicate an exact overlap',
);

assert.match(helperSource, /'INVALID'/, 'invalid sentinel must be explicitly non-identifying');
assert.match(helperSource, /'MISSING'/, 'missing-data sentinel must be explicitly non-identifying');
assert.match(helperSource, /NON_IDENTIFYING_TOKEN_FAMILIES/, 'numbered sentinel families must fail closed before identity construction');
assert.match(helperSource, /UNKNOWN\|INVALID\|MISSING/, 'UNKNOWN/INVALID/MISSING families must remain structurally guarded');
assert.match(helperSource, /NON_IDENTIFYING_AIRPORT_TOKENS/, 'airport placeholders need a dedicated fail-closed guard');
assert.match(helperSource, /'XXX'/, 'XXX airport placeholder must not authorize overlap deletion');
assert.match(helperSource, /if \(type === 'CRM'\)/, 'CRM must require a verified published specific activity code');
assert.match(helperSource, /const token = normalizeToken\(value\);/, 'airport identity must use context-specific token normalization');

console.log('[P0-580] invalid sentinels, legitimate IATA and distinct CRM ground activities: PASS');
