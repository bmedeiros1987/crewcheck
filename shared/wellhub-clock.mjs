// Reevaluate local schedules at minute boundaries and immediately on resume.
// No network, GPS, preferences, or persistence access.
export function subscribeWellhubClock(onTick, windowTarget, documentTarget, clock = { now: () => Date.now(), setTimeout, clearTimeout }) {
  let timer, stopped = false;
  const tick = () => {
    if (stopped) return;
    clock.clearTimeout(timer);
    const now = clock.now();
    onTick(now);
    timer = clock.setTimeout(tick, 60000 - (now % 60000));
  };
  const resume = () => { if (documentTarget.visibilityState !== 'hidden') tick(); };
  windowTarget.addEventListener('focus', resume);
  documentTarget.addEventListener('visibilitychange', resume);
  tick();
  return () => { stopped = true; clock.clearTimeout(timer); windowTarget.removeEventListener('focus', resume); documentTarget.removeEventListener('visibilitychange', resume); };
}
