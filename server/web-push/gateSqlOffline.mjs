import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { parseJsonColumn } from '../v139/common.mjs';

// Test-only adapter: never discovers a database, authenticates a session, starts a
// worker or reads environment/credentials. Production databases are refused.
const DATABASE = 'crewcheck_gate_push_qa';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const gateFixtureAuthorityKey = (email, ownerId) => 'crewcheck-push-binding:gate-off:' + hash([email, ownerId]);
export function createOfflineSqlGateAdapters({ db, email, ownerId, fixtureOnly } = {}) {
  if (fixtureOnly !== true || !db?.getConnection || typeof email !== 'string' || !email.endsWith('@example.test')
    || typeof ownerId !== 'string' || !/^[a-zA-Z0-9_-]{8,160}$/.test(ownerId)) throw Error('Isolated gate SQL fixture required.');
  const context = new AsyncLocalStorage();
  const authorityKey = gateFixtureAuthorityKey(email, ownerId);
  async function lockOwner(connection) {
    const [database] = await connection.query('SELECT DATABASE() AS name');
    if (database[0]?.name !== DATABASE) throw Error('Isolated gate SQL database required.');
    const [owners] = await connection.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [email]);
    return owners[0]?.public_id === ownerId;
  }
  async function read(connection) {
    const [rows] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [authorityKey]);
    const record = parseJsonColumn(rows[0]?.payload, null);
    // This row is only a synthetic authority fixture, never proof of real login.
    if (record?.kind !== 'isolated-gate-authority' || record.email !== email || record.ownerId !== ownerId || record.state?.ownerId !== ownerId) return null;
    return structuredClone(record.state);
  }
  async function withOwner(run) {
    if (context.getStore()) return run(context.getStore());
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      if (!await lockOwner(connection)) { await connection.rollback(); return null; }
      const value = await context.run(connection, () => run(connection));
      await connection.commit(); return value;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  const host = Object.freeze({ kind: 'isolated-gate-authority', read: () => withOwner(read) });
  const repository = Object.freeze({
    async transaction(key, run) {
      if (context.getStore()) throw Error('Nested gate journal transaction refused.');
      if (typeof key !== 'string' || !key || key.length > 1000) throw Error('Invalid gate journal identity.');
      const stateKey = 'crewcheck-push-outbox:gate-off:' + hash([email, ownerId, key]);
      const result = await withOwner(async connection => {
        await connection.query('INSERT INTO crewcheck_telegram_state(state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key',
          [stateKey, JSON.stringify({ email, ownerId, key, record: {} })]);
        const [rows] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [stateKey]);
        const saved = parseJsonColumn(rows[0]?.payload, null);
        if (saved?.email !== email || saved.ownerId !== ownerId || saved.key !== key) throw Error('Gate journal scope mismatch.');
        const record = structuredClone(saved.record);
        return run({ ...record, save: async value => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid gate journal record.');
          await connection.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?',
            [JSON.stringify({ email, ownerId, key, record: structuredClone(value) }), stateKey]);
        } });
      });
      return result ?? { status: 'blocked', reason: 'owner-revoked', received: null };
    },
    async isCurrent(installation, selected) {
      const current = await host.read();
      const expected = selected?.gateCandidate;
      return Boolean(current && expected && current.ownerId === ownerId
        && current.installation?.active === true && current.installation.ownerId === ownerId
        && current.installation.installationId === installation.installationId && current.installation.revision === installation.revision
        && current.authority?.ownerId === ownerId && current.authority.revoked === false
        && current.authority.epoch === expected.authority.epoch && current.authority.expiresAt === expected.authority.expiresAt
        && current.consent?.enabled === true && current.consent.ownerId === ownerId
        && current.consent.installationId === installation.installationId
        && current.consent.installationRevision === installation.revision && current.consent.revision === expected.consent.revision
        && current.rosterRevision === expected.rosterRevision);
    }
  });
  return Object.freeze({ host, repository, authorityKey });
}
