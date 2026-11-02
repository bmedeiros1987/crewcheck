import assert from 'node:assert/strict';
import { runCiriumFlightAwareSequence as run } from '../server/radar-sequential.mjs';
const at = Date.parse('2032-10-31T12:00:00Z'), age = 30 * 60_000;
let scenarios = 0;
for (const origin of ['BSB', 'GRU', 'CGH']) {
  const identity = { flight: 'LA4774', origin, destination: 'AJU', departureDate: '2032-10-31', scheduledDepartureUtc: '2032-10-31T15:00:00Z' };
  const receipt = at - 10 * 60_000;
  const proof = { value: 'Programado', provider: 'cirium-flex', observedAt: null, receivedAt: new Date(receipt).toISOString(), coverageState: 'provided_no_source_freshness' };
  const first = { ...identity, ok: true, provider: 'cirium-flex', sourceReceivedAt: receipt, status: 'Programado', terminal: '2', gate: '', provenance: { fields: { status: proof } } };
  const second = { ...identity, ok: true, provider: 'flightaware', sourceReceivedAt: at, gate: '18', terminal: '', status: '' };
  const query = async (primary = first, fallback = second, admit = async () => true, clock = () => at) => {
    scenarios++;
    return run({ identity, primary: async () => primary, fallback: async () => fallback, admit, now: clock });
  };
  const result = await query();
  assert.equal(result.status, 'Programado', 'Valid primary status must survive empty fallback status');
  assert.equal(result.provider, 'flightaware'); assert.equal(result.gate, '18'); assert.equal(result.terminal, '');
  assert.deepEqual(result.provenance.fields.status, proof, 'Never renew the preserved field receipt or observation');
  assert.equal(result.provenance.fields.departureGate.provider, 'flightaware');
  assert.deepEqual(result.provenance.matchedProviders, ['flightaware', 'cirium-flex']);
  assert.equal(result.sourceReceivedAt, at); assert.equal(result.gateUpdate, null);
  assert.equal(first.provenance.fields.status, proof); assert.equal(first.status, 'Programado');
  const own = await query(first, { ...second, status: 'Embarcando' });
  assert.equal(own.status, 'Embarcando'); assert.equal(own.provenance.fields.status.provider, 'flightaware');
  for (const bad of [
    { ...first, origin: origin === 'GRU' ? 'CGH' : 'GRU' },
    { ...first, flight: 'LA4775' },
    { ...first, scheduledDepartureUtc: '2032-11-01T15:00:00Z' },
    { ...first, sourceReceivedAt: at - age - 1 },
    { ...first, provenance: { fields: {} } },
    { ...first, provenance: { fields: { status: { ...proof, value: 'Cancelado' } } } },
    { ...first, provenance: { fields: { status: { ...proof, provider: 'custom' } } } },
    { ...first, provenance: { fields: { status: { ...proof, receivedAt: new Date(at).toISOString() } } } },
    { ...first, operationalConflicts: ['status'] },
  ]) {
    const rejected = await query(bad);
    assert.equal(rejected.status, ''); assert.equal(rejected.provenance.fields.status, undefined);
  }
  const boundary = { ...first, sourceReceivedAt: at - age, provenance: { fields: { status: { ...proof, receivedAt: new Date(at - age).toISOString() } } } };
  assert.equal((await query(boundary)).status, 'Programado');
  let current = at;
  const expired = await run({ identity, primary: async () => first, fallback: async () => { current = receipt + age + 1; return { ...second, sourceReceivedAt: current }; }, admit: async () => true, now: () => current });
  assert.equal(expired.status, ''); assert.equal(expired.provenance.fields.status, undefined); scenarios++;
  const staleFallback = await query(first, { ...second, sourceReceivedAt: at - age - 1 });
  assert.equal(staleFallback.gate, ''); assert.equal(staleFallback.status, 'Programado');
  let checks = 0;
  const revoked = await query(first, second, async () => ++checks < 4);
  assert.equal(revoked.ok, false); assert.equal(revoked.fallbackReason, 'authority-invalidated');
}
console.log(`PASS status complement: ${scenarios} real-selector scenarios, BSB/GRU/CGH, own provenance/expiry, mismatch/stale/revocation; synthetic sources only`);
