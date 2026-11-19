import { randomUUID } from 'node:crypto';
import { NATIVE_PACKAGE, NATIVE_PROJECT, validNativeDeliveryId, withNativeDeliveryState } from './registry.mjs';

export const NATIVE_DELIVERY_QUEUE_ENABLED = false;
const BINDING_FIELDS = ['revision', 'consentRevision', 'generation', 'tokenRevision'];
const TERMINAL_RESULTS = new Set(['accepted_unconfirmed', 'rejected', 'expired']);
const JOB_STATES = new Set(['queued', 'dispatching', 'cancelled', 'uncertain', ...TERMINAL_RESULTS]);
const queueError = (code, status) => Object.assign(new Error(code), {code, status});

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
    || (job.claimId !== null && !validNativeDeliveryId(job.claimId))
    || (job.state === 'queued' && job.claimId !== null)
    || (job.state === 'dispatching' && job.claimId === null)) throw queueError('NATIVE_INVALID_DELIVERY_STATE',503);
}

function bindingMatches(binding, job) {
  return binding?.active === true && BINDING_FIELDS.every(field => binding[field] === job[field]);
}

/** Unmounted worker. The caller supplies a trusted owner/installation and a
 * stable source-event key. The stored job contains only an opaque UUID, timing,
 * binding revisions and dispatch state. Profile deletion erases its namespace.
 */
export function createNativeDeliveryQueue({enabled = NATIVE_DELIVERY_QUEUE_ENABLED, db, protection, clock = Date.now} = {}) {
  const now = () => {
    const value = clock();
    if (!Number.isSafeInteger(value)) throw queueError('NATIVE_CLOCK_REQUIRED',503);
    return value;
  };
  return {
    async enqueue(raw, timing) {
      if (enabled !== true) return {state:'disabled',received:null};
      const scope = scoped(raw), scheduledAt = timing?.scheduledAt, expiresAt = timing?.expiresAt;
      if (!Number.isSafeInteger(scheduledAt) || !Number.isSafeInteger(expiresAt) || scheduledAt >= expiresAt) {
        throw queueError('NATIVE_INVALID_DELIVERY_WINDOW',400);
      }
      return withNativeDeliveryState(db,scope,async ({binding,job,allowCreate,save}) => {
        checkJob(job);
        if (job) {
          if (job.scheduledAt !== scheduledAt || job.expiresAt !== expiresAt) throw queueError('NATIVE_DELIVERY_EVENT_REUSED',409);
          return {id:job.id,state:job.state,received:null};
        }
        if (binding?.active !== true) return {state:'blocked',received:null};
        if (!allowCreate) return {state:'expired',received:null};
        const id = randomUUID();
        const revisions = Object.fromEntries(BINDING_FIELDS.map(field => [field,binding[field]]));
        await save({schema:1,id,state:'queued',scheduledAt,expiresAt,claimId:null,...revisions});
        return {id,state:'queued',received:null};
      },()=>expiresAt > now());
    },

    authorityFor(raw) {
      if (enabled !== true) return async () => undefined;
      const scope = scoped(raw);
      return async (id, attempt) => {
        if (!validNativeDeliveryId(id) || typeof attempt !== 'function' || typeof protection?.open !== 'function') return;
        // Commit a one-shot claim first. An unknown commit or a restarted worker
        // must never turn a dispatching job back into queued work.
        const claimId = await withNativeDeliveryState(db,scope,async ({binding,job,save}) => {
          checkJob(job);
          if (job?.id !== id || job.state !== 'queued') return null;
          const time = now();
          if (job.expiresAt <= time) { await save({...job,state:'expired'}); return null; }
          if (job.scheduledAt > time) return null;
          if (!bindingMatches(binding,job)) { await save({...job,state:'cancelled'}); return null; }
          const claimId = randomUUID();
          await save({...job,state:'dispatching',claimId});
          return claimId;
        });
        if (!claimId) return;

        // Reacquire authority after the durable claim. The bounded sender runs
        // under the locks so a competing revoke/rotation cannot overtake it.
        await withNativeDeliveryState(db,scope,async ({binding,job,save,openToken}) => {
          checkJob(job);
          if (job?.id !== id || job.state !== 'dispatching' || job.claimId !== claimId) return;
          const time = now();
          if (job.expiresAt <= time) { await save({...job,state:'expired'}); return; }
          if (!bindingMatches(binding,job) || job.scheduledAt > time) { await save({...job,state:'cancelled'}); return; }
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
