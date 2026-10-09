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

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  if (new TextEncoder().encode(json).byteLength > MAX_PERSISTED_BYTES) throw new Error('cache-too-large');
  return json;
}

function parseStored(value, context, now) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const payload = JSON.parse(value);
    if (payload?.schemaVersion !== MYCREWCARE_PERSISTENCE_SCHEMA
      || !same(payload?.scope, persistenceScope(context))
      || !Array.isArray(payload?.facts)) return null;
    const syncedAt = myCrewCareInstant(payload.syncedAt);
    if (!Number.isFinite(syncedAt)
      || syncedAt > now + 30_000
      || now - syncedAt > MYCREWCARE_CACHE_MAX_AGE_MS) return null;
    const facts = payload.facts.filter((fact) => fact
      && fact.schemaVersion === 1
      && fact.source === 'mycrewcare'
      && fact.accountId === context.accountId
      && fact.rosterId === context.rosterId
      && fact.rosterRevision === context.rosterRevision);
    if (facts.length !== payload.facts.length) return null;
    return Object.freeze({ syncedAt, facts: Object.freeze(facts), emptyConfirmed: payload.emptyConfirmed === true });
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

/**
 * Persistent, local-first MyCrewCare session controller.
 *
 * The native profile owns provider cookies. The storage adapter receives only the
 * normalized logistics cache and metadata; raw HTML, cookies, tokens, passwords,
 * MFA codes and room data are never accepted here.
 */
export function createMyCrewCarePersistentSession({ adapter, storage, now = Date.now, timeoutMs = 30_000 } = {}) {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)
    || (() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  const sessionId = randomUUID();
  let context = null;
  let stays = [];
  let automatic = false;
  let generation = 0;
  let pending = null;
  let cached = null;
  let status = 'disconnected';
  let lastAttemptAt = null;
  let lastError = null;
  let changes = Object.freeze({ added: Object.freeze([]), changed: Object.freeze([]), removed: Object.freeze([]), hasChanges: false });

  const invalidateRequest = () => {
    generation += 1;
    pending?.abort();
    pending = null;
  };

  const setStatusFromCache = () => {
    if (!cached) status = automatic ? 'disconnected' : 'off';
    else status = automatic ? 'cached' : 'off';
  };

  async function storageRead(accountId) {
    if (typeof storage?.read !== 'function') return null;
    return await storage.read(accountId);
  }

  async function storageWrite(accountId, payload) {
    if (typeof storage?.write !== 'function') return;
    await storage.write(accountId, safeJson(payload));
  }

  async function storageClear(accountId) {
    if (typeof storage?.clear !== 'function') return;
    await storage.clear(accountId);
  }

  function persistencePayload(snapshot) {
    return Object.freeze({
      schemaVersion: MYCREWCARE_PERSISTENCE_SCHEMA,
      scope: persistenceScope(context),
      syncedAt: new Date(snapshot.syncedAt).toISOString(),
      emptyConfirmed: snapshot.emptyConfirmed === true,
      facts: snapshot.facts,
    });
  }

  return Object.freeze({
    setContext(value, persistedStays = []) {
      const nextContext = normalizeMyCrewCareContext(value);
      const nextStays = normalizeMyCrewCareStays(persistedStays, nextContext);
      if (same(context, nextContext) && same(stays, nextStays)) return;
      invalidateRequest();
      context = nextContext;
      stays = nextStays;
      cached = null;
      lastError = null;
      changes = Object.freeze({ added: Object.freeze([]), changed: Object.freeze([]), removed: Object.freeze([]), hasChanges: false });
      if (!context || stays.length !== (Array.isArray(persistedStays) ? persistedStays.length : -1)) {
        automatic = false;
        status = 'invalid-context';
      } else {
        status = automatic ? 'disconnected' : 'off';
      }
    },

    setAutomatic(enabled) {
      automatic = enabled === true && context !== null && stays.length > 0;
      invalidateRequest();
      setStatusFromCache();
    },

    async restore() {
      invalidateRequest();
      if (!context) {
        cached = null;
        status = 'invalid-context';
        return false;
      }
      const raw = await storageRead(context.accountId);
      const restored = parseStored(raw, context, now());
      if (!restored) {
        if (raw) await storageClear(context.accountId);
        cached = null;
        setStatusFromCache();
        return false;
      }
      cached = restored;
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
      const hotel = selectMyCrewCareHotel(cached.facts, stayId, { now: now(), freshForMs: MYCREWCARE_LIVE_MAX_AGE_MS });
      if (!hotel) return null;
      if (hotel.dataState === 'cached' && options.allowCached === false) return null;
      return hotel;
    },

    pickup(stayId, options = {}) {
      if (!cached) return null;
      const pickup = selectMyCrewCarePickup(cached.facts, stayId, { now: now(), freshForMs: MYCREWCARE_LIVE_MAX_AGE_MS });
      if (!pickup) return null;
      if (pickup.dataState === 'cached' && options.allowCached === false) return null;
      return pickup;
    },

    async sync({ reason = 'automatic' } = {}) {
      if (!automatic || !context || stays.length === 0 || typeof adapter?.read !== 'function') return false;
      invalidateRequest();
      status = 'syncing';
      lastError = null;
      lastAttemptAt = now();
      const token = generation;
      const capturedContext = context;
      const capturedStays = stays;
      const requestId = `${sessionId}:${token}:${reason}`;
      const abort = new AbortController();
      pending = abort;
      let timer;
      try {
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error('timeout');
            error.code = 'temporary-error';
            reject(error);
          }, Math.max(1, Math.min(30_000, timeoutMs)));
        });
        const cancelled = new Promise((_, reject) => abort.signal.addEventListener('abort', () => {
          const error = new Error('cancelled');
          error.code = 'cancelled';
          reject(error);
        }, { once: true }));
        const raw = await Promise.race([
          adapter.read({ schemaVersion: MYCREWCARE_PROTOCOL, requestId, context: { ...capturedContext } }, abort.signal),
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
          throw Object.assign(new Error(reconciled.error || 'ambiguous-provider-data'), { code: reconciled.error || 'ambiguous-provider-data' });
        }
        const previousFacts = cached?.facts ?? [];
        changes = diffMyCrewCareFacts(previousFacts, reconciled.facts);
        cached = Object.freeze({
          syncedAt: myCrewCareInstant(envelope.observedAt),
          facts: reconciled.facts,
          emptyConfirmed: envelope.emptyConfirmed,
        });
        await storageWrite(capturedContext.accountId, persistencePayload(cached));
        if (token !== generation || context !== capturedContext || !automatic) return false;
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
        else if (code === 'ambiguous-provider-data') status = 'ambiguous-data';
        else status = cached ? 'offline-cache' : 'sync-error';
        return false;
      } finally {
        clearTimeout(timer);
      }
    },

    async disconnect({ forgetData = true } = {}) {
      const accountId = context?.accountId ?? null;
      automatic = false;
      invalidateRequest();
      try { await adapter?.disconnect?.(accountId, forgetData); } catch { /* fail closed locally */ }
      if (forgetData && accountId) await storageClear(accountId);
      cached = null;
      status = 'disconnected';
      lastError = null;
    },

    async logout() {
      const accountId = context?.accountId ?? null;
      automatic = false;
      invalidateRequest();
      try { await adapter?.disconnect?.(accountId, true); } catch { /* continue local erasure */ }
      if (accountId) await storageClear(accountId);
      context = null;
      stays = [];
      cached = null;
      status = 'disconnected';
      lastError = null;
    },
  });
}
