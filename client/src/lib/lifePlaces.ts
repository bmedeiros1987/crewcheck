export type LifePlaceCategory =
  | 'gym' | 'crossfit' | 'pilates' | 'yoga' | 'swimming' | 'running' | 'sports'
  | 'park' | 'nature' | 'leisure' | 'museum' | 'cinema' | 'spa' | 'cafe' | 'restaurant'
  | 'attraction' | 'trip' | 'study';

export type LifeCoordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  capturedAt: string;
};

export type LifePlace = {
  category: LifePlaceCategory | string;
  name: string;
  address: string;
  rating?: number;
  userRatingCount?: number;
  mapsUrl?: string;
  openNow?: boolean;
  openingHours?: string[];
  phone?: string;
  website?: string;
  latitude?: number;
  longitude?: number;
  distanceMeters?: number;
  primaryType?: string;
};

export type LifePlaceSearchResult = {
  ok: boolean;
  configured?: boolean;
  category: LifePlaceCategory;
  origin?: string;
  places: LifePlace[];
  message?: string;
};

const LOCATION_KEY = 'crewcheck:life:last-location:v1';
const LOCATION_LABEL_KEY = 'crewcheck:life:last-location-label:v1';
const PLACE_CACHE_PREFIX = 'crewcheck:life:places:v1:';

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function loadLifeLocation(): LifeCoordinates | null {
  const value = readJson<LifeCoordinates | null>(LOCATION_KEY, null);
  if (!value || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude)) return null;
  return value;
}

export function lifeLocationLabel(): string {
  return readJson<{ shortAddress?: string } | null>(LOCATION_LABEL_KEY, null)?.shortAddress || 'Localização atual';
}

export async function requestLifeLocation(options: PositionOptions = {}): Promise<LifeCoordinates> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) throw new Error('Localização não disponível neste aparelho.');
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 5 * 60_000,
      ...options,
    });
  });
  const location: LifeCoordinates = {
    latitude: Number(position.coords.latitude),
    longitude: Number(position.coords.longitude),
    accuracy: Number(position.coords.accuracy || 0) || undefined,
    capturedAt: new Date().toISOString(),
  };
  writeJson(LOCATION_KEY, location);
  window.dispatchEvent(new CustomEvent('crewcheck:life-location-update', { detail: location }));
  void reverseGeocodeLifeLocation(location).catch(() => null);
  return location;
}

export async function reverseGeocodeLifeLocation(location: LifeCoordinates): Promise<string> {
  const params = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude) });
  const response = await fetch(`/api/maps/reverse-geocode?${params.toString()}`, { cache: 'no-store', credentials: 'same-origin' });
  const payload = await response.json().catch(() => null);
  if (!payload?.ok) return 'Localização atual';
  const label = String(payload.shortAddress || payload.address || 'Localização atual');
  writeJson(LOCATION_LABEL_KEY, { shortAddress: label, address: payload.address, city: payload.city, state: payload.state, capturedAt: new Date().toISOString() });
  window.dispatchEvent(new CustomEvent('crewcheck:life-location-label-update', { detail: { label } }));
  return label;
}

function cacheKey(category: LifePlaceCategory, location: LifeCoordinates, query = ''): string {
  return `${PLACE_CACHE_PREFIX}${category}:${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}:${query.trim().toLowerCase()}`;
}

export async function searchLifePlaces(category: LifePlaceCategory, location: LifeCoordinates, query = '', force = false): Promise<LifePlaceSearchResult> {
  const key = cacheKey(category, location, query);
  const cached = readJson<{ cachedAt: number; payload: LifePlaceSearchResult } | null>(key, null);
  if (!force && cached && Date.now() - cached.cachedAt < 20 * 60_000) return cached.payload;
  const params = new URLSearchParams({
    category,
    location: `${location.latitude},${location.longitude}`,
  });
  if (query.trim()) params.set('query', query.trim());
  const response = await fetch(`/api/places/search?${params.toString()}`, { cache: 'no-store', credentials: 'same-origin' });
  const payload = await response.json().catch(() => null);
  const result: LifePlaceSearchResult = {
    ok: Boolean(payload?.ok),
    configured: payload?.configured,
    category,
    origin: payload?.origin,
    places: Array.isArray(payload?.places) ? payload.places : [],
    message: String(payload?.message || ''),
  };
  if (result.ok) writeJson(key, { cachedAt: Date.now(), payload: result });
  return result;
}

export async function searchLifePlaceSet(categories: Array<{ category: LifePlaceCategory; query?: string }>, location: LifeCoordinates, force = false): Promise<LifePlace[]> {
  const results = await Promise.allSettled(categories.slice(0, 4).map((item) => searchLifePlaces(item.category, location, item.query || '', force)));
  const seen = new Set<string>();
  const places: LifePlace[] = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const place of result.value.places) {
      const id = `${String(place.name).toLowerCase()}|${String(place.address).toLowerCase()}`;
      if (seen.has(id)) continue;
      seen.add(id);
      places.push(place);
    }
  }
  return places.sort((a, b) => {
    const open = Number(b.openNow === true) - Number(a.openNow === true);
    if (open) return open;
    const distance = Number(a.distanceMeters ?? Number.MAX_SAFE_INTEGER) - Number(b.distanceMeters ?? Number.MAX_SAFE_INTEGER);
    if (Math.abs(distance) > 250) return distance;
    const ratings = Number(b.rating || 0) - Number(a.rating || 0);
    if (ratings) return ratings;
    return Number(b.userRatingCount || 0) - Number(a.userRatingCount || 0);
  });
}

export function placeDistanceLabel(value?: number): string {
  if (!Number.isFinite(Number(value))) return 'distância a confirmar';
  const meters = Number(value);
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0).replace('.', ',')} km`;
}

export function openLifePlace(place: LifePlace): boolean {
  const url = place.mapsUrl || (Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.latitude},${place.longitude}`)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.address}`)}`);
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  } catch {
    return false;
  }
}

export function lifePlaceCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    gym: 'Academia', crossfit: 'CrossFit', pilates: 'Pilates', yoga: 'Yoga', swimming: 'Natação', running: 'Corrida', sports: 'Esportes',
    park: 'Parque', nature: 'Natureza', leisure: 'Lazer', museum: 'Museu', cinema: 'Cinema', spa: 'Bem-estar', cafe: 'Café', restaurant: 'Alimentação',
    attraction: 'Passeio', trip: 'Bate-volta', study: 'Estudo',
  };
  return labels[category] || 'Local';
}
