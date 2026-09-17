import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB } from './lib/ts-module-harness.mjs';

const harness = loadClientModules({
  prefix: 'crewcheck-p0-691-care-',
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  files: [
    'client/src/lib/scheduleActivityClassification.ts',
  ],
});

const classification = harness.load('scheduleActivityClassification');

assert.equal(
  typeof classification.careStateForScheduleActivity,
  'function',
  'must expose deterministic care state separate from operational classification',
);
assert.equal(
  typeof classification.carePresentationForScheduleActivity,
  'function',
  'must expose deterministic human presentation for care days',
);

const activity = (code, extra = {}) => ({
  kind: 'rest',
  type: code,
  code,
  canonical: { kind: 'rest', code, publishedDay: { type: code, pairingCode: code, legs: [] } },
  day: { type: code, pairingCode: code, legs: [] },
  ...extra,
});

const cases = [
  ['DMO', 'LUTO', 'Luto'],
  ['VC', 'FERIAS', 'Férias'],
  ['FERIAS', 'FERIAS', 'Férias'],
  ['FÉRIAS', 'FERIAS', 'Férias'],
  ['DO', 'FOLGA', 'Folga'],
  ['DOF', 'FOLGA', 'Folga'],
  ['OFF', 'FOLGA', 'Folga'],
  ['DR', 'FOLGA', 'Folga'],
  ['REST', 'REPOUSO', 'Repouso'],
  ['REPOUSO', 'REPOUSO', 'Repouso'],
];

for (const [code, expectedState, expectedLabel] of cases) {
  const item = activity(code);
  assert.equal(
    classification.careStateForScheduleActivity(item),
    expectedState,
    `${code} care state must be ${expectedState}`,
  );
  const presentation = classification.carePresentationForScheduleActivity(item);
  assert.equal(presentation?.label, expectedLabel, `${code} human label must be ${expectedLabel}`);
  assert.equal(classification.isProgramScheduleActivity(item), false, `${code} must not be operational programming`);
  assert.equal(classification.isSmartDepartureEligible(item), false, `${code} must never open Smart Departure`);
}

assert.equal(classification.isRequestedDayOff(activity('DR')), true, 'DR remains requested day off');
assert.equal(classification.careStateForScheduleActivity(activity('XYZ')), 'NONE', 'unknown code must not invent a care state');

const grief = classification.carePresentationForScheduleActivity(activity('DMO'));
assert.equal(grief?.suppressRoutineProactivity, true, 'luto suppresses routine proactivity');
assert.equal(grief?.suppressHumor, true, 'luto suppresses humor');
assert.equal(grief?.allowCriticalAlerts, true, 'luto may still receive truly critical alerts');
assert.match(grief?.message || '', /Sinto muito/i, 'luto copy must be compassionate but concise');
assert.doesNotMatch(grief?.message || '', /quem|familiar|causa|motivo/i, 'luto copy must not probe private details');

const vacation = classification.carePresentationForScheduleActivity(activity('VC'));
assert.equal(vacation?.suppressRoutineProactivity, true, 'férias suppress routine work briefing');
assert.equal(vacation?.suppressHumor, false, 'férias need not globally suppress configured personality');

const dayOff = classification.carePresentationForScheduleActivity(activity('DO'));
assert.match(dayOff?.message || '', /Sem programação operacional/i, 'folga must be explicit, not roster-empty');

// Server/Concierge integration gate: DMO must be inactive and the server must
// have a dedicated care path so /hoje never falls through to generic programming.
const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
assert.match(server, /conciergeInactiveCodes[^\n]*DMO|DMO[^\n]*conciergeInactiveCodes/s, 'Concierge inactive codes must include DMO');
assert.match(server, /conciergeCareState|careStateForConcierge|conciergeCarePresentation/, 'Concierge must have an explicit care-state resolver');
assert.match(server, /Sinto muito/, 'Concierge luto response must be compassionate');
assert.match(server, /Férias/, 'Concierge must present vacation explicitly');
assert.match(server, /Hoje é folga|Hoje é uma folga|Sem programação operacional/, 'Concierge must present day off explicitly');

// Existing roster code remains the source for DMO meaning; do not invent a new parser code.
const rosterCodes = fs.readFileSync(new URL('../client/src/lib/rosterCodes.ts', import.meta.url), 'utf8');
assert.match(rosterCodes, /code:\s*'DMO'[\s\S]*?description:\s*'Luto'/, 'DMO must remain mapped to Luto in the published code catalog');

harness.cleanup();
console.log('OK regression-p0-691-care-context');
