import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const key = 'crewcheck_platform_profile_cache_v1';
const owner = { id: 'synthetic-a', email: 'a@example.invalid', name: 'Login A' };
const other = { id: 'synthetic-b', email: 'b@example.invalid', name: 'Login B' };
const initial = { email: owner.email, publicId: 'CC-SYNTHETIC-A', displayName: 'Old Name', locale: 'es-ES', timezone: 'Pacific/Kiritimati', sharePresence: true, plan: 'free' };
const compiled = transformSync(fs.readFileSync('client/src/lib/platformClient.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code;

function fixture() {
  let user = owner, generation = 0, remote = { ...initial }, offline = false;
  let writesBlocked = false, readsBlocked = false, intercept = async () => {};
  let queue = Promise.resolve();
  const locks = { request: (_name, callback) => { const run = queue.then(callback); queue = run.catch(() => {}); return run; } };
  const stored = new Map([[key, JSON.stringify(initial)]]), calls = [], writes = [], events = [];
  const auth = {
    getStoredUser: () => ({ ...user }),
    captureAuthSession: () => {
      const captured = generation;
      return { owner: user.id, isCurrent: () => captured === generation };
    },
    authFetch: async (path, options = {}) => {
      const call = { path, ...options }; calls.push(call);
      if (offline) throw Error('synthetic offline');
      if (options.method === 'PATCH') remote = { ...remote, ...JSON.parse(options.body) };
      const response = { ok: true, profile: { ...remote }, billing: { plan: 'free' } };
      await intercept(call, response);
      return response;
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, require: () => auth, console,
    navigator: { language: 'en-US', locks }, Intl, AbortController, setTimeout, clearTimeout,
    localStorage: {
      getItem: name => { if (readsBlocked) throw Error('storage unavailable'); return stored.get(name) ?? null; },
      setItem: (name, value) => { if (writesBlocked) throw Error('storage unavailable'); writes.push({ name, value }); stored.set(name, value); },
      removeItem: name => stored.delete(name),
    },
    window: { dispatchEvent: event => events.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  });
  return {
    client: module.exports, calls, writes, events,
    cached: () => JSON.parse(stored.get(key)),
    offline: () => { offline = true; },
    switchAccount: () => { user = other; generation++; },
    renewSession: () => { generation++; },
    updateRemote: patch => { remote = { ...remote, ...patch }; },
    blockStorage: () => { writesBlocked = readsBlocked = true; },
    allowStorage: () => { writesBlocked = readsBlocked = false; },
    intercept: fn => { intercept = fn; },
  };
}

// The actual fallback reader must see the remotely confirmed save after losing connectivity.
{
  const f = fixture();
  const saved = await f.client.saveConfirmedDisplayName('Confirmed Name');
  assert.equal(saved.displayName, 'Confirmed Name');
  assert.deepEqual(JSON.parse(f.calls[1].body), { displayName: 'Confirmed Name' });
  assert.equal(f.calls.length, 4, 'GET, PATCH, persistence GET, and locked fresh cache GET remain mandatory');
  assert.deepEqual(f.cached(), JSON.parse(JSON.stringify(saved)), 'cache the verified profile, not a name-only draft');
  assert.equal(f.writes.filter(write => write.name === key).length, 1);
  f.offline();
  const loaded = await f.client.getPlatformProfile();
  assert.equal(loaded.localOnly, true);
  assert.equal(loaded.profile.displayName, 'Confirmed Name', 'offline reload must retain the confirmed name');
  assert.equal(loaded.profile.locale, initial.locale);
  assert.equal(loaded.profile.timezone, initial.timezone);
  assert.equal(loaded.profile.publicId, initial.publicId);
  assert.equal(f.events.length, 1);
  f.switchAccount();
  const switched = await f.client.getPlatformProfile();
  assert.equal(switched.profile.email, other.email);
  assert.equal(switched.profile.displayName, other.name, 'another account must not read the cached owner name');
  assert.equal(switched.profile.publicId, 'CC-OFFLINE');
}

// Do not cache a late PATCH or verification response after switching accounts.
for (const phase of [2, 3]) {
  const f = fixture();
  let release, reached;
  const blocked = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { reached = resolve; });
  f.intercept(async () => { if (f.calls.length === phase) { reached(); await blocked; } });
  const saving = f.client.saveConfirmedDisplayName('Late Name');
  await ready; f.switchAccount(); release();
  await assert.rejects(saving);
  assert.equal(f.writes.length, 0);
  assert.equal(f.events.length, 0);
  assert.deepEqual(f.cached(), initial);
}

// Storage failure must not turn a verified remote save into an error or a local success.
{
  const f = fixture(); f.blockStorage();
  const saved = await f.client.saveConfirmedDisplayName('Remote Only');
  assert.equal(saved.displayName, 'Remote Only');
  assert.equal(f.calls.length, 4);
  assert.equal(f.events.length, 1);
  f.offline();
  await assert.rejects(f.client.saveConfirmedDisplayName('Unsaved Draft'));
  assert.equal(f.events.length, 1);
}

// A PATCH receipt alone, a mismatched receipt, or failed readback cannot refresh the cache.
for (const mode of ['offline-before-save', 'readback-fails', 'wrong-owner', 'wrong-id', 'wrong-name', 'not-ok', 'readback-owner', 'readback-id', 'readback-name']) {
  const f = fixture();
  if (mode === 'offline-before-save') f.offline();
  f.intercept(async (_call, response) => {
    if (f.calls.length === 3) {
      if (mode === 'readback-owner') response.profile.email = other.email;
      if (mode === 'readback-id') response.profile.publicId = 'CC-OTHER';
      if (mode === 'readback-name') response.profile.displayName = 'Unconfirmed';
    }
    if (f.calls.length !== 2) return;
    if (mode === 'readback-fails') f.offline();
    if (mode === 'wrong-owner') response.profile.email = other.email;
    if (mode === 'wrong-id') response.profile.publicId = 'CC-OTHER';
    if (mode === 'wrong-name') response.profile.displayName = 'Unconfirmed';
    if (mode === 'not-ok') response.ok = false;
  });
  await assert.rejects(f.client.saveConfirmedDisplayName('Unverified Name'));
  assert.equal(f.events.length, 0, mode);
  assert.equal(f.writes.length, 0, mode);
  assert.deepEqual(f.cached(), initial, mode);
}
console.log('PASS confirmed profile cache: online save → offline load; owner isolation; late PATCH/readback; unavailable storage; mandatory remote receipt and readback.');

// A request started before the confirmed save cannot replace that newer cache.
for (const operation of ['getPlatformProfile', 'savePlatformProfile']) {
  const f = fixture();
  let release, reached;
  const blocked = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { reached = resolve; });
  f.intercept(async () => { if (f.calls.length === 1) { reached(); await blocked; } });
  const old = operation === 'getPlatformProfile' ? f.client.getPlatformProfile() : f.client.savePlatformProfile({ locale: 'fr-FR' });
  await ready;
  await f.client.saveConfirmedDisplayName('Confirmed Name');
  assert.equal(f.cached().displayName, 'Confirmed Name');
  release(); await old;
  assert.equal(f.cached().displayName, 'Confirmed Name', `${operation}: old response cannot overwrite confirmed cache`);
  // A new request is allowed to observe a later legitimate server-side edit.
  f.updateRemote({ displayName: 'New Server Name' });
  await f.client.getPlatformProfile();
  assert.equal(f.cached().displayName, 'New Server Name');
  f.offline();
  assert.equal((await f.client.getPlatformProfile()).profile.displayName, 'New Server Name');
}

// Even without a name save, a stale account or session must not write shared caches.
for (const operation of ['getPlatformProfile', 'savePlatformProfile']) {
  for (const transition of ['switchAccount', 'renewSession']) {
    const f = fixture();
    let release, reached;
    const blocked = new Promise(resolve => { release = resolve; });
    const ready = new Promise(resolve => { reached = resolve; });
    f.intercept(async () => { if (f.calls.length === 1) { reached(); await blocked; } });
    const old = operation === 'getPlatformProfile' ? f.client.getPlatformProfile() : f.client.savePlatformProfile({ locale: 'fr-FR' });
    await ready; const writesBefore = f.writes.length;
    f[transition](); release(); await old;
    assert.equal(f.writes.length, writesBefore, `${operation}/${transition}: old response must not write cache`);
  }
}

// After storage recovers, an old response may only cache a newly fetched server profile.
{
  const f = fixture();
  let release, reached;
  const blocked = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { reached = resolve; });
  f.intercept(async () => { if (f.calls.length === 1) { reached(); await blocked; } });
  const old = f.client.getPlatformProfile(); await ready;
  f.blockStorage();
  assert.equal((await f.client.saveConfirmedDisplayName('Remote Confirmed')).displayName, 'Remote Confirmed');
  f.allowStorage(); release(); await old;
  assert.equal(f.calls.length, 6, 'old response must cause a fresh locked read, never write its snapshot');
  assert.equal(f.cached().displayName, 'Remote Confirmed');
}
console.log('PASS profile cache ordering: old GET/PATCH cannot overwrite confirmed save; new GET allowed; account/session fences; storage failure.');
