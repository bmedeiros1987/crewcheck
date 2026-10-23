import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadClientModules } from './lib/ts-module-harness.mjs';

// Entirely synthetic, arbitrary values. No PDF, account, tariff table or real data.
const modules = loadClientModules({ files: ['client/src/lib/financialStatementLearning.ts', 'client/src/lib/financialAmounts.ts'], prefix: 'synthetic-rate-precedence-' });
const previous = { localStorage: globalThis.localStorage, window: globalThis.window };
const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
globalThis.window = new EventTarget();
const login = id => { localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id, role: 'user' })); localStorage.setItem('crewcheck_auth_token', 'synthetic-' + id); };
try {
  const learning = modules.load('financialStatementLearning');
  const amounts = modules.load('financialAmounts');
  const source = (fingerprint, effectiveFrom, effectiveTo) => ({ currency: 'BRL', sourceDocument: fingerprint + '.pdf', sourceFingerprint: fingerprint, confidence: 'high', valueOrigin: 'printed', confirmed: true, effectiveFrom, effectiveTo });
  const tariffs = (fingerprint, from, to, [meal, breakfast, taxi]) => [
    { ...source(fingerprint, from, to), key: 'per_diem.lunch', label: 'Synthetic meal', unit: 'meal', value: meal },
    { ...source(fingerprint, from, to), key: 'per_diem.breakfast', label: 'Synthetic breakfast', unit: 'meal', value: breakfast },
    { ...source(fingerprint, from, to), key: 'per_diem.taxi', label: 'Synthetic taxi', unit: 'amount', value: taxi },
  ];
  const triple = date => ['per_diem.lunch', 'per_diem.breakfast', 'per_diem.taxi'].map(key => learning.confirmedRateValueAt(key, date));
  const store = rates => assert.equal(learning.saveConfirmedFinancialRates(learning.mergeConfirmedRates(learning.readConfirmedFinancialRates(), rates)), true);
  const A = tariffs('synthetic-monthly-A', '2032-02-01', '2032-02-29', [200, 50, 50]);
  const B = tariffs('synthetic-independent-B', '2032-02-07', '2032-02-09', [180, 45, 45]);

  // 1. Independent sources: an expired newer start never hides an older source still in force.
  login('owner-precedence');
  store([...A, ...B]);
  for (const [date, expected] of [['2032-01-31', [null, null, null]], ['2032-02-01', [200, 50, 50]], ['2032-02-06', [200, 50, 50]],
    ['2032-02-07', [180, 45, 45]], ['2032-02-09', [180, 45, 45]], ['2032-02-10', [200, 50, 50]], ['2032-02-29', [200, 50, 50]], ['2032-03-01', [null, null, null]]]) {
    assert.deepEqual(triple(date), expected, date);
  }
  // Pure helper, any input order.
  for (const order of [[...A, ...B], [...B, ...A], [...A, ...B].reverse()]) {
    const confirmed = order.map(item => ({ ...item, revision: 1 }));
    assert.equal(learning.rateAt(confirmed, 'per_diem.lunch', '2032-02-10')?.value, 200);
    assert.equal(learning.rateAt(confirmed, 'per_diem.lunch', '2032-02-08')?.value, 180);
  }
  console.log('PASS independent sources: expired newer B (07-09) falls back to A (01-29) on 10/02; inclusive boundaries; leap day');

  // 2. Same source shortened: its own older revision is never resurrected,
  //    while an independent source keeps its own vigência.
  login('owner-shortened-A');
  store([...A, ...B]);
  store(tariffs('synthetic-A-correction', '2032-02-01', '2032-02-20', [210, 55, 55]));
  assert.deepEqual(triple('2032-02-20'), [210, 55, 55]);
  assert.deepEqual(triple('2032-02-21'), [null, null, null], 'shortened A must not resume its superseded revision');
  assert.deepEqual(triple('2032-02-08'), [180, 45, 45], 'independent B keeps its own window');
  assert.deepEqual(triple('2032-02-10'), [210, 55, 55], 'after B expires, the current A revision applies');

  login('owner-shortened-B');
  store([...A, ...B]);
  store(tariffs('synthetic-B-correction', '2032-02-07', '2032-02-07', [170, 40, 40]));
  assert.deepEqual(triple('2032-02-07'), [170, 40, 40]);
  assert.deepEqual(triple('2032-02-08'), [200, 50, 50], 'shortened B never resumes its superseded revision; independent A applies');
  assert.equal(learning.readConfirmedFinancialRates().length, 9, 'audit history retained');

  // Same source shortened with no independent source: still no resurrection.
  login('owner-only-A');
  store(A);
  store(tariffs('synthetic-A-correction', '2032-02-01', '2032-02-20', [210, 55, 55]));
  assert.deepEqual(triple('2032-02-21'), [null, null, null]);
  console.log('PASS same-source shortened corrections never resurrect superseded revisions; independent sources unaffected');

  // 2b. Same start, distinct fingerprints: the stored model cannot tell an independent
  //     document from a correction (no source identity). Keep the legacy revision rule:
  //     the latest confirmation governs and an earlier one never resumes — no tariff is
  //     picked by fingerprint, and nothing falls through inside the same scope.
  login('owner-same-start');
  store(A);
  const C = tariffs('synthetic-same-start-C', '2032-02-01', '2032-02-09', [190, 48, 48]);
  store(C);
  assert.deepEqual(learning.readConfirmedFinancialRates().filter(item => item.sourceFingerprint === 'synthetic-same-start-C').map(item => item.revision), [2, 2, 2], 'legacy merge stores C as revision 2 of the same scope');
  assert.deepEqual(triple('2032-02-05'), [190, 48, 48], 'latest confirmation governs the shared scope');
  assert.deepEqual(triple('2032-02-10'), [null, null, null], 'conservative: A (earlier revision of the same scope) is not resumed after C ends');
  login('owner-same-start-reversed');
  store(C);
  store(A);
  assert.deepEqual(triple('2032-02-05'), [200, 50, 50], 'order of confirmation decides, exactly as before this change');
  assert.deepEqual(triple('2032-02-10'), [200, 50, 50]);
  // With an independent later start in the mix, only the shared scope's latest revision competes.
  login('owner-same-start-plus-B');
  store([...A, ...B]);
  store(C);
  assert.deepEqual(triple('2032-02-08'), [180, 45, 45]);
  assert.deepEqual(triple('2032-02-10'), [null, null, null], 'B expired; shared scope is C (ended 09/02); A not resumed');
  console.log('PASS same start, distinct fingerprints: legacy revision rule kept (latest governs, earlier never resumes); ambiguity left conservative');

  // 3. Owner isolation: another account never reads these tariffs; no owner reads nothing.
  login('owner-other');
  assert.deepEqual(triple('2032-02-10'), [null, null, null]);
  localStorage.removeItem('crewcheck_auth_user');
  assert.deepEqual(triple('2032-02-10'), [null, null, null]);
  localStorage.setItem('crewcheck_financial_learned_rates_v1', JSON.stringify([...A, ...B]));
  login('owner-legacy');
  assert.deepEqual(triple('2032-02-10'), [null, null, null], 'legacy ownerless archive is never adopted');
  console.log('PASS owner isolation: other/no/legacy owner reads no tariff');

  // 4. Actual caller: Home perDiemConfig on 10/02 uses A, not the ACT fallback.
  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  const ast = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'perDiemConfig');
  assert(fn, 'extract actual perDiemConfig');
  const context = vm.createContext({ ...amounts, confirmedRateAt: learning.confirmedRateAt, confirmedRateValueAt: learning.confirmedRateValueAt,
    resolveActFinancialRules: () => ({ profileLabel: 'Synthetic rules, not a real tariff', legalReference: 'synthetic-v1', breakfastPercent: 0.25,
      perDiem: [{ key: 'domestic', label: 'Synthetic domestic', currency: 'BRL', mainMeal: 100 }] }),
    readOptionalNumberSetting: () => null, readNumberSetting: () => 0, loadAirportPerDiemOverrides: () => ({}) });
  vm.runInContext(ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  login('owner-precedence');
  const config = date => { const c = context.perDiemConfig({}, date); return [c.rates.domestic.mainMeal, c.domesticBreakfast, c.taxiRate]; };
  assert.deepEqual(config('2032-02-10'), [200, 50, 50], 'A still in force on 10/02, not ACT 100/25/null');
  assert.deepEqual(config('2032-02-08'), [180, 45, 45]);
  assert.deepEqual(config('2032-03-01'), [100, 25, null], 'ACT reference only where no source is in force');
  login('owner-other');
  assert.deepEqual(config('2032-02-10'), [100, 25, null], 'other owner gets ACT reference only');
  console.log(`PASS actual perDiemConfig caller: 10/02 uses A 200/50/50, B inside 07-09, ACT outside; TZ=${process.env.TZ || 'default'}`);
} finally {
  modules.cleanup();
  globalThis.localStorage = previous.localStorage;
  globalThis.window = previous.window;
}
