import { stayInstant } from './stay-edit-plan.mjs';
export function stayAlarmIdentity(accountId, eventId) {
  if (!accountId || !eventId) throw new Error('Alarm identity requires account and stay');
  return `stay-hotel-apz:${encodeURIComponent(accountId)}:${encodeURIComponent(eventId)}`;
}
/** Adapter contract deliberately requires atomic replacement and acknowledged
 * cancellation. The old native boolean/timeout bridge is never adapted here. */
export function createStayAlarmController(adapter = null) {
  const tails = new Map();
  const serialize = (key, operation) => {
    const task = (tails.get(key) || Promise.resolve()).catch(() => undefined).then(operation);
    tails.set(key, task);
    task.finally(() => { if (tails.get(key) === task) tails.delete(key); }).catch(() => undefined);
    return task;
  };
  return {
    replace(input) {
      const key = stayAlarmIdentity(input.accountId, input.eventId);
      return serialize(key, async () => {
        if (!adapter?.atomicReplace || !adapter?.acknowledgedCancel) return { state: 'not-programmed', reason: 'capability-unavailable', key };
        if (!input.confirmed || !input.apzConfirmed || input.permission !== 'granted' || input.cancelled) return { state: 'not-programmed', reason: 'confirmation-or-permission-required', key };
        const alarm = stayInstant(input.alarmAt), apz = stayInstant(input.hotelReportAt);
        if (!Number.isFinite(input.now) || alarm === null || apz === null || alarm <= input.now || alarm >= apz) return { state: 'not-programmed', reason: 'time-incompatible', key };
        try {
          const result = await adapter.replace({ key, alarmAt: input.alarmAt, hotelReportAt: input.hotelReportAt });
          return result?.key === key && result?.alarmAt === input.alarmAt && result?.state === 'scheduled'
            ? { ...result, key } : { state: 'unknown', reason: 'unacknowledged-replacement', key };
        } catch { return { state: 'unknown', reason: 'replacement-failed', key }; }
      });
    },
    cancel({ accountId, eventId }) {
      const key = stayAlarmIdentity(accountId, eventId);
      return serialize(key, async () => {
        if (!adapter?.atomicReplace || !adapter?.acknowledgedCancel) return { state: 'not-programmed', reason: 'capability-unavailable', key };
        try { const result = await adapter.cancel({ key }); return result?.key === key && result?.state === 'cancelled' ? { state: 'cancelled', key } : { state: 'unknown', reason: 'unacknowledged-cancellation', key }; }
        catch { return { state: 'unknown', reason: 'cancellation-failed', key }; }
      });
    },
  };
}
