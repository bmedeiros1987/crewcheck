import assert from 'node:assert/strict';
import {
  SAFETY_ASSIST_STATES,
  SAFETY_DELIVERY_STATES,
  buildSafetyAssistSession,
  canReportSafetyDelivery,
  classifySafetyTelemetry,
  isSafetySessionActive,
} from '../server/safety/safetyAssistContract.mjs';

const now = new Date('2026-09-09T23:00:00.000Z');

const session = buildSafetyAssistSession({
  sessionId: 'test-session',
  reason: 'unsafe',
  durationMinutes: 20,
  expectedArrivalAt: '2026-09-09T23:12:00.000Z',
  recipientIds: ['trusted-a', 'trusted-a', 'trusted-b'],
  shareLocation: true,
  source: 'watch',
}, now);

assert.equal(session.state, SAFETY_ASSIST_STATES.STARTING);
assert.equal(session.recipientIds.length, 2, 'recipients must be de-duplicated');
assert.equal(session.shareLocation, true);
assert.equal(session.source, 'watch');
assert.equal(session.expiresAt, '2026-09-09T23:20:00.000Z');

const active = { ...session, state: SAFETY_ASSIST_STATES.ACTIVE };
const realNow = Date.now;
Date.now = () => new Date('2026-09-09T23:05:00.000Z').getTime();
try {
  assert.equal(isSafetySessionActive(active), true);
} finally {
  Date.now = realNow;
}

const healthy = classifySafetyTelemetry(active, {
  lastLocationAt: '2026-09-09T23:04:30.000Z',
  batteryPercent: 70,
  networkAvailable: true,
}, new Date('2026-09-09T23:05:00.000Z'));
assert.equal(healthy.state, SAFETY_ASSIST_STATES.ACTIVE);
assert.deepEqual(healthy.reasons, []);

const degraded = classifySafetyTelemetry(active, {
  lastLocationAt: '2026-09-09T22:40:00.000Z',
  batteryPercent: 7,
  networkAvailable: false,
  routeDeviationMaterial: true,
}, new Date('2026-09-09T23:05:00.000Z'));
assert.equal(degraded.state, SAFETY_ASSIST_STATES.DEGRADED);
assert.ok(degraded.reasons.includes('location_stale'));
assert.ok(degraded.reasons.includes('battery_critical'));
assert.ok(degraded.reasons.includes('network_unavailable'));
assert.ok(degraded.reasons.includes('route_deviation'));

const overdue = classifySafetyTelemetry(active, {
  lastLocationAt: '2026-09-09T23:19:30.000Z',
  batteryPercent: 80,
  networkAvailable: true,
}, new Date('2026-09-09T23:23:00.000Z'));
assert.ok(overdue.reasons.includes('arrival_overdue'));

assert.equal(canReportSafetyDelivery(SAFETY_DELIVERY_STATES.DELIVERED), true);
assert.equal(canReportSafetyDelivery('made_up_success'), false, 'unknown delivery state must never be presented as success');

assert.throws(() => buildSafetyAssistSession({ reason: 'unsupported' }, now));

console.log('Safety Assist foundation regressions: PASS');
