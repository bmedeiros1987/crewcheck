import { wellhubTelegramMessage, wellhubPlainMessage } from '../shared/wellhub-unit-actions.mjs';
import { createTelegramMenu } from '../server/concierge/telegram-menu.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as wellhub from '../server/v14407/wellhub.mjs';
import * as concierge from '../server/v14410/wellhub-concierge.mjs';
let location = { city: 'Fortaleza', state: 'CE' };
let partners = await wellhub.searchVerifiedWellhub({ plan: 'silver-plus', locationText: 'Fortaleza CE', now: new Date('2026-10-10T18:05:00Z') });
const context = vm.createContext({ ...wellhub, ...concierge,
  searchVerifiedWellhub: async () => partners,
  conciergeCurrentStay: () => null, conciergeNextProgram: () => null,
  conciergeLocationContextV14335: () => ({ fresh: true, location }),
  WEATHER_AIRPORT_POINTS: {},
});
const server = fs.readFileSync('server.mjs', 'utf8');
const telegramHasUnitActions = server.includes('// cc-wellhub-unit-transport');
let snippet = fs.readFileSync('scripts/v14410/concierge-gyms.snippet', 'utf8');
if (process.argv.includes('--materialized')) {
  const start = server.indexOf('async function conciergeGymsReply(');
  snippet = server.slice(start, server.indexOf('\n}', start) + 2);
}
vm.runInContext(snippet + '\nthis.reply = conciergeGymsReply;', context);
const snapshot = { preferences: { gymPlan: 'wellhub', wellhubPlan: 'silver-plus' } };
const reply = await context.reply(snapshot, '/academias');
assert.match(reply, /^Academias · Fortaleza\/CE · Silver\+\n\n1\. Greenlife Messejana\n/);
assert.equal((reply.match(/\n\n\d\. /g) || []).length, 4);
assert.equal((reply.match(/Catálogo parcial/g) || []).length, 1);
assert.equal((reply.match(/Cadastro consultado em:/g) || []).length, 1);
assert.equal((reply.match(/Confirme acesso e condições no app Wellhub/g) || []).length, 1);
assert.match(reply, /Agendamento necessário/);
assert.match(reply, /Basic permite apenas horários específicos/);
assert.doesNotMatch(reply, /snapshot|Wellhub verificado|✓ incluído|aberto agora|\d+ km/i);
assert.ok(reply.length < 3900, 'all four units and footer survive existing Telegram payload limit');
for (const partner of partners) { assert.ok(reply.includes(partner.name)); assert.ok(reply.includes(partner.sourceUrl)); }
// Unit dates remain distinguishable, special characters remain literal text,
// and newlines/control direction cannot forge a second unit or warning.
partners = partners.slice(0, 2).map((p, i) => ({ ...p, name: i ? 'Gym <Teste> & "A" _B_ [C] *D*' : 'Nome\nforjado\u202e', verifiedAt: i ? '2026-10-09' : '2026-10-10' }));
const special = await context.reply(snapshot, '/academias');
assert.match(special, /Nome forjado/);
assert.ok(special.includes('Gym <Teste> & "A" _B_ [C] *D*'));
assert.equal((special.match(/Cadastro consultado em:/g) || []).length, 2);
assert.ok(special.includes('2026-10-09') && special.includes('2026-10-10'));
assert.doesNotMatch(special, /\u202e/);
partners[0].sourceUrl = 'javascript:alert(1)';
assert.doesNotMatch(await context.reply(snapshot, '/academias'), /javascript:/);
// Execute existing Telegram payload builder with fictional fetch; no message sent.
let payload;
const start = server.indexOf('async function sendTelegramMessage(');
const sender = server.slice(start, server.indexOf('\n}', start) + 2);
const transport = vm.createContext({ crewcheckMenu: createTelegramMenu({}), wellhubTelegramMessage, loadVerifiedWellhubPartners: wellhub.loadVerifiedWellhubPartners, telegramApiUrl: () => 'https://example.invalid', fetch: async (_, init) => { payload = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ ok: true }) }; } });
vm.runInContext(sender + '\nthis.send = sendTelegramMessage;', transport);
await transport.send('synthetic', special);
assert.equal(payload.text, telegramHasUnitActions ? wellhubTelegramMessage(special, wellhub.loadVerifiedWellhubPartners()).text : special);
if (telegramHasUnitActions) assert.ok(payload.entities?.length && payload.entities.every(e => payload.text.slice(e.offset,e.offset+e.length) === 'Ficha e ações'));
else assert.equal(payload.entities, undefined, 'raw transport has no aliases before preparation');
assert.equal(payload.parse_mode, undefined);
assert.equal(JSON.parse(JSON.stringify({ text: special })).text, special);
console.log('Readable Wellhub blocks, conditions, dates, special characters and synthetic payload: PASS');

// Execute the committed WhatsApp payload builder with isolated fictional helpers.
// No configured credentials, real destination, channel activation or network.
const whatsappSource = fs.readFileSync('server/whatsapp.mjs', 'utf8');
const whatsappHasUnitActions = whatsappSource.includes('// cc-wellhub-unit-plain');
const whatsappStart = whatsappSource.indexOf('export async function sendWhatsAppText(');
const whatsappSender = whatsappSource.slice(whatsappStart, whatsappSource.indexOf('\n}', whatsappStart) + 2).replace('export ', '');
let whatsappPayload;
const whatsappTransport = vm.createContext({ wellhubPlainMessage, loadVerifiedWellhubPartners: wellhub.loadVerifiedWellhubPartners, accessToken: () => 'synthetic', phoneNumberId: () => 'synthetic', normalizePhone: () => 'synthetic', graphVersion: () => 'synthetic', AbortController,
  setTimeout: () => 1, clearTimeout: () => {}, console,
  fetch: async (_, init) => { whatsappPayload = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ messages: [] }) }; },
});
vm.runInContext(whatsappSender + '\nthis.send = sendWhatsAppText;', whatsappTransport);
location = { city: 'Brasília', state: 'DF' };
for (const activity of ['Treino de força', 'Cycle']) {
  const catalog = await wellhub.searchVerifiedWellhub({ plan: 'silver-plus', locationText: 'Brasília DF', activity, limit: 60, now: new Date('2026-10-10T18:05:00Z') });
  assert.ok(catalog.length >= 8, 'exercise the actual DF eight-unit truncation regression');
  const request = { preferences: { ...snapshot.preferences, gymActivity: activity } };
  for (const budget of [3900, 4000, 1500, 1000, 800, 600]) {
    partners = catalog;
    const bounded = await context.reply(request, '/academias', {}, budget);
    assert.ok(bounded.length <= Math.min(3900, budget));
    assert.equal((bounded.match(/Catálogo parcial/g) || []).length, 1);
    assert.match(bounded, /Acesso, horários e disponibilidade de modalidades atuais não confirmados/);
    assert.ok(bounded.endsWith('Para alterar: “meu plano é Silver+”, “uso Gold” ou “quero Pilates”.'));
    const selected = catalog.slice(0, 8).filter(p => bounded.includes(`. ${p.name}\n`));
    if (selected.length) {
      assert.match(bounded, new RegExp(`Mostrando ${selected.length} de 8 unidades deste resultado`));
      for (const p of selected) {
        // Compare each published block to its full single-unit rendering,
        // ensuring no restriction, source, hours or activity line is lost.
        partners = [p];
        const full = await context.reply(request, '/academias');
        const block = full.split('\n\n')[1].replace(/^1\. /, '');
        assert.ok(bounded.includes(block), `complete unit preserved: ${p.name}`);
      }
      for (const p of catalog.slice(selected.length, 8)) assert.ok(!bounded.includes(p.sourceUrl), 'no dangling source for omitted block');
    } else {
      assert.match(bounded, /Nenhuma das 8 unidades.*cabe completa/);
      assert.ok(bounded.includes('https://wellhub.com/pt-br/search/'));
    }
    await transport.send('synthetic', bounded);
    assert.equal(payload.text, telegramHasUnitActions ? wellhubTelegramMessage(bounded, wellhub.loadVerifiedWellhubPartners()).text : bounded, 'Telegram must preserve complete transformed output');
    await whatsappTransport.send('synthetic', bounded);
    assert.equal(whatsappPayload.text.body, whatsappHasUnitActions ? wellhubPlainMessage(bounded, wellhub.loadVerifiedWellhubPartners()) : bounded, 'WhatsApp must preserve complete transformed output');
    assert.equal(JSON.parse(JSON.stringify({ answer: bounded })).answer, bounded, 'app string payload is unchanged');
    console.log(`DF ${activity}, budget ${budget}: ${bounded.length} UTF-16 units, ${selected.length} complete gym blocks`);
  }
}
partners = [{ ...partners[0], name: 'Gym 😀 & <X> _Y_ [Z] *W*', accessConditions: 'Condição integral 😀 '.repeat(300) }];
const longUnit = await context.reply(snapshot, '/academias', {}, 600);
assert.ok(longUnit.length <= 600);
assert.match(longUnit, /Nenhuma das 1 unidades.*cabe completa/);
assert.doesNotMatch(longUnit, /Gym 😀|Condição integral/);
assert.match(longUnit, /Acesso, horários e disponibilidade de modalidades atuais não confirmados/);
console.log('DF real catalogs, full blocks, footer reserved, UTF-16 budgets and all synthetic channel payloads: PASS');
