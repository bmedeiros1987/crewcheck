// Reproduction (characterization) of how a revised roster PDF for the same competence is stored and
// selected, and which weekly allowance cycle it lands in. Synthetic rosters and symbolic amounts
// only, offline, no database: the server functions are read from server/platform.mjs and the
// prepared client selection from client/src/lib/databaseClient.ts. Scenario: revision B turns the
// reserve on 23/10 into a shortened reserve plus two flights and moves the times on 24/10.
// It pins what the current code does:
//  - the parsed roster is already persisted as structured JSON, one row per account + competence;
//    a revision replaces that row in place (no concatenation, no revision history, no parser or
//    schema version); the PDF itself is not stored by this route;
//  - the replaced row keeps its original created_at, and the display window picks the newest
//    createdAt per competence across account and device summaries, so an older local copy of
//    revision A on another device can win over revision B (defect candidate, see report);
//  - 21–27/10/2026 is one Wednesday–Tuesday cycle with expected payment on Thursday 29/10; on
//    30/10 the reference moves to 28/10–03/11, which spans two competences.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import ts from 'typescript';

const clientSource = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
assert.match(clientSource, /export async function openRosterDisplayWindow/, 'run after node scripts/v139/apply.mjs (prepared sources)');
const functions = (file, names, kind = ts.ScriptKind.JS) => {
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, kind);
  const found = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(found.length, names.length, `${file}: ${names.join(', ')}`);
  return ts.transpileModule(found.map(node => node.getText(ast)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
};
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const server = new Function('sha256', functions('server/platform.mjs', ['sanitizeRoster', 'rosterKey', 'rosterFingerprint']) + '\nreturn { sanitizeRoster, rosterKey, rosterFingerprint };')(sha256);
const client = new Function(functions('client/src/lib/databaseClient.ts', ['rosterPeriodOrdinal', 'newestDisplaySummaryByCompetence'], ts.ScriptKind.TS) + '\nreturn { newestDisplaySummaryByCompetence };')();

// Synthetic October, revision A and revision B.
const pad = value => String(value).padStart(2, '0');
const leg = (flightNumber, departureTime, arrivalTime) => ({ flightNumber, origin: 'AAA', destination: 'BBB', departureTime, arrivalTime, aircraftType: 'A320' });
function october(changes = {}) {
  const days = [];
  for (let day = 1; day <= 31; day += 1) {
    const date = `${pad(day)}/10/2026`;
    days.push(changes[day] ? { date, ...changes[day] } : { date, type: 'DO', pairingCode: 'DO', isDayOff: true, legs: [] });
  }
  return { crewId: 'BP00000001', crewName: 'TRIPULANTE SINTETICO', base: 'BSB', year: 2026, month: 10, rawText: 'texto bruto sintético', days };
}
const reserve = { type: 'RES', pairingCode: 'RES', dutyReport: '06:00', dutyDebrief: '18:00', legs: [] };
const morning = { type: 'FLIGHT', pairingCode: 'P24', dutyReport: '07:00', dutyDebrief: '15:00', legs: [leg('LA9001', '08:00', '10:00'), leg('LA9002', '11:00', '13:00')] };
const revisionA = october({ 23: reserve, 24: morning });
const revisionB = october({
  23: { type: 'RES', pairingCode: 'RES', dutyReport: '06:00', dutyDebrief: '09:00', rawText: 'reserva encurtada', legs: [leg('LA9101', '10:00', '12:00'), leg('LA9102', '13:00', '15:00')] },
  24: { ...morning, dutyReport: '09:00', dutyDebrief: '17:00', legs: [leg('LA9001', '10:00', '12:00'), leg('LA9002', '13:00', '15:00')] },
});
const deep = value => JSON.parse(JSON.stringify(value));

// 1. Structured storage: rawText is dropped, days/legs are kept as JSON; key is the competence only.
const storedA = server.sanitizeRoster(deep(revisionA)), storedB = server.sanitizeRoster(deep(revisionB));
assert.equal(storedB.rawText, '', 'raw PDF text is not stored');
assert.equal(storedB.days[22].rawText, '');
assert.equal(storedB.days[22].legs.length, 2, 'the two flights of the revised reserve day are stored as structured legs');
assert.equal(server.rosterKey(storedA), '2026-10');
assert.equal(server.rosterKey(storedB), '2026-10', 'a revision targets the same account + competence row');
assert.equal(server.rosterKey({ ...storedB, crewId: 'BP00000002' }), '2026-10', 'crewId is not part of the row key (one roster per account and month)');

// 2. Idempotence is detectable, revisions are distinguishable.
assert.equal(server.rosterFingerprint(server.sanitizeRoster(deep(revisionA))), server.rosterFingerprint(storedA), 'same content, same fingerprint');
assert.notEqual(server.rosterFingerprint(storedA), server.rosterFingerprint(storedB), 'revision B has a different fingerprint');

// 3. The upsert replaces in place: pins of the schema and SQL (no revision table, no version columns).
const schema = fs.readFileSync('migrations/20260715_003_aiven_mysql_full_platform.sql', 'utf8').match(/CREATE TABLE IF NOT EXISTS crewcheck_platform_rosters \(([\s\S]*?)\) ENGINE/)[1];
assert.match(schema, /UNIQUE KEY crewcheck_roster_owner_key_uq \(owner_email, roster_key\)/);
assert.doesNotMatch(schema, /parser_version|schema_version|revision|source_document|planned|operated/i, 'no parser/schema version, revision or planned/operated column');
const platform = fs.readFileSync('server/platform.mjs', 'utf8');
const upsert = platform.match(/INSERT INTO crewcheck_platform_rosters\(id,owner_email,roster_key,roster,compliance,gym,source_name,fingerprint,active\)[\s\S]*?ON DUPLICATE KEY UPDATE([\s\S]*?)`/)[1];
assert.match(upsert, /roster=VALUES\(roster\)/);
assert.match(upsert, /fingerprint=VALUES\(fingerprint\)/);
assert.doesNotMatch(upsert, /created_at|\bid=/, 'created_at and id of the first import are kept');
assert.doesNotMatch(platform, /INSERT INTO crewcheck_platform_roster_revisions|roster_history/, 'no revision history is written');
assert.match(platform, /createdAt: row\.created_at \|\| row\.updated_at/, 'account summaries expose the first import time as createdAt');
// Emulation of exactly those semantics: after A (15/10) and B (30/10) there is one row, with B.
const rows = new Map();
const upsertRow = (roster, at) => { const key = server.rosterKey(roster), current = rows.get(key); rows.set(key, current ? { ...current, roster, fingerprint: server.rosterFingerprint(roster), updated_at: at } : { id: `row-${key}`, roster, fingerprint: server.rosterFingerprint(roster), created_at: at, updated_at: at }); };
upsertRow(storedA, '2026-10-15T10:00:00.000Z');
upsertRow(storedB, '2026-10-30T10:00:00.000Z');
upsertRow(storedB, '2026-10-30T10:05:00.000Z');
assert.equal(rows.size, 1, 'never concatenated');
const accountRow = rows.get('2026-10');
assert.equal(accountRow.roster.days[22].legs.length, 2, 'the account row now holds revision B');
assert.equal(accountRow.created_at, '2026-10-15T10:00:00.000Z', 'revision B keeps the created_at of revision A');

// 4. Display window selection (prepared client): newest createdAt per competence wins.
const account = { id: accountRow.id, year: 2026, month: 10, crewId: 'BP00000001', checksum: accountRow.fingerprint, createdAt: accountRow.created_at };
const sameDevice = { id: 'local-b', year: 2026, month: 10, crewId: 'BP00000001', checksum: 'local-b', createdAt: '2026-10-30T09:59:59.000Z' };
const otherDeviceA = { id: 'local-a', year: 2026, month: 10, crewId: 'BP00000001', checksum: 'local-a', createdAt: '2026-10-20T08:00:00.000Z' };
const november = 2026 * 12 + 11 - 1;
assert.equal(client.newestDisplaySummaryByCompetence([account, sameDevice], november)[0].summary.id, 'local-b', 'device that imported B shows B');
// Device that imported revision A on 20/10 (after the row was first created on 15/10) and never saw B:
assert.equal(client.newestDisplaySummaryByCompetence([account, otherDeviceA], november)[0].summary.id, 'local-a', 'CURRENT: the older local revision A wins over account revision B (defect candidate)');

// 5. Weekly allowance cycle of the revised days (symbolic amounts, no tariff).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-revision-repro-'));
await build({ stdin: { contents: "export { observedStatementCycle, rosterOperationalIso } from './client/src/lib/compensationPolicy.ts'; export { observedAllowancePeriods, rowsInObservedCycle } from './client/src/lib/financialForecastPeriods.ts'; export { observedBrlPaymentDate } from './client/src/lib/nextFinancialPayment.ts';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: path.join(dir, 'cycle.mjs'), logLevel: 'silent', alias: { '@': path.resolve('client/src') } });
const C = await import(path.join(dir, 'cycle.mjs'));
const iso = date => C.rosterOperationalIso(date);
const cycle = C.observedStatementCycle(new Date('2026-10-23T15:00:00Z'), 'roster_brt');
assert.deepEqual([iso(cycle.start), iso(cycle.end), iso(cycle.payment)], ['2026-10-21', '2026-10-27', '2026-10-29']);
assert.equal(C.observedBrlPaymentDate('2026-10-29'), '2026-10-29', 'Thursday 29/10 is a São Paulo bank day');
const symbolic = (dates, revision) => dates.map(date => ({ iso: date, revision, currency: 'BRL', value: 1 }));
const rowsA = symbolic(['2026-10-24'], 'A'), rowsB = symbolic(['2026-10-23', '2026-10-23', '2026-10-24', '2026-10-28'], 'B');
assert.deepEqual(C.rowsInObservedCycle(rowsB, cycle).map(row => row.iso), ['2026-10-23', '2026-10-23', '2026-10-24'], 'revised days belong to 21–27; 28/10 does not');
// The cycle helper does not deduplicate: idempotence depends on rows coming from one stored revision.
assert.equal(C.rowsInObservedCycle([...rowsA, ...rowsB], cycle).length, 4, 'concatenated revisions would be counted twice');
const on28 = C.observedAllowancePeriods(new Date('2026-10-28T15:00:00Z'), 'roster_brt'), on30 = C.observedAllowancePeriods(new Date('2026-10-30T15:00:00Z'), 'roster_brt');
assert.deepEqual([iso(on28.previous.start), iso(on28.previous.end)], ['2026-10-21', '2026-10-27']);
assert.deepEqual([iso(on30.accumulation.start), iso(on30.accumulation.end), iso(on30.accumulation.payment)], ['2026-10-28', '2026-11-03', '2026-11-05'], 'after the payment day the reference moves to a cycle spanning October and November');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
assert.match(home, /return nextAllowancePayment\(snapshot\.perdiem\.monthlyRows,snapshot\.perdiem\.monthlyUnclassifiedItems,\[month\],/, 'the Home payment card covers only the active competence');

console.log('PASS roster revision persistence reproduction: structured JSON per account+competence (raw text and PDF not stored), revision replaces in place (one row, never concatenated, no revision history or parser/schema version), fingerprint detects identical reimport and distinguishes revisions, created_at of the first import kept so an older local revision on another device wins the display window (defect candidate), revised days fall in 21–27/10 paid 29/10, on 30/10 the reference cycle 28/10–03/11 spans two competences while the card covers only the active one');
