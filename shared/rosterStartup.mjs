// Ordering is upload chronology, never nominal roster month or active flag.
export function newestImports(items) {
  const stamp = item => Date.parse(item.uploadedAt || item.storageUploadedAt || item.createdAt || '') || 0;
  return [...items].filter(item => item && item.id && !item.deletedAt && !['invalid', 'failed', 'deleted'].includes(String(item.importStatus || '').toLowerCase()))
    .sort((a, b) => stamp(b) - stamp(a) || Number(b.version || 0) - Number(a.version || 0) || String(b.id).localeCompare(String(a.id)));
}
export function startupCanCommit(start, current) {
  return Boolean(start.owner && start.token && start.owner === current.owner && start.token === current.token && start.revision === current.revision && !current.cleared);
}
export function pastRosterPeriod(roster, now = new Date()) {
  const year = Number(roster?.year), month = Number(roster?.month);
  return year > 0 && month >= 1 && month <= 12 && year * 12 + month < now.getFullYear() * 12 + now.getMonth() + 1;
}
