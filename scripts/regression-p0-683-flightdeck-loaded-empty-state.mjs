import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB } from './lib/ts-module-harness.mjs';

function assertUiContract(source, label) {
  assert.ok(source.includes("const vacationEvent = nextVacationRestV14353(events, nowMs);"), `${label}: FlightDeck must derive vacation/rest context from canonical rest events`);
  assert.ok(source.includes("loaded ? 'Ver escala' : 'Importar PDF'"), `${label}: loaded roster empty state must offer Ver escala instead of reimport`);
  assert.ok(!source.includes("loaded ? 'Reimportar escala' : 'Importar PDF'"), `${label}: loaded roster must not present Reimportar escala as primary CTA`);
  assert.ok(source.includes("onClick={() => loaded ? setView('roster') : onUpload()}"), `${label}: loaded roster CTA must navigate to roster; import only when nothing is loaded`);
  assert.ok(source.includes("vacationEvent ? 'Férias na escala' : 'Sem programação operacional futura'"), `${label}: vacation context must be explicit without pretending the roster is missing`);
  assert.ok(source.includes("event.canonical?.kind === 'rest'"), `${label}: vacation context must come from canonical rest events`);
  assert.ok(source.includes("pairingCode || event.day?.type"), `${label}: vacation detection must use published roster code evidence`);
  assert.ok(!source.includes("event.day?.pairingCode || event.day?.type || event.title"), `${label}: display-only title must never invent vacation state without published roster evidence`);
}

// Execute complete declarations from the actual consumer, not a copy of its
// selection algorithm. The two clock helpers come from the current Home source.
function loadVacationDetector(source, homeSource, label) {
  const declaration = (text, name) => {
    const ast = ts.createSourceFile(`${label}.tsx`, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const matches = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.equal(matches.length, 1, `${label}: expected one complete ${name} declaration`);
    return matches[0].getText(ast);
  };
  const functions = [
    declaration(homeSource, 'eventStartDateTime'),
    declaration(homeSource, 'eventEndDateTime'),
    declaration(source, 'nextVacationRestV14353'),
  ];
  const compiled = ts.transpileModule(`${functions.join('\n')}\nmodule.exports = nextVacationRestV14353;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = { module: { exports: {} }, Date };
  vm.runInNewContext(compiled, context, { timeout: 1000 });
  assert.equal(typeof context.module.exports, 'function', `${label}: consumer must be executable`);
  return context.module.exports;
}

function assertNearestRestContract(source, homeSource, label) {
  const detect = loadVacationDetector(source, homeSource, label);
  const nowMs = Date.parse('2099-10-14T12:00:00.000Z');
  // Explicitly synthetic consumer inputs, not a claimed real-source AIMS corpus.
  const rest = (code, start = '2099-10-15T00:00:00.000Z', end = '2099-10-15T23:59:00.000Z') => ({
    placeholder: false,
    canonical: { kind: 'rest', startDateTime: start, endDateTime: end },
    day: { type: code, pairingCode: code },
  });
  const laterVacation = rest('VC', '2099-10-16T00:00:00.000Z', '2099-10-16T23:59:00.000Z');
  let count = 0;
  const check = (name, input, expected) => {
    const before = JSON.stringify(input);
    assert.equal(detect(input, nowMs), expected, `${label}: ${name}`);
    assert.equal(JSON.stringify(input), before, `${label}: ${name} must not mutate input/order`);
    count += 1;
  };

  // A later vacation must not skip the first relevant canonical rest. NCF is
  // only checked as NOT a published vacation code; its meaning remains REVIEW.
  for (const code of ['DO', 'DOF', 'OFF', 'DR', 'DOP', 'REST', 'REPOUSO', 'DMO', 'NCF']) {
    const first = rest(code);
    check(`${code} before VC must not report later vacation`, [first, laterVacation], null);
    check(`unsorted VC after ${code} must not override chronology`, [laterVacation, first], null);
  }
  check('empty roster', [], null);
  for (const code of ['VC', 'FERIAS', 'FÉRIAS', 'VACATION', ' vc ']) {
    const first = rest(code);
    check(`${code} as first context remains vacation`, [first, rest('DO', '2099-10-17T00:00:00.000Z', '2099-10-17T23:59:00.000Z')], first);
  }
  const wrappedVacation = { ...rest('DO'), day: { type: 'DO', pairingCode: 'VC' } };
  check('published VC may specialize coarse DO', [wrappedVacation], wrappedVacation);
  const typeOnlyVacation = { ...rest('VC'), day: { type: 'VC' } };
  check('published type VC without pairing remains vacation', [typeOnlyVacation], typeOnlyVacation);
  check('ongoing DO precedes future vacation', [rest('DO', '2099-10-14T00:00:00.000Z'), laterVacation], null);
  const ongoingVacation = rest('VC', '2099-10-14T00:00:00.000Z');
  check('ongoing VC remains vacation', [ongoingVacation, rest('DO')], ongoingVacation);
  check('expired DO does not hide next vacation', [rest('DO', '2099-10-12T00:00:00.000Z', '2099-10-13T23:59:00.000Z'), laterVacation], laterVacation);
  check('placeholder rest is ignored', [{ ...rest('DO'), placeholder: true }, laterVacation], laterVacation);
  check('noncanonical rest cannot invent vacation', [{ ...rest('VC'), canonical: null }], null);
  check('operational event cannot supply vacation copy', [{ ...rest('VC'), canonical: { ...rest('VC').canonical, kind: 'flight' } }], null);
  check('display-only evidence cannot invent vacation', [{ ...rest(''), title: 'VC Férias', rawText: 'VC', flightNumber: 'FERIAS' }], null);
  check('partial code VCX is not vacation', [rest('VCX')], null);
  console.log(`PASS ${label}: ${count} executable nearest-rest/authority cases`);
}

const snippet = fs.readFileSync('scripts/v14353/flydeck-premium.snippet', 'utf8');
assertUiContract(snippet, 'authoritative snippet');
const homeSource = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
assertNearestRestContract(snippet, homeSource, 'authoritative snippet');

if (process.env.CHECK_PREPARED === '1') {
  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  assertUiContract(home, 'prepared Home.tsx');
  assertNearestRestContract(home, home, 'prepared Home.tsx');
}

// Runtime canonical proof: vacation is timeline/rest context, never an operational
// program, and it must not hide a later real operational event from the selector.
const harness = loadClientModules({
  prefix: 'crewcheck-p0-683-flightdeck-vacation-',
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  files: [
    'client/src/lib/rosterCodes.ts',
    'client/src/lib/actRules.ts',
    'client/src/lib/embeddedFormalDaysOff.ts',
    'client/src/lib/scheduleActivityClassification.ts',
    'client/src/lib/rosterContinuity.ts',
    'client/src/lib/canonicalRoster.ts',
  ],
});

const canonical = harness.load('canonicalRoster');
const { buildCanonicalRosterEvents, selectNextRosterEvent, isOperationalCanonicalEvent } = canonical;

const vacationDay = {
  date: '15/10/2099',
  dayNumber: 15,
  month: 10,
  year: 2099,
  dayOfWeek: 'synthetic',
  type: 'DO',
  pairingCode: 'VC',
  dutyReport: null,
  dutyDebrief: null,
  legs: [],
  dutyHours: null,
  flyingHours: 0,
  isNextDay: false,
  hotel: null,
  base: 'AAA',
  rawText: 'VC',
};

const flightDay = {
  date: '16/10/2099',
  dayNumber: 16,
  month: 10,
  year: 2099,
  dayOfWeek: 'synthetic',
  type: 'VOO',
  pairingCode: 'SYNTH683',
  dutyReport: '09:00',
  dutyDebrief: '12:30',
  legs: [{
    flightNumber: 'SYNTH683',
    origin: 'AAA',
    destination: 'BBB',
    departureTime: '10:00',
    arrivalTime: '12:00',
    presentationTime: '09:00',
    workType: 'OP',
  }],
  dutyHours: null,
  flyingHours: 2,
  isNextDay: false,
  hotel: null,
  base: 'AAA',
  rawText: 'SYNTH683 AAA BBB',
};

const roster = {
  crewName: 'Synthetic crew',
  crewId: 'synthetic-683',
  base: 'AAA',
  rank: 'CCM',
  month: 10,
  year: 2099,
  rawText: '',
  days: [vacationDay, flightDay],
};

const events = buildCanonicalRosterEvents(roster);
const vacation = events.find((event) => event.publishedDay?.pairingCode === 'VC');
assert.ok(vacation, 'VC must materialize in the canonical timeline');
assert.equal(vacation.kind, 'rest', 'VC must remain canonical rest');
assert.equal(isOperationalCanonicalEvent(vacation), false, 'VC/rest must never become an operational program');

const selectedDuringVacation = selectNextRosterEvent(events, new Date('2099-10-15T15:00:00.000Z'));
assert.ok(selectedDuringVacation, 'a later operational event after vacation must remain selectable');
assert.equal(selectedDuringVacation.kind, 'flight', 'selector must skip VC/rest and return the later flight');
assert.equal(selectedDuringVacation.flightNumber, 'SYNTH683', 'selector must return the actual later operational flight');

const restOnly = buildCanonicalRosterEvents({ ...roster, days: [vacationDay] });
assert.equal(selectNextRosterEvent(restOnly, new Date('2099-10-15T15:00:00.000Z')), null, 'vacation-only roster has no operational next event');

// Materialize the DO -> VC sequence with the real canonical builder too.
const precedingDayOff = { ...vacationDay, date: '14/10/2099', dayNumber: 14, pairingCode: 'DO', rawText: 'DO' };
const chronologicalRests = buildCanonicalRosterEvents({ ...roster, days: [precedingDayOff, vacationDay] });
assert.equal(selectNextRosterEvent(chronologicalRests, new Date('2099-10-14T15:00:00.000Z')), null, 'DO/VC remain non-operational');
const uiRests = chronologicalRests.map((event) => ({ canonical: event, day: event.publishedDay, placeholder: false }));
for (const [source, label] of [[snippet, 'source'], ...(process.env.CHECK_PREPARED === '1' ? [[homeSource, 'prepared']] : [])]) {
  const detect = loadVacationDetector(source, homeSource, label);
  assert.equal(detect(uiRests, Date.parse('2099-10-14T15:00:00.000Z')), null, `${label}: canonical DO before VC cannot be described as vacation`);
  const currentVacation = detect(uiRests, Date.parse('2099-10-15T15:00:00.000Z'));
  assert.ok(currentVacation, `${label}: VC becomes relevant after DO ends`);
  assert.equal(currentVacation.canonical.kind, 'rest', `${label}: vacation remains canonical rest`);
  assert.equal(currentVacation.day.pairingCode, 'VC', `${label}: vacation comes from the published code`);
}

console.log(`PASS p0-683 FlightDeck loaded empty-state + canonical vacation contract${process.env.CHECK_PREPARED === '1' ? ' (prepared)' : ' (source)'}`);
