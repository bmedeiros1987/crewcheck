import assert from 'node:assert/strict';
import {
  normalizeAirport,
  normalizePartnerFlight,
  parsePartnerScopes,
  partnerGatePayload,
} from '../server/v1413/partnerGateApi.mjs';

assert.equal(normalizePartnerFlight(' LA 3729 '), 'LA3729');
assert.equal(normalizePartnerFlight('LAN3729'), 'LA3729');
assert.equal(normalizePartnerFlight('TAM3501'), 'JJ3501');
assert.equal(normalizePartnerFlight('../etc/passwd'), '');

assert.equal(normalizeAirport(' gru '), 'GRU');
assert.equal(normalizeAirport('SBGR'), '');
assert.equal(normalizeAirport('12A'), '');

assert.deepEqual(parsePartnerScopes('gates:read gates:read'), ['gates:read']);
assert.deepEqual(parsePartnerScopes(['gates:read', ' GATES:READ ']), ['gates:read']);

const now = new Date('2026-08-26T15:30:00.000Z');
const available = partnerGatePayload({
  ok: true,
  flight: 'LAN3729',
  gate: '325',
  terminal: '3',
  status: 'Programado',
  origin: 'GRU',
  destination: 'BSB',
  quality: 87,
}, { flight: 'LA3729' }, now);

assert.deepEqual(available, {
  ok: true,
  apiVersion: 'v1',
  flight: 'LA3729',
  origin: 'GRU',
  destination: 'BSB',
  gate: '325',
  terminal: '3',
  flightStatus: 'Programado',
  gateStatus: 'available',
  confidence: 0.87,
  confidenceBand: 'high',
  source: 'crewcheck-radar',
  retrievedAt: '2026-08-26T15:30:00.000Z',
  occurrenceMatch: 'live-flight-route',
});

const unavailable = partnerGatePayload({
  ok: true,
  flight: 'LA3729',
  gate: '',
  quality: 48,
}, { flight: 'LA3729', origin: 'GRU', destination: 'BSB' }, now);
assert.equal(unavailable.ok, false);
assert.equal(unavailable.gate, null);
assert.equal(unavailable.gateStatus, 'unavailable');
assert.equal(unavailable.confidenceBand, 'low');
assert.equal(unavailable.origin, 'GRU');
assert.equal(unavailable.destination, 'BSB');

console.log('partner-gate-api regression: PASS');
