type CoordinatorOptions = {
  idleMs?: number;
  checkIntervalMs?: number;
};

const DEFAULT_IDLE_MS = 5 * 60_000;
const DEFAULT_CHECK_INTERVAL_MS = 15 * 60_000;

/**
 * Coordinates PWA updates without forcing reloads or interrupting active use.
 * A waiting worker is activated only when the document is hidden or the user
 * has been idle for the configured period. The browser controls when the new
 * worker takes over; this module never calls window.location.reload().
 */
export function installPwaUpdateCoordinator(options: CoordinatorOptions = {}): () => void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return () => undefined;

  const idleMs = Math.max(30_000, options.idleMs ?? DEFAULT_IDLE_MS);
  const checkIntervalMs = Math.max(60_000, options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS);
  let lastActivityAt = Date.now();
  let stopped = false;
  let intervalId: number | undefined;
  let registration: ServiceWorkerRegistration | null = null;

  const markActivity = () => { lastActivityAt = Date.now(); };
  const isSafeToActivate = () => document.visibilityState === 'hidden' || Date.now() - lastActivityAt >= idleMs;

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

  const onVisibilityChange = () => activateWaitingWorker();
  const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
  activityEvents.forEach((event) => window.addEventListener(event, markActivity, { passive: true }));
  document.addEventListener('visibilitychange', onVisibilityChange);

  navigator.serviceWorker.ready.then(inspectRegistration).catch(() => undefined);
  intervalId = window.setInterval(checkForUpdate, checkIntervalMs);

  return () => {
    stopped = true;
    if (intervalId !== undefined) window.clearInterval(intervalId);
    activityEvents.forEach((event) => window.removeEventListener(event, markActivity));
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
