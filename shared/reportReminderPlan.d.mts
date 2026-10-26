export const REPORT_REMINDER_LEADS: readonly number[];
export const REPORT_REMINDER_GROUP: 'report:next';
export const REPORT_REMINDER_HORIZON_MS: number;
export type ReportReminderEvent = { id: string; kind: string; startAt: number | string; presentation: string };
export type ReportReminderPreferences = { leadMinutes: number | null; atReport: boolean; channel: 'alarm' | 'default' };
export type ReportReminderJob = Readonly<{ id: string; at: number; channel: 'alarm' | 'default'; title: string; body: string }>;
export function reportInstant(event: Partial<ReportReminderEvent>): number | null;
export function planReportReminders(events: ReportReminderEvent[], preferences: ReportReminderPreferences, now: number):
  Readonly<{ ok: true; group: 'report:next'; jobs: readonly ReportReminderJob[] }> | Readonly<{ ok: false; reason: string }>;
