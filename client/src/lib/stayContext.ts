export type StayContextCandidate = {
  id: string;
  date: Date;
  startAt?: Date | string | null;
  endAt?: Date | string | null;
};

function validDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function startOfLocalDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function compareId(a: StayContextCandidate, b: StayContextCandidate): number {
  return String(a.id).localeCompare(String(b.id));
}

/**
 * Selects the stay that best matches the user's current temporal context.
 *
 * Priority:
 * 1. an explicitly bounded stay containing `now`;
 * 2. a stay whose roster date is today;
 * 3. the nearest future stay;
 * 4. the most recent past stay.
 *
 * The input array is never mutated and original collection order is never
 * used as the contextual selection rule.
 */
export function selectContextualStay<T extends StayContextCandidate>(
  stays: readonly T[],
  now: Date = new Date(),
): T | null {
  if (!stays.length) return null;

  const timestamp = now.getTime();
  const today = startOfLocalDay(now).getTime();

  const normalized = stays
    .map((stay) => {
      const rosterDate = validDate(stay.date);
      if (!rosterDate) return null;
      const startAt = validDate(stay.startAt) || rosterDate;
      const endAt = validDate(stay.endAt);
      return {
        stay,
        rosterDay: startOfLocalDay(rosterDate).getTime(),
        start: startAt.getTime(),
        end: endAt?.getTime() ?? null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (!normalized.length) return null;

  const active = normalized
    .filter((item) => item.end !== null && item.start <= timestamp && timestamp < item.end)
    .sort((a, b) => b.start - a.start || compareId(a.stay, b.stay))[0];
  if (active) return active.stay;

  const todayStay = normalized
    .filter((item) => item.rosterDay === today)
    .sort((a, b) => a.start - b.start || compareId(a.stay, b.stay))[0];
  if (todayStay) return todayStay.stay;

  const future = normalized
    .filter((item) => item.start > timestamp)
    .sort((a, b) => a.start - b.start || compareId(a.stay, b.stay))[0];
  if (future) return future.stay;

  return normalized.sort((a, b) => b.start - a.start || compareId(a.stay, b.stay))[0]?.stay || null;
}
