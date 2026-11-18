// FlightAware OFF everywhere (dot review of 8833d4b5e, P1): FlightAware is not licensed for
// distribution, so no entry point may reach its transport unless RADAR_FLIGHTAWARE_FALLBACK_ENABLED
// is exactly 'true', and with the paid Flex routing on only through its budget guard. Also: a
// FlightAware call that cannot leave (no key, cooldown) is refused before the ledger and is never
// reported as a query. Actual server functions (Concierge entry, runRadarRace, providerFlightAware,
// envAny/providerAvailable/markProvider), real paid options, sequence, ledger and cache; fake
// jsonFetch, fake MySQL and fake Flex transport. No credential, paid query or network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { prepareConciergeCanonicalBridge } from './p1-concierge-journey/bridge.mjs';
import * as policy from '../shared/gate-query-day.mjs';
import * as radarEvidence from '../shared/radar-field-evidence.mjs';
import { runCiriumFlightAwareSequence, sequentialRadarProjection } from '../server/radar-sequential.mjs';
import { configureRadarPaidSources, ciriumFlexRadarOptions, radarSpendKey, createPaidRadarSource, createRadarSpendLedger, createRadarSourceCache } from '../server/radar-paid-sources.mjs';
prepareConciergeCanonicalBridge();
const { buildCanonicalRosterEvents } = await import('../server/concierge/generated/canonicalRoster.mjs');

const source = fs.readFileSync('server.mjs', 'utf8'), ast = ts.createSourceFile('server.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functions = names => names.map(name => { const n = ast.statements.find(x => ts.isFunctionDeclaration(x) && x.name?.text === name); assert(n, name); return n.getText(ast); }).join('\n');
// The occurrence helpers exist only after canonical preparation (v14392); take them when present.
const optional = names => names.filter(name => ast.statements.some(x => ts.isFunctionDeclaration(x) && x.name?.text === name));
const now = Date.parse('2032-10-14T11:00:00Z');
const leg = { flightNumber: 'LA100', origin: 'GRU', destination: 'REC', departureTime: '09:00', arrivalTime: '11:00', gate: '' };
const roster = { year: 2032, month: 10, base: 'GRU', days: [{ date: '14/10/2032', type: 'VOO', legs: [leg] }] };
const records = () => roster.days.map(day => ({ day, legs: day.legs }));
const faRow = { ident: 'LAN100', ident_iata: 'LA100', scheduled_out: '2032-10-14T12:00:00Z', origin: { code_iata: 'GRU' }, destination: { code_iata: 'REC' }, gate_origin: '18', status: 'Scheduled' };

function scopeWith(env, { jsonFetch, snapshotLoad } = {}) {
  const calls = [], legacy = [], saves = [];
  const scope = vm.createContext({
    ...policy, ...radarEvidence, buildCanonicalRosterEvents, URL, Map, Promise,
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } },
    gateQueryDay: (i, t) => policy.gateQueryDay(i, t ?? now), radarResultDecision: (p, i, t, m) => policy.radarResultDecision(p, i, t ?? now, m),
    process: { env }, setTimeout: () => 1, clearTimeout: () => {},
    radarHealth: new Map(),
    jsonFetch: jsonFetch || (async (url) => { calls.push(String(url)); return { response: { ok: true }, payload: { flights: [faRow] } }; }),
    ciriumRadarInjectionEnabled: o => o?.enabled === true, ciriumRadarProjection: () => ({}),
    runCiriumFlightAwareSequence: o => runCiriumFlightAwareSequence({ ...o, now: () => now }), sequentialRadarProjection,
    runCiriumRadarInjection: async () => { throw Error('Sky path must not run'); },
    providerCustom: async () => { legacy.push('custom'); return null; }, providerAviationstack: async () => { legacy.push('aviationstack'); return null; },
    providerAirLabs: async () => { legacy.push('airlabs'); return null; }, providerAeroDataBox: async () => { legacy.push('aerodatabox'); return null; },
    // Real paid options builder (the server's defaultCiriumRadarOptions with Sky hard OFF).
    defaultCiriumRadarOptions: () => ciriumFlexRadarOptions(env),
    scoreRadar: () => 95, configuredProviders: () => [],
    conciergeLoadSnapshot: snapshotLoad || (async () => ({ email: 'fictional-a', roster })), conciergeAccessMatches: () => true,
    conciergeFindFlight: () => ({ record: records()[0], leg }), conciergeSaveSnapshotAsync: async (...args) => { saves.push(args); },
    conciergeExtractFlight: () => 'LA100', conciergeNextProgram: () => records()[0], conciergeNextJourneyProgram: () => records()[0],
    conciergeProgramRecords: records, conciergeJourneyProgramRecords: (_r, rs) => rs,
  });
  vm.runInContext(functions(['envAny', 'firstKnown', 'normalizeFlightRaw', 'buildFlightContext', 'providerAvailable', 'markProvider',
    ...optional(['radarAirportCode', 'flightAwareAirport', 'flightAwareScheduledDeparture', 'flightAwareOccurrenceRank', 'selectFlightAwareOccurrence']),
    'normalizeFlightAwareFlight', 'providerFlightAware', 'publicRadarPayload', 'runRadarRace', 'conciergeRadarReply', 'conciergeApplyRadar']), scope);
  return { scope, calls, legacy, saves, faCalls: () => calls.filter(url => new URL(url).hostname === 'aeroapi.flightaware.com').length };
}

const key = { FLIGHTAWARE_AEROAPI_KEY: 'synthetic-offline-key', FLIGHTAWARE_COST_PER_CALL_USD: '0.0017' };
const flexOn = { CIRIUM_FLEX_RADAR_ENABLED: 'true', CIRIUM_APP_ID: 'synthetic-id', CIRIUM_APP_KEY: 'synthetic-key', CIRIUM_FLEX_COST_PER_CALL_USD: '0.01' };

function fakePool() {
  const table = new Map(), locks = new Map();
  const lock = async k => { while (locks.has(k)) await locks.get(k).promise; let release; const promise = new Promise(r => { release = r; }); locks.set(k, { promise, release }); return () => { locks.delete(k); release(); }; };
  return { table, async getConnection() { const held = []; const done = () => { while (held.length) held.pop()(); };
    return { async beginTransaction() {}, async query(sql, args) {
      if (sql.startsWith('INSERT IGNORE')) { if (!table.has(args[0])) table.set(args[0], args[1]); return [{}]; }
      if (sql.startsWith('SELECT')) { held.push(await lock(args[0])); return [table.has(args[0]) ? [{ payload: table.get(args[0]) }] : []]; }
      if (sql.startsWith('UPDATE')) { table.set(args[1], args[0]); return [{ affectedRows: 1 }]; }
      throw Error('unexpected sql'); }, async commit() { done(); }, async rollback() { done(); }, release() {} }; } };
}
const flexNoGate = { appendix: { airlines: [{ fs: 'JJ', iata: 'LA' }], airports: [{ fs: 'GRU', iata: 'GRU' }, { fs: 'REC', iata: 'REC' }] },
  flightStatuses: [{ carrierFsCode: 'JJ', flightNumber: 100, departureAirportFsCode: 'GRU', arrivalAirportFsCode: 'REC', status: 'S',
    operationalTimes: { scheduledGateDeparture: { dateUtc: '2032-10-14T12:00:00.000Z' } }, airportResources: {} }] };
const spentOn = (pool, provider) => JSON.parse(pool.table.get(radarSpendKey(provider)) || '{"days":{}}').days['2032-10-14'] || 0;

// 1. Actual Concierge entry. With Flex on it takes the same paid routing as the HTTP radar (budget,
//    cache, ledger, re-admission), never the unbudgeted legacy race, and FlightAware only with the
//    exact permission and through its budget guard. Flex off: the legacy race is unchanged.
async function concierge(env, { snapshotLoad } = {}) {
  const pool = fakePool(); let flexCalls = 0;
  configureRadarPaidSources({ pool, now: () => now, env, fetchImpl: async () => { flexCalls++; return { ok: true, status: 200, json: async () => structuredClone(flexNoGate) }; }, timeoutMs: 50 });
  const run = scopeWith(env, { snapshotLoad });
  const reply = await run.scope.conciergeRadarReply('/radar LA100', { email: 'fictional-a' }, { roster });
  return { reply, fa: run.faCalls(), flex: flexCalls, legacy: run.legacy.length, saves: run.saves.length, faSpent: spentOn(pool, 'flightaware'), flexSpent: spentOn(pool, 'cirium-flex') };
}
for (const [label, env, expected] of [
  ['Flex on, FlightAware key+cost, permission unset', { ...flexOn, ...key }, { fa: 0, faSpent: 0, flex: 1, flexSpent: 10000, legacy: 0, saves: 0 }],
  ['Flex on, permission TRUE (not exact)', { ...flexOn, ...key, RADAR_FLIGHTAWARE_FALLBACK_ENABLED: 'TRUE' }, { fa: 0, faSpent: 0, flex: 1, flexSpent: 10000, legacy: 0, saves: 0 }],
  ['Flex on, permission 1 (not exact)', { ...flexOn, ...key, RADAR_FLIGHTAWARE_FALLBACK_ENABLED: '1' }, { fa: 0, faSpent: 0, flex: 1, flexSpent: 10000, legacy: 0, saves: 0 }],
  ['Flex on, permission true: one FlightAware call, only through the budget guard', { ...flexOn, ...key, RADAR_FLIGHTAWARE_FALLBACK_ENABLED: 'true' }, { fa: 1, faSpent: 1700, flex: 1, flexSpent: 10000, legacy: 0, saves: 0 }],
  ['Flex on without credentials: refused, never the legacy race', { CIRIUM_FLEX_RADAR_ENABLED: 'true', ...key, RADAR_FLIGHTAWARE_FALLBACK_ENABLED: 'true' }, { fa: 0, faSpent: 0, flex: 0, flexSpent: 0, legacy: 0, saves: 0 }],
  ['Flex off, FlightAware key, permission unset', { ...key }, { fa: 0, faSpent: 0, flex: 0, flexSpent: 0, legacy: 4, saves: 1 }],
  ['Flex off, permission true: legacy race, explicitly permitted', { ...key, RADAR_FLIGHTAWARE_FALLBACK_ENABLED: 'true' }, { fa: 1, faSpent: 0, flex: 0, flexSpent: 0, legacy: 4, saves: 1 }],
]) {
  const { reply, ...seen } = await concierge(env);
  assert.deepEqual(seen, expected, label);
  assert.equal(typeof reply, 'string', label);
}
// Paid answers are read-only (saves 0 above) and the reply keeps the Concierge's evidence rule: a gate
// without a source observation time (FlightAware's 18 here) is never presented as confirmed.
{
  const { reply } = await concierge({ ...flexOn, ...key, RADAR_FLIGHTAWARE_FALLBACK_ENABLED: 'true' });
  assert.match(reply, /^Radar LA100\nGRU → REC\n/, 'reply for the exact published occurrence');
  assert.match(reply, /Portão: indisponível \(fonte sem horário de observação deste campo\)/);
  assert.doesNotMatch(reply, /Portão: 18/);
}
// Account or occurrence revoked before the paid call: the Concierge admission refuses, no Flex/FlightAware call.
{
  let loads = 0;
  const revoked = await concierge({ ...flexOn, ...key, RADAR_FLIGHTAWARE_FALLBACK_ENABLED: 'true' }, { snapshotLoad: async () => (++loads, null) });
  assert.deepEqual([revoked.flex, revoked.fa, revoked.legacy, revoked.saves], [0, 0, 0, 0], 'revoked Concierge authority: no paid call');
  assert(loads >= 1, 'admission reloads the Concierge snapshot');
}

// 2. Paid Flex routing (the HTTP handler's options) with the actual providerFlightAware.
const identity = { flight: 'LA100', origin: 'GRU', destination: 'REC', departureDate: '2032-10-14', scheduledDepartureUtc: '2032-10-14T12:00:00.000Z' };
async function paidRace(env, { cooldown = false, faStatus = 200 } = {}) {
  const pool = fakePool();
  const { scope, faCalls } = scopeWith(env, { jsonFetch: async url => { (scope.__calls ||= []).push(String(url)); return { response: { ok: faStatus === 200, status: faStatus }, payload: { flights: [faRow] } }; } });
  if (cooldown) scope.radarHealth.set('flightaware', { lastFail: now - 5_000 });
  configureRadarPaidSources({ pool, now: () => now, env, fetchImpl: async () => ({ ok: true, status: 200, json: async () => structuredClone(flexNoGate) }), timeoutMs: 50 });
  let last = null;
  scope.runCiriumFlightAwareSequence = async o => (last = await runCiriumFlightAwareSequence({ ...o, now: () => now }));
  const ctx = { ...scope.buildFlightContext('LA100'), gateQueryEvidence: identity, radarReadAdmission: async () => true, ciriumRadarOptions: ciriumFlexRadarOptions(env) };
  const body = await scope.runRadarRace(ctx, 'GRU', 'REC');
  const spent = JSON.parse(pool.table.get(radarSpendKey('flightaware')) || '{"days":{}}').days['2032-10-14'] || 0;
  return { body, seq: last, fa: (scope.__calls || []).filter(url => new URL(url).hostname === 'aeroapi.flightaware.com').length, spent };
}
let run = await paidRace({ ...flexOn, ...key });
assert.deepEqual([run.fa, run.spent, run.seq.fallbackAttempted], [0, 0, false], 'paid routing, FlightAware OFF: zero call and reservation');
run = await paidRace({ ...flexOn, ...key, RADAR_FLIGHTAWARE_FALLBACK_ENABLED: 'true' });
assert.deepEqual([run.fa, run.spent, run.seq.fallbackAttempted, run.body.gate], [1, 1700, true, '18'], 'explicit permission: one budgeted call');
// Pre-admission before the ledger: no key, or the provider in cooldown, never reserves or "queries".
const { FLIGHTAWARE_AEROAPI_KEY: _drop, ...noKey } = { ...flexOn, ...key, RADAR_FLIGHTAWARE_FALLBACK_ENABLED: 'true' };
run = await paidRace(noKey);
assert.deepEqual([run.fa, run.spent, run.seq.fallbackAttempted], [0, 0, false], 'no FlightAware key: refused before the ledger');
run = await paidRace({ ...flexOn, ...key, RADAR_FLIGHTAWARE_FALLBACK_ENABLED: 'true' }, { cooldown: true });
assert.deepEqual([run.fa, run.spent, run.seq.fallbackAttempted], [0, 0, false], 'FlightAware in cooldown: refused before the ledger');
// A real attempt that fails still counts, without refund.
run = await paidRace({ ...flexOn, ...key, RADAR_FLIGHTAWARE_FALLBACK_ENABLED: 'true' }, { faStatus: 500 });
assert.deepEqual([run.fa, run.spent, run.seq.fallbackAttempted], [1, 1700, true], 'provider error after a real call: spent and reported');
// Race after pre-admission (e.g. cooldown starts meanwhile): the adapter refuses before its
// transport; the spent reservation stays, but it is not reported as a query nor cached.
{
  const pool = fakePool(), env = { ...key, RADAR_FLIGHTAWARE_FALLBACK_ENABLED: 'true' };
  const paid = createPaidRadarSource({ ledger: createRadarSpendLedger({ pool, now: () => now }), cache: createRadarSourceCache({ now: () => now }), env });
  const out = await paid('flightaware', identity, async () => null, async () => true, () => true);
  assert.deepEqual([out.ok, out.networkAttempted, out.cacheable], [false, false, false], 'refused before transport is not a query');
  const seq = await runCiriumFlightAwareSequence({ identity, admit: async () => true, now: () => now, primary: async () => null, fallback: async () => out });
  assert.equal(seq.fallbackAttempted, false);
  let calls = 0;
  await paid('flightaware', identity, async () => { calls++; return null; }, async () => true, () => true);
  assert.equal(calls, 1, 'not cached: the next request may try again');
}

console.log('PASS FlightAware OFF everywhere: actual Concierge entry uses the paid Flex routing (budget, cache, ledger, re-admission; read-only, never the legacy race) and, like the HTTP paid routing, reaches FlightAware only with the exact permission and through the budget guard; no key/cooldown refused before the ledger; real failures still count');
