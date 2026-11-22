import type { CrewRoster, RosterDay } from './pdfParser';
import { rosterDisplayIso } from './rosterDisplayDate';

type OperationalDay = RosterDay & { continuityInferred?: boolean };
const dateKey = (day: RosterDay) => rosterDisplayIso({ day });
const value = (input: unknown) => String(input ?? '').trim().toUpperCase();
function activity(day: RosterDay): string {
  // Operational evidence only. Names/raw PDF text and unrelated finance metadata
  // neither authorize a different activity nor create a public conflict payload.
  return JSON.stringify([value(day.type), value(day.pairingCode), value(day.dutyReport), value(day.dutyDebrief),
    (day.legs || []).map(leg => [value(leg.flightNumber), value(leg.origin), value(leg.destination),
      value(leg.departureTime), value(leg.arrivalTime), value(leg.workType)])]);
}
function signatures(days: RosterDay[]) { return [...new Set(days.map(activity))].sort().join('\n'); }

/** The display window is already owner/publication fenced by its reader. Keep
 * that window intact for historical navigation, while active published civil
 * dates remain sovereign for HOME's automatic operational selection. Unknown or
 * inferred dates never manufacture authority. Uncovered dates retain continuity.
 * This is a pure projection: never saves, deletes, revises or merges the sources.
 */
export function homeOperationalRoster(primary: CrewRoster, display: CrewRoster): { roster: CrewRoster; conflictDates: string[] } {
  if (primary === display) return { roster: primary, conflictDates: [] };
  const active = new Map<string, RosterDay[]>();
  for (const day of primary.days || []) {
    const key = dateKey(day);
    if (!key || (day as OperationalDay).continuityInferred === true) continue;
    active.set(key, [...(active.get(key) || []), day]);
  }
  const displayed = new Map<string, RosterDay[]>();
  for (const day of display.days || []) {
    const key = dateKey(day);
    if (key && active.has(key) && (day as OperationalDay).continuityInferred !== true) displayed.set(key, [...(displayed.get(key) || []), day]);
  }
  const conflictDates = [...active.keys()].filter(key => displayed.has(key)
    && signatures(active.get(key)!) !== signatures(displayed.get(key)!)).sort();
  const days = (display.days || []).filter(day => { const key = dateKey(day); return !key || !active.has(key); });
  days.push(...[...active.values()].flat());
  return { roster: { ...display, days }, conflictDates };
}
