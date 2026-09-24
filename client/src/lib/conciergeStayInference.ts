export type ConciergeRosterEvent = {
  id: string;
  kind?: string;
  title?: string;
  date?: Date | string;
  origin?: string;
  destination?: string;
  hotel?: string;
  presentation?: string;
  canonical?: {
    kind?: string;
    date?: string;
    startDateTime?: string;
    endDateTime?: string;
    showPresentation?: boolean;
  };
};

export type ConciergeKnownStay = {
  id?: string;
  stayDate?: string;
  hotelName?: string;
  airport?: string;
  room?: string;
  presentationTime?: string;
  updatedAt?: string;
};

export type ConciergeHotelCatalogEntry = {
  name: string;
  airport?: string;
  alternateAirport?: string;
};

export type ConciergeHotelSource = 'saved' | 'roster' | 'history-unique' | 'catalog-unique' | 'unknown';

export type ConciergeStaySuggestion = {
  eventId: string;
  stayDate: string;
  airport: string;
  startDateTime: string | null;
  endDateTime: string | null;
  hotelName: string;
  hotelSource: ConciergeHotelSource;
  presentationTime: string;
  nextEventId: string | null;
};

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function airport(value: unknown): string {
  return text(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function normalizeHotel(value: unknown): string {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeDay(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = text(value);
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${String(Number(br[2])).padStart(2, '0')}-${String(Number(br[1])).padStart(2, '0')}`;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
}

function time(value: unknown): string {
  const match = text(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function eventStart(event: ConciergeRosterEvent): number {
  const value = event.canonical?.startDateTime || event.date || '';
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function eventEnd(event: ConciergeRosterEvent): number {
  const value = event.canonical?.endDateTime || event.canonical?.startDateTime || event.date || '';
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : eventStart(event);
}

function stayDay(event: ConciergeRosterEvent): string {
  return normalizeDay(event.canonical?.date) || normalizeDay(event.date) || normalizeDay(event.canonical?.startDateTime);
}

function isCanonicalStay(event: ConciergeRosterEvent): boolean {
  return event.kind === 'stay' || event.canonical?.kind === 'stay';
}

function nextOperationalEvent(
  events: ConciergeRosterEvent[],
  stay: ConciergeRosterEvent,
  stayAirport: string,
): ConciergeRosterEvent | null {
  const end = eventEnd(stay);
  return events
    .filter((item) => item.id !== stay.id && ['flight', 'duty'].includes(String(item.kind || item.canonical?.kind || '')))
    .filter((item) => eventStart(item) >= end - 60_000)
    .filter((item) => !stayAirport || airport(item.origin) === stayAirport)
    .sort((a, b) => eventStart(a) - eventStart(b))[0] || null;
}

function latestByDate<T extends ConciergeKnownStay>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const day = normalizeDay(b.stayDate).localeCompare(normalizeDay(a.stayDate));
    if (day) return day;
    return text(b.updatedAt).localeCompare(text(a.updatedAt));
  });
}

function resolveSavedStay(
  day: string,
  stayAirport: string,
  eventId: string,
  stays: ConciergeKnownStay[],
): ConciergeKnownStay | undefined {
  const sameDay = latestByDate(stays.filter((item) => normalizeDay(item.stayDate) === day));
  if (!sameDay.length) return undefined;

  const exactEvent = sameDay.find((item) => {
    if (!eventId || text(item.id) !== eventId) return false;
    const savedAirport = airport(item.airport);
    return !stayAirport || !savedAirport || savedAirport === stayAirport;
  });
  if (exactEvent) return exactEvent;

  if (stayAirport) {
    const sameAirport = sameDay.filter((item) => airport(item.airport) === stayAirport);
    return sameAirport.length === 1 ? sameAirport[0] : undefined;
  }

  return sameDay.length === 1 ? sameDay[0] : undefined;
}

function resolveHotel(
  day: string,
  stayAirport: string,
  eventId: string,
  rosterHotel: string,
  stays: ConciergeKnownStay[],
  catalog: ConciergeHotelCatalogEntry[],
): { hotelName: string; hotelSource: ConciergeHotelSource } {
  const savedForStay = resolveSavedStay(day, stayAirport, eventId, stays);
  if (savedForStay?.hotelName) return { hotelName: text(savedForStay.hotelName), hotelSource: 'saved' };

  if (rosterHotel) return { hotelName: rosterHotel, hotelSource: 'roster' };

  if (stayAirport) {
    const prior = latestByDate(stays.filter((item) => normalizeDay(item.stayDate) !== day && airport(item.airport) === stayAirport && text(item.hotelName)));
    const uniqueHistory = new Map<string, string>();
    for (const item of prior) {
      const key = normalizeHotel(item.hotelName);
      if (key && !uniqueHistory.has(key)) uniqueHistory.set(key, text(item.hotelName));
    }
    if (uniqueHistory.size === 1) return { hotelName: [...uniqueHistory.values()][0], hotelSource: 'history-unique' };

    const exactCatalog = catalog.filter((item) => [airport(item.airport), airport(item.alternateAirport)].includes(stayAirport));
    const uniqueCatalog = new Map<string, string>();
    for (const item of exactCatalog) {
      const key = normalizeHotel(item.name);
      if (key && !uniqueCatalog.has(key)) uniqueCatalog.set(key, text(item.name));
    }
    if (uniqueCatalog.size === 1) return { hotelName: [...uniqueCatalog.values()][0], hotelSource: 'catalog-unique' };
  }

  return { hotelName: '', hotelSource: 'unknown' };
}

export function buildConciergeStaySuggestions(
  events: ConciergeRosterEvent[],
  stays: ConciergeKnownStay[],
  catalog: ConciergeHotelCatalogEntry[],
): ConciergeStaySuggestion[] {
  const sorted = [...(Array.isArray(events) ? events : [])].sort((a, b) => eventStart(a) - eventStart(b));
  const knownStays = Array.isArray(stays) ? stays : [];
  const hotels = Array.isArray(catalog) ? catalog : [];

  return sorted.filter(isCanonicalStay).map((event) => {
    const day = stayDay(event);
    const stayAirport = airport(event.destination || event.origin);
    const next = nextOperationalEvent(sorted, event, stayAirport);
    const resolved = resolveHotel(day, stayAirport, event.id, text(event.hotel), knownStays, hotels);
    const saved = resolveSavedStay(day, stayAirport, event.id, knownStays);
    return {
      eventId: event.id,
      stayDate: day,
      airport: airport(saved?.airport) || stayAirport,
      startDateTime: Number.isFinite(eventStart(event)) ? new Date(eventStart(event)).toISOString() : null,
      endDateTime: Number.isFinite(eventEnd(event)) ? new Date(eventEnd(event)).toISOString() : null,
      hotelName: resolved.hotelName,
      hotelSource: resolved.hotelSource,
      presentationTime: time(saved?.presentationTime) || time(next?.presentation),
      nextEventId: next?.id || null,
    };
  }).filter((item) => Boolean(item.stayDate));
}

export function selectConciergeStayFocus(
  suggestions: ConciergeStaySuggestion[],
  now: Date | number = Date.now(),
): ConciergeStaySuggestion | null {
  const clock = now instanceof Date ? now.getTime() : Number(now);
  const sorted = [...(Array.isArray(suggestions) ? suggestions : [])].sort((a, b) => {
    const left = Date.parse(a.startDateTime || `${a.stayDate}T00:00:00Z`);
    const right = Date.parse(b.startDateTime || `${b.stayDate}T00:00:00Z`);
    return left - right;
  });
  if (!sorted.length) return null;

  const active = sorted.find((item) => {
    const start = Date.parse(item.startDateTime || `${item.stayDate}T00:00:00Z`);
    const end = Date.parse(item.endDateTime || `${item.stayDate}T23:59:59Z`);
    return Number.isFinite(start) && Number.isFinite(end) && start <= clock && end >= clock;
  });
  if (active) return active;

  const future = sorted.find((item) => Date.parse(item.startDateTime || `${item.stayDate}T00:00:00Z`) > clock);
  return future || null;
}
