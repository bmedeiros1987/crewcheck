// CrewWatch cloud sync, phone side: only with the native watch bridge, pairs once per
// account, never hands a credential to a changed session, deduplicates the per-minute
// projection, backs off while the server reports the feature disabled, re-pairs on 409
// and revokes on logout/account change only. Synthetic sessions and a fake server.
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { watchOwnerKey } from '../server/watch-cloud-sync.mjs';

const root = process.cwd(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-cloud-publisher-'));
try {
  await build({ entryPoints: [path.join(root, 'client/src/lib/watchAccount.ts')], bundle: true, platform: 'node', format: 'esm', outfile: path.join(dir, 'watchAccount.mjs'), logLevel: 'silent' });
  const { watchAccountKey, sha256Hex } = await import(pathToFileURL(path.join(dir, 'watchAccount.mjs')).href);
  // The synchronous hash equals node's SHA-256 (block boundaries, multi-byte UTF-8, empty input).
  const crypto = await import('node:crypto');
  for (const text of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'x'.repeat(1000), 'crewcheck-watch:joão.ç@exemplo.test', '✈️ 𝄞'])
    assert.equal(sha256Hex(text), crypto.createHash('sha256').update(text, 'utf8').digest('hex'), JSON.stringify(text).slice(0, 40));
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
  // Fake app bridge: accepts synchronously, confirms the Data Layer write later by event,
  // like MainActivity.dispatchCrewCheckWatchSyncResult.
  const events = new EventTarget(), handed = [];
  let listening = 0;
  const add = events.addEventListener.bind(events), remove = events.removeEventListener.bind(events);
  events.addEventListener = (...a) => { listening++; add(...a); };
  events.removeEventListener = (...a) => { listening--; remove(...a); };
  let nativeAccepts = true, cleared = 0, delivery = 'delivered';
  const result = (ok, code, message) => events.dispatchEvent(new CustomEvent('crewcheck:watch-sync-result', { detail: { ok, code, message } }));
  const bridge = { setWatchCloudCredential: (c, id) => {
    handed.push(c);
    if (nativeAccepts) setTimeout(() => {
      result(true, 'published', id); // an unrelated watch result never confirms the pairing
      result(true, 'cloud_credential_delivered', 'someone-else');
      if (delivery === 'delivered') result(true, 'cloud_credential_delivered', id);
      else if (delivery === 'failed') result(false, 'cloud_credential_failed', id);
    }, 1);
    return nativeAccepts;
  }, clearWatchCloudCredential: (...args) => { cleared++; assert.equal(args.length, 0, 'the logout epoch needs no account'); return true; } };
  let native = bridge, ids = 0;
  const make = () => createWatchCloudPublisher({ fetch, storage, native: () => native, events, now: () => clock, deliveryTimeoutMs: 50, requestId: () => 'req-' + (++ids) });
  let current = true;
  const session = (owner = 'owner-a', token = 'jwt-a') => ({ owner, token, isCurrent: () => current });
  const VALID = Date.parse('2032-10-20T16:00:00Z');
  const snap = (extra = {}) => ({ schemaVersion: 1, contextId: 'ctx', generatedAtEpochMs: clock, validUntilEpochMs: VALID, state: 'BOARDING', headline: 'EMBARQUE', gate: 'B12', schedule: [], ...extra });

  // No native watch bridge (web, iOS, old app): nothing leaves the device.
  native = null;
  assert.equal(await make().publish(snap(), session()), 'skipped');
  assert.equal(calls.length, 0);
  native = bridge;

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

  // Delivery to the watch failed or was never confirmed: not paired, nothing published, retried.
  for (const outcome of ['failed', 'silent']) {
    delivery = outcome;
    const n = calls.length;
    assert.equal(await other.publish(snap(), session('owner-b', 'jwt-b')), 'skipped', outcome);
    assert.deepEqual(calls.slice(n).map(c => c.method), ['POST'], `${outcome}: no PUT without a confirmed pairing`);
    assert.equal(storage.getItem('crewcheck:watch-cloud:v1:paired:owner-b'), null, outcome);
  }
  assert.equal(listening, 0, 'every delivery wait removes its listener, also on timeout');
  delivery = 'delivered';
  const nb = calls.length;
  assert.equal(await other.publish(snap(), session('owner-b', 'jwt-b')), 'sent', 'the next publish pairs again');
  assert.deepEqual(calls.slice(nb).map(c => c.method), ['POST', 'PUT']);
  assert.equal(storage.getItem('crewcheck:watch-cloud:v1:paired:owner-b'), '1');

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
  // Every projection names the account exactly as the server stamps the cloud copy (watchOwnerKey).
  assert.equal(watchAccountKey(' Pilot.A@Example.test '), watchOwnerKey('pilot.a@example.test'));
  assert.match(watchAccountKey('pilot.a@example.test'), /^[0-9a-f]{32}$/);
  assert.equal(watchAccountKey(''), '', 'no e-mail, no account key');
  assert.equal(watchAccountKey(' Joao.Ç@Exemplo.test '), watchOwnerKey('joao.ç@exemplo.test'), 'non-ASCII e-mail');
  assert.equal(storage.getItem('crewcheck:watch-cloud:v1:paired:owner-a'), null);
  // Forget also revokes a pairing that was never confirmed (a credential may exist or land late).
  await pub.forget({ owner: 'owner-x', token: 'jwt-x' });
  assert.deepEqual(calls.slice(n1 + 1).map(c => `${c.method} ${c.auth}`), ['DELETE Bearer jwt-x']);
  assert.equal(cleared, 2);
  // Without the app bridge (web) there is nothing to revoke.
  native = null; const nw = calls.length;
  await make().forget({ owner: 'owner-a', token: 'jwt-a' });
  assert.equal(calls.length, nw);
  native = bridge;
  // After logout the same content pairs again instead of being treated as already sent.
  assert.equal(await pub.publish(snap({ gate: 'C1' }), session()), 'sent');
  assert.equal(calls.at(-2).method, 'POST');

  // Wiring: Home publishes the same projection; authClient revokes only on logout/account change.
  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  // Every Bluetooth and cloud projection carries the account, and the first publish waits for it.
  assert.match(home, /if \(watchAccount\) snapshot\.account = watchAccount;\n\s+window\.dispatchEvent\(new CustomEvent\('crewcheck:watch-snapshot'/);
  assert.match(home, /const watchAccount = watchAccountKey\(getStoredUser\(\)\?\.email\);/);
  assert.match(home, /window\.dispatchEvent\(new CustomEvent\('crewcheck:watch-snapshot', \{ detail: snapshot \}\)\);\n\s+\/\/ [^\n]+\n\s+void watchCloudPublisher\(\)\.publish\(snapshot, watchSession\);/);
  const auth = fs.readFileSync('client/src/lib/authClient.ts', 'utf8');
  // authClient functions run alone (other regressions extract them), so the revocation is inline.
  const fn = name => auth.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0];
  assert.match(fn('persistSession'), /if \(previousKey && nextKey && previousKey !== nextKey\) \{\n[^\n]*\n\s+window\.dispatchEvent\(new CustomEvent\('crewcheck:watch-cloud-forget'/);
  assert.match(fn('clearSession'), /crewcheck:watch-cloud-forget[\s\S]*crewcheck:auth-will-change[\s\S]*removeItem\(TOKEN_KEY\)/, 'revoked before the token is removed');
  assert.doesNotMatch(fn('expireSession'), /watch-cloud-forget/, 'expiry of the same account keeps the watch paired');
  assert.equal((fn('persistSession').match(/watch-cloud-forget/g) || []).length, 1, 'same-account refresh does not revoke');
  console.log('PASS watch cloud publisher: native-only, pair once, stale session never hands off, dedupe + 30 min refresh, 404 back-off, 409 re-pair, logout/account-change revoke only, projection account = server owner key');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
