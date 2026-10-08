import assert from 'node:assert/strict';
import { queryFinancialHistory as query, financialStatusLabel, reconcileFinancialAmounts as reconcile } from '../shared/financialReadModel.mjs';
const identity = { authenticated: true, role: 'owner', ownerId: 'synthetic-A' };
const base = { id: 'statement-1', ownerId: 'synthetic-A', revision: 1,
  periodStart: '2032-04-07', periodEnd: '2032-04-13', currency: 'BRL',
  timezone: 'America/Sao_Paulo', amountMinor: 82500, category: 'allowance',
  aggregationLevel: 'week', status: 'statement_reported', sourceId: 'synthetic-document-1', paymentDate: '2032-04-15' };
const run = (records, changes = {}) => query({ identity, records,
  periodStart: '2032-04-01', periodEnd: '2032-04-30', ...changes });
assert.equal(run([base]).totals[0].amountMinor, 82500);
assert.equal(run([base, base]).totals[0].amountMinor, 82500); // repeated footer/pages
assert.equal(run([base, { ...base, revision: 2, amountMinor: 83000 }]).totals[0].amountMinor, 83000);
assert.equal(run([base, { ...base, revision: 2, amountMinor: 83000 }]).history.length, 2);
assert.equal(run([base, { ...base, amountMinor: 83000 }]).state, 'incomplete'); // ambiguous same revision
assert.equal(run([{ ...base, ownerId: 'synthetic-B' }]).state, 'no_data');
for (const who of [null, {}, { ...identity, authenticated: false }, { ...identity, role: 'visitor' }]) {
  assert.deepEqual(run([base], { identity: who }), { access: 'denied', records: [], history: [], totals: [] });
}
assert.equal(run([]).totals.length, 0);
assert.equal(run([null, undefined, [], 42]).state, 'incomplete');
assert.equal(run([base], { identity: { ...identity, authenticated: 'false' } }).access, 'denied');
assert.equal(run([{ ...base, amountMinor: null }]).totals[0].amountMinor, null);
assert.equal(run([{ ...base, amountMinor: NaN }]).state, 'incomplete');
assert.equal(run([{ ...base, amountMinor: 1.25 }]).state, 'incomplete');
assert.equal(run([base], { periodStart: '2032-02-30' }).state, 'invalid_period');
assert.equal(run([base], { periodStart: '2032-04-08' }).state, 'no_data');
assert.equal(run([base], { periodEnd: '2032-03-31' }).state, 'invalid_period');
assert.equal(run([{ ...base, timezone: 'invalid' }]).state, 'incomplete');
assert.equal(run([{ ...base, status: 'payment_confirmed' }]).state, 'incomplete');
assert.equal(run([{ ...base, status: 'forecast' }]).state, 'incomplete');
assert.equal(run([{ ...base, status: 'forecast', ruleVersion: 'synthetic-v1', paymentDate: '2001-01-01' }]).records[0].status, 'forecast');
assert.equal(run([{ ...base, status: 'payment_confirmed', evidence: { kind: 'settlement', reference: 'synthetic-settlement' } }]).records[0].status, 'payment_confirmed');
assert.equal(run([{ ...base, id: 'other', currency: 'USD' }, base]).totals.length, 2);
assert.equal(run([{ ...base, id: 'advance', category: 'advance', amountMinor: 20000 }, base]).totals.length, 2);
assert.equal(run([{ ...base, id: 'estimate', status: 'forecast', ruleVersion: 'synthetic-v1' }, base]).totals.length, 2);
assert.equal(run([{ ...base, id: 'night-item-1', aggregationLevel: 'item' }, { ...base, id: 'night-item-2', aggregationLevel: 'item' }], { aggregationLevel: 'item' }).records.length, 2);
assert.equal(run([{ ...base, periodStart: '2032-03-31' }]).records.length, 0);
assert.equal(run([{ ...base, secret: 'never expose', rawText: 'never expose' }]).records[0].secret, undefined);
assert.match(financialStatusLabel('statement_reported'), /sem confirmação bancária/);
assert.match(financialStatusLabel('forecast'), /não confirma/);
assert.equal(reconcile({ calculatedMinor: 82500, reportedMinor: 82500, currency: 'BRL', sourceId: 'synthetic', ruleVersion: 'synthetic-v1' }).state, 'matched');
assert.equal(reconcile({ calculatedMinor: 82501, reportedMinor: 82500, currency: 'BRL', sourceId: 'synthetic', ruleVersion: 'synthetic-v1' }).differenceMinor, 1);
assert.equal(reconcile({ calculatedMinor: null, reportedMinor: 82500, currency: 'BRL', sourceId: 'synthetic', ruleVersion: 'synthetic-v1' }).state, 'not_calculable');
assert.equal(reconcile({ calculatedMinor: 1, reportedMinor: 1, currency: 'BRL' }).state, 'not_calculable');
console.log('PASS financial read model: isolation, periods, revisions, dedup, missing data, statuses, currencies, reconciliation');
