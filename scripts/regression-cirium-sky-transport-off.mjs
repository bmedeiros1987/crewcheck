import assert from 'node:assert/strict';
import { createCiriumSkyTransport, productionCiriumSkyTransport, runCiriumSkyRadar, adaptSkyStatusEnvelope } from '../server/cirium-sky-transport.mjs';
globalThis.fetch = () => { throw Error('Real network forbidden'); };
let clock = Date.parse('2026-10-11T23:00:00Z'), calls = 0, credentials = 0;
const identity = { carrierNamespace: 'FS', carrierFsCode: 'LA', flightNumber: '3377', origin: 'GRU', destination: 'BSB', departureDate: '2026-10-11', originTimeZone: 'America/Sao_Paulo', scheduledDepartureUtc: '2026-10-12T01:00:00Z' };
const row = { carrierFsCode: 'LA', flightNumber: '3377', departureAirportFsCode: 'GRU', arrivalAirportFsCode: 'BSB', status: 'S', operationalTimes: { scheduledGateDeparture: { dateUtc: identity.scheduledDepartureUtc }, scheduledGateArrival: { dateUtc: '2026-10-12T03:00:00Z' } }, airportResources: { departureGate: 'A12' }, lastUpdatedDate: '2026-10-11T23:00:00Z' };
const policy = { product: 'Sky Flight Status', evidenceId: 'OFFLINE_FIXTURE_ONLY', contractEvidenceId: 'OFFLINE_FIXTURE_ONLY', validFromMs: clock - 1000, validUntilMs: clock + 86_400_000, maxCalls: 2, dateWindowDays: 2, maxObservationAgeMs: 900_000, airportTimeZones: { GRU: 'America/Sao_Paulo' } };
const response = (body = { flightStatuses: [row] }, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const config = extra => ({ enabled: true, policy, now: () => clock, credential: () => { credentials++; return 'OFFLINE_FAKE_SECRET'; }, fetchImpl: async (url, options) => {
  calls++; assert.equal(url.origin, 'https://api.sky.cirium.com'); assert.equal(url.search, '?codeType=FS'); assert.deepEqual([...url.searchParams], [['codeType', 'FS']]); assert.equal(options.redirect, 'error'); assert.equal(options.method, 'GET'); assert.equal(options.headers.Authorization, 'OFFLINE_FAKE_SECRET'); return response();
}, ...extra });
const poison = new Proxy({}, { get() { throw Error('OFF inspected input'); } });
assert.equal((await productionCiriumSkyTransport().source(poison)).state, 'disabled');
assert.equal((await createCiriumSkyTransport(config({ enabled: false })).source(poison)).state, 'disabled');
assert.equal(calls, 0); assert.equal(credentials, 0);
for (const change of [{ validUntilMs: clock }, { contractEvidenceId: '' }, { maxCalls: 0 }, { maxCalls: 101 }, { maxObservationAgeMs: 0 }]) {
  assert.equal((await createCiriumSkyTransport(config({ policy: { ...policy, ...change } })).source(identity)).state, 'not_configured');
}
for (const change of [{ carrierNamespace: 'IATA' }, { originTimeZone: 'UTC' }, { flightNumber: '../3377' }, { origin: 'XXX' }]) assert.equal((await createCiriumSkyTransport(config()).source({ ...identity, ...change })).state, 'invalid_request');
assert.equal(calls, 0); assert.equal(credentials, 0);
const transport = createCiriumSkyTransport(config());
// Synthetic collision: code LA resolves to another FS carrier if the namespace
// is omitted. The transport must pin FS, not rely on response rejection later.
let collisionCalls = 0;
const collision = createCiriumSkyTransport(config({ fetchImpl: async endpoint => {
  collisionCalls++;
  const resolvedFs = endpoint.searchParams.get('codeType') === 'FS' ? 'LA' : 'JJ';
  return response({ flightStatuses: [{ ...row, carrierFsCode: resolvedFs }] });
} }));
assert.equal((await runCiriumSkyRadar(identity, collision, 'LA3377')).providerState, 'available');
assert.equal((await collision.source({ ...identity, carrierNamespace: 'IATA' })).state, 'invalid_request');
assert.equal((await collision.source({ ...identity, carrierNamespace: 'ICAO' })).state, 'invalid_request');
assert.equal(collisionCalls, 1);
const wrongCarrier = createCiriumSkyTransport(config({ fetchImpl: async endpoint => {
  assert.equal(endpoint.searchParams.get('codeType'), 'FS');
  return response({ flightStatuses: [{ ...row, carrierFsCode: 'JJ' }] });
} }));
assert.equal((await runCiriumSkyRadar(identity, wrongCarrier, 'LA3377')).providerState, 'no_data');
const good = await runCiriumSkyRadar(identity, transport, 'LA3377');
assert.equal(good.providerState, 'available'); assert.equal(good.provenance.fields.departureGate.provider, 'cirium-sky'); assert.equal(good.provenance.fields.departureGate.observedAt, '2026-10-11T23:00:00.000Z'); assert.equal(good.exportedToConcierge, false); assert.equal(good.canonicalReadOnly, true); assert.ok(good.occurrenceKey.endsWith('UTC:2026-10-12T01:00:00.000Z'));
assert.equal(calls, 1); const cached = await transport.source(identity); cached.rows[0].airportResources.departureGate = 'BAD'; assert.equal((await transport.source(identity)).rows[0].airportResources.departureGate, 'A12'); assert.equal(calls, 1);
assert.equal((await transport.source({ ...identity, scheduledDepartureUtc: '2026-10-11T22:00:00-03:00' })).cached, true); assert.equal(calls, 1);
assert.equal((await runCiriumSkyRadar(identity, transport, 'LA3378')).providerState, 'invalid_request'); assert.equal(calls, 1);
clock += 61_000; await transport.source(identity); clock += 61_000; assert.equal((await transport.source(identity)).reason, 'budget_exhausted'); assert.equal(transport.counters().calls, 2);
for (const payload of [{}, { flightStatuses: [], flightStatus: row }, { flightStatuses: null }, { flightStatuses: [null] }, { flightStatuses: Array(101).fill(row) }, { flightStatuses: [], error: {} }]) assert.equal(adaptSkyStatusEnvelope(payload).state, 'invalid_payload');
assert.equal(adaptSkyStatusEnvelope({ flightStatus: row }).rows.length, 1);
for (const [payload, expected] of [[{ flightStatuses: [] }, 'no_data'], [{ flightStatuses: [row, row] }, 'ambiguous'], [{ flightStatuses: [{ ...row, flightNumber: '9999' }] }, 'no_data'], [{ flightStatuses: [{ ...row, lastUpdatedDate: '' }] }, 'stale_data'], [{ flightStatuses: [{ ...row, lastUpdatedDate: '2026-10-10T23:00:00Z' }] }, 'stale_data'], [{ flightStatuses: [{ ...row, lastUpdatedDate: '2026-10-13T23:00:00Z' }] }, 'stale_data']]) {
  const result = await runCiriumSkyRadar(identity, createCiriumSkyTransport(config({ fetchImpl: async () => response(payload) })), 'LA3377'); assert.equal(result.providerState, expected);
}
for (const status of [401, 403, 404, 500, 302]) {
  let n = 0; const t = createCiriumSkyTransport(config({ fetchImpl: async () => { n++; return response({}, status); } }));
  assert.equal((await t.source(identity)).state, 'provider_error'); assert.equal((await t.source(identity)).cached, true); assert.equal(n, 1);
}
for (const header of [undefined, '0', 'garbage', '120', new Date(clock + 120_000).toUTCString()]) {
  let n = 0; const t = createCiriumSkyTransport(config({ fetchImpl: async () => { n++; return response({}, 429, header === undefined ? {} : { 'retry-after': header }); } }));
  assert.equal((await t.source(identity)).state, 'rate_limited'); assert.equal((await t.source({ ...identity, flightNumber: '3378' })).state, 'rate_limited'); assert.equal(n, 1);
}
let resolve; let n = 0; const t = createCiriumSkyTransport(config({ fetchImpl: async () => { n++; return new Promise(r => { resolve = r; }); } }));
// Never shorten a provider's long cooldown; expiration stays checked first.
const beforeLongCooldown = clock;
for (const longHeader of ['172800', new Date(beforeLongCooldown + 172800_000).toUTCString()]) {
  clock = beforeLongCooldown;
  let longCalls = 0;
  const long = createCiriumSkyTransport(config({ policy: { ...policy, validUntilMs: clock + 259200_000 },
    fetchImpl: async () => { longCalls++; return longCalls === 1 ? response({}, 429, { 'retry-after': longHeader }) : response(); } }));
  assert.equal((await long.source(identity)).state, 'rate_limited');
  clock += 86400_000 + 1000;
  assert.equal((await long.source(identity)).state, 'rate_limited'); assert.equal(longCalls, 1);
  clock = beforeLongCooldown + 172800_000 + 1000;
  assert.equal((await long.source(identity)).upstreamCalled, true); assert.equal(longCalls, 2);
}
clock = beforeLongCooldown;
let expiredCalls = 0;
const expiredCooldown = createCiriumSkyTransport(config({ policy: { ...policy, validUntilMs: clock + 300_000 },
  fetchImpl: async () => { expiredCalls++; return response({}, 429, { 'retry-after': '172800' }); } }));
await expiredCooldown.source(identity); clock += 300_001;
assert.equal((await expiredCooldown.source(identity)).state, 'not_configured'); assert.equal(expiredCalls, 1);
for (const badHeader of ['invalid', '-1', '', '9'.repeat(400)]) {
  clock = beforeLongCooldown;
  let badCalls = 0;
  const bad = createCiriumSkyTransport(config({ fetchImpl: async () => { badCalls++; return response({}, 429, { 'retry-after': badHeader }); } }));
  await bad.source(identity); clock += 59_999;
  assert.equal((await bad.source({ ...identity, flightNumber: '3378' })).state, 'rate_limited'); assert.equal(badCalls, 1);
  if (badHeader === '9'.repeat(400)) {
    clock += 1001; // beyond both the minimum cooldown and the cached failure TTL
    assert.equal((await bad.source(identity)).state, 'rate_limited');
    assert.equal((await bad.source({ ...identity, flightNumber: '3378' })).state, 'rate_limited');
    assert.equal(badCalls, 1);
  }
}
clock = beforeLongCooldown;
const first = t.source(identity), second = t.source(identity); resolve(response()); const values = await Promise.all([first, second]); assert.equal(n, 1); assert.equal(values[0].state, 'available'); assert.equal(values[1].state, 'available');
let signal; const timeout = createCiriumSkyTransport(config({ timeoutMs: 10, fetchImpl: async (_, opts) => { signal = opts.signal; return new Promise(() => {}); } }));
assert.equal((await timeout.source(identity)).state, 'timeout'); assert.equal(signal.aborted, true); assert.equal(timeout.counters().pending, 0); assert.equal((await timeout.source({ ...identity, flightNumber: '3378' })).state, 'rate_limited');
for (const fetchImpl of [async () => new Response('x'.repeat(300000), { headers: { 'content-type': 'application/json' } }), async () => new Response('<html/>', { headers: { 'content-type': 'text/html' } }), async () => { throw Error('Secret exception OFFLINE_FAKE_SECRET'); }]) {
  const result = await createCiriumSkyTransport(config({ fetchImpl })).source(identity); assert.notEqual(result.state, 'available'); assert.ok(!JSON.stringify(result).includes('OFFLINE_FAKE_SECRET'));
}
assert.equal((await productionCiriumSkyTransport().source(identity)).state, 'disabled');
clock = Date.parse(row.lastUpdatedDate);
let freshCalls = 0;
const fresh = createCiriumSkyTransport(config({ policy: { ...policy, maxObservationAgeMs: 1000 }, fetchImpl: async () => { freshCalls++; return response(); } }));
assert.equal((await fresh.source(identity)).state, 'available'); clock += 2000;
assert.equal((await fresh.source(identity)).state, 'stale_data'); assert.equal(freshCalls, 1);
clock = Date.parse(row.lastUpdatedDate);
let complete;
const expiring = createCiriumSkyTransport(config({ policy: { ...policy, validUntilMs: clock + 1000 }, fetchImpl: async () => new Promise(r => { complete = r; }) }));
const ongoing = expiring.source(identity); clock += 2000; complete(response()); assert.equal((await ongoing).state, 'not_configured');
clock = Date.parse(row.lastUpdatedDate);
for (const [status, type, length] of [[429, 'application/json', undefined], [500, 'application/json', undefined], [200, 'text/html', undefined], [200, 'application/json', '999999']]) {
  let cancelled = 0, requestSignal;
  const stream = new ReadableStream({ cancel() { cancelled++; } });
  const guarded = createCiriumSkyTransport(config({ fetchImpl: async (_, opts) => { requestSignal = opts.signal; return new Response(stream, { status, headers: { 'content-type': type, ...(length ? { 'content-length': length } : {}) } }); } }));
  await guarded.source(identity); await Promise.resolve(); assert.equal(cancelled, 1); assert.equal(requestSignal.aborted, true);
}
let stalledCancelled = 0;
const stalledResponse = new Response(new ReadableStream({ cancel() { stalledCancelled++; } }), { headers: { 'content-type': 'application/json' } });
const stalled = createCiriumSkyTransport(config({ timeoutMs: 10, fetchImpl: async () => stalledResponse }));
assert.equal((await stalled.source(identity)).state, 'timeout'); await Promise.resolve();
assert.equal(stalledCancelled, 1); assert.equal(stalledResponse.body.locked, false);
console.log('PASS Sky transport OFF: identity/provenance, envelope, entitlement, bounded cache/quota, singleflight, timeout, cooldown, no retries/Flex/secrets');
