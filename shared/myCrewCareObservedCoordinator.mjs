import { observeMyCrewCareCards, observeMyCrewCareProfile, observeMyCrewCareReservation } from './myCrewCareObservedContract.mjs';

export const MYCREWCARE_OBSERVED_COORDINATOR_RELEASE_ENABLED = false;
const failure = () => Object.assign(new Error('observed-acquisition-unverified'), { code: 'observed-acquisition-unverified' });
const identifier = value => typeof value === 'string' && value.trim().length > 0;
function abortable(operation, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(failure());
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(operation).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}

/** OFF-only coordinator with an injected trusted same-session acquisition boundary.
 * No provider navigation, native connection or operational import is implemented here.
 */
export function createMyCrewCareObservedCoordinator({ acquire, clock = Date.now } = {}) {
  let binding = null;
  let generation = 0;
  let pending = null;
  let latest = null;
  function invalidate(nextBinding = binding) {
    const token = ++generation;
    const previous = pending;
    pending = null;
    latest = null;
    binding = nextBinding;
    // Abort invokes arbitrary synchronous listeners. Complete this transition
    // first, and never overwrite a newer reentrant transition afterwards.
    previous?.abort();
    return token;
  }
  return Object.freeze({
    bind(value) {
      const valid = value && identifier(value.accountId) && identifier(value.sessionId)
        && identifier(value.employeeId) && /^\d+$/.test(value.employeeId) && identifier(value.username);
      // Captured copies, never caller-owned mutable scope or hardcoded identity.
      const next = valid ? Object.freeze({ accountId: value.accountId, sessionId: value.sessionId,
        employeeId: value.employeeId, username: value.username }) : null;
      invalidate(next);
      return Boolean(valid);
    },
    cancel() { invalidate(); },
    disconnect() { invalidate(null); },
    observation() { return latest; },
    async read() {
      const token = invalidate();
      if (token !== generation || !binding || typeof acquire !== 'function') return null;
      const captured = binding;
      const abort = new AbortController();
      pending = abort;
      const scope = Object.freeze({ ...captured, requestId: `observed-${globalThis.crypto.randomUUID()}:${token}`, generation: token });
      const live = () => token === generation && binding === captured && !abort.signal.aborted;
      async function page(kind, card = null) {
        if (!live()) throw failure();
        const result = await abortable(acquire(Object.freeze({ kind, scope, card, signal: abort.signal })), abort.signal);
        if (!live() || !result?.document || result.accountId !== scope.accountId
          || result.sessionId !== scope.sessionId || result.requestId !== scope.requestId) throw failure();
        // Own a DOM snapshot; later caller mutations cannot change this generation.
        return Object.freeze({ document: result.document.cloneNode(true), url: result.url });
      }
      function identity(result) {
        const profile = observeMyCrewCareProfile(result.document, result.url);
        if (profile.employeeId !== scope.employeeId || profile.username !== scope.username) throw failure();
        return Object.freeze({ ...profile, accountId: scope.accountId, sessionId: scope.sessionId, requestId: scope.requestId });
      }
      try {
        const before = identity(await page('profile-before'));
        const travel = await page('cards');
        const cards = observeMyCrewCareCards(travel.document, travel.url);
        const details = [];
        for (const card of cards) details.push(Object.freeze({ card, page: await page('detail', card) }));
        const after = identity(await page('profile-after'));
        if (!live()) throw failure();
        const reservations = details.map(({ card, page: detail }) => observeMyCrewCareReservation({
          document: detail.document, pageUrl: detail.url, card,
          binding: Object.freeze({ ...scope, fresh: true }), profileBefore: before, profileAfter: after,
        }));
        // Stamp completion time and session from this generation, never from page content.
        const completedAt = clock();
        if (!live() || !Number.isFinite(completedAt)) throw failure();
        latest = Object.freeze({ accountId: scope.accountId, sessionId: scope.sessionId, requestId: scope.requestId,
          observedAt: new Date(completedAt).toISOString(),
          operationalImportAllowed: false, reservations: Object.freeze(reservations) });
        return latest;
      } catch {
        // Stale requests cannot clear or replace a newer observation.
        if (live()) latest = null;
        return null;
      } finally {
        if (pending === abort) pending = null;
      }
    },
  });
}
