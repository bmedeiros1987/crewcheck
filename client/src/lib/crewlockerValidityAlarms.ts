import { DEFAULT_ALERT_DAYS, exactDay, isValidityDate, normalizeAlertDays, type ValidityEntry } from './crewlockerValidity';
import { replaceLocalAlarms, type LocalAlarmJob, type LocalAlarmResult } from './localAlarms';

/** Hard OFF: the locker never touches native alarms while false. */
export const VALIDITY_ALARMS_ENABLED = false;
export const VALIDITY_ALARM_GROUP = 'validity:crewlocker';
/** Native groups hold at most 16 jobs; the soonest days are kept and the window slides on every unlock. */
export const VALIDITY_ALARM_WINDOW = 16;
const DAY = 86_400_000;
// Same rule as prepareValidityExternalNotice: no label, class, date or identifier leaves the locker.
const TITLE = 'CrewLocker';
const BODY = 'Há uma validade para revisar no CrewLocker. Abra o aplicativo.';

type LockerRecord = { validities?: ValidityEntry[]; alertDays?: number[] };
const civil = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);

/** Future local alarms for the informed milestones: one per civil day at `hour` on this device. */
export function validityAlarmJobs(records: LockerRecord[], now: Date, hour = 9): LocalAlarmJob[] {
  const days = new Set<number>();
  for (const record of records) {
    let thresholds: number[];
    try { thresholds = normalizeAlertDays(record.alertDays || DEFAULT_ALERT_DAYS); } catch { continue; }
    for (const entry of record.validities || []) {
      // Same eligibility as the in-app notices: current, confirmed, not marked invalid, with a date.
      if (entry.supersededBy || !entry.confirmed || entry.sourceCheck === 'invalid' || entry.signatureCheck === 'invalid') continue;
      if (!isValidityDate(entry.expiry) || (entry.expiry.kind !== 'exact' && entry.expiry.kind !== 'month')) continue;
      // Month-only validities plan from the first day of the month (conservative, never the official day).
      const start = exactDay(entry.expiry.kind === 'month' ? `${entry.expiry.value}-01` : entry.expiry.value);
      if (start === null) continue;
      for (const threshold of thresholds) days.add(start - threshold);
    }
  }
  const jobs: LocalAlarmJob[] = [];
  for (const day of [...days].sort((a, b) => a - b)) {
    const [year, month, date] = civil(day).split('-').map(Number);
    const at = new Date(year, month - 1, date, hour, 0, 0, 0);
    if (at.getDate() !== date || at.getHours() !== hour || at.getTime() <= now.getTime()) continue;
    jobs.push({ id: `day:${civil(day)}`, at: at.getTime(), channel: 'default', title: TITLE, body: BODY });
    if (jobs.length === VALIDITY_ALARM_WINDOW) break;
  }
  return jobs;
}

/** Replaces the locker's alarm group with the current window. Callers only run it with the locker unlocked:
 * a locked locker shows no records, which is not the same as having no validities. */
export function syncValidityAlarms(records: LockerRecord[], now = new Date()): LocalAlarmResult | null {
  if (!VALIDITY_ALARMS_ENABLED) return null;
  return replaceLocalAlarms(VALIDITY_ALARM_GROUP, validityAlarmJobs(records, now));
}
