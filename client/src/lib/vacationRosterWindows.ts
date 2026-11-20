import { buildCanonicalRosterEvents } from './canonicalRoster';
import { validFinancialDay, type FinancialRange } from './financialHistoryPeriods';
import type { CrewRoster, RosterDay } from './pdfParser';
import { rosterDisplayIso } from './rosterDisplayDate';
import { careStateForScheduleActivity } from './scheduleActivityClassification';

export type VacationRosterSource = {
  roster: CrewRoster;
  ownerId: string;
  competence: string;
  isCurrent: () => boolean;
};
type VacationRosterWindow = { month: string; half: 1 | 2 };
type PublishedDay = RosterDay & { continuityInferred?: boolean; placeholder?: boolean };
const vacationCodes = new Set(['VC', 'FÉRIAS', 'FERIAS']);
const code = (value: unknown) => typeof value === 'string' ? value.trim().toUpperCase() : '';

function currentSource(source: VacationRosterSource, ownerId: string) {
  try { return source.ownerId === ownerId && source.isCurrent() === true; }
  catch { return false; }
}

function publishedIso(day: PublishedDay) {
  if (day.continuityInferred || day.placeholder || typeof day.date !== 'string') return null;
  const date = rosterDisplayIso({ day });
  return date && validFinancialDay(date) ? date : null;
}

function declaresVacation(day: PublishedDay) {
  const type = code(day.type), pairing = code(day.pairingCode);
  return (vacationCodes.has(type) || (type === 'DO' && vacationCodes.has(pairing))) &&
    Array.isArray(day.legs) && day.legs.length === 0 &&
    careStateForScheduleActivity({ canonical: { publishedDay: day } }) === 'FERIAS';
}

/** Calendar hints only. Admit published civil dates in their own competence
 * and expose neither a start/end date nor a duration or right to leave. */
export function vacationRosterWindows(sources: readonly VacationRosterSource[], range: FinancialRange, ownerId: string | null) {
  const windows = new Map<string, VacationRosterWindow>();
  let ambiguous = false;
  if (!ownerId || !range.valid || !validFinancialDay(range.start) || !validFinancialDay(range.end) || range.start > range.end) {
    return { windows: [], ambiguous };
  }
  const selected = new Map<string, VacationRosterSource>();
  const competing = new Set<string>();
  for (const source of sources) {
    const month = `${source.roster.year}-${String(source.roster.month).padStart(2, '0')}`;
    if (!currentSource(source, ownerId) || source.competence !== month ||
      !validFinancialDay(month + '-01') || month < range.start.slice(0, 7) || month > range.end.slice(0, 7)) continue;
    const previous = selected.get(month);
    if (previous && previous.roster !== source.roster) competing.add(month);
    selected.set(month, source);
  }
  for (const [month, source] of selected) {
    if (!currentSource(source, ownerId)) continue;
    if (competing.has(month)) { ambiguous = true; continue; }
    // Canonical normalization can merge DO rows with conflicting pairing
    // codes. Inspect the original publication before that normalization.
    const observations = new Map<string, boolean>();
    const conflicts = new Set<string>();
    for (const day of source.roster.days) {
      const date = publishedIso(day);
      if (!date || date.slice(0, 7) !== month || date < range.start || date > range.end) continue;
      const vacation = declaresVacation(day), previous = observations.get(date);
      if (previous !== undefined && previous !== vacation) conflicts.add(date);
      observations.set(date, vacation);
    }
    if (!currentSource(source, ownerId)) continue;
    if (conflicts.size) ambiguous = true;
    if (![...observations].some(([date, vacation]) => vacation && !conflicts.has(date))) continue;
    try {
      const evidence = new Set<string>();
      for (const event of buildCanonicalRosterEvents(source.roster)) {
        if (event.kind !== 'rest' && event.kind !== 'duty') continue;
        const date = publishedIso(event.publishedDay);
        if (date && observations.get(date) === true && !conflicts.has(date) && declaresVacation(event.publishedDay)) evidence.add(date);
      }
      if (!currentSource(source, ownerId)) continue;
      for (const date of evidence) {
        const half = Number(date.slice(8, 10)) <= 15 ? 1 : 2;
        windows.set(month + ':' + half, { month, half });
      }
    } catch {
      // Unreadable roster data cannot generate a hint from normalized dates.
    }
  }
  return { windows: [...windows.values()].sort((a, b) => a.month.localeCompare(b.month) || a.half - b.half), ambiguous };
}
