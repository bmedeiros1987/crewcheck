import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';
import * as policy from '../shared/gate-query-day.mjs';
import * as radarEvidence from '../shared/radar-field-evidence.mjs';
import { customGateSourceUpdate } from '../server/gate-source-update.mjs';
import { selectAeroDataBoxOccurrence } from '../server/aerodatabox-occurrence.mjs';
import { prepareConciergeCanonicalBridge } from './p1-concierge-journey/bridge.mjs';
// Synthetic flights/accounts only. No provider, Telegram, network or real data.
globalThis.fetch = () => { throw Error('External network forbidden'); };
prepareConciergeCanonicalBridge();
const { buildCanonicalRosterEvents } = await import('../server/concierge/generated/canonicalRoster.mjs');
const { radarFieldEvidenceGaps, verifiedRadarFields, radarEvidenceGapLabel, normalizeRadarGate, RADAR_FIELD_FRESH_MS, retainAgreeingRadarGateProof } = radarEvidence;

let now = Date.parse('2032-10-14T11:00:00Z');
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const identity = { flight: 'LA100', origin: 'GRU', destination: 'REC', departureDate: '2032-10-14', scheduledDepartureUtc: '2032-10-14T12:00:00Z' };
const iso = ms => new Date(ms).toISOString();
const proof = (over = {}) => ({ version: 1, provider: 'custom', kind: 'departure-gate-update', sourceUpdatedAt: iso(now - 60000), gate: '12', flight: 'LA100', origin: 'GRU', destination: 'REC', scheduledDepartureUtc: '2032-10-14T12:00:00.000Z', ...over });
const item = (over = {}) => ({ ok: true, flight: 'LA100', origin: 'GRU', destination: 'REC', scheduledDepartureUtc: '2032-10-14T12:00:00Z', gate: '12', status: 'Embarque', registration: 'PR-XYZ', sourceReceivedAt: now, gateUpdate: proof(), ...over });
const payloadOf = over => { const raw = item(over); return { ...raw, ...radarFieldEvidenceGaps(raw, now) }; };

// 1. Contract: evidence only from the source-owned observation instant.
{
  let p = payloadOf();
  assert.equal('operationalEvidence' in p, false, 'no second evidence object: the app decision stays on gateUpdate');
  assert.deepEqual(p.operationalEvidenceGaps, { status: 'source-observation-missing', registration: 'source-observation-missing' });
  let v = verifiedRadarFields(p, identity, now);
  assert.deepEqual([v.gate, v.status, v.registration], ['12', '', '']);
  assert.deepEqual(v.observedAt, { gate: iso(now - 60000) });
  // Same gate vocabulary as the app: prefix stripped; position/TBD/oversized never a gate.
  assert.equal(verifiedRadarFields(payloadOf({ gate: 'Portão 12', gateUpdate: proof({ gate: 'PORTÃO 12' }) }), identity, now).gate, '12');
  for (const odd of ['STAND 12', 'Box 3', 'TBD', 'N/A', 'A confirmar', 'G'.repeat(13)]) {
    const q = payloadOf({ gate: odd, gateUpdate: proof({ gate: odd }) });
    assert.equal(normalizeRadarGate(odd), '', odd); assert.equal(q.operationalEvidenceGaps.gate, undefined, odd);
    assert.equal(verifiedRadarFields(q, identity, now).gate, '', odd);
  }
  // Receipt/cache/HTTP clocks or generic stamps never become observation proof.
  for (const legacy of [{ gateUpdate: null }, { gateUpdate: null, updated: Math.floor(now / 1000), lastUpdatedUtc: iso(now - 1000), updatedAt: iso(now), sourceReceivedAt: now }]) {
    p = payloadOf(legacy);
    assert.equal(p.operationalEvidenceGaps.gate, 'source-observation-missing');
    assert.equal(verifiedRadarFields(p, identity, now).gate, '');
  }
  const cases = [
    [{ operationalConflicts: ['gate'] }, 'source-conflict'],
    [{ gateUpdate: proof({ sourceUpdatedAt: iso(now - RADAR_FIELD_FRESH_MS - 1) }) }, 'source-observation-stale'],
    [{ gateUpdate: proof({ sourceUpdatedAt: iso(now + 1000) }) }, 'source-observation-invalid'],
    [{ sourceReceivedAt: now - 120000 }, 'source-observation-invalid'],
    [{ gateUpdate: proof({ gate: '13' }) }, 'source-value-mismatch'],
    [{ gateUpdate: proof({ sourceUpdatedAt: '2032-10-14 10:59' }) }, 'source-observation-invalid'],
    [{ gateUpdate: { ...proof(), provider: 'aerodatabox' } }, 'source-observation-missing'],
  ];
  for (const [over, reason] of cases) {
    p = payloadOf(over);
    assert.equal(p.operationalEvidenceGaps.gate, reason);
    v = verifiedRadarFields(p, identity, now);
    assert.equal(v.gate, '', reason);
    assert.equal(v.gaps.gate, reason);
    assert(radarEvidenceGapLabel(reason), reason);
  }
  assert.equal(verifiedRadarFields(payloadOf({ gateUpdate: proof({ sourceUpdatedAt: iso(now - RADAR_FIELD_FRESH_MS) }) }), identity, now).gate, '12', '30 min boundary admitted');
  // Placeholders are not source values and produce no gap.
  assert.deepEqual(payloadOf({ status: 'Monitorando', registration: '' }).operationalEvidenceGaps, {});
  // Freshness is re-evaluated when consumed.
  p = payloadOf();
  assert.equal(verifiedRadarFields(p, identity, now + RADAR_FIELD_FRESH_MS - 60000).gate, '12');
  assert.equal(verifiedRadarFields(p, identity, now + RADAR_FIELD_FRESH_MS - 59000).gaps.gate, 'source-observation-stale');
  // Occurrence, route and time zone of the exact published flight.
  assert.equal(verifiedRadarFields(p, { ...identity, scheduledDepartureUtc: '2032-10-14T09:00:00-03:00' }, now).gate, '12', 'same instant in another offset');
  for (const other of [{ flight: 'LA101' }, { origin: 'CGH' }, { destination: 'BSB' }, { scheduledDepartureUtc: '2032-10-15T12:00:00Z' }, { scheduledDepartureUtc: '2032-10-14T12:00:00' }]) {
    v = verifiedRadarFields(p, { ...identity, ...other }, now);
    assert.equal(v.gate, ''); assert.equal(v.gaps.gate, 'occurrence-unverified'); assert.equal(v.gaps.status, 'occurrence-unverified');
  }
  v = verifiedRadarFields({ ...p, gateUpdate: proof({ destination: 'BSB' }) }, identity, now);
  assert.equal(v.gaps.gate, 'occurrence-unverified', 'proof of another segment');
  v = verifiedRadarFields({ ...p, gate: '13' }, identity, now);
  assert.equal(v.gaps.gate, 'source-value-mismatch', 'proof cannot vouch for another value');
  v = verifiedRadarFields({ ...p, operationalEvidence: { status: { version: 1, value: 'Embarque', sourceObservedAt: iso(now - 1000), provenance: 'forged' } } }, identity, now);
  assert.equal(v.status, '', 'status has no source contract; a payload-supplied evidence object is never trusted');
  assert.deepEqual(verifiedRadarFields({ ...p, ok: false }, identity, now), { gate: '', status: '', registration: '', gaps: {}, observedAt: {} });
  console.log('PASS radar field evidence contract: source-owned observation only; conflict/stale/future/receipt/mismatch/placeholder; occurrence/route/offset');
}

// Agreeing proof belongs to the field, with its own original receipt, never the
// richer winner's receipt or generic clocks. Raw values/provider identity stay put.
{
  const winner = item({ gateUpdate: null, provider: 'aerodatabox', sourceReceivedAt: now - 120000 });
  const candidate = item({ provider: 'custom', sourceReceivedAt: now - 30000 });
  const selected = retainAgreeingRadarGateProof(winner, [winner, candidate], identity, now);
  assert.equal(selected.provider, 'aerodatabox'); assert.equal(selected.sourceReceivedAt, winner.sourceReceivedAt);
  assert.equal(selected.gateEvidenceReceivedAt, candidate.sourceReceivedAt); assert.equal(selected.gateUpdate.provider, 'custom');
  assert.equal(verifiedRadarFields(selected, identity, now).gate, '12', 'proof may be newer than the winning response, using its own receipt');
  assert.equal(winner.gateUpdate, null, 'winner never mutated');
  assert.equal(verifiedRadarFields(selected, identity, now + RADAR_FIELD_FRESH_MS).gate, '', 'composition never renews proof');
  for (const delta of [{ gate: '13' }, { flight: 'LA101' }, { origin: 'CGH' }, { destination: 'BSB' },
    { scheduledDepartureUtc: '2032-10-15T12:00:00Z' }, { sourceReceivedAt: now + 1 }, { sourceReceivedAt: now - 120000 },
    { sourceReceivedAt: undefined }, { operationalConflicts: ['gate'] }, { gateUpdate: proof({ provider: 'cirium-sky' }) },
    { gateUpdate: proof({ sourceUpdatedAt: iso(now - RADAR_FIELD_FRESH_MS - 1) }) }, { gateUpdate: proof({ sourceUpdatedAt: iso(now + 1) }) }]) {
    assert.equal(retainAgreeingRadarGateProof(winner, [{ ...candidate, ...delta }], identity, now), winner, JSON.stringify(delta));
  }
  for (const delta of [{ gate: '13' }, { flight: 'LA101' }, { destination: 'BSB' }, { operationalConflicts: ['gate'] }, { querySuppressed: true }]) {
    const other = { ...winner, ...delta };
    assert.equal(retainAgreeingRadarGateProof(other, [candidate], identity, now), other, 'never attach to another selected value/occurrence');
  }
  const newer = item({ gateUpdate: proof({ sourceUpdatedAt: iso(now - 10000) }) });
  for (const rows of [[candidate, newer], [newer, candidate]]) assert.equal(retainAgreeingRadarGateProof(winner, rows, identity, now).gateUpdate.sourceUpdatedAt, newer.gateUpdate.sourceUpdatedAt);
  console.log('PASS cross-provider proof composition: exact value/occurrence, original receipt, stale/future/conflict refusals, ordering, no mutation or renewed freshness');
}

// 2. Actual server adapters and public projection.
const source = fs.readFileSync('server.mjs', 'utf8'), ast = ts.createSourceFile('server.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const extract = (text, names, file) => { const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS); return names.map(name => { const node = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name); assert(node, name); return node.getText(tree); }).join('\n'); };
let bodies = {}, envs = new Set(), writes = 0, snapshot = null;
const leg = { flightNumber: 'LA100', origin: 'GRU', destination: 'REC', departureTime: '09:00', arrivalTime: '11:00', gate: 'published-7' };
const roster = { year: 2032, month: 10, base: 'GRU', days: [{ date: '14/10/2032', type: 'VOO', dutyReport: '08:00', dutyDebrief: '11:30', legs: [leg] }] };
const scope = vm.createContext({ ...policy, ...radarEvidence, Date: FixedDate, buildCanonicalRosterEvents, gateQueryDay: (x, t) => policy.gateQueryDay(x, t ?? now), URL, setTimeout, clearTimeout, process: { env: { CREWCHECK_RADAR_TIMEOUT_MS: '800' } },
  envAny: keys => keys.find(key => envs.has(key)) ? (keys.includes('CREWCHECK_FLIGHT_STATUS_URL') ? 'https://fixture.invalid/{flight}' : 'OFFLINE_ONLY') : '',
  providerAvailable: keys => true, markProvider: () => {}, customGateSourceUpdate: payload => customGateSourceUpdate(payload, now), selectAeroDataBoxOccurrence,
  jsonFetch: async url => { const host = new URL(url).hostname; const key = host.includes('aerodatabox') ? 'aerodatabox' : host.includes('airlabs') ? 'airlabs' : 'custom'; return { response: { ok: key in bodies }, payload: structuredClone(bodies[key] ?? null) }; },
  providerFlightAware: async () => null, providerAviationstack: async () => null,
  ciriumRadarInjectionEnabled: () => false, ciriumRadarProjection: () => ({}), configuredProviders: () => [],
  conciergeExtractFlight: () => 'LA100', conciergeAccessMatches: () => true, conciergeLoadSnapshot: async () => snapshot, conciergeSaveSnapshotAsync: async () => { writes++; },
  conciergeNextProgram: () => ({ day: roster.days[0], legs: roster.days[0].legs }), conciergeFindFlight: () => ({ record: { day: roster.days[0], legs: roster.days[0].legs }, leg: roster.days[0].legs[0] }) });
vm.runInContext(extract(source, ['firstKnown', 'normalizeFlightRaw', 'buildFlightContext', 'scoreRadar', 'publicRadarPayload', 'providerCustom', 'providerAirLabs', 'providerAeroDataBox', 'runRadarRace', 'conciergeApplyRadar', 'conciergeRadarReply'], 'server.mjs'), scope);
const race = async () => { const ctx = scope.buildFlightContext('LA100'); ctx.gateQueryEvidence = identity; return scope.runRadarRace(ctx, 'GRU', 'REC'); };
const aerodatabox = (over = {}) => [{ number: 'LA 100', status: 'Boarding', lastUpdatedUtc: '2032-10-14 10:59Z', departure: { gate: '13', airport: { iata: 'GRU' }, scheduledTime: { utc: '2032-10-14 12:00Z' } }, arrival: { airport: { iata: 'REC' } }, aircraft: { reg: 'PR-ABC' }, ...over }];
const airlabs = () => ({ response: { flight_iata: 'LA100', dep_iata: 'GRU', arr_iata: 'REC', dep_gate: '13', status: 'scheduled', dep_time_utc: '2032-10-14T12:00:00Z', updated: Math.floor(now / 1000) - 30 } });
const custom = (over = {}) => ({ flight: 'LA100', origin: 'GRU', destination: 'REC', gate: '12', status: 'Embarque', scheduledDepartureUtc: '2032-10-14T12:00:00Z',
  departureGateUpdate: { schema: 'crewcheck.departure-gate-update.v1', gate: '12', flight: 'LA100', origin: 'GRU', destination: 'REC', scheduledDepartureUtc: '2032-10-14T12:00:00Z', updatedAt: iso(now - 60000) }, ...over });
const scenario = async (selected, data) => { envs = new Set(selected); bodies = data; return race(); };
const payloads = {};
payloads.aerodatabox = await scenario(['AERODATABOX_API_KEY'], { aerodatabox: aerodatabox() });
assert.equal(payloads.aerodatabox.ok, true); assert.equal(payloads.aerodatabox.gate, '13');
assert.equal(verifiedRadarFields(payloads.aerodatabox, identity, now).gate, '', 'lastUpdatedUtc is not field observation');
assert.equal('operationalEvidence' in payloads.aerodatabox, false);
assert.deepEqual(payloads.aerodatabox.operationalEvidenceGaps, { gate: 'source-observation-missing', status: 'source-observation-missing', registration: 'source-observation-missing' });
payloads.airlabs = await scenario(['AIRLABS_API_KEY'], { airlabs: airlabs() });
assert.equal(payloads.airlabs.ok, true); assert.equal(payloads.airlabs.operationalEvidenceGaps.gate, 'source-observation-missing', 'generic updated stamp is not field observation');
payloads.custom = await scenario(['CREWCHECK_FLIGHT_STATUS_URL'], { custom: custom() });
assert.equal(payloads.custom.gateUpdate.sourceUpdatedAt, iso(now - 60000)); assert.equal(payloads.custom.operationalEvidenceGaps.gate, undefined);
assert.equal(verifiedRadarFields(payloads.custom, identity, now).gate, '12');
assert.equal(payloads.custom.operationalEvidenceGaps.status, 'source-observation-missing', 'status has no source observation contract');
const agreeingRich = () => aerodatabox({ departure: { gate: '12', terminal: 'T1', airport: { iata: 'GRU' }, scheduledTime: { utc: '2032-10-14 12:00Z' }, estimatedTime: { utc: '2032-10-14 12:05Z' } }, arrival: { airport: { iata: 'REC' }, scheduledTime: { utc: '2032-10-14 14:00Z' } }, aircraft: { reg: 'PR-ABC', model: 'A320' } });
payloads.agreeingRich = await scenario(['CREWCHECK_FLIGHT_STATUS_URL', 'AERODATABOX_API_KEY'], { custom: custom(), aerodatabox: agreeingRich() });
assert.equal(payloads.agreeingRich.terminal, 'T1', 'richer AeroDataBox response must win the whole-response score');
assert.equal(payloads.agreeingRich.alternatives, 2, 'custom proof was already available when the race finished');
assert.equal(verifiedRadarFields(payloads.agreeingRich, identity, now).gate, '12', 'agreeing custom field proof survives a richer winner');
assert.equal(payloads.agreeingRich.gateUpdate.provider, 'custom', 'proof provenance stays separate from the winning response');
assert.equal(payloads.agreeingRich.operationalEvidenceGaps.gate, undefined);
payloads.customStale = await scenario(['CREWCHECK_FLIGHT_STATUS_URL'], { custom: custom({ departureGateUpdate: { ...custom().departureGateUpdate, updatedAt: iso(now - RADAR_FIELD_FRESH_MS - 60000) } }) });
assert.equal(payloads.customStale.operationalEvidenceGaps.gate, 'source-observation-stale');
payloads.conflict = await scenario(['CREWCHECK_FLIGHT_STATUS_URL', 'AERODATABOX_API_KEY'], { custom: custom(), aerodatabox: aerodatabox() });
assert(payloads.conflict.operationalConflicts.includes('gate')); assert.equal(payloads.conflict.operationalEvidenceGaps.gate, 'source-conflict');
payloads.position = await scenario(['CREWCHECK_FLIGHT_STATUS_URL'], { custom: custom({ gate: 'STAND 12', departureGateUpdate: { ...custom().departureGateUpdate, gate: 'STAND 12' } }) });
payloads.prefixed = await scenario(['CREWCHECK_FLIGHT_STATUS_URL'], { custom: custom({ gate: 'Portão 12', departureGateUpdate: { ...custom().departureGateUpdate, gate: 'PORTÃO 12' } }) });
payloads.otherDay = await scenario(['AERODATABOX_API_KEY'], { aerodatabox: aerodatabox({ departure: { gate: '13', airport: { iata: 'GRU' }, scheduledTime: { utc: '2032-10-15 12:00Z' } } }) });
assert.equal(payloads.otherDay.ok, false, 'other occurrence is suppressed before projection');
console.log('PASS actual adapters: AeroDataBox lastUpdatedUtc and AirLabs updated stay unproven; custom gate proof only; stale/conflict/other day');

// 3. Parity with the actual app consumer (no relaxation, same decision).
const compiled = await build({ stdin: { contents: "export * from './client/src/lib/nextFlightGate';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', write: false });
const app = { exports: {} }; Function('module', 'exports', 'require', compiled.outputFiles[0].text)(app, app.exports, () => ({}));
const event = { id: 'synthetic-la100', kind: 'flight', flightNumber: 'LA100', origin: 'GRU', destination: 'REC', day: { date: '14/10/2032' }, canonical: { date: '2032-10-14', startDateTime: '2032-10-14T12:00:00Z' }, date: new Date('2032-10-14T12:00:00Z') };
const appGate = (payload, at) => app.exports.resolveNextFlightGate({ event, radar: { ...payload, sourceOrigin: payload.origin, sourceDestination: payload.destination, updatedAt: now }, now: at });
payloads.separateReceipts = retainAgreeingRadarGateProof(item({ gateUpdate: null, sourceReceivedAt: now - 120000 }), [item({ sourceReceivedAt: now - 30000 })], identity, now);
const decided = { accepted: 0, refused: 0 };
for (const [name, payload] of Object.entries(payloads)) for (const at of [now, now + 29 * 60000, now + 31 * 60000]) {
  if (!payload.ok) continue;
  const server = verifiedRadarFields(payload, identity, at), client = appGate(payload, at);
  assert.equal(server.gate, client.gateSource === 'radar' ? client.gate : '', `${name} @${at - now}`);
  decided[server.gate ? 'accepted' : 'refused']++;
}
assert(decided.accepted >= 2 && decided.refused >= 10, JSON.stringify(decided));
console.log(`PASS server/app parity for gate decision (TZ=${process.env.TZ || 'default'})`);

// 4. Telegram /radar and Concierge persistence through the actual reply.
for (const [label, data, expectGate] of [['legacy', { aerodatabox: aerodatabox() }, ''], ['proven', { custom: custom() }, '12'], ['agreeing-rich', { custom: custom(), aerodatabox: agreeingRich() }, '12']]) {
  envs = new Set(label === 'legacy' ? ['AERODATABOX_API_KEY'] : label === 'agreeing-rich' ? ['CREWCHECK_FLIGHT_STATUS_URL', 'AERODATABOX_API_KEY'] : ['CREWCHECK_FLIGHT_STATUS_URL']); bodies = data; writes = 0;
  leg.gate = 'published-7'; leg.status = ''; leg.registration = '';
  snapshot = { email: 'fictional-a', roster };
  const reply = await scope.conciergeRadarReply('/radar LA100', { email: 'fictional-a' }, snapshot);
  assert.equal(leg.gate, 'published-7', 'radar never overwrites the published gate');
  if (expectGate) { assert.match(reply, /Portão: 12/); assert.match(reply, /Portão comprovado pela fonte nesta consulta; a escala publicada não foi alterada\./); assert.equal(JSON.stringify(leg.radarEvidence), JSON.stringify({ gate: '12', sourceObservedAt: iso(now - 60000), validUntil: iso(now - 60000 + RADAR_FIELD_FRESH_MS) })); }
  else { assert.match(reply, /Portão: indisponível \(fonte sem horário de observação deste campo\)/); assert.doesNotMatch(reply, /Portão: 13|comprovado pela fonte/); assert.equal(leg.radarEvidence, null); }
  assert.match(reply, label === 'agreeing-rich' ? /Status: indisponível \(fontes divergentes\)/ : /Status: indisponível \(fonte sem horário de observação deste campo\)/);
  assert.equal(leg.status, '', 'unproven status never persisted'); assert.equal(leg.registration, '', 'unproven registration never persisted');
  assert.equal(writes, 1);
}
console.log('PASS actual Telegram /radar: unproven gate/status unavailable with sanitized reason; published leg never overwritten; proven gate kept apart with source instant and expiry');

// 5. /saida departure summary receives only proven fields.
Object.assign(scope, { conciergeProgramRecords: () => [{ day: roster.days[0], legs: roster.days[0].legs, start: new FixedDate(now), end: new FixedDate(now + 3600000), startTime: '08:00' }], conciergeRemoteCodes: new Set(), conciergePresentationTime: () => '08:00',
  conciergeProgramDate: () => new FixedDate(now), conciergeTravelEstimate: async () => ({ minutes: 20, distanceKm: 10 }), calculateDepartureWindow: () => ({ leave: new FixedDate(now), routeMinutes: 20, leadMinutes: 30 }), buildDepartureSummary: x => x.radar,
  telegramRequestUser: () => ({ email: 'fictional-a', authenticated: true }), telegramAppRequestAllowed: () => true, conciergeSafeKey: x => x });
const premium = fs.readFileSync('server.mjs', 'utf8').includes('async function conciergePremiumDepartureReply(') ? fs.readFileSync('server.mjs', 'utf8') : fs.readFileSync('server/v1403/premium-helpers.snippet', 'utf8');
vm.runInContext(extract(source, ['conciergeRosterDayParts', 'conciergeDateKey', 'conciergeRecordDateKey'], 'server.mjs') + extract(premium, ['conciergePremiumDepartureReply'], 'premium.mjs'), scope);
for (const [label, data, expectGate] of [['legacy', { aerodatabox: aerodatabox() }, ''], ['proven', { custom: custom() }, '12'], ['agreeing-rich', { custom: custom(), aerodatabox: agreeingRich() }, '12']]) {
  envs = new Set(label === 'legacy' ? ['AERODATABOX_API_KEY'] : label === 'agreeing-rich' ? ['CREWCHECK_FLIGHT_STATUS_URL', 'AERODATABOX_API_KEY'] : ['CREWCHECK_FLIGHT_STATUS_URL']); bodies = data; leg.gate = 'published-7';
  snapshot = { email: 'fictional-a', roster, preferences: { location: { synthetic: true } } };
  const radar = await scope.conciergePremiumDepartureReply(snapshot, { email: 'fictional-a', authenticated: true });
  assert.equal(radar.ok, true, label); assert.equal(radar.gate, expectGate, label); assert.equal(radar.status, '', label);
}
console.log('PASS actual /saida helper: departure summary gets proven gate only; legacy gate/status withheld');
