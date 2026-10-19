import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTelegramMenu, menuGreeting, menuTemplate } from '../server/concierge/telegram-menu.mjs';

let clock = 1_000_000;
let account = 'demo@example.test';
let linked = true;
let profileReads = 0;
const sent = [], calls = [], answers = [];
let menu;
const deps = {
  profile: async message => { profileReads++; return { channel: 'telegram', chatType: message.chat.type, chatId: String(message.chat.id), linked, email: account, accessKeyHash: 'synthetic-binding' }; },
  snapshot: async profile => ({ owner: profile.email, roster: { days: [] } }),
  reply: async (command, profile, snapshot) => { assert.equal(snapshot.owner, profile.email); calls.push({ command, owner: profile.email }); return 'Resposta sintética'; },
  answer: async (id, text) => answers.push({ id, text }),
  send: async (chat, text, extra) => sent.push({ chat, text, extra: await menu.markup(chat, extra) }),
};
menu = createTelegramMenu(deps, () => clock);
const message = text => ({ chat: { id: 101, type: 'private' }, from: { id: 101 }, text });
const query = (data, overrides = {}) => ({ callback_query: { id: 'synthetic-callback', data, message: message(), from: { id: 101 }, ...overrides } });
const dataFor = (output, label) => output.extra.reply_markup.inline_keyboard.flat().find(button => button.text === label).callback_data;
async function home() { await deps.send(101, menuGreeting('Demo'), { reply_markup: menuTemplate() }); return sent.at(-1); }

assert(!menuGreeting('266640').includes('266640'));
assert(menuGreeting('Bruno').startsWith('Olá, Bruno!'));
assert(!menuGreeting().includes('/'));
let output = await home();
assert.deepEqual(output.extra.reply_markup.inline_keyboard.flat().map(button => button.text), ['Hoje', 'Escala', 'Diárias', 'Hotéis', 'Mais']);
for (const button of output.extra.reply_markup.inline_keyboard.flat()) {
  assert(Buffer.byteLength(button.callback_data) <= 64);
  assert(!button.callback_data.includes(account));
}
const today = dataFor(output, 'Hoje');
const beforeReads = profileReads;
await Promise.all([menu.callback(query(today)), menu.callback(query(today))]);
assert.equal(calls.length, 1, 'concurrent replay dispatches once');
assert.equal(calls[0].command, '/hoje');
assert(profileReads >= beforeReads + 2, 'every callback revalidates');
await menu.callback(query(today));
assert.equal(calls.length, 1);
output = await home();
await menu.callback(query(dataFor(output, 'Escala'), { from: { id: 202 } }));
assert.equal(calls.length, 1, 'different sender cannot use private menu');
await menu.callback(query(dataFor(output, 'Escala'), { message: { chat: { id: -123, type: 'group' } } }));
assert.equal(calls.length, 1, 'group denied');
account = 'other@example.test';
await menu.callback(query(dataFor(output, 'Escala')));
assert.equal(calls.length, 1, 'relinked account cannot use former account menu');
account = 'demo@example.test';
output = await home(); clock += 16 * 60_000;
await menu.callback(query(dataFor(output, 'Escala')));
assert.equal(calls.length, 1, 'old ticket rejected');
output = await home(); linked = false;
await menu.callback(query(dataFor(output, 'Hoje')));
assert.equal(calls.length, 1, 'revoked account rejected'); linked = true;
output = await home();
await menu.callback(query(dataFor(output, 'Diárias')));
assert(sent.at(-1).text.includes('ainda não oferece essa consulta financeira'));
output = await home();
await menu.callback(query(dataFor(output, 'Mais')));
await menu.callback(query(dataFor(sent.at(-1), 'Revisar escala')));
assert(sent.at(-1).text.includes('incompleta'));
assert(!sent.at(-1).text.includes('12 h'));
output = await home();
await menu.callback(query(dataFor(output, 'Mais')));
await menu.callback(query(dataFor(sent.at(-1), 'Radar')));
assert(await menu.text(message('not a flight')));
assert.equal(calls.length, 1);
await Promise.all([menu.text(message('LA1234')), menu.text(message('LA1234'))]);
assert.equal(calls.length, 2, 'concurrent parameter messages dispatch once');
assert.equal(calls.at(-1).command, '/radar LA1234');
output = await home();
await menu.callback(query(dataFor(output, 'Mais')));
await menu.callback(query(dataFor(sent.at(-1), 'Meteorologia')));
await menu.callback(query(dataFor(sent.at(-1), 'METAR')));
await menu.callback(query(dataFor(sent.at(-1), 'Cancelar')));
assert.equal(await menu.text(message('SBGR')), false, 'cancel clears flow');
assert.equal(await menu.callback(query('cc_nav:settings')), true, 'old callbacks refresh safely');
assert.equal(await menu.callback(query('cc_weather:metar:SBGR:raw')), false, 'other handlers retain ownership');
assert.equal(await menu.callback(query('cc_nav:v1:invented:ligacao')), true);
assert.equal(calls.length, 2);
assert(answers.length > 0);

// Inspect the prepared production integration without importing the live server.
const source = fs.readFileSync('server.mjs', 'utf8');
assert(source.includes('extra = await crewcheckMenu.markup(chatId, extra);'));
assert(source.includes('if (await crewcheckMenu.callback(update)) return true;'));
assert(source.includes('if (await crewcheckMenu.text(update.message || {})) return true;'));
assert(source.includes('const conciergeKeyboard = menuTemplate();'));
assert(!source.match(/function conciergeHelp[\s\S]*?\n}/)[0].includes('/ligacao'));
console.log('PASS Telegram menu: synthetic callbacks, per-callback identity, replay, relink, TTL, cancel, direct producers; zero network.');
