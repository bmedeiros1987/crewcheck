/** Device-local, account-owned dispositions. No roster, token or document is saved. */
export type AlertIdentity = { occurrence: string; version: string };
export type AlertReviewRecord = AlertIdentity & {
  state: 'dismissed' | 'reviewed'; at: string; title: string; date?: string; category?: string;
};
export const ALERT_REVIEW_EVENT = 'crewcheck:alert-review-changed';
export function alertDigest(value: unknown): string {
  const text = JSON.stringify(value); let a = 2166136261, b = 3335557771;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b ^ text.charCodeAt(i), 2246822519); }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
export function alertAccount(): string | null {
  try {
    if (!localStorage.getItem('crewcheck_auth_token')) return null;
    const user = JSON.parse(localStorage.getItem('crewcheck_auth_user') || 'null');
    // A mutable display name/email must never stand in for an account ID.
    return user?.id ? alertDigest(['account', String(user.id)]) : null;
  } catch { return null; }
}
const key = (owner: string) => 'crewcheck:alert-review:v1:' + owner;
export function readAlertReviews(): AlertReviewRecord[] {
  const owner = alertAccount(); if (!owner) return [];
  try {
    const rows = JSON.parse(localStorage.getItem(key(owner)) || '[]');
    return Array.isArray(rows) ? rows.filter(row => typeof row?.occurrence === 'string' && typeof row?.version === 'string'
      && ['dismissed', 'reviewed'].includes(row.state) && typeof row.at === 'string' && Number.isFinite(Date.parse(row.at)) && typeof row.title === 'string') : [];
  } catch { return []; }
}
export function alertIsReviewed(identity: AlertIdentity): boolean {
  return readAlertReviews().some(row => row.occurrence === identity.occurrence && row.version === identity.version);
}
export function saveAlertReview(record: Omit<AlertReviewRecord, 'at'>, expectedOwner: string | null): boolean {
  if (!expectedOwner || expectedOwner !== alertAccount()) return false;
  try {
    const rows = readAlertReviews().filter(row => row.occurrence !== record.occurrence || row.version !== record.version);
    rows.push({ ...record, title: record.title.slice(0, 240), at: new Date().toISOString() });
    localStorage.setItem(key(expectedOwner), JSON.stringify(rows));
    window.dispatchEvent(new Event(ALERT_REVIEW_EVENT)); return true;
  } catch { return false; }
}
/** Engine IDs are positional. Neither localized UI copy nor whole-roster hashes are identity. */
export function complianceAlertIdentity(alert: any, roster: { year?: number; month?: number; days?: any[] }): AlertIdentity {
  const occurrence = alertDigest(['compliance', roster.year, roster.month, alert.code || alert.title,
    alert.date || '', alert.journeyId || '', alert.programId || '', alert.legalReference || '']);
  const dates = new Set([alert.date, ...String([alert.details || '', alert.evidence || ''].join(' ')).matchAll(/\b\d{2}\/\d{2}\/\d{4}\b/g)]
    .flatMap(value => typeof value === 'string' ? [value] : Array.isArray(value) ? [value[0]] : []));
  const relevant = (roster.days || []).filter(day => dates.has(day.date)).map(day => [day.date, day.type, day.dutyReport, day.dutyDebrief, day.dutyReportSource, day.dutyDebriefSource,
    (day.legs || []).map((leg: any) => [leg.flightNumber, leg.origin, leg.destination, leg.departureTime, leg.arrivalTime, leg.presentationTime, leg.workType])]);
  const version = alertDigest([alert.severity, alert.classification, alert.description, alert.details, alert.evidence, alert.coverage, relevant]);
  return { occurrence, version };
}
