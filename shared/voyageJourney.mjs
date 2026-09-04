export const VOYAGE_PHASES = Object.freeze([
  'planning',
  'wake',
  'prepare',
  'ride',
  'airport',
  'checkin',
  'security',
  'airside',
  'boarding',
  'flight',
  'connection',
  'arrival',
  'destination',
  'recovery',
  'complete',
]);

export const VOYAGE_RISK_LEVELS = Object.freeze(['healthy', 'attention', 'risk', 'critical', 'unknown']);

export function isVoyageStateFresh(state, now = Date.now()) {
  if (!state || !state.updatedAt) return false;
  const staleAt = state.staleAt ? Date.parse(state.staleAt) : NaN;
  if (Number.isFinite(staleAt)) return now < staleAt;
  const updatedAt = Date.parse(state.updatedAt);
  return Number.isFinite(updatedAt) && now - updatedAt <= 15 * 60 * 1000;
}

export function sanitizeVoyageLiveState(input = {}) {
  const state = {
    phase: VOYAGE_PHASES.includes(input.phase) ? input.phase : 'planning',
    flightStatus: input.flightStatus ?? 'unknown',
    origin: input.origin ?? null,
    destination: input.destination ?? null,
    gate: input.gate ?? null,
    terminal: input.terminal ?? null,
    nextAction: input.nextAction ?? null,
    nextActionAt: input.nextActionAt ?? null,
    departureAt: input.departureAt ?? null,
    boardingAt: input.boardingAt ?? null,
    eta: input.eta ?? null,
    connectionMarginMinutes: Number.isFinite(input.connectionMarginMinutes) ? input.connectionMarginMinutes : null,
    riskLevel: VOYAGE_RISK_LEVELS.includes(input.riskLevel) ? input.riskLevel : 'unknown',
    updatedAt: input.updatedAt ?? null,
    staleAt: input.staleAt ?? null,
    primaryAction: input.primaryAction ?? null,
  };

  return Object.freeze(state);
}

export function deriveVoyageRisk({ connectionMarginMinutes, minutesUntilBoardingClose, freshness = true } = {}) {
  if (!freshness) return 'unknown';
  const margins = [connectionMarginMinutes, minutesUntilBoardingClose].filter(Number.isFinite);
  if (!margins.length) return 'unknown';
  const margin = Math.min(...margins);
  if (margin < 0) return 'critical';
  if (margin < 15) return 'critical';
  if (margin < 30) return 'risk';
  if (margin < 50) return 'attention';
  return 'healthy';
}

export function publicLockScreenState(input = {}) {
  const state = sanitizeVoyageLiveState(input);
  return Object.freeze({
    phase: state.phase,
    flightStatus: state.flightStatus,
    origin: state.origin,
    destination: state.destination,
    gate: state.gate,
    terminal: state.terminal,
    nextAction: state.nextAction,
    nextActionAt: state.nextActionAt,
    departureAt: state.departureAt,
    boardingAt: state.boardingAt,
    eta: state.eta,
    connectionMarginMinutes: state.connectionMarginMinutes,
    riskLevel: state.riskLevel,
    updatedAt: state.updatedAt,
    staleAt: state.staleAt,
    primaryAction: state.primaryAction,
  });
}
