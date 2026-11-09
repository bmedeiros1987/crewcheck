import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { notificationStateDeletionStatements } from '../../server/v139/notificationStateDeletion.mjs';
import { financialLedgerErasureStatements } from '../../server/financial-ledger-erasure.mjs';
import { eraseWhatsAppAccountState } from '../../server/whatsapp-lifecycle.mjs';

const source = fs.readFileSync(new URL('../../server/platform.mjs', import.meta.url), 'utf8');
const start = source.indexOf('async function handleAccountDeletion(req, res) {');
const end = source.indexOf('\n}\n', start) + 2;
assert(start >= 0 && end > start);

test('existing account-deletion transaction removes new weather consent only for that account', async () => {
  const email = 'synthetic@example.test';
  const other = 'other@example.test';
  const financialTables = ['crewcheck_financial_channel_consents', 'crewcheck_financial_source_observations', 'crewcheck_financial_revisions', 'crewcheck_financial_heads'];
  const financialKey = (table, owner) => `${table}:${owner}`;
  const otherFinancial = financialTables.map(table => financialKey(table, other));
  const records = new Set([`link-email:${email}`, `snapshot:${email}`, `profile:${email}`, `weather-consent:${email}`, `weather-consent:${other}`, ...financialTables.map(table => financialKey(table, email)), ...otherFinancial]);
  const queries = [];
  let reply, lifecycleCalls = 0;
  const client = {
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql.startsWith('DELETE FROM crewcheck_telegram_state')) for (const key of values) records.delete(key);
      if (sql.startsWith('DELETE FROM crewcheck_financial_')) {
        const match = /^DELETE FROM (crewcheck_financial_[a-z_]+) WHERE owner_id=\$1$/.exec(sql);
        assert(match, 'financial erasure must use an exact owner-scoped predicate');
        assert(financialTables.includes(match[1]), 'unexpected financial table');
        assert.deepEqual(values, [email], 'cannot erase another owner');
        records.delete(financialKey(match[1], values[0]));
      }
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
    financialLedgerErasureStatements,
    eraseWhatsAppAccountState: async (ownerEmail, {client: transaction}) => {
      assert.equal(ownerEmail, email); assert.equal(transaction, client);
      assert.equal(queries[0].sql, 'BEGIN'); lifecycleCalls++;
      await eraseWhatsAppAccountState(ownerEmail, {client: transaction});
    },
    deleteIfTableExists: async (connection, sql, values) => connection.query(sql, values),
    env: () => 'production',
    sendJson: (_res, status, data) => { reply = { status, data }; },
    Set,
  };
  const handler = vm.runInNewContext(`(${source.slice(start, end)})`, context);
  await handler({ method: 'POST' }, { setHeader() {} });
  assert.equal(reply.status, 200); assert.equal(reply.data.deleted, true);
  assert.equal(lifecycleCalls, 1);
  assert.deepEqual([...records], [`weather-consent:${other}`, ...otherFinancial]);
  const financialDeletes = queries.filter(query => /^DELETE FROM crewcheck_financial_/.test(query.sql));
  assert.deepEqual(financialDeletes.map(query => query.sql), financialTables.map(table => `DELETE FROM ${table} WHERE owner_id=$1`), 'all four prepared financial tables must be erased exactly once');
  for (const table of financialTables) {
    assert.equal(records.has(financialKey(table, email)), false, `${table}: target erased`);
    assert.equal(records.has(financialKey(table, other)), true, `${table}: other account preserved`);
  }
  for (const query of financialDeletes) assert.deepEqual(query.values, [email], 'financial erasure must remain owner-scoped inside account transaction');
  const deletion = queries.find(query => query.sql.startsWith('DELETE FROM crewcheck_telegram_state') && query.sql.includes('state_key IN'));
  assert.match(deletion.sql, /IN \(\$1,\$2,\$3,\$4\)/);
  assert.equal(deletion.values[3], `weather-consent:${email}`);
  assert.equal(queries[0].sql, 'BEGIN'); assert.equal(queries.at(-1).sql, 'COMMIT');
});
