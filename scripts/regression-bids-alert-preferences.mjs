import assert from 'node:assert/strict';
import http from 'node:http';
import { handleBidsAlertPreferences, bidsAlertStateKey } from '../server/v139/bidsAlertPreferences.mjs';
import { bidsAlertContextKey } from '../server/v139/bidsAlertPolicy.mjs';

const states = new Map(), owners = new Map([['A', 'owner-A'], ['B', 'owner-B']]), calls = [];
let queue = Promise.resolve(), campaign = null, afterConnection = null;
const query = (store, sql, values) => {
  calls.push(sql);
  if (sql.startsWith('SELECT p.public_id')) { const current = owners.get(values[1].split('@')[0]); return [current === values[2] ? [{ public_id: current, payload: store.get(values[0]) }] : []]; }
  if (sql.startsWith('SELECT public_id')) return [[{ public_id: owners.get(values[0].split('@')[0]) }]];
  if (sql.startsWith('SELECT payload')) return [store.has(values[0]) ? [{ payload: store.get(values[0]) }] : []];
  if (sql.startsWith('INSERT INTO crewcheck_telegram_state')) { if (!store.has(values[0])) store.set(values[0], values[1]); return [{ affectedRows: 1 }]; }
  if (sql.startsWith('UPDATE crewcheck_telegram_state')) { store.set(values[1], values[0]); return [{ affectedRows: 1 }]; }
  throw Error(`Unexpected SQL: ${sql}`);
};
const db = { query: async (sql, values) => query(states, sql, values), getConnection: async () => {
  afterConnection?.();
  let local, releaseLock, previous, finished = false;
  return {
    async beginTransaction() { previous = queue; queue = new Promise(resolve => releaseLock = resolve); await previous; local = new Map(states); },
    async query(sql, values) { return query(local, sql, values); },
    async commit() { states.clear(); for (const item of local) states.set(...item); finished = true; releaseLock(); },
    async rollback() { finished = true; releaseLock?.(); },
    release() { if (!finished) releaseLock?.(); },
  };
} };
const source = { id: 'fictional', revision: 'v1', source: { verified: true, label: 'Synthetic', sha256: 'a'.repeat(64) }, targetMonth: '2026-12', timezone: 'UTC', opensAt: '2026-11-11T00:00:00Z', closesAt: '2026-11-12T20:00:00Z', audience: { verified: true, airline: 'FICTIONAL', roles: ['fictional-cabin'] } };
let now = Date.parse('2026-11-11T08:00:00Z');
const server = http.createServer(async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || '';
    await handleBidsAlertPreferences(req, res, new URL(req.url, 'http://fixture.invalid'), {
      identify: async () => token && ['A', 'B', 'A-new'].includes(token) ? { db, email: `${token === 'A-new' ? 'A' : token}@fixture.invalid`, profile: { public_id: owners.get(token === 'A-new' ? 'A' : token) }, payload: { sub: token === 'A-new' ? 'owner-A-new' : `owner-${token}` } } : (res.writeHead(401), res.end('{}'), null),
      getCampaign: () => campaign,
      resolveEligibility: context => ({ verified: true, eligible: true, ownerId: context.payload.sub, campaignId: campaign?.id, campaignRevision: campaign?.revision }),
      clock: () => now,
    });
  } catch (error) { res.writeHead(error.status || 500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: error.message })); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/api/platform/bids/alert-preferences`;
const request = async (token = 'A', body) => {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json(), headers: response.headers };
};
const preferences = { enabled: true, mode: 'manual', preferredTime: '10:30', quietStart: '22:00', quietEnd: '08:00', timezone: 'UTC', channels: { all: false, individual: { mobilePwa: true, watch: false, crewCierge: false } } };
const write = { action: 'save-preferences', expectedRevision: 0, requestId: 'request_001', preferences };
try {
  const start = calls.length, read = await request();
  assert.equal(read.headers.get('cache-control'), 'no-store'); assert.equal(read.data.plan.reason, 'official_data_pending');
  assert.equal(read.data.preferences.enabled, false); assert.equal(read.data.preferences.mode, 'auto');
  assert(calls.slice(start).every(sql => sql.startsWith('SELECT'))); assert.equal(states.size, 0, 'GET is observational');
  const before = states.size;
  assert.equal((await request('A', { action: 'already-did', expectedRevision: 0, requestId: 'request_forged', confirmed: true, contextKey: 'forged', campaign: source })).status, 409);
  assert.equal(states.size, before, 'forged client campaign cannot configure a window or write receipt');
  const first = await request('A', write); assert.equal(first.status, 200); assert.equal(first.data.revision, 1); assert.equal(first.data.externalDelivery, false);
  assert.equal((await request('A', write)).data.revision, 1, 'duplicate save is idempotent');
  const simultaneous = await Promise.all(['one', 'two'].map(name => request('A', { ...write, expectedRevision: 1, requestId: `concurrent_${name}`, preferences: { ...preferences, preferredTime: name === 'one' ? '11:00' : '12:00' } })));
  assert.deepEqual(simultaneous.map(result => result.status).sort(), [200, 409]);
  assert.equal((await request('B')).data.revision, 0); assert.equal((await request('B')).data.preferences.enabled, false);
  assert.notEqual(bidsAlertStateKey('A@fixture.invalid', 'owner-A'), bidsAlertStateKey('A@fixture.invalid', 'owner-A-new'));
  assert.equal((await request('A', { ...write, preferences: { ...preferences, enabled: 'true' } })).status, 400);
  campaign = source;
  const snapshot = (await request()).data; assert.equal(snapshot.canConfirmAlreadyDid, true);
  const receipt = { action: 'already-did', confirmed: true, expectedRevision: snapshot.revision, requestId: 'receipt_001', contextKey: bidsAlertContextKey('owner-A', source) };
  assert.equal((await request('B', receipt)).status, 409, 'receipt cannot cross accounts');
  for (const instant of [Date.parse(source.opensAt) - 1, Date.parse(source.closesAt)]) {
    const savedNow = now, savedStates = JSON.stringify([...states]); now = instant;
    assert.equal((await request('A', receipt)).status, 409, 'declaration outside official window is rejected');
    assert.equal(JSON.stringify([...states]), savedStates, 'rejected declaration makes no write'); now = savedNow;
  }
  const savedNow = now, savedStates = JSON.stringify([...states]);
  now = Date.parse(source.closesAt) - 1; afterConnection = () => { now += 1000; };
  assert.equal((await request('A', receipt)).status, 409, 'closing while waiting for connection/locks rejects declaration');
  assert.equal(JSON.stringify([...states]), savedStates, 'late declaration transaction rolls back');
  afterConnection = null; now = savedNow;
  afterConnection = () => { campaign = { ...source, revision: 'changed-during-lock' }; };
  assert.equal((await request('A', receipt)).status, 409, 'source revision changed while waiting rejects old context');
  assert.equal(JSON.stringify([...states]), savedStates); afterConnection = null; campaign = source;
  const result = await request('A', receipt); assert.equal(result.status, 200); assert.equal(result.data.alreadyDid, true); assert.equal(result.data.plan.reason, 'already_did');
  assert.equal((await request('A', receipt)).data.revision, result.data.revision, 'receipt replay does not increment revision');
  campaign = { ...source, revision: 'v2' };
  assert.equal((await request('A', receipt)).status, 409, 'old source confirmation cannot affect new revision');
  assert.equal((await request()).data.alreadyDid, false);
  owners.set('A', 'owner-A-new');
  assert.equal((await request('A')).status, 401, 'stale login rejected after account recreation');
  const recreated = await request('A-new'); assert.equal(recreated.data.revision, 0); assert.equal(recreated.data.alreadyDid, false); assert.equal(recreated.data.preferences.enabled, false);
  assert(calls.every(sql => !/crewcheck_notification_jobs|bid_windows/.test(sql)), 'no producer, scheduler or queue mutation');
  console.log('PASS actual BIDS preference HTTP handler: observational GET, source/config forgery blocked, account binding/recreation, CAS concurrency, idempotent save/Already did, receipt revision, explicit boolean preferences; zero transport or queue calls.');
} finally { await new Promise(resolve => server.close(resolve)); }
