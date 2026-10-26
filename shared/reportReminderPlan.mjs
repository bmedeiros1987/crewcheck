// Local reminders before report (apresentação). Pure: the caller supplies events and
// the clock. The canonical roster publishes its civil clock in UTC-03; this follows
// the same rule as Home's eventClockDate and never reads the device zone.

export const REPORT_REMINDER_LEADS = Object.freeze([30, 45, 60, 90, 120, 180]);
export const REPORT_REMINDER_GROUP = 'report:next';
export const REPORT_REMINDER_HORIZON_MS = 7 * 86_400_000;
const MAX_JOBS = 16;
const CLOCK = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const HOUR = 3_600_000;

/** Presentation instant for a roster event, or null when its clock or start is unusable. */
export function reportInstant(event) {
  const match = String(event?.presentation || '').trim().match(CLOCK);
  const base = typeof event?.startAt === 'number' ? event.startAt : Date.parse(event?.startAt);
  if (!match || !Number.isFinite(base)) return null;
  const civilDate = new Date(base - 3 * HOUR).toISOString().slice(0, 10);
  let instant = Date.parse(`${civilDate}T${match[1].padStart(2, '0')}:${match[2]}:00-03:00`);
  // A flight's report belongs to the same duty: a clock later than the departure is the previous day.
  if (event.kind === 'flight' && instant > base) instant -= 24 * HOUR;
  return Number.isFinite(instant) ? instant : null;
}

const brasilia = (at) => new Date(at - 3 * HOUR).toISOString().slice(11, 16);

/**
 * @param {{id:string,kind:string,startAt:number|string,presentation:string}[]} events
 * @param {{leadMinutes:number|null,atReport:boolean,channel:'alarm'|'default'}} preferences
 */
export function planReportReminders(events, preferences, now) {
  if (!Array.isArray(events) || !preferences || !Number.isSafeInteger(now)) return Object.freeze({ ok: false, reason: 'invalid-input' });
  const lead = preferences.leadMinutes;
  if (lead !== null && !REPORT_REMINDER_LEADS.includes(lead)) return Object.freeze({ ok: false, reason: 'invalid-lead' });
  if (typeof preferences.atReport !== 'boolean') return Object.freeze({ ok: false, reason: 'invalid-at-report' });
  if (preferences.channel !== 'alarm' && preferences.channel !== 'default') return Object.freeze({ ok: false, reason: 'invalid-channel' });
  // Several legs of one duty share a report: one instant, one set of reminders.
  const reports = new Set();
  for (const event of events) {
    if (event?.kind !== 'flight' && event?.kind !== 'duty') continue;
    const at = reportInstant(event);
    if (at !== null && at > now && at <= now + REPORT_REMINDER_HORIZON_MS) reports.add(at);
  }
  const jobs = [];
  for (const at of [...reports].sort((a, b) => a - b)) {
    const stamp = new Date(at).toISOString().slice(0, 16).replace(/[^0-9T]/g, '');
    if (lead !== null && at - lead * 60_000 > now) jobs.push({ id: `lead:${stamp}`, at: at - lead * 60_000, channel: preferences.channel,
      title: `Apresentação em ${lead} min`, body: `Apresentação às ${brasilia(at)} (Brasília). Confira a escala no CrewCheck.` });
    if (preferences.atReport) jobs.push({ id: `report:${stamp}`, at, channel: preferences.channel,
      title: 'Hora da apresentação', body: `Apresentação às ${brasilia(at)} (Brasília).` });
  }
  jobs.sort((a, b) => a.at - b.at);
  return Object.freeze({ ok: true, group: REPORT_REMINDER_GROUP, jobs: Object.freeze(jobs.slice(0, MAX_JOBS).map(Object.freeze)) });
}
