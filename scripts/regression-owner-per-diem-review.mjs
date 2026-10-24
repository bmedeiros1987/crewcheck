import assert from 'node:assert/strict';
import { loadClientModules } from './lib/ts-module-harness.mjs';
const modules = loadClientModules({ files: ['client/src/lib/ownerPerDiemReview.ts', 'client/src/lib/financialStatementLearning.ts'] });
const old = { localStorage: globalThis.localStorage, window: globalThis.window };
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
globalThis.window = new EventTarget();
const login = id => { localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id, role: 'user' })); localStorage.setItem('crewcheck_auth_token', 'synthetic-' + id); };
try {
  const { ownerPerDiemReview } = modules.load('ownerPerDiemReview'), rates = modules.load('financialStatementLearning');
  login('synthetic-a');
  const input = { ownerId: 'synthetic-a', month: '2032-08', meal: '175,00', reference: 'Synthetic owner review', breakfastQuarter: true, taxiQuarter: true };
  const draft = ownerPerDiemReview(input), session = rates.financialRateSession();
  assert.equal(draft.length, 5); assert(draft.every(rate => !rate.confirmed));
  assert.equal(rates.saveConfirmedFinancialRates(draft, session), false, 'preparation cannot save an unconfirmed draft');
  const confirmed = draft.map(rate => ({ ...rate, confirmed: true }));
  assert.equal(rates.saveConfirmedFinancialRates(confirmed, session), true);
  for (const key of ['breakfast', 'taxi']) assert.equal(rates.confirmedRateValueAt('per_diem.' + key, '2032-08-06'), 43.75);
  assert.equal(rates.confirmedRateValueAt('per_diem.lunch', '2032-08-06'), 175);
  for (const date of ['2032-07-31', '2032-09-01']) assert.equal(rates.confirmedRateValueAt('per_diem.lunch', date), null);
  login('synthetic-b'); assert.equal(rates.confirmedRateValueAt('per_diem.taxi', '2032-08-06'), null);
  assert.equal(rates.saveConfirmedFinancialRates(confirmed, session), false, 'stale session cannot write another owner');
  assert.equal(rates.saveConfirmedFinancialRates(confirmed, rates.financialRateSession()), false, 'owner binding rejects copied review');
  const mealOnly = ownerPerDiemReview({ ...input, breakfastQuarter: false, taxiQuarter: false });
  assert.equal(mealOnly.length, 3, 'ratio never silently opts in breakfast or taxi');
  for (const change of [{ month: '2032-13' }, { meal: '-1,00' }, { meal: '175,001' }, { meal: '175,01' }, { reference: '' }, { ownerId: '' }]) assert.deepEqual(ownerPerDiemReview({ ...input, ...change }), []);
  assert.equal(ownerPerDiemReview({ ...input, month: '2032-02' })[0].effectiveTo, '2032-02-29');
  console.log('PASS owner per-diem review: explicit save, exact quarter, separate opt-ins, account/session isolation and bounded month');
} finally { modules.cleanup(); Object.assign(globalThis, old); }
