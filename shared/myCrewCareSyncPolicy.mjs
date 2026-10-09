/**
 * Side-effect-free scheduling policy for MyCrewCare synchronization.
 *
 * The policy never opens a WebView by itself. Background execution is allowed only
 * when the caller declares an authorized non-interactive transport capability.
 */
export const MYCREWCARE_BACKGROUND_CAPABILITY = Object.freeze({
  NONE: 'none',
  INTERACTIVE_WEBVIEW: 'interactive-webview',
  AUTHORIZED_HTTP: 'authorized-http',
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const BACKOFF = Object.freeze([5 * MINUTE, 15 * MINUTE, HOUR, 4 * HOUR, 12 * HOUR]);

function epoch(value) {
  if (value == null || value === '') return null;
  const result = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function freshnessInterval(now, nextStayAt, nextPickupAt) {
  const pickup = epoch(nextPickupAt);
  const stay = epoch(nextStayAt);
  if (pickup !== null && pickup >= now && pickup - now <= 6 * HOUR) return HOUR;
  if (stay !== null && stay >= now && stay - now <= 12 * HOUR) return 2 * HOUR;
  if (stay !== null && stay >= now && stay - now <= 48 * HOUR) return 4 * HOUR;
  if (stay !== null && stay >= now && stay - now <= 7 * DAY) return 12 * HOUR;
  return DAY;
}

function retryDelay(retryCount, retryAfterAt, now) {
  const retryAt = epoch(retryAfterAt);
  if (retryAt !== null && retryAt > now) return retryAt - now;
  const index = Math.max(0, Math.min(BACKOFF.length - 1, Number.isInteger(retryCount) ? retryCount : 0));
  return BACKOFF[index];
}

/**
 * @returns a frozen plan with one of: idle, reconnect, wait-network, sync-now,
 * background-sync, or defer-to-foreground.
 */
export function planMyCrewCareSync(input = {}) {
  const now = epoch(input.now) ?? Date.now();
  const automatic = input.automatic === true;
  const networkAvailable = input.networkAvailable !== false;
  const foreground = input.foreground === true;
  const manual = input.reason === 'manual';
  const rosterChanged = input.reason === 'roster-changed';
  const justConnected = input.reason === 'connected';
  const sessionState = String(input.sessionState || 'unknown');
  const backgroundCapability = input.backgroundCapability || MYCREWCARE_BACKGROUND_CAPABILITY.NONE;
  const lastSuccessAt = epoch(input.lastSuccessAt);
  const lastAttemptAt = epoch(input.lastAttemptAt);
  const retryCount = Number.isInteger(input.retryCount) && input.retryCount >= 0 ? input.retryCount : 0;
  const intervalMs = freshnessInterval(now, input.nextStayAt, input.nextPickupAt);
  const dueAt = lastSuccessAt === null ? now : lastSuccessAt + intervalMs;

  const plan = (action, reason, extra = {}) => Object.freeze({
    action,
    reason,
    dueAt: extra.dueAt ?? dueAt,
    intervalMs,
    mayOpenInteractiveUi: extra.mayOpenInteractiveUi === true,
    backgroundEligible: backgroundCapability === MYCREWCARE_BACKGROUND_CAPABILITY.AUTHORIZED_HTTP,
  });

  if (!automatic) return plan('idle', 'automatic-disabled');
  if (sessionState === 'expired' || sessionState === 'reconnect-required' || sessionState === 'identity-mismatch') {
    return plan('reconnect', sessionState, { mayOpenInteractiveUi: foreground });
  }
  if (!networkAvailable) return plan('wait-network', 'offline', { dueAt: now });

  if (input.lastFailure === 'rate-limited') {
    const retryAfter = epoch(input.retryAfterAt);
    const retryAt = retryAfter !== null && retryAfter > now
      ? retryAfter
      : (lastAttemptAt ?? now) + retryDelay(retryCount, null, now);
    if (now < retryAt) return plan('idle', 'rate-limited', { dueAt: retryAt });
  }

  const failureDelay = input.lastFailure && input.lastFailure !== 'none'
    ? retryDelay(retryCount, input.retryAfterAt, now)
    : 0;
  const failureGate = lastAttemptAt === null ? now : lastAttemptAt + failureDelay;
  const forced = manual || rosterChanged || justConnected;
  const isDue = forced || now >= dueAt;

  if (!isDue) return plan('idle', 'fresh-enough');
  if (now < failureGate && !manual) return plan('idle', 'backoff', { dueAt: failureGate });

  if (foreground) {
    return plan('sync-now', forced ? input.reason : 'stale', { mayOpenInteractiveUi: manual || sessionState !== 'validated' });
  }
  if (backgroundCapability === MYCREWCARE_BACKGROUND_CAPABILITY.AUTHORIZED_HTTP && sessionState === 'validated') {
    return plan('background-sync', forced ? input.reason : 'stale');
  }
  return plan('defer-to-foreground', backgroundCapability === MYCREWCARE_BACKGROUND_CAPABILITY.INTERACTIVE_WEBVIEW
    ? 'interactive-session-required'
    : 'background-transport-unavailable');
}
