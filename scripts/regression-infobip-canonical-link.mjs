import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHmac } from 'node:crypto';
import { createInfobipInboundReceiver } from '../server/infobip-whatsapp-candidate.mjs';
import { completeCanonicalWhatsAppLink } from '../server/whatsapp-link-proof.mjs';
import { infobipCanonicalLinkDestination } from '../server/infobip-whatsapp-link-policy.mjs';
import { INFOBIP_SINGLE_TEST_APPROVAL } from '../server/infobip-whatsapp-single-test.mjs';

globalThis.fetch = () => assert.fail('EXTERNAL_NETWORK_FORBIDDEN');
const now = Date.parse('2032-01-01T12:00:00Z'), sender = '12025550100', recipient = '12025550101';
const secret = 'synthetic-webhook-key-not-real-123456789';
const configuration = { singleMessageTest: true, canonicalLinkHandshake: true, authentication: 'hmac-sha256', sender, allowedSenders: [sender], deploymentBinding: { sender } };
const policy = { version: 1, mode: 'single-neutral-reply-v1', maxCostUsd: '0.02', configuration, admission: { id: INFOBIP_SINGLE_TEST_APPROVAL, maxAttempts: 1, recipients: [recipient], validFrom: now - 1000, validUntil: now + 600000 } };
const environment = { CREWCHECK_INFOBIP_WHATSAPP_POLICY: JSON.stringify(policy) };
assert.equal(await infobipCanonicalLinkDestination(environment, now), sender);
assert.equal(await infobipCanonicalLinkDestination({}, now), '');
assert.equal(await infobipCanonicalLinkDestination(environment, now + 600000), '');
assert.equal(await infobipCanonicalLinkDestination({ ...environment, CREWCHECK_WHATSAPP_NUMBER: '12025550102' }, now), '');
for (const edit of [p => p.configuration.canonicalLinkHandshake = false, p => p.configuration.canonicalLinkHandshake = 'true', p => p.configuration.authentication = 'basic', p => p.configuration.allowedSenders = [], p => p.admission.id += '-reset']) {
  const p = structuredClone(policy); edit(p);
  assert.equal(await infobipCanonicalLinkDestination({ CREWCHECK_INFOBIP_WHATSAPP_POLICY: JSON.stringify(p) }, now), '');
}

// Synthetic serializable SQL fixture for the actual canonical completion code.
// Only an already-authenticated user challenge can appear in pending.
const hash = input => createHmac('sha256', secret).update(input).digest('hex');
const state = { pending: new Map(), links: new Map(), claims: new Map(), transactions: 0, enqueued: 0, failCommit: false };
const phoneHash = hash(recipient), codeHash = code => hash('crewcheck-whatsapp-link|' + code);
let tail = Promise.resolve();
const store = { transaction: run => {
  const result = tail.then(async () => {
    state.transactions++;
    const pending = structuredClone(state.pending), links = structuredClone(state.links), claims = structuredClone(state.claims);
    const c = { query: async (sql, args) => {
      if (sql.startsWith('SELECT email FROM crewcheck_whatsapp_link_codes')) {
        const value = pending.get(args[0]); return [[value && value.expiresAt > now ? { email: value.email } : null].filter(Boolean)];
      }
      if (sql.startsWith('SELECT public_id')) return [[{ public_id: 'synthetic-owner' }]];
      if (sql.startsWith('SELECT email,revoked_at')) return [[links.get(args[0])].filter(Boolean)];
      if (sql.startsWith('INSERT INTO crewcheck_whatsapp_links')) { links.set(args[1], { email: args[0], revoked_at: null, consent_concierge: 1, consent_alerts: 0 }); return [{ affectedRows: 1 }]; }
      if (sql.startsWith('DELETE FROM crewcheck_whatsapp_link_codes')) { for (const [key, value] of pending) if (value.email === args[0]) pending.delete(key); return [{ affectedRows: 1 }]; }
      assert.fail('Unexpected canonical SQL');
    } };
    const value = await run({
      claim: async (key, digest) => { if (claims.has(key)) return claims.get(key) === digest ? 'duplicate' : 'conflict'; claims.set(key, digest); return 'new'; },
      completeLink: async event => (await completeCanonicalWhatsAppLink(c, { phone: event.recipient, codeHash: codeHash(event.text), phoneHash, phoneCipher: 'SYNTHETIC CIPHER' })).linked,
      lookupLink: async () => links.has(phoneHash) ? { accountId: 'synthetic-owner', revision: 'synthetic-revision', provider: 'infobip', sender, recipient, consentConcierge: true, revoked: false } : null,
      finishClaim: async () => {}, enqueue: async () => { state.enqueued++; assert.fail('Link handshake must not enqueue a paid confirmation'); },
    });
    if (state.failCommit) throw new Error('SYNTHETIC_ROLLBACK');
    Object.assign(state, { pending, links, claims }); return value;
  }); tail = result.catch(() => {}); return result;
} };
const receive = () => createInfobipInboundReceiver({ sender, authentication: { mode: 'hmac-sha256', secretKey: secret }, store, now: () => now, queueLinkConfirmation: false,
  acceptEvent: event => event.recipient === recipient && /^\d{6}$/.test(event.text) });
const packet = (id, code, overrides = {}) => {
  const rawBody = Buffer.from(JSON.stringify({ results: [{ from: recipient, to: sender, integrationType: 'WHATSAPP', messageId: id, receivedAt: new Date(now).toISOString(), message: { type: 'TEXT', text: code }, ...overrides }] }));
  return { method: 'POST', rawBody, rawHeaders: ['X-Hub-Signature', 'SHA256=' + createHmac('sha256', secret).update(rawBody).digest('hex')] };
};
state.pending.set(codeHash('123456'), { email: 'synthetic@example.invalid', expiresAt: now + 600000 });
const badAuth = packet('bad-auth', '123456'); badAuth.rawHeaders[1] = 'SHA256=' + '0'.repeat(64);
assert.equal((await receive()(badAuth)).status, 401); assert.equal(state.transactions, 0);
assert.equal((await receive()(packet('other', '123456', { from: '12025550102' }))).denied, 1); assert.equal(state.transactions, 0);
assert.equal((await receive()(packet('normal-text', 'Hello'))).denied, 1); assert.equal(state.transactions, 0);
state.failCommit = true;
assert.equal((await receive()(packet('rollback', '123456'))).status, 503); assert.equal(state.links.size, 0); assert.equal(state.pending.size, 1);
state.failCommit = false;
const results = await Promise.all(Array.from({ length: 8 }, () => receive()(packet('one', '123456'))));
assert.equal(results.reduce((n, value) => n + value.linked, 0), 1);
assert.equal(results.reduce((n, value) => n + value.duplicates, 0), 7);
assert.equal(state.pending.size, 0); assert.equal(state.links.get(phoneHash).consent_alerts, 0); assert.equal(state.enqueued, 0);
assert.equal((await receive()(packet('one', '123456'))).duplicates, 1, 'receiver restart uses the existing durable claim');
state.pending.set(codeHash('222222'), { email: 'other@example.invalid', expiresAt: now + 600000 });
assert.equal((await receive()(packet('cross-account', '222222'))).denied, 1); assert.equal(state.links.get(phoneHash).email, 'synthetic@example.invalid');
state.pending.set(codeHash('333333'), { email: 'synthetic@example.invalid', expiresAt: now - 1 });
assert.equal((await receive()(packet('expired', '333333'))).denied, 1);
assert.equal((await receive()(packet('old-retry', '222222', { receivedAt: new Date(now - 9 * 86400000).toISOString() }))).denied, 1);
assert.equal(state.enqueued, 0);

// Execute the real status handler: authenticated, scoped SELECT only, no DDL.
const whatsappSource = fs.readFileSync('server/whatsapp.mjs', 'utf8');
const statusSource = whatsappSource.slice(whatsappSource.indexOf('async function handleLinkStatus('), whatsappSource.indexOf('\nasync function handleUnlink('));
let reads = 0, broken = false;
const identity = { email: 'synthetic@example.invalid', db: { query: async (sql, args) => {
  reads++; assert(sql.trim().startsWith('SELECT ')); assert.deepEqual(args, [identity.email]);
  if (broken) throw Error('SYNTHETIC_PRIVATE_DATABASE_ERROR');
  return [[{ phone_last4: '0101', consent_concierge: '0', consent_alerts: 0, linked_at: '2032-01-01' }]];
} } };
const statusHandler = new Function('sendJson', 'requireIdentity', 'ensureWhatsAppTables', `return (${statusSource});`)(
  (_res, status, payload) => ({ status, payload }), async req => req.identity, () => assert.fail('status cannot initialize tables'));
assert.equal(await statusHandler({ method: 'GET', identity: null }, {}), undefined); assert.equal(reads, 0);
const status = await statusHandler({ method: 'GET', identity }, {});
assert.equal(status.status, 200); assert.equal(status.payload.linked, true); assert.equal(status.payload.last4, '0101'); assert.equal(status.payload.consentConcierge, false);
broken = true;
assert.equal((await statusHandler({ method: 'GET', identity }, {})).status, 503);

if (process.argv.includes('--prepared')) {
  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  const start = home.indexOf('async function openWhatsAppBinding() {'), end = home.indexOf('\n}\n', start) + 2;
  assert(start > 0 && end > start);
  const code = home.slice(start, end).replace(/authFetch<[^>]+>/g, 'authFetch');
  let current = true, resolve, opens = 0, notices = 0;
  const open = new Function('captureWhatsAppLinkSession', 'authFetch', 'window', 'navigator', 'toast', `return (${code});`)(
    () => ({ isCurrent: () => current }), () => new Promise(done => { resolve = done; }),
    { open: () => { opens++; } }, { clipboard: { writeText: () => { opens++; } } }, { success: () => { notices++; }, error: () => { notices++; } });
  const pending = open(); current = false; resolve({ ok: true, code: '654321', openUrl: 'https://wa.me/12025550100' }); await pending;
  assert.equal(opens, 0); assert.equal(notices, 0, 'old-account challenge must not be opened/copied/displayed');
}
console.log('PASS canonical Infobip handshake: literal raw HMAC before SQL, explicit recipient/window gate, canonical challenge/expiry, concurrency, rollback, restart, cross-account conflict and no paid confirmation; externalCalls=0.');
