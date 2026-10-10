import assert from 'node:assert/strict';
import { sendWhatsAppText } from '../server/whatsapp.mjs';
import { handleVisitorMessage } from '../server/concierge/whatsapp-visitor.mjs';
import { withWhatsAppTestReply, whatsappTestSendDecision, whatsappTestInboundAllowed, whatsappTestMenuCommandAllowed, whatsappTestProfileStamp } from '../server/concierge/whatsapp-test-send-policy.mjs';

const A = '5511000000001', B = '5511000000002', receiver = '999999999';
process.env.WHATSAPP_ACCESS_TOKEN = 'fictional-transport-only';
process.env.WHATSAPP_PHONE_NUMBER_ID = receiver;
let attempts = 0;
globalThis.fetch = async (_url, init) => {
  attempts++;
  assert.equal(JSON.parse(init.body).type, 'text', 'never convert to a paid template');
  return { ok: true, json: async () => ({ messages: [{ id: 'fictional-accepted' }] }) };
};
function configure() {
  process.env.CREWCHECK_WHATSAPP_TEST_PROFILE = 'restricted';
  process.env.CREWCHECK_WHATSAPP_TEST_RECIPIENTS = JSON.stringify([A, B]);
  process.env.CREWCHECK_WHATSAPP_TEST_PHONE_NUMBER_ID = receiver;
  process.env.CREWCHECK_WHATSAPP_TEST_TRANSPORT_ATTESTED = 'true';
  process.env.CREWCHECK_WHATSAPP_TEST_ISOLATION_ATTESTED = 'true';
}
const message = (overrides = {}) => ({ id: 'fixture-inbound', from: A, phoneNumberId: receiver, type: 'text', text: '/escala', timestamp: String(Math.floor(Date.now() / 1000)), ...overrides });
const options = (m, overrides = {}) => ({ replyToMessageId: m.id, expectedPhoneNumberId: receiver, testReplyPath: 'menu', ...overrides });
const scopedSend = (m, overrides = {}) => withWhatsAppTestReply(m, 'inbound', () => sendWhatsAppText(m.from, 'fictional reply', options(m, overrides)));

delete process.env.CREWCHECK_WHATSAPP_TEST_PROFILE;
assert.equal((await sendWhatsAppText(A, 'baseline fictional')).ok, true, 'unset profile preserves existing baseline');
configure(); attempts = 0;
for (const m of [message({ from: '5511000000003' }), message({ phoneNumberId: 'wrong' }), message({ id: '' }), message({ timestamp: '' }), message({ timestamp: 'not-a-time' }), message({ timestamp: String(Math.floor(Date.now()/1000) - 86400) }), message({ timestamp: String(Math.floor(Date.now()/1000) + 600) })]) {
  assert.equal(whatsappTestInboundAllowed(m), false);
  assert.equal((await scopedSend(m)).ok, false);
}
assert.equal(attempts, 0);
assert.equal((await sendWhatsAppText(A, 'missing scope', options(message()))).ok, false);
for (const field of ['CREWCHECK_WHATSAPP_TEST_TRANSPORT_ATTESTED','CREWCHECK_WHATSAPP_TEST_ISOLATION_ATTESTED']) {
  configure(); delete process.env[field]; assert.equal((await scopedSend(message())).ok, false);
}
for (const bad of ['false','true',' ', 'unknown']) {
  configure(); process.env.CREWCHECK_WHATSAPP_TEST_PROFILE = bad; assert.equal((await scopedSend(message())).ok, false);
}
for (const bad of ['[]', JSON.stringify([A,A]), JSON.stringify([A,B,'5511000000003']), 'not-json']) {
  configure(); process.env.CREWCHECK_WHATSAPP_TEST_RECIPIENTS = bad; assert.equal((await scopedSend(message())).ok, false);
}
configure(); const m = message();
assert.equal((await withWhatsAppTestReply(m, 'inbound', () => sendWhatsAppText(B, 'wrong allowed recipient', options(m)))).ok, false);
assert.equal((await scopedSend(m, { replyToMessageId: 'foreign-message' })).ok, false);
assert.equal((await scopedSend(m, { expectedPhoneNumberId: 'foreign-sender' })).ok, false);
assert.equal((await scopedSend(m, { testReplyPath: 'legacy' })).ok, false);
assert.equal((await withWhatsAppTestReply(m, 'unknown', () => sendWhatsAppText(A, 'unproved', options(m)))).ok, false);
assert.equal(whatsappTestMenuCommandAllowed(message({ text: 'arbitrary AI/place question' })), false);
assert.equal(whatsappTestMenuCommandAllowed(message({ type: 'location' })), false);
assert.equal(attempts, 0);
await withWhatsAppTestReply(m, 'inbound', async () => {
  await Promise.resolve(); delete process.env.CREWCHECK_WHATSAPP_TEST_PROFILE;
  assert.equal((await sendWhatsAppText(A, 'no production fallback', options(m))).ok, false);
});
configure();
await withWhatsAppTestReply(m, 'inbound', async () => {
  await Promise.resolve(); process.env.CREWCHECK_WHATSAPP_TEST_RECIPIENTS = JSON.stringify([B,'5511000000003']);
  assert.equal((await sendWhatsAppText(A, 'drift', options(m))).ok, false);
});
configure();
await withWhatsAppTestReply(m, 'inbound', async () => {
  const sent = Number(m.timestamp)*1000;
  assert.equal(whatsappTestSendDecision(A, receiver, options(m), sent + 23*3600000 - 1).allowed, true);
  assert.equal(whatsappTestSendDecision(A, receiver, options(m), sent + 23*3600000).allowed, false);
});
assert.equal(attempts, 0);
const realNow = Date.now;
await withWhatsAppTestReply(message(), 'inbound', async () => {
  await Promise.resolve();
  try {
    Date.now = () => realNow() + 23 * 3600000;
    assert.equal((await sendWhatsAppText(A, 'expired during work', options(m))).ok, false);
  } finally { Date.now = realNow; }
});
assert.equal(attempts, 0, 'expired window is checked again immediately before transport');
assert.equal((await scopedSend(message())).ok, true);
const ownerLink = message({ text: '123456' });
assert.equal((await scopedSend(ownerLink, { testReplyPath: undefined })).ok, true);
const pdf = message({ type: 'document', testProfileStamp: whatsappTestProfileStamp() });
assert.equal((await withWhatsAppTestReply(pdf, 'pdf', () => sendWhatsAppText(A, 'fictional PDF confirmation', options(pdf)))).ok, true);
assert.equal((await withWhatsAppTestReply({ ...pdf, testProfileStamp: 'old-profile' }, 'pdf', () => sendWhatsAppText(A, 'inherited job', options(pdf)))).ok, false);
const beforeVisitor = attempts;
let active = false;
const binding = { visitorId: 'fictional-visitor', ownerEmail: 'fictional-owner@example.invalid', bindingId: 'fixture-binding', receiver };
const deps = { enabled: () => true, receiver: () => receiver, now: () => Date.now(), findBinding: async () => binding,
  context: async () => ({ active, premium: true, visitorId: binding.visitorId, ownerEmail: binding.ownerEmail, permissions: { roster: true }, revision: 'fixture-revision' }),
  claim: async () => true, reply: async () => ({ text: 'fictional roster', command: '/escala', scope: { version: 'fixture' } }),
  deliver: async (_p,_b,_r,_prepared,send) => send(), send: sendWhatsAppText };
await withWhatsAppTestReply(m, 'inbound', () => handleVisitorMessage(m, deps));
assert.equal(attempts, beforeVisitor, 'revoked visitor never reaches transport');
active = true;
await withWhatsAppTestReply(m, 'inbound', () => handleVisitorMessage(m, deps));
assert.equal(attempts, beforeVisitor + 1, 'active scoped fixture visitor can reply');
active = true;
await withWhatsAppTestReply(m, 'inbound', () => handleVisitorMessage(m, { ...deps, reply: async (...args) => { active = false; return deps.reply(...args); } }));
assert.equal(attempts, beforeVisitor + 1, 'revocation during awaited work blocks private reply');
console.log('PASS restricted central sender: recipient/window/scope/path/config drift fail closed; owner/menu/visitor/PDF fictional positives; revoked visitor blocked; no template/fallback; fake fetch only, no DB/network');
