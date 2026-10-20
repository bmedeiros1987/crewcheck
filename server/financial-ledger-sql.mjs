import { FinancialLedgerError, publicFinancialReceipt } from './financial-ledger.mjs';
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const conflict = () => { throw new FinancialLedgerError('FINANCIAL_IDEMPOTENCY_CONFLICT', 409); };
function replay(row, write) {
  if (row.request_hash !== write.requestHash) conflict();
  return { ...parse(row.receipt), replayed: true };
}
// Uses the existing MySQL adapter. No roster joins/FKs, deletes, updates of
// revisions, auto-DDL, rate recalculation or automatic payment confirmation.
export function createFinancialSqlStore(db) {
  return {
    async list(ownerId) {
      const profile = await db.query('SELECT email FROM crewcheck_platform_profiles WHERE email=$1 LIMIT 1', [ownerId]);
      if (profile.rows.length !== 1) throw new FinancialLedgerError('FINANCIAL_OWNER_REQUIRED', 403);
      const rows = await db.query('SELECT snapshot FROM crewcheck_financial_revisions WHERE owner_id=$1 ORDER BY entry_id,revision LIMIT 10001', [ownerId]);
      if (rows.rows.length > 10000) throw new FinancialLedgerError('FINANCIAL_HISTORY_LIMIT', 503);
      return rows.rows.map(row => parse(row.snapshot).record);
    },
    async append(write, validateTransition) {
      const c = await db.connect();
      let began = false;
      try {
        await c.query('BEGIN'); began = true;
        // Same first lock as account erasure: a deleted account cannot append
        // with a previously issued token or race new records past erasure.
        const profile = await c.query('SELECT email FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE', [write.ownerId]);
        if (profile.rows.length !== 1) throw new FinancialLedgerError('FINANCIAL_OWNER_REQUIRED', 403);
        // The stable head serializes revisions for one owner/logical entry.
        await c.query('INSERT INTO crewcheck_financial_heads(owner_id,entry_id,latest_revision) VALUES($1,$2,0) ON DUPLICATE KEY UPDATE entry_id=entry_id', [write.ownerId, write.entryId]);
        const heads = await c.query('SELECT latest_revision FROM crewcheck_financial_heads WHERE owner_id=$1 AND entry_id=$2 FOR UPDATE', [write.ownerId, write.entryId]);
        const old = await c.query('SELECT request_hash,receipt FROM crewcheck_financial_revisions WHERE owner_id=$1 AND idempotency_key=$2', [write.ownerId, write.idempotencyKey]);
        if (old.rows.length) { const receipt = replay(old.rows[0], write); await c.query('COMMIT'); began = false; return receipt; }
        const revision = Number(heads.rows[0]?.latest_revision);
        if (revision !== write.expectedRevision) throw new FinancialLedgerError('FINANCIAL_REVISION_CONFLICT', 409);
        let previous = null;
        if (revision) {
          const result = await c.query('SELECT snapshot FROM crewcheck_financial_revisions WHERE owner_id=$1 AND entry_id=$2 AND revision=$3', [write.ownerId, write.entryId, revision]);
          if (result.rows.length !== 1) throw new FinancialLedgerError('FINANCIAL_HISTORY_UNAVAILABLE', 503);
          previous = parse(result.rows[0].snapshot).record;
        }
        validateTransition(previous, write);
        const receipt = publicFinancialReceipt(write);
        await c.query('INSERT INTO crewcheck_financial_revisions(owner_id,entry_id,revision,idempotency_key,request_hash,snapshot,receipt) VALUES($1,$2,$3,$4,$5,$6,$7)', [write.ownerId, write.entryId, write.snapshot.record.revision, write.idempotencyKey, write.requestHash, JSON.stringify(write.snapshot), JSON.stringify(receipt)]);
        const updated = await c.query('UPDATE crewcheck_financial_heads SET latest_revision=$3 WHERE owner_id=$1 AND entry_id=$2 AND latest_revision=$4', [write.ownerId, write.entryId, write.snapshot.record.revision, revision]);
        if (updated.rowCount !== 1) throw new FinancialLedgerError('FINANCIAL_REVISION_CONFLICT', 409);
        await c.query('COMMIT'); began = false;
        return receipt;
      } catch (error) {
        if (began) { try { await c.query('ROLLBACK'); } catch { c.discard?.(); } }
        // A simultaneous reuse of an owner idempotency key in another scope
        // rolls back fully. Only identical committed input may be replayed.
        if (error?.code === 'ER_DUP_ENTRY') {
          const old = await c.query('SELECT request_hash,receipt FROM crewcheck_financial_revisions WHERE owner_id=$1 AND idempotency_key=$2', [write.ownerId, write.idempotencyKey]);
          if (old.rows.length) return replay(old.rows[0], write);
          throw new FinancialLedgerError('FINANCIAL_REVISION_CONFLICT', 409);
        }
        throw error;
      } finally { c.release(); }
    },
  };
}
