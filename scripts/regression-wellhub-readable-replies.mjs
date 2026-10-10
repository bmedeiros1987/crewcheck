import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as wellhub from '../server/v14407/wellhub.mjs';
import * as concierge from '../server/v14410/wellhub-concierge.mjs';
let partners = await wellhub.searchVerifiedWellhub({ plan: 'silver-plus', locationText: 'Fortaleza CE', now: new Date('2026-10-10T18:05:00Z') });
const context = vm.createContext({ ...wellhub, ...concierge,
  searchVerifiedWellhub: async () => partners,
  conciergeCurrentStay: () => null, conciergeNextProgram: () => null,
  conciergeLocationContextV14335: () => ({ fresh: true, location: { city: 'Fortaleza', state: 'CE' } }),
  WEATHER_AIRPORT_POINTS: {},
});
const server = fs.readFileSync('server.mjs', 'utf8');
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
const transport = vm.createContext({ telegramApiUrl: () => 'https://example.invalid', fetch: async (_, init) => { payload = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ ok: true }) }; } });
vm.runInContext(sender + '\nthis.send = sendTelegramMessage;', transport);
await transport.send('synthetic', special);
assert.equal(payload.text, special);
assert.equal(payload.parse_mode, undefined);
assert.equal(JSON.parse(JSON.stringify({ text: special })).text, special);
console.log('Readable Wellhub blocks, conditions, dates, special characters and synthetic payload: PASS');
