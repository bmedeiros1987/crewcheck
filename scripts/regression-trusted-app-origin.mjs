// Operator-configured trusted app origin: exact HTTPS only, unset by default, never from Host or
// X-Forwarded-Host, and refusals happen before identity, body or SQL. Synthetic identities only.
import assert from 'node:assert/strict';
import { configuredTrustedAppOrigin, originAllowed, TRUSTED_APP_ORIGIN_VARIABLE } from '../server/trusted-app-origin.mjs';
import { handleBidsDefaultWindow, BIDS_CONFIRMATION_ORIGINS } from '../server/v139/bidsDefaultWindow.mjs';
import { handleCrewCheckPush } from '../server/web-push/api.mjs';

const TRUSTED = 'https://recovery-host.example';
const parse = value => configuredTrustedAppOrigin({ [TRUSTED_APP_ORIGIN_VARIABLE]: value });

// 1. Configuration contract.
assert.equal(TRUSTED_APP_ORIGIN_VARIABLE in process.env, false, 'the test runs without the variable');
assert.equal(configuredTrustedAppOrigin(), '', 'unset by default: no new origin');
assert.equal(configuredTrustedAppOrigin({}), '');
assert.equal(parse(TRUSTED), TRUSTED);
assert.equal(parse('https://xn--bcher-kva.example'), 'https://xn--bcher-kva.example', 'punycode in its exact form');
for (const value of [undefined, null, '', ' ', 'null', 'recovery-host.example', 'https//recovery-host.example', 'http://recovery-host.example',
  `${TRUSTED}/`, `${TRUSTED}/app`, `${TRUSTED}?a=1`, `${TRUSTED}#x`, `${TRUSTED}:8443`, `${TRUSTED}:443`, 'https://user@recovery-host.example',
  'https://user:pass@recovery-host.example', 'https://RECOVERY-host.example', ` ${TRUSTED}`, `${TRUSTED} `, `${TRUSTED},https://crewcheck.online`,
  'https://*.code.run', 'https://*', 'https://localhost', 'https://127.0.0.1', 'https://1.2.3.4', 'https://[::1]', 'https://bücher.example',
  'wss://recovery-host.example', 'file:///etc/passwd', 'https://recovery-host.example.', 'https://-bad.example', 'https://a..example', 42, {}])
  assert.equal(parse(value), '', `refused: ${String(value)}`);
assert.equal(originAllowed(TRUSTED, [TRUSTED]), true);
for (const origin of [undefined, null, '', 'null', [TRUSTED], `${TRUSTED}/`, TRUSTED.toUpperCase()]) assert.equal(originAllowed(origin, [TRUSTED, 'null']), false);

// Handler harness: any SQL, body read or provider call during a refusal fails the test.
function harness() {
  const calls = { identify: 0, read: 0, sql: 0 };
  const db = { query: async () => { calls.sql++; throw Error('SQL is not allowed in this test'); }, getConnection: async () => { calls.sql++; throw Error('SQL is not allowed in this test'); } };
  const identify = async () => { calls.identify++; return { payload: { sub: 'owner_fixture_1' }, profile: { public_id: 'owner_fixture_1' }, email: 'synthetic@fixture.invalid', db }; };
  const read = async () => { calls.read++; return { ownerId: 'someone_else', installationId: 'x' }; };
  return { calls, identify, read };
}
async function call(handler, path, headers, options) {
  const h = harness(), res = { status: 0, body: null, setHeader() {}, writeHead(code) { this.status = code; }, end(data) { this.body = data ? JSON.parse(data) : null; } };
  await handler({ method: 'POST', headers }, res, new URL(`https://crewcheck.online${path}`), { identify: h.identify, read: h.read, ...options });
  return { status: res.status, body: res.body, ...h.calls };
}
const bids = (headers, trusted = () => '') => call(handleBidsDefaultWindow, '/api/platform/bids/default-window', headers, { trustedOrigin: trusted });
const push = (headers, trusted = () => '', configuration = () => ({ enabled: false, configured: false })) =>
  call(handleCrewCheckPush, '/api/platform/notifications/crewcheck-installation', headers, { trustedOrigin: trusted, configuration, gateHostEnabled: () => false, clock: () => 0 });
const configured = () => TRUSTED;
const refusedBeforeAnything = (result, label) => {
  assert.equal(result.status, 403, label);
  assert.deepEqual([result.identify, result.read, result.sql], [0, 0, 0], `${label}: no identity, body or SQL`);
};

// 2. Negative origins, with and without the configured origin.
const negatives = { missing: {}, null: { origin: 'null' }, malformed: { origin: 'https//recovery-host.example' }, trailingSlash: { origin: `${TRUSTED}/` },
  upperCase: { origin: 'https://RECOVERY-host.example' }, http: { origin: 'http://recovery-host.example' }, explicitPort: { origin: `${TRUSTED}:443` },
  suffix: { origin: 'https://recovery-host.example.attacker.example' }, prefix: { origin: 'https://evil-recovery-host.example' },
  sibling: { origin: 'https://other.example' }, list: { origin: `${TRUSTED}, https://crewcheck.online` } };
for (const trusted of [() => '', configured]) for (const [label, headers] of Object.entries(negatives)) {
  refusedBeforeAnything(await bids(headers, trusted), `bids ${label}`);
  refusedBeforeAnything(await push(headers, trusted), `push ${label}`);
}
// Host and forwarding headers are never a source of trust.
const spoofed = { origin: 'https://attacker.example', host: 'recovery-host.example', 'x-forwarded-host': 'recovery-host.example', 'x-forwarded-proto': 'https' };
refusedBeforeAnything(await bids(spoofed, configured), 'bids Host/X-Forwarded-Host');
refusedBeforeAnything(await push(spoofed, configured), 'push Host/X-Forwarded-Host');
const forwardedOnly = { host: 'recovery-host.example', 'x-forwarded-host': 'recovery-host.example', 'x-forwarded-proto': 'https', referer: `${TRUSTED}/` };
refusedBeforeAnything(await bids(forwardedOnly, configured), 'bids without Origin, forwarded headers only');
refusedBeforeAnything(await push(forwardedOnly, configured), 'push without Origin, forwarded headers only');
// Unset by default: the configured host's origin is not accepted until the operator sets it.
refusedBeforeAnything(await bids({ origin: TRUSTED }), 'bids origin not configured');
refusedBeforeAnything(await push({ origin: TRUSTED }), 'push origin not configured');
// Push keeps its fetch-site contract even for the trusted origin.
for (const site of ['cross-site', 'same-site']) refusedBeforeAnything(await push({ origin: TRUSTED, 'sec-fetch-site': site }, configured), `push ${site}`);
// An enabled channel accepts only its own WEB_PUSH_ORIGIN; the trusted origin does not widen it.
const enabled = () => ({ enabled: true, configured: true, origin: 'https://crewcheck.online' });
refusedBeforeAnything(await push({ origin: TRUSTED, 'sec-fetch-site': 'same-origin' }, configured, enabled), 'push enabled channel stays exclusive');

// 3. Accepted origins reach the existing identity, CAS and gates, which still decide.
for (const origin of BIDS_CONFIRMATION_ORIGINS) {
  const result = await bids({ origin });
  assert.deepEqual([result.status, result.identify, result.read, result.sql], [409, 1, 1, 0], `bids default origin ${origin} unchanged`);
}
const bidsTrusted = await bids({ origin: TRUSTED, 'sec-fetch-site': 'same-origin' }, configured);
assert.deepEqual([bidsTrusted.status, bidsTrusted.identify, bidsTrusted.read, bidsTrusted.sql], [409, 1, 1, 0], 'trusted origin passes; owner/CAS check still refuses another account, before SQL');
const pushDefault = await push({ origin: 'https://crewcheck.onrender.com' });
assert.deepEqual([pushDefault.status, pushDefault.identify, pushDefault.read, pushDefault.sql], [400, 1, 1, 0], 'push default origin unchanged');
const pushTrusted = await push({ origin: TRUSTED, 'sec-fetch-site': 'same-origin' }, configured);
assert.deepEqual([pushTrusted.status, pushTrusted.identify, pushTrusted.read, pushTrusted.sql], [400, 1, 1, 0], 'trusted origin passes; invalid installation still refused, before SQL');
// Gate consent stays OFF from the trusted origin: no activation, no SQL.
const gate = await call(handleCrewCheckPush, '/api/platform/notifications/crewcheck-installation', { origin: TRUSTED, 'sec-fetch-site': 'same-origin' },
  { trustedOrigin: configured, configuration: () => ({ enabled: false, configured: false }), gateHostEnabled: () => false,
    identify: harness().identify, read: async () => ({ action: 'gate-consent', installationId: 'device_fixture_1' }) });
assert.deepEqual([gate.status, gate.body?.code], [503, 'GATE_HOST_DISABLED'], 'gate consent remains OFF');

console.log('PASS trusted app origin: exact HTTPS only, unset by default, no Host/X-Forwarded-Host trust, 11 negative origins refused before identity/body/SQL in both handlers, push fetch-site and enabled-channel exclusivity kept, defaults unchanged, owner/CAS and gate OFF still decide');
