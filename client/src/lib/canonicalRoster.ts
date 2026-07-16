import type { CrewRoster, FlightLeg, RosterDay } from './pdfParser';
import { completeContinuityDays } from './rosterContinuity';

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
  legIndex: number;
  legCount: number;
  showPresentation: boolean;
  groundBeforeMinutes: number | null;
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
  const published = [...legs];
  const alreadyConnected = published.length > 1
    && published.every((leg, index) => index === 0 || airportCode(published[index - 1].destination) === airportCode(leg.origin));
  if (alreadyConnected) return published;
  return [...legs].sort((a, b) => (minutes(a.departureTime) ?? 99999) - (minutes(b.departureTime) ?? 99999));
}

function groundBeforeMinutes(previous: FlightLeg | undefined, leg: FlightLeg): number | null {
  if (!previous) return null;
  const arrival = minutes(previous.arrivalTime);
  const departure = minutes(leg.departureTime);
  if (arrival == null || departure == null) return null;
  return departure >= arrival ? departure - arrival : departure + 1440 - arrival;
}

export function legCrossesNextDay(leg: FlightLeg): boolean {
  const departure = minutes(leg.departureTime);
  const arrival = minutes(leg.arrivalTime);
  return Boolean(leg.isNextDay || (departure != null && arrival != null && arrival < departure));
}

function airportCode(value?: string | null): string {
  return String(value || '').trim().toUpperCase();
}

function legSignature(leg: FlightLeg): string {
  return [
    String(leg.flightNumber || '').trim().toUpperCase(),
    airportCode(leg.origin),
    airportCode(leg.destination),
    normalizeTime(leg.departureTime) || '',
    normalizeTime(leg.arrivalTime) || '',
  ].join('|');
}

function similarPublishedLeg(a: FlightLeg, b: FlightLeg): boolean {
  const sameRoute = String(a.flightNumber || '').trim().toUpperCase() === String(b.flightNumber || '').trim().toUpperCase()
    && airportCode(a.origin) === airportCode(b.origin)
    && airportCode(a.destination) === airportCode(b.destination);
  if (!sameRoute) return false;
  const ad = minutes(a.departureTime);
  const bd = minutes(b.departureTime);
  const aa = minutes(a.arrivalTime);
  const ba = minutes(b.arrivalTime);
  if (ad == null || bd == null || aa == null || ba == null) return false;
  return Math.abs(ad - bd) <= 45 && Math.abs(aa - ba) <= 90;
}

function legCompletenessScore(leg: FlightLeg): number {
  const anyLeg = leg as any;
  return [
    leg.flightNumber,
    leg.origin,
    leg.destination,
    leg.departureTime,
    leg.arrivalTime,
    leg.workType,
    anyLeg.aircraft || anyLeg.aircraftType || anyLeg.equipment,
    anyLeg.registration || anyLeg.tailNumber || anyLeg.matricula,
  ].filter(Boolean).length;
}

function chooseBetterLeg(a: FlightLeg, b: FlightLeg): FlightLeg {
  const left = legCompletenessScore(a);
  const right = legCompletenessScore(b);
  if (right > left) return b;
  return a;
}

function dedupeSimilarLegs(legs: FlightLeg[]): FlightLeg[] {
  const output: FlightLeg[] = [];
  for (const leg of sortLegs(legs || [])) {
    const index = output.findIndex((existing) => similarPublishedLeg(existing, leg));
    if (index >= 0) {
      output[index] = chooseBetterLeg(output[index], leg);
      continue;
    }
    if (!output.some((existing) => legSignature(existing) === legSignature(leg))) output.push(leg);
  }
  return sortLegs(output);
}

function connectionGapMinutes(previous: FlightLeg, next: FlightLeg): number | null {
  if (airportCode(previous.destination) !== airportCode(next.origin)) return null;
  const arrival = minutes(previous.arrivalTime);
  const departure = minutes(next.departureTime);
  if (arrival == null || departure == null) return null;
  const gap = departure >= arrival ? departure - arrival : departure + 1440 - arrival;
  // Mesmo dia: aceita conexão apertada, mas não aceita "espera" enorme como mesma sequência.
  if (gap < -15 || gap > 720) return null;
  return gap;
}

function physicallyConnects(previous: FlightLeg, next: FlightLeg): boolean {
  return connectionGapMinutes(previous, next) != null;
}

function chainScore(chain: FlightLeg[]): number {
  if (!chain.length) return 0;
  const uniqueAirports = new Set(chain.flatMap((leg) => [airportCode(leg.origin), airportCode(leg.destination)]).filter(Boolean)).size;
  const continuity = Math.max(0, chain.length - 1);
  const completeness = chain.reduce((sum, leg) => sum + legCompletenessScore(leg), 0);
  return chain.length * 1000 + continuity * 100 + uniqueAirports * 10 + completeness;
}

export function selectPhysicalLegSequence(legs: FlightLeg[]): FlightLeg[] {
  const clean = dedupeSimilarLegs(legs || []);
  if (clean.length <= 2) return clean;

  const chains: FlightLeg[][] = [];
  for (let i = 0; i < clean.length; i += 1) {
    let bestEndingHere: FlightLeg[] = [clean[i]];
    for (let j = 0; j < i; j += 1) {
      const previousChain = chains[j] || [clean[j]];
      const previousLeg = previousChain[previousChain.length - 1];
      if (!physicallyConnects(previousLeg, clean[i])) continue;
      const candidate = [...previousChain, clean[i]];
      if (chainScore(candidate) > chainScore(bestEndingHere)) bestEndingHere = candidate;
    }
    chains[i] = bestEndingHere;
  }

  const best = chains.sort((a, b) => chainScore(b) - chainScore(a))[0] || clean;
  // Só filtra quando há uma sequência física real. Se o dia não formar sequência,
  // preserva os dados para não apagar programação rara/múltipla sem evidência.
  if (best.length >= 2 && best.length < clean.length) return sortLegs(best);
  return clean;
}

function parsePublishedRangeDate(day: string, monthToken: string, year: string): Date | null {
  const month = MONTHS[String(monthToken || '').toUpperCase()];
  const date = new Date(Number(year), (month || 1) - 1, Number(day), 12, 0, 0, 0);
  return month && Number.isFinite(date.getTime()) ? date : null;
}

function inferPublishedRangeFromRawText(rawText?: string | null): { start: Date; end: Date } | null {
  const text = String(rawText || '');
  const match = text.match(/\b(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+to\s+(\d{1,2})-([A-Za-z]{3})-(\d{4})\b/i);
  if (!match) return null;
  const start = parsePublishedRangeDate(match[1], match[2], match[3]);
  const end = parsePublishedRangeDate(match[4], match[5], match[6]);
  if (!start || !end) return null;
  return { start, end };
}

function dayDateTime(day: RosterDay, fallbackMonth: number, fallbackYear: number): number {
  const parsed = parseRosterDate(day.date, day.month || fallbackMonth, day.year || fallbackYear);
  return new Date(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0, 0).getTime();
}

function filterDaysByPublishedRange(days: RosterDay[], roster: CrewRoster, fallbackMonth: number, fallbackYear: number): RosterDay[] {
  const range = inferPublishedRangeFromRawText(roster.rawText);
  if (!range) return days;

  const start = range.start.getTime();
  const end = range.end.getTime();
  return days.filter((day) => {
    const time = dayDateTime(day, fallbackMonth, fallbackYear);
    return time >= start && time <= end;
  });
}

function inferRosterPeriodFromRawText(rawText?: string | null): { month: number; year: number } | null {
  const text = String(rawText || '');
  const range = text.match(/\b\d{1,2}-([A-Za-z]{3})-(\d{4})\s+to\s+\d{1,2}-([A-Za-z]{3})-(\d{4})\b/i);
  if (range) {
    const month = MONTHS[range[1].toUpperCase()] || MONTHS[range[3].toUpperCase()];
    const year = Number(range[2]) || Number(range[4]);
    if (month && year) return { month, year };
  }

  const first = text.match(/\b\d{1,2}-([A-Za-z]{3})-(\d{4})\b/i);
  if (first) {
    const month = MONTHS[first[1].toUpperCase()];
    const year = Number(first[2]);
    if (month && year) return { month, year };
  }

  return null;
}

function inferRosterPeriodFromDays(days: RosterDay[], fallbackMonth: number, fallbackYear: number): { month: number; year: number } {
  const counts = new Map<string, { month: number; year: number; count: number }>();

  for (const day of days || []) {
    const parsed = parseRosterDate(day.date, day.month || fallbackMonth, day.year || fallbackYear);
    if (!parsed.month || !parsed.year) continue;
    const key = `${parsed.month}|${parsed.year}`;
    const current = counts.get(key) || { month: parsed.month, year: parsed.year, count: 0 };
    current.count += Math.max(1, (day.legs || []).length);
    counts.set(key, current);
  }

  return [...counts.values()].sort((a, b) => b.count - a.count)[0] || { month: fallbackMonth, year: fallbackYear };
}

function inferCanonicalRosterPeriod(roster: CrewRoster, days: RosterDay[], fallbackMonth: number, fallbackYear: number): { month: number; year: number } {
  // Primeiro tenta o período publicado do CrewRosterReport: "01-Jul-2026 to 31-Jul-2026".
  // Isso evita exibir Junho quando o PDF é de Julho.
  const fromText = inferRosterPeriodFromRawText(roster.rawText);
  if (fromText) return fromText;

  return inferRosterPeriodFromDays(days, fallbackMonth, fallbackYear);
}

export function normalizeRosterDays(roster: CrewRoster): CrewRoster {
  const byActivity = new Map<string, RosterDay>();
  const defaultMonth = roster.month || new Date().getMonth() + 1;
  const defaultYear = roster.year || new Date().getFullYear();

  for (const sourceDay of Array.isArray(roster.days) ? roster.days : []) {
    const parsed = parseRosterDate(sourceDay.date, sourceDay.month || defaultMonth, sourceDay.year || defaultYear);
    const date = formatDate(parsed.day, parsed.month, parsed.year);
    const day = cloneDay({ ...sourceDay, date, dayNumber: parsed.day, month: parsed.month, year: parsed.year });
    day.legs = selectPhysicalLegSequence(sortLegs(day.legs || []));

    const activityKey = day.legs?.length
      ? `${date}|VOO|${day.dutyReport || ''}|${day.legs[0]?.flightNumber || day.pairingCode || ''}`
      : `${date}|${day.type || day.pairingCode || 'OTHER'}|${day.dutyReport || ''}|${day.dutyDebrief || ''}`;
    const current = byActivity.get(activityKey);
    if (!current) {
      const seen = new Set<string>();
      day.legs = day.legs.filter((leg) => {
        const key = legKey(day, leg);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      byActivity.set(activityKey, day);
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

    current.legs = selectPhysicalLegSequence(sortLegs(current.legs || []));
    current.rawText = [current.rawText, day.rawText].filter(Boolean).join(' ');
    current.type = current.legs.length ? 'VOO' : current.type;
    current.pairingCode = current.pairingCode || day.pairingCode;
    current.dutyReport = current.dutyReport || day.dutyReport;
    current.dutyDebrief = current.dutyDebrief || day.dutyDebrief;
    current.hotel = current.hotel || day.hotel;
    current.isNextDay = Boolean(current.isNextDay || day.isNextDay || current.legs.some((leg) => legCrossesNextDay(leg)));
  }

  const collectedDays = Array.from(byActivity.values())
    .map((day) => ({ ...day, legs: selectPhysicalLegSequence(sortLegs(day.legs || [])) }))
    .sort((a, b) => dateAt(a, '00:00', 0).getTime() - dateAt(b, '00:00', 0).getTime());
  const period = inferCanonicalRosterPeriod(roster, collectedDays, defaultMonth, defaultYear);
  const completedDays = completeContinuityDays(collectedDays, roster);
  const normalizedDays = filterDaysByPublishedRange(completedDays, roster, period.month, period.year);

  return {
    ...roster,
    month: period.month,
    year: period.year,
    days: normalizedDays,
  };
}

export function buildCanonicalRosterEvents(roster: CrewRoster): CanonicalRosterEvent[] {
  const normalized = normalizeRosterDays(roster);
  const events: CanonicalRosterEvent[] = [];

  normalized.days.forEach((day) => {
    if (day.legs?.length) {
      const legs = sortLegs(day.legs);
      let physicalDayOffset = 0;
      let previousArrivalAbsolute: number | null = null;
      legs.forEach((leg, index) => {
        const departure = normalizeTime(leg.departureTime) || '00:00';
        const arrival = normalizeTime(leg.arrivalTime) || departure;
        const rawPresentation = normalizeTime(day.dutyReport) || normalizeTime((leg as any).presentationTime) || departure;
        const showPresentation = index === 0;
        const presentation = showPresentation && !presentationIsUnsafe(rawPresentation, departure) ? rawPresentation : departure;
        const start = dateAt(day, departure, 0);
        const end = dateAt(day, arrival, 23);
        const departureMinute = minutes(departure) || 0;
        const arrivalMinute = minutes(arrival) || 0;
        while (previousArrivalAbsolute != null && departureMinute + physicalDayOffset * 1440 < previousArrivalAbsolute) physicalDayOffset += 1;
        start.setDate(start.getDate() + physicalDayOffset);
        const arrivalOffset = physicalDayOffset + (legCrossesNextDay(leg) || arrivalMinute < departureMinute ? 1 : 0);
        end.setDate(end.getDate() + arrivalOffset);
        previousArrivalAbsolute = arrivalMinute + arrivalOffset * 1440;
        const isNextDay = physicalDayOffset > 0 || arrivalOffset > 0;

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
          legIndex: index,
          legCount: legs.length,
          showPresentation,
          groundBeforeMinutes: groundBeforeMinutes(legs[index - 1], leg),
          leg,
        });
      });
      return;
    }

    const type = String(day.type || day.pairingCode || '').toUpperCase();
    const kind: CanonicalRosterEventKind = ['DO', 'DOF', 'DOP', 'DOPR', 'DR', 'OFF', 'VC'].includes(type)
      ? 'rest'
      : (day.hotel || /PERNOITE|LAYOVER|ESTADIA|HOTEL/.test(type) ? 'stay' : 'duty');
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
      legIndex: 0,
      legCount: 1,
      showPresentation: true,
      groundBeforeMinutes: null,
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

export function rosterCounters(roster: CrewRoster) {
  const normalized = normalizeRosterDays(roster);
  const events = buildCanonicalRosterEvents(normalized);
  return {
    days: normalized.days.length,
    flights: events.filter((event) => event.kind === 'flight').length,
    activities: events.filter((event) => event.kind === 'duty' || event.kind === 'stay').length,
    rest: events.filter((event) => event.kind === 'rest').length,
    events: events.length,
  };
}
