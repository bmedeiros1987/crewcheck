import { randomUUID } from 'node:crypto';

const HOUR = 3_600_000;
const MAX_AGE = 24 * HOUR;
const MAX_ATTEMPTS = 3;
const SEND_TIMEOUT = 5_000;
const LEASE = 30_000;
const opaque = value => typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
function identity(value) {
  if (!value || !opaque(value.principalId) || !opaque(value.sessionId)) throw new Error('Invalid trusted push identity');
}
function registration(value) {
  if (!value || !opaque(value.installationId) || !opaque(value.targetRef) || !['webpush', 'fcm'].includes(value.transport) || value.consent !== true) throw new Error('Invalid push registration');
}

// Provider adapters return normalized HTTP status + optional Retry-After only.
// No provider error body, message body, account ID or endpoint is included in payload/logs.
export function retryTime(attempt, retryAfter, now, random = Math.random) {
  const backoff = Math.min(HOUR, 30_000 * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(backoff * 0.2 * Math.min(1, Math.max(0, random())));
  let provider = 0;
  if (typeof retryAfter === 'string') {
    provider = /^\d+$/.test(retryAfter) ? now + Number(retryAfter) * 1000 : Date.parse(retryAfter);
  }
  return Math.max(now + backoff + jitter, Number.isNaN(provider) ? 0 : provider);
}

export function notificationEnvelope(delivery) {
  // bindingTag is opaque and lets a future client discard an old login's push.
  // Generic locked-screen text and origin-relative fixed destination only.
  return Object.freeze({ v: 1, type: 'chat-update', eventId: delivery.eventId, bindingTag: delivery.bindingTag,
    title: 'CrewCheck', body: 'Há uma atualização. Abra o CrewCheck para consultar.', url: '/' });
}

/**
 * Isolated integration core; not imported by server startup. All adapters required.
 * repository must implement the atomic/fenced contract in docs/remote-push-contract.json.
 * Identity comes from server authentication, never directly from request JSON.
 */
export function createPushOutbox({ repository, authorize, send, enabled = false, now = Date.now, random = Math.random, sendTimeoutMs = SEND_TIMEOUT }) {
  if (!Number.isFinite(sendTimeoutMs) || sendTimeoutMs <= 0 || sendTimeoutMs > SEND_TIMEOUT) throw new Error('Invalid send timeout');
  return {
    async subscribe(actor, input) {
      if (enabled !== true) return { status: 'disabled' };
      identity(actor); registration(input);
      if (await authorize({ action: 'subscribe', principalId: actor.principalId, sessionId: actor.sessionId }) !== true) return { status: 'denied' };
      return repository.bind({ principalId: actor.principalId, sessionId: actor.sessionId,
        installationId: input.installationId, targetRef: input.targetRef, transport: input.transport,
        consent: true, consentAt: now() });
    },
    async revoke(actor, installationId) {
      identity(actor);
      if (installationId !== undefined && !opaque(installationId)) throw new Error('Invalid installation');
      // Must remain possible while sending is disabled, including server-side logout.
      return repository.revoke({ principalId: actor.principalId, sessionId: actor.sessionId, installationId });
    },
    async enqueueInTransaction(transaction, event) {
      if (enabled !== true) return { status: 'disabled' };
      if (!event || !opaque(event.messageId) || !opaque(event.threadId) || !Array.isArray(event.recipientIds) || event.recipientIds.length > 100 || event.recipientIds.some(id => !opaque(id))) throw new Error('Invalid internal push event');
      // This transaction must be the SAME one that commits the authorized chat write.
      // Repository snapshots only already-consenting installations and their revision.
      const createdAt = event.occurredAt;
      if (!Number.isFinite(createdAt) || createdAt > now() || createdAt + MAX_AGE <= now()) throw new Error('Invalid message occurrence time');
      return repository.enqueue(transaction, { messageId: event.messageId, threadId: event.threadId,
        recipientIds: [...new Set(event.recipientIds)], createdAt, expiresAt: createdAt + MAX_AGE });
    },
    async runOne() {
      if (enabled !== true) return { status: 'disabled' };
      const token = randomUUID();
      const delivery = await repository.claim({ now: now(), leaseUntil: now() + LEASE, token, maxAttempts: MAX_ATTEMPTS });
      if (!delivery) return { status: 'idle' };
      const finish = (state, extra = {}) => repository.settle(delivery.id, token, { state, ...extra });
      let timer;
      try {
        const binding = await repository.loadBinding(delivery.installationId);
        const valid = Number.isFinite(delivery.createdAt) && Number.isFinite(delivery.expiresAt) &&
          delivery.expiresAt > delivery.createdAt && delivery.expiresAt <= delivery.createdAt + MAX_AGE &&
          Number.isInteger(delivery.attempts) && delivery.attempts >= 1 && delivery.attempts <= MAX_ATTEMPTS &&
          opaque(delivery.messageId) && opaque(delivery.threadId) && opaque(delivery.principalId) && opaque(delivery.sessionId) &&
          binding && opaque(binding.targetRef) && ['webpush', 'fcm'].includes(binding.transport) && binding.active === true && binding.consent === true &&
          binding.principalId === delivery.principalId && binding.sessionId === delivery.sessionId &&
          binding.revision === delivery.revision && binding.bindingTag === delivery.bindingTag &&
          binding.consentAt <= delivery.createdAt && opaque(delivery.eventId) && opaque(delivery.bindingTag);
        if (!valid || now() >= delivery.expiresAt) return finish('cancelled');
        const authorized = await authorize({ action: 'deliver', principalId: binding.principalId,
          sessionId: binding.sessionId, threadId: delivery.threadId, messageId: delivery.messageId });
        if (authorized !== true) return finish('cancelled');
        // Atomic last check of lease, account/session, revision, consent and expiration.
        // A revocation after this check may race transport; already submitted push cannot be recalled.
        if (!await repository.canDispatch(delivery.id, token, now())) return finish('cancelled');
        const controller = new AbortController();
        const timeout = new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve({ status: 0 }); }, sendTimeoutMs); });
        const outcome = await Promise.race([Promise.resolve().then(() => send({ transport: binding.transport,
          targetRef: binding.targetRef, payload: notificationEnvelope(delivery), ttlSeconds: Math.max(1, Math.min(86400, Math.floor((delivery.expiresAt - now()) / 1000))), signal: controller.signal })), timeout]);
        if (!Number.isInteger(outcome?.status)) return finish('failed');
        if (outcome.status >= 200 && outcome.status < 300) return finish('sent');
        if (outcome?.expired === true && [404, 410].includes(outcome.status)) {
          await repository.disableBinding(binding.installationId, binding.revision);
          return finish('expired');
        }
        if (outcome?.status === 0 || outcome?.status === 429 || (outcome?.status >= 500 && outcome.status < 600)) {
          const nextAt = retryTime(delivery.attempts, outcome.retryAfter, now(), random);
          return finish(delivery.attempts >= MAX_ATTEMPTS || nextAt >= delivery.expiresAt ? 'exhausted' : 'retry', { nextAt });
        }
        return finish('failed');
      } catch {
        const nextAt = retryTime(delivery.attempts, undefined, now(), random);
        return finish(delivery.attempts >= MAX_ATTEMPTS || nextAt >= delivery.expiresAt ? 'exhausted' : 'retry', { nextAt });
      } finally { clearTimeout(timer); }
    },
  };
}
