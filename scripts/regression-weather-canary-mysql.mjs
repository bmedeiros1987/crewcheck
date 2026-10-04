import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import mysql from 'mysql2/promise';
import * as policy from '../server/weather/monitor-readiness.mjs';
import { evaluateCriticalWeatherDelivery } from '../server/weather/critical-observation.mjs';

// Deliberately no URL/host/password option: this script may only use the named
// disposable CI socket. It cannot consume DATABASE_URL or reach production TCP.
const socketPath = process.env.CREWCHECK_QA_MYSQL_SOCKET;
assert.equal(process.env.CREWCHECK_WEATHER_CANARY_QA, 'isolated-mysql');
assert.equal(socketPath, '/tmp/crewcheck-weather-canary-qa-socket/mysqld.sock');
assert.equal(fs.statSync(socketPath).isSocket(), true);
const pool = mysql.createPool({ socketPath, user: 'root', password: '', database: 'crewcheck_weather_canary_qa', connectionLimit: 8, multipleStatements: false });
const source = fs.readFileSync('server.mjs', 'utf8');
const platform = fs.readFileSync('server/platform.mjs', 'utf8');
const section = (start, end) => {
  const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
  assert(first >= 0 && last > first, start);
  return source.slice(first, last);
};
const NOW = Date.now(), EMAIL = 'weather-canary@example.test', CHAT = '123456789';
const HASH = policy.weatherCanaryRecipientHash(EMAIL, CHAT);
const passed = [];
const run = async (name, fn) => { await fn(); passed.push(name); };
const clone = value => structuredClone(value);
const read = async key => {
  const [rows] = await pool.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?', [key]);
  const value = rows[0]?.payload;
  return typeof value === 'string' ? JSON.parse(value) : value || null;
};
const put = async (key, payload) => {
  await pool.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES (?,?,NOW()) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=NOW()', [key, JSON.stringify(payload)]);
  return true;
};
async function reset() {
  await pool.query('TRUNCATE TABLE crewcheck_telegram_state');
  const link = { email: EMAIL, chatId: CHAT, linkedAt: new Date(NOW - 3_600_000).toISOString(), code: 'synthetic-link' };
  const profile = { email: EMAIL, chatId: CHAT, linked: true, weatherCommandSequence: 100, weatherCommandDate: Math.floor((NOW - 2000) / 1000) };
  const preference = policy.weatherCanaryConsent({ enabled: true, profile, linkByEmail: link, linkByChat: link, now: NOW - 1000 });
  const snapshot = { key: EMAIL, email: EMAIL, chatId: CHAT, updatedAt: new Date(NOW - 1000).toISOString(), preferences: { weatherCriticalAlerts: true }, roster: { days: [{ date: new Date(NOW).toISOString().slice(0, 10) }] } };
  await put(`link-email:${EMAIL}`, link); await put(`link-chat:${CHAT}`, link); await put(`snapshot:${EMAIL}`, snapshot);
  await policy.writeWeatherCanaryConsent(pool, EMAIL, CHAT, preference, 50);
  return { link, profile, preference, snapshot };
}
const deletionMatch = platform.match(/client\.query\('(DELETE FROM crewcheck_telegram_state WHERE state_key IN \(\$1,\$2,\$3,\$4\))', \[`link-email:\$\{context\.identity\.email\}`, `snapshot:\$\{context\.identity\.email\}`, `profile:\$\{context\.identity\.email\}`, `weather-consent:\$\{context\.identity\.email\}`\]\)/);
assert(deletionMatch, 'exact account-deletion query must include weather consent');
const deletionSql = deletionMatch[1].replace(/\$\d+/g, '?');
const deletionKeys = [`link-email:${EMAIL}`, `snapshot:${EMAIL}`, `profile:${EMAIL}`, `weather-consent:${EMAIL}`];

try {
  const [[identity]] = await pool.query('SELECT DATABASE() AS db');
  assert.equal(identity.db, 'crewcheck_weather_canary_qa');
  await pool.query(`CREATE TABLE IF NOT EXISTS crewcheck_telegram_state (
    state_key VARCHAR(255) PRIMARY KEY, payload JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await run('real JSON round-trip preserves bound consent despite MySQL key normalization', async () => {
    const f = await reset();
    const expected = await policy.writeWeatherCanaryConsent(pool, EMAIL, CHAT, f.preference, 100);
    assert(policy.sameWeatherCanaryConsent(await read(`weather-consent:${EMAIL}`), expected));
    const selector = policy.createWeatherCanaryPolicy({ enabled: true, recipientHash: HASH, readRecord: read });
    const selection = await selector.select(f.snapshot); assert(selection); assert.equal(await selector.canDispatch(selection), true);
  });

  await run('exact digest lookup finds target outside latest 250 snapshots', async () => {
    const f = await reset();
    for (let index = 0; index < 300; index++) await put(`snapshot:newer-${index}@example.test`, { key: `newer-${index}@example.test`, email: `newer-${index}@example.test`, chatId: String(500000000 + index) });
    const result = await policy.findWeatherCanarySnapshots(pool, HASH);
    assert.equal(result.length, 1); assert.equal(result[0].email, f.snapshot.email);
    assert.deepEqual(await policy.findWeatherCanarySnapshots(pool, '*'), []);
  });

  await run('30 concurrent ordered commands retain newest opt-out', async () => {
    const f = await reset();
    await Promise.all(Array.from({ length: 30 }, (_, index) => {
      const sequence = 101 + index;
      return policy.writeWeatherCanaryConsent(pool, EMAIL, CHAT, sequence === 130 ? policy.weatherCanaryConsent({ enabled: false }) : f.preference, sequence);
    }));
    const final = await read(`weather-consent:${EMAIL}`);
    assert.equal(final.commandSequence, 130); assert.equal(final.weatherCriticalAlerts, false);
    await policy.writeWeatherCanaryConsent(pool, EMAIL, CHAT, f.preference, 101);
    assert.equal((await read(`weather-consent:${EMAIL}`)).weatherCriticalAlerts, false);
  });

  await run('actual handler delayed on cannot override newer acknowledged off with real SQL', async () => {
    const f = await reset(); let release, reached, delayed = false;
    const reachedPause = new Promise(resolve => { reached = resolve; });
    const pause = new Promise(resolve => { release = resolve; });
    const env = { CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED: 'true', CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256: HASH, TELEGRAM_WEBHOOK_SECRET: 'synthetic-only' };
    const context = { ...policy, process: { env }, envAny: keys => keys.map(key => env[key]).find(Boolean) || '',
      conciergeSafeKey: value => String(value || '').trim().toLowerCase(), conciergeDbPool: async () => pool,
      conciergeDbGet: async key => { if (key === `link-email:${EMAIL}` && !delayed) { delayed = true; reached(); await pause; } return read(key); },
      conciergeSaveSnapshotAsync: async (_profile, _roster, metadata) => { Object.assign(f.snapshot.preferences, metadata.preferences); await put(`snapshot:${EMAIL}`, f.snapshot); return clone(f.snapshot); },
      Date, Map,
    };
    vm.createContext(context);
    vm.runInContext(section('function criticalWeatherMonitorSettings()', 'const WEATHER_MONITOR_HEARTBEAT_KEY'), context);
    vm.runInContext(section('async function conciergeWeatherAlertsReply(', 'function conciergeHaversineKm('), context);
    const pending = context.conciergeWeatherAlertsReply('/alertameteo on', { ...f.profile, weatherCommandSequence: 100 }, f.snapshot);
    await reachedPause;
    const off = await context.conciergeWeatherAlertsReply('/alertameteo off', { ...f.profile, weatherCommandSequence: 101 }, f.snapshot);
    assert.match(off, /DESATIVADA/); release(); assert.match(await pending, /substituído/);
    assert.equal((await read(`weather-consent:${EMAIL}`)).weatherCriticalAlerts, false);
  });

  await run('delayed on from before relink is rejected despite a larger message sequence', async () => {
    const f = await reset();
    const relink = { ...f.link, code: 'replacement-link', linkedAt: new Date(NOW - 1000).toISOString() };
    await put(`link-email:${EMAIL}`, relink); await put(`link-chat:${CHAT}`, relink);
    assert.equal(policy.weatherCanaryConsent({ enabled: true, profile: f.profile, linkByEmail: relink, linkByChat: relink, now: NOW }), null);
    const env = { CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED: 'true', CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256: HASH, TELEGRAM_WEBHOOK_SECRET: 'synthetic-only' };
    const context = { ...policy, process: { env }, envAny: keys => keys.map(key => env[key]).find(Boolean) || '',
      conciergeSafeKey: value => String(value || '').trim().toLowerCase(), conciergeDbPool: async () => pool, conciergeDbGet: read,
      conciergeSaveSnapshotAsync: async () => { throw new Error('Stale on must never save snapshot'); }, Date, Map };
    vm.createContext(context);
    vm.runInContext(section('function criticalWeatherMonitorSettings()', 'const WEATHER_MONITOR_HEARTBEAT_KEY'), context);
    vm.runInContext(section('async function conciergeWeatherAlertsReply(', 'function conciergeHaversineKm('), context);
    const reply = await context.conciergeWeatherAlertsReply('/alertameteo on', { ...f.profile, weatherCommandSequence: 899 }, f.snapshot);
    assert.match(reply, /comando recente/);
    assert.equal((await read(`weather-consent:${EMAIL}`)).commandSequence, 50);
    // A command assembled before a concurrent relink is checked again under row locks.
    assert.equal(await policy.writeWeatherCanaryConsent(pool, EMAIL, CHAT, f.preference, 900), null);
    // Replacing the revision cannot turn a command sent in the former epoch into consent.
    const fresh = policy.weatherCanaryConsent({ enabled: true, profile: { ...f.profile, weatherCommandDate: Math.floor(NOW / 1000) }, linkByEmail: relink, linkByChat: relink, now: NOW });
    assert(fresh);
    const stale = { ...fresh, weatherCriticalAlertsConsent: { ...fresh.weatherCriticalAlertsConsent, commandDate: f.profile.weatherCommandDate } };
    assert.equal(await policy.writeWeatherCanaryConsent(pool, EMAIL, CHAT, stale, 901), null);
    assert.equal((await read(`weather-consent:${EMAIL}`)).commandSequence, 50);
    assert(await policy.writeWeatherCanaryConsent(pool, EMAIL, CHAT, policy.weatherCanaryConsent({ enabled: false }), 902));
    assert.equal((await read(`weather-consent:${EMAIL}`)).weatherCriticalAlerts, false);
  });

  await run('independent MySQL sessions cannot hold the same canary lease', async () => {
    const first = await policy.acquireWeatherCanaryLease(pool, HASH); assert(first);
    try { assert.equal(await first.isHeld(), true); assert.equal(await policy.acquireWeatherCanaryLease(pool, HASH), null); }
    finally { await first.release(); }
    const next = await policy.acquireWeatherCanaryLease(pool, HASH); assert(next); await next.release();
  });

  await run('connection loss releases MySQL advisory lock', async () => {
    let connection;
    const first = await policy.acquireWeatherCanaryLease({ getConnection: async () => { connection = await pool.getConnection(); return connection; } }, HASH);
    assert(first); connection.destroy();
    let replacement;
    const deadline = Date.now() + 5000;
    while (!replacement && Date.now() < deadline) {
      replacement = await policy.acquireWeatherCanaryLease(pool, HASH);
      if (!replacement) await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert(replacement, 'lock released after terminated connection');
    await replacement.release(); assert.equal(await first.isHeld(), false); await first.release();
  });

  await run('lost lease cannot erase a successor durable intent', async () => {
    await reset(); let connection;
    const first = await policy.acquireWeatherCanaryLease({ getConnection: async () => { connection = await pool.getConnection(); return connection; } }, HASH);
    assert(first); const key = 'weather-alert:lease-race';
    assert.equal(await first.readState(key), null);
    connection.destroy();
    let next; const deadline = Date.now() + 5000;
    while (!next && Date.now() < deadline) { next = await policy.acquireWeatherCanaryLease(pool, HASH); if (!next) await new Promise(resolve => setTimeout(resolve, 20)); }
    assert(next);
    try {
      const submitted = { fingerprint: 'successor-intent', canaryDispatchState: 'submitted' };
      await next.writeState(key, submitted);
      await assert.rejects(first.writeState(key, { pendingDelivery: true }));
      await assert.rejects(first.readState(key));
      assert.deepEqual(await next.readState(key), submitted);
    } finally { await first.release(); await next.release(); }
  });

  await run('release waits for in-flight state writes before returning the connection', async () => {
    await reset(); let reached, resume, returned = false;
    const started = new Promise(resolve => { reached = resolve; }); const wait = new Promise(resolve => { resume = resolve; });
    const leasedPool = { getConnection: async () => {
      const connection = await pool.getConnection();
      return { query: async (sql, values) => {
        const result = await connection.query(sql, values);
        if (sql.sql?.startsWith('INSERT INTO')) { reached(); await wait; }
        return result;
      }, release: () => { returned = true; connection.release(); }, destroy: () => connection.destroy() };
    } };
    const first = await policy.acquireWeatherCanaryLease(leasedPool, HASH); assert(first);
    const writing = first.writeState('weather-alert:release-race', { pendingDelivery: true });
    await started; const releasing = first.release();
    assert.equal(returned, false); assert.equal(await policy.acquireWeatherCanaryLease(pool, HASH), null);
    await assert.rejects(first.writeState('weather-alert:release-race', { forbidden: true }));
    resume(); await writing; await releasing; assert.equal(returned, true);
    const next = await policy.acquireWeatherCanaryLease(pool, HASH); assert(next);
    try { assert.deepEqual(await next.readState('weather-alert:release-race'), { pendingDelivery: true }); }
    finally { await next.release(); }
  });

  await run('deletion after concurrent grant removes consent atomically', async () => {
    const f = await reset(); let release, reached;
    const paused = new Promise(resolve => { reached = resolve; }); const wait = new Promise(resolve => { release = resolve; });
    const delayedPool = { getConnection: async () => {
      const connection = await pool.getConnection();
      return { query: async (sql, values) => { const result = await connection.query(sql, values); if (sql.startsWith('SELECT state_key,payload')) { reached(); await wait; } return result; }, release: () => connection.release(), destroy: () => connection.destroy() };
    } };
    const grant = policy.writeWeatherCanaryConsent(delayedPool, EMAIL, CHAT, f.preference, 200); await paused;
    const deletion = (async () => { const connection = await pool.getConnection(); try { await connection.query('BEGIN'); await connection.query(deletionSql, deletionKeys); await connection.query('COMMIT'); } finally { connection.release(); } })();
    release(); await grant; await deletion;
    for (const key of deletionKeys) assert.equal(await read(key), null);
    assert.equal(await policy.createWeatherCanaryPolicy({ enabled: true, recipientHash: HASH, readRecord: read }).select(f.snapshot), null);
  });

  await run('deletion before delayed grant cannot recreate consent', async () => {
    const f = await reset(); const deletion = await pool.getConnection();
    try {
      await deletion.query('BEGIN'); await deletion.query(deletionSql, deletionKeys);
      let attempted;
      const began = new Promise(resolve => { attempted = resolve; });
      const delayedPool = { getConnection: async () => {
        const connection = await pool.getConnection();
        return { query: async (sql, values) => { if (sql.startsWith('SELECT state_key,payload')) attempted(); return connection.query(sql, values); }, release: () => connection.release(), destroy: () => connection.destroy() };
      } };
      const grant = policy.writeWeatherCanaryConsent(delayedPool, EMAIL, CHAT, f.preference, 201);
      await began; await deletion.query('COMMIT'); assert.equal(await grant, null);
      assert.equal(await read(`weather-consent:${EMAIL}`), null);
    } finally { deletion.release(); }
  });

  await run('account-deletion rollback preserves consent; commit removes only the target account', async () => {
    await reset(); await put('weather-consent:other@example.test', { weatherCriticalAlerts: false });
    const connection = await pool.getConnection();
    try {
      await connection.query('BEGIN'); await connection.query(deletionSql, deletionKeys); await connection.query('ROLLBACK');
      assert(await read(`weather-consent:${EMAIL}`));
      await connection.query('BEGIN'); await connection.query(deletionSql, deletionKeys); await connection.query('COMMIT');
      assert.equal(await read(`weather-consent:${EMAIL}`), null); assert(await read('weather-consent:other@example.test'));
    } finally { connection.release(); }
  });

  await run('actual canary cycle persists intent and never repeats accepted-but-uncommitted send after restart', async () => {
    const f = await reset(), sent = [];
    const observed = new Date(NOW - 300_000);
    const group = [observed.getUTCDate(), observed.getUTCHours(), observed.getUTCMinutes()].map(value => String(value).padStart(2, '0')).join('');
    const env = { CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED: 'true', CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256: HASH, TELEGRAM_WEBHOOK_SECRET: 'synthetic-only' };
    const context = { ...policy, process: { env }, envAny: keys => keys.map(key => env[key]).find(Boolean) || '',
      conciergeDbPool: async () => pool, conciergeDbGet: read,
      conciergeDbPut: async (key, value) => value.lastSentAt ? false : put(key, value),
      conciergeWeatherCandidates: () => [{ key: 'synthetic-flight', station: 'SBGR', role: 'origem', flight: 'TEST1', route: 'GRU → BSB' }],
      weatherAlertStateKey: () => 'weather-alert:synthetic',
      fetchAviationWeatherReport: async () => ({ ok: true, official: true, provider: 'redemet', source: 'Synthetic', station: 'SBGR', observedAt: observed.toISOString(), raw: `SBGR ${group}Z 09015KT 2000 TSRA BKN008 18/17 Q1013` }),
      criticalWeatherChange: () => ({ critical: false, severity: 2, reasons: ['synthetic severe weather'], fingerprint: 'synthetic-risk' }),
      evaluateCriticalWeatherDelivery, criticalWeatherMonitorMemory: new Map(),
      sendTelegramMessage: async (chatId, text) => { sent.push({ chatId, text }); return { ok: true }; }, Date, Map,
    };
    vm.createContext(context);
    vm.runInContext(section('function criticalWeatherMonitorSettings()', 'const WEATHER_MONITOR_HEARTBEAT_KEY'), context);
    vm.runInContext(section('async function runCriticalWeatherMonitorCycle(', 'async function handleCriticalWeatherMonitor('), context);
    const execute = async (leasedPool = pool, waitForDisconnect = false) => {
      let lease = await policy.acquireWeatherCanaryLease(leasedPool, HASH);
      // Only the explicit disconnect fixture waits for MySQL to observe socket
      // termination. Production GET_LOCK(0) remains fail-closed and nonblocking.
      if (waitForDisconnect) {
        const deadline = Date.now() + 5000;
        while (!lease && Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 20));
          lease = await policy.acquireWeatherCanaryLease(leasedPool, HASH);
        }
      }
      assert(lease);
      const adapter = { ...lease, writeState: async (key, value) => {
        if (value.lastSentAt) throw new Error('Synthetic final-write failure');
        return lease.writeState(key, value);
      } };
      try { return await context.runCriticalWeatherMonitorCycle(new Date(NOW), () => NOW, adapter); }
      finally { await lease.release(); }
    };
    const first = await execute(); assert.equal(first.alerts, 1); assert.equal(first.failures, 1);
    context.criticalWeatherMonitorMemory.clear();
    // The legacy getter deliberately collapses errors to null. Canary state must
    // never use it, even after restart and despite successful consent/link reads.
    context.conciergeDbGet = async key => key.startsWith('weather-alert:') ? null : read(key);
    let failedReads = 0;
    const faultPool = { getConnection: async () => {
      const connection = await pool.getConnection();
      return { query: async (sql, values) => {
        if (sql.sql?.startsWith('SELECT payload FROM') && sql.values?.[0] === 'weather-alert:synthetic') {
          failedReads++; throw new Error('Synthetic state-read failure');
        }
        return connection.query(sql, values);
      }, release: () => connection.release(), destroy: () => connection.destroy() };
    } };
    const failed = await execute(faultPool);
    assert.equal(failedReads, 1); assert.equal(failed.failures, 1); assert.equal(sent.length, 1);
    await execute(pool, true); assert.equal(sent.length, 1);
    assert.equal((await read('weather-alert:synthetic')).canaryDispatchState, 'submitted');

    // A loses its connection immediately after reading an absent state; B sends
    // while A is paused. A must not overwrite B's intent through the pool.
    await pool.query('DELETE FROM crewcheck_telegram_state WHERE state_key=?', ['weather-alert:synthetic']);
    let successorSent = false;
    const stalePool = { getConnection: async () => {
      const connection = await pool.getConnection();
      return { query: async (sql, values) => {
        const result = await connection.query(sql, values);
        if (sql.sql?.startsWith('SELECT payload FROM') && sql.values?.[0] === 'weather-alert:synthetic') {
          connection.destroy();
          let successor; const deadline = Date.now() + 5000;
          while (!successor && Date.now() < deadline) { successor = await policy.acquireWeatherCanaryLease(pool, HASH); if (!successor) await new Promise(resolve => setTimeout(resolve, 20)); }
          assert(successor);
          try { const report = await context.runCriticalWeatherMonitorCycle(new Date(NOW), () => NOW, successor); assert.equal(report.alerts, 1); successorSent = true; }
          finally { await successor.release(); }
        }
        return result;
      }, release: () => connection.release(), destroy: () => connection.destroy() };
    } };
    const stale = await execute(stalePool);
    assert.equal(successorSent, true); assert.equal(stale.failures, 1); assert.equal(sent.length, 2);
    const successorState = await read('weather-alert:synthetic');
    assert.equal(successorState.canaryDispatchState, 'submitted'); assert(successorState.lastSentAt);
    await execute(); assert.equal(sent.length, 2);
  });

  console.log(JSON.stringify({ ok: true, database: 'isolated-mysql-8.4', count: passed.length, passed, realExternalSends: 0 }, null, 2));
} finally { await pool.end(); }
