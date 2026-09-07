import assert from 'node:assert/strict';
import {
  transitlandConfig,
  transitlandNearbyRoutes,
  transitlandNearbyStops,
  transitlandStopDepartures,
} from '../server/integrations/transitland.mjs';

const env = {
  TRANSITLAND_API_KEY: 'test-key',
  TRANSITLAND_BASE_URL: 'https://transit.land/api/v2/rest',
  TRANSITLAND_TIMEOUT_MS: '2000',
};

assert.equal(transitlandConfig({}).configured, false);
assert.equal(transitlandConfig(env).configured, true);

const calls = [];
const fetchImpl = async (url, init) => {
  calls.push({ url: String(url), init });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

await transitlandNearbyStops(
  { latitude: -15.8697, longitude: -47.9172, radius: 1200 },
  { environment: env, fetchImpl },
);

assert.match(calls[0].url, /\/stops\?/);
assert.match(calls[0].url, /lat=-15\.8697/);
assert.match(calls[0].url, /lon=-47\.9172/);
assert.match(calls[0].url, /radius=1200/);
assert.equal(calls[0].init.headers.apikey, 'test-key');
assert.ok(!calls[0].url.includes('test-key'), 'API key must not leak into URL');

await transitlandNearbyRoutes(
  { latitude: -15.8697, longitude: -47.9172, routeTypes: [1, 3] },
  { environment: env, fetchImpl },
);
assert.match(calls[1].url, /\/routes\?/);
assert.match(calls[1].url, /route_types=1%2C3/);

await transitlandStopDepartures(
  { stopKey: 'f-test:BSB', nextSeconds: 1800, limit: 12 },
  { environment: env, fetchImpl },
);
assert.match(calls[2].url, /\/stops\/f-test%3ABSB\/departures\?/);
assert.match(calls[2].url, /next=1800/);
assert.match(calls[2].url, /limit=12/);

assert.throws(
  () => transitlandNearbyStops({ latitude: 999, longitude: -47.9 }, { environment: env, fetchImpl }),
  /Invalid latitude/,
);
assert.throws(
  () => transitlandNearbyStops({ latitude: -15.8, longitude: -47.9, radius: 10001 }, { environment: env, fetchImpl }),
  /Invalid radius/,
);
await assert.rejects(
  () => transitlandNearbyStops({ latitude: -15.8, longitude: -47.9 }, { environment: {}, fetchImpl }),
  (error) => error?.code === 'TRANSITLAND_NOT_CONFIGURED',
);

console.log('Transitland adapter regression OK');
