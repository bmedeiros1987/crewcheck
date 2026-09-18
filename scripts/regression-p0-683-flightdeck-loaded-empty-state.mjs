import fs from 'node:fs';
import assert from 'node:assert/strict';
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

const snippet = fs.readFileSync('scripts/v14353/flydeck-premium.snippet', 'utf8');
assertUiContract(snippet, 'authoritative snippet');

if (process.env.CHECK_PREPARED === '1') {
  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  assertUiContract(home, 'prepared Home.tsx');
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

console.log(`PASS p0-683 FlightDeck loaded empty-state + canonical vacation contract${process.env.CHECK_PREPARED === '1' ? ' (prepared)' : ' (source)'}`);
