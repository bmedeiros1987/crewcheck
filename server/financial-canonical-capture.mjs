import { createHash } from 'node:crypto';
import { prepareReviewedForecastBatch, captureReviewedFinancialForecast } from './financial-forecast-producer.mjs';
import { FinancialLedgerError, ledgerOwner, validateFinancialTransition } from './financial-ledger.mjs';
const digest = writes => createHash('sha256').update(JSON.stringify(writes.map(write=>write.requestHash))).digest('hex');
const fail = code => { throw new FinancialLedgerError(code,409); };
export async function canonicalCaptureRequest({ identity, input, store }) {
  ledgerOwner(identity);
  if (!input || Object.keys(input).some(key=>!['action','source','reviewDigest','confirmed'].includes(key)) || !['preview','capture'].includes(input.action)) fail('FINANCIAL_CAPTURE_REVIEW_REQUIRED');
  let source = input.source, writes = prepareReviewedForecastBatch({ identity, source });
  if (input.action === 'preview') {
    const records = await store.list(identity.ownerId);
    const latest = new Map();
    for (const record of records) {
      if (record.ownerId !== identity.ownerId) fail('FINANCIAL_CAPTURE_OWNER_MISMATCH');
      if (!Number.isSafeInteger(record.revision) || record.revision < 1) fail('FINANCIAL_CAPTURE_REVISION_REVIEW_REQUIRED');
      const previous = latest.get(record.id);
      if (!previous || record.revision > previous.revision) latest.set(record.id,record);
      else if (record.revision === previous.revision && JSON.stringify(record) !== JSON.stringify(previous)) fail('FINANCIAL_CAPTURE_REVISION_REVIEW_REQUIRED');
    }
    for (const write of writes) for (const record of latest.values()) {
      const next = write.snapshot.record;
      if (record.sourceId === next.sourceId && record.category === next.category && record.periodStart === next.periodStart && record.periodEnd === next.periodEnd && record.aggregationLevel === next.aggregationLevel && record.currency !== next.currency) fail('FINANCIAL_CAPTURE_CURRENCY_REVIEW_REQUIRED');
    }
    source = { ...source, items: source.items.map((item,index)=>({ ...item, expectedRevision: latest.get(writes[index].entryId)?.revision || 0 })) };
    writes = prepareReviewedForecastBatch({ identity, source });
    for (const write of writes) validateFinancialTransition(latest.get(write.entryId),write);
    return { source, reviewDigest: digest(writes), count:writes.length, pendingDates:writes.filter(write=>!write.snapshot.record.expectedPaymentDate).length, pendingAmounts:writes.filter(write=>write.snapshot.record.amountMinor===null).length };
  }
  if (input.confirmed !== true || input.reviewDigest !== digest(writes)) fail('FINANCIAL_CAPTURE_REVIEW_REQUIRED');
  // Keep the reviewed revisions on retry. Never silently rebase after a 409;
  // identical retries replay through the existing producer/store contract.
  return captureReviewedFinancialForecast({ identity, source, store });
}
