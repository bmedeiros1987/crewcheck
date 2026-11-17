import assert from 'node:assert/strict';
import {
  normalizeUserIdentityProfile,
  resolveDisplayName,
  createContinuityContext,
  canResumeContinuity,
  createHandoffIntent,
  consumeHandoffIntent,
  advanceNotificationReceipt,
  mergeNotificationReceipt,
  surfaceCapabilities,
  normalizeCrewciergeResponse,
} from '../shared/continuity.mjs';

const NOW = Date.parse('2026-09-21T22:00:00Z');

const identity = normalizeUserIdentityProfile({
  userId: 'user-a',
  preferredName: '  Bruno  ',
  callSign: ' Saraiva ',
  discoverableByCallSign: true,
  display: { watch: 'callSign', tv: 'preferredName', crewSearch: 'callSign' },
});
assert.equal(identity.preferredName, 'Bruno');
assert.equal(identity.callSign, 'Saraiva');
assert.equal(resolveDisplayName(identity, 'wear_os'), 'Saraiva');
assert.equal(resolveDisplayName(identity, 'tv'), 'Bruno');
assert.equal(resolveDisplayName(identity, 'crew_search'), 'Saraiva');

const context = createContinuityContext({
  userId: 'user-a',
  sourceSurface: 'mobile',
  activeJourneyId: 'journey-123',
  activeFlightId: 'LA3287',
  conversationId: 'conv-1',
  lastIntent: 'get_gate',
  now: NOW,
  ttlMs: 15 * 60_000,
});
assert.equal(context.userId, 'user-a');
assert.equal(context.activeJourneyId, 'journey-123');
assert.equal(canResumeContinuity(context, { userId: 'user-a', now: NOW + 1_000 }), true);
assert.equal(canResumeContinuity(context, { userId: 'user-b', now: NOW + 1_000 }), false, 'cross-account continuity must fail closed');
assert.equal(canResumeContinuity(context, { userId: 'user-a', now: NOW + 16 * 60_000 }), false, 'expired continuity must fail closed');

const handoff = createHandoffIntent({
  userId: 'user-a',
  from: 'wear_os',
  target: 'mobile',
  destination: 'flightdeck',
  contextRef: { journeyId: 'journey-123', flightId: 'LA3287', conversationId: 'conv-1' },
  now: NOW,
  ttlMs: 5 * 60_000,
});
assert.equal(consumeHandoffIntent(handoff, { userId: 'user-b', now: NOW + 1_000 }).ok, false, 'handoff may not cross accounts');
const firstConsume = consumeHandoffIntent(handoff, { userId: 'user-a', now: NOW + 1_000 });
const secondConsume = consumeHandoffIntent(handoff, { userId: 'user-a', now: NOW + 2_000 });
assert.deepEqual(firstConsume, secondConsume, 'handoff consumption must be idempotent and side-effect free');
assert.equal(firstConsume.ok, true);
assert.equal(firstConsume.contextRef.flightId, 'LA3287');

const delivered = advanceNotificationReceipt(null, {
  eventId: 'gate-change-1',
  userId: 'user-a',
  state: 'delivered',
  surface: 'wear_os',
  now: NOW,
});
const seen = advanceNotificationReceipt(delivered, {
  eventId: 'gate-change-1',
  userId: 'user-a',
  state: 'seen',
  surface: 'wear_os',
  now: NOW + 1_000,
});
const staleDelivery = advanceNotificationReceipt(seen, {
  eventId: 'gate-change-1',
  userId: 'user-a',
  state: 'delivered',
  surface: 'mobile',
  now: NOW + 2_000,
});
assert.equal(staleDelivery.state, 'seen', 'receipt state cannot regress');

const acted = advanceNotificationReceipt(seen, {
  eventId: 'gate-change-1',
  userId: 'user-a',
  state: 'acted',
  surface: 'mobile',
  now: NOW + 3_000,
});
assert.equal(acted.state, 'acted');
assert.throws(() => mergeNotificationReceipt(acted, { ...acted, userId: 'user-b' }), /identity/i);

assert.equal(surfaceCapabilities('wear_os').audioInput, true);
assert.equal(surfaceCapabilities('tv').sharedEnvironment, true);
assert.equal(surfaceCapabilities('car').longFormText, false);
assert.equal(surfaceCapabilities('mobile').handoff, true);

const response = normalizeCrewciergeResponse({
  responseId: 'resp-1',
  intent: 'get_gate',
  headline: 'Portão 22',
  shortText: 'Portão 22 · atualizado há 3 min',
  speechText: 'Bruno, seu portão atual é o vinte e dois.',
  primaryFact: { kind: 'gate', value: '22' },
  actions: [{ kind: 'open_flightdeck', label: 'Abrir FlightDeck' }],
  provenance: { source: 'radar', observedAt: '2026-09-21T21:57:00Z', freshness: 'current' },
  privacyClass: 'personal',
});
assert.equal(response.primaryFact.value, '22');
assert.equal(response.actions[0].kind, 'open_flightdeck');
assert.equal(response.provenance.source, 'radar');

for (const forbidden of ['roster', 'days', 'rawText', 'compliance']) {
  assert.equal(Object.prototype.hasOwnProperty.call(context, forbidden), false, `continuity must not own canonical field ${forbidden}`);
  assert.equal(Object.prototype.hasOwnProperty.call(handoff, forbidden), false, `handoff must not copy canonical field ${forbidden}`);
}

console.log('CrewCheck Continuity foundation regression: PASS');
