import assert from 'node:assert/strict';
import { fetchCiriumFlexOccurrence } from '../server/cirium-flex-radar.mjs';
import { runCiriumFlightAwareSequence } from '../server/radar-sequential.mjs';

const at = Date.parse('2032-10-31T12:00:00Z');
const identity = { flight: 'LA4774', origin: 'BSB', destination: 'AJU', departureDate: '2032-10-31', scheduledDepartureUtc: '2032-10-31T15:00:00Z' };
const base = { carrierFsCode: 'M1', flightNumber: '4774', departureAirportFsCode: 'O1', arrivalAirportFsCode: 'D1',
  operationalTimes: { scheduledGateDeparture: { dateUtc: identity.scheduledDepartureUtc } }, airportResources: { departureGate: '12', departureTerminal: '2', arrivalGate: '99' } };
const appendix = { airlines: [{ fs: 'M1', iata: 'LA' }], airports: [{ fs: 'O1', iata: 'BSB' }, { fs: 'D1', iata: 'AJU' }] };
let calls = 0;
async function read(row, rows = [row]) {
  return fetchCiriumFlexOccurrence({ identity, credentials: { appId: 'synthetic', appKey: 'synthetic' }, now: () => at,
    fetchImpl: async () => { calls++; return { ok: true, status: 200, json: async () => ({ appendix, flightStatuses: rows }) }; } });
}
for (const status of [undefined, null, '', 'BOGUS', {}, 'toString', '__proto__']) {
  const result = await read({ ...base, status });
  assert.equal(result.ok, true);
  assert.equal(result.status, '', 'Absent/unrecognized status is not a provider assertion');
  assert.equal(result.provenance.fields.status, undefined);
  assert.equal(result.gate, '12');
  assert.equal(result.terminal, '2');
  assert.equal(result.gateUpdate, null);
  assert.equal(result.provenance.fields.departureGate.observedAt, null);
  const projected = await runCiriumFlightAwareSequence({ identity, primary: async () => result, fallback: null, admit: async () => true, now: () => at });
  assert.equal(projected.status, '');
  assert.equal(projected.provenance.fields.status, undefined);
  assert.equal(projected.fallbackAttempted, false);
}
for (const [status, label] of Object.entries({ S: 'Programado', A: 'Em voo', L: 'Pousou', C: 'Cancelado', D: 'Alternado', R: 'Redirecionado', NO: 'Não operacional', U: 'Desconhecido' })) {
  const result = await read({ ...base, status });
  assert.equal(result.status, label);
  assert.equal(result.provenance.fields.status.value, label);
  assert.equal(result.provenance.fields.status.observedAt, null);
  assert.equal(result.cancelled, status === 'C');
}
for (const rows of [[{ ...base, flightNumber: '4775' }], [{ ...base, departureAirportFsCode: 'D1' }], [{ ...base, operationalTimes: { scheduledGateDeparture: { dateUtc: '2032-11-01T15:00:00Z' } } }], [base, base]]) {
  const result = await read(base, rows);
  assert.equal(result.ok, false);
  assert.equal(result.providerState, 'not_found');
}
const noGate = await read({ ...base, status: 'S', airportResources: { arrivalGate: '99' } });
assert.equal(noGate.gate, '');
assert.equal(noGate.provenance.fields.departureGate, undefined);
assert.equal(noGate.status, 'Programado');
assert.equal(calls, 20);
console.log('PASS Cirium Flex: missing/invalid status has no invented provenance; eight explicit codes, exact occurrence, arrival gate isolation, no external calls');
