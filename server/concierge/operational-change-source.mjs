import { inspectGateSourceHistory } from '../web-push/gateSourceHistory.mjs';
import { radarFlightId, radarSourceEpoch, radarResultDecision, gateQueryDay } from '../../shared/gate-query-day.mjs';

// DATA contract only; no HTTP reader, polling, provider activation or cache writer.
// A trusted server reader must bind owner + current canonical roster + occurrence.
const blocked = reason => ({ status: 'blocked', reason });
const canonical = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const statuses = new Set(['scheduled','boarding','delayed','departed','cancelled','diverted','arrived']);
export function inspectOperationalChange(source, scope, field, now = Date.now()) {
  if (!['gate','status'].includes(field) || !Number.isFinite(now)) return blocked('field-unconfirmed');
  if (field === 'gate') {
    const result = inspectGateSourceHistory(source, scope, now);
    return result.status === 'change' ? { ...result, field, before: result.previous.gate, after: result.current.gate } : result;
  }
  if (!source || typeof scope?.ownerId !== 'string' || !/^[A-Za-z0-9_-]{8,160}$/.test(scope.ownerId)
    || !scope.identity || !gateQueryDay(scope.identity, now).allowed || source.ownerId !== scope.ownerId || !source.rosterRevision || source.rosterRevision !== scope.rosterRevision) return blocked('source-scope-unconfirmed');
  function observation(item) {
    const p = item?.departureStatusUpdate, status = canonical(item?.status);
    if (item?.provider !== 'custom' || item.ok !== true || item.querySuppressed || item.operationalConflicts?.includes('status')
      || !radarResultDecision(item, scope.identity, now).allowed || !statuses.has(status)
      || p?.schema !== 'crewcheck.departure-status-update.v1' || canonical(p.status) !== status) return null;
    const observed = radarSourceEpoch(p.updatedAt), receipt = item.sourceReceivedAt;
    if (!Number.isFinite(observed) || observed <= 0 || !Number.isFinite(receipt) || observed > receipt || receipt > now
      || now - observed > 1800000 || radarFlightId(p.flight) !== radarFlightId(scope.identity.flight)
      || p.origin !== scope.identity.origin || p.destination !== scope.identity.destination
      || radarSourceEpoch(p.scheduledDepartureUtc) !== radarSourceEpoch(scope.identity.scheduledDepartureUtc)) return null;
    return { status, sourceUpdatedAt: new Date(observed).toISOString(), sourceReceivedAt: receipt };
  }
  const current = observation(source.observation);
  if (!current) return blocked('current-source-unconfirmed');
  const departure = radarSourceEpoch(scope.identity?.scheduledDepartureUtc);
  if (!Number.isFinite(departure) || departure - now > 28800000 || now - departure >= 3600000) return blocked('outside-change-window');
  if (source.previousObservation == null) return { status: 'baseline', current };
  const previous = observation(source.previousObservation);
  if (!previous) return blocked('previous-source-unconfirmed');
  if (previous.sourceReceivedAt > current.sourceReceivedAt || previous.sourceUpdatedAt > current.sourceUpdatedAt) return blocked('older-source');
  if (previous.sourceUpdatedAt === current.sourceUpdatedAt && previous.status !== current.status) return blocked('equal-time-conflict');
  if (previous.status === current.status) return { status: 'unchanged', current, previous };
  return { status: 'change', field, before: previous.status, after: current.status, previous, current };
}
