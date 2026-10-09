export type RosterLayout = 'cards' | 'list' | 'aims' | 'calendar' | 'document';
export type RosterZoom = 'month' | 'day';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function rosterLayoutKey(accountId: string | null | undefined): string | null {
  return accountId?.trim() ? `crewcheck:roster-layout:v1:${encodeURIComponent(accountId.trim())}` : null;
}

export function readRosterLayout(storage: PreferenceStorage, accountId: string | null | undefined): RosterLayout {
  const key = rosterLayoutKey(accountId);
  if (!key) return 'cards';
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    return value?.version === 1 && ['cards', 'list', 'aims', 'calendar', 'document'].includes(value.layout) ? value.layout as RosterLayout : 'cards';
  } catch { return 'cards'; }
}

export function saveRosterLayout(storage: PreferenceStorage, accountId: string | null | undefined, layout: RosterLayout, zoom?: RosterZoom): boolean {
  const key = rosterLayoutKey(accountId);
  if (!key || !['cards', 'list', 'aims', 'calendar', 'document'].includes(layout) || (zoom !== undefined && !['month', 'day'].includes(zoom))) return false;
  try {
    storage.setItem(key, JSON.stringify({ version: 1, layout, zoom: zoom || readRosterZoom(storage, accountId) }));
    return true;
  } catch { return false; }
}

export function readRosterZoom(storage: PreferenceStorage, accountId: string | null | undefined): RosterZoom {
  const key = rosterLayoutKey(accountId);
  if (!key) return 'month';
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    return value?.version === 1 && value.zoom === 'day' ? 'day' : 'month';
  } catch { return 'month'; }
}
