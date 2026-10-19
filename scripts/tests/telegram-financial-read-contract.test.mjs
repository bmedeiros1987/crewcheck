import test from 'node:test';
import assert from 'node:assert/strict';
import { createFinancialLedgerHandler, FINANCIAL_UPCOMING_PATH, FINANCIAL_LEDGER_PATH } from '../../server/financial-ledger-route.mjs';
import { currencyMinorDigits, formatFinancialMinor } from '../../shared/financialMoney.mjs';

// Characterization of the published read contract, not a Telegram integration,
// forecast calculator, new identity authority or assertion of production enablement.
const A = { authenticated: true, role: 'owner', ownerId: 'contract-a@example.invalid' };
const B = { authenticated: true, role: 'owner', ownerId: 'contract-b@example.invalid' };
const now = new Date('2032-12-20T12:00:00Z');
const record = (id, extra = {}) => ({ id: id.toString(16).padStart(64, '0'), ownerId: A.ownerId, revision: 1,
  category: 'allowance', aggregationLevel: 'item', periodStart: '2032-12-01', periodEnd: '2032-12-01',
  sourceId: `synthetic-source-${id}`, timezone: 'UTC', ruleVersion: 'synthetic-reviewed-rule',
  currency: 'BRL', amountMinor: 12345, status: 'forecast', expectedPaymentDate: '2032-12-21', expectedPaymentTimezone: 'UTC', ...extra });
const foreign = (id, currency, amountMinor) => record(id, { currency, amountMinor, flightDate: '2032-12-21', flightDateTimezone: 'UTC', flightAirport: 'EZE', timingRuleId: 'synthetic-owner-rule' });
function fixture({ identity = A, records = [], enabled = true, storeError = null } = {}) {
  const calls = { pools: 0, owners: [], writes: 0 };
  const handler = createFinancialLedgerHandler({ enabled: () => enabled, identityProvider: async () => identity, now: () => now,
    poolProvider: async () => { calls.pools++; return {}; }, storeFactory: () => ({
      list: async owner => { calls.owners.push(owner); if (storeError) throw storeError; return structuredClone(records); },
      append: () => { calls.writes++; throw Error('writes forbidden in read-contract test'); },
    }) });
  return { calls, async request(path = FINANCIAL_UPCOMING_PATH, method = 'GET') {
    let status, body, headers;
    const res = { setHeader() {}, writeHead(code, value) { status = code; headers = value; }, end(value) { body = JSON.parse(value); } };
    assert.equal(await handler({ method, headers: {} }, res, new URL('https://contract.invalid' + path)), true);
    return { status, body, headers };
  } };
}

test('published upcoming reader is owner-only, no-store and read-only', async () => {
  const f = fixture({ records: [record(1), record(2, { ownerId: B.ownerId, amountMinor: 987654321 })] });
  const result = await f.request(); assert.equal(result.status, 200);
  assert.equal(result.body.ownerId, A.ownerId); assert.equal(result.body.source, 'persisted_financial_ledger');
  assert.equal(result.body.events.length, 1); assert(!JSON.stringify(result.body).includes('987654321'));
  assert.deepEqual(f.calls.owners, [A.ownerId]); assert.equal(f.calls.writes, 0);
  assert.equal(result.headers['cache-control'], 'no-store');
});
for (const identity of [null, { authenticated: false }, { ...A, role: 'visitor' }, { ...A, ownerId: '' }]) test(`invalid host identity ${JSON.stringify(identity)} never opens storage`, async () => {
  const f = fixture({ identity, records: [record(1)] }), result = await f.request();
  assert.equal(result.status, 403); assert.equal(f.calls.pools, 0); assert.equal(f.calls.writes, 0);
});
test('same store cannot select another owner by request input', async () => {
  const f = fixture({ records: [record(1)] });
  assert.equal((await f.request(FINANCIAL_UPCOMING_PATH + '?ownerId=' + encodeURIComponent(B.ownerId))).status, 400);
  assert.equal(f.calls.pools, 0);
  const other = fixture({ identity: B, records: [record(1)] });
  const result = await other.request(); assert.equal(result.body.state, 'no_data'); assert.deepEqual(other.calls.owners, [B.ownerId]);
});
test('default operational gate returns unavailable, never a pernoite fallback or zero', async () => {
  const f = fixture({ enabled: false, records: [record(1)] }), result = await f.request();
  assert.equal(result.status, 503); assert.equal(result.body.state, 'unavailable');
  assert.equal(result.body.code, 'FINANCIAL_LEDGER_NOT_ENABLED'); assert.equal(f.calls.pools, 0);
  assert(!Object.hasOwn(result.body, 'events')); assert(!Object.hasOwn(result.body, 'amountMinor'));
});
test('missing schema is unavailable and does not expose private database errors', async () => {
  const f = fixture({ storeError: Object.assign(new Error('private synthetic DB detail'), { code: 'ER_NO_SUCH_TABLE' }) });
  const result = await f.request(); assert.equal(result.status, 503); assert.equal(result.body.code, 'FINANCIAL_MIGRATION_REQUIRED');
  assert(!JSON.stringify(result.body).includes('private synthetic')); assert.equal(f.calls.writes, 0);
});
test('empty available ledger is no_data, not a financial zero', async () => {
  const result = await fixture().request(); assert.equal(result.body.state, 'no_data'); assert.deepEqual(result.body.events, []);
  assert(!Object.hasOwn(result.body, 'amountMinor')); assert.equal(result.body.hasMore, false);
});
for (const [currency, amountMinor, digits] of [['BRL', 12345, 2], ['USD', 12345, 2], ['JPY', 123, 0], ['KWD', 1234, 3]]) test(`${currency} preserves original minor units and precision without FX`, async () => {
  const item = currency === 'BRL' ? record(1, { amountMinor }) : foreign(1, currency, amountMinor);
  const result = await fixture({ records: [item] }).request();
  assert.equal(result.body.events[0].currency, currency); assert.equal(result.body.events[0].amountMinor, amountMinor);
  assert.equal(currencyMinorDigits(currency), digits); assert.equal(typeof formatFinancialMinor(amountMinor, currency), 'string');
  assert(!Object.hasOwn(result.body.events[0], 'convertedAmount'));
});
test('explicit zero and unknown amount remain distinct', async () => {
  const known = (await fixture({ records: [record(1, { amountMinor: 0 })] }).request()).body;
  const unknown = (await fixture({ records: [record(1, { amountMinor: null })] }).request()).body;
  assert.equal(known.state, 'available'); assert.equal(known.events[0].amountMinor, 0);
  assert.equal(unknown.state, 'incomplete'); assert.equal(unknown.events[0].amountMinor, null);
});
test('upcoming horizon is payment date, not work competence', async () => {
  const item = record(1, { periodStart: '2032-11-01', periodEnd: '2032-11-01' });
  const f = fixture({ records: [item] }); assert.equal((await f.request()).body.events.length, 1);
  const history = (await f.request(FINANCIAL_LEDGER_PATH + '?periodStart=2032-11-01&periodEnd=2032-11-30&aggregationLevel=item')).body;
  assert.equal(history.records[0].periodStart, '2032-11-01'); assert.equal(history.records[0].expectedPaymentDate, '2032-12-21');
  const december = (await f.request(FINANCIAL_LEDGER_PATH + '?periodStart=2032-12-01&periodEnd=2032-12-31&aggregationLevel=item')).body;
  assert.equal(december.state, 'no_data');
});
test('nonempty ledger with payment beyond 30 days is scoped no_data, not no allowances', async () => {
  const item = record(1, { expectedPaymentDate: '2033-01-19' }); // Day31 from2032-12-20; outside the inclusive30-day horizon.
  const f = fixture({ records: [item] });
  const upcoming = (await f.request()).body;
  assert.equal(upcoming.state, 'no_data'); assert.deepEqual(upcoming.events, []); assert.equal(upcoming.hasMore, false);
  const history = (await f.request(FINANCIAL_LEDGER_PATH + '?periodStart=2032-12-01&periodEnd=2032-12-31&aggregationLevel=item')).body;
  assert.equal(history.state, 'available'); assert.equal(history.records.length, 1);
  assert.equal(history.records[0].category, 'allowance'); assert.equal(history.records[0].expectedPaymentDate, '2033-01-19');
  assert.equal(history.records[0].amountMinor, item.amountMinor); assert.equal(f.calls.writes, 0);
  const boundary = (await fixture({ records: [record(1, { expectedPaymentDate: '2033-01-18' })] }).request()).body;
  assert.equal(boundary.state, 'available'); assert.equal(boundary.events.length, 1, 'last included day retains the existing allowance');
});
test('compact upcoming DTO lacks work period, snapshot revision/update and per-event provenance', async () => {
  const result = (await fixture({ records: [record(1)] }).request()).body;
  assert.deepEqual(Object.keys(result.events[0]).sort(), ['id', 'category', 'expectedPaymentDate', 'expectedPaymentTimezone', 'amountMinor', 'currency', 'status'].sort());
  for (const key of ['periodStart', 'periodEnd', 'revision', 'updatedAt', 'ruleVersion', 'sourceId', 'provenance']) assert(!Object.hasOwn(result.events[0], key));
  assert.equal(result.source, 'persisted_financial_ledger');
});
test('missing payment date stays incomplete; it must not be invented from competence', async () => {
  const result = (await fixture({ records: [record(1, { expectedPaymentDate: undefined })] }).request()).body;
  assert.equal(result.state, 'incomplete'); assert.deepEqual(result.events, []);
});
test('foreign allowance without reviewed flight/date policy stays incomplete', async () => {
  const result = (await fixture({ records: [record(1, { currency: 'USD' })] }).request()).body;
  assert.equal(result.state, 'incomplete'); assert.deepEqual(result.events, []);
});
test('latest revision supersedes earlier amount and never confirms receipt', async () => {
  const result = (await fixture({ records: [record(1), record(1, { revision: 2, amountMinor: 54321 })] }).request()).body;
  assert.equal(result.events.length, 1); assert.equal(result.events[0].amountMinor, 54321); assert.equal(result.events[0].status, 'forecast');
});
test('latest statement or settlement is not presented as another upcoming forecast', async () => {
  for (const status of ['statement_reported', 'payment_confirmed']) {
    const next = record(1, { revision: 2, status, ...(status === 'payment_confirmed' ? { paymentDate: '2032-12-20', evidence: { kind: 'settlement', reference: 'synthetic-only' } } : {}) });
    const result = (await fixture({ records: [record(1), next] }).request()).body;
    assert.equal(result.events.length, 0);
  }
});
test('mixed-category cap cannot prove that no allowance exists after local filtering', async () => {
  const monthly = { aggregationLevel: 'month', periodStart: '2032-12-01', periodEnd: '2032-12-31', amountBasis: 'net_credit' };
  const payroll = record(1, { ...monthly, category: 'payroll', operationalMonth: '2032-10', payrollMonth: '2032-11', rateMonth: '2032-11', expectedCreditMonth: '2032-12' });
  const vacation = record(2, { ...monthly, category: 'vacation', expectedPaymentDate: '2032-12-22' });
  const advance = record(3, { category: 'advance', expectedPaymentDate: '2032-12-23' });
  const allowance = record(4, { expectedPaymentDate: '2032-12-24' });
  const result = (await fixture({ records: [payroll, vacation, advance, allowance] }).request()).body;
  assert.equal(result.events.length, 3); assert.equal(result.hasMore, true);
  assert.equal(result.events.filter(item => item.category === 'allowance').length, 0);
  assert.equal((await fixture({ records: [allowance] }).request()).body.events[0].category, 'allowance');
});
test('upcoming query rejects invented category/competence selectors and all writes', async () => {
  for (const query of ['?category=allowance', '?periodStart=2032-12-01', '?ownerId=other']) assert.equal((await fixture().request(FINANCIAL_UPCOMING_PATH + query)).status, 400);
  for (const method of ['POST', 'PATCH', 'DELETE']) { const f = fixture(); assert.equal((await f.request(FINANCIAL_UPCOMING_PATH, method)).status, 405); assert.equal(f.calls.writes, 0); assert.equal(f.calls.pools, 0); }
});
