import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { mysqlAdapter } from '../server/mysql-platform-adapter.mjs';
import { createGoogleEventObserver } from '../server/google-event-observation.mjs';
import { createRtdnFixture, googleRtdnMessage, googleRtdnPayload, hash, qaPlan, qaProduct } from './fixtures/google-rtdn-route.mjs';

assert.equal(process.env.CREWCHECK_BILLING_INTENT_QA, 'isolated-mysql');
const root = process.env.CREWCHECK_BILLING_INTENT_QA_ROOT;
assert.match(root, /^\/tmp\/crewcheck-billing-intent-qa\.[A-Za-z0-9]{8}$/);
assert.equal(fs.realpathSync(root), root);
assert.equal(fs.readFileSync(path.join(root, '.owned-qa'), 'utf8').trim(), 'billing-intent-qa-owned');
const native = mysql.createPool({ socketPath: path.join(root, 'mysql.sock'), user: 'root', password: '', database: 'crewcheck_google_billing_qa', connectionLimit: 12, dateStrings: true });
const db = mysqlAdapter(native);
globalThis.fetch = () => assert.fail('No provider network');
const email = n => `rtdn-${n}@example.invalid`;
const publicId = n => `RTDN_${n}`;
const token = n => `SYNTHETIC_RTDN_${n}`;
const event = (n, suffix = '') => `SYNTHETIC_EVENT_${n}${suffix}`;
const message = (n, suffix = '') => googleRtdnMessage(token(n), event(n, suffix));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const seed = async n => {
  await native.query("INSERT INTO crewcheck_platform_profiles(email,public_id,display_name,plan) VALUES(?,?,?,'free')", [email(n), publicId(n), 'SYNTHETIC']);
  await native.query("INSERT INTO crewcheck_platform_subscriptions(email,plan,status,provider,provider_ref,purchase_token_hash,current_period_end,product_id) VALUES(?,?,'pending','google_play','SYNTHETIC_ORDER',?,'2099-01-01 00:00:00',?)", [email(n), qaPlan, hash(token(n)), qaProduct]);
};
const receipts = async id => (await db.query("SELECT * FROM crewcheck_platform_webhook_events WHERE provider='google_play' AND event_id=$1", [id])).rows;
const snapshot = async n => ({
  profiles: (await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=$1', [email(n)])).rows,
  subs: (await db.query('SELECT * FROM crewcheck_platform_subscriptions WHERE email=$1', [email(n)])).rows,
  events: await receipts(event(n)),
});
const fixture = (n, provider = async () => googleRtdnPayload(publicId(n)), database = db, createObserver) => createRtdnFixture({
  database, createObserver,
  readProvider: received => { assert.equal(received, token(n)); return provider(); },
});
const assertPending = async n => {
  const state = await snapshot(n);
  assert.equal(state.profiles[0].plan, 'free');
  assert.equal(state.subs[0].status, 'pending');
  assert.equal(state.events.length, 0);
};

try {
  const [[where]] = await native.query('SELECT DATABASE() name,@@datadir datadir,@@skip_networking isolated');
  assert.equal(where.name, 'crewcheck_google_billing_qa');
  assert.equal(path.resolve(where.datadir), path.join(root, 'data'));
  assert.equal(Number(where.isolated), 1);
  const migration = fs.readFileSync('migrations/20260715_003_aiven_mysql_full_platform.sql', 'utf8');
  for (const table of ['crewcheck_platform_profiles', 'crewcheck_platform_subscriptions', 'crewcheck_platform_webhook_events']) {
    await native.query(migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}[\\s\\S]*?;`))[0]);
  }

  const unknown = fixture(201);
  assert.equal((await unknown.run(message(201))).body.ignored, true);
  assert.equal((await unknown.run(message(201))).body.ignored, true);
  assert.equal(unknown.counts.publisher, 0);
  assert.deepEqual(await snapshot(201), { profiles: [], subs: [], events: [] });

  await seed(202);
  const known = fixture(202);
  assert.equal((await known.run(message(202))).body.ok, true);
  const committed = await snapshot(202);
  assert.equal(committed.profiles[0].plan, qaPlan);
  assert.equal(committed.subs[0].status, 'active');
  assert.equal(committed.events.length, 1);
  const notification = Buffer.from(message(202).message.data, 'base64').toString('utf8');
  assert.equal(committed.events[0].payload_hash, hash(notification));
  assert(!JSON.stringify(committed).includes(token(202)));
  assert.equal((await known.run(message(202))).body.duplicate, true);
  await assert.rejects(known.run(googleRtdnMessage(token(202), event(202), { eventTimeMillis: '2' })), { code: 'GOOGLE_EVENT_RECEIPT_CONFLICT', status: 409 });
  await assert.rejects(known.run(googleRtdnMessage(token(202), event(202).toLowerCase())), { code: 'GOOGLE_EVENT_RECEIPT_CONFLICT', status: 409 });
  assert.equal(known.counts.publisher, 1);
  assert.deepEqual(await snapshot(202), committed);

  await seed(203);
  const recreated = fixture(203, async () => {
    await native.query("UPDATE crewcheck_platform_profiles SET public_id='RECREATED' WHERE email=?", [email(203)]);
    return googleRtdnPayload(publicId(203));
  });
  await assert.rejects(recreated.run(message(203)), { code: 'ENTITLEMENT_OWNER_MISMATCH' });
  await assertPending(203);

  await seed(204);
  const replaced = fixture(204, async () => {
    await native.query("UPDATE crewcheck_platform_subscriptions SET provider='asaas',provider_ref='sub_SYNTHETIC_REPLACED',purchase_token_hash=NULL WHERE email=?", [email(204)]);
    return googleRtdnPayload(publicId(204));
  });
  await assert.rejects(replaced.run(message(204)), { code: 'BILLING_PROVIDER_RECONCILIATION_REQUIRED' });
  await assertPending(204);
  assert.equal((await snapshot(204)).subs[0].provider, 'asaas');

  await seed(205);
  await seed(206);
  const wrongOwner = fixture(205, async () => googleRtdnPayload(publicId(206)));
  await assert.rejects(wrongOwner.run(message(205)), { code: 'GOOGLE_OBSERVATION_STATE_UNCONFIRMED' });
  await assertPending(205);
  await assertPending(206);
  assert.equal((await fixture(206).run(message(206))).status, 200);
  await assertPending(205);
  assert.equal((await snapshot(206)).profiles[0].plan, qaPlan);
  const attacker = fixture(205);
  await assert.rejects(attacker.run(message(205), { authorization: '' }), { status: 401 });
  assert.deepEqual(attacker.counts, { verifiedAuth: 0, body: 0, database: 0, publisher: 0 });

  await seed(207);
  const unavailable = fixture(207, async () => { throw Error('SYNTHETIC_PROVIDER_UNAVAILABLE'); });
  await assert.rejects(unavailable.run(message(207)), { code: 'GOOGLE_OBSERVATION_STATE_UNCONFIRMED', status: 503 });
  await assertPending(207);
  await native.query('DELETE FROM crewcheck_platform_profiles WHERE email=?', [email(207)]);
  const noProfile = fixture(207);
  assert.equal((await noProfile.run(message(207))).status, 409);
  assert.equal(noProfile.counts.publisher, 0);

  await seed(208);
  let failReceipt = true;
  const faulted = { query: (...args) => db.query(...args), connect: async () => {
    const client = await db.connect();
    return { ...client, query: (sql, params) => {
      if (failReceipt && sql.startsWith('INSERT INTO crewcheck_platform_webhook_events')) {
        failReceipt = false;
        throw Error('SYNTHETIC_RECEIPT_INSERT_FAILED');
      }
      return client.query(sql, params);
    } };
  } };
  const retry = fixture(208, undefined, faulted);
  await assert.rejects(retry.run(message(208)), /SYNTHETIC_RECEIPT_INSERT_FAILED/);
  assert.equal(failReceipt, false);
  await assertPending(208);
  assert.equal((await retry.run(message(208))).status, 200);
  const recovered = await snapshot(208);
  assert.equal(recovered.profiles[0].plan, qaPlan);
  assert.equal(recovered.subs[0].status, 'active');
  assert.equal(recovered.events.length, 1);
  assert.equal((await retry.run(message(208))).body.duplicate, true);
  assert.deepEqual(await snapshot(208), recovered);
  assert.equal(retry.counts.publisher, 2);

  await seed(209);
  const opened = deferred();
  const release = deferred();
  const allArrived = deferred();
  let arrivals = 0;
  const duplicates = fixture(209, async () => { opened.resolve(); await release.promise; return googleRtdnPayload(publicId(209)); }, db, config => {
    const observe = createGoogleEventObserver(config);
    return (...args) => {
      if (++arrivals === 10) allArrived.resolve();
      return observe(...args);
    };
  });
  const first = duplicates.run(message(209));
  await Promise.race([opened.promise, first.then(() => assert.fail('expected held Publisher read'))]);
  const repeats = Array.from({ length: 9 }, () => duplicates.run(message(209)));
  const all = Promise.all([first, ...repeats]);
  try {
    await Promise.race([allArrived.promise, all.then(() => assert.fail('expected ten overlapping requests'))]);
    assert.equal(duplicates.counts.publisher, 1);
  } finally { release.resolve(); }
  const responses = await all;
  assert(responses.every(response => response.status === 200 && response.body.ok));
  assert.equal(duplicates.counts.publisher, 1);
  assert.equal((await snapshot(209)).events.length, 1);

  await seed(210);
  const staleOpened = deferred();
  const staleRelease = deferred();
  let reads = 0;
  const overlapping = fixture(210, async () => {
    if (++reads === 1) { staleOpened.resolve(); await staleRelease.promise; return googleRtdnPayload(publicId(210)); }
    return googleRtdnPayload(publicId(210), 'EXPIRED');
  });
  const stale = overlapping.run(message(210));
  await Promise.race([staleOpened.promise, stale.then(() => assert.fail('expected held stale observation'))]);
  const rejectsStale = assert.rejects(stale, { code: 'GOOGLE_STATE_RECHECK_REQUIRED' });
  try {
    assert.equal((await overlapping.run(message(210, '-new'))).status, 200);
  } finally { staleRelease.resolve(); }
  await rejectsStale;
  const expired = await snapshot(210);
  assert.equal(expired.profiles[0].plan, 'free');
  assert.equal(expired.subs[0].status, 'expired');
  assert.equal(expired.events.length, 0);
  assert.equal((await receipts(event(210, '-new'))).length, 1);
  assert.equal((await overlapping.run(message(210))).status, 200);
  assert.equal((await snapshot(210)).subs[0].status, 'expired');
  assert.equal((await receipts(event(210))).length, 1);
  assert.equal(overlapping.counts.publisher, 3);

  await seed(211);
  const firstRead = deferred();
  const secondRead = deferred();
  const allowFirst = deferred();
  const allowSecond = deferred();
  let conflictReads = 0;
  const conflicts = fixture(211, async () => {
    if (++conflictReads === 1) { firstRead.resolve(); await allowFirst.promise; return googleRtdnPayload(publicId(211)); }
    secondRead.resolve();
    await allowSecond.promise;
    return googleRtdnPayload(publicId(211), 'EXPIRED');
  });
  const original = conflicts.run(message(211));
  await Promise.race([firstRead.promise, original.then(() => assert.fail('expected held original payload'))]);
  const conflict = conflicts.run(googleRtdnMessage(token(211), event(211), { eventTimeMillis: '2' }));
  const rejectsConflict = assert.rejects(conflict, { code: 'GOOGLE_EVENT_RECEIPT_CONFLICT', status: 409 });
  try {
    await Promise.race([secondRead.promise, rejectsConflict.then(() => assert.fail('expected held conflicting payload'))]);
    allowFirst.resolve();
    assert.equal((await original).status, 200);
  } finally { allowFirst.resolve(); allowSecond.resolve(); }
  await rejectsConflict;
  const accepted = await snapshot(211);
  assert.equal(accepted.profiles[0].plan, qaPlan);
  assert.equal(accepted.subs[0].status, 'active');
  assert.equal(accepted.events.length, 1);
  assert.equal(accepted.events[0].payload_hash, hash(Buffer.from(message(211).message.data, 'base64').toString('utf8')));

  console.log('PASS authenticated RTDN on isolated MySQL: account/Asaas fences, authorization, rollback+retry, replay, ten overlapping duplicates, overlapping distinct events and concurrent same-ID payload conflict; simulated Google only');
} finally { await native.end(); }
