import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createTelegramMenuTransport } from '../server/concierge/telegram-menu-transport.mjs';
import { createTelegramMenu, menuTemplate } from '../server/concierge/telegram-menu.mjs';
import { buildDutyFacts } from '../server/concierge/duty-facts.mjs';
import { normalizeRosterDays } from '../server/concierge/generated/canonicalRoster.mjs';
import { profile as baseProfile, leg, day, snapshot as makeSnapshot } from './fixtures/concierge-duty-facts/synthetic.mjs';

const source = fs.readFileSync('server.mjs', 'utf8');
assert(source.includes('facts: (profile, snapshot, page = 0) => buildDutyFacts('), 'test requires actual prepared runtime wiring');
const fn = name => {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}`));
  assert(match, `actual prepared ${name}`); return match[0];
};
const runtime = source.match(/const crewcheckMenu = createTelegramMenu\([\s\S]*?\n}\);/)[0];
let profile = { ...baseProfile }, snapshot = makeSnapshot();
const sent = [], answers = []; let messageId = 100, snapshotHook = null, profileHook = null;
const context = vm.createContext({
  crewcheckTemporalDialogue: {interrupt:()=>{}},
  crypto, Buffer, createTelegramMenu, createTelegramMenuTransport, buildDutyFacts,
  telegramProfileForChatAsync: async () => { if (profileHook) profileHook(); return { ...profile }; },
  conciergeLoadSnapshot: async () => { const copy = structuredClone(snapshot); if (snapshotHook) { const hook = snapshotHook; snapshotHook = null; hook(); } return copy; },
  answerTelegramCallback: async (id, text) => answers.push({id, text}),
  conciergeSettingsKeyboard: {}, conciergeWeatherKeyboard: () => ({}),
  buildTelegramConciergeReply: () => { throw Error('facts must not invoke a legacy legal reply'); },
  telegramApiUrl: method => `https://transport.invalid/${method}`,
  fetch: async (url, options) => {
    if (url === 'https://transport.invalid/editMessageReplyMarkup') return { ok:true, json: async () => ({ok:true}) };
    assert.equal(url, 'https://transport.invalid/sendMessage');
    const payload = JSON.parse(options.body); sent.push(payload);
    assert(payload.text.length <= 3900);
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: ++messageId, date: 1_000_000 } }) };
  },
});
vm.runInContext([fn('conciergeAccessMatches'), fn('sendTelegramMessage'), runtime, fn('processTelegramUpdate'), fn('conciergeComplianceReply')].join('\n'), context);
const message = text => ({ message: { chat: { id: 123, type: 'private' }, from: { id: 123 }, message_id: ++messageId, date: 1_000_001, text } });
const callback = data => ({ callback_query: { id: 'synthetic-callback', data, message: message('').message, from: { id: 123 } } });
const run = update => context.processTelegramUpdate(update);
const button = label => sent.at(-1).reply_markup.inline_keyboard.flat().find(item => item.text === label).callback_data;
const ask = () => run(message('/conformidade'));

await ask(); assert.match(sent.at(-1).text, /6h40/); assert.match(sent.at(-1).text, /Correspondência com a escala ativa não comprovada/);
const summary = sent.at(-1).text;
const details = button('📖 Fundamento');
await run(callback(details)); assert.match(sent.at(-1).text, /Fundamento da leitura/); assert.match(sent.at(-1).text, /publicada \(07:25\)/);
assert.match(sent.at(-1).text, /regime e composição confirmados/);
await run(callback(button('↩️ Voltar'))); assert.equal(sent.at(-1).text, summary);
await run(callback(details)); assert.match(answers.at(-1).text, /expirou/); // One-use ticket.

// The actual production sender decorates the existing root, then the real
// callback handler routes Regulamentação → Revisar escala to the same factual consumer.
context.root = menuTemplate();
await vm.runInContext('sendTelegramMessage(123, "Escolha", {reply_markup: root})', context);
await run(callback(button('📖 Regulamentação'))); await run(callback(button('📋 Revisar escala')));
assert.equal(sent.at(-1).text, summary);

await run(message('revisar escala')); assert.equal(sent.at(-1).text, summary);
snapshot = makeSnapshot([10, 12, 14, 16].map(n => day({ date: `${n}/10/2032` })));
await ask(); assert.match(sent.at(-1).text, /Página 1\/3/);
await run(callback(button('▶️ Próxima página'))); assert.match(sent.at(-1).text, /Página 2\/3/);
await run(callback(button('📖 Fundamento'))); assert.match(sent.at(-1).text, /Fundamento/);
await run(callback(button('↩️ Voltar'))); assert.match(sent.at(-1).text, /Página 2\/3/);
await run(callback(button('◀️ Anterior'))); assert.match(sent.at(-1).text, /Página 1\/3/);
await run(callback(button('▶️ Próxima página'))); const pageTwoBasis = button('📖 Fundamento');
await ask(); const pageOneBasis = button('📖 Fundamento'), startConcurrent = sent.length;
await Promise.all([run(callback(pageOneBasis)), run(callback(pageTwoBasis))]);
const concurrent = sent.slice(startConcurrent).filter(item => item.text.startsWith('Fundamento'));
assert.equal(concurrent.length, 2);
const pageOne = concurrent.find(item => item.text.includes('Programação 2032-10-10'));
const pageTwo = concurrent.find(item => item.text.includes('Programação 2032-10-14'));
assert(pageOne && pageTwo);
const back = item => item.reply_markup.inline_keyboard.flat().find(button => button.text === '↩️ Voltar').callback_data;
await run(callback(back(pageOne))); assert.match(sent.at(-1).text, /Página 1\/3/);
await run(callback(back(pageTwo))); assert.match(sent.at(-1).text, /Página 2\/3/);
snapshot = makeSnapshot();

await ask(); const oldBasis = button('📖 Fundamento');
snapshot = makeSnapshot([day({ dutyDebrief: '15:05' })]);
await run(callback(oldBasis)); assert.match(sent.at(-1).text, /snapshot mudou/); assert.match(sent.at(-1).text, /7h40/);
assert(!sent.at(-1).text.includes('6h40'));
await run(callback(button('📖 Fundamento'))); assert.match(sent.at(-1).text, /15:05/);

snapshot = makeSnapshot(undefined, { updatedAt: '2020-01-01T12:00:00Z' });
await ask(); assert.match(sent.at(-1).text, /01\/01\/2020/); assert.match(sent.at(-1).text, /não comprovada/);
const oldMetadata = button('📖 Fundamento'); snapshot.updatedAt = '2020-01-02T12:00:00Z';
await run(callback(oldMetadata)); assert.match(sent.at(-1).text, /snapshot mudou/);

snapshot = makeSnapshot(undefined, { email: 'other@example.invalid' });
await ask(); assert.match(sent.at(-1).text, /não autorizado/); assert(!sent.at(-1).text.includes('6h40'));
snapshot = makeSnapshot(undefined, { accessKeyHash: 'different-binding' });
await ask(); assert.match(sent.at(-1).text, /não autorizado/);
snapshot = makeSnapshot();
await ask(); const accountTicket = button('📖 Fundamento'); profile.email = 'relinked@example.invalid';
const beforeRelink = sent.length; await run(callback(accountTicket)); assert.match(answers.at(-1).text, /expirou/); assert.equal(sent.length, beforeRelink);
profile = { ...baseProfile };
snapshotHook = () => { profile = { ...baseProfile, email: 'changed-during-await@example.invalid' }; };
const before = sent.length; await ask(); assert.equal(sent.length, before, 'relink during snapshot await cannot leak facts');
profile = { ...baseProfile, linked: false }; await ask(); assert.equal(sent.length, before);
profile = { ...baseProfile };
let identityReads = 0;
profileHook = () => { if (++identityReads === 4) profile.email = 'changed-before-transport@example.invalid'; };
await ask(); assert.equal(sent.length, before, 'relink inside actual sender markup cannot send prior-owner facts');
profileHook = null;
profile = { ...baseProfile }; await run({ message: { ...message('/conformidade').message, from: { id: 999 } } }); assert.equal(sent.length, before);
await run({ message: { ...message('/conformidade').message, chat: { id: 123, type: 'group' } } }); assert.equal(sent.length, before);

snapshot = makeSnapshot([day({ dutyDebriefSource: 'estimated' })]); await ask(); assert.match(sent.at(-1).text, /Duração pendente/); assert(!sent.at(-1).text.includes('6h40'));
const coreReply = vm.runInContext('conciergeComplianceReply', context)(snapshot, profile);
assert.match(coreReply, /Duração pendente/);
snapshot = makeSnapshot([day({ date: '2032-10-10' })]); await ask();
assert.match(sent.at(-1).text, /DD\/MM\/AAAA/); assert(!sent.at(-1).text.includes('6h40'));
assert(!sent.at(-1).text.includes('01/10/2032'));
await run(callback(button('📖 Fundamento'))); assert.match(sent.at(-1).text, /DD\/MM\/AAAA/);
const published = day(), estimated = day({ dutyDebrief: '15:05', dutyDebriefSource: 'estimated', legs: [leg({ arrivalTime: '13:36' })] });
for (const days of [[published, estimated], [estimated, published]]) {
  snapshot = makeSnapshot(days); await ask(); assert.match(sent.at(-1).text, /duplicados.*conflitantes/);
  assert(!sent.at(-1).text.includes('6h40'));
  await run(callback(button('📖 Fundamento'))); assert(!sent.at(-1).text.includes('Extremos publicados comprovados'));
  snapshot = makeSnapshot(days); snapshot.roster = normalizeRosterDays(snapshot.roster);
  await ask(); assert.match(sent.at(-1).text, /duplicados preservados/); assert(!sent.at(-1).text.includes('6h40'));
}
assert(sent.every(item => !item.text.includes(baseProfile.email) && !item.text.includes(baseProfile.accessKeyHash)));
assert(answers.length > 0);
console.log('PASS prepared actual processTelegramUpdate + runtime + sendTelegramMessage + access predicate: slash/button parity, foundation/back, revision change, old snapshot, replay, binding/owner/group denial and in-flight relink; simulated transport only.');
