// Only full account erasure calls these statements. Roster removal/replacement
// never touches durable financial records. Use the caller's existing transaction.
export function financialLedgerErasureStatements(ownerId) {
  if (typeof ownerId !== 'string' || !ownerId || ownerId.length > 254) throw new TypeError('Owner required');
  return [
    ['DELETE FROM crewcheck_financial_revisions WHERE owner_id=$1', [ownerId]],
    ['DELETE FROM crewcheck_financial_heads WHERE owner_id=$1', [ownerId]],
  ];
}
