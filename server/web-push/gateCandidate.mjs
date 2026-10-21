import crypto from 'node:crypto';
import { gateQueryDay, radarResultDecision, radarFlightId } from '../../shared/gate-query-day.mjs';
import { customGateSourceUpdate } from '../gate-source-update.mjs';
import { dispatchMockPush } from './offlineTransport.mjs';

const MAX_AGE = 30 * 60_000;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,160}$/.test(value);
const same = (a, b) => digest(a) === digest(b);
const blocked = reason => ({ status: 'blocked', reason, received: null });

// This module has no environment, DB discovery, public endpoint or live sender.
// The host is deliberately restricted to isolated fixtures. Its read/transaction
// methods model future server authority; they do not authenticate a real user.
export function createOfflineGatePushCandidate(options = {}) {
  if (options.enabled !== true) return Object.freeze({ process: async () => ({ status: 'disabled', received: null }) });
  const { host, repository, mockProvider, clock = () => Date.now() } = options;
  if (host?.kind !== 'isolated-gate-authority' || typeof host.read !== 'function'
    || typeof repository?.transaction !== 'function' || typeof repository?.isCurrent !== 'function'
    || mockProvider?.kind !== 'isolated-web-push-mock') throw Error('Somente candidato isolado permitido.');

  function admitted(value, now) {
    const state = structuredClone(value);
    const { ownerId, authority, installation, consent, identity, observation } = state || {};
    if (!authority || authority.ownerId !== ownerId || !id(authority.epoch) || authority.revoked !== false
      || !Number.isFinite(authority.expiresAt) || authority.expiresAt <= now || authority.expiresAt - now > 5 * 60_000) return null;
    if (!id(ownerId) || !id(installation?.installationId) || installation.ownerId !== ownerId
      || installation.active !== true || !Number.isSafeInteger(installation.revision) || installation.revision < 1
      || consent?.ownerId !== ownerId || consent.installationId !== installation.installationId
      || consent.enabled !== true || consent.topic !== 'departure-gate-change'
      || consent.installationRevision !== installation.revision || !Number.isSafeInteger(consent.revision) || consent.revision < 1
      || !id(state.rosterRevision) || !gateQueryDay(identity, now).allowed) return null;
    // No first gate, aircraft signal, generic record update, receipt or arrival
    // gate can manufacture the required source-produced departure-gate update.
    if (observation?.provider !== 'custom' || observation.ok !== true
      || observation.operationalConflicts?.includes('gate')
      || !radarResultDecision(observation, identity, now).allowed) return null;
    const proof = customGateSourceUpdate(observation, now);
    // Conservative subset of boarding codes; positions/remote/unknown labels are
    // not changes this candidate can announce. It never normalizes a missing gate.
    if (!proof || !/^[A-Z]?\d{1,3}[A-Z]?$/.test(proof.gate) || radarFlightId(proof.flight) !== radarFlightId(identity.flight)
      || proof.origin !== identity.origin || proof.destination !== identity.destination
      || Date.parse(proof.scheduledDepartureUtc) !== Date.parse(identity.scheduledDepartureUtc)) return null;
    const observedAt = Date.parse(proof.sourceUpdatedAt), departure = Date.parse(identity.scheduledDepartureUtc);
    if (now - observedAt > MAX_AGE || departure - now > 8 * 60 * 60_000 || now - departure >= 60 * 60_000) return null;
    const occurrence = [radarFlightId(identity.flight), identity.origin, identity.destination, new Date(departure).toISOString()];
    return { ownerId, authority: { ownerId, epoch: authority.epoch, expiresAt: authority.expiresAt, revoked: false }, installation: { ownerId, installationId: installation.installationId, revision: installation.revision, active: true },
      consent: { ownerId, installationId: consent.installationId, installationRevision: consent.installationRevision, revision: consent.revision, enabled: true, topic: consent.topic },
      rosterRevision: state.rosterRevision, occurrence,
      gate: proof.gate, observedAt, expiresAt: Math.min(authority.expiresAt, observedAt + MAX_AGE, departure + 60 * 60_000) };
  }

  return Object.freeze({ async process() {
    // No client-supplied observation/identity is accepted by this entry point.
    const initial = admitted(await host.read(), clock());
    if (!initial) return blocked('authority-consent-or-source-unconfirmed');
    const scope = 'gate-candidate:' + digest([initial.ownerId, initial.installation.installationId,
      initial.installation.revision, initial.consent.revision, initial.authority.epoch, initial.rosterRevision, initial.occurrence]);
    const decision = await repository.transaction(scope, async record => {
      const current = admitted(await host.read(), clock());
      if (!current || !same(initial, current)) return blocked('context-changed');
      const previous = record.baseline;
      // State and pending events are saved in ONE host transaction. A recreated
      // producer resumes these events; dispatch has its own durable event claim.
      const pending = (record.pending || []).filter(event => event.expiresAt > clock() && event.gate === current.gate);
      if (previous && current.observedAt < previous.observedAt) return blocked('older-source');
      if (previous && current.observedAt === previous.observedAt && current.gate !== previous.gate) {
        await record.save({ baseline: { ...previous, conflicted: true }, pending: [] });
        return blocked('equal-time-conflict');
      }
      const baseline = { gate: current.gate, observedAt: current.observedAt, conflicted: previous?.observedAt === current.observedAt && previous.conflicted === true };
      if (previous && previous.observedAt < current.observedAt && !previous.conflicted
        && clock() - previous.observedAt <= MAX_AGE && current.observedAt - previous.observedAt <= MAX_AGE && previous.gate !== current.gate) {
        const eventKey = 'gate-change-v1:' + digest([scope, current.gate, current.observedAt]);
        if (!pending.some(event => event.eventKey === eventKey)) pending.push({ eventKey, gate: current.gate, observedAt: current.observedAt, expiresAt: current.expiresAt });
      }
      if (pending.length > 50) return blocked('capacity');
      await record.save({ baseline, pending });
      return { status: pending.length ? 'pending' : 'baseline', pending, current };
    });
    if (!decision.pending?.length) return { status: decision.status, reason: decision.reason, received: null };
    const results = [];
    for (const event of decision.pending) {
      const current = admitted(await host.read(), clock());
      // Coalesce obsolete changes: no old gate is announced after a newer source,
      // consent edit, account/roster replacement or installation revocation.
      if (!current || !same(current, decision.current) || current.gate !== event.gate || current.observedAt < event.observedAt)
        return blocked('context-changed-before-dispatch');
      const envelope = { schema: 'crewcheck-notice-v1', ownerId: current.ownerId,
        installationId: current.installation.installationId, consentRevision: current.installation.revision,
        eventKey: event.eventKey, topicRevision: current.consent.revision, authorityEpoch: current.authority.epoch,
        expiresAt: new Date(event.expiresAt).toISOString(), route: '/app' };
      const context = { ownerId: current.ownerId, sourceVerified: true, eligible: true, consent: true,
        gateCandidate: current };
      const guardedRepository = { transaction: repository.transaction.bind(repository),
        isCurrent: async (installation, selected) => {
          const actual = admitted(await host.read(), clock());
          return Boolean(actual && same(actual, selected.gateCandidate) && await repository.isCurrent(installation, selected));
        } };
      results.push(await dispatchMockPush({ repository: guardedRepository, mockProvider,
        installation: current.installation, envelope, context, now: clock(), clock }));
    }
    return { status: 'processed', results, received: null };
  } });
}
