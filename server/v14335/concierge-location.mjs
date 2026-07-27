const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MAX_PLACE_DISTANCE_KM = 35;

const AIRPORT_LOCATION_LABELS = {
  AJU: 'Aracaju/SE', BEL: 'Belém/PA', BSB: 'Brasília/DF', BVB: 'Boa Vista/RR',
  CGB: 'Cuiabá/MT', CGH: 'São Paulo/SP', CGR: 'Campo Grande/MS', CNF: 'Belo Horizonte/MG',
  CWB: 'Curitiba/PR', CXJ: 'Caxias do Sul/RS', FLN: 'Florianópolis/SC', FOR: 'Fortaleza/CE',
  GIG: 'Rio de Janeiro/RJ', GRU: 'Guarulhos/SP', GYN: 'Goiânia/GO', IGU: 'Foz do Iguaçu/PR',
  IMP: 'Imperatriz/MA', JOI: 'Joinville/SC', MAB: 'Marabá/PA', MAO: 'Manaus/AM',
  MCP: 'Macapá/AP', MCZ: 'Maceió/AL', NAT: 'Natal/RN', NVT: 'Navegantes/SC',
  PMW: 'Palmas/TO', POA: 'Porto Alegre/RS', PVH: 'Porto Velho/RO', RAO: 'Ribeirão Preto/SP',
  REC: 'Recife/PE', SDU: 'Rio de Janeiro/RJ', SLZ: 'São Luís/MA', SSA: 'Salvador/BA',
  THE: 'Teresina/PI', VCP: 'Campinas/SP', VIX: 'Vitória/ES',
};

function finiteCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function radians(value) {
  return Number(value || 0) * Math.PI / 180;
}

export function conciergeLocationDistanceKm(a, b) {
  const lat1 = finiteCoordinate(a?.latitude ?? a?.lat, -90, 90);
  const lon1 = finiteCoordinate(a?.longitude ?? a?.lon ?? a?.lng, -180, 180);
  const lat2 = finiteCoordinate(b?.latitude ?? b?.lat, -90, 90);
  const lon2 = finiteCoordinate(b?.longitude ?? b?.lon ?? b?.lng, -180, 180);
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return null;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function nearestConciergeLocationLabel(location, airportPoints = {}) {
  const candidates = Object.entries(airportPoints || {})
    .map(([code, point]) => ({ code: String(code).toUpperCase(), point, distanceKm: conciergeLocationDistanceKm(location, point) }))
    .filter((item) => Number.isFinite(item.distanceKm))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const nearest = candidates[0];
  if (!nearest || nearest.distanceKm > 180) return { label: 'localização compartilhada no Telegram', airport: '', distanceKm: null };
  const city = String(nearest.point?.city || '').trim();
  const label = AIRPORT_LOCATION_LABELS[nearest.code] || (city ? `${city} · referência ${nearest.code}` : `região de ${nearest.code}`);
  return { label, airport: nearest.code, distanceKm: nearest.distanceKm };
}

export function normalizeConciergeLocation(location = {}, { now = new Date(), ttlMs = DEFAULT_TTL_MS, airportPoints = {} } = {}) {
  const latitude = finiteCoordinate(location.latitude, -90, 90);
  const longitude = finiteCoordinate(location.longitude, -180, 180);
  if (latitude === null || longitude === null) return null;
  const updated = new Date(location.updatedAt || now);
  const updatedAt = Number.isFinite(updated.getTime()) ? updated : new Date(now);
  const fallback = nearestConciergeLocationLabel({ latitude, longitude }, airportPoints);
  const city = String(location.city || '').trim();
  const state = String(location.state || '').trim().toUpperCase();
  const explicitLabel = String(location.label || '').trim();
  const label = explicitLabel || (city ? `${city}${state ? `/${state}` : ''}` : fallback.label);
  return {
    latitude,
    longitude,
    accuracy: Math.max(0, Number(location.accuracy || 0)),
    source: String(location.source || 'telegram'),
    label,
    city,
    state,
    nearestAirport: String(location.nearestAirport || fallback.airport || ''),
    updatedAt: updatedAt.toISOString(),
    expiresAt: new Date(updatedAt.getTime() + ttlMs).toISOString(),
  };
}

export function conciergeLocationState(location, { now = new Date(), ttlMs = DEFAULT_TTL_MS, airportPoints = {} } = {}) {
  const normalized = normalizeConciergeLocation(location || {}, { now, ttlMs, airportPoints });
  if (!normalized) return { status: 'missing', fresh: false, location: null, label: '', ageMinutes: null, message: 'Envie sua localização pelo clipe do Telegram.' };
  const updatedAt = new Date(normalized.updatedAt).getTime();
  const expiresAt = new Date(normalized.expiresAt).getTime();
  const current = new Date(now).getTime();
  const ageMinutes = Math.max(0, Math.round((current - updatedAt) / 60000));
  if (!Number.isFinite(updatedAt) || !Number.isFinite(expiresAt) || current > expiresAt) {
    return { status: 'stale', fresh: false, location: normalized, label: normalized.label, ageMinutes, message: `Sua localização de ${normalized.label} expirou. Compartilhe novamente pelo Telegram para evitar busca na cidade errada.` };
  }
  return { status: 'fresh', fresh: true, location: normalized, label: normalized.label, ageMinutes, message: `Localização usada: ${normalized.label}.` };
}

export async function resolveConciergeLocationLabel(location, { apiKey = '', fetchImpl = globalThis.fetch, airportPoints = {} } = {}) {
  const fallback = nearestConciergeLocationLabel(location, airportPoints);
  if (!apiKey || typeof fetchImpl !== 'function') return fallback;
  try {
    const params = new URLSearchParams({ latlng: `${Number(location.latitude)},${Number(location.longitude)}`, key: apiKey, language: 'pt-BR', result_type: 'locality|administrative_area_level_2' });
    const response = await fetchImpl(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`, { headers: { accept: 'application/json' } });
    const payload = await response.json().catch(() => null);
    const result = response.ok && payload?.status === 'OK' ? payload.results?.[0] : null;
    const components = Array.isArray(result?.address_components) ? result.address_components : [];
    const component = (type) => components.find((item) => Array.isArray(item.types) && item.types.includes(type));
    const city = String(component('locality')?.long_name || component('administrative_area_level_2')?.long_name || '').trim();
    const state = String(component('administrative_area_level_1')?.short_name || '').trim().toUpperCase();
    if (!city) return fallback;
    return { label: `${city}${state ? `/${state}` : ''}`, city, state, airport: fallback.airport, distanceKm: fallback.distanceKm };
  } catch {
    return fallback;
  }
}

export function filterConciergePlacesByLocation(places = [], location, maxDistanceKm = DEFAULT_MAX_PLACE_DISTANCE_KM) {
  if (!location) return Array.isArray(places) ? places : [];
  return (Array.isArray(places) ? places : [])
    .map((place) => {
      const distanceKm = Number.isFinite(Number(place?.distanceKm)) ? Number(place.distanceKm) : conciergeLocationDistanceKm(location, place?.location);
      return { ...place, distanceKm };
    })
    .filter((place) => Number.isFinite(place.distanceKm) && place.distanceKm <= maxDistanceKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export const CONCIERGE_LOCATION_TTL_MS = DEFAULT_TTL_MS;
export const CONCIERGE_LOCATION_MAX_PLACE_DISTANCE_KM = DEFAULT_MAX_PLACE_DISTANCE_KM;
