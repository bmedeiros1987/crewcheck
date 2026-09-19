import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB } from './lib/ts-module-harness.mjs';

if (process.env.CHECK_PREPARED !== '1') {
  throw new Error('This combined Care/FlightDeck regression must run against prepared source.');
}

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');

const declaration = (text, name) => {
  const ast = ts.createSourceFile('prepared-home.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(matches.length, 1, `prepared Home.tsx must expose exactly one ${name} declaration`);
  return matches[0].getText(ast);
};

const harness = loadClientModules({
  prefix: 'crewcheck-p0-683-care-flightdeck-',
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

const classification = harness.load('scheduleActivityClassification');
const canonical = harness.load('canonicalRoster');
const { carePresentationForScheduleActivity } = classification;
const { buildCanonicalRosterEvents, selectNextRosterEvent } = canonical;

assert.equal(typeof carePresentationForScheduleActivity, 'function', 'prepared Care predecessor must export the shared presentation authority');

const dmoDay = {
  date: '15/10/2099',
  dayNumber: 15,
  month: 10,
  year: 2099,
  dayOfWeek: 'synthetic',
  type: 'DMO',
  pairingCode: 'VC',
  dutyReport: null,
  dutyDebrief: null,
  legs: [],
  dutyHours: null,
  flyingHours: 0,
  isNextDay: false,
  hotel: null,
  base: 'AAA',
  rawText: 'display text must not override formal DMO',
};

const roster = {
  crewName: 'Synthetic crew',
  crewId: 'synthetic-care-683',
  base: 'AAA',
  rank: 'CCM',
  month: 10,
  year: 2099,
  rawText: '',
  days: [dmoDay],
};

const events = buildCanonicalRosterEvents(roster);
assert.equal(events.length, 1, 'DMO-only roster must remain represented in the canonical timeline');
// DMO may retain a canonical duty-shaped event. Its non-operational authority
// comes from the shared Care classification and the canonical next selector.
assert.equal(selectNextRosterEvent(events, new Date('2099-10-15T15:00:00.000Z')), null, 'DMO-only roster has no next operational event');

const uiEvents = events.map((event) => ({ canonical: event, day: event.publishedDay, placeholder: false }));
const sharedPresentation = carePresentationForScheduleActivity(uiEvents[0]);
assert.ok(sharedPresentation, 'shared Care authority must recognize the current DMO context');
assert.equal(sharedPresentation.state, 'LUTO', 'formal DMO must outrank residual VC and remain LUTO');
assert.equal(sharedPresentation.label, 'Luto', 'shared presentation must expose the humane Luto label');

const helperSource = [
  declaration(home, 'eventStartDateTime'),
  declaration(home, 'eventEndDateTime'),
  declaration(home, 'nextCareRestV14353'),
].join('\n');
const compiled = ts.transpileModule(`${helperSource}\nmodule.exports = nextCareRestV14353;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const context = {
  module: { exports: {} },
  Date,
  carePresentationForScheduleActivity,
};
vm.runInNewContext(compiled, context, { timeout: 1000 });
const nextCareRestV14353 = context.module.exports;
assert.equal(typeof nextCareRestV14353, 'function', 'prepared FlightDeck must expose executable shared-Care rest context selection');

const careContext = nextCareRestV14353(uiEvents, Date.parse('2099-10-15T15:00:00.000Z'));
assert.ok(careContext, 'DMO-only loaded roster must retain a Care context even without future operation');
assert.equal(careContext.presentation.state, 'LUTO', 'FlightDeck must consume shared Care authority instead of vacation-only inference');
assert.equal(careContext.presentation.label, 'Luto', 'FlightDeck must preserve the shared humane label');

assert.ok(home.includes('const careContext = nextCareRestV14353(events, nowMs);'), 'FlightDeck must derive the loaded empty-state from shared Care context');
assert.ok(home.includes("careContext ? `${careContext.presentation.label} na escala` : 'Sem programação operacional futura'"), 'loaded Care empty-state must display the shared Care label');
assert.ok(home.includes('careContext.presentation.message'), 'loaded Care empty-state must use the shared Care message');
assert.ok(home.includes("loaded ? 'Ver escala' : 'Importar PDF'"), 'loaded roster must keep Ver escala as the primary CTA');
assert.ok(!home.includes("loaded ? 'Reimportar escala' : 'Importar PDF'"), 'Care integration must not reintroduce reimport semantics');

console.log('PASS p0-683 combined Care/FlightDeck DMO empty-state integration (prepared)');
