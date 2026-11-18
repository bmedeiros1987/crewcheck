import { customGateSourceUpdate } from '../gate-source-update.mjs';
import { gateQueryDay, radarResultDecision, radarFlightId } from '../../shared/gate-query-day.mjs';

// Admission of the EXISTING readSource result, not a provider decoder or a cache
// writer. Only a trusted server reader may supply it. No job/device/request JSON
// establishes provenance, and a provider label alone is never source proof.
const MAX_AGE = 30 * 60_000;
const blocked = reason => ({ status: 'blocked', reason });
export function inspectGateSourceHistory(source, scope, now = Date.now()) {
  if (!Number.isFinite(now) || typeof scope?.ownerId !== 'string' || !/^[A-Za-z0-9_-]{8,160}$/.test(scope.ownerId)
    || !scope.identity || !gateQueryDay(scope.identity, now).allowed
    || !source || source.ownerId !== scope.ownerId || typeof source.rosterRevision !== 'string'
    || !source.rosterRevision || source.rosterRevision !== scope.rosterRevision) return blocked('source-scope-unconfirmed');
  function observation(value) {
    if (value?.provider !== 'custom' || value.ok !== true || value.querySuppressed
      || value.operationalConflicts?.includes('gate') || !radarResultDecision(value, scope.identity, now).allowed) return null;
    const proof = customGateSourceUpdate(value, now), receipt = value.sourceReceivedAt;
    if (!proof || !/^[A-Z]?\d{1,3}[A-Z]?$/.test(proof.gate)
      || radarFlightId(proof.flight) !== radarFlightId(scope.identity.flight)
      || proof.origin !== scope.identity.origin || proof.destination !== scope.identity.destination
      || Date.parse(proof.scheduledDepartureUtc) !== Date.parse(scope.identity.scheduledDepartureUtc)) return null;
    const observed = Date.parse(proof.sourceUpdatedAt);
    // Source observation <= server receipt <= now. Receipt/cache/generic updated
    // timestamps never replace the source-produced departureGateUpdate.
    if (!Number.isFinite(receipt) || receipt <= 0 || observed > receipt || receipt > now || now - observed > MAX_AGE) return null;
    return { ...proof, sourceReceivedAt: receipt };
  }
  const current = observation(source.observation);
  if (!current) return blocked('current-source-unconfirmed');
  const departure = Date.parse(current.scheduledDepartureUtc);
  if (departure - now > 8 * 60 * 60_000 || now - departure >= 60 * 60_000) return blocked('outside-change-window');
  if (source.previousObservation == null) return { status: 'baseline', current };
  const previous = observation(source.previousObservation);
  if (!previous) return blocked('previous-source-unconfirmed');
  if (previous.sourceReceivedAt > current.sourceReceivedAt) return blocked('receipt-order-unconfirmed');
  const before = Date.parse(previous.sourceUpdatedAt), after = Date.parse(current.sourceUpdatedAt);
  if (before > after) return blocked('older-source');
  if (before === after && previous.gate !== current.gate) return blocked('equal-time-conflict');
  if (previous.gate === current.gate) return { status: 'unchanged', current, previous };
  return { status: 'change', current, previous };
}
