import { advanceWeatherPulse, createWeatherPulseState, settleWeatherPulse, type WeatherPulseAssessment,
  type WeatherPulseIntent, type WeatherPulseResult, type WeatherPulseTicket } from '../../../shared/operational-weather-pulse.mjs';
import { weatherObservationSourceTime } from '../../../shared/weather-observation-source-time.mjs';
import { ALERT_REVIEW_EVENT } from './alertReviewStore';
import { projectOperationalWeatherNotices, type LegacyWeatherFacts } from './operationalWeatherNotices';
import type { OperationalWeatherSnapshot, WeatherContextReader } from './operationalWeatherContext';

export const WEATHER_PREFERENCE_EVENT = 'crewcheck:weather-preference-changed';
type ResponseLike = { ok: boolean; json(): Promise<unknown> };
export type WeatherControllerIO = {
  now(): number;
  fetch(url: string, options: { cache: 'no-store'; signal: AbortSignal }): Promise<ResponseLike>;
  set(callback: () => void, delay: number): unknown; clear(timer: unknown): void; enqueue(callback: () => void): void;
  events?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  project(intents: readonly WeatherPulseIntent[], snapshot: OperationalWeatherSnapshot | null,
    legacy: ReadonlyMap<string, LegacyWeatherFacts>, now: number, current: () => boolean): void;
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const normalized = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, ' ');
export function operationalWeatherReports(payload: unknown, ticket: WeatherPulseTicket) {
  const stations = record(record(payload).stations), reports: WeatherPulseAssessment[] = [], legacy = new Map<string, LegacyWeatherFacts>();
  for (const station of ticket.stations) {
    const item = record(stations[station]), monitoring = record(item.monitoring), severity = monitoring.severity;
    const raw = typeof item.metar === 'string' ? item.metar : '';
    const provider = record(item.provider).metar;
    const observedAt = weatherObservationSourceTime({ provider, source: record(record(item.observationTimeSource).metar), raw });
    if (item.icao !== station || observedAt === null || typeof severity !== 'number' || !Number.isInteger(severity) || severity < 0 || severity > 3) continue;
    reports.push({ severity, report: { station, raw, observedAt, provider, ok: record(item.available).metar === true, official: record(item.official).metar === true } });
    if (record(item.available).metar === true && record(item.official).metar === true) {
      const hazards = Array.isArray(monitoring.hazards) ? monitoring.hazards : [];
      const hazardText = hazards.map(value => { const h = record(value); return String(h.label || h.code || '').trim(); }).filter(Boolean).slice(0, 3).join(' · ');
      legacy.set(station, Object.freeze({ raw, taf: typeof item.taf === 'string' ? item.taf : '', hazardText, severity, observedAt }));
    }
  }
  return { reports, legacy };
}

/** Factory is injectable for offline tests. The exported singleton below owns
 * quota/tombstones across Home leases, but not across tabs or process restarts. */
export function createOperationalWeatherController(io: WeatherControllerIO) {
  let state = createWeatherPulseState(), nextLease = 0;
  let active: { id: number; read: WeatherContextReader } | null = null;
  let transport: { ticket: WeatherPulseTicket; abort: AbortController } | null = null;
  let timer: unknown = null, queued = false, ticking = false, authSuspended = false, choiceSuspended = false, listening = false;
  const legacy = new Map<string, LegacyWeatherFacts>();
  const safeRead = (reader: WeatherContextReader) => { try { return reader(); } catch { return null; } };
  const read = () => !active || authSuspended || choiceSuspended ? null : safeRead(active.read);
  const cancelTimer = () => { if (timer !== null) { io.clear(timer); timer = null; } };
  const project = (result: WeatherPulseResult, snapshot: OperationalWeatherSnapshot | null, now: number) => {
    const lease = active;
    try { io.project(result.activeIntents, snapshot, legacy, now, () => active === lease && read() === snapshot); } catch { /* Auxiliary projection cannot strand a terminal request. */ }
  };
  const apply = (result: WeatherPulseResult) => {
    if (result.state.contextKey !== state.contextKey) legacy.clear();
    state = result.state;
    if (state.pending?.revoked && transport?.ticket === state.pending.ticket) transport.abort.abort();
  };
  const enqueue = () => {
    if (queued) return;
    queued = true;
    io.enqueue(() => { queued = false; tick(); });
  };
  const schedule = (at: number | null, now: number) => {
    cancelTimer();
    if (!active || at === null || !Number.isSafeInteger(at) || at <= now) return;
    timer = io.set(() => { timer = null; tick(); }, Math.min(at - now, 2_147_483_647));
  };
  const revoke = () => {
    cancelTimer();
    const now = io.now(), result = advanceWeatherPulse(state, null, now);
    apply(result); legacy.clear();
    project(result, null, now);
  };
  const withdraw = () => {
    cancelTimer();
    // Settled same-context facts may be reconstructed on the next verified
    // lease. They are not admitted/published while detached. Pending requests
    // still require the pure revocation tombstone, which clears their facts.
    if (state.pending) { revoke(); return; }
    try { io.project([], null, legacy, io.now(), () => false); } catch { /* Auxiliary only. */ }
  };
  const launch = (ticket: WeatherPulseTicket) => {
    // A request intent revoked before fetch starts has already terminally ended
    // without I/O. Actual transports remain tombstoned until their finally below.
    if (!active || !read() || state.pending?.ticket !== ticket || state.pending.revoked) {
      apply(settleWeatherPulse(state, read()?.context, ticket, 'aborted-ack', null, io.now()));
      enqueue(); return;
    }
    if (transport) return;
    const running = { ticket, abort: new AbortController() }; transport = running;
    void (async () => {
      let outcome: 'success' | 'failure' | 'aborted-ack' = 'failure';
      let parsed: ReturnType<typeof operationalWeatherReports> | null = null;
      try {
        const response = await io.fetch(`/api/aviation-weather?airports=${encodeURIComponent(ticket.stations.join(','))}&type=all&view=decoded&v=1393`, { cache: 'no-store', signal: running.abort.signal });
        if (!response.ok || !read() || state.pending?.ticket !== ticket || state.pending.revoked) running.abort.abort();
        // Headers alone are not terminal body acknowledgement. Even a revoked
        // or HTTP-error response must finish/reject its body pipeline before
        // the slot is released; an abort-ignoring body remains tombstoned.
        const payload = await response.json();
        if (!response.ok) throw new Error('Weather response unavailable');
        if (!read() || state.pending?.ticket !== ticket || state.pending.revoked) { outcome = 'aborted-ack'; return; }
        parsed = operationalWeatherReports(payload, ticket); outcome = 'success';
      } catch { outcome = running.abort.signal.aborted ? 'aborted-ack' : 'failure'; }
      finally {
        const snapshot = read(), now = io.now();
        const admitted = state.pending?.ticket === ticket && !state.pending.revoked;
        // Never settle against an old captured state, nor release another ticket.
        const result = settleWeatherPulse(state, snapshot?.context, ticket, outcome, parsed?.reports, now);
        apply(result);
        if (admitted && outcome === 'success' && parsed && state.epoch === ticket.epoch && state.contextKey === ticket.contextKey) {
          for (const [station, facts] of parsed.legacy) {
            const accepted = state.observations.some(observation => observation.station === station && observation.observedAt === facts.observedAt
              && observation.raw === normalized(facts.raw) && observation.severity === facts.severity);
            const bound = state.selected.some(binding => binding.station === station && ticket.bindings.some(original => original.bindingKey === binding.bindingKey));
            if (accepted && bound) legacy.set(station, facts);
          }
        }
        for (const station of legacy.keys()) if (!state.observations.some(observation => observation.station === station)) legacy.delete(station);
        if (transport === running) transport = null;
        project(result, snapshot, now);
        // Settlement only releases the slot. Advance discovers any due request.
        enqueue();
      }
    })();
  };
  function tick() {
    if (!active) { cancelTimer(); return; }
    if (ticking) { enqueue(); return; }
    ticking = true;
    try {
      const snapshot = read(), now = io.now(), result = advanceWeatherPulse(state, snapshot?.context, now);
      apply(result); project(result, snapshot, now); schedule(result.nextWakeAt, now);
      if (result.request) launch(result.request);
    } finally { ticking = false; }
  }
  const onEvent = (event: Event) => {
    if (event.type === 'crewcheck:auth-will-change' || event.type === 'crewcheck:auth-expired') { authSuspended = true; revoke(); return; }
    if (event.type === 'crewcheck:roster-choice-start' || event.type === 'crewcheck:roster-cleared') { choiceSuspended = true; revoke(); return; }
    if (event.type === 'crewcheck:auth-changed') { authSuspended = false; revoke(); enqueue(); return; }
    if (event.type === 'crewcheck:roster-choice-finished') { choiceSuspended = false; enqueue(); return; }
    if (event.type === WEATHER_PREFERENCE_EVENT) {
      if ((event as CustomEvent<{ key?: string }>).detail?.key === 'crewcheck_weather_landing_alerts') return;
      tick(); return;
    }
    if (event.type === 'storage') {
      const key = (event as StorageEvent).key;
      if (!key || ['crewcheck_auth_token', 'crewcheck_auth_user'].includes(key) || key.startsWith('crewcheck_roster_choice_v1_')) {
        authSuspended = false; choiceSuspended = false; revoke(); enqueue(); return;
      }
      if (key === 'crewcheck_weather_landing_alerts') return;
      if (key === 'crewcheck_weather_hourly') { tick(); return; }
    }
    if (!active) return;
    if (!read()) revoke();
    enqueue();
  };
  const events = ['crewcheck:auth-will-change', 'crewcheck:auth-changed', 'crewcheck:auth-expired', 'crewcheck:roster-choice-start',
    'crewcheck:roster-choice-finished', 'crewcheck:roster-cleared', 'crewcheck:roster-updated', 'crewcheck:roster-history-updated',
    WEATHER_PREFERENCE_EVENT, 'crewcheck:notification-preferences-changed', ALERT_REVIEW_EVENT, 'storage', 'focus', 'pageshow', 'online', 'visibilitychange'];
  const listen = (enabled: boolean) => { for (const name of events) {
    if (enabled) io.events?.addEventListener(name, onEvent, true); else io.events?.removeEventListener(name, onEvent, true);
  } };
  return {
    attach(reader: WeatherContextReader) {
      if (active) withdraw();
      // One bounded process-lifetime listener set also observes completion of an
      // account transition while Home is detached. It never queries without a lease.
      if (!listening) { listen(true); listening = true; }
      const id = ++nextLease; active = { id, read: reader };
      // StrictMode's setup/cleanup/setup coalesces before the first request.
      enqueue();
      return {
        update(next: WeatherContextReader) {
          if (active?.id !== id) return;
          const previous = read();
          active.read = next;
          if (!authSuspended && safeRead(next)) choiceSuspended = false;
          const current = read();
          if (previous?.context.ownerId !== current?.context.ownerId || previous?.context.sourceId !== current?.context.sourceId
            || previous?.context.sourceRevision !== current?.context.sourceRevision) revoke();
          enqueue();
        },
        detach() {
          if (active?.id !== id) return;
          active = null; withdraw();
        },
      };
    },
  };
}
export const operationalWeatherController = createOperationalWeatherController({
  now: () => Date.now(), fetch: (url, options) => fetch(url, options),
  set: (callback, delay) => window.setTimeout(callback, delay), clear: timer => window.clearTimeout(timer as number),
  enqueue: callback => queueMicrotask(callback), events: typeof window === 'undefined' ? undefined : window,
  project: projectOperationalWeatherNotices,
});
