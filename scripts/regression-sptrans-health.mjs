import assert from 'node:assert/strict';
import { sptransHealthSnapshot } from '../server/v1412/sptransHealth.mjs';

const calls = [];
const fetchImpl = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url).includes('/Login/Autenticar')) {
    return new Response('true', {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': 'ASP.NET_SessionId=test; path=/; HttpOnly',
      },
    });
  }
  if (String(url).includes('/Linha/Buscar')) {
    return new Response(JSON.stringify([{ cl: 1234, lt: '675A-10', tp: 10, ts: 20 }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
};

const missing = await sptransHealthSnapshot({ environment: {}, fetchImpl });
assert.equal(missing.configured, false);
assert.equal(missing.reachable, false);
assert.equal(missing.coverage, false);

const env = {
  SPTRANS_OLHO_VIVO_TOKEN: 'test-token',
  SPTRANS_OLHO_VIVO_TIMEOUT_MS: '2000',
};
const healthy = await sptransHealthSnapshot({ environment: env, fetchImpl });
assert.equal(healthy.ok, true);
assert.equal(healthy.configured, true);
assert.equal(healthy.reachable, true);
assert.equal(healthy.coverage, true);
assert.equal(healthy.counts.lines, 1);
assert.equal(healthy.provider, 'sptrans-olho-vivo');
assert.ok(Number.isFinite(healthy.latencyMs));
assert.ok(!JSON.stringify(healthy).includes('test-token'));
assert.ok(calls.some((call) => call.url.includes('/Login/Autenticar?token=test-token')));
assert.ok(calls.some((call) => call.url.includes('/Linha/Buscar?termosBusca=Aeroporto')));

const failedFetch = async (url) => {
  if (String(url).includes('/Login/Autenticar')) {
    return new Response('false', { status: 401, headers: { 'content-type': 'application/json' } });
  }
  throw new Error('unexpected');
};
const unhealthy = await sptransHealthSnapshot({ environment: env, fetchImpl: failedFetch });
assert.equal(unhealthy.configured, true);
assert.equal(unhealthy.reachable, false);
assert.equal(unhealthy.coverage, false);
assert.equal(unhealthy.code, 'SPTRANS_AUTH_ERROR');
assert.ok(!JSON.stringify(unhealthy).includes('test-token'));

console.log('SPTrans health regression OK');
