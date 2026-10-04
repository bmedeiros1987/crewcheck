import assert from 'node:assert/strict';
import test from 'node:test';
import { createPushOutbox, retryTime } from '../../server/push/outbox-core.mjs';
import { fixtureRepository } from './fixtures/push-repository.mjs';
const A = { principalId: 'principal_A_synthetic', sessionId: 'session_A_synthetic' };
const B = { principalId: 'principal_B_synthetic', sessionId: 'session_B_synthetic' };
const device = { installationId: 'installation_synthetic_A', targetRef: 'opaque_target_synthetic_A', transport: 'webpush', consent: true };
function setup(options = {}) {
  let time = 1_800_000_000_000;
  const now = () => time, repository = fixtureRepository(now), sent = [], decisions = [];
  const params = { enabled: true, repository, now, random: () => 0,
    authorize: async input => { decisions.push(input); return true; },
    send: async input => { sent.push(input); return { status: 201 }; }, ...options };
  const api = createPushOutbox(params);
  return { api, repository, sent, decisions, params, now, advance: ms => { time += ms; },
    register: (actor = A, input = device) => api.subscribe(actor, input),
    enqueue: (extra = {}) => repository.transaction(tx => api.enqueueInTransaction(tx, { messageId: 'message_synthetic_A', threadId: 'thread_synthetic_A', recipientIds: [A.principalId], occurredAt: now(), ...extra })),
    row: () => [...repository.rows.values()][0] };
}
async function queued(options) { const f = setup(options); await f.register(); await f.enqueue(); return f; }

test('default off: subscribe, enqueue and worker never access adapters', async () => {
  const trap = new Proxy({}, { get() { throw new Error('adapter called'); } });
  const api = createPushOutbox({ repository: trap, authorize: trap, send: trap });
  for (const result of [await api.subscribe(), await api.enqueueInTransaction(), await api.runOne()]) assert.equal(result.status, 'disabled');
});
test('only literal true enables; no truthy env string activation', async () => { const f = setup({ enabled: 'true' }); assert.equal((await f.register()).status, 'disabled'); assert.equal((await f.api.runOne()).status, 'disabled'); });
test('consent and opaque target validation reject registration', async () => {
  const f = setup(); for (const input of [{ ...device, consent: false }, { ...device, targetRef: 'https://127.0.0.1/' }, { ...device, transport: 'sms' }]) await assert.rejects(f.register(A, input));
  assert.equal(f.repository.bindings.size, 0);
});
test('denied session cannot register; actor extras cannot override operation', async () => {
  let captured;
  const f = setup({ authorize: async q => { captured = q; return false; } });
  assert.equal((await f.register({ ...A, action: 'deliver', extra: 'private' })).status, 'denied');
  assert.deepEqual(captured, { action: 'subscribe', ...A }); assert.equal(f.repository.bindings.size, 0);
});
test('cross-account installation or target takeover is rejected', async () => {
  const f = setup(); await f.register();
  assert.equal((await f.register(B)).status, 'conflict');
  assert.equal((await f.register(B, { ...device, installationId: 'installation_synthetic_B' })).status, 'conflict');
});
test('duplicate registration preserves binding and does not invalidate queued event', async () => {
  const f = await queued(); const first = f.row().bindingTag; await f.register(); await f.api.runOne(); assert.equal(f.sent.length, 1); assert.equal(f.sent[0].payload.bindingTag, first);
});
test('30 concurrent retries and duplicated recipients produce one delivery', async () => {
  const f = setup(); await f.register(); await Promise.all(Array.from({ length: 30 }, () => f.enqueue({ recipientIds: [A.principalId, A.principalId] })));
  assert.equal(f.repository.rows.size, 1); await Promise.all(Array.from({ length: 12 }, () => f.api.runOne())); assert.equal(f.sent.length, 1); assert.equal(f.row().attempts, 1);
});
test('transaction rollback discards pending outbox event', async () => {
  const f = setup(); await f.register();
  await assert.rejects(f.repository.transaction(async tx => { await f.api.enqueueInTransaction(tx, { messageId: 'message_synthetic_A', threadId: 'thread_synthetic_A', recipientIds: [A.principalId], occurredAt: f.now() }); throw new Error('synthetic message rollback'); }));
  assert.equal(f.repository.rows.size, 0);
});
test('missing transaction and stale/future message occurrence rejected', async () => {
  const f = setup(); await f.register();
  const event = { messageId: 'message_synthetic_A', threadId: 'thread_synthetic_A', recipientIds: [A.principalId], occurredAt: f.now() };
  await assert.rejects(f.api.enqueueInTransaction(null, event));
  for (const occurredAt of [NaN, Infinity, f.now()+1, f.now()-86_400_000]) await assert.rejects(f.enqueue({ occurredAt }));
});
test('new consent does not backfill an older message retry', async () => {
  const f = setup(); const occurredAt = f.now(); f.advance(1000); await f.register(); await f.enqueue({ occurredAt }); assert.equal(f.repository.rows.size, 0);
});
test('two recipients/devices remain separately bound; envelope contains no private fields', async () => {
  const f = setup(); await f.register(); await f.register(B, { ...device, installationId: 'installation_synthetic_B', targetRef: 'opaque_target_synthetic_B', transport: 'fcm' });
  await f.enqueue({ recipientIds: [A.principalId, B.principalId], body: 'PRIVATE_CHAT', email: 'private@example.invalid', salary: 999 });
  await f.api.runOne(); await f.api.runOne(); assert.equal(f.sent.length, 2);
  assert.notEqual(f.sent[0].targetRef, f.sent[1].targetRef); assert.notEqual(f.sent[0].payload.bindingTag, f.sent[1].payload.bindingTag);
  for (const s of f.sent) { assert.deepEqual(Object.keys(s.payload).sort(), ['bindingTag','body','eventId','title','type','url','v']); assert.equal(s.payload.url, '/'); assert.ok(s.ttlSeconds <= 86400); assert.doesNotMatch(JSON.stringify(s.payload), /PRIVATE_CHAT|private@|principal_|session_|salary|thread_|message_|opaque_target/); }
});
test('logout revokes only that session and works with sender disabled', async () => {
  const f = await queued(); const off = createPushOutbox({ ...f.params, enabled: false });
  assert.equal((await off.revoke(B)).count, 0); assert.equal((await off.revoke(A)).count, 1);
  assert.equal((await f.api.runOne()).status, 'cancelled'); assert.equal(f.sent.length, 0);
});
test('same device after logout/account switch cannot receive old account event', async () => {
  const f = await queued(); await f.api.revoke(A); await f.register(B); await f.api.runOne(); assert.equal(f.sent.length, 0);
});
test('rotated target/consent revision cancels old queued event', async () => {
  const f = await queued(); await f.register(A, { ...device, targetRef: 'opaque_target_rotated_A' }); await f.api.runOne(); assert.equal(f.sent.length, 0); assert.equal(f.row().state, 'cancelled');
});
test('revoked visitor/chat relation fails current authorization before dispatch', async () => {
  const f = await queued({ authorize: async q => q.action === 'subscribe' }); assert.equal((await f.api.runOne()).status, 'cancelled'); assert.equal(f.sent.length, 0);
});
test('revocation during async authorization caught by atomic last check', async () => {
  const f = await queued(); const api = createPushOutbox({ ...f.params, authorize: async () => { await f.api.revoke(A); return true; } });
  await api.runOne(); assert.equal(f.sent.length, 0); assert.equal(f.row().state, 'cancelled');
});
test('worker restart recovers expired lease; stale worker cannot settle it', async () => {
  const f = await queued(); const claimed = await f.repository.claim({ now: f.now(), leaseUntil: f.now()+30000, token: 'old', maxAttempts: 3 });
  assert.equal((await f.api.runOne()).status, 'idle'); f.advance(30001);
  const restarted = createPushOutbox(f.params); assert.equal((await restarted.runOne()).status, 'sent');
  assert.equal((await f.repository.settle(claimed.id, 'old', { state: 'failed' })).status, 'stale'); assert.equal(f.row().state, 'sent'); assert.equal(f.row().attempts, 2);
});
test('TTL expiry prevents delivery', async () => { const f = await queued(); f.advance(86_400_000); await f.api.runOne(); assert.equal(f.sent.length, 0); });
test('429 honors Retry-After, stable event identity survives retry', async () => {
  const seen = []; const f = await queued({ send: async q => { seen.push(q.payload.eventId); return seen.length === 1 ? { status: 429, retryAfter: '120' } : { status: 200 }; } });
  assert.equal((await f.api.runOne()).status, 'retry'); assert.equal(f.row().nextAt, f.now()+120000); assert.equal((await f.api.runOne()).status, 'idle'); f.advance(120000); await f.api.runOne(); assert.equal(seen.length, 2); assert.equal(seen[0], seen[1]);
});
test('retry policy handles HTTP dates, jitter and oversized provider delay', () => {
  const now = 1_800_000_000_000;
  assert.equal(retryTime(1, new Date(now+180000).toUTCString(), now, () => 0), now+180000);
  assert.equal(retryTime(1, 'invalid', now, () => 1), now+36000);
  assert.equal(retryTime(1, '9'.repeat(400), now), Infinity);
});
test('429 beyond TTL exhausts without scheduling an earlier retry', async () => { const f = await queued({ send: async () => ({ status: 429, retryAfter: '999999999' }) }); assert.equal((await f.api.runOne()).status, 'exhausted'); });
test('provider errors and thrown errors bounded to three attempts, redacted', async () => {
  for (const send of [async () => ({ status: 503 }), async () => { throw new Error('SECRET_ENDPOINT_PRIVATE_TOKEN'); }]) {
    const f = await queued({ send }); for (let i=0;i<3;i++) { const result = await f.api.runOne(); assert.doesNotMatch(JSON.stringify(result), /SECRET/); f.advance(3600000); }
    assert.equal(f.row().attempts, 3); assert.equal(f.row().state, 'exhausted'); assert.equal((await f.api.runOne()).status, 'idle');
  }
});
test('authorization service failure fails closed and consumes bounded retry', async () => {
  const f = await queued(); const api = createPushOutbox({ ...f.params, authorize: async () => { throw new Error('synthetic outage'); } }); assert.equal((await api.runOne()).status, 'retry'); assert.equal(f.sent.length, 0);
});
test('provider timeout aborts; ambiguous acceptance may retry same event', async () => {
  let signal; const f = await queued({ sendTimeoutMs: 5, send: q => { signal = q.signal; return new Promise(() => {}); } });
  assert.equal((await f.api.runOne()).status, 'retry'); assert.equal(signal.aborted, true); assert.equal(f.row().attempts, 1);
});
test('expired subscription disabled; malformed/permanent errors do not retry', async () => {
  for (const outcome of [{ status: 410, expired: true }, { status: 401 }, { status: '200' }, undefined]) {
    const f = await queued({ send: async () => outcome }); await f.api.runOne();
    assert.equal(f.row().state, outcome?.expired ? 'expired' : 'failed');
    assert.equal(f.repository.bindings.get(device.installationId).active, !outcome?.expired);
  }
});
test('expired response for previous revision cannot disable rotated target', async () => {
  const f = await queued(); const api = createPushOutbox({ ...f.params, send: async () => { await f.register(A, { ...device, targetRef: 'opaque_target_rotated_A' }); return { status: 410, expired: true }; } });
  await api.runOne(); assert.equal(f.repository.bindings.get(device.installationId).active, true);
});
test('invalid stored delivery fields fail closed before transport', async () => {
  for (const changes of [{ expiresAt: NaN }, { bindingTag: 'invalid' }, { principalId: B.principalId }, { sessionId: B.sessionId }, { attempts: -4 }]) {
    const f = await queued(); Object.assign(f.row(), changes); await f.api.runOne(); assert.equal(f.sent.length, 0);
  }
});
test('send timeout cannot exceed hard limit', () => { for (const sendTimeoutMs of [0, -1, Infinity, 5001]) assert.throws(() => createPushOutbox({ sendTimeoutMs })); });
test('invalid identity, recipient scope and revoke input rejected', async () => {
  const f = setup();
  await assert.rejects(f.register({ principalId: 'email@example.invalid', sessionId: A.sessionId }));
  await assert.rejects(f.api.revoke(A, 'bad'));
  await assert.rejects(f.enqueue({ recipientIds: Array(101).fill(A.principalId) }));
  await assert.rejects(f.enqueue({ recipientIds: ['unsafe'] }));
  await assert.rejects(f.enqueue({ messageId: '' }));
});
test('delivery cannot read arbitrary raw target URL from stored binding', async () => {
  const f = await queued(); f.repository.bindings.get(device.installationId).targetRef = 'http://127.0.0.1/internal';
  await f.api.runOne(); assert.equal(f.sent.length, 0);
});
test('another independent device of the same account receives its own delivery', async () => {
  const f = setup(); await f.register(); await f.register(A, { ...device, installationId: 'installation_synthetic_C', targetRef: 'opaque_target_synthetic_C' });
  await f.enqueue(); await f.api.revoke(A, device.installationId); await f.api.runOne(); await f.api.runOne();
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].targetRef, 'opaque_target_synthetic_C');
});
