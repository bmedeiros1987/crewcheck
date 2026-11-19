import { randomUUID } from 'node:crypto';
import { NATIVE_PACKAGE, NATIVE_PROJECT, validNativeDeliveryId, withNativeDeliveryState } from './registry.mjs';
import { isNativeGateEvent, validNativeGateSource, verifyNativeGateEvent } from './gate-source.mjs';

export const NATIVE_DELIVERY_QUEUE_ENABLED = false;
const BINDING_FIELDS = ['revision', 'consentRevision', 'generation', 'tokenRevision'];
const TERMINAL_RESULTS = new Set(['accepted_unconfirmed', 'rejected', 'expired']);
const JOB_STATES = new Set(['queued', 'dispatching', 'cancelled', 'uncertain', ...TERMINAL_RESULTS]);
const queueError = (code, status) => Object.assign(new Error(code), {code, status});
const gateNotConfirmed = new Error('NATIVE_GATE_SOURCE_NOT_CONFIRMED');

function scoped(raw) {
  return {
    identity: {ownerId: raw?.identity?.ownerId, email: raw?.identity?.email},
    installationId: raw?.installationId,
    eventKey: raw?.eventKey,
  };
}

function checkJob(job) {
  if (job === null) return;
  if (job.schema !== 1 || !validNativeDeliveryId(job.id) || !JOB_STATES.has(job.state)
    || !Number.isSafeInteger(job.scheduledAt) || !Number.isSafeInteger(job.expiresAt) || job.scheduledAt >= job.expiresAt
    || BINDING_FIELDS.some(field => !Number.isSafeInteger(job[field]) || job[field] < 1)
    || (job.gateSource !== undefined && (!validNativeGateSource(job.gateSource?.gateSourceKey)
      || !Number.isSafeInteger(job.gateSource.observedAt) || job.gateSource.observedAt <= 0
      || typeof job.gateSource.revision !== 'string' || !/^[a-f0-9]{64}$/.test(job.gateSource.revision)))
    || (job.claimId !== null && !validNativeDeliveryId(job.claimId))
    || (job.state === 'queued' && job.claimId !== null)
    || (job.state === 'dispatching' && job.claimId === null)) throw queueError('NATIVE_INVALID_DELIVERY_STATE',503);
}

function bindingMatches(binding, job) {
  return binding?.active === true && BINDING_FIELDS.every(field => binding[field] === job[field]);
}

/** Unmounted worker. The caller supplies a trusted owner/installation and a
 * stable source-event key. Gate jobs also have an opaque occurrence/revision
 * proof. Profile deletion erases its namespace.
 *
 * lockGateSource is an optional trusted host reader, never a request callback.
 * The readSourceState capability locks an existing state row in this SQL
 * transaction. The order is profile, binding/token, outbox, source. A source
 * writer must commit before calling the queue, or use this same order.
 * No provider reads belong in the reader.
 */
export function createNativeDeliveryQueue({enabled = NATIVE_DELIVERY_QUEUE_ENABLED, db, protection, clock = Date.now, lockGateSource} = {}) {
  const now = () => {
    const value = clock();
    if (!Number.isSafeInteger(value)) throw queueError('NATIVE_CLOCK_REQUIRED',503);
    return value;
  };
  async function gateDecision(readSourceState, scope, expected) {
    if (typeof lockGateSource !== 'function') return { status: 'unavailable' };
    const read = await lockGateSource(readSourceState, Object.freeze({
      identity: Object.freeze({ ...scope.identity }), gateSourceKey: expected.gateSourceKey,
    }));
    return verifyNativeGateEvent(read, scope.identity.ownerId, { ...expected, eventKey: scope.eventKey }, now());
  }
  async function dispatchGateStatus(readSourceState, scope, job) {
    if (!job.gateSource) return isNativeGateEvent(scope.eventKey) ? 'cancelled' : 'confirmed';
    const decision = await gateDecision(readSourceState, scope, { ...job.gateSource, expiresAt: job.expiresAt });
    return decision.status;
  }
  return {
    async enqueue(raw, timing) {
      if (enabled !== true) return {state:'disabled',received:null};
      const scope = scoped(raw), scheduledAt = timing?.scheduledAt, expiresAt = timing?.expiresAt;
      if (!Number.isSafeInteger(scheduledAt) || !Number.isSafeInteger(expiresAt) || scheduledAt >= expiresAt) {
        throw queueError('NATIVE_INVALID_DELIVERY_WINDOW',400);
      }
      const isGate = isNativeGateEvent(scope.eventKey);
      const gateSourceKey = raw?.gateSourceKey;
      if (isGate ? !validNativeGateSource(gateSourceKey) : gateSourceKey !== undefined) {
        throw queueError('NATIVE_INVALID_GATE_SOURCE',400);
      }
      try {
        return await withNativeDeliveryState(db,scope,async ({binding,job,allowCreate,readSourceState,save}) => {
          checkJob(job);
          if (job) {
            if (job.scheduledAt !== scheduledAt || job.expiresAt !== expiresAt
              || job.gateSource?.gateSourceKey !== gateSourceKey) throw queueError('NATIVE_DELIVERY_EVENT_REUSED',409);
            return {id:job.id,state:job.state,received:null};
          }
          if (binding?.active !== true) return {state:'blocked',received:null};
          if (!allowCreate) return {state:'expired',received:null};
          let gateSource;
          if (isGate) {
            const proof = await gateDecision(readSourceState, scope, { gateSourceKey, expiresAt });
            // Roll back the new outbox placeholder if this source cannot admit a job.
            if (proof.status !== 'confirmed' || expiresAt <= now()) throw gateNotConfirmed;
            gateSource = { gateSourceKey, observedAt: proof.observedAt, revision: proof.revision };
          }
          const id = randomUUID();
          const revisions = Object.fromEntries(BINDING_FIELDS.map(field => [field,binding[field]]));
          await save({schema:1,id,state:'queued',scheduledAt,expiresAt,claimId:null,...revisions,gateSource});
          return {id,state:'queued',received:null};
        },()=>expiresAt > now());
      } catch (error) {
        if (error !== gateNotConfirmed) throw error;
        return { state: 'blocked', received: null };
      }
    },

    authorityFor(raw) {
      if (enabled !== true) return async () => undefined;
      const scope = scoped(raw);
      return async (id, attempt) => {
        if (!validNativeDeliveryId(id) || typeof attempt !== 'function' || typeof protection?.open !== 'function') return;
        // Commit a one-shot claim first. An unknown commit or a restarted worker
        // must never turn a dispatching job back into queued work.
        const claimId = await withNativeDeliveryState(db,scope,async ({binding,job,readSourceState,save}) => {
          checkJob(job);
          if (job?.id !== id || job.state !== 'queued') return null;
          const time = now();
          if (job.expiresAt <= time) { await save({...job,state:'expired'}); return null; }
          if (job.scheduledAt > time) return null;
          if (!bindingMatches(binding,job)) { await save({...job,state:'cancelled'}); return null; }
          if (job.gateSource || isNativeGateEvent(scope.eventKey)) {
            const status = await dispatchGateStatus(readSourceState, scope, job);
            if (job.expiresAt <= now()) { await save({...job,state:'expired'}); return null; }
            if (status === 'cancelled') await save({...job,state:'cancelled'});
            if (status !== 'confirmed') return null;
          }
          const claimId = randomUUID();
          await save({...job,state:'dispatching',claimId});
          return claimId;
        });
        if (!claimId) return;

        // Reacquire authority after the durable claim. The bounded sender runs
        // under the locks so a competing revoke/rotation cannot overtake it.
        await withNativeDeliveryState(db,scope,async ({binding,job,readSourceState,save,openToken}) => {
          checkJob(job);
          if (job?.id !== id || job.state !== 'dispatching' || job.claimId !== claimId) return;
          const time = now();
          if (job.expiresAt <= time) { await save({...job,state:'expired'}); return; }
          if (!bindingMatches(binding,job) || job.scheduledAt > time) { await save({...job,state:'cancelled'}); return; }
          if (job.gateSource || isNativeGateEvent(scope.eventKey)) {
            const status = await dispatchGateStatus(readSourceState, scope, job);
            if (job.expiresAt <= now()) { await save({...job,state:'expired'}); return; }
            if (status === 'cancelled') await save({...job,state:'cancelled'});
            // A returned unavailability is before token access and any provider
            // attempt. A thrown SQL error rolls back instead, retaining the claim.
            if (status === 'unavailable') await save({...job,state:'queued',claimId:null});
            if (status !== 'confirmed') return;
          }
          let token;
          try { token = openToken(protection); }
          catch { await save({...job,state:'cancelled'}); return; }
          let outcome;
          try {
            outcome = await attempt({id,project:NATIVE_PROJECT,package:NATIVE_PACKAGE,token,
              scheduledAt:job.scheduledAt,expiresAt:job.expiresAt});
          } catch { /* The state remains ineligible when the provider outcome is unknown. */ }
          const confirmedOutcome = outcome?.received === null && TERMINAL_RESULTS.has(outcome.state)
            && outcome.providerAccepted === (outcome.state === 'accepted_unconfirmed');
          const state = confirmedOutcome ? outcome.state : 'uncertain';
          await save({...job,state});
        });
      };
    },
  };
}
