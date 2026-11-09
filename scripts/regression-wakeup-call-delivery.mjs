import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sendTelegramWakeupCall, sendInfobipWakeupCall } from '../server/wakeup-call-delivery.mjs';
import { dispatchClaimedJob } from '../server/notification-job-safety.mjs';

globalThis.fetch = () => { throw new Error('External network forbidden'); };
let count = 0;
const fake = body => async (url, init) => {
  count++;
  assert.equal(init.redirect, 'error');
  assert.ok(init.signal);
  return new Response(body);
};
const base = { username: 'synthetic_user', text: 'Fixture only', environment: {}, fetchImpl: fake('Call accepted') };
assert.equal((await sendTelegramWakeupCall(base)).ok, true);
assert.equal(count, 1);
for (const raw of ['', 'ERROR: not authorized', 'Calls disabled']) assert.equal((await sendTelegramWakeupCall({ ...base, fetchImpl: fake(raw) })).uncertain, true);
count = 0;
assert.equal((await sendTelegramWakeupCall({ ...base, environment: { CALLMEBOT_TELEGRAM_CALL_ENABLED: 'false' } })).configured, false);
assert.equal(count, 0);
for (const value of ['false', ' false ', 'disabled', 'DISABLED', '0', 'no', 'off', 'arbitrary']) {
  assert.equal((await sendTelegramWakeupCall({ ...base, environment: { CALLMEBOT_TELEGRAM_CALL_ENABLED: value } })).configured, false);
}
assert.equal(count, 0, 'all previously disabled forms must make zero attempts');
for (const value of ['', ' ', '1', ' true ', 'YES', 'sim', 'on', 'enabled']) {
  assert.equal((await sendTelegramWakeupCall({ ...base, environment: { CALLMEBOT_TELEGRAM_CALL_ENABLED: value } })).ok, true);
}
count = 0;
const interrupted = async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { count++; reject(new Error('Abort')); }, { once: true }));
assert.equal((await sendTelegramWakeupCall({ ...base, fetchImpl: interrupted, timeoutMs: 5 })).uncertain, true);
assert.equal(count, 1); // no fallback/retry
assert.equal((await sendTelegramWakeupCall({ ...base, fetchImpl: fake('x'.repeat(16_385)) })).uncertain, true);

const environment = { INFOBIP_API_KEY: 'synthetic-key', INFOBIP_BASE_URL: 'https://fixture.api.infobip.com', INFOBIP_PHONE_FROM: '15555550100' };
const voice = { phone: '15555550101', text: 'Fixture', environment };
const receipt = (extra = {}) => JSON.stringify({ messages: [{ to: voice.phone, messageId: 'fixture-receipt', status: { groupId: 1 }, ...extra }] });
assert.equal((await sendInfobipWakeupCall({ ...voice, fetchImpl: fake(receipt()) })).ok, true);
for (const raw of ['{}', 'not json', receipt({ to: '15555550102' }), receipt({ status: { groupId: 5 } }), receipt({ messageId: '' })]) {
  const outcome = await sendInfobipWakeupCall({ ...voice, fetchImpl: fake(raw) });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.uncertain, true);
  assert.equal(outcome.delivered, null);
}

// Exercise the actual durable-state dispatcher with the new combined transport.
// Its SQL fixture simulates CAS, a restart and a second worker on the same row.
const now = Date.now();
let state = 'processing', sends = 0;
const row = { id: 1, channel: 'telegram+telegram-call', message: 'Synthetic', email: 'fixture@example.invalid', job_key: 'wakeup:fixture', chat_id: 'fixture-chat', telegram_username: 'synthetic_user', scheduled_epoch: now - 1000, created_epoch: now - 20000, locked_at: new Date(now), attempts: 1 };
const db = { query: async (sql, params) => {
  if (sql.startsWith('SELECT *')) return [state === 'processing' ? [row] : []];
  if (sql.startsWith('SELECT created_at')) return [[{ created_epoch: now - 30000 }]];
  if (sql.includes("SET status='dispatching'")) { if (state !== 'processing') return [{ affectedRows: 0 }]; state = 'dispatching'; return [{ affectedRows: 1 }]; }
  if (sql.includes('SET status=?')) state = params[0];
  return [{ affectedRows: 1 }];
} };
const invoke = () => dispatchClaimedJob(db, row, { now, findLink: async () => ({ chatId: row.chat_id, username: row.telegram_username }), deliver: async () => { sends += 2; return { results: [{ ok: true }, { ok: false, uncertain: true }] }; } });
await Promise.all([invoke(), invoke()]);
assert.equal(state, 'partial');
assert.equal(sends, 2);
await invoke();
assert.equal(sends, 2);

// Exercise the real bootstrap wrapper, both raw and source-prepared. The
// prepared version selects the existing private-audio transport first.
const runtime = fs.readFileSync('server/telegram-fast-ack.mjs', 'utf8');
const wrapper = runtime.match(/async function sendInfobipPhone\(phone, message(?:, \{ locale \} = \{\})?\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(wrapper);
let fallbackCalls = 0, privateCalls = 0;
let privateResult = { ok: false, configured: true };
const selected = new Function('sendInfobipWakeupCall', 'infobipElevenLabsAudioEnabled', 'startInfobipElevenLabsCall', 'wakeupPrivateModelSupportsLocale', `return (${wrapper});`)(
  async () => { fallbackCalls++; return { ok: true }; },
  () => true,
  async () => { privateCalls++; return privateResult; },
  () => true,
);
const first = await selected('15555550101', 'Synthetic');
if (wrapper.includes('privateCall.configured')) {
  assert.equal(first.uncertain, true);
  assert.equal(privateCalls, 1);
  assert.equal(fallbackCalls, 0);
  privateResult = { ok: false, configured: false };
  await selected('15555550101', 'Synthetic');
  assert.equal(fallbackCalls, 1);
} else assert.equal(fallbackCalls, 1);
console.log('PASS wakeup one bounded attempt, provider receipt validation, partial/uncertain CAS and restart; external calls=0.');
