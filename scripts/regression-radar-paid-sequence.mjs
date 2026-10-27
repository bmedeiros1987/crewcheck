// Cirium Flex primary → FlightAware fallback with durable per-provider budget, shared
// occurrence cache and in-flight coalescing. Synthetic only: fake fetch, fake MySQL
// with row locks (the real-InnoDB counterpart is regression-radar-paid-ledger-mysql);
// no credential, paid query or network.
import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
import { ciriumFlexStatusUrl, fetchCiriumFlexOccurrence, normalizeCiriumFlexRow, selectCiriumFlexOccurrence } from '../server/cirium-flex-radar.mjs';
import { createRadarSpendLedger, createRadarSourceCache, createPaidRadarSource, radarPaidPolicy, radarOccurrenceKey, radarSpendKey, configureRadarPaidSources, ciriumFlexRadarOptions, RADAR_PAID_WINDOW_DAYS } from '../server/radar-paid-sources.mjs';
import { runCiriumFlightAwareSequence } from '../server/radar-sequential.mjs';
import * as gatePolicy from '../shared/gate-query-day.mjs';import * as radarEvidence from '../shared/radar-field-evidence.mjs';
const { gateQueryDay, radarResultDecision } = gatePolicy;
const at = Date.parse('2032-10-20T10:05:00Z'), DAY = 86_400_000;
const identity = { flight: 'LA3622', origin: 'GRU', destination: 'SSA', departureDate: '2032-10-20', scheduledDepartureUtc: '2032-10-20T12:30:00.000Z' };
const creds = { appId: 'synthetic-id', appKey: 'synthetic-key' };
const row = (over = {}) => ({ carrierFsCode: 'JJ', flightNumber: 3622, departureAirportFsCode: 'GRU', arrivalAirportFsCode: 'SSA', status: 'S',
  departureDate: { dateLocal: '2032-10-20T09:30:00.000', dateUtc: '2032-10-20T12:30:00.000Z' },
  operationalTimes: { scheduledGateDeparture: { dateLocal: '2032-10-20T09:30:00.000', dateUtc: '2032-10-20T12:30:00.000' } },
  airportResources: { departureGate: '12', departureTerminal: '2', arrivalGate: '77' }, flightEquipment: { tailNumber: 'PR-XYZ' }, ...over });
const appendix = (over = {}) => ({ airlines: [{ fs: 'JJ', iata: 'LA', name: 'LATAM Airlines Brasil' }], airports: [{ fs: 'GRU', iata: 'GRU' }, { fs: 'SSA', iata: 'SSA' }], ...over });
const envelope = (rows, ...app) => ({ appendix: app.length ? app[0] : appendix(), flightStatuses: rows });
const flight = 'LA3622';

// 1. Flex identity: IATA-coded, origin-scoped URL; codes bind only through one consistent appendix entry.
const url = ciriumFlexStatusUrl(identity, creds);
assert.equal(url.origin + url.pathname, 'https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status/LA/3622/dep/2032/10/20');
assert.equal(url.searchParams.get('codeType'), 'IATA'); assert.equal(url.searchParams.get('airport'), 'GRU');
for (const bad of [{ ...identity, flight: 'LA3622X' }, { ...identity, departureDate: '' }, { ...identity, origin: 'gr' }]) assert.equal(ciriumFlexStatusUrl(bad, creds), null);
assert.equal(ciriumFlexStatusUrl(identity, { appId: 'x' }), null);
const picked = selectCiriumFlexOccurrence(envelope([row()]), identity, at);
assert.equal(picked.flight, flight); assert.equal(picked.gate, '12'); assert.equal(picked.terminal, '2'); assert.equal(picked.scheduledDepartureUtc, '2032-10-20T12:30:00.000Z');
for (const [label, app] of [['no appendix', undefined], ['no airlines', appendix({ airlines: [] })], ['no airports', appendix({ airports: [] })],
  ['contradictory airline', appendix({ airlines: [{ fs: 'JJ', iata: 'LA' }, { fs: 'JJ', iata: 'JJ' }] })],
  ['contradictory airport', appendix({ airports: [{ fs: 'GRU', iata: 'GRU' }, { fs: 'GRU', iata: 'CGH' }, { fs: 'SSA', iata: 'SSA' }] })],
  ['empty iata', appendix({ airlines: [{ fs: 'JJ', iata: '' }] })]]) {
  assert.equal(normalizeCiriumFlexRow(row(), app), null, label);
  assert.equal(selectCiriumFlexOccurrence(envelope([row()], app), identity, at), null, label + ': FS code is never IATA');
}
assert.equal(selectCiriumFlexOccurrence(envelope([row({ carrierFsCode: 'LA' })], appendix({ airlines: [{ fs: 'LA', iata: 'LA' }] })), identity, at).flight, flight, 'matching FS/IATA still needs the appendix');
// departureDate is operational: without a planned gate/published departure there is no occurrence.
assert.equal(selectCiriumFlexOccurrence(envelope([row({ operationalTimes: {} })]), identity, at), null);
assert.equal(selectCiriumFlexOccurrence(envelope([row({ operationalTimes: { publishedDeparture: { dateUtc: '2032-10-20T12:30:00.000Z' } } })]), identity, at).flight, flight);
for (const rows of [[], [row(), row()], [row({ departureAirportFsCode: 'CGH' })], [row({ arrivalAirportFsCode: 'REC' })],
  [row({ operationalTimes: { scheduledGateDeparture: { dateUtc: '2032-10-21T12:30:00Z' } } })], [row({ flightNumber: 3623 })]])
  assert.equal(selectCiriumFlexOccurrence(envelope(rows, appendix({ airports: [...appendix().airports, { fs: 'CGH', iata: 'CGH' }, { fs: 'REC', iata: 'REC' }] })), identity, at), null, JSON.stringify(rows).slice(0, 80));
let fetched = [];
const flex = (status, body, delayMs = 0) => async (u, options) => { fetched.push({ url: String(u), options }); if (delayMs) await new Promise((r, j) => { const t = setTimeout(r, delayMs); options.signal.addEventListener('abort', () => { clearTimeout(t); j(Error('aborted')); }); }); return { ok: status === 200, status, json: async () => structuredClone(body) }; };
let result = await fetchCiriumFlexOccurrence({ identity, credentials: creds, fetchImpl: flex(200, envelope([row()])), now: () => at });
assert.equal(result.ok, true); assert.equal(result.provider, 'cirium-flex'); assert.equal(result.sourceReceivedAt, at); assert.equal(result.gateUpdate, null);
assert.equal(result.provenance.fields.departureGate.observedAt, null, 'receipt is never a gate observation/update');
assert.equal(result.provenance.fields.departureGate.coverageState, 'provided_no_source_freshness');
assert.equal(fetched[0].options.redirect, 'error');
for (const [status, state] of [[429, 'rate_limited'], [401, 'provider_error'], [500, 'provider_error']])
  assert.equal((await fetchCiriumFlexOccurrence({ identity, credentials: creds, fetchImpl: flex(status, {}), now: () => at })).providerState, state);
assert.equal((await fetchCiriumFlexOccurrence({ identity, credentials: creds, fetchImpl: flex(200, envelope([])), now: () => at })).providerState, 'not_found');
assert.equal((await fetchCiriumFlexOccurrence({ identity, credentials: creds, fetchImpl: flex(200, envelope([row()]), 200), timeoutMs: 10, now: () => at })).providerState, 'timeout');

// Sequence: a valid Cirium gate for the same occurrence means zero FlightAware calls.
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

// 4. Policy: cost rounds up, cap rounds down, cap above US$ 10 or unknown cost disables.
assert.deepEqual(radarPaidPolicy('flightaware', { FLIGHTAWARE_COST_PER_CALL_USD: '0.0017' }), { unitMicroUsd: 1700, capMicroUsd: 10_000_000 });
assert.deepEqual(radarPaidPolicy('flightaware', { FLIGHTAWARE_COST_PER_CALL_USD: '0.33333333' }).unitMicroUsd, 333_334);
assert.deepEqual(radarPaidPolicy('flightaware', { FLIGHTAWARE_COST_PER_CALL_USD: '0.0000001' }).unitMicroUsd, 1);
assert.equal(radarPaidPolicy('flightaware', { FLIGHTAWARE_COST_PER_CALL_USD: '1', RADAR_PAID_MONTHLY_BUDGET_USD: '9.9999999' }).capMicroUsd, 9_999_999);
// Exact decimal conversion (dot review): no float tolerance may round a cost down or a cap up.
assert.equal(radarPaidPolicy('flightaware', { FLIGHTAWARE_COST_PER_CALL_USD: '0.0050000000005' }).unitMicroUsd, 5001);
assert.equal(radarPaidPolicy('flightaware', { FLIGHTAWARE_COST_PER_CALL_USD: '0.005000' }).unitMicroUsd, 5000, 'trailing zeros are exact');
assert.equal(radarPaidPolicy('flightaware', { FLIGHTAWARE_COST_PER_CALL_USD: '0.000001000000000000000000001' }).unitMicroUsd, 2);
assert.equal(radarPaidPolicy('flightaware', { FLIGHTAWARE_COST_PER_CALL_USD: '1', RADAR_PAID_MONTHLY_BUDGET_USD: '9.9999999999995' }).capMicroUsd, 9_999_999);
assert.equal(radarPaidPolicy('flightaware', { FLIGHTAWARE_COST_PER_CALL_USD: '1', RADAR_PAID_MONTHLY_BUDGET_USD: '9.9999999999999999999' }).capMicroUsd, 9_999_999);
assert.equal(radarPaidPolicy('flightaware', { FLIGHTAWARE_COST_PER_CALL_USD: '1', RADAR_PAID_MONTHLY_BUDGET_USD: '10.000000' }).capMicroUsd, 10_000_000);
assert.equal(radarPaidPolicy('flightaware', { FLIGHTAWARE_COST_PER_CALL_USD: '10' }).unitMicroUsd, 10_000_000, 'one call may use the whole cap');
for (const env of [{}, { FLIGHTAWARE_COST_PER_CALL_USD: '0' }, { FLIGHTAWARE_COST_PER_CALL_USD: '-1' }, { FLIGHTAWARE_COST_PER_CALL_USD: '1e-3' }, { FLIGHTAWARE_COST_PER_CALL_USD: '11' },
  { FLIGHTAWARE_COST_PER_CALL_USD: '1', RADAR_PAID_MONTHLY_BUDGET_USD: '10.01' }, { FLIGHTAWARE_COST_PER_CALL_USD: '1', RADAR_PAID_MONTHLY_BUDGET_USD: '0' },
  { FLIGHTAWARE_COST_PER_CALL_USD: '1', RADAR_PAID_MONTHLY_BUDGET_USD: '10.0000000000001' }, { FLIGHTAWARE_COST_PER_CALL_USD: '10.0000001' },
  { FLIGHTAWARE_COST_PER_CALL_USD: '0.0000000' }, { FLIGHTAWARE_COST_PER_CALL_USD: '.5' }, { FLIGHTAWARE_COST_PER_CALL_USD: '0.5.' }, { FLIGHTAWARE_COST_PER_CALL_USD: '0x1' },
  { FLIGHTAWARE_COST_PER_CALL_USD: '0,5' }, { FLIGHTAWARE_COST_PER_CALL_USD: '1'.repeat(13) }, { FLIGHTAWARE_COST_PER_CALL_USD: '0.' + '1'.repeat(65) }])
  assert.equal(radarPaidPolicy('flightaware', env), null, JSON.stringify(env));
assert.equal(radarPaidPolicy('aerodatabox', { FLIGHTAWARE_COST_PER_CALL_USD: '1' }), null);

// Ledger (fake locking MySQL): rolling 33-UTC-day window, no refund, fail closed.
function fakePool({ failOn = '' } = {}) {
  const table = new Map(), locks = new Map(), log = [];
  const lock = async key => { while (locks.has(key)) await locks.get(key).promise; let release; const promise = new Promise(r => { release = r; }); locks.set(key, { promise, release }); return () => { locks.delete(key); release(); }; };
  return { table, log, async getConnection() {
    const held = [], done = () => { while (held.length) held.pop()(); };
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
const policy3 = radarPaidPolicy('cirium-flex', { CIRIUM_FLEX_COST_PER_CALL_USD: '3' });
let pool = fakePool(); let clock = at; const ledger = createRadarSpendLedger({ pool, now: () => clock });
const reservations = await Promise.all(Array.from({ length: 5 }, () => ledger.reserve('cirium-flex', policy3)));
assert.equal(reservations.filter(r => r.ok).length, 3, 'US$ 10 at US$ 3/call: exactly 3 even when concurrent');
assert.deepEqual(reservations.filter(r => !r.ok).map(r => r.reason), ['budget-exhausted', 'budget-exhausted']);
assert.deepEqual(JSON.parse(pool.table.get(radarSpendKey('cirium-flex'))), { v: 2, kind: 'radar-paid-spend', provider: 'cirium-flex', days: { '2032-10-20': 9_000_000 }, attempts: 3 });
assert.equal((await ledger.reserve('flightaware', radarPaidPolicy('flightaware', { FLIGHTAWARE_COST_PER_CALL_USD: '3' }))).ok, true, 'each provider has its own budget');
clock = Date.parse('2032-11-01T12:00:00Z');
assert.equal((await ledger.reserve('cirium-flex', policy3)).reason, 'budget-exhausted', 'a calendar month boundary never resets the window');
clock = at + (RADAR_PAID_WINDOW_DAYS - 1) * DAY;
assert.equal((await ledger.reserve('cirium-flex', policy3)).ok, false, 'day 33 still inside the window');
clock = at + RADAR_PAID_WINDOW_DAYS * DAY;
assert.equal((await ledger.reserve('cirium-flex', policy3)).ok, true, 'spend older than 33 UTC days leaves the window');
assert.deepEqual(Object.keys(JSON.parse(pool.table.get(radarSpendKey('cirium-flex'))).days), ['2032-11-22'], 'expired days are pruned');
assert.equal((await createRadarSpendLedger({ pool: null }).reserve('cirium-flex', policy3)).reason, 'ledger-unavailable');
assert.equal((await createRadarSpendLedger({ pool: async () => null }).reserve('cirium-flex', policy3)).reason, 'ledger-unavailable');
pool = fakePool({ failOn: 'UPDATE' }); assert.equal((await createRadarSpendLedger({ pool, now: () => at }).reserve('cirium-flex', policy3)).reason, 'ledger-unavailable');
assert(pool.log.includes('rollback') && pool.log.at(-1) === 'release');
for (const corrupt of [{ v: 1, kind: 'radar-paid-spend' }, { v: 2, kind: 'radar-paid-spend', provider: 'cirium-flex', days: { '2032-10-20': -1 }, attempts: 0 },
  { v: 2, kind: 'radar-paid-spend', provider: 'cirium-flex', days: { '2099-01-01': 1 }, attempts: 0 }, { v: 2, kind: 'radar-paid-spend', provider: 'flightaware', days: {}, attempts: 0 }]) {
  pool = fakePool(); pool.table.set(radarSpendKey('cirium-flex'), JSON.stringify(corrupt));
  assert.equal((await createRadarSpendLedger({ pool, now: () => at }).reserve('cirium-flex', policy3)).reason, 'ledger-unavailable', JSON.stringify(corrupt));
}

// Cache: one upstream call per occurrence while pending/fresh; original receipt kept.
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
// A request-specific refusal is never cached nor handed to a coalesced waiter.
tasks = 0; const [refusedLeader, waiter] = await Promise.all([cache.run('r', slow({ ok: false, cacheable: false })), cache.run('r', slow(flexOk()))]);
assert.equal(refusedLeader.cacheable, false); assert.equal(waiter.gate, '12', 'waiter retried with its own task'); assert.equal(tasks, 2);
assert.notEqual(radarOccurrenceKey('cirium-flex', identity), radarOccurrenceKey('cirium-flex', { ...identity, scheduledDepartureUtc: '2032-10-21T12:30:00.000Z' }));
assert.notEqual(radarOccurrenceKey('cirium-flex', identity), radarOccurrenceKey('flightaware', identity));

// 3. Paid source: reserve, then re-admit immediately before the paid call; no refund.
pool = fakePool(); let upstream = 0, allowed = true, admissions = 0;
const admit = async () => { admissions++; return allowed; };
const paid = createPaidRadarSource({ ledger: createRadarSpendLedger({ pool, now: () => at }), cache: createRadarSourceCache({ now: () => at }), env: { FLIGHTAWARE_COST_PER_CALL_USD: '2' } });
const spent = () => JSON.parse(pool.table.get(radarSpendKey('flightaware')) || '{"days":{}}').days['2032-10-20'] || 0;
const revokingLedger = { async reserve(provider, policy) { const r = await createRadarSpendLedger({ pool, now: () => at }).reserve(provider, policy); allowed = false; return r; } };
const paidRevoked = createPaidRadarSource({ ledger: revokingLedger, cache: createRadarSourceCache({ now: () => at }), env: { FLIGHTAWARE_COST_PER_CALL_USD: '2' } });
result = await paidRevoked('flightaware', identity, async () => { upstream++; return fa; }, admit);
assert.equal(result.providerState, 'authority-invalidated'); assert.equal(upstream, 0, 'revoked while waiting for the ledger: no paid call');
assert.equal(spent(), 2_000_000, 'the reservation is not refunded');
allowed = true;
assert.equal((await paidRevoked('flightaware', identity, async () => { upstream++; return fa; }, async () => false)).providerState, 'authority-invalidated');
allowed = true;
assert.equal((await paid('flightaware', identity, async () => { upstream++; return fa; })).providerState, 'authority-invalidated', 'missing admission fails closed');
assert.equal(upstream, 0); assert.equal(spent(), 6_000_000, 'three abandoned reservations stay spent');
assert.equal((await paid('flightaware', identity, async () => { upstream++; throw Error('synthetic'); }, admit)).providerState, 'provider_error');
assert.equal((await paid('flightaware', identity, async () => { upstream++; return fa; }, admit)).providerState, 'provider_error', 'cached miss: no second paid call for 2 min');
assert.equal(upstream, 1); assert.equal(spent(), 8_000_000);
assert.equal((await paid('flightaware', { ...identity, flight: 'LA9999' }, async () => { upstream++; return fa; }, admit)).ok, true, 'last US$ 2 of the cap');
assert.equal((await paid('flightaware', { ...identity, flight: 'LA9998' }, async () => { upstream++; return fa; }, admit)).providerState, 'budget-exhausted');
assert.equal(upstream, 2, 'denied budget never reaches the provider'); assert.equal(spent(), 10_000_000);
assert.equal((await paid('cirium-flex', identity, async () => { upstream++; return fa; }, admit)).providerState, 'budget-not-configured'); assert.equal(upstream, 2);

// 2. Activation: off unless exactly 'true'; enabled but incomplete refuses instead of the legacy race.
const on = { CIRIUM_FLEX_RADAR_ENABLED: 'true', CIRIUM_APP_ID: 'a', CIRIUM_APP_KEY: 'b' };
for (const e of [{}, { CIRIUM_APP_ID: 'a', CIRIUM_APP_KEY: 'b' }, { ...on, CIRIUM_FLEX_RADAR_ENABLED: '1' }, { ...on, CIRIUM_FLEX_RADAR_ENABLED: 'TRUE' }])
  assert.equal(ciriumFlexRadarOptions(e), undefined, JSON.stringify(e));
let fallbackCalls = 0;
for (const e of [on, { ...on, CIRIUM_APP_KEY: '' }, { ...on, CIRIUM_APP_ID: ' ' }]) {
  const refusing = ciriumFlexRadarOptions(e); // `on` before configureRadarPaidSources: no ledger runtime
  assert.equal(refusing.enabled, true); assert.equal(refusing.flightAwareFallback, true);
  assert.equal((await refusing.primary(identity, admit)).providerState, 'not_configured');
  assert.equal((await refusing.guardFallback(identity, async () => { fallbackCalls++; return fa; }, admit)).providerState, 'not_configured');
}
assert.equal(fallbackCalls, 0, 'refusal never reaches FlightAware');
configureRadarPaidSources({ pool: fakePool(), now: () => at, env: {} });
const options = ciriumFlexRadarOptions(on);
assert.equal(options.enabled, true); assert.equal(typeof options.primary, 'function'); assert.equal(typeof options.guardFallback, 'function');
assert.equal((await options.primary(identity, admit)).providerState, 'budget-not-configured', 'no verified cost: no Cirium call');
assert.equal((await import('../server/cirium-radar-injection.mjs')).defaultCiriumRadarOptions(), undefined, 'CI env: production stays OFF');

// Actual runRadarRace: paid primary/guard receive admission; Cirium gate skips FlightAware; receipt not refreshed.
const source = fs.readFileSync('server.mjs', 'utf8'), ast = ts.createSourceFile('server.mjs', source, 99, true, ts.ScriptKind.JS);
const fn = name => { const n = ast.statements.find(x => ts.isFunctionDeclaration(x) && x.name?.text === name); assert(n, name); return n.getText(ast); };
const later = at + 4 * 60_000; let faCalls = 0, guarded = 0, primaryAdmit = null;
const scope = vm.createContext({ ...radarEvidence, Date: class extends Date { static now() { return later; } }, process: { env: {} },
  gateQueryDay: i => gateQueryDay(i, later), radarResultDecision: (p, i) => radarResultDecision(p, i, later), gateQuerySuppressed: d => ({ ok: false, querySuppressed: true, queryReason: d.reason }),
  ciriumRadarInjectionEnabled: o => o?.enabled === true, runCiriumRadarInjection: async () => { throw Error('Sky path must not run'); }, ciriumRadarProjection: () => ({}),
  runCiriumFlightAwareSequence: o => runCiriumFlightAwareSequence({ ...o, now: () => later }), sequentialRadarProjection: () => ({}),
  providerFlightAware: async () => { faCalls++; return fa; }, firstKnown: (...v) => v.find(x => x !== undefined && x !== null && x !== '') ?? '' });
vm.runInContext(['publicRadarPayload', 'runRadarRace'].map(fn).join('\n'), scope);
const readAdmission = async () => true;
const ctx = (primary) => ({ raw: 'LA3622', gateQueryEvidence: identity, radarReadAdmission: readAdmission,
  ciriumRadarOptions: { enabled: true, flightAwareFallback: true, primary: async (id, a) => { primaryAdmit = a; return primary; },
    guardFallback: async (id, call, a) => { guarded++; assert.deepEqual(id, identity); assert.equal(a, readAdmission); return call(); } } });
let body = await scope.runRadarRace(ctx(flexOk()), 'GRU', 'SSA');
assert.equal(primaryAdmit, readAdmission, 'primary receives the request admission'); assert.equal(faCalls, 0); assert.equal(guarded, 0);
assert.equal(body.gate, '12'); assert.equal(body.sourceReceivedAt, at, 'cached Cirium receipt is not replaced by Date.now()');
body = await scope.runRadarRace(ctx(flexOk({ gate: '' })), 'GRU', 'SSA');
assert.equal(guarded, 1); assert.equal(faCalls, 1); assert.equal(body.gate, '18');
assert.match(source, /^configureRadarPaidSources\(\{ pool: conciergeDbPool \}\);$/m, 'startup hands the existing MySQL pool to the paid ledger');
console.log('PASS paid Radar sequence: strict appendix FS→IATA binding and planned departure, Cirium gate skips FlightAware, re-admission after reservation, enabled-but-incomplete refuses, conservative cost/cap, rolling 33-day window, cache/coalescing without sharing refusals');
