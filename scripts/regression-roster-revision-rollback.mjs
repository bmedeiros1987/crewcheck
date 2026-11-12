// Proposal check (not runtime): fail-closed rollback on a disposable MySQL. Rollback never "turns a
// flag off" back to blind legacy writes:
//  - read_only: every write is refused (no receipt, the same id can be sent later); reads and replays
//    of already-decided operations keep working; revisions, receipts and pending submissions stay;
//  - fenced_legacy: the OLD runtime writer, through legacyRuntimeWriteGuard in its own transaction,
//    may only CREATE a month with no competence and no legacy row; it can never overwrite a live
//    competence, resurrect a tombstone or blindly upsert an existing (unmigrated) legacy row;
//    new-protocol writes keep their CAS;
//  - no fence row = read_only (fail-closed default);
//  - a mode switch concurrent with in-flight writes: no write commits after the switch completes;
//  - returning to normal resolves nothing automatically: divergences are reported in both directions,
//    comparing contents with the canonical versioned hash (never the legacy fingerprint), and a
//    month that cannot be compared is 'indeterminate', never conformant.
// Synthetic accounts/rosters only; no network. Mutants reintroducing each defect must fail.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import { mysqlAdapter } from '../server/mysql-platform-adapter.mjs';

// Only a disposable UNIX socket: no DATABASE_URL, TCP, provider or credentials.
const socketPath = String(process.env.CREWCHECK_QA_MYSQL_SOCKET || '');
assert.equal(process.env.CREWCHECK_ROSTER_SYNC_QA, 'isolated-mysql', 'disposable MySQL only');
assert.match(socketPath, /^\/tmp\/[\w.-]+\/mysqld\.sock$/);
assert(fs.statSync(socketPath).isSocket());
globalThis.fetch = () => { throw new Error('External network forbidden'); };
const native = mysql.createPool({ socketPath, user: 'root', password: '', database: 'crewcheck_roster_revision_qa', connectionLimit: 16, dateStrings: true });
const db = mysqlAdapter(native);
assert.equal((await db.query('SELECT DATABASE() AS name')).rows[0].name, 'crewcheck_roster_revision_qa');
const protocolFile = 'docs/proposals/roster-revision-sync/server-protocol.mjs';
const schema = fs.readFileSync('docs/proposals/roster-revision-sync/schema-draft.sql', 'utf8');
const legacyDdl = fs.readFileSync('migrations/20260715_003_aiven_mysql_full_platform.sql', 'utf8').match(/CREATE TABLE IF NOT EXISTS crewcheck_platform_rosters \([\s\S]*?\) ENGINE=InnoDB[^;]*;/)[0];
const TABLES = ['crewcheck_roster_write_fence', 'crewcheck_roster_backfill_quarantine', 'crewcheck_roster_legacy_submissions', 'crewcheck_roster_operation_receipts', 'crewcheck_roster_revisions', 'crewcheck_roster_competences', 'crewcheck_platform_rosters'];

const pad = value => String(value).padStart(2, '0');
function month(year, monthNumber, tag, crewId = 'BP00000001') {
  const length = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(), days = [];
  for (let day = 1; day <= length; day += 1) days.push({ date: `${pad(day)}/${pad(monthNumber)}/${year}`, type: day === 9 ? 'FLIGHT' : 'DO', legs: day === 9 ? [{ flightNumber: tag }] : [] });
  return { crewId, crewName: 'TRIPULANTE SINTETICO', year, month: monthNumber, days };
}
// Same roster, different bytes: other key order and PDF noise (rawText). Its legacy fingerprint
// (sha256 of the stored JSON text) differs; its canonical content hash does not.
function sameRosterOtherBytes(roster) {
  const reordered = Object.fromEntries(Object.keys(roster).reverse().map(key => [key, roster[key]]));
  return { rawText: 'RUIDO SINTETICO DO PDF', ...reordered, days: roster.days.map(day => ({ rawText: 'linha', ...Object.fromEntries(Object.keys(day).reverse().map(key => [key, day[key]])) })) };
}
const email = 'qa-rollback@example.test', crewKey = 'ID:BP00000001';
const binding = { resolveVerifiedCrewKey: async who => (who === email ? crewKey : null) };

async function suite(P) {
  const reset = async ({ fence = 'normal' } = {}) => {
    for (const table of TABLES) await db.query(`DROP TABLE IF EXISTS ${table}`);
    await db.query(legacyDdl);
    for (const statement of schema.split(/;\s*\n/).map(text => text.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) await db.query(statement);
    if (fence) await P.setWriteMode(db, fence);
  };
  const write = request => P.writeRosterRevision(db, { email, crewKey, parserVersion: 'qa', ...request }, binding);
  const current = key => P.readCurrentRoster(db, email, { crewKey, rosterKey: key });
  const counts = async () => Object.fromEntries(await Promise.all(['crewcheck_roster_revisions', 'crewcheck_roster_operation_receipts', 'crewcheck_roster_legacy_submissions'].map(async table => [table, Number((await db.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n)])));
  // A legacy row written by the old system before any migration (fixture, bypasses every guard).
  const legacyRow = async (key, roster) => db.query(`INSERT INTO crewcheck_platform_rosters(id,owner_email,roster_key,roster,compliance,gym,source_name,fingerprint,active) VALUES($1,$2,$3,$4,'{}','[]','legacy.pdf',$5,FALSE)`,
    [crypto.randomUUID(), email, key, typeof roster === 'string' ? roster : JSON.stringify(roster), crypto.createHash('sha256').update(typeof roster === 'string' ? roster : JSON.stringify(roster)).digest('hex')]);
  const legacyContent = async key => { const row = (await db.query('SELECT roster FROM crewcheck_platform_rosters WHERE owner_email=$1 AND roster_key=$2', [email, key])).rows[0]; return row ? (typeof row.roster === 'string' ? JSON.parse(row.roster) : row.roster) : null; };
  // The OLD runtime writer (fixture): legacy upsert guarded inside its own transaction.
  const legacyRuntimeUpsert = async (key, roster) => {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const guard = await P.legacyRuntimeWriteGuard(client, { email, rosterKey: key });
      if (!guard.allowed) { await client.query('ROLLBACK'); return guard; }
      await client.query(`INSERT INTO crewcheck_platform_rosters(id,owner_email,roster_key,roster,compliance,gym,source_name,fingerprint,active) VALUES($1,$2,$3,$4,'{}','[]','legacy.pdf',$5,TRUE)
        ON DUPLICATE KEY UPDATE roster=VALUES(roster),fingerprint=VALUES(fingerprint)`, [crypto.randomUUID(), email, key, JSON.stringify(roster), crypto.createHash('sha256').update(JSON.stringify(roster)).digest('hex')]);
      await client.query('COMMIT');
      return guard;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
  };

  // 0. Fail-closed default: without a fence row nothing is written.
  await reset({ fence: null });
  assert.equal((await write({ rosterKey: '2027-08', baseGeneration: 0, operationId: crypto.randomUUID(), roster: month(2027, 8, 'LA0800') })).code, 'WRITES_FENCED', 'no fence row means read_only');
  assert.equal((await P.legacyRuntimeWriteGuard(db, { email, rosterKey: '2027-08' })).allowed, false);

  // 1. read_only: every write refused, nothing recorded; reads and replays keep working; data kept.
  await reset();
  const applied = await write({ rosterKey: '2027-08', baseGeneration: 0, operationId: crypto.randomUUID(), roster: month(2027, 8, 'LA0801') });
  const appliedId = crypto.randomUUID();
  await write({ rosterKey: '2027-09', baseGeneration: 0, operationId: appliedId, roster: month(2027, 9, 'LA0901') });
  const pending = (await P.writeRosterRevision(db, { email, crewKey, rosterKey: '2027-08', roster: month(2027, 8, 'LA0802') }, binding)).pendingSubmissionId;
  assert.ok(pending);
  const before = await counts();
  await P.setWriteMode(db, 'read_only');
  const refusedId = crypto.randomUUID();
  const refused = await write({ rosterKey: '2027-08', baseGeneration: 1, operationId: refusedId, roster: month(2027, 8, 'LA0803') });
  assert.deepEqual([refused.status, refused.code], [503, 'WRITES_FENCED'], 'read_only refuses new-protocol writes');
  assert.equal((await write({ rosterKey: '2027-08', operation: 'delete', baseGeneration: 1, operationId: crypto.randomUUID() })).code, 'WRITES_FENCED', 'and deletions');
  assert.equal((await P.writeRosterRevision(db, { email, crewKey, rosterKey: '2027-10', roster: month(2027, 10, 'LA1000') }, binding)).code, 'WRITES_FENCED', 'and legacy creations');
  assert.equal((await legacyRuntimeUpsert('2027-11', month(2027, 11, 'LA1100'))).code, 'WRITES_FENCED', 'and the old runtime writer');
  assert.deepEqual(await counts(), before, 'read_only preserves every revision, receipt and pending submission and adds none');
  assert.equal((await current('2027-08')).generation, applied.generation, 'reads keep working');
  assert.equal((await write({ rosterKey: '2027-09', baseGeneration: 0, operationId: appliedId, roster: month(2027, 9, 'LA0901') })).replay, true, 'replay of an already decided operation keeps working');
  await P.setWriteMode(db, 'normal');
  assert.equal((await write({ rosterKey: '2027-08', baseGeneration: 1, operationId: refusedId, roster: month(2027, 8, 'LA0803') })).generation, 2, 'a fenced operation id was not consumed');

  // 2. fenced_legacy: the old runtime can only create never-managed months.
  await reset();
  await write({ rosterKey: '2027-08', baseGeneration: 0, operationId: crypto.randomUUID(), roster: month(2027, 8, 'LA0801') });
  await write({ rosterKey: '2027-09', baseGeneration: 0, operationId: crypto.randomUUID(), roster: month(2027, 9, 'LA0901') });
  await write({ rosterKey: '2027-09', operation: 'delete', baseGeneration: 1, operationId: crypto.randomUUID() });
  await P.setWriteMode(db, 'fenced_legacy');
  const live = await legacyRuntimeUpsert('2027-08', month(2027, 8, 'LA0899'));
  assert.deepEqual([live.allowed, live.code], [false, 'MANAGED_COMPETENCE_FENCED'], 'the old runtime never overwrites a live competence');
  const tomb = await legacyRuntimeUpsert('2027-09', month(2027, 9, 'LA0999'));
  assert.deepEqual([tomb.allowed, tomb.code], [false, 'TOMBSTONE_FENCED'], 'the old runtime never resurrects a tombstone');
  assert.equal((await legacyRuntimeUpsert('2027-12', month(2027, 12, 'LA1200'))).allowed, true, 'a month never managed may be created by the old runtime');
  // A legacy row that exists but was never migrated (no competence): the old runtime's upsert would
  // overwrite it blindly, so in the rollback window it is create-only there too.
  await legacyRow('2027-11', month(2027, 11, 'LA1101'));
  const unmigrated = await legacyRuntimeUpsert('2027-11', month(2027, 11, 'LA1199'));
  assert.deepEqual([unmigrated.allowed, unmigrated.code], [false, 'LEGACY_ROW_EXISTS_FENCED'], 'the old runtime never overwrites an existing legacy row, migrated or not');
  assert.equal((await legacyContent('2027-11')).days[8].legs[0].flightNumber, 'LA1101', 'the unmigrated legacy row keeps its content');
  assert.deepEqual([(await legacyRuntimeUpsert('2027-12', month(2027, 12, 'LA1299'))).code, (await legacyContent('2027-12')).days[8].legs[0].flightNumber], ['LEGACY_ROW_EXISTS_FENCED', 'LA1200'], 'nor the row it created itself in this window');
  // Two old-runtime creations of the same never-managed month race: at most one commits, never an overwrite.
  const race = await Promise.allSettled(['LA0301', 'LA0302'].map(tag => legacyRuntimeUpsert('2028-03', month(2028, 3, tag))));
  const winners = race.flatMap((item, index) => (item.status === 'fulfilled' && item.value.allowed ? [['LA0301', 'LA0302'][index]] : []));
  assert.equal(winners.length <= 1, true, 'at most one concurrent creation is allowed (the other is refused or aborted by InnoDB)');
  assert.deepEqual([(await legacyContent('2028-03'))?.days[8].legs[0].flightNumber ?? null], winners.length ? winners : [null], 'the stored row is exactly the one allowed creation, never overwritten by the other');
  await db.query("DELETE FROM crewcheck_platform_rosters WHERE roster_key IN ('2027-11','2028-03')");
  assert.equal((await db.query("SELECT COUNT(*) AS n FROM crewcheck_platform_rosters WHERE roster_key IN ('2027-08','2027-09')")).rows[0].n, 0, 'no legacy row written for managed months');
  assert.equal((await write({ rosterKey: '2027-08', baseGeneration: 0, operationId: crypto.randomUUID(), roster: month(2027, 8, 'LA0898') })).status, 409, 'new-protocol writes keep their CAS while fenced');
  assert.equal((await write({ rosterKey: '2027-08', baseGeneration: 1, operationId: crypto.randomUUID(), roster: month(2027, 8, 'LA0897') })).generation, 2);
  // Back to normal: divergences are reported, nothing is resolved automatically.
  const generations = { '2027-08': (await current('2027-08')).generation, '2027-09': (await current('2027-09')).generation };
  await P.setWriteMode(db, 'normal');
  assert.deepEqual(await P.rollbackDivergenceReport(db), [
    { ownerEmail: email, rosterKey: '2027-08', kind: 'canonical_only', crewKey, rosterKind: 'operated', reason: null },
    { ownerEmail: email, rosterKey: '2027-12', kind: 'legacy_only', crewKey: null, rosterKind: null, reason: null },
  ], 'both directions: the live month the old runtime cannot see and the legacy-only month are reported for an explicit decision');
  assert.deepEqual({ '2027-08': (await current('2027-08')).generation, '2027-09': (await current('2027-09')).generation, '2027-12': (await current('2027-12')).generation }, { ...generations, '2027-12': 0 }, 'returning to normal changes nothing by itself');
  assert.equal((await legacyRuntimeUpsert('2027-12', month(2027, 12, 'LA1201'))).code, 'NEW_PROTOCOL_ACTIVE', 'in normal mode the old runtime does not write');

  // 3. Mode switch concurrent with in-flight writes: no write commits after the switch completes.
  await reset();
  await write({ rosterKey: '2027-08', baseGeneration: 0, operationId: crypto.randomUUID(), roster: month(2027, 8, 'LA0801') });
  const keys = ['2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06'];
  const inflight = keys.map((key, index) => write({ rosterKey: key, baseGeneration: 0, operationId: crypto.randomUUID(), roster: month(2027, index + 1, `LA77${index}`) }));
  await P.setWriteMode(db, 'read_only');
  const results = await Promise.all(inflight);
  const committed = results.filter(answer => answer.status === 200).length;
  assert.equal(committed + results.filter(answer => answer.code === 'WRITES_FENCED').length, keys.length, 'each in-flight write either committed before the switch or was fenced');
  const after = (await counts()).crewcheck_roster_revisions;
  const late = await Promise.all(keys.map((key, index) => write({ rosterKey: key, baseGeneration: 0, operationId: crypto.randomUUID(), roster: month(2027, index + 1, `LA88${index}`) })));
  assert.equal(late.every(answer => answer.code === 'WRITES_FENCED'), true, 'after the switch every write is fenced');
  assert.equal((await counts()).crewcheck_roster_revisions, after, 'nothing committed after the switch');
  assert.equal(after, 1 + committed);

  // 4. Divergence report compares CONTENT with the canonical versioned hash, in both directions, and
  //    never reports "conformant" when it cannot compare (indeterminate).
  await reset();
  const make = async (key, roster, kind = 'operated') => write({ rosterKey: key, rosterKind: kind, baseGeneration: 0, operationId: crypto.randomUUID(), roster });
  const a01 = month(2028, 1, 'LA0001');
  await make('2028-01', a01); await legacyRow('2028-01', month(2028, 1, 'LB0001'));                 // live A vs legacy B
  await make('2028-02', month(2028, 2, 'LA0002'));                                                    // live, no legacy row
  const a03 = month(2028, 3, 'LA0003');
  await make('2028-03', a03); await legacyRow('2028-03', sameRosterOtherBytes(a03));                  // same content, other bytes
  await make('2028-04', month(2028, 4, 'LA0004')); await legacyRow('2028-04', '"nao-e-uma-escala"'); // unreadable legacy roster
  const a05 = month(2028, 5, 'LA0005');
  await make('2028-05', a05); await legacyRow('2028-05', a05);
  await db.query("UPDATE crewcheck_roster_revisions SET roster=$1 WHERE roster_key='2028-05'", [JSON.stringify(P.canonicalRoster(month(2028, 5, 'LX0005')))]); // stored hash no longer matches its content
  await make('2028-06', month(2028, 6, 'LA0006')); await make('2028-06', month(2028, 6, 'LP0006'), 'planned'); await legacyRow('2028-06', month(2028, 6, 'LA0006')); // legacy has no kind
  await make('2028-07', month(2028, 7, 'LA0007')); await write({ rosterKey: '2028-07', operation: 'delete', baseGeneration: 1, operationId: crypto.randomUUID() }); await legacyRow('2028-07', month(2028, 7, 'LA0007'));
  await legacyRow('2028-08', month(2028, 8, 'LB0008'));                                               // legacy only
  await make('2028-09', month(2028, 9, 'LA0009')); await legacyRow('2028-09', month(2028, 9, 'LA0009', 'BP00000002')); // other crew member
  await make('2028-10', month(2028, 10, 'LA0010')); await write({ rosterKey: '2028-10', operation: 'delete', baseGeneration: 1, operationId: crypto.randomUUID() }); // tombstone, no legacy row
  const a11 = month(2028, 11, 'LA0011');
  await make('2028-11', a11); await legacyRow('2028-11', a11);                                         // identical
  const fingerprints = Object.fromEntries((await db.query("SELECT roster_key,fingerprint FROM crewcheck_platform_rosters WHERE roster_key='2028-03'")).rows.map(row => [row.roster_key, row.fingerprint]));
  assert.notEqual(fingerprints['2028-03'], P.rosterContentHash(a03), 'fixture: the legacy fingerprint is another hash family');
  const entry = (rosterKey, kind, extra = {}) => ({ ownerEmail: email, rosterKey, kind, crewKey: null, rosterKind: null, reason: null, ...extra });
  assert.deepEqual(await P.rollbackDivergenceReport(db), [
    entry('2028-01', 'content_differs', { crewKey, rosterKind: 'operated' }),
    entry('2028-02', 'canonical_only', { crewKey, rosterKind: 'operated' }),
    entry('2028-04', 'indeterminate', { reason: 'LEGACY_ROSTER_UNREADABLE' }),
    entry('2028-05', 'indeterminate', { crewKey, rosterKind: 'operated', reason: 'CANONICAL_CONTENT_HASH_MISMATCH' }),
    entry('2028-06', 'indeterminate', { reason: 'COMPETENCE_MAPPING_AMBIGUOUS' }),
    entry('2028-07', 'legacy_row_on_tombstone', { crewKey, rosterKind: 'operated' }),
    entry('2028-08', 'legacy_only'),
    entry('2028-09', 'content_differs', { crewKey, rosterKind: 'operated', reason: 'CREW_KEY_DIFFERS' }),
  ], 'live B vs live A, canonical-only, unreadable, corrupted, ambiguous, tombstone, legacy-only and other crew are all reported; only same-content months (other bytes included) and tombstone-without-legacy are absent');
}

const P = await import(pathToFileURL(path.resolve(protocolFile)).href);
await suite(P);

const source = fs.readFileSync(protocolFile, 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-mutants-'));
const mutants = [
  ['rollback as "flag off": fence ignored by writes', "    if (fence === 'read_only') {\n      await client.query('ROLLBACK');", "    if (false) {\n      await client.query('ROLLBACK');"],
  ['missing fence row treated as normal', ".rows[0]?.mode || 'read_only';\n    if (fence === 'read_only') {", ".rows[0]?.mode || 'normal';\n    if (fence === 'read_only') {"],
  ['old runtime allowed to overwrite managed months', "  if (managed.length) return { allowed: false, code:", "  if (false) return { allowed: false, code:"],
  ['old runtime guard only checks live state (tombstone resurrection)', "AND roster_key=$2 AND generation>0 FOR UPDATE'", "AND roster_key=$2 AND state=\\'live\\' FOR UPDATE'"],
  ['old runtime guard ignores an existing legacy row (blind upsert on unmigrated row)', "  if (legacyRows.length) return { allowed: false, code: 'LEGACY_ROW_EXISTS_FENCED' };", ''],
  ['divergence report trusts live+live without comparing content (d401de4 filter)', "    if (legacyHash !== canonicalHash) report(", "    if (false) report("],
  ['divergence report compares the legacy fingerprint (other hash family)', "    const legacyHash = rosterContentHash(legacyRoster);", "    const legacyHash = legacy.fingerprint;"],
  ['divergence report starts only from the legacy table', "  for (const [group, competences] of byGroup) if (!legacyByGroup.has(group))", "  for (const [group, competences] of new Map()) if (!legacyByGroup.has(group))"],
  ['indeterminate silently treated as conformant', "  const indeterminate = (legacy, reason, { competence = null } = {}) => report(legacy, 'indeterminate', { competence, reason });", "  const indeterminate = () => {};"],
];
const killed = [];
for (const [name, from, to] of mutants) {
  assert(source.includes(from), `mutant anchor present: ${name}`);
  const file = path.join(dir, `${killed.length}-server-protocol.mjs`);
  fs.writeFileSync(file, source.replace(from, to));
  let failure = null;
  try { await suite(await import(pathToFileURL(file).href)); } catch (error) { failure = error; }
  assert(failure instanceof assert.AssertionError, `mutant must be killed by an assertion: ${name} (${failure?.message || 'survived'})`);
  killed.push(`${name} → "${failure.message.split('\n')[0]}"`);
}
for (const table of TABLES) await db.query(`DROP TABLE IF EXISTS ${table}`);
await native.end();
console.log(`PASS fail-closed rollback: no fence row = read_only; read_only refuses every writer (new protocol, legacy, old runtime) and keeps reads, replays and all data; fenced_legacy lets the old runtime only CREATE a month with no competence and no legacy row (no overwrite of live, unmigrated or same-window rows, no resurrection) while new writes keep CAS; concurrent switch commits nothing afterwards; returning to normal only reports divergences, both directions, by canonical content hash, indeterminate when not comparable; ${killed.length} mutants killed:\n  ${killed.join('\n  ')}`);
