import assert from 'node:assert/strict';
import {
  normalizeAirport,
  normalizeGateSourceClass,
  normalizePartnerFlight,
  parsePartnerScopes,
  partnerGatePayload,
  partnerGateSourcePolicy,
} from '../server/v1413/partnerGateApi.mjs';

process.env.CREWCHECK_PARTNER_SHAREABLE_GATE_SOURCE_CLASSES = 'user_reported,crewcheck_verified,public_airport_source';

assert.equal(normalizePartnerFlight(' LA 3729 '), 'LA3729');
assert.equal(normalizePartnerFlight('LAN3729'), 'LA3729');
assert.equal(normalizePartnerFlight('TAM3501'), 'JJ3501');
assert.equal(normalizePartnerFlight('../etc/passwd'), '');

assert.equal(normalizeAirport(' gru '), 'GRU');
assert.equal(normalizeAirport('SBGR'), '');
assert.equal(normalizeAirport('12A'), '');

assert.deepEqual(parsePartnerScopes('gates:read gates:read'), ['gates:read']);
assert.deepEqual(parsePartnerScopes(['gates:read', ' GATES:READ ']), ['gates:read']);
assert.deepEqual(parsePartnerScopes('gates:read rosters:write'), ['gates:read', 'rosters:write']);

assert.equal(normalizeGateSourceClass('Licensed Provider'), 'licensed_provider');
assert.equal(normalizeGateSourceClass('unknown-provider'), 'unclassified');
assert.equal(partnerGateSourcePolicy({ partnerSourceClass: 'crewcheck_verified' }).shareable, true);
assert.equal(partnerGateSourcePolicy({ partnerSourceClass: 'user_reported' }).shareable, true);
assert.equal(partnerGateSourcePolicy({ partnerSourceClass: 'licensed_provider' }).shareable, false);
assert.equal(partnerGateSourcePolicy({}).shareable, false);

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
  partnerSourceClass: 'crewcheck_verified',
  partnerShareable: true,
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
  sourceClass: 'crewcheck_verified',
  shareable: true,
  retrievedAt: '2026-08-26T15:30:00.000Z',
  occurrenceMatch: 'live-flight-route',
});

const restricted = partnerGatePayload({
  ok: true,
  flight: 'LA3729',
  gate: '',
  terminal: '',
  quality: 93,
  partnerSourceClass: 'licensed_provider',
  partnerRestricted: true,
  partnerShareable: false,
}, { flight: 'LA3729', origin: 'GRU', destination: 'BSB' }, now);
assert.equal(restricted.ok, false);
assert.equal(restricted.gate, null);
assert.equal(restricted.gateStatus, 'restricted');
assert.equal(restricted.sourceClass, 'licensed_provider');
assert.equal(restricted.shareable, false);

const unavailable = partnerGatePayload({
  ok: true,
  flight: 'LA3729',
  gate: '',
  quality: 48,
  partnerSourceClass: 'crewcheck_verified',
  partnerShareable: true,
}, { flight: 'LA3729', origin: 'GRU', destination: 'BSB' }, now);
assert.equal(unavailable.ok, false);
assert.equal(unavailable.gate, null);
assert.equal(unavailable.gateStatus, 'unavailable');
assert.equal(unavailable.confidenceBand, 'low');
assert.equal(unavailable.origin, 'GRU');
assert.equal(unavailable.destination, 'BSB');
assert.equal(unavailable.shareable, true);

console.log('partner-gate-api regression: PASS');
