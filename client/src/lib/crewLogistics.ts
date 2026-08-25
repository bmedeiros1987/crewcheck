export type CrewLogisticsSource = 'mycrewcare' | 'aims' | 'manual' | 'inferred';
export type CrewLogisticsKind = 'pickup' | 'presentation' | 'hotel' | 'transport';
export type CrewLogisticsConfidence = 'alta' | 'media' | 'baixa';
export type CrewLogisticsProvenance = 'published' | 'user-confirmed' | 'derived';

export type CrewLogisticsFact = {
  id: string;
  kind: CrewLogisticsKind;
  source: CrewLogisticsSource;
  sourceRecordId?: string;
  journeyId?: string;
  date: string;
  airport?: string;
  hotel?: string;
  value: string;
  observedAt: string;
  validFrom?: string;
  confidence: CrewLogisticsConfidence;
  provenance: CrewLogisticsProvenance;
};

export type CrewLogisticsTarget = {
  id: string;
  journeyId?: string;
  date: string;
  airport?: string;
  hotel?: string;
  referenceTime?: string;
};

export type CrewLogisticsMatch = {
  fact: CrewLogisticsFact;
  targetId: string | null;
  score: number;
  ambiguous: boolean;
  reason: string;
};

export type CrewLogisticsResolvedField = {
  value: string;
  source: CrewLogisticsSource;
  provenance: CrewLogisticsProvenance;
  confidence: CrewLogisticsConfidence;
  observedAt: string;
  factId: string;
};

export type CrewLogisticsResolution = {
  targetId: string;
  pickup?: CrewLogisticsResolvedField;
  presentation?: CrewLogisticsResolvedField;
  hotel?: CrewLogisticsResolvedField;
  transport?: CrewLogisticsResolvedField;
};

const MIN_AUTOMATIC_MATCH_SCORE = 60;
const AMBIGUITY_MARGIN = 10;

function normalized(value?: string | null): string {
  return String(value || '').trim().toUpperCase();
}

function normalizeDate(value?: string | null): string {
  const raw = String(value || '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  return raw;
}

function clockMinutes(value?: string | null): number | null {
  const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function circularMinuteDistance(a: number, b: number): number {
  const direct = Math.abs(a - b);
  return Math.min(direct, 1440 - direct);
}

export function scoreCrewLogisticsMatch(fact: CrewLogisticsFact, target: CrewLogisticsTarget): number {
  if (fact.journeyId && target.journeyId && fact.journeyId === target.journeyId) return 100;

  let score = 0;
  if (normalizeDate(fact.date) === normalizeDate(target.date)) score += 40;
  if (fact.airport && target.airport && normalized(fact.airport) === normalized(target.airport)) score += 25;
  if (fact.hotel && target.hotel && normalized(fact.hotel) === normalized(target.hotel)) score += 20;

  const factTime = clockMinutes(fact.value);
  const targetTime = clockMinutes(target.referenceTime);
  if (factTime != null && targetTime != null) {
    const distance = circularMinuteDistance(factTime, targetTime);
    if (distance <= 60) score += 15;
    else if (distance <= 180) score += 8;
  }

  return Math.min(100, score);
}

export function matchCrewLogisticsFact(
  fact: CrewLogisticsFact,
  targets: CrewLogisticsTarget[],
): CrewLogisticsMatch {
  const ranked = targets
    .map((target) => ({ target, score: scoreCrewLogisticsMatch(fact, target) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < MIN_AUTOMATIC_MATCH_SCORE) {
    return { fact, targetId: null, score: best?.score || 0, ambiguous: false, reason: 'insufficient-match-evidence' };
  }

  const second = ranked[1];
  if (second && best.score - second.score < AMBIGUITY_MARGIN) {
    return { fact, targetId: null, score: best.score, ambiguous: true, reason: 'ambiguous-target' };
  }

  return { fact, targetId: best.target.id, score: best.score, ambiguous: false, reason: 'matched' };
}

function sourcePriority(fact: CrewLogisticsFact): number {
  if (fact.kind === 'pickup') {
    if (fact.source === 'mycrewcare' && fact.provenance === 'published') return 500;
    if (fact.source === 'manual' && fact.provenance === 'user-confirmed') return 400;
    if (fact.source === 'aims' && fact.provenance === 'published') return 300;
    return fact.source === 'inferred' ? 100 : 200;
  }

  if (fact.kind === 'presentation') {
    if (fact.source === 'aims' && fact.provenance === 'published') return 500;
    if (fact.source === 'mycrewcare' && fact.provenance === 'published') return 400;
    if (fact.source === 'manual' && fact.provenance === 'user-confirmed') return 300;
    return fact.source === 'inferred' ? 100 : 200;
  }

  if (fact.source === 'mycrewcare' && fact.provenance === 'published') return 500;
  if (fact.source === 'manual' && fact.provenance === 'user-confirmed') return 400;
  if (fact.source === 'aims' && fact.provenance === 'published') return 300;
  return fact.source === 'inferred' ? 100 : 200;
}

function chooseFact(facts: CrewLogisticsFact[]): CrewLogisticsFact | undefined {
  return [...facts].sort((a, b) => {
    const priority = sourcePriority(b) - sourcePriority(a);
    if (priority) return priority;
    const confidence = { alta: 3, media: 2, baixa: 1 };
    const confidenceDelta = confidence[b.confidence] - confidence[a.confidence];
    if (confidenceDelta) return confidenceDelta;
    return Date.parse(b.observedAt || '') - Date.parse(a.observedAt || '');
  })[0];
}

function resolvedField(fact?: CrewLogisticsFact): CrewLogisticsResolvedField | undefined {
  if (!fact) return undefined;
  return {
    value: fact.value,
    source: fact.source,
    provenance: fact.provenance,
    confidence: fact.confidence,
    observedAt: fact.observedAt,
    factId: fact.id,
  };
}

export function reconcileCrewLogisticsFacts(
  targets: CrewLogisticsTarget[],
  facts: CrewLogisticsFact[],
): { resolutions: CrewLogisticsResolution[]; matches: CrewLogisticsMatch[]; unmatched: CrewLogisticsFact[] } {
  const matches = facts.map((fact) => matchCrewLogisticsFact(fact, targets));
  const factsByTarget = new Map<string, CrewLogisticsFact[]>();
  const unmatched: CrewLogisticsFact[] = [];

  for (const match of matches) {
    if (!match.targetId) {
      unmatched.push(match.fact);
      continue;
    }
    const current = factsByTarget.get(match.targetId) || [];
    current.push(match.fact);
    factsByTarget.set(match.targetId, current);
  }

  const resolutions = targets.map((target) => {
    const matched = factsByTarget.get(target.id) || [];
    return {
      targetId: target.id,
      pickup: resolvedField(chooseFact(matched.filter((fact) => fact.kind === 'pickup'))),
      presentation: resolvedField(chooseFact(matched.filter((fact) => fact.kind === 'presentation'))),
      hotel: resolvedField(chooseFact(matched.filter((fact) => fact.kind === 'hotel'))),
      transport: resolvedField(chooseFact(matched.filter((fact) => fact.kind === 'transport'))),
    } satisfies CrewLogisticsResolution;
  });

  return { resolutions, matches, unmatched };
}
