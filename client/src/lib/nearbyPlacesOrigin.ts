export type NearbyPlacesOriginMode = 'current' | 'layover';

type NearbyPlacesStorage = {
  get: (key: string, fallback?: string) => string;
  set: (key: string, value: string) => void;
};

type NearbyPlacesOriginMeta = {
  mode: NearbyPlacesOriginMode;
  location: string;
  selectedAt: string;
};

export type NearbyPlacesOrigin = NearbyPlacesOriginMeta & {
  migrated: boolean;
};

export type NearbyPlacesCurrentGeo = {
  lat: number;
  lng: number;
  accuracy?: number;
  capturedAt: string;
};

const MODE_KEY = 'crewcheck:places-mode';
const LOCATION_KEY = 'crewcheck:places-location';
const META_KEY = 'crewcheck:places-origin-meta';
const CURRENT_GEO_KEY = 'crewcheck_last_geo';
const CURRENT_GEO_META_KEY = 'crewcheck_last_geo_meta';
export const NEARBY_PLACES_LAYOVER_MAX_AGE_MS = 24 * 60 * 60_000;
export const NEARBY_PLACES_CURRENT_GEO_MAX_AGE_MS = 30 * 60_000;

function normalizedLocation(value: unknown): string {
  return String(value || '').trim().slice(0, 240);
}

function parseMeta(value: string): NearbyPlacesOriginMeta | null {
  try {
    const parsed = JSON.parse(value) as Partial<NearbyPlacesOriginMeta> | null;
    const mode = parsed?.mode === 'layover' ? 'layover' : parsed?.mode === 'current' ? 'current' : null;
    if (!mode) return null;
    return {
      mode,
      location: normalizedLocation(parsed?.location),
      selectedAt: String(parsed?.selectedAt || ''),
    };
  } catch {
    return null;
  }
}

export function loadFreshNearbyCurrentGeo(
  storage: NearbyPlacesStorage,
  {
    now = new Date(),
    maxAgeMs = NEARBY_PLACES_CURRENT_GEO_MAX_AGE_MS,
  }: { now?: Date; maxAgeMs?: number } = {},
): NearbyPlacesCurrentGeo | null {
  const pair = storage.get(CURRENT_GEO_KEY, '').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!pair) return null;
  const lat = Number(pair[1]);
  const lng = Number(pair[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  try {
    const meta = JSON.parse(storage.get(CURRENT_GEO_META_KEY, 'null')) as Record<string, unknown> | null;
    const metaLat = Number(meta?.lat);
    const metaLng = Number(meta?.lng);
    const capturedAt = String(meta?.capturedAt || '');
    const capturedAtMs = Date.parse(capturedAt);
    const ageMs = now.getTime() - capturedAtMs;
    const samePoint = Number.isFinite(metaLat)
      && Number.isFinite(metaLng)
      && Math.abs(metaLat - lat) < 0.000001
      && Math.abs(metaLng - lng) < 0.000001;
    if (!samePoint || !Number.isFinite(capturedAtMs) || ageMs < 0 || ageMs > Math.max(0, maxAgeMs)) return null;
    const accuracy = Number(meta?.accuracy);
    return {
      lat,
      lng,
      accuracy: Number.isFinite(accuracy) ? accuracy : undefined,
      capturedAt,
    };
  } catch {
    return null;
  }
}

export function saveNearbyPlacesOrigin(
  storage: NearbyPlacesStorage,
  mode: NearbyPlacesOriginMode,
  location = '',
  now = new Date(),
): NearbyPlacesOrigin {
  const savedLocation = mode === 'layover' ? normalizedLocation(location) : '';
  const selectedAt = now.toISOString();
  storage.set(MODE_KEY, mode);
  storage.set(LOCATION_KEY, savedLocation);
  storage.set(META_KEY, JSON.stringify({ mode, location: savedLocation, selectedAt }));
  return { mode, location: savedLocation, selectedAt, migrated: false };
}

export function loadNearbyPlacesOrigin(
  storage: NearbyPlacesStorage,
  {
    now = new Date(),
    layoverMaxAgeMs = NEARBY_PLACES_LAYOVER_MAX_AGE_MS,
  }: { now?: Date; layoverMaxAgeMs?: number } = {},
): NearbyPlacesOrigin {
  const storedMode = storage.get(MODE_KEY, '');
  const storedLocation = normalizedLocation(storage.get(LOCATION_KEY, ''));
  if (storedMode === 'current') {
    const current = saveNearbyPlacesOrigin(storage, 'current', '', now);
    return { ...current, migrated: storedLocation !== '' };
  }

  const meta = parseMeta(storage.get(META_KEY, ''));
  const selectedAtMs = Date.parse(String(meta?.selectedAt || ''));
  const ageMs = now.getTime() - selectedAtMs;
  const explicitRecentLayover = storedMode === 'layover'
    && Boolean(storedLocation)
    && meta?.mode === 'layover'
    && meta.location === storedLocation
    && Number.isFinite(selectedAtMs)
    && ageMs >= 0
    && ageMs <= Math.max(0, layoverMaxAgeMs);

  if (explicitRecentLayover) {
    return {
      mode: 'layover',
      location: storedLocation,
      selectedAt: meta!.selectedAt,
      migrated: false,
    };
  }

  const current = saveNearbyPlacesOrigin(storage, 'current', '', now);
  return {
    ...current,
    migrated: storedMode !== 'current' || storedLocation !== '',
  };
}
