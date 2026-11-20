import assert from 'node:assert/strict';
import { googleSubscriptionStatus } from '../server/google-subscription-status.mjs';
import { createRtdnFixture, googleRtdnMessage, hash, platformFunctionBlock, qaCatalog, qaProduct } from './fixtures/google-rtdn-route.mjs';

globalThis.fetch = () => assert.fail('Provider network forbidden');
let captured;
const save = new Function('normalizeText', 'sha256', 'GOOGLE_PLAY_PRODUCTS', 'writeVerifiedGoogleSubscription', 'googleSubscriptionStatus',
  platformFunctionBlock('function normalizedGoogleStatus(', 'async function verifyGooglePubSubIdentity(') + ';return saveGoogleSubscription;')(
  (value, limit) => String(value || '').trim().slice(0, limit), hash, qaCatalog,
  async (_db, input) => { captured = input; return { active: true }; }, googleSubscriptionStatus,
);
await save({}, 'synthetic@example.invalid', 'SYNTHETIC_RAW_TOKEN', {
  item: { productId: qaProduct }, expiry: new Date('2099-01-01T00:00:00Z'),
  payload: { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', externalAccountIdentifiers: { obfuscatedExternalAccountId: 'GOOGLE_TEST' }, latestOrderId: 'SYNTHETIC_ORDER', acknowledgementState: 'ACKNOWLEDGED' },
}, 'GOOGLE_TEST', true);
assert.equal(captured.tokenHash, hash('SYNTHETIC_RAW_TOKEN'));
assert.equal(captured.expectedPublicId, 'GOOGLE_TEST');
assert.equal(captured.verifiedPublicId, 'GOOGLE_TEST');
assert.equal(captured.existingOnly, true);
assert(!JSON.stringify(captured).includes('SYNTHETIC_RAW_TOKEN'));

const token = 'SYNTHETIC_TOKEN';
const eventId = 'SYNTHETIC_EVENT';
const message = googleRtdnMessage(token, eventId);
const payloadHash = hash(Buffer.from(message.message.data, 'base64').toString('utf8'));
for (const test of [
  { options: { authorization: '' }, status: 401, auth: 0 },
  { configured: false, status: 503, auth: 0 },
  { claims: { aud: 'wrong' }, status: 403, auth: 1 },
  { claims: { aud: 'https://rtdn.example.invalid', email: 'events@example.invalid', email_verified: false }, status: 403, auth: 1 },
]) {
  const fixture = createRtdnFixture(test);
  await assert.rejects(fixture.run(message, test.options), { status: test.status });
  assert.deepEqual(fixture.counts, { verifiedAuth: test.auth, body: 0, database: 0, publisher: 0 });
}
const blocked = createRtdnFixture({});
assert.equal((await blocked.run(message, { method: 'GET' })).status, 405);
assert.equal(blocked.counts.verifiedAuth, 0);
for (const malformed of [googleRtdnMessage(token, eventId + '\n'), googleRtdnMessage(token + '\n', eventId), googleRtdnMessage(token, eventId, { packageName: 'invalid.example' }), { message: { messageId: eventId, data: '%%%%' } }]) {
  assert.equal((await blocked.run(malformed)).status, 400);
}
assert.equal(blocked.counts.database, 0);
for (const mode of ['unknown', 'ambiguous-owner', 'known', 'profile-missing', 'ambiguous-profile', 'duplicate', 'conflict', 'storage-unavailable']) {
  let observed = 0;
  const database = { query: async sql => {
    if (mode === 'storage-unavailable') throw Object.assign(Error('SYNTHETIC_DB_UNAVAILABLE'), { code: 'ECONNRESET' });
    if (sql.includes('webhook_events')) return { rows: ['duplicate', 'conflict'].includes(mode) ? [{ event_id: eventId, payload_hash: mode === 'duplicate' ? payloadHash : hash('wrong') }] : [] };
    if (sql.includes('purchase_token_hash')) return { rows: mode === 'unknown' ? [] : mode === 'ambiguous-owner' ? [{ email: 'one' }, { email: 'two' }] : [{ email: 'synthetic@example.invalid' }] };
    if (sql.includes('profiles')) return { rows: mode === 'profile-missing' ? [] : mode === 'ambiguous-profile' ? [{ public_id: 'A' }, { public_id: 'B' }] : [{ public_id: 'GOOGLE_TEST' }] };
    assert.fail('Unexpected synthetic SQL');
  }};
  const fixture = createRtdnFixture({ database, createObserver: () => async (owner, event, transientToken) => {
    observed++;
    assert.deepEqual(owner, { email: 'synthetic@example.invalid', expectedPublicId: 'GOOGLE_TEST', tokenHash: hash(token) });
    assert.deepEqual(event, { eventId, payloadHash });
    assert.equal(transientToken, token);
    return { duplicate: false };
  } });
  if (mode === 'conflict' || mode === 'storage-unavailable') {
    await assert.rejects(fixture.run(message), { code: mode === 'conflict' ? 'GOOGLE_EVENT_RECEIPT_CONFLICT' : 'ECONNRESET' });
  } else {
    const response = await fixture.run(message);
    if (mode === 'profile-missing' || mode === 'ambiguous-profile') assert.equal(response.status, 409);
    else assert.equal(response.status, 200);
    if (mode === 'duplicate') assert.equal(response.body.duplicate, true);
    if (mode === 'unknown' || mode === 'ambiguous-owner') assert.equal(response.body.ignored, true);
  }
  assert.equal(observed, mode === 'known' ? 1 : 0);
  assert.equal(fixture.counts.publisher, 0);
}
console.log('PASS actual checkout write wrapper and 17 authenticated RTDN boundary cases; zero provider traffic');
