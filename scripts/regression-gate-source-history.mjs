import assert from 'node:assert/strict';
import { inspectGateSourceHistory } from '../server/web-push/gateSourceHistory.mjs';

globalThis.fetch = () => { throw Error('External requests forbidden'); };
const now = Date.parse('2032-10-14T12:00:00Z');
const identity = { flight: 'LA100', origin: 'GRU', destination: 'REC', departureDate: '2032-10-14', scheduledDepartureUtc: '2032-10-14T13:00:00Z' };
const scope = { ownerId: 'owner_fixture_A', rosterRevision: 'roster_fixture_v1', identity };
const observation = (gate, offset) => ({ ok: true, provider: 'custom', ...identity, gate, sourceReceivedAt: now + offset + 1000,
  departureGateUpdate: { schema: 'crewcheck.departure-gate-update.v1', ...identity, gate, updatedAt: new Date(now + offset).toISOString() } });
const source = () => ({ ownerId: scope.ownerId, rosterRevision: scope.rosterRevision, previousObservation: observation('24', -60000), observation: observation('25', -30000) });
const inspect = value => inspectGateSourceHistory(value, scope, now);
let checks = 0;
const status = (value, expected, label) => { assert.equal(inspect(value).status, expected, label); checks++; };
status(source(), 'change', 'existing custom proof with ordered source and receipt clocks');
status({ ...source(), previousObservation: null }, 'baseline', 'first observation cannot enqueue a change');
status({ ...source(), previousObservation: undefined }, 'baseline', 'missing history cannot enqueue');
status({ ...source(), previousObservation: observation('25', -60000) }, 'unchanged', 'new source time is not a changed gate');
status({ ...source(), previousObservation: observation('25', -30000) }, 'unchanged', 'exact replay');
status({ ...source(), previousObservation: observation('24', -30000) }, 'blocked', 'equal source instant conflict');
status({ ...source(), previousObservation: observation('24', -20000) }, 'blocked', 'out of order history');
for (const delta of [{ ownerId: 'owner_fixture_B' }, { rosterRevision: 'other_roster' }, { rosterRevision: '' }]) status({ ...source(), ...delta }, 'blocked', 'scope mismatch');
for (const which of ['observation', 'previousObservation']) {
  for (const delta of [
    { provider: 'cirium' }, { provider: 'aerodatabox', lastUpdatedUtc: new Date(now).toISOString() },
    { provider: 'airlabs', updated: now / 1000 }, { provider: undefined }, { ok: false }, { querySuppressed: true },
    { operationalConflicts: ['gate'] }, { sourceReceivedAt: undefined }, { sourceReceivedAt: now + 1 },
    { sourceReceivedAt: now - 120000 }, { sourceReceivedAt: String(now) }, { departureGateUpdate: undefined },
    { flight: 'LA101' }, { destination: 'BSB' }, { scheduledDepartureUtc: '2032-10-15T13:00:00Z' },
    { gate: 'STAND 12' },
  ]) {
    const value = source(); value[which] = { ...value[which], ...delta };
    status(value, 'blocked', which + ' ' + JSON.stringify(delta));
  }
  for (const delta of [{ gate: '26' }, { origin: 'CGH' }, { destination: 'BSB' }, { flight: 'LA101' },
    { scheduledDepartureUtc: '2032-10-15T13:00:00Z' }, { updatedAt: new Date(now + 1).toISOString() },
    { updatedAt: new Date(now - 1800001).toISOString() }, { updatedAt: '2032-10-14 11:59' }]) {
    const value = source(); value[which].departureGateUpdate = { ...value[which].departureGateUpdate, ...delta };
    status(value, 'blocked', which + ' source proof contradiction');
  }
}
const receiptOrder = source(); receiptOrder.previousObservation.sourceReceivedAt = now;
status(receiptOrder, 'blocked', 'history cannot arrive after the current sample');
const boundary = source(); boundary.previousObservation = observation('24', -1800000);
status(boundary, 'change', '30 minute boundary stays admitted');
assert.equal(inspectGateSourceHistory(source(), scope, now + 1800001).status, 'blocked'); checks++;
const original = source(), before = JSON.stringify(original), result = inspect(original);
assert.equal(JSON.stringify(original), before, 'reader result never mutated');
result.current.gate = '99'; assert.equal(original.observation.gate, '25'); checks += 2;
assert.equal(inspectGateSourceHistory(source(), { ...scope, identity: { ...identity, departureDate: '2032-10-15' } }, now).status, 'blocked'); checks++;
console.log(`PASS gate source/history ${checks} checks (TZ=${process.env.TZ || 'default'}): existing custom contract only, source/receipt chronology, exact occurrence, baseline/change/replay/conflict; no storage/network/provider activation`);
