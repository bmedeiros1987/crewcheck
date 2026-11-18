import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { handleEscalaContact } from '../server/escala-contact.mjs';
import { defaultEscalaContact, escalaTelUri, validEscalaContact, validEscalaDialString, ESCALA_CONTACT_ADMIN_PATH as ADMIN, ESCALA_CONTACT_READ_PATH as READ } from '../shared/escala-contact.mjs';

// No real identities, credentials, database, calling app or network are used.
let networkCalls = 0;
globalThis.fetch = () => { networkCalls++; throw Error('Network forbidden in Escala contact fixture'); };
const previousAdmins = process.env.CREWCHECK_ADMIN_EMAILS;
const EMAIL = 'escala-admin@example.invalid', OTHER = 'escala-second@example.invalid';
process.env.CREWCHECK_ADMIN_EMAILS = `${EMAIL},${OTHER}`;
const KEY = 'system:escala-contact:v1', NOW = Date.parse('2032-10-25T12:00:00.000Z');
const unrelated = { 'notification:synth': '{"private":"unchanged"}', 'system:other-setting:v1': '{"value":27}' };
const contact = (revision = 1, dialString = '01140000000') => ({ ...defaultEscalaContact(), revision, dialString, updatedAt: new Date(NOW).toISOString() });
const update = (expectedRevision = 0, dialString = '01140000000') => ({ expectedRevision, dialString });
const groups = [];
async function test(name, fn) { await fn(); groups.push(name); }
function response() { return { headers: {}, status: null, data: null, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers); }, end(text) { this.data = JSON.parse(text); } }; }

function fixture(initial) {
  const state = { rows: new Map(Object.entries(unrelated)), profiles: new Map([[EMAIL, 'synthetic-admin-A'], [OTHER, 'synthetic-admin-B']]), calls: [], writes: 0, connections: 0, commits: 0, releases: 0, fail: '', queryRows: undefined };
  if (initial !== undefined) state.rows.set(KEY, typeof initial === 'string' ? initial : JSON.stringify(initial));
  let tail = Promise.resolve();
  const execute = async (sql, params, rows) => {
    state.calls.push({ sql, params: structuredClone(params) });
    if (sql.startsWith('SELECT public_id')) {
      if (state.fail === 'authority-removed') process.env.CREWCHECK_ADMIN_EMAILS = OTHER;
      const owner = state.profiles.get(params[0]);
      return [owner ? [{ public_id: owner }] : []];
    }
    if (sql.startsWith('SELECT payload')) {
      assert.equal(params[0], KEY, 'only the fixed installation contact key may be read');
      if (state.fail === 'read') throw Error('synthetic query failure: secret must not leak');
      if (state.queryRows !== undefined) return [state.queryRows];
      return [rows.has(KEY) ? [{ payload: rows.get(KEY) }] : []];
    }
    if (sql.startsWith('INSERT INTO crewcheck_telegram_state')) {
      assert.equal(params[0], KEY); state.writes++;
      if (state.fail === 'insert') throw Error('synthetic insert failure');
      if (state.fail === 'duplicate') throw Object.assign(Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      if (state.fail === 'zero-write') return [{ affectedRows: 0 }];
      assert(!rows.has(KEY), 'no blind upsert'); rows.set(KEY, params[1]); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE crewcheck_telegram_state')) {
      assert.equal(params[1], KEY); state.writes++;
      if (state.fail === 'update') throw Error('synthetic update failure');
      if (state.fail === 'deadlock') throw Object.assign(Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' });
      if (state.fail === 'zero-write') return [{ affectedRows: 0 }];
      assert(rows.has(KEY)); rows.set(KEY, params[0]); return [{ affectedRows: 1 }];
    }
    throw Error(`Unexpected SQL in fixture: ${sql}`);
  };
  const db = {
    async query(sql, params) { assert(sql.startsWith('SELECT '), 'ordinary reads cannot mutate'); return execute(sql, params, state.rows); },
    async getConnection() {
      state.connections++;
      if (state.fail === 'connection') throw Error('synthetic no connection');
      let rows, unlock, active = false;
      return {
        async beginTransaction() {
          if (state.fail === 'begin') throw Error('synthetic begin failure');
          const prior = tail; tail = new Promise(resolve => { unlock = resolve; }); await prior;
          rows = new Map(state.rows); active = true;
        },
        query(sql, params) { assert(active); return execute(sql, params, rows); },
        async commit() {
          assert(active);
          if (state.fail === 'commit-before') throw Error('synthetic uncommitted failure');
          state.rows = rows; state.commits++; active = false; unlock();
          if (state.fail === 'commit-after') throw Error('synthetic acknowledgement lost after commit');
        },
        async rollback() { if (active) { active = false; unlock(); } },
        release() { state.releases++; assert(!active, 'connection cannot release an open transaction'); },
      };
    },
  };
  const identity = (email = EMAIL) => ({ db, email, profile: { public_id: email === EMAIL ? 'synthetic-admin-A' : 'synthetic-admin-B' }, admin: true, payload: { sub: email === EMAIL ? 'synthetic-admin-A' : 'synthetic-admin-B', admin: true, role: 'admin' } });
  async function invoke({ path = READ, method = 'GET', body, who = identity(), headers = {}, read, identify, realBody } = {}) {
    const res = response(), req = realBody === undefined ? { method, headers: { 'content-type': 'application/json', ...headers } } : Object.assign(new EventEmitter(), { method, headers: { 'content-type': 'application/json', ...headers }, destroy() { this.destroyed = true; } });
    const options = { identify: identify || (async () => who), clock: () => NOW };
    if (realBody === undefined) options.read = read || (async () => body);
    const pending = handleEscalaContact(req, res, new URL(path, 'https://fixture.invalid'), options);
    if (realBody !== undefined) setImmediate(() => { req.emit('data', realBody); req.emit('end'); });
    const handled = await pending;
    return { ...res, handled, req };
  }
  return { state, db, identity, invoke, value: () => state.rows.has(KEY) ? JSON.parse(state.rows.get(KEY)) : null, snapshot: () => JSON.stringify([...state.rows]) };
}

try {
  await test('exact safe default and URI preserve zero prefix', async () => {
    assert.equal(defaultEscalaContact().dialString, '01141746343');
    assert.equal(escalaTelUri(defaultEscalaContact().dialString), 'tel:01141746343');
    for (const value of ['01140000000', '+551140000000', '00123456']) assert(validEscalaDialString(value));
    for (const value of ['', null, 1141746343, '911', '112', '011 41746343', '01141746343\n', 'tel:01141746343', 'javascript:alert(1)', '*21*01141746343#', '01141746343;ext=2', '01141746343,3', '01141746343%23', '01141746343?x=1', '＋551140000000', '+01141746343', '1'.repeat(16)]) {
      assert.equal(validEscalaDialString(value), false, String(value)); assert.equal(escalaTelUri(value), null);
    }
  });
  await test('ordinary and administrator GET are observational; no seed or unrelated data disclosure', async () => {
    const f = fixture(), before = f.snapshot();
    for (const path of [READ, ADMIN]) { const r = await f.invoke({ path }); assert.equal(r.status, 200); assert.deepEqual(r.data, { ok: true, contact: defaultEscalaContact() }); assert.equal(r.headers['cache-control'], 'no-store'); }
    assert.equal(f.snapshot(), before); assert.equal(f.state.connections, 0); assert.equal(f.state.writes, 0);
    assert.doesNotMatch(JSON.stringify((await f.invoke()).data), /unchanged|other-setting|email|private/);
  });
  await test('fixed installation contact readable by distinct accounts without changing ownership', async () => {
    const f = fixture(contact()); const before = f.snapshot();
    const reader = f.identity(OTHER); reader.payload.admin = false; reader.admin = false; reader.payload.role = 'free';
    assert.deepEqual((await f.invoke({ who: reader })).data.contact, contact()); assert.equal(f.snapshot(), before);
  });
  await test('routing and methods fail closed without database access', async () => {
    const f = fixture(); let identityCalls = 0; const identify = async () => { identityCalls++; return f.identity(); };
    assert.equal((await f.invoke({ path: '/api/admin/unrelated', identify })).handled, false);
    assert.equal((await f.invoke({ path: READ + '?key=other', identify })).status, 400);
    for (const [path, method] of [[READ, 'PUT'], [READ, 'POST'], [ADMIN, 'DELETE'], [ADMIN, 'PATCH']]) assert.equal((await f.invoke({ path, method, identify })).status, 405);
    assert.equal(identityCalls, 0); assert.equal(f.state.calls.length, 0);
  });
  await test('no authenticated identity stops before contact DB access', async () => {
    const f = fixture(); const r = await f.invoke({ identify: async (_req, res) => { res.writeHead(401); res.end('{"ok":false}'); return null; } });
    assert.equal(r.status, 401); assert.equal(f.state.calls.length, 0);
  });
  await test('visitor guest missing account and owner mismatch are denied', async () => {
    const f = fixture();
    for (const alter of [u => u.payload.role = 'visitor', u => u.payload.role = 'guest', u => u.payload.aud = 'crewcheck-visitor', u => u.profile = {}, u => u.payload.sub = 'other-owner']) {
      const who = f.identity(); alter(who);
      for (const path of [READ, ADMIN]) assert.equal((await f.invoke({ who, path })).status, 403);
    }
    assert.equal(f.state.calls.length, 0);
  });
  await test('admin requires signed boolean claim and live allowlist, not plan or UI flag', async () => {
    const f = fixture();
    for (const alter of [u => u.payload.admin = false, u => u.payload.admin = 'true', u => delete u.payload.admin, u => u.email = 'not-admin@example.invalid', u => { u.payload.admin = false; u.payload.role = 'premium_unlimited'; u.admin = true; }]) {
      const who = f.identity(); alter(who);
      for (const method of ['GET', 'PUT']) assert.equal((await f.invoke({ who, path: ADMIN, method, body: update() })).status, 403);
    }
    assert.equal(f.state.calls.length, 0);
  });
  await test('closed schema and unsafe phone/body reject before connection', async () => {
    const f = fixture(); const invalid = [null, [], 'text', {}, { ...update(), key: 'other' }, { ...update(), ownerId: 'other' }, { ...update(), admin: true }, { ...update(), expectedRevision: '0' }, { ...update(), expectedRevision: -1 }, { ...update(), expectedRevision: 0.5 }, { ...update(), expectedRevision: Number.MAX_SAFE_INTEGER }, { ...update(), dialString: 1140000000 }, { ...update(), dialString: '01140000000;ext=123' }, { ...update(), dialString: '*21*01140000000#' }];
    for (const body of invalid) assert.equal((await f.invoke({ path: ADMIN, method: 'PUT', body })).status, 400, JSON.stringify(body));
    assert.equal(f.state.connections, 0); assert.equal(f.state.writes, 0);
  });
  await test('content type cross-site and actual JSON/body-size parser are enforced', async () => {
    const f = fixture();
    for (const headers of [{ 'content-type': '' }, { 'content-type': 'text/plain' }, { 'content-type': 'application/jsonp' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await f.invoke({ path: ADMIN, method: 'PUT', body: update(), headers })).status, 400);
    assert.equal((await f.invoke({ path: ADMIN, method: 'PUT', realBody: '{broken' })).status, 400);
    const large = await f.invoke({ path: ADMIN, method: 'PUT', realBody: JSON.stringify({ padding: 'x'.repeat(1200) }) });
    assert.equal(large.status, 413); assert.equal(large.req.destroyed, true); assert.equal(f.state.connections, 0);
  });
  await test('unknown or malformed durable state never becomes default and never gets overwritten', async () => {
    for (const initial of ['broken', 'null', '[]', defaultEscalaContact(), { ...contact(), revision: '1' }, { ...contact(), dialString: 'tel:123' }, { ...contact(), updatedAt: '2032-02-31T00:00:00.000Z' }, { ...contact(), secret: 'not-for-response' }]) {
      const f = fixture(initial), before = f.snapshot();
      for (const options of [{}, { path: ADMIN, method: 'PUT', body: update(1) }]) { const r = await f.invoke(options); assert.equal(r.status, 503); assert.equal(r.data.contact, undefined); assert.doesNotMatch(JSON.stringify(r.data), /not-for-response|broken|secret/); }
      assert.equal(f.snapshot(), before); assert.equal(f.state.writes, 0);
    }
    for (const rows of [null, [{ payload: contact() }, { payload: contact() }]]) { const f = fixture(); f.state.queryRows = rows; assert.equal((await f.invoke()).status, 503); }
  });
  await test('database failure is unavailable, not default or success', async () => {
    for (const fail of ['read', 'connection', 'begin']) {
      const f = fixture(), before = f.snapshot(); f.state.fail = fail;
      const r = await f.invoke(fail === 'read' ? {} : { path: ADMIN, method: 'PUT', body: update() });
      assert.equal(r.status, 503); assert.equal(r.data.contact, undefined); assert.equal(f.snapshot(), before);
    }
  });
  await test('create and CAS update preserve all unrelated KV and expose only bounded record', async () => {
    const f = fixture();
    const first = await f.invoke({ path: ADMIN, method: 'PUT', body: update() }); assert.equal(first.status, 200); assert.deepEqual(first.data.contact, contact());
    const second = await f.invoke({ path: ADMIN, method: 'PUT', body: update(1, '+551140000000') }); assert.equal(second.status, 200); assert.deepEqual(second.data.contact, contact(2, '+551140000000'));
    for (const [key, value] of Object.entries(unrelated)) assert.equal(f.state.rows.get(key), value);
    assert.equal(f.state.rows.size, 3); assert.equal(f.state.writes, 2); assert.equal(f.state.connections, f.state.releases);
  });
  await test('stale revision and duplicate old request cannot overwrite current contact', async () => {
    const f = fixture(contact()); const before = f.snapshot();
    for (const revision of [0, 2]) assert.equal((await f.invoke({ path: ADMIN, method: 'PUT', body: update(revision, '01140000001') })).status, 409);
    assert.equal(f.snapshot(), before); assert.equal(f.state.writes, 0);
    const same = await f.invoke({ path: ADMIN, method: 'PUT', body: update(1) }); assert.equal(same.status, 200); assert.equal(same.data.contact.revision, 1); assert.equal(f.state.writes, 0);
  });
  await test('concurrent creation and concurrent updates admit exactly one revision', async () => {
    for (const initial of [undefined, contact()]) {
      const f = fixture(initial), revision = initial ? 1 : 0;
      const results = await Promise.all(['01140000001', '01140000002'].map(dialString => f.invoke({ path: ADMIN, method: 'PUT', body: update(revision, dialString) })));
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal(f.value().revision, revision + 1); assert.equal(f.state.writes, 1);
    }
  });
  await test('account removed or recreated after identity read cannot commit', async () => {
    for (const replacement of [null, 'new-owner']) {
      const f = fixture(); if (replacement === null) f.state.profiles.delete(EMAIL); else f.state.profiles.set(EMAIL, replacement);
      const r = await f.invoke({ path: ADMIN, method: 'PUT', body: update() }); assert.equal(r.status, 403); assert.equal(f.state.writes, 0); assert.equal(f.value(), null);
    }
  });
  await test('administrator allowlist revocation during write is rechecked in transaction', async () => {
    const f = fixture(); f.state.fail = 'authority-removed';
    assert.equal((await f.invoke({ path: ADMIN, method: 'PUT', body: update() })).status, 403); assert.equal(f.state.writes, 0);
    process.env.CREWCHECK_ADMIN_EMAILS = `${EMAIL},${OTHER}`;
  });
  await test('pre-commit storage failures roll back and never claim success', async () => {
    for (const [fail, initial] of [['insert', undefined], ['update', contact()], ['commit-before', undefined]]) {
      const f = fixture(initial), before = f.snapshot(); f.state.fail = fail;
      assert.equal((await f.invoke({ path: ADMIN, method: 'PUT', body: update(initial ? 1 : 0, '01140000003') })).status, 503);
      assert.equal(f.snapshot(), before); assert.equal(f.state.commits, 0);
    }
  });
  await test('lost commit acknowledgement stays uncertain; read reconciles without automatic replay', async () => {
    const f = fixture(); f.state.fail = 'commit-after';
    const uncertain = await f.invoke({ path: ADMIN, method: 'PUT', body: update() }); assert.equal(uncertain.status, 503); assert.equal(uncertain.data.contact, undefined); assert.equal(f.state.writes, 1); assert.equal(f.state.commits, 1);
    f.state.fail = ''; assert.deepEqual((await f.invoke()).data.contact, contact());
    assert.equal((await f.invoke({ path: ADMIN, method: 'PUT', body: update() })).status, 409); assert.equal(f.state.writes, 1); assert.equal(f.value().revision, 1);
  });
  await test('duplicate insert and deadlock require explicit refresh with no automatic retry', async () => {
    for (const [fail, initial] of [['duplicate', undefined], ['deadlock', contact()]]) {
      const f = fixture(initial), before = f.snapshot(); f.state.fail = fail;
      assert.equal((await f.invoke({ path: ADMIN, method: 'PUT', body: update(initial ? 1 : 0, '01140000003') })).status, 409);
      assert.equal(f.state.writes, 1); assert.equal(f.snapshot(), before);
    }
  });
  await test('zero affected rows cannot fabricate successful persistence', async () => {
    for (const initial of [undefined, contact()]) {
      const f = fixture(initial), before = f.snapshot(); f.state.fail = 'zero-write';
      assert.equal((await f.invoke({ path: ADMIN, method: 'PUT', body: update(initial ? 1 : 0, '01140000003') })).status, 503);
      assert.equal(f.snapshot(), before); assert.equal(f.state.commits, 0);
    }
  });
  await test('real route remains mounted; no contact schema or calling transport introduced', async () => {
    const source = fs.readFileSync(new URL('../server/escala-contact.mjs', import.meta.url), 'utf8');
    assert.match(source, /identify = requireExistingIdentity/); assert.doesNotMatch(source, /CREATE TABLE|ALTER TABLE|ensureTables\s*\(|ensureProfile\s*\(|fetch\s*\(|Infobip|ACTION_CALL/);
    const control = fs.readFileSync(new URL('../server/v14316/controlCenter.mjs', import.meta.url), 'utf8'); assert.match(control, /await handleEscalaContact\(req, res, url\)/);
    assert.equal(networkCalls, 0);
  });
  console.log(`PASS Escala contact: ${groups.length} offline groups, actual handler/policy/parser, synthetic transactional DB; networkCalls=${networkCalls}, realCalls=0.`);
} finally {
  if (previousAdmins === undefined) delete process.env.CREWCHECK_ADMIN_EMAILS; else process.env.CREWCHECK_ADMIN_EMAILS = previousAdmins;
}
