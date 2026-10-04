import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';
import { evaluateCriticalWeatherDelivery, WEATHER_OBSERVATION_MAX_AGE_MS } from '../../server/weather/critical-observation.mjs';

// Public official observations retrieved 2026-10-04 17:34Z. No user/account data.
// https://aviationweather.gov/api/data/metar?ids=SBGR&format=json&hours=4
const HEAVY_RAIN = 'SPECI SBGR 041648Z 03015G33KT 340V060 5000 +RA BR BKN043 FEW050TCU 22/20 Q1014 RERA';
const GUSTS = 'METAR SBGR 041700Z 02015G30KT 340V060 9000 -RA FEW015 SCT028 BKN042 FEW050TCU 23/20 Q1014 RERA=';
const CALM = 'METAR SBGR 041700Z 02005KT 9999 FEW020 23/20 Q1014';
const THUNDER = 'METAR SBGR 041700Z 02015G35KT 3000 TSRA BKN020CB 23/20 Q1014';
const NOW = Date.parse('2026-10-04T17:30:00Z');
const server = fs.readFileSync(new URL('../../server.mjs', import.meta.url), 'utf8');
function functionSource(name) {
  const start = server.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must remain present`);
  const end = server.indexOf('\n}\n', start);
  assert.notEqual(end, -1);
  return server.slice(start, end + 2);
}
const assess = vm.runInNewContext(`(function () { ${functionSource('aviationReportMetrics')}\n${functionSource('criticalWeatherChange')}\nreturn criticalWeatherChange; })()`, {
  crypto, safeText: value => String(value ?? '').replace(/\s+/g, ' ').trim(),
});
function report(raw = GUSTS, overrides = {}) {
  return { ok: true, official: true, provider: 'redemet', source: 'REDEMET · DECEA', station: 'SBGR', observedAt: '2026-10-04T17:00:00Z', raw, ...overrides };
}
function evaluate(r = report(), previous = {}, overrides = {}) {
  return evaluateCriticalWeatherDelivery({ report: r, station: 'SBGR', previous, change: assess(previous.raw || '', r.raw), now: NOW, ...overrides });
}
function delivered(raw = GUSTS, extra = {}) {
  const change = assess('', raw);
  return { raw, severity: change.severity, fingerprint: change.fingerprint, lastSentAt: '2026-10-04T17:00:00Z', ...extra };
}

test('GRU incident: first heavy-rain observation is relevant without previous baseline', () => {
  const r = report(HEAVY_RAIN, { observedAt: '2026-10-04T16:48:00Z' });
  assert.equal(assess('', r.raw).severity, 2);
  assert.equal(assess('', r.raw).critical, false, 'document legacy gap');
  assert.equal(evaluate(r).shouldSend, true);
  assert.equal(evaluate(r).reason, 'first_relevant_observation');
});
test('GRU incident: first 30kt gust observation alerts without claiming thunder observed', () => {
  assert.equal(assess('', GUSTS).severity, 2);
  assert.equal(evaluate().shouldSend, true);
  assert.equal(assess('', GUSTS).current.hazards.length, 0);
});
test('calm first report stays silent', () => assert.equal(evaluate(report(CALM)).shouldSend, false));
test('severe first report remains eligible', () => assert.equal(evaluate(report(THUNDER)).shouldSend, true));
test('exact already-delivered risk stays deduplicated', () => assert.equal(evaluate(report(), delivered()).shouldSend, false));
test('same risk in next observation does not become a fresh first alert', () => {
  assert.equal(evaluate(report(GUSTS.replace('041700Z', '041730Z'), { observedAt: '2026-10-04T17:30:00Z' }), delivered()).shouldSend, false);
});
test('recovery produces no notification', () => assert.equal(evaluate(report(CALM), delivered()).shouldSend, false));
test('cooldown suppresses new reasons at same severity', () => {
  const r = report(HEAVY_RAIN, { observedAt: '2026-10-04T16:48:00Z' });
  assert.equal(evaluate(r, delivered()).reason, 'cooldown');
  assert.equal(evaluate(r, delivered()).shouldSend, false);
});
test('severity increase bypasses cooldown', () => assert.equal(evaluate(report(THUNDER), delivered()).shouldSend, true));
test('new relevant worsening can alert after existing 90-minute cooldown', () => {
  const r = report(HEAVY_RAIN, { observedAt: '2026-10-04T16:48:00Z' });
  assert.equal(evaluate(r, delivered(GUSTS, { lastSentAt: '2026-10-04T15:00:00Z' })).shouldSend, true);
});
test('pending failed delivery retries fresh same risk', () => {
  const result = evaluate(report(), delivered(GUSTS, { pendingDelivery: true }));
  assert.equal(result.shouldSend, true);
  assert.equal(result.reason, 'pending_retry');
});
test('pending failed delivery does not retry after recovery', () => assert.equal(evaluate(report(CALM), delivered(GUSTS, { pendingDelivery: true })).shouldSend, false));
test('stale pending risk is not sent', () => {
  const result = evaluate(report(), delivered(GUSTS, { pendingDelivery: true }), { now: NOW + 2 * 60 * 60_000 });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'stale_observation');
});
test('one-hour freshness boundary is inclusive and does not mutate policy', () => {
  const observed = Date.parse('2026-10-04T17:00:00Z');
  assert.equal(evaluate(report(), {}, { now: observed + WEATHER_OBSERVATION_MAX_AGE_MS }).accepted, true);
  assert.equal(evaluate(report(), {}, { now: observed + WEATHER_OBSERVATION_MAX_AGE_MS + 1 }).accepted, false);
});
test('future observation fails closed', () => assert.equal(evaluate(report(), {}, { now: Date.parse('2026-10-04T16:59:59Z') }).reason, 'future_observation'));
test('missing observation date cannot borrow cache retrieval time', () => assert.equal(evaluate(report(GUSTS, { observedAt: '', cachedAt: NOW })).reason, 'invalid_observed_at'));
test('invalid observation date fails closed', () => assert.equal(evaluate(report(GUSTS, { observedAt: 'not-a-date' })).reason, 'invalid_observed_at'));
test('invalid now fails closed', () => assert.equal(evaluate(report(), {}, { now: NaN }).reason, 'invalid_now'));
test('provider timestamp must match METAR observation group', () => assert.equal(evaluate(report(GUSTS, { observedAt: '2026-10-04T17:20:00Z' })).reason, 'observation_time_mismatch'));
test('AviationWeather Unix seconds are accepted', () => {
  assert.equal(evaluate(report(GUSTS.replace(/^METAR /, ''), { provider: 'aviationweather', observedAt: Date.parse('2026-10-04T17:00:00Z') / 1000 })).shouldSend, true);
});
test('Unix seconds as numeric string are accepted', () => assert.equal(evaluate(report(GUSTS, { observedAt: String(Date.parse('2026-10-04T17:00:00Z') / 1000) })).accepted, true));
test('Unix milliseconds are accepted', () => assert.equal(evaluate(report(GUSTS, { observedAt: Date.parse('2026-10-04T17:00:00Z') })).accepted, true));
test('month rollover uses provider full date instead of guessed current month', () => {
  const r = report(GUSTS.replace('041700Z', '302345Z'), { observedAt: '2026-09-30T23:45:00Z' });
  assert.equal(evaluate(r, {}, { now: Date.parse('2026-10-01T00:15:00Z') }).shouldSend, true);
});
test('older observation cannot overwrite a newer baseline even inside freshness window', () => {
  const r = report(HEAVY_RAIN, { observedAt: '2026-10-04T16:48:00Z' });
  assert.equal(evaluate(r, delivered(GUSTS, { observedAt: '2026-10-04T17:00:00Z' })).reason, 'older_observation');
});
test('older observation cannot retry a previously failed newer alert', () => {
  const r = report(HEAVY_RAIN, { observedAt: '2026-10-04T16:48:00Z' });
  assert.equal(evaluate(r, delivered(GUSTS, { observedAt: '2026-10-04T17:00:00Z', pendingDelivery: true })).shouldSend, false);
});
test('corrected same-minute observation remains eligible subject to existing cooldown', () => {
  const r = report(THUNDER.replace(/^METAR /, 'METAR COR '));
  assert.equal(evaluate(r, delivered(GUSTS, { observedAt: '2026-10-04T17:00:00Z' })).shouldSend, true);
});
for (const [name, overrides, reason] of [
  ['unsuccessful response', { ok: false }, 'unverified_report'],
  ['unofficial response', { official: false }, 'unverified_report'],
  ['unknown provider', { provider: 'arbitrary' }, 'unverified_report'],
  ['different report station', { station: 'SBFL' }, 'invalid_station_or_report'],
  ['different raw station', { raw: GUSTS.replace('SBGR', 'SBFL') }, 'invalid_station_or_report'],
  ['HTML body', { raw: '<html>5000 +RA</html>' }, 'invalid_station_or_report'],
  ['JSON failure body', { raw: '[]' }, 'invalid_station_or_report'],
  ['TAF is not present observed weather', { raw: 'TAF SBGR 041700Z 0418/0524 3000 TSRA' }, 'invalid_station_or_report'],
]) test(`${name} fails closed`, () => assert.equal(evaluate(report(GUSTS, overrides)).reason, reason));
test('malformed assessment fails closed', () => assert.equal(evaluate(report(), {}, { change: { severity: NaN } }).reason, 'invalid_assessment'));

function cycleHarness({ snapshot, candidates, observation, sendOK = true, initialState = {} } = {}) {
  const sent = [], writes = [], memory = new Map();
  let state = initialState, fetches = 0;
  const context = {
    Map, Date, evaluateCriticalWeatherDelivery,
    telegramRostersRead: () => ({ snapshots: { test: snapshot ?? { key: 'synthetic', chatId: 'synthetic-chat', roster: {}, preferences: { weatherCriticalAlerts: true } } } }),
    conciergeDbListSnapshots: async () => [],
    conciergeWeatherCandidates: () => candidates ?? [{ station: 'SBGR', role: 'origem', key: 'synthetic-leg', flight: 'TEST1', route: 'GRU → NAT' }],
    fetchAviationWeatherReport: async () => { fetches++; return observation ?? report(); },
    weatherAlertStateKey: () => 'synthetic-state',
    conciergeDbGet: async () => state,
    conciergeDbPut: async (_key, value) => { state = value; writes.push(value); },
    criticalWeatherMonitorMemory: memory,
    criticalWeatherChange: assess,
    sendTelegramMessage: async (...args) => { sent.push(args); return { ok: sendOK }; },
  };
  const source = 'async ' + functionSource('runCriticalWeatherMonitorCycle');
  const run = vm.runInNewContext(`(${source})`, context);
  return { run: (cycleNow = NOW, observationNow = NOW) => run(new Date(cycleNow), () => observationNow), sent, writes, get fetches() { return fetches; }, get state() { return state; } };
}
test('real monitor integration: first relevant observation sends once then deduplicates', async () => {
  const h = cycleHarness();
  assert.equal((await h.run()).alerts, 1);
  assert.equal((await h.run()).alerts, 0);
  assert.equal(h.sent.length, 1);
  assert.equal(h.state.pendingDelivery, false);
});
test('real monitor integration: failed delivery stays pending for existing retry', async () => {
  const h = cycleHarness({ sendOK: false });
  assert.equal((await h.run()).failures, 1);
  assert.equal(h.state.pendingDelivery, true);
  await h.run();
  assert.equal(h.sent.length, 2);
});
test('real monitor integration: hour-boundary fetch uses observation-time clock', async () => {
  const h = cycleHarness();
  const summary = await h.run(Date.parse('2026-10-04T16:59:59Z'), Date.parse('2026-10-04T17:00:05Z'));
  assert.equal(summary.failures, 0);
  assert.equal(summary.alerts, 1);
});
test('real monitor integration: opted-out snapshot never fetches or sends', async () => {
  const h = cycleHarness({ snapshot: { chatId: 'synthetic-chat', roster: {}, preferences: { weatherCriticalAlerts: false } } });
  assert.equal((await h.run()).skipped, 1);
  assert.equal(h.fetches, 0);
  assert.equal(h.sent.length, 0);
});
test('real monitor integration: snapshot without chat remains skipped', async () => {
  const h = cycleHarness({ snapshot: { roster: {}, preferences: { weatherCriticalAlerts: true } } });
  assert.equal((await h.run()).skipped, 1);
  assert.equal(h.fetches, 0);
});
test('real monitor integration: outside current flight windows remains silent', async () => {
  const h = cycleHarness({ candidates: [] });
  assert.equal((await h.run()).monitored, 0);
  assert.equal(h.fetches, 0);
  assert.equal(h.sent.length, 0);
});
test('real monitor integration: invalid/stale data never overwrites previous state', async () => {
  const initialState = delivered();
  const h = cycleHarness({ initialState, observation: report(GUSTS.replace('041700Z', '041400Z'), { observedAt: '2026-10-04T14:00:00Z' }) });
  assert.equal((await h.run()).failures, 1);
  assert.equal(h.sent.length, 0);
  assert.equal(h.writes.length, 0);
  assert.equal(h.state, initialState);
});
test('no source change grants notifications or alters scheduler authorization/windows', () => {
  assert.match(functionSource('conciergeWeatherCandidates'), /departure\.getTime\(\) - 180 \* 60_000/);
  assert.match(functionSource('conciergeWeatherCandidates'), /arrival\.getTime\(\) - 120 \* 60_000/);
  assert.match(functionSource('scheduleCriticalWeatherMonitor'), /CREWCHECK_WEATHER_MONITOR_ENABLED/);
  assert.match(functionSource('handleCriticalWeatherMonitorHealth'), /weatherAlertSchedulerAuthorized\(req\)/);
  assert.doesNotMatch(functionSource('handleCriticalWeatherMonitorHealth'), /evaluateCriticalWeatherDelivery|runCriticalWeatherMonitor\(/);
});
test('focused CI stops on an early failing command instead of masking it with heartbeat success', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/weather-observation-alert.yml', import.meta.url), 'utf8');
  assert.match(workflow, /shell: bash -eo pipefail \{0\}/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-weather-ci-'));
  try {
    const script = path.join(dir, 'failure-probe.sh');
    fs.writeFileSync(script, 'false\nprintf "MUST_NOT_RUN"\n');
    const result = spawnSync('bash', ['-eo', 'pipefail', script], { encoding: 'utf8' });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout, /MUST_NOT_RUN/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
