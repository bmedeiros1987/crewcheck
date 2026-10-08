import { observedStatementCycle, type AllowanceStatementCycle } from './compensationPolicy';

type ForecastRow = { iso: string; currency: string; value: number; convertedBRL: number | null };
type UnclassifiedItem = { iso: string; airport: string };
export function rowsInObservedCycle<T extends { iso: string }>(rows: readonly T[], cycle: AllowanceStatementCycle): T[] {
  const civil = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const start = civil(cycle.start);
  const end = civil(cycle.end);
  return rows.filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.iso) && row.iso >= start && row.iso <= end);
}

// Calendar references from the existing observed cycle are not company records.
// Keep the accumulating week separate from the prior week that its heuristic
// places on today's payment date. No settlement/status can be inferred here.
export function observedAllowancePeriods(now: Date) {
  const accumulation = observedStatementCycle(now);
  const before = new Date(accumulation.start);
  before.setDate(before.getDate() - 1);
  const previous = observedStatementCycle(before);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  return { accumulation, previous, paymentReferenceToday: sameDay(now, previous.payment) ? previous : null,
    source: 'legacy_observed_cycle' as const, paymentConfirmed: false as const };
}

// Summarize precisely the selected rows. Never borrow a month-level completeness
// flag for a week that can include adjacent months. The engine's existing money
// and conversion policy is retained; this helper does not homologate/round rates.
export function summarizeForecastRows(rows: readonly ForecastRow[], unclassified: readonly UnclassifiedItem[] = []) {
  const pendingCurrencies = [...new Set(rows.filter(row => row.currency !== 'BRL'
    && (row.convertedBRL === null || !Number.isFinite(row.convertedBRL))).map(row => row.currency))].sort();
  const invalidAmounts = rows.some(row => !Number.isFinite(row.value)
    || (row.currency === 'BRL' && (row.convertedBRL === null || !Number.isFinite(row.convertedBRL))));
  const sum = rows.reduce((total, row) => total + (row.convertedBRL ?? NaN), 0);
  const state = unclassified.length ? 'unclassified' : invalidAmounts ? 'invalid_amount'
    : pendingCurrencies.length ? 'missing_exchange' : !rows.length ? 'no_data' : 'available';
  const finiteState = state === 'available' && !Number.isFinite(sum) ? 'invalid_amount' : state;
  const convertedComplete = finiteState === 'available';
  return { state: finiteState, pendingCurrencies, convertedComplete, unclassifiedCount: unclassified.length,
    convertedTotalBRL: convertedComplete ? sum : null };
}

export function forecastSummaryValue(summary: ReturnType<typeof summarizeForecastRows>, money: (value: number) => string): string {
  if (summary.state === 'no_data') return 'Sem itens previstos';
  if (summary.state === 'missing_exchange') return 'Câmbio pendente';
  return summary.convertedTotalBRL === null ? 'Não calculável' : money(summary.convertedTotalBRL);
}
