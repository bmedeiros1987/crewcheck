import { normalizeConciergeHotelName } from './conciergeRoomHistory';
import {
  dedupeConciergeNoiseObservationsByEvidence,
  isConciergeNoiseObservationCurrent,
  type ConciergeNoiseDurability,
  type ConciergeNoiseOrigin,
  type ConciergeRoomNoiseObservation,
} from './conciergeRoomNoise';

export type ConciergeHotelNoiseSignal = {
  origin: ConciergeNoiseOrigin;
  durability: ConciergeNoiseDurability;
  observationCount: number;
  roomCount: number;
  roomKeys: string[];
  lastObservedAt: string;
};

export type ConciergeHotelKnowledge = {
  hotelKey: string;
  activeObservations: number;
  expiredObservations: number;
  roomsWithActiveObservations: number;
  signals: ConciergeHotelNoiseSignal[];
  structuralCandidateSignals: ConciergeHotelNoiseSignal[];
  temporalSignals: ConciergeHotelNoiseSignal[];
  circumstantialSignals: ConciergeHotelNoiseSignal[];
  hasConfirmedStructuralNoise: false;
};

function emptyKnowledge(hotelKey = ''): ConciergeHotelKnowledge {
  return {
    hotelKey,
    activeObservations: 0,
    expiredObservations: 0,
    roomsWithActiveObservations: 0,
    signals: [],
    structuralCandidateSignals: [],
    temporalSignals: [],
    circumstantialSignals: [],
    hasConfirmedStructuralNoise: false,
  };
}

export function buildConciergeHotelKnowledge(
  observations: ConciergeRoomNoiseObservation[],
  hotelName: unknown,
  now: Date | number = Date.now(),
): ConciergeHotelKnowledge {
  const hotelKey = normalizeConciergeHotelName(hotelName);
  if (!hotelKey) return emptyKnowledge();

  const matching = dedupeConciergeNoiseObservationsByEvidence(Array.isArray(observations) ? observations : [])
    .filter((item) => item.hotelKey === hotelKey);
  const active = matching.filter((item) => isConciergeNoiseObservationCurrent(item, now));

  const grouped = new Map<string, {
    origin: ConciergeNoiseOrigin;
    durability: ConciergeNoiseDurability;
    observationCount: number;
    rooms: Set<string>;
    lastObservedAt: string;
  }>();

  for (const item of active) {
    const key = `${item.durability}:${item.origin}`;
    const current = grouped.get(key) || {
      origin: item.origin,
      durability: item.durability,
      observationCount: 0,
      rooms: new Set<string>(),
      lastObservedAt: '',
    };
    current.observationCount += 1;
    if (item.roomKey) current.rooms.add(item.roomKey);
    if (!current.lastObservedAt || item.observedAt > current.lastObservedAt) current.lastObservedAt = item.observedAt;
    grouped.set(key, current);
  }

  const signals: ConciergeHotelNoiseSignal[] = [...grouped.values()]
    .map((item) => ({
      origin: item.origin,
      durability: item.durability,
      observationCount: item.observationCount,
      roomCount: item.rooms.size,
      roomKeys: [...item.rooms].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
      lastObservedAt: item.lastObservedAt,
    }))
    .sort((a, b) => b.lastObservedAt.localeCompare(a.lastObservedAt) || a.origin.localeCompare(b.origin));

  return {
    hotelKey,
    activeObservations: active.length,
    expiredObservations: Math.max(0, matching.length - active.length),
    roomsWithActiveObservations: new Set(active.map((item) => item.roomKey).filter(Boolean)).size,
    signals,
    structuralCandidateSignals: signals.filter((item) => item.durability === 'structural-candidate'),
    temporalSignals: signals.filter((item) => item.durability === 'temporal'),
    circumstantialSignals: signals.filter((item) => item.durability === 'circumstantial'),
    hasConfirmedStructuralNoise: false,
  };
}
