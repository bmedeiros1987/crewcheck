import type { CrewRoster, FlightLeg, RosterDay } from './pdfParser';

export type CanonicalRosterEventKind = 'flight' | 'duty' | 'stay' | 'rest';

export type CanonicalRosterEvent = {
  id: string;
  kind: CanonicalRosterEventKind;
  date: string;
  publishedDay: RosterDay;
  startDateTime: string;
  endDateTime: string;
  flightNumber: string;
  origin: string;
  destination: string;
  presentation: string;
  departure: string;
  arrival: string;
  isNextDay: boolean;
  sourceConfidence: 'alta' | 'media' | 'baixa';
  leg?: FlightLeg;
};

const MONTHS: Record<string, number> = {
  JAN: 1, FEV: 2, FEB: 2, MAR: 3, ABR: 4, APR: 4,
  MAI: 5, MAY: 5, JUN: 6, JUL: 7, AGO: 8, AUG: 8,
  SET: 9, SEP: 9, OUT: 10, OCT: 10, NOV: 11, DEZ: 12, DEC: 12,
};

function pad2(value: number) { return String(value).padStart(2, '0'); }

function normalizeTime(value?: string | null): string | null {
  const match = String(value || '').match(/(\d{1,2})[:hH](\d{2})/);
  if (!match) return null;
  return `${pad2(Number(match[1]))}:${match[2]}`;
}

function minutes(value?: string | null): number | null {
  const t = normalizeTime(value);
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function parseRosterDate(value: string, fallbackMonth: number, fallbackYear: number) {
  const raw = String(value || '').trim();
  let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) };

  m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) return { day: Number(m[1]), month: MONTHS[m[2].toUpperCase()] || fallbackMonth, year: Number(m[3]) };

  m = raw.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return { day: Number(m[1]), month: Number(m[2]), year: fallbackYear };

  return { day: 1, month: fallbackMonth, year: fallbackYear };
}

function formatDate(day: number, month: number, year: number) {
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

function dateAt(day: RosterDay, time: string | null, fallbackHour: number) {
  const parsed = parseRosterDate(day.date, day.month || 1, day.year || new Date().getFullYear());
  const date = new Date(parsed.year, parsed.month - 1, parsed.day, fallbackHour, 0, 0, 0);
  const normalized = normalizeTime(time);
  if (normalized) {
    const [h, m] = normalized.split(':').map(Number);
    date.setHours(h, m, 0, 0);
  }
  return date;
}

function presentationIsUnsafe(presentation: string | null, departure: string | null) {
  const p = minutes(presentation);
  const d = minutes(departure);
  return p != null && d != null && p > d + 180;
}

function cloneDay(day: RosterDay): RosterDay {
  return { ...day, legs: [...(day.legs || [])] };
}

function legKey(day: RosterDay, leg: FlightLeg) {
  return [
    day.date,
    leg.flightNumber,
    leg.origin,
    leg.destination,
    normalizeTime(leg.departureTime) || '',
    normalizeTime(leg.arrivalTime) || '',
  ].join('|');
}

function sortLegs(legs: FlightLeg[]) {
  return [...legs].sort((a, b) => (minutes(a.departureTime) ?? 99999) - (minutes(b.departureTime) ?? 99999));
}

export function normalizeRosterDays(roster: CrewRoster): CrewRoster {
  const byDate = new Map<string, RosterDay>();
  const defaultMonth = roster.month || new Date().getMonth() + 1;
  const defaultYear = roster.year || new Date().getFullYear();

  for (const sourceDay of Array.isArray(roster.days) ? roster.days : []) {
    const parsed = parseRosterDate(sourceDay.date, sourceDay.month || defaultMonth, sourceDay.year || defaultYear);
    const date = formatDate(parsed.day, parsed.month, parsed.year);
    const day = cloneDay({ ...sourceDay, date, dayNumber: parsed.day, month: parsed.month, year: parsed.year });
    day.legs = sortLegs(day.legs || []);

    const current = byDate.get(date);
    if (!current) {
      const seen = new Set<string>();
      day.legs = day.legs.filter((leg) => {
        const key = legKey(day, leg);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      byDate.set(date, day);
      continue;
    }

    const seen = new Set((current.legs || []).map((leg) => legKey(current, leg)));
    for (const leg of day.legs || []) {
      const key = legKey(day, leg);
      if (!seen.has(key)) {
        current.legs.push(leg);
        seen.add(key);
      }
    }

    current.legs = sortLegs(current.legs || []);
    current.rawText = [current.rawText, day.rawText].filter(Boolean).join(' ');
    current.type = current.legs.length ? 'VOO' : current.type;
    current.pairingCode = current.pairingCode || day.pairingCode;
    current.dutyReport = current.dutyReport || day.dutyReport;
    current.dutyDebrief = current.dutyDebrief || day.dutyDebrief;
    current.hotel = current.hotel || day.hotel;
    current.isNextDay = Boolean(current.isNextDay || day.isNextDay || current.legs.some((leg) => leg.isNextDay));
  }

  return {
    ...roster,
    days: Array.from(byDate.values()).sort((a, b) => dateAt(a, '00:00', 0).getTime() - dateAt(b, '00:00', 0).getTime()),
  };
}

export function buildCanonicalRosterEvents(roster: CrewRoster): CanonicalRosterEvent[] {
  const normalized = normalizeRosterDays(roster);
  const events: CanonicalRosterEvent[] = [];

  normalized.days.forEach((day) => {
    if (day.legs?.length) {
      sortLegs(day.legs).forEach((leg, index) => {
        const departure = normalizeTime(leg.departureTime) || '00:00';
        const arrival = normalizeTime(leg.arrivalTime) || departure;
        const rawPresentation = normalizeTime(day.dutyReport) || normalizeTime((leg as any).presentationTime) || departure;
        const presentation = presentationIsUnsafe(rawPresentation, departure) ? departure : rawPresentation;
        const start = dateAt(day, departure, 0);
        const end = dateAt(day, arrival, 23);
        const isNextDay = Boolean(leg.isNextDay || day.isNextDay || ((minutes(arrival) ?? 0) < (minutes(departure) ?? 0)));
        if (isNextDay) end.setDate(end.getDate() + 1);

        events.push({
          id: `${day.date}|${index}|${leg.flightNumber}|${leg.origin}|${leg.destination}|${departure}|${arrival}`,
          kind: 'flight',
          date: day.date,
          publishedDay: day,
          startDateTime: start.toISOString(),
          endDateTime: end.toISOString(),
          flightNumber: leg.flightNumber,
          origin: leg.origin,
          destination: leg.destination,
          presentation,
          departure,
          arrival,
          isNextDay,
          sourceConfidence: presentation === rawPresentation ? 'alta' : 'media',
          leg,
        });
      });
      return;
    }

    const type = String(day.type || day.pairingCode || '').toUpperCase();
    const kind: CanonicalRosterEventKind = ['DO', 'DOF', 'DR', 'OFF'].includes(type) ? 'rest' : (day.hotel ? 'stay' : 'duty');
    const startTime = normalizeTime(day.dutyReport) || '00:00';
    const endTime = normalizeTime(day.dutyDebrief) || '23:59';
    const start = dateAt(day, startTime, 0);
    const end = dateAt(day, endTime, 23);
    if ((minutes(endTime) ?? 0) < (minutes(startTime) ?? 0)) end.setDate(end.getDate() + 1);

    events.push({
      id: `${day.date}|${kind}|${day.pairingCode || day.type || 'event'}`,
      kind,
      date: day.date,
      publishedDay: day,
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
      flightNumber: day.pairingCode || day.type || 'DUTY',
      origin: day.base,
      destination: day.base,
      presentation: startTime,
      departure: startTime,
      arrival: endTime,
      isNextDay: end.getDate() !== start.getDate(),
      sourceConfidence: 'media',
    });
  });

  return events.sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());
}

export function selectNextRosterEvent(events: CanonicalRosterEvent[], now = new Date()): CanonicalRosterEvent | null {
  const sorted = [...events].sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());
  const active = sorted.find((event) => {
    const start = new Date(event.startDateTime).getTime();
    const end = new Date(event.endDateTime).getTime();
    return start <= now.getTime() && end >= now.getTime();
  });
  if (active) return active;
  return sorted.find((event) => new Date(event.startDateTime).getTime() > now.getTime()) || null;
}
