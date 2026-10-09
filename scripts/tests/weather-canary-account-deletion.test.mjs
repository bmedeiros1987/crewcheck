import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { notificationStateDeletionStatements } from '../../server/v139/notificationStateDeletion.mjs';

const source = fs.readFileSync(new URL('../../server/platform.mjs', import.meta.url), 'utf8');
const start = source.indexOf('async function handleAccountDeletion(req, res) {');
const end = source.indexOf('\n}\n', start) + 2;
assert(start >= 0 && end > start);

test('existing account-deletion transaction removes new weather consent only for that account', async () => {
  const email = 'synthetic@example.test';
  const other = 'other@example.test';
  const records = new Set([`link-email:${email}`, `snapshot:${email}`, `profile:${email}`, `weather-consent:${email}`, `weather-consent:${other}`]);
  const queries = [];
  let reply;
  const client = {
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql.startsWith('DELETE FROM crewcheck_telegram_state')) for (const key of values) records.delete(key);
      return { rows: [] };
    }, release() {},
  };
  const context = {
    readBody: async () => ({ confirmation: 'EXCLUIR' }),
    requireMain: async () => ({ identity: { email }, db: { query: async () => ({ rows: [] }), connect: async () => client } }),
    normalizeText: value => String(value),
    platformTableReady: async () => false,
    accountHealthDeletionStatements: () => [],
    notificationStateDeletionStatements,
    deleteIfTableExists: async (connection, sql, values) => connection.query(sql, values),
    env: () => 'production',
    sendJson: (_res, status, data) => { reply = { status, data }; },
    Set,
  };
  const handler = vm.runInNewContext(`(${source.slice(start, end)})`, context);
  await handler({ method: 'POST' }, { setHeader() {} });
  assert.equal(reply.status, 200); assert.equal(reply.data.deleted, true);
  assert.deepEqual([...records], [`weather-consent:${other}`]);
  const deletion = queries.find(query => query.sql.startsWith('DELETE FROM crewcheck_telegram_state') && query.sql.includes('state_key IN'));
  assert.match(deletion.sql, /IN \(\$1,\$2,\$3,\$4\)/);
  assert.equal(deletion.values[3], `weather-consent:${email}`);
  assert.equal(queries[0].sql, 'BEGIN'); assert.equal(queries.at(-1).sql, 'COMMIT');
});
