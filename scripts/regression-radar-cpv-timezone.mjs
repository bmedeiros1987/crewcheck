import assert from 'node:assert/strict';
import { airportTimeZone } from '../shared/airport-timezones.mjs';
import { baseTimeZone } from '../shared/timezone-choice.mjs';
import { gateQueryDay, originFlightDate } from '../shared/gate-query-day.mjs';
const identity = { flight:'LA3981', origin:'CPV', destination:'GRU', departureDate:'2032-10-14', scheduledDepartureUtc:'2032-10-14T12:00:00Z' };
for (const zone of ['UTC','America/Sao_Paulo','Pacific/Auckland']) {
  process.env.TZ = zone;
  assert.equal(airportTimeZone(' cpv '), 'America/Fortaleza');
  assert.equal(baseTimeZone('CPV'), '', 'Airport fix must not change preference fallback policy');
  assert.equal(originFlightDate('2032-10-15T02:59:59Z','CPV'), '2032-10-14');
  assert.equal(gateQueryDay(identity, Date.parse('2032-10-15T02:59:59Z')).allowed, true);
  assert.equal(gateQueryDay(identity, Date.parse('2032-10-15T03:00:00Z')).reason, 'outside-published-flight-day');
  assert.equal(gateQueryDay({...identity,origin:'ZZZ'}, Date.parse('2032-10-14T12:00:00Z')).reason, 'origin-timezone-unverified');
  assert.equal(gateQueryDay({...identity,departureDate:'2032-10-15',scheduledDepartureUtc:'2032-10-15T01:00:00Z'}, Date.parse('2032-10-15T12:00:00Z')).reason, 'published-instant-date-mismatch');
}
console.log('PASS CPV reviewed airport timezone, origin midnight, unknown fail-closed, device independence; no provider requests');
