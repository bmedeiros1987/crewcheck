import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB } from './lib/ts-module-harness.mjs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

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
  ['DOP', 'FOLGA', 'Folga'],
  ['DOPR', 'FOLGA', 'Folga'],
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

// Real parser compatibility: pdfParser intentionally normalizes VC/OFF/DOP to
// type=DO while preserving the exact published code in pairingCode. The care
// layer must recover Férias from that precise pairing evidence without changing
// the parser or broad operational category.
const normalizedVacation = {
  kind: 'rest',
  type: 'DO',
  code: 'DO',
  pairingCode: 'VC',
  canonical: { kind: 'rest', code: 'DO', publishedDay: { type: 'DO', pairingCode: 'VC', legs: [] } },
  day: { type: 'DO', pairingCode: 'VC', legs: [] },
};
assert.equal(
  classification.careStateForScheduleActivity(normalizedVacation),
  'FERIAS',
  'type=DO + published pairingCode=VC must remain Férias',
);
assert.equal(classification.carePresentationForScheduleActivity(normalizedVacation)?.label, 'Férias');
assert.equal(classification.isProgramScheduleActivity(normalizedVacation), false);
assert.equal(classification.isSmartDepartureEligible(normalizedVacation), false);

// Formal operational code beats a misleading fallback. Raw/labels cannot turn
// an actual program into grief/vacation; only the known coarse DO wrapper may be
// specialized by a published pairing code.
assert.equal(
  classification.careStateForScheduleActivity({
    kind: 'duty',
    type: 'ASB',
    code: 'ASB',
    pairingCode: 'VC',
    canonical: { kind: 'duty', code: 'ASB', publishedDay: { type: 'ASB', pairingCode: 'VC', legs: [] } },
    day: { type: 'ASB', pairingCode: 'VC', legs: [] },
  }),
  'NONE',
  'operational ASB cannot be overwritten by a misleading VC fallback',
);
assert.equal(
  classification.careStateForScheduleActivity({ kind: 'duty', type: 'ASB', day: { type: 'ASB', rawText: 'comentário menciona luto' } }),
  'NONE',
  'raw text must never invent a grief state',
);
assert.equal(
  classification.careStateForScheduleActivity({ kind: 'rest', type: 'DO', title: 'DMO', day: { type: 'DO', pairingCode: 'DO', rawText: 'DMO' } }),
  'FOLGA',
  'title/raw text cannot specialize an ordinary DO into luto',
);

const grief = classification.carePresentationForScheduleActivity(activity('DMO'));
assert.equal(grief?.suppressRoutineProactivity, true, 'luto suppresses routine proactivity');
assert.equal(grief?.suppressHumor, true, 'luto suppresses humor');
assert.equal(grief?.allowCriticalAlerts, true, 'luto may still receive truly critical alerts');
assert.match(grief?.message || '', /Sinto muito/i, 'luto copy must be compassionate but concise');
assert.doesNotMatch(grief?.message || '', /quem|familiar|causa|motivo/i, 'luto copy must not probe private details');

const vacation = classification.carePresentationForScheduleActivity(normalizedVacation);
assert.equal(vacation?.suppressRoutineProactivity, true, 'férias suppress routine work briefing');
assert.equal(vacation?.suppressHumor, false, 'férias need not globally suppress configured personality');
assert.match(vacation?.message || '', /férias/i, 'vacation must be presented as vacation, not generic day off');

const dayOff = classification.carePresentationForScheduleActivity(activity('DO'));
assert.match(dayOff?.message || '', /Sem programação operacional/i, 'folga must be explicit, not roster-empty');

const recovery = classification.carePresentationForScheduleActivity(activity('REST'));
assert.match(recovery?.message || '', /repouso/i, 'recovery rest must remain distinct from day off/vacation/grief');

// Server/Concierge integration gate: DMO must be inactive and the server must
// have a dedicated care path so /hoje never falls through to generic programming.
const server = read('server.mjs');
assert.match(server, /conciergeInactiveCodes[^\n]*DMO|DMO[^\n]*conciergeInactiveCodes/s, 'Concierge inactive codes must include DMO');
assert.match(server, /function conciergeCareState|function conciergeCarePresentation/, 'Concierge must have an explicit care-state resolver');
assert.match(server, /type === 'DO' && pairing/, 'Concierge care resolver must honor parser-normalized DO + precise pairing code');
assert.match(server, /conciergeCareState\(day\)\s*!==\s*'NONE'/, 'program record builder must exclude care days before briefing selection');
assert.match(server, /Sinto muito/, 'Concierge luto response must be compassionate');
assert.match(server, /Férias/, 'Concierge must present vacation explicitly');
assert.match(server, /Hoje é folga|Hoje é uma folga|Sem programação operacional/, 'Concierge must present day off explicitly');

// The shared human renderer is where `/hoje` lands when no operational record is
// selected. It must distinguish care days instead of declaring the roster blank.
const human = read('server/v1403/telegram-human.mjs');
assert.match(human, /type === 'DO' && pairing/, 'human renderer must preserve the exact pairing code hidden by coarse DO type');
assert.match(human, /code === 'DMO'[\s\S]*?Sinto muito/, 'blank-day renderer must have dedicated grief copy');
assert.match(human, /code === 'VC'[\s\S]*?FERIAS[\s\S]*?férias/i, 'blank-day renderer must have dedicated vacation copy');
assert.match(human, /\['DO', 'DOF', 'DOP', 'DOPR', 'DR', 'OFF', 'FOLGA'\][\s\S]*?Sem programação operacional/, 'blank-day renderer must have dedicated day-off copy');
assert.match(human, /REST[\s\S]*?REPOUSO[\s\S]*?repouso/i, 'blank-day renderer must keep recovery rest distinct');

// Home/FlightDeck must use human labels and must never let a care day become the
// "next operational event" just because an older canonical snapshot typed it as duty.
const home = read('client/src/pages/Home.tsx');
assert.match(home, /careStateForScheduleActivity/, 'Home/FlightDeck must consume the shared care semantic layer');
assert.match(home, /careStateForScheduleActivity\(event\) === 'NONE'/, 'nextFlight selector must skip care days and continue to the next real operation');
assert.match(home, /VC:\s*'Férias'/, 'Home must label VC as Férias');
assert.match(home, /DMO:\s*'Luto'/, 'Home must label DMO as Luto');
assert.match(home, /DR:\s*'Folga pedida'/, 'Home must not label DR as regulatory rest');

// Existing roster code and parser behavior remain authoritative; Care Mode adapts
// to their output instead of changing source parsing just to get a human label.
const rosterCodes = read('client/src/lib/rosterCodes.ts');
assert.match(rosterCodes, /code:\s*'DMO'[\s\S]*?description:\s*'Luto'/, 'DMO must remain mapped to Luto in the published code catalog');
const pdfParser = read('client/src/lib/pdfParser.ts');
assert.match(pdfParser, /rest\[1\] === 'OFF' \|\| rest\[1\] === 'VC'[\s\S]*?\? 'DO'/, 'regression must pin the real parser shape where VC may be type=DO');

// The canonical preparation chain must reproduce the care patch on fresh build
// workspaces. This prevents a green source-only test with a stale prepared bundle.
const preparation = read('scripts/v139/apply.mjs');
assert.match(preparation, /p0-691-care-context\/apply\.mjs/, 'full source preparation must include the Care Mode materializer');
const materializer = read('scripts/p0-691-care-context/apply.mjs');
assert.match(materializer, /publishedPairingTokens/, 'care materializer must preserve precise pairing evidence from coarse DO parser output');
assert.match(materializer, /careStateForScheduleActivity/, 'care materializer must patch the shared classification');
assert.match(materializer, /conciergeCareState/, 'care materializer must patch Concierge runtime');
assert.match(materializer, /buildBlankDaySummary/, 'care materializer must patch the human blank-day renderer');
assert.doesNotMatch(materializer, /server\/rosterParser|aimsParser|complianceEngine/, 'Care Mode must not patch parser/APZ/journey/compliance engines');

harness.cleanup();
console.log('OK regression-p0-691-care-context');
