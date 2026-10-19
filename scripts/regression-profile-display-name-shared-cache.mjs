import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const compile = path => transformSync(fs.readFileSync(path, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const platformCode = compile('client/src/lib/platformClient.ts'), authCode = compile('client/src/lib/authClient.ts');
const KEY = 'crewcheck_platform_profile_cache_v1';
const user = { id: 'synthetic-a', email: 'a@example.invalid', name: 'Login A' };
const initial = { email: user.email, publicId: 'CC-A', displayName: 'Old Name', locale: 'en-US', timezone: 'UTC', plan: 'free', sharePresence: false };
function fixture({ locking = 'available' } = {}) {
  let remote = { ...initial }, offline = false, blocked = false;
  // Model the browser's origin-wide Web Locks manager, shared by all module instances.
  let queue = Promise.resolve();
  const locks = { request: (_name, callback) => { const run = queue.then(callback); queue = run.catch(() => {}); return run; } };
  const tabs = [], stored = new Map([[KEY, JSON.stringify(initial)], ['crewcheck_auth_user', JSON.stringify(user)], ['crewcheck_auth_token', 'synthetic-placeholder']]);
  const tab = () => {
    const listeners = new Map(), events = [], calls = [], t = { intercept: async () => {} }; tabs.push(t);
    const window = {
      addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
      removeEventListener: (name, fn) => listeners.get(name)?.delete(fn),
      dispatchEvent: e => { events.push(e); for (const fn of listeners.get(e.type) || []) fn(e); },
    };
    t.receive = event => window.dispatchEvent(event);
    const storage = {
      getItem: k => { if (blocked && k === KEY) throw Error('synthetic cache unavailable'); return stored.get(k) ?? null; },
      setItem: (k, v) => { if (blocked && k === KEY) throw Error('synthetic cache unavailable'); const oldValue = stored.get(k); stored.set(k, v); for (const other of tabs) if (other !== t) other.receive({ type: 'storage', key: k, oldValue, newValue: v }); },
      removeItem: k => stored.delete(k),
    };
    const browserLocks = locking === 'available' ? locks : locking === 'denied' ? { request: async () => { throw Error('synthetic lock denied'); } } : undefined;
    const globals = { console, navigator: { language: 'en-US', locks: browserLocks }, Intl, AbortController, setTimeout, clearTimeout, localStorage: storage, window, CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o.detail; } }, Event: class { constructor(type) { this.type = type; } } };
    const authModule = { exports: {} }; vm.runInNewContext(authCode, { ...globals, module: authModule, exports: authModule.exports });
    const auth = { ...authModule.exports, authFetch: async (path, options = {}) => {
      const call = { path, ...options }; calls.push(call);
      if (offline) throw Error('synthetic offline');
      if (options.method === 'PATCH') remote = { ...remote, ...JSON.parse(options.body) };
      const response = { ok: true, profile: { ...remote }, billing: { plan: 'free' } };
      await t.intercept(call, response); return response;
    } };
    const module = { exports: {} }; vm.runInNewContext(platformCode, { ...globals, module, exports: module.exports, require: () => auth });
    Object.assign(t, { client: module.exports, events, calls, renewSession: () => storage.setItem('crewcheck_auth_token', 'synthetic-renewed'), switchAccount: () => {
      storage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'synthetic-b', email: 'b@example.invalid', name: 'Login B' }));
      storage.setItem('crewcheck_auth_token', 'synthetic-b-placeholder');
    } }); return t;
  };
  return { tab, cached: () => JSON.parse(stored.get(KEY) || 'null'), remote: () => remote, offline: () => { offline = true; }, blockStorage: () => { blocked = true; }, allowStorage: () => { blocked = false; } };
}

let failures = 0;
for (const mode of ['cross-tab-old-get', 'same-tab-old-confirmed-save']) {
  const f = fixture(), first = f.tab(), second = mode === 'cross-tab-old-get' ? f.tab() : first;
  let release, reached;
  const ready = new Promise(r => { reached = r; }), hold = new Promise(r => { release = r; });
  first.intercept = async () => { if (first.calls.length === (mode === 'cross-tab-old-get' ? 1 : 3)) { reached(); await hold; } };
  const old = mode === 'cross-tab-old-get' ? first.client.getPlatformProfile() : first.client.saveConfirmedDisplayName('Earlier Name');
  await ready;
  const saved = await second.client.saveConfirmedDisplayName('Latest Confirmed Name');
  assert.equal(f.cached().displayName, 'Latest Confirmed Name');
  release(); await old; f.offline();
  const fallback = await second.client.getPlatformProfile();
  console.log(JSON.stringify({ mode, saved: saved.displayName, remote: f.remote().displayName, cache: f.cached().displayName, offline: fallback.profile.displayName }));
  try { assert.equal(fallback.profile.displayName, 'Latest Confirmed Name'); }
  catch { failures++; console.log('FAIL ' + mode + ': cache reverted after successful confirmation'); }
}
assert.equal(failures, 0, 'confirmed cache must survive older responses across active module instances and save operations');

for (const locking of ['unsupported', 'denied']) {
  const f = fixture({ locking }), t = f.tab();
  assert.equal((await t.client.saveConfirmedDisplayName('Remote Confirmed')).displayName, 'Remote Confirmed');
  assert.equal(f.remote().displayName, 'Remote Confirmed');
  assert.equal(f.cached(), null, 'without coordination, discard cached data instead of ordering responses');
  f.offline();
  assert.equal((await t.client.getPlatformProfile()).profile.displayName, user.name);
  await assert.rejects(t.client.saveConfirmedDisplayName('Offline Draft'));
}

// Storage failure does not invalidate a remote receipt. A later refresh fetches current data.
{
  const f = fixture(), first = f.tab(), second = f.tab();
  let release, reached;
  const hold = new Promise(r => { release = r; }), ready = new Promise(r => { reached = r; });
  first.intercept = async () => { if (first.calls.length === 1) { reached(); await hold; } };
  const old = first.client.getPlatformProfile(); await ready;
  f.blockStorage();
  assert.equal((await second.client.saveConfirmedDisplayName('Storage Recovered')).displayName, 'Storage Recovered');
  f.allowStorage(); release(); await old;
  assert.equal(f.cached().displayName, 'Storage Recovered');
}

// Real captureAuthSession fences must survive token rotation and account changes in another tab.
for (const transition of ['renewSession', 'switchAccount']) {
  const f = fixture(), first = f.tab(), second = f.tab();
  let release, reached;
  const hold = new Promise(r => { release = r; }), ready = new Promise(r => { reached = r; });
  first.intercept = async () => { if (first.calls.length === 3) { reached(); await hold; } };
  const old = first.client.saveConfirmedDisplayName('Stale Session');
  await ready; second[transition](); release(); await assert.rejects(old);
  assert.equal(f.cached().displayName, initial.displayName);
  assert.equal(first.events.filter(e => e.type === 'crewcheck:profile-name-confirmed').length, 0);
}
console.log('PASS real auth/session contracts: unsupported or denied locks; storage recovery; cross-tab token/account changes.');
