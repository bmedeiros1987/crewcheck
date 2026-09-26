import { normalizeConciergeHotelName, normalizeConciergeRoom } from './conciergeRoomHistory';

export type ConciergeRoomPreferenceValue = 'neutral' | 'prefer' | 'avoid';
export type ConciergeRoomTraitValue = 'unknown' | 'good' | 'bad';

export type ConciergeRoomPreference = {
  hotelKey: string;
  roomKey: string;
  preference: ConciergeRoomPreferenceValue;
  quiet: ConciergeRoomTraitValue;
  blackout: ConciergeRoomTraitValue;
  wifi: ConciergeRoomTraitValue;
  climate: ConciergeRoomTraitValue;
  shower: ConciergeRoomTraitValue;
  observedStayDate: string;
  updatedAt: string;
};

type PreferencePatch = Partial<Omit<ConciergeRoomPreference, 'hotelKey' | 'roomKey' | 'updatedAt'>>;
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const CONCIERGE_ROOM_PREFERENCES_KEY = 'crewcheck_concierge_room_preferences_v1';
const MAX_ROOM_PREFERENCES = 300;

function storageOrNull(storage?: PreferenceStorage | null): PreferenceStorage | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizedStayDay(value: unknown): string {
  const raw = String(value || '').trim();
  const isoDay = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return isoDay;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function normalizePreference(value: unknown): ConciergeRoomPreferenceValue {
  return value === 'prefer' || value === 'avoid' ? value : 'neutral';
}

function normalizeTrait(value: unknown): ConciergeRoomTraitValue {
  return value === 'good' || value === 'bad' ? value : 'unknown';
}

function sanitizeRecord(value: unknown): ConciergeRoomPreference | null {
  const item = value && typeof value === 'object' ? value as Partial<ConciergeRoomPreference> : {};
  const hotelKey = normalizeConciergeHotelName(item.hotelKey);
  const roomKey = normalizeConciergeRoom(item.roomKey);
  if (!hotelKey || !roomKey) return null;

  return {
    hotelKey,
    roomKey,
    preference: normalizePreference(item.preference),
    quiet: normalizeTrait(item.quiet),
    blackout: normalizeTrait(item.blackout),
    wifi: normalizeTrait(item.wifi),
    climate: normalizeTrait(item.climate),
    shower: normalizeTrait(item.shower),
    observedStayDate: normalizedStayDay(item.observedStayDate),
    updatedAt: String(item.updatedAt || ''),
  };
}

export function listConciergeRoomPreferences(storage?: PreferenceStorage | null): ConciergeRoomPreference[] {
  const target = storageOrNull(storage);
  if (!target) return [];

  try {
    const raw = target.getItem(CONCIERGE_ROOM_PREFERENCES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeRecord)
      .filter((item): item is ConciergeRoomPreference => Boolean(item))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

export function findConciergeRoomPreference(
  preferences: ConciergeRoomPreference[],
  hotelName: unknown,
  room: unknown,
): ConciergeRoomPreference | null {
  const hotelKey = normalizeConciergeHotelName(hotelName);
  const roomKey = normalizeConciergeRoom(room);
  if (!hotelKey || !roomKey) return null;
  return (Array.isArray(preferences) ? preferences : []).find((item) => item.hotelKey === hotelKey && item.roomKey === roomKey) || null;
}

export function saveConciergeRoomPreference(
  hotelName: unknown,
  room: unknown,
  patch: PreferencePatch,
  options: { storage?: PreferenceStorage | null; now?: Date } = {},
): ConciergeRoomPreference[] {
  const hotelKey = normalizeConciergeHotelName(hotelName);
  const roomKey = normalizeConciergeRoom(room);
  if (!hotelKey || !roomKey) return listConciergeRoomPreferences(options.storage);

  const current = listConciergeRoomPreferences(options.storage);
  const existing = current.find((item) => item.hotelKey === hotelKey && item.roomKey === roomKey);
  const next: ConciergeRoomPreference = {
    hotelKey,
    roomKey,
    preference: normalizePreference(patch.preference ?? existing?.preference),
    quiet: normalizeTrait(patch.quiet ?? existing?.quiet),
    blackout: normalizeTrait(patch.blackout ?? existing?.blackout),
    wifi: normalizeTrait(patch.wifi ?? existing?.wifi),
    climate: normalizeTrait(patch.climate ?? existing?.climate),
    shower: normalizeTrait(patch.shower ?? existing?.shower),
    observedStayDate: normalizedStayDay(patch.observedStayDate ?? existing?.observedStayDate),
    updatedAt: (options.now || new Date()).toISOString(),
  };

  const merged = [next, ...current.filter((item) => item.hotelKey !== hotelKey || item.roomKey !== roomKey)]
    .slice(0, MAX_ROOM_PREFERENCES);
  const target = storageOrNull(options.storage);
  if (target) {
    try {
      target.setItem(CONCIERGE_ROOM_PREFERENCES_KEY, JSON.stringify(merged));
    } catch {}
  }
  return merged;
}

export function nextConciergeRoomTrait(value: ConciergeRoomTraitValue | undefined): ConciergeRoomTraitValue {
  if (value === 'good') return 'bad';
  if (value === 'bad') return 'unknown';
  return 'good';
}
