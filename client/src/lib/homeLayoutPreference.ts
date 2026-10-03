export type HomeMode = 'standard' | 'personalized' | 'mixed' | 'roster' | 'shortcuts' | 'roster-mixed';
export type HomeSlotId = 'summary' | 'finance' | 'next' | 'limits' | 'smart';

export type HomeLayoutPreference = {
  version: 1;
  mode: HomeMode;
  order: HomeSlotId[];
  visible: HomeSlotId[];
};

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const HOME_SLOT_ORDER: HomeSlotId[] = ['summary', 'finance', 'next', 'limits', 'smart'];
export const REQUIRED_HOME_SLOTS: HomeSlotId[] = ['summary', 'next', 'limits'];

export const DEFAULT_HOME_LAYOUT: HomeLayoutPreference = {
  version: 1,
  mode: 'standard',
  order: [...HOME_SLOT_ORDER],
  visible: [...HOME_SLOT_ORDER],
};

export function homeLayoutKey(accountId: string | null | undefined): string | null {
  return accountId?.trim() ? `crewcheck:home-layout:v1:${encodeURIComponent(accountId.trim())}` : null;
}

function normalizeSlots(value: unknown, fallback: HomeSlotId[]): HomeSlotId[] {
  const allowed = new Set<HomeSlotId>(HOME_SLOT_ORDER);
  const output = Array.isArray(value)
    ? value.filter((item): item is HomeSlotId => typeof item === 'string' && allowed.has(item as HomeSlotId))
    : [];
  for (const slot of fallback) if (!output.includes(slot)) output.push(slot);
  return Array.from(new Set(output));
}

export function normalizeHomeLayout(value: unknown): HomeLayoutPreference {
  if (!value || typeof value !== 'object') return { ...DEFAULT_HOME_LAYOUT, order: [...HOME_SLOT_ORDER], visible: [...HOME_SLOT_ORDER] };
  const candidate = value as Partial<HomeLayoutPreference>;
  const mode: HomeMode = candidate.version === 1 && ['standard', 'personalized', 'mixed', 'roster', 'shortcuts', 'roster-mixed'].includes(String(candidate.mode))
    ? candidate.mode as HomeMode
    : 'standard';
  const order = normalizeSlots(candidate.order, HOME_SLOT_ORDER);
  const visible = normalizeSlots(candidate.visible, REQUIRED_HOME_SLOTS);
  return { version: 1, mode, order, visible };
}

export function readHomeLayout(storage: PreferenceStorage, accountId: string | null | undefined): HomeLayoutPreference {
  const key = homeLayoutKey(accountId);
  if (!key) return normalizeHomeLayout(null);
  try { return normalizeHomeLayout(JSON.parse(storage.getItem(key) || 'null')); }
  catch { return normalizeHomeLayout(null); }
}

export function saveHomeLayout(storage: PreferenceStorage, accountId: string | null | undefined, value: HomeLayoutPreference): boolean {
  const key = homeLayoutKey(accountId);
  if (!key) return false;
  try {
    storage.setItem(key, JSON.stringify(normalizeHomeLayout(value)));
    return true;
  } catch { return false; }
}

export function resetHomeLayout(storage: PreferenceStorage, accountId: string | null | undefined): boolean {
  const key = homeLayoutKey(accountId);
  if (!key) return false;
  try { storage.removeItem(key); return true; }
  catch { return false; }
}

export function visibleHomeSlots(preference: HomeLayoutPreference, available: HomeSlotId[]): HomeSlotId[] {
  const availableSet = new Set(available);
  const ordered = preference.order.filter((slot) => availableSet.has(slot));
  if (preference.mode === 'standard') return ordered;
  const visible = new Set([...preference.visible, ...REQUIRED_HOME_SLOTS]);
  return ordered.filter((slot) => visible.has(slot));
}
