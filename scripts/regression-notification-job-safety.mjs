import assert from 'node:assert/strict';
import { dispatchClaimedJob, safeScheduleJob, safeCancelJob } from '../server/notification-job-safety.mjs';
globalThis.fetch = () => { throw new Error('Network forbidden'); };
const now = Date.now();
const makeJob = () => ({ id: 1, email: 'fixture@example.invalid', job_key: 'fixture', status: 'processing', attempts: 1, scheduled_at: new Date(now - 1000), created_at: new Date(now - 20_000), locked_at: new Date(now), channel: 'telegram', chat_id: 'fictional-chat', telegram_username: '', phone: '', message: 'Fixture' });
async function dispatch(options = {}) {
  const job = { ...makeJob(), ...options.job };
  let state = options.state || 'processing';
  let sends = 0;
  const db = { query: async (sql, args) => {
    if (sql.startsWith('SELECT *')) return [state === 'processing' ? [{ ...job, status: state }] : []];
    if (sql.startsWith('SELECT created_at')) return [[{ created_at: new Date(now - (options.recreated ? 100 : 30_000)) }]];
    if (sql.includes("SET status='dispatching'")) {
      if (options.cancelAtClaim) state = 'cancelled';
      if (state !== 'processing') return [{ affectedRows: 0 }];
      state = 'dispatching'; return [{ affectedRows: 1 }];
    }
    if (sql.includes('SET status=?')) state = args[0];
    if (sql.includes("SET status='cancelled'")) state = 'cancelled';
    return [{ affectedRows: 1 }];
  } };
  const invoke = () => dispatchClaimedJob(db, job, { now, findLink: async () => ({ chatId: options.changedLink ? 'another-chat' : job.chat_id }), deliver: async () => { sends++; if (options.throw) throw new Error('Unknown result'); return options.result || { ok: true }; } });
  const outcome = await invoke();
  if (options.repeat) await invoke();
  return { outcome, state, sends };
}
assert.equal((await dispatch({ repeat: true })).sends, 1);
assert.equal((await dispatch({ changedLink: true })).sends, 0);
assert.equal((await dispatch({ recreated: true })).state, 'cancelled');
assert.equal((await dispatch({ state: 'cancelled' })).sends, 0);
assert.equal((await dispatch({ cancelAtClaim: true })).sends, 0);
assert.equal((await dispatch({ job: { scheduled_at: new Date(now - 121_000) } })).state, 'expired');
assert.equal((await dispatch({ job: { scheduled_at: new Date(now + 1000) } })).state, 'pending');
assert.equal((await dispatch({ throw: true })).state, 'uncertain');
assert.equal((await dispatch({ result: { ok: false, uncertain: false } })).state, 'pending');
assert.equal((await dispatch({ result: { results: [{ ok: true }, { ok: false }] } })).state, 'partial');
assert.equal((await dispatch()).outcome.delivered, null);

async function request({ existing = null, body = {}, cancel = false, ownerId = 'current' } = {}) {
  let saved = existing;
  let writes = 0;
  const db = { query: async (sql, args) => {
    if (sql.startsWith('SELECT public_id')) return [[{ public_id: ownerId }]];
    if (sql.startsWith('SELECT *')) return [saved ? [saved] : []];
    if (sql.startsWith('SELECT status')) return [saved ? [{ status: saved.status }] : []];
    if (sql.startsWith('INSERT')) { writes++; saved = { email: args[0], job_key: args[1], scheduled_at: new Date(args[2]), channel: args[3], chat_id: args[4], telegram_username: args[5], phone: args[6], message: args[7], status: 'pending' }; }
    if (sql.includes("SET status='cancelled'")) { if (saved?.status === 'dispatching') return [{ affectedRows: 0 }]; saved = { ...saved, status: 'cancelled' }; }
    return [{ affectedRows: 1 }];
  } };
  const res = {};
  const injected = { req: {}, res, identity: () => ({ email: 'fixture@example.invalid', id: 'current' }), readJson: async () => ({ scheduledAt: new Date(now + 60_000).toISOString(), jobKey: 'fixture', message: 'Fixture', ...body }), dbPool: async () => db, ensureNotificationTable: async () => {}, linkedTelegramRecord: async () => ({ chatId: 'fictional-chat' }), sendJson: (_res, status, payload) => Object.assign(res, { status, payload }) };
  await (cancel ? safeCancelJob : safeScheduleJob)(injected);
  return { res, writes, saved };
}
assert.equal((await request({ body: { chatId: 'foreign-chat' } })).res.status, 409);
assert.equal((await request({ ownerId: 'recreated' })).res.status, 401);
const initial = await request();
assert.equal(initial.writes, 1);
assert.equal((await request({ existing: initial.saved })).writes, 0);
for (const status of ['sent', 'cancelled', 'uncertain', 'expired', 'dispatching']) {
  const repeated = await request({ existing: { ...initial.saved, status } });
  assert.equal(repeated.writes, 0);
  assert.equal(repeated.res.payload.status, status);
  assert.equal((await request({ existing: { ...initial.saved, status }, body: { message: 'Changed' } })).res.status, 409);
}
assert.equal((await request({ cancel: true, existing: { ...initial.saved, status: 'dispatching' } })).res.status, 409);
assert.equal((await request({ cancel: true, existing: { ...initial.saved, status: 'pending' } })).res.payload.cancelled, 1);
console.log('Queue safety: fake delivery/DB cancellation races, scope changes, expiry, unknown outcome and repeat requests passed.');
