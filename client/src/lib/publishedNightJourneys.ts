import type { CanonicalRosterEvent } from './canonicalRoster';
import { measureCanonicalDuty, publishedDutyEndpoints } from './canonicalDutyMeasurement';
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
    const endpoints = publishedDutyEndpoints(events, first.id);
    const measured = measure?.state === 'available';
    const start = measured ? Date.parse(measure.start!) : Math.min(...group.map(e => Date.parse(e.startDateTime)));
    const end = measured ? Date.parse(measure.end!) : Math.max(...group.map(e => Date.parse(e.endDateTime)));
    const availability = /^(HSB|HSBE|RES|ASB)$/.test(String(first.publishedDay.type));
    const operational = first.kind === 'flight' || (!availability && isOperational(first.publishedDay));
    // Preserve flight-interval eligibility; this change does not add APZ/cut to it.
    const timingKnown = first.kind === 'flight' || (endpoints.start !== null && endpoints.end !== null);
    const night = operational && (first.kind === 'flight'
      ? group.some(e => touchesNight(Date.parse(e.startDateTime), Date.parse(e.endDateTime)))
      : isNightDuty(first.publishedDay));
    return { journeyId: first.journeyId, date: first.date, start, end, night, operational, availability, measured, timingKnown, startProven: endpoints.start, endProven: endpoints.end };
  }).filter(j => (j.operational || j.availability) && Number.isFinite(j.start) && Number.isFinite(j.end) && j.end > j.start)
    .sort((a, b) => a.start - b.start || a.journeyId.localeCompare(b.journeyId));

  let current = 0, maxPossibleConsecutive = 0, busyEnd: number | null = null;
  let confirmedCurrent = 0, maxConsecutive = 0, minimumBusyEnd: number | null = null;
  const uncertainEnds: string[] = [];
  const blockingEnds = new Map<string, boolean>();
  const sequenceBoundaries: { journeyId: string; previousUncertainFlights: string[] }[] = [];
  const resets: { from: number; to: number; freeMinutes: number }[] = [];
  const sequence: typeof journeys = [];
  let longest: typeof journeys = [];
  const confirmedSequence: typeof journeys = [];
  let possibleLongest: typeof journeys = [];
  for (const journey of journeys) {
    // Only the previous release and this presentation delimit the free gap.
    // This journey's own release is irrelevant to proving that preceding gap.
    if (busyEnd !== null && !blockingEnds.size && journey.startProven !== null
      && journey.startProven - busyEnd >= resetAfterFreeHours * HOUR) {
      resets.push({ from: busyEnd, to: journey.startProven, freeMinutes: (journey.startProven - busyEnd) / 60_000 });
      current = 0; sequence.length = 0;
      confirmedCurrent = 0; confirmedSequence.length = 0;
    }
    // If unknown releases could hide a reset, continuity is not proven.
    // This lower-bound reset is NOT a proof of free time (resets stays unchanged).
    if (blockingEnds.size && (journey.startProven === null || minimumBusyEnd === null
      || journey.startProven - minimumBusyEnd >= resetAfterFreeHours * HOUR)) {
      confirmedCurrent = 0; confirmedSequence.length = 0;
    }
    // An open availability is retained until its end is actually published.
    // Later unrelated releases never silently close it or prove48h free.
    if (journey.endProven === null) { uncertainEnds.push(journey.journeyId); blockingEnds.set(journey.journeyId, journey.availability); }
    else busyEnd = Math.max(busyEnd ?? journey.endProven, journey.endProven);
    const minimumEnd = journey.endProven ?? (journey.availability ? journey.startProven : journey.end);
    if (minimumEnd !== null) minimumBusyEnd = Math.max(minimumBusyEnd ?? minimumEnd, minimumEnd);
    if (!journey.operational || !journey.timingKnown) continue;
    if (!journey.night) {
      current = 0; sequence.length = 0;
      confirmedCurrent = 0; confirmedSequence.length = 0;
      if (journey.measured) {
        // A complete daytime journey terminates the prior night sequence.
        // Its verified release anchors subsequent gaps. Historical missing
        // flight releases remain unknown, but cannot join that new sequence.
        // This does not infer closure/activation of an open availability.
        const previousUncertainFlights = [...blockingEnds].filter(([, availability]) => !availability).map(([id]) => id);
        for (const id of previousUncertainFlights) blockingEnds.delete(id);
        if (previousUncertainFlights.length) sequenceBoundaries.push({ journeyId: journey.journeyId, previousUncertainFlights });
      }
      continue;
    }
    current += 1; sequence.push(journey);
    if (current > maxPossibleConsecutive) { maxPossibleConsecutive = current; possibleLongest = [...sequence]; }
    confirmedCurrent += 1; confirmedSequence.push(journey);
    if (confirmedCurrent > maxConsecutive) { maxConsecutive = confirmedCurrent; longest = [...confirmedSequence]; }
  }
  return { maxConsecutive, maxPossibleConsecutive, indeterminate: maxConsecutive !== maxPossibleConsecutive, journeys, longest, possibleLongest, resets, uncertainEnds, blockingEnds: [...blockingEnds.keys()], sequenceBoundaries };
}
