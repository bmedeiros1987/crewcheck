// Presentation metadata only. Monetary calculations and ledger validation stay
// with their canonical readers; absent legacy context is never invented.
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0,10) === value;
const month = value => typeof value === 'string' && day(value + '-01');
export function financialPreviewMetadata(event) {
  const fields = ['periodStart','periodEnd','aggregationLevel','revision'];
  if (!fields.some(key => event?.[key] !== undefined)) return { state: 'unknown' };
  if (!day(event.periodStart) || !day(event.periodEnd) || event.periodStart > event.periodEnd
    || !['item','day','week','month'].includes(event.aggregationLevel) || !Number.isSafeInteger(event.revision) || event.revision < 1) return { state: 'invalid' };
  const result = { state: 'known', periodStart: event.periodStart, periodEnd: event.periodEnd, revision: event.revision };
  if (event.category === 'payroll') {
    if (!['operationalMonth','payrollMonth','rateMonth','expectedCreditMonth'].every(key => month(event[key])) || event.amountBasis !== 'net_credit') return { state: 'invalid' };
    Object.assign(result, { operationalMonth: event.operationalMonth, payrollMonth: event.payrollMonth, expectedCreditMonth: event.expectedCreditMonth });
  }
  return result;
}
