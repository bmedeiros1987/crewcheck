import { createHash } from 'node:crypto';
import { gateQueryDay, radarFlightId } from '../../shared/gate-query-day.mjs';
import { inspectGateSourceHistory } from '../web-push/gateSourceHistory.mjs';

const digest = fields => createHash('sha256').update(JSON.stringify(fields)).digest('hex');
export const isNativeGateEvent = value => typeof value === 'string' && value.startsWith('gate_');
export const validNativeGateSource = value => typeof value === 'string' && /^gate_source_[a-f0-9]{64}$/.test(value);

function inspectNativeGateSource(source, ownerId, now) {
  if ([source?.observation, source?.previousObservation].some(value =>
    value?.operationalConflicts != null && !Array.isArray(value.operationalConflicts))) return null;
  const history = inspectGateSourceHistory(source, {
    ownerId, rosterRevision: source?.rosterRevision, identity: source?.identity,
  }, now);
  if (!history.current) return null;
  const { current, previous } = history;
  const gateSourceKey = 'gate_source_' + digest([
    ownerId, radarFlightId(current.flight), current.origin, current.destination, current.scheduledDepartureUtc,
  ]);
  const observedAt = Date.parse(current.sourceUpdatedAt);
  const revision = digest([source.rosterRevision]);
  const eventKey = history.status === 'change'
    ? 'gate_' + digest([gateSourceKey, revision, current.gate, observedAt])
    : null;
  const validUntil = Math.min(Date.parse((previous ?? current).sourceUpdatedAt) + 30 * 60_000,
    Date.parse(current.scheduledDepartureUtc) + 60 * 60_000);
  return { gateSourceKey, eventKey, observedAt, revision, validUntil };
}

// For trusted producers. These keys select an occurrence and one change. The
// queue independently rederives both keys from the locked server-side read.
export function nativeGateEvent(source, ownerId, now) {
  const proof = inspectNativeGateSource(source, ownerId, now);
  return proof?.eventKey ? { gateSourceKey: proof.gateSourceKey, eventKey: proof.eventKey } : null;
}

export function verifyNativeGateEvent(read, ownerId, expected, now) {
  if (read?.status === 'removed' && read.ownerId === ownerId && read.gateSourceKey === expected.gateSourceKey) {
    return { status: 'cancelled' };
  }
  if (read?.status !== 'available') return { status: 'unavailable' };
  const proof = inspectNativeGateSource(read.source, ownerId, now);
  if (!proof || proof.gateSourceKey !== expected.gateSourceKey || proof.observedAt < (expected.observedAt ?? 0)) {
    return { status: 'unavailable' };
  }
  if (proof.eventKey === expected.eventKey && expected.expiresAt <= proof.validUntil
    && gateQueryDay(read.source.identity, expected.expiresAt - 1).allowed) {
    return { status: 'confirmed', observedAt: proof.observedAt, revision: proof.revision };
  }
  // An incomplete read or contradictory equal-time observation cannot prove
  // removal. A newer confirmed observation or a changed roster revision can.
  if (expected.observedAt !== undefined
    && (proof.observedAt > expected.observedAt || (proof.eventKey && proof.revision !== expected.revision))) {
    return { status: 'cancelled' };
  }
  return { status: 'unavailable' };
}
