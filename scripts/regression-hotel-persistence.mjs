import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createHotelStayClient } from '../client/src/lib/hotelStayClient.mjs';

// Exercise the literal production handler; SQL adapter below is synthetic, never a live DB.
const source = readFileSync(new URL('../server/platform.mjs', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('async function handleStays('), source.indexOf('\nasync function handleSameHotel'));
const row = (id = 'stay-A', owner = 'account-A') => ({ id, owner_email: owner, stay_date: '2030-01-01', hotel_name: 'Synthetic hotel', hotel_key: 'SYNTHETIC-HOTEL', airport: 'AAA', room_cipher: 'private-room', presentation_time: '07:00', lead_minutes: 90, share_same_hotel: true, share_with_visitors: true });
function harness(initial = [row()]) {
  let rows = structuredClone(initial), backup, updates = 0, insertions = 0, learns = 0, failUpdate = false;
  const query = async (sql, p = []) => {
    if (sql === 'BEGIN') { backup = structuredClone(rows); return { rows: [] }; }
    if (sql === 'ROLLBACK') { rows = backup; return { rows: [] }; }
    if (sql === 'COMMIT') return { rows: [] };
    if (sql.startsWith('SELECT email')) return { rows: [{ email: p[0] }] };
    if (sql.startsWith('SELECT *')) return { rows: rows.filter(r => sql.includes('WHERE id=') ? r.id === p[0] && r.owner_email === p[1] : r.owner_email === p[0] && r.stay_date === p[1] && r.airport === p[2]) };
    if (sql.startsWith('UPDATE crewcheck_platform_stays')) {
      if (failUpdate) return { rowCount: 0 };
      const r = rows.find(r => r.id === p[0] && r.owner_email === p[1]); if (!r) return { rowCount: 0 };
      Object.assign(r, { hotel_name: p[2], hotel_key: p[3], room_cipher: p[4], presentation_time: p[5], lead_minutes: p[6], share_same_hotel: p[7], share_with_visitors: p[8] }); updates++; return { rowCount: 1 };
    }
    if (sql.startsWith('INSERT INTO crewcheck_platform_stays')) {
      rows.push({ id: p[0], owner_email: p[1], stay_date: p[2], hotel_key: p[3], hotel_name: p[4], airport: p[5], room_cipher: p[6], presentation_time: p[7], lead_minutes: p[8], share_same_hotel: p[9], share_with_visitors: p[10] }); insertions++; return { rowCount: 1 };
    }
    if (sql.startsWith('INSERT INTO crewcheck_platform_hotel_rules')) { learns++; return { rowCount: 1 }; }
    if (sql.startsWith('SELECT s.*')) return { rows: rows.filter(r => r.owner_email === p[0]) };
    throw new Error('Unexpected synthetic query: ' + sql);
  };
  const client = { query, release() {} };
  const context = { identity: { email: 'account-A' }, db: { query, connect: async () => client } };
  const sandbox = { crypto, sha256: v => crypto.createHash('sha256').update(v).digest('hex'),
    readBody: async req => req.body, requireMain: async () => context, requirePremium: async () => true,
    normalizeText: (v, n) => String(v ?? '').trim().slice(0, n), parseDateOnly: v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '',
    hotelKey: v => v.toUpperCase().replaceAll(' ', '-'), encryptPrivate: v => v == null ? null : String(v), decryptPrivate: v => v || '',
    sendJson: (res, status, body) => Object.assign(res, { status, body }) };
  const call = vm.runInNewContext(handler + '\nhandleStays', sandbox);
  return { async request(method = 'GET', body = {}) { const res = {}; await call({ method, body }, res); return res; },
    get rows() { return rows; }, get writes() { return { updates, insertions, learns }; }, fail() { failUpdate = true; } };
}
test('GET owner-scoped and versioned; omitted private fields/grants survive PATCH', async () => {
  const h = harness([row(), row('foreign', 'account-B')]); const get = await h.request();
  assert.equal(get.body.stays.length, 1); const revision = get.body.stays[0].revision;
  const saved = await h.request('PATCH', { contractVersion: 1, expectedRevision: revision, id: 'stay-A', hotelName: 'New synthetic hotel' });
  assert.equal(saved.status, 200); assert.equal(h.rows[0].room_cipher, 'private-room'); assert.equal(h.rows[0].presentation_time, '07:00');
  assert.equal(h.rows[0].share_same_hotel, true); assert.equal(h.rows[0].share_with_visitors, true); assert.equal(h.writes.learns, 0);
});
test('missing/foreign ID cannot mutate, including learning', async () => {
  const h = harness([row('foreign', 'account-B')]); const r = await h.request('PATCH', { id: 'foreign', hotelName: 'Other', learnRule: true, leadMinutes: 100 });
  assert.equal(r.status, 404); assert.deepEqual(h.writes, { updates: 0, insertions: 0, learns: 0 });
});
test('stale revision returns conflict; explicit false changes only requested grant', async () => {
  const h = harness(); const revision = (await h.request()).body.stays[0].revision;
  assert.equal((await h.request('PATCH', { contractVersion: 1, expectedRevision: 'old', id: 'stay-A', hotelName: 'X' })).status, 409);
  await h.request('PATCH', { contractVersion: 1, expectedRevision: revision, id: 'stay-A', shareSameHotel: false });
  assert.equal(h.rows[0].share_same_hotel, false); assert.equal(h.rows[0].share_with_visitors, true);
});
test('first insert and lost-response retry are idempotent; rename does not insert duplicate', async () => {
  const h = harness([]); const patch = { contractVersion: 1, expectedRevision: null, stayDate: '2030-01-01', airport: 'AAA', hotelName: 'Synthetic hotel' };
  const first = await h.request('PATCH', patch); const retry = await h.request('PATCH', patch);
  assert.equal(first.body.savedStayId, retry.body.savedStayId); assert.equal(h.writes.insertions, 1);
  await h.request('PATCH', { ...patch, id: first.body.savedStayId, expectedRevision: first.body.stays[0].revision, hotelName: 'Renamed hotel' });
  assert.equal(h.rows.length, 1); assert.equal(h.rows[0].hotel_name, 'Renamed hotel');
});
test('ambiguous same date/airport rejected, unsupported provider fields rejected', async () => {
  const h = harness([row(), row('second')]);
  assert.equal((await h.request('PATCH', { contractVersion: 1, expectedRevision: null, stayDate: '2030-01-01', airport: 'AAA', hotelName: 'X' })).status, 409);
  assert.equal((await h.request('PATCH', { contractVersion: 1, expectedRevision: null, transportProvider: 'T' })).status, 400);
});
test('zero affected rows rolls back and never returns saved', async () => {
  const h = harness(); h.fail();
  await assert.rejects(h.request('PATCH', { id: 'stay-A', hotelName: 'X' })); assert.equal(h.rows[0].hotel_name, 'Synthetic hotel');
});
test('identical versioned update is successful no-op', async () => {
  const h = harness(); const revision = (await h.request()).body.stays[0].revision;
  assert.equal((await h.request('PATCH', { contractVersion: 1, expectedRevision: revision, id: 'stay-A', hotelName: 'Synthetic hotel' })).status, 200);
  assert.equal(h.writes.updates, 0);
});
function clientHarness() {
  let generation = 0, owner = 'A'; const data = new Map();
  const storage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) };
  const capture = () => { const g = generation, o = owner; return { token: 'synthetic', owner: o, isCurrent: () => g === generation && o === owner }; };
  return { storage, data, capture, switch() { owner = 'B'; generation++; } };
}
test('delayed A GET after B login cannot populate B or A cache', async () => {
  const h = clientHarness(); let resolve;
  const client = createHotelStayClient({ ...h, request: () => new Promise(r => { resolve = r; }) });
  const read = client.list(); h.switch(); resolve({ ok: true, stays: [row()] });
  await assert.rejects(read, /conta mudou/); assert.equal(h.data.size, 0);
});
test('delayed A PATCH after B login cannot perform readback/cache', async () => {
  const h = clientHarness(); let resolve, calls = 0;
  const client = createHotelStayClient({ ...h, request: () => { calls++; return new Promise(r => { resolve = r; }); } });
  const save = client.update({ hotelName: 'X' }); h.switch(); resolve({ ok: true, savedStayId: 'stay-A' });
  await assert.rejects(save, /conta mudou/); assert.equal(calls, 1); assert.equal(h.data.size, 0);
});
test('PATCH errors are errors, not optimistic success; successful update requires GET readback', async () => {
  const h = clientHarness(); const failure = createHotelStayClient({ ...h, request: async () => { throw Object.assign(new Error('Conflict'), { status: 409 }); } });
  await assert.rejects(failure.update({}), /Conflict/); assert.equal(h.data.size, 0);
  let calls = 0; const good = createHotelStayClient({ ...h, request: async () => ++calls === 1 ? { ok: true, savedStayId: 'stay-A' } : { ok: true, stays: [{ id: 'stay-A', revision: 'v1' }] } });
  assert.equal((await good.update({})).persisted, true); assert.equal(calls, 2);
});
test('cache belongs to owner; auth failure cannot be presented as saved', async () => {
  const h = clientHarness(); let status = 0;
  const client = createHotelStayClient({ ...h, request: async () => { if (!status) return { ok: true, stays: [{ id: 'A' }] }; throw Object.assign(new Error('Unavailable'), { status }); } });
  await client.list(); status = 503; assert.equal((await client.list()).stays.length, 1);
  status = 401; assert.equal((await client.list()).stays.length, 0);
  h.switch(); status = 503; const offline = await client.list(); assert.equal(offline.stays.length, 0); assert.equal(offline.ok, false);
});
test('client and literal server compose; readback verifies fields and lost reply retry does not duplicate', async () => {
  const server = harness([]), h = clientHarness(); let loseReply = true;
  const client = createHotelStayClient({ ...h, request: async (_url, options) => {
    const res = await server.request(options?.method || 'GET', options ? JSON.parse(options.body) : {});
    if (res.status !== 200) throw Object.assign(new Error(res.body.message), { status: res.status });
    if (options && loseReply) { loseReply = false; throw Object.assign(new Error('Reply lost'), { status: 0 }); }
    return res.body;
  } });
  const patch = { contractVersion: 1, expectedRevision: null, stayDate: '2030-01-01', airport: 'AAA', hotelName: 'Synthetic hotel' };
  await assert.rejects(client.update(patch), /Reply lost/);
  assert.equal((await client.update(patch)).persisted, true); assert.equal(server.rows.length, 1);
});
test('readback with different hotel cannot claim saved', async () => {
  const h = clientHarness(); let calls = 0;
  const client = createHotelStayClient({ ...h, request: async () => ++calls === 1 ? { ok: true, savedStayId: 'X' } : { ok: true, stays: [{ id: 'X', revision: 'v', hotelName: 'Other hotel' }] } });
  await assert.rejects(client.update({ hotelName: 'Expected hotel' }), /releitura/);
});
