export type CrewContextTarget =
  | 'cockpit'
  | 'roster'
  | 'departure'
  | 'radar'
  | 'weather'
  | 'perdiem'
  | 'salary'
  | 'regulation'
  | 'wakeup'
  | 'hotels'
  | 'presentation'
  | 'routine'
  | 'map';

export type CrewContextSnapshot = {
  eventId?: string;
  date?: string;
  kind?: string;
  origin?: string;
  destination?: string;
  flightNumber?: string;
  sourceView?: string;
  target: CrewContextTarget;
  createdAt: string;
};

export const CREW_CONTEXT_STORAGE_KEY = 'crewcheck_context_navigation_v1';

function clean(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, 180) : undefined;
}

export function rememberCrewContext(input: Omit<CrewContextSnapshot, 'createdAt'>): CrewContextSnapshot {
  const snapshot: CrewContextSnapshot = {
    eventId: clean(input.eventId),
    date: clean(input.date),
    kind: clean(input.kind),
    origin: clean(input.origin)?.toUpperCase(),
    destination: clean(input.destination)?.toUpperCase(),
    flightNumber: clean(input.flightNumber)?.toUpperCase(),
    sourceView: clean(input.sourceView),
    target: input.target,
    createdAt: new Date().toISOString(),
  };
  if (typeof window !== 'undefined') {
    try { window.sessionStorage.setItem(CREW_CONTEXT_STORAGE_KEY, JSON.stringify(snapshot)); } catch {}
  }
  return snapshot;
}

export function loadCrewContext(maxAgeMs = 12 * 60 * 60 * 1000): CrewContextSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(CREW_CONTEXT_STORAGE_KEY) || 'null') as CrewContextSnapshot | null;
    if (!parsed?.target || !parsed.createdAt) return null;
    const age = Date.now() - new Date(parsed.createdAt).getTime();
    if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearCrewContext(): void {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(CREW_CONTEXT_STORAGE_KEY); } catch {}
}

export function buildCrewCheckDeepLink(target: CrewContextTarget, context?: CrewContextSnapshot | null): string {
  if (typeof window === 'undefined') return `/app?view=${encodeURIComponent(target)}`;
  const url = new URL(window.location.href);
  if (!['/', '/app', '/home', '/result', '/results'].includes(url.pathname)) url.pathname = '/app';
  url.searchParams.set('view', target);
  if (context?.eventId) url.searchParams.set('ctx', context.eventId);
  else url.searchParams.delete('ctx');
  return `${url.pathname}${url.search}${url.hash}`;
}
