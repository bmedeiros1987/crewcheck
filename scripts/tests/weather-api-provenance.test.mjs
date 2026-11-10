import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readWeatherSource, weatherFunction } from './weather-test-loader.mjs';
import { reviewedWeatherStation } from '../../shared/weather-station-overrides.mjs';
import { weatherObservationSourceTime } from '../../shared/weather-observation-source-time.mjs';
import { weatherRuntimeHarness, WEATHER_NOW, WEATHER_STATION } from './weather-runtime-harness.mjs';
const server = readWeatherSource('server.mjs');
const table = server.slice(server.indexOf('const CREWCHECK_AIRPORT_ICAO ='), server.indexOf('const CREWCHECK_AIRPORT_NAMES ='));
const source = names => names.map(name => weatherFunction(server, name)).join('\n');
function harness({ row, redemet = false } = {}) {
  const network = [], replies = [];
  const scope = vm.createContext({ URL, Date, reviewedWeatherStation, aviationWeatherCache: new Map(),
    redemetApiKey: () => redemet ? 'synthetic-key' : '', aviationWeatherUserAgent: () => 'synthetic-agent',
    safeJsonFetch: async (...args) => { network.push(args); return { ok: true, payload: redemet ? { data: [row] } : [row], text: '' }; },
    sendJson: (_req, status, body) => { replies.push({ status, body }); return body; },
    decodeMetarPtBr: () => [], decodeTafPtBr: () => [], aviationReportMetrics: () => ({ severity: 2, hazards: [] }),
  });
  vm.runInContext(table + source(['firstKnown', 'safeText', 'airportIcao', 'redemetHour', 'reportTimestamp', 'observationTimeSource',
    'fetchRedemetMetars', 'fetchAviationWeatherReport', 'aviationReportMetrics', 'handleAviationWeather']), scope);
  return { scope, network, replies };
}
const raw = 'METAR SBPS 021730Z 02015G30KT 9000 -RA BKN042';
test('actual REDEMET record/cache preserves selected source field/value without changing legacy formatting', async () => {
  const row = { id_localidade: 'SBPS', validade_inicial: '2032-02-02 17:30:00', recebimento: '2032-02-02 17:28:55', mens: raw };
  const h = harness({ row, redemet: true });
  const first = await h.scope.fetchRedemetMetars(['SBPS']), second = await h.scope.fetchRedemetMetars(['SBPS']);
  assert.equal(h.network.length, 1); assert.equal(second.cache, 'fresh');
  const report = first.reports.SBPS;
  assert.equal(report.observedAt, h.scope.reportTimestamp(row.validade_inicial));
  assert.deepEqual(JSON.parse(JSON.stringify(report.observationTimeSource)), { field: 'validade_inicial', value: row.validade_inicial });
  assert.equal(weatherObservationSourceTime({ provider: report.provider, source: report.observationTimeSource, raw: report.raw }), Date.parse('2032-02-02T17:30:00Z'));
  assert.deepEqual(JSON.parse(JSON.stringify(second.reports.SBPS.observationTimeSource)), JSON.parse(JSON.stringify(report.observationTimeSource)));
});
test('receipt fallback stays legacy-compatible but is not certified as an observation', async () => {
  const row = { id_localidade: 'SBPS', recebimento: '2032-02-02 17:30:00', mens: raw }, h = harness({ row, redemet: true });
  const report = (await h.scope.fetchRedemetMetars(['SBPS'])).reports.SBPS;
  assert.equal(report.observedAt, h.scope.reportTimestamp(row.recebimento));
  assert.equal(report.observationTimeSource.field, 'recebimento');
  assert.equal(weatherObservationSourceTime({ provider: report.provider, source: report.observationTimeSource, raw }), null);
  assert.equal(h.network.length, 1); // no client-admission fallback request
});
test('actual AviationWeather record retains obsTime semantics and existing cached value', async () => {
  const row = { rawOb: raw, obsTime: Date.parse('2032-02-02T17:30:00Z') / 1000, reportTime: '2032-02-02T17:31:00Z' }, h = harness({ row });
  const first = await h.scope.fetchAviationWeatherReport('SBPS'), second = await h.scope.fetchAviationWeatherReport('SBPS');
  assert.equal(first.observedAt, row.obsTime); assert.equal(first.observationTimeSource.field, 'obsTime');
  assert.equal(first.observationTimeSource.value, row.obsTime); assert.equal(second.cache, 'fresh'); assert.equal(h.network.length, 1);
});
test('all-mode handler exposes per-report proof; TAF success cannot become METAR success', async () => {
  const h = harness(), calls = [];
  h.scope.fetchAviationWeatherReport = async (station, type) => { calls.push([station, type]); return {
    ok: type === 'taf', official: type === 'taf', provider: type === 'taf' ? 'aviationweather' : 'unavailable', raw: type === 'taf' ? 'TAF synthetic' : '',
    observedAt: '', observationTimeSource: type === 'taf' ? { field: 'issueTime', value: 'synthetic' } : null,
  }; };
  const result = await h.scope.handleAviationWeather({}, {}, new URL('https://synthetic.invalid/api/aviation-weather?airports=BPS&type=all'));
  assert.deepEqual(calls, [['SBPS', 'metar'], ['SBPS', 'taf']]);
  assert.equal(result.stations.BPS, result.stations.SBPS); assert.equal(result.ok, true);
  assert.equal(result.stations.BPS.available.metar, false); assert.equal(result.stations.BPS.official.metar, false);
  assert.equal(result.stations.BPS.available.taf, true); assert.equal(result.stations.BPS.official.taf, true);
  assert.equal(result.stations.BPS.observationTimeSource.metar, null);
  assert.equal(h.scope.airportIcao('BPS'), 'BPS'); // global scheduler/Concierge map is untouched
});
test('HTTP handler keeps its existing six-airport cap and provider fanout', async () => {
  const h = harness(), calls = [];
  h.scope.fetchAviationWeatherReport = async (station, type) => { calls.push([station, type]); return { ok: false }; };
  await h.scope.handleAviationWeather({}, {}, new URL('https://synthetic.invalid/api/aviation-weather?airports=BPS,SBGR,SBBR,SBSP,SBGL,SBRJ,SBCF&type=all'));
  assert.equal(calls.length, 12); assert.ok(!calls.some(([station]) => station === 'SBCF'));
});
test('provenance exposes only a scalar and selected field, never a provider row', () => {
  const h = harness(), malicious = { secret: 'synthetic-not-exported' };
  const proof = h.scope.observationTimeSource({ validade_inicial: malicious }, ['validade_inicial', 'recebimento']);
  assert.deepEqual(JSON.parse(JSON.stringify(proof)), { field: 'validade_inicial', value: null });
});
test('actual API METAR classifier -> actual Home adapter ignores a TAF-only severe forecast change', async () => {
  const api = harness(), app = weatherRuntimeHarness(); let taf = 'TAF SBGR synthetic benign';
  api.scope.fetchAviationWeatherReport = async (station, type) => ({ ok: true, official: true, station, provider: 'aviationweather',
    raw: type === 'metar' ? WEATHER_STATION.metar : taf, observedAt: WEATHER_NOW / 1000,
    observationTimeSource: { field: type === 'metar' ? 'obsTime' : 'issueTime', value: WEATHER_NOW / 1000 } });
  const url = new URL('https://synthetic.invalid/api/aviation-weather?airports=SBGR&type=all');
  const first = await api.scope.handleAviationWeather({}, {}, url); app.setPayload(first); app.start(); await app.flush();
  assert.equal(first.stations.SBGR.monitoring.severity, 2); assert.equal(app.notices.length, 1);
  taf = 'TAF SBGR synthetic TEMPO +TSRA WS GR';
  const second = await api.scope.handleAviationWeather({}, {}, url); app.setPayload(second);
  assert.equal(second.stations.SBGR.monitoring.severity, 2, 'classifier still reads only metar.raw');
  app.time(WEATHER_NOW + 60 * 60_000); await app.flush();
  assert.equal(app.fetches.length, 2); assert.equal(app.notices.length, 1); assert.equal(app.sent.length, 1);
  assert.equal(app.runtime.currentCrewCheckPulseState().queued, 0); app.cleanup();
});
