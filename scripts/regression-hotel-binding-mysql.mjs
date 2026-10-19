import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
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
let pool, created = false, restoreCreated = false;
const restoreSchema = schema + '_restore';
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
  const state = { name, thread: null, ownerAttempts: 0, hotelUpdates: 0, transactions: [] };
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
          if (['BEGIN','COMMIT','ROLLBACK'].includes(sql.trim())) state.transactions.push(sql.trim());
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
    roster JSON,compliance JSON,gym JSON,source_name VARCHAR(180),fingerprint VARCHAR(100),active BOOLEAN,created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY owner_period(owner_email,roster_key)) ENGINE=InnoDB`);
  const legacy = fs.readFileSync('migrations/20260715_003_aiven_mysql_full_platform.sql', 'utf8');
  const match = legacy.match(/CREATE TABLE IF NOT EXISTS crewcheck_platform_stays\s*\([\s\S]*?ENGINE=InnoDB[^;]*;/i);
  assert(match, 'Actual legacy stays DDL must be present'); await pool.query(match[0]);
  // Existing legacy data must precede the exact additive migration.
  for (const [who,id,roster] of [[owner,'legacy-linked',key],[owner,'legacy-unknown',null],[otherOwner,'legacy-other',key]]) {
    await pool.query('INSERT IGNORE INTO crewcheck_platform_profiles(email) VALUES(?)',[who]);
    await pool.query(`INSERT INTO crewcheck_platform_stays(id,owner_email,roster_key,stay_date,hotel_key,hotel_name,airport,room_cipher,presentation_time,lead_minutes,share_same_hotel,share_with_visitors)
      VALUES(?,?,?,'2030-01-02',?,'Legacy fictional hotel','AAA','legacy-fictional-ciphertext','06:30',75,TRUE,TRUE)`,[id,who,roster,id]);
  }
  const legacyBefore = (await pool.query('SELECT * FROM crewcheck_platform_stays ORDER BY id'))[0];
  assert.equal(await hotelReadiness(driver('missing-schema').db), false);
  await assert.rejects(runHotelTransaction(driver('closed-write').db, association, options), { code: 'HOTEL_SCHEMA_NOT_READY' });
  const ddl = fs.readFileSync('migrations/20261019_001_hotel_binding_candidate.sql', 'utf8').replace(/^--.*$/gm, '').trim();
  assert.equal(ddl.split(';').filter(part => part.trim()).length, 1); assert.match(ddl, /^ALTER TABLE crewcheck_platform_stays/);
  assert.doesNotMatch(ddl, /\b(DROP|DELETE|INSERT|UPDATE)\b/i);
  // This applies only to the newly created disposable fixture schema above.
  await pool.query(ddl); assert.equal(await hotelReadiness(driver('ready-schema').db), true);
  const migratedLegacy = (await pool.query('SELECT *,CAST(row_version AS CHAR) AS row_version FROM crewcheck_platform_stays ORDER BY id'))[0];
  assert.equal(migratedLegacy.length,legacyBefore.length);
  const added = ['binding_id','binding_evidence','manual_hotel_override','hotel_source_snapshot','row_version'];
  for (const row of migratedLegacy) {
    for (const name of added.slice(0,-1)) assert.equal(row[name],null,name);
    assert.equal(row.row_version,'0');
  }
  assert.deepEqual(migratedLegacy.map(row=>Object.fromEntries(Object.entries(row).filter(([name])=>!added.includes(name)))),legacyBefore);
  results.push({ name: 'existing linked, NULL-roster and other-owner legacy rows preserved by exact additive DDL; missing schema fails closed', passed: true });

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
  await run('actual deadlock deterministically selects repository victim, rolls back once and releases transaction locks', async () => {
    await seed(); const before = await rowA(), gate = barrier(), a = driver('deadlock-repository-victim', { ownerGate: gate });
    // Make the reversed-order injector substantially heavier than the read-only
    // repository transaction: InnoDB chooses the smaller transaction as victim.
    await pool.query('CREATE TABLE IF NOT EXISTS hotel_qa_deadlock_weight(id INT PRIMARY KEY,n INT NOT NULL) ENGINE=InnoDB');
    await pool.query('DELETE FROM hotel_qa_deadlock_weight');
    await pool.query('INSERT INTO hotel_qa_deadlock_weight(id,n) VALUES '+Array.from({length:128},(_,i)=>`(${i},0)`).join(','));
    const candidate = launched(runHotelTransaction(a.db, patch('1','Deadlock candidate'), options)); await bounded(gate.entered, 'deadlock owner');
    const opposite = await pool.getConnection(); borrowed.add(opposite);
    try {
      await opposite.query('SET SESSION innodb_lock_wait_timeout=5'); await opposite.query('BEGIN');
      await opposite.query('UPDATE hotel_qa_deadlock_weight SET n=n+1');
      await opposite.query('SELECT id FROM crewcheck_platform_rosters WHERE owner_email=? AND roster_key=? FOR UPDATE', [owner,key]);
      // Deliberately reversed SQL lock order is fixture fault injection only.
      const reversed = launched(opposite.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [owner]));
      await waitForProfileWait({ name:'weighted reverse-order injector',thread:opposite.threadId }); gate.release();
      const outcomes = await bounded(Promise.allSettled([candidate,reversed]), 'repository victim deadlock');
      assert.equal(outcomes[0].status,'rejected'); assert.equal(outcomes[0].reason.code,'ER_LOCK_DEADLOCK');
      assert.equal(outcomes[1].status,'fulfilled','injector must survive; otherwise this counterproof fails');
      assert.deepEqual(a.state.transactions,['BEGIN','ROLLBACK']);
      assert.equal(a.state.ownerAttempts,1); assert.equal(a.state.hotelUpdates,0);
      console.log('Deadlock victim verified:',JSON.stringify({victim:'repository',code:outcomes[0].reason.code,attempts:a.state.ownerAttempts,rollbackObserved:true}));
      await opposite.query('ROLLBACK');
    } finally { gate.release(); await opposite.query('ROLLBACK').catch(() => {}); borrowed.delete(opposite); opposite.release(); }
    assert.deepEqual(await rowA(),before,'failed repository transaction preserves every hotel field');
    assert.equal(Number((await pool.query('SELECT SUM(n) AS n FROM hotel_qa_deadlock_weight'))[0][0].n),0);
    // Independent connection must acquire every repository lock after rollback.
    const clean = await pool.getConnection();
    try {
      await clean.query('SET SESSION innodb_lock_wait_timeout=1'); await clean.query('BEGIN');
      await bounded(clean.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE NOWAIT',[owner]),'clean profile after rollback');
      await clean.query('SELECT id FROM crewcheck_platform_rosters WHERE owner_email=? AND roster_key=? FOR UPDATE NOWAIT',[owner,key]);
      await clean.query('SELECT id FROM crewcheck_platform_stays WHERE owner_email=? ORDER BY id FOR UPDATE NOWAIT',[owner]);
      await clean.query('ROLLBACK');
    } finally { await clean.query('ROLLBACK').catch(()=>{}); clean.release(); }
    await runHotelTransaction(driver('after-deadlock-reviewed').db,patch(before.row_version,'After reread'),options);
    assert.equal((await rowA()).hotel_name,'After reread'); assert.equal((await rowA()).row_version,'2');
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
  await run('consistent synthetic logical backup restores exact schema, provenance and private fields in a fresh schema', async () => {
    await seed();
    await pool.query("UPDATE crewcheck_platform_stays SET row_version='9007199254740992' WHERE id='hotel-a'");
    await runHotelTransaction(driver('backup-manual').db,patch('9007199254740992','Backup manual hotel'),options);
    await runHotelTransaction(driver('backup-source').db,sync(),options);
    const tables = ['crewcheck_platform_profiles','crewcheck_platform_rosters','crewcheck_platform_stays'];
    const snapshot = [], reader = await pool.getConnection(); borrowed.add(reader);
    try {
      await reader.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await reader.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      for (const table of tables) {
        const [definition] = await reader.query('SHOW CREATE TABLE ' + table);
        const [columns] = await reader.query('SELECT COLUMN_NAME,DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[schema,table]);
        const projection = table === 'crewcheck_platform_stays' ? '*,CAST(row_version AS CHAR) AS row_version' : '*';
        const ordering = table === 'crewcheck_platform_profiles' ? 'email' : 'id';
        const [data] = await reader.query(`SELECT ${projection} FROM ${table} ORDER BY ${ordering}`);
        snapshot.push({table,ddl:definition[0]['Create Table'],columns,data});
      }
      // Concurrent committed write after the snapshot must not change the backup.
      await runHotelTransaction(driver('after-backup-snapshot').db,patch('9007199254740994','After backup snapshot'),options);
      const [stable] = await reader.query("SELECT hotel_name FROM crewcheck_platform_stays WHERE id='hotel-a'");
      assert.equal(stable[0].hotel_name,'Backup manual hotel');
      await reader.query('COMMIT');
    } catch (error) { await reader.query('ROLLBACK'); throw error; }
    finally { borrowed.delete(reader); reader.release(); }
    // In-memory logical fixture backup only: no real dump, secret or payload is published.
    const serialized = JSON.stringify(snapshot), digest = createHash('sha256').update(serialized).digest('hex');
    assert.equal(digest.length,64);
    assert(/^crewcheck_hotel_qa_[0-9]+_restore$/.test(restoreSchema));
    await admin.query(`CREATE DATABASE ${restoreSchema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); restoreCreated = true;
    const restored = await mysql.createConnection({socketPath,user:'root',password:'',database:restoreSchema,supportBigNumbers:true,bigNumberStrings:true,dateStrings:true});
    try {
      assert.equal((await restored.query('SELECT DATABASE() AS name'))[0][0].name,restoreSchema);
      const decoded = JSON.parse(serialized);
      for (const entry of decoded) {
        await restored.query(entry.ddl);
        const names = entry.columns.map(column => column.COLUMN_NAME);
        for (const row of entry.data) {
          const values = entry.columns.map(column => column.DATA_TYPE === 'json' && row[column.COLUMN_NAME] !== null ? JSON.stringify(row[column.COLUMN_NAME]) : row[column.COLUMN_NAME]);
          await restored.query(`INSERT INTO ${entry.table} (${names.map(name => '`'+name+'`').join(',')}) VALUES (${names.map(() => '?').join(',')})`,values);
        }
        const projection = entry.table === 'crewcheck_platform_stays' ? '*,CAST(row_version AS CHAR) AS row_version' : '*';
        const ordering = entry.table === 'crewcheck_platform_profiles' ? 'email' : 'id';
        const [data] = await restored.query(`SELECT ${projection} FROM ${entry.table} ORDER BY ${ordering}`);
        assert.deepEqual(JSON.parse(JSON.stringify(data)),entry.data,entry.table + ' exact restored data');
        const [definition] = await restored.query('SHOW CREATE TABLE '+entry.table);
        assert.equal(definition[0]['Create Table'],entry.ddl,entry.table + ' exact restored DDL');
      }
      assert.equal(await hotelReadiness(mysqlAdapter({query:(sql,values)=>restored.query(sql,values)})),true);
      const saved = decoded.find(entry => entry.table === 'crewcheck_platform_stays').data.find(row => row.id === 'hotel-a');
      assert.equal(saved.row_version,'9007199254740994');
      assert(saved.binding_evidence); assert(saved.manual_hotel_override); assert(saved.hotel_source_snapshot);
      assert.equal((await rowA()).hotel_name,'After backup snapshot');
      console.log('Synthetic backup verified:',JSON.stringify({sha256:digest,tables:decoded.length,rows:decoded.reduce((n,entry)=>n+entry.data.length,0),restoredExactly:true,productionData:false}));
    } finally { await restored.end(); }
    await admin.query(`DROP DATABASE ${restoreSchema}`); restoreCreated = false;
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
  if (restoreCreated) await admin.query(`DROP DATABASE ${restoreSchema}`);
  if (created) await admin.query(`DROP DATABASE ${schema}`);
  await admin.end();
}
