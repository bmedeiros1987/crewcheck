import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import mysql from 'mysql2/promise';
import ts from 'typescript';
import { mysqlAdapter } from '../server/mysql-platform-adapter.mjs';
import { hotelReadiness, runHotelTransaction, reconcileHotelRoster } from '../server/hotel-stay-repository.mjs';

// Only the existing disposable CI container's Unix socket. Never DATABASE_URL,
// TCP, a real credential, a browser account or an external provider.
globalThis.fetch = () => { throw new Error('External network forbidden in hotel SQL QA'); };
const socketPath = '/tmp/crewcheck-notification-qa-socket/mysqld.sock';
assert.equal(process.platform, 'linux', 'Only the existing Linux CI fixture is supported');
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.CREWCHECK_NOTIFICATION_QA, 'isolated-mysql');
assert.equal(process.env.CREWCHECK_HOTEL_QA, 'isolated-mysql');
assert.equal(process.env.CREWCHECK_QA_MYSQL_SOCKET, socketPath);
assert.equal(Boolean(process.env.DATABASE_URL), false, 'Production connection strings are forbidden');
assert(fs.statSync(socketPath).isSocket());
assert.equal(fs.realpathSync(socketPath), socketPath);

const schema = `crewcheck_hotel_qa_${process.pid}`;
assert(/^crewcheck_hotel_qa_[0-9]+$/.test(schema));
const admin = await mysql.createConnection({ socketPath, user: 'root', password: '', database: 'crewcheck_notification_qa' });
let pool, created = false;
const borrowed = new Set(), releases = [], results = [];
const owner = 'hotel-owner-a@example.test', otherOwner = 'hotel-owner-b@example.test', key = '2030-01';
const keyFor = value => value.toLowerCase().replaceAll(' ', '-');
const options = { hotelKey: keyFor };
const association = { action: 'associate', id: 'hotel-a', owner, rosterKey: key, expectedVersion: '0', confirmation: 'associate-this-existing-stay',
  occurrenceRef: 'fictional-official-occurrence-a', source: 'fictional-verified-source', contextRef: 'fictional-program-a', contextSignature: 'fictional-signature-a', at: '2030-01-01T00:00:00Z' };
const patch = (expectedVersion, hotelName = 'Manual hotel', extra = {}) => ({ action: 'patch', owner, id: 'hotel-a', rosterKey: key,
  bindingId: 'hotel-a', expectedVersion, hotelName, contextRef: association.contextRef, contextSignature: association.contextSignature, at: '2030-01-01T01:00:00Z', ...extra });
const observation = { occurrenceRef: association.occurrenceRef, source: association.source, hotelName: 'New source hotel', revision: 'source-v1', expectedSourceRevision: null };
const sync = () => ({ action: 'sync', owner, rosterKey: key, observations: [observation] });
const launched = promise => { promise.catch(() => {}); return promise; };
function barrier() {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  releases.push(release); return { entered, enter, wait, release };
}
function driver(name, { ownerGate = null, lockTimeout = 5 } = {}) {
  const state = { name, thread: null, ownerAttempts: 0, hotelUpdates: 0 };
  const native = {
    query: (sql, values) => pool.query(sql, values),
    async getConnection() {
      const connection = await pool.getConnection(); borrowed.add(connection); state.thread = connection.threadId;
      await connection.query('SET SESSION innodb_lock_wait_timeout=?', [lockTimeout]);
      return {
        async query(sql, values) {
          const isOwner = sql.includes('SELECT email FROM crewcheck_platform_profiles') && sql.includes('FOR UPDATE');
          if (isOwner) state.ownerAttempts++;
          if (sql.trim().startsWith('UPDATE crewcheck_platform_stays')) state.hotelUpdates++;
          const result = await connection.query(sql, values);
          if (isOwner && ownerGate) { ownerGate.enter(); await ownerGate.wait; }
          return result;
        },
        release() { borrowed.delete(connection); connection.release(); },
        destroy() { borrowed.delete(connection); connection.destroy(); },
      };
    },
  };
  return { db: mysqlAdapter(native), state };
}
async function bounded(promise, label, milliseconds = 7000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('QA timeout: ' + label)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function waitForProfileWait(state) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (state.thread) {
      const [rows] = await admin.query(`SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits w
        JOIN performance_schema.threads t ON t.THREAD_ID=w.REQUESTING_THREAD_ID
        JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID=w.REQUESTING_ENGINE_LOCK_ID AND l.ENGINE=w.ENGINE
        WHERE t.PROCESSLIST_ID=? AND l.OBJECT_SCHEMA=? AND l.OBJECT_NAME='crewcheck_platform_profiles'`, [state.thread, schema]);
      if (Number(rows[0].n) > 0) return;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Expected real InnoDB profile lock wait: ' + state.name);
}
const rows = async () => (await pool.query('SELECT *,CAST(row_version AS CHAR) AS row_version FROM crewcheck_platform_stays ORDER BY id'))[0];
const rowA = async () => (await rows()).find(row => row.id === 'hotel-a');
// SQL-only deletion fixture, not an invocation or certification of the account/auth route.
async function deleteFixtureOwner(db) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT email FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE',[owner]);
    await client.query('DELETE FROM crewcheck_platform_stays WHERE owner_email=$1',[owner]);
    await client.query('DELETE FROM crewcheck_platform_rosters WHERE owner_email=$1',[owner]);
    await client.query('DELETE FROM crewcheck_platform_profiles WHERE email=$1',[owner]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function seed() {
  await pool.query('DELETE FROM crewcheck_platform_stays');
  await pool.query('DELETE FROM crewcheck_platform_rosters');
  await pool.query('DELETE FROM crewcheck_platform_profiles');
  for (const [who, id] of [[owner, 'hotel-a'], [otherOwner, 'hotel-b']]) {
    await pool.query('INSERT INTO crewcheck_platform_profiles(email) VALUES(?)', [who]);
    await pool.query('INSERT INTO crewcheck_platform_rosters(id,owner_email,roster_key,active) VALUES(?,?,?,TRUE)', ['roster-' + id, who, key]);
    await pool.query(`INSERT INTO crewcheck_platform_stays(id,owner_email,roster_key,stay_date,hotel_key,hotel_name,airport,room_cipher,presentation_time,lead_minutes,share_same_hotel,share_with_visitors)
      VALUES(?,?,?,'2030-01-01','source-hotel','Source hotel','AAA','fictional-ciphertext','07:00',90,TRUE,TRUE)`, [id, who, key]);
  }
  await runHotelTransaction(driver('seed-association').db, association, options);
}
function preserved(before, after) {
  for (const name of ['id','room_cipher','presentation_time','lead_minutes','share_same_hotel','share_with_visitors']) assert.equal(after[name], before[name], name);
}
async function run(name, body) { await body(); results.push({ name, passed: true }); console.log('PASS InnoDB:', name); }
try {
  assert.equal((await admin.query('SELECT DATABASE() AS name'))[0][0].name, 'crewcheck_notification_qa');
  // CREATE fails if the schema already exists; never adopt or drop somebody else's fixture.
  await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); created = true;
  pool = mysql.createPool({ socketPath, user: 'root', password: '', database: schema, connectionLimit: 10,
    supportBigNumbers: true, bigNumberStrings: true, dateStrings: true });
  assert.equal((await pool.query('SELECT DATABASE() AS name'))[0][0].name, schema);
  const [server] = await pool.query('SELECT VERSION() AS version,@@transaction_isolation AS isolation_level,@@innodb_deadlock_detect AS deadlock_detection');
  assert.equal(Number(server[0].deadlock_detection), 1);
  await pool.query('CREATE TABLE crewcheck_platform_profiles(email VARCHAR(254) NOT NULL PRIMARY KEY) ENGINE=InnoDB');
  await pool.query(`CREATE TABLE crewcheck_platform_rosters(id VARCHAR(64) PRIMARY KEY,owner_email VARCHAR(254) NOT NULL,roster_key VARCHAR(20) NOT NULL,
    roster JSON,compliance JSON,gym JSON,source_name VARCHAR(180),fingerprint VARCHAR(100),active BOOLEAN,updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY owner_period(owner_email,roster_key)) ENGINE=InnoDB`);
  const legacy = fs.readFileSync('migrations/20260715_003_aiven_mysql_full_platform.sql', 'utf8');
  const match = legacy.match(/CREATE TABLE IF NOT EXISTS crewcheck_platform_stays\s*\([\s\S]*?ENGINE=InnoDB[^;]*;/i);
  assert(match, 'Actual legacy stays DDL must be present'); await pool.query(match[0]);
  assert.equal(await hotelReadiness(driver('missing-schema').db), false);
  await assert.rejects(runHotelTransaction(driver('closed-write').db, association, options), { code: 'HOTEL_SCHEMA_NOT_READY' });
  const ddl = fs.readFileSync('migrations/20261019_001_hotel_binding_candidate.sql', 'utf8').replace(/^--.*$/gm, '').trim();
  assert.equal(ddl.split(';').filter(part => part.trim()).length, 1); assert.match(ddl, /^ALTER TABLE crewcheck_platform_stays/);
  assert.doesNotMatch(ddl, /\b(DROP|DELETE|INSERT|UPDATE)\b/i);
  // This applies only to the newly created disposable fixture schema above.
  await pool.query(ddl); assert.equal(await hotelReadiness(driver('ready-schema').db), true);
  results.push({ name: 'schema missing fails closed; exact candidate DDL on disposable fixture becomes ready', passed: true });

  await run('two devices same CAS version: one commit and one conflict with observed profile wait', async () => {
    await seed(); const gate = barrier(), a = driver('device-a', { ownerGate: gate }), b = driver('device-b');
    const first = launched(runHotelTransaction(a.db, patch('1','Device A'), options)); await bounded(gate.entered, 'A profile');
    const second = launched(runHotelTransaction(b.db, patch('1','Device B'), options));
    try { await waitForProfileWait(b.state); } finally { gate.release(); }
    const settled = await bounded(Promise.allSettled([first, second]), 'CAS racers');
    assert.equal(settled[0].status, 'fulfilled'); assert.equal(settled[1].reason.code, 'HOTEL_VERSION_CONFLICT');
    assert.equal((await rowA()).row_version, '2'); assert.equal((await rowA()).hotel_name, 'Device A');
    assert.equal(b.state.ownerAttempts, 1); assert.equal(b.state.hotelUpdates, 0);
  });
  await run('PATCH then sync preserves override, identity and private fields under real locks', async () => {
    await seed(); const before = await rowA(), gate = barrier(), a = driver('patch-first', { ownerGate: gate }), b = driver('sync-second');
    const first = launched(runHotelTransaction(a.db, patch('1'), options)); await bounded(gate.entered, 'patch gate');
    const second = launched(runHotelTransaction(b.db, sync(), options));
    try { await waitForProfileWait(b.state); } finally { gate.release(); }
    await bounded(Promise.all([first, second]), 'patch/sync');
    const after = await rowA(); preserved(before, after); assert.equal(after.hotel_name, 'Manual hotel'); assert.equal(after.row_version, '3');
    assert.equal(JSON.parse(typeof after.hotel_source_snapshot === 'string' ? after.hotel_source_snapshot : JSON.stringify(after.hotel_source_snapshot)).hotelName, observation.hotelName);
  });
  await run('sync then PATCH rejects stale draft after the source snapshot advances', async () => {
    await seed(); const gate = barrier(), a = driver('sync-first', { ownerGate: gate }), b = driver('patch-second');
    const first = launched(runHotelTransaction(a.db, sync(), options)); await bounded(gate.entered, 'sync gate');
    const second = launched(runHotelTransaction(b.db, patch('1'), options));
    try { await waitForProfileWait(b.state); } finally { gate.release(); }
    await first; await assert.rejects(second, { code: 'HOTEL_VERSION_CONFLICT' }); assert.equal((await rowA()).row_version, '2');
  });
  await run('two syncs of one source version update once; repeated sync is a no-op', async () => {
    await seed(); const gate = barrier(), a = driver('sync-a', { ownerGate: gate }), b = driver('sync-b');
    const first = launched(runHotelTransaction(a.db, sync(), options)); await bounded(gate.entered, 'sync A');
    const second = launched(runHotelTransaction(b.db, sync(), options));
    try { await waitForProfileWait(b.state); } finally { gate.release(); }
    await bounded(Promise.all([first, second]), 'sync racers'); assert.equal((await rowA()).row_version, '2'); assert.equal(b.state.hotelUpdates, 0);
  });
  await run('another owner progresses while A owns the profile lock', async () => {
    await seed(); await runHotelTransaction(driver('bind-b').db, { ...association, id: 'hotel-b', owner: otherOwner }, options);
    const gate = barrier(), a = driver('held-A', { ownerGate: gate });
    const first = launched(runHotelTransaction(a.db, patch('1'), options)); await bounded(gate.entered, 'held owner A');
    try { await bounded(runHotelTransaction(driver('independent-B').db, patch('1','Owner B', { id:'hotel-b',bindingId:'hotel-b',owner:otherOwner }), options), 'independent owner B', 3000); }
    finally { gate.release(); } await first;
    assert.equal((await rows()).find(row => row.id === 'hotel-b').hotel_name, 'Owner B');
  });
  await run('lost reply retry conflicts without duplicate; explicit reread retry succeeds', async () => {
    await seed(); await runHotelTransaction(driver('lost-reply').db, patch('1'), options);
    await assert.rejects(runHotelTransaction(driver('retry-old').db, patch('1'), options), { code: 'HOTEL_VERSION_CONFLICT' });
    const current = await rowA(); await runHotelTransaction(driver('retry-reviewed').db, patch(current.row_version,'Reviewed retry'), options);
    assert.equal((await rows()).length, 2); assert.equal((await rowA()).row_version, '3');
  });
  await run('lock timeout rolls back with one attempt; caller may reread explicitly', async () => {
    await seed(); const gate = barrier(), a = driver('timeout-holder', { ownerGate: gate }), b = driver('timeout-waiter', { lockTimeout: 1 });
    const first = launched(runHotelTransaction(a.db, patch('1'), options)); await bounded(gate.entered, 'timeout owner');
    const second = launched(runHotelTransaction(b.db, patch('1','Timed out hotel'), options));
    try { await waitForProfileWait(b.state); await assert.rejects(second, { code: 'ER_LOCK_WAIT_TIMEOUT' }); }
    finally { gate.release(); } await first;
    assert.equal(b.state.ownerAttempts, 1); assert.equal(b.state.hotelUpdates, 0); assert.equal((await rowA()).hotel_name, 'Manual hotel');
  });
  await run('actual deadlock is surfaced and rolled back; no blind retry', async () => {
    await seed(); const gate = barrier(), a = driver('deadlock-candidate', { ownerGate: gate });
    const candidate = launched(runHotelTransaction(a.db, patch('1','Deadlock candidate'), options)); await bounded(gate.entered, 'deadlock owner');
    const opposite = await pool.getConnection(); borrowed.add(opposite);
    try {
      await opposite.query('SET SESSION innodb_lock_wait_timeout=5'); await opposite.query('BEGIN');
      await opposite.query('SELECT id FROM crewcheck_platform_rosters WHERE owner_email=? AND roster_key=? FOR UPDATE', [owner,key]);
      // Deliberately reversed SQL lock order is fault injection, never application behavior.
      const reversed = launched(opposite.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [owner]));
      await waitForProfileWait({ name:'reverse-order injector',thread:opposite.threadId }); gate.release();
      const outcomes = await bounded(Promise.allSettled([candidate,reversed]), 'deadlock resolution');
      assert.equal(outcomes.filter(value => value.status === 'rejected' && value.reason.code === 'ER_LOCK_DEADLOCK').length, 1);
      assert.equal(a.state.ownerAttempts, 1); await opposite.query('ROLLBACK');
    } finally { gate.release(); await opposite.query('ROLLBACK').catch(() => {}); borrowed.delete(opposite); opposite.release(); }
    const current = await rowA(); assert(['1','2'].includes(current.row_version));
    await runHotelTransaction(driver('after-deadlock-reviewed').db, patch(current.row_version,'After reread'), options);
    assert.equal((await rowA()).hotel_name,'After reread');
  });
  await run('legacy unique collision rolls back without merging rows or losing private fields', async () => {
    await seed(); const before = await rowA();
    await pool.query(`INSERT INTO crewcheck_platform_stays(id,owner_email,roster_key,stay_date,hotel_key,hotel_name,airport)
      VALUES('collision',?,?,'2030-01-01','occupied-hotel','Occupied hotel','AAA')`, [owner,key]);
    await assert.rejects(runHotelTransaction(driver('constraint').db, patch('1','Occupied hotel'), options), { code:'ER_DUP_ENTRY' });
    const after = await rowA(); preserved(before,after); assert.equal(after.row_version,'1'); assert.equal(after.hotel_name,before.hotel_name); assert.equal((await rows()).length,3);
  });
  await run('PATCH before SQL fixture deletion cannot resurrect a removed hotel', async () => {
    await seed(); const gate = barrier(), a = driver('patch-before-deletion',{ownerGate:gate}), b = driver('delete-second');
    const first = launched(runHotelTransaction(a.db,patch('1'),options)); await bounded(gate.entered,'patch before deletion');
    const second = launched(deleteFixtureOwner(b.db));
    try { await waitForProfileWait(b.state); } finally { gate.release(); }
    await bounded(Promise.all([first,second]),'patch/deletion');
    assert.equal(await rowA(),undefined); assert.equal((await rows()).length,1);
  });
  await run('SQL fixture deletion before PATCH rejects owner removal without recreation', async () => {
    await seed(); const gate = barrier(), a = driver('delete-first',{ownerGate:gate}), b = driver('patch-after-deletion');
    const first = launched(deleteFixtureOwner(a.db)); await bounded(gate.entered,'deletion before patch');
    const second = launched(runHotelTransaction(b.db,patch('1'),options));
    try { await waitForProfileWait(b.state); } finally { gate.release(); }
    await first; await assert.rejects(second,/HOTEL_OWNER_UNAVAILABLE/);
    assert.equal(await rowA(),undefined); assert.equal(b.state.hotelUpdates,0); assert.equal(b.state.ownerAttempts,1);
  });
  await run('monotonic BIGINT and ABA protect stale versions above Number.MAX_SAFE_INTEGER', async () => {
    await seed(); await pool.query("UPDATE crewcheck_platform_stays SET row_version='9007199254740992' WHERE id='hotel-a'");
    for (const name of ['A','B','A']) { const current = await rowA(); await runHotelTransaction(driver('bigint').db,patch(current.row_version,name),options); }
    assert.equal((await rowA()).row_version,'9007199254740995');
    await assert.rejects(runHotelTransaction(driver('ABA-stale').db,patch('9007199254740992'),options),{code:'HOTEL_VERSION_CONFLICT'});
  });
  await run('legacy NULL is not manual; explicit association changes the same row', async () => {
    await seed(); await pool.query("UPDATE crewcheck_platform_stays SET roster_key=NULL,binding_id=NULL,binding_evidence=NULL,row_version=0,manual_hotel_override=NULL,hotel_source_snapshot=NULL WHERE id='hotel-a'");
    const before = await rowA(); assert.equal(before.manual_hotel_override,null);
    await runHotelTransaction(driver('explicit-NULL-association').db,association,options);
    const after = await rowA(); preserved(before,after); assert.equal(after.roster_key,key); assert.equal(after.manual_hotel_override,null);
  });
  await run('actual roster transaction preserves payloads and leaves unreferenced hotel observations pending', async () => {
    await seed(); await runHotelTransaction(driver('manual-before-import').db,patch('1'),options); const before = await rowA();
    const source = fs.readFileSync('server/platform.mjs','utf8'), ast = ts.createSourceFile('platform.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'saveRosterMysql'); assert(declaration);
    const save = vm.runInNewContext(declaration.getText(ast)+'\nsaveRosterMysql',{reconcileHotelRoster,hotelKey:keyFor});
    const roster = {year:2030,month:1,days:[{date:'2030-01-01',hotel:'Unlinked source hotel'}]},compliance={fixture:true},gym=[{fixture:true}];
    const result = await save({db:driver('actual-roster-writer').db,identity:{email:owner}}, {id:'new-roster-id',key,roster,compliance,gym,sourceName:'fictional.pdf',fingerprint:'fictional-fingerprint',stays:[{stayDate:'2030-01-01',hotelName:'Unlinked source hotel'}]});
    assert.equal(result.hotelReconciliation.status,'review-required'); assert.equal((await rowA()).hotel_name,'Manual hotel'); preserved(before,await rowA());
    assert.deepEqual(result.full.roster,roster); assert.deepEqual(result.full.compliance,compliance); assert.deepEqual(result.full.gym,gym);
  });
  await run('real metadata incompatibilities close writes without schema fallback', async () => {
    await seed(); await pool.query('ALTER TABLE crewcheck_platform_stays MODIFY row_version BIGINT NOT NULL DEFAULT 0');
    assert.equal(await hotelReadiness(driver('signed-version').db),false);
    await assert.rejects(runHotelTransaction(driver('closed-signed').db,patch('1'),options),{code:'HOTEL_SCHEMA_NOT_READY'});
    await pool.query('ALTER TABLE crewcheck_platform_stays MODIFY row_version BIGINT UNSIGNED NOT NULL DEFAULT 0');
    await pool.query('ALTER TABLE crewcheck_platform_stays DROP INDEX uq_stays_owner_binding,ADD UNIQUE KEY uq_stays_owner_binding(owner_email(40),binding_id(16))');
    assert.equal(await hotelReadiness(driver('prefix-index').db),false);
    await pool.query('ALTER TABLE crewcheck_platform_stays DROP INDEX uq_stays_owner_binding,ADD UNIQUE KEY uq_stays_owner_binding(owner_email,binding_id)');
    assert.equal(await hotelReadiness(driver('schema-restored').db),true);
    // Same JSON type/default/nullability; only generated-column metadata differs.
    await pool.query('ALTER TABLE crewcheck_platform_stays DROP COLUMN binding_evidence,ADD COLUMN binding_evidence JSON AS (JSON_OBJECT()) VIRTUAL');
    assert.equal(await hotelReadiness(driver('generated-JSON').db),false);
    await assert.rejects(runHotelTransaction(driver('closed-generated').db,patch('1'),options),{code:'HOTEL_SCHEMA_NOT_READY'});
  });

  console.log(JSON.stringify({scope:'existing disposable CI Unix socket only',productionWrites:false,migrationAppliedOnlyToNewFixture:true,
    mysql:server[0].version,isolation:server[0].isolation_level,passed:results.length,results}));
} finally {
  for (const release of releases) release();
  for (const connection of borrowed) connection.destroy();
  if (pool) await pool.end();
  if (created) await admin.query(`DROP DATABASE ${schema}`);
  await admin.end();
}
