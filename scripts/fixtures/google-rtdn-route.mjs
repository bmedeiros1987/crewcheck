import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createGoogleCurrentReadAdapter } from '../../server/billing-current-read-adapters.mjs';
import { createGoogleEventObserver } from '../../server/google-event-observation.mjs';
import { hasGoogleEventReceipt } from '../../server/google-event-transaction.mjs';

export const qaPackage = 'com.crewcheck.app';
export const qaProduct = 'synthetic.monthly';
export const qaPlan = 'premium_monthly';
export const qaCatalog = new Map([[qaProduct, qaPlan]]);
export const hash = value => createHash('sha256').update(value).digest('hex');
const audience = 'https://rtdn.example.invalid';
const serviceAccount = 'events@example.invalid';
const publisherToken = 'SYNTHETIC_PUBLISHER_AUTH';
const source = fs.readFileSync('server/platform.mjs', 'utf8');

export function platformFunctionBlock(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from);
  return source.slice(from, to);
}

export function googleRtdnMessage(purchaseToken, eventId, extra = {}) {
  const notification = { packageName: qaPackage, subscriptionNotification: { purchaseToken }, ...extra };
  return { message: { messageId: eventId, data: Buffer.from(JSON.stringify(notification)).toString('base64') } };
}

export function googleRtdnPayload(publicId, state = 'ACTIVE') {
  return {
    etag: 'SYNTHETIC_ETAG', subscriptionState: 'SUBSCRIPTION_STATE_' + state,
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED', externalAccountIdentifiers: { obfuscatedExternalAccountId: publicId },
    lineItems: [{ productId: qaProduct, expiryTime: state === 'EXPIRED' ? '2020-01-01T00:00:00Z' : '2099-01-01T00:00:00Z',
      latestSuccessfulOrderId: 'SYNTHETIC_ORDER', autoRenewingPlan: { autoRenewEnabled: state === 'ACTIVE' } }],
  };
}

export function createRtdnFixture({ database, readProvider, claims, configured = true, createObserver = createGoogleEventObserver }) {
  assert(source.includes("if (url.pathname === '/api/platform/billing/google-play/rtdn') { await handleGoogleRtdn(req, res); return true; }"));
  const counts = { verifiedAuth: 0, body: 0, database: 0, publisher: 0 };
  const env = (name, fallback) => ({ GOOGLE_PLAY_RTDN_AUDIENCE: configured ? audience : '', GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL: serviceAccount, GOOGLE_PLAY_PACKAGE_NAME: qaPackage }[name] ?? fallback);
  const auth = platformFunctionBlock('async function verifyGooglePubSubIdentity(', '\nasync function asaasRequest(');
  const route = platformFunctionBlock('const googleRtdnObservers =', '\nfunction meaningfulComplianceAlerts(');
  const fetch = async (uri, options) => {
    const url = new URL(uri);
    if (url.origin === 'https://oauth2.googleapis.com' && url.pathname === '/tokeninfo') {
      counts.verifiedAuth++;
      assert.equal(url.searchParams.get('id_token'), 'SYNTHETIC_PUSH_IDENTITY');
      const data = claims ?? { aud: audience, email: serviceAccount, email_verified: true };
      return { ok: true, json: async () => data };
    }
    const endpoint = '/androidpublisher/v3/applications/' + qaPackage + '/purchases/subscriptionsv2/tokens/';
    assert.equal(url.origin, 'https://androidpublisher.googleapis.com');
    assert(url.pathname.startsWith(endpoint));
    assert.equal(url.search, '');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.authorization, 'Bearer ' + publisherToken);
    const purchaseToken = decodeURIComponent(url.pathname.slice(endpoint.length));
    counts.publisher++;
    const body = await readProvider(purchaseToken);
    return { status: 200, json: async () => body };
  };
  const compile = new Function(
    'env', 'safeEmail', 'fetch', 'readBody', 'pool', 'sendJson', 'sha256', 'hasGoogleEventReceipt',
    'createGoogleCurrentReadAdapter', 'createGoogleEventObserver', 'GOOGLE_PLAY_PRODUCTS', 'googleAccessToken',
    auth + route + '\nreturn handleGoogleRtdn;',
  );
  const handle = compile(env, value => String(value || '').trim().toLowerCase(), fetch,
    async (request, limit) => { counts.body++; assert.equal(limit, 1_000_000); return request.fixtureBody; },
    async () => { counts.database++; return database; },
    (response, status, body) => Object.assign(response, { status, body }), hash, hasGoogleEventReceipt,
    createGoogleCurrentReadAdapter, createObserver, qaCatalog, async () => publisherToken,
  );
  const run = (fixtureBody, { method = 'POST', authorization = 'Bearer SYNTHETIC_PUSH_IDENTITY' } = {}) =>
    handle({ method, headers: { authorization }, fixtureBody }, {});
  return { run, counts };
}
