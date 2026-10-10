import { stayInstant } from './stay-edit-plan.mjs';
import { stayAlarmIdentity } from './stay-alarm-adapter.mjs';

export const STAY_ANDROID_PROTOCOL = 'crewcheck-stay-alarm-v1';
const ACK = 'native-api-and-journal-completed';
/** Opt-in construction only; nothing imports/installs this factory in the editor.
 * A native response acknowledges API+journal completion, never physical delivery. */
export function createAndroidStayAlarmAdapter({ native, enabled = false, activeAccount = () => null, activeSession, operationId } = {}) {
  if (!enabled || typeof activeSession !== 'function' || !native?.capabilities || !native?.transact) return null;
  let capabilities;
  try { capabilities = JSON.parse(native.capabilities()); } catch { return null; }
  if (capabilities?.protocol !== STAY_ANDROID_PROTOCOL || capabilities.featureEnabled !== true
    || capabilities.atomicReplace !== true || capabilities.acknowledgedCancel !== true) return null;
  let sequence = 0;
  const nextOperation = operationId || (() => globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${++sequence}`);
  const tails = new Map();
  const serialize = (key, task) => {
    const run = (tails.get(key) || Promise.resolve()).catch(() => undefined).then(task);
    tails.set(key, run);
    run.finally(() => { if (tails.get(key) === run) tails.delete(key); }).catch(() => undefined);
    return run;
  };
  function identity(key) {
    const owner = activeAccount();
    if (typeof owner !== 'string' || !owner || typeof key !== 'string') throw Error('owner unavailable');
    const parts = key.split(':');
    if (parts.length !== 3) throw Error('invalid identity');
    const accountId = decodeURIComponent(parts[1]), eventId = decodeURIComponent(parts[2]);
    if (owner !== accountId || !eventId || stayAlarmIdentity(accountId, eventId) !== key) throw Error('owner mismatch');
    const session = activeSession();
    if (typeof session !== 'string' || !session) throw Error('session unavailable');
    return { accountId, eventId, session };
  }
  async function call(body) {
    const { session, ...payload } = body;
    const value = await native.transact(JSON.stringify({ protocol: STAY_ANDROID_PROTOCOL, ...payload }));
    if (activeAccount() !== body.accountId || activeSession() !== session) throw Error('owner changed while awaiting native acknowledgement');
    const response = JSON.parse(value);
    if (response?.protocol !== STAY_ANDROID_PROTOCOL || response.key !== body.key
      || response.operationId !== body.operationId || response.deliveryConfirmed !== false) throw Error('unmatched native receipt');
    return response;
  }
  async function revision(key, scope) {
    const value = await call({ action: 'inspect', key, ...scope, operationId: nextOperation() });
    if (!Number.isSafeInteger(value.revision) || value.revision < 0 || value.state === 'unknown') throw Error('native state unavailable');
    return value.revision;
  }
  const unknown = key => ({ state: 'unknown', reason: 'native-receipt-incomplete', key });
  return {
    atomicReplace: true, acknowledgedCancel: true,
    replace(input) {
      return serialize(input.key, async () => {
        try {
          const scope = identity(input.key), alarm = stayInstant(input.alarmAt), apz = stayInstant(input.hotelReportAt);
          if (input.confirmed !== true || input.apzConfirmed !== true || alarm === null || apz === null || alarm >= apz
            || !['relative', 'absolute'].includes(input.mode)) return { state: 'not-programmed', reason: 'invalid-native-input', key: input.key };
          const expectedRevision = await revision(input.key, scope);
          const value = await call({ action: 'replace', key: input.key, ...scope, expectedRevision,
            operationId: nextOperation(), alarmAt: input.alarmAt, hotelReportAt: input.hotelReportAt,
            mode: input.mode, confirmed: true, apzConfirmed: true });
          if (value.state === 'not-programmed') return { ...value, key: input.key };
          return value.state === 'scheduled' && value.alarmAt === input.alarmAt && value.acknowledgement === ACK
            && Number.isSafeInteger(value.revision) && value.revision > expectedRevision ? value : unknown(input.key);
        } catch { return unknown(input.key); }
      });
    },
    cancel({ key }) {
      return serialize(key, async () => {
        try {
          const scope = identity(key), expectedRevision = await revision(key, scope);
          const value = await call({ action: 'cancel', key, ...scope, expectedRevision, operationId: nextOperation() });
          if (value.state === 'not-programmed') return { ...value, key };
          return value.state === 'cancelled' && value.acknowledgement === ACK
            && Number.isSafeInteger(value.revision) && value.revision > expectedRevision ? value : unknown(key);
        } catch { return unknown(key); }
      });
    },
  };
}
