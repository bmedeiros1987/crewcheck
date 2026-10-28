// CrewWatch cloud sync server contract: flag OFF by default, account-only pairing and
// publishing, watch-only download with ETag, re-pair and logout revoke, storage outage
// never unpairs the watch, phone allow-list mirrored. Synthetic accounts, in-memory store.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWatchCloudHandler, sanitizeWatchSnapshot, parseWatchCredential, watchOwnerKey, WATCH_CLOUD_MAX_CLOCK_SKEW_MS, WATCH_CLOUD_MAX_VALIDITY_MS } from '../server/watch-cloud-sync.mjs';

const rows = new Map();
let outage = false, clock = Date.parse('2032-10-20T10:00:00Z');
const db = {
  get: async key => { if (outage) throw new Error('down'); return rows.has(key) ? structuredClone(rows.get(key)) : null; },
  put: async (key, value) => { if (outage) return false; rows.set(key, structuredClone(value)); return true; },
  delete: async key => { if (outage) return false; rows.delete(key); return true; },
};
const sendJson = (res, status, body) => { res.status = status; res.body = body; };
const accounts = { 'token-a': { email: 'Synthetic.A@crewcheck.invalid' }, 'token-b': { email: 'synthetic.b@crewcheck.invalid' } };
let secretSeq = 0;
const make = env => createWatchCloudHandler({
  identity: req => accounts[req.headers['x-account']] || null, db, sendJson, env, now: () => clock,
  readJsonBody: async req => req.body,
  randomSecret: () => String(++secretSeq).padStart(43, 'S'),
});
const handler = make({ WATCH_CLOUD_SYNC_ENABLED: 'true' });
async function call(method, path, { account, body, auth, etag, h = handler } = {}) {
  const res = { headers: {}, writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers); }, end(text) { this.text = text; }, headersSent: false };
  const req = { method, body, headers: { ...(account ? { 'x-account': account } : {}), ...(auth ? { authorization: auth } : {}), ...(etag ? { 'if-none-match': etag } : {}) } };
  await h(req, res, new URL('https://crewcheck.invalid' + path));
  if (res.text) res.body = JSON.parse(res.text);
  clock += 20_000; // past every per-route rate limit
  return res;
}
const snapshot = (extra = {}) => ({
  schemaVersion: 1, contextId: 'ctx-1', generatedAtEpochMs: clock, validUntilEpochMs: clock + 3_600_000, state: 'BOARDING',
  headline: 'EMBARQUE', gate: 'B12', currentFlight: 'QA123', remoteStand: false, changed: false,
  schedule: [{ id: 's1', kind: 'flight', time: '09:30', title: 'QA123', route: 'GRU → SSA', unknownField: 'drop' }], ...extra,
});

// Flag OFF (absent or anything but 'true'): every route answers disabled, nothing stored.
for (const env of [{}, { WATCH_CLOUD_SYNC_ENABLED: '1' }, { WATCH_CLOUD_SYNC_ENABLED: 'TRUE' }]) {
  const off = make(env);
  assert.equal((await call('POST', '/api/watch/cloud/pair', { account: 'token-a', h: off })).status, 404);
  assert.equal((await call('GET', '/api/watch/cloud/snapshot', { h: off })).body.reason, 'disabled');
}
assert.equal(rows.size, 0);

// Pairing and publishing need an account; the watch download needs the watch credential.
assert.equal((await call('POST', '/api/watch/cloud/pair')).status, 401);
assert.equal((await call('PUT', '/api/watch/cloud/snapshot', { body: { snapshot: snapshot() } })).status, 401);
assert.equal((await call('PUT', '/api/watch/cloud/snapshot', { account: 'token-a', body: { snapshot: snapshot() } })).body.reason, 'not-paired', 'no projection stored without a paired watch');
assert.equal(rows.size, 0);
const paired = await call('POST', '/api/watch/cloud/pair', { account: 'token-a' });
assert.equal(paired.status, 200);
const credential = paired.body.credential;
const owner = watchOwnerKey('synthetic.a@crewcheck.invalid');
assert.equal(credential, `cw1.${owner}.${'1'.padStart(43, 'S')}`);
assert(!JSON.stringify([...rows.values()]).includes('1'.padStart(43, 'S')), 'only the hash of the secret is stored');
assert.deepEqual(parseWatchCredential('Bearer ' + credential), { owner, secret: '1'.padStart(43, 'S') });
for (const bad of ['', credential, 'Bearer cw1.x.y', `Bearer cw2.${owner}.${'1'.padStart(43, 'S')}`]) assert.equal(parseWatchCredential(bad), null, bad);
const auth = 'Bearer ' + credential;

// Paired, nothing published yet: 204.
assert.equal((await call('GET', '/api/watch/cloud/snapshot', { auth })).status, 204);

// Publish: rejected shapes, then the allow-listed projection only.
for (const bad of [null, {}, snapshot({ schemaVersion: 2 }), snapshot({ email: 'x@y' }), snapshot({ token: 't' }), snapshot({ validUntilEpochMs: 1 }), snapshot({ generatedAtEpochMs: 1.5 }), snapshot({ detail: 'x'.repeat(20_000), schedule: Array(8).fill({ detail: 'y'.repeat(64), title: 'z'.repeat(24) }), headline: 'h' })])
  assert.equal((await call('PUT', '/api/watch/cloud/snapshot', { account: 'token-a', body: { snapshot: bad } })).status, bad && bad.detail?.length === 20_000 ? 200 : 400, JSON.stringify(bad)?.slice(0, 80));
const published = await call('PUT', '/api/watch/cloud/snapshot', { account: 'token-a', body: { snapshot: snapshot({ state: 'weird', cpfLike: 'drop', headline: ' EMB\u0007ARQUE  agora ' }) } });
assert.equal(published.status, 200);
const got = await call('GET', '/api/watch/cloud/snapshot', { auth });
assert.equal(got.status, 200);
assert.equal(got.headers.etag, `"${published.body.etag}"`);
assert.equal(got.body.snapshot.state, 'UNKNOWN');
assert.equal(got.body.snapshot.headline, 'EMB ARQUE agora');
assert.equal(got.body.snapshot.source, 'canonical-roster');
assert.equal('cpfLike' in got.body.snapshot, false);
assert.deepEqual(got.body.snapshot.schedule, [{ id: 's1', kind: 'flight', time: '09:30', title: 'QA123', route: 'GRU → SSA' }]);
assert.equal((await call('GET', '/api/watch/cloud/snapshot', { auth, etag: got.headers.etag })).status, 304, 'unchanged: no body');

// Another account cannot read or overwrite it; a wrong secret or other owner is unpaired.
await call('POST', '/api/watch/cloud/pair', { account: 'token-b' });
assert.equal((await call('PUT', '/api/watch/cloud/snapshot', { account: 'token-b', body: { snapshot: snapshot({ gate: 'Z9' }) } })).status, 200);
assert.equal((await call('GET', '/api/watch/cloud/snapshot', { auth })).body.snapshot.gate, 'B12');
assert.equal((await call('GET', '/api/watch/cloud/snapshot', { auth: `Bearer cw1.${owner}.${'9'.padStart(43, 'S')}` })).status, 401);
assert.equal((await call('GET', '/api/watch/cloud/snapshot', { auth: `Bearer cw1.${watchOwnerKey('synthetic.b@crewcheck.invalid')}.${'1'.padStart(43, 'S')}` })).status, 401);

// Storage outage answers 503, never 401: the watch keeps its credential.
outage = true;
assert.equal((await call('GET', '/api/watch/cloud/snapshot', { auth })).status, 503);
assert.equal((await call('POST', '/api/watch/cloud/pair', { account: 'token-a' })).status, 503);
outage = false;
assert.equal((await call('GET', '/api/watch/cloud/snapshot', { auth })).status, 200, 'credential survives the outage');

// Rate limits per owner and route.
clock += 60_000;
assert.equal((await call('GET', '/api/watch/cloud/snapshot', { auth })).status, 200);
clock -= 20_000 - 1000;
assert.equal((await call('GET', '/api/watch/cloud/snapshot', { auth })).status, 429);

// Re-pairing replaces the credential; the projection stays.
const repaired = (await call('POST', '/api/watch/cloud/pair', { account: 'token-a' })).body.credential;
assert.equal((await call('GET', '/api/watch/cloud/snapshot', { auth })).status, 401, 'old watch credential revoked');
assert.equal((await call('GET', '/api/watch/cloud/snapshot', { auth: 'Bearer ' + repaired })).body.snapshot.gate, 'B12');

// Logout: credential and projection gone.
assert.equal((await call('DELETE', '/api/watch/cloud', { account: 'token-a' })).status, 200);
assert.equal((await call('GET', '/api/watch/cloud/snapshot', { auth: 'Bearer ' + repaired })).status, 401);
assert.equal(rows.has(`watch-cloud:v1:snapshot:${owner}`), false);

// Time limits (review): future generation and validity beyond 6 h are refused; edges accepted.
{
  const at = clock;
  const shaped = (generatedAtEpochMs, validUntilEpochMs) => sanitizeWatchSnapshot({ ...snapshot(), generatedAtEpochMs, validUntilEpochMs }, at);
  assert.equal(shaped(at + WATCH_CLOUD_MAX_CLOCK_SKEW_MS + 1, at + 3_600_000), null, 'generation from the future');
  assert.equal(shaped(at - 1000, at - 1000 + 365 * 24 * 3_600_000), null, 'one-year validity');
  assert.equal(shaped(at - 1000, at - 1000 + WATCH_CLOUD_MAX_VALIDITY_MS + 1), null, 'validity over 6 h');
  assert.ok(shaped(at + WATCH_CLOUD_MAX_CLOCK_SKEW_MS, at + WATCH_CLOUD_MAX_CLOCK_SKEW_MS + WATCH_CLOUD_MAX_VALIDITY_MS), 'edges accepted');
  const paired = (await call('POST', '/api/watch/cloud/pair', { account: 'token-b' })).body.credential;
  assert.ok(paired);
  const future = await call('PUT', '/api/watch/cloud/snapshot', { account: 'token-b', body: { snapshot: { ...snapshot(), generatedAtEpochMs: clock + 3_600_000, validUntilEpochMs: clock + 7_200_000 } } });
  assert.equal(future.status, 400, 'the route applies the server clock');
  const watch = await call('GET', '/api/watch/cloud/snapshot', { auth: 'Bearer ' + paired });
  assert.equal(watch.body.snapshot.gate, 'Z9', 'the refused projection never replaces the stored one');
}

// Phone and server allow-lists stay identical.
const phone = fs.readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckWatchPublisher.java', 'utf8');
const phoneFields = [...phone.matchAll(/copyString\((?:source|item), (?:out|cleanItem), "(\w+)", (\d+)\)/g)].map(m => `${m[1]}:${m[2]}`).sort();
const serverSource = fs.readFileSync('server/watch-cloud-sync.mjs', 'utf8');
const serverFields = [...serverSource.matchAll(/\['(\w+)', (\d+)\]/g)].map(m => `${m[1]}:${m[2]}`).sort();
assert.deepEqual(serverFields, phoneFields, 'server sanitize mirrors the phone publisher');
assert.ok(sanitizeWatchSnapshot(snapshot(), clock), 'control: the same snapshot without the field is accepted');
assert.equal(sanitizeWatchSnapshot({ ...snapshot(), phone: '1' }, clock), null);
// Gate provenance reaches the watch through the cloud like through Bluetooth (gate rule).
{
  const kept = sanitizeWatchSnapshot({ ...snapshot(), gateSource: 'reported', gateNote: 'Informado por FlightAware · a confirmar · recebido 09:20 BRT' + 'x'.repeat(80) }, clock);
  assert.equal(kept.gateSource, 'reported');
  assert.equal(kept.gateNote.length, 64);
}

// Server wiring: route registered, strict read, flag documented OFF.
const server = fs.readFileSync('server.mjs', 'utf8');
assert.match(server, /url\.pathname === '\/api\/watch\/cloud' \|\| url\.pathname\.startsWith\('\/api\/watch\/cloud\/'\)\) return handleWatchCloud/);
assert.match(server, /db: \{ get: watchCloudDbGet, put: conciergeDbPut, delete: conciergeDbDelete \}/);
assert.match(fs.readFileSync('.env.example', 'utf8'), /^WATCH_CLOUD_SYNC_ENABLED=false$/m);
console.log('PASS watch cloud sync server: OFF by default, account-only pair/publish, watch-only ETag download, re-pair and logout revoke, outage never unpairs, rate limits, phone allow-list mirrored');
