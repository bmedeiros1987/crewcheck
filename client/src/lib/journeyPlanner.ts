export type JourneyStrategy = 'safest' | 'fastest' | 'availability' | 'fewest-connections' | 'last-safe';
export type StaffAvailability = 'good' | 'limited' | 'unknown' | 'closed';
export type JourneySegmentStatus = 'scheduled' | 'boarding' | 'delayed' | 'cancelled' | 'unknown';

export type JourneyGroundSegment = {
  kind: 'ground';
  from: string;
  to: string;
  departAt: string;
  arriveAt: string;
  mode?: 'car' | 'rideshare' | 'transit' | 'walk' | 'airport-transfer';
  source?: string;
  checkedAt?: string;
};

export type JourneyFlightSegment = {
  kind: 'flight';
  flightNumber: string;
  carrier: string;
  from: string;
  to: string;
  departAt: string;
  arriveAt: string;
  status?: JourneySegmentStatus;
  staffAvailability?: StaffAvailability;
  agreement?: string;
  source?: string;
  checkedAt?: string;
};

export type JourneySegment = JourneyGroundSegment | JourneyFlightSegment;

export type StaffTravelProfile = {
  /** IATA/ICAO codes the user says they can use. Empty means eligibility is unknown, not denied. */
  eligibleCarriers?: string[];
  /** When true, a flight on a carrier outside eligibleCarriers invalidates the plan. */
  strictEligibility?: boolean;
  preferredMinimumConnectionMinutes?: number;
  preferredPresentationBufferMinutes?: number;
};

export type JourneyPlanCandidate = {
  id: string;
  segments: JourneySegment[];
  presentationAt: string;
  /** Minimum time between the final arrival and presentation. */
  minimumPresentationBufferMinutes?: number;
  /** Number of later viable recovery options known from the data source. */
  recoveryOptions?: number;
  label?: string;
};

export type JourneyPlanIssue = {
  code:
    | 'invalid-time'
    | 'chronology'
    | 'misses-presentation'
    | 'carrier-not-eligible'
    | 'cancelled-flight'
    | 'tight-connection'
    | 'unknown-availability'
    | 'limited-availability'
    | 'stale-source'
    | 'airport-transfer';
  severity: 'blocker' | 'warning' | 'info';
  message: string;
};

export type JourneyPlanEvaluation = {
  candidate: JourneyPlanCandidate;
  feasible: boolean;
  score: number;
  presentationBufferMinutes: number | null;
  totalTravelMinutes: number | null;
  flightConnections: number;
  recoveryOptions: number;
  issues: JourneyPlanIssue[];
  explanation: string[];
};

function dateMs(value: string): number | null {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function minutesBetween(start: number, end: number): number {
  return Math.round((end - start) / 60000);
}

function carrierCode(value: string): string {
  return String(value || '').trim().toUpperCase();
}

function isFresh(checkedAt?: string, nowMs = Date.now(), maxAgeMinutes = 180): boolean {
  if (!checkedAt) return false;
  const checkedMs = dateMs(checkedAt);
  if (checkedMs == null) return false;
  return nowMs - checkedMs <= maxAgeMinutes * 60000 && checkedMs <= nowMs + 5 * 60000;
}

export function evaluateJourneyPlan(
  candidate: JourneyPlanCandidate,
  profile: StaffTravelProfile = {},
  now = new Date(),
): JourneyPlanEvaluation {
  const issues: JourneyPlanIssue[] = [];
  const explanation: string[] = [];
  const presentationMs = dateMs(candidate.presentationAt);
  const preferredBuffer = Math.max(0, candidate.minimumPresentationBufferMinutes ?? profile.preferredPresentationBufferMinutes ?? 90);
  const preferredConnection = Math.max(0, profile.preferredMinimumConnectionMinutes ?? 45);
  const eligible = new Set((profile.eligibleCarriers || []).map(carrierCode).filter(Boolean));
  const segments = candidate.segments || [];
  const parsed = segments.map((segment) => ({ segment, start: dateMs(segment.departAt), end: dateMs(segment.arriveAt) }));

  if (presentationMs == null || !segments.length || parsed.some((item) => item.start == null || item.end == null || item.end! <= item.start!)) {
    issues.push({ code: 'invalid-time', severity: 'blocker', message: 'O itinerário contém horário inválido ou incompleto.' });
  }

  for (let index = 1; index < parsed.length; index += 1) {
    const previous = parsed[index - 1];
    const current = parsed[index];
    if (previous.end != null && current.start != null && current.start < previous.end) {
      issues.push({ code: 'chronology', severity: 'blocker', message: 'Há trechos sobrepostos ou fora da ordem cronológica.' });
    }
  }

  const flights = segments.filter((segment): segment is JourneyFlightSegment => segment.kind === 'flight');
  for (const flight of flights) {
    if (flight.status === 'cancelled') {
      issues.push({ code: 'cancelled-flight', severity: 'blocker', message: `${flight.flightNumber} está cancelado.` });
    }
    const carrier = carrierCode(flight.carrier);
    if (profile.strictEligibility && eligible.size > 0 && !eligible.has(carrier)) {
      issues.push({ code: 'carrier-not-eligible', severity: 'blocker', message: `${carrier || flight.flightNumber} não está no perfil de elegibilidade informado pelo usuário.` });
    }
    if (flight.staffAvailability === 'closed') {
      issues.push({ code: 'limited-availability', severity: 'blocker', message: `${flight.flightNumber} não possui disponibilidade staff utilizável na fonte atual.` });
    } else if (flight.staffAvailability === 'limited') {
      issues.push({ code: 'limited-availability', severity: 'warning', message: `${flight.flightNumber} possui disponibilidade staff limitada.` });
    } else if (!flight.staffAvailability || flight.staffAvailability === 'unknown') {
      issues.push({ code: 'unknown-availability', severity: 'info', message: `${flight.flightNumber} está sem disponibilidade staff confirmada; o CrewCheck não presume assentos.` });
    }
    if (flight.checkedAt && !isFresh(flight.checkedAt, now.getTime())) {
      issues.push({ code: 'stale-source', severity: 'warning', message: `Os dados de ${flight.flightNumber} precisam ser atualizados antes de uma decisão crítica.` });
    }
  }

  for (let index = 1; index < parsed.length; index += 1) {
    const previous = parsed[index - 1];
    const current = parsed[index];
    if (previous.end == null || current.start == null) continue;
    const connectionMinutes = minutesBetween(previous.end, current.start);
    if (previous.segment.kind === 'flight' && current.segment.kind === 'flight' && connectionMinutes < preferredConnection) {
      issues.push({ code: 'tight-connection', severity: 'warning', message: `Conexão de ${connectionMinutes} min abaixo da margem preferida de ${preferredConnection} min.` });
    }
    if (current.segment.kind === 'ground' && current.segment.mode === 'airport-transfer') {
      issues.push({ code: 'airport-transfer', severity: 'info', message: `O plano inclui troca terrestre de aeroporto: ${current.segment.from} → ${current.segment.to}.` });
    }
  }

  const firstStart = parsed[0]?.start ?? null;
  const finalArrival = parsed[parsed.length - 1]?.end ?? null;
  const presentationBufferMinutes = presentationMs != null && finalArrival != null ? minutesBetween(finalArrival, presentationMs) : null;
  const totalTravelMinutes = firstStart != null && finalArrival != null ? minutesBetween(firstStart, finalArrival) : null;

  if (presentationBufferMinutes != null && presentationBufferMinutes < preferredBuffer) {
    issues.push({
      code: 'misses-presentation',
      severity: 'blocker',
      message: presentationBufferMinutes < 0
        ? `A chegada ocorre ${Math.abs(presentationBufferMinutes)} min depois da apresentação.`
        : `A chegada deixa apenas ${presentationBufferMinutes} min antes da apresentação; o mínimo configurado é ${preferredBuffer} min.`,
    });
  }

  const flightConnections = Math.max(0, flights.length - 1);
  const recoveryOptions = Math.max(0, Math.floor(candidate.recoveryOptions || 0));
  const blockerCount = issues.filter((issue) => issue.severity === 'blocker').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  const unknownAvailabilityCount = issues.filter((issue) => issue.code === 'unknown-availability').length;
  const airportTransfers = issues.filter((issue) => issue.code === 'airport-transfer').length;

  let score = blockerCount ? 0 : 78;
  if (!blockerCount) {
    score += Math.min(12, recoveryOptions * 3);
    if (presentationBufferMinutes != null) score += Math.min(8, Math.max(0, Math.floor((presentationBufferMinutes - preferredBuffer) / 30)));
    score -= flightConnections * 4;
    score -= airportTransfers * 5;
    score -= warningCount * 7;
    score -= unknownAvailabilityCount * 2;
    score = Math.max(1, Math.min(100, Math.round(score)));
  }

  if (presentationBufferMinutes != null) explanation.push(`Margem até a apresentação: ${presentationBufferMinutes} min.`);
  explanation.push(recoveryOptions > 0 ? `${recoveryOptions} alternativa(s) posterior(es) conhecida(s) para recuperação.` : 'Nenhuma alternativa posterior conhecida foi informada pela fonte.');
  if (flights.length) explanation.push(`${flights.length} trecho(s) aéreo(s), com ${flightConnections} conexão(ões) aérea(s).`);
  if (unknownAvailabilityCount) explanation.push('Disponibilidade desconhecida não foi tratada como assento disponível.');

  return {
    candidate,
    feasible: blockerCount === 0,
    score,
    presentationBufferMinutes,
    totalTravelMinutes,
    flightConnections,
    recoveryOptions,
    issues,
    explanation,
  };
}

function firstDeparture(evaluation: JourneyPlanEvaluation): number {
  return dateMs(evaluation.candidate.segments[0]?.departAt || '') ?? Number.POSITIVE_INFINITY;
}

export function rankJourneyPlans(
  candidates: JourneyPlanCandidate[],
  profile: StaffTravelProfile = {},
  strategy: JourneyStrategy = 'safest',
  now = new Date(),
): JourneyPlanEvaluation[] {
  const evaluated = candidates.map((candidate) => evaluateJourneyPlan(candidate, profile, now));
  return evaluated.sort((a, b) => {
    if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
    if (!a.feasible && !b.feasible) return b.score - a.score;
    if (strategy === 'fastest') return (a.totalTravelMinutes ?? Number.POSITIVE_INFINITY) - (b.totalTravelMinutes ?? Number.POSITIVE_INFINITY) || b.score - a.score;
    if (strategy === 'fewest-connections') return a.flightConnections - b.flightConnections || b.score - a.score;
    if (strategy === 'last-safe') return firstDeparture(b) - firstDeparture(a) || b.score - a.score;
    if (strategy === 'availability') {
      const availabilityPenalty = (value: JourneyPlanEvaluation) => value.issues.filter((issue) => issue.code === 'unknown-availability' || issue.code === 'limited-availability').length;
      return availabilityPenalty(a) - availabilityPenalty(b) || b.recoveryOptions - a.recoveryOptions || b.score - a.score;
    }
    return b.score - a.score || b.recoveryOptions - a.recoveryOptions;
  });
}

export function selectJourneyPlans(
  candidates: JourneyPlanCandidate[],
  profile: StaffTravelProfile = {},
  strategy: JourneyStrategy = 'safest',
  limit = 3,
  now = new Date(),
): JourneyPlanEvaluation[] {
  return rankJourneyPlans(candidates, profile, strategy, now).filter((item) => item.feasible).slice(0, Math.max(1, limit));
}
