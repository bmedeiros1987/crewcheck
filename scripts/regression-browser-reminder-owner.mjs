import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

// Bundle both complete production modules. No function extraction, auth stub,
// real browser, permission prompt, native host or network is used by this test.
const bundled = await build({
  stdin: {
    contents: "import './client/src/lib/crewcheckPremiumRuntime.ts'; import * as auth from './client/src/lib/authClient.ts'; globalThis.fixtureAuth = auth;",
    resolveDir: process.cwd(),
    sourcefile: 'browser-reminder-owner-fixture.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  metafile: true,
  logLevel: 'silent',
});
for (const file of ['client/src/lib/crewcheckPremiumRuntime.ts', 'client/src/lib/authClient.ts']) {
  assert.ok(bundled.metafile.inputs[file], `the complete real module is bundled: ${file}`);
}
const code = bundled.outputFiles[0].text;
const TOKEN = 'crewcheck_auth_token', USER = 'crewcheck_auth_user';
const NOW = 1_000;
const fixtures = [];
let cases = 0;

class StorageMock {
  values = new Map();
  blocked = false;
  getItem(key) {
    if (this.blocked) throw new Error('Synthetic storage unavailable');
    return this.values.get(String(key)) ?? null;
  }
  setItem(key, value) {
    if (this.blocked) throw new Error('Synthetic storage unavailable');
    this.values.set(String(key), String(value));
  }
  removeItem(key) {
    if (this.blocked) throw new Error('Synthetic storage unavailable');
    this.values.delete(String(key));
  }
  clear() {
    if (this.blocked) throw new Error('Synthetic storage unavailable');
    this.values.clear();
  }
}

class TimerMock {
  nextId = 1;
  jobs = [];
  active = new Map();
  cleared = [];
  throwOnClear = false;
  onClear;
  setTimeout = (callback, delay) => {
    const job = { id: this.nextId++, callback, delay };
    this.jobs.push(job);
    this.active.set(job.id, job);
    return job.id;
  };
  clearTimeout = id => {
    this.cleared.push(id);
    if (this.throwOnClear) throw new Error('Synthetic timer cancellation failure');
    const job = this.active.get(id);
    this.active.delete(id);
    this.onClear?.(job);
  };
  // A cancelled callback is deliberately retained and can still be invoked.
  // This models queued work and tests the fence independently of clearTimeout.
  fire(job) {
    if (this.active.get(job.id) === job) this.active.delete(job.id);
    job.callback();
  }
}

class CustomEventMock extends Event {
  constructor(name, options) { super(name); this.detail = options?.detail; }
}

function fixture({ owner = 'fixture-owner-A', token = 'synthetic-session-A', rawUser, storageBlocked = false, native } = {}) {
  const local = new StorageMock(), session = new StorageMock(), timers = new TimerMock();
  const notices = [], forbidden = { fetch: 0, permission: 0, geolocation: 0 };
  if (token !== null) local.setItem(TOKEN, token);
  if (rawUser !== undefined) local.setItem(USER, rawUser);
  else if (owner !== null) local.setItem(USER, JSON.stringify({ id: owner, email: `${owner}@example.invalid` }));
  local.blocked = storageBlocked;
  class NotificationMock {
    static permission = 'granted';
    static requestPermission() {
      forbidden.permission++;
      throw new Error('Permission prompts are forbidden in this fixture');
    }
    constructor(title, options) { notices.push({ title, body: options?.body }); }
  }
  const window = new EventTarget(), document = new EventTarget();
  Object.assign(window, {
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    Notification: NotificationMock,
    location: { origin: 'https://crewcheck-fixture.example.invalid' },
    ...(native ? { CrewCheckNative: native } : {}),
  });
  document.documentElement = { style: { setProperty() {} } };
  class DateMock extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
  }
  const context = vm.createContext({
    window, document, localStorage: local, sessionStorage: session,
    Event, CustomEvent: CustomEventMock, EventTarget, Notification: NotificationMock,
    Date: DateMock, URL, URLSearchParams, AbortController,
    performance: { now: () => NOW },
    navigator: { geolocation: { getCurrentPosition() {
      forbidden.geolocation++;
      throw new Error('Geolocation is forbidden in this fixture');
    } } },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    fetch() { forbidden.fetch++; throw new Error('Network is forbidden in this fixture'); },
  });
  vm.runInContext(code, context, { timeout: 5_000, filename: 'actual-browser-reminder-runtime.bundle.js' });
  assert.equal(typeof window.CrewCheckPremium?.scheduleNotification, 'function');
  const result = {
    window, local, timers, notices, forbidden, Notification: NotificationMock,
    auth: context.fixtureAuth,
    schedule: () => window.CrewCheckPremium.scheduleNotification('Synthetic reminder', 'Synthetic content only', NOW + 1_000),
    emit: name => window.dispatchEvent(new Event(name)),
    storage: key => window.dispatchEvent(Object.assign(new Event('storage'), { key })),
    switchTo(nextOwner, nextToken = 'synthetic-session-B') {
      window.dispatchEvent(new Event('crewcheck:auth-will-change'));
      local.setItem(TOKEN, nextToken);
      local.setItem(USER, JSON.stringify({ id: nextOwner, email: `${nextOwner}@example.invalid` }));
      window.dispatchEvent(new CustomEventMock('crewcheck:auth-changed'));
    },
  };
  fixtures.push(result);
  return result;
}

function check(name, run) {
  run();
  cases++;
  console.log(`PASS ${name}`);
}

check('current owner receives one browser notice only when its callback runs', () => {
  const f = fixture();
  assert.equal(f.schedule(), true);
  assert.equal(f.notices.length, 0);
  assert.equal(f.timers.jobs[0].delay, 1_000);
  f.timers.fire(f.timers.jobs[0]);
  f.timers.fire(f.timers.jobs[0]);
  assert.equal(f.notices.length, 1, 'one admission is consumed only once');
});

for (const [name, invalidate] of [
  ['real authClient logout', f => f.auth.clearSession()],
  ['real authClient expiry', f => f.auth.expireSession()],
  ['account A to B', f => f.switchTo('fixture-owner-B')],
  ['account A to B to A with the original identity and credential', f => {
    f.switchTo('fixture-owner-B');
    f.switchTo('fixture-owner-A', 'synthetic-session-A');
  }],
  ['same-identity auth-changed event', f => f.emit('crewcheck:auth-changed')],
  ['credential storage event', f => { f.local.setItem(TOKEN, 'synthetic-session-replaced'); f.storage(TOKEN); }],
  ['identity storage event', f => { f.local.setItem(USER, JSON.stringify({ id: 'fixture-owner-B' })); f.storage(USER); }],
  ['storage A to B to A with final values restored', f => {
    const originalUser = f.local.getItem(USER), originalToken = f.local.getItem(TOKEN);
    f.local.setItem(TOKEN, 'synthetic-session-B');
    f.local.setItem(USER, JSON.stringify({ id: 'fixture-owner-B' }));
    f.storage(TOKEN);
    f.storage(USER);
    f.local.setItem(TOKEN, originalToken);
    f.local.setItem(USER, originalUser);
    f.storage(TOKEN);
    f.storage(USER);
  }],
  ['storage clear event', f => { f.local.clear(); f.storage(null); }],
  ['pagehide', f => f.emit('pagehide')],
]) {
  check(`${name} cancels all admissions and rejects retained callbacks`, () => {
    const f = fixture();
    assert.equal(f.schedule(), true);
    assert.equal(f.schedule(), true);
    invalidate(f);
    assert.equal(f.timers.active.size, 0, 'underlying timers are cancelled');
    assert.equal(f.timers.cleared.length, 2, 'every pending admission is cancelled');
    for (const job of f.timers.jobs) f.timers.fire(job);
    assert.equal(f.notices.length, 0);
  });
}

for (const [name, mutate] of [
  ['credential changed without an event', f => f.local.setItem(TOKEN, 'synthetic-session-replaced')],
  ['identity changed without an event', f => f.local.setItem(USER, JSON.stringify({ id: 'fixture-owner-B' }))],
  ['credential removed without an event', f => f.local.removeItem(TOKEN)],
  ['identity removed without an event', f => f.local.removeItem(USER)],
  ['identity becomes malformed without an event', f => f.local.setItem(USER, '{synthetic-invalid-json')],
  ['storage becomes unreadable', f => { f.local.blocked = true; }],
  ['permission revoked', f => { f.Notification.permission = 'denied'; }],
  ['permission reset', f => { f.Notification.permission = 'default'; }],
]) {
  check(`${name} fails closed at delivery`, () => {
    const f = fixture();
    assert.equal(f.schedule(), true);
    mutate(f);
    f.timers.fire(f.timers.jobs[0]);
    assert.equal(f.notices.length, 0);
  });
}

check('unrelated storage event preserves the current admission', () => {
  const f = fixture();
  assert.equal(f.schedule(), true);
  f.storage('synthetic-unrelated-setting');
  assert.equal(f.timers.cleared.length, 0);
  f.timers.fire(f.timers.jobs[0]);
  assert.equal(f.notices.length, 1);
});

for (const throwOnClear of [false, true]) {
  check(`pagehide plus timer ID reuse preserves the new ticket even when cancellation ${throwOnClear ? 'throws' : 'succeeds'}`, () => {
    const f = fixture();
    assert.equal(f.schedule(), true);
    const oldJob = f.timers.jobs[0];
    f.timers.throwOnClear = throwOnClear;
    f.emit('pagehide');
    f.timers.nextId = oldJob.id;
    assert.equal(f.schedule(), true);
    const currentJob = f.timers.jobs[1];
    assert.equal(currentJob.id, oldJob.id, 'fixture really reuses the invalidated timer ID');
    f.timers.fire(oldJob);
    assert.equal(f.notices.length, 0);
    assert.equal(f.timers.active.get(currentJob.id), currentJob, 'the new timer remains active');
    f.timers.fire(currentJob);
    assert.equal(f.notices.length, 1);
    f.timers.fire(oldJob);
    assert.equal(f.notices.length, 1);
  });
}

check('restoring permission cannot replay a callback already refused at delivery', () => {
  const f = fixture();
  assert.equal(f.schedule(), true);
  f.Notification.permission = 'denied';
  f.timers.fire(f.timers.jobs[0]);
  assert.equal(f.notices.length, 0);
  f.Notification.permission = 'granted';
  f.timers.fire(f.timers.jobs[0]);
  assert.equal(f.notices.length, 0);
});

check('cancellation invalidates tickets before a callback reenters from clearTimeout', () => {
  const f = fixture();
  assert.equal(f.schedule(), true);
  f.timers.onClear = job => job?.callback();
  f.emit('pagehide');
  assert.equal(f.notices.length, 0);
});

check('new account can schedule after the previous account is fenced', () => {
  const f = fixture();
  assert.equal(f.schedule(), true);
  const stale = f.timers.jobs[0];
  f.switchTo('fixture-owner-B');
  assert.equal(f.schedule(), true);
  f.timers.fire(stale);
  assert.equal(f.notices.length, 0);
  f.timers.fire(f.timers.jobs[1]);
  assert.equal(f.notices.length, 1);
});

for (const hostName of ['CrewCheckNative', 'AndroidCrewCheckNative']) {
  check(`a later ${hostName} cannot receive a browser-admitted notice`, () => {
    const f = fixture();
    let nativeNotices = 0, nativeSchedules = 0;
    assert.equal(f.schedule(), true);
    f.window[hostName] = {
      notify() { nativeNotices++; return true; },
      scheduleNotification() { nativeSchedules++; return true; },
    };
    f.timers.fire(f.timers.jobs[0]);
    assert.equal(f.notices.length, 1);
    assert.equal(nativeNotices, 0);
    assert.equal(nativeSchedules, 0);
  });
}

for (const [name, receipt] of [['accepted', true], ['rejected', false], ['throws', 'throw']]) {
  check(`native ${name} remains authoritative without any browser fallback`, () => {
    let nativeSchedules = 0, nativeNotices = 0, nativeArgs;
    const f = fixture({ owner: null, token: null, storageBlocked: true, native: {
      scheduleNotification(title, body, epoch) {
        nativeSchedules++;
        nativeArgs = [title, body, epoch];
        if (receipt === 'throw') throw new Error('Synthetic native refusal');
        return receipt;
      },
      notify() { nativeNotices++; return true; },
    } });
    assert.equal(f.schedule(), receipt === true);
    assert.deepEqual(nativeArgs, ['Synthetic reminder', 'Synthetic content only', String(NOW + 1_000)]);
    assert.equal(nativeSchedules, 1);
    assert.equal(nativeNotices, 0);
    assert.equal(f.timers.jobs.length, 0);
    assert.equal(f.notices.length, 0);
  });
}

for (const [name, options] of [
  ['anonymous account', { owner: null, token: null }],
  ['credential without owner', { owner: null }],
  ['owner without credential', { token: null }],
  ['malformed identity JSON', { rawUser: '{synthetic-invalid-json' }],
  ['null identity', { rawUser: 'null' }],
  ['identity without an owner key', { rawUser: '{}' }],
  ['blocked storage', { storageBlocked: true }],
]) {
  check(`${name} cannot admit a browser timer`, () => {
    const f = fixture(options);
    assert.equal(f.schedule(), false);
    assert.equal(f.timers.jobs.length, 0);
    assert.equal(f.notices.length, 0);
  });
}

for (const f of fixtures) {
  assert.deepEqual(f.forbidden, { fetch: 0, permission: 0, geolocation: 0 }, 'no API, permission or sensor operation was attempted');
}
console.log(JSON.stringify({ status: 'PASS', cases, fixtures: fixtures.length, scope: 'complete runtime and real authClient; synthetic accounts, retained callbacks and simulated browser/native APIs; no network or notification delivery' }));
