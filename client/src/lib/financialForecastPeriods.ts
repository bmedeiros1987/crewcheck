import { observedStatementCycle, rosterOperationalIso, type AllowanceClockBasis, type AllowanceStatementCycle } from './compensationPolicy';
import { validFinancialDay } from './financialHistoryPeriods';

type ForecastRow = { iso: string; currency: string; value: number; convertedBRL: number | null };
type UnclassifiedItem = { iso: string; airport: string };
type AllowanceEvidenceRow = ForecastRow & {
  label: string; eventId?: string; source?: string; airport?: string; partial?: boolean; originIso?: string;
  rateKey?: string; rateSource?: string; rateVersion?: string;
  calculationStart?: string; calculationEnd?: string;
  expectedPaymentDate?: string; expectedPaymentTimezone?: string;
};
type AllowancePending = UnclassifiedItem & { reason?: string; pendingKind?: string; sourceIssueId?: string; actCause?: string; originIso?: string };

// A nominal source may prove meals after midnight in the next competence.
// Keep the producer's full rows; date filtering belongs to the consumer. This
// does not activate a source or select a superseded roster revision.
export function aggregateAllowanceEvidence<R extends AllowanceEvidenceRow, P extends AllowancePending>(snapshots: readonly {
  roster?: { year?: number; month?: number };
  perdiem: { rows?: readonly R[]; monthlyRows: readonly R[]; unclassifiedItems?: readonly P[]; monthlyUnclassifiedItems: readonly P[] };
}[]): { rows: R[]; unclassifiedItems: AllowancePending[] } {
  const groups = new Map<string, R[]>(), pending = new Map<string, AllowancePending>();
  const addPending = (item: AllowancePending) => pending.set(JSON.stringify([item.iso,item.airport,item.reason,item.pendingKind,item.sourceIssueId,item.actCause,item.originIso]), item);
  for (const snapshot of snapshots) {
    const month = snapshot.roster?.year && snapshot.roster?.month ? `${snapshot.roster.year}-${String(snapshot.roster.month).padStart(2,'0')}` : '';
    for (const item of snapshot.perdiem.unclassifiedItems ?? snapshot.perdiem.monthlyUnclassifiedItems) {
      if (!month || !item.iso || item.iso.slice(0,7)===month || validFinancialDay(item.originIso||'')&&item.originIso?.slice(0,7)===month) addPending(item);
    }
    for (const row of snapshot.perdiem.rows ?? snapshot.perdiem.monthlyRows) {
      if (!validFinancialDay(row.iso)) { addPending({iso:'',airport:row.airport||'',pendingKind:'source_coverage',reason:'Data de origem da diária não verificada.'}); continue; }
      if (month && row.iso.slice(0,7)!==month) {
        // A literal activity printed in a different competence is not carry-in.
        // Only a journey beginning in this source's nominal month can carry
        // its meals forward. Preserve the nominal publication's authority.
        const originIso = row.originIso;
        if (!originIso || !validFinancialDay(originIso) || originIso > row.iso) { addPending({iso:row.iso,airport:row.airport||'',pendingKind:'source_coverage',reason:'Origem da jornada entre competências não verificada.'}); continue; }
        if (row.originIso.slice(0,7)!==month) continue;
      }
      if (row.partial===true) addPending({iso:row.iso,originIso:row.originIso,airport:row.airport||'',pendingKind:'source_coverage',reason:'Completude da jornada de origem da diária não comprovada.'});
      // Existing producer: one of each meal and at most one taxi per civil day.
      // Currency or amount must not turn conflicting versions into two meals.
      const key = JSON.stringify([row.iso,row.label]);
      const group = groups.get(key) || []; group.push(row); groups.set(key,group);
    }
  }
  const evidence = (row: R) => JSON.stringify([row.eventId,row.originIso,row.currency,row.value,row.convertedBRL,row.source,row.airport,row.partial,
    row.rateKey,row.rateSource,row.rateVersion,row.calculationStart,row.calculationEnd,row.expectedPaymentDate,row.expectedPaymentTimezone]);
  const rows: R[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    // Without an occurrence identity two equal amounts are not proof that the
    // records are duplicates. Divergence is explicit, never last-writer-wins.
    if (group.length > 1 && (!first.eventId || group.some(row => evidence(row) !== evidence(first)))) {
      addPending({iso:first.iso,airport:'',pendingKind:'source_coverage',reason:`Evidências divergentes de ${first.label} em ${first.iso}; confira as escalas de origem.`});
    } else rows.push(first);
  }
  rows.sort((a,b)=>a.iso.localeCompare(b.iso)||a.label.localeCompare(b.label)||String(a.eventId||'').localeCompare(String(b.eventId||'')));
  return { rows, unclassifiedItems:[...pending.values()] };
}
// Native totals do not need FX, but do require every item in this scope to have
// a known classification, rule and finite amount. Empty is not a known zero.
export function summarizeNativeForecastRows(rows: readonly ForecastRow[], unclassified: readonly UnclassifiedItem[] = []) {
  const totals: Record<string, number> = {};
  let invalid = false;
  for (const row of rows) {
    if (!Number.isFinite(row.value) || row.value < 0 || !row.currency) { invalid = true; continue; }
    totals[row.currency] = (totals[row.currency] ?? 0) + row.value;
    if (!Number.isFinite(totals[row.currency])) invalid = true;
  }
  const state = unclassified.length ? 'unclassified' : invalid ? 'invalid_amount' : !rows.length ? 'no_data' : 'available';
  return { state, complete: state === 'available', totalsByCurrency: state === 'available' ? totals : {}, knownTotalsByCurrency: Object.fromEntries(Object.entries(totals).filter(([,value])=>Number.isFinite(value))), knownCount:rows.filter(row=>Number.isFinite(row.value)&&row.value>=0&&row.currency).length };
}
export function nativeForecastDelta(before: ReturnType<typeof summarizeNativeForecastRows>, after: ReturnType<typeof summarizeNativeForecastRows>) {
  if (!before.complete || !after.complete) return null;
  return [...new Set([...Object.keys(before.totalsByCurrency), ...Object.keys(after.totalsByCurrency)])]
    .map(currency => ({ currency, value: (after.totalsByCurrency[currency] ?? 0) - (before.totalsByCurrency[currency] ?? 0) }))
    .filter(item => Math.abs(item.value) >= 0.005);
}
export function rowsInObservedCycle<T extends { iso: string }>(rows: readonly T[], cycle: AllowanceStatementCycle): T[] {
  const civil = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const start = cycle.clockBasis === 'roster_brt' ? rosterOperationalIso(cycle.start) : civil(cycle.start);
  const end = cycle.clockBasis === 'roster_brt' ? rosterOperationalIso(cycle.end) : civil(cycle.end);
  return rows.filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.iso) && row.iso >= start && row.iso <= end);
}

// Calendar references from the existing observed cycle are not company records.
// Keep the accumulating week separate from the prior week that its heuristic
// places on today's payment date. No settlement/status can be inferred here.
export function observedAllowancePeriods(now: Date, clockBasis: AllowanceClockBasis = 'device_local') {
  const accumulation = observedStatementCycle(now, clockBasis);
  const before = new Date(accumulation.start.getTime() - 1);
  const previous = observedStatementCycle(before, clockBasis);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  return { accumulation, previous, paymentReferenceToday: (clockBasis === 'roster_brt' ? rosterOperationalIso(now) === rosterOperationalIso(previous.payment) : sameDay(now, previous.payment)) ? previous : null,
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
