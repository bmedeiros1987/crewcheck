import test from 'node:test';
import assert from 'node:assert/strict';
import { weatherCanaryRecipientHash, weatherConsentCommand, writeWeatherCanaryConsent, weatherMonitorSettings, weatherMonitorReadiness,
  weatherCanaryConsent, createWeatherCanaryPolicy, findWeatherCanarySnapshots, acquireWeatherCanaryLease } from '../../server/weather/monitor-readiness.mjs';

const NOW = Date.parse('2026-10-04T17:00:00Z');
const EMAIL = 'synthetic@example.test';
const CHAT = '123456789';
const HASH = weatherCanaryRecipientHash(EMAIL, CHAT);
function fixture() {
  const link = { email: EMAIL, chatId: CHAT, linkedAt: '2026-10-04T12:00:00Z', code: 'synthetic-link-only' };
  const consent = weatherCanaryConsent({ enabled: true, profile: { email: EMAIL, chatId: CHAT, linked: true }, linkByEmail: link, linkByChat: link, now: NOW - 1000 });
  const snapshot = { key: EMAIL, email: EMAIL, chatId: CHAT, roster: { days: [{ date: '2026-10-04', legs: [] }] }, preferences: consent, updatedAt: '2026-10-04T16:59:00Z' };
  const records = new Map([[`weather-consent:${EMAIL}`, { ...structuredClone(consent), commandSequence: 50, commandChatId: CHAT, channel: 'telegram' }], [`snapshot:${EMAIL}`, snapshot], [`link-email:${EMAIL}`, structuredClone(link)], [`link-chat:${CHAT}`, structuredClone(link)]]);
  let reads = 0;
  const readRecord = async key => { reads += 1; return structuredClone(records.get(key) || null); };
  const make = (overrides = {}) => createWeatherCanaryPolicy({ enabled: true, recipientHash: HASH, readRecord, now: () => NOW, ...overrides });
  return { records, snapshot, link, make, get reads() { return reads; } };
}

test('settings remain disabled without new configuration', () => {
  assert.equal(weatherMonitorSettings().mode, 'disabled');
  assert.equal(weatherMonitorSettings().enabled, false);
});
test('legacy setting is preserved but never implicitly enabled', () => {
  assert.equal(weatherMonitorSettings({ CREWCHECK_WEATHER_MONITOR_ENABLED: 'true' }).mode, 'legacy');
  assert.equal(weatherMonitorSettings({ CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256: HASH }).mode, 'blocked');
});
test('valid canary supersedes the broad legacy flag', () => {
  const settings = weatherMonitorSettings({ CREWCHECK_WEATHER_MONITOR_ENABLED: 'true', CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED: 'true', CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256: HASH });
  assert.equal(settings.mode, 'canary');
  assert.equal(settings.enabled, true);
});
for (const invalid of ['', '*', HASH + ',' + HASH, HASH.toUpperCase(), ' ' + HASH, JSON.stringify([HASH])]) {
  test(`invalid allowlist is blocked with no broad fallback: ${invalid.slice(0, 8)}`, () => {
    const settings = weatherMonitorSettings({ CREWCHECK_WEATHER_MONITOR_ENABLED: 'true', CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED: 'true', CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256: invalid });
    assert.equal(settings.mode, 'blocked');
    assert.equal(settings.enabled, false);
  });
}
test('canary activation requires exact string true at env boundary', () => {
  for (const flag of [true, 1, '1', 'TRUE', 'true ', 'yes']) assert.equal(weatherMonitorSettings({ CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED: flag, CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256: HASH }).mode, 'blocked');
});
test('interval is finite and bounded', () => {
  for (const [input, expected] of [['oops', 10], ['Infinity', 10], ['1', 5], ['999', 30], ['15', 15], ['', 10]]) assert.equal(weatherMonitorSettings({ CREWCHECK_WEATHER_MONITOR_INTERVAL_MINUTES: input }).intervalMinutes, expected);
});
test('readiness only returns sanitized configuration facts, never delivery proof', () => {
  const settings = weatherMonitorSettings({ CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED: 'true', CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256: HASH });
  const readiness = weatherMonitorReadiness({ settings: { ...settings, token: 'DO_NOT_LEAK', email: EMAIL, chatId: CHAT }, schedulerSecretConfigured: true, telegramConfigured: true, telegramWebhookSecretConfigured: true, persistenceConfigured: true, token: 'DO_NOT_LEAK' });
  assert.equal(readiness.configurationReady, true);
  assert.equal(readiness.deliveryVerified, false);
  const serialized = JSON.stringify(readiness);
  for (const privateValue of [HASH, EMAIL, CHAT, 'DO_NOT_LEAK']) assert.equal(serialized.includes(privateValue), false);
});
test('missing prerequisites never report configuration ready', () => {
  const settings = weatherMonitorSettings({ CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED: 'true', CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256: HASH });
  for (const missing of ['schedulerSecretConfigured', 'telegramConfigured', 'telegramWebhookSecretConfigured', 'persistenceConfigured']) assert.equal(weatherMonitorReadiness({ settings, schedulerSecretConfigured: true, telegramConfigured: true, telegramWebhookSecretConfigured: true, persistenceConfigured: true, [missing]: false }).configurationReady, false);
});
test('recipient digest normalizes account only; no group or arbitrary targets', () => {
  assert.equal(weatherCanaryRecipientHash(' SYNTHETIC@EXAMPLE.TEST ', CHAT), HASH);
  assert.notEqual(weatherCanaryRecipientHash(EMAIL, '123456788'), HASH);
  for (const chat of ['-100123', '0', '001', '123x', 123, '', 'https://evil.test']) assert.equal(weatherCanaryRecipientHash(EMAIL, chat), '');
  for (const email of ['', 'telegram:123', 'not-email', 'a\nb@example.test']) assert.equal(weatherCanaryRecipientHash(email, CHAT), '');
});
test('disabled policy makes no durable reads', async () => {
  const f = fixture();
  for (const flag of [false, 'true', undefined, 1]) {
    assert.equal(await f.make({ enabled: flag }).select(f.snapshot), null);
  }
  assert.equal(f.reads, 0);
});
test('non-allowlisted account or chat never triggers reads', async () => {
  const f = fixture();
  assert.equal(await f.make().select({ ...f.snapshot, email: 'other@example.test', key: 'other@example.test' }), null);
  assert.equal(await f.make().select({ ...f.snapshot, chatId: '999999999' }), null);
  assert.equal(await f.make().select({ ...f.snapshot, key: 'other@example.test' }), null);
  assert.equal(f.reads, 0);
});
test('approved explicit-consent recipient selects fresh durable roster', async () => {
  const f = fixture();
  const current = f.records.get(`snapshot:${EMAIL}`);
  current.roster.days[0].fresh = true;
  const stale = { ...f.snapshot, roster: { days: [{ stale: true }] } };
  const policy = f.make();
  const selected = await policy.select(stale);
  assert.equal(selected.snapshot.roster.days[0].fresh, true);
  assert.equal(await policy.canDispatch(selected), true);
  assert.equal(f.reads, 9);
});
for (const value of [undefined, false, 'true', 1]) {
  test(`weather consent must be explicit boolean true: ${value}`, async () => {
    const f = fixture();
    f.records.get(`weather-consent:${EMAIL}`).weatherCriticalAlerts = value;
    assert.equal(await f.make().select(f.snapshot), null);
  });
}
test('legacy opt-in without current binding consent is insufficient for canary', async () => {
  const f = fixture();
  delete f.records.get(`weather-consent:${EMAIL}`).weatherCriticalAlertsConsent;
  assert.equal(await f.make().select(f.snapshot), null);
});
for (const key of [`snapshot:${EMAIL}`, `link-email:${EMAIL}`, `link-chat:${CHAT}`, `weather-consent:${EMAIL}`]) {
  test(`missing durable record fails closed: ${key.split(':')[0]}`, async () => {
    const f = fixture(); f.records.delete(key);
    assert.equal(await f.make().select(f.snapshot), null);
  });
}
test('storage error fails closed without exposing an error message', async () => {
  const f = fixture();
  assert.equal(await f.make({ readRecord: async () => { throw new Error('secret database endpoint'); } }).select(f.snapshot), null);
});
test('local stale link cannot override changed durable account or chat', async () => {
  for (const key of [`link-email:${EMAIL}`, `link-chat:${CHAT}`]) {
    const f = fixture(); f.records.get(key).email = 'other@example.test';
    assert.equal(await f.make().select(f.snapshot), null);
  }
  const f = fixture(); f.records.get(`link-email:${EMAIL}`).chatId = '222222222';
  assert.equal(await f.make().select(f.snapshot), null);
});
test('inconsistent forward/reverse link versions fail closed', async () => {
  const f = fixture(); f.records.get(`link-chat:${CHAT}`).code = 'another-link';
  assert.equal(await f.make().select(f.snapshot), null);
});
test('relinking the same account/chat requires new explicit consent', async () => {
  const f = fixture();
  for (const key of [`link-email:${EMAIL}`, `link-chat:${CHAT}`]) f.records.get(key).code = 'replacement-link';
  assert.equal(await f.make().select(f.snapshot), null);
});
test('consent cannot be future dated or predate account linkage', async () => {
  for (const grantedAt of ['2026-10-04T18:00:00Z', '2026-10-04T11:00:00Z', 'invalid']) {
    const f = fixture(); f.records.get(`weather-consent:${EMAIL}`).weatherCriticalAlertsConsent.grantedAt = grantedAt;
    assert.equal(await f.make().select(f.snapshot), null);
  }
});
test('missing, old, invalid or future roster context fails closed', async () => {
  for (const updatedAt of ['', 'invalid', '2026-08-01T00:00:00Z', '2026-10-05T00:00:00Z']) {
    const f = fixture(); f.records.get(`snapshot:${EMAIL}`).updatedAt = updatedAt;
    assert.equal(await f.make().select(f.snapshot), null);
  }
  const f = fixture(); f.records.get(`snapshot:${EMAIL}`).roster.days = [];
  assert.equal(await f.make().select(f.snapshot), null);
});
test('opt-out during evaluation prevents dispatch', async () => {
  const f = fixture(); const policy = f.make(); const selected = await policy.select(f.snapshot);
  f.records.get(`weather-consent:${EMAIL}`).weatherCriticalAlerts = false;
  assert.equal(await policy.canDispatch(selected), false);
});
test('link revocation during evaluation prevents dispatch', async () => {
  const f = fixture(); const policy = f.make(); const selected = await policy.select(f.snapshot);
  f.records.delete(`link-chat:${CHAT}`);
  assert.equal(await policy.canDispatch(selected), false);
});
test('roster replacement during evaluation prevents dispatch', async () => {
  const f = fixture(); const policy = f.make(); const selected = await policy.select(f.snapshot);
  f.records.get(`snapshot:${EMAIL}`).roster.days[0].date = '2026-10-05';
  assert.equal(await policy.canDispatch(selected), false);
});
test('mutating evaluation snapshot cannot change durable records or authorize dispatch', async () => {
  const f = fixture(); const policy = f.make(); const selected = await policy.select(f.snapshot);
  selected.snapshot.chatId = '999999999';
  assert.equal(f.records.get(`snapshot:${EMAIL}`).chatId, CHAT);
  assert.equal(await policy.canDispatch(selected), false);
});
test('opt-out remains possible without linked profile or available DB', () => {
  assert.deepEqual(weatherCanaryConsent({ enabled: false }), { weatherCriticalAlerts: false, weatherCriticalAlertsConsent: null });
});
test('opt-in requires trusted current linked profile and matching indexes', () => {
  const f = fixture();
  for (const profile of [{ email: EMAIL, chatId: CHAT }, { email: EMAIL, chatId: CHAT, linked: false }, { email: 'other@example.test', chatId: CHAT, linked: true }]) assert.equal(weatherCanaryConsent({ enabled: true, profile, linkByEmail: f.link, linkByChat: f.link, now: NOW }), null);
  assert.equal(weatherCanaryConsent({ enabled: true, profile: { email: EMAIL, chatId: CHAT, linked: true }, linkByEmail: f.link, now: NOW }), null);
});

test('canary configuration presence blocks fallback even if disabled or malformed', () => {
  for (const flag of [false, true, 0, 1, 'FALSE', 'TRUE', 'true ', 'yes', null, undefined, '']) {
    const settings = weatherMonitorSettings({ CREWCHECK_WEATHER_MONITOR_ENABLED: 'true', CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED: flag, CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256: HASH });
    assert.equal(settings.mode, 'blocked');
  }
  assert.equal(weatherMonitorSettings({ CREWCHECK_WEATHER_MONITOR_ENABLED: 'true', CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED: 'false', CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256: HASH }).mode, 'disabled');
});
test('only exact recognized on/off commands create new weather consent', () => {
  for (const [text, command] of [['/alertameteo on', 'on'], ['/alertameteo off', 'off'], ['/alertameteo@synthetic_bot ON', 'on'], ['/alertasmeteo off ', 'off']]) assert.equal(weatherConsentCommand(text), command);
  for (const text of ['/alertameteo nao ativar', '/alertameteo on later', '/alertameteo', 'please /alertameteo on', '/alertameteo 1', '/alertameteo ativar', '/alertameteo on\n/alertameteo off']) assert.equal(weatherConsentCommand(text), null);
});
test('stale snapshot preference write cannot resurrect authoritative opt-out', async () => {
  const f = fixture(); const policy = f.make(); const selection = await policy.select(f.snapshot);
  f.records.set(`weather-consent:${EMAIL}`, weatherCanaryConsent({ enabled: false }));
  f.records.get(`snapshot:${EMAIL}`).preferences = { weatherCriticalAlerts: true, weatherCriticalAlertsConsent: selection.consent };
  assert.equal(await policy.canDispatch(selection), false);
  assert.equal(await policy.select(f.snapshot), null);
});
test('revocation before parallel link reads complete is caught by final consent read', async () => {
  const f = fixture(); const initial = await f.make().select(f.snapshot);
  let calls = 0;
  const readRecord = async key => {
    const result = structuredClone(f.records.get(key));
    calls++;
    if (key === `link-chat:${CHAT}`) {
      await Promise.resolve();
      f.records.set(`weather-consent:${EMAIL}`, weatherCanaryConsent({ enabled: false }));
    }
    return result;
  };
  assert.equal(await f.make({ readRecord }).canDispatch(initial), false);
  assert.equal(calls, 5);
});
test('exact canary lookup is bound, independent of newest-250 limit, and ambiguity-safe', async () => {
  const f = fixture(); let query;
  const pool = { query: async (sql, values) => { query = { sql, values }; return [[{ payload: JSON.stringify(f.snapshot) }]]; } };
  assert.equal((await findWeatherCanarySnapshots(pool, HASH))[0].email, EMAIL);
  assert.deepEqual(query.values, [HASH]); assert.match(query.sql, /SHA2\(CONCAT/); assert.match(query.sql, /LIMIT 2/);
  assert.equal(query.sql.includes(HASH), false); assert.equal(query.sql.includes(EMAIL), false);
  assert.deepEqual(await findWeatherCanarySnapshots({ query: async () => [[{ payload: f.snapshot }, { payload: f.snapshot }]] }, HASH), []);
  assert.deepEqual(await findWeatherCanarySnapshots({ query: async () => { throw new Error('unavailable'); } }, HASH), []);
  assert.deepEqual(await findWeatherCanarySnapshots({ query: async () => { throw new Error('must not query'); } }, '*'), []);
});
function lockPool() {
  let owner = null, nextId = 1;
  const stats = { destroyed: 0, released: 0, queries: [] };
  return { stats, async getConnection() {
    const id = nextId++;
    return {
      async query(input) {
        stats.queries.push(input);
        if (input.sql.includes('GET_LOCK')) { if (owner !== null) return [[{ acquired: 0 }]]; owner = id; return [[{ acquired: 1 }]]; }
        if (input.sql.includes('IS_USED_LOCK')) return [[{ owned: owner === id ? 1 : 0 }]];
        if (input.sql.includes('RELEASE_LOCK')) { if (owner === id) owner = null; return [[{ released: 1 }]]; }
        throw new Error('unexpected synthetic SQL');
      },
      release() { stats.released++; }, destroy() { if (owner === id) owner = null; stats.destroyed++; },
    };
  } };
}
test('durable-lease adapter serializes independent clients and releases reliably', async () => {
  const pool = lockPool();
  const first = await acquireWeatherCanaryLease(pool, HASH);
  assert(first); assert.equal(await first.isHeld(), true);
  assert.equal(await acquireWeatherCanaryLease(pool, HASH), null);
  await first.release(); assert.equal(await first.isHeld(), false);
  const next = await acquireWeatherCanaryLease(pool, HASH);
  assert(next); await next.release(); await next.release();
  assert.equal(pool.stats.released, 3);
  for (const query of pool.stats.queries) { assert.equal(query.timeout, 3500); assert.equal(query.values[0].length, 64); assert.equal(query.values[0].includes(EMAIL), false); }
});
test('lease connection/query failure fails closed and destroys uncertain connection', async () => {
  let destroyed = 0;
  assert.equal(await acquireWeatherCanaryLease({ getConnection: async () => { throw new Error('no DB'); } }, HASH), null);
  assert.equal(await acquireWeatherCanaryLease({ getConnection: async () => ({ query: async () => { throw new Error('query timeout'); }, destroy() { destroyed++; } }) }, HASH), null);
  assert.equal(destroyed, 1);
});
test('failed lease release destroys pooled connection rather than retaining named lock', async () => {
  let destroyed = 0, calls = 0;
  const lease = await acquireWeatherCanaryLease({ getConnection: async () => ({ query: async () => { if (++calls === 1) return [[{ acquired: 1 }]]; throw new Error('DB unavailable'); }, destroy() { destroyed++; } }) }, HASH);
  assert.equal(await lease.isHeld(), false); await lease.release(); assert.equal(destroyed, 1);
});
test('consent SQL is bound and conditional on trusted chat-scoped ordering', async () => {
  const f = fixture(); let captured;
  const pool = { getConnection: async () => ({
    query: async (sql, values) => {
      if (sql.startsWith('SELECT state_key,payload')) return [[...f.records].map(([state_key, payload]) => ({ state_key, payload }))];
      if (sql.startsWith('INSERT')) captured = { sql, values };
      return [{ affectedRows: 1 }];
    }, release() {}, destroy() {},
  }) };
  const record = await writeWeatherCanaryConsent(pool, EMAIL, CHAT, weatherCanaryConsent({ enabled: false }), 101);
  assert.equal(record.commandSequence, 101); assert.equal(record.commandChatId, CHAT); assert.equal(record.channel, 'telegram');
  assert.equal(captured.values[0], `weather-consent:${EMAIL}`);
  assert.deepEqual(captured.values.slice(2), [CHAT, 101, CHAT, 101]);
  assert.match(captured.sql, /ON DUPLICATE KEY UPDATE/);
  assert.match(captured.sql, /payload=IF/);
  assert.equal(captured.sql.includes(EMAIL), false); assert.equal(captured.sql.includes(CHAT), false);
});
test('invalid or absent command ordering never writes consent', async () => {
  let calls = 0;
  const pool = { query: async () => { calls++; } };
  for (const sequence of [undefined, 0, -1, '101', 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(await writeWeatherCanaryConsent(pool, EMAIL, CHAT, weatherCanaryConsent({ enabled: false }), sequence), null);
  assert.equal(calls, 0);
});
test('consent SQL failure produces no claim of durable success', async () => {
  assert.equal(await writeWeatherCanaryConsent({ query: async () => { throw new Error('DB failure'); } }, EMAIL, CHAT, weatherCanaryConsent({ enabled: false }), 101), null);
});
