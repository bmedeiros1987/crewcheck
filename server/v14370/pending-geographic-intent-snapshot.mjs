import {
  consumePendingGeographicIntent,
  createPendingGeographicIntent,
  pendingGeographicIntentState,
} from '../v14369/pending-geographic-intent.mjs';

const PREFERENCE_KEY = 'pendingGeographicIntent';

function clonePreferences(snapshot = null) {
  const preferences = snapshot?.preferences;
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return {};
  return { ...preferences };
}

export function pendingGeographicIntentFromSnapshot(snapshot = null, scope = {}) {
  const record = snapshot?.preferences?.[PREFERENCE_KEY] ?? null;
  return pendingGeographicIntentState(record, scope);
}

export function withPendingGeographicIntent(snapshot = null, intent = '', options = {}) {
  const record = createPendingGeographicIntent(intent, options);
  if (!record) return null;
  return {
    ...snapshot,
    preferences: {
      ...clonePreferences(snapshot),
      [PREFERENCE_KEY]: record,
    },
  };
}

export function clearPendingGeographicIntent(snapshot = null) {
  const preferences = clonePreferences(snapshot);
  delete preferences[PREFERENCE_KEY];
  return {
    ...snapshot,
    preferences,
  };
}

export function consumePendingGeographicIntentFromSnapshot(snapshot = null, scope = {}) {
  const record = snapshot?.preferences?.[PREFERENCE_KEY] ?? null;
  const result = consumePendingGeographicIntent(record, scope);
  return {
    ...result,
    snapshot: result.consumed || result.status === 'expired' || result.status === 'invalid' || result.status === 'scope-missing'
      ? clearPendingGeographicIntent(snapshot)
      : snapshot,
  };
}

export const PENDING_GEOGRAPHIC_INTENT_PREFERENCE_KEY = PREFERENCE_KEY;
