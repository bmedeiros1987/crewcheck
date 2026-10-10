import assert from 'node:assert/strict';

// Synthetic only. The offline runner supplies an empty environment and forbids real fetch.
process.env.CIRIUM_DIAGNOSTIC_ENABLED = 'true';
process.env.CIRIUM_SKY_API_TOKEN = 'fixture-token';
const { diagnoseCirium, diagnoseCiriumFlight, createCiriumGuard, normalizeCiriumResult } = await import('../server/cirium-diagnostic.mjs');

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const ok = (body, status = 200) => ({ status, json: async () => body });
const row = (over = {}) => ({ carrierFsCode: 'LA', flightNumber: '3850', status: 'S', departureAirportFsCode: 'BSB', arrivalAirportFsCode: 'THE', ...over });
function counting(handler) {
  const f = async (...args) => { f.calls++; return handler(...args); };
  f.calls = 0;
  return f;
}

// --- budget, interval, dedupe and cache -----------------------------------
{
  let clock = 1_000_000;
  const guard = createCiriumGuard({ maxCalls: 2, minIntervalMs: 1_000, cacheTtlMs: 5_000, now: () => clock });
  const fetchImpl = counting(async () => ok({ flightStatuses: [row()] }));
  const q = (flight) => diagnoseCiriumFlight({ carrier: 'LA', flight, date: today, fetchImpl, guard });

  const first = await q('3850');
  assert.equal(first.state, 'available');
  assert.equal(fetchImpl.calls, 1);
  assert.equal((await q('3850')).cached, true, 'identical query is served from cache');
  assert.equal(fetchImpl.calls, 1);

  clock += 100;
  const tooSoon = await q('3851');
  assert.equal(tooSoon.state, 'rate_limited_local');
  assert.equal(fetchImpl.calls, 1, 'minimum interval blocks before any request');

  clock += 2_000;
  assert.equal((await q('3852')).state, 'invalid_payload', 'different flight answered by mock row 3850 is rejected');
  assert.equal(fetchImpl.calls, 2);

  clock += 2_000;
  assert.equal((await q('3853')).state, 'budget_exhausted');
  assert.equal(fetchImpl.calls, 2, 'session budget is a hard ceiling');

  clock += 60_000; // cache expiry never refunds budget
  assert.equal((await q('3853')).state, 'budget_exhausted');
  assert.equal(fetchImpl.calls, 2);
}

// concurrent identical queries share one upstream call
{
  const guard = createCiriumGuard({ maxCalls: 5, minIntervalMs: 0 });
  const fetchImpl = counting(async () => { await new Promise((r) => setTimeout(r, 10)); return ok({ flightStatuses: [row()] }); });
  const results = await Promise.all(Array.from({ length: 5 }, () => diagnoseCiriumFlight({ carrier: 'LA', flight: '3850', date: today, fetchImpl, guard })));
  assert.equal(fetchImpl.calls, 1);
  assert.ok(results.every((r) => r.state === 'available'));
}

// failures are cached too: no retry loop, no second attempt
{
  const guard = createCiriumGuard({ maxCalls: 5, minIntervalMs: 0 });
  const fetchImpl = counting(async () => { throw new Error('socket'); });
  for (let i = 0; i < 4; i++) {
    const r = await diagnoseCiriumFlight({ carrier: 'LA', flight: '3850', date: today, fetchImpl, guard });
    assert.equal(r.state, 'error');
  }
  assert.equal(fetchImpl.calls, 1);
}

// --- local input validation: nothing reaches the network -------------------
{
  const guard = createCiriumGuard({ maxCalls: 50, minIntervalMs: 0 });
  const fetchImpl = counting(async () => ok({ flightStatuses: [] }));
  const cases = [
    [{ carrier: '!!', flight: '3850', date: today }, 'invalid_carrier'],
    [{ carrier: '', flight: '3850', date: today }, 'invalid_carrier'],
    [{ carrier: 'LA', flight: '../x', date: today }, 'invalid_flight'],
    [{ carrier: 'LA', flight: '', date: today }, 'invalid_flight'],
    [{ carrier: 'LA', flight: '12345', date: today }, 'invalid_flight'],
    [{ carrier: 'LA', flight: '3850', date: '2026-02-31' }, 'invalid_date'],
    [{ carrier: 'LA', flight: '3850', date: '2020-01-01' }, 'date_out_of_window'],
    [{ carrier: 'LA', flight: '3850', date: '2099-01-01' }, 'date_out_of_window'],
  ];
  for (const [input, reason] of cases) {
    const r = await diagnoseCiriumFlight({ ...input, fetchImpl, guard });
    assert.equal(r.reason, reason, JSON.stringify(input));
    assert.equal(r.ok, false);
  }
  assert.equal(fetchImpl.calls, 0);
  assert.equal(guard.calls, 0, 'rejected input does not consume budget');
}

// --- displayed data validation ---------------------------------------------
const flightWith = async (body, status = 200) => diagnoseCiriumFlight({
  carrier: 'LA', flight: '3850', date: today, guard: createCiriumGuard({ minIntervalMs: 0 }),
  fetchImpl: async () => ok(body, status),
});
assert.equal((await flightWith('not json object')).state, 'invalid_payload');
assert.equal((await flightWith(null)).state, 'invalid_payload');
assert.equal((await flightWith([])).state, 'invalid_payload');
assert.equal((await flightWith({})).state, 'invalid_payload');
assert.equal((await flightWith({ flightStatuses: 'x' })).state, 'invalid_payload');
const empty = await flightWith({ flightStatuses: [] });
assert.equal(empty.state, 'no_data');
assert.equal(empty.count, 0);
const mixed = await flightWith({ flightStatuses: [row(), row({ flightNumber: '9999' }), null, 'x', row({ carrierFsCode: 'JJ' })] });
assert.equal(mixed.state, 'available');
assert.equal(mixed.count, 1);
assert.equal(mixed.rejectedRows, 4, 'mismatched or malformed rows are counted, never displayed');
assert.equal((await flightWith({ flightStatuses: [row({ flightNumber: '9999' })] })).state, 'invalid_payload');

// missing numeric values stay null, never 0
const numeric = await flightWith({ flightStatuses: [row({
  flightId: null,
  delays: { departureGateDelayMinutes: null, arrivalGateDelayMinutes: '', departureRunwayDelayMinutes: 0, arrivalRunwayDelayMinutes: -3 },
  flightDurations: { blockMinutes: false, airMinutes: '  ', taxiOutMinutes: 12 },
})] });
const f = numeric.flights[0];
assert.equal(f.flightId, null);
assert.equal(f.delays.departureGateMinutes, null);
assert.equal(f.delays.arrivalGateMinutes, null);
assert.equal(f.delays.departureRunwayMinutes, 0, 'a real zero is preserved');
assert.equal(f.delays.arrivalRunwayMinutes, -3);
assert.equal(f.durations.blockMinutes, null);
assert.equal(f.durations.airMinutes, null);
assert.equal(f.durations.taxiOutMinutes, 12);
const noDelays = await flightWith({ flightStatuses: [row({ delays: { departureGateDelayMinutes: null } })] });
assert.equal(noDelays.flights[0].presence.delays, false);

// --- ambiguous HTTP outcomes ------------------------------------------------
assert.equal(normalizeCiriumResult(404, null), 'unverified');
assert.equal(normalizeCiriumResult(405, null), 'unverified');
assert.equal((await flightWith({}, 404)).ok, false);
{
  const probe = (body, status = 200) => diagnoseCirium({ guard: createCiriumGuard({ minIntervalMs: 0 }), fetchImpl: async () => ok(body, status) });
  assert.equal((await probe({ flightStatuses: [] })).state, 'available');
  assert.equal((await probe({})).state, 'invalid_payload');
  assert.equal((await probe(null)).state, 'invalid_payload');
  assert.equal((await probe({}, 404)).ok, false);
  assert.equal((await probe({}, 405)).state, 'unverified');
}
// the probe is also budgeted and cached
{
  const guard = createCiriumGuard({ maxCalls: 1, minIntervalMs: 0 });
  const fetchImpl = counting(async () => ok({ flightStatuses: [] }));
  await diagnoseCirium({ fetchImpl, guard });
  await diagnoseCirium({ fetchImpl, guard });
  assert.equal(fetchImpl.calls, 1);
}

// --- HEAD never reaches the diagnostic --------------------------------------
{
  const route = await import('../server/v1412/ciriumHealth.mjs');
  assert.equal(typeof route.handleCiriumHealthRoute, 'function');
  const src = await (await import('node:fs/promises')).readFile(new URL('../server/v1412/ciriumHealth.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /['"]HEAD['"]/, 'cirium-health must not accept HEAD');
  assert.match(src, /req\.method !== 'GET'/);
}

console.log('Cirium guard/validation regression OK; no upstream calls');
