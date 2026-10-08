import assert from 'node:assert/strict';
import { handleBidsCore } from '../server/v139/bidsCore.mjs';
const owner = 'fixture@example.invalid';
const base = { title: 'Synthetic', targetMonth: '2026-10', opensAt: '2026-10-11T12:00:00Z', closesAt: '2026-10-15T12:00:00Z' };
async function request(body, { id = '', existing = null, method = 'POST' } = {}) {
  const calls = [];
  let inserted;
  const db = { query: async (sql, args) => {
    calls.push({ sql, args });
    if (sql.startsWith('SELECT id')) return [existing ? [{ id: existing }] : []];
    if (sql.startsWith('DELETE')) return [{ affectedRows: 1 }];
    if (sql.startsWith('INSERT')) inserted = { title: args[2], target_month: args[3], open_epoch: args[4], close_epoch: args[5], notify_open: args[7], notify_last_day: args[8] };
    if (sql.startsWith('SELECT title')) return [[inserted]];
    return [[]];
  } };
  const res = { writeHead(status) { this.status = status; }, end(text) { this.body = JSON.parse(text); } };
  await handleBidsCore({ method }, res, new URL(`https://fixture.invalid/api/platform/bids${id ? '/' + id : ''}`), {
    identify: async () => ({ email: owner, db }), read: async () => body,
  });
  return { calls, res };
}
for (const value of [undefined, false, 'true', 1]) {
  const { calls } = await request({ ...base, notifyOpen: value, notifyLastDay: value });
  const insert = calls.find(c => c.sql.startsWith('INSERT'));
  assert.deepEqual(insert.args.slice(-2), [0, 0]);
}
assert.deepEqual((await request({ ...base, notifyOpen: true, notifyLastDay: true })).calls.find(c => c.sql.startsWith('INSERT')).args.slice(-2), [1, 1]);
const [first, retry] = await Promise.all([request(base), request(base)]);
assert.equal(first.calls.find(c => c.sql.startsWith('INSERT')).args[0], retry.calls.find(c => c.sql.startsWith('INSERT')).args[0]);
assert.match(first.calls.find(c => c.sql.startsWith('INSERT')).sql, /ON DUPLICATE KEY UPDATE/);
const edit = await request({ ...base, title: 'Renamed', targetMonth: '2026-11' }, { id: 'stable-id', existing: 'stable-id' });
assert.equal(edit.res.status, 200);
assert.ok(!edit.calls.some(c => c.sql.startsWith('INSERT')));
assert.deepEqual(edit.calls.find(c => c.sql.startsWith('SELECT id')).args, ['stable-id', owner]);
const update = edit.calls.find(c => c.sql.startsWith('UPDATE'));
assert.deepEqual(update.args.slice(6, 8), ['Renamed', '2026-11']);
assert.deepEqual(update.args.slice(-2), ['stable-id', owner]);
const foreign = await request(base, { id: 'another-owner-id' });
assert.equal(foreign.res.status, 404);
assert.equal(foreign.calls.length, 1);
const deleted = await request({}, { id: 'stable-id', method: 'DELETE' });
assert.deepEqual(deleted.calls[0].args, ['stable-id', owner]);
console.log('BIDS editing: explicit opt-in, stable identity, owner isolation and concurrent create key passed.');
