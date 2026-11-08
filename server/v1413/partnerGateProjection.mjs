import { normalizeAirport, normalizePartnerFlight, normalizeGateSourceClass } from './partnerGateIdentity.mjs';

const operationalFields = { gate: 'departureGate', terminal: 'departureTerminal', status: 'status' };
const text = value => typeof value === 'string' ? value.trim() : '';

// approvals come exclusively from a future trusted server-side rights resolver.
// A source label (including a Radar-provided partnerShareable flag) is not a grant.
export function partnerGateSourcePolicy(field, request = {}, approvals = [], now = new Date()) {
  const sourceClass = 'unclassified';
  if (!text(request.partnerId) || !field || !text(field.provider) || !text(field.value) || !text(request.occurrenceKey)
      || field.occurrenceKey !== request.occurrenceKey) return { sourceClass, shareable: false };
  const grant = Array.isArray(approvals) && approvals.find(item => item
    && item.partnerId === request.partnerId && item.provider === field.provider && item.occurrenceKey === request.occurrenceKey
    && Array.isArray(item.fields) && item.fields.includes(request.field)
    && item.accessApproved === true && item.redistributionApproved === true
    && text(item.reviewId) && Number.isFinite(Date.parse(item.validUntil))
    && Date.parse(item.validUntil) > now.getTime()
    && normalizeGateSourceClass(item.sourceClass) !== 'unclassified');
  return grant ? { sourceClass: normalizeGateSourceClass(grant.sourceClass), shareable: true }
    : { sourceClass, shareable: false };
}

export function partnerGatePayload(radar = {}, request = {}, now = new Date(), approvals = []) {
  const occurrenceKey = text(request.occurrenceKey);
  const flight = normalizePartnerFlight(request.flight);
  const origin = normalizeAirport(request.origin);
  const destination = normalizeAirport(request.destination);
  const matches = Boolean(flight && origin && destination && occurrenceKey
    && normalizePartnerFlight(radar.flight) === flight
    && normalizeAirport(radar.origin) === origin && normalizeAirport(radar.destination) === destination
    && radar.occurrenceKey === occurrenceKey && radar.provenance?.occurrenceKey === occurrenceKey);
  const result = { ok: false, apiVersion: 'v1', flight: flight || null, origin: origin || null,
    destination: destination || null, gate: null, terminal: null, flightStatus: null,
    gateStatus: 'unavailable', source: 'crewcheck-radar', sourceClass: 'unclassified',
    shareable: false, confidence: 0, confidenceBand: 'low', retrievedAt: now.toISOString(), occurrenceMatch: 'live-flight-route', occurrenceVerified: matches,
    provenance: { occurrenceKey: matches ? occurrenceKey : null, fields: {} } };
  for (const [output, name] of Object.entries(operationalFields)) {
    const field = radar.provenance?.fields?.[name];
    const value = text(radar[output]);
    const policy = partnerGateSourcePolicy(field, { occurrenceKey, field: name, partnerId: request.partnerId }, approvals, now);
    const observedMs = Date.parse(field?.observedAt);
    const fresh = Number.isFinite(observedMs) && observedMs <= now.getTime()
      && now.getTime() - observedMs <= 15 * 60_000;
    const allowed = radar.ok === true && matches && fresh && policy.shareable && value && value === text(field?.value);
    if (allowed) {
      result[output === 'status' ? 'flightStatus' : output] = value;
      result.provenance.fields[name] = { provider: field.provider, observedAt: field.observedAt,
        occurrenceKey, sourceClass: policy.sourceClass };
      if (output === 'gate') {
        result.ok = true; result.shareable = true; result.sourceClass = policy.sourceClass;
        result.gateStatus = 'available';
        const quality = typeof radar.quality === 'number' && Number.isFinite(radar.quality)
          ? Math.max(0, Math.min(100, radar.quality)) : 0;
        result.confidence = Number((quality / 100).toFixed(2));
        result.confidenceBand = quality >= 80 ? 'high' : quality >= 55 ? 'medium' : 'low';
      }
    }
  }
  return result;
}

// Bounded allowlist output: raw Radar metadata never crosses this boundary.
export function projectPartnerRadar(radar, request, now, approvals) {
  return partnerGatePayload(radar, request, now, approvals);
}
