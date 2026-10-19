import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTelegramMenu, menuGreeting, menuTemplate, missingFinanceReply, missingComplianceReply, financeUrl } from '../server/concierge/telegram-menu.mjs';
import vm from 'node:vm';
import { prepareConciergeCanonicalBridge } from './p1-concierge-journey/bridge.mjs';
prepareConciergeCanonicalBridge();
const { buildDutyFacts } = await import('../server/concierge/duty-facts.mjs');

let clock = 1_000_000;
let account = 'demo@example.test';
let linked = true;
let profileReads = 0;
const sent = [], calls = [], answers = [], voices = [], emergencies = [];
let menu;
let outgoingId = 100;
const deps = {
  profile: async message => { profileReads++; return { channel: 'telegram', chatType: message.chat.type, chatId: String(message.chat.id), linked, email: account, accessKeyHash: 'synthetic-binding' }; },
  snapshot: async profile => ({ owner: profile.email, roster: { days: [] } }),
  reply: async (command, profile, snapshot) => { assert.equal(snapshot.owner, profile.email); calls.push({ command, owner: profile.email }); return 'Resposta sintética'; },
  answer: async (id, text) => answers.push({ id, text }),
  weatherKeyboard: (station, type) => ({ inline_keyboard: [[{ text: 'Bruto', callback_data: `cc_weather:${type}:${station}:raw` }, { text: 'Decodificado', callback_data: `cc_weather:${type}:${station}:decoded` }], [{ text: 'ATIS', callback_data: `cc_weather:atis:${station}:both` }]] }),
  voice: async (chat, reply, text, snapshot) => voices.push({ chat, reply, text, owner: snapshot.owner }),
  settingsKeyboard: { keyboard: [[{ text: 'Como me chamar' }, { text: 'Voltar ao menu' }]] },
  emergency: async query => emergencies.push(query),
  send: async (chat, text, extra) => { sent.push({ chat, text, extra: await menu.markup(chat, extra) }); return { ok: true, data: { result: { message_id: ++outgoingId, date: Math.floor(clock / 1000) } } }; },
};
menu = createTelegramMenu(deps, () => clock);
const message = text => ({ chat: { id: 101, type: 'private' }, from: { id: 101 }, message_id: outgoingId + 1, date: Math.floor(clock / 1000), text });
const query = (data, overrides = {}) => ({ callback_query: { id: 'synthetic-callback', data, message: message(), from: { id: 101 }, ...overrides } });
const dataFor = (output, label) => output.extra.reply_markup.inline_keyboard.flat().find(button => button.text === label).callback_data;
async function home() { await deps.send(101, menuGreeting('Demo'), { reply_markup: menuTemplate() }); return sent.at(-1); }

assert(!menuGreeting('266640').includes('266640'));
assert(menuGreeting('Bruno').startsWith('Olá, Bruno!'));
assert(!menuGreeting().includes('/'));
let output = await home();
assert(sent.some(item => item.extra.reply_markup.remove_keyboard === true), 'first inline menu explicitly removes persistent reply keyboard');
const removals = sent.filter(item => item.extra.reply_markup.remove_keyboard === true).length;
await home();
assert.equal(sent.filter(item => item.extra.reply_markup.remove_keyboard === true).length, removals, 'migration is not repeated for each menu');
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
assert.equal(sent.at(-1).text, missingFinanceReply());
assert.equal(sent.at(-1).extra.reply_markup.inline_keyboard[0][0].url, financeUrl);
output = await home();
await menu.callback(query(dataFor(output, 'Mais')));
await menu.callback(query(dataFor(sent.at(-1), 'Revisar escala')));
assert.equal(sent.at(-1).text, missingComplianceReply());
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
assert.equal(await menu.callback(query('cc_nav:settings')), true, 'old callbacks fail clearly');
assert.equal(await menu.callback(query('cc_weather:metar:SBGR:raw')), false, 'other handlers retain ownership');
assert.equal(await menu.callback(query('cc_nav:v1:invented:ligacao')), true);
assert.equal(calls.length, 2);
assert(answers.length > 0);

// A replay must not interrupt the newer pending Radar question.
output = await home();
const staleMore = dataFor(output, 'Mais');
await menu.callback(query(staleMore));
await menu.callback(query(dataFor(sent.at(-1), 'Radar')));
await menu.callback(query(staleMore));
assert.equal(await menu.text(message('LA1234')), true, 'stale callback preserves pending input');
assert.equal(calls.length, 3);
output = await home();
await menu.callback(query(dataFor(output, 'Mais')));
await menu.callback(query(dataFor(sent.at(-1), 'Radar')));
await menu.callback(query('cc_nav:menu', { from: { id: 202 } }));
assert.equal(await menu.text(message('LA1234')), true, 'another sender cannot clear the current flow');
assert.equal(calls.length, 4);
output = await home();
await menu.callback(query(dataFor(output, 'Mais')));
await menu.callback(query(dataFor(sent.at(-1), 'Radar')));
await menu.callback(query(dataFor(sent.at(-1), 'Cancelar')));
assert.equal(await menu.text(message('LA1234')), false, 'cancel/new root does not consume old input');
output = await home();
await menu.callback(query(dataFor(output, 'Mais')));
await menu.callback(query(dataFor(sent.at(-1), 'Radar')));
clock += 16 * 60_000;
await menu.callback(query('cc_nav:menu'));
assert.equal(await menu.text(message('LA1234')), false, 'expired flow stays cleared on legacy menu refresh');
for (const [label, command] of [['METAR', 'metar'], ['TAF', 'taf'], ['ATIS', 'atis']]) {
  output = await home();
  await menu.callback(query(dataFor(output, 'Mais')));
  await menu.callback(query(dataFor(sent.at(-1), 'Meteorologia')));
  await menu.callback(query(dataFor(sent.at(-1), label)));
  await menu.text(message('SBGR'));
  assert.equal(calls.at(-1).command, `/${command} SBGR`);
  if (command !== 'atis') assert.deepEqual(sent.at(-1).extra.reply_markup, deps.weatherKeyboard('SBGR', command), 'weather follow-up controls match existing keyboard producer');
}
assert.equal(voices.length, 1, 'only ATIS dispatches the existing voice effect');
assert.equal(voices[0].owner, account);
assert.equal(voices[0].reply, 'Resposta sintética');
async function askRadar() {
  const root = await home();
  await menu.callback(query(dataFor(root, 'Mais')));
  await menu.callback(query(dataFor(sent.at(-1), 'Radar')));
}
for (const priority of ['🚨 Emergência', 'SOS', 'Ajuda', 'Voltar', 'Início', 'Configurações', '/emergencia', '/hoje']) {
  await askRadar();
  assert.equal(await menu.text(message(priority)), false, `${priority} reaches its existing handler`);
  assert.equal(await menu.text(message('LA1234')), false, `${priority} clears the pending question`);
}
await askRadar();
assert.equal(await menu.interrupt(message('🚨 Emergência')), true, 'webhook early auxiliary route releases the same owner flow');
assert.equal(await menu.text(message('LA1234')), false);
await askRadar();
const callCount = calls.length;
assert.equal(await menu.text({ ...message('LA1234'), from: { id: 202 } }), false);
assert.equal(await menu.text({ ...message('LA1234'), chat: { id: 101, type: 'group' } }), false);
assert.equal(await menu.text({ ...message('LA1234'), message_id: outgoingId - 1 }), true);
assert.equal(await menu.text({ ...message('LA1234'), date: Math.floor(clock / 1000) - 1 }), true);
assert.equal(await menu.text({ ...message('LA1234'), reply_to_message: { message_id: outgoingId - 1 } }), true);
assert.equal(await menu.text({ ...message('LA1234'), message_id: undefined, date: undefined }), true);
assert.equal(calls.length, callCount, 'old/reordered/uncorrelated input cannot call producer');
assert.equal(await menu.text(message('LA1234')), true);
assert.equal(calls.length, callCount + 1, 'new input after actual prompt can call producer once');
await askRadar();
const firstPrompt = outgoingId;
await menu.text(message('não é um voo'));
const currentPrompt = outgoingId;
assert(currentPrompt > firstPrompt);
const beforeReprompt = calls.length;
await menu.text({ ...message('LA1234'), reply_to_message: { message_id: firstPrompt } });
assert.equal(calls.length, beforeReprompt, 'answer to superseded question is rejected');
await menu.text({ ...message('LA1234'), reply_to_message: { message_id: currentPrompt } });
assert.equal(calls.length, beforeReprompt + 1, 'reply to the actually delivered replacement question works');
output = await home();
await menu.callback(query(dataFor(output, 'Mais')));
const emergencyQuery = query(dataFor(sent.at(-1), 'Emergência'));
await menu.callback(emergencyQuery);
assert.equal(emergencies.at(-1), emergencyQuery.callback_query, 'explicit emergency entry preserves original callback object');
output = await home();
await menu.callback(query(dataFor(output, 'Mais')));
await menu.callback(query(dataFor(sent.at(-1), 'Configurações')));
assert.deepEqual(sent.at(-1).extra.reply_markup, deps.settingsKeyboard);
const beforeRestore = sent.filter(item => item.extra.reply_markup.remove_keyboard).length;
await home();
assert.equal(sent.filter(item => item.extra.reply_markup.remove_keyboard).length, beforeRestore + 1, 'return from legacy settings keyboard removes it before inline menu');

// Inspect the prepared production integration without importing the live server.
const source = fs.readFileSync('server.mjs', 'utf8');
assert(source.includes('extra = await crewcheckMenu.markup(chatId, extra);'));
assert(source.includes('if (await crewcheckMenu.callback(update)) return true;'));
assert(source.includes('if (await crewcheckMenu.text(update.message || {})) return true;'));
assert(source.includes('await crewcheckMenu.interrupt(update.message || {});'));
assert(source.includes('const conciergeKeyboard = menuTemplate();'));
assert(!source.match(/function conciergeHelp[\s\S]*?\n}/)[0].includes('/ligacao'));
for (const [name, producer] of [['conciergePerDiemReply', missingFinanceReply], ['conciergeComplianceReply', () => buildDutyFacts({}).summary]]) {
  const fn = source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n}`))[0];
  const result = vm.runInNewContext(`${fn}; ${name}({roster:{days:[{dutyHours:15,hotel:'PRIVATE'}]}})`, { missingFinanceReply, missingComplianceReply, buildDutyFacts, conciergeAccessMatches: () => false });
  assert.equal(result, producer(), 'typed commands and buttons share exact response');
  assert(!result.includes('PRIVATE'));
}
const core = source.match(/async function buildTelegramConciergeReplyCore\([\s\S]*?\n}/)[0];
const preparedHandlers = ['conciergePerDiemReply', 'conciergeComplianceReply'].map(name => source.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n}`))[0]).join('\n');
const context = {
  missingFinanceReply, missingComplianceReply, buildDutyFacts, conciergeAccessMatches: () => false, normalizeConciergeButtonText: value => value,
  isWellhubPlanPreferenceMessage: () => false, isWellhubActivityPreferenceMessage: () => false,
  conciergeIdentityFlow: async () => ({ handled: false }), conciergeDayForKey: () => null,
  conciergeDateKey: () => '2026-10-19', conciergeEasterEggReply: () => '',
  ...Object.fromEntries(['Today', 'Tomorrow', 'Next', 'RosterSummary', 'Radar', 'Departure'].map(name => [`matches${name}Intent`, () => false])),
};
const published = { date: '2026-10-19', dutyReport: '07:00', dutyDebrief: '17:00', dutyHours: 10, legs: [] };
const counterexamples = [
  [published, { ...published, dutyReport: '16:00', dutyDebrief: '20:00' }], // overlap
  [published, { ...published }], // duplicate
  [published, { ...published, dutyReport: '18:00', dutyDebrief: '20:00' }], // same-day blocks
  [{ date: '2026-10-19', type: 'ASB', legs: [] }], // missing clocks
  [{ ...published, dutyDebrief: '19:00', arrivalDayOffset: 2 }], // +2 marker
  [{ ...published, dutyHours: 15, timeSource: 'estimated', dutyReportSource: 'estimated' }],
  [{ ...published, timezone: 'Europe/London', journeyId: 'synthetic', dutyReportSource: 'unknown' }],
];
for (const days of counterexamples) {
  for (const [command, expected] of [['/diarias', missingFinanceReply()], ['/conformidade', buildDutyFacts({}).summary]]) {
    const result = await vm.runInNewContext(`${preparedHandlers}\n${core}\nbuildTelegramConciergeReplyCore(${JSON.stringify(command)}, {}, ${JSON.stringify({ roster: { days } })})`, context);
    assert.equal(result, expected, 'prepared typed dispatch does not convert unsafe clocks into alerts or per-diem values');
  }
}
console.log('PASS Telegram menu: synthetic callbacks, per-callback identity, replay, relink, TTL, cancel, direct producers; zero network.');
