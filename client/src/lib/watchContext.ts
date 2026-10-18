import { airportTimeZone } from '../../../shared/airport-timezones.mjs';

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
  presentationSource?: string;
  departure?: string;
  arrival?: string;
  gate?: string;
  hotel?: string;
  subtitle?: string;
  title?: string;
  day?: { type?: string; pairingCode?: string };
  groundBeforeMinutes?: number | null;
  canonical?: {
    id?: string;
    legIndex?: number;
    showPresentation?: boolean;
    leg?: { departureTime?: string | null; presentationTime?: string | null };
    publishedDay?: {
      dutyReport?: string | null;
      legs?: { departureTime?: string | null }[];
    };
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

function clean(value: unknown): string {
  const text = String(value ?? '').trim();
  return text === '—' || /^a confirmar$/i.test(text) ? '' : text;
}

// Canonical roster clocks are explicitly published in BRT (canonicalRoster.dateAt).
// Never reinterpret them as the device's local wall clock or as airport local time.
const ROSTER_ZONE = 'America/Sao_Paulo';
const DAY_MS = 24 * HOUR_MS;
function instant(value?: string): number {
  return value && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
}
function clockMinutes(clock?: string): number | null {
  const m = String(clock || '').match(/^(\d{1,2}):(\d{2})$/);
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
}
// Canonical presentation/STD contain compatibility fallbacks. Read the retained
// source leg/day before accepting them as published clocks; never certify a fallback.
function sourceClock(value?: string | null): string {
  const match = String(value || '').match(/^(\d{1,2})[:hH](\d{2})(?:\(\+\d+\))?$/);
  if (!match) return '';
  const clock = `${match[1].padStart(2, '0')}:${match[2]}`;
  return clockMinutes(clock) == null ? '' : clock;
}
function publishedDeparture(event: WatchEventLike): string {
  return sourceClock(event.canonical?.leg?.departureTime);
}
function publishedPresentation(event: WatchEventLike): string {
  const value = sourceClock(event.presentation);
  if (!value || event.canonical?.showPresentation === false) return '';
  // A per-event manual entry is explicit evidence, unlike learned/default clocks.
  if (event.presentationSource === 'Manual desta programação') return value;
  const leg = event.canonical?.leg;
  if (!leg) {
    const report = sourceClock(event.canonical?.publishedDay?.dutyReport);
    return event.kind !== 'flight' && event.canonical?.kind !== 'rest' && report === value ? value : '';
  }
  const departure = sourceClock(leg.departureTime);
  const presentation = sourceClock(leg.presentationTime);
  if (presentation && presentation !== departure && value === presentation) return value;
  const day = event.canonical?.publishedDay;
  const report = sourceClock(day?.dutyReport);
  const firstDeparture = sourceClock(day?.legs?.[0]?.departureTime);
  return event.canonical?.legIndex === 0 && report && report !== firstDeparture && value === report ? value : '';
}
function clockBeforeOrAt(referenceMs: number, clock: string): number {
  const minute = clockMinutes(clock);
  if (minute == null || !Number.isFinite(referenceMs)) return NaN;
  const wall = new Date(referenceMs - 3 * HOUR_MS);
  let target = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), 3, minute);
  if (target > referenceMs) target -= DAY_MS;
  return target;
}
function clockLabel(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return '';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: ROSTER_ZONE, hour: '2-digit', minute: '2-digit' }).format(epochMs);
}
function dayLabel(epochMs: number): string {
  return Number.isFinite(epochMs) ? new Intl.DateTimeFormat('pt-BR', { timeZone: ROSTER_ZONE, day: '2-digit', month: '2-digit' }).format(epochMs) : '';
}
// Conservative subset: only airports resolved by the existing reviewed Brazilian map.
function provenDomestic(event: WatchEventLike): boolean {
  const brazil = new Set(['America/Sao_Paulo', 'America/Fortaleza', 'America/Recife', 'America/Bahia', 'America/Belem', 'America/Manaus', 'America/Cuiaba', 'America/Rio_Branco']);
  return !!event.origin && !!event.destination && event.origin !== event.destination
    && brazil.has(airportTimeZone(event.origin)) && brazil.has(airportTimeZone(event.destination));
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
): CrewCheckWatchSnapshot {
  const currentRest = events.find(candidate => (candidate.canonical?.kind || candidate.kind) === 'rest'
    && instant(candidate.canonical?.startDateTime) <= now && instant(candidate.canonical?.endDateTime) >= now);
  // Home intentionally selects operational events, so a rest-only day arrives
  // with noFutureLeg/placeholder. Rest evidence belongs to the full timeline.
  if ((!event || event.placeholder) && currentRest) event = currentRest;
  if (!event || event.placeholder) {
    return {
      schemaVersion: 1,
      contextId: 'off-duty',
      generatedAtEpochMs: now,
      validUntilEpochMs: now + HOUR_MS,
      state: 'UNKNOWN',
      headline: 'SEM PROGRAMAÇÃO',
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
      schedule: [],
    };
  }

  const canonical = event.canonical;
  const departure = publishedDeparture(event);
  const startMs = event.kind === 'flight' && !departure ? NaN : instant(canonical?.startDateTime);
  const endMs = instant(canonical?.endDateTime);
  const presentation = publishedPresentation(event);
  const presentationMs = presentation ? clockBeforeOrAt(startMs, presentation) : NaN;
  // At most three hours before APZ/STD: proposed conservative glance window.
  const focusStartMs = (Number.isFinite(presentationMs) ? presentationMs : startMs) - 3 * HOUR_MS;
  const restToday = Boolean(currentRest);
  const future = Number.isFinite(startMs) && (now < focusStartMs || (restToday && now < startMs));
  const expired = Number.isFinite(endMs) && now > endMs;
  const boardingMs = event.kind === 'flight' && departure && provenDomestic(event) ? startMs - 40 * 60_000 : NaN;

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
  const leaveMs = routeIsFresh && Number.isFinite(presentationMs)
    ? presentationMs - ((route?.durationMinutes || 0) + (route?.marginMinutes || 0)) * 60 * 1000
    : 0;

  let state: CrewCheckWatchState = 'UNKNOWN';
  if (future || expired) {
    state = restToday ? 'OFF_DUTY' : 'UNKNOWN';
  } else if (/^(?:rest|journey-rest)$/.test(canonical?.kind || event.kind)) {
    state = restToday ? 'OFF_DUTY' : 'UNKNOWN';
  } else if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    state = 'UNKNOWN';
  } else if (event.kind === 'stay') {
    state = 'OVERNIGHT';
  } else if (event.kind === 'flight') {
    const groundBefore = Number(canonical?.groundBeforeMinutes ?? event.groundBeforeMinutes ?? 0);
    const inConnectionWindow = groundBefore > 0
      && now < startMs
      && now >= startMs - groundBefore * 60 * 1000
      && canonical?.journeyBoundary == null;

    if (now >= startMs && now <= endMs) state = 'UNKNOWN'; // Schedule alone does not prove takeoff.
    else if (inConnectionWindow) state = 'CONNECTION';
    else if (leaveMs && now < presentationMs && now >= leaveMs - 90 * 60 * 1000) state = 'LEAVE_SOON';
    else if (Number.isFinite(presentationMs)) state = 'REPORTING';
    else state = 'UNKNOWN';
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
      : state === 'OVERNIGHT'
            ? 'PERNOITE'
            : state === 'OFF_DUTY' ? 'FOLGA' : state === 'UNKNOWN' ? 'PROGRAMAÇÃO' : 'APRESENTAÇÃO';

  const currentFlight = event.kind === 'flight' ? clean(event.flightNumber) : '';
  const currentRoute = event.kind === 'flight'
    ? [clean(event.origin), clean(event.destination)].filter(Boolean).join(' → ')
    : '';

  const schedule = events
    .filter((candidate) => !candidate.placeholder && ['flight', 'stay', 'duty'].includes(candidate.kind) && !['rest', 'journey-rest'].includes(candidate.canonical?.kind || ''))
    .filter((candidate) => {
      const start = candidate.canonical?.startDateTime
        ? instant(candidate.canonical.startDateTime)
        : Number.POSITIVE_INFINITY;
      const end = instant(candidate.canonical?.endDateTime);
      return Number.isFinite(start) && Number.isFinite(end) && end >= now;
    })
    .slice(0, 8)
    .map((candidate): CrewCheckWatchScheduleItem => {
      const start = candidate.canonical?.startDateTime
        ? instant(candidate.canonical.startDateTime)
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
        time: candidate.kind === 'flight' && !publishedDeparture(candidate) ? '' : clockLabel(start),
        title,
        route,
        presentation: publishedPresentation(candidate) && (candidate.kind !== 'flight' || publishedDeparture(candidate))
          ? `${dayLabel(clockBeforeOrAt(start, publishedPresentation(candidate)))} ${publishedPresentation(candidate)}`
          : '',
        gate: remote ? 'REMOTA' : rawGate,
        detail: [dayLabel(start), 'BRT', kind === 'stay' ? clean(candidate.hotel) : kind === 'flight' ? (publishedDeparture(candidate) ? 'Decolagem prevista' : 'Decolagem a confirmar') : ''].filter(Boolean).join(' • '),
      };
    });

  const inactive = future || expired || state === 'OFF_DUTY' || !Number.isFinite(startMs) || !Number.isFinite(endMs);
  const transitions = [focusStartMs, startMs, endMs, instant(currentRest?.canonical?.endDateTime), routeIsFresh ? route!.updatedAtEpochMs + 30 * 60_000 : NaN].filter(time => Number.isFinite(time) && time > now);
  return {
    schemaVersion: 1,
    contextId: clean(canonical?.id) || event.id,
    generatedAtEpochMs: now,
    validUntilEpochMs: Math.min(validWindow(now, endMs), ...transitions),
    state,
    headline,
    primaryTime: inactive ? '' : state === 'LEAVE_SOON' ? leaveTime : state === 'REPORTING' ? presentation : clockLabel(startMs),
    detail: event.kind === 'flight' && !departure ? 'Horário de decolagem a confirmar; confira a fonte.' : future ? `Próxima programação ${dayLabel(startMs)} ${clockLabel(startMs)} BRT` : expired ? 'Programação encerrada; sincronize a escala.' : state === 'OFF_DUTY' ? `Folga ${dayLabel(now)} BRT` : `Programação ${dayLabel(startMs)} BRT` + (Number.isFinite(boardingMs) ? ` • Embarque previsto ${dayLabel(boardingMs)} ${clockLabel(boardingMs)}` : ''),
    presentationTime: inactive ? '' : presentation,
    presentationPlace: [clean(event.origin), dayLabel(presentationMs), 'escala BRT'].filter(Boolean).join(' • '),
    leaveTime: inactive ? '' : leaveTime,
    trafficDetail: !inactive && routeIsFresh ? `${route?.durationMinutes || 0} min • deslocamento atual` : '',
    currentFlight: inactive ? '' : currentFlight,
    currentRoute: inactive ? '' : currentRoute,
    gate: inactive ? '' : gate,
    remoteStand: inactive ? false : remoteStand,
    boardingTime: inactive ? '' : clockLabel(boardingMs),
    eta: !inactive && event.kind === 'flight' && /^\d{1,2}:\d{2}$/.test(String(event.arrival || ''))
      ? String(event.arrival)
      : '',
    connection: remainingConnectionMinutes ? `${remainingConnectionMinutes} MIN` : '',
    nextFlight: future ? clean(event.flightNumber) : nextFlightEvent ? clean(nextFlightEvent.flightNumber) : '',
    nextDetail: future ? `${dayLabel(startMs)} ${clockLabel(startMs)} BRT` : nextFlightEvent
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
    schedule,
  };
}
