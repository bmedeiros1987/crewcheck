import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { accountHealthDeletionStatements, deleteIfTableExists } from '../server/platform.mjs';

const EMAIL = 'tripulante@example.com';
const HEALTH_TABLES = [
  'crewcheck_platform_emergency_responses',
  'crewcheck_platform_emergency_alerts',
  'crewcheck_platform_emergency_sessions',
  'crewcheck_platform_emergency_preferences',
  'crewcheck_platform_emergency_profiles',
  'crewcheck_guardian_cards',
];

function fakeClient({ missing = new Set(), failOn = null } = {}) {
  const executed = [];
  return {
    executed,
    async query(sql, params) {
      const table = sql.match(/DELETE FROM (\w+)/)[1];
      if (failOn && table === failOn) throw Object.assign(new Error('lock wait timeout'), { code: 'ER_LOCK_WAIT_TIMEOUT' });
      if (missing.has(table)) throw Object.assign(new Error(`Table '${table}' doesn't exist`), { code: 'ER_NO_SUCH_TABLE' });
      executed.push({ table, sql, params });
      return { rows: [], rowCount: 1 };
    },
  };
}

test('account deletion reaches every emergency and Guardian health table, scoped to the owner', async () => {
  const client = fakeClient();
  for (const [sql, params] of accountHealthDeletionStatements(EMAIL)) await deleteIfTableExists(client, sql, params);
  assert.deepEqual(client.executed.map((row) => row.table), HEALTH_TABLES);
  for (const row of client.executed) assert.deepEqual(row.params, [EMAIL]);
  assert.match(client.executed[0].sql, /alert_id IN \(SELECT id FROM crewcheck_platform_emergency_alerts WHERE owner_email=\$1\)/,
    'responses are keyed by alert and must be removed through the owner alerts, before them');
  for (const row of client.executed.slice(1)) assert.match(row.sql, /WHERE owner_email=\$1$/);
});

test('a table the module never created does not abort the account deletion', async () => {
  const client = fakeClient({ missing: new Set(['crewcheck_guardian_cards', 'crewcheck_platform_emergency_responses']) });
  for (const [sql, params] of accountHealthDeletionStatements(EMAIL)) await deleteIfTableExists(client, sql, params);
  assert.deepEqual(client.executed.map((row) => row.table), HEALTH_TABLES.filter((table) =>
    table !== 'crewcheck_guardian_cards' && table !== 'crewcheck_platform_emergency_responses'));
});

test('negative: any other database error still aborts the deletion', async () => {
  const client = fakeClient({ failOn: 'crewcheck_platform_emergency_profiles' });
  await assert.rejects(async () => {
    for (const [sql, params] of accountHealthDeletionStatements(EMAIL)) await deleteIfTableExists(client, sql, params);
  }, /lock wait timeout/);
});

test('the deletion handler runs the health statements inside its transaction, before COMMIT', () => {
  const source = readFileSync(new URL('../server/platform.mjs', import.meta.url), 'utf8');
  const handler = source.slice(source.indexOf('async function handleAccountDeletion'));
  const loop = handler.indexOf('accountHealthDeletionStatements(context.identity.email)');
  assert.ok(loop > 0, 'account deletion must include the health tables');
  assert.ok(loop > handler.indexOf("await client.query('BEGIN')"));
  assert.ok(loop < handler.indexOf("await client.query('COMMIT')"));
});
