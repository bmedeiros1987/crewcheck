import assert from 'node:assert/strict';

process.env.AISWEB_API_KEY = '';
process.env.AISWEB_API_PASS = '';
const { aiswebConfiguration, diagnoseAiswebNotam } = await import('../server/aisweb-diagnostic.mjs');

assert.equal(aiswebConfiguration().configured, false);
assert.deepEqual(await diagnoseAiswebNotam(), {
  ok: false,
  provider: 'aisweb-decea',
  state: 'not_configured',
  configured: false,
});

process.env.AISWEB_API_KEY = 'secret-key';
process.env.AISWEB_API_PASS = 'secret-pass';

let requestedUrl = '';
const available = await diagnoseAiswebNotam({
  icao: 'SBBR',
  fetchImpl: async (url) => {
    requestedUrl = String(url);
    return {
      status: 200,
      text: async () => '<aisweb><notam id="TEST" /></aisweb>',
    };
  },
});

assert.equal(available.ok, true);
assert.equal(available.state, 'available');
assert.equal(available.query.icao, 'SBBR');
assert.equal(available.contentTypeHint, 'xml');
assert.match(requestedUrl, /area=notam/);
assert.match(requestedUrl, /icaoCode=SBBR/);
assert.match(requestedUrl, /apiKey=secret-key/);
assert.match(requestedUrl, /apiPass=secret-pass/);
assert.equal(JSON.stringify(available).includes('secret-key'), false);
assert.equal(JSON.stringify(available).includes('secret-pass'), false);
assert.equal(JSON.stringify(available).includes('TEST'), false, 'raw NOTAM body must never be returned by the diagnostic');

const denied = await diagnoseAiswebNotam({
  fetchImpl: async () => ({ status: 403, text: async () => '<error>Invalid API Key</error>' }),
});
assert.equal(denied.ok, false);
assert.equal(denied.state, 'authentication_failed');

const normalizedIcao = await diagnoseAiswebNotam({
  icao: 'invalid',
  fetchImpl: async () => ({ status: 200, text: async () => '<ok />' }),
});
assert.equal(normalizedIcao.query.icao, 'SBBR');

const timeout = await diagnoseAiswebNotam({
  fetchImpl: async (_url, { signal }) => ({
    status: 200,
    text: async () => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    }),
  }),
  timeoutMs: 5,
});
assert.equal(timeout.ok, false);
assert.equal(timeout.state, 'timeout');

process.env.AISWEB_API_BASE_URL = 'not a valid url';
const malformedBase = await diagnoseAiswebNotam();
assert.equal(malformedBase.ok, false);
assert.equal(malformedBase.state, 'configuration_error');
assert.equal(JSON.stringify(malformedBase).includes('secret-key'), false);
assert.equal(JSON.stringify(malformedBase).includes('secret-pass'), false);
delete process.env.AISWEB_API_BASE_URL;

console.log('AISWEB sanitized diagnostic regression OK');
