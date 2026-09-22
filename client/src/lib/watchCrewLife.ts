type LifeConsent = {
  active?: boolean;
  policyVersion?: string;
};

type NativeSummary = {
  ok?: boolean;
  sleepMinutes?: number | null;
  steps?: number | null;
  activityMinutes?: number | null;
  restingHeartRateAverage?: number | null;
};

type ManualSummary = {
  sleepHours?: number;
  steps?: number;
  activityMinutes?: number;
};

const CONSENT_KEY = 'crewcheck:life:consent:v1';
const NATIVE_KEY = 'crewcheck:life:health-summary:v1';
const MANUAL_KEY = 'crewcheck:life:manual:v1';
const PUBLISHED_MARKER = 'crewcheck:watch:crewlife-published:v1';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function positiveInt(value: unknown, max: number): number | null {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
}

function sleepLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function nativeBridge(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).CrewCheckNative || null;
}

export function buildCrewLifeWatchSnapshot(now = Date.now()): Record<string, unknown> | null {
  const consent = readJson<LifeConsent>(CONSENT_KEY);
  if (!consent?.active || consent.policyVersion !== '1.0') return null;

  const native = readJson<NativeSummary>(NATIVE_KEY);
  const manual = readJson<ManualSummary>(MANUAL_KEY);

  const sleepMinutes =
    positiveInt(native?.sleepMinutes, 1440)
    ?? (() => {
      const hours = Number(manual?.sleepHours);
      return Number.isFinite(hours) && hours > 0 && hours <= 24 ? Math.round(hours * 60) : null;
    })();
  const steps = positiveInt(native?.steps, 200_000) ?? positiveInt(manual?.steps, 200_000);
  const activeMinutes =
    positiveInt(native?.activityMinutes, 1440) ?? positiveInt(manual?.activityMinutes, 1440);
  const restingHeartRate = positiveInt(native?.restingHeartRateAverage, 220);

  const snapshot: Record<string, unknown> = {
    schemaVersion: 1,
    consentVersion: '1.0',
    consentAccepted: true,
    generatedAtEpochMs: now,
    validUntilEpochMs: now + 6 * 60 * 60 * 1000,
  };

  if (sleepMinutes != null) {
    snapshot.sleepMinutes = sleepMinutes;
    snapshot.sleepLabel = sleepLabel(sleepMinutes);
  }
  if (steps != null) snapshot.steps = steps;
  if (activeMinutes != null) snapshot.activeMinutes = activeMinutes;
  if (restingHeartRate != null) snapshot.restingHeartRate = restingHeartRate;

  return Object.keys(snapshot).length > 5 ? snapshot : null;
}

export function publishCrewLifeWatchSnapshot(): boolean {
  const bridge = nativeBridge();
  if (!bridge || typeof bridge.syncCrewLifeSnapshot !== 'function') return false;

  const snapshot = buildCrewLifeWatchSnapshot();
  if (!snapshot) {
    try {
      const consent = readJson<LifeConsent>(CONSENT_KEY);
      const previouslyPublished = localStorage.getItem(PUBLISHED_MARKER) === '1';
      if ((!consent?.active || consent.policyVersion !== '1.0') && previouslyPublished
          && typeof bridge.revokeCrewLifeWatch === 'function') {
        bridge.revokeCrewLifeWatch();
        localStorage.removeItem(PUBLISHED_MARKER);
      }
    } catch {}
    return false;
  }

  try {
    const accepted = bridge.syncCrewLifeSnapshot(snapshot);
    if (accepted !== false) localStorage.setItem(PUBLISHED_MARKER, '1');
    return accepted !== false;
  } catch {
    return false;
  }
}

export function revokeCrewLifeWatchSnapshot(): void {
  try {
    const bridge = nativeBridge();
    if (bridge && typeof bridge.revokeCrewLifeWatch === 'function') bridge.revokeCrewLifeWatch();
    localStorage.removeItem(PUBLISHED_MARKER);
  } catch {}
}
