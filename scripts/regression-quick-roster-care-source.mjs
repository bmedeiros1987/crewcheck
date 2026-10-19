import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { loadClientModules } from './lib/ts-module-harness.mjs';

const path = 'client/src/lib/scheduleActivityClassification.ts';
const source = ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['ScheduleCareState','ScheduleCarePresentation','GRIEF_CODES','VACATION_CODES','resolveCareState','publishedPairingTokens','careStateForScheduleActivity','carePresentationForScheduleActivity'];
const printer = ts.createPrinter({ removeComments: true });
const contract = source.statements.filter(node => names.includes(node.name?.text)
  || (ts.isVariableStatement(node) && node.declarationList.declarations.some(entry => names.includes(entry.name.getText(source)))))
  .map(node => printer.printNode(ts.EmitHint.Unspecified, node, source));
assert.equal(contract.length, names.length, 'All shared Care contract declarations exist before preparation');
const harness = loadClientModules({ files: [path] });
const classification = harness.load('scheduleActivityClassification');
const cases = [
  [{ canonical: { code: 'DMO' } }, 'Luto'],
  [{ canonical: { code: 'VC' } }, 'Férias'],
  [{ canonical: { code: 'DO', publishedDay: { pairingCode: 'VC' } } }, 'Férias'],
  [{ canonical: { code: 'FOLGA', publishedDay: { pairingCode: 'VC' } } }, 'Folga'],
  [{ canonical: { code: 'ASB', kind: 'reserve', publishedDay: { pairingCode: 'VC' } } }, null],
  [{ title: 'Férias', flightNumber: 'DMO' }, null],
  [{ canonical: { code: 'OFF' } }, 'Folga'],
  [{ canonical: { code: 'REST' } }, 'Repouso'],
  [{ placeholder: true, canonical: { code: 'DMO' } }, null],
];
const results = cases.map(([event, expected]) => {
  const before = JSON.stringify(event);
  const actual = classification.carePresentationForScheduleActivity(event);
  assert.equal(actual?.label ?? null, expected);
  assert.equal(JSON.stringify(event), before, 'Presentation never mutates canonical input');
  if (actual) assert.equal(actual.allowCriticalAlerts, true);
  return actual;
});
const snapshot = { contract, results };
if (process.argv.includes('--record')) fs.writeFileSync(process.argv[process.argv.indexOf('--record') + 1], JSON.stringify(snapshot));
if (process.argv.includes('--compare')) assert.deepEqual(snapshot, JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--compare') + 1], 'utf8')), 'Raw and prepared Care contract and results remain identical');
console.log('PASS raw/prepared shared Care contract: nine formal-authority, sensitive-label, alert and immutability cases');
