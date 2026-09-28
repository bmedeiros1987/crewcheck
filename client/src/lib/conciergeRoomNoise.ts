import { normalizeConciergeHotelName, normalizeConciergeRoom } from './conciergeRoomHistory';

export type ConciergeNoiseOrigin =
  | 'traffic'
  | 'aircraft'
  | 'construction'
  | 'elevator'
  | 'corridor'
  | 'neighbor'
  | 'leisure-events'
  | 'hotel-infrastructure'
  | 'nightlife'
  | 'temporary-event'
  | 'unknown';

export type ConciergeNoiseIntensity = 'unknown' | 'low' | 'moderate' | 'high';
export type ConciergeNoiseRecurrence = 'unknown' | 'isolated' | 'occasional' | 'recurring';
export type ConciergeNoiseDayPeriod = 'overnight' | 'morning' | 'afternoon' | 'evening';
export type ConciergeNoiseConfidence = 'low' | 'medium' | 'high';
export type ConciergeNoiseDurability = 'circumstantial' | 'temporal' | 'structural-candidate' | 'unknown';

export type ConciergeRoomNoiseObservation = {
  id: string;
  hotelKey: string;
  roomKey: string;
  origin: ConciergeNoiseOrigin;
  intensity: ConciergeNoiseIntensity;
  recurrence: ConciergeNoiseRecurrence;
  dayPeriods: ConciergeNoiseDayPeriod[];
  observedAt: string;
  validUntil: string | null;
  durability: ConciergeNoiseDurability;
  source: 'user-private';
  confidence: ConciergeNoiseConfidence;
  evidenceIds: string[];
  updatedAt: string;
};

type NoisePatch = Partial<Omit<ConciergeRoomNoiseObservation, 'id' | 'hotelKey' | 'roomKey' | 'durability' | 'source' | 'updatedAt'>>;
type NoiseStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const CONCIERGE_ROOM_NOISE_KEY = 'crewcheck_concierge_room_noise_v1';
const MAX_NOISE_OBSERVATIONS = 600;
const DAY = 86_400_000;

const ORIGINS = new Set<ConciergeNoiseOrigin>([
  'traffic',
  'aircraft',
  'construction',
  'elevator',
  'corridor',
  'neighbor',
  'leisure-events',
  'hotel-infrastructure',
  'nightlife',
  'temporary-event',
  'unknown',
]);
const INTENSITIES = new Set<ConciergeNoiseIntensity>(['unknown', 'low', 'moderate', 'high']);
const RECURRENCES = new Set<ConciergeNoiseRecurrence>(['unknown', 'isolated', 'occasional', 'recurring']);
const PERIODS = new Set<ConciergeNoiseDayPeriod>(['overnight', 'morning', 'afternoon', 'evening']);
const CONFIDENCES = new Set<ConciergeNoiseConfidence>(['low', 'medium', 'high']);
const STRUCTURAL_CANDIDATES = new Set<ConciergeNoiseOrigin>(['traffic', 'aircraft', 'elevator', 'hotel-infrastructure', 'nightlife']);
const CIRCUMSTANTIAL = new Set<ConciergeNoiseOrigin>(['corridor', 'neighbor', 'leisure-events', 'temporary-event']);

function storageOrNull(storage?: NoiseStorage | null): NoiseStorage | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeDateTime(value: unknown): string {
  const parsed = value instanceof Date ? value : new Date(String(value || ''));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}

function normalizeOrigin(value: unknown): ConciergeNoiseOrigin {
  return ORIGINS.has(value as ConciergeNoiseOrigin) ? value as ConciergeNoiseOrigin : 'unknown';
}

function normalizeIntensity(value: unknown): ConciergeNoiseIntensity {
  return INTENSITIES.has(value as ConciergeNoiseIntensity) ? value as ConciergeNoiseIntensity : 'unknown';
}

function normalizeRecurrence(value: unknown): ConciergeNoiseRecurrence {
  return RECURRENCES.has(value as ConciergeNoiseRecurrence) ? value as ConciergeNoiseRecurrence : 'unknown';
}

function normalizeConfidence(value: unknown): ConciergeNoiseConfidence {
  return CONFIDENCES.has(value as ConciergeNoiseConfidence) ? value as ConciergeNoiseConfidence : 'medium';
}

function normalizePeriods(value: unknown): ConciergeNoiseDayPeriod[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is ConciergeNoiseDayPeriod => PERIODS.has(item as ConciergeNoiseDayPeriod)))];
}

function normalizeEvidenceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, 8);
}

export function classifyConciergeNoiseDurability(
  origin: ConciergeNoiseOrigin,
  _recurrence: ConciergeNoiseRecurrence = 'unknown',
): ConciergeNoiseDurability {
  if (origin === 'construction') return 'temporal';
  if (STRUCTURAL_CANDIDATES.has(origin)) return 'structural-candidate';
  if (CIRCUMSTANTIAL.has(origin)) return 'circumstantial';
  return 'unknown';
}

function defaultValidUntil(origin: ConciergeNoiseOrigin, recurrence: ConciergeNoiseRecurrence, observedAt: string): string | null {
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) return null;
  const durability = classifyConciergeNoiseDurability(origin, recurrence);
  if (durability === 'structural-candidate') return null;
  if (durability === 'temporal') return new Date(observed + 30 * DAY).toISOString();
  if (durability === 'circumstantial') return new Date(observed + 7 * DAY).toISOString();
  return new Date(observed + 14 * DAY).toISOString();
}

function buildObservationId(hotelKey: string, roomKey: string, origin: ConciergeNoiseOrigin, observedAt: string): string {
  return `noise:${hotelKey}:${roomKey}:${origin}:${observedAt}`;
}

function sanitizeRecord(value: unknown): ConciergeRoomNoiseObservation | null {
  const item = value && typeof value === 'object' ? value as Partial<ConciergeRoomNoiseObservation> : {};
  const hotelKey = normalizeConciergeHotelName(item.hotelKey);
  const roomKey = normalizeConciergeRoom(item.roomKey);
  const observedAt = normalizeDateTime(item.observedAt);
  if (!hotelKey || !roomKey || !observedAt) return null;
  const origin = normalizeOrigin(item.origin);
  const recurrence = normalizeRecurrence(item.recurrence);
  const validUntil = item.validUntil === null ? null : normalizeDateTime(item.validUntil) || defaultValidUntil(origin, recurrence, observedAt);
  return {
    id: String(item.id || buildObservationId(hotelKey, roomKey, origin, observedAt)),
    hotelKey,
    roomKey,
    origin,
    intensity: normalizeIntensity(item.intensity),
    recurrence,
    dayPeriods: normalizePeriods(item.dayPeriods),
    observedAt,
    validUntil,
    durability: classifyConciergeNoiseDurability(origin, recurrence),
    source: 'user-private',
    confidence: normalizeConfidence(item.confidence),
    evidenceIds: normalizeEvidenceIds(item.evidenceIds),
    updatedAt: normalizeDateTime(item.updatedAt) || observedAt,
  };
}

function evidenceIdentity(item: ConciergeRoomNoiseObservation): string {
  const evidenceIds = normalizeEvidenceIds(item.evidenceIds).sort((a, b) => a.localeCompare(b));
  if (!evidenceIds.length) return `id:${item.id}`;
  return `${item.hotelKey}\u001f${item.roomKey}\u001f${item.origin}\u001f${evidenceIds.join('\u001e')}`;
}

export function dedupeConciergeNoiseObservationsByEvidence(
  observations: ConciergeRoomNoiseObservation[],
): ConciergeRoomNoiseObservation[] {
  const preferred = [...(Array.isArray(observations) ? observations : [])].sort((a, b) => {
    const updated = (b.updatedAt || b.observedAt).localeCompare(a.updatedAt || a.observedAt);
    if (updated) return updated;
    return b.observedAt.localeCompare(a.observedAt);
  });
  const seen = new Set<string>();
  const deduped = preferred.filter((item) => {
    const key = evidenceIdentity(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}

export function listConciergeRoomNoiseObservations(storage?: NoiseStorage | null): ConciergeRoomNoiseObservation[] {
  const target = storageOrNull(storage);
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(CONCIERGE_ROOM_NOISE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    const sanitized = parsed
      .map(sanitizeRecord)
      .filter((item): item is ConciergeRoomNoiseObservation => Boolean(item));
    return dedupeConciergeNoiseObservationsByEvidence(sanitized);
  } catch {
    return [];
  }
}

export function saveConciergeRoomNoiseObservation(
  hotelName: unknown,
  room: unknown,
  patch: NoisePatch,
  options: { storage?: NoiseStorage | null; now?: Date } = {},
): ConciergeRoomNoiseObservation[] {
  const hotelKey = normalizeConciergeHotelName(hotelName);
  const roomKey = normalizeConciergeRoom(room);
  if (!hotelKey || !roomKey) return listConciergeRoomNoiseObservations(options.storage);
  const now = options.now || new Date();
  const observedAt = normalizeDateTime(patch.observedAt) || now.toISOString();
  const origin = normalizeOrigin(patch.origin);
  const recurrence = normalizeRecurrence(patch.recurrence);
  const explicitValidUntil = patch.validUntil === null ? null : normalizeDateTime(patch.validUntil);
  const validUntil = patch.validUntil === undefined
    ? defaultValidUntil(origin, recurrence, observedAt)
    : explicitValidUntil;
  const next: ConciergeRoomNoiseObservation = {
    id: buildObservationId(hotelKey, roomKey, origin, observedAt),
    hotelKey,
    roomKey,
    origin,
    intensity: normalizeIntensity(patch.intensity),
    recurrence,
    dayPeriods: normalizePeriods(patch.dayPeriods),
    observedAt,
    validUntil,
    durability: classifyConciergeNoiseDurability(origin, recurrence),
    source: 'user-private',
    confidence: normalizeConfidence(patch.confidence),
    evidenceIds: normalizeEvidenceIds(patch.evidenceIds),
    updatedAt: now.toISOString(),
  };
  const current = listConciergeRoomNoiseObservations(options.storage);
  const merged = dedupeConciergeNoiseObservationsByEvidence([next, ...current]).slice(0, MAX_NOISE_OBSERVATIONS);
  const target = storageOrNull(options.storage);
  if (target) {
    try {
      target.setItem(CONCIERGE_ROOM_NOISE_KEY, JSON.stringify(merged));
    } catch {}
  }
  return merged;
}

export function isConciergeNoiseObservationCurrent(
  observation: ConciergeRoomNoiseObservation,
  now: Date | number = Date.now(),
): boolean {
  if (!observation.validUntil) return true;
  const clock = now instanceof Date ? now.getTime() : Number(now);
  const expiry = Date.parse(observation.validUntil);
  return Number.isFinite(clock) && Number.isFinite(expiry) && expiry >= clock;
}

export function findCurrentConciergeRoomNoise(
  observations: ConciergeRoomNoiseObservation[],
  hotelName: unknown,
  room: unknown,
  now: Date | number = Date.now(),
): ConciergeRoomNoiseObservation[] {
  const hotelKey = normalizeConciergeHotelName(hotelName);
  const roomKey = normalizeConciergeRoom(room);
  if (!hotelKey || !roomKey) return [];
  return dedupeConciergeNoiseObservationsByEvidence(Array.isArray(observations) ? observations : [])
    .filter((item) => item.hotelKey === hotelKey && item.roomKey === roomKey)
    .filter((item) => isConciergeNoiseObservationCurrent(item, now))
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}

export function buildConciergeRoomNoiseSummary(
  observations: ConciergeRoomNoiseObservation[],
  hotelName: unknown,
  room: unknown,
  now: Date | number = Date.now(),
) {
  const hotelKey = normalizeConciergeHotelName(hotelName);
  const roomKey = normalizeConciergeRoom(room);
  const matching = dedupeConciergeNoiseObservationsByEvidence(Array.isArray(observations) ? observations : [])
    .filter((item) => item.hotelKey === hotelKey && item.roomKey === roomKey);
  const current = matching.filter((item) => isConciergeNoiseObservationCurrent(item, now));
  const unique = (items: ConciergeRoomNoiseObservation[], durability: ConciergeNoiseDurability) => [
    ...new Set(items.filter((item) => item.durability === durability).map((item) => item.origin)),
  ];
  return {
    activeObservations: current.length,
    expiredObservations: Math.max(0, matching.length - current.length),
    structuralCandidateOrigins: unique(current, 'structural-candidate'),
    temporalOrigins: unique(current, 'temporal'),
    circumstantialOrigins: unique(current, 'circumstantial'),
    hasConfirmedStructuralNoise: false as const,
  };
}
