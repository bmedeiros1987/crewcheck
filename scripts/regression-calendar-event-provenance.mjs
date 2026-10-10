import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

// Route-level regression: isolated synthetic store, empty environment, no real fetch.
const root = process.cwd();
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-calendar-proof-'));
const savedEnv = process.env;
const savedFetch = globalThis.fetch;
process.env = { CREWCHECK_AUTH_SECRET: 'synthetic-test-secret-only' };
process.chdir(fixtureDir);
const secret = process.env.CREWCHECK_AUTH_SECRET;
const identity = { sub: 'synthetic-user-a' };
const otherIdentity = { sub: 'synthetic-user-b' };
const grant = 'synthetic-grant-a';
const keyFor = (who) => crypto.createHash('sha256').update(`crewcheck-google:${who.sub}`).digest('hex');
function encrypt(payload) {
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(secret, 'crewcheck-google-calendar-oauth-v1', 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const content = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return [iv, cipher.getAuthTag(), content].map((part) => part.toString('base64url')).join('.');
}
function seedToken(who = identity, refreshToken = grant, expired = false, verified = true) {
  const file = path.join(fixtureDir, '.crewcheck-google-oauth-store.json');
  const store = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  store[`token:${keyFor(who)}`] = { payload: encrypt({ access_token: `synthetic-access-${who.sub}`,
    refresh_token: refreshToken, calendar_provenance_grant_verified: verified, expires_at: expired ? 1 : Date.now() + 3_600_000 }) };
  fs.writeFileSync(file, JSON.stringify(store));
}
let calls = [];
let applied = 0;
let getStatus = 200;
let mutationStatus = 200;
let malformed = false;
let throwGet = false;
let race = false;
let tokenStatus = 200;
let current;
const response = (status, payload) => new Response(status === 204 ? null : JSON.stringify(payload), { status });
globalThis.fetch = async (url, options) => {
  calls.push({ url, ...options });
  if (url === 'https://oauth2.googleapis.com/token') {
    return response(tokenStatus, { access_token: 'synthetic-refreshed', expires_in: 3600 });
  }
  assert.match(url, /^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/primary\/events(?:\/[A-Za-z0-9_-]+)?(?:\?sendUpdates=none)?$/);
  if (options.method === 'GET') {
    if (throwGet) throw new Error('synthetic read failure');
    return malformed ? new Response('not-json', { status: 200 }) : response(getStatus, current);
  }
  if (options.method === 'POST') {
    const event = JSON.parse(options.body);
    if (mutationStatus < 300) {
      current = { ...event, etag: '"version-1"', status: 'confirmed' };
      applied++;
    }
    return response(mutationStatus, current);
  }
  assert.equal(options.headers['If-Match'], '"version-1"');
  const status = race ? 412 : mutationStatus;
  if (status < 300) applied++;
  return response(status, { error: { message: 'synthetic conflict or denial' } });
};
try {
  const { handleGoogleCalendarOAuthRoute } = await import(pathToFileURL(path.join(root, 'server/v1405/google-calendar-oauth.mjs')));
  const input = { summary: 'Synthetic roster', start: { date: '2026-10-10' }, end: { date: '2026-10-11' },
    extendedProperties: { private: { crewcheck: 'true', crewcheckPeriodKey: 'synthetic-period', crewcheckEventKey: 'synthetic-event' } } };
  async function request(method, eventId = current?.id, body = undefined, who = identity, suffix = '') {
    const req = Readable.from([JSON.stringify({ path: `/calendars/primary/events${eventId ? `/${eventId}` : ''}${suffix}`, method, body })]);
    req.method = 'POST';
    let status;
    let payload;
    const res = { writeHead(code) { status = code; }, end(raw) { payload = JSON.parse(raw); } };
    await handleGoogleCalendarOAuthRoute(req, res, new URL('https://synthetic.invalid/api/google-calendar/oauth/proxy'), { identity: who, authRequired: false });
    return { status, payload };
  }
  seedToken();
  seedToken(otherIdentity);
  assert.equal((await request('POST', '', JSON.stringify({ ...input, id: 'personalid', iCalUID: 'personal',
    extendedProperties: { private: { ...input.extendedProperties.private, crewcheckServerProof: 'forged' } } }))).status, 200);
  assert.notEqual(current.id, 'personalid');
  assert.equal(current.iCalUID, undefined);
  assert.match(current.extendedProperties.private.crewcheckServerProof, /^v1\.[A-Za-z0-9_-]{43}$/);
  const legitimate = structuredClone(current);
  assert.equal((await request('PATCH', current.id, { summary: 'Updated synthetic' })).status, 200);
  assert.equal((await request('PATCH', current.id, { extendedProperties: { private: { ...input.extendedProperties.private, crewcheckIndex: '2' } } })).status, 200);
  const patched = JSON.parse(calls.at(-1).body);
  assert.equal(patched.extendedProperties.private.crewcheckServerProof, legitimate.extendedProperties.private.crewcheckServerProof);
  assert.equal((await request('DELETE')).status, 200);
  console.log('PASS: authorized creation → PATCH/DELETE; server ID/proof; canonical context preserved');

  async function blocked(label, setup, { who = identity, body = { summary: 'blocked' }, eventId, suffix = '' } = {}) {
    for (const method of ['PATCH', 'DELETE']) {
      current = structuredClone(legitimate);
      getStatus = 200; mutationStatus = 200; malformed = false; throwGet = false; race = false;
      seedToken();
      setup(); calls = []; applied = 0;
      const result = await request(method, eventId || current?.id || legitimate.id, body, who, suffix);
      assert.ok(result.status >= 400, `${label}/${method}: rejected`);
      assert.equal(applied, 0, `${label}/${method}: no applied mutation`);
      assert.equal(calls.filter((call) => ['PATCH', 'DELETE', 'POST'].includes(call.method)).length, 0, `${label}/${method}: zero mutation calls`);
    }
    console.log(`PASS: ${label} → zero mutation calls`);
  }
  await blocked('personal text marker', () => { current = { id: legitimate.id, etag: '"version-1"', summary: 'Check-in escala', description: '#CREWCHECK' }; });
  await blocked('legacy private marker', () => { delete current.extendedProperties.private.crewcheckServerProof; });
  await blocked('forged persisted marker', () => { current.extendedProperties.private.crewcheckServerProof = `v1.${'x'.repeat(43)}`; });
  await blocked('non-ASCII forged marker', () => { current.extendedProperties.private.crewcheckServerProof = `v1.${'é'.repeat(43)}`; });
  await blocked('copied proof / other event ID', () => { current.id = 'anotherid'; }, { eventId: 'anotherid' });
  await blocked('different CrewCheck identity', () => {}, { who: otherIdentity });
  await blocked('different Google authorization/account', () => { seedToken(identity, 'synthetic-other-google-grant'); });
  await blocked('forged request marker cannot adopt personal', () => { delete current.extendedProperties; }, { body: legitimate });
  await blocked('event not found', () => { getStatus = 404; });
  await blocked('authorization read 401', () => { getStatus = 401; });
  await blocked('authorization read 403', () => { getStatus = 403; });
  await blocked('authorization read 500', () => { getStatus = 500; });
  await blocked('authorization read network failure', () => { throwGet = true; });
  await blocked('authorization read malformed JSON', () => { malformed = true; });
  await blocked('missing etag', () => { delete current.etag; });
  await blocked('context changed before read', () => { current.extendedProperties.private.crewcheckPeriodKey = 'another-period'; });
  await blocked('cancelled event', () => { current.status = 'cancelled'; });
  await blocked('query cannot suppress authorization read', () => {}, { suffix: '?fields=id' });
  await blocked('missing authenticated identity', () => {}, { who: null });
  for (const body of [{ extendedProperties: null }, { extendedProperties: { private: null } },
    { extendedProperties: { private: { crewcheckEventKey: 'other' } } }, { id: 'personalid' }, { iCalUID: 'personal' }]) {
    current = structuredClone(legitimate); calls = []; applied = 0; seedToken();
    getStatus = 200; mutationStatus = 200; malformed = false; throwGet = false;
    assert.equal((await request('PATCH', current.id, body)).status, 409);
    assert.equal(calls.filter((call) => call.method !== 'GET').length, 0);
  }
  console.log('PASS: PATCH cannot erase or change server proof/context');
  for (const method of ['PATCH', 'DELETE']) {
    for (const status of [401, 403, 412]) {
      current = structuredClone(legitimate); seedToken(); calls = []; applied = 0;
      mutationStatus = status; race = status === 412;
      const result = await request(method, current.id, { summary: 'Synthetic race' });
      assert.equal(result.status, status);
      assert.equal(applied, 0);
      assert.equal(calls.filter((call) => call.method === method).length, 1);
      assert.equal(calls.length, 2); // authorization GET + conditional request; no blind retry.
    }
  }
  console.log('PASS: race after read → If-Match/412, zero applied mutations; mutation 401/403 not retried');
  race = false; mutationStatus = 200; seedToken(identity, grant, true); current = structuredClone(legitimate);
  assert.equal((await request('PATCH', current.id, { summary: 'After access refresh' })).status, 200);
  console.log('PASS: normal access-token refresh preserves legitimate event provenance');
  seedToken(identity, grant, false, false); current = structuredClone(legitimate); calls = []; applied = 0;
  assert.equal((await request('PATCH', current.id, { summary: 'Grant verified by refresh' })).status, 200);
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(calls[1].headers.authorization, 'Bearer synthetic-refreshed');
  console.log('PASS: unverified existing access token refreshed before any event mutation');
  seedToken(identity, grant, false, false); current = structuredClone(legitimate); calls = []; applied = 0; tokenStatus = 403;
  assert.equal((await request('DELETE')).status, 401);
  assert.equal(applied, 0);
  assert.equal(calls.length, 1); // Failed grant refresh; no event GET or mutation.
  console.log('PASS: grant-refresh failure → zero event calls');
  tokenStatus = 200; seedToken();
  current = structuredClone(legitimate); calls = []; applied = 0;
  assert.equal((await request('POST', '', { summary: 'No context' })).status, 409);
  assert.equal(calls.length, 0);
  assert.equal((await request('POST', 'personalid', input)).status, 403);
  assert.equal((await request('DELETE', '')).status, 403);
  console.log('PASS: invalid create/context and collection DELETE blocked before Google');

  // Exercise the actual OAuth callback with synthetic state and token endpoint.
  // A code exchange lacking refresh_token cannot reuse a different account's grant.
  process.env.GOOGLE_OAUTH_WEB_CLIENT_ID = 'synthetic-client-id';
  process.env.GOOGLE_OAUTH_WEB_CLIENT_SECRET = 'synthetic-client-secret';
  let startPayload;
  const startRes = { writeHead(status) { assert.equal(status, 200); }, end(raw) { startPayload = JSON.parse(raw); } };
  await handleGoogleCalendarOAuthRoute({ method: 'POST' }, startRes, new URL('https://synthetic.invalid/api/google-calendar/oauth/start'), { identity });
  let callbackStatus;
  const callbackRes = { writeHead(status) { callbackStatus = status; }, end() {} };
  calls = [];
  await handleGoogleCalendarOAuthRoute({}, callbackRes,
    new URL(`https://synthetic.invalid/api/google-calendar/oauth/callback?state=${startPayload.state}&code=synthetic-code`));
  assert.equal(callbackStatus, 400);
  assert.equal(calls.length, 1);
  const encryptedStore = JSON.parse(fs.readFileSync(path.join(fixtureDir, '.crewcheck-google-oauth-store.json'), 'utf8'));
  assert.ok(encryptedStore[`token:${keyFor(identity)}`]); // Existing grant retained, not combined/replaced.
  console.log('PASS: callback with no refresh token rejects mixing Google accounts');
} finally {
  globalThis.fetch = savedFetch;
  process.env = savedEnv;
  process.chdir(root);
  fs.rmSync(fixtureDir, { recursive: true, force: true });
}
