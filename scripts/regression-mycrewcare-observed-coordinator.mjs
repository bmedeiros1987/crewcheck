import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createMyCrewCareObservedCoordinator, MYCREWCARE_OBSERVED_COORDINATOR_RELEASE_ENABLED } from '../shared/myCrewCareObservedCoordinator.mjs';
import { mapMyCrewCareObservedCandidates, myCrewCareLocalInstant, normalizeMyCrewCareRecord, reconcileMyCrewCareLogistics } from '../shared/myCrewCareLogistics.mjs';
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

test('reentrant reads cannot overwrite, clear or lose newer pending ownership at any phase', async () => {
  for (const phase of ['profile-before', 'cards', 'detail', 'profile-after']) {
    for (const consequence of ['late-success', 'late-failure', 'pending-cancel']) {
      let coordinator;
      let initialId;
      let nested;
      let enterInitial;
      let enterNested;
      const initialWaiting = new Promise(resolve => { enterInitial = resolve; });
      const nestedWaiting = new Promise(resolve => { enterNested = resolve; });
      const gates = [];
      const scopes = new Map();
      coordinator = createMyCrewCareObservedCoordinator({ acquire: request => {
        scopes.set(request.scope.requestId, request.scope);
        initialId ??= request.scope.requestId;
        if (request.kind !== phase) return Promise.resolve(response(request));
        if (request.scope.requestId === initialId) {
          request.signal.addEventListener('abort', () => { nested = coordinator.read(); }, { once: true });
          enterInitial();
          return new Promise(() => {});
        }
        return new Promise((resolve, reject) => {
          gates.push({ request, release: () => resolve(response(request)), reject: () => reject(new Error('synthetic-late-failure')) });
          enterNested();
        });
      } });
      coordinator.bind(binding);
      const older = coordinator.read();
      await initialWaiting;
      const outer = coordinator.read();
      await nestedWaiting;
      await new Promise(resolve => setImmediate(resolve));
      if (consequence === 'pending-cancel') {
        for (const gate of gates.slice(1)) gate.reject();
        assert.equal(await outer, null);
        coordinator.cancel();
        assert.equal(gates[0].request.signal.aborted, true, `${phase}: nested pending must remain reachable`);
        assert.equal(await nested, null);
        gates[0].release();
      } else {
        gates[0].release();
        const newest = await nested;
        assert.ok(newest);
        for (const gate of gates.slice(1)) consequence === 'late-failure' ? gate.reject() : gate.release();
        assert.equal(await outer, null, `${phase}: superseded outer invocation must not succeed`);
        assert.equal(coordinator.observation(), newest, `${phase}: late completion cannot replace/clear nested`);
      }
      assert.equal(await older, null);
      const generations = [...scopes.values()].map(scope => scope.generation);
      assert.equal(new Set(generations).size, generations.length, `${phase}: acquired requests own distinct generations`);
    }
  }
});

// Observation -> OFF-only candidates/pending. Synthetic fixtures only; no import, UI or provider call.
const NOW = Date.parse('2031-11-19T12:00:00Z');
const AT = new Date(NOW).toISOString();
function variant(request, edits) {
  const value = response(request);
  const name = request.kind.startsWith('profile') ? 'profile' : request.kind === 'cards' ? 'mytravel' : 'reservation';
  let html = fixture(name);
  for (const [from, to] of edits) html = html.replaceAll(from, to);
  return { ...value, document: new JSDOM(html).window.document };
}
async function observe(edits = [], { clock = () => NOW, scope = binding } = {}) {
  const coordinator = createMyCrewCareObservedCoordinator({ acquire: async request => variant(request, edits), clock });
  coordinator.bind(scope);
  return coordinator.read();
}
const expectedFor = observation => ({ accountId: binding.accountId, sessionId: binding.sessionId, requestId: observation?.requestId ?? 'none' });
const candidates = (observation, options = {}) => mapMyCrewCareObservedCandidates({ observation, expected: expectedFor(observation), now: NOW, ...options });
const ALWAYS_PENDING = ['pickup-date-unavailable', 'stay-binding-unavailable', 'transport-to-hotel-out-of-schema', 'operational-import-vetoed'];

test('coordinator stamps its own session and the read start; a broken or reentrant clock publishes nothing stale', async () => {
  let ticks = 0;
  const observation = await observe([], { clock: () => NOW + 600_000 * ticks++ });
  assert.equal(ticks, 1);
  assert.equal(observation.sessionId, binding.sessionId);
  assert.equal(observation.observedAt, AT); // start of the read, never its completion
  assert.equal(Object.isFrozen(observation), true);
  for (const clock of [() => NaN, () => 8.64e15 + 1, () => { throw new Error('synthetic clock failure'); }]) {
    assert.equal(await observe([], { clock }), null);
  }
  for (const action of ['cancel', 'disconnect', 'bind']) {
    let coordinator;
    coordinator = createMyCrewCareObservedCoordinator({ acquire: async request => variant(request, []), clock: () => {
      if (action === 'bind') coordinator.bind({ ...binding, accountId: 'synthetic-B', sessionId: 'session-B' });
      else coordinator[action]();
      return NOW;
    } });
    coordinator.bind(binding);
    assert.equal(await coordinator.read(), null);
    assert.equal(coordinator.observation(), null);
  }
});

test('raw PLANNED stays separate from user-policy acceptance; the import veto survives every path', async () => {
  const observation = await observe();
  const pendingPolicy = candidates(observation);
  assert.equal(pendingPolicy.error, null);
  assert.equal(pendingPolicy.dataState, 'fresh');
  assert.equal(pendingPolicy.observedAt, AT);
  assert.equal(pendingPolicy.sessionId, binding.sessionId);
  const [awaiting] = pendingPolicy.candidates;
  assert.equal(awaiting.rawStatus, 'Planned');
  assert.equal(awaiting.statusDisplay, 'Planejada');
  assert.equal(awaiting.acceptance, 'awaiting-user-policy');
  assert.equal(awaiting.acceptanceBasis, null);
  assert.ok(awaiting.pending.includes('status-awaiting-user-policy'));
  for (const policy of [{ plannedAcceptedAsConfirmed: 'true' }, { plannedAcceptedAsConfirmed: 1 }, {}, null]) {
    assert.equal(candidates(observation, { policy }).candidates[0].acceptance, 'awaiting-user-policy');
  }
  // An inherited flag is not the user's explicit policy.
  Object.prototype.plannedAcceptedAsConfirmed = true;
  try {
    assert.equal(candidates(observation, { policy: {} }).candidates[0].acceptance, 'awaiting-user-policy');
  } finally {
    delete Object.prototype.plannedAcceptedAsConfirmed;
  }
  const accepted = candidates(observation, { policy: { plannedAcceptedAsConfirmed: true } });
  const [candidate] = accepted.candidates;
  assert.equal(candidate.acceptance, 'accepted-by-user-policy');
  assert.equal(candidate.acceptanceBasis, 'user-policy-planned-as-confirmed');
  // Policy acceptance never rewrites the observed status nor claims provider confirmation.
  assert.equal(candidate.rawStatus, 'Planned');
  assert.equal(candidate.statusDisplay, 'Planejada');
  assert.equal(candidate.providerConfirmation, 'not-observed');
  assert.equal(candidate.provenance, 'observed-dom');
  assert.equal(candidate.requestId, observation.requestId);
  // AAA is not in the reviewed catalog: zone, instants and Brasília view stay null.
  assert.equal(candidate.timeZone, null);
  assert.equal(candidate.derivedTimeZone, null);
  assert.equal(candidate.reservationStartAt, null);
  assert.equal(candidate.reservationEndAt, null);
  assert.equal(candidate.brasilia, null);
  assert.equal(candidate.checkInWallDateTime, '2031-11-19T22:30');
  assert.equal(candidate.checkOutWallDateTime, '2031-11-20T06:45');
  assert.deepEqual([...candidate.pending], ['time-zone-unavailable', 'reservation-instants-unavailable', ...ALWAYS_PENDING]);
  // To-airport data comes only from its own section, never from the to-hotel transfer.
  assert.deepEqual({ ...candidate.transportToAirport }, { providerName: 'Synthetic Return Shuttle', pickupWallTime: '07:05', pickupDate: null, pickupAt: null, transitMinutes: 50 });
  assert.equal(accepted.operationalImportAllowed, false);
  assert.equal(candidate.operationalImportAllowed, false);
  assert.equal(Object.isFrozen(accepted.candidates) && Object.isFrozen(candidate) && Object.isFrozen(candidate.pending), true);
  // Candidates are not provider records, and the reconciler still honours the veto.
  assert.equal(normalizeMyCrewCareRecord(candidate), null);
  const context = { accountId: binding.accountId, rosterId: 'roster-synthetic', rosterRevision: 'rev-1', providerSubject: 'subject-synthetic' };
  const vetoed = reconcileMyCrewCareLogistics({ context, stays: [], snapshot: { observedAt: AT, operationalImportAllowed: false, records: accepted.candidates }, now: NOW });
  assert.equal(vetoed.error, 'invalid-snapshot');
  const unvetoed = reconcileMyCrewCareLogistics({ context, stays: [], snapshot: { observedAt: AT, records: accepted.candidates }, now: NOW });
  assert.equal(unvetoed.accepted, false);
  assert.equal(unvetoed.error, 'invalid-record');
});

test('CANCELLED and unknown confirmations are never accepted; display must match the raw status', async () => {
  for (const [raw, acceptance, display, pending] of [
    ['CANCELLED', 'not-accepted-cancelled', 'Cancelada', 'status-cancelled'],
    ['Cancelled', 'not-accepted-cancelled', 'Cancelada', 'status-cancelled'],
    ['Pending review', 'not-accepted-unknown-status', 'Pending review', 'status-unknown'],
    ['Confirmed', 'not-accepted-unknown-status', 'Confirmed', 'status-unknown'],
  ]) {
    const observation = await observe([['Confirmation: Planned', `Confirmation: ${raw}`]]);
    const [candidate] = candidates(observation, { policy: { plannedAcceptedAsConfirmed: true } }).candidates;
    assert.equal(candidate.rawStatus, raw);
    assert.equal(candidate.statusDisplay, display);
    assert.equal(candidate.acceptance, acceptance);
    assert.equal(candidate.acceptanceBasis, null);
    assert.equal(candidate.providerConfirmation, 'not-observed');
    assert.equal(candidate.pending[0], pending);
  }
  const observation = await observe();
  const [reservation] = observation.reservations;
  for (const status of [{ raw: 'Planned', display: 'Confirmada pelo hotel' }, { raw: 'Cancelled', display: 'Planejada' }, { raw: 'Planned', display: 'Planejada', extra: true }]) {
    const result = candidates({ ...observation, reservations: [{ ...reservation, status }] }, { policy: { plannedAcceptedAsConfirmed: true } });
    assert.equal(result.error, 'invalid-observation');
    assert.equal(result.candidates.length, 0);
  }
});

test('reviewed airport catalog derives the zone; Brasília view handles Manaus day/year rollover', async () => {
  const cases = [
    // [airport, check-in, check-out, zone, basis, startAt, endAt, BRT check-in, BRT check-out]
    ['MAO', '19 Nov 2031 22:30', '20 Nov 2031 06:45', 'America/Manaus', 'base-airport-catalog',
      '2031-11-20T02:30:00.000Z', '2031-11-20T10:45:00.000Z', ['2031-11-19', '23:30'], ['2031-11-20', '07:45']],
    ['MAO', '31 Dec 2031 23:30', '01 Jan 2032 06:45', 'America/Manaus', 'base-airport-catalog',
      '2032-01-01T03:30:00.000Z', '2032-01-01T10:45:00.000Z', ['2032-01-01', '00:30'], ['2032-01-01', '07:45']],
    ['RBR', '19 Nov 2031 22:30', '20 Nov 2031 06:45', 'America/Rio_Branco', 'base-airport-catalog',
      '2031-11-20T03:30:00.000Z', '2031-11-20T11:45:00.000Z', ['2031-11-20', '00:30'], ['2031-11-20', '08:45']],
    ['CPV', '19 Nov 2031 22:30', '20 Nov 2031 06:45', 'America/Fortaleza', 'reviewed-airport-evidence',
      '2031-11-20T01:30:00.000Z', '2031-11-20T09:45:00.000Z', ['2031-11-19', '22:30'], ['2031-11-20', '06:45']],
    ['GRU', '28 Feb 2032 23:30', '01 Mar 2032 06:45', 'America/Sao_Paulo', 'base-airport-catalog',
      '2032-02-29T02:30:00.000Z', '2032-03-01T09:45:00.000Z', ['2032-02-28', '23:30'], ['2032-03-01', '06:45']],
  ];
  for (const [airport, checkIn, checkOut, zone, basis, startAt, endAt, brtIn, brtOut] of cases) {
    const observation = await observe([['AAA', airport], ['19 Nov 2031 22:30', checkIn], ['20 Nov 2031 06:45', checkOut]]);
    const [candidate] = candidates(observation, { policy: { plannedAcceptedAsConfirmed: true } }).candidates;
    assert.equal(candidate.airport, airport);
    // The observed zone remains unknown; the derived zone is labelled with its basis.
    assert.equal(candidate.timeZone, null);
    assert.equal(candidate.derivedTimeZone.zone, zone);
    assert.equal(candidate.derivedTimeZone.origin, 'derived');
    assert.equal(candidate.derivedTimeZone.providerStated, false);
    assert.equal(candidate.derivedTimeZone.basis, basis);
    assert.deepEqual(candidate.derivedTimeZone.evidence, airport === 'CPV' ? { icao: 'SBKG', region: 'BR-PB', reviewedOn: '2026-10-14' } : null);
    assert.equal(candidate.reservationStartAt, startAt, `${airport} ${checkIn}`);
    assert.equal(candidate.reservationEndAt, endAt, `${airport} ${checkOut}`);
    assert.equal(candidate.brasilia.label, 'Brasília');
    assert.equal(candidate.brasilia.timeZone, 'America/Sao_Paulo');
    assert.equal(candidate.brasilia.origin, 'derived');
    assert.deepEqual([candidate.brasilia.checkIn.date, candidate.brasilia.checkIn.clock], brtIn);
    assert.deepEqual([candidate.brasilia.checkOut.date, candidate.brasilia.checkOut.clock], brtOut);
    assert.equal(candidate.brasilia.checkIn.offset, 'UTC-03:00');
    // Source wall clocks are preserved, never replaced by the Brasília view.
    assert.match(candidate.checkInWallDateTime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    assert.equal(candidate.checkInWallDateTime.slice(11), checkIn.slice(-5));
    // A time-only pickup is never interpreted in the derived zone nor in Brasília.
    assert.equal(candidate.transportToAirport.pickupDate, null);
    assert.equal(candidate.transportToAirport.pickupAt, null);
    assert.deepEqual([...candidate.pending], ALWAYS_PENDING);
    assert.equal(candidate.operationalImportAllowed, false);
  }
});

test('invalid calendar wall values and DST gaps/overlaps stay unresolved instead of shifting', async () => {
  const observation = await observe([['AAA', 'MAO']]);
  for (const [checkIn, checkOut] of [['2031-02-29T22:30', '2031-03-01T06:45'], ['2101-01-01T22:30', '2101-01-02T06:45']]) {
    const reservation = { ...observation.reservations[0], checkInWallDateTime: checkIn, checkOutWallDateTime: checkOut };
    const [candidate] = candidates({ ...observation, reservations: [reservation] }).candidates;
    assert.equal(candidate.derivedTimeZone.zone, 'America/Manaus');
    assert.equal(candidate.reservationStartAt, null);
    assert.equal(candidate.reservationEndAt, null);
    assert.equal(candidate.brasilia, null);
    assert.equal(candidate.checkInWallDateTime, checkIn);
    assert.ok(candidate.pending.includes('reservation-local-time-invalid-or-ambiguous'));
    assert.ok(candidate.pending.includes('reservation-instants-unavailable'));
  }
  // The reviewed catalog has no DST zone today; the conversion it uses rejects
  // nonexistent and repeated minutes instead of picking an offset.
  assert.equal(myCrewCareLocalInstant('2031-09-28', '02:30', 'Pacific/Auckland'), null);
  assert.equal(myCrewCareLocalInstant('2031-04-06', '02:30', 'Pacific/Auckland'), null);
  assert.equal(myCrewCareLocalInstant('2031-03-09', '02:30', 'America/New_York'), null);
  assert.equal(myCrewCareLocalInstant('2031-11-02', '01:30', 'America/New_York'), null);
  assert.equal(new Date(myCrewCareLocalInstant('2031-04-06', '03:30', 'Pacific/Auckland')).toISOString(), '2031-04-05T15:30:00.000Z');
  assert.equal(myCrewCareLocalInstant('2031-11-19', '22:30', ''), null);
  assert.equal(myCrewCareLocalInstant('2031-11-19', '22:30', 'Invalid/Zone'), null);
});

test('scope, session, identity, freshness and contract drift fail closed without partial candidates', async () => {
  const observation = await observe([['AAA', 'MAO']]);
  const expected = expectedFor(observation);
  const run = options => mapMyCrewCareObservedCandidates({ observation, expected, now: NOW, ...options });
  const empty = result => { assert.equal(result.candidates.length, 0); assert.equal(result.operationalImportAllowed, false); return result.error; };
  assert.equal(empty(run({ expected: null })), 'invalid-scope');
  assert.equal(empty(run({ expected: { accountId: binding.accountId, requestId: observation.requestId } })), 'invalid-scope');
  assert.equal(empty(run({ freshForMs: Infinity })), 'invalid-scope');
  assert.equal(empty(run({ now: NaN })), 'invalid-scope');
  assert.equal(empty(run({ expected: { ...expected, accountId: 'synthetic-B' } })), 'identity-mismatch');
  assert.equal(empty(run({ expected: { ...expected, sessionId: 'synthetic-session-A2' } })), 'identity-mismatch');
  const older = await observe([['AAA', 'MAO']]);
  assert.notEqual(older.requestId, observation.requestId);
  assert.equal(empty(run({ expected: { ...expected, requestId: older.requestId } })), 'identity-mismatch');
  // Account switch: an observation of A never maps under B's binding.
  const switched = { accountId: 'synthetic-B', sessionId: 'session-B', requestId: observation.requestId };
  assert.equal(empty(run({ expected: switched })), 'identity-mismatch');
  // A session mismatch inside the coordinator never yields an observation to map.
  const mismatched = createMyCrewCareObservedCoordinator({ acquire: async request => ({ ...response(request), sessionId: request.kind === 'detail' ? 'other-session' : request.scope.sessionId }), clock: () => NOW });
  mismatched.bind(binding);
  assert.equal(empty(mapMyCrewCareObservedCandidates({ observation: await mismatched.read(), expected, now: NOW })), 'invalid-observation');
  // Freshness uses only the coordinator's completion stamp.
  const { observedAt: _stamp, sessionId: _session, ...unstamped } = observation;
  assert.equal(empty(run({ observation: unstamped })), 'invalid-observation');
  assert.equal(empty(run({ observation: { ...observation, observedAt: undefined } })), 'invalid-observed-at');
  assert.equal(empty(run({ observation: { ...observation, observedAt: '2031-11-19T12:00' } })), 'invalid-observed-at');
  assert.equal(empty(run({ now: NOW - 30_001 })), 'invalid-observed-at');
  assert.equal(empty(run({ now: NOW + 7 * 86_400_000 + 1 })), 'expired-observation');
  assert.equal(run({ now: NOW + 7 * 86_400_000 }).dataState, 'cached');
  assert.equal(run({ now: NOW + 16 * 60_000 }).dataState, 'cached');
  assert.equal(run({ now: NOW + 15 * 60_000 }).dataState, 'fresh');
  // Veto removal, supplied zone/date, extra keys, coercible or throwing values: whole read rejected.
  const [reservation] = observation.reservations;
  const throwing = { ...reservation };
  Object.defineProperty(throwing, 'hotelName', { enumerable: true, get() { throw new Error('synthetic getter'); } });
  for (const reservations of [
    [{ ...reservation, timeZone: 'America/Sao_Paulo' }],
    [{ ...reservation, operationalImportAllowed: true }],
    [{ ...reservation, reservationStartAt: '2031-11-20T02:30:00Z' }],
    [{ ...reservation, transportToAirport: { ...reservation.transportToAirport, explicitPickupDate: '2031-11-20' } }],
    [{ ...reservation, transportToAirport: { ...reservation.transportToAirport, pickupAt: '2031-11-20T11:05:00Z' } }],
    [{ ...reservation, transportToAirport: { ...reservation.transportToAirport, pickupWallTime: ['07:05'] } }],
    [{ ...reservation, transportToHotel: null }],
    [{ ...reservation, status: { raw: '', display: '' } }],
    [{ ...reservation, checkInWallDateTime: [reservation.checkInWallDateTime] }],
    [{ ...reservation, checkInWallDateTime: { toString: () => reservation.checkInWallDateTime } }],
    [{ ...reservation, airport: ' MAO' }],
    [{ ...reservation, checkOutWallDateTime: reservation.checkInWallDateTime }],
    [throwing],
    [reservation, { ...reservation, providerReservationId: '900000002' }, reservation],
    [],
  ]) {
    assert.equal(empty(run({ observation: { ...observation, reservations } })), 'invalid-observation');
  }
  assert.equal(empty(run({ observation: { ...observation, operationalImportAllowed: true } })), 'invalid-observation');
  // Accessors could answer the check and the copy differently; only data properties are read, once.
  let reads = 0;
  const shifting = { ...reservation, status: { raw: 'Planned', get display() { return reads++ < 2 ? 'Planejada' : 'Confirmada pelo hotel'; } } };
  assert.equal(empty(run({ observation: { ...observation, reservations: [shifting] }, policy: { plannedAcceptedAsConfirmed: true } })), 'invalid-observation');
  const growing = { ...observation };
  let listReads = 0;
  Object.defineProperty(growing, 'reservations', { enumerable: true, get() { return listReads++ < 3 ? [reservation] : Array(80).fill(reservation); } });
  assert.equal(empty(run({ observation: growing })), 'invalid-observation');
  // The reservation list is copied once; a shifting length cannot exceed what was validated.
  let lengthReads = 0;
  const shiftingList = new Proxy([reservation], { get(target, key, receiver) {
    return key === 'length' ? (lengthReads++ < 1 ? 1 : 80) : Reflect.get(target, key, receiver);
  } });
  const single = run({ observation: { ...observation, reservations: shiftingList } });
  assert.equal(single.error, null);
  assert.equal(single.candidates.length, 1);
  const getterPolicy = { get plannedAcceptedAsConfirmed() { return true; } };
  assert.equal(run({ policy: getterPolicy }).candidates[0].acceptance, 'awaiting-user-policy');
  assert.equal(empty(run({ observation: { ...observation, pickupDate: '2031-11-20' } })), 'invalid-observation');
  const ordered = run({ observation: { ...observation, reservations: [{ ...reservation, providerReservationId: '10' }, { ...reservation, providerReservationId: '9' }] } });
  assert.deepEqual(ordered.candidates.map(candidate => candidate.providerReservationId), ['9', '10']);
});
