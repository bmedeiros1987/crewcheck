import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const css = fs.existsSync('client/src/components/v14738/vacation.css')
  ? fs.readFileSync('client/src/components/v14738/vacation.css', 'utf8')
  : '';
const prepare = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');

const START = '/* CrewCheck P2 #738 — Vacation work-first START */';
const END = '/* CrewCheck P2 #738 — Vacation work-first END */';

assert.equal(home.split(START).length - 1, 1, 'prepared Home must contain exactly one #738 vacation block');
assert.equal(home.split(END).length - 1, 1, 'prepared Home must close exactly one #738 vacation block');

const start = home.indexOf(START);
const end = home.indexOf(END);
assert.ok(start >= 0 && end > start, 'vacation work-first block must be extractable');
const block = home.slice(start, end + END.length);

assert.match(block, /VACATION_PROGRESS_MODE_KEY_V14738[\s\S]*?'quiet'/, 'vacation progress mode must default to quiet');
assert.match(block, /VACATION_RETURN_LEAD_KEY_V14738[\s\S]*?'off'/, 'soft return must default to off');
assert.match(block, /displayMode === 'progress'[\s\S]*?cc-vacation-progress-v14738/, 'progress bar must render only under explicit progress mode');
assert.match(block, /Como você prefere acompanhar suas férias\?/, 'first vacation experience must ask the user how much countdown information they want');
assert.match(block, /Nenhuma contagem aparece sem sua escolha/, 'UI must explain that countdown is opt-in');
assert.match(block, /Retorno suave/, 'vacation preferences must expose optional soft return');
assert.doesNotMatch(block, /Voyage|roteiro turístico|restaurante|passeio/i, 'CrewCheck vacation slice must stay work-first and not become a travel planner');

assert.match(home, /const vacationContextV14738 = vacationContextForEventsV14738\(events, nowMs\);/, 'FlyDeck must derive active vacation from the loaded roster');
const vacationReturn = home.indexOf('if (vacationContextV14738) return <VacationModeCardV14738');
const emptyState = home.indexOf('if (!loaded || event.placeholder)', vacationReturn);
assert.ok(vacationReturn >= 0 && emptyState > vacationReturn, 'vacation mode must win before roster-empty/reimport semantics');

assert.match(home, /function Departure\(\{ event, events, setView \}/, 'Departure must receive roster context to recognize vacation');
const departureVacation = home.indexOf('if (vacationContextV14738 && !prepareVacationReturn)');
const departurePlaceholder = home.indexOf('if (event.placeholder)', departureVacation);
assert.ok(departureVacation >= 0 && departurePlaceholder > departureVacation, 'vacation state must win before "awaiting roster" in Departure');
assert.match(home, /<Departure event=\{event\} events=\{events\} setView=\{setView\}\/>/, 'Home router must provide Departure the current roster context');
assert.match(css, /cc-vacation-mode-v14738/, 'vacation UI must have isolated styling');
assert.doesNotMatch(css, /@keyframes/i, 'vacation UI must not introduce attention-seeking animation');
assert.match(prepare, /p2-738-vacation-work-first\/apply\.mjs/, 'canonical source preparation must reapply #738');

const source = ts.createSourceFile('prepared-home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = [
  'normalizeVacationCodeV14738',
  'publishedVacationCodeV14738',
  'isPublishedVacationDayV14738',
];
const declarations = new Map();
for (const node of source.statements) {
  if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text)) {
    declarations.set(node.name.text, node.getText(source));
  }
}
for (const name of names) assert.ok(declarations.has(name), 'missing prepared helper: ' + name);
const compiled = ts.transpileModule(names.map((name) => declarations.get(name)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
}).outputText;
const runtime = new vm.Script(compiled + '\n({ isPublishedVacationDayV14738 });')
  .runInNewContext({ String }, { timeout: 1000 });

const event = (type, pairingCode = '', rawText = '') => ({ day: { type, pairingCode, rawText } });
for (const sample of [
  event('VC'),
  event('FERIAS'),
  event('FÉRIAS'),
  event('DO', 'VC'),
  event('DO', 'FERIAS'),
  event('OTHER', 'VC'),
  event('', 'VC'),
]) {
  assert.equal(runtime.isPublishedVacationDayV14738(sample), true, JSON.stringify(sample) + ' must be published vacation evidence');
}
for (const sample of [
  event('ASB', 'VC'),
  event('HSB', 'FERIAS'),
  event('EAD', 'VC'),
  event('DO', 'ASB'),
  event('REST', 'VC'),
  event('', '', 'FÉRIAS'),
]) {
  assert.equal(runtime.isPublishedVacationDayV14738(sample), false, JSON.stringify(sample) + ' must not invent vacation');
}

console.log('PASS P2 #738 vacation work-first: opt-in countdown, formal vacation evidence, quiet Home/Departure');
