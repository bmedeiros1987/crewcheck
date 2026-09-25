import { getStoredUser } from '@/lib/authClient';

export type CrewCheckWatchState =
  | 'OFF_DUTY'
  | 'LEAVE_SOON'
  | 'REPORTING'
  | 'BOARDING'
  | 'IN_FLIGHT'
  | 'CONNECTION'
  | 'OVERNIGHT'
  | 'CHANGED'
  | 'UNKNOWN';

export type CrewCheckWatchScheduleItem = {
  id: string;
  kind: 'flight' | 'stay' | 'duty';
  time: string;
  title: string;
  route: string;
  presentation: string;
  gate: string;
  detail: string;
};

export type CrewCheckWatchSnapshot = {
  schemaVersion: 1;
  contextId: string;
  generatedAtEpochMs: number;
  validUntilEpochMs: number;
  state: CrewCheckWatchState;
  headline: string;
  primaryTime: string;
  detail: string;
  presentationTime: string;
  presentationPlace: string;
  leaveTime: string;
  trafficDetail: string;
  currentFlight: string;
  currentRoute: string;
  gate: string;
  remoteStand: boolean;
  boardingTime: string;
  eta: string;
  connection: string;
  nextFlight: string;
  nextDetail: string;
  overnight: string;
  hotelPickup: string;
  changed: boolean;
  source: 'canonical-roster';
  premiumAccess: boolean;
  schedule: CrewCheckWatchScheduleItem[];
};

export type WatchEventLike = {
  id: string;
  kind: string;
  placeholder?: boolean;
  origin?: string;
  destination?: string;
  flightNumber?: string;
  presentation?: string;
  departure?: string;
  arrival?: string;
  gate?: string;
  hotel?: string;
  subtitle?: string;
  groundBeforeMinutes?: number | null;
  canonical?: {
    id?: string;
    kind?: string;
    startDateTime?: string;
    endDateTime?: string;
    journeyId?: string;
    journeyBoundary?: string | null;
    groundBeforeMinutes?: number | null;
  };
};

export type WatchRouteContext = {
  eventId: string;
  updatedAtEpochMs: number;
  durationMinutes: number;
  marginMinutes: number;
};

const HOUR_MS = 60 * 60 * 1000;

/** Mobile-owned publishing cadence, transferred from #836 without changing snapshot semantics. */
export const WATCH_UNCHANGED_REPUBLISH_MS = 10 * 60 * 1000;

/** Timestamps are transport freshness, not a content change; entitlement remains part of content. */
export function watchSnapshotContentSignature(snapshot: CrewCheckWatchSnapshot): string {
  const { generatedAtEpochMs: _generated, validUntilEpochMs: _validUntil, ...content } = snapshot;
  return JSON.stringify(content);
}

function clean(value: unknown): string {
  const text = String(value ?? '').trim();
  return text === '—' || /^a confirmar$/i.test(text) ? '' : text;
}

function storedWatchPremiumAccess(): boolean {
  try {
    return Boolean(getStoredUser()?.premiumAccess);
  } catch {
    return false;
  }
}

function clockBeforeOrAt(referenceMs: number, clock: string): number {
  const match = String(clock || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match || !Number.isFinite(referenceMs)) return referenceMs;
  const target = new Date(referenceMs);
  target.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (target.getTime() > referenceMs + 3 * HOUR_MS) target.setDate(target.getDate() - 1);
  return target.getTime();
}

function clockLabel(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return '';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
    .format(new Date(epochMs));
}

function validWindow(now: number, eventEndMs: number): number {
  const maxFresh = now + 6 * HOUR_MS;
  const eventFresh = Number.isFinite(eventEndMs) ? eventEndMs + 30 * 60 * 1000 : now + 2 * HOUR_MS;
  return Math.max(now + 15 * 60 * 1000, Math.min(maxFresh, eventFresh));
}

export function buildCrewCheckWatchSnapshot(
  events: readonly WatchEventLike[],
  event: WatchEventLike,
  route: WatchRouteContext | null = null,
  now = Date.now(),
  premiumAccess = storedWatchPremiumAccess(),
): CrewCheckWatchSnapshot {
  if (!event || event.placeholder) {
    return {
      schemaVersion: 1,
      contextId: 'off-duty',
      generatedAtEpochMs: now,
      validUntilEpochMs: now + HOUR_MS,
      state: 'OFF_DUTY',
      headline: 'SEM ATIVIDADE',
      primaryTime: '',
      detail: 'Nenhuma programação operacional futura detectada.',
      presentationTime: '',
      presentationPlace: '',
      leaveTime: '',
      trafficDetail: '',
      currentFlight: '',
      currentRoute: '',
      gate: '',
      remoteStand: false,
      boardingTime: '',
      eta: '',
      connection: '',
      nextFlight: '',
      nextDetail: '',
      overnight: '',
      hotelPickup: '',
      changed: false,
      source: 'canonical-roster',
      premiumAccess,
      schedule: [],
    };
  }

  const canonical = event.canonical;
  const startMs = canonical?.startDateTime
    ? new Date(canonical.startDateTime).getTime()
    : now + HOUR_MS;
  const endMs = canonical?.endDateTime
    ? new Date(canonical.endDateTime).getTime()
    : startMs + 2 * HOUR_MS;

  const presentation = /^\d{1,2}:\d{2}$/.test(String(event.presentation || ''))
    ? String(event.presentation)
    : '';
  const presentationMs = presentation ? clockBeforeOrAt(startMs, presentation) : startMs;

  const rawGate = clean(event.gate);
  const remoteStand = /\b(REMOTA|REMOTO|REMOTE|PATIO|PÁTIO)\b/i.test(rawGate);
  const gate = remoteStand ? '' : rawGate;

  const routeIsFresh = Boolean(
    route
      && route.eventId === event.id
      && route.durationMinutes > 0
      && route.marginMinutes >= 0
      && now - route.updatedAtEpochMs >= 0
      && now - route.updatedAtEpochMs <= 30 * 60 * 1000,
  );
  const leaveMs = routeIsFresh && presentationMs
    ? presentationMs - ((route?.durationMinutes || 0) + (route?.marginMinutes || 0)) * 60 * 1000
    : 0;

  let state: CrewCheckWatchState = 'UNKNOWN';
  if (event.kind === 'stay') {
    state = 'OVERNIGHT';
  } else if (event.kind === 'flight') {
    const groundBefore = Number(canonical?.groundBeforeMinutes ?? event.groundBeforeMinutes ?? 0);
    const inConnectionWindow = groundBefore > 0
      && now < startMs
      && now >= startMs - groundBefore * 60 * 1000
      && canonical?.journeyBoundary == null;

    if (now >= startMs && now <= endMs) state = 'IN_FLIGHT';
    else if (inConnectionWindow) state = 'CONNECTION';
    else if (leaveMs && now < presentationMs && now >= leaveMs - 90 * 60 * 1000) state = 'LEAVE_SOON';
    else if (now >= presentationMs && now < startMs) state = 'BOARDING';
    else state = 'REPORTING';
  } else {
    state = 'REPORTING';
  }

  const currentIndex = events.findIndex((candidate) => candidate.id === event.id);
  const journeyId = canonical?.journeyId || '';
  const laterEvents = currentIndex >= 0 ? events.slice(currentIndex + 1) : [];
  const nextFlightEvent = laterEvents.find((candidate) =>
    !candidate.placeholder
      && candidate.kind === 'flight'
      && (!journeyId || candidate.canonical?.journeyId === journeyId)
  );
  const nextStay = laterEvents.find((candidate) => !candidate.placeholder && candidate.kind === 'stay');

  const remainingConnectionMinutes = state === 'CONNECTION'
    ? Math.max(0, Math.round((startMs - now) / 60_000))
    : 0;
  const leaveTime = leaveMs ? clockLabel(leaveMs) : '';
  const leaveMinutes = leaveMs ? Math.max(0, Math.round((leaveMs - now) / 60_000)) : 0;

  const headline = state === 'LEAVE_SOON'
    ? (leaveMinutes > 0 ? `SAIR EM ${leaveMinutes} MIN` : 'HORA DE SAIR')
    : state === 'CONNECTION'
      ? 'CONEXÃO'
      : state === 'IN_FLIGHT'
        ? 'VOO EM ANDAMENTO'
        : state === 'BOARDING'
          ? (remoteStand ? 'EMBARQUE REMOTO' : 'EMBARQUE')
          : state === 'OVERNIGHT'
            ? 'PERNOITE'
            : 'APRESENTAÇÃO';

  const currentFlight = event.kind === 'flight' ? clean(event.flightNumber) : '';
  const currentRoute = event.kind === 'flight'
    ? [clean(event.origin), clean(event.destination)].filter(Boolean).join(' → ')
    : '';

  const schedule = events
    .filter((candidate) => !candidate.placeholder && ['flight', 'stay', 'duty'].includes(candidate.kind))
    .filter((candidate) => {
      const start = candidate.canonical?.startDateTime
        ? new Date(candidate.canonical.startDateTime).getTime()
        : Number.POSITIVE_INFINITY;
      return !Number.isFinite(start) || start >= now - 2 * HOUR_MS;
    })
    .slice(0, 8)
    .map((candidate): CrewCheckWatchScheduleItem => {
      const start = candidate.canonical?.startDateTime
        ? new Date(candidate.canonical.startDateTime).getTime()
        : 0;
      const kind: CrewCheckWatchScheduleItem['kind'] =
        candidate.kind === 'flight' || candidate.kind === 'stay' ? candidate.kind : 'duty';
      const title = kind === 'flight'
        ? clean(candidate.flightNumber) || 'Voo'
        : kind === 'stay'
          ? 'Pernoite'
          : clean(candidate.flightNumber) || 'Programação';
      const route = kind === 'flight'
        ? [clean(candidate.origin), clean(candidate.destination)].filter(Boolean).join(' → ')
        : clean(candidate.destination) || clean(candidate.origin);
      const rawGate = clean(candidate.gate);
      const remote = /\b(REMOTA|REMOTO|REMOTE|PATIO|PÁTIO)\b/i.test(rawGate);
      return {
        id: clean(candidate.canonical?.id) || candidate.id,
        kind,
        time: clockLabel(start),
        title,
        route,
        presentation: /^\d{1,2}:\d{2}$/.test(String(candidate.presentation || ''))
          ? String(candidate.presentation)
          : '',
        gate: remote ? 'REMOTA' : rawGate,
        detail: kind === 'stay' ? clean(candidate.hotel) : clean(candidate.subtitle),
      };
    });

  return {
    schemaVersion: 1,
    contextId: clean(canonical?.id) || event.id,
    generatedAtEpochMs: now,
    validUntilEpochMs: validWindow(now, endMs),
    state,
    headline,
    primaryTime: state === 'LEAVE_SOON' ? leaveTime : presentation,
    detail: state === 'IN_FLIGHT' ? clean(event.subtitle) : state === 'OVERNIGHT' ? clean(event.hotel) : '',
    presentationTime: presentation,
    presentationPlace: clean(event.origin),
    leaveTime,
    trafficDetail: routeIsFresh ? `${route?.durationMinutes || 0} min • deslocamento atual` : '',
    currentFlight,
    currentRoute,
    gate,
    remoteStand,
    boardingTime: '',
    eta: event.kind === 'flight' && /^\d{1,2}:\d{2}$/.test(String(event.arrival || ''))
      ? String(event.arrival)
      : '',
    connection: remainingConnectionMinutes ? `${remainingConnectionMinutes} MIN` : '',
    nextFlight: nextFlightEvent ? clean(nextFlightEvent.flightNumber) : '',
    nextDetail: nextFlightEvent
      ? [
          clean(nextFlightEvent.origin) && clean(nextFlightEvent.destination)
            ? `${clean(nextFlightEvent.origin)} → ${clean(nextFlightEvent.destination)}`
            : '',
          clean(nextFlightEvent.gate),
        ].filter(Boolean).join(' • ')
      : '',
    overnight: state === 'OVERNIGHT'
      ? clean(event.hotel) || clean(event.destination) || clean(event.origin)
      : nextStay
        ? clean(nextStay.hotel) || clean(nextStay.destination) || clean(nextStay.origin)
        : '',
    hotelPickup: '',
    changed: false,
    source: 'canonical-roster',
    premiumAccess,
    schedule,
  };
}
