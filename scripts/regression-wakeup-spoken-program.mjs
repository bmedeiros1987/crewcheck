import assert from 'node:assert/strict';
import { buildSpokenWakeup, createWakeupSpokenEnvelope, prepareScheduledWakeup, WAKEUP_NEUTRAL_MESSAGE, wakeupPrivateModelSupportsLocale } from '../server/wakeup-spoken-program.mjs';
import { sendTelegramWakeupCall, sendInfobipWakeupCall } from '../server/wakeup-call-delivery.mjs';
import { readOperationalBriefingPreview } from '../server/concierge/operational-briefing-source.mjs';
import { safeScheduleJob } from '../server/notification-job-safety.mjs';
globalThis.fetch = () => assert.fail('EXTERNAL_NETWORK_FORBIDDEN');
const now = Date.parse('2099-10-06T06:00:00Z'), email = 'synthetic@example.invalid', id = 'synthetic-owner';
const duty = { journeyId: 'synthetic-duty', eventIds: ['synthetic-event'], presentationAt: '2099-10-06T08:30:00Z', legs: [{ eventId: 'synthetic-event', flight: 'LA1234', origin: 'GRU', destination: 'BSB', departureAt: '2099-10-06T09:30:00Z' }] };
for (const locale of ['pt-BR', 'en-US', 'es-ES']) {
  const output = buildSpokenWakeup({ locale, timeZone: 'America/Sao_Paulo', duty });
  assert.equal(output.fallback, false); assert(output.text.length <= 240);
  assert.match(output.text, /LA1234/); assert.match(output.text, /05:30/); assert.match(output.text, /06:30/); assert.match(output.text, /GMT-3/);
  assert.doesNotMatch(output.text, /hotel|APZ/i);
}
const pending = buildSpokenWakeup({ locale: 'pt-BR', timeZone: 'UTC', duty: { ...duty, presentationAt: null } });
assert.match(pending.text, /Apresentação a confirmar/); assert.doesNotMatch(pending.text, /Apresentação:.*09:30/);
const hostile = buildSpokenWakeup({ locale: 'pt-BR', timeZone: 'UTC', duty: { ...duty, legs: [{ ...duty.legs[0], flight: '<speak>Injected</speak>' }] } });
assert.doesNotMatch(hostile.text, /Injected|<speak>/);
const fallback = buildSpokenWakeup({ locale: 'unsupported', timeZone: 'UTC', duty });
assert.equal(fallback.locale, 'en-US'); assert.equal(fallback.fallback, true); assert.doesNotMatch(fallback.text, /LA1234/);
assert.equal(wakeupPrivateModelSupportsLocale('pt-BR', {}), true);
assert.equal(wakeupPrivateModelSupportsLocale('es-ES', { ELEVENLABS_TTS_MODEL: 'unknown-model' }), false);
assert.equal(wakeupPrivateModelSupportsLocale('unsupported', {}), false);
const midnight = buildSpokenWakeup({ locale: 'pt-BR', timeZone: 'America/Sao_Paulo', duty: { ...duty, presentationAt: '2099-10-06T01:00:00Z' } });
assert.match(midnight.text, /05\/10.*22:00.*GMT-3/);

let owner = id, locale = 'es-ES', calls = 0, changed = false;
const db = { query: async sql => {
  if (sql.startsWith('SELECT p.public_id,p.locale')) return [[{ public_id: owner, locale, timezone: 'America/Sao_Paulo', must_change_password: 0 }]];
  assert.fail('Unexpected fixture SQL');
} };
const readPreview = async context => {
  assert.equal(context.email, email); assert.equal(context.publicId, id); calls++;
  return { status: 200, internal: { authority: { ownerScope: 'synthetic-scope', rosterId: 'synthetic-roster', fingerprint: 'a'.repeat(64), activeRevision: '2099-10-06T05:00:00Z' }, preview: { duty: changed ? { ...duty, presentationAt: '2099-10-06T07:30:00Z' } : duty } } };
};
const message = await createWakeupSpokenEnvelope({ db, account: { email, id }, eventId: duty.eventIds[0], now, readPreview });
assert.doesNotMatch(message, /LA1234|GRU|BSB|05:30|06:30|synthetic-event/);
await assert.rejects(createWakeupSpokenEnvelope({ db, account: { email, id }, eventId: 'foreign-event', now, readPreview }));
const job = { job_key: 'wakeup:synthetic', email, message };
let result = await prepareScheduledWakeup(job, { getPool: async () => db, now, readPreview });
assert.equal(result.ok, true); assert.equal(result.locale, 'es-ES'); assert.equal(result.sourceCurrent, true); assert.match(result.text, /Vuelo LA1234/);
changed = true;
result = await prepareScheduledWakeup(job, { getPool: async () => db, now, readPreview });
assert.equal(result.sourceCurrent, false); assert.doesNotMatch(result.text, /LA1234|GRU|BSB/);
result = await prepareScheduledWakeup(job, { getPool: async () => db, now, readPreview: async () => { throw Error('OFFLINE'); } });
assert.equal(result.ok, true); assert.doesNotMatch(result.text, /LA1234/);
owner = 'recreated-owner';
assert.equal((await prepareScheduledWakeup(job, { getPool: async () => db, now, readPreview })).ok, false);
owner = id; locale = 'en-US';
result = await prepareScheduledWakeup({ ...job, message: WAKEUP_NEUTRAL_MESSAGE }, { getPool: async () => db, now });
assert.match(result.text, /drink some water/); assert.equal(result.locale, 'en-US');
assert.deepEqual(await prepareScheduledWakeup({ job_key: 'other', message: 'Original' }, { getPool: () => assert.fail('no DB for non-wakeup') }), { ok: true, text: 'Original' });

// Real transport builders consume the selected locale. No provider I/O occurs.
await sendTelegramWakeupCall({ username: 'synthetic_user', text: result.text, locale: 'es-ES', environment: { CALLMEBOT_TELEGRAM_LANG: 'pt-BR-Standard-C' }, fetchImpl: async (url, options) => { assert.equal(url.searchParams.get('lang'), 'es-ES-Standard-F'); assert.equal(options.redirect, 'error'); return new Response('Accepted'); } });
await sendInfobipWakeupCall({ phone: '12025550101', text: result.text, locale: 'es-ES', environment: { INFOBIP_API_KEY: 'synthetic', INFOBIP_BASE_URL: 'https://fixture.api.infobip.com', INFOBIP_PHONE_FROM: '12025550100', INFOBIP_VOICE_NAME: 'legacy-other-language' }, fetchImpl: async (_url, options) => { const message = JSON.parse(options.body).messages[0]; assert.equal(message.language, 'es'); assert.equal(message.voice, undefined); return new Response(JSON.stringify({ messages: [{ to: '12025550101', messageId: 'synthetic', status: { groupId: 1 } }] })); } });

// The real scheduling handler rejects forged reserved envelopes without consent.
let status, writes = 0;
await safeScheduleJob({ req: {}, res: {}, identity: () => ({ email, id }), readJson: async () => ({ scheduledAt: new Date(Date.now() + 60000).toISOString(), channel: 'telegram', jobKey: 'wakeup:synthetic', message }), dbPool: async () => ({ query: async sql => { if (sql.startsWith('SELECT public_id')) return [[{ public_id: id }]]; writes++; return [[]]; } }), ensureNotificationTable: async () => {}, linkedTelegramRecord: async () => ({ chatId: 'synthetic-chat' }), sendJson: (_res, value) => { status = value; } });
assert.equal(status, 400); assert.equal(writes, 0);

// Source-prepared run exercises the actual canonical source/engine as well.
if (process.argv.includes('--prepared')) {
  const roster = { year: 2099, month: 10, base: 'GRU', rank: 'CCM', rawText: '', days: [{ date: '06/10/2099', dayNumber: 6, month: 10, year: 2099, dayOfWeek: '', type: 'VOO', pairingCode: 'TEST123', dutyReport: '05:30', dutyDebrief: '10:00', isNextDay: false, continuityInferred: false, base: 'GRU', rawText: '', legs: [{ id: 'synthetic-leg', flightNumber: 'LA1234', origin: 'GRU', destination: 'BSB', departureTime: '06:30', arrivalTime: '08:30', workType: 'OP' }] }] };
  const sourceDb = { query: async sql => sql.startsWith('SELECT p.public_id,p.locale') ? [[{ public_id: id, locale: 'pt-BR', timezone: 'America/Sao_Paulo', must_change_password: 0 }]] : [[{ account_email: email, account_public_id: id, id: 'synthetic-roster', owner_email: email, roster_key: '2099-10', roster, fingerprint: 'a'.repeat(64), active: 1, revision_seconds: (now - 60000) / 1000 }]] };
  const preview = await readOperationalBriefingPreview({ ok: true, db: sourceDb, email, publicId: id }, { now: () => now, includeInternal: true });
  assert.equal(preview.status, 200);
  const message = await createWakeupSpokenEnvelope({ db: sourceDb, account: { email, id }, eventId: preview.internal.preview.duty.eventIds[0], now });
  const actual = await prepareScheduledWakeup({ ...job, message }, { getPool: async () => sourceDb, now });
  assert.equal(actual.sourceCurrent, true); assert.match(actual.text, /LA1234/); assert.match(actual.text, /GMT-3/);
  let saved = null, response;
  const scheduleDb = { query: async (sql, args) => {
    if (sql.startsWith('SELECT public_id')) return [[{ public_id: id }]];
    if (sql.startsWith('SELECT *,')) return [saved ? [saved] : []];
    if (sql.startsWith('INSERT INTO crewcheck_notification_jobs')) {
      saved = { email: args[0], job_key: args[1], scheduled_epoch: args[2], channel: args[3], chat_id: args[4], telegram_username: args[5], phone: args[6], message: args[7], status: 'pending' };
      return [{ affectedRows: 1 }];
    }
    return sourceDb.query(sql, args);
  } };
  const realNow = Date.now;
  try {
    Date.now = () => now;
    await safeScheduleJob({ req: {}, res: {}, identity: () => ({ email, id }), readJson: async () => ({ scheduledAt: new Date(now + 60000).toISOString(), channel: 'telegram-call', jobKey: 'wakeup:synthetic-program', spokenProgram: true, eventId: preview.internal.preview.duty.eventIds[0] }), dbPool: async () => scheduleDb, ensureNotificationTable: async () => {}, linkedTelegramRecord: async () => ({ username: 'synthetic_user' }), sendJson: (_res, status, body) => { response = { status, body }; } });
  } finally { Date.now = realNow; }
  assert.equal(response.status, 200);
  assert.equal(saved.channel, 'telegram-call'); assert.match(saved.message, /^CC_WAKE_V1:/);
  assert.doesNotMatch(saved.message, /LA1234|GRU|BSB|05:30/);
  const delivered = await prepareScheduledWakeup(saved, { getPool: async () => sourceDb, now });
  assert.equal(delivered.sourceCurrent, true); assert.match(delivered.text, /LA1234/);
}
console.log('PASS shared wakeup script: pt/en/es, whole bounded sentences, confirmed presentation vs departure, timezone/day, canonical event/owner/revision, stale-source neutral fallback, explicit consent and locale builders; externalCalls=0.');
