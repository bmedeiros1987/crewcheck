import assert from 'node:assert/strict';

// Synthetic only. The offline runner supplies an empty environment and forbids real fetch.
process.env.CIRIUM_DIAGNOSTIC_ENABLED = 'true';
process.env.CIRIUM_SKY_API_TOKEN = 'fixture-token';
const { ciriumConfiguration, diagnoseCirium, diagnoseCiriumFlight, createCiriumGuard, normalizeCiriumResult } = await import('../server/cirium-diagnostic.mjs');

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const ok = (body, status = 200) => ({ status, json: async () => body });
const row = (over = {}) => ({
  carrierFsCode: 'LA', flightNumber: '3850', status: 'S', departureAirportFsCode: 'BSB', arrivalAirportFsCode: 'THE',
  departureDate: { dateLocal: `${today}T09:20:00.000`, dateUtc: `${today}T12:20:00.000Z` },
  operationalTimes: { scheduledGateDeparture: { dateUtc: `${today}T12:20:00.000Z` }, scheduledGateArrival: { dateUtc: `${today}T14:34:00.000Z` } },
  ...over,
});
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

// --- review round 2: occurrence, numerics, probe elements, blank input -------
{
  const probe = (flightStatuses) => diagnoseCirium({ guard: createCiriumGuard({ minIntervalMs: 0 }), fetchImpl: async () => ok({ flightStatuses }) });
  const la3377 = (over = {}) => row({ flightNumber: '3377', ...over });
  assert.equal((await probe([la3377()])).state, 'available');
  assert.equal((await probe([])).state, 'available');
  for (const bad of [[null, 'garbage'], [null], ['x'], [[]], [la3377(), null], [row()], [la3377({ departureDate: { dateLocal: '2020-03-01T09:00:00.000' } })]]) {
    assert.equal((await probe(bad)).state, 'invalid_payload', JSON.stringify(bad).slice(0, 60));
    assert.equal((await probe(bad)).ok, false);
  }

  // stale/other-day occurrence for the requested flight and date
  const stale = await flightWith({ flightStatuses: [row({
    departureDate: { dateLocal: '2020-03-01T09:20:00.000', dateUtc: '2020-03-01T12:20:00.000Z' },
    operationalTimes: { scheduledGateDeparture: { dateUtc: '2020-03-01T12:20:00.000Z' } },
  })] });
  assert.equal(stale.state, 'invalid_payload');
  assert.equal(stale.ok, false);
  assert.equal(stale.rejectedRows, 1);
  // no verifiable date at all
  assert.equal((await flightWith({ flightStatuses: [row({ departureDate: undefined, operationalTimes: {} })] })).state, 'invalid_payload');
  // UTC-only evidence is accepted within one day, never beyond
  const utcOnly = (iso) => row({ departureDate: undefined, operationalTimes: { scheduledGateDeparture: { dateUtc: iso } } });
  assert.equal((await flightWith({ flightStatuses: [utcOnly(`${today}T23:30:00.000Z`)] })).state, 'available');
  assert.equal((await flightWith({ flightStatuses: [utcOnly('2020-03-01T12:00:00.000Z')] })).state, 'invalid_payload');
  // leg coherence: same airport, missing airport, arrival before departure
  for (const over of [
    { arrivalAirportFsCode: 'BSB' }, { arrivalAirportFsCode: undefined }, { departureAirportFsCode: '??' },
    { operationalTimes: { scheduledGateDeparture: { dateUtc: `${today}T12:20:00.000Z` }, scheduledGateArrival: { dateUtc: `${today}T11:00:00.000Z` } } },
  ]) assert.equal((await flightWith({ flightStatuses: [row(over)] })).state, 'invalid_payload', JSON.stringify(over).slice(0, 60));

  // numerics: arrays and objects are never zero
  const odd = await flightWith({ flightStatuses: [row({
    flightId: [],
    delays: { departureGateDelayMinutes: [], arrivalGateDelayMinutes: [null], departureRunwayDelayMinutes: {}, arrivalRunwayDelayMinutes: [5] },
    flightDurations: { blockMinutes: [[]], airMinutes: '12', taxiOutMinutes: '1e3', taxiInMinutes: 'abc' },
  })] });
  const o = odd.flights[0];
  assert.equal(o.flightId, null);
  assert.equal(o.delays.departureGateMinutes, null);
  assert.equal(o.delays.arrivalGateMinutes, null);
  assert.equal(o.delays.departureRunwayMinutes, null);
  assert.equal(o.delays.arrivalRunwayMinutes, null, 'single-element array is not a number');
  assert.equal(o.durations.blockMinutes, null);
  assert.equal(o.durations.airMinutes, 12);
  assert.equal(o.durations.taxiOutMinutes, null);
  assert.equal(o.durations.taxiInMinutes, null);
  assert.equal(o.presence.delays, false);
}

// explicit blank/invalid input never reaches the network, never defaults
{
  const guard = createCiriumGuard({ maxCalls: 50, minIntervalMs: 0 });
  const fetchImpl = counting(async () => ok({ flightStatuses: [] }));
  const blanks = [
    [{ carrier: '', flight: '3850', date: today }, 'invalid_carrier'],
    [{ carrier: '   ', flight: '3850', date: today }, 'invalid_carrier'],
    [{ carrier: 'LA', flight: '', date: today }, 'invalid_flight'],
    [{ carrier: 'LA', flight: '   ', date: today }, 'invalid_flight'],
    [{ carrier: 'LA', flight: '3850', date: '' }, 'invalid_date'],
    [{ carrier: 'LA', flight: '3850', date: '  ' }, 'invalid_date'],
    [{ carrier: 'LA', flight: '3850', date: 20261010 }, 'invalid_date'],
    [{ carrier: ['LA'], flight: '3850', date: today }, 'invalid_carrier'],
  ];
  for (const [input, reason] of blanks) {
    const r = await diagnoseCiriumFlight({ ...input, fetchImpl, guard });
    assert.equal(r.reason, reason, JSON.stringify(input));
  }
  assert.equal(fetchImpl.calls, 0);
  assert.equal(guard.calls, 0);
}

// HTTP boundary: present-but-blank parameters => 400 before any diagnostic
{
  const { handleCiriumHealthRoute } = await import('../server/v1412/ciriumHealth.mjs');
  const common = await import('../server/v139/common.mjs');
  assert.equal(typeof common.requireIdentity, 'function');
  const src = await (await import('node:fs/promises')).readFile(new URL('../server/v1412/ciriumHealth.mjs', import.meta.url), 'utf8');
  assert.match(src, /params\.has\('flight'\)/);
  assert.match(src, /params\.has\('carrier'\)/);
  assert.match(src, /params\.has\('date'\)/);
  assert.doesNotMatch(src, /\|\| 'LA'/, 'blank carrier must not default to LA');
  assert.doesNotMatch(src, /get\('date'\) \|\|/, 'blank date must not default to today');
  assert.equal(typeof handleCiriumHealthRoute, 'function');
}

// --- HEAD never reaches the diagnostic --------------------------------------
{
  const route = await import('../server/v1412/ciriumHealth.mjs');
  assert.equal(typeof route.handleCiriumHealthRoute, 'function');
  const src = await (await import('node:fs/promises')).readFile(new URL('../server/v1412/ciriumHealth.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /['"]HEAD['"]/, 'cirium-health must not accept HEAD');
  assert.match(src, /req\.method !== 'GET'/);
}

// --- a provider 429 becomes a cooldown, never an automatic retry ------------
{
  let clock = 5_000_000;
  const guard = createCiriumGuard({ maxCalls: 5, minIntervalMs: 0, cacheTtlMs: 0, now: () => clock });
  const limited = counting(async () => ({ status: 429, headers: { get: (name) => (name === 'retry-after' ? '90' : null) }, json: async () => null }));
  const quota = await diagnoseCiriumFlight({ carrier: 'LA', flight: '3850', date: today, fetchImpl: limited, guard });
  assert.equal(quota.state, 'quota');
  assert.equal(limited.calls, 1);

  const cooldown = await diagnoseCiriumFlight({ carrier: 'LA', flight: '3851', date: today, fetchImpl: limited, guard });
  assert.equal(cooldown.ok, false);
  assert.equal(cooldown.state, 'provider_cooldown');
  assert.equal(cooldown.upstreamCalled, false);
  assert.equal(cooldown.retryAfterAt, new Date(clock + 90_000).toISOString());
  assert.equal(limited.calls, 1, 'a provider 429 must not be retried automatically');

  clock += 90_001;
  const afterCooldown = await diagnoseCiriumFlight({
    carrier: 'LA', flight: '3852', date: today, guard,
    fetchImpl: counting(async () => ok({ flightStatuses: [row()] })),
  });
  assert.equal(afterCooldown.state, 'invalid_payload', 'the guard resumes only after the cooldown expires');
}

// a 429 without Retry-After still stops the diagnostic for the fallback window
{
  let clock = 6_000_000;
  const guard = createCiriumGuard({ maxCalls: 5, minIntervalMs: 0, cacheTtlMs: 0, now: () => clock });
  const limited = counting(async () => ({ status: 429, headers: { get: () => null }, json: async () => null }));
  await diagnoseCiriumFlight({ carrier: 'LA', flight: '3850', date: today, fetchImpl: limited, guard });
  const cooldown = await diagnoseCiriumFlight({ carrier: 'LA', flight: '3851', date: today, fetchImpl: limited, guard });
  assert.equal(cooldown.state, 'provider_cooldown');
  assert.equal(cooldown.retryAfterAt, new Date(clock + 60_000).toISOString());
  assert.equal(limited.calls, 1);
}

// --- the legacy Flex probe needs its own explicit opt-in --------------------
{
  const previous = {
    token: process.env.CIRIUM_SKY_API_TOKEN,
    id: process.env.CIRIUM_APP_ID,
    key: process.env.CIRIUM_APP_KEY,
    flag: process.env.CIRIUM_DIAGNOSTIC_ALLOW_LEGACY_FLEX,
  };
  process.env.CIRIUM_SKY_API_TOKEN = '';
  process.env.CIRIUM_APP_ID = 'fixture-id';
  process.env.CIRIUM_APP_KEY = 'fixture-key';
  delete process.env.CIRIUM_DIAGNOSTIC_ALLOW_LEGACY_FLEX;
  assert.equal(ciriumConfiguration().mode, 'none', 'Flex credentials alone must not enable a probe');
  assert.equal(ciriumConfiguration().configured, false);
  process.env.CIRIUM_DIAGNOSTIC_ALLOW_LEGACY_FLEX = 'TRUE';
  assert.equal(ciriumConfiguration().mode, 'none', 'the opt-in must be the exact raw value true');
  process.env.CIRIUM_DIAGNOSTIC_ALLOW_LEGACY_FLEX = 'true';
  assert.equal(ciriumConfiguration().mode, 'flex');
  process.env.CIRIUM_SKY_API_TOKEN = previous.token;
  process.env.CIRIUM_APP_ID = previous.id;
  process.env.CIRIUM_APP_KEY = previous.key;
  if (previous.flag === undefined) delete process.env.CIRIUM_DIAGNOSTIC_ALLOW_LEGACY_FLEX;
  else process.env.CIRIUM_DIAGNOSTIC_ALLOW_LEGACY_FLEX = previous.flag;
}

console.log('Cirium guard/validation regression OK; no upstream calls');

// Review 2026-10-11: every supplied operational time must belong to the occurrence.
{
  const old = { dateLocal: '2020-03-01T09:20:00.000', dateUtc: '2020-03-01T12:20:00.000Z' };
  const oldArrival = { dateLocal: '2020-03-01T11:20:00.000', dateUtc: '2020-03-01T14:20:00.000Z' };
  const contradictory = [
    { scheduledGateDeparture: old, scheduledGateArrival: oldArrival },
    { publishedDeparture: old, publishedArrival: oldArrival },
    { estimatedGateDeparture: old, estimatedGateArrival: oldArrival },
    { actualGateDeparture: old, actualGateArrival: oldArrival },
    { scheduledGateDeparture: { dateLocal: `${today}T09:20:00.000`, dateUtc: old.dateUtc } },
    { scheduledGateDeparture: { dateLocal: old.dateLocal, dateUtc: `${today}T12:20:00.000Z` } },
    { scheduledGateArrival: oldArrival },
    { actualRunwayArrival: oldArrival },
    { publishedDeparture: { dateLocal: 'invalid' } },
  ];
  for (const operationalTimes of contradictory) {
    const bad = row({ operationalTimes }); // row.departureDate still asserts today
    const result = await flightWith({ flightStatuses: [bad] });
    assert.equal(result.state, 'invalid_payload', JSON.stringify(operationalTimes));
    assert.equal(result.ok, false);
    assert.equal(result.rejectedRows, 1);
    assert.equal(result.count, undefined);
    assert.equal(result.flights, undefined, 'invalid occurrence never exposes a flight summary');
    const probe = await diagnoseCirium({ guard: createCiriumGuard({ minIntervalMs: 0 }),
      fetchImpl: async () => ok({ flightStatuses: [{ ...bad, flightNumber: '3377' }] }) });
    assert.equal(probe.state, 'invalid_payload', 'probe must use the same occurrence validation');
  }
  const accepted = row();
  const mixed = await flightWith({ flightStatuses: [accepted, row({ operationalTimes: contradictory[0] })] });
  assert.equal(mixed.count, 1);
  assert.equal(mixed.rejectedRows, 1);
  const nextDay = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const midnight = await flightWith({ flightStatuses: [row({
    departureDate: { dateLocal: `${today}T23:30:00.000`, dateUtc: `${nextDay}T02:30:00.000Z` },
    operationalTimes: {
      scheduledGateDeparture: { dateLocal: `${today}T23:30:00.000`, dateUtc: `${nextDay}T02:30:00.000Z` },
      scheduledGateArrival: { dateLocal: `${nextDay}T01:30:00.000`, dateUtc: `${nextDay}T04:30:00.000Z` },
    },
  })] });
  assert.equal(midnight.state, 'available', 'coherent local/UTC midnight crossing remains valid');
}
console.log('Cirium contradictory occurrence regression OK; synthetic rows only');

// Independent review: matching/adjacent calendar days do not prove matching instants.
{
  const nextDay = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const previousDay = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  for (const [time, valid] of [
    [{ dateLocal: `${today}T00:00:00`, dateUtc: `${nextDay}T23:00:00Z` }, false], // 47h
    [{ dateLocal: `${today}T00:00:00-03:00`, dateUtc: `${nextDay}T03:00:00Z` }, false], // +24h contradiction
    [{ dateLocal: `${today}T00:00:00-03:00`, dateUtc: `${today}T04:00:00Z` }, false], // same-day contradiction
    [{ dateLocal: `${today}T00:00:00`, dateUtc: `${today}T14:00:01Z` }, false],
    [{ dateLocal: `${today}T23:59:59`, dateUtc: `${today}T09:59:58Z` }, false],
    [{ dateLocal: `${today}T00:00:00`, dateUtc: `${today}T14:00:00Z` }, true],
    [{ dateLocal: `${today}T00:00:00`, dateUtc: `${previousDay}T10:00:00Z` }, true],
    [{ dateLocal: `${today}T23:00:00`, dateUtc: `${nextDay}T02:00:00Z` }, true],
    [{ dateLocal: `${today}T23:00:00-03:00`, dateUtc: `${nextDay}T02:00:00Z` }, true],
    [{ dateLocal: `${today}T00:00:00+14:00`, dateUtc: `${previousDay}T10:00:00Z` }, true],
    [{ dateLocal: `${today}T12:00:00Z`, dateUtc: `${today}T12:00:00Z` }, true],
  ]) {
    const item = row({ operationalTimes: { estimatedGateDeparture: time } });
    const result = await flightWith({ flightStatuses: [item] });
    assert.equal(result.state, valid ? 'available' : 'invalid_payload', JSON.stringify(time));
    const probe = await diagnoseCirium({ guard: createCiriumGuard({ minIntervalMs: 0 }),
      fetchImpl: async () => ok({ flightStatuses: [{ ...item, flightNumber: '3377' }] }) });
    assert.equal(probe.state, valid ? 'available' : 'invalid_payload', JSON.stringify(time));
  }
}
console.log('Cirium UTC/local instant consistency regression OK');

// UTC fields without Z are explicitly UTC; local-only endpoints cannot establish a duration.
{
  const cases = [
    [{ arrivalDate: { dateUtc: '2020-03-01T14:20:00Z' } }, false],
    [{ arrivalDate: { dateUtc: `${today}T11:00:00Z` } }, false],
    [{ arrivalDate: { dateUtc: `${today}T14:20:00Z` } }, true],
    [{ operationalTimes: { actualGateDeparture: { dateUtc: `${today}T12:00:00Z` }, actualGateArrival: { dateUtc: `${today}T11:00:00Z` } } }, false],
    [{ operationalTimes: { actualGateDeparture: { dateUtc: `${today}T12:00:00Z` }, actualRunwayArrival: { dateUtc: `${today}T11:00:00Z` } } }, false],
    [{ operationalTimes: { estimatedGateDeparture: { dateUtc: `${today}T12:00:00Z` }, estimatedRunwayArrival: { dateUtc: `${today}T11:00:00Z` } } }, false],
    [{ operationalTimes: { scheduledGateDeparture: { dateLocal: `${today}T12:00:00` }, scheduledGateArrival: { dateLocal: `${today}T14:00:00` } } }, false],
    [{ operationalTimes: { scheduledGateDeparture: { dateUtc: `${today}T12:00:00` }, scheduledGateArrival: { dateUtc: `${today}T14:00:00` } } }, true],
    [{ operationalTimes: { scheduledGateDeparture: { dateUtc: `${today}T12:00:00` }, scheduledGateArrival: { dateUtc: `${today}T11:00:00Z` } } }, false],
    [{ operationalTimes: { actualGateDeparture: { dateLocal: `${today}T12:00:00-03:00` }, actualGateArrival: { dateLocal: `${today}T14:00:00-03:00` } } }, true],
  ];
  for (const [overrides, valid] of cases) {
    const item = row(overrides);
    assert.equal((await flightWith({ flightStatuses: [item] })).state, valid ? 'available' : 'invalid_payload', JSON.stringify(overrides));
    assert.equal((await diagnoseCirium({ guard: createCiriumGuard({ minIntervalMs: 0 }),
      fetchImpl: async () => ok({ flightStatuses: [{ ...item, flightNumber: '3377' }] }) })).state,
    valid ? 'available' : 'invalid_payload', JSON.stringify(overrides));
  }
}
console.log('Cirium timezone-independent chronology regression OK');

// Review: the displayed scheduled/published fallback pair also needs chronology.
{
  for (const [operationalTimes, valid] of [
    [{ scheduledGateDeparture: { dateUtc: `${today}T12:20:00Z` }, publishedArrival: { dateUtc: `${today}T11:20:00Z` } }, false],
    [{ publishedDeparture: { dateUtc: `${today}T12:20:00Z` }, scheduledGateArrival: { dateUtc: `${today}T11:20:00Z` } }, false],
    [{ scheduledGateDeparture: { dateUtc: `${today}T12:20:00Z` }, publishedArrival: { dateUtc: `${today}T14:20:00Z` } }, true],
    [{ publishedDeparture: { dateUtc: `${today}T12:20:00Z` }, scheduledGateArrival: { dateUtc: `${today}T14:20:00Z` } }, true],
  ]) {
    const item = row({ operationalTimes });
    const result = await flightWith({ flightStatuses: [item] });
    assert.equal(result.state, valid ? 'available' : 'invalid_payload', JSON.stringify(operationalTimes));
    if (valid) {
      assert.equal(result.flights[0].times.scheduledDeparture, `${today}T12:20:00Z`);
      assert.equal(result.flights[0].times.scheduledArrival, `${today}T14:20:00Z`);
    } else assert.equal(result.flights, undefined, 'no inverted fallback summary is exposed');
    const probe = await diagnoseCirium({ guard: createCiriumGuard({ minIntervalMs: 0 }),
      fetchImpl: async () => ok({ flightStatuses: [{ ...item, flightNumber: '3377' }] }) });
    assert.equal(probe.state, valid ? 'available' : 'invalid_payload', JSON.stringify(operationalTimes));
  }
}
console.log('Cirium displayed fallback chronology regression OK');

// Response contracts only: no actual account/API behavior is established.
{
  const item = row({ flightNumber: '3377' });
  const query = async (payload, carrier = 'LA') => diagnoseCiriumFlight({
    carrier, flight: '3377', date: today, guard: createCiriumGuard(),
    fetchImpl: async (url, options) => {
      assert.match(String(url), new RegExp('/airline/' + carrier + '/flight-number/3377/'));
      assert.equal(options.headers.authorization, 'fixture-token');
      assert.equal(options.redirect, 'error');
      return ok(payload);
    },
  });
  const probe = (payload) => diagnoseCirium({ guard: createCiriumGuard(), fetchImpl: async () => ok(payload) });
  for (const payload of [{ flightStatus: item }, { flightStatuses: [item] }]) {
    assert.equal((await probe(payload)).state, 'available');
    assert.equal((await query(payload)).count, 1);
  }
  for (const payload of [null, {}, [], { flightStatus: [] }, { flightStatus: null },
    { flightStatuses: {} }, { flightStatuses: null, flightStatus: item },
    { flightStatuses: [item], flightStatus: item }]) {
    assert.equal((await probe(payload)).state, 'invalid_payload');
    assert.equal((await query(payload)).state, 'invalid_payload');
  }
  assert.equal((await probe({ flightStatuses: [] })).state, 'available');
  assert.equal((await query({ flightStatuses: [] })).state, 'no_data');
  const mapped = (airlines, over = {}) => ({ flightStatus: { ...item, ...over }, appendix: { airlines } });
  const airline = { fs: 'LA', iata: 'LA', icao: 'LAN' };
  for (const airlines of [[airline], [airline, { ...airline }], [{ fs: 'LA', iata: 'ZZ', icao: 'LAN' }]]) {
    const result = await query(mapped(airlines), 'LAN');
    assert.equal(result.state, 'available');assert.equal(result.flights[0].carrier, 'LA');
    assert.equal(result.query.carrier, 'LAN', 'original query is retained, never rewritten');
  }
  assert.equal((await query(mapped([{ fs: 'LA', iata: 'ZZ', icao: 'LAN' }]), 'ZZ')).state, 'available');
  for (const payload of [
    { flightStatus: item }, mapped([]), mapped({ fs: 'LA', icao: 'LAN' }),
    mapped([{ fs: 'LA', icao: 'OTH' }]), mapped([{ icao: 'LAN' }]),
    mapped([{ fs: {}, icao: 'LAN' }]), mapped([airline, { fs: 'XX', icao: 'LAN' }]),
    mapped([airline, { fs: 'LAN', iata: 'XX' }]),
    mapped([{ fs: 'LA', iata: 'LAN' }]),
    mapped([airline], { carrierFsCode: 'XX' }), mapped([airline], { flightNumber: '3378' }),
    mapped([airline], { departureDate: { dateLocal: '2000-01-01' } }),
  ]) {
    const result = await query(payload, 'LAN');
    assert.equal(result.state, 'invalid_payload');assert.equal(result.rejectedRows, 1);
    assert.equal(result.flights, undefined);
  }
  const collision = mapped([airline, { fs: 'XX', iata: 'LA', icao: 'XXX' }]);
  assert.equal((await probe(collision)).state, 'invalid_payload');
  assert.equal((await query(collision)).state, 'invalid_payload', 'direct FS cannot bypass conflicting reference namespaces');
  assert.equal((await query({ flightStatus: item })).state, 'available', 'exact FS comparison still works without appendix');
  assert.equal((await query(mapped([{ fs: 'LA', icao: 'ZZ' }]), 'ZZ')).state, 'invalid_payload', 'two-character ICAO must not authorize IATA-shaped input');
  assert.equal((await query(mapped([{ fs: 'LAN' }], { carrierFsCode: 'LAN' }), 'LAN')).state, 'available', 'three-character FS remains supported');
}
console.log('Cirium shared strict envelope and unambiguous response carrier reference regression OK; synthetic only');
