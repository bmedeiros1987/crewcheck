import { queryFinancialHistory } from './financialReadModel.mjs';
import { currencyMinorDigits } from './financialMoney.mjs';

// A small local-app projection of the same owner-bound, latest-revision ledger.
// No competence-to-payment inference, FX, settlement inference or chat transport.
export function queryUpcomingFinancialForecast({ identity, records, now = new Date() }) {
  const empty = { source: 'persisted_financial_ledger', horizonDays: 30, events: [], hasMore: false };
  const results = ['item', 'day', 'week', 'month'].map(aggregationLevel => queryFinancialHistory({
    identity, records, aggregationLevel, periodStart: '0001-01-01', periodEnd: '9999-12-31',
  }));
  if (results.some(result => result.access !== 'allowed')) return { ...empty, access: 'denied' };
  if (!Number.isFinite(now.getTime())) return { ...empty, access: 'allowed', state: 'unavailable' };
  let incomplete = results.some(result => result.state === 'incomplete');
  const currentRecords = results.flatMap(result => result.records);
  const forecasts = currentRecords.filter(record => record.status === 'forecast');
  const ambiguous = new Set();
  // Different aggregation levels cannot establish whether the same cash event
  // was counted twice. Keep that case in Finance for review, never add it up.
  const indexes = new Map();
  for (const record of currentRecords) {
    const key = [record.category, record.currency, record.aggregationLevel].join(':');
    const index = indexes.get(key) || []; index.push(record); indexes.set(key, index);
  }
  for (const rows of indexes.values()) {
    rows.sort((a, b) => a.periodStart.localeCompare(b.periodStart));
    let maxEnd = ''; for (const row of rows) { maxEnd = maxEnd > row.periodEnd ? maxEnd : row.periodEnd; row.maxEnd = maxEnd; }
  }
  for (const record of forecasts) for (const level of ['item', 'day', 'week', 'month']) {
    if (level === record.aggregationLevel) continue;
    const rows = indexes.get([record.category, record.currency, level].join(':')) || [];
    let low = 0, high = rows.length;
    while (low < high) { const middle = (low + high) >>> 1; if (rows[middle].periodStart <= record.periodEnd) low = middle + 1; else high = middle; }
    if (low && rows[low - 1].maxEnd >= record.periodStart) ambiguous.add(record.id);
  }
  if (ambiguous.size) incomplete = true;
  const events = [];
  for (const record of forecasts) {
    if (ambiguous.has(record.id)) continue;
    if (currencyMinorDigits(record.currency) === null) { incomplete = true; continue; }
    const date = record.expectedPaymentDate, timezone = record.expectedPaymentTimezone;
    if (!date || !timezone) { incomplete = true; continue; }
    let today;
    try {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
      const part = key => parts.find(item => item.type === key)?.value;
      today = `${part('year')}-${part('month')}-${part('day')}`;
    } catch { incomplete = true; continue; }
    const last = new Date(today + 'T12:00:00Z'); last.setUTCDate(last.getUTCDate() + 29);
    if (date < today || date > last.toISOString().slice(0, 10)) continue;
    if (record.amountMinor === null) incomplete = true;
    events.push({ id: record.id, category: record.category, expectedPaymentDate: date,
      expectedPaymentTimezone: timezone, amountMinor: record.amountMinor, currency: record.currency,
      status: 'forecast' });
  }
  events.sort((a, b) => a.expectedPaymentDate.localeCompare(b.expectedPaymentDate) || a.id.localeCompare(b.id));
  return { ...empty, access: 'allowed', ownerId: identity.ownerId,
    state: incomplete ? 'incomplete' : events.length ? 'available' : 'no_data',
    events: events.slice(0, 3), hasMore: events.length > 3 };
}
