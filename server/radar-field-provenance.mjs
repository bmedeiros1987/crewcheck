import { radarOccurrenceKey, sameRadarOccurrence } from './radar-occurrence-identity.mjs';

function text(value) {
  return String(value ?? '').trim();
}

function timestamp(value) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function providerName(candidate = {}) {
  return text(candidate.provider || candidate.source || 'unknown') || 'unknown';
}

function fieldValue(candidate = {}, field) {
  switch (field) {
    case 'status':
      return candidate.statusProvided === true ? text(candidate.status) : '';
    case 'departureGate':
      return text(candidate.gate || candidate.departureGate);
    case 'departureTerminal':
      return text(candidate.terminal || candidate.departureTerminal);
    case 'scheduledDeparture':
      return text(candidate.scheduledDeparture);
    case 'estimatedDeparture':
      return text(candidate.estimatedDeparture);
    case 'actualDeparture':
      return text(candidate.actualDeparture);
    case 'equipment':
      return text(candidate.actualAircraft || candidate.aircraft || candidate.equipment || candidate.scheduledAircraft);
    case 'registration':
      return text(candidate.registration || candidate.tailNumber);
    default:
      return '';
  }
}

function providerRank(provider, priority = []) {
  const index = priority.indexOf(provider);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function selectCandidate(candidates = [], field, priority = []) {
  const eligible = candidates
    .map((candidate, inputIndex) => ({
      candidate,
      inputIndex,
      provider: providerName(candidate),
      value: fieldValue(candidate, field),
      observedAt: timestamp(candidate.updatedAt || candidate.observedAt),
    }))
    .filter((entry) => Boolean(entry.value));

  if (!eligible.length) return null;

  eligible.sort((left, right) => {
    const leftFresh = Boolean(left.observedAt);
    const rightFresh = Boolean(right.observedAt);
    if (leftFresh !== rightFresh) return leftFresh ? -1 : 1;
    if (leftFresh && rightFresh && left.observedAt !== right.observedAt) {
      return right.observedAt.localeCompare(left.observedAt);
    }
    const priorityDelta = providerRank(left.provider, priority) - providerRank(right.provider, priority);
    if (priorityDelta !== 0) return priorityDelta;
    return left.inputIndex - right.inputIndex;
  });

  return eligible[0];
}

export const RADAR_PROVENANCE_FIELDS = Object.freeze([
  'status',
  'departureGate',
  'departureTerminal',
  'scheduledDeparture',
  'estimatedDeparture',
  'actualDeparture',
  'equipment',
  'registration',
]);

export function buildRadarFieldProvenance(candidates = [], context = {}, options = {}) {
  const source = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (!source.length) {
    return { occurrenceKey: '', fields: {}, matchedProviders: [] };
  }

  const anchor = source[0];
  const occurrenceKey = radarOccurrenceKey(anchor, context);
  const sameOccurrence = source.filter((candidate) => sameRadarOccurrence(anchor, candidate, context));
  const providerPriority = Array.isArray(options.providerPriority) ? options.providerPriority.map(text).filter(Boolean) : [];
  const fields = {};

  for (const field of RADAR_PROVENANCE_FIELDS) {
    const selected = selectCandidate(sameOccurrence, field, providerPriority);
    if (!selected) continue;
    fields[field] = {
      value: selected.value,
      provider: selected.provider,
      observedAt: selected.observedAt,
      occurrenceKey,
      coverageState: selected.observedAt ? 'provided_with_freshness' : 'provided_no_freshness',
    };
  }

  return {
    occurrenceKey,
    fields,
    matchedProviders: [...new Set(sameOccurrence.map(providerName))],
  };
}
