import { planReportReminders, type ReportReminderEvent, type ReportReminderPreferences } from '@shared/reportReminderPlan.mjs';
import { replaceLocalAlarms, type LocalAlarmResult } from './localAlarms';

/** Hard OFF: no caller arms report reminders while false. Wiring into the roster screen is a separate change. */
export const REPORT_REMINDERS_ENABLED = false;

/** Replaces the whole "report:next" group with the next 7 days. A failed plan never clears existing alarms. */
export function syncReportReminders(events: ReportReminderEvent[], preferences: ReportReminderPreferences, now = Date.now()): LocalAlarmResult | null {
  if (!REPORT_REMINDERS_ENABLED) return null;
  const plan = planReportReminders(events, preferences, now);
  if (!plan.ok) return { ok: false, reason: plan.reason, armed: [], exact: false };
  return replaceLocalAlarms(plan.group, plan.jobs.map((job) => ({ ...job })));
}
