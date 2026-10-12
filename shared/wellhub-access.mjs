export const WELLHUB_SNAPSHOT_MAX_AGE_DAYS = 90;
const ORDER = ['digital', 'starter', 'basic', 'basic-plus', 'silver', 'silver-plus', 'gold', 'gold-plus', 'platinum', 'diamond', 'diamond-plus'];
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function normalizeWellhubPlan(value) {
  return normalize(value).replace(/\s*\+\s*$/, '-plus').replace(/[\s_]+/g, '-');
}
export function wellhubSnapshotFreshness(partner, now = new Date()) {
  const raw = String(partner.verifiedAt || '').trim();
  const calendar = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  const day = calendar ? new Date(`${calendar[1]}-${calendar[2]}-${calendar[3]}T00:00:00Z`) : null;
  const calendarValid = calendar && Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === calendar[0].slice(0, 10);
  const checked = calendarValid ? Date.parse(raw) : NaN;
  const current = now.getTime();
  const until = new Date(checked + WELLHUB_SNAPSHOT_MAX_AGE_DAYS * 86400000);
  if (!Number.isFinite(checked) || !Number.isFinite(current) || !Number.isFinite(until.getTime())) {
    return { snapshotStatus: 'invalid', snapshotValidUntil: '' };
  }
  if (checked > current) return { snapshotStatus: 'future', snapshotValidUntil: '' };
  return { snapshotStatus: current > until.getTime() ? 'expired' : 'valid', snapshotValidUntil: until.toISOString() };
}
export function wellhubSnapshotAccess(partner, userPlan, activity = '', now = new Date()) {
  if (wellhubSnapshotFreshness(partner, now).snapshotStatus !== 'valid') return 'unknown';
  const userRank = ORDER.indexOf(normalizeWellhubPlan(userPlan));
  const minimumRank = ORDER.indexOf(normalizeWellhubPlan(partner.minimumPlan));
  if (userRank < 0 || minimumRank < 0) return 'unknown';
  if (userRank < minimumRank) return 'excluded';
  if (partner.accessConditions) return 'unknown';
  if (activity && partner.activityPlans?.length) {
    const requested = normalize(activity);
    const rule = partner.activityPlans.find(item => normalize(item.split('|')[0]) === requested);
    if (!rule) return 'unknown';
    const rank = ORDER.indexOf(rule.split('|')[1]);
    if (rank < 0) return 'unknown';
    return userRank >= rank ? 'included' : 'excluded';
  }
  // Page-wide activity mentions do not establish an activity's required tier.
  if (activity) return 'unknown';
  return 'included';
}
