// Proposal check (not runtime): legacy clients (no base generation / operation id) never write
// blindly. On a disposable MySQL with docs/proposals/roster-revision-sync/schema-draft.sql:
//  - absent competence: create (deterministic operation id, idempotent);
//  - same content as the current live revision: no-op, nothing written;
//  - existing or deleted competence: 428 and the content is kept as a PENDING submission in the
//    same transaction as the receipt; it becomes a revision only when an up-to-date client confirms
//    it explicitly with the generation it saw and a new operation id (same CAS as any write);
//  - confirming on a stale base is a 409 and leaves the submission pending; dismissing is explicit;
//    a submission is applied at most once, even under concurrent confirmations.
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
const native = mysql.createPool({ socketPath, user: 'root', password: '', database: 'crewcheck_roster_revision_qa', connectionLimit: 12, dateStrings: true });
const db = mysqlAdapter(native);
assert.equal((await db.query('SELECT DATABASE() AS name')).rows[0].name, 'crewcheck_roster_revision_qa');
const protocolFile = 'docs/proposals/roster-revision-sync/server-protocol.mjs';
const schema = fs.readFileSync('docs/proposals/roster-revision-sync/schema-draft.sql', 'utf8');
async function resetSchema() {
  for (const table of ['crewcheck_roster_write_fence', 'crewcheck_roster_legacy_submissions', 'crewcheck_roster_operation_receipts', 'crewcheck_roster_revisions', 'crewcheck_roster_competences']) await db.query(`DROP TABLE IF EXISTS ${table}`);
  for (const statement of schema.split(/;\s*\n/).map(text => text.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) await db.query(statement);
  // The write fence is fail-closed (no row = read_only); these suites exercise normal operation.
  await db.query("INSERT INTO crewcheck_roster_write_fence(scope,mode) VALUES('global','normal')");
}

const pad = value => String(value).padStart(2, '0');
function april(tag) {
  const days = [];
  for (let day = 1; day <= 30; day += 1) days.push({ date: `${pad(day)}/04/2027`, type: day === 12 ? 'FLIGHT' : 'DO', legs: day === 12 ? [{ flightNumber: tag }] : [] });
  return { crewId: 'BP00000001', crewName: 'TRIPULANTE SINTETICO', year: 2027, month: 4, days };
}
const A = april('LA1000'), B = april('LA2000'), C = april('LA3000');
const crewKey = 'ID:BP00000001', email = 'qa-legacy@example.test', other = 'qa-legacy-other@example.test';
const bindings = { [email]: crewKey, [other]: crewKey };
const binding = { resolveVerifiedCrewKey: async who => bindings[who] || null };
const without = (value, key) => { const { [key]: _omitted, ...rest } = value; return rest; };

async function suite(P) {
  const legacyWrite = (roster, who = email) => P.writeRosterRevision(db, { email: who, crewKey, rosterKey: '2027-04', roster }, binding);
  const write = request => P.writeRosterRevision(db, { email, crewKey, rosterKey: '2027-04', parserVersion: 'qa', ...request }, binding);
  const confirm = (submissionId, baseGeneration, who = email) => P.writeRosterRevision(db, { email: who, crewKey, rosterKey: '2027-04', baseGeneration, operationId: crypto.randomUUID(), confirmSubmissionId: submissionId, sourceKind: 'legacy_confirmed', parserVersion: 'qa' }, binding);
  const current = async () => P.readCurrentRoster(db, email, { crewKey, rosterKey: '2027-04' });
  const status = async id => (await db.query('SELECT status FROM crewcheck_roster_legacy_submissions WHERE owner_email=$1 AND submission_id=$2', [email, id])).rows[0]?.status ?? null;
  const revisions = async () => Number((await db.query('SELECT COUNT(*) AS n FROM crewcheck_roster_revisions')).rows[0].n);

  // 1. Absent competence: a legacy client creates it; the same send again is a replay.
  await resetSchema();
  const created = await legacyWrite(A);
  assert.deepEqual([created.status, created.generation], [200, 1]);
  assert.deepEqual(without(await legacyWrite(A), 'replay'), created);
  // 2. Same content as current: no-op, nothing written, no submission.
  const second = await P.writeRosterRevision(db, { email, crewKey, rosterKey: '2027-04', roster: A, parserVersion: 'other-legacy-build' }, binding);
  assert.equal(second.status, 200);
  assert.equal(await revisions(), 1);
  assert.equal((await P.listLegacySubmissions(db, email)).length, 0);

  // 3. Existing competence, other content: 428 + pending submission; nothing applied.
  const refused = await legacyWrite(B);
  assert.equal(refused.status, 428, 'a legacy client never overwrites');
  assert.ok(refused.pendingSubmissionId, 'its content is kept as a pending submission');
  assert.equal((await current()).contentHash, P.rosterContentHash(A), 'the current revision is untouched');
  assert.equal(await status(refused.pendingSubmissionId), 'pending', 'pending submission recorded with the refusal');
  assert.deepEqual(without(await legacyWrite(B), 'replay'), refused, 'the same legacy send replays the same 428');
  assert.equal((await P.listLegacySubmissions(db, email)).length, 1, 'no duplicate submission');

  // 4. Confirmation on a stale base: 409, submission stays pending.
  await write({ baseGeneration: 1, operationId: crypto.randomUUID(), roster: C });
  const stale = await confirm(refused.pendingSubmissionId, 1);
  assert.equal(stale.status, 409, 'confirmation is CAS like any write');
  assert.equal(await status(refused.pendingSubmissionId), 'pending', 'a refused confirmation leaves the submission pending');
  assert.equal((await current()).contentHash, P.rosterContentHash(C));

  // 5. Explicit confirmation on the seen generation applies the stored content once.
  const applied = await confirm(refused.pendingSubmissionId, 2);
  assert.deepEqual([applied.status, applied.generation], [200, 3]);
  assert.equal((await current()).contentHash, P.rosterContentHash(B), 'the submission content (not the request) is applied');
  assert.equal(await status(refused.pendingSubmissionId), 'confirmed');
  const again = await confirm(refused.pendingSubmissionId, 3);
  assert.equal(again.code, 'SUBMISSION_NOT_PENDING', 'a submission is applied at most once');
  assert.equal((await current()).generation, 3);
  const source = (await db.query('SELECT source_kind FROM crewcheck_roster_revisions WHERE generation=3')).rows[0].source_kind;
  assert.equal(source, 'legacy_confirmed');

  // 6. Tombstone: a legacy send never resurrects; it becomes a pending submission.
  await write({ operation: 'delete', baseGeneration: 3, operationId: crypto.randomUUID() });
  const beforeResend = await revisions();
  // The legacy id is deterministic: re-sending the very first legacy request is a replay of its
  // ORIGINAL answer (receipt), not a new write — the deletion stays and nothing is created.
  const resend = await legacyWrite(A);
  assert.deepEqual([resend.status, resend.replay], [200, true], 'old legacy request: original answer replayed');
  assert.deepEqual([(await current()).state, await revisions()], ['deleted', beforeResend], 'replay never resurrects');
  const onTombstone = await legacyWrite(april('LA4000'));
  assert.equal(onTombstone.status, 428, 'new legacy content on a tombstone is refused');
  assert.equal((await current()).state, 'deleted', 'the deletion stays');
  // 7. Explicit dismissal; confirming after dismissal is refused.
  assert.equal((await P.dismissLegacySubmission(db, { email, submissionId: onTombstone.pendingSubmissionId })).status, 200);
  assert.equal(await status(onTombstone.pendingSubmissionId), 'dismissed');
  assert.equal((await confirm(onTombstone.pendingSubmissionId, 4)).code, 'SUBMISSION_NOT_PENDING');
  assert.equal((await current()).state, 'deleted');
  // 8. Another account cannot confirm or see it.
  assert.equal((await confirm(refused.pendingSubmissionId, 4, other)).code, 'SUBMISSION_NOT_FOUND');
  assert.equal((await P.listLegacySubmissions(db, other)).length, 0);
  // 9. A confirmation request cannot carry its own content or skip the CAS.
  const pendingAgain = (await legacyWrite(C)).pendingSubmissionId;
  assert.equal((await P.writeRosterRevision(db, { email, crewKey, rosterKey: '2027-04', confirmSubmissionId: pendingAgain, roster: C }, binding)).status, 428, 'no confirmation without base and operation id');
  assert.equal(await status(pendingAgain), 'pending');

  // 10. Concurrent confirmations of one submission: applied at most once.
  await resetSchema();
  await legacyWrite(A);
  const contested = (await legacyWrite(B)).pendingSubmissionId;
  const races = await Promise.all([1, 2, 3, 4].map(() => confirm(contested, 1)));
  assert.equal(races.filter(answer => answer.status === 200).length, 1, 'one confirmation applies');
  assert.deepEqual([(await current()).generation, await status(contested)], [2, 'confirmed']);
  assert.equal(races.filter(answer => answer.status === 409).length, 3, 'the others are explicit refusals');
}

const P = await import(pathToFileURL(path.resolve(protocolFile)).href);
await suite(P);

const source = fs.readFileSync(protocolFile, 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-mutants-'));
const mutants = [
  // Faithful blind legacy write: take the current generation as base and apply.
  ['legacy client overwrites an existing competence', 'const moved = Number(current.generation) !== baseGeneration;', 'if (legacy) baseGeneration = Number(current.generation); const moved = Number(current.generation) !== baseGeneration;'],
  ['legacy refusal without a pending submission', "      await client.query(`INSERT IGNORE INTO crewcheck_roster_legacy_submissions(", "      if (false) await client.query(`INSERT IGNORE INTO crewcheck_roster_legacy_submissions("],
  ['confirmation without checking the submission is pending', "if (pending?.status !== 'pending') return await decide(", "if (false) return await decide("],
  ['submission marked confirmed even when refused', "if (submissionId && ['applied', 'unchanged'].includes(outcomeName)) {", 'if (submissionId) {'],
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
await resetSchema();
await native.end();
console.log(`PASS legacy compatibility: create-only on absent, no-op on same content, 428 + pending submission on existing/deleted (never blind), explicit confirmation by CAS on the seen generation applied at most once (also concurrently), stale confirmation and dismissal explicit, other accounts isolated; ${killed.length} mutants killed:\n  ${killed.join('\n  ')}`);
