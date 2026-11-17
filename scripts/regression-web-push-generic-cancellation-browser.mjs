import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url);
const { chromium } = require('playwright');
const sources = Object.fromEntries(['crewcheck-push-offline.js', 'crewcheck-gate-receiver-offline.js']
  .map(name => [`/${name}`, fs.readFileSync(`client/public/${name}`, 'utf8')]));
const LOCK = 'crewcheck:gate-notice:v1';
const NOW = Date.parse('2031-01-05T10:00:00Z');
const endpointA = 'https://push-fixture.example.invalid/subscription-A';
const hash = value => createHash('sha256').update(value).digest('hex');
const A = { ownerId: 'owner_fixture_A', installationId: 'device_fixture_A', consentRevision: 2, subscriptionHash: hash(endpointA) };
const B = { ownerId: 'owner_fixture_B', installationId: 'device_fixture_B', consentRevision: 3, subscriptionHash: hash('https://push-fixture.example.invalid/subscription-B') };
const envelope = (binding, eventKey, expiresAt = NOW + 120_000) => ({ schema: 'crewcheck-notice-v1', ownerId: binding.ownerId,
  installationId: binding.installationId, consentRevision: binding.consentRevision, eventKey, expiresAt: new Date(expiresAt).toISOString(), route: '/app' });

// Import the shipping listeners unchanged. Only push arrival and notification
// display/enumeration are simulated. IndexedDB, MessageChannels, WindowClient
// provenance and the lock manager are Chromium's real implementations. One
// explicit fault delegates a readiness put to IndexedDB, then aborts its real tx.
const fixtureSource = String.raw`
const hooks = {}, nativeAdd = self.addEventListener.bind(self);
self.addEventListener = (type, listener, ...rest) => {
  if (type === 'push' || type === 'pushsubscriptionchange') hooks[type] = listener;
  else nativeAdd(type, listener, ...rest);
};
const state = { now: 1925373600000, attempts: 0, enumerations: 0, closes: 0, external: 0, abortedReadyWrites: 0,
  notices: [], locks: [], waitingDisplay: [], waitingClose: [],
  faults: { holdDisplay: false, rejectDisplay: false, holdClose: false, enumerationFailures: 0, closeFailures: 0, rejectLocks: false, readyAborts: 0 } };
Date.now = () => state.now;
self.fetch = () => { state.external++; throw Error('Worker network forbidden in this fixture'); };
const nativePut = IDBObjectStore.prototype.put;
IDBObjectStore.prototype.put = function(value, key, ...rest) {
  const request = nativePut.call(this, value, key, ...rest);
  if (this.transaction.db.name === 'crewcheck-notification-installation-v1' && this.name === 'state'
    && key === 'candidate-ready-generation:v1' && Number.isSafeInteger(value) && value > 0 && state.faults.readyAborts > 0) {
    state.faults.readyAborts--; state.abortedReadyWrites++; this.transaction.abort();
  }
  return request;
};
const lockManager = self.navigator.locks;
const supportedLocks = typeof lockManager?.request === 'function' && typeof lockManager?.query === 'function';
if (!supportedLocks) throw Error('Actual Chromium Web Locks required');
const nativeRequest = lockManager.request.bind(lockManager);
const noLocks = new URL(self.location.href).searchParams.get('locks') === 'none';
if (noLocks) Object.defineProperty(self.navigator, 'locks', { value: undefined });
else Object.defineProperty(lockManager, 'request', { value: (...args) => {
  const record = { name: args[0], delegated: false, granted: false, finished: false };
  state.locks.push(record);
  if (state.faults.rejectLocks) return Promise.reject(Error('Synthetic lock request rejection'));
  const callback = args.pop();
  record.delegated = true;
  return nativeRequest(...args, async lock => {
    record.granted = true;
    try { return await callback(lock); } finally { record.finished = true; }
  });
} });
Object.defineProperty(self.registration, 'showNotification', { value: async (title, options) => {
  state.attempts++;
  if (state.faults.holdDisplay) await new Promise(resolve => state.waitingDisplay.push(resolve));
  if (state.faults.rejectDisplay) throw Error('Synthetic display result uncertain');
  const notice = { title, ...options, closed: false, async close() {
    state.closes++;
    if (state.faults.holdClose) await new Promise(resolve => state.waitingClose.push(resolve));
    if (state.faults.closeFailures > 0) { state.faults.closeFailures--; throw Error('Synthetic close failure'); }
    this.closed = true;
  } };
  state.notices.push(notice);
} });
Object.defineProperty(self.registration, 'getNotifications', { value: async () => {
  state.enumerations++;
  if (state.faults.enumerationFailures > 0) { state.faults.enumerationFailures--; throw Error('Synthetic enumeration failure'); }
  return state.notices.filter(notice => !notice.closed);
} });
importScripts('/crewcheck-gate-receiver-offline.js', '/crewcheck-push-offline.js');
async function invoke(type, data) {
  let pending;
  hooks[type]({ ...data, waitUntil(value) { pending = value; } });
  if (!pending) throw Error('Shipping listener did not register its work');
  await pending;
  return { done: true };
}
async function records() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('crewcheck-notification-installation-v1', 1);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readonly'), store = tx.objectStore('state');
    const keys = store.getAllKeys(), values = store.getAll();
    tx.oncomplete = () => resolve(keys.result.map((key, i) => ({ key, value: values.result[i] })));
    tx.onerror = tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
nativeAdd('message', event => {
  if (!event.data?.qa) return;
  event.waitUntil((async () => {
    const data = event.data; let result;
    try {
      if (data.action === 'receive') result = await invoke('push', { data: { json: () => data.envelope } });
      else if (data.action === 'subscription-change') result = await invoke('pushsubscriptionchange', { oldSubscription: { endpoint: data.endpoint } });
      else if (data.action === 'config') { Object.assign(state.faults, data.value); result = { ok: true }; }
      else if (data.action === 'clock') { state.now = data.now; result = { ok: true }; }
      else if (data.action === 'release-display') { state.faults.holdDisplay = false; state.waitingDisplay.splice(0).forEach(resolve => resolve()); result = { ok: true }; }
      else if (data.action === 'release-close') { state.faults.holdClose = false; state.waitingClose.splice(0).forEach(resolve => resolve()); result = { ok: true }; }
      else if (data.action === 'records') result = await records();
      else result = { supportedLocks, exposedLocks: typeof self.navigator.locks?.request === 'function',
        locks: state.locks, attempts: state.attempts, enumerations: state.enumerations, closes: state.closes,
        waitingDisplay: state.waitingDisplay.length, waitingClose: state.waitingClose.length, external: state.external, abortedReadyWrites: state.abortedReadyWrites,
        notices: state.notices.map(notice => ({ closed: notice.closed, title: notice.title, body: notice.body, ownerId: notice.data?.binding?.ownerId, eventKey: notice.data?.envelope?.eventKey })) };
    } catch { result = { fixtureError: 'Synthetic fixture operation failed' }; }
    event.ports[0]?.postMessage(result);
  })());
});`;

let unexpectedRequests = 0, browser;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://fixture.invalid').pathname;
  res.setHeader('Cache-Control', 'no-store');
  if (pathname === '/fixture-sw.js' || sources[pathname]) {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(pathname === '/fixture-sw.js' ? fixtureSource : sources[pathname]);
  } else if (pathname === '/' || pathname === '/favicon.ico') {
    res.setHeader('Content-Type', 'text/html'); res.end('<title>Isolated generic push cancellation fixture</title>');
  } else { unexpectedRequests++; res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const evidence = [];
let cases = 0;

const awaitedBarrierEvidence = [];
// Await the resolved RPC/lock snapshot before testing it. An async predicate
// passed to waitForFunction can itself be truthy before its result is known.
async function awaitedBarrier(label, read, accepts) {
  const deadline = performance.now() + 10_000;
  let last, polls = 0;
  while (performance.now() < deadline) {
    let timeout;
    try {
      last = await Promise.race([
        Promise.resolve().then(read),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(Error(`Barrier read timed out: ${label}`)), Math.max(1, Math.ceil(deadline - performance.now()))); }),
      ]);
    } finally { clearTimeout(timeout); }
    polls++;
    if (accepts(last)) {
      awaitedBarrierEvidence.push({ label, polls, observed: last });
      return last;
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(10, Math.max(1, deadline - performance.now()))));
  }
  assert.fail(`Barrier not reached: ${label}; last observed ${JSON.stringify(last)}`);
}

async function withFixture(run, { noLocks = false } = {}) {
  const context = await browser.newContext();
  const pageErrors = []; let externalRequests = 0;
  await context.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue() : (externalRequests++, route.abort()));
  const page = await context.newPage(); page.setDefaultTimeout(10_000);
  page.on('pageerror', error => pageErrors.push(error.message));
  try {
    await page.goto(origin);
    await page.evaluate(async noLocks => {
      await navigator.serviceWorker.register('/fixture-sw.js' + (noLocks ? '?locks=none' : ''));
      const registration = await navigator.serviceWorker.ready;
      const active = registration.active;
      window.qa = {
        tasks: {},
        rpc(data) { return new Promise((resolve, reject) => {
          const channel = new MessageChannel();
          const timeout = setTimeout(() => { channel.port1.close(); reject(Error('Fixture RPC timed out: ' + data.action)); }, 10_000);
          channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); resolve(event.data); };
          active.postMessage(data, [channel.port2]);
        }); },
        start(id, data) {
          const task = { settled: false }; this.tasks[id] = task;
          task.promise = this.rpc(data).then(result => { task.settled = true; return result; }, () => { task.settled = true; return { fixtureError: 'Pending fixture RPC failed' }; });
        },
        dropResponse(data) { return new Promise((resolve, reject) => {
          const channel = new MessageChannel();
          const timeout = setTimeout(() => { channel.port1.close(); reject(Error('Dropped-response fixture timed out')); }, 10_000);
          // Deliberately ignore the begin payload, including its generation.
          channel.port1.onmessage = () => { clearTimeout(timeout); channel.port1.close(); resolve({ dropped: true }); };
          active.postMessage(data, [channel.port2]);
        }); },
      };
    }, noLocks);
    const f = {
      page,
      rpc: data => page.evaluate(data => window.qa.rpc(data), data),
      start: (id, data) => page.evaluate(({ id, data }) => window.qa.start(id, data), { id, data }),
      wait: id => page.evaluate(id => window.qa.tasks[id].promise, id),
      settled: id => page.evaluate(id => window.qa.tasks[id].settled, id),
      config: value => f.rpc({ qa: true, action: 'config', value }),
      stats: () => f.rpc({ qa: true, action: 'stats' }),
      status: ownerId => f.rpc({ crewcheckPush: true, action: 'status', ownerId }),
      begin: (binding, confirmed = false) => f.rpc({ crewcheckPush: true, action: 'begin', ownerId: binding.ownerId, confirmed }),
      bind: (binding, generation, confirmed = false) => f.rpc({ crewcheckPush: true, action: 'bind', binding, generation, confirmed }),
      cancel: (binding, cancelled = false) => f.rpc({ crewcheckPush: true, action: 'cancel', ownerId: binding.ownerId, cancelled }),
      receive: value => f.rpc({ qa: true, action: 'receive', envelope: value }),
      release: kind => f.rpc({ qa: true, action: `release-${kind}` }),
      async activate(binding, confirmed = false) {
        const start = await f.begin(binding, confirmed); assert.equal(start.ok, true);
        assert.equal((await f.bind(binding, start.generation, confirmed)).ok, true); return start.generation;
      },
      async held(kind) {
        const value = await awaitedBarrier(`held ${kind}`, async () => {
          const stats = await f.stats();
          const locks = await page.evaluate(async name => {
            const value = await navigator.locks.query();
            return { held: value.held.filter(lock => lock.name === name).map(lock => lock.mode),
              pending: value.pending.filter(lock => lock.name === name).map(lock => lock.mode) };
          }, LOCK);
          return { waiting: stats[kind === 'display' ? 'waitingDisplay' : 'waitingClose'], attempts: stats.attempts, ...locks };
        }, value => value.waiting === 1 && value.held.length === 1);
        assert.equal(value.waiting, 1, 'the worker actually entered the requested barrier');
        assert.equal(value.attempts, 1, 'exactly one display reached the pending operation');
        assert.deepEqual(value.held, ['exclusive'], 'the real native lock remains held');
      },
      async queued(count = 1) {
        const value = await awaitedBarrier(`queued ${count}`, () => page.evaluate(async name => {
          const value = await navigator.locks.query();
          return { held: value.held.filter(lock => lock.name === name).map(lock => lock.mode),
            pending: value.pending.filter(lock => lock.name === name).map(lock => lock.mode) };
        }, LOCK), value => value.held.length === 1 && value.pending.length === count);
        assert.deepEqual(value.held, ['exclusive'], 'the real native lock remains held');
        assert.deepEqual(value.pending, Array(count).fill('exclusive'), 'the exact expected native queue exists before continuation');
      },
    };
    const initial = await f.stats();
    assert.equal(initial.supportedLocks, true, 'real Chromium Web Locks must be available; no polyfill/skip');
    assert.equal(initial.exposedLocks, !noLocks);
    assert.equal((await f.status(A.ownerId)).binding, null, 'each browser context starts with isolated IndexedDB');
    await f.rpc({ qa: true, action: 'clock', now: NOW });
    await run(f);
    const final = await f.stats();
    assert.equal(final.external, 0, 'the worker attempted no external fetch');
    assert.equal(externalRequests, 0, 'the browser attempted no external requests');
    assert.deepEqual(pageErrors, []);
    evidence.push({ supportedLocks: final.supportedLocks, exposedLocks: final.exposedLocks,
      nativeDelegations: final.locks.filter(lock => lock.delegated).length,
      nativeGrants: final.locks.filter(lock => lock.granted).length, abortedReadyWrites: final.abortedReadyWrites });
  } finally { await context.close(); }
}

const visible = stats => stats.notices.filter(notice => !notice.closed);
const pendingReceive = value => ({ qa: true, action: 'receive', envelope: value });
const cancelRequest = binding => ({ crewcheckPush: true, action: 'cancel', ownerId: binding.ownerId });

const checks = [
  ['pending generic display serializes duplicate arrival and cancellation before ACK', () => withFixture(async f => {
    await f.activate(A); await f.config({ holdDisplay: true });
    const notice = envelope(A, 'generic_pending_cancel');
    await f.start('display', pendingReceive(notice)); await f.held('display');
    await f.start('duplicate', pendingReceive(notice)); await f.queued();
    await f.start('cancel', cancelRequest(A)); await f.queued(2);
    assert.equal(await f.settled('cancel'), false);
    await f.release('display');
    assert.equal((await f.wait('display')).done, true);
    assert.equal((await f.wait('duplicate')).done, true);
    assert.equal((await f.wait('cancel')).ok, true);
    const stats = await f.stats(); assert.equal(stats.attempts, 1); assert.equal(visible(stats).length, 0);
    assert.equal((await f.status(A.ownerId)).binding, null);
  })],
  ['A to B begin waits for cleanup; queued bind, late A cancellation and direct rebind preserve B', () => withFixture(async f => {
    await f.activate(A); await f.receive(envelope(A, 'generic_owner_A_notice'));
    await f.config({ holdClose: true });
    await f.start('begin-B', { crewcheckPush: true, action: 'begin', ownerId: B.ownerId }); await f.held('close');
    assert.equal(await f.settled('begin-B'), false);
    const generation = (await f.status(B.ownerId)).generation;
    await f.start('bind-B', { crewcheckPush: true, action: 'bind', binding: B, generation }); await f.queued();
    assert.equal(await f.settled('bind-B'), false);
    await f.release('close'); assert.equal((await f.wait('begin-B')).ok, true); assert.equal((await f.wait('bind-B')).ok, true);
    assert.equal(visible(await f.stats()).length, 0, 'old A notice is closed before begin ACK');
    await f.receive(envelope(B, 'generic_owner_B_notice'));
    assert.equal((await f.cancel(A)).ok, false, 'late A cannot cancel B');
    const before = await f.stats();
    for (const replacement of [{ ...B, subscriptionHash: hash('synthetic-replacement') }, { ...B, consentRevision: B.consentRevision + 1 },
      { ...B, installationId: 'device_fixture_other' }, { ...B, ownerId: A.ownerId }]) {
      assert.equal((await f.bind(replacement, generation)).ok, false, 'replacement requires a new begin and cleanup');
      assert.deepEqual((await f.status(B.ownerId)).binding, B, 'a refused replacement preserves every active scope field');
      assert.deepEqual(visible(await f.stats()).map(notice => notice.ownerId), [B.ownerId]);
    }
    assert.equal((await f.bind(B, generation)).ok, true, 'an exact repeated bind remains idempotent');
    assert.equal((await f.bind({ ...B, fixtureMetadata: 'synthetic-metadata-must-not-be-written' }, generation)).ok, true,
      'an identical active scope accepts an idempotent receipt without accepting replacement metadata');
    assert.deepEqual((await f.status(B.ownerId)).binding, B, 'the idempotent receipt never rewrites the persisted binding');
    const after = await f.stats(); assert.equal(after.enumerations, before.enumerations);
    assert.deepEqual(visible(after).map(notice => notice.ownerId), [B.ownerId]);
  })],
  ['pending A display followed by cancel A and begin B has no stale visible A after ACKs', () => withFixture(async f => {
    await f.activate(A); await f.config({ holdDisplay: true });
    await f.start('display', pendingReceive(envelope(A, 'generic_cancel_begin_A'))); await f.held('display');
    await f.start('cancel', cancelRequest(A)); await f.queued();
    await f.start('begin-B', { crewcheckPush: true, action: 'begin', ownerId: B.ownerId }); await f.queued(2);
    await f.release('display');
    assert.equal((await f.wait('display')).done, true); assert.equal((await f.wait('cancel')).ok, true);
    const next = await f.wait('begin-B'); assert.equal(next.ok, true);
    assert.equal((await f.bind(B, next.generation)).ok, true);
    await f.receive(envelope(B, 'generic_cancel_begin_B'));
    assert.deepEqual(visible(await f.stats()).map(notice => notice.ownerId), [B.ownerId]);
  })],
  ['a refused begin for explicitly cancelled A cannot close B notices', () => withFixture(async f => {
    await f.activate(A); assert.equal((await f.cancel(A, true)).ok, true);
    await f.activate(B); await f.receive(envelope(B, 'generic_cancelled_owner_B'));
    const before = await f.stats(); assert.equal((await f.begin(A)).ok, false);
    assert.equal((await f.status(B.ownerId)).binding.ownerId, B.ownerId);
    const after = await f.stats(); assert.equal(after.enumerations, before.enumerations);
    assert.deepEqual(visible(after).map(notice => notice.ownerId), [B.ownerId]);
  })],
  ['uncertain display releases the lock, cancellation completes and the same claim never replays', () => withFixture(async f => {
    await f.activate(A); await f.config({ holdDisplay: true, rejectDisplay: true });
    const notice = envelope(A, 'generic_uncertain_display');
    await f.start('display', pendingReceive(notice)); await f.held('display');
    await f.start('cancel', cancelRequest(A)); await f.queued(); await f.release('display');
    assert.equal((await f.wait('display')).done, true); assert.equal((await f.wait('cancel')).ok, true);
    const records = await f.rpc({ qa: true, action: 'records' });
    assert.equal(records.find(record => String(record.key).includes(notice.eventKey))?.value.status, 'uncertain');
    await f.config({ rejectDisplay: false }); await f.activate(A); await f.receive(notice);
    const stats = await f.stats(); assert.equal(stats.attempts, 1); assert.equal(visible(stats).length, 0);
  })],
  ['enumeration and close failures return false with binding revoked; retry closes the retained notice', async () => {
    for (const fault of ['enumerationFailures', 'closeFailures']) await withFixture(async f => {
      await f.activate(A); await f.receive(envelope(A, `generic_cleanup_${fault}`));
      await f.config({ [fault]: 1 }); assert.equal((await f.cancel(A)).ok, false);
      assert.equal((await f.status(A.ownerId)).binding, null, 'cleanup failure cannot restore the binding');
      assert.equal(visible(await f.stats()).length, 1);
      assert.equal((await f.cancel(A)).ok, true); assert.equal(visible(await f.stats()).length, 0);
    });
  }],
  ['failed begin cannot admit bind through its exposed generation; a clean new begin recovers', () => withFixture(async f => {
    await f.activate(A); await f.receive(envelope(A, 'generic_begin_enumeration_failure'));
    await f.config({ enumerationFailures: 1 }); assert.equal((await f.begin(B)).ok, false);
    const failed = await f.status(B.ownerId); assert.equal(failed.binding, null); assert(Number.isSafeInteger(failed.generation));
    assert.equal((await f.bind(B, failed.generation)).ok, false, 'status is not a cleanup-complete admission');
    assert.equal(visible(await f.stats()).length, 1);
    await f.activate(B, true); assert.equal(visible(await f.stats()).length, 0);
  })],
  ['bind queued behind failed begin cleanup remains refused after the lock is released', () => withFixture(async f => {
    await f.activate(A); await f.receive(envelope(A, 'generic_begin_close_failure'));
    await f.config({ holdClose: true, closeFailures: 1 });
    await f.start('begin-B', { crewcheckPush: true, action: 'begin', ownerId: B.ownerId }); await f.held('close');
    const generation = (await f.status(B.ownerId)).generation;
    await f.start('bind-B', { crewcheckPush: true, action: 'bind', binding: B, generation }); await f.queued();
    assert.equal(await f.settled('bind-B'), false); await f.release('close');
    assert.equal((await f.wait('begin-B')).ok, false); assert.equal((await f.wait('bind-B')).ok, false);
    assert.equal((await f.status(B.ownerId)).binding, null);
    await f.activate(B, true); assert.equal(visible(await f.stats()).length, 0);
  })],
  ['an aborted real readiness transaction cannot produce admission and a clean begin recovers', () => withFixture(async f => {
    await f.activate(A); await f.receive(envelope(A, 'generic_ready_tx_abort_A'));
    let records = await f.rpc({ qa: true, action: 'records' });
    assert.equal(records.find(record => record.key === 'candidate-ready-generation:v1')?.value, null);
    await f.config({ readyAborts: 1 }); assert.equal((await f.begin(B)).ok, false);
    assert.equal((await f.stats()).abortedReadyWrites, 1, 'the real positive readiness put was attempted and its transaction aborted once');
    records = await f.rpc({ qa: true, action: 'records' });
    assert.equal(records.find(record => record.key === 'candidate-ready-generation:v1')?.value, null, 'the aborted transaction cannot publish READY');
    const status = await f.status(B.ownerId); assert.equal(status.binding, null);
    assert.equal((await f.bind(B, status.generation)).ok, false);
    assert.equal(visible(await f.stats()).length, 0, 'cleanup completed even though READY commit failed');
    await f.activate(B, true); await f.receive(envelope(B, 'generic_ready_tx_abort_B'));
    assert.deepEqual(visible(await f.stats()).map(notice => notice.ownerId), [B.ownerId]);
    assert.equal((await f.stats()).abortedReadyWrites, 1);
  })],
  ['late A cancel and subscription change cannot erase ready B before its first bind', () => withFixture(async f => {
    await f.activate(A); await f.receive(envelope(A, 'generic_ready_stale_A'));
    const next = await f.begin(B); assert.equal(next.ok, true);
    const phase = async () => {
      const records = await f.rpc({ qa: true, action: 'records' });
      return { owner: records.find(record => record.key === 'candidateOwner')?.value,
        ready: records.find(record => record.key === 'candidate-ready-generation:v1')?.value };
    };
    assert.deepEqual(await phase(), { owner: B.ownerId, ready: next.generation });
    assert.equal((await f.cancel(A)).ok, false);
    assert.deepEqual(await phase(), { owner: B.ownerId, ready: next.generation });
    assert.equal((await f.rpc({ qa: true, action: 'subscription-change', endpoint: endpointA })).done, true);
    assert.deepEqual(await phase(), { owner: B.ownerId, ready: next.generation }, 'a stale endpoint event cannot reset the pending B admission');
    const status = await f.status(B.ownerId); assert.equal(status.generation, next.generation);
    assert.equal(status.binding, null); assert.equal(status.renewal, null);
    assert.equal((await f.bind(B, next.generation)).ok, true);
    await f.receive(envelope(B, 'generic_ready_stale_B'));
    assert.deepEqual(visible(await f.stats()).map(notice => notice.ownerId), [B.ownerId]);
  })],
  ['dropping the begin response payload does not undo cleanup or committed readiness', () => withFixture(async f => {
    await f.activate(A); await f.receive(envelope(A, 'generic_begin_payload_dropped_A'));
    const dropped = await f.page.evaluate(ownerId => window.qa.dropResponse({ crewcheckPush: true, action: 'begin', ownerId }), B.ownerId);
    assert.deepEqual(dropped, { dropped: true });
    assert.equal(visible(await f.stats()).length, 0);
    const status = await f.status(B.ownerId); assert.equal(status.binding, null); assert(Number.isSafeInteger(status.generation));
    const records = await f.rpc({ qa: true, action: 'records' });
    assert.equal(records.find(record => record.key === 'candidate-ready-generation:v1')?.value, status.generation);
    assert.equal(records.find(record => record.key === 'candidateOwner')?.value, B.ownerId);
    assert.equal((await f.bind(B, status.generation)).ok, true, 'the separately read generation works only because cleanup and READY committed');
    await f.receive(envelope(B, 'generic_begin_payload_dropped_B'));
    assert.deepEqual(visible(await f.stats()).map(notice => notice.ownerId), [B.ownerId]);
  })],
  ['without Web Locks generic arrival is not admitted while legacy controls stay best effort', () => withFixture(async f => {
    await f.activate(A); await f.receive(envelope(A, 'generic_no_lock_manager'));
    const stats = await f.stats(); assert.equal(stats.attempts, 0); assert.equal(stats.locks.length, 0);
    assert.equal((await f.cancel(A)).ok, true); assert.equal((await f.status(A.ownerId)).binding, null);
  }, { noLocks: true })],
  ['rejected real-lock admission cannot display or silently fall back and can recover', () => withFixture(async f => {
    await f.activate(A); await f.config({ rejectLocks: true });
    await f.receive(envelope(A, 'generic_rejected_lock'));
    let stats = await f.stats(); assert.equal(stats.attempts, 0);
    assert(stats.locks.some(lock => !lock.delegated && !lock.granted));
    await f.config({ rejectLocks: false }); await f.receive(envelope(A, 'generic_recovered_lock'));
    stats = await f.stats(); assert.equal(stats.attempts, 1); assert.equal(visible(stats).length, 1);
  })],
  ['expiry while waiting for the origin lock is checked after admission', () => withFixture(async f => {
    await f.activate(A); await f.config({ holdDisplay: true });
    await f.start('first', pendingReceive(envelope(A, 'generic_ttl_first'))); await f.held('display');
    await f.start('expired', pendingReceive(envelope(A, 'generic_ttl_waiter', NOW + 10))); await f.queued();
    await f.rpc({ qa: true, action: 'clock', now: NOW + 20 }); await f.release('display');
    assert.equal((await f.wait('first')).done, true); assert.equal((await f.wait('expired')).done, true);
    const stats = await f.stats(); assert.equal(stats.attempts, 1);
    assert.deepEqual(visible(stats).map(notice => notice.eventKey), ['generic_ttl_first']);
  })],
  ['subscription change waits for generic display, revokes the matching binding and closes before completion', () => withFixture(async f => {
    await f.activate(A); await f.config({ holdDisplay: true });
    await f.start('display', pendingReceive(envelope(A, 'generic_subscription_pending'))); await f.held('display');
    await f.start('change', { qa: true, action: 'subscription-change', endpoint: endpointA }); await f.queued();
    assert.equal(await f.settled('change'), false); await f.release('display');
    assert.equal((await f.wait('display')).done, true); assert.equal((await f.wait('change')).done, true);
    const status = await f.status(A.ownerId); assert.equal(status.binding, null); assert.equal(status.renewal?.reason, 'subscription_changed');
    assert.equal(visible(await f.stats()).length, 0);
    await f.receive(envelope(A, 'generic_after_subscription_change')); assert.equal((await f.stats()).attempts, 1);
  })],
];

try {
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  // Only independent, storage-isolated contexts overlap; races inside a case are
  // ordered by the real lock queue and explicit barriers, never fixed sleeps.
  for (let offset = 0; offset < checks.length; offset += 2) {
    await Promise.all(checks.slice(offset, offset + 2).map(async ([name, run]) => {
      await run(); cases++; console.log(`PASS ${name}`);
    }));
  }
  assert.equal(unexpectedRequests, 0);
  assert(evidence.every(value => value.supportedLocks));
  assert(evidence.some(value => value.nativeDelegations > 0 && value.nativeGrants > 0));
  console.log(JSON.stringify({ status: 'PASS', cases, contexts: evidence.length, browser: browser.version(),
    realWebLocks: true, nativeDelegations: evidence.reduce((sum, item) => sum + item.nativeDelegations, 0),
    nativeGrants: evidence.reduce((sum, item) => sum + item.nativeGrants, 0), unavailableLockContexts: evidence.filter(item => !item.exposedLocks).length,
    realReadyTransactionAborts: evidence.reduce((sum, item) => sum + item.abortedReadyWrites, 0),
    awaitedBarriers: awaitedBarrierEvidence,
    scope: 'shipping listeners, real IndexedDB/Web Locks and same-origin WindowClients; synthetic arrivals/display/failures and local clock; no subscription, permission request, external API or OS delivery' }));
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
