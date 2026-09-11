import type { CrewRoster, FlightLeg, RosterDay } from './pdfParser';

const REST_CODES = new Set(['DO', 'DOF', 'DOP', 'DOPR', 'DR', 'OFF', 'VC']);
const MONTHS: Record<string, number> = { JAN:1,FEV:2,FEB:2,MAR:3,ABR:4,APR:4,MAI:5,MAY:5,JUN:6,JUL:7,AGO:8,AUG:8,SET:9,SEP:9,OUT:10,OCT:10,NOV:11,DEZ:12,DEC:12 };
const BRAZIL_UTC_OFFSET_MINUTES = 3 * 60;

function pad2(value: number) { return String(value).padStart(2, '0'); }
function normalizeTime(value?: string | null): string | null {
  const match = String(value || '').match(/(\d{1,2})[:hH](\d{2})/);
  return match ? `${pad2(Number(match[1]))}:${match[2]}` : null;
}
function parseDate(value: string, fallbackMonth: number, fallbackYear: number) {
  const raw = String(value || '').trim();
  let match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return { day:Number(match[1]), month:Number(match[2]), year:Number(match[3]) };
  match = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (match) return { day:Number(match[1]), month:MONTHS[match[2].toUpperCase()] || fallbackMonth, year:Number(match[3]) };
  match = raw.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (match) return { day:Number(match[1]), month:Number(match[2]), year:fallbackYear };
  return { day:1, month:fallbackMonth, year:fallbackYear };
}
function dateKey(date: Date) { return `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth()+1)}/${date.getUTCFullYear()}`; }
function rosterCalendarDate(day: RosterDay, roster: CrewRoster) {
  const parsed = parseDate(day.date, day.month || roster.month || 1, day.year || roster.year || new Date().getUTCFullYear());
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0, 0));
}
function operationalShift(date: Date) {
  return new Date(date.getTime() - BRAZIL_UTC_OFFSET_MINUTES * 60_000);
}
function operationalCalendarDate(date: Date) {
  const shifted = operationalShift(date);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 0, 0, 0, 0));
}
function operationalTime(date: Date) {
  const shifted = operationalShift(date);
  return `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
}
function operationalDateKey(date: Date) { return dateKey(operationalCalendarDate(date)); }
function dateAt(day: RosterDay, roster: CrewRoster, value: string | null, fallbackHour: number) {
  const parsed = parseDate(day.date, day.month || roster.month || 1, day.year || roster.year || new Date().getUTCFullYear());
  const time = normalizeTime(value);
  const [hours, minutes] = time ? time.split(':').map(Number) : [fallbackHour, 0];
  return new Date(Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    hours,
    minutes + BRAZIL_UTC_OFFSET_MINUTES,
    0,
    0,
  ));
}
function crossesMidnight(leg?: FlightLeg): boolean {
  if (!leg) return false;
  if (leg.isNextDay) return true;
  const departure = normalizeTime(leg.departureTime);
  const arrival = normalizeTime(leg.arrivalTime);
  return Boolean(departure && arrival && arrival < departure);
}
function dayStart(day: RosterDay, roster: CrewRoster) {
  return dateAt(day, roster, normalizeTime(day.dutyReport) || normalizeTime(day.legs?.[0]?.departureTime), 0);
}
function dayEnd(day: RosterDay, roster: CrewRoster) {
  const last = day.legs?.at(-1);
  const end = dateAt(day, roster, normalizeTime(day.dutyDebrief) || normalizeTime(last?.arrivalTime), 23);
  const start = dayStart(day, roster);
  if (day.isNextDay || crossesMidnight(last) || end.getTime() < start.getTime()) end.setUTCDate(end.getUTCDate() + 1);
  return end;
}
function airport(value?: string | null) { return String(value || '').trim().toUpperCase(); }
function lastLocation(day: RosterDay) { return airport(day.legs?.at(-1)?.destination || day.base); }
function firstLocation(day: RosterDay) { return airport(day.legs?.[0]?.origin || day.base); }
function isPublishedRest(day: RosterDay) { return REST_CODES.has(String(day.type || day.pairingCode || '').trim().toUpperCase()); }

function syntheticStay(date: Date, end: Date, start: Date, location: string, gapHours: number, roster: CrewRoster, suffix: string): RosterDay {
  const atBase = location === airport(roster.base);
  const type = atBase ? 'DESCANSO_BASE_CONTINUIDADE' : 'PERNOITE_CONTINUIDADE';
  return {
    date: dateKey(date),
    dayNumber: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
    dayOfWeek: date.toLocaleDateString('pt-BR', { weekday:'short', timeZone:'UTC' }),
    type,
    pairingCode: `${atBase ? 'DESCANSO BASE' : 'PERNOITE'} ${suffix}`.trim(),
    dutyReport: operationalTime(end),
    dutyDebrief: operationalTime(start),
    legs: [],
    dutyHours: gapHours,
    flyingHours: 0,
    isNextDay: operationalDateKey(start) !== operationalDateKey(end),
    hotel: null,
    base: location,
    rawText: `${atBase ? 'Descanso na base' : 'Pernoite'} inferido por continuidade física em ${location}. Intervalo total ${gapHours.toFixed(2)} h. Não é folga publicada.`,
    continuityInferred: true,
    continuityLocation: location,
    continuityHours: gapHours,
    continuityAtBase: atBase,
    continuityStart: end.toISOString(),
    continuityEnd: start.toISOString(),
  } as unknown as RosterDay & Record<string, unknown>;
}

export function completeContinuityDays(days: RosterDay[], roster: CrewRoster): RosterDay[] {
  const sorted = [...days].sort((a,b) => rosterCalendarDate(a, roster).getTime() - rosterCalendarDate(b, roster).getTime() || dayStart(a, roster).getTime() - dayStart(b, roster).getTime());
  // A normalização é chamada por mais de uma camada (importação, projeção e UI).
  // Se a escala já contém a rodada completa de continuidade, mantenha-a idempotente.
  if (sorted.some((day) => Boolean((day as RosterDay & { continuityInferred?: boolean }).continuityInferred))) return sorted;
  const explicit = new Set(sorted.map((day) => day.date));
  const synthetic: RosterDay[] = [];
  const syntheticKeys = new Set<string>();

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const previous = sorted[index];
    const next = sorted[index + 1];
    if (isPublishedRest(previous) || isPublishedRest(next)) continue;
    const location = lastLocation(previous);
    if (!location || location !== firstLocation(next)) continue;
    const end = dayEnd(previous, roster);
    const start = dayStart(next, roster);
    const gapHours = (start.getTime() - end.getTime()) / 3_600_000;
    if (gapHours < 12 || gapHours > 96) continue;

    const nextMidnight = rosterCalendarDate(next, roster);
    let cursor = operationalCalendarDate(end);
    const missing: Date[] = [];
    while (cursor.getTime() < nextMidnight.getTime()) {
      const key = dateKey(cursor);
      if (!explicit.has(key)) missing.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    if (!missing.length) {
      const date = operationalCalendarDate(end);
      const key = `${dateKey(date)}|${location}|${end.toISOString()}|${start.toISOString()}`;
      if (!syntheticKeys.has(key)) {
        synthetic.push(syntheticStay(date, end, start, location, gapHours, roster, 'ENTRE JORNADAS'));
        syntheticKeys.add(key);
      }
      continue;
    }

    missing.forEach((date, missingIndex) => {
      const first = missingIndex === 0;
      const last = missingIndex === missing.length - 1;
      const segmentEnd = first ? end : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 3, 0, 0, 0));
      const segmentStart = last ? start : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 2, 59, 0, 0));
      const key = `${dateKey(date)}|${location}|${missingIndex}`;
      if (syntheticKeys.has(key)) return;
      synthetic.push(syntheticStay(date, segmentEnd, segmentStart, location, gapHours, roster, missing.length > 1 ? `${missingIndex + 1}/${missing.length}` : ''));
      syntheticKeys.add(key);
      explicit.add(dateKey(date));
    });
  }

  return [...sorted, ...synthetic].sort((a,b) => rosterCalendarDate(a, roster).getTime() - rosterCalendarDate(b, roster).getTime() || dayStart(a, roster).getTime() - dayStart(b, roster).getTime());
}
