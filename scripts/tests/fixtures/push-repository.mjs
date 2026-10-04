// SYNTHETIC TEST ONLY. Not a durable repository and never imported by production.
import { randomUUID } from 'node:crypto';
export function fixtureRepository(clock) {
  const bindings = new Map(), rows = new Map();
  const clone = value => value ? structuredClone(value) : value;
  const repo = {
    bindings, rows,
    async transaction(action) {
      const pending = [];
      const tx = { pending };
      const result = await action(tx);
      for (const row of pending) if (!rows.has(row.id)) rows.set(row.id, row);
      return result;
    },
    async bind(input) {
      const old = bindings.get(input.installationId);
      if (old?.active && (old.principalId !== input.principalId || old.sessionId !== input.sessionId)) return { status: 'conflict' };
      if ([...bindings.values()].some(b => b.active && b.installationId !== input.installationId && b.targetRef === input.targetRef)) return { status: 'conflict' };
      const same = old?.active && old.targetRef === input.targetRef && old.transport === input.transport && old.consent;
      if (same) return { status: 'bound', bindingTag: old.bindingTag };
      const binding = { ...input, active: true, revision: (old?.revision || 0) + 1, bindingTag: randomUUID() };
      bindings.set(input.installationId, binding);
      return { status: 'bound', bindingTag: binding.bindingTag };
    },
    async revoke({ principalId, sessionId, installationId }) {
      let count = 0;
      for (const b of bindings.values()) if (b.principalId === principalId && b.sessionId === sessionId && (!installationId || b.installationId === installationId)) { b.active = false; b.consent = false; b.revision++; count++; }
      return { status: 'revoked', count };
    },
    async enqueue(tx, event) {
      if (!Array.isArray(tx?.pending)) throw new Error('Transaction required');
      for (const b of bindings.values()) if (b.active && b.consent && b.consentAt <= event.createdAt && event.recipientIds.includes(b.principalId)) {
        const id = JSON.stringify([event.messageId, b.principalId, b.installationId, b.revision]);
        if (rows.has(id) || tx.pending.some(r => r.id === id)) continue;
        tx.pending.push({ id, eventId: randomUUID(), messageId: event.messageId, threadId: event.threadId,
          principalId: b.principalId, sessionId: b.sessionId, installationId: b.installationId, revision: b.revision,
          bindingTag: b.bindingTag, createdAt: event.createdAt, expiresAt: event.expiresAt, attempts: 0,
          nextAt: event.createdAt, state: 'pending', token: null, leaseUntil: 0 });
      }
      return { status: 'queued' };
    },
    async claim({ now, leaseUntil, token, maxAttempts }) {
      for (const r of rows.values()) {
        if (['sent','failed','expired','cancelled','exhausted'].includes(r.state)) continue;
        if (r.expiresAt <= now || r.attempts >= maxAttempts && r.leaseUntil <= now) { r.state = 'exhausted'; continue; }
        if (r.nextAt > now || r.leaseUntil > now) continue;
        r.state = 'sending'; r.attempts++; r.token = token; r.leaseUntil = leaseUntil; return clone(r);
      }
      return null;
    },
    async loadBinding(id) { return clone(bindings.get(id)); },
    async canDispatch(id, token, now) {
      const r = rows.get(id), b = bindings.get(r?.installationId);
      return Boolean(r && r.token === token && r.leaseUntil > now && r.expiresAt > now && b?.active && b.consent && b.revision === r.revision && b.principalId === r.principalId && b.sessionId === r.sessionId);
    },
    async settle(id, token, result) {
      const r = rows.get(id);
      if (!r || r.token !== token || r.leaseUntil <= clock()) return { status: 'stale' };
      Object.assign(r, result, { token: null, leaseUntil: 0 }); return { status: result.state };
    },
    async disableBinding(id, revision) { const b = bindings.get(id); if (b?.revision === revision) { b.active = false; b.consent = false; b.revision++; } },
  };
  return repo;
}
