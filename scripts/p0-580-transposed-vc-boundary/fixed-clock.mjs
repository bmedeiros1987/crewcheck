// P0 #580 — deterministic harness clock.
//
// The #580 fixtures describe an August publication that carries out into the first
// days of September, with a September publication carrying the same days in. Which
// of the two the device considers locally active is decided by
// getSmartLocalActiveRosterSummary() against *today*, so with a wall-clock harness
// these scenarios silently change meaning at the competence boundary: the suite was
// green while it ran inside August and turns red from 2026-09-01 onward, for reasons
// unrelated to any source change.
//
// Pinning the harness clock to the epoch the fixtures themselves describe changes no
// fixture, no oracle and no production code. It only makes the existing assertions
// evaluable on any day the gate happens to run. Production behaviour across the
// boundary is asserted separately, under a post-boundary clock, by
// regression-p0-580-boundary-clock-independence.mjs.
export const P0_580_FIXTURE_EPOCH = '2026-08-31T15:00:00.000Z';

export function freezeFixtureClock(iso = P0_580_FIXTURE_EPOCH) {
  const frozen = new Date(iso).getTime();
  if (!Number.isFinite(frozen)) throw new Error(`[p0-580-fixed-clock] invalid epoch: ${iso}`);
  const RealDate = Date;
  class FixtureDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(frozen);
      else super(...args);
    }
    static now() { return frozen; }
  }
  globalThis.Date = FixtureDate;
  return () => { globalThis.Date = RealDate; };
}
