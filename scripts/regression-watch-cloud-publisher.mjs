// CrewWatch cloud sync, phone side: only with the native watch bridge, pairs once per
// account, never hands a credential to a changed session, deduplicates the per-minute
// projection, backs off while the server reports the feature disabled, re-pairs on 409
// and revokes on logout/account change only. Synthetic sessions and a fake server.
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-cloud-publisher-'));
try {
  await build({ entryPoints: [path.join(root, 'client/src/lib/watchCloud.ts')], bundle: true, platform: 'node', format: 'esm', outfile: path.join(dir, 'watchCloud.mjs'), alias: { '@': path.join(root, 'client/src') }, logLevel: 'silent' });
  const { createWatchCloudPublisher, WATCH_CLOUD_REFRESH_MS, WATCH_CLOUD_VALIDITY_STEP_MS } = await import(pathToFileURL(path.join(dir, 'watchCloud.mjs')).href);

  let clock = Date.parse('2032-10-20T10:00:00Z');
  const calls = [], store = new Map();
  let serverStatus = { pair: 200, put: 200, del: 200 }, credentials = 0;
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const fetch = async (url, init) => {
    calls.push({ url, method: init.method, auth: init.headers.authorization, body: init.body ? JSON.parse(init.body) : undefined, credentials: init.credentials });
    const status = init.method === 'POST' ? serverStatus.pair : init.method === 'PUT' ? serverStatus.put : serverStatus.del;
    const body = init.method === 'POST' ? { ok: true, credential: `cw1.${'a'.repeat(32)}.${String(++credentials).padStart(43, 'C')}` } : { ok: status === 200 };
    return { status, ok: status === 200, json: async () => body };
  };
  const handed = []; let nativeAccepts = true, cleared = 0;
  let native = { setWatchCloudCredential: c => { handed.push(c); return nativeAccepts; }, clearWatchCloudCredential: () => { cleared++; return true; } };
  const make = () => createWatchCloudPublisher({ fetch, storage, native: () => native, now: () => clock });
  let current = true;
  const session = (owner = 'owner-a', token = 'jwt-a') => ({ owner, token, isCurrent: () => current });
  const VALID = Date.parse('2032-10-20T16:00:00Z');
  const snap = (extra = {}) => ({ schemaVersion: 1, contextId: 'ctx', generatedAtEpochMs: clock, validUntilEpochMs: VALID, state: 'BOARDING', headline: 'EMBARQUE', gate: 'B12', schedule: [], ...extra });

  // No native watch bridge (web, iOS, old app): nothing leaves the device.
  native = null;
  assert.equal(await make().publish(snap(), session()), 'skipped');
  assert.equal(calls.length, 0);
  native = { setWatchCloudCredential: c => { handed.push(c); return nativeAccepts; }, clearWatchCloudCredential: () => { cleared++; return true; } };

  // First publish pairs once, hands the credential to the watch, then publishes.
  const pub = make();
  assert.equal(await pub.publish(snap(), session()), 'sent');
  assert.deepEqual(calls.map(c => `${c.method} ${c.url}`), ['POST /api/watch/cloud/pair', 'PUT /api/watch/cloud/snapshot']);
  assert(calls.every(c => c.auth === 'Bearer jwt-a' && c.credentials === 'omit'));
  assert.equal(handed.length, 1);
  assert.equal(calls[1].body.snapshot.gate, 'B12');

  // The per-minute rebuild with the same content is not re-sent; a change is; refresh after 30 min.
  clock += 60_000;
  assert.equal(await pub.publish(snap(), session()), 'skipped');
  assert.equal(await pub.publish(snap({ gate: 'B14' }), session()), 'sent');
  assert.equal(calls.filter(c => c.method === 'POST').length, 1, 'paired only once');
  clock += WATCH_CLOUD_REFRESH_MS - 1;
  assert.equal(await pub.publish(snap({ gate: 'B14' }), session()), 'skipped');
  clock += 1;
  assert.equal(await pub.publish(snap({ gate: 'B14' }), session()), 'sent');
  // A validity that moves with the clock is re-sent every step, not every minute.
  assert.equal(await pub.publish(snap({ gate: 'B14', validUntilEpochMs: VALID + WATCH_CLOUD_VALIDITY_STEP_MS - 1 }), session()), 'skipped');
  assert.equal(await pub.publish(snap({ gate: 'B14', validUntilEpochMs: VALID + WATCH_CLOUD_VALIDITY_STEP_MS }), session()), 'sent');

  // Server lost the pairing (409): next publish pairs again.
  serverStatus.put = 409;
  assert.equal(await pub.publish(snap({ gate: 'C1' }), session()), 'skipped');
  serverStatus.put = 200;
  const before = calls.length;
  assert.equal(await pub.publish(snap({ gate: 'C1' }), session()), 'sent');
  assert.deepEqual(calls.slice(before).map(c => c.method), ['POST', 'PUT']);
  assert.equal(handed.length, 2);

  // A session that changes while pairing never hands its credential to the watch.
  const other = make();
  let flip = { owner: 'owner-b', token: 'jwt-b', isCurrent: () => calls.at(-1)?.method !== 'POST' };
  assert.equal(await other.publish(snap(), flip), 'skipped');
  assert.equal(handed.length, 3 - 1, 'no hand-off for a stale session');
  assert.equal(storage.getItem('crewcheck:watch-cloud:v1:paired:owner-b'), null);
  // The watch refusing the credential (bridge false) leaves it unpaired.
  nativeAccepts = false;
  assert.equal(await other.publish(snap(), session('owner-b', 'jwt-b')), 'skipped');
  assert.equal(storage.getItem('crewcheck:watch-cloud:v1:paired:owner-b'), null);
  nativeAccepts = true;

  // Disabled on the server (404): back off for hours, no request per minute.
  const off = make(); serverStatus.pair = 404;
  const n0 = calls.length;
  assert.equal(await off.publish(snap(), session('owner-c', 'jwt-c')), 'skipped');
  for (let i = 0; i < 30; i++) { clock += 60_000; await off.publish(snap({ gate: String(i) }), session('owner-c', 'jwt-c')); }
  assert.equal(calls.length - n0, 1, 'one probe while disabled');
  serverStatus.pair = 200;

  // Logout / account change: revoke on the server with the old token, clear the watch.
  current = true;
  const n1 = calls.length;
  await pub.forget({ owner: 'owner-a', token: 'jwt-a' });
  assert.deepEqual(calls.slice(n1).map(c => `${c.method} ${c.url} ${c.auth}`), ['DELETE /api/watch/cloud Bearer jwt-a']);
  assert.equal(cleared, 1);
  assert.equal(storage.getItem('crewcheck:watch-cloud:v1:paired:owner-a'), null);
  await pub.forget({ owner: 'owner-a', token: 'jwt-a' });
  assert.equal(calls.length - n1, 1, 'nothing to revoke twice');
  // After logout the same content pairs again instead of being treated as already sent.
  assert.equal(await pub.publish(snap({ gate: 'C1' }), session()), 'sent');
  assert.equal(calls.at(-2).method, 'POST');

  // Wiring: Home publishes the same projection; authClient revokes only on logout/account change.
  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  assert.match(home, /window\.dispatchEvent\(new CustomEvent\('crewcheck:watch-snapshot', \{ detail: snapshot \}\)\);\n\s+\/\/ [^\n]+\n\s+void watchCloudPublisher\(\)\.publish\(snapshot, watchSession\);/);
  const auth = fs.readFileSync('client/src/lib/authClient.ts', 'utf8');
  // authClient functions run alone (other regressions extract them), so the revocation is inline.
  const fn = name => auth.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0];
  assert.match(fn('persistSession'), /if \(previousKey && nextKey && previousKey !== nextKey\) \{\n[^\n]*\n\s+window\.dispatchEvent\(new CustomEvent\('crewcheck:watch-cloud-forget'/);
  assert.match(fn('clearSession'), /crewcheck:watch-cloud-forget[\s\S]*crewcheck:auth-will-change[\s\S]*removeItem\(TOKEN_KEY\)/, 'revoked before the token is removed');
  assert.doesNotMatch(fn('expireSession'), /watch-cloud-forget/, 'expiry of the same account keeps the watch paired');
  assert.equal((fn('persistSession').match(/watch-cloud-forget/g) || []).length, 1, 'same-account refresh does not revoke');
  console.log('PASS watch cloud publisher: native-only, pair once, stale session never hands off, dedupe + 30 min refresh, 404 back-off, 409 re-pair, logout/account-change revoke only');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
