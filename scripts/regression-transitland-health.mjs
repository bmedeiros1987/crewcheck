import assert from 'node:assert/strict';
import { transitlandHealthSnapshot } from '../server/v1413/transitlandHealth.mjs';

const missing = await transitlandHealthSnapshot({ environment: {}, fetchImpl: async () => { throw new Error('must not call'); } });
assert.equal(missing.configured, false);
assert.equal(missing.reachable, false);
assert.equal(missing.coverage, false);

const calls = [];
const fetchImpl = async (url, init) => {
  calls.push({ url: String(url), init });
  const isStops = String(url).includes('/stops?');
  return new Response(JSON.stringify(isStops ? { stops: [{ id: 's1' }, { id: 's2' }] } : { routes: [{ id: 'r1' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
const env = { TRANSITLAND_API_KEY: 'secret-test-key', TRANSITLAND_TIMEOUT_MS: '2000' };
const healthy = await transitlandHealthSnapshot({ environment: env, fetchImpl });
assert.equal(healthy.ok, true);
assert.equal(healthy.configured, true);
assert.equal(healthy.reachable, true);
assert.equal(healthy.coverage, true);
assert.deepEqual(healthy.counts, { stops: 2, routes: 1 });
assert.equal(calls.length, 2);
for (const call of calls) {
  assert.equal(call.init.headers.apikey, 'secret-test-key');
  assert.ok(!call.url.includes('secret-test-key'), 'secret must never appear in URL');
}
assert.equal(JSON.stringify(healthy).includes('secret-test-key'), false, 'health response must never expose secret');

const emptyFetch = async () => new Response(JSON.stringify({ stops: [], routes: [] }), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});
const empty = await transitlandHealthSnapshot({ environment: env, fetchImpl: emptyFetch });
assert.equal(empty.ok, true);
assert.equal(empty.reachable, true);
assert.equal(empty.coverage, false);

const failedFetch = async () => new Response(JSON.stringify({ error: 'upstream' }), {
  status: 503,
  headers: { 'content-type': 'application/json' },
});
const failed = await transitlandHealthSnapshot({ environment: env, fetchImpl: failedFetch });
assert.equal(failed.ok, false);
assert.equal(failed.configured, true);
assert.equal(failed.reachable, false);
assert.equal(failed.code, 'TRANSITLAND_UPSTREAM_ERROR');

console.log('Transitland health regression OK');
