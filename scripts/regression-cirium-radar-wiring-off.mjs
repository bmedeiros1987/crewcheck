import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.argv[2] !== '--worker') {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker', ...process.argv.slice(2)],
    { env: { TZ: process.env.TZ || 'UTC' }, stdio: 'inherit' });
  process.exit(child.status ?? 1);
}
globalThis.fetch = () => { throw Error('Real network forbidden'); };
const injection = await import('../server/cirium-radar-injection.mjs');
const { createCiriumSkyTransport } = await import('../server/cirium-sky-transport.mjs');
assert.equal(injection.defaultCiriumRadarOptions(), undefined, 'production gate remains OFF');
const { patchCiriumRadarOff } = await import('./cirium-radar-off/patch.mjs');
const source = fs.readFileSync('server.mjs', 'utf8');
assert.equal(patchCiriumRadarOff(source), source, 'materializer is idempotent');
const poison = new Proxy({}, { get() { throw Error('OFF inspected identity'); } });
assert.equal(await injection.runCiriumRadarInjection(poison, { enabled: false, source: () => { throw Error('OFF source'); } }), null);
assert.deepEqual(injection.ciriumRadarRegistration(), { key: 'cirium-sky', available: false, state: 'disabled' });

function harness(text, forbidLegacy = false) {
  const counters = { provider: 0, auth: 0, load: 0, apply: 0, save: 0, env: 0, fetch: 0 };
  const roster = { fixture: 'canonical-unchanged' };
  const sandbox = { ...injection, radarHealth: new Map(), console, setTimeout, clearTimeout, URL,
    Date: class extends Date { static now() { return 1791763200000; } },
    process: { env: new Proxy({}, { get() { counters.env++; if (forbidLegacy) throw Error('Synthetic path read env'); return undefined; } }) },
    fetch() { counters.fetch++; throw Error('Network forbidden'); },
    telegramRequestUser() { counters.auth++; if (forbidLegacy) throw Error('Synthetic path reached auth'); return { email: 'fictional@example.invalid' }; },
    telegramAppRequestAllowed() { return true; }, conciergeSafeKey(value) { return value; },
    async conciergeLoadSnapshot() { counters.load++; return { roster }; }, conciergeAccessMatches() { return true; },
    conciergeFindFlight() { return { leg: {} }; }, conciergeApplyRadar() { counters.apply++; },
    async conciergeSaveSnapshotAsync() { counters.save++; } };
  const scope = text.slice(text.indexOf('function sendJson('), text.indexOf('function mapsServerKey('));
  assert.ok(scope.includes('async function handleRadar('));
  vm.createContext(sandbox); vm.runInContext(scope, sandbox);
  vm.runInContext(`for (const name of ['providerFlightAware','providerCustom','providerAviationstack','providerAirLabs','providerAeroDataBox']) {
    globalThis[name] = async () => { legacyHit(); return name === 'providerCustom' ? legacyRow : null; };
  }`, Object.assign(sandbox, { legacyHit() { counters.provider++; if (forbidLegacy) throw Error('Synthetic path reached fallback'); },
    legacyRow: { ok: true, configured: true, flight: 'LA3377', origin: 'GRU', destination: 'BSB', gate: 'C4', terminal: '2',
      status: 'Programado', departure: '2026-10-12T01:00:00Z', arrival: '2026-10-12T03:00:00Z', latencyMs: 100 } }));
  return { counters, roster, async call(url, options) {
    let body; const res = { writeHead(status) { assert.equal(status, 200); }, end(value) { body = JSON.parse(value); } };
    await sandbox.handleRadar({}, res, new URL(url), options); return body;
  } };
}
const legacyUrl = 'https://fixture.invalid/api/radar-flight?flight=LA3377&origin=GRU&destination=BSB';
const normal = harness(source); const normalBody = await normal.call(legacyUrl);
const off = harness(source); const offBody = await off.call(legacyUrl + '&ciriumEnabled=true', { cirium: { enabled: false, source: poison } });
assert.deepEqual(offBody, normalBody, 'OFF preserves current fallback payload');
assert.deepEqual(off.counters, normal.counters, 'OFF preserves existing provider/snapshot behavior');
assert.equal(offBody.provider, undefined); assert.equal(offBody.provenance, undefined);
assert.equal(offBody.gate, 'C4'); assert.equal(offBody.exportedToConcierge, true);
assert.equal(off.counters.apply, 1); assert.equal(off.counters.save, 1);
// The legacy write above is existing behavior; the isolated Cirium result must never reach it.
if (process.argv[3]) {
  const baseline = harness(fs.readFileSync(process.argv[3], 'utf8'));
  const baselineBody = await baseline.call(legacyUrl);
  if (!source.includes('function selectFlightAwareOccurrence(')) assert.deepEqual(normalBody, baselineBody, 'raw OFF equals actual pre-wiring baseline');
  else {
    const omitQuality = ({ quality, ...rest }) => rest;
    assert.deepEqual(omitQuality(normalBody), omitQuality(baselineBody), 'prepared fallback shape/identity equals raw baseline');
  }
}
const identity = { carrierNamespace: 'FS', carrierFsCode: 'AA', flightNumber: '123', origin: 'JFK', destination: 'BOS',
  departureDate: '2026-11-01', originTimeZone: 'America/New_York', scheduledDepartureUtc: '2026-11-01T05:30:00Z' };
const params = new URLSearchParams({ flight: 'AA123', ...identity });
const url = `https://fixture.invalid/api/radar-flight?${params}`;
const row = { carrierFsCode: 'AA', flightNumber: '123', departureAirportFsCode: 'JFK', arrivalAirportFsCode: 'BOS', status: 'S',
  operationalTimes: { scheduledGateDeparture: { dateUtc: identity.scheduledDepartureUtc }, scheduledGateArrival: { dateUtc: '2026-11-01T08:00:00Z' } },
  airportResources: { departureGate: 'A12', arrivalGate: 'B20' }, lastUpdatedDate: '2026-11-01T04:00:00Z' };
let sourceCalls = 0;
const synthetic = harness(source, true);
const body = await synthetic.call(url, { cirium: { enabled: true, source: async request => {
  sourceCalls++; assert.deepEqual(request, identity); assert.equal(Object.isFrozen(request), true);
  return { state: 'available', rows: [row] };
} } });
assert.equal(sourceCalls, 1); assert.equal(body.ok, true); assert.equal(body.configured, false);
assert.equal(body.provider, 'cirium-sky'); assert.equal(body.providerState, 'available');
assert.equal(body.gate, 'A12'); assert.equal(body.updatedAt, '2026-11-01T04:00:00.000Z');
assert.equal(body.canonicalReadOnly, true); assert.equal(body.exportedToConcierge, false);
assert.ok(body.occurrenceKey.endsWith('|UTC:2026-11-01T05:30:00.000Z'));
assert.equal(body.provenance.occurrenceKey, body.occurrenceKey);
for (const field of Object.values(body.provenance.fields)) assert.equal(field.occurrenceKey, body.occurrenceKey);
assert.equal(body.provenance.fields.departureGate.provider, 'cirium-sky');
assert.deepEqual(synthetic.counters, { provider: 0, auth: 0, load: 0, apply: 0, save: 0, env: 0, fetch: 0 });
assert.deepEqual(synthetic.roster, { fixture: 'canonical-unchanged' });
const missing = new URL(url); missing.searchParams.delete('originTimeZone');
const invalid = harness(source, true);
assert.equal((await invalid.call(missing, { cirium: { enabled: true, source: () => { throw Error('Invalid request reached source'); } } })).providerState, 'invalid_request');
const wrongFlight = new URL(url); wrongFlight.searchParams.set('flight', 'AA124');
assert.equal((await invalid.call(wrongFlight, { cirium: { enabled: true, source: () => { throw Error('Wrong flight reached source'); } } })).providerState, 'invalid_request');
for (const [expected, sourceFn] of [['no_data', async () => ({ state: 'available', rows: [] })],
  ['ambiguous', async () => ({ state: 'available', rows: [row, row] })], ['provider_error', async () => { throw Error('Synthetic failure'); }],
  ['not_configured', undefined], ['timeout', async () => ({ state: 'timeout' })]]) {
  const h = harness(source, true); const response = await h.call(url, { cirium: { enabled: true, source: sourceFn } });
  assert.equal(response.providerState, expected); assert.equal(response.ok, false); assert.equal(response.exportedToConcierge, false);
  assert.equal(h.counters.apply + h.counters.save + h.counters.provider + h.counters.env + h.counters.fetch + h.counters.auth, 0);
}
// Actual handler -> race -> Sky transport -> pure adapter/provenance -> public response.
// Only an explicit code capability can select this path; HTTP parameters cannot.
const skyNow = Date.parse(row.lastUpdatedDate);
const skyPolicy = { product: 'Sky Flight Status', evidenceId: 'OFFLINE_ONLY', contractEvidenceId: 'OFFLINE_ONLY',
  validFromMs: skyNow - 1000, validUntilMs: skyNow + 300_000, maxCalls: 1, dateWindowDays: 2,
  maxObservationAgeMs: 900_000, airportTimeZones: { JFK: 'America/New_York' } };
let upstream = 0;
const skyTransport = createCiriumSkyTransport({ enabled: true, policy: skyPolicy, now: () => skyNow,
  credential: () => 'OFFLINE_FAKE_SECRET', fetchImpl: async (endpoint, options) => {
    upstream++; assert.equal(endpoint.origin, 'https://api.sky.cirium.com'); assert.deepEqual([...endpoint.searchParams], [['codeType', 'FS']]); assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({ flightStatuses: [row] }), { headers: { 'content-type': 'application/json' } });
  } });
const skyHarness = harness(source, true);
const skyBody = await skyHarness.call(url, { cirium: { enabled: true, transport: skyTransport } });
assert.equal(upstream, 1); assert.equal(skyBody.providerState, 'available'); assert.equal(skyBody.configured, true);
assert.equal(skyBody.gate, 'A12'); assert.equal(skyBody.occurrenceKey, body.occurrenceKey);
assert.deepEqual(skyBody.provenance, body.provenance); assert.equal(skyBody.exportedToConcierge, false);
assert.deepEqual(skyHarness.counters, { provider: 0, auth: 0, load: 0, apply: 0, save: 0, env: 0, fetch: 0 });
assert.ok(!JSON.stringify(skyBody).includes('OFFLINE_FAKE_SECRET'));
const failedSky = createCiriumSkyTransport({ enabled: true, policy: skyPolicy, now: () => skyNow,
  credential: () => 'OFFLINE_FAKE_SECRET', fetchImpl: async () => new Response('{}', { status: 403 }) });
const failedHarness = harness(source, true);
assert.equal((await failedHarness.call(url, { cirium: { enabled: true, transport: failedSky } })).providerState, 'provider_error');
assert.equal(failedHarness.counters.provider + failedHarness.counters.apply + failedHarness.counters.save, 0);
console.log(`PASS Cirium Radar wiring OFF/synthetic/Sky fake HTTP real handlers; ${source.includes('function selectFlightAwareOccurrence(') ? 'prepared' : 'raw'}; TZ=${process.env.TZ}; zero Cirium env/real network/canonical writes`);
