import assert from 'node:assert/strict';

process.env.CIRIUM_APP_ID = '';
process.env.CIRIUM_APP_KEY = '';
const { diagnoseCirium, normalizeCiriumResult } = await import('../server/cirium-diagnostic.mjs');

assert.deepEqual(await diagnoseCirium(), {
  ok: true, provider: 'cirium-flightstats', state: 'not_configured', configured: false,
});
assert.equal(normalizeCiriumResult(403, { error: { errorMessage: 'Evaluation plan pending approval' } }), 'plan_pending');
assert.equal(normalizeCiriumResult(403, { error: { errorMessage: 'Access denied' } }), 'forbidden');
assert.equal(normalizeCiriumResult(429, { error: { errorMessage: 'Transaction limit exceeded' } }), 'quota');
assert.equal(normalizeCiriumResult(200, { airlines: [{ iata: 'LA' }] }), 'available');
assert.equal(normalizeCiriumResult(200, { airlines: [] }), 'authenticated');

process.env.CIRIUM_APP_ID = 'test-app-id';
process.env.CIRIUM_APP_KEY = 'test-app-key';
let requestedUrl = '';
const available = await diagnoseCirium({ fetchImpl: async (url) => {
  requestedUrl = String(url);
  return { status: 200, json: async () => ({ airlines: [{ iata: 'LA' }] }) };
} });
assert.equal(available.state, 'available');
assert.match(requestedUrl, /appId=test-app-id/);
assert.match(requestedUrl, /appKey=test-app-key/);
assert.equal(JSON.stringify(available).includes('test-app'), false);

const source = await (await import('node:fs/promises')).readFile(new URL('../server/platform.mjs', import.meta.url), 'utf8');
assert.match(source, /identity\.authenticated/);
assert.match(source, /identity\.admin/);
assert.match(source, /\/api\/platform\/admin\/diagnostics\/cirium/);

console.log('Cirium Evaluation diagnostic regression OK');
