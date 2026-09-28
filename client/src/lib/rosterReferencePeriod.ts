export type RosterReferencePeriodLike = {
  month?: number | null;
  year?: number | null;
};

export type RosterReferenceDayLike = {
  date?: string | null;
  month?: number | null;
  year?: number | null;
};

export type RosterReferenceEventLike = {
  date?: Date | string | null;
  canonical?: { startDateTime?: string | null } | null;
};

export type RosterReferencePeriod = { month: number; year: number };

const MONTHS: Record<string, number> = {
  JAN: 1, FEV: 2, FEB: 2, MAR: 3, ABR: 4, APR: 4,
  MAI: 5, MAY: 5, JUN: 6, JUL: 7, AGO: 8, AUG: 8,
  SET: 9, SEP: 9, OUT: 10, OCT: 10, NOV: 11, DEZ: 12, DEC: 12,
};

function validPeriod(month: unknown, year: unknown): RosterReferencePeriod | null {
  const parsedMonth = Number(month);
  const parsedYear = Number(year);
  if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) return null;
  if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2200) return null;
  return { month: parsedMonth, year: parsedYear };
}

function datePeriod(value: unknown): RosterReferencePeriod | null {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    return { month: value.getMonth() + 1, year: value.getFullYear() };
  }
  const raw = String(value || '').trim();
  let match = raw.match(/^\d{1,2}\/(\d{1,2})\/(\d{4})$/);
  if (match) return validPeriod(match[1], match[2]);
  match = raw.match(/^\d{1,2}-([A-Za-z]{3})-(\d{4})$/);
  if (match) return validPeriod(MONTHS[match[1].toUpperCase()], match[2]);
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return null;
  return { month: parsed.getMonth() + 1, year: parsed.getFullYear() };
}

export function rosterReferencePeriod(roster: RosterReferencePeriodLike): RosterReferencePeriod | null {
  return validPeriod(roster?.month, roster?.year);
}

export function dayBelongsToRosterReferencePeriod(
  day: RosterReferenceDayLike,
  roster: RosterReferencePeriodLike,
): boolean {
  const reference = rosterReferencePeriod(roster);
  if (!reference) return true;
  const period = validPeriod(day?.month, day?.year) || datePeriod(day?.date);
  return Boolean(period && period.month === reference.month && period.year === reference.year);
}

export function eventBelongsToRosterReferencePeriod(
  event: RosterReferenceEventLike,
  roster: RosterReferencePeriodLike,
): boolean {
  const reference = rosterReferencePeriod(roster);
  if (!reference) return true;
  const period = datePeriod(event?.canonical?.startDateTime) || datePeriod(event?.date);
  return Boolean(period && period.month === reference.month && period.year === reference.year);
}

export function filterDaysToRosterReferencePeriod<T extends RosterReferenceDayLike>(
  days: readonly T[],
  roster: RosterReferencePeriodLike,
): T[] {
  return days.filter((day) => dayBelongsToRosterReferencePeriod(day, roster));
}

export function filterEventsToRosterReferencePeriod<T extends RosterReferenceEventLike>(
  events: readonly T[],
  roster: RosterReferencePeriodLike,
): T[] {
  return events.filter((event) => eventBelongsToRosterReferencePeriod(event, roster));
}
