import { MYCREWCARE_PROTOCOL } from './myCrewCarePersistentSession.mjs';

/** Decode only the minimised review-only page envelope; never a persistent-session payload. */
export function decodeMyCrewCareObservedNativePage(raw, request, pageUrl) {
  const fail = () => { throw Object.assign(new Error('observed-native-validation-failed'), { code: 'observed-native-validation-failed' }); };
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > 256 * 1024) fail();
  let value;
  try { value = JSON.parse(raw); } catch { fail(); }
  const scope = request?.scope;
  const keys = ['schemaVersion', 'operationalImportAllowed', 'accountId', 'sessionId', 'requestId', 'generation', 'kind', 'rows'];
  if (!scope || !value || Object.keys(value).length !== keys.length || keys.some(key => !(key in value))
    || value.schemaVersion !== 3 || value.operationalImportAllowed !== false || value.kind !== request.kind
    || !Number.isSafeInteger(value.generation) || value.generation < 1
    || ['accountId', 'sessionId', 'requestId', 'generation'].some(key => value[key] !== scope[key])) fail();
  if (['accountId', 'sessionId', 'requestId', 'employeeId', 'username'].some(key => typeof scope[key] !== 'string' || !scope[key].trim() || scope[key].length > 240 || /[\u0000-\u001f\u007f]/.test(scope[key]))) fail();
  const profile = request.kind === 'profile-before' || request.kind === 'profile-after';
  if (!profile && !['cards', 'detail'].includes(request.kind)) fail();
  const expected = profile ? ['employeeId', 'username'] : ['providerReservationId', 'dutyPeriodNumber', 'airport', 'pairingId', 'hotelName'];
  if (request.kind === 'detail') expected.push('confirmationRaw', 'checkInWallDateTime', 'checkOutWallDateTime',
    'toHotelProvider', 'toHotelPickupWallTime', 'toHotelTransitMinutes', 'toAirportProvider', 'toAirportPickupWallTime', 'toAirportTransitMinutes');
  let url;
  try { url = new URL(pageUrl); } catch { fail(); }
  const path = profile ? 'userprofile.aspx' : request.kind === 'cards' ? 'mytravel.aspx' : 'reservation.aspx';
  if (url.origin !== 'https://api2.apicrewcare.com' || url.pathname !== `/LATAM/${path}` || url.username || url.password || url.hash) fail();
  if (!Array.isArray(value.rows) || !value.rows.length || value.rows.length > 50 || (request.kind !== 'cards' && value.rows.length !== 1)) fail();
  const seen = new Set();
  const rows = value.rows.map(row => {
    if (!row || Object.keys(row).length !== expected.length || expected.some(key => !(key in row))
      || Object.values(row).some(text => typeof text !== 'string' || !text.trim() || text.length > 240 || /[\u0000-\u001f\u007f]/.test(text))) fail();
    if (profile) {
      if (row.employeeId !== scope.employeeId || row.username !== scope.username || !/^\d+$/.test(row.employeeId)) fail();
    } else {
      if (!/^[A-Z]{3}$/.test(row.airport)) fail();
      const identity = JSON.stringify([row.providerReservationId, row.dutyPeriodNumber]);
      if (seen.has(identity)) fail(); seen.add(identity);
    }
    if (request.kind === 'detail') {
      if (!request.card || ['providerReservationId', 'dutyPeriodNumber', 'airport', 'pairingId', 'hotelName'].some(key => row[key] !== request.card[key])
        || url.searchParams.getAll('tripreservid').length !== 1 || url.searchParams.getAll('dutyperiodnumber').length !== 1
        || url.searchParams.get('tripreservid') !== row.providerReservationId || url.searchParams.get('dutyperiodnumber') !== row.dutyPeriodNumber) fail();
      for (const key of ['toHotelPickupWallTime', 'toAirportPickupWallTime']) if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row[key])) fail();
      for (const key of ['toHotelTransitMinutes', 'toAirportTransitMinutes']) if (!/^\d{1,3}$/.test(row[key]) || Number(row[key]) > 360) fail();
      for (const key of ['checkInWallDateTime', 'checkOutWallDateTime']) {
        if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(row[key])) fail();
        const instant = new Date(`${row[key]}:00Z`);
        if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 16) !== row[key]) fail();
      }
      if (row.checkOutWallDateTime <= row.checkInWallDateTime) fail();
    }
    return Object.freeze({ ...row });
  });
  return Object.freeze({ ...value, rows: Object.freeze(rows) });
}

function bridgeMethod(bridge, name) {
  return typeof bridge?.[name] === 'function' ? bridge[name].bind(bridge) : null;
}

const CLEANUP_POLL_MS = 100;
const CLEANUP_TIMEOUT_MS = 15_000;

function operationId() {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === 'function') return `cleanup-${crypto.randomUUID()}`;
  throw Object.assign(new Error('secure-random-unavailable'), { code: 'secure-random-unavailable' });
}

function cleanupFailure(code) {
  return Object.assign(new Error(code), { code });
}

/**
 * Adapter for the gated Android portal. It never accepts legacy v1/v2 events.
 *
 * Native cleanup is asynchronous (the WebView profile finishes on its own thread), so a
 * disconnect starts an operation scoped to one account + one operation id and then waits
 * for that operation's real result. A bounded wait during an explicit user action is the
 * only waiting here; there is no recurring polling.
 */
export function createMyCrewCareNativeAdapter({
  bridge,
  events = globalThis.window,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  cleanupTimeoutMs = CLEANUP_TIMEOUT_MS,
  newOperationId = operationId,
} = {}) {
  let cancelPending = null;
  return Object.freeze({
    async disconnect(accountId, forgetData) {
      cancelPending?.();
      cancelPending = null;
      if (!accountId) return;
      const start = bridgeMethod(bridge, 'startMyCrewCareCleanupV3');
      const result = bridgeMethod(bridge, 'myCrewCareCleanupResultV3');
      if (!start || !result) throw cleanupFailure('native-disconnect-failed');
      const id = newOperationId();
      if (start(accountId, forgetData === true, id) !== true) throw cleanupFailure('native-disconnect-failed');
      const deadline = Date.now() + Math.max(1, cleanupTimeoutMs);
      for (;;) {
        const value = String(result(accountId, id) ?? '');
        if (value === 'ok') return;
        if (value.startsWith('failed')) throw cleanupFailure('native-disconnect-failed');
        if (value !== 'pending') throw cleanupFailure('native-disconnect-failed');
        if (Date.now() >= deadline) throw cleanupFailure('native-disconnect-timeout');
        await wait(CLEANUP_POLL_MS);
      }
    },

    read(request, signal) {
      return new Promise((resolve, reject) => {
        if (cancelPending) {
          reject(Object.assign(new Error('sync-in-progress'), { code: 'sync-in-progress' }));
          return;
        }
        const open = bridgeMethod(bridge, 'openMyCrewCareV3');
        const version = bridgeMethod(bridge, 'myCrewCareProtocolVersion');
        const enabled = bridgeMethod(bridge, 'myCrewCareReleaseEnabled');
        if (signal?.aborted
          || version?.() !== MYCREWCARE_PROTOCOL
          || enabled?.() !== true
          || !open
          || typeof events?.addEventListener !== 'function') {
          reject(Object.assign(new Error('native-validation-required'), { code: 'native-validation-required' }));
          return;
        }
        let finished = false;
        const finish = (error, payload) => {
          if (finished) return;
          finished = true;
          events.removeEventListener('crewcheck:mycrewcare-v3', receive);
          signal?.removeEventListener('abort', cancel);
          if (cancelPending === cancel) cancelPending = null;
          if (error) reject(error); else resolve(payload);
        };
        const receive = (event) => {
          if (event?.detail?.requestId !== request.requestId) return;
          finish(null, event.detail);
        };
        const cancel = () => finish(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
        cancelPending = cancel;
        events.addEventListener('crewcheck:mycrewcare-v3', receive);
        signal?.addEventListener('abort', cancel, { once: true });
        try {
          if (open(JSON.stringify(request), true) !== true) {
            finish(Object.assign(new Error('native-validation-required'), { code: 'native-validation-required' }));
          }
        } catch {
          finish(Object.assign(new Error('native-open-failed'), { code: 'native-open-failed' }));
        }
      });
    },
  });
}

/** Encrypted normalized-cache bridge. Provider cookies remain inside the WebView profile. */
export function createMyCrewCareNativeStorage({ bridge } = {}) {
  return Object.freeze({
    read(accountId) {
      const method = bridgeMethod(bridge, 'loadMyCrewCareV3State');
      if (!method) return null;
      const value = method(accountId);
      return typeof value === 'string' && value ? value : null;
    },
    write(accountId, payload) {
      const method = bridgeMethod(bridge, 'saveMyCrewCareV3State');
      if (!method || method(accountId, payload) !== true) {
        throw Object.assign(new Error('native-cache-write-failed'), { code: 'native-cache-write-failed' });
      }
    },
    clear(accountId) {
      const method = bridgeMethod(bridge, 'clearMyCrewCareV3State');
      if (method && method(accountId) !== true) {
        throw Object.assign(new Error('native-cache-clear-failed'), { code: 'native-cache-clear-failed' });
      }
    },
  });
}
