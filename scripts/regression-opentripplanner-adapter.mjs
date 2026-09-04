import assert from 'node:assert/strict';
import {
  opentripplannerConfig,
  opentripplannerPlanTrip,
  opentripplannerRequest,
} from '../server/integrations/opentripplanner.mjs';

const env = {
  OTP_BASE_URL: 'http://otp.internal:8080',
  OTP_TIMEOUT_MS: '2000',
  OTP_AUTH_TOKEN: 'secret-token',
};

assert.equal(opentripplannerConfig({}).configured, false);
assert.equal(opentripplannerConfig(env).graphqlUrl, 'http://otp.internal:8080/otp/gtfs/v1');
assert.equal(opentripplannerConfig(env).configured, true);

const calls = [];
const fetchImpl = async (url, init) => {
  calls.push({ url: String(url), init });
  return new Response(JSON.stringify({
    data: {
      planConnection: {
        edges: [{
          node: {
            start: '2026-09-04T12:00:00-03:00',
            end: '2026-09-04T12:45:00-03:00',
            legs: [{
              mode: 'BUS',
              from: { name: 'Origem', lat: -15.8, lon: -47.9 },
              to: { name: 'Destino', lat: -15.86, lon: -47.91 },
              route: { gtfsId: 'feed:route', longName: 'Linha teste', shortName: '123' },
              legGeometry: { points: 'encoded' },
            }],
          },
        }],
      },
    },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

const result = await opentripplannerPlanTrip({
  origin: { latitude: -15.7942, longitude: -47.8822 },
  destination: { latitude: -15.8697, longitude: -47.9172 },
  latestArrival: '2026-09-04T13:30:00-03:00',
  directModes: ['walk'],
  transitModes: ['bus', 'rail'],
  first: 3,
}, { environment: env, fetchImpl });

assert.equal(calls.length, 1);
assert.equal(calls[0].url, 'http://otp.internal:8080/otp/gtfs/v1');
assert.equal(calls[0].init.method, 'POST');
assert.equal(calls[0].init.headers.authorization, 'Bearer secret-token');
assert.ok(!calls[0].url.includes('secret-token'), 'OTP token must not leak into URL');
const body = JSON.parse(calls[0].init.body);
assert.match(body.query, /latestArrival: "2026-09-04T13:30:00-03:00"/);
assert.match(body.query, /direct: \[WALK\]/);
assert.match(body.query, /transit: \{ transit: \[\{ mode: BUS \}, \{ mode: RAIL \}\] \}/);
assert.equal(result.provider, 'opentripplanner');
assert.equal(result.queryMode, 'arrive-by');
assert.equal(result.itineraries.length, 1);
assert.equal(result.itineraries[0].durationSeconds, 2700);
assert.equal(result.itineraries[0].legs[0].mode, 'BUS');
assert.equal(result.itineraries[0].legs[0].geometry, 'encoded');

await assert.rejects(
  () => opentripplannerPlanTrip({
    origin: { latitude: 999, longitude: -47.9 },
    destination: { latitude: -15.8, longitude: -47.9 },
    earliestDeparture: '2026-09-04T12:00:00-03:00',
  }, { environment: env, fetchImpl }),
  /Invalid origin latitude/,
);

await assert.rejects(
  () => opentripplannerPlanTrip({
    origin: { latitude: -15.8, longitude: -47.9 },
    destination: { latitude: -15.86, longitude: -47.91 },
    earliestDeparture: '2026-09-04T12:00:00-03:00',
    latestArrival: '2026-09-04T13:00:00-03:00',
  }, { environment: env, fetchImpl }),
  /exactly one/,
);

await assert.rejects(
  () => opentripplannerPlanTrip({
    origin: { latitude: -15.8, longitude: -47.9 },
    destination: { latitude: -15.86, longitude: -47.91 },
    earliestDeparture: '2026-09-04T12:00:00-03:00',
    transitModes: ['AIRPLANE'],
  }, { environment: env, fetchImpl }),
  /Invalid transitModes/,
);

await assert.rejects(
  () => opentripplannerRequest('query { routes { gtfsId } }', { environment: {}, fetchImpl }),
  (error) => error?.code === 'OTP_NOT_CONFIGURED',
);

const graphqlErrorFetch = async () => new Response(JSON.stringify({ errors: [{ message: 'bad query' }] }), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});
await assert.rejects(
  () => opentripplannerRequest('query { bad }', { environment: env, fetchImpl: graphqlErrorFetch }),
  (error) => error?.code === 'OTP_GRAPHQL_ERROR',
);

console.log('OpenTripPlanner adapter regression OK');
