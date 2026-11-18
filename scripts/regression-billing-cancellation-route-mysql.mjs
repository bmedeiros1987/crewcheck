import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { cancellationContractHash } from '../server/billing-cancellation-intent.mjs';
import { mysqlAdapter } from '../server/mysql-platform-adapter.mjs';
import { createCoordinatedBillingCancelHandler, handlePlatformRoute } from '../server/platform.mjs';

const root = process.env.CREWCHECK_BILLING_INTENT_QA_ROOT;
assert.equal(process.env.CREWCHECK_BILLING_INTENT_QA, 'isolated-mysql');
assert.match(root || '', /^\/tmp\/crewcheck-billing-intent-qa\.[A-Za-z0-9]{8}$/);
assert.equal(fs.realpathSync(root), root);
assert.equal(fs.readFileSync(path.join(root, '.owned-qa'), 'utf8').trim(), 'billing-intent-qa-owned');
const secret = 'synthetic-cancellation-route-test-only';
process.env.CREWCHECK_AUTH_SECRET = secret;
let unexpectedCalls = 0;
globalThis.fetch = () => { unexpectedCalls++; throw new Error('Unexpected network request'); };
const database = 'crewcheck_cancel_route_qa';
const native = mysql.createPool({ socketPath: path.join(root, 'mysql.sock'), user: 'root', password: '', database, connectionLimit: 8, dateStrings: true });
const db = mysqlAdapter(native);
const cancelUrl = new URL('https://example.invalid/api/platform/billing/cancel');
const email = n => `cancel-route-${n}@example.invalid`;
const publicId = n => `CANCEL_ROUTE_${n}`;
const ref = n => `sub_CANCEL_ROUTE_${n}`;
const period = '2099-01-01T00:00:00.000Z';
const realNow = Date.now;
let clock = realNow();
Date.now = () => clock;

function token(n, overrides) {
  const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
  const exp = Math.floor(clock / 1000) + 60;
  const claims = { iss: 'crewcheck', aud: 'crewcheck-web', sub: publicId(n), email: email(n), role: 'free', exp, ...overrides };
  const payload = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}

function response() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    writeHead(status) { this.status = status; },
    end(body) { this.body = JSON.parse(body); },
  };
}

async function request(n, { transport, readAsaasSubscription, pool = db, headers = { authorization: `Bearer ${token(n)}` }, method = 'POST', body } = {}) {
  const handle = createCoordinatedBillingCancelHandler({ poolProvider: async () => pool, sendAsaasCancellation: transport, readAsaasSubscription });
  const res = response();
  await handle({ method, headers, body }, res);
  return res;
}

async function seed(n, { provider = 'asaas', status = 'active', end = '2099-01-01 00:00:00', plan = 'premium_monthly' } = {}) {
  await native.execute('INSERT INTO crewcheck_platform_profiles(email,public_id,display_name,plan) VALUES(?,?,?,?)', [email(n), publicId(n), 'Synthetic', plan]);
  await native.execute("INSERT INTO crewcheck_platform_subscriptions(email,plan,status,provider,provider_ref,product_id,current_period_end) VALUES(?,'premium_monthly',?,?,?,?,?)", [email(n), status, provider, ref(n), 'synthetic.monthly', end]);
}

async function subscription(n) {
  const [[row]] = await native.execute('SELECT cancel_at_period_end AS canceled, provider_ref AS ref FROM crewcheck_platform_subscriptions WHERE email=?', [email(n)]);
  return row;
}

async function journal(n) {
  const [[row]] = await native.execute('SELECT state, (SELECT COUNT(*) FROM crewcheck_billing_cancellation_evidence e WHERE e.operation_id=i.operation_id) AS receipts FROM crewcheck_billing_cancellation_intents i WHERE contract_hash=?', [cancellationContractHash(ref(n))]);
  return row;
}

function ack(providerRef) {
  const contractHash = cancellationContractHash(providerRef);
  return { acknowledged: true, contractHash, evidenceHash: createHash('sha256').update(`synthetic:${contractHash}`).digest('hex') };
}

function rejectTransport() {
  unexpectedCalls++;
  throw new Error('Unexpected second or unauthorized provider call');
}

function assertUncertain(res) {
  assert.equal(res.status, 503);
  assert.equal(res.body.code, 'BILLING_CANCELLATION_OUTCOME_UNCERTAIN');
  assert.equal(res.body.canceled, undefined);
  assert.equal(res.body.currentPeriodEnd, undefined);
}

function intercept(run) {
  return {
    query: (...args) => db.query(...args),
    connect: async () => {
      const client = await db.connect();
      const context = {};
      return { ...client, query: (sql, bindings) => run(sql, () => client.query(sql, bindings), context) };
    },
  };
}

try {
  const [[where]] = await native.query('SELECT DATABASE() AS name, @@datadir AS datadir');
  assert.equal(where.name, database);
  assert.equal(path.resolve(where.datadir), path.join(root, 'data'));
  const platformSql = fs.readFileSync('migrations/20260715_003_aiven_mysql_full_platform.sql', 'utf8');
  for (const table of ['crewcheck_platform_profiles', 'crewcheck_platform_subscriptions']) {
    await native.query(platformSql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}[\\s\\S]*?;`))[0]);
  }
  const migration = 'migrations/20261115_023_billing_cancellation_intents_mysql.sql';

  // The real dispatcher rejects other methods before DB access. The staged
  // replacement can also be called without passing through the dispatcher.
  const wrongMethod = response();
  assert.equal(await handlePlatformRoute({ method: 'GET', headers: {} }, wrongMethod, cancelUrl), true);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.Allow, 'POST');
  assert.equal((await request(1, { method: 'GET', transport: rejectTransport })).status, 405);
  await seed(1);
  for (const headers of [
    {}, { 'x-crewcheck-email': email(1) }, { cookie: 'crewcheck_auth_token=%invalid' },
    ...[{ aud: 'crewcheck-visitor', role: 'visitor' }, { exp: 1 }, { iss: 'wrong' }].map(claims => ({ authorization: `Bearer ${token(1, claims)}` })),
  ]) {
    assert.equal((await request(1, { headers, transport: rejectTransport, body: { email: email(1) } })).status, 401);
  }
  const oldSubject = Buffer.from(email(1)).toString('base64url').slice(0, 18);
  assert.equal((await request(1, { headers: { authorization: `Bearer ${token(1, { sub: oldSubject })}` }, transport: rejectTransport })).status, 403);
  assert.equal((await request(1, { pool: null, transport: rejectTransport })).body.code, 'DATABASE_OFFLINE');
  assert.equal((await request(1)).body.code, 'BILLING_CANCELLATION_UNAVAILABLE');
  assertUncertain(await request(1, { transport: rejectTransport })); // migration absent
  assert.deepEqual(await subscription(1), { canceled: 0, ref: ref(1) });
  for (const sql of fs.readFileSync(migration, 'utf8').split(';').filter(s => s.trim())) await native.query(sql);
  assert.equal(await journal(1), undefined);

  // Holds the provider response open while another request for the same
  // subscription reaches the endpoint. A forged body cannot target account 2.
  await seed(2);
  let sent = 0;
  const started = Promise.withResolvers();
  const complete = Promise.withResolvers();
  const first = request(1, {
    body: { email: email(2), providerRef: ref(2), operationId: 'forged' },
    transport: async target => {
      sent++;
      assert.equal(target, ref(1));
      started.resolve();
      return complete.promise;
    },
  });
  await Promise.race([started.promise, first.then(() => assert.fail('Transport did not start'))]);
  try {
    assertUncertain(await request(1, { transport: rejectTransport }));
    assert.deepEqual(await journal(1), { state: 'dispatching', receipts: 0 });
    assert.equal((await subscription(2)).canceled, 0);
  } finally {
    complete.resolve(ack(ref(1)));
    await first;
  }
  const recorded = await first;
  assert.equal(recorded.status, 200);
  assert.equal(recorded.body.canceled, true);
  assert.equal(recorded.body.currentPeriodEnd, period);
  assert.equal(sent, 1);
  assert.deepEqual(await journal(1), { state: 'applied', receipts: 1 });
  assert.equal((await request(1, { transport: rejectTransport })).body.alreadyRecorded, true);
  assert.equal(await journal(2), undefined);

  await seed(3, { provider: 'google_play' });
  const play = await request(3, { transport: rejectTransport });
  assert.equal(play.status, 200);
  assert.equal(play.body.actionRequired, true);
  assert.equal(play.body.canceled, undefined);
  assert.equal(new URL(play.body.manageUrl).searchParams.get('package'), 'com.crewcheck.app');

  for (const [n, result] of [
    [4, async () => { throw new Error('synthetic lost response'); }],
    [5, async () => ack(ref(2))],
    [6, async () => null],
  ]) {
    await seed(n);
    assertUncertain(await request(n, { transport: result }));
    assertUncertain(await request(n, { transport: rejectTransport }));
    assert.equal((await subscription(n)).canceled, 0);
    assert.deepEqual(await journal(n), { state: 'uncertain', receipts: 1 });
  }

  await seed(7);
  const rejectReceipt = intercept((sql, forward) => {
    if (sql.startsWith('INSERT INTO crewcheck_billing_cancellation_evidence')) throw new Error('synthetic lost receipt write');
    return forward();
  });
  assertUncertain(await request(7, { pool: rejectReceipt, transport: ack }));
  assertUncertain(await request(7, { transport: rejectTransport }));
  assert.deepEqual(await journal(7), { state: 'dispatching', receipts: 0 });
  assert.equal((await subscription(7)).canceled, 0);

  await seed(8);
  const failApply = intercept((sql, forward) => {
    if (sql.startsWith("UPDATE crewcheck_billing_cancellation_intents SET state='applied'")) throw new Error('synthetic local application failure');
    return forward();
  });
  assertUncertain(await request(8, { pool: failApply, transport: ack }));
  assert.deepEqual(await journal(8), { state: 'acknowledged', receipts: 1 });
  assert.equal((await subscription(8)).canceled, 0);
  assert.equal((await request(8, { transport: rejectTransport })).body.canceled, true);

  // Expiry before local commit rolls back. Expiry just after confirmed COMMIT
  // suppresses the old response while the committed result remains durable.
  for (const [n, afterCommit] of [[9, false], [10, true]]) {
    await seed(n);
    const expireOnApply = intercept(async (sql, forward, context) => {
      const result = await forward();
      if (sql.startsWith("UPDATE crewcheck_billing_cancellation_intents SET state='applied'")) {
        context.applying = true;
        if (!afterCommit) clock += 61_000;
      }
      if (afterCommit && sql === 'COMMIT' && context.applying) clock += 61_000;
      return result;
    });
    assertUncertain(await request(n, { pool: expireOnApply, transport: ack }));
    assert.equal((await subscription(n)).canceled, afterCommit ? 1 : 0);
    assert.deepEqual(await journal(n), { state: afterCommit ? 'applied' : 'acknowledged', receipts: 1 });
    const resumed = await request(n, { transport: rejectTransport });
    assert.equal(resumed.body.canceled, true);
    assert.equal(Boolean(resumed.body.alreadyRecorded), afterCommit);
  }

  await seed(11);
  let changed = false;
  const replaceBeforeReserve = intercept(async (sql, forward) => {
    const result = await forward();
    if (sql === 'COMMIT' && !changed) {
      changed = true;
      await native.execute('UPDATE crewcheck_platform_subscriptions SET provider_ref=? WHERE email=?', [ref(111), email(11)]);
    }
    return result;
  });
  assertUncertain(await request(11, { pool: replaceBeforeReserve, transport: rejectTransport }));
  assert.deepEqual(await subscription(11), { canceled: 0, ref: ref(111) });
  assert.equal(await journal(11), undefined);
  assert.equal(await journal(111), undefined);

  await seed(12);
  assertUncertain(await request(12, { transport: async providerRef => {
    await native.execute("UPDATE crewcheck_platform_subscriptions SET provider='google_play', provider_ref=? WHERE email=?", [ref(112), email(12)]);
    return ack(providerRef);
  } }));
  assert.equal((await subscription(12)).canceled, 0);
  assert.deepEqual(await journal(12), { state: 'reconciliation_required', receipts: 1 });
  assert.equal((await request(12, { transport: rejectTransport })).body.actionRequired, true);

  await seed(13, { status: 'pending', end: null, plan: 'premium_unlimited' });
  const unlimited = await request(13, { transport: ack });
  assert.equal(unlimited.body.canceled, true);
  assert.equal(unlimited.body.currentPeriodEnd, null);
  const [[profile]] = await native.execute('SELECT plan FROM crewcheck_platform_profiles WHERE email=?', [email(13)]);
  assert.equal(profile.plan, 'premium_unlimited');
  // A retry with read access must reconcile the occupied slot without another DELETE.
  await seed(14);
  let mutations = 0;
  let reads = 0;
  const timedOutAfterSend = async () => {
    mutations++;
    throw new Error('synthetic timeout after dispatch');
  };
  const readCanceled = async (address, options) => {
    reads++;
    assert.equal(address, '/subscriptions/' + ref(14));
    assert.deepEqual(options, { method: 'GET' });
    return { status: 200, body: { object: 'subscription', id: ref(14), status: 'INACTIVE', deleted: true } };
  };
  assertUncertain(await request(14, { transport: timedOutAfterSend, readAsaasSubscription: readCanceled }));
  assert.equal(reads, 0, 'do not query on the initial write attempt');
  assert.equal((await request(14, { transport: rejectTransport, readAsaasSubscription: readCanceled })).body.canceled, true);
  assert.deepEqual(await journal(14), { state: 'applied', receipts: 2 });
  assert.equal((await request(14, { transport: rejectTransport, readAsaasSubscription: readCanceled })).body.alreadyRecorded, true);
  assert.equal(mutations, 1);
  assert.equal(reads, 1);

  await seed(15);
  assertUncertain(await request(15, { transport: timedOutAfterSend }));
  for (const result of [
    { status: 404, body: null },
    { status: 403, body: null },
    { status: 200, body: { object: 'subscription', id: ref(16), status: 'INACTIVE', deleted: true } },
    { status: 200, body: { object: 'subscription', id: ref(15), status: 'INACTIVE', deleted: false } },
    { status: 200, body: { object: 'subscription', id: ref(15), status: 'ACTIVE', deleted: true } },
    { status: 200, body: { object: 'subscription', id: ref(15), status: 'INACTIVE' } },
  ]) {
    assertUncertain(await request(15, {
      transport: rejectTransport,
      readAsaasSubscription: async () => result,
    }));
    assert.deepEqual(await journal(15), { state: 'uncertain', receipts: 1 });
    assert.equal((await subscription(15)).canceled, 0);
  }
  assert.equal(mutations, 2);

  await seed(16);
  assertUncertain(await request(16, { pool: rejectReceipt, transport: ack }));
  assert.deepEqual(await journal(16), { state: 'dispatching', receipts: 0 });
  assert.equal((await request(16, {
    transport: rejectTransport,
    readAsaasSubscription: async () => ({ status: 200, body: { object: 'subscription', id: ref(16), status: 'EXPIRED', deleted: true } }),
  })).body.canceled, true);
  assert.deepEqual(await journal(16), { state: 'applied', receipts: 1 });

  // An expiring session can leave immutable evidence, but it cannot apply
  // changes or receive a success receipt. A current session uses that receipt.
  await seed(17);
  assertUncertain(await request(17, { transport: timedOutAfterSend }));
  assertUncertain(await request(17, {
    transport: rejectTransport,
    readAsaasSubscription: async () => {
      clock += 61_000;
      return { status: 200, body: { object: 'subscription', id: ref(17), status: 'INACTIVE', deleted: true } };
    },
  }));
  assert.deepEqual(await journal(17), { state: 'acknowledged', receipts: 2 });
  assert.equal((await subscription(17)).canceled, 0);
  assert.equal((await request(17, { transport: rejectTransport, readAsaasSubscription: rejectTransport })).body.canceled, true);
  assert.deepEqual(await journal(17), { state: 'applied', receipts: 2 });
  // Two concurrent confirmations for the same operation must persist one proof.
  await seed(18);
  assertUncertain(await request(18, { transport: timedOutAfterSend }));
  const ready = Promise.withResolvers();
  let parallelReads = 0;
  const concurrentRead = async () => {
    if (++parallelReads === 2) ready.resolve();
    await ready.promise;
    return { status: 200, body: { object: 'subscription', id: ref(18), status: 'INACTIVE', deleted: true } };
  };
  const race = [
    request(18, { transport: rejectTransport, readAsaasSubscription: concurrentRead }),
    request(18, { transport: rejectTransport, readAsaasSubscription: concurrentRead }),
  ];
  await Promise.race([ready.promise, ...race.map(pending => pending.then(() => assert.fail('Request ended before both concurrent reads')))]);
  const recoveredTogether = await Promise.all(race);
  assert(recoveredTogether.every(res => res.status === 200 && res.body.canceled === true));
  assert.deepEqual(await journal(18), { state: 'applied', receipts: 2 });

  await seed(19);
  assertUncertain(await request(19, { transport: timedOutAfterSend }));
  const changedDuringRead = await request(19, {
    transport: rejectTransport,
    readAsaasSubscription: async () => {
      await native.execute("UPDATE crewcheck_platform_subscriptions SET provider='google_play',provider_ref=? WHERE email=?", [ref(119),email(19)]);
      return { status: 200, body: { object: 'subscription', id: ref(19), status: 'INACTIVE', deleted: true } };
    },
  });
  assertUncertain(changedDuringRead);
  assert.deepEqual(await subscription(19), { canceled: 0, ref: ref(119) });
  assert.deepEqual(await journal(19), { state: 'reconciliation_required', receipts: 2 });
  console.log('PASS HTTP retry reconciles positive same-contract evidence, including lost receipt and session expiry, without resending; ambiguous evidence stays pending');
  assert.equal(unexpectedCalls, 0);
  console.log('PASS staged cancellation HTTP handler with signed JWT, isolated MySQL, and mock transport: method/auth, concurrent retry, evidence and rollback, pre/post-COMMIT expiry, contract replacement, Play and Unlimited');
} finally {
  Date.now = realNow;
  await native.end();
}
