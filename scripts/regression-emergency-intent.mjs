import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import * as geographic from '../server/v14369/pending-geographic-intent.mjs';
// Entire transport and database are in memory. No application server or real credentials.
let owner = 'test@example.com', record = null, gps = {}, sends = [], messages = [], alerts = new Map(), outcomes = [], contactCount = 1, failPersistence = false, onDelivery = null;
const db = { async query(sql, args = []) {
  if (sql.startsWith('CREATE TABLE')) return [{}];
  if (sql.includes('SELECT state_key,payload')) return [[{ state_key: 'link-chat:10', payload: { email: owner } }]];
  if (sql.includes('SELECT payload FROM crewcheck_telegram_state')) return [[...(args[0].startsWith('emergency-intent:') && record ? [{ payload: record }] : [])]];
  if (sql.includes('INSERT IGNORE INTO crewcheck_telegram_state')) { if (record) return [{ affectedRows: 0 }]; record = JSON.parse(args[1]); return [{ affectedRows: 1 }]; }
  if (sql.includes('INSERT INTO crewcheck_telegram_state')) { record = JSON.parse(args[1]); return [{ affectedRows: 1 }]; }
  if (sql.includes('DELETE FROM crewcheck_telegram_state')) { const ok = record && JSON.stringify(record) === args[1]; if (ok) record = null; return [{ affectedRows: ok ? 1 : 0 }]; }
  if (sql.includes('SELECT * FROM crewcheck_platform_emergency_sessions')) return [[{ pending_kind: 'medical', pending_action: 'hospital', updated_at: new Date(), ...gps }]];
  if (sql.includes('INSERT INTO crewcheck_platform_emergency_sessions')) { gps = { latitude: args[3], longitude: args[4], location_label: args[5], location_source: args[6] }; return [{}]; }
  if (sql.includes('SELECT display_name,email,telegram_chat_id')) return [Array.from({ length: contactCount }, (_, i) => ({ display_name: i ? 'Second mock contact' : 'Mock contact', telegram_chat_id: String(999 + i) }))];
  if (sql.includes('INSERT INTO crewcheck_platform_emergency_alerts')) { if (failPersistence) throw new Error('Mock persistence failure after delivery'); alerts.set(args[0], { id: args[0], owner_email: owner, status: 'active', created_at: new Date().toISOString(), recipients: args[5] }); return [{}]; }
  if (sql.includes('UPDATE crewcheck_platform_emergency_alerts SET status=')) { const a = alerts.get(args[1]); const ok = a && a.owner_email === args[2] && a.status === 'active'; if (ok) a.status = args[0]; return [{ affectedRows: ok ? 1 : 0 }]; }
  if (sql.includes('SELECT id,created_at,recipients')) { const a = alerts.get(args[0]); return [[...(a && a.owner_email === args[1] && a.status === 'active' ? [a] : [])]]; }
  if (sql.includes('SELECT recipients FROM')) return [[alerts.get(args[0])]];
  return [[]];
} };
const cleanText = (v = '', max = 500) => String(v || '').trim().slice(0, max);
const common = { cleanText, dbPool: async () => db, env: (n, d = '') => n === 'CREWCHECK_DATA_ENCRYPTION_KEY' ? 'test-only-key' : d, flag: () => true, parseJsonColumn: (v, d) => v == null ? d : typeof v === 'string' ? JSON.parse(v) : v, readBody: async () => ({}), requireIdentity: async () => null, safeEmail: v => v, sendJson() {} };
const context = vm.createContext({ console, URL, Buffer, Date, Intl, fetch: async (url, opts) => { assert.match(url, /^https:\/\/api.telegram.org\/botMOCK\//); const payload = JSON.parse(opts.body); sends.push(payload); const delivery = payload.chat_id && payload.text?.includes('ALERTA CREWCHECK'); if (delivery && onDelivery) { const hook = onDelivery; onDelivery = null; await hook(); } const outcome = delivery ? outcomes.shift() : undefined; if (outcome === 'timeout') throw new Error('Mock timeout after possible delivery'); return { ok: !['reject', 'contradictory'].includes(outcome), json: async () => { if (outcome === 'malformed') throw new Error('Mock malformed response'); return { ok: outcome !== 'reject' }; } }; } });
const source = fs.readFileSync('server/v1391/emergency.mjs', 'utf8');
const mod = new vm.SourceTextModule(source, { context, identifier: new URL('../server/v1391/emergency.mjs', import.meta.url).href, initializeImportMeta(meta) { meta.url = new URL('../server/v1391/emergency.mjs', import.meta.url).href; } });
await mod.link(async name => { const values = name === 'node:crypto' ? { default: crypto } : name === 'node:fs' ? { readFileSync: fs.readFileSync } : name.includes('stay-menu') ? { stayMenuIntent: () => false } : name.includes('pending-geographic') ? geographic : name.includes('common') ? common : { telegramLink: async () => ({ chatId: '10' }), telegramToken: () => 'MOCK' }; const m = new vm.SyntheticModule(Object.keys(values), function () { for (const [k, v] of Object.entries(values)) this.setExport(k, v); }, { context }); return m; });
await mod.evaluate();
const handle = mod.namespace.handleEmergencyTelegram;
const send = async (chatId, text, extra) => messages.push({ chatId, text, extra });
const msg = text => ({ message: { text, from: { id: 10 }, chat: { id: 10, type: 'private' } } });
const cb = data => ({ callback_query: { data, from: { id: 10 }, message: { chat: { id: 10, type: 'private' } } } });
const location = live => ({ message: { from: { id: 10 }, chat: { id: 10, type: 'private' }, location: { latitude: -23, longitude: -46, ...(live ? { live_period: 900 } : {}) } } });
const button = prefix => messages.flatMap(m => m.extra?.reply_markup?.inline_keyboard?.flat() || []).findLast(b => b.callback_data?.startsWith(prefix)).callback_data;
const reset = () => { record = null; gps = {}; sends = []; messages = []; owner = 'test@example.com'; alerts = new Map(); outcomes = []; contactCount = 1; failPersistence = false; onDelivery = null; };
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
reset(); confirm = await draft('medical'); await handle(cb(confirm), send); assert.equal(sends.filter(s => s.chat_id === '999').length, 1); assert.equal(record.filters.stage, 'care'); await handle(location(false), send); assert.equal(record, null); assert.equal(await handle(location(false), send), false); assert.equal(sends.filter(s => s.chat_id === '999').length, 1);
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
console.log('PASS: scoped abort replay/new draft/after-send, confirmed retry after total rejection, partial/unknown delivery and persistence failures; all original SOS safety cases');
