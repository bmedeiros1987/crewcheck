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
  const records = new Set([`link-email:${email}`, `snapshot:${email}`, `profile:${email}`, `weather-consent:${email}`, `weather-consent:${other}`, `financial-revisions:${email}`, `financial-heads:${email}`, `financial-revisions:${other}`, `financial-heads:${other}`, `financial-consents:${email}`, `financial-observations:${email}`, `financial-consents:${other}`, `financial-observations:${other}`]);
  const queries = [];
  let reply, lifecycleCalls = 0;
  const client = {
    async query(sql, values = []) {
      queries.push({ sql, values });
      if (sql.startsWith('DELETE FROM crewcheck_telegram_state')) for (const key of values) records.delete(key);
      if (sql.startsWith('DELETE FROM crewcheck_financial_channel_consents')) records.delete(`financial-consents:${values[0]}`);
      if (sql.startsWith('DELETE FROM crewcheck_financial_source_observations')) records.delete(`financial-observations:${values[0]}`);
      if (sql.startsWith('DELETE FROM crewcheck_financial_revisions')) records.delete(`financial-revisions:${values[0]}`);
      if (sql.startsWith('DELETE FROM crewcheck_financial_heads')) records.delete(`financial-heads:${values[0]}`);
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
  assert.deepEqual([...records], [`weather-consent:${other}`, `financial-revisions:${other}`, `financial-heads:${other}`, `financial-consents:${other}`, `financial-observations:${other}`]);
  const financialDeletes = queries.filter(query => /^DELETE FROM crewcheck_financial_/.test(query.sql));
  assert.deepEqual(financialDeletes.map(query=>query.sql), [
    'DELETE FROM crewcheck_financial_channel_consents WHERE owner_id=$1',
    'DELETE FROM crewcheck_financial_source_observations WHERE owner_id=$1',
    'DELETE FROM crewcheck_financial_revisions WHERE owner_id=$1',
    'DELETE FROM crewcheck_financial_heads WHERE owner_id=$1',
  ]);
  for (const query of financialDeletes) assert.deepEqual(query.values, [email], 'financial erasure must remain owner-scoped inside account transaction');
  const deletion = queries.find(query => query.sql.startsWith('DELETE FROM crewcheck_telegram_state') && query.sql.includes('state_key IN'));
  assert.match(deletion.sql, /IN \(\$1,\$2,\$3,\$4\)/);
  assert.equal(deletion.values[3], `weather-consent:${email}`);
  assert.equal(queries[0].sql, 'BEGIN'); assert.equal(queries.at(-1).sql, 'COMMIT');
});
