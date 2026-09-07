import assert from 'node:assert/strict';
import {
  BRASILIA_TRANSIT_SOURCES,
  brasiliaMobilitySourcePolicy,
  fetchOfficialJson,
  getBrasiliaTransitCapabilities,
  getBrasiliaTransitConfig,
} from '../server/integrations/brasiliaTransit.mjs';

assert.equal(BRASILIA_TRANSIT_SOURCES.semobDfGtfs.official, true);
assert.equal(BRASILIA_TRANSIT_SOURCES.dfNoPonto.official, true);
assert.equal(BRASILIA_TRANSIT_SOURCES.metroDf.official, true);

const empty = getBrasiliaTransitCapabilities({});
assert.equal(empty.region, 'BRASILIA_DF');
assert.equal(empty.staticTransit.ready, false);
assert.equal(empty.railRealtime.ready, false);
assert.equal(empty.busRealtime.ready, false);

const configured = getBrasiliaTransitCapabilities({
  SEMOB_DF_GTFS_URL: 'https://example.gov.br/gtfs.zip',
  METRO_DF_STATUS_URL: 'https://example.gov.br/metro/status',
  BRASILIA_TRANSIT_TIMEOUT_MS: '5000',
});
assert.equal(configured.staticTransit.ready, true);
assert.equal(configured.railRealtime.ready, true);
assert.equal(configured.staticTransit.url, 'https://example.gov.br/gtfs.zip');

const cfg = getBrasiliaTransitConfig({ BRASILIA_TRANSIT_TIMEOUT_MS: '9000' });
assert.equal(cfg.timeoutMs, 9000);
assert.throws(() => getBrasiliaTransitConfig({ SEMOB_DF_GTFS_URL: 'ftp://example.gov.br/file' }), /INVALID_URL/);
assert.throws(() => getBrasiliaTransitConfig({ METRO_DF_STATUS_URL: 'https://user:pass@example.gov.br/status' }), /EMBEDDED_CREDENTIALS_FORBIDDEN/);
assert.throws(() => getBrasiliaTransitConfig({ BRASILIA_TRANSIT_TIMEOUT_MS: '20' }), /TIMEOUT_MS_INVALID/);

const policy = brasiliaMobilitySourcePolicy();
assert.equal(policy.useOnlyDocumentedOrAuthorizedInterfaces, true);
assert.equal(policy.neverScrapePrivateAppEndpoints, true);
assert.equal(policy.canonicalRosterMayBeReadButNeverMutated, true);

let requestedUrl = null;
const payload = await fetchOfficialJson('https://example.gov.br/status', {
  timeout: 1000,
  fetchImpl: async (url, options) => {
    requestedUrl = url;
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.accept, 'application/json');
    return { ok: true, json: async () => ({ status: 'normal' }) };
  },
});
assert.equal(requestedUrl, 'https://example.gov.br/status');
assert.deepEqual(payload, { status: 'normal' });

await assert.rejects(
  () => fetchOfficialJson('https://example.gov.br/status', {
    fetchImpl: async () => ({ ok: false, status: 503 }),
  }),
  error => error?.code === 'BRASILIA_TRANSIT_UPSTREAM_ERROR' && error?.status === 503,
);

console.log('Brasília transit provider pack regression OK');
