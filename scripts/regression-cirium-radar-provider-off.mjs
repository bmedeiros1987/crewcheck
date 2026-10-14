import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

if (process.argv[2] !== '--worker') {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker'], { env: { TZ: process.env.TZ || 'UTC' }, stdio: 'inherit' });
  process.exit(child.status ?? 1);
}
globalThis.fetch = () => { throw Error('Network forbidden'); };
const { evaluateCiriumRadar: evaluate } = await import('../server/cirium-radar-provider.mjs');
const request = { carrierNamespace: 'FS', carrierFsCode: 'LA', flightNumber: '3377', origin: 'GRU', destination: 'BSB',
  departureDate: '2026-10-11', originTimeZone: 'America/Sao_Paulo', scheduledDepartureUtc: '2026-10-12T01:00:00Z' };
const row = { carrierFsCode: 'LA', flightNumber: '3377', departureAirportFsCode: 'GRU', arrivalAirportFsCode: 'BSB', status: 'S',
  operationalTimes: { scheduledGateDeparture: { dateUtc: '2026-10-12T01:00:00Z' }, scheduledGateArrival: { dateUtc: '2026-10-12T03:00:00Z' } },
  airportResources: { departureGate: 'A12', arrivalGate: 'B20' }, lastUpdatedDate: '2026-10-11T23:00:00Z' };
let count = 0;
function run(req = request, rows = [row]) { count++; return evaluate(req, { state: 'available', rows }, { enabled: true }); }
function state(expected, req, rows) { assert.equal(run(req, rows).state, expected); }
const poison = new Proxy({}, { get() { throw Error('OFF must not inspect input'); } });
for (const enabled of [undefined, false, 'true', 1, null]) {
  count++; assert.deepEqual(evaluate(poison, poison, { enabled }), { state: 'disabled', ok: false, provider: 'cirium-sky', candidate: null, provenance: null });
}
const good = run();
assert.equal(good.state, 'available');
assert.equal(good.candidate.scheduledDepartureUtc, '2026-10-12T01:00:00.000Z');
assert.equal(good.candidate.departureDate, '2026-10-11');
assert.equal(good.provenance.fields.departureGate.value, 'A12');
assert.equal(good.provenance.fields.departureGate.provider, 'cirium-sky');
assert.equal(good.provenance.fields.departureGate.observedAt, row.lastUpdatedDate.replace('Z', '.000Z'));
assert.ok(good.occurrenceKey.includes('|2026-10-11|GRU|BSB|'));
assert.ok(good.occurrenceKey.endsWith('|22:00|UTC:2026-10-12T01:00:00.000Z'));
const offsetRow = structuredClone(row);
offsetRow.operationalTimes.scheduledGateDeparture.dateUtc = '2026-10-11T22:00:00-03:00';
const equivalent = run(request, [offsetRow]);
assert.equal(equivalent.occurrenceKey, good.occurrenceKey);
assert.equal(equivalent.candidate.scheduledDepartureUtc, good.candidate.scheduledDepartureUtc);
const delayedRow = structuredClone(offsetRow);
delayedRow.operationalTimes.estimatedGateDeparture = { dateUtc: '2026-10-12T04:00:00Z' };
delayedRow.operationalTimes.estimatedGateArrival = { dateUtc: '2026-10-12T06:00:00Z' };
const delayed = run(request, [delayedRow]);
assert.equal(delayed.state, 'available');
assert.equal(delayed.candidate.scheduledDepartureUtc, good.candidate.scheduledDepartureUtc);
assert.equal(delayed.candidate.departure, '2026-10-12T04:00:00Z');
assert.equal(delayed.candidate.estimatedDeparture, delayed.candidate.departure);
const missingScheduled = structuredClone(delayedRow); delete missingScheduled.operationalTimes.scheduledGateDeparture;
state('invalid_payload', request, [missingScheduled]);
assert.equal(equivalent.provenance.fields.scheduledDeparture.value, good.provenance.fields.scheduledDeparture.value);
assert.equal(good.candidate.arrivalGate, 'B20');
// Invalid original offsets must never be laundered into an accepted Z instant.
function stampAt(utc, offset, minutes) {return new Date(Date.parse(utc)+minutes*60000).toISOString().slice(0,-1)+offset;}
for (const [offset,minutes] of [['+14:01',841],['+15:00',900],['-15:00',-900]]) {
 const invalidSource=structuredClone(row);
 invalidSource.operationalTimes.scheduledGateDeparture.dateUtc=stampAt(row.operationalTimes.scheduledGateDeparture.dateUtc,offset,minutes);
 invalidSource.operationalTimes.scheduledGateArrival.dateUtc=stampAt(row.operationalTimes.scheduledGateArrival.dateUtc,offset,minutes);
 const output=run(request,[invalidSource]);console.log(JSON.stringify({case:'strict-original-offset',offset,state:output.state}));
 assert.equal(output.state,'invalid_payload');assert.equal(output.candidate,null);
 state('invalid_request',{...request,scheduledDepartureUtc:invalidSource.operationalTimes.scheduledGateDeparture.dateUtc});
 for(const kind of ['estimated','actual']) {
  const invalidOptional=structuredClone(row);invalidOptional.operationalTimes[`${kind}GateDeparture`]={dateUtc:invalidSource.operationalTimes.scheduledGateDeparture.dateUtc};
  state('invalid_payload',request,[invalidOptional]);
 }
}
for (const [offset,minutes] of [['+14:00',840],['-14:00',-840]]) {
 const boundary=structuredClone(row);boundary.operationalTimes.scheduledGateDeparture.dateUtc=stampAt(row.operationalTimes.scheduledGateDeparture.dateUtc,offset,minutes);
 const accepted=run(request,[boundary]);assert.equal(accepted.state,'available');assert.equal(accepted.candidate.scheduledDepartureUtc,good.candidate.scheduledDepartureUtc);
}

for (const key of Object.keys(request)) { const missing = { ...request }; delete missing[key]; state('invalid_request', missing); }
for (const changes of [{ carrierNamespace: 'ICAO' }, { carrierFsCode: 'lan' }, { origin: 'GRU', destination: 'GRU' },
  { departureDate: '2026-10-12' }, { departureDate: '2026-02-30' }, { originTimeZone: 'Bogus/Zone' },
  { scheduledDepartureUtc: '2026-10-12T01:00:00' }, { scheduledDepartureUtc: '2026-02-30T01:00:00Z' },
  { scheduledDepartureUtc: '2026-10-11T24:00:00Z' }]) state('invalid_request', { ...request, ...changes });
state('no_data', request, []);
for (const changes of [{ carrierFsCode: 'JJ' }, { flightNumber: '3378' }, { departureAirportFsCode: 'BSB', arrivalAirportFsCode: 'GRU' }]) state('no_data', request, [{ ...row, ...changes }]);
const tomorrow = structuredClone(row); tomorrow.operationalTimes.scheduledGateDeparture.dateUtc = '2026-10-13T01:00:00Z'; tomorrow.operationalTimes.scheduledGateArrival.dateUtc = '2026-10-13T03:00:00Z';
state('no_data', request, [tomorrow]);
state('available', request, [tomorrow, row]);
state('ambiguous', request, [row, row]);
for (const rows of [null, {}, [null], [row, {}], Array(101).fill(row)]) state('invalid_payload', request, rows);
for (const key of ['carrierFsCode', 'flightNumber', 'departureAirportFsCode', 'arrivalAirportFsCode', 'operationalTimes']) { const missing = { ...row }; delete missing[key]; state('invalid_payload', request, [missing]); }
for (const changes of [{ status: {} }, { airportResources: { departureGate: {} } }, { airportResources: [] }, { flightEquipment: { tailNumber: {} } }]) state('invalid_payload', request, [{ ...row, ...changes }]);
const backwards = structuredClone(row); backwards.operationalTimes.scheduledGateArrival.dateUtc = '2026-10-12T00:00:00Z'; state('invalid_payload', request, [backwards]);
const localOnly = structuredClone(row); localOnly.operationalTimes.scheduledGateDeparture = { dateLocal: '2026-10-11T22:00:00' }; state('invalid_payload', request, [localOnly]);
for (const kind of ['actual', 'estimated']) {
  for (const [dep, arr] of [['2026-10-12T03:00:00Z', '2026-10-12T02:00:00Z'],
    ['2025-10-12T01:00:00Z', '2025-10-12T03:00:00Z'], ['2026-10-14T01:00:00Z', '2026-10-14T03:00:00Z']]) {
    const item = structuredClone(row); item.operationalTimes[`${kind}GateDeparture`] = { dateUtc: dep };
    item.operationalTimes[`${kind}GateArrival`] = { dateUtc: arr }; state('invalid_payload', request, [item]);
  }
}
const mixed = structuredClone(row); mixed.operationalTimes.actualGateDeparture = { dateUtc: '2026-10-12T04:00:00Z' };
state('invalid_payload', request, [mixed]);
const actual = structuredClone(row); actual.operationalTimes.actualGateDeparture = { dateUtc: '2026-10-12T01:10:00Z' };
actual.operationalTimes.actualGateArrival = { dateUtc: '2026-10-12T03:10:00Z' }; state('available', request, [actual]);
for (const updated of [undefined, '', 'invalid', '2026-10-11T23:00:00']) {
  const item = run(request, [{ ...row, lastUpdatedDate: updated }]);
  assert.equal(item.provenance.fields.departureGate.observedAt, null);
  assert.equal(item.provenance.fields.departureGate.coverageState, 'provided_no_freshness');
}
const empty = run(request, [{ ...row, airportResources: {}, status: undefined }]);
assert.equal(empty.provenance.fields.departureGate, undefined);
assert.equal(empty.provenance.fields.status, undefined);
for (const name of ['not_configured', 'timeout', 'rate_limited', 'provider_error']) {
  count++; assert.equal(evaluate(request, { state: name, token: 'synthetic-never-exposed' }, { enabled: true }).state, name);
}
assert.equal(JSON.stringify(good).includes('synthetic-never-exposed'), false);
// FS3 is explicit, with no implicit LA/LAN or IATA/ICAO alias resolution.
state('available', { ...request, carrierFsCode: 'LAN' }, [{ ...row, carrierFsCode: 'LAN' }]);
state('no_data', { ...request, carrierFsCode: 'LAN' }, [row]);
const historical = structuredClone(row);
historical.operationalTimes.scheduledGateDeparture.dateUtc = '1969-12-31T20:00:00.123Z';
historical.operationalTimes.scheduledGateArrival.dateUtc = '1969-12-31T22:00:00.123Z';
const history = run({ ...request, departureDate: '1969-12-31', scheduledDepartureUtc: '1969-12-31T20:00:00.123Z' }, [historical]);
assert.equal(history.state, 'available');
assert.equal(history.candidate.scheduledDeparture, '1969-12-31T17:00:00.123-03:00');
const foldRequest = { ...request, carrierFsCode: 'AA', flightNumber: '123', origin: 'JFK', destination: 'BOS',
  originTimeZone: 'America/New_York', departureDate: '2026-11-01' };
function fold(departure) {
  const item = structuredClone(row);
  Object.assign(item, { carrierFsCode: 'AA', flightNumber: '123', departureAirportFsCode: 'JFK', arrivalAirportFsCode: 'BOS' });
  item.operationalTimes.scheduledGateDeparture.dateUtc = departure;
  item.operationalTimes.scheduledGateArrival.dateUtc = '2026-11-01T08:00:00Z';
  const output = run({ ...foldRequest, scheduledDepartureUtc: departure }, [item]);
  assert.equal(output.state, 'available');
  assert.equal(output.provenance.occurrenceKey, output.occurrenceKey);
  for (const field of Object.values(output.provenance.fields)) assert.equal(field.occurrenceKey, output.occurrenceKey);
  return output;
}
const firstFold = fold('2026-11-01T05:30:00Z');
const secondFold = fold('2026-11-01T06:30:00Z');
assert.notEqual(firstFold.occurrenceKey, secondFold.occurrenceKey);
assert.notEqual(firstFold.occurrenceKey, fold('2026-11-01T05:30:30Z').occurrenceKey);
assert.notEqual(firstFold.occurrenceKey, fold('2026-11-01T05:30:00.001Z').occurrenceKey);
assert.equal(firstFold.occurrenceKey, fold('2026-11-01T01:30:00-04:00').occurrenceKey);
assert.equal(secondFold.occurrenceKey, fold('2026-11-01T01:30:00-05:00').occurrenceKey);
console.log(`PASS Cirium Radar pure OFF contract: ${count} cases, TZ=${process.env.TZ}, zero network/credentials`);
