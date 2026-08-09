import assert from 'node:assert/strict';
import { ciriumCoverage, normalizeCiriumFlightStatus } from '../server/cirium-flight-adapter.mjs';

const normalized = normalizeCiriumFlightStatus({
  flightId: 3377,
  carrierFsCode: 'LA',
  flightNumber: '3377',
  departureAirportFsCode: 'REC',
  arrivalAirportFsCode: 'GRU',
  status: 'S',
  lastUpdatedDate: '2026-08-09T10:00:00Z',
  airportResources: { departureTerminal: '1', departureGate: '9', arrivalTerminal: '2', arrivalGate: '11' },
  operationalTimes: {
    scheduledGateDeparture: { dateUtc: '2026-08-09T11:00:00Z' },
    estimatedGateDeparture: { dateUtc: '2026-08-09T11:05:00Z' },
    actualGateDeparture: { dateUtc: '2026-08-09T11:08:00Z' },
    scheduledGateArrival: { dateUtc: '2026-08-09T14:00:00Z' },
    estimatedGateArrival: { dateUtc: '2026-08-09T14:04:00Z' },
    actualGateArrival: { dateUtc: '2026-08-09T14:02:00Z' },
  },
  flightEquipment: { scheduledEquipment: { iata: '320' }, tailNumber: 'PT-TEST' },
});

assert.equal(normalized.ok, true);
assert.equal(normalized.flight, 'LA3377');
assert.equal(normalized.origin, 'REC');
assert.equal(normalized.destination, 'GRU');
assert.equal(normalized.gate, '9', 'arrival gate must never replace departure gate');
assert.equal(normalized.terminal, '1', 'arrival terminal must never replace departure terminal');
assert.equal(normalized.departure, '2026-08-09T11:08:00Z', 'actual departure must win over estimate');
assert.equal(normalized.arrival, '2026-08-09T14:02:00Z', 'actual arrival must win over estimate');
assert.equal(normalized.updatedAt, '2026-08-09T10:00:00Z');
assert.equal(ciriumCoverage(normalized).percent, 100);

const noDepartureResources = normalizeCiriumFlightStatus({
  carrierFsCode: 'LA', flightNumber: '3377', departureAirportFsCode: 'REC', arrivalAirportFsCode: 'GRU',
  airportResources: { arrivalGate: '11', arrivalTerminal: '2' },
});
assert.equal(noDepartureResources.gate, '');
assert.equal(noDepartureResources.terminal, '');

const alternateFreshness = normalizeCiriumFlightStatus({
  carrierFsCode: 'LA', flightNumber: '3377', departureAirportFsCode: 'REC', arrivalAirportFsCode: 'GRU',
  statusDetails: { updatedAt: '2026-08-09T10:05:00Z' },
});
assert.equal(alternateFreshness.updatedAt, '2026-08-09T10:05:00Z', 'statusDetails.updatedAt must preserve freshness when lastUpdatedDate is absent');

console.log('Cirium canonical adapter regression OK');
