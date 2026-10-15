import { normalizeAirport, normalizePartnerFlight } from './partnerGateIdentity.mjs';
import { partnerGatePayload } from './partnerGateProjection.mjs';
export { normalizeAirport, normalizePartnerFlight, normalizeGateSourceClass, parsePartnerScopes } from './partnerGateIdentity.mjs';
export { partnerGatePayload, partnerGateSourcePolicy } from './partnerGateProjection.mjs';

// Offline composition seam only. No route, scheduler, credentials or network reader
// is installed. Access authorization must be enforced by a future HTTP composition.
export async function readPartnerGate(request = {}, dependencies = {}) {
  const partnerId = typeof dependencies.partnerId === 'string' ? dependencies.partnerId.trim() : '';
  const flight = normalizePartnerFlight(request.flight);
  const origin = normalizeAirport(request.origin);
  const destination = normalizeAirport(request.destination);
  const occurrenceKey = typeof request.occurrenceKey === 'string' ? request.occurrenceKey.trim() : '';
  if (!flight || !origin || !destination || !occurrenceKey) {
    return { ok: false, code: 'INVALID_OCCURRENCE' };
  }
  if (!partnerId || typeof dependencies.readRadar !== 'function') return { ok: false, code: 'PARTNER_API_NOT_COMPOSED' };
  const anchor = { partnerId, flight, origin, destination, occurrenceKey };
  try {
    const radar = await dependencies.readRadar({ ...anchor });
    const now = dependencies.now?.() ?? new Date();
    // This resolver is a trusted dependency, never a property of the request/Radar.
    const approvals = typeof dependencies.resolveRights === 'function'
      ? await dependencies.resolveRights({ ...anchor }) : [];
    return partnerGatePayload(radar, anchor, now, approvals);
  } catch {
    return { ok: false, code: 'RADAR_UNAVAILABLE' };
  }
}
