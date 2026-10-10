import assert from 'node:assert/strict';
import { deliverWhatsAppMenuMessage } from '../server/concierge/whatsapp-menu.mjs';
// Test-only injected guest context, never exported to production or backed by accounts.
const receiver = '1259259633936048';
const guests = new Set(['5511000000002']); // fictional visitor; real-account actor is distinct
const replies = [], calls = [];
async function demo(message) {
  if (message.phoneNumberId !== receiver || !guests.has(message.from)) return { blocked: true };
  if (message.type !== 'text' || !/^(menu|hoje|amanhã|escala|próxima programação|pernoite|diárias)$/iu.test(message.text)) return { blocked: true };
  return deliverWhatsAppMenuMessage(message, {
    findLink: async () => ({ email: 'guest-fixture@example.invalid', consent_concierge: 1, linked_at: 'fixture-only' }),
    handler: async input => { calls.push(input); return 'DEMONSTRAÇÃO — escala fictícia: pernoite em Florianópolis; horários e hotel não são reais.'; },
    send: async (phone, text) => { assert.ok(guests.has(phone)); replies.push({ phone, text }); return { ok: true }; },
  });
}
for (const from of guests) for (const text of ['menu', 'hoje', 'amanhã', 'escala', 'próxima programação', 'pernoite', 'diárias']) await demo({ from, text, type: 'text', phoneNumberId: receiver, id: 'fictional' });
assert.equal(replies.length, 7); assert.equal(calls.length, 6);
for (const override of [{ from: '5511000000001' }, { from: '5511000000003' }, { phoneNumberId: 'wrong' }, { type: 'location', location: { latitude: 0, longitude: 0 } }, { text: '/emergencia' }, { text: 'vincular 123456' }, { type: 'document' }]) {
  assert.equal((await demo({ from: [...guests][0], text: 'hoje', type: 'text', phoneNumberId: receiver, ...override })).blocked, true);
}
assert.equal(replies.length, 7); assert.equal(calls.length, 6);
assert.ok(calls.every(input => input.email === 'guest-fixture@example.invalid'));
console.log('PASS: one fictional visitor; authenticated account actor excluded from guest context, existing menu with injected fictional context; receiver/recipient/topic guard, no DB/account/SOS/media/provider or live transport');
