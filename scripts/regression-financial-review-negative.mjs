import assert from 'node:assert/strict';
import test from 'node:test';
import { queryFinancialHistory as query, reconcileFinancialAmounts as reconcile } from '../shared/financialReadModel.mjs';
import { loadClientModules } from './lib/ts-module-harness.mjs';
const identity = { authenticated: true, role: 'owner', ownerId: 'synthetic-A' };
const base = { id: 'synthetic-statement', ownerId: identity.ownerId, revision: 1,
  periodStart: '2032-04-07', periodEnd: '2032-04-13', currency: 'BRL',
  timezone: 'America/Sao_Paulo', amountMinor: 10000, category: 'allowance',
  aggregationLevel: 'week', status: 'statement_reported', sourceId: 'synthetic-document', paymentDate: '2032-04-15' };
const run = records => query({ identity, records, periodStart: '2032-04-01', periodEnd: '2032-04-30' });
test('invalid latest revision quarantines ID without resurrecting v1', () => {
  for (const invalid of [{ amountMinor: 100.5 }, { status: 'payment_confirmed' }, { revision: null }]) {
    const result = run([base, { ...base, revision: 2, ...invalid }]);
    assert.equal(result.state, 'incomplete');
    assert.equal(result.publishable, false);
    assert.equal(result.records.length, 0);
    assert.ok(result.rejected.length > 0);
  }
});
test('invalid latest confirmation cannot resurrect previous confirmed revision', () => {
  const confirmed = { ...base, status: 'payment_confirmed', evidence: { kind: 'settlement', reference: 'synthetic-receipt' } };
  assert.equal(run([confirmed, { ...confirmed, revision: 2, evidence: undefined }]).records.length, 0);
});
test('invalid distinct record and conflicts invalidate otherwise valid aggregate', () => {
  for (const rows of [
    [base, { ...base, id: 'invalid-other', amountMinor: 100.5 }],
    [base, { ...base, id: 'other', sourceId: 'synthetic-other' }, { ...base, id: 'other', sourceId: 'synthetic-other', amountMinor: 2 }],
  ]) {
    const result = run(rows);
    assert.equal(result.state, 'incomplete');
    assert.equal(result.publishable, false);
    assert.ok(result.totals.every(total => total.amountMinor === null));
  }
});
test('evidence participates in duplicate identity but is not exposed in DTO', () => {
  const a = { ...base, status: 'payment_confirmed', evidence: { kind: 'settlement', reference: 'synthetic-receipt-A' } };
  const b = { ...a, evidence: { kind: 'settlement', reference: 'synthetic-receipt-B' } };
  assert.equal(run([a, b]).conflicts, 1);
  assert.equal(run([a, b]).records.length, 0);
  assert.equal(run([a, a]).records[0].evidence, undefined);
});
test('reconciliation requires normalized strings for source/rule provenance', () => {
  const args = { calculatedMinor: 10000, reportedMinor: 10000, currency: 'BRL', sourceId: 'synthetic', ruleVersion: 'synthetic-v1' };
  for (const invalid of [{ sourceId: {} }, { ruleVersion: [] }, { sourceId: '   ' }, { ruleVersion: '\n ' }, { currency: ['BRL'] }]) {
    assert.equal(reconcile({ ...args, ...invalid }).state, 'not_calculable');
  }
  assert.equal(reconcile({ ...args, sourceId: ' synthetic ' }).sourceId, 'synthetic');
});
test('metadata arrays, wrong types and invalid collection never look complete', () => {
  for (const invalid of [{ sourceId: [] }, { ruleVersion: {} }, { paymentDate: 0 }, { currency: ['BRL'] }, { periodStart: ['2032-04-07'] }, { aggregationLevel: undefined }]) {
    const result = run([{ ...base, ...invalid }]);
    assert.equal(result.state, 'incomplete');
    assert.equal(result.publishable, false);
  }
  assert.equal(run(null).state, 'incomplete');
});
test('item/day/week representations are never summed together', () => {
  const item = { ...base, id: 'synthetic-item', aggregationLevel: 'item', amountMinor: 10000 };
  const day = { ...base, id: 'synthetic-day', aggregationLevel: 'day', amountMinor: 10000 };
  assert.equal(run([base, item, day]).totals[0].amountMinor, 10000);
  assert.equal(run([base, { ...base, id: 'same-document-other-week-total' }]).state, 'incomplete');
});
const modules = loadClientModules({ files: ['client/src/lib/financialStatementLearning.ts'], prefix: 'synthetic-finance-review-' });
try {
  const { learnPerDiemStatement } = modules.load('financialStatementLearning');
  test('every malformed declared total forces review and removes numeric total', () => {
    for (const value of ['825,001', '1.2.3,45', '-825,00', '825,00,', '825,00x', '999999999999999999999999,00']) {
      const parsed = learnPerDiemStatement('DEMONSTRATIVO DE DIARIAS\nDe 2032-04-07 até 2032-04-13\n'
        + 'Total depositado R$ 825,00\nTotal depositado R$ ' + value, 'synthetic.pdf');
      assert.deepEqual(parsed.totals, {}, value);
      assert.ok(parsed.warnings.some(warning => warning.includes('obrigatória')), value);
    }
  });
} finally { modules.cleanup(); }
