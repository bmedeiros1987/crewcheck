// Actual server provider/normalizer; fake transport and credentials, no app import.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { runCiriumFlightAwareSequence as run } from '../server/radar-sequential.mjs';
import { radarResultDecision } from '../shared/gate-query-day.mjs';
const source = fs.readFileSync('server.mjs', 'utf8');
const ast = ts.createSourceFile('server.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const names = ['firstKnown', 'normalizeFlightAwareFlight', 'providerFlightAware'];
const code = names.map(name => { const n = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name); assert(n, name); return n.getText(ast); }).join('\n');
const at = Date.parse('2032-10-31T12:00:00Z');
class Clock extends Date { static now() { return at; } }
let transportCalls = 0, healthWrites = 0, scenarios = 0;
for (const origin of ['BSB', 'GRU', 'CGH']) {
  const identity = { flight: 'LA4774', origin, destination: 'AJU', departureDate: '2032-10-31', scheduledDepartureUtc: '2032-10-31T15:00:00Z' };
  let row = { ident: 'LA4774', origin: { code_iata: origin }, destination: { code_iata: 'AJU' }, scheduled_out: identity.scheduledDepartureUtc, gate_origin: '18', terminal_origin: '', cancelled: false };
  const scope = vm.createContext({ Date: Clock, process: { env: { RADAR_FLIGHTAWARE_FALLBACK_ENABLED: 'true', CIRIUM_FLEX_RADAR_ENABLED: 'true' } },
    envAny: () => 'synthetic', providerAvailable: () => true, markProvider: () => healthWrites++, radarResultDecision,
    jsonFetch: async () => { transportCalls++; return { response: { ok: true }, payload: { flights: [row] } }; } });
  vm.runInContext(code, scope);
  const ctx = { flightAware: 'LA4774', flightAwareBudgetGranted: true, gateQueryEvidence: identity };
  const receipt = at - 600_000;
  const proof = { value: 'Programado', provider: 'cirium-flex', observedAt: null, receivedAt: new Date(receipt).toISOString(), coverageState: 'provided_no_source_freshness' };
  const primary = { ...identity, ok: true, provider: 'cirium-flex', sourceReceivedAt: receipt, status: 'Programado', cancelled: false, gate: '', provenance: { fields: { status: proof } } };
  for (const status of [undefined, null, '', '   ']) {
    row = { ...row, status };
    const adapted = await scope.providerFlightAware(ctx, 100);
    assert.equal(adapted.status, '', 'Real FlightAware adapter must not manufacture Monitorando');
    const result = await run({ identity, primary: async () => primary, fallback: async () => ({ ...adapted, sourceReceivedAt: at }), admit: async () => true, now: () => at });
    assert.equal(result.status, 'Programado'); assert.equal(result.cancelled, false);
    assert.equal(result.gate, '18'); assert.equal(result.terminal, '');
    assert.deepEqual(result.provenance.fields.status, proof); scenarios++;
  }
  for (const [over, expected, cancelled] of [[{ status: 'Embarcando' }, 'Embarcando', false], [{ status: '', cancelled: true }, 'Cancelado', true], [{ status: '', cancelled: false, progress_percent: 100 }, 'Finalizado', false]]) {
    row = { ...row, ...over };
    const adapted = await scope.providerFlightAware(ctx, 100);
    assert.equal(adapted.status, expected); assert.equal(adapted.cancelled, cancelled);
    const result = await run({ identity, primary: async () => primary, fallback: async () => ({ ...adapted, sourceReceivedAt: at }), admit: async () => true, now: () => at });
    assert.equal(result.status, expected); assert.equal(result.cancelled, cancelled);
    assert.equal(result.provenance.fields.status.provider, 'flightaware'); scenarios++;
  }
}
assert.equal(transportCalls, 21); assert.equal(healthWrites, 21);
console.log(`PASS actual FlightAware provider/normalizer + real sequence: ${scenarios} cases BSB/GRU/CGH; fake transport only`);
