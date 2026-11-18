import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativePushSender, sendNativePush } from '../server/native-push/sender.mjs';
import { NATIVE_PACKAGE, NATIVE_PROJECT } from '../server/native-push/registry.mjs';

const NOW = Date.parse('2031-04-17T10:00:00Z');
const ID = '68ef055d-7d00-48f2-a39e-ec9ef3c118af';
const ACCESS = 'fixture.access-token';
const JOB = Object.freeze({id: ID, token: 'synthetic-registration-value-001', project: NATIVE_PROJECT,
  package: NATIVE_PACKAGE, scheduledAt: NOW, expiresAt: NOW + 60_000});
const providerResult = (status = 200, name = `projects/${NATIVE_PROJECT}/messages/fixture-response-001`) => ({
  status, json: async () => ({name, ignored: 'fixture-private-provider-content'}),
});
const expected = state => ({enabled: state !== 'disabled', state, providerAccepted: state === 'accepted_unconfirmed', received: null});
const poison = () => { throw new Error('Unexpected I/O'); };
function fixture(overrides = {}) {
  const calls = [];
  const send = createNativePushSender({
    enabled: true,
    clock: () => NOW,
    withAuthorizedDelivery: async (id, run) => { calls.push(['claim', id]); return run(JOB); },
    getAccessToken: async () => { calls.push(['credential']); return ACCESS; },
    request: async (url, options) => { calls.push(['request', url, options]); return providerResult(); },
    ...overrides,
  });
  return {calls, send};
}

test('default sender does not read a delivery or any injected adapter', async () => {
  const input = new Proxy({}, {get: poison});
  assert.deepEqual(await sendNativePush(input), expected('disabled'));
  const off = createNativePushSender({withAuthorizedDelivery: poison, request: poison, getAccessToken: poison, clock: poison});
  assert.deepEqual(await off(input), expected('disabled'));
  assert.deepEqual(await createNativePushSender({enabled: true})(ID), expected('unconfigured'));
  const {send, calls} = fixture();
  assert.deepEqual(await send('https://example.invalid/target'), expected('blocked'));
  assert.deepEqual(calls, []);
});

test('only admitted, due, unexpired delivery for the pinned project and package may send', async () => {
  const cases = [
    [null, 'blocked'], [{...JOB, id: 'different_delivery'}, 'blocked'],
    [{...JOB, project: 'different-project'}, 'blocked'], [{...JOB, package: 'com.other.app'}, 'blocked'],
    [{...JOB, token: 'unsafe\nregistration-value-001'}, 'blocked'],
    [{...JOB, expiresAt: NOW + 999}, 'expired'], [{...JOB, scheduledAt: NOW + 1}, 'not_due'],
  ];
  for (const [job, state] of cases) {
    const f = fixture({withAuthorizedDelivery: async (_, run) => { if (job) await run(job); }});
    assert.deepEqual(await f.send(ID), expected(state));
    assert.deepEqual(f.calls, []);
  }
});

test('provider request has a fixed target, a bounded lifetime and data only', async () => {
  const f = fixture();
  assert.deepEqual(await f.send(ID), expected('accepted_unconfirmed'));
  assert.deepEqual(f.calls.map(call => call[0]), ['claim', 'credential', 'request']);
  const [, url, request] = f.calls[2];
  assert.equal(url, `https://fcm.googleapis.com/v1/projects/${NATIVE_PROJECT}/messages:send`);
  assert.equal(request.method, 'POST');
  assert.equal(request.redirect, 'error');
  assert.equal(request.headers.authorization, `Bearer ${ACCESS}`);
  assert.deepEqual(JSON.parse(request.body), {message: {
    token: JOB.token,
    data: {kind: 'crewcheck-update-v1', eventId: ID, expiresAt: String(NOW + 60_000)},
    android: {ttl: '60s', restricted_package_name: NATIVE_PACKAGE, priority: 'normal'},
  }});
  const long = fixture({withAuthorizedDelivery: async (_, run) => run({...JOB, expiresAt: NOW + 172_800_000})});
  await long.send(ID);
  assert.equal(JSON.parse(long.calls.at(-1)[2].body).message.android.ttl, '86400s');
});

test('expiration after credential lookup and malformed credentials never reach the provider', async () => {
  let now = NOW;
  const late = fixture({clock: () => now, getAccessToken: async () => { now = JOB.expiresAt; return ACCESS; }});
  assert.deepEqual(await late.send(ID), expected('expired'));
  assert.equal(late.calls.some(([step]) => step === 'request'), false);
  const invalid = fixture({getAccessToken: async () => 'something\r\nwrong'});
  assert.deepEqual(await invalid.send(ID), expected('credentials_unavailable'));
  assert.equal(invalid.calls.some(([step]) => step === 'request'), false);
});

test('recipient and expiry come from the snapshot admitted before credential lookup', async () => {
  const record = {...JOB};
  const f = fixture({withAuthorizedDelivery: async (_, run) => run(record), getAccessToken: async () => {
    record.token = 'different-registration-value-002';
    record.expiresAt += 24 * 3600_000;
    return ACCESS;
  }});
  assert.deepEqual(await f.send(ID), expected('accepted_unconfirmed'));
  const {message} = JSON.parse(f.calls.at(-1)[2].body);
  assert.equal(message.token, JOB.token);
  assert.equal(message.data.expiresAt, String(JOB.expiresAt));
});

test('provider acceptance requires the pinned project receipt and never claims delivery', async () => {
  for (const [status, name, state] of [
    [200, 'projects/other/messages/wrong', 'uncertain'], [200, 'missing', 'uncertain'],
    [401, 'unauthorized', 'rejected'], [404, 'unregistered', 'rejected'],
    [429, 'rate limited', 'uncertain'], [503, 'unavailable', 'uncertain'],
  ]) {
    let requests = 0;
    const f = fixture({request: async () => { requests++; return providerResult(status, name); }});
    assert.deepEqual(await f.send(ID), expected(state));
    assert.equal(requests, 1);
  }
});

test('bounded fake transport timeout and network errors remain uncertain without a retry', async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    let requests = 0;
    let signal;
    const slow = fixture({timeoutMs: 35, request: (_, options) => {
      requests++;
      signal = options.signal;
      return new Promise(() => {});
    }});
    assert.deepEqual(await slow.send(ID), expected('uncertain'));
    assert.equal(signal.aborted, true);
    assert.equal(requests, 1);
    const broken = fixture({request: async () => { throw new Error(JOB.token); }});
    assert.deepEqual(await broken.send(ID), expected('uncertain'));
  } finally { clearTimeout(keepAlive); }
});

test('single-attempt queue fixture does not reopen a lost commit or concurrent claim', async () => {
  const attempts = new Set();
  let sends = 0;
  const fixtureStore = async (id, run) => {
    if (attempts.has(id)) return;
    attempts.add(id); // fixture stand-in for the previously committed, durable claim
    await run(JOB);
    await run(JOB); // callback misuse by an adapter must not issue a second request
    throw Error('Synthetic completion write lost');
  };
  const f = fixture({withAuthorizedDelivery: fixtureStore, request: async () => { sends++; return providerResult(); }});
  const [first, concurrent] = await Promise.all([f.send(ID), f.send(ID)]);
  assert.deepEqual(first, expected('uncertain'));
  assert.deepEqual(concurrent, expected('blocked'));
  assert.equal(sends, 1);
  assert.deepEqual(await f.send(ID), expected('blocked'));
  assert.equal(sends, 1);
});

test('a late callback after the authority adapter returns cannot send', async () => {
  let callback;
  const late = fixture({withAuthorizedDelivery: async (_, run) => { callback = run; }});
  assert.deepEqual(await late.send(ID), expected('blocked'));
  assert.deepEqual(await callback(JOB), expected('blocked'));
  assert.deepEqual(late.calls, []);
});

test('mounted v139 Android registry answers OFF only at the exact path and leaves the body unread', async () => {
  const {handleV139Route} = await import('../server/v139/index.mjs');
  const req = {method: 'POST', headers: {}, [Symbol.asyncIterator]: poison};
  const response = {};
  const res = {writeHead(status, headers) { Object.assign(response, {status, headers}); },
    end(body) { response.body = JSON.parse(body); }};
  const url = new URL('http://127.0.0.1/api/platform/notifications/android-installation');
  assert.equal(await handleV139Route(req, res, url), true);
  assert.equal(response.status, 503);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.body, {ok: false, code: 'NATIVE_REGISTRY_OFF', state: 'disabled', registryConfirmed: false, received: null});
  assert.equal(await handleV139Route({...req, method: 'GET'}, res, url), true);
  assert.equal(response.status, 503);
  assert.equal(await handleV139Route(req, {writeHead: poison, end: poison}, new URL(url.href + '-extra')), false);
});
