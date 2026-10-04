import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as policy from '../../server/weather/monitor-readiness.mjs';
import { evaluateCriticalWeatherDelivery } from '../../server/weather/critical-observation.mjs';

const source = fs.readFileSync(new URL('../../server.mjs', import.meta.url), 'utf8');
const section = (start, end) => {
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin + start.length);
  assert(begin >= 0 && finish > begin, `Exact integration boundaries: ${start}`);
  return source.slice(begin, finish);
};
const NOW = Date.parse('2026-10-04T17:00:00Z');
// The actual transactional writer validates age using the production Date.now.
// Keep that clock deterministic in this synthetic-only test process.
test.before(() => mock.method(Date, 'now', () => NOW));
test.after(() => mock.restoreAll());
const EMAIL = 'synthetic@example.test';
const CHAT = '123456789';
const HASH = policy.weatherCanaryRecipientHash(EMAIL, CHAT);
function fixture() {
  const link = { email: EMAIL, chatId: CHAT, linkedAt: '2026-10-04T12:00:00Z', code: 'synthetic-only' };
  const profile = { email: EMAIL, chatId: CHAT, linked: true, weatherCommandSequence: 100, weatherCommandDate: NOW / 1000 - 2 };
  const preferences = policy.weatherCanaryConsent({ enabled: true, profile, linkByEmail: link, linkByChat: link, now: NOW - 1000 });
  const snapshot = { key: EMAIL, email: EMAIL, chatId: CHAT, roster: { days: [{ date: '2026-10-04', legs: [] }] }, preferences, updatedAt: '2026-10-04T16:59:00Z' };
  const other = { ...structuredClone(snapshot), key: 'other@example.test', email: 'other@example.test', chatId: '987654321' };
  const records = new Map([[`weather-consent:${EMAIL}`, { ...structuredClone(preferences), commandSequence: 50, commandChatId: CHAT, channel: 'telegram' }], [`snapshot:${EMAIL}`, snapshot], [`link-email:${EMAIL}`, structuredClone(link)], [`link-chat:${CHAT}`, structuredClone(link)]]);
  const env = { TELEGRAM_WEBHOOK_SECRET: 'synthetic-only', CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED: 'true', CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256: HASH };
  const sent = [], timers = [];
  let reports = 0, reads = 0, localReads = 0, genericStateReads = 0, genericStateWrites = 0;
  const lease = {
    held: true,
    isHeld: async () => lease.held,
    async readState(key) {
      if (!lease.held) throw new Error('Synthetic lost lease');
      return structuredClone(records.get(key) || null);
    },
    async writeState(key, value) {
      if (!lease.held) throw new Error('Synthetic lost lease');
      records.set(key, structuredClone(value));
      return true;
    },
  };
  const context = {
    ...policy,
    createWeatherCanaryPolicy: input => policy.createWeatherCanaryPolicy({ ...input, now: () => NOW }),
    weatherCanaryConsent: input => policy.weatherCanaryConsent({ ...input, now: NOW }),
    process: { env },
    envAny: keys => keys.map(key => env[key]).find(Boolean) || '',
    conciergeSafeKey: value => String(value || '').trim().toLowerCase(),
    conciergeDbGet: async key => { reads++; if (key.startsWith('weather:')) genericStateReads++; return structuredClone(records.get(key) || null); },
    conciergeDbPut: async (key, value) => { if (key.startsWith('weather:')) genericStateWrites++; records.set(key, structuredClone(value)); return true; },
    conciergeDbListSnapshots: async () => [structuredClone(snapshot), structuredClone(other)],
    conciergeDbPool: async () => ({ query: async () => [[{ payload: structuredClone(snapshot) }]], getConnection: async () => ({
      async query(sql, values) {
        if (sql.startsWith('SELECT state_key,payload')) return [[...records].filter(([key]) => values.includes(key)).map(([state_key, payload]) => ({ state_key, payload: structuredClone(payload) }))];
        if (sql.startsWith('INSERT INTO crewcheck_telegram_state')) {
          const incoming = JSON.parse(values[1]); const existing = records.get(values[0]);
          if (!existing || existing.commandChatId !== incoming.commandChatId || existing.commandSequence < incoming.commandSequence) records.set(values[0], incoming);
        }
        return [{ affectedRows: 1 }];
      }, release() {}, destroy() {},
    }) }),
    telegramRostersRead: () => { localReads++; return { snapshots: {} }; },
    conciergeWeatherCandidates: () => [{ key: 'synthetic-flight', role: 'origem', station: 'SBGR', flight: 'TEST123', route: 'GRU → BSB' }],
    weatherAlertStateKey: (current, candidate) => `weather:${current.key}:${candidate.key}`,
    fetchAviationWeatherReport: async () => {
      reports++;
      return { raw: 'SBGR 041650Z 08015KT 2000 TSRA BKN008 18/17 Q1013', station: 'SBGR', observedAt: '2026-10-04T16:50:00Z', ok: true, official: true, provider: 'redemet', source: 'Synthetic fixture', stale: false };
    },
    criticalWeatherChange: () => ({ critical: false, severity: 2, reasons: ['synthetic severe weather'], fingerprint: 'synthetic-unique-report' }),
    evaluateCriticalWeatherDelivery,
    criticalWeatherMonitorMemory: new Map(),
    sendTelegramMessage: async (chatId, text) => { sent.push({ chatId, text }); return { ok: true }; },
    setTimeout: (callback, delay) => { timers.push({ callback, delay, type: 'timeout' }); return { unref() {} }; },
    setInterval: (callback, delay) => { timers.push({ callback, delay, type: 'interval' }); return { unref() {} }; },
    Date, Map, console,
  };
  vm.createContext(context);
  vm.runInContext(section('function criticalWeatherMonitorSettings()', 'const WEATHER_MONITOR_HEARTBEAT_KEY'), context);
  return { link, profile, snapshot, other, records, env, sent, timers, context, lease,
    get reports() { return reports; }, get reads() { return reads; }, get localReads() { return localReads; },
    get genericStateReads() { return genericStateReads; }, get genericStateWrites() { return genericStateWrites; } };
}
function cycle(f, lease = f.lease) {
  vm.runInContext(section('async function runCriticalWeatherMonitorCycle(', 'async function handleCriticalWeatherMonitor('), f.context);
  return f.context.runCriticalWeatherMonitorCycle(new Date(NOW), () => NOW, lease);
}

test('actual cycle sends only the allowlisted canary, using current server weather evaluator', async () => {
  const f = fixture(); f.env.CREWCHECK_WEATHER_MONITOR_ENABLED = 'true';
  const summary = await cycle(f);
  assert.equal(summary.alerts, 1);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].chatId, CHAT);
  assert.equal(f.reports, 1);
  assert.equal(f.localReads, 0);
});
test('actual canary cycle preserves weather duplicate suppression', async () => {
  const f = fixture();
  await cycle(f); await cycle(f);
  assert.equal(f.sent.length, 1);
});
test('missing binding-specific weather opt-in suppresses the canary', async () => {
  const f = fixture(); delete f.records.get(`weather-consent:${EMAIL}`).weatherCriticalAlertsConsent;
  const summary = await cycle(f);
  assert.equal(summary.alerts, 0); assert.equal(f.reports, 0); assert.equal(f.sent.length, 0);
});
test('malformed requested canary never sends to legacy audience', async () => {
  const f = fixture(); f.env.CREWCHECK_WEATHER_MONITOR_ENABLED = 'true'; f.env.CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256 = '*';
  const summary = await cycle(f);
  assert.equal(summary.blocked, true); assert.equal(f.reports, 0); assert.equal(f.sent.length, 0);
});
test('opt-out during provider observation prevents actual Telegram adapter invocation', async () => {
  const f = fixture(); const fetch = f.context.fetchAviationWeatherReport;
  f.context.fetchAviationWeatherReport = async () => { f.records.get(`weather-consent:${EMAIL}`).weatherCriticalAlerts = false; return fetch(); };
  const summary = await cycle(f);
  assert.equal(summary.alerts, 0); assert.equal(f.reports, 1); assert.equal(f.sent.length, 0);
});
test('revocation during evaluation prevents actual Telegram adapter invocation', async () => {
  const f = fixture(); const fetch = f.context.fetchAviationWeatherReport;
  f.context.fetchAviationWeatherReport = async () => { f.records.delete(`link-chat:${CHAT}`); return fetch(); };
  await cycle(f); assert.equal(f.sent.length, 0);
});
test('roster replacement during evaluation prevents stale-route notification', async () => {
  const f = fixture(); const fetch = f.context.fetchAviationWeatherReport;
  f.context.fetchAviationWeatherReport = async () => { f.snapshot.roster.days[0].date = '2026-10-05'; return fetch(); };
  await cycle(f); assert.equal(f.sent.length, 0);
});
test('stale METAR is still rejected in the integrated canary path', async () => {
  const f = fixture(); const fetch = f.context.fetchAviationWeatherReport;
  f.context.fetchAviationWeatherReport = async () => ({ ...await fetch(), observedAt: '2026-10-04T14:50:00Z', raw: 'SBGR 041450Z 08015KT 2000 TSRA BKN008 18/17 Q1013' });
  const summary = await cycle(f); assert.equal(summary.failures, 1); assert.equal(f.sent.length, 0);
});
test('legacy cycle behavior remains unchanged when canary is not requested', async () => {
  const f = fixture(); delete f.env.CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED; delete f.env.CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256;
  await cycle(f); assert.equal(f.sent.length, 2);
});
test('unauthorized health request returns before DB or readiness/config reads', async () => {
  const f = fixture(); let response;
  Object.assign(f.context, { weatherAlertSchedulerAuthorized: () => ({ configured: true, ok: false }),
    sendJson: (_res, status, data) => { response = { status, data }; },
    criticalWeatherMonitorSettings: () => { throw new Error('must not read settings'); } });
  vm.runInContext(section('async function handleCriticalWeatherMonitorHealth(', 'function scheduleCriticalWeatherMonitor('), f.context);
  await f.context.handleCriticalWeatherMonitorHealth({ method: 'GET' }, {});
  assert.equal(response.status, 401); assert.equal(f.reads, 0); assert.equal(response.data.readiness, undefined);
});
test('authenticated health adds safe readiness without disclosing target or env values', async () => {
  const f = fixture(); let response;
  f.env.DATABASE_URL = 'synthetic-mysql-config-marker';
  Object.assign(f.context, { weatherAlertSchedulerAuthorized: () => ({ configured: true, ok: true }),
    WEATHER_MONITOR_HEARTBEAT_KEY: 'synthetic-heartbeat', weatherMonitorHealthState: () => 'never_run',
    telegramConfigured: () => true, sendJson: (_res, status, data) => { response = { status, data }; } });
  vm.runInContext(section('async function handleCriticalWeatherMonitorHealth(', 'function scheduleCriticalWeatherMonitor('), f.context);
  await f.context.handleCriticalWeatherMonitorHealth({ method: 'GET' }, {});
  assert.equal(response.status, 200); assert.equal(response.data.readiness.mode, 'canary');
  assert.equal(response.data.readiness.deliveryVerified, false);
  for (const privateValue of [HASH, EMAIL, CHAT, f.env.DATABASE_URL]) assert.equal(JSON.stringify(response).includes(privateValue), false);
});
test('health retains GET-only guard before any state read', async () => {
  const f = fixture(); let status;
  Object.assign(f.context, { weatherAlertSchedulerAuthorized: () => ({ configured: true, ok: true }), sendJson: (_res, code) => { status = code; } });
  vm.runInContext(section('async function handleCriticalWeatherMonitorHealth(', 'function scheduleCriticalWeatherMonitor('), f.context);
  await f.context.handleCriticalWeatherMonitorHealth({ method: 'POST' }, {});
  assert.equal(status, 405); assert.equal(f.reads, 0);
});
test('scheduler stays default-off and fails closed on malformed requested canary', () => {
  for (const env of [{}, { CREWCHECK_WEATHER_MONITOR_ENABLED: 'true', CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED: 'true', CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256: '*' }]) {
    const f = fixture(); Object.keys(f.env).forEach(key => delete f.env[key]); Object.assign(f.env, env, { CREWCHECK_SCHEDULER_SECRET: 'synthetic-only' });
    vm.runInContext(section('function scheduleCriticalWeatherMonitor(', 'const crewcheckAlarmTestRateLimit'), f.context);
    f.context.scheduleCriticalWeatherMonitor(); assert.equal(f.timers.length, 0);
  }
});
test('canary scheduler uses existing timer without needing global enablement', () => {
  const f = fixture(); f.env.CREWCHECK_SCHEDULER_SECRET = 'synthetic-only';
  vm.runInContext(section('function scheduleCriticalWeatherMonitor(', 'const crewcheckAlarmTestRateLimit'), f.context);
  f.context.scheduleCriticalWeatherMonitor();
  assert.deepEqual(f.timers.map(item => item.delay), [45_000, 600_000]); assert.equal(f.sent.length, 0);
});
test('missing scheduler secret cannot schedule an enabled canary', () => {
  const f = fixture(); vm.runInContext(section('function scheduleCriticalWeatherMonitor(', 'const crewcheckAlarmTestRateLimit'), f.context);
  f.context.scheduleCriticalWeatherMonitor(); assert.equal(f.timers.length, 0);
});
test('overlapping manual/scheduled canary cycles share an in-process lock', async () => {
  const f = fixture(); let finish, started, runs = 0, heartbeats = 0;
  const cycleStarted = new Promise(resolve => { started = resolve; });
  Object.assign(f.context, { acquireWeatherCanaryLease: async () => ({ release: async () => {}, isHeld: async () => true }), recordWeatherMonitorHeartbeat: async () => { heartbeats++; },
    runCriticalWeatherMonitorCycle: async () => { runs++; started(); await new Promise(resolve => { finish = resolve; }); return { monitored: 1, alerts: 0, failures: 0 }; } });
  vm.runInContext('let criticalWeatherCanaryRunning = false;\n' + section('async function runCriticalWeatherMonitor(', 'async function runCriticalWeatherMonitorCycle('), f.context);
  const first = f.context.runCriticalWeatherMonitor(new Date(NOW));
  const second = await f.context.runCriticalWeatherMonitor(new Date(NOW));
  await cycleStarted;
  assert.equal(second.busy, true); assert.equal(runs, 1); assert.equal(heartbeats, 1);
  finish(); await first; assert.equal(heartbeats, 2);
});
test('explicit command stores new link-bound weather consent and verifies durability', async () => {
  const f = fixture(); delete f.records.get(`weather-consent:${EMAIL}`).weatherCriticalAlertsConsent;
  f.context.conciergeSaveSnapshotAsync = async (_profile, _roster, metadata) => { Object.assign(f.snapshot.preferences, metadata.preferences); return structuredClone(f.snapshot); };
  vm.runInContext(section('async function conciergeWeatherAlertsReply(', 'function conciergeHaversineKm('), f.context);
  const reply = await f.context.conciergeWeatherAlertsReply('/alertameteo on', f.profile, f.snapshot);
  assert.match(reply, /Preferência.*ATIVADA/); assert.equal(f.records.get(`weather-consent:${EMAIL}`).weatherCriticalAlertsConsent.version, 1);
});
test('explicit opt-in does not claim success when canary preference is not durable', async () => {
  const f = fixture(); f.records.get(`weather-consent:${EMAIL}`).weatherCriticalAlerts = false; f.context.writeWeatherCanaryConsent = async () => null;
  f.context.conciergeSaveSnapshotAsync = async (_profile, _roster, metadata) => ({ ...f.snapshot, preferences: metadata.preferences });
  vm.runInContext(section('async function conciergeWeatherAlertsReply(', 'function conciergeHaversineKm('), f.context);
  const reply = await f.context.conciergeWeatherAlertsReply('/alertameteo on', f.profile, f.snapshot);
  assert.match(reply, /Não consegui confirmar a preferência/);
});

test('manual cycle fails closed for disabled, missing or mistyped canary flag with legacy enabled', async () => {
  for (const flag of ['false', undefined, 'TRUE', 'true ', true]) {
    const f = fixture(); f.env.CREWCHECK_WEATHER_MONITOR_ENABLED = 'true'; f.env.CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED = flag;
    const summary = await cycle(f);
    assert.equal(summary.blocked, true); assert.equal(f.reports, 0); assert.equal(f.sent.length, 0); assert.equal(f.reads, 0);
  }
});
test('canary cannot run or schedule without existing webhook authentication configured', async () => {
  const f = fixture(); delete f.env.TELEGRAM_WEBHOOK_SECRET; f.env.CREWCHECK_SCHEDULER_SECRET = 'synthetic-only';
  assert.equal((await cycle(f)).blocked, true); assert.equal(f.reports, 0);
  vm.runInContext(section('function scheduleCriticalWeatherMonitor(', 'const crewcheckAlarmTestRateLimit'), f.context);
  f.context.scheduleCriticalWeatherMonitor(); assert.equal(f.timers.length, 0);
});
test('ambiguous or negative command does not mint dedicated weather consent', async () => {
  const f = fixture(); f.records.delete(`weather-consent:${EMAIL}`);
  f.context.conciergeSaveSnapshotAsync = async () => { throw new Error('must not save'); };
  vm.runInContext(section('async function conciergeWeatherAlertsReply(', 'function conciergeHaversineKm('), f.context);
  for (const text of ['/alertameteo nao ativar', '/alertameteo on later', '/alertameteo ativar']) {
    const reply = await f.context.conciergeWeatherAlertsReply(text, f.profile, f.snapshot);
    assert.match(reply, /Use \/alertameteo on/); assert.equal(f.records.has(`weather-consent:${EMAIL}`), false);
  }
});
test('unprotected Telegram cannot mint new consent even when durable links match', async () => {
  const f = fixture(); delete f.env.TELEGRAM_WEBHOOK_SECRET; f.records.delete(`weather-consent:${EMAIL}`);
  vm.runInContext(section('async function conciergeWeatherAlertsReply(', 'function conciergeHaversineKm('), f.context);
  const reply = await f.context.conciergeWeatherAlertsReply('/alertameteo on', f.profile, f.snapshot);
  assert.match(reply, /configuração segura/); assert.equal(f.records.has(`weather-consent:${EMAIL}`), false);
});
test('canary status does not claim active delivery when no dedicated consent exists', async () => {
  const f = fixture(); f.records.delete(`weather-consent:${EMAIL}`);
  vm.runInContext(section('async function conciergeWeatherAlertsReply(', 'function conciergeHaversineKm('), f.context);
  const reply = await f.context.conciergeWeatherAlertsReply('/alertameteo', f.profile, f.snapshot);
  assert.match(reply, /DESATIVADA/); assert.match(reply, /não comprova entrega/); assert.doesNotMatch(reply, /ATIVOS/);
});
test('observation state persistence failure suppresses canary transmission', async () => {
  const f = fixture(); f.lease.writeState = async () => { throw new Error('Synthetic DB write failure'); };
  const summary = await cycle(f); assert.equal(summary.failures, 1); assert.equal(f.sent.length, 0);
});
test('missing or lost durable lease suppresses canary transmission', async () => {
  const f = fixture();
  vm.runInContext(section('async function runCriticalWeatherMonitorCycle(', 'async function handleCriticalWeatherMonitor('), f.context);
  assert.equal((await f.context.runCriticalWeatherMonitorCycle(new Date(NOW), () => NOW)).blocked, true);
  let leaseChecks = 0;
  const summary = await f.context.runCriticalWeatherMonitorCycle(new Date(NOW), () => NOW, { ...f.lease, isHeld: async () => ++leaseChecks === 1 });
  assert.equal(summary.skipped, 1); assert.equal(f.sent.length, 0);
});
test('explicit opt-out remains authoritative while webhook secret is absent and after restoration', async () => {
  const f = fixture(); delete f.env.TELEGRAM_WEBHOOK_SECRET;
  f.context.conciergeSaveSnapshotAsync = async (_profile, _roster, metadata) => { Object.assign(f.snapshot.preferences, metadata.preferences); return structuredClone(f.snapshot); };
  vm.runInContext(section('async function conciergeWeatherAlertsReply(', 'function conciergeHaversineKm('), f.context);
  const reply = await f.context.conciergeWeatherAlertsReply('/alertameteo off', f.profile, f.snapshot);
  assert.match(reply, /DESATIVADA/); assert.equal(f.records.get(`weather-consent:${EMAIL}`).weatherCriticalAlerts, false);
  f.env.TELEGRAM_WEBHOOK_SECRET = 'synthetic-restored';
  f.snapshot.preferences.weatherCriticalAlerts = true;
  const summary = await cycle(f); assert.equal(summary.alerts, 0); assert.equal(f.sent.length, 0);
});
test('older delayed opt-in cannot override newer acknowledged opt-out', async () => {
  const f = fixture(); let release, reached;
  const paused = new Promise(resolve => { reached = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  const originalRead = f.context.conciergeDbGet;
  let delayed = false;
  f.context.conciergeDbGet = async key => {
    if (key === `link-email:${EMAIL}` && !delayed) { delayed = true; reached(); await wait; }
    return originalRead(key);
  };
  f.context.conciergeSaveSnapshotAsync = async (_profile, _roster, metadata) => { Object.assign(f.snapshot.preferences, metadata.preferences); return structuredClone(f.snapshot); };
  vm.runInContext(section('async function conciergeWeatherAlertsReply(', 'function conciergeHaversineKm('), f.context);
  const oldOn = f.context.conciergeWeatherAlertsReply('/alertameteo on', { ...f.profile, weatherCommandSequence: 100 }, f.snapshot);
  await paused;
  const offReply = await f.context.conciergeWeatherAlertsReply('/alertameteo off', { ...f.profile, weatherCommandSequence: 101 }, f.snapshot);
  assert.match(offReply, /DESATIVADA/);
  release(); const oldReply = await oldOn;
  assert.match(oldReply, /substituído/);
  assert.equal(f.records.get(`weather-consent:${EMAIL}`).weatherCriticalAlerts, false);
  assert.equal(f.records.get(`weather-consent:${EMAIL}`).commandSequence, 101);
  await cycle(f); assert.equal(f.sent.length, 0);
});
test('same Telegram command replay cannot overwrite newer consent', async () => {
  const f = fixture(); f.records.get(`weather-consent:${EMAIL}`).commandSequence = 101;
  f.records.get(`weather-consent:${EMAIL}`).weatherCriticalAlerts = false;
  f.context.conciergeSaveSnapshotAsync = async () => { throw new Error('stale command must not save snapshot'); };
  vm.runInContext(section('async function conciergeWeatherAlertsReply(', 'function conciergeHaversineKm('), f.context);
  const reply = await f.context.conciergeWeatherAlertsReply('/alertameteo on', f.profile, f.snapshot);
  assert.match(reply, /substituído/); assert.equal(f.records.get(`weather-consent:${EMAIL}`).weatherCriticalAlerts, false);
});
test('new canary consent cannot be minted without trusted Telegram message ordering', async () => {
  const f = fixture();
  vm.runInContext(section('async function conciergeWeatherAlertsReply(', 'function conciergeHaversineKm('), f.context);
  const reply = await f.context.conciergeWeatherAlertsReply('/alertameteo on', { ...f.profile, weatherCommandSequence: undefined }, f.snapshot);
  assert.match(reply, /Não consegui confirmar a preferência/);
});
test('successful send followed by delivered-state write failure does not replay after restart', async () => {
  const f = fixture(); const originalPut = f.lease.writeState;
  f.lease.writeState = async (key, value) => { if (value.lastSentAt) throw new Error('Synthetic final write failure'); return originalPut(key, value); };
  const first = await cycle(f);
  assert.equal(first.alerts, 1); assert.equal(first.failures, 1); assert.equal(f.sent.length, 1);
  f.context.criticalWeatherMonitorMemory.clear();
  await cycle(f); assert.equal(f.sent.length, 1);
});
test('ambiguous provider outcome is not automatically replayed for bounded canary', async () => {
  const f = fixture();
  f.context.sendTelegramMessage = async (chatId, text) => { f.sent.push({ chatId, text }); return { ok: false }; };
  assert.equal((await cycle(f)).failures, 1);
  f.context.criticalWeatherMonitorMemory.clear();
  await cycle(f); assert.equal(f.sent.length, 1);
});
test('DB JSON key normalization does not falsely reject successfully persisted consent', async () => {
  const f = fixture(); const read = f.context.conciergeDbGet;
  function reordered(value) {
    if (Array.isArray(value)) return value.map(reordered);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).reverse().map(key => [key, reordered(value[key])]));
    return value;
  }
  f.context.conciergeDbGet = async key => reordered(await read(key));
  f.context.conciergeSaveSnapshotAsync = async (_profile, _roster, metadata) => { Object.assign(f.snapshot.preferences, metadata.preferences); return structuredClone(f.snapshot); };
  vm.runInContext(section('async function conciergeWeatherAlertsReply(', 'function conciergeHaversineKm('), f.context);
  const reply = await f.context.conciergeWeatherAlertsReply('/alertameteo on', f.profile, f.snapshot);
  assert.match(reply, /Preferência.*ATIVADA/); assert.doesNotMatch(reply, /Não consegui/);
  await cycle(f); assert.equal(f.sent.length, 1);
});
test('normal legacy opt-in never creates the new test-only canary consent record', async () => {
  const f = fixture(); f.records.delete(`weather-consent:${EMAIL}`);
  delete f.env.CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED; delete f.env.CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256;
  f.context.conciergeSaveSnapshotAsync = async (_profile, _roster, metadata) => { Object.assign(f.snapshot.preferences, metadata.preferences); return structuredClone(f.snapshot); };
  vm.runInContext(section('async function conciergeWeatherAlertsReply(', 'function conciergeHaversineKm('), f.context);
  const reply = await f.context.conciergeWeatherAlertsReply('/alertameteo on', f.profile, f.snapshot);
  assert.match(reply, /ATIVOS/); assert.equal(f.records.has(`weather-consent:${EMAIL}`), false);
});
test('removing canary configuration does not prevent explicit revocation of its existing consent', async () => {
  const f = fixture(); delete f.env.CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED; delete f.env.CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256;
  f.context.conciergeSaveSnapshotAsync = async (_profile, _roster, metadata) => { Object.assign(f.snapshot.preferences, metadata.preferences); return structuredClone(f.snapshot); };
  vm.runInContext(section('async function conciergeWeatherAlertsReply(', 'function conciergeHaversineKm('), f.context);
  await f.context.conciergeWeatherAlertsReply('/alertameteo off', f.profile, f.snapshot);
  assert.equal(f.records.get(`weather-consent:${EMAIL}`).weatherCriticalAlerts, false);
});

test('delayed pre-relink command cannot mint fresh consent for the replacement link', async () => {
  const f = fixture(); f.records.delete(`weather-consent:${EMAIL}`);
  let reached, release;
  const paused = new Promise(resolve => { reached = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  const originalRead = f.context.conciergeDbGet;
  f.context.conciergeDbGet = async key => { if (key === `link-email:${EMAIL}`) { reached(); await wait; } return originalRead(key); };
  f.context.conciergeSaveSnapshotAsync = async () => { throw new Error('pre-relink command must not save'); };
  vm.runInContext(section('async function conciergeWeatherAlertsReply(', 'function conciergeHaversineKm('), f.context);
  const pending = f.context.conciergeWeatherAlertsReply('/alertameteo on', f.profile, f.snapshot);
  await paused;
  const replacement = { ...f.link, linkedAt: new Date(NOW - 1000).toISOString(), code: 'replacement-after-command' };
  f.records.set(`link-email:${EMAIL}`, structuredClone(replacement));
  f.records.set(`link-chat:${CHAT}`, structuredClone(replacement));
  release(); const reply = await pending;
  assert.doesNotMatch(reply, /Preferência.*ATIVADA/);
  assert.equal(f.records.has(`weather-consent:${EMAIL}`), false);
});
for (const [name, weatherCommandDate] of [
  ['missing', undefined], ['string', String(NOW / 1000 - 2)], ['fractional', NOW / 1000 - 1.5],
  ['future', NOW / 1000 + 1], ['stale', NOW / 1000 - 301],
]) {
  test(`actual opt-in handler rejects ${name} trusted message date`, async () => {
    const f = fixture(); f.records.delete(`weather-consent:${EMAIL}`);
    f.context.conciergeSaveSnapshotAsync = async () => { throw new Error('invalid-date command must not save'); };
    vm.runInContext(section('async function conciergeWeatherAlertsReply(', 'function conciergeHaversineKm('), f.context);
    const reply = await f.context.conciergeWeatherAlertsReply('/alertameteo on', { ...f.profile, weatherCommandDate }, f.snapshot);
    assert.doesNotMatch(reply, /Preferência.*ATIVADA/);
    assert.equal(f.records.has(`weather-consent:${EMAIL}`), false);
  });
}
test('actual opt-out handler still persists revocation without any message date', async () => {
  const f = fixture(); delete f.env.TELEGRAM_WEBHOOK_SECRET;
  f.context.conciergeSaveSnapshotAsync = async (_profile, _roster, metadata) => { Object.assign(f.snapshot.preferences, metadata.preferences); return structuredClone(f.snapshot); };
  vm.runInContext(section('async function conciergeWeatherAlertsReply(', 'function conciergeHaversineKm('), f.context);
  const reply = await f.context.conciergeWeatherAlertsReply('/alertameteo off', { ...f.profile, weatherCommandDate: undefined }, f.snapshot);
  assert.match(reply, /DESATIVADA/);
  assert.equal(f.records.get(`weather-consent:${EMAIL}`).weatherCriticalAlerts, false);
});
test('actual Telegram text path carries message.date as the trusted command date', async () => {
  const f = fixture(); let received;
  Object.assign(f.context, {
    handleTelegramWeatherCallback: async () => false, handleTelegramCallCallback: async () => false,
    handlePlatformVisitorTelegram: async () => false, telegramTryBindFromWebhook: async () => false,
    telegramMessagePdfDocument: () => null, telegramProfileForChatAsync: async () => ({ email: EMAIL, chatId: CHAT, linked: true }),
    conciergeLoadSnapshot: async () => f.snapshot, normalizeConciergeButtonText: text => text,
    sendTelegramChatAction: async () => {}, buildTelegramConciergeReply: async (_text, profile) => { received = profile; return 'Synthetic reply'; },
    conciergeNextProgram: () => null, airportIcao: () => '', conciergeKeyboard: {}, conciergeReplyKeyboard: () => ({}),
  });
  vm.runInContext(section('async function processTelegramUpdate(', 'async function handleTelegramWebhook('), f.context);
  await f.context.processTelegramUpdate({ message: { message_id: 123, date: NOW / 1000 - 2, chat: { id: Number(CHAT), type: 'private' }, text: '/alertameteo on' } });
  assert.equal(received.weatherCommandSequence, 123);
  assert.equal(received.weatherCommandDate, NOW / 1000 - 2);
});

const STATE_KEY = `weather:${EMAIL}:synthetic-flight`;
test('canary state exclusively uses lease methods and never reads the memory fallback', async () => {
  const f = fixture();
  f.context.criticalWeatherMonitorMemory = {
    get() { throw new Error('canary must not read process memory'); },
    set() { throw new Error('canary must not write process memory'); },
  };
  await cycle(f);
  assert.equal(f.sent.length, 1);
  assert.equal(f.genericStateReads, 0); assert.equal(f.genericStateWrites, 0);
  assert.equal(f.records.get(STATE_KEY).canaryDispatchState, 'submitted');
});
test('caught state DB read failure after restart cannot resend or erase durable submitted intent', async () => {
  const f = fixture(); await cycle(f);
  assert.equal(f.sent.length, 1);
  const submitted = structuredClone(f.records.get(STATE_KEY));
  f.context.criticalWeatherMonitorMemory.clear();
  f.lease.readState = async () => { throw new Error('Synthetic connection lost during state read'); };
  // Model the old helper swallowing the same DB error. The canary must not use it.
  const read = f.context.conciergeDbGet;
  f.context.conciergeDbGet = async key => key === STATE_KEY ? null : read(key);
  const summary = await cycle(f);
  assert.equal(summary.failures, 1); assert.equal(f.sent.length, 1);
  assert.deepEqual(f.records.get(STATE_KEY), submitted);
  assert.equal(f.genericStateWrites, 0);
});
test('lease loss during provider fetch cannot overwrite the successor submitted intent', async () => {
  const f = fixture(); const fetch = f.context.fetchAviationWeatherReport;
  const successor = { canaryDispatchState: 'submitted', pendingDelivery: false, successor: true, fingerprint: 'successor-risk', canaryConsentSequence: 999 };
  f.context.fetchAviationWeatherReport = async () => {
    const report = await fetch(); f.lease.held = false; f.records.set(STATE_KEY, structuredClone(successor)); return report;
  };
  await cycle(f);
  assert.equal(f.sent.length, 0); assert.deepEqual(f.records.get(STATE_KEY), successor);
  assert.equal(f.genericStateWrites, 0);
});
test('lease loss during observation write cannot erase successor submitted intent', async () => {
  const f = fixture();
  const successor = { canaryDispatchState: 'submitted', pendingDelivery: false, successor: true, fingerprint: 'successor-risk', canaryConsentSequence: 999 };
  f.lease.writeState = async () => {
    f.lease.held = false; f.records.set(STATE_KEY, structuredClone(successor));
    throw new Error('Synthetic leased connection died while writing');
  };
  const summary = await cycle(f);
  assert.equal(summary.failures, 1); assert.equal(f.sent.length, 0);
  assert.deepEqual(f.records.get(STATE_KEY), successor); assert.equal(f.genericStateWrites, 0);
});
test('lease loss during final write preserves successor intent without a generic fallback', async () => {
  const f = fixture();
  const successor = { canaryDispatchState: 'submitted', pendingDelivery: false, successor: true, fingerprint: 'successor-risk', canaryConsentSequence: 999 };
  f.context.sendTelegramMessage = async (chatId, text) => {
    f.sent.push({ chatId, text }); f.lease.held = false; f.records.set(STATE_KEY, structuredClone(successor)); return { ok: true };
  };
  const summary = await cycle(f);
  assert.equal(summary.alerts, 1); assert.equal(summary.failures, 1); assert.equal(f.sent.length, 1);
  assert.deepEqual(f.records.get(STATE_KEY), successor); assert.equal(f.genericStateWrites, 0);
});
