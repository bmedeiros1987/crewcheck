// In-flight rest planner: splits a crew rest window into equal turns with a fixed
// handover gap and derives the local alarms. Pure: no clock, storage or device.
// Instants are absolute (ISO-8601 with an explicit offset); a bare HH:mm is never
// interpreted. A turn is only an alarm time, never a regulatory rest record.

export const INFLIGHT_REST_LIMITS = Object.freeze({
  minTurns: 2, maxTurns: 6, maxHandoverMinutes: 30, minTurnMinutes: 30, maxWindowMinutes: 20 * 60,
});
export const INFLIGHT_REST_MODES = Object.freeze(['sound', 'vibrate']);
const MINUTE = 60_000;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const FLIGHT_ID = /^[A-Za-z0-9._:-]{1,96}$/;

function instant(value) {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value)) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && epoch % MINUTE === 0 ? epoch : null;
}
function integer(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}
const fail = (reason) => Object.freeze({ ok: false, reason });

/** Group shared by every alarm of one flight's rest, so a revision replaces all of them. */
export function inflightRestGroup(flightId) {
  return typeof flightId === 'string' && FLIGHT_ID.test(flightId) ? `inflight-rest:${flightId}` : null;
}

/**
 * @param {{flightId:string,startAt:string,endAt:string,turns:number,handoverMinutes:number,
 *   myTurn:number|null,alertEveryHandover:boolean,mode:'sound'|'vibrate'}} input
 * @param {number} now epoch ms supplied by the caller; past alarms are reported, not armed.
 */
export function planInflightRest(input, now) {
  if (!input || typeof input !== 'object') return fail('invalid-input');
  const group = inflightRestGroup(input.flightId);
  if (!group) return fail('invalid-flight');
  const start = instant(input.startAt), end = instant(input.endAt);
  if (start === null || end === null) return fail('invalid-instant');
  if (end <= start) return fail('end-before-start');
  const windowMinutes = (end - start) / MINUTE;
  if (windowMinutes > INFLIGHT_REST_LIMITS.maxWindowMinutes) return fail('window-too-long');
  const turns = integer(input.turns, INFLIGHT_REST_LIMITS.minTurns, INFLIGHT_REST_LIMITS.maxTurns);
  if (turns === null) return fail('invalid-turns');
  const handover = integer(input.handoverMinutes, 0, INFLIGHT_REST_LIMITS.maxHandoverMinutes);
  if (handover === null) return fail('invalid-handover');
  const myTurn = input.myTurn === null ? null : integer(input.myTurn, 1, turns);
  if (myTurn === null && input.myTurn !== null) return fail('invalid-my-turn');
  if (typeof input.alertEveryHandover !== 'boolean') return fail('invalid-handover-alert');
  if (!INFLIGHT_REST_MODES.includes(input.mode)) return fail('invalid-mode');
  if (!Number.isSafeInteger(now)) return fail('invalid-clock');

  // Equal whole-minute turns; the remainder (< turns minutes) stays with the last turn.
  const turnMinutes = Math.floor((windowMinutes - (turns - 1) * handover) / turns);
  if (turnMinutes < INFLIGHT_REST_LIMITS.minTurnMinutes) return fail('window-too-short');
  const plan = [];
  for (let index = 1; index <= turns; index += 1) {
    const turnStart = start + (index - 1) * (turnMinutes + handover) * MINUTE;
    const turnEnd = index === turns ? end : turnStart + turnMinutes * MINUTE;
    plan.push(Object.freeze({ index, startAt: new Date(turnStart).toISOString(), endAt: new Date(turnEnd).toISOString(),
      minutes: (turnEnd - turnStart) / MINUTE, mine: index === myTurn }));
  }

  const channel = input.mode === 'vibrate' ? 'vibrate' : 'alarm';
  const candidates = plan.flatMap((turn) => {
    if (turn.mine) return [{ kind: 'own-turn-end', turn: turn.index, at: Date.parse(turn.endAt) }];
    return input.alertEveryHandover ? [{ kind: 'handover', turn: turn.index, at: Date.parse(turn.endAt) }] : [];
  });
  const alarms = [], past = [];
  for (const candidate of candidates) {
    const alarm = Object.freeze({ id: `${group}:${candidate.kind}:${candidate.turn}`, group, kind: candidate.kind,
      turn: candidate.turn, at: new Date(candidate.at).toISOString(), epochMs: candidate.at, channel });
    (candidate.at > now ? alarms : past).push(alarm);
  }
  return Object.freeze({ ok: true, group, turnMinutes, handoverMinutes: handover, turns: Object.freeze(plan),
    alarms: Object.freeze(alarms), past: Object.freeze(past), watchOnly: myTurn === null && !input.alertEveryHandover });
}
