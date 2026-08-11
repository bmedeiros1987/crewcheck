import assert from 'node:assert/strict';

for (const name of [
  'CIRIUM_SKY_API_TOKEN', 'CIRIUM_SKY_SECRET', 'CIRIUM_SKY_IDENTIFIER', 'CIRIUM_SKY_BASE_URL',
  'CIRIUM_APP_ID', 'CIRIUM_APP_KEY',
]) process.env[name] = '';

const { diagnoseCirium, diagnoseCiriumFlight, normalizeCiriumResult, ciriumConfiguration } = await import('../server/cirium-diagnostic.mjs');

assert.deepEqual(await diagnoseCirium(), {
  ok: true, provider: 'cirium-sky', state: 'not_configured', configured: false,
});
assert.equal(normalizeCiriumResult(403, { error: { errorMessage: 'Evaluation plan pending approval' } }), 'plan_pending');
assert.equal(normalizeCiriumResult(403, { error: { errorMessage: 'Access denied' } }), 'forbidden');
assert.equal(normalizeCiriumResult(403, { error: { code: 'quota_exceeded', message: 'Usage quota reached' } }), 'quota');
assert.equal(normalizeCiriumResult(401, { error: { code: 'invalid_token', message: 'Authorization header is invalid' } }), 'forbidden');
assert.equal(normalizeCiriumResult(200, { flightStatuses: [] }), 'available');

process.env.CIRIUM_SKY_IDENTIFIER = 'test-identifier';
process.env.CIRIUM_SKY_SECRET = 'test-sky-secret';
process.env.CIRIUM_SKY_BASE_URL = 'https://api.sky.cirium.com';
assert.equal(ciriumConfiguration().mode, 'sky');
assert.equal(ciriumConfiguration().provider, 'cirium-sky');

let requestedUrl = '';
let requestedHeaders = null;
const available = await diagnoseCirium({ fetchImpl: async (url, options) => {
  requestedUrl = String(url);
  requestedHeaders = options.headers;
  return { status: 200, json: async () => ({ flightStatuses: [] }) };
} });
assert.equal(available.state, 'available');
assert.match(requestedUrl, /^https:\/\/api\.sky\.cirium\.com\/v1\/flights\/status\/airline\/LA\/flight-number\/3377\/departure-date\//);
assert.equal(requestedHeaders.authorization, 'test-sky-secret');
assert.equal(available.credentialIdentifierConfigured, true);
assert.equal(JSON.stringify(available).includes('test-sky-secret'), false);
assert.equal(JSON.stringify(available).includes('test-identifier'), false);

const flightResult = await diagnoseCiriumFlight({ carrier: 'LA', flight: '3850', date: '2026-08-11', fetchImpl: async (url, options) => {
  assert.match(String(url), /\/v1\/flights\/status\/airline\/LA\/flight-number\/3850\/departure-date\/2026-08-11/);
  assert.match(String(url), /extendedOptions=includeDeltas%2CincludeNewFields/);
  assert.equal(options.headers.authorization, 'test-sky-secret');
  return {
    status: 200,
    json: async () => ({ flightStatuses: [{
      flightId: 123, carrierFsCode: 'LA', flightNumber: '3850', status: 'A',
      departureAirportFsCode: 'BSB', arrivalAirportFsCode: 'THE', lastUpdatedDate: '2026-08-11T12:30:00Z',
      airportResources: { departureTerminal: '1', departureGate: '5', arrivalTerminal: '1', arrivalGate: '2', baggage: '4' },
      operationalTimes: {
        scheduledGateDeparture: { dateUtc: '2026-08-11T12:20:00Z' },
        estimatedGateDeparture: { dateUtc: '2026-08-11T12:23:00Z' },
        actualGateDeparture: { dateUtc: '2026-08-11T12:24:00Z' },
        scheduledGateArrival: { dateUtc: '2026-08-11T14:34:00Z' },
        estimatedGateArrival: { dateUtc: '2026-08-11T14:31:00Z' },
      },
      flightEquipment: { scheduledEquipmentIataCode: '321', actualEquipmentIataCode: '32B', tailNumber: 'PT-TEST' },
      delays: { departureGateDelayMinutes: 4, arrivalGateDelayMinutes: -3 },
      flightDurations: { scheduledBlockMinutes: 134, blockMinutes: 127 },
      codeshares: [{ fsCode: 'JJ', flightNumber: '3850', relationship: 'L' }],
      irregularOperations: [],
    }] }),
  };
} });
assert.equal(flightResult.state, 'available');
assert.equal(flightResult.provider, 'cirium-sky');
assert.equal(flightResult.flights[0].resources.departureGate, '5');
assert.equal(flightResult.flights[0].resources.baggage, '4');
assert.equal(flightResult.flights[0].equipment.actual, '32B');
assert.equal(flightResult.flights[0].equipment.tailNumber, 'PT-TEST');
assert.equal(flightResult.flights[0].delays.departureGateMinutes, 4);
assert.equal(flightResult.flights[0].durations.scheduledBlockMinutes, 134);
assert.equal(flightResult.flights[0].presence.actual, true);
assert.equal(flightResult.flights[0].presence.registration, true);
assert.equal(JSON.stringify(flightResult).includes('test-sky-secret'), false);
assert.equal((await diagnoseCiriumFlight({ date: 'not-a-date' })).reason, 'invalid_date');

process.env.CIRIUM_SKY_SECRET = '';
process.env.CIRIUM_SKY_IDENTIFIER = '';
process.env.CIRIUM_APP_ID = 'test-app-id';
process.env.CIRIUM_APP_KEY = 'test-app-key';
assert.equal(ciriumConfiguration().mode, 'flex');
let flexUrl = '';
const legacy = await diagnoseCirium({ fetchImpl: async (url) => {
  flexUrl = String(url);
  return { status: 200, json: async () => ({ airlines: [{ iata: 'LA' }] }) };
} });
assert.equal(legacy.provider, 'cirium-flightstats');
assert.match(flexUrl, /appId=test-app-id/);
assert.match(flexUrl, /appKey=test-app-key/);
assert.equal(JSON.stringify(legacy).includes('test-app'), false);

const source = await (await import('node:fs/promises')).readFile(new URL('../server/platform.mjs', import.meta.url), 'utf8');
assert.match(source, /identity\.authenticated/);
assert.match(source, /identity\.admin/);
assert.match(source, /\/api\/platform\/admin\/diagnostics\/cirium/);
assert.match(source, /\/api\/platform\/admin\/diagnostics\/cirium\/flight/);

console.log('Cirium Sky + legacy diagnostic regression OK');
