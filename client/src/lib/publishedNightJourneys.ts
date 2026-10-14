import type { CanonicalRosterEvent } from './canonicalRoster';
import { measureCanonicalDuty } from './canonicalDutyMeasurement';
import type { RosterDay } from './pdfParser';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Same published BRT 00:00–06:00 window; no device-local date setters. */
function touchesNight(start: number, end: number): boolean {
  const civil = new Date(start - 3 * HOUR);
  civil.setUTCHours(0, 0, 0, 0);
  for (let day = civil.getTime(); day < end - 3 * HOUR; day += DAY) {
    const from = day + 3 * HOUR;
    if (start < from + 6 * HOUR && end > from) return true;
  }
  return false;
}

/** Counts ordered published journeys, including non-night journeys as breaks.
 * Availability still blocks a free-time reset, but is not a worked journey.
 * Classification and the reset threshold are supplied by the existing engine.
 */
export function publishedNightJourneySequence(
  events: readonly CanonicalRosterEvent[],
  isOperational: (day: RosterDay) => boolean,
  resetAfterFreeHours: number,
  isNightDuty: (day: RosterDay) => boolean,
) {
  const groups = new Map<string, CanonicalRosterEvent[]>();
  for (const event of events) {
    if (!['flight', 'duty'].includes(event.kind) || !event.journeyId) continue;
    const group = groups.get(event.journeyId) || [];
    group.push(event);
    groups.set(event.journeyId, group);
  }
  const journeys = [...groups.values()].map(group => {
    const first = group[0];
    const measure = measureCanonicalDuty(events, first.id);
    const measured = measure?.state === 'available';
    const start = measured ? Date.parse(measure.start!) : Math.min(...group.map(e => Date.parse(e.startDateTime)));
    const end = measured ? Date.parse(measure.end!) : Math.max(...group.map(e => Date.parse(e.endDateTime)));
    const availability = /^(HSB|HSBE|RES|ASB)$/.test(String(first.publishedDay.type));
    const operational = first.kind === 'flight' || (!availability && isOperational(first.publishedDay));
    // Preserve flight-interval eligibility; this change does not add APZ/cut to it.
    const timingKnown = first.kind === 'flight' || Boolean(first.publishedDay.dutyReport && first.publishedDay.dutyDebrief);
    const night = operational && (first.kind === 'flight'
      ? group.some(e => touchesNight(Date.parse(e.startDateTime), Date.parse(e.endDateTime)))
      : isNightDuty(first.publishedDay));
    return { journeyId: first.journeyId, date: first.date, start, end, night, operational, availability, measured, timingKnown };
  }).filter(j => (j.operational || j.availability) && j.timingKnown && Number.isFinite(j.start) && Number.isFinite(j.end) && j.end > j.start)
    .sort((a, b) => a.start - b.start || a.journeyId.localeCompare(b.journeyId));

  let current = 0, maxConsecutive = 0, busyEnd: number | null = null, busyEndMeasured = false;
  const sequence: typeof journeys = [];
  let longest: typeof journeys = [];
  for (const journey of journeys) {
    if (busyEnd !== null && busyEndMeasured && journey.measured && journey.start - busyEnd >= resetAfterFreeHours * HOUR) {
      current = 0; sequence.length = 0;
    }
    if (busyEnd === null || journey.end >= busyEnd) { busyEnd = journey.end; busyEndMeasured = journey.measured; }
    else if (!journey.measured) busyEndMeasured = false;
    if (!journey.operational) continue;
    if (!journey.night) { current = 0; sequence.length = 0; continue; }
    current += 1; sequence.push(journey);
    if (current > maxConsecutive) { maxConsecutive = current; longest = [...sequence]; }
  }
  return { maxConsecutive, journeys, longest };
}
