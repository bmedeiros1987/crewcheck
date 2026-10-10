import { MYCREWCARE_PROTOCOL, createMyCrewCarePersistentSession } from './myCrewCarePersistentSession.mjs';
import { createMyCrewCareNativeAdapter, createMyCrewCareNativeStorage } from './myCrewCareNativeAdapter.mjs';
import { MYCREWCARE_BACKGROUND_CAPABILITY, planMyCrewCareSync } from './myCrewCareSyncPolicy.mjs';

/**
 * Interface key for the whole feature. It stays false until the gates in
 * docs/mycrewcare-v3-persistent-session.md pass on physical devices. The native
 * RELEASE_ENABLED flag is a second, independent key: both must be true.
 */
export const MYCREWCARE_UI_ENABLED = false;

function nativeReady(bridge) {
  try {
    return typeof bridge?.myCrewCareProtocolVersion === 'function'
      && bridge.myCrewCareProtocolVersion() === MYCREWCARE_PROTOCOL
      && typeof bridge?.myCrewCareReleaseEnabled === 'function'
      && bridge.myCrewCareReleaseEnabled() === true;
  } catch {
    return false;
  }
}

/**
 * Framework-free controller between the persistent session and the interface.
 *
 * - Disabled unless the interface key AND the native release flag are true.
 * - Never schedules timers and never syncs in the background: the provider
 *   session may require SSO/MFA, so only an explicit user tap calls the adapter.
 *   Automatic triggers (app opened, roster changed) only mark `refreshSuggested`.
 * - Switching account drops the previous account's facts from memory before
 *   anything else can read them; the encrypted cache and WebView profile are
 *   keyed per account natively.
 */
export function createMyCrewCareController({
  bridge,
  events,
  uiEnabled = MYCREWCARE_UI_ENABLED,
  now = Date.now,
  isForeground = () => true,
  isOnline = () => true,
  session,
} = {}) {
  const active = uiEnabled === true && nativeReady(bridge);
  const engine = active
    ? (session ?? createMyCrewCarePersistentSession({
      adapter: createMyCrewCareNativeAdapter({ bridge, events }),
      storage: createMyCrewCareNativeStorage({ bridge }),
      now,
    }))
    : null;

  const listeners = new Set();
  let busy = false;
  let refreshSuggested = false;
  let boundAccount = null;
  let snapshot = build();
  let snapshotSignature = JSON.stringify(snapshot);

  function build() {
    if (!engine) {
      return Object.freeze({
        capability: 'disabled', status: 'disabled', connected: false, automatic: false, busy: false,
        hasCachedData: false, live: false, dataAgeMs: null, lastSuccessfulSyncAt: null,
        lastError: null, canRetryCleanup: false, refreshSuggested: false, requiresInteraction: false, changes: null,
      });
    }
    const state = engine.state();
    return Object.freeze({
      capability: 'available',
      status: busy ? 'syncing' : state.status,
      connected: state.connected,
      automatic: state.automatic,
      busy,
      hasCachedData: state.hasCachedData,
      live: state.live,
      dataAgeMs: state.dataAgeMs,
      lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
      lastError: state.lastError,
      // After a failed cleanup the account stays targetable: "disconnect" can be tried again.
      canRetryCleanup: state.cleanupPending === true,
      refreshSuggested,
      // Anything but a live validated session may open the provider login screen.
      requiresInteraction: !state.connected,
      changes: state.changes,
    });
  }

  function emit() {
    const next = build();
    const signature = JSON.stringify(next);
    // Publish only real changes: this keeps getSnapshot referentially stable
    // and stops a mount effect from re-triggering itself in a render loop.
    if (signature === snapshotSignature) return;
    snapshotSignature = signature;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  }

  /**
   * Honest staleness. A refresh is suggested only when the policy itself says
   * the data is due, so data that was just updated is never called stale.
   */
  function suggestRefresh() {
    if (!engine) return false;
    const state = engine.state();
    if (!state.automatic) return false;
    return planMyCrewCareSync({
      now: now(),
      automatic: true,
      networkAvailable: isOnline(),
      foreground: isForeground(),
      reason: 'automatic',
      sessionState: state.status === 'connected' ? 'validated' : 'unknown',
      backgroundCapability: MYCREWCARE_BACKGROUND_CAPABILITY.NONE,
      lastSuccessAt: state.lastSuccessfulSyncAt,
    }).action === 'sync-now';
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Bind the active account/roster. A different account never sees the previous account's data. */
    async bind(context, stays = []) {
      if (!engine) return false;
      const accountId = context?.accountId ?? null;
      if (accountId !== boundAccount) refreshSuggested = false;
      boundAccount = accountId;
      engine.setContext(context, stays);
      const restored = await engine.restore();
      // A cached view is never proof of a live session; suggest, never auto-open.
      refreshSuggested = suggestRefresh();
      emit();
      return restored;
    },

    /** Explicit consent. Turning it on never opens the provider by itself. */
    setAutomatic(enabled) {
      if (!engine) return;
      engine.setAutomatic(enabled === true);
      refreshSuggested = suggestRefresh();
      emit();
    },

    /** The only path that reaches the adapter, and only from a user gesture in the foreground. */
    async refresh({ userInitiated = false } = {}) {
      if (!engine || busy) return false;
      if (userInitiated !== true) {
        refreshSuggested = engine.state().automatic;
        emit();
        return false;
      }
      const plan = planMyCrewCareSync({
        now: now(),
        automatic: engine.state().automatic,
        networkAvailable: isOnline(),
        foreground: isForeground(),
        reason: 'manual',
        sessionState: engine.state().status === 'reconnect-required' ? 'reconnect-required' : 'unknown',
        backgroundCapability: MYCREWCARE_BACKGROUND_CAPABILITY.NONE,
        lastSuccessAt: engine.state().lastSuccessfulSyncAt,
      });
      if (plan.action !== 'sync-now' && !(plan.action === 'reconnect' && plan.mayOpenInteractiveUi)) {
        emit();
        return false;
      }
      busy = true;
      emit();
      try {
        const ok = await engine.sync({ reason: 'manual' });
        if (ok) refreshSuggested = false;
        return ok;
      } finally {
        busy = false;
        emit();
      }
    },

    hotel: (stayId, options) => engine?.hotel(stayId, options) ?? null,
    pickup: (stayId, options) => engine?.pickup(stayId, options) ?? null,

    async disconnect({ forgetData = true } = {}) {
      if (!engine) return;
      try {
        await engine.disconnect({ forgetData });
      } finally {
        refreshSuggested = false;
        emit();
      }
    },

    async logout() {
      if (!engine) return;
      try {
        await engine.logout();
      } finally {
        boundAccount = null;
        refreshSuggested = false;
        emit();
      }
    },
  });
}
