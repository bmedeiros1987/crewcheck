// Cirium Flex primary → FlightAware fallback with durable per-provider monthly budget,
// shared occurrence cache and in-flight coalescing. Synthetic only: fake fetch, fake
// MySQL with row locks; no credential, paid query or network.
import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
import { ciriumFlexStatusUrl, fetchCiriumFlexOccurrence, selectCiriumFlexOccurrence } from '../server/cirium-flex-radar.mjs';
import { createRadarSpendLedger, createRadarSourceCache, createPaidRadarSource, radarPaidPolicy, radarOccurrenceKey, radarSpendPeriod, configureRadarPaidSources, ciriumFlexRadarOptions } from '../server/radar-paid-sources.mjs';
import { runCiriumFlightAwareSequence } from '../server/radar-sequential.mjs';
import * as gatePolicy from '../shared/gate-query-day.mjs';import * as radarEvidence from '../shared/radar-field-evidence.mjs';
const { gateQueryDay, radarResultDecision } = gatePolicy;
const at = Date.parse('2032-10-20T10:05:00Z');
const identity = { flight: 'LA3622', origin: 'GRU', destination: 'SSA', departureDate: '2032-10-20', scheduledDepartureUtc: '2032-10-20T12:30:00.000Z' };
const creds = { appId: 'synthetic-id', appKey: 'synthetic-key' };
const row = (over = {}) => ({ carrierFsCode: 'JJ', flightNumber: 3622, departureAirportFsCode: 'GRU', arrivalAirportFsCode: 'SSA', status: 'S',
  departureDate: { dateLocal: '2032-10-20T09:30:00.000', dateUtc: '2032-10-20T12:30:00.000Z' },
  operationalTimes: { scheduledGateDeparture: { dateLocal: '2032-10-20T09:30:00.000', dateUtc: '2032-10-20T12:30:00.000' } },
  airportResources: { departureGate: '12', departureTerminal: '2', arrivalGate: '77' }, flightEquipment: { tailNumber: 'PR-XYZ' }, ...over });
const envelope = rows => ({ appendix: { airlines: [{ fs: 'JJ', iata: 'LA', name: 'LATAM Airlines Brasil' }] }, flightStatuses: rows });

// A. Flex adapter: IATA-coded, origin-scoped URL; appendix binds FS→IATA; exact occurrence only.
const url = ciriumFlexStatusUrl(identity, creds);
assert.equal(url.origin + url.pathname, 'https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/LA/3622/dep/2032/10/20');
assert.equal(url.searchParams.get('codeType'), 'IATA'); assert.equal(url.searchParams.get('airport'), 'GRU');
for (const bad of [{ ...identity, flight: 'LA3622X' }, { ...identity, departureDate: '' }, { ...identity, origin: 'gr' }]) assert.equal(ciriumFlexStatusUrl(bad, creds), null);
assert.equal(ciriumFlexStatusUrl(identity, { appId: 'x' }), null);
const picked = selectCiriumFlexOccurrence(envelope([row()]), identity, at);
assert.equal(picked.flight, 'LA3622'); assert.equal(picked.gate, '12'); assert.equal(picked.terminal, '2'); assert.equal(picked.scheduledDepartureUtc, '2032-10-20T12:30:00.000Z');
for (const rows of [[], [row(), row()], [row({ departureAirportFsCode: 'CGH' })], [row({ arrivalAirportFsCode: 'REC' })],
  [row({ operationalTimes: { scheduledGateDeparture: { dateUtc: '2032-10-21T12:30:00Z' } }, departureDate: { dateUtc: '2032-10-21T12:30:00Z' } })], [row({ flightNumber: 3623 })]])
  assert.equal(selectCiriumFlexOccurrence(envelope(rows), identity, at), null, JSON.stringify(rows).slice(0, 80));
assert.equal(selectCiriumFlexOccurrence({ flightStatuses: [row()] }, identity, at), null, 'FS code without appendix IATA binding is not LA');
let fetched = [];
const flex = (status, body, delayMs = 0) => async (u, options) => { fetched.push({ url: String(u), options }); if (delayMs) await new Promise((r, j) => { const t = setTimeout(r, delayMs); options.signal.addEventListener('abort', () => { clearTimeout(t); j(Error('aborted')); }); }); return { ok: status === 200, status, json: async () => structuredClone(body) }; };
let result = await fetchCiriumFlexOccurrence({ identity, credentials: creds, fetchImpl: flex(200, envelope([row()])), now: () => at });
assert.equal(result.ok, true); assert.equal(result.provider, 'cirium-flex'); assert.equal(result.sourceReceivedAt, at); assert.equal(result.gateUpdate, null);
assert.equal(result.provenance.fields.departureGate.observedAt, null, 'receipt is never a gate observation/update');
assert.equal(result.provenance.fields.departureGate.coverageState, 'provided_no_source_freshness');
assert.equal(fetched[0].options.redirect, 'error'); assert.equal(fetched[0].options.headers.appKey, undefined);
for (const [status, state] of [[429, 'rate_limited'], [401, 'provider_error'], [500, 'provider_error']])
  assert.equal((await fetchCiriumFlexOccurrence({ identity, credentials: creds, fetchImpl: flex(status, {}), now: () => at })).providerState, state);
assert.equal((await fetchCiriumFlexOccurrence({ identity, credentials: creds, fetchImpl: flex(200, envelope([])), now: () => at })).providerState, 'not_found');
assert.equal((await fetchCiriumFlexOccurrence({ identity, credentials: creds, fetchImpl: flex(200, envelope([row()]), 200), timeoutMs: 10, now: () => at })).providerState, 'timeout');

// B. Sequence: a valid Cirium gate for the same occurrence means zero FlightAware calls.
const flexOk = (over = {}) => ({ ...picked, sourceReceivedAt: at, gateUpdate: null, ...over });
const fa = { ok: true, configured: true, provider: 'flightaware', flight: 'LAN3622', origin: 'GRU', destination: 'SSA', scheduledDepartureUtc: identity.scheduledDepartureUtc, gate: '18', status: 'Embarcando', sourceReceivedAt: at };
const sequence = async (first, second = fa) => { let calls = 0; const out = await runCiriumFlightAwareSequence({ identity, admit: async () => true, now: () => at, primary: async () => first, fallback: async () => { calls++; return second; } }); return { out, calls }; };
let run = await sequence(flexOk());
assert.equal(run.calls, 0); assert.equal(run.out.gate, '12'); assert.equal(run.out.provider, 'cirium-flex'); assert.equal(run.out.fallbackAttempted, false); assert.equal(run.out.gateUpdate, null);
for (const first of [flexOk({ gate: '' }), flexOk({ gate: 'TBD' }), flexOk({ gate: 'STAND 4' }), flexOk({ sourceReceivedAt: at - 31 * 60_000 }), flexOk({ scheduledDepartureUtc: '2032-10-21T12:30:00Z' }), flexOk({ origin: 'CGH' }),
  flexOk({ gateUpdate: { gate: '12' } }), { ok: false, provider: 'cirium-flex', providerState: 'budget-exhausted' }, null]) {
  run = await sequence(first);
  assert.equal(run.calls, 1, JSON.stringify(first)?.slice(0, 60)); assert.equal(run.out.gate, '18'); assert.equal(run.out.provider, 'flightaware'); assert.equal(run.out.gateUpdate, null);
  assert.equal(run.out.provenance.fields.departureGate.observedAt, null);
}
run = await sequence(flexOk({ gate: '' }), { ...fa, gate: '' });
assert.equal(run.calls, 1); assert.equal(run.out.provider, 'cirium-flex'); assert.equal(run.out.gate, ''); assert.equal(run.out.status, 'Programado', 'Cirium status kept when no source has a gate');

// C. Durable ledger: row lock, cap per provider and month, no refund, fail closed.
function fakePool({ failOn = '' } = {}) {
  const table = new Map(), locks = new Map(), log = [];
  const lock = async key => { while (locks.has(key)) await locks.get(key).promise; let release; const promise = new Promise(r => { release = r; }); locks.set(key, { promise, release }); return () => { locks.delete(key); release(); }; };
  return { table, log, async getConnection() {
    const held = [];
    const done = () => { while (held.length) held.pop()(); };
    return {
      async beginTransaction() { log.push('begin'); },
      async query(sql, args) {
        log.push(sql.split(' ')[0]);
        if (failOn && sql.startsWith(failOn)) throw Error('synthetic sql failure');
        if (sql.startsWith('INSERT IGNORE')) { if (!table.has(args[0])) table.set(args[0], args[1]); return [{}]; }
        if (sql.startsWith('SELECT')) { held.push(await lock(args[0])); return [table.has(args[0]) ? [{ payload: table.get(args[0]) }] : []]; }
        if (sql.startsWith('UPDATE')) { table.set(args[1], args[0]); return [{ affectedRows: 1 }]; }
        throw Error('unexpected sql');
      },
      async commit() { log.push('commit'); done(); }, async rollback() { log.push('rollback'); done(); }, release() { log.push('release'); },
    };
  } };
}
const env = { CIRIUM_FLEX_COST_PER_CALL_USD: '3', FLIGHTAWARE_COST_PER_CALL_USD: '0.005' };
assert.deepEqual(radarPaidPolicy('cirium-flex', env), { unitMicroUsd: 3_000_000, capMicroUsd: 10_000_000 });
assert.equal(radarPaidPolicy('cirium-flex', {}), null, 'unknown per-call cost: no paid call'); assert.equal(radarPaidPolicy('aerodatabox', env), null);
assert.equal(radarPaidPolicy('cirium-flex', { CIRIUM_FLEX_COST_PER_CALL_USD: '11' }), null, 'one call above the monthly budget');
let pool = fakePool(); let clock = at; const ledger = createRadarSpendLedger({ pool, now: () => clock });
const reservations = await Promise.all(Array.from({ length: 5 }, () => ledger.reserve('cirium-flex', radarPaidPolicy('cirium-flex', env))));
assert.equal(reservations.filter(r => r.ok).length, 3, 'US$ 10 at US$ 3/call: exactly 3 even when concurrent');
assert.deepEqual(reservations.filter(r => !r.ok).map(r => r.reason), ['budget-exhausted', 'budget-exhausted']);
const key = `radar-paid-spend:v1:cirium-flex:${radarSpendPeriod(at)}`;
assert.deepEqual(JSON.parse(pool.table.get(key)), { v: 1, kind: 'radar-paid-spend', provider: 'cirium-flex', period: '2032-10', spentMicroUsd: 9_000_000, attempts: 3 });
assert.equal((await ledger.reserve('flightaware', radarPaidPolicy('flightaware', env))).ok, true, 'each provider has its own budget');
clock = Date.parse('2032-11-01T04:00:00Z');
assert.equal((await ledger.reserve('cirium-flex', radarPaidPolicy('cirium-flex', env))).period, '2032-11', 'new month (America/Sao_Paulo) starts a new budget');
assert.equal((await createRadarSpendLedger({ pool: null }).reserve('cirium-flex', radarPaidPolicy('cirium-flex', env))).reason, 'ledger-unavailable');
assert.equal((await createRadarSpendLedger({ pool: async () => null }).reserve('cirium-flex', radarPaidPolicy('cirium-flex', env))).reason, 'ledger-unavailable');
pool = fakePool({ failOn: 'UPDATE' }); assert.equal((await createRadarSpendLedger({ pool, now: () => at }).reserve('cirium-flex', radarPaidPolicy('cirium-flex', env))).reason, 'ledger-unavailable');
assert(pool.log.includes('rollback') && pool.log.at(-1) === 'release');
pool = fakePool(); pool.table.set(key, JSON.stringify({ v: 1, kind: 'other' }));
assert.equal((await createRadarSpendLedger({ pool, now: () => at }).reserve('cirium-flex', radarPaidPolicy('cirium-flex', env))).reason, 'ledger-unavailable', 'corrupt ledger fails closed');

// D. Cache: one upstream call per occurrence while pending/fresh; original receipt kept.
let cacheClock = at, tasks = 0;
const cache = createRadarSourceCache({ now: () => cacheClock });
const slow = value => async () => { tasks++; await new Promise(r => setTimeout(r, 5)); return value; };
const [one, two] = await Promise.all([cache.run('k', slow(flexOk())), cache.run('k', slow(flexOk()))]);
assert.equal(tasks, 1, 'concurrent requests coalesce'); assert.equal(one.gate, '12'); assert.equal(two.gate, '12');
cacheClock += 4 * 60_000; const cached = await cache.run('k', slow(flexOk({ sourceReceivedAt: cacheClock })));
assert.equal(tasks, 1); assert.equal(cached.cached, true); assert.equal(cached.sourceReceivedAt, at, 'cached copy keeps its original receipt');
cacheClock += 2 * 60_000; await cache.run('k', slow(flexOk())); assert.equal(tasks, 2, 'ok answers expire after 5 min');
await cache.run('miss', slow({ ok: false })); cacheClock += 60_000; await cache.run('miss', slow({ ok: false })); assert.equal(tasks, 3);
cacheClock += 61_000; await cache.run('miss', slow({ ok: false })); assert.equal(tasks, 4, 'misses expire after 2 min');
assert.notEqual(radarOccurrenceKey('cirium-flex', identity), radarOccurrenceKey('cirium-flex', { ...identity, scheduledDepartureUtc: '2032-10-21T12:30:00.000Z' }));
assert.notEqual(radarOccurrenceKey('cirium-flex', identity), radarOccurrenceKey('flightaware', identity));

// E. Paid source: reservation before the call, denied budget never calls, failures still count.
pool = fakePool(); let upstream = 0;
const paid = createPaidRadarSource({ ledger: createRadarSpendLedger({ pool, now: () => at }), cache: createRadarSourceCache({ now: () => at }), env: { FLIGHTAWARE_COST_PER_CALL_USD: '4' } });
assert.equal((await paid('flightaware', identity, async () => { upstream++; throw Error('synthetic'); })).providerState, 'provider_error');
assert.equal((await paid('flightaware', identity, async () => { upstream++; return fa; })).providerState, 'provider_error', 'cached miss: no second paid call for 2 min');
assert.equal(upstream, 1);
assert.equal((await paid('flightaware', { ...identity, flight: 'LA9999' }, async () => { upstream++; return fa; })).ok, true);
assert.equal((await paid('flightaware', { ...identity, flight: 'LA9998' }, async () => { upstream++; return fa; })).providerState, 'budget-exhausted', 'US$ 10 at US$ 4: third call denied');
assert.equal(upstream, 2, 'denied budget never reaches the provider');
assert.equal((await paid('cirium-flex', identity, async () => { upstream++; return fa; })).providerState, 'budget-not-configured'); assert.equal(upstream, 2);

// F. Activation: undefined unless explicit flag + backend credentials + configured ledger.
assert.equal(ciriumFlexRadarOptions({ CIRIUM_FLEX_RADAR_ENABLED: 'true', CIRIUM_APP_ID: 'a', CIRIUM_APP_KEY: 'b' }), undefined, 'no runtime before server startup');
configureRadarPaidSources({ pool: fakePool(), now: () => at, env: {} });
for (const e of [{}, { CIRIUM_APP_ID: 'a', CIRIUM_APP_KEY: 'b' }, { CIRIUM_FLEX_RADAR_ENABLED: '1', CIRIUM_APP_ID: 'a', CIRIUM_APP_KEY: 'b' }, { CIRIUM_FLEX_RADAR_ENABLED: 'true', CIRIUM_APP_ID: 'a' }])
  assert.equal(ciriumFlexRadarOptions(e), undefined, JSON.stringify(e));
const options = ciriumFlexRadarOptions({ CIRIUM_FLEX_RADAR_ENABLED: 'true', CIRIUM_APP_ID: 'a', CIRIUM_APP_KEY: 'b' });
assert.equal(options.enabled, true); assert.equal(options.flightAwareFallback, true); assert.equal(typeof options.primary, 'function'); assert.equal(typeof options.guardFallback, 'function');
assert.equal((await import('../server/cirium-radar-injection.mjs')).defaultCiriumRadarOptions(), undefined, 'CI env: production stays OFF');

// G. Actual runRadarRace: paid primary/guard used, FlightAware skipped on a Cirium gate, receipt not refreshed.
const source = fs.readFileSync('server.mjs', 'utf8'), ast = ts.createSourceFile('server.mjs', source, 99, true, ts.ScriptKind.JS);
const fn = name => { const n = ast.statements.find(x => ts.isFunctionDeclaration(x) && x.name?.text === name); assert(n, name); return n.getText(ast); };
const later = at + 4 * 60_000; let faCalls = 0, guarded = 0;
const scope = vm.createContext({ ...radarEvidence, Date: class extends Date { static now() { return later; } }, process: { env: {} },
  gateQueryDay: i => gateQueryDay(i, later), radarResultDecision: (p, i) => radarResultDecision(p, i, later), gateQuerySuppressed: d => ({ ok: false, querySuppressed: true, queryReason: d.reason }),
  ciriumRadarInjectionEnabled: o => o?.enabled === true, runCiriumRadarInjection: async () => { throw Error('Sky path must not run'); }, ciriumRadarProjection: () => ({}),
  runCiriumFlightAwareSequence: o => runCiriumFlightAwareSequence({ ...o, now: () => later }), sequentialRadarProjection: () => ({}),
  providerFlightAware: async () => { faCalls++; return fa; }, firstKnown: (...v) => v.find(x => x !== undefined && x !== null && x !== '') ?? '' });
vm.runInContext(['publicRadarPayload', 'runRadarRace'].map(fn).join('\n'), scope);
const ctx = (primary) => ({ raw: 'LA3622', gateQueryEvidence: identity, radarReadAdmission: async () => true,
  ciriumRadarOptions: { enabled: true, flightAwareFallback: true, primary: async () => primary, guardFallback: async (id, call) => { guarded++; assert.deepEqual(id, identity); return call(); } } });
let body = await scope.runRadarRace(ctx(flexOk()), 'GRU', 'SSA');
assert.equal(faCalls, 0); assert.equal(guarded, 0); assert.equal(body.gate, '12'); assert.equal(body.sourceReceivedAt, at, 'cached Cirium receipt is not replaced by Date.now()');
body = await scope.runRadarRace(ctx(flexOk({ gate: '' })), 'GRU', 'SSA');
assert.equal(guarded, 1); assert.equal(faCalls, 1); assert.equal(body.gate, '18');
assert.match(source, /^configureRadarPaidSources\(\{ pool: conciergeDbPool \}\);$/m, 'startup hands the existing MySQL pool to the paid ledger');
console.log('PASS paid Radar sequence: Flex exact occurrence + FS→IATA binding, Cirium gate skips FlightAware, single fallback otherwise, receipt never a gate update, durable per-provider US$ 10 monthly ledger under concurrency (no refund, fail closed), cache + coalescing with original receipt, explicit opt-in');
