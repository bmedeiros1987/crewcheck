import type { CrewRoster, FlightLeg, RosterDay } from './pdfParser';

export type RosterChangeCategory =
  | 'addition'
  | 'removal'
  | 'time'
  | 'route'
  | 'work_type'
  | 'day_type'
  | 'pairing'
  | 'flight_number';

export interface ComparableRosterEvent {
  id: string;
  date: string;
  dateLabel: string;
  kind: 'flight' | 'activity';
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  workType: string;
  dayType: string;
  pairingCode: string;
  isRest: boolean;
}

export interface RosterChange {
  id: string;
  date: string;
  dateLabel: string;
  kind: 'added' | 'removed' | 'changed';
  categories: RosterChangeCategory[];
  title: string;
  descriptions: string[];
  planned: ComparableRosterEvent | null;
  current: ComparableRosterEvent | null;
  affectsPay: boolean;
  restImpact: 'lost' | 'gained' | 'none';
}

export interface RosterComparisonSummary {
  periodMatches: boolean;
  changedDays: number;
  addedEvents: number;
  removedEvents: number;
  changedEvents: number;
  timeChanges: number;
  routeChanges: number;
  workTypeChanges: number;
  financialReviewCount: number;
  lostDaysOff: string[];
  gainedDaysOff: string[];
  unchanged: boolean;
}

export interface RosterComparisonResult {
  plannedPeriod: string;
  currentPeriod: string;
  changes: RosterChange[];
  summary: RosterComparisonSummary;
}

const REST_CODES = new Set(['DO', 'DOF', 'DOP', 'OFF', 'FOLGA', 'FERIAS', 'FÉRIAS']);

function normalized(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function normalizedTime(value: unknown): string {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return String(Number(match[1])).padStart(2, '0') + ':' + match[2];
}

function dateParts(value: unknown, fallbackMonth: number, fallbackYear: number) {
  const raw = String(value || '').trim();
  const br = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (br) {
    const year = Number(br[3]) < 100 ? 2000 + Number(br[3]) : Number(br[3]);
    return { day: Number(br[1]), month: Number(br[2]), year };
  }
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return { day: Number(iso[3]), month: Number(iso[2]), year: Number(iso[1]) };
  return { day: 0, month: fallbackMonth, year: fallbackYear };
}

function eventDate(day: RosterDay, roster: CrewRoster): { iso: string; label: string } {
  const parts = dateParts(day.date, Number(day.month || roster.month), Number(day.year || roster.year));
  const dayNumber = parts.day || Number(day.dayNumber || 0);
  const month = parts.month || Number(roster.month || 0);
  const year = parts.year || Number(roster.year || 0);
  const iso = year && month && dayNumber
    ? year + '-' + String(month).padStart(2, '0') + '-' + String(dayNumber).padStart(2, '0')
    : normalized(day.date);
  const label = dayNumber && month
    ? String(dayNumber).padStart(2, '0') + '/' + String(month).padStart(2, '0')
    : String(day.date || 'Data pendente');
  return { iso, label };
}

function dayCode(day: RosterDay): string {
  return normalized(day.type || day.pairingCode || 'OTHER');
}

function isRestDay(day: RosterDay): boolean {
  const values = [day.type, day.pairingCode, day.rawText].map(normalized).join(' ');
  return [...REST_CODES].some((code) => new RegExp('(^|\\s)' + code + '(\\s|$)').test(values));
}

function flightEvent(
  roster: CrewRoster,
  day: RosterDay,
  leg: FlightLeg,
  dayIndex: number,
  legIndex: number
): ComparableRosterEvent {
  const date = eventDate(day, roster);
  return {
    id: date.iso + '-flight-' + dayIndex + '-' + legIndex,
    date: date.iso,
    dateLabel: date.label,
    kind: 'flight',
    flightNumber: normalized(leg.flightNumber),
    origin: normalized(leg.origin),
    destination: normalized(leg.destination),
    departure: normalizedTime(leg.departureTime),
    arrival: normalizedTime(leg.arrivalTime),
    workType: normalized(leg.workType || 'OP'),
    dayType: dayCode(day),
    pairingCode: normalized(day.pairingCode),
    isRest: false,
  };
}

function activityEvent(roster: CrewRoster, day: RosterDay, dayIndex: number): ComparableRosterEvent {
  const date = eventDate(day, roster);
  const code = dayCode(day);
  return {
    id: date.iso + '-activity-' + dayIndex,
    date: date.iso,
    dateLabel: date.label,
    kind: 'activity',
    flightNumber: normalized(day.pairingCode || code),
    origin: normalized(day.base || roster.base),
    destination: normalized(day.base || roster.base),
    departure: normalizedTime(day.dutyReport),
    arrival: normalizedTime(day.dutyDebrief),
    workType: '',
    dayType: code,
    pairingCode: normalized(day.pairingCode),
    isRest: isRestDay(day),
  };
}

export function comparableRosterEvents(roster: CrewRoster): ComparableRosterEvent[] {
  const events = (Array.isArray(roster.days) ? roster.days : []).flatMap((day, dayIndex) => {
    const legs = Array.isArray(day.legs) ? day.legs : [];
    return legs.length
      ? legs.map((leg, legIndex) => flightEvent(roster, day, leg, dayIndex, legIndex))
      : [activityEvent(roster, day, dayIndex)];
  });
  return events.sort((a, b) => a.date.localeCompare(b.date)
    || a.departure.localeCompare(b.departure)
    || a.flightNumber.localeCompare(b.flightNumber));
}

function rosterPeriod(roster: CrewRoster): { month: number; year: number; label: string } {
  const firstDay = Array.isArray(roster.days) ? roster.days[0] : null;
  const parts = dateParts(firstDay?.date, Number(firstDay?.month || roster.month), Number(firstDay?.year || roster.year));
  const month = Number(roster.month || parts.month || 0);
  const year = Number(roster.year || parts.year || 0);
  const label = month && year ? String(month).padStart(2, '0') + '/' + year : 'Período pendente';
  return { month, year, label };
}

export function sameRosterPeriod(first: CrewRoster, second: CrewRoster): boolean {
  const a = rosterPeriod(first);
  const b = rosterPeriod(second);
  return Boolean(a.month && a.year && a.month === b.month && a.year === b.year);
}

function eventIdentity(event: ComparableRosterEvent): string {
  return [
    event.date,
    event.kind,
    event.flightNumber,
    event.origin,
    event.destination,
    event.departure,
    event.arrival,
    event.workType,
    event.dayType,
    event.pairingCode,
  ].join('|');
}

export function rosterFingerprint(roster: CrewRoster): string {
  const input = comparableRosterEvents(roster).map(eventIdentity).join('\n');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 'r' + (hash >>> 0).toString(16).padStart(8, '0');
}

function pairScore(planned: ComparableRosterEvent, current: ComparableRosterEvent): number {
  if (planned.date !== current.date || planned.kind !== current.kind) return -1;
  if (planned.kind === 'activity') {
    if (planned.dayType === current.dayType && planned.pairingCode === current.pairingCode) return 160;
    if (planned.dayType === current.dayType) return 120;
    if (planned.pairingCode && planned.pairingCode === current.pairingCode) return 100;
    return 0;
  }
  let score = 0;
  if (planned.flightNumber && planned.flightNumber === current.flightNumber) score += 120;
  if (planned.origin === current.origin && planned.destination === current.destination) score += 80;
  if (planned.departure && planned.departure === current.departure) score += 25;
  if (planned.arrival && planned.arrival === current.arrival) score += 15;
  if (planned.workType === current.workType) score += 10;
  return score;
}

function minutesOfDay(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function timeShift(before: string, after: string): string {
  const beforeMinutes = minutesOfDay(before);
  const afterMinutes = minutesOfDay(after);
  if (beforeMinutes === null || afterMinutes === null) return '';
  let delta = afterMinutes - beforeMinutes;
  if (delta > 12 * 60) delta -= 24 * 60;
  if (delta < -12 * 60) delta += 24 * 60;
  if (!delta) return 'sem deslocamento';
  const sign = delta > 0 ? '+' : '-';
  const absolute = Math.abs(delta);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return sign + (hours ? hours + 'h' : '') + (minutes ? String(minutes).padStart(hours ? 2 : 1, '0') + 'min' : '');
}

function eventTitle(event: ComparableRosterEvent): string {
  if (event.kind === 'flight') {
    return (event.flightNumber || 'Voo') + ' · ' + (event.origin || '—') + ' → ' + (event.destination || '—');
  }
  return event.pairingCode || event.dayType || 'Atividade';
}

function changeForPair(planned: ComparableRosterEvent, current: ComparableRosterEvent): RosterChange | null {
  const categories = new Set<RosterChangeCategory>();
  const descriptions: string[] = [];
  let affectsPay = false;

  if (planned.flightNumber !== current.flightNumber) {
    categories.add('flight_number');
    descriptions.push('Identificação ' + (planned.flightNumber || '—') + ' → ' + (current.flightNumber || '—'));
    affectsPay = true;
  }
  if (planned.origin !== current.origin || planned.destination !== current.destination) {
    categories.add('route');
    descriptions.push('Rota ' + (planned.origin || '—') + ' → ' + (planned.destination || '—')
      + ' mudou para ' + (current.origin || '—') + ' → ' + (current.destination || '—'));
    affectsPay = true;
  }
  if (planned.departure !== current.departure) {
    categories.add('time');
    descriptions.push('Saída ' + (planned.departure || '—') + ' → ' + (current.departure || '—')
      + (planned.departure && current.departure ? ' (' + timeShift(planned.departure, current.departure) + ')' : ''));
    affectsPay = true;
  }
  if (planned.arrival !== current.arrival) {
    categories.add('time');
    descriptions.push('Chegada ' + (planned.arrival || '—') + ' → ' + (current.arrival || '—')
      + (planned.arrival && current.arrival ? ' (' + timeShift(planned.arrival, current.arrival) + ')' : ''));
    affectsPay = true;
  }
  if (planned.workType !== current.workType) {
    categories.add('work_type');
    descriptions.push('Função ' + (planned.workType || '—') + ' → ' + (current.workType || '—'));
    affectsPay = true;
  }
  if (planned.dayType !== current.dayType) {
    categories.add('day_type');
    descriptions.push('Classificação do dia ' + (planned.dayType || '—') + ' → ' + (current.dayType || '—'));
    affectsPay = true;
  }
  if (planned.pairingCode !== current.pairingCode) {
    categories.add('pairing');
    descriptions.push('Programação ' + (planned.pairingCode || '—') + ' → ' + (current.pairingCode || '—'));
  }
  if (!categories.size) return null;

  return {
    id: 'changed-' + planned.id + '-' + current.id,
    date: current.date,
    dateLabel: current.dateLabel,
    kind: 'changed',
    categories: Array.from(categories),
    title: eventTitle(current),
    descriptions,
    planned,
    current,
    affectsPay,
    restImpact: planned.isRest && !current.isRest ? 'lost' : !planned.isRest && current.isRest ? 'gained' : 'none',
  };
}

function singleChange(event: ComparableRosterEvent, kind: 'added' | 'removed'): RosterChange {
  const isAdded = kind === 'added';
  return {
    id: kind + '-' + event.id,
    date: event.date,
    dateLabel: event.dateLabel,
    kind,
    categories: [isAdded ? 'addition' : 'removal'],
    title: eventTitle(event),
    descriptions: [isAdded ? 'Não constava na escala planejada.' : 'Não aparece na escala atual importada.'],
    planned: isAdded ? null : event,
    current: isAdded ? event : null,
    affectsPay: event.kind === 'flight' || !event.isRest || (event.isRest && kind === 'removed'),
    restImpact: event.isRest ? (isAdded ? 'gained' : 'lost') : 'none',
  };
}

function restDates(roster: CrewRoster): Set<string> {
  return new Set((Array.isArray(roster.days) ? roster.days : [])
    .filter(isRestDay)
    .map((day) => eventDate(day, roster).iso));
}

function displayDate(iso: string): string {
  const match = iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? match[2] + '/' + match[1] : iso;
}

export function compareRosters(plannedRoster: CrewRoster, currentRoster: CrewRoster): RosterComparisonResult {
  const planned = comparableRosterEvents(plannedRoster);
  const current = comparableRosterEvents(currentRoster);
  const remainingCurrent = new Set(current.map((_, index) => index));
  const changes: RosterChange[] = [];

  planned.forEach((plannedEvent) => {
    let bestIndex = -1;
    let bestScore = -1;
    remainingCurrent.forEach((currentIndex) => {
      const score = pairScore(plannedEvent, current[currentIndex]);
      if (score > bestScore) {
        bestIndex = currentIndex;
        bestScore = score;
      }
    });
    const threshold = plannedEvent.kind === 'flight' ? 80 : 100;
    if (bestIndex >= 0 && bestScore >= threshold) {
      remainingCurrent.delete(bestIndex);
      const change = changeForPair(plannedEvent, current[bestIndex]);
      if (change) changes.push(change);
      return;
    }
    changes.push(singleChange(plannedEvent, 'removed'));
  });

  remainingCurrent.forEach((index) => changes.push(singleChange(current[index], 'added')));
  changes.sort((a, b) => a.date.localeCompare(b.date)
    || (a.restImpact === 'lost' ? -1 : b.restImpact === 'lost' ? 1 : 0)
    || a.title.localeCompare(b.title));

  const plannedRest = restDates(plannedRoster);
  const currentRest = restDates(currentRoster);
  const lostDaysOff = [...plannedRest].filter((date) => !currentRest.has(date)).map(displayDate).sort();
  const gainedDaysOff = [...currentRest].filter((date) => !plannedRest.has(date)).map(displayDate).sort();
  const plannedPeriod = rosterPeriod(plannedRoster);
  const currentPeriod = rosterPeriod(currentRoster);
  const summary: RosterComparisonSummary = {
    periodMatches: sameRosterPeriod(plannedRoster, currentRoster),
    changedDays: new Set(changes.map((change) => change.date)).size,
    addedEvents: changes.filter((change) => change.kind === 'added').length,
    removedEvents: changes.filter((change) => change.kind === 'removed').length,
    changedEvents: changes.filter((change) => change.kind === 'changed').length,
    timeChanges: changes.filter((change) => change.categories.includes('time')).length,
    routeChanges: changes.filter((change) => change.categories.includes('route')).length,
    workTypeChanges: changes.filter((change) => change.categories.includes('work_type')).length,
    financialReviewCount: changes.filter((change) => change.affectsPay).length,
    lostDaysOff,
    gainedDaysOff,
    unchanged: changes.length === 0,
  };

  return {
    plannedPeriod: plannedPeriod.label,
    currentPeriod: currentPeriod.label,
    changes,
    summary,
  };
}
