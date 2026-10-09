import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import * as amilCoverage from '../shared/amil-coverage.mjs';
import * as geographic from '../server/v14369/pending-geographic-intent.mjs';
// Entire transport and database are in memory. No application server or real credentials.
let owner = 'test@example.com', record = null, gps = {}, sends = [], messages = [], alerts = new Map(), outcomes = [], contactCount = 1, failPersistence = false, onDelivery = null, databaseAvailable = true, queryFailure = false, ackFailure = false;
const db = { async query(sql, args = []) {
  if (sql.startsWith('CREATE TABLE')) return [{}];
  if (queryFailure) throw new Error('PRIVATE DATABASE DETAIL');
  if (sql.includes('SELECT state_key,payload')) return [[{ state_key: 'link-chat:10', payload: { email: owner } }]];
  if (sql.includes('SELECT payload FROM crewcheck_telegram_state')) return [[...(args[0].startsWith('emergency-intent:') && record ? [{ payload: record }] : [])]];
  if (sql.includes('UPDATE crewcheck_telegram_state SET payload=')) { const ok = record && JSON.stringify(record) === args[2]; if (ok) record = JSON.parse(args[0]); return [{ affectedRows: ok ? 1 : 0 }]; }
  if (sql.includes('INSERT IGNORE INTO crewcheck_telegram_state')) { if (record) return [{ affectedRows: 0 }]; record = JSON.parse(args[1]); return [{ affectedRows: 1 }]; }
  if (sql.includes('INSERT INTO crewcheck_telegram_state')) { record = JSON.parse(args[1]); return [{ affectedRows: 1 }]; }
  if (sql.includes('DELETE FROM crewcheck_telegram_state')) { const ok = record && JSON.stringify(record) === args[1]; if (ok) record = null; return [{ affectedRows: ok ? 1 : 0 }]; }
  if (sql.includes('SELECT * FROM crewcheck_platform_emergency_sessions')) return [[{ pending_kind: 'medical', pending_action: 'hospital', updated_at: new Date(), ...gps }]];
  if (sql.includes('INSERT INTO crewcheck_platform_emergency_sessions')) { gps = { latitude: args[3], longitude: args[4], location_label: args[5], location_source: args[6] }; return [{}]; }
  if (sql.includes('SELECT display_name,email,telegram_chat_id')) return [Array.from({ length: contactCount }, (_, i) => ({ display_name: i ? 'Second mock contact' : 'Mock contact', telegram_chat_id: String(999 + i) }))];
  if (sql.includes('INSERT INTO crewcheck_platform_emergency_alerts')) { if (failPersistence) throw new Error('Mock persistence failure after delivery'); alerts.set(args[0], { id: args[0], owner_email: owner, status: 'active', created_at: new Date().toISOString(), recipients: args[5] }); return [{}]; }
  if (sql.includes('UPDATE crewcheck_platform_emergency_alerts SET status=')) { const a = alerts.get(args[1]); const ok = a && a.owner_email === args[2] && a.status === 'active'; if (ok) a.status = args[0]; return [{ affectedRows: ok ? 1 : 0 }]; }
  if (sql.includes('SELECT id,emergency_kind,created_at,recipients')) return [[...alerts.values()].filter(a => a.owner_email === args[0] && a.status === 'active')];
  if (sql.includes('SELECT id,created_at,recipients')) { const a = alerts.get(args[0]); return [[...(a && a.owner_email === args[1] && a.status === 'active' ? [a] : [])]]; }
  if (sql.includes('SELECT recipients FROM')) return [[alerts.get(args[0])]];
  return [[]];
} };
const cleanText = (v = '', max = 500) => String(v || '').trim().slice(0, max);
const common = { cleanText, dbPool: async () => databaseAvailable ? db : null, env: (n, d = '') => n === 'CREWCHECK_DATA_ENCRYPTION_KEY' ? 'test-only-key' : d, flag: () => true, parseJsonColumn: (v, d) => v == null ? d : typeof v === 'string' ? JSON.parse(v) : v, readBody: async req => req.body || {}, requireIdentity: async (req, res) => { if (!req.identity) { res.status = 401; res.payload = { ok: false }; return null; } return { db, email: req.identity }; }, safeEmail: v => v, sendJson(res, status, payload) { res.status = status; res.payload = payload; } };
const context = vm.createContext({ console, URL, Buffer, Date, Intl, fetch: async (url, opts) => { assert.match(url, /^https:\/\/api.telegram.org\/botMOCK\//); const payload = JSON.parse(opts.body); sends.push(payload); if (ackFailure && payload.callback_query_id) throw new Error('Mock ACK unavailable'); const delivery = payload.chat_id && payload.text?.includes('ALERTA CREWCHECK'); if (delivery && onDelivery) { const hook = onDelivery; onDelivery = null; await hook(); } const outcome = delivery ? outcomes.shift() : undefined; if (outcome === 'timeout') throw new Error('Mock timeout after possible delivery'); return { ok: !['reject', 'contradictory'].includes(outcome), json: async () => { if (outcome === 'malformed') throw new Error('Mock malformed response'); return { ok: outcome !== 'reject' }; } }; } });
const source = fs.readFileSync('server/v1391/emergency.mjs', 'utf8');
const mod = new vm.SourceTextModule(source, { context, identifier: new URL('../server/v1391/emergency.mjs', import.meta.url).href, initializeImportMeta(meta) { meta.url = new URL('../server/v1391/emergency.mjs', import.meta.url).href; } });
await mod.link(async name => { const values = name === 'node:crypto' ? { default: crypto } : name === 'node:fs' ? { readFileSync: fs.readFileSync } : name.includes('stay-menu') ? { stayMenuIntent: () => false } : name.includes('amil-coverage') ? amilCoverage : name.includes('pending-geographic') ? geographic : name.includes('common') ? common : { telegramLink: async () => ({ chatId: '10' }), telegramToken: () => 'MOCK' }; const m = new vm.SyntheticModule(Object.keys(values), function () { for (const [k, v] of Object.entries(values)) this.setExport(k, v); }, { context }); return m; });
await mod.evaluate();
const handle = mod.namespace.handleEmergencyTelegram;
const send = async (chatId, text, extra) => messages.push({ chatId, text, extra });
const msg = text => ({ message: { text, from: { id: 10 }, chat: { id: 10, type: 'private' } } });
const cb = data => ({ callback_query: { data, from: { id: 10 }, message: { chat: { id: 10, type: 'private' } } } });
const location = live => ({ message: { from: { id: 10 }, chat: { id: 10, type: 'private' }, location: { latitude: -23, longitude: -46, ...(live ? { live_period: 900 } : {}) } } });
const button = prefix => messages.flatMap(m => m.extra?.reply_markup?.inline_keyboard?.flat() || []).findLast(b => b.callback_data?.startsWith(prefix)).callback_data;
const reset = () => { record = null; gps = {}; sends = []; messages = []; owner = 'test@example.com'; alerts = new Map(); outcomes = []; contactCount = 1; failPersistence = false; onDelivery = null; databaseAvailable = true; queryFailure = false; ackFailure = false; };
async function draft(kind = 'security') { await handle(msg('/emergencia'), send); await handle(cb(button(`cc_emergency:${kind}:`)), send); return button('cc_emergency_confirm:'); }
reset();
for (const live of [false, true]) { assert.equal(await handle(location(live), send), false); assert.equal(messages.length, 0); }
assert.equal(sends.length, 0);
let confirm = await draft(); const deadline = record.expiresAt;
await handle(location(false), send); assert.equal(record.expiresAt, deadline); assert.equal(sends.length, 0); assert.equal(messages.filter(m => m.extra?.reply_markup?.inline_keyboard?.flat().some(b => b.callback_data?.startsWith('cc_emergency_confirm'))).length, 1);
assert.equal(await handle(location(true), send), false);
record.expiresAt = new Date(Date.now() - 1).toISOString(); assert.equal(await handle(location(false), send), false); await handle(cb(confirm), send); assert.equal(sends.length, 0);
reset(); confirm = await draft(); owner = 'other@example.com'; await handle(cb(confirm), send); assert.equal(sends.length, 0);
reset(); alerts.set('old', { id: 'old', owner_email: owner, status: 'active', recipients: '[]' }); confirm = await draft(); await handle(cb(button('cc_emergency_abort:')), send); await handle(cb('cc_emergency:cancel'), send); await handle(cb(confirm), send); assert.equal(sends.length, 0); assert.equal(alerts.get('old').status, 'active');
reset(); confirm = await draft(); await Promise.all([handle(cb(confirm), send), handle(cb(confirm), send)]); assert.equal(sends.filter(s => s.chat_id === '999').length, 1); assert.equal(alerts.size, 1); await handle(cb(confirm), send); assert.equal(sends.filter(s => s.chat_id === '999').length, 1);
const [alertId] = alerts.keys(); alerts.set('older', { id: 'older', owner_email: owner, status: 'active', created_at: '2020-01-01', recipients: '[]' });
await handle(cb(`cc_emergency_close:${alertId}`), send); assert.match(messages.at(-1).text, /Data:.*\nDestinatários.*Mock contact/s); const finish = button('cc_emergency_finish:');
await Promise.all([handle(cb(finish), send), handle(cb(finish), send)]); assert.equal(alerts.get(alertId).status, 'cancelled'); assert.equal(alerts.get('older').status, 'active'); assert.equal(sends.filter(s => s.chat_id === '999').length, 2);
await handle(cb(`cc_emergency_close:${alertId}`), send); await handle(cb(finish), send); assert.equal(alerts.get('older').status, 'active');
reset(); confirm = await draft('medical'); await handle(cb(confirm), send); assert.equal(sends.filter(s => s.chat_id === '999').length, 1); assert.equal(record, null, 'medical confirmation consumes intent without creating a hospital/GPS stage'); assert.match(messages.at(-1).text, /Não há confirmação atual/); assert.match(messages.at(-1).text, /SAMU 192/); assert.doesNotMatch(messages.at(-1).text, /Compartilhe.*localização/); const afterMedical = { sends: sends.length, messages: messages.length }; assert.equal(await handle(location(false), send), false); assert.equal(record, null); assert.equal(await handle(location(false), send), false); assert.equal(sends.length, afterMedical.sends); assert.equal(messages.length, afterMedical.messages); assert.equal(sends.filter(s => s.chat_id === '999').length, 1);
reset(); confirm = await draft(); const malicious = cb(confirm); malicious.callback_query.from.id = 11; await handle(malicious, send); assert.equal(sends.length, 0);
// Old abort cannot discard a newer intent, including the original unscoped button.
reset(); confirm = await draft(); const oldAbort = button('cc_emergency_abort:');
const newerConfirm = await draft('fire'); const newerToken = record.filters.token;
await handle(cb(oldAbort), send); await handle(cb('cc_emergency_abort'), send);
assert.equal(record.filters.token, newerToken); await handle(cb(newerConfirm), send); assert.equal(alerts.size, 1);
const countAfterSend = messages.length; await handle(cb(button('cc_emergency_abort:')), send);
assert.equal(messages.length, countAfterSend); assert.equal(alerts.size, 1);
assert.ok(messages.every(m => !/Nenhum contato foi notificado/.test(m.text)));
// Valid abort only discards its own draft and leaves a previously sent alert active.
confirm = await draft(); const active = [...alerts.values()][0]; await handle(cb(button('cc_emergency_abort:')), send);
assert.equal(record, null); assert.equal(active.status, 'active'); assert.match(messages.at(-1).text, /Alertas já enviados permanecem inalterados/);
// All explicit rejections permit a NEW confirmation, never an automatic retry.
reset(); contactCount = 2; confirm = await draft(); outcomes = ['reject', 'reject'];
await handle(cb(confirm), send); assert.equal(alerts.size, 0); assert.equal(sends.length, 2);
const retryConfirm = button('cc_emergency_confirm:'); assert.notEqual(retryConfirm, confirm); assert.equal(record.filters.stage, 'draft');
await handle(cb(confirm), send); assert.equal(sends.length, 2);
await Promise.all([handle(cb(retryConfirm), send), handle(cb(retryConfirm), send)]);
assert.equal(sends.length, 4); assert.equal(alerts.size, 1);
// A delayed failure must not overwrite a newer draft created while sending.
reset(); confirm = await draft(); outcomes = ['reject']; let replacement;
onDelivery = async () => { await draft('fire'); replacement = record.filters.token; };
await handle(cb(confirm), send); assert.equal(record.filters.token, replacement);
// Partial delivery is persisted once and never offers a blanket retry.
for (const failure of ['reject', 'timeout']) {
  reset(); contactCount = 2; confirm = await draft(); outcomes = [undefined, failure];
  await handle(cb(confirm), send); assert.equal(alerts.size, 1); assert.match(messages.at(-1).text, /Entrega parcial/);
  assert.equal(record, null); assert.ok(!messages.at(-1).extra.reply_markup.inline_keyboard.flat().some(b => b.callback_data.startsWith('cc_emergency_confirm:')));
  await handle(cb(confirm), send); assert.equal(sends.length, 2);
}
// Unknown total delivery and persistence failure cannot generate retry buttons.
for (const failure of ['timeout', 'malformed', 'contradictory', 'persistence']) {
  reset(); confirm = await draft(); if (failure === 'persistence') failPersistence = true; else outcomes = [failure];
  await handle(cb(confirm), send); assert.equal(record, null); assert.match(messages.at(-1).text, /A entrega pode ter ocorrido/);
  assert.ok(!messages.at(-1).extra.reply_markup.inline_keyboard.flat().some(b => b.callback_data.startsWith('cc_emergency_confirm:')));
  await handle(cb(confirm), send); assert.equal(sends.length, 1);
}
// Review follow-up: callbacks acknowledge every path; repeated/concurrent starts reuse one token.
const closure = (data, id = crypto.randomUUID()) => {
  const update = cb(data); update.callback_query.id = id; return update;
};
const acked = id => sends.filter(payload => payload.callback_query_id === id).length;
reset(); confirm = await draft(); await handle(cb(confirm), send);
const [specificId] = alerts.keys();
const starts = ['cc_emergency_ok:', 'cc_emergency_close:'];
for (const prefix of starts) {
  const tap = closure(prefix + specificId);
  await handle(tap, send); assert.equal(acked(tap.callback_query.id), 1);
  const initial = JSON.stringify(record), originalFinish = button('cc_emergency_finish:');
  const repeats = [closure(prefix + specificId), closure(prefix + specificId)];
  await Promise.all(repeats.map(update => handle(update, send)));
  assert.equal(JSON.stringify(record), initial, 'retry preserves token and TTL');
  assert.equal(button('cc_emergency_finish:'), originalFinish);
  for (const update of repeats) assert.equal(acked(update.callback_query.id), 1);
  assert.equal(alerts.get(specificId).status, 'active', 'starting closure does not notify');
}
const finishTap = closure(button('cc_emergency_finish:'));
const finishDuplicate = closure(finishTap.callback_query.data);
await Promise.all([handle(finishTap, send), handle(finishDuplicate, send)]);
assert.equal(acked(finishTap.callback_query.id), 1); assert.equal(acked(finishDuplicate.callback_query.id), 1);
assert.equal(sends.filter(payload => payload.chat_id === '999').length, 2, 'one SOS plus one closure notification');
for (const data of [starts[0] + specificId, starts[1] + specificId, finishTap.callback_query.data, 'cc_emergency_finish:missing']) {
  const tap = closure(data); await handle(tap, send); assert.equal(acked(tap.callback_query.id), 1);
}
assert.equal(sends.filter(payload => payload.chat_id === '999').length, 2);
// Both concurrent starts from no intent keep the winner's usable token.
reset(); confirm = await draft(); await handle(cb(confirm), send);
const [concurrentId] = alerts.keys();
await Promise.all([handle(closure(starts[1] + concurrentId), send), handle(closure(starts[1] + concurrentId), send)]);
const confirmations = messages.flatMap(message => message.extra?.reply_markup?.inline_keyboard?.flat() || []).filter(b => b.callback_data?.startsWith('cc_emergency_finish:'));
assert.equal(new Set(confirmations.map(b => b.callback_data)).size, 1);
const expiredFinish = button('cc_emergency_finish:'); record.expiresAt = new Date(Date.now() - 1000).toISOString();
const expiredTap = closure(expiredFinish); await handle(expiredTap, send); assert.equal(acked(expiredTap.callback_query.id), 1); assert.equal(alerts.get(concurrentId).status, 'active');
await handle(closure(starts[1] + concurrentId), send); assert.notEqual(button('cc_emergency_finish:'), expiredFinish);
const scopedFinish = button('cc_emergency_finish:'); owner = 'other@example.com';
for (const data of [starts[0] + concurrentId, starts[1] + concurrentId, scopedFinish]) {
  const tap = closure(data); await handle(tap, send); assert.equal(acked(tap.callback_query.id), 1);
}
assert.equal(alerts.get(concurrentId).status, 'active');
assert.ok(!messages.slice(-3).some(message => message.text.includes('Mock contact')), 'other account gets no metadata');
for (const failure of ['db-unavailable', 'db-query', 'unlinked', 'wrong-actor', 'ack', 'chat-send']) {
  reset(); const tap = closure('cc_emergency_close:missing');
  if (failure === 'db-unavailable') databaseAvailable = false;
  if (failure === 'db-query') queryFailure = true;
  if (failure === 'unlinked') owner = '';
  if (failure === 'wrong-actor') tap.callback_query.from.id = 11;
  if (failure === 'ack') ackFailure = true;
  const transport = failure === 'chat-send' ? async () => { throw new Error('Mock chat send failure'); } : send;
  await handle(tap, transport).catch(() => {});
  assert.equal(acked(tap.callback_query.id), 1, failure + ': ACK attempted before failure/return');
  assert.equal(alerts.size, 0);
}
// Authenticated active context: no implicit newest selection or private payload leakage.
const route = async (identity, path = 'active', body, method = body ? 'POST' : 'GET') => {
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
  await mod.namespace.handleEmergencyRoute({ method, identity, body }, response, new URL(`https://fixture.invalid/api/platform/emergency/${path}`));
  return response;
};
reset();
const privateRecipient = { name: 'Fixture recipient', source: 'saved-contact', ok: true, chatIdHash: 'PRIVATE-HASH', chatIdCipher: 'PRIVATE-CIPHER', email: 'private@fixture.invalid', room: 'PRIVATE-ROOM' };
for (const [id, account, status] of [['one', owner, 'active'], ['two', owner, 'active'], ['foreign', 'other@example.com', 'active'], ['closed', owner, 'cancelled']]) {
  alerts.set(id, { id, owner_email: account, status, emergency_kind: 'medical', created_at: '2026-10-07T00:00:00Z', recipients: JSON.stringify([privateRecipient]), message: 'PRIVATE-MEDICAL', location_url: 'PRIVATE-GPS' });
}
let response = await route(owner);
assert.equal(response.status, 200); assert.equal(response.headers['Cache-Control'], 'no-store');
assert.deepEqual(Array.from(response.payload.alerts, alert => alert.alertId), ['one', 'two']);
assert.equal(response.payload.alerts[0].recipients[0].name, privateRecipient.name);
assert.doesNotMatch(JSON.stringify(response.payload), /PRIVATE|owner_email|chatId|email|location|message/);
response = await route('other@example.com'); assert.deepEqual(Array.from(response.payload.alerts, alert => alert.alertId), ['foreign']);
response = await route('empty@example.com'); assert.equal(response.payload.alerts.length, 0);
response = await route(null); assert.equal(response.status, 401); assert.ok(!response.payload.alerts);
for (const body of [{ confirmed: true }, { alertId: 'two' }, { alertId: 'foreign', confirmed: true }, { alertId: 'closed', confirmed: true }]) {
  response = await route(owner, 'cancel', body); assert.equal(response.payload.cancelled, false);
}
assert.equal(alerts.get('two').status, 'active');
response = await route(owner, 'cancel', { alertId: 'one', confirmed: true }); assert.equal(response.payload.cancelled, true);
response = await route(owner, 'cancel', { alertId: 'one', confirmed: true }); assert.equal(response.payload.cancelled, false);
response = await route(owner); assert.deepEqual(Array.from(response.payload.alerts, alert => alert.alertId), ['two']);
queryFailure = true; response = await route(owner); assert.equal(response.status, 503); assert.doesNotMatch(JSON.stringify(response.payload), /PRIVATE/);
console.log('PASS: original SOS safety and delivery recovery; closure ACK on every path; stable concurrent retry tokens and TTL; single exact closure; authenticated active context/privacy/failures');
