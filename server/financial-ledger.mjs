import { createHash } from 'node:crypto';
import { queryFinancialHistory } from '../shared/financialReadModel.mjs';

export class FinancialLedgerError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new FinancialLedgerError(code, status); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fields = ['periodStart','periodEnd','currency','timezone','amountMinor','category','aggregationLevel','status','sourceId','ruleVersion','paymentDate','amountBasis','operationalMonth','payrollMonth','rateMonth','expectedCreditMonth'];
export function ledgerOwner(identity) {
  if (identity?.authenticated !== true || identity.role !== 'owner' || typeof identity.ownerId !== 'string' || !identity.ownerId || identity.ownerId.length > 254) fail('FINANCIAL_OWNER_REQUIRED', 403);
  return identity.ownerId;
}
// Identity, entry IDs and revisions come from the host/ledger, never body fields.
export function prepareFinancialWrite(identity, input) {
  const ownerId = ledgerOwner(identity);
  if (!input || Object.getPrototypeOf(input) !== Object.prototype || Object.keys(input).some(k => !['record','expectedRevision','idempotencyKey','sourceFingerprint','action','provenance'].includes(k))) fail('FINANCIAL_INVALID_INPUT');
  if (!identifier(input.idempotencyKey) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= 2147483647 || !digest(input.sourceFingerprint)) fail('FINANCIAL_INVALID_INPUT');
  const raw = input.record;
  if (!raw || Object.getPrototypeOf(raw) !== Object.prototype || Object.keys(raw).some(k => !fields.includes(k)) || !identifier(raw.sourceId)) fail('FINANCIAL_INVALID_RECORD');
  const provenance = input.provenance;
  if (!provenance || Object.getPrototypeOf(provenance) !== Object.prototype || Object.keys(provenance).some(k => !['kind','reference'].includes(k)) || !identifier(provenance.reference)) fail('FINANCIAL_INVALID_PROVENANCE');
  const actions = { capture_forecast: ['forecast', 'roster_snapshot'], report_statement: ['statement_reported', 'statement'], record_settlement: ['payment_confirmed', 'settlement'] };
  const expected = actions[input.action];
  if (!expected || raw.status !== expected[0] || provenance.kind !== expected[1]) fail('FINANCIAL_ACTION_STATUS_MISMATCH');
  if (raw.status === 'forecast' && raw.paymentDate !== undefined) fail('FINANCIAL_FORECAST_PAYMENT_DATE');
  if (raw.status === 'payment_confirmed' && input.expectedRevision === 0) fail('FINANCIAL_SETTLEMENT_REQUIRES_PRIOR_RECORD');
  // One logical income across forecast/review/settlement, amounts and rule versions.
  // sourceId is a stable producer scope, not an upload/roster revision identifier.
  const entryId = hash([raw.sourceId, raw.category, raw.currency, raw.aggregationLevel, raw.periodStart, raw.periodEnd]);
  const record = Object.fromEntries(fields.filter(k => raw[k] !== undefined).map(k => [k, raw[k]]));
  Object.assign(record, { id: entryId, ownerId, revision: input.expectedRevision + 1 });
  if (record.status === 'payment_confirmed') record.evidence = { kind: 'settlement', reference: provenance.reference };
  const checked = queryFinancialHistory({ identity, records: [record], periodStart: record.periodStart, periodEnd: record.periodEnd, aggregationLevel: record.aggregationLevel });
  if (checked.state !== 'available' && !(checked.state === 'incomplete' && checked.rejected.length === 0 && record.amountMinor === null)) fail('FINANCIAL_INVALID_RECORD');
  if (record.status === 'payment_confirmed' && record.amountMinor === null) fail('FINANCIAL_SETTLEMENT_AMOUNT_REQUIRED');
  const snapshot = { record, sourceFingerprint: input.sourceFingerprint, provenance: { kind: provenance.kind, reference: provenance.reference } };
  return { ownerId, entryId, expectedRevision: input.expectedRevision, idempotencyKey: input.idempotencyKey, action: input.action, snapshot, requestHash: hash([input.expectedRevision, input.action, snapshot]) };
}
export function validateFinancialTransition(previous, write) {
  if (!previous) { if (write.expectedRevision !== 0) fail('FINANCIAL_REVISION_CONFLICT', 409); return; }
  if (previous.revision !== write.expectedRevision) fail('FINANCIAL_REVISION_CONFLICT', 409);
  const rank = { forecast: 0, statement_reported: 1, payment_confirmed: 2 };
  if (rank[write.snapshot.record.status] < rank[previous.status]) fail('FINANCIAL_STATUS_DOWNGRADE', 409);
}
export function publicFinancialReceipt(write, replayed = false) {
  return { id: write.entryId, revision: write.snapshot.record.revision, status: write.snapshot.record.status, replayed };
}
export async function appendFinancialRecord({ store, identity, input }) {
  const write = prepareFinancialWrite(identity, input);
  return store.append(write, validateFinancialTransition);
}
export async function readFinancialLedger({ store, identity, periodStart, periodEnd, aggregationLevel = 'item' }) {
  const ownerId = ledgerOwner(identity);
  // Validate the query before asking storage; no fallback to recalculated rosters.
  const empty = queryFinancialHistory({ identity, records: [], periodStart, periodEnd, aggregationLevel });
  if (empty.state === 'invalid_period') fail('FINANCIAL_INVALID_PERIOD');
  const records = await store.list(ownerId);
  return { ...queryFinancialHistory({ identity, records, periodStart, periodEnd, aggregationLevel }), source: 'persisted_financial_ledger' };
}
