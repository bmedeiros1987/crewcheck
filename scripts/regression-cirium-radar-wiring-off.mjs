import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as gatePolicy from '../shared/gate-query-day.mjs';
import { prepareConciergeCanonicalBridge } from './p1-concierge-journey/bridge.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.argv[2] !== '--worker') {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker', ...process.argv.slice(2)],
    { env: { TZ: process.env.TZ || 'UTC', NODE_OPTIONS: process.env.NODE_OPTIONS }, stdio: 'inherit' });
  process.exit(child.status ?? 1);
}
globalThis.fetch = () => { throw Error('Real network forbidden'); };
// Compile the real engine in disposable storage: lifecycle raw/prepared trees
// must remain byte-identical, including their generated outputs.
const canonicalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-cirium-canonical-'));
let buildCanonicalRosterEvents;
try {
  fs.cpSync('client/src/lib', path.join(canonicalRoot, 'client/src/lib'), { recursive: true });
  prepareConciergeCanonicalBridge(canonicalRoot);
  ({ buildCanonicalRosterEvents } = await import(pathToFileURL(path.join(canonicalRoot, 'server/concierge/generated/canonicalRoster.mjs')).href));
} finally { fs.rmSync(canonicalRoot, { recursive: true, force: true }); }
function publishedRoster(flight, date, departureTime, arrivalTime) {
  return { year: 2026, month: Number(date.slice(3, 5)), base: 'GRU', days: [{ date, type: 'VOO',
    legs: [{ flightNumber: flight, origin: 'GRU', destination: 'BSB', departureTime, arrivalTime }] }] };
}
const legacyRoster = publishedRoster('LA3377', '11/10/2026', '22:00', '00:00');
const ciriumRoster = publishedRoster('AA123', '01/11/2026', '02:30', '05:00');
const injection = await import('../server/cirium-radar-injection.mjs');
const { evaluateCiriumRadar } = await import('../server/cirium-radar-provider.mjs');
// The valid fallback fixture inherits its planned UTC contract from the real adapter.
const legacyValidated = evaluateCiriumRadar({carrierNamespace:'FS',carrierFsCode:'LA',flightNumber:'3377',origin:'GRU',destination:'BSB',departureDate:'2026-10-11',originTimeZone:'America/Sao_Paulo',scheduledDepartureUtc:'2026-10-12T01:00:00Z'}, {state:'available',rows:[{carrierFsCode:'LA',flightNumber:'3377',departureAirportFsCode:'GRU',arrivalAirportFsCode:'BSB',operationalTimes:{scheduledGateDeparture:{dateUtc:'2026-10-11T22:00:00-03:00'},scheduledGateArrival:{dateUtc:'2026-10-12T03:00:00Z'}}}]}, {enabled:true});
assert.equal(legacyValidated.state,'available');
assert.equal(legacyValidated.candidate.scheduledDepartureUtc,'2026-10-12T01:00:00.000Z');
const { createCiriumSkyTransport } = await import('../server/cirium-sky-transport.mjs');
assert.equal(injection.defaultCiriumRadarOptions(), undefined, 'production gate remains OFF');
const { patchCiriumRadarOff } = await import('./cirium-radar-off/patch.mjs');
const source = fs.readFileSync('server.mjs', 'utf8');
assert.equal(patchCiriumRadarOff(source), source, 'materializer is idempotent');
const poison = new Proxy({}, { get() { throw Error('OFF inspected identity'); } });
assert.equal(await injection.runCiriumRadarInjection(poison, { enabled: false, source: () => { throw Error('OFF source'); } }), null);
assert.deepEqual(injection.ciriumRadarRegistration(), { key: 'cirium-sky', available: false, state: 'disabled' });

function harness(text, forbidLegacy = false, overrides = {}) {
  const counters = { provider: 0, auth: 0, load: 0, apply: 0, save: 0, env: 0, fetch: 0 };
  const roster = structuredClone(overrides.roster || (forbidLegacy ? ciriumRoster : legacyRoster));
  const now = overrides.now ?? Date.parse(forbidLegacy ? '2026-11-01T04:00:00Z' : '2026-10-12T00:00:00Z');
  const sandbox = { ...injection, ...gatePolicy, buildCanonicalRosterEvents,
    gateQueryDay: (identity, instant) => gatePolicy.gateQueryDay(identity, instant ?? now), radarHealth: new Map(), console, setTimeout, clearTimeout, URL,
    Date: class extends Date { static now() { return now; } },
    process: { env: new Proxy({}, { get() { counters.env++; if (forbidLegacy) throw Error('Synthetic path read env'); return undefined; } }) },
    fetch() { counters.fetch++; throw Error('Network forbidden'); },
    telegramRequestUser() { counters.auth++; return { email: 'fictional@example.invalid', authenticated: true }; },
    telegramAppRequestAllowed() { return true; }, conciergeSafeKey(value) { return value; },
    async conciergeLoadSnapshot() { counters.load++; return { email:'fictional@example.invalid', roster }; }, conciergeAccessMatches() { return true; },
    conciergeFindFlight() { return { leg: {} }; }, conciergeApplyRadar() { counters.apply++; },
    async conciergeSaveSnapshotAsync() { counters.save++; } };
  const scope = text.slice(text.indexOf('function sendJson('), text.indexOf('function mapsServerKey('));
  assert.ok(scope.includes('async function handleRadar('));
  vm.createContext(sandbox); vm.runInContext(scope, sandbox);
  vm.runInContext(`for (const name of ['providerFlightAware','providerCustom','providerAviationstack','providerAirLabs','providerAeroDataBox']) {
    globalThis[name] = async () => { legacyHit(); return name === 'providerCustom' ? legacyRow : null; };
  }`, Object.assign(sandbox, { legacyHit() { counters.provider++; if (forbidLegacy) throw Error('Synthetic path reached fallback'); },
    legacyRow: { ok: true, configured: true, flight: 'LA3377', origin: 'GRU', destination: 'BSB', gate: 'C4', terminal: '2',
      status: 'Programado', scheduledDepartureUtc: legacyValidated.candidate.scheduledDepartureUtc, departure: '2026-10-12T01:00:00Z', arrival: '2026-10-12T03:00:00Z', latencyMs: 100 } }));
  return { counters, roster, async call(url, options) {
    let body; const res = { writeHead(status) { assert.equal(status, 200); }, end(value) { body = JSON.parse(value); } };
    await sandbox.handleRadar({}, res, new URL(url), options); return body;
  } };
}
const legacyUrl = 'https://fixture.invalid/api/radar-flight?flight=LA3377&origin=GRU&destination=BSB&departureDate=2026-10-11&scheduledDepartureUtc=2026-10-12T01:00:00Z';
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
const identity = { carrierNamespace: 'FS', carrierFsCode: 'AA', flightNumber: '123', origin: 'GRU', destination: 'BSB',
  departureDate: '2026-11-01', originTimeZone: 'America/Sao_Paulo', scheduledDepartureUtc: '2026-11-01T05:30:00Z' };
assert.equal(buildCanonicalRosterEvents(ciriumRoster).find(event => event.kind === 'flight').startDateTime, '2026-11-01T05:30:00.000Z', 'published 02:30 BRT is canonical 05:30Z');
const params = new URLSearchParams({ flight: 'AA123', ...identity });
const url = `https://fixture.invalid/api/radar-flight?${params}`;
const row = { carrierFsCode: 'AA', flightNumber: '123', departureAirportFsCode: 'GRU', arrivalAirportFsCode: 'BSB', status: 'S',
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
assert.equal(body.scheduledDepartureUtc, '2026-11-01T05:30:00.000Z');
assert.equal(body.gate, 'A12'); assert.equal(body.updatedAt, '2026-11-01T04:00:00.000Z');
assert.equal(body.canonicalReadOnly, true); assert.equal(body.exportedToConcierge, false);
assert.ok(body.occurrenceKey.endsWith('|UTC:2026-11-01T05:30:00.000Z'));
assert.equal(body.provenance.occurrenceKey, body.occurrenceKey);
for (const field of Object.values(body.provenance.fields)) assert.equal(field.occurrenceKey, body.occurrenceKey);
assert.equal(body.provenance.fields.departureGate.provider, 'cirium-sky');
assert.deepEqual(synthetic.counters, { provider: 0, auth: 2, load: 1, apply: 0, save: 0, env: 0, fetch: 0 });
assert.deepEqual(synthetic.roster, ciriumRoster, 'Cirium cannot mutate the authorized published roster');
const delayedRow=structuredClone(row);
delayedRow.operationalTimes.estimatedGateDeparture={dateUtc:'2026-11-01T07:30:00Z'};
delayedRow.operationalTimes.estimatedGateArrival={dateUtc:'2026-11-01T10:00:00Z'};
const delayedHarness=harness(source,true);
const delayedBody=await delayedHarness.call(url,{cirium:{enabled:true,source:async()=>({state:'available',rows:[delayedRow]})}});
assert.equal(delayedBody.ok,true);assert.equal(delayedBody.gate,'A12');
assert.equal(delayedBody.scheduledDepartureUtc,'2026-11-01T05:30:00.000Z');
assert.equal(delayedBody.departure,'2026-11-01T07:30:00Z');
assert.equal(delayedHarness.counters.save,0);assert.equal(delayedHarness.counters.provider,0);
const missing = new URL(url); missing.searchParams.delete('originTimeZone');
const invalid = harness(source, true);
assert.equal((await invalid.call(missing, { cirium: { enabled: true, source: () => { throw Error('Invalid request reached source'); } } })).providerState, 'invalid_request');
const wrongFlight = new URL(url); wrongFlight.searchParams.set('flight', 'AA124');
const wrongFlightHarness = harness(source, true, { roster: publishedRoster('AA124', '01/11/2026', '02:30', '05:00') });
assert.equal((await wrongFlightHarness.call(wrongFlight, { cirium: { enabled: true, source: () => { throw Error('Wrong flight reached source'); } } })).providerState, 'invalid_request');
for (const [expected, sourceFn] of [['no_data', async () => ({ state: 'available', rows: [] })],
  ['ambiguous', async () => ({ state: 'available', rows: [row, row] })], ['provider_error', async () => { throw Error('Synthetic failure'); }],
  ['not_configured', undefined], ['timeout', async () => ({ state: 'timeout' })]]) {
  const h = harness(source, true); const response = await h.call(url, { cirium: { enabled: true, source: sourceFn } });
  assert.equal(response.providerState, expected); assert.equal(response.ok, false); assert.equal(response.exportedToConcierge, false);
  assert.equal(h.counters.auth, 2); assert.equal(h.counters.load, 1);
  assert.deepEqual(h.roster, ciriumRoster);
  assert.equal(h.counters.apply + h.counters.save + h.counters.provider + h.counters.env + h.counters.fetch, 0);
}
// These are cost/authority guards, independent of the adapter's invalid_request
// assertions above. Reuse the real resolver; never stub an allowed occurrence.
for (const [name, changes, overrides] of [
  ['unpublished', { flight: 'AA124' }, {}],
  ['unknown origin', { origin: 'JFK', originTimeZone: 'America/New_York' }, {
    roster: { ...ciriumRoster, days: [{ ...ciriumRoster.days[0], legs: [{ ...ciriumRoster.days[0].legs[0], origin: 'JFK' }] }] },
  }],
  ['previous origin day', {}, { now: Date.parse('2026-11-01T02:59:59Z') }],
  ['missing canonical instant', { scheduledDepartureUtc: '' }, {}],
]) {
  const guarded = harness(source, true, overrides);
  const denied = new URL(url);
  for (const [key, value] of Object.entries(changes)) denied.searchParams.set(key, value);
  let deniedSourceCalls = 0, deniedCredentialReads = 0;
  const reply = await guarded.call(denied, { cirium: { enabled: true,
    source() { deniedSourceCalls++; throw Error('Denied occurrence reached source'); },
    transport: { credential() { deniedCredentialReads++; throw Error('Denied occurrence reached credentials'); } },
  } });
  assert.equal(reply.querySuppressed, true, name); assert.equal(reply.ok, false, name);
  assert.equal(reply.exportedToConcierge, false, name);
  assert.equal(deniedSourceCalls + deniedCredentialReads, 0, name);
  assert.deepEqual(guarded.counters, { provider: 0, auth: 2, load: 1, apply: 0, save: 0, env: 0, fetch: 0 }, name);
  assert.deepEqual(guarded.roster, overrides.roster || ciriumRoster, name);
}
// Actual handler -> race -> Sky transport -> pure adapter/provenance -> public response.
// Only an explicit code capability can select this path; HTTP parameters cannot.
const skyNow = Date.parse(row.lastUpdatedDate);
const skyPolicy = { product: 'Sky Flight Status', evidenceId: 'OFFLINE_ONLY', contractEvidenceId: 'OFFLINE_ONLY',
  validFromMs: skyNow - 1000, validUntilMs: skyNow + 300_000, maxCalls: 1, dateWindowDays: 2,
  maxObservationAgeMs: 900_000, airportTimeZones: { GRU: 'America/Sao_Paulo' } };
let upstream = 0;
const skyTransport = createCiriumSkyTransport({ enabled: true, policy: skyPolicy, now: () => skyNow,
  credential: () => 'OFFLINE_FAKE_SECRET', fetchImpl: async (endpoint, options) => {
    upstream++; assert.equal(endpoint.origin, 'https://api.sky.cirium.com'); assert.deepEqual([...endpoint.searchParams], [['codeType', 'FS']]); assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({ flightStatuses: [row] }), { headers: { 'content-type': 'application/json' } });
  } });
const skyHarness = harness(source, true);
const skyBody = await skyHarness.call(url, { cirium: { enabled: true, transport: skyTransport } });
assert.equal(upstream, 1); assert.equal(skyBody.providerState, 'available'); assert.equal(skyBody.configured, true);
assert.equal(skyBody.scheduledDepartureUtc, '2026-11-01T05:30:00.000Z');
assert.equal(skyBody.scheduledDepartureUtc, body.scheduledDepartureUtc);
assert.equal(skyBody.gate, 'A12'); assert.equal(skyBody.occurrenceKey, body.occurrenceKey);
assert.deepEqual(skyBody.provenance, body.provenance); assert.equal(skyBody.exportedToConcierge, false);
assert.deepEqual(skyHarness.counters, { provider: 0, auth: 2, load: 1, apply: 0, save: 0, env: 0, fetch: 0 });
assert.ok(!JSON.stringify(skyBody).includes('OFFLINE_FAKE_SECRET'));
// The real evaluator must reject the original impossible offset through both transports.
for(const [offset,minutes] of [['+14:01',841],['+15:00',900],['-15:00',-900]]) {
 const invalidRow=structuredClone(row);
 for(const field of ['scheduledGateDeparture','scheduledGateArrival']) {
  const stamp=invalidRow.operationalTimes[field].dateUtc;
  invalidRow.operationalTimes[field].dateUtc=new Date(Date.parse(stamp)+minutes*60000).toISOString().slice(0,-1)+offset;
 }
 const invalidInjected=harness(source,true);
 const rejected=await invalidInjected.call(url,{cirium:{enabled:true,source:async()=>({state:'available',rows:[invalidRow]})}});
 assert.equal(rejected.ok,false,offset);assert.equal(rejected.providerState,'invalid_payload');assert.equal(rejected.gate||'','');
 assert.equal(invalidInjected.counters.provider,0);assert.equal(invalidInjected.counters.save,0);
 let fakeCalls=0;
 const invalidTransport=createCiriumSkyTransport({enabled:true,policy:skyPolicy,now:()=>skyNow,credential:()=> 'OFFLINE_FAKE_SECRET',fetchImpl:async()=>{fakeCalls++;return new Response(JSON.stringify({flightStatuses:[invalidRow]}),{headers:{'content-type':'application/json'}});}});
 const invalidSky=harness(source,true);
 const skyRejected=await invalidSky.call(url,{cirium:{enabled:true,transport:invalidTransport}});
 assert.equal(fakeCalls,1);assert.equal(skyRejected.ok,false,offset);assert.equal(skyRejected.providerState,'invalid_payload');assert.equal(skyRejected.gate||'','');
 assert.equal(invalidSky.counters.provider,0);assert.equal(invalidSky.counters.save,0);
}

const failedSky = createCiriumSkyTransport({ enabled: true, policy: skyPolicy, now: () => skyNow,
  credential: () => 'OFFLINE_FAKE_SECRET', fetchImpl: async () => new Response('{}', { status: 403 }) });
const failedHarness = harness(source, true);
assert.equal((await failedHarness.call(url, { cirium: { enabled: true, transport: failedSky } })).providerState, 'provider_error');
assert.equal(failedHarness.counters.provider + failedHarness.counters.apply + failedHarness.counters.save, 0);
console.log(`PASS Cirium Radar wiring OFF/synthetic/Sky fake HTTP real handlers; ${source.includes('function selectFlightAwareOccurrence(') ? 'prepared' : 'raw'}; TZ=${process.env.TZ}; zero Cirium env/real network/canonical writes`);
