import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pharmacyPlaceResults } from '../server/concierge/place-results.mjs';
import { telegramPlaceReply, validatedPlaceRoute } from '../server/concierge/telegram-place-links.mjs';
import { conciergeHumanizeReplyV14408 } from '../server/v14408/concierge-human.mjs';
const places = Array.from({ length: 6 }, (_, i) => ({ name: `Drogaria 😀 ${i} é`, address: 'Rua 🏥 中文', location: { latitude: -23 + i, longitude: -46 } }));
for (const expanded of [false, true]) {
  const results = pharmacyPlaceResults(places, { expanded, reference: 'Hotel 🧑🏽‍✈️ é' });
  const payload = telegramPlaceReply(results, t => conciergeHumanizeReplyV14408(t, 'farmácias'));
  assert.equal(payload.entities.length, expanded ? 6 : 3);
  assert.doesNotMatch(payload.reply, /https:|CC_ROUTE_/);
  for (const e of payload.entities) {
    assert.equal(payload.reply.slice(e.offset, e.offset + e.length), 'Ver rota');
    assert.ok(validatedPlaceRoute(e.url));
  }
}
for (const url of ['javascript:alert(1)', 'https://evil.test/maps/dir/?api=1&destination=1,2', 'https://www.google.com/maps/dir/?api=1&destination=91,2', 'https://www.google.com/maps/dir/?api=1&destination=1,2&origin=3,4', 'https://www.google.com/maps/dir/?api=1&destination=1,2&key=x', 'https://www.google.com/maps/dir/?api=1&destination=1,2&account=x', 'https://www.google.com/maps/dir/?api=1&destination=1,2&utm_source=x', 'https://www.google.com/maps/dir/?api=1&destination=1,2#tracking']) assert.equal(validatedPlaceRoute(url), '');
const results = pharmacyPlaceResults(places, { expanded: true });
for (let prefix = 3800; prefix <= 3910; prefix++) {
  const payload = telegramPlaceReply(results, t => '😀'.repeat(prefix / 2) + t);
  assert.ok(payload.reply.length <= 3900);
  assert.doesNotMatch(payload.reply, /[\uD800-\uDBFF]$/);
  for (const e of payload.entities) assert.equal(payload.reply.slice(e.offset, e.offset + e.length), 'Ver rota');
}
const invalid = telegramPlaceReply({ ...results, places: [{ ...results.places[0], routeUrl: 'https://evil.test' }] });
assert.equal(invalid.entities.length, 0);
assert.doesNotMatch(invalid.reply, /Ver rota|evil/);
// Execute the actual sender with an in-memory transport, no tokens or recipients.
const source = fs.readFileSync('server.mjs', 'utf8');
const sender = source.slice(source.indexOf('async function sendTelegramMessage('), source.indexOf('// CrewCheck v13.7.16', source.indexOf('async function sendTelegramMessage(')));
let sent;
const context = vm.createContext({ telegramApiUrl: () => 'https://mock.invalid', fetch: async (_url, options) => { sent = JSON.parse(options.body); return { ok: true, status: 200, json: async () => ({ ok: true }) }; } });
vm.runInContext(sender, context);
const payload = telegramPlaceReply(results);
await context.sendTelegramMessage('mock-chat', payload, { reply_markup: { keyboard: [['Mock']] } });
assert.deepEqual(sent.entities, payload.entities);
assert.equal(sent.text, payload.reply);
assert.deepEqual(sent.reply_markup, { keyboard: [['Mock']] });
assert.equal(sent.parse_mode, undefined);
await context.sendTelegramMessage('mock-chat', 'Texto comum https://example.invalid');
assert.equal(sent.text, 'Texto comum https://example.invalid');
assert.equal(sent.entities, undefined);
assert.match(source, /if \(Array.isArray\(reply\?\.entities\)\)/);
console.log('PASS final Telegram transport: Unicode, 3/6, truncation, invalid destinations, keyboard and common/voice replies');
const voiceSource = source.slice(source.indexOf('async function handleTelegramVoiceMessage('), source.indexOf('function handleTelegramSttHealth('));
let answer = payload, audioCalls = 0, voiceSends = [];
const voiceContext = vm.createContext({
 telegramVoiceFileId: () => 'mock-file', crewcheckSttConfigured: () => true, telegramVoiceDuration: () => 1,
 showHumanRecordingAction: async () => {}, telegramGetFileInfo: async () => ({ ok: true, filePath: 'mock' }),
 telegramDownloadFile: async () => ({ ok: true, buffer: Buffer.alloc(0) }), telegramVoiceFileName: () => 'mock.ogg', telegramVoiceMime: () => 'audio/ogg',
 transcribeTelegramAudio: async () => ({ ok: true, text: 'farmácias' }), telegramProfileForChatAsync: async () => ({ chatId: 'mock-chat' }),
 conciergeLoadSnapshot: async () => ({}), buildTelegramConciergeReply: async () => answer,
 sendHumanTelegramVoiceReply: async () => { audioCalls++; return true; }, conciergeKeyboard: { keyboard: [['Mock']] },
 sendTelegramMessage: async (_id, text, extra) => voiceSends.push({ text, extra }),
});
vm.runInContext(voiceSource, voiceContext);
assert.equal(await voiceContext.handleTelegramVoiceMessage({ chat: { id: 'mock-chat' } }), true);
assert.equal(audioCalls, 0);
assert.equal(voiceSends[0].text, payload);
assert.deepEqual(voiceSends[0].extra.reply_markup.keyboard[0], ['Mock']);
answer = 'Resposta comum';
assert.equal(await voiceContext.handleTelegramVoiceMessage({ chat: { id: 'mock-chat' } }), true);
assert.equal(audioCalls, 1);
assert.equal(voiceSends.length, 1);
console.log('PASS actual voice handler preserves common audio and delivers clickable POI text');
