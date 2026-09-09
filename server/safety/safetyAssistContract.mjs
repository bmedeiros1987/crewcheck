export const SAFETY_ASSIST_REASONS = Object.freeze({
  UNSAFE: 'unsafe',
  MEDICAL: 'medical',
  HOTEL: 'hotel',
  STRANDED: 'stranded',
  TALK_TO_SOMEONE: 'talk_to_someone',
});

export const SAFETY_ASSIST_STATES = Object.freeze({
  STARTING: 'starting',
  ACTIVE: 'active',
  DEGRADED: 'degraded',
  NEEDS_CHECKIN: 'needs_checkin',
  HELP_REQUESTED: 'help_requested',
  SAFE: 'safe',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
});

export const SAFETY_DELIVERY_STATES = Object.freeze({
  QUEUED: 'queued',
  SENT: 'sent',
  DELIVERED: 'delivered',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
  UNKNOWN: 'unknown',
});

const ACTIVE_STATES = new Set([
  SAFETY_ASSIST_STATES.STARTING,
  SAFETY_ASSIST_STATES.ACTIVE,
  SAFETY_ASSIST_STATES.DEGRADED,
  SAFETY_ASSIST_STATES.NEEDS_CHECKIN,
  SAFETY_ASSIST_STATES.HELP_REQUESTED,
]);

export function normalizeSafetyReason(value = '') {
  const candidate = String(value || '').trim().toLowerCase();
  return Object.values(SAFETY_ASSIST_REASONS).includes(candidate) ? candidate : '';
}

export function normalizeSafetyState(value = '') {
  const candidate = String(value || '').trim().toLowerCase();
  return Object.values(SAFETY_ASSIST_STATES).includes(candidate) ? candidate : '';
}

export function isSafetySessionActive(session = {}) {
  const state = normalizeSafetyState(session.state);
  if (!ACTIVE_STATES.has(state)) return false;
  const expiresAt = Date.parse(session.expiresAt || '');
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export function buildSafetyAssistSession(input = {}, now = new Date()) {
  const reason = normalizeSafetyReason(input.reason);
  if (!reason) throw new TypeError('Safety Assist requires a supported reason.');

  const durationMinutes = Math.min(240, Math.max(5, Number(input.durationMinutes || 30)));
  const createdAt = new Date(now);
  const expiresAt = new Date(createdAt.getTime() + durationMinutes * 60_000);
  const recipients = Array.isArray(input.recipientIds)
    ? [...new Set(input.recipientIds.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 8)
    : [];

  return Object.freeze({
    schemaVersion: 1,
    sessionId: String(input.sessionId || '').trim(),
    reason,
    state: SAFETY_ASSIST_STATES.STARTING,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    destination: input.destination ? String(input.destination).trim().slice(0, 500) : '',
    expectedArrivalAt: input.expectedArrivalAt ? new Date(input.expectedArrivalAt).toISOString() : null,
    recipientIds: recipients,
    shareLocation: Boolean(input.shareLocation),
    source: input.source ? String(input.source).trim().slice(0, 40) : 'app',
    lastLocationAt: null,
    lastCheckInAt: null,
    lastDeliveryState: SAFETY_DELIVERY_STATES.UNKNOWN,
  });
}

export function classifySafetyTelemetry(session = {}, telemetry = {}, now = new Date()) {
  if (!isSafetySessionActive({ ...session, state: session.state || SAFETY_ASSIST_STATES.ACTIVE })) {
    return { state: SAFETY_ASSIST_STATES.EXPIRED, reasons: ['session_expired'] };
  }

  const reasons = [];
  const nowMs = new Date(now).getTime();
  const lastLocationMs = Date.parse(telemetry.lastLocationAt || session.lastLocationAt || '');
  const battery = Number(telemetry.batteryPercent);
  const expectedArrivalMs = Date.parse(session.expectedArrivalAt || '');

  if (!Number.isFinite(lastLocationMs) || nowMs - lastLocationMs > 10 * 60_000) reasons.push('location_stale');
  if (Number.isFinite(battery) && battery <= 10) reasons.push('battery_critical');
  if (telemetry.networkAvailable === false) reasons.push('network_unavailable');
  if (Number.isFinite(expectedArrivalMs) && nowMs > expectedArrivalMs + 10 * 60_000) reasons.push('arrival_overdue');
  if (telemetry.routeDeviationMaterial === true) reasons.push('route_deviation');
  if (telemetry.longStopMaterial === true) reasons.push('long_stop');

  return {
    state: reasons.length ? SAFETY_ASSIST_STATES.DEGRADED : SAFETY_ASSIST_STATES.ACTIVE,
    reasons,
  };
}

export function canReportSafetyDelivery(state = '') {
  return Object.values(SAFETY_DELIVERY_STATES).includes(String(state || '').trim().toLowerCase());
}
