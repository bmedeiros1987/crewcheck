import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleEscalaContact } from '../server/escala-contact.mjs';
import { defaultEscalaContact, ESCALA_CONTACT_ADMIN_PATH as ADMIN, ESCALA_CONTACT_READ_PATH as READ } from '../shared/escala-contact.mjs';

// Reuse ONLY the existing notification-mysql disposable Unix-socket fixture.
// No DATABASE_URL, host, port, production credentials or runtime migration.
const socketPath = '/tmp/crewcheck-notification-qa-socket/mysqld.sock';
assert.equal(process.env.CREWCHECK_NOTIFICATION_QA, 'isolated-mysql', 'explicit disposable-DB flag required');
assert.equal(process.env.CREWCHECK_QA_MYSQL_SOCKET, socketPath, 'only existing QA socket is accepted');
assert(fs.statSync(socketPath).isSocket(), 'QA path must be a Unix socket');
let networkCalls = 0;
globalThis.fetch = () => { networkCalls++; throw Error('External network forbidden in Escala MySQL fixture'); };
const mysql = (await import('mysql2/promise')).default;
const connect = () => mysql.createPool({ socketPath, user: 'root', password: '', database: 'crewcheck_notification_qa', connectionLimit: 8, dateStrings: true });
let db = connect();
const previousAdmins = process.env.CREWCHECK_ADMIN_EMAILS;
const EMAIL = 'escala-admin@example.invalid', SECOND = 'escala-admin-two@example.invalid';
process.env.CREWCHECK_ADMIN_EMAILS = `${EMAIL},${SECOND}`;
const KEY = 'system:escala-contact:v1', OTHER = 'synthetic:other-contact-setting';
const NOW = Date.parse('2032-10-25T12:00:00.000Z');
const owner = email => email === EMAIL ? 'synthetic-contact-A' : 'synthetic-contact-B';
const body = (expectedRevision, dialString = '01140000000') => ({ expectedRevision, dialString });
const passed = [];
const test = async (name, fn) => { await fn(); passed.push(name); };
async function invoke({ method = 'GET', path = READ, input, email = EMAIL, claim = true, pool = db, identify } = {}) {
  const res = { status: null, data: null, setHeader() {}, writeHead(status) { this.status = status; }, end(value) { this.data = JSON.parse(value); } };
  await handleEscalaContact({ method, headers: { 'content-type': 'application/json' } }, res, new URL(path, 'https://fixture.invalid'), {
    identify: identify || (async () => ({ db: pool, email, profile: { public_id: owner(email) }, payload: { sub: owner(email), admin: claim, role: claim ? 'admin' : 'free' } })),
    read: async () => input,
    clock: () => NOW,
  });
  return res;
}
const rows = async () => (await db.query('SELECT state_key,payload,updated_at FROM crewcheck_telegram_state ORDER BY state_key'))[0];
const value = async () => {
  const [found] = await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?', [KEY]);
  if (!found.length) return null;
  return typeof found[0].payload === 'string' ? JSON.parse(found[0].payload) : found[0].payload;
};
const clear = async () => db.query('DELETE FROM crewcheck_telegram_state WHERE state_key=?', [KEY]);
function faultPool(kind) {
  return {
    query: (...args) => db.query(...args),
    async getConnection() {
      const connection = await db.getConnection();
      return {
        beginTransaction: () => connection.beginTransaction(),
        query: (...args) => connection.query(...args),
        async commit() {
          if (kind === 'before') throw Error('synthetic failure before COMMIT');
          await connection.commit();
          if (kind === 'after') throw Error('synthetic ACK loss after actual COMMIT');
        },
        rollback: () => connection.rollback(),
        release: () => connection.release(),
      };
    },
  };
}

try {
  const [identity] = await db.query('SELECT DATABASE() AS name,VERSION() AS version');
  assert.equal(identity[0].name, 'crewcheck_notification_qa');
  assert.match(identity[0].version, /^8\.4\./, 'use the existing disposable MySQL8.4 fixture');
  // The existing workflow runs this script serially inside its disposable DB.
  // These are fixture tables, not migration statements for the application.
  await db.query('DROP TABLE IF EXISTS crewcheck_platform_profiles');
  await db.query('DROP TABLE IF EXISTS crewcheck_telegram_state');
  await db.query('CREATE TABLE crewcheck_platform_profiles(email VARCHAR(254) PRIMARY KEY,public_id VARCHAR(64) NOT NULL) ENGINE=InnoDB');
  await db.query('CREATE TABLE crewcheck_telegram_state(state_key VARCHAR(255) PRIMARY KEY,payload JSON NOT NULL,updated_at DATETIME(3) NOT NULL) ENGINE=InnoDB');
  for (const email of [EMAIL, SECOND]) await db.query('INSERT INTO crewcheck_platform_profiles VALUES(?,?)', [email, owner(email)]);
  await db.query('INSERT INTO crewcheck_telegram_state VALUES(?,?,NOW(3))', [OTHER, JSON.stringify({ mustRemain: 'synthetic unrelated setting' })]);
  const baselineOther = (await rows()).find(row => row.state_key === OTHER);

  await test('absent GET does not seed durable state', async () => {
    const before = await rows(); const result = await invoke();
    assert.equal(result.status, 200); assert.deepEqual(result.data.contact, defaultEscalaContact());
    assert.deepEqual(await rows(), before);
  });
  await test('non-admin and forged namespace writes preserve database', async () => {
    const before = await rows();
    assert.equal((await invoke({ path: ADMIN, method: 'PUT', claim: false, input: body(0) })).status, 403);
    assert.equal((await invoke({ path: ADMIN, method: 'PUT', input: { ...body(0), key: OTHER } })).status, 400);
    assert.deepEqual(await rows(), before);
  });
  await test('concurrent first writes use existing SQL locks and exactly one fixed key', async () => {
    const results = await Promise.all([EMAIL, SECOND].map((email, index) => invoke({ path: ADMIN, method: 'PUT', email, input: body(0, `0114000000${index}`) })));
    assert.deepEqual(results.map(item => item.status).sort(), [200, 409]);
    assert.equal((await value()).revision, 1);
    assert.equal((await rows()).filter(row => row.state_key === KEY).length, 1);
  });
  await test('concurrent updates across admins cannot lose a revision', async () => {
    const results = await Promise.all([EMAIL, SECOND].map((email, index) => invoke({ path: ADMIN, method: 'PUT', email, input: body(1, `0114000001${index}`) })));
    assert.deepEqual(results.map(item => item.status).sort(), [200, 409]); assert.equal((await value()).revision, 2);
  });
  await test('current duplicate is no-op; stale revision cannot overwrite', async () => {
    const current = await value(), before = await rows();
    assert.equal((await invoke({ path: ADMIN, method: 'PUT', input: body(2, current.dialString) })).status, 200);
    assert.deepEqual(await rows(), before);
    assert.equal((await invoke({ path: ADMIN, method: 'PUT', input: body(1) })).status, 409);
    assert.deepEqual(await rows(), before);
  });
  await test('same contact is read across accounts without exposing unrelated KV', async () => {
    const a = await invoke({ claim: false }), b = await invoke({ email: SECOND, claim: false });
    assert.equal(a.status, 200); assert.deepEqual(a.data, b.data);
    assert.doesNotMatch(JSON.stringify(a.data), /mustRemain|unrelated|example\.invalid|synthetic-contact/);
  });
  await test('malformed durable JSON shape never becomes default or gets overwritten', async () => {
    for (const malformed of [null, [], { schema: 'wrong' }, { ...defaultEscalaContact(), revision: 1, updatedAt: 'bad' }, defaultEscalaContact()]) {
      await db.query('UPDATE crewcheck_telegram_state SET payload=? WHERE state_key=?', [JSON.stringify(malformed), KEY]);
      const before = await rows();
      assert.equal((await invoke()).status, 503);
      assert.equal((await invoke({ path: ADMIN, method: 'PUT', input: body(1) })).status, 503);
      assert.deepEqual(await rows(), before);
    }
    await clear();
  });
  await test('account deletion/recreation after authentication is rechecked under lock', async () => {
    const who = { db, email: EMAIL, profile: { public_id: owner(EMAIL) }, payload: { sub: owner(EMAIL), admin: true, role: 'admin' } };
    await db.query('UPDATE crewcheck_platform_profiles SET public_id=? WHERE email=?', ['replacement-synthetic-owner', EMAIL]);
    assert.equal((await invoke({ path: ADMIN, method: 'PUT', input: body(0), identify: async () => who })).status, 403);
    assert.equal(await value(), null);
    await db.query('UPDATE crewcheck_platform_profiles SET public_id=? WHERE email=?', [owner(EMAIL), EMAIL]);
  });
  await test('actual transaction rolls back insert on failure before COMMIT', async () => {
    const before = await rows();
    assert.equal((await invoke({ path: ADMIN, method: 'PUT', input: body(0), pool: faultPool('before') })).status, 503);
    assert.deepEqual(await rows(), before);
  });
  await test('actual COMMIT followed by simulated lost ACK reconciles by read, not retry', async () => {
    const result = await invoke({ path: ADMIN, method: 'PUT', input: body(0), pool: faultPool('after') });
    assert.equal(result.status, 503); assert.equal(result.data.contact, undefined);
    const current = await value(); assert.equal(current.revision, 1); assert.equal(current.dialString, '01140000000');
    assert.equal((await invoke({ path: ADMIN, method: 'PUT', input: body(0, '01140000009') })).status, 409);
    assert.deepEqual(await value(), current);
  });
  await test('fresh pool observes durable revision and all unrelated state remains unchanged', async () => {
    const current = await value(); await db.end(); db = connect();
    assert.deepEqual((await invoke()).data.contact, current);
    assert.deepEqual((await rows()).find(row => row.state_key === OTHER), baselineOther);
    assert.equal((await rows()).length, 2); assert.equal(networkCalls, 0);
  });
  console.log(`PASS Escala contact actual MySQL8.4: ${passed.length} groups; SQL CAS/concurrency, rollback, post-COMMIT ACK uncertainty, pool reopen, no unrelated mutation; networkCalls=${networkCalls}, realCalls=0.`);
} finally {
  await db.end();
  if (previousAdmins === undefined) delete process.env.CREWCHECK_ADMIN_EMAILS; else process.env.CREWCHECK_ADMIN_EMAILS = previousAdmins;
}
