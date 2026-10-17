import assert from 'node:assert/strict';
import { evaluatePublishedCiriumRadar as evaluate } from '../server/cirium-published-identity.mjs';
import { createCiriumSkyTransport, runCiriumSkyRadar, productionCiriumSkyTransport } from '../server/cirium-sky-transport.mjs';
globalThis.fetch = () => { throw Error('Real network forbidden'); };
// Calendar proves the published identity/time, not either synthetic FS code.
const identity = { carrierNamespace: 'IATA', carrierIataCode: 'LA', flightNumber: '3443', origin: 'GRU', destination: 'NAT',
  departureDate: '2026-10-12', originTimeZone: 'America/Sao_Paulo', scheduledDepartureUtc: '2026-10-12T03:05:00Z' };
const row = { carrierFsCode: 'O1', flightNumber: '9301', departureAirportFsCode: 'GRU', arrivalAirportFsCode: 'NAT', status: 'S',
  operationalTimes: { scheduledGateDeparture: { dateUtc: identity.scheduledDepartureUtc }, scheduledGateArrival: { dateUtc: '2026-10-12T06:20:00Z' } },
  airportResources: { departureGate: 'A12' }, lastUpdatedDate: '2026-10-12T03:00:00Z',
  codeshares: [{ fsCode: 'M1', flightNumber: '3443', relationship: 'S' }] };
const appendix = { airlines: [{ fs: 'M1', iata: 'LA' }, { fs: 'O1', iata: 'JJ' }, { fs: 'LA', iata: 'ZZ' }] };
const response = (rows = [row], refs = appendix) => ({ state: 'available', rows, appendix: refs });
const run = (req = identity, value = response()) => evaluate(req, value, { enabled: true });
const poison = new Proxy({}, { get() { throw Error('OFF inspected input'); } });
assert.equal(evaluate(poison, poison).state, 'disabled');
for (const key of Object.keys(identity)) { const missing = { ...identity }; delete missing[key]; assert.equal(run(missing).state, 'invalid_request'); }
for (const change of [{ carrierNamespace: 'FS' }, { carrierNamespace: 'ICAO' }, { carrierFsCode: 'LA' }, { carrierIataCode: ['LA'] },
  { departureDate: '2026-10-11' }, { scheduledDepartureUtc: '2026-10-12T02:18:00Z' }, { originTimeZone: 'Bogus/Zone' }]) {
  assert.equal(run({ ...identity, ...change }).state, 'invalid_request');
}
const good = run();
assert.equal(good.state, 'available'); assert.equal(good.candidate.flight, 'LA3443');
assert.equal(good.candidate.operatingIdentity.carrierFsCode, 'O1'); assert.equal(good.candidate.operatingIdentity.flightNumber, '9301');
assert.equal(good.candidate.publishedIdentity.carrierNamespace, 'IATA'); assert.equal(good.candidate.identityBinding.marketingCarrierFsCode, 'M1');
assert.equal(good.candidate.identityBinding.relationship, 'S'); assert.ok(good.occurrenceKey.endsWith('|MARKETING:IATA:LA3443'));
assert.ok(good.candidate.operatingOccurrenceKey.startsWith('O1|9301|')); assert.ok(good.occurrenceKey.includes('UTC:2026-10-12T03:05:00.000Z'));
assert.equal(good.provenance.identityBinding.source, 'cirium-sky.response'); assert.equal(good.provenance.fields.departureGate.value, 'A12');
assert.equal(good.provenance.fields.departureGate.observedAt, '2026-10-12T03:00:00.000Z');
for (const field of Object.values(good.provenance.fields)) assert.equal(field.occurrenceKey, good.occurrenceKey);
const offset = run({ ...identity, scheduledDepartureUtc: '2026-10-12T00:05:00-03:00' }); assert.equal(offset.occurrenceKey, good.occurrenceKey);
assert.equal(run(identity, response([row], { airlines: [{ fs: 'M1', iata: 'LA' }, { fs: 'O1', iata: null }] })).state, 'available');
assert.equal(run(identity, response([{ ...row, codeshares: [...row.codeshares, { fsCode: 'LA', flightNumber: null, relationship: null }] }])).state, 'available');
for (const relationship of ['L', 'Z', 'S', 'X']) assert.equal(run(identity, response([{ ...row, codeshares: [{ ...row.codeshares[0], relationship }] }])).state, 'available');
assert.equal(run(identity, response([{ ...row, carrierFsCode: 'M1', flightNumber: '3443', codeshares: undefined }])).candidate.identityBinding.relationship, 'direct');
assert.equal(run(identity, response([{ ...row, carrierFsCode: 'M1', codeshares: [{ ...row.codeshares[0], relationship: 'C' }] }])).state, 'available');
for (const codeshares of [undefined, [], [{ fsCode: 'LA', flightNumber: '3443', relationship: 'S' }],
  [{ fsCode: 'M1', flightNumber: '3444', relationship: 'S' }], [{ fsCode: 'M1', flightNumber: '3443' }]])
  assert.equal(run(identity, response([{ ...row, codeshares }])).state, 'no_data');
for (const codeshares of [null, {}, [null], [{ fsCode: 'M1', flightNumber: '3443', relationship: 'C' }],
  [{ fsCode: 'M1', flightNumber: '3443', relationship: 'unknown' }]]) assert.equal(run(identity, response([{ ...row, codeshares }])).state, 'invalid_payload');
assert.equal(run(identity, response([{ ...row, codeshares: [row.codeshares[0], row.codeshares[0]] }])).state, 'ambiguous');
assert.equal(run(identity, response([row, row])).state, 'ambiguous');
assert.equal(run(identity, response([{ ...row, operatingCarrierFsCode: 'OTHER' }])).state, 'ambiguous');
for (const changes of [{ departureAirportFsCode: 'BSB' }, { arrivalAirportFsCode: 'BSB' },
  { operationalTimes: { ...row.operationalTimes, scheduledGateDeparture: { dateUtc: '2026-10-12T03:06:00Z' } } }])
  assert.equal(run(identity, response([{ ...row, ...changes }])).state, 'no_data');
for (const refs of [undefined, {}, { airlines: null }, { airlines: [] }, { airlines: [{ fs: 'M1', iata: ['LA'] }] }]) assert.equal(run(identity, { ...response(), appendix: refs }).state, 'invalid_payload');
assert.equal(run(identity, response([row], { airlines: appendix.airlines.filter(x => x.fs !== 'M1') })).state, 'no_data');
assert.equal(run(identity, response([row], { airlines: appendix.airlines.filter(x => x.fs !== 'O1') })).state, 'invalid_payload');
for (const extra of [{ fs: 'M2', iata: 'LA' }, { fs: 'M1', iata: 'XX' }, { fs: 'O1', iata: 'XY' }])
  assert.equal(run(identity, response([row], { airlines: [...appendix.airlines, extra] })).state, 'ambiguous');
const at = Date.parse(row.lastUpdatedDate);
const policy = { product: 'Sky Flight Status', evidenceId: 'OFFLINE_FIXTURE', contractEvidenceId: 'OFFLINE_FIXTURE', validFromMs: at - 1000,
  validUntilMs: at + 300_000, maxCalls: 1, dateWindowDays: 2, maxObservationAgeMs: 900_000, airportTimeZones: { GRU: 'America/Sao_Paulo' } };
let calls = 0, credentials = 0;
const transport = createCiriumSkyTransport({ enabled: true, identityMode: 'published-iata', policy, now: () => at,
  credential: () => { credentials++; return 'OFFLINE_FAKE_SECRET'; }, fetchImpl: async url => {
    calls++; assert.equal(url.origin, 'https://api.sky.cirium.com'); assert.deepEqual([...url.searchParams], [['codeType', 'IATA']]);
    assert.ok(url.pathname.includes('/airline/LA/flight-number/3443/departure-date/2026-10-12'));
    return new Response(JSON.stringify({ flightStatuses: [row], appendix }), { headers: { 'content-type': 'application/json' } });
  } });
assert.equal((await transport.source({ ...identity, carrierNamespace: 'FS', carrierFsCode: 'LA' })).state, 'invalid_request');
assert.equal((await transport.source({ ...identity, departureDate: '2026-10-11' })).state, 'invalid_request');
assert.equal((await runCiriumSkyRadar(identity, transport, 'LA3444')).providerState, 'invalid_request');
assert.equal(calls, 0); assert.equal(credentials, 0);
const delivered = await runCiriumSkyRadar(identity, transport, 'LA3443');
assert.equal(delivered.providerState, 'available'); assert.equal(delivered.canonicalReadOnly, true); assert.equal(delivered.exportedToConcierge, false);
assert.deepEqual(delivered.provenance, good.provenance); assert.equal(calls, 1); assert.equal(credentials, 1);
assert.equal((await transport.source(identity)).cached, true); assert.equal(calls, 1);
const unconfigured = createCiriumSkyTransport({ identityMode: 'published-iata' }); assert.equal((await unconfigured.source(poison)).state, 'disabled');
assert.equal((await productionCiriumSkyTransport().source(identity)).state, 'disabled');
assert.ok(!JSON.stringify(delivered).includes('OFFLINE_FAKE_SECRET'));
console.log('PASS published IATA -> response-only operating FS binding OFF; codeshare/wet lease, collisions, physical identity, explicit upstream namespace, zero real queries');
