import assert from 'node:assert/strict';
import {
  deriveVoyageRisk,
  isVoyageStateFresh,
  publicLockScreenState,
  sanitizeVoyageLiveState,
} from '../shared/voyageJourney.mjs';

const live = sanitizeVoyageLiveState({
  phase: 'airport',
  flightStatus: 'ON_TIME',
  origin: 'BSB',
  destination: 'GRU',
  gate: '18',
  terminal: '1',
  nextAction: 'Ir para o portão',
  connectionMarginMinutes: 42,
  riskLevel: 'attention',
  updatedAt: '2026-09-04T02:00:00.000Z',
  staleAt: '2026-09-04T02:20:00.000Z',
  passengerName: 'Sensitive Name',
  bookingCode: 'ABC123',
  documentNumber: '00000000000',
});

assert.equal(live.phase, 'airport');
assert.equal(deriveVoyageRisk({ connectionMarginMinutes: 70, freshness: true }), 'healthy');
assert.equal(deriveVoyageRisk({ connectionMarginMinutes: 25, freshness: true }), 'risk');
assert.equal(deriveVoyageRisk({ connectionMarginMinutes: 8, freshness: true }), 'critical');
assert.equal(deriveVoyageRisk({ connectionMarginMinutes: 8, freshness: false }), 'unknown');

const publicState = publicLockScreenState({ ...live, passengerName: 'Sensitive Name', bookingCode: 'ABC123' });
assert.equal('passengerName' in publicState, false);
assert.equal('bookingCode' in publicState, false);
assert.equal('documentNumber' in publicState, false);
assert.equal(publicState.origin, 'BSB');
assert.equal(publicState.destination, 'GRU');

assert.equal(isVoyageStateFresh(live, Date.parse('2026-09-04T02:10:00.000Z')), true);
assert.equal(isVoyageStateFresh(live, Date.parse('2026-09-04T02:21:00.000Z')), false);

console.log('PASS regression-voyage-live-state');
