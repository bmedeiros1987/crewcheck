import assert from 'node:assert/strict';
import test from 'node:test';
import * as policy from '../../shared/operational-weather-pulse.mjs';
import * as observation from '../../server/weather/critical-observation.mjs';
import { formatWeatherNoticeDetails } from '../../shared/weatherNoticeDetails.mjs';
import { loadWeatherTs } from './weather-test-loader.mjs';
const review = loadWeatherTs('client/src/lib/alertReviewStore.ts');
const noticesModule = loadWeatherTs('client/src/lib/operationalWeatherNotices.ts', {
  './alertReviewStore': review, '../components/pulse/pulseRuntime': { publishCrewCheckNotice() {}, publishCrewCheckPulse() {}, reconcileCrewCheckPulse() {} },
  '../../../shared/operational-weather-pulse.mjs': policy, '../../../server/weather/critical-observation.mjs': observation,
  '../../../shared/weatherNoticeDetails.mjs': { formatWeatherNoticeDetails },
});
const NOW = Date.parse('2032-02-02T17:30:00Z'), raw = 'METAR SBGR 021730Z 02015G30KT 9000 -RA BKN042';
const flight = { id: 'qa-flight', journeyId: 'qa-journey', flightNumber: 'TEST1', origin: 'GRU', destination: 'GRU',
  originIcao: 'SBGR', destinationIcao: 'SBGR', departure: NOW + 10 * 60_000, arrival: NOW + 30 * 60_000 };
const intent = { scope: policy.WEATHER_PULSE_SCOPE, ownerId: 'owner-a', sourceId: 'source-a', sourceRevision: 'revision-a',
  bindingKey: 'binding', materialKey: 'material', flightId: flight.id, journeyId: flight.journeyId, station: 'SBGR', role: 'origin',
  observedAt: NOW, expiresAt: NOW + 30 * 60_000, severity: 2,
  report: { ok: true, official: true, provider: 'aviationweather', station: 'SBGR', raw, observedAt: new Date(NOW).toISOString() } };
const facts = { raw, taf: 'TAF old synthetic', hazardText: '', severity: 2, observedAt: NOW };
function harness() {
  let owner = 'owner-a', current = true;
  const rows = new Map(), stored = new Map(), announcements = [], pulses = [], reconciliations = [];
  const project = noticesModule.createOperationalWeatherNoticeProjector({ owner: () => owner, reviews: () => rows.get(owner) || [],
    readLegacy: key => stored.get(key) || '', reconcile: (scope, active) => reconciliations.push({ scope, active }),
    notice: message => announcements.push(message), pulse: message => pulses.push(message), format: formatWeatherNoticeDetails });
  return { rows, stored, announcements, pulses, reconciliations, owner(value) { owner = value; }, current(value) { current = value; },
    run({ item = intent, presentation = flight, metadata = facts, now = NOW } = {}) {
      project([item], { context: { ownerId: owner, sourceId: item.sourceId, sourceRevision: item.sourceRevision, flights: [] }, flights: { [presentation.id]: presentation } },
        new Map(metadata ? [[item.station, metadata]] : []), now, () => current);
    } };
}
const legacyRecord = (signature, at = NOW) => {
  const key = `weather:${flight.id}:GRU:${signature}`;
  return { occurrence: review.alertDigest(['notice', key]), version: review.alertDigest([key, 'TEST1 · METAR/TAF com critério operacional relevante.']),
    state: 'dismissed', at: new Date(at).toISOString(), title: 'Synthetic prior copy' };
};
test('exact review preimages ignore role/provider/source/id but preserve clocks/route/absolute observation', () => {
  const identity = noticesModule.operationalWeatherIdentity(intent, flight);
  assert.equal(identity.occurrence, review.alertDigest(['weather-operational-v2', flight.departure, flight.arrival, 'TEST1', 'SBGR', 'SBGR', 'SBGR']));
  assert.equal(identity.version, review.alertDigest(['weather-observation-v2', NOW, raw, 2]));
  const same = noticesModule.operationalWeatherIdentity({ ...intent, role: 'destination', sourceRevision: 'changed', report: { ...intent.report, provider: 'redemet' } },
    { ...flight, id: 'new-positional-id', journeyId: 'new-journey', flightNumber: ' test 1 ' });
  assert.deepEqual(same, identity);
  assert.notEqual(noticesModule.operationalWeatherIdentity(intent, { ...flight, arrival: flight.arrival + 1 }).occurrence, identity.occurrence);
  assert.notEqual(noticesModule.operationalWeatherIdentity({ ...intent, observedAt: NOW + 31 * 86_400_000 }, flight).version, identity.version);
  assert.equal(noticesModule.operationalWeatherIdentity(intent, { ...flight, flightNumber: '' }).occurrence,
    noticesModule.operationalWeatherIdentity(intent, { ...flight, flightNumber: '   ' }).occurrence);
});
test('stable queue id/dedupeKey excludes material/provider metadata and reannouncements are Pulse-only', () => {
  const h = harness(); h.run(); h.run({ item: { ...intent, materialKey: 'changed-provider', report: { ...intent.report, provider: 'redemet' } } });
  assert.equal(h.announcements.length, 1); assert.equal(h.pulses.length, 1);
  const message = h.announcements[0]; assert.equal(message.id, `${policy.WEATHER_PULSE_SCOPE}:owner-a:${message.review.occurrence}`);
  assert.equal(message.dedupeKey, message.id); assert.equal(h.pulses[0].id, message.id);
  assert.equal(message.notificationTag, `crewcheck:weather:owner-a:${message.review.occurrence}`);
  assert.equal(message.notificationCooldownMs, 15 * 60_000); assert.equal(message.pulseCooldownMs, 10 * 60_000);
});
test('TAF-only change preserves exact owner/time-proven legacy dismissal using only its exact stored key', () => {
  const h = harness(), old = [2, raw, facts.taf, ''].join('|');
  h.rows.set('owner-a', [legacyRecord(old)]); h.stored.set(`crewcheck_weather_pulse_signature_${flight.id}_GRU`, old);
  h.run({ metadata: { ...facts, taf: 'TAF changed synthetic' } });
  assert.equal(h.announcements.length, 0); assert.equal(h.pulses.length, 0); assert.equal(h.reconciliations.at(-1).active.length, 0);
  assert.equal(h.rows.get('owner-a').length, 1); // no migration/disposition write
});
for (const at of [NOW - 31 * 86_400_000, NOW - 1, NOW + 1]) test(`legacy review without current observation interval proof is not inherited: ${at}`, () => {
  const h = harness(), old = [2, raw, facts.taf, ''].join('|'); h.rows.set('owner-a', [legacyRecord(old, at)]); h.run(); assert.equal(h.announcements.length, 1);
});
test('global legacy signature is not ownership, seen, delivery or review proof', () => {
  const h = harness(), old = [2, raw, facts.taf, ''].join('|'); h.stored.set(`crewcheck_weather_pulse_signature_${flight.id}_GRU`, old);
  h.rows.set('other-owner', [legacyRecord(old)]); h.run(); assert.equal(h.announcements.length, 1);
});
test('ambiguous legacy delimiter and changed material cannot prove an alias', () => {
  const h = harness(), malformed = [2, raw, 'TAF|ambiguous', ''].join('|');
  h.stored.set(`crewcheck_weather_pulse_signature_${flight.id}_GRU`, malformed); h.rows.set('owner-a', [legacyRecord(malformed)]);
  h.run({ metadata: { ...facts, taf: 'new TAF' } }); assert.equal(h.announcements.length, 1);
});
test('canonical reviewed identity withdraws without needing a legacy signature', () => {
  const h = harness(), identity = noticesModule.operationalWeatherIdentity(intent, flight);
  h.rows.set('owner-a', [{ ...identity, at: new Date(NOW).toISOString(), state: 'reviewed', title: 'Synthetic reviewed' }]);
  h.run(); assert.equal(h.announcements.length, 0); assert.equal(h.reconciliations.at(-1).active.length, 0);
});
test('A→B→A retains process-local owner-qualified announcement history', () => {
  const h = harness(); h.run(); h.owner('owner-b'); h.run({ item: { ...intent, ownerId: 'owner-b' } }); h.owner('owner-a'); h.run();
  assert.equal(h.announcements.length, 2); assert.equal(h.pulses.length, 1);
  assert.notEqual(h.announcements[0].notificationTag, h.announcements[1].notificationTag);
});
test('shorter flight-window expiry never evicts observation announcement before +60m', () => {
  const h = harness(); h.run(); h.run({ item: { ...intent, role: 'destination', expiresAt: NOW + 60 * 60_000 }, now: NOW + 31 * 60_000 });
  assert.equal(h.announcements.length, 1); assert.equal(h.pulses.length, 1);
});
test('ledger saturation is bounded and never evicts an unexpired key to reannounce', () => {
  const h = harness();
  for (let i = 0; i < 130; i++) h.run({ item: { ...intent, observedAt: NOW + i * 1000 }, metadata: undefined, now: NOW + 150_000 });
  assert.equal(h.announcements.length, 128); assert.equal(h.pulses.length, 2);
  h.run({ now: NOW + 150_000 }); assert.equal(h.announcements.length, 128); assert.equal(h.pulses.length, 3);
});
test('invalidated owner/source lease cannot project or announce', () => {
  const h = harness(); h.current(false); h.run(); assert.equal(h.announcements.length, 0); assert.equal(h.reconciliations.at(-1).active.length, 0);
});
