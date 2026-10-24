// Compare only persisted records returned by the authenticated ledger. Dates
// delimit recorded work periods; they never establish that money was received.
export function financialHistoryComparison(records, { grouping = 'month', incomplete = false } = {}) {
  const groups = new Map();
  let excluded = 0;
  for (const row of records) {
    // A weekly amount crossing a month cannot be apportioned without evidence.
    const monthly = grouping === 'month';
    if (monthly && (row.periodStart.slice(0, 7) !== row.periodEnd.slice(0, 7)
      || !['day', 'month'].includes(row.aggregationLevel))) { excluded++; continue; }
    if (!monthly && row.aggregationLevel !== 'week') { excluded++; continue; }
    const period = monthly ? row.periodStart.slice(0, 7) : row.periodStart + '/' + row.periodEnd;
    const key = [period, row.currency, row.category, row.status].join(':');
    const previous = groups.get(key);
    const amount = previous ? previous.amountMinor === null || row.amountMinor === null ? null : previous.amountMinor + row.amountMinor : row.amountMinor;
    groups.set(key, { period, currency: row.currency, category: row.category, status: row.status,
      amountMinor: incomplete || amount === null || !Number.isSafeInteger(amount) ? null : amount,
      count: (previous?.count || 0) + 1 });
  }
  const output=[...groups.values()].sort((a,b)=>a.period.localeCompare(b.period) || a.currency.localeCompare(b.currency) || a.status.localeCompare(b.status));
  const currencies=[...new Set(output.map(row=>row.currency))];
  const comparableCurrencies=currencies.filter(currency=>new Set(output.filter(row=>row.currency===currency&&row.amountMinor!==null).map(row=>row.period)).size>=2);
  return { groups:output, excluded, comparableCurrencies };
}
