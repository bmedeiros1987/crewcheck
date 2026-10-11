import {
  MYCREWCARE_CACHE_MAX_AGE_MS,
  diffMyCrewCareFacts,
  isMyCrewCareTravelUrl,
  myCrewCareInstant,
  normalizeMyCrewCareContext,
  normalizeMyCrewCareStays,
  reconcileMyCrewCareLogistics,
  selectMyCrewCareHotel,
  selectMyCrewCarePickup,
} from './myCrewCareLogistics.mjs';

export const MYCREWCARE_PROTOCOL = 3;
export const MYCREWCARE_PERSISTENCE_SCHEMA = 1;
export const MYCREWCARE_LIVE_MAX_AGE_MS = 15 * 60_000;
const MAX_PERSISTED_BYTES = 256 * 1024;

const ROOT_KEYS = new Set(['schemaVersion', 'scope', 'syncedAt', 'emptyConfirmed', 'facts']);
const SCOPE_KEYS = new Set(['accountId', 'rosterId', 'rosterRevision', 'providerSubject']);
const HOTEL_FACT_KEYS = new Set([
  'schemaVersion', 'accountId', 'rosterId', 'rosterRevision', 'observedAt',
  'source', 'status', 'providerRecordId', 'stayId', 'rosterEventId', 'airport',
  'pairingId', 'kind', 'hotelName', 'hotelAddress', 'hotelPhone',
  'reservationStartAt', 'reservationEndAt', 'contentFingerprint',
]);
const PICKUP_FACT_KEYS = new Set([
  'schemaVersion', 'accountId', 'rosterId', 'rosterRevision', 'observedAt',
  'source', 'status', 'providerRecordId', 'stayId', 'rosterEventId', 'airport',
  'pairingId', 'kind', 'hotelName', 'timeZone', 'pickupAt', 'pickupLocation',
  'transportProvider', 'transportPhone', 'transitMinutes', 'contentFingerprint',
]);

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function safeString(value, max = 512) {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.trim().length <= max
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function nullableString(value, max) {
  return value === null || safeString(value, max);
}

function validStatus(value) {
  return value === 'published' || value === 'changed' || value === 'cancelled';
}

function validStoredFact(fact, context) {
  const expected = fact?.kind === 'hotel'
    ? HOTEL_FACT_KEYS
    : (fact?.kind === 'pickup' ? PICKUP_FACT_KEYS : null);
  if (!expected
    || !exactKeys(fact, expected)
    || fact.schemaVersion !== 1
    || fact.source !== 'mycrewcare'
    || !validStatus(fact.status)
    || fact.accountId !== context.accountId
    || fact.rosterId !== context.rosterId
    || fact.rosterRevision !== context.rosterRevision
    || !safeString(fact.stayId)
    || !safeString(fact.rosterEventId)
    || !/^[A-Z]{3}$/.test(fact.airport)
    || !safeString(fact.pairingId)
    || !safeString(fact.hotelName, 240)
    || !Number.isFinite(myCrewCareInstant(fact.observedAt))
    || !/^[0-9a-f]{16,128}$/.test(fact.contentFingerprint)
    || !nullableString(fact.providerRecordId, 180)) return false;

  if (fact.kind === 'hotel') {
    return nullableString(fact.hotelAddress, 320)
      && nullableString(fact.hotelPhone, 80)
      && (fact.reservationStartAt === null || Number.isFinite(myCrewCareInstant(fact.reservationStartAt)))
      && (fact.reservationEndAt === null || Number.isFinite(myCrewCareInstant(fact.reservationEndAt)));
  }
  return safeString(fact.timeZone, 100)
    && Number.isFinite(myCrewCareInstant(fact.pickupAt))
    && nullableString(fact.pickupLocation, 240)
    && nullableString(fact.transportProvider, 180)
    && nullableString(fact.transportPhone, 80)
    && (fact.transitMinutes === null
      || (Number.isInteger(fact.transitMinutes) && fact.transitMinutes >= 0 && fact.transitMinutes <= 360));
}

function persistenceScope(context) {
  return Object.freeze({
    accountId: context.accountId,
    rosterId: context.rosterId,
    rosterRevision: context.rosterRevision,
    providerSubject: context.providerSubject,
  });
}

function safeJson(value) {
  const json = JSON.stringify(value);
  if (new TextEncoder().encode(json).byteLength > MAX_PERSISTED_BYTES) {
    throw Object.assign(new Error('cache-too-large'), { code: 'cache-write-failed' });
  }
  return json;
}

function parseStored(value, context, now) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const payload = JSON.parse(value);
    if (!exactKeys(payload, ROOT_KEYS)
      || payload.schemaVersion !== MYCREWCARE_PERSISTENCE_SCHEMA
      || !exactKeys(payload.scope, SCOPE_KEYS)
      || !same(payload.scope, persistenceScope(context))
      || typeof payload.emptyConfirmed !== 'boolean'
      || !Array.isArray(payload.facts)) return null;
    const syncedAt = myCrewCareInstant(payload.syncedAt);
    if (!Number.isFinite(syncedAt)
      || syncedAt > now + 30_000
      || now - syncedAt > MYCREWCARE_CACHE_MAX_AGE_MS
      || !payload.facts.every((fact) => validStoredFact(fact, context))) return null;
    return Object.freeze({
      syncedAt,
      facts: Object.freeze(payload.facts.map((fact) => Object.freeze({ ...fact }))),
      emptyConfirmed: payload.emptyConfirmed,
    });
  } catch {
    return null;
  }
}

function normalizeProviderEnvelope(payload, requestId, context, now) {
  if (payload?.schemaVersion !== MYCREWCARE_PROTOCOL
    || payload?.requestId !== requestId
    || !same(normalizeMyCrewCareContext(payload?.context), context)
    || payload?.authenticated !== true
    || payload?.providerSubject !== context.providerSubject
    || !isMyCrewCareTravelUrl(payload?.url)
    || payload?.error
    || !Array.isArray(payload?.records)
    || (payload.records.length === 0 && payload.emptyConfirmed !== true)) return null;
  const observedAt = payload.observedAt ?? payload.syncedAt;
  const observedEpoch = myCrewCareInstant(observedAt);
  if (!Number.isFinite(observedEpoch)
    || observedEpoch > now + 30_000
    || now - observedEpoch > MYCREWCARE_LIVE_MAX_AGE_MS) return null;
  return Object.freeze({
    observedAt: new Date(observedEpoch).toISOString(),
    emptyConfirmed: payload.emptyConfirmed === true,
    records: payload.records,
  });
}

function errorCode(error) {
  if (typeof error?.code === 'string' && error.code) return error.code;
  const message = String(error?.message || error || 'sync-error');
  if (/expired|unauth|401|403|login/i.test(message)) return 'session-expired';
  if (/cancel/i.test(message)) return 'cancelled';
  if (/offline|network|timeout/i.test(message)) return 'temporary-error';
  return 'sync-error';
}

function secureSessionId() {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto?.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  }
  throw Object.assign(new Error('secure-random-unavailable'), { code: 'secure-random-unavailable' });
}

function safeReason(value) {
  return typeof value === 'string' && /^[a-z0-9-]{1,40}$/i.test(value) ? value : 'automatic';
}

/**
 * Persistent, local-first MyCrewCare session controller.
 *
 * The native profile owns provider cookies. The storage adapter receives only the
 * normalized logistics cache and metadata; raw portal content is never accepted.
 */
export function createMyCrewCarePersistentSession({ adapter, storage, now = Date.now, timeoutMs = 30_000 } = {}) {
  const sessionId = secureSessionId();
  let context = null;
  let stays = [];
  let automatic = false;
  let generation = 0;
  // Bumped on context change, cleanup and every restore: a restore that finishes after
  // any of them is stale and must neither publish nor touch storage.
  let restoreEpoch = 0;
  let contextEpoch = 0;
  let activeCleanupAccount = null;
  let pendingCleanup = null;
  const storageQueues = new Map();
  const cleaningAccounts = new Map();

  // A clear is ordered after every write already started for this account.
  // Failures must not break the queue: cleanup still needs to run after a failed write.
  function queueStorage(accountId, operation) {
    const previous = storageQueues.get(accountId) ?? Promise.resolve();
    const result = previous.catch(() => {}).then(operation);
    storageQueues.set(accountId, result);
    result.finally(() => {
      if (storageQueues.get(accountId) === result) storageQueues.delete(accountId);
    }).catch(() => {});
    return result;
  }
  let pending = null;
  let cached = null;
  let status = 'disconnected';
  let lastAttemptAt = null;
  let lastError = null;
  let changes = Object.freeze({
    added: Object.freeze([]),
    changed: Object.freeze([]),
    removed: Object.freeze([]),
    hasChanges: false,
  });

  const invalidateRequest = () => {
    generation += 1;
    pending?.abort();
    pending = null;
  };

  const setStatusFromCache = () => {
    status = cached ? (automatic ? 'cached' : 'off') : (automatic ? 'disconnected' : 'off');
  };

  async function storageRead(accountId) {
    if (typeof storage?.read !== 'function') return null;
    try {
      return await storage.read(accountId);
    } catch (cause) {
      throw Object.assign(new Error('cache-read-failed'), { code: 'cache-read-failed', cause });
    }
  }

  async function storageWrite(accountId, payload) {
    if (typeof storage?.write !== 'function') return;
    try {
      await storage.write(accountId, safeJson(payload));
    } catch (cause) {
      throw Object.assign(new Error('cache-write-failed'), { code: 'cache-write-failed', cause });
    }
  }

  async function storageClear(accountId) {
    if (typeof storage?.clear !== 'function') return;
    try {
      await storage.clear(accountId);
    } catch (cause) {
      throw Object.assign(new Error('cache-clear-failed'), { code: 'cache-clear-failed', cause });
    }
  }

  function persistencePayload(snapshot, scopeContext) {
    return Object.freeze({
      schemaVersion: MYCREWCARE_PERSISTENCE_SCHEMA,
      scope: persistenceScope(scopeContext),
      syncedAt: new Date(snapshot.syncedAt).toISOString(),
      emptyConfirmed: snapshot.emptyConfirmed === true,
      facts: snapshot.facts,
    });
  }

  async function clearConnection({ forgetData, clearContext }) {
    const capturedContext = context;
    const accountId = capturedContext?.accountId ?? pendingCleanup ?? activeCleanupAccount ?? null;
    automatic = false;
    restoreEpoch += 1;
    invalidateRequest();
    if (forgetData) cached = null;
    // Detach synchronously. Completion of A's cleanup must never detach a later B.
    if (clearContext) {
      context = null;
      contextEpoch += 1;
      stays = [];
      cached = null;
    }
    const remainingContext = context;
    status = cached ? 'off' : 'disconnected';
    // One barrier per account, retained until EVERY concurrent native/storage
    // cleanup settles. Consent changes invalidate reads, not cleanup ownership.
    const cleanup = cleaningAccounts.get(accountId) ?? { count: 0, error: null };
    cleanup.count += 1;
    cleanup.context = remainingContext;
    cleanup.epoch = contextEpoch;
    cleaningAccounts.set(accountId, cleanup);
    activeCleanupAccount = accountId;
    const outcomes = await Promise.allSettled([
      Promise.resolve().then(() => adapter?.disconnect?.(accountId, forgetData)),
      forgetData && accountId ? queueStorage(accountId, () => storageClear(accountId)) : Promise.resolve(),
    ]);
    const cleanupError = outcomes[0].status === 'rejected' ? 'profile-disconnect-failed'
      : outcomes[1].status === 'rejected' ? 'cache-clear-failed' : null;
    cleanup.error ||= cleanupError;
    cleanup.count -= 1;
    if (cleanup.count === 0) {
      cleaningAccounts.delete(accountId);
      if (contextEpoch === cleanup.epoch && context === cleanup.context) {
        // Retry remains visible even if consent changed while cleanup was pending.
        pendingCleanup = cleanup.error ? accountId : null;
        status = cleanup.error ? 'cleanup-error' : (cached ? 'off' : 'disconnected');
        lastError = cleanup.error;
      }
      if (activeCleanupAccount === accountId) activeCleanupAccount = null;
    }
    if (cleanupError) throw Object.assign(new Error(cleanupError), { code: cleanupError });
  }

  return Object.freeze({
    setContext(value, persistedStays = []) {
      const nextContext = normalizeMyCrewCareContext(value);
      const nextStays = normalizeMyCrewCareStays(persistedStays, nextContext);
      if (same(context, nextContext) && same(stays, nextStays)) return;
      invalidateRequest();
      restoreEpoch += 1;
      context = nextContext;
      contextEpoch += 1;
      stays = nextStays;
      cached = null;
      lastError = null;
      changes = Object.freeze({
        added: Object.freeze([]),
        changed: Object.freeze([]),
        removed: Object.freeze([]),
        hasChanges: false,
      });
      if (!context || stays.length !== (Array.isArray(persistedStays) ? persistedStays.length : -1)) {
        automatic = false;
        status = 'invalid-context';
      } else {
        status = automatic ? 'disconnected' : 'off';
      }
    },

    setAutomatic(enabled) {
      automatic = enabled === true && context !== null && !cleaningAccounts.has(context.accountId) && stays.length > 0;
      invalidateRequest();
      setStatusFromCache();
    },

    async restore() {
      invalidateRequest();
      if (!context) {
        restoreEpoch += 1;
        cached = null;
        status = 'invalid-context';
        return false;
      }
      // Everything below uses the captured account/epoch, never the live `context`.
      const epoch = restoreEpoch += 1;
      const capturedContext = context;
      const accountId = capturedContext.accountId;
      const stale = () => epoch !== restoreEpoch || context !== capturedContext;
      let raw;
      try {
        if (cleaningAccounts.has(accountId)) return false;
        if (storageQueues.has(accountId)) await storageQueues.get(accountId).catch(() => {});
        if (stale()) return false;
        raw = await storageRead(accountId);
      } catch (error) {
        if (stale()) return false;
        cached = null;
        status = 'storage-error';
        lastError = errorCode(error);
        return false;
      }
      if (stale()) return false;
      const restored = parseStored(raw, capturedContext, now());
      if (!restored) {
        if (raw) {
          try {
            await queueStorage(accountId, () => stale() ? undefined : storageClear(accountId));
          } catch (error) {
            if (stale()) return false;
            cached = null;
            status = 'cleanup-error';
            lastError = errorCode(error);
            return false;
          }
          if (stale()) return false;
        }
        cached = null;
        lastError = null;
        setStatusFromCache();
        return false;
      }
      cached = restored;
      lastError = null;
      status = automatic ? 'cached' : 'off';
      return true;
    },

    state() {
      const current = now();
      const syncedAt = cached?.syncedAt ?? null;
      const ageMs = syncedAt === null ? null : Math.max(0, current - syncedAt);
      return Object.freeze({
        status,
        connected: status === 'connected',
        automatic,
        hasCachedData: cached !== null,
        cleanupPending: pendingCleanup !== null,
        cleanupInProgress: cleaningAccounts.has(context?.accountId ?? activeCleanupAccount),
        lastSuccessfulSyncAt: syncedAt === null ? null : new Date(syncedAt).toISOString(),
        dataAgeMs: ageMs,
        live: ageMs !== null && ageMs <= MYCREWCARE_LIVE_MAX_AGE_MS,
        lastAttemptAt: lastAttemptAt === null ? null : new Date(lastAttemptAt).toISOString(),
        lastError,
        changes,
      });
    },

    hotel(stayId, options = {}) {
      if (!cached) return null;
      const hotel = selectMyCrewCareHotel(cached.facts, stayId, {
        now: now(),
        freshForMs: MYCREWCARE_LIVE_MAX_AGE_MS,
      });
      if (!hotel || (hotel.dataState === 'cached' && options.allowCached === false)) return null;
      return hotel;
    },

    pickup(stayId, options = {}) {
      if (!cached) return null;
      const pickup = selectMyCrewCarePickup(cached.facts, stayId, {
        now: now(),
        freshForMs: MYCREWCARE_LIVE_MAX_AGE_MS,
      });
      if (!pickup || (pickup.dataState === 'cached' && options.allowCached === false)) return null;
      return pickup;
    },

    async sync({ reason = 'automatic' } = {}) {
      if (!automatic || !context || cleaningAccounts.has(context.accountId) || stays.length === 0 || typeof adapter?.read !== 'function') return false;
      invalidateRequest();
      status = 'syncing';
      lastError = null;
      lastAttemptAt = now();
      const token = generation;
      const capturedContext = context;
      const capturedStays = stays;
      const requestId = `${sessionId}:${token}:${safeReason(reason)}`;
      const abort = new AbortController();
      pending = abort;
      let timer;
      try {
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => {
            // Settle the deadline first so cancellation preserves the timeout error.
            reject(Object.assign(new Error('timeout'), { code: 'temporary-error' }));
            abort.abort();
          }, Math.max(1, Math.min(30_000, timeoutMs)));
        });
        const cancelled = new Promise((_, reject) => abort.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
        }, { once: true }));
        const raw = await Promise.race([
          adapter.read({
            schemaVersion: MYCREWCARE_PROTOCOL,
            requestId,
            context: { ...capturedContext },
          }, abort.signal),
          deadline,
          cancelled,
        ]);
        if (token !== generation || context !== capturedContext || stays !== capturedStays || !automatic) return false;
        if (raw?.cancelled === true) {
          automatic = false;
          status = cached ? 'off' : 'disconnected';
          return false;
        }
        const envelope = normalizeProviderEnvelope(raw, requestId, capturedContext, now());
        if (!envelope) throw Object.assign(new Error('unverified-session'), { code: 'session-expired' });
        const reconciled = reconcileMyCrewCareLogistics({
          context: capturedContext,
          stays: capturedStays,
          snapshot: envelope,
          now: now(),
        });
        if (!reconciled.accepted) {
          const code = reconciled.error || 'ambiguous-provider-data';
          throw Object.assign(new Error(code), { code });
        }
        const nextCached = Object.freeze({
          syncedAt: myCrewCareInstant(envelope.observedAt),
          facts: reconciled.facts,
          emptyConfirmed: envelope.emptyConfirmed,
        });
        const nextChanges = diffMyCrewCareFacts(cached?.facts ?? [], nextCached.facts);
        await queueStorage(capturedContext.accountId, () => {
          if (token !== generation || context !== capturedContext || !automatic) return;
          return storageWrite(capturedContext.accountId, persistencePayload(nextCached, capturedContext));
        });
        if (token !== generation || context !== capturedContext || stays !== capturedStays || !automatic) return false;
        cached = nextCached;
        changes = nextChanges;
        pending = null;
        status = 'connected';
        lastError = null;
        return true;
      } catch (error) {
        if (token !== generation) return false;
        const code = errorCode(error);
        lastError = code;
        pending = null;
        if (code === 'cancelled') setStatusFromCache();
        else if (code === 'session-expired' || code === 'identity-mismatch') status = 'reconnect-required';
        else if (code === 'ambiguous-provider-data' || code === 'unmatched-provider-data') status = 'ambiguous-data';
        else if (code === 'cache-write-failed') status = cached ? 'offline-cache' : 'storage-error';
        else status = cached ? 'offline-cache' : 'sync-error';
        return false;
      } finally {
        clearTimeout(timer);
      }
    },

    async disconnect({ forgetData = true } = {}) {
      await clearConnection({ forgetData: forgetData === true, clearContext: false });
    },

    async logout() {
      await clearConnection({ forgetData: true, clearContext: true });
    },
  });
}
