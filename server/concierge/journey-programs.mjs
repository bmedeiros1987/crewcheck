import { buildCanonicalRosterEvents } from './generated/canonicalRoster.mjs';

const MINUTE = 60_000;
function clockMinutes(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
function instant(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

// This is a consumer projection, not a journey classifier. The canonical
// engine alone decides identity, chronology, ordering and real boundaries.
export function projectConciergeJourneyPrograms(events = [], legacyRecords = []) {
  const groups = new Map();
  for (const event of events) {
    if (event.kind !== 'flight') continue;
    if (!event.journeyId || !event.leg || instant(event.startDateTime) === null || instant(event.endDateTime) === null) {
      throw new Error('[concierge-journey] incomplete canonical flight');
    }
    const group = groups.get(event.journeyId) || [];
    group.push(event);
    groups.set(event.journeyId, group);
  }
  const records = legacyRecords.filter((record) => !record.legs?.length);
  for (const [journeyId, group] of groups) {
    const ordered = [...group].sort((a, b) => instant(a.startDateTime) - instant(b.startDateTime));
    const first = ordered[0];
    const last = ordered.at(-1);
    const presentation = clockMinutes(first.presentation);
    const departure = clockMinutes(first.departure);
    const arrival = clockMinutes(last.arrival);
    if (presentation === null || departure === null || arrival === null) {
      throw new Error('[concierge-journey] invalid canonical clock');
    }
    // Lift the engine's already-selected presentation clock to its canonical
    // departure instant. No new presentation or journey boundary is inferred.
    const lead = (departure - presentation + 1440) % 1440;
    const start = new Date(instant(first.startDateTime) - lead * MINUTE);
    // A day's debrief belongs here only when this journey owns its final leg.
    // A later journey in the same published day must keep its own debrief.
    const debrief = last.legIndex === last.legCount - 1
      ? clockMinutes(last.publishedDay?.dutyDebrief)
      : null;
    const endKind = debrief === null ? 'arrival' : 'duty-debrief';
    const endTime = debrief === null ? last.arrival : last.publishedDay.dutyDebrief;
    const end = new Date(instant(last.endDateTime) + (debrief === null ? 0 : (debrief - arrival + 1440) % 1440) * MINUTE);
    if (end.getTime() < start.getTime()) throw new Error('[concierge-journey] reversed canonical program');
    const legs = ordered.map((event) => event.leg);
    const day = {
      ...first.publishedDay,
      legs,
      dutyReport: first.presentation,
      dutyDebrief: endKind === 'duty-debrief' ? endTime : null,
    };
    records.push({
      day, legs, code: first.flightNumber || 'VOO', journeyId,
      startTime: first.presentation, endTime, start, end, endKind,
      finalArrivalTime: last.arrival,
      finalArrivalDateTime: last.endDateTime,
      canonicalEventIds: ordered.map((event) => event.id),
    });
  }
  return records.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function conciergeJourneyProgramRecords(roster = {}, legacyRecords = []) {
  return projectConciergeJourneyPrograms(buildCanonicalRosterEvents(roster), legacyRecords);
}

export function conciergeNextJourneyProgram(roster = {}, legacyRecords = [], now = new Date()) {
  const records = conciergeJourneyProgramRecords(roster, legacyRecords);
  return records.find((record) => record.start <= now && record.end >= now)
    || records.find((record) => record.start > now)
    || null;
}

export function conciergeJourneyEndText(record) {
  if (record?.endKind === 'arrival') return `Última chegada prevista: ${record.endTime}. Fim publicado da jornada não confirmado.`;
  return `Fim publicado da programação: ${record?.endTime || 'a confirmar'}.`;
}
