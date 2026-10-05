import assert from 'node:assert/strict';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import { issueJwt, readExistingMainIdentity } from '../server/v139/common.mjs';
import { operationalRosterContentDigest, readOperationalBriefingPreview } from '../server/concierge/operational-briefing-source.mjs';

// Test-only isolated socket. No host/URL/password option, production fallback,
// environment credential lookup, provider call or real account is accepted.
const socketPath = process.env.CREWCHECK_QA_MYSQL_SOCKET;
assert.equal(process.env.CREWCHECK_BRIEFING_QA, 'isolated-mysql');
assert.equal(socketPath, '/tmp/crewcheck-briefing-preview-qa-socket/mysqld.sock');
assert(fs.statSync(socketPath).isSocket());
process.env.CREWCHECK_AUTH_SECRET = 'synthetic-briefing-preview-test-key-not-a-real-credential';
const pool = mysql.createPool({ socketPath, user: 'root', password: '', database: 'crewcheck_briefing_preview_qa', connectionLimit: 1, multipleStatements: false });
const EMAIL = 'briefing-owner@example.test', OTHER = 'other-owner@example.test', ID = 'CC-AAAA-BBBB';
const NOW = Date.parse('2099-10-06T07:00:00Z');
const roster = { year: 2099, month: 10, base: 'AAA', rank: 'CCM', rawText: '', days: [{
  date: '06/10/2099', dayNumber: 6, month: 10, year: 2099, type: 'VOO', pairingCode: 'SYNTH-ONE',
  dutyReport: '05:00', dutyDebrief: '08:35', legs: [{ flightNumber: 'SYNTH-ONE', origin: 'AAA', destination: 'BBB', departureTime: '06:00', arrivalTime: '08:00', workType: 'OP' }],
}] };
const passed = [], queries = [];
const readOnlyDb = { query: async (sql, values) => {
  assert.equal(typeof sql, 'string'); assert.match(sql, /^SELECT\s/); queries.push({ sql, values });
  return pool.query(sql, values);
} };
const token = issueJwt({ id: ID, email: EMAIL, name: 'Synthetic', role: 'free', plan: 'free' });
const req = { headers: { authorization: `Bearer ${token}` } };
const identity = () => readExistingMainIdentity(req, { getDb: async () => readOnlyDb });
const read = async context => readOperationalBriefingPreview(context || await identity(), { now: () => NOW });
const run = async (name, fn) => { await fn(); passed.push(name); };
async function reset() {
  await pool.query("SET SESSION time_zone='+00:00'");
  await pool.query('TRUNCATE TABLE crewcheck_platform_rosters');
  await pool.query('TRUNCATE TABLE crewcheck_platform_profiles');
  await pool.query('INSERT INTO crewcheck_platform_profiles(email,public_id) VALUES (?,?),(?,?)', [EMAIL, ID, OTHER, 'CC-CCCC-DDDD']);
  await pool.query('INSERT INTO crewcheck_platform_rosters(id,owner_email,roster_key,roster,fingerprint,active,updated_at) VALUES (?,?,?,?,?,TRUE,?)',
    ['synthetic-row', EMAIL, '2099-10', JSON.stringify(roster), 'a'.repeat(64), '2099-10-06 06:58:00.000']);
  queries.length = 0;
}
try {
  const [[db]] = await pool.query('SELECT DATABASE() AS db'); assert.equal(db.db, 'crewcheck_briefing_preview_qa');
  await pool.query('CREATE TABLE IF NOT EXISTS crewcheck_platform_profiles(email VARCHAR(190) PRIMARY KEY,public_id VARCHAR(80) NOT NULL UNIQUE) ENGINE=InnoDB');
  await pool.query('CREATE TABLE IF NOT EXISTS crewcheck_platform_rosters(id VARCHAR(80) PRIMARY KEY,owner_email VARCHAR(190) NOT NULL,roster_key VARCHAR(7) NOT NULL,roster JSON NOT NULL,fingerprint CHAR(64) NOT NULL,active BOOLEAN NOT NULL,updated_at DATETIME(3) NOT NULL) ENGINE=InnoDB');
  await run('authenticated native MySQL read returns only the bound next-duty preview with no writes', async () => {
    await reset(); const result = await read();
    assert.equal(result.status, 200); assert.equal(result.body.submissionAllowed, false);
    assert.equal(result.body.briefing.duty.legs[0].flight, 'SYNTH-ONE');
    assert.equal(result.body.source.revisionAt, '2099-10-06T06:58:00.000Z');
    assert.equal(queries.length, 2); assert(queries.every(item => /^SELECT\s/.test(item.sql)));
    assert(!JSON.stringify(result.body).includes(EMAIL)); assert(!JSON.stringify(result.body).includes(ID));
    assert.equal(result.body.briefing.weather.every(item => item.state === 'unavailable'), true);
  });
  await run('full-content digest survives real JSON key normalization and changes beyond legacy fingerprint fields', async () => {
    await reset(); const first = await read();
    assert.equal(first.body.source.contentDigest.value, operationalRosterContentDigest(roster));
    const changed = { ...roster, base: 'CCC' };
    await pool.query('UPDATE crewcheck_platform_rosters SET roster=? WHERE id=?', [JSON.stringify(changed), 'synthetic-row']);
    const second = await read(); assert.equal(second.status, 200);
    assert.equal(second.body.source.legacyFingerprint, first.body.source.legacyFingerprint);
    assert.notEqual(second.body.source.contentDigest.value, first.body.source.contentDigest.value);
  });
  await run('other account active rows cannot be selected', async () => {
    await reset(); await pool.query('UPDATE crewcheck_platform_rosters SET owner_email=? WHERE id=?', [OTHER, 'synthetic-row']);
    const result = await read(); assert.equal(result.status, 404); assert.equal(result.body.code, 'ACTIVE_ROSTER_MISSING');
  });
  await run('two active rows block rather than choosing a latest row', async () => {
    await reset(); await pool.query('INSERT INTO crewcheck_platform_rosters SELECT ?,owner_email,roster_key,roster,fingerprint,active,updated_at FROM crewcheck_platform_rosters WHERE id=?', ['synthetic-duplicate', 'synthetic-row']);
    assert.equal((await read()).status, 409);
  });
  await run('deletion between authentication and roster read cannot expose an orphan roster', async () => {
    await reset(); const context = await identity(); assert(context.ok);
    await pool.query('DELETE FROM crewcheck_platform_profiles WHERE email=?', [EMAIL]);
    assert.equal((await read(context)).status, 401);
    assert.equal((await identity()).status, 401);
  });
  await run('same-email account reincarnation rejects the old token and context', async () => {
    await reset(); const context = await identity();
    await pool.query('UPDATE crewcheck_platform_profiles SET public_id=? WHERE email=?', ['CC-EEEE-FFFF', EMAIL]);
    assert.equal((await identity()).status, 401); assert.equal((await read(context)).status, 401);
  });
  await run('SQL epoch conversion preserves database-session time instead of Node host time', async () => {
    await reset(); await pool.query("SET SESSION time_zone='+03:00'");
    await pool.query('UPDATE crewcheck_platform_rosters SET updated_at=? WHERE id=?', ['2099-10-06 09:58:00.000', 'synthetic-row']);
    const result = await read(); assert.equal(result.status, 200); assert.equal(result.body.source.revisionAt, '2099-10-06T06:58:00.000Z');
  });
  await run('future database revision fails closed', async () => {
    await reset(); await pool.query('UPDATE crewcheck_platform_rosters SET updated_at=? WHERE id=?', ['2099-10-06 07:01:00.000', 'synthetic-row']);
    assert.equal((await read()).status, 409);
  });
  await run('missing roster schema returns sanitized unavailable without fallback', async () => {
    await reset(); const context = await identity();
    await pool.query('DROP TABLE crewcheck_platform_rosters');
    const result = await read(context); assert.equal(result.status, 503); assert.equal(result.body.code, 'DATABASE_OFFLINE');
    assert(!JSON.stringify(result.body).includes('ER_NO_SUCH_TABLE'));
  });
  console.log(JSON.stringify({ ok: true, database: 'isolated-mysql-8.4', timezone: process.env.TZ || 'default', count: passed.length, passed, realExternalSends: 0, productionDatabaseAccess: false }, null, 2));
} finally { await pool.end(); }
