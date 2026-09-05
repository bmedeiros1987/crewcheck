export type HotelEvidenceConfidence = 'low' | 'medium' | 'high';
export type HotelEvidenceSource = 'user' | 'hotel' | 'community' | 'provider' | 'derived';

export type RoomNoiseOrigin =
  | 'road_traffic'
  | 'aircraft'
  | 'construction'
  | 'elevator'
  | 'corridor'
  | 'neighbor_guest'
  | 'leisure_area'
  | 'hotel_infrastructure'
  | 'nightlife'
  | 'temporary_event'
  | 'unknown';

export type RoomNoiseIntensity = 'low' | 'moderate' | 'high';
export type RoomNoiseRecurrence = 'single' | 'occasional' | 'recurring' | 'continuous';

export type RoomNoiseObservation = {
  id: string;
  hotelKey: string;
  roomKey?: string;
  reporterKey?: string;
  source: HotelEvidenceSource;
  origin: RoomNoiseOrigin;
  intensity: RoomNoiseIntensity;
  recurrence: RoomNoiseRecurrence;
  observedAt: string;
  confidence: HotelEvidenceConfidence;
  validUntil?: string;
  hotelConfirmed?: boolean;
  periods?: Array<{ start: string; end: string }>;
};

export type RoomNoiseInsight = {
  origin: RoomNoiseOrigin;
  label: string;
  intensity: RoomNoiseIntensity;
  recurrence: RoomNoiseRecurrence;
  structural: boolean;
  evidenceCount: number;
  distinctReporterCount: number;
  confidence: HotelEvidenceConfidence;
  lastObservedAt: string;
  periods: Array<{ start: string; end: string }>;
  evidenceIds: string[];
};

export type RoomNoiseFingerprint = {
  hotelKey: string;
  roomKey?: string;
  generatedAt: string;
  insights: RoomNoiseInsight[];
};

export type HotelRoomCareDecision = {
  action: 'silence' | 'inform' | 'suggest_quieter_room';
  severity: 'none' | 'info' | 'attention';
  summary: string;
  reasons: string[];
  evidenceIds: string[];
};

const LABELS: Record<RoomNoiseOrigin, string> = {
  road_traffic: 'trânsito/avenida',
  aircraft: 'aeronaves/rota aérea',
  construction: 'obra/reforma',
  elevator: 'elevador',
  corridor: 'corredor',
  neighbor_guest: 'hóspede/quarto vizinho',
  leisure_area: 'área de lazer/restaurante/eventos',
  hotel_infrastructure: 'infraestrutura do hotel',
  nightlife: 'vida noturna externa',
  temporary_event: 'evento temporário',
  unknown: 'origem não identificada',
};

const FRESHNESS_DAYS: Record<RoomNoiseOrigin, number> = {
  road_traffic: 365,
  aircraft: 365,
  construction: 21,
  elevator: 365,
  corridor: 90,
  neighbor_guest: 3,
  leisure_area: 180,
  hotel_infrastructure: 365,
  nightlife: 365,
  temporary_event: 3,
  unknown: 14,
};

const STRUCTURAL_CANDIDATES = new Set<RoomNoiseOrigin>([
  'road_traffic',
  'aircraft',
  'elevator',
  'corridor',
  'leisure_area',
  'hotel_infrastructure',
  'nightlife',
]);

const intensityScore = (value: RoomNoiseIntensity) => value === 'high' ? 3 : value === 'moderate' ? 2 : 1;
const recurrenceScore = (value: RoomNoiseRecurrence) => value === 'continuous' ? 4 : value === 'recurring' ? 3 : value === 'occasional' ? 2 : 1;
const confidenceScore = (value: HotelEvidenceConfidence) => value === 'high' ? 1 : value === 'medium' ? 0.66 : 0.33;

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFresh(observation: RoomNoiseObservation, nowMs: number): boolean {
  const observedAt = parseInstant(observation.observedAt);
  if (observedAt === null) return false;
  const validUntil = observation.validUntil ? parseInstant(observation.validUntil) : null;
  if (validUntil !== null) return nowMs <= validUntil;
  return nowMs - observedAt <= FRESHNESS_DAYS[observation.origin] * 86_400_000;
}

function strongestIntensity(items: RoomNoiseObservation[]): RoomNoiseIntensity {
  return items.reduce<RoomNoiseIntensity>((current, item) => intensityScore(item.intensity) > intensityScore(current) ? item.intensity : current, 'low');
}

function strongestRecurrence(items: RoomNoiseObservation[]): RoomNoiseRecurrence {
  return items.reduce<RoomNoiseRecurrence>((current, item) => recurrenceScore(item.recurrence) > recurrenceScore(current) ? item.recurrence : current, 'single');
}

function aggregateConfidence(items: RoomNoiseObservation[]): HotelEvidenceConfidence {
  const average = items.reduce((total, item) => total + confidenceScore(item.confidence), 0) / Math.max(1, items.length);
  const score = Math.min(1, average + (items.length >= 3 ? 0.18 : items.length === 2 ? 0.1 : 0));
  return score >= 0.82 ? 'high' : score >= 0.5 ? 'medium' : 'low';
}

function structural(origin: RoomNoiseOrigin, items: RoomNoiseObservation[], distinctReporterCount: number): boolean {
  if (!STRUCTURAL_CANDIDATES.has(origin)) return false;
  if (items.some((item) => item.hotelConfirmed)) return true;
  const recurring = items.filter((item) => item.recurrence === 'recurring' || item.recurrence === 'continuous').length;
  return distinctReporterCount >= 2 || recurring >= 2;
}

export function buildRoomNoiseFingerprint(
  observations: RoomNoiseObservation[],
  now = new Date(),
): RoomNoiseFingerprint | null {
  const fresh = observations.filter((item) => isFresh(item, now.getTime()));
  if (!fresh.length) return null;

  const hotelKey = fresh[0]!.hotelKey;
  const roomKey = fresh.every((item) => item.roomKey === fresh[0]!.roomKey) ? fresh[0]!.roomKey : undefined;
  const grouped = new Map<RoomNoiseOrigin, RoomNoiseObservation[]>();

  for (const observation of fresh) {
    if (observation.hotelKey !== hotelKey) continue;
    if (roomKey !== undefined && observation.roomKey !== roomKey) continue;
    grouped.set(observation.origin, [...(grouped.get(observation.origin) || []), observation]);
  }

  const insights = Array.from(grouped.entries()).map(([origin, items]): RoomNoiseInsight => {
    const reporters = new Set(items.map((item) => item.reporterKey).filter(Boolean));
    const distinctReporterCount = reporters.size || Math.min(1, items.length);
    const periods = Array.from(new Map(items.flatMap((item) => item.periods || []).map((period) => [`${period.start}-${period.end}`, period])).values());
    const lastObservedAt = [...items].sort((a, b) => (parseInstant(b.observedAt) || 0) - (parseInstant(a.observedAt) || 0))[0]!.observedAt;

    return {
      origin,
      label: LABELS[origin],
      intensity: strongestIntensity(items),
      recurrence: strongestRecurrence(items),
      structural: structural(origin, items, distinctReporterCount),
      evidenceCount: items.length,
      distinctReporterCount,
      confidence: aggregateConfidence(items),
      lastObservedAt,
      periods,
      evidenceIds: items.map((item) => item.id),
    };
  });

  insights.sort((a, b) => Number(b.structural) - Number(a.structural) || intensityScore(b.intensity) - intensityScore(a.intensity) || recurrenceScore(b.recurrence) - recurrenceScore(a.recurrence));
  return { hotelKey, roomKey, generatedAt: now.toISOString(), insights };
}

export function hotelRoomCareDecision(
  fingerprint: RoomNoiseFingerprint | null,
  restPriority: 'normal' | 'high' = 'normal',
): HotelRoomCareDecision {
  if (!fingerprint?.insights.length) {
    return { action: 'silence', severity: 'none', summary: 'Sem evidência suficiente sobre ruído.', reasons: [], evidenceIds: [] };
  }

  const structuralInsights = fingerprint.insights.filter((item) => item.structural);
  if (!structuralInsights.length) {
    const transient = fingerprint.insights.filter((item) => item.origin === 'neighbor_guest' || item.origin === 'temporary_event' || item.origin === 'construction');
    return {
      action: transient.length ? 'inform' : 'silence',
      severity: transient.length ? 'info' : 'none',
      summary: transient.length ? 'Há relato recente de ruído, mas ele é circunstancial e não caracteriza permanentemente o quarto.' : 'Sem característica acústica estrutural confirmada.',
      reasons: transient.map((item) => `${item.label}: ${item.intensity}`),
      evidenceIds: transient.flatMap((item) => item.evidenceIds),
    };
  }

  const weighted = structuralInsights.reduce((total, item) => {
    const confidence = item.confidence === 'high' ? 1 : item.confidence === 'medium' ? 0.8 : 0.5;
    return total + (intensityScore(item.intensity) * 1.35 + recurrenceScore(item.recurrence) * 0.35) * confidence;
  }, 0) * (restPriority === 'high' ? 1.25 : 1);

  const reasons = structuralInsights.map((item) => {
    const period = item.periods.length ? ` (${item.periods.map((p) => `${p.start}–${p.end}`).join(', ')})` : '';
    return `${item.label}: ${item.intensity}, ${item.recurrence}${period}`;
  });

  return {
    action: weighted >= 3.2 ? 'suggest_quieter_room' : 'inform',
    severity: weighted >= 3.2 ? 'attention' : 'info',
    summary: weighted >= 3.2 ? 'O histórico acústico deste quarto pode atrapalhar um repouso mais sensível.' : 'Existe histórico acústico estruturado para este quarto.',
    reasons,
    evidenceIds: structuralInsights.flatMap((item) => item.evidenceIds),
  };
}
