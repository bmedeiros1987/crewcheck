// In-flight rest planner: equal turns, handover gaps, own/handover alarms and every
// rejection path. Synthetic instants only; no device, clock or storage.
import assert from 'node:assert/strict';
import { planInflightRest, inflightRestGroup, INFLIGHT_REST_LIMITS } from '../shared/inflightRestPlan.mjs';

const base = { flightId: 'LA8084-2026-11-02', startAt: '2026-11-02T01:00:00-03:00', endAt: '2026-11-02T07:00:00-03:00',
  turns: 3, handoverMinutes: 15, myTurn: 2, alertEveryHandover: false, mode: 'sound' };
const before = Date.parse('2026-11-02T00:30:00-03:00');
const plan = (patch = {}, now = before) => planInflightRest({ ...base, ...patch }, now);

// 360 min, two 15-min handovers: three 110-min turns.
{
  const result = plan();
  assert.equal(result.ok, true);
  assert.equal(result.group, 'inflight-rest:LA8084-2026-11-02');
  assert.equal(result.turnMinutes, 110);
  assert.deepEqual(result.turns.map((turn) => [turn.startAt, turn.endAt, turn.minutes, turn.mine]), [
    ['2026-11-02T04:00:00.000Z', '2026-11-02T05:50:00.000Z', 110, false],
    ['2026-11-02T06:05:00.000Z', '2026-11-02T07:55:00.000Z', 110, true],
    ['2026-11-02T08:10:00.000Z', '2026-11-02T10:00:00.000Z', 110, false],
  ]);
  assert.deepEqual(result.alarms.map((alarm) => [alarm.kind, alarm.turn, alarm.at, alarm.channel]), [['own-turn-end', 2, '2026-11-02T07:55:00.000Z', 'alarm']]);
  assert.equal(result.alarms[0].id, 'inflight-rest:LA8084-2026-11-02:own-turn-end:2');
  assert.equal(result.alarms[0].epochMs, Date.parse('2026-11-02T07:55:00.000Z'));
  assert.equal(result.watchOnly, false);
}

// The remainder (< turns minutes) stays with the last turn; the window end is exact.
{
  const result = plan({ endAt: '2026-11-02T07:02:00-03:00' });
  assert.equal(result.turnMinutes, 110);
  assert.deepEqual(result.turns.map((turn) => turn.minutes), [110, 110, 112]);
  assert.equal(result.turns.at(-1).endAt, '2026-11-02T10:02:00.000Z');
}

// Every handover: own turn keeps its own kind, others become handover alarms; vibrate-only channel.
{
  const result = plan({ alertEveryHandover: true, mode: 'vibrate' });
  assert.deepEqual(result.alarms.map((alarm) => [alarm.kind, alarm.turn, alarm.channel]),
    [['handover', 1, 'vibrate'], ['own-turn-end', 2, 'vibrate'], ['handover', 3, 'vibrate']]);
  assert.equal(new Set(result.alarms.map((alarm) => alarm.id)).size, 3);
}

// Watching only: no turn chosen and no handover alerts schedules nothing, and says so.
{
  const result = plan({ myTurn: null });
  assert.equal(result.ok, true);
  assert.deepEqual(result.alarms, []);
  assert.equal(result.watchOnly, true);
  assert.equal(plan({ myTurn: null, alertEveryHandover: true }).alarms.length, 3);
}

// Already elapsed alarms are reported, never armed.
{
  const result = plan({ alertEveryHandover: true }, Date.parse('2026-11-02T06:00:00Z'));
  assert.deepEqual(result.past.map((alarm) => alarm.turn), [1]);
  assert.deepEqual(result.alarms.map((alarm) => alarm.turn), [2, 3]);
  const exact = plan({}, Date.parse('2026-11-02T07:55:00Z'));
  assert.deepEqual(exact.alarms, [], 'an alarm at now is not in the future');
  assert.equal(exact.past.length, 1);
}

// Crossing midnight and offsets: absolute instants, same plan whatever offset spells the window.
{
  const utc = plan({ startAt: '2026-11-02T04:00:00Z', endAt: '2026-11-02T10:00:00Z' });
  assert.deepEqual(utc.turns, plan().turns);
  const midnight = plan({ startAt: '2026-11-01T23:30:00-03:00', endAt: '2026-11-02T04:30:00-03:00', turns: 2, handoverMinutes: 0, myTurn: 1 });
  assert.deepEqual(midnight.turns.map((turn) => turn.endAt), ['2026-11-02T05:00:00.000Z', '2026-11-02T07:30:00.000Z']);
}

// Rejections.
const reasons = [
  [{ flightId: '' }, 'invalid-flight'], [{ flightId: 'a/b' }, 'invalid-flight'], [{ flightId: 'x'.repeat(97) }, 'invalid-flight'],
  [{ startAt: '2026-11-02T01:00' }, 'invalid-instant'], [{ startAt: '01:00' }, 'invalid-instant'], [{ endAt: '2026-11-02T07:00:30-03:00' }, 'invalid-instant'],
  [{ startAt: 123 }, 'invalid-instant'], [{ endAt: '2026-11-02T01:00:00-03:00' }, 'end-before-start'],
  [{ endAt: '2026-11-02T21:01:00-03:00' }, 'window-too-long'],
  [{ turns: 1 }, 'invalid-turns'], [{ turns: 7 }, 'invalid-turns'], [{ turns: 2.5 }, 'invalid-turns'], [{ turns: '3' }, 'invalid-turns'],
  [{ handoverMinutes: -1 }, 'invalid-handover'], [{ handoverMinutes: 31 }, 'invalid-handover'],
  [{ myTurn: 0 }, 'invalid-my-turn'], [{ myTurn: 4 }, 'invalid-my-turn'], [{ myTurn: undefined }, 'invalid-my-turn'],
  [{ alertEveryHandover: 'yes' }, 'invalid-handover-alert'], [{ mode: 'loud' }, 'invalid-mode'],
  [{ endAt: '2026-11-02T03:00:00-03:00', turns: 4 }, 'window-too-short'],
];
for (const [patch, reason] of reasons) assert.deepEqual(plan(patch), { ok: false, reason }, JSON.stringify(patch));
assert.deepEqual(planInflightRest(null, before), { ok: false, reason: 'invalid-input' });
assert.deepEqual(plan({}, Number.NaN), { ok: false, reason: 'invalid-clock' });
// The shortest accepted turn is exactly the minimum.
assert.equal(plan({ startAt: '2026-11-02T01:00:00-03:00', endAt: '2026-11-02T02:00:00-03:00', turns: 2, handoverMinutes: 0, myTurn: 1 }).turnMinutes, INFLIGHT_REST_LIMITS.minTurnMinutes);
assert.equal(inflightRestGroup('manual'), 'inflight-rest:manual');
assert.equal(inflightRestGroup(null), null);

// Results are frozen: a caller cannot edit a plan into an unvalidated alarm.
assert.ok(Object.isFrozen(plan()) && Object.isFrozen(plan().alarms) && Object.isFrozen(plan().alarms[0]));

console.log('PASS in-flight rest plan: equal turns with handover gaps, own/handover alarms, vibrate channel, watch-only, past alarms, offsets/midnight and every rejection');
