import assert from 'node:assert/strict';
import { queryUpcomingFinancialForecast as query } from '../shared/financialUpcoming.mjs';
import { createFinancialLedgerHandler, FINANCIAL_UPCOMING_PATH } from '../server/financial-ledger-route.mjs';
const identity = { authenticated: true, role: 'owner', ownerId: 'a@example.invalid' };
const now = new Date('2032-12-20T12:00:00Z');
const record = (id, fields = {}) => ({ id: id.toString(16).padStart(64, '0'), ownerId: identity.ownerId,
  revision: 1, category: 'allowance', aggregationLevel: 'item', periodStart: '2032-12-01', periodEnd: '2032-12-01',
  sourceId: 'synthetic-' + id, timezone: 'UTC', ruleVersion: 'reviewed-synthetic', currency: 'USD', amountMinor: 12345,
  status: 'forecast', expectedPaymentDate: '2032-12-21', expectedPaymentTimezone: 'UTC', ...fields,
  ...((fields.currency || 'USD') !== 'BRL' && (fields.category || 'allowance') === 'allowance' ? {
    flightDate: fields.expectedPaymentDate === undefined && !Object.hasOwn(fields,'expectedPaymentDate') ? '2032-12-21' : fields.expectedPaymentDate,
    flightDateTimezone: fields.expectedPaymentTimezone || 'UTC', flightAirport: 'EZE', timingRuleId: 'synthetic-owner-rule',
  } : {}) });
const read = records => query({ identity, records, now });
assert.equal(query({ identity: { authenticated: false }, records: [record(1)], now }).access, 'denied');
assert.equal(read([]).state, 'no_data');
assert.equal(read([record(8, { expectedPaymentDate: '2031-12-21', amountMinor: null }), record(9)]).state, 'available', 'past missing amount does not taint upcoming records');
assert.equal(read([record(8, { expectedPaymentDate: '2031-12-21', amountMinor: null })]).state, 'no_data', 'past incomplete event does not make an empty horizon incomplete');
assert.equal(read([record(8, { expectedPaymentDate: '2033-02-21', amountMinor: null }), record(9)]).state, 'available', 'later missing amount is outside this horizon');
assert.equal(read([record(8, { expectedPaymentDate: '2031-12-21', amountMinor: 'invalid' }), record(9)]).state, 'available', 'rejected historical record is scoped outside horizon');
let result = read([record(1), record(2, { ownerId: 'b@example.invalid', amountMinor: 999999 })]);
assert.equal(result.events.length, 1); assert(!JSON.stringify(result).includes('999999'));
assert.equal(result.events[0].sourceId, record(1).sourceId); assert.equal(result.events[0].revision, 1); assert(!JSON.stringify(result).includes('history'));
const multi = [record(1), record(2, { currency: 'JPY', amountMinor: 500, expectedPaymentDate: '2032-12-22' }),
  record(3, { currency: 'KWD', amountMinor: 1234, expectedPaymentDate: '2032-12-23' }), record(4, { expectedPaymentDate: '2032-12-24' })];
result = read(multi); assert.equal(result.events.length, 3); assert.equal(result.hasMore, true);
assert.deepEqual(result.events.map(x => [x.currency, x.amountMinor]), [['USD', 12345], ['JPY', 500], ['KWD', 1234]]);
assert.deepEqual(read([...multi].reverse()), result, 'stable ordering and cap');
result = read([record(1, { expectedPaymentDate: '2032-12-19' }), record(2, { expectedPaymentDate: '2032-12-20' }),
  record(3, { expectedPaymentDate: '2033-01-18' }), record(4, { expectedPaymentDate: '2033-01-19' })]);
assert.deepEqual(result.events.map(x => x.expectedPaymentDate), ['2032-12-20', '2033-01-18'], '30 calendar days, inclusive today across year');
const midnight = new Date('2032-12-20T00:30:00Z');
result = query({ identity, now: midnight, records: [record(1, { expectedPaymentDate: '2032-12-19', expectedPaymentTimezone: 'America/Sao_Paulo' }), record(2, { expectedPaymentDate: '2032-12-19' })] });
assert.equal(result.events.length, 1); assert.equal(result.events[0].expectedPaymentTimezone, 'America/Sao_Paulo');
result = read([record(1, { expectedPaymentDate: undefined }), record(2, { expectedPaymentTimezone: undefined }), record(3, { amountMinor: null })]);
assert.equal(result.state, 'incomplete'); assert.equal(result.events.length, 1); assert.equal(result.events[0].amountMinor, null);
assert.equal(read([record(1, { expectedPaymentDate: '2032-02-30' })]).state, 'incomplete');
assert.equal(read([record(1, { currency: 'XXX' })]).events.length, 0);
assert.equal(read([record(1), record(1, { revision: 2, status: 'statement_reported' })]).events.length, 0, 'latest state supersedes forecast');
assert.equal(read([record(1), record(1, { revision: 2, amountMinor: 'invalid' })]).events.length, 0, 'bad latest cannot resurrect old forecast');
result = read([record(1), record(1, { amountMinor: 44 })]); assert.equal(result.state, 'incomplete'); assert.equal(result.events.length, 0);
result = read([record(1), record(2, { aggregationLevel: 'week', periodStart: '2032-12-01', periodEnd: '2032-12-07' })]);
assert.equal(result.state, 'incomplete'); assert.equal(result.events.length, 0, 'overlapping aggregation levels never double count');
result = read([record(1), record(2, { aggregationLevel: 'week', periodStart: '2032-12-01', periodEnd: '2032-12-07', status: 'payment_confirmed', paymentDate: '2032-12-20', evidence: { kind: 'settlement', reference: 'synthetic-only' } })]);
assert.equal(result.events.length, 0, 'settled aggregate cannot leave an overlapping finer forecast presented as a new payment');
result = read([record(1, { currency: 'BRL' }), record(2, { currency: 'BRL', aggregationLevel: 'week', periodStart: '2032-12-08', periodEnd: '2032-12-14' })]);
assert.equal(result.events.length, 2, 'nonoverlapping levels remain separate');
const monthly = record(9, { category: 'vacation', aggregationLevel: 'month', periodStart: '2033-01-01', periodEnd: '2033-01-31', amountBasis: 'net_credit', currency: 'BRL', expectedPaymentDate: '2033-01-04' });
assert.equal(read([monthly]).events[0].category, 'vacation', 'full competence outside 30-day window still considered by payment date');
const snapshot = JSON.stringify(multi); read(multi); assert.equal(JSON.stringify(multi), snapshot, 'projection never mutates stored records');
let lists = 0, writes = 0, enabled = false;
const handler = createFinancialLedgerHandler({ enabled: () => enabled, identityProvider: async () => identity,
  poolProvider: async () => ({}), now: () => now, storeFactory: () => ({ list: async owner => { lists++; assert.equal(owner, identity.ownerId); return multi; }, append: () => { writes++; throw Error('write forbidden'); } }) });
async function request(method = 'GET', search = '') { let status, body, headers;
  const res = { setHeader() {}, writeHead(code, value) { status = code; headers = value; }, end(value) { body = JSON.parse(value); } };
  assert.equal(await handler({ method, headers: {} }, res, new URL('https://fixture.invalid' + FINANCIAL_UPCOMING_PATH + search)), true);
  return { status, body, headers };
}
assert.equal((await request()).status, 503); assert.equal(lists, 0, 'flag OFF never touches DB');
enabled = true; result = await request(); assert.equal(result.status, 200); assert.equal(result.body.events.length, 3); assert.equal(result.headers['cache-control'], 'no-store');
assert.equal((await request('POST')).status, 405); assert.equal((await request('GET', '?ownerId=b')).status, 400); assert.equal(writes, 0);
console.log('PASS upcoming: canonical latest revisions, owner isolation, cap3, USD/JPY/KWD, calendar/timezones, pending/settlement, aggregation ambiguity, read-only and default OFF.');
