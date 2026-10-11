import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createMyCrewCareObservedCoordinator, MYCREWCARE_OBSERVED_COORDINATOR_RELEASE_ENABLED } from '../shared/myCrewCareObservedCoordinator.mjs';
const { JSDOM } = createRequire(process.env.WAKEUP_JSDOM_PACKAGE ?? import.meta.url)('jsdom');
const fixture = name => readFileSync(new URL(`./fixtures/mycrewcare-observed/${name}.synthetic.html`, import.meta.url), 'utf8');
const binding = Object.freeze({ accountId: 'synthetic-A', sessionId: 'synthetic-session-A', employeeId: '900000001', username: 'synthetic.crew@example.invalid' });
const origin = 'https://api2.apicrewcare.com/LATAM/';
function response(request) {
  const name = request.kind.startsWith('profile') ? 'profile' : request.kind === 'cards' ? 'mytravel' : 'reservation';
  const path = name === 'profile' ? 'userprofile.aspx' : name === 'mytravel' ? 'mytravel.aspx' : `reservation.aspx?tripreservid=${request.card.providerReservationId}&dutyperiodnumber=${request.card.dutyPeriodNumber}`;
  return { ...request.scope, document: new JSDOM(fixture(name)).window.document, url: origin + path };
}
test('coordinator brackets same-session cards/details with fresh identity observations', async () => {
  const requests = [];
  const coordinator = createMyCrewCareObservedCoordinator({ acquire: async request => { requests.push(request); return response(request); } });
  const callerOwned = { ...binding };
  assert.equal(coordinator.bind(callerOwned), true);
  callerOwned.accountId = 'changed-by-caller';
  const result = await coordinator.read();
  assert.equal(MYCREWCARE_OBSERVED_COORDINATOR_RELEASE_ENABLED, false);
  assert.deepEqual(requests.map(r => r.kind), ['profile-before', 'cards', 'detail', 'profile-after']);
  assert.equal(requests.every(r => Object.isFrozen(r.scope) && r.scope === requests[0].scope), true);
  assert.equal(result.accountId, binding.accountId);
  assert.equal(result.operationalImportAllowed, false);
  assert.equal(result.reservations[0].status.display, 'Planejada');
  assert.equal(Object.isFrozen(result.reservations), true);
});
test('changed identity and mismatched session metadata fail without publishing', async () => {
  for (const kind of ['profile-before', 'cards', 'detail', 'profile-after']) {
    const coordinator = createMyCrewCareObservedCoordinator({ acquire: async request => {
      const value = response(request);
      if (request.kind === kind) value.sessionId = 'other-session';
      return value;
    } });
    coordinator.bind(binding);
    assert.equal(await coordinator.read(), null);
    assert.equal(coordinator.observation(), null);
  }
  const coordinator = createMyCrewCareObservedCoordinator({ acquire: async request => {
    const value = response(request);
    if (request.kind === 'profile-after') value.document.querySelector('#employeeId').value = '900000002';
    return value;
  } });
  coordinator.bind(binding);
  assert.equal(await coordinator.read(), null);
});
test('cancel or account switch invalidates every pending acquisition phase', async () => {
  for (const phase of ['profile-before', 'cards', 'detail', 'profile-after']) {
    for (const action of ['cancel', 'switch', 'disconnect']) {
      let release;
      let entered;
      const waiting = new Promise(resolve => { entered = resolve; });
      const coordinator = createMyCrewCareObservedCoordinator({ acquire: request => {
        if (request.kind === phase && request.scope.accountId === binding.accountId) return new Promise(resolve => {
          release = () => resolve(response(request)); entered();
        });
        return Promise.resolve(response(request));
      } });
      coordinator.bind(binding);
      const old = coordinator.read();
      await waiting;
      if (action === 'switch') coordinator.bind({ ...binding, accountId: 'synthetic-B', sessionId: 'session-B' });
      else coordinator[action]();
      assert.equal(await old, null); // abort settles even if acquisition ignores abort
      if (action !== 'disconnect') {
        if (action === 'cancel') coordinator.bind({ ...binding, accountId: 'synthetic-B', sessionId: 'session-B' });
        const next = await coordinator.read();
        assert.equal(next.accountId, 'synthetic-B');
        release();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(coordinator.observation(), next);
      } else { release(); assert.equal(await coordinator.read(), null); }
    }
  }
});
test('late documents cannot be mutated through caller references', async () => {
  let detail;
  const coordinator = createMyCrewCareObservedCoordinator({ acquire: async request => {
    const value = response(request);
    if (request.kind === 'detail') detail = value.document;
    if (request.kind === 'profile-after') detail.querySelector('a[href^="hoteldetails.aspx?"]').textContent = 'Injected later';
    return value;
  } });
  coordinator.bind(binding);
  assert.equal((await coordinator.read()).reservations[0].hotelName, 'Synthetic Harbor Hotel');
});

test('new same-account read wins over an older incomplete read', async () => {
  let release;
  let entered;
  let firstRequest;
  const enteredFirst = new Promise(resolve => { entered = resolve; });
  const coordinator = createMyCrewCareObservedCoordinator({ acquire: request => {
    if (!firstRequest) {
      firstRequest = request.scope.requestId;
      return new Promise(resolve => { release = () => resolve(response(request)); entered(); });
    }
    return Promise.resolve(response(request));
  } });
  coordinator.bind(binding);
  const older = coordinator.read();
  await enteredFirst;
  const newer = await coordinator.read();
  assert.equal(await older, null);
  assert.notEqual(newer.requestId, firstRequest);
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(coordinator.observation(), newer);
});

test('abort reentrancy gives the nested newer read sole ownership in either completion order', async () => {
  for (const order of ['nested-first', 'outer-first']) {
    let coordinator;
    let nested;
    let first = true;
    const gates = [];
    const coordinatorAcquire = request => {
      if (first) {
        first = false;
        request.signal.addEventListener('abort', () => { nested = coordinator.read(); }, { once: true });
        return new Promise(() => {});
      }
      if (request.kind === 'profile-before') return new Promise(resolve => gates.push({ request, release: () => resolve(response(request)) }));
      return Promise.resolve(response(request));
    };
    coordinator = createMyCrewCareObservedCoordinator({ acquire: coordinatorAcquire });
    coordinator.bind(binding);
    const older = coordinator.read();
    const outer = coordinator.read(); // abort synchronously starts nested, newer read
    assert.ok(nested);
    if (order === 'nested-first') {
      gates[0].release();
      const newest = await nested;
      for (const gate of gates.slice(1)) gate.release();
      await outer;
      assert.equal(coordinator.observation(), newest);
    } else {
      for (const gate of gates.slice(1)) gate.release();
      // Outer must already be invalidated, even before nested finishes.
      assert.equal(await outer, null);
      gates[0].release();
      const newest = await nested;
      assert.equal(coordinator.observation(), newest);
    }
    assert.equal(await older, null);
  }
});

test('reentrant cancel, disconnect and account binding retain the newest transition', async () => {
  for (const action of ['cancel', 'disconnect', 'bind']) {
    let coordinator;
    let nested;
    let first = true;
    let nestedSignal;
    let release;
    const coordinatorAcquire = request => {
      if (first) {
        first = false;
        request.signal.addEventListener('abort', () => {
          if (action === 'bind') coordinator.bind({ ...binding, accountId: 'synthetic-B', sessionId: 'session-B' });
          nested = coordinator.read();
        }, { once: true });
        return new Promise(() => {});
      }
      if (request.kind === 'profile-before') {
        nestedSignal = request.signal;
        return new Promise(resolve => { release = () => resolve(response(request)); });
      }
      return Promise.resolve(response(request));
    };
    coordinator = createMyCrewCareObservedCoordinator({ acquire: coordinatorAcquire });
    coordinator.bind(binding);
    const older = coordinator.read();
    if (action === 'bind') coordinator.bind({ ...binding, accountId: 'outer-B', sessionId: 'outer-session-B' });
    else coordinator[action]();
    assert.equal(await older, null);
    if (action === 'disconnect') { assert.equal(await nested, null); continue; }
    assert.equal(nestedSignal.aborted, false);
    // A later explicit cancellation must still reach this reentrant pending read.
    coordinator.cancel();
    assert.equal(nestedSignal.aborted, true);
    assert.equal(await nested, null);
    release();
    assert.equal(coordinator.observation(), null);
  }
});
