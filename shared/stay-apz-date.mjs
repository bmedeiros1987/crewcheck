import { stayInstant, stayLocalInstant } from './stay-edit-plan.mjs';

const localDay = (epoch, timeZone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(epoch).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

/** A calendar-only stay ends at 23:59 by construction, not at hotel departure.
 * Extend only to the immediately following, uniquely identified flight from
 * this airport. Exact continuity or published end times remain authoritative. */
export function stayApzBounds(event, events = []) {
  const start = stayInstant(event?.canonical?.startDateTime), originalEnd = stayInstant(event?.canonical?.endDateTime);
  if (events.filter(e => e?.id === event?.id).length > 1) return null;
  if (event?.kind !== 'stay' || start === null || originalEnd === null || originalEnd <= start) return null;
  let end = originalEnd;
  const day = event.canonical?.publishedDay;
  // canonicalRoster.dateAt uses the published Brazilian roster day (+03 UTC).
  // Require its exact full-day sentinel as well as absence of explicit bounds.
  const calendarOnly = originalEnd - start === 86340000
    && new Date(start).toISOString().slice(11) === '03:00:00.000Z'
    && new Date(originalEnd).toISOString().slice(11) === '02:59:00.000Z';
  if (day && calendarOnly && !day.dutyReport && !day.dutyDebrief && !day.continuityStart && !day.continuityEnd && !day.continuityInferred) {
    const location = event.destination || event.origin;
    const next = events.filter(e => e?.id !== event.id && stayInstant(e?.canonical?.startDateTime) > start)
      .sort((a, b) => Date.parse(a.canonical.startDateTime) - Date.parse(b.canonical.startDateTime));
    const candidate = next[0], at = stayInstant(candidate?.canonical?.startDateTime);
    if (location && candidate?.kind === 'flight' && candidate.origin === location && at !== null
      && at > originalEnd && at - originalEnd <= 86400000
      && next.filter(e => stayInstant(e.canonical.startDateTime) === at).length === 1
      && events.filter(e => e.id === candidate.id).length === 1) end = at;
  }
  return { start, end };
}

/** Suggest a date, never an APZ clock or a scheduling action. Canonical bounds
 * and the hotel zone are mandatory; no browser-zone or tomorrow fallback. */
export function inferStayApzDate({ event, events = [], clock, timeZone, now }) {
  const bounds = stayApzBounds(event, events);
  if (!bounds || !Number.isFinite(now)) return null;
  const { start, end } = bounds;
  try {
    // A past occurrence stays historical. Never silently move it to the present.
    if (end <= now) return null;
    const firstDay = localDay(Math.max(start, now), timeZone);
    const lastDay = localDay(end, timeZone);
    const first = Date.parse(`${firstDay}T00:00:00Z`), last = Date.parse(`${lastDay}T00:00:00Z`);
    if (last - first > 31 * 86400000) return null;
    for (let day = first; day <= last; day += 86400000) {
      const date = new Date(day).toISOString().slice(0, 10);
      const at = stayLocalInstant(date, clock, timeZone);
      if (at !== null && at > start && at > now && at <= end) return date;
    }
  } catch { /* Invalid/missing hotel zone needs an explicit date. */ }
  return null;
}
