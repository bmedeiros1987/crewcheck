export const WELLHUB_SNAPSHOT_MAX_AGE_DAYS = 90;
const ORDER = ['digital', 'starter', 'basic', 'basic-plus', 'silver', 'silver-plus', 'gold', 'gold-plus', 'platinum', 'diamond', 'diamond-plus'];
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function normalizeWellhubPlan(value) {
  return normalize(value).replace(/\s*\+\s*$/, '-plus').replace(/[\s_]+/g, '-');
}
export function wellhubSnapshotAccess(partner, userPlan, activity = '', now = new Date()) {
  const checked = Date.parse(partner.verifiedAt);
  if (!Number.isFinite(checked) || now.getTime() - checked > WELLHUB_SNAPSHOT_MAX_AGE_DAYS * 86400000 || checked > now.getTime()) return 'unknown';
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
