type CoordinatorOptions = {
  idleMs?: number;
  checkIntervalMs?: number;
};

const DEFAULT_IDLE_MS = 5 * 60_000;
const DEFAULT_CHECK_INTERVAL_MS = 15 * 60_000;

/**
 * Coordinates PWA updates without disruptive reload loops or interrupting active use.
 * A waiting worker is activated only when the document is hidden or the user
 * has been idle for the configured period. After the new worker takes control,
 * the page reloads once at a safe boundary so an open CrewCheck does not remain
 * pinned to the previous shell indefinitely.
 */
export function installPwaUpdateCoordinator(options: CoordinatorOptions = {}): () => void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return () => undefined;

  const idleMs = Math.max(30_000, options.idleMs ?? DEFAULT_IDLE_MS);
  const checkIntervalMs = Math.max(60_000, options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS);
  let lastActivityAt = Date.now();
  let stopped = false;
  let intervalId: number | undefined;
  let registration: ServiceWorkerRegistration | null = null;
  let reloadPending = false;
  let reloadStarted = false;
  let controllerSeen = Boolean(navigator.serviceWorker.controller);
  const RELOAD_GUARD_KEY = 'crewcheck-sw-safe-reload-at';
  const RELOAD_GUARD_MS = 30_000;

  const markActivity = () => { lastActivityAt = Date.now(); };
  const isSafeToActivate = () => document.visibilityState === 'hidden' || Date.now() - lastActivityAt >= idleMs;

  const reloadForActivatedUpdate = () => {
    if (!reloadPending || reloadStarted || !isSafeToActivate()) return;
    try {
      const lastReloadAt = Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
      if (Number.isFinite(lastReloadAt) && Date.now() - lastReloadAt < RELOAD_GUARD_MS) {
        reloadPending = false;
        return;
      }
      window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    } catch {
      // sessionStorage failure must not block a safe update.
    }
    reloadStarted = true;
    window.location.reload();
  };

  const activateWaitingWorker = () => {
    if (!registration?.waiting || !isSafeToActivate()) return;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  const inspectRegistration = (next: ServiceWorkerRegistration) => {
    registration = next;
    activateWaitingWorker();
    next.addEventListener('updatefound', () => {
      const worker = next.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') activateWaitingWorker();
      });
    });
  };

  const checkForUpdate = async () => {
    if (stopped) return;
    try {
      const current = registration ?? await navigator.serviceWorker.ready;
      inspectRegistration(current);
      await current.update();
      activateWaitingWorker();
    } catch {
      // Offline, unsupported or transient update failures must not affect boot.
    }
  };

  const onVisibilityChange = () => {
    activateWaitingWorker();
    reloadForActivatedUpdate();
  };
  const onControllerChange = () => {
    // Ignore only the first controller acquired by a fresh install. Any later
    // replacement in the same session is a real update and must reach the UI.
    if (!controllerSeen) {
      controllerSeen = true;
      return;
    }
    reloadPending = true;
    reloadForActivatedUpdate();
  };
  const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
  activityEvents.forEach((event) => window.addEventListener(event, markActivity, { passive: true }));
  document.addEventListener('visibilitychange', onVisibilityChange);
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

  navigator.serviceWorker.ready.then(inspectRegistration).catch(() => undefined);
  intervalId = window.setInterval(() => {
    void checkForUpdate();
    reloadForActivatedUpdate();
  }, checkIntervalMs);

  return () => {
    stopped = true;
    if (intervalId !== undefined) window.clearInterval(intervalId);
    activityEvents.forEach((event) => window.removeEventListener(event, markActivity));
    document.removeEventListener('visibilitychange', onVisibilityChange);
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  };
}
