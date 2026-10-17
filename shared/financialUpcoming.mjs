import { queryFinancialHistory } from './financialReadModel.mjs';
import { currencyMinorDigits } from './financialMoney.mjs';

function paymentScope(record, now) {
  if (['statement_reported', 'payment_confirmed'].includes(record?.status)) return 'outside';
  const date = record?.expectedPaymentDate;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(date + 'T12:00:00Z')) || new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) !== date) return 'unknown';
  let today;
  try {
    if (!record.expectedPaymentTimezone) throw Error('missing timezone');
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: record.expectedPaymentTimezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = key => parts.find(item => item.type === key)?.value;
    today = `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    // Without a payment timezone, only exclude dates outside every possible
    // civil-day window. Never assign an inferred timezone to a displayed event.
    const earliest = new Date(now); earliest.setUTCDate(earliest.getUTCDate() - 1);
    const latest = new Date(now); latest.setUTCDate(latest.getUTCDate() + 30);
    return date < earliest.toISOString().slice(0, 10) || date > latest.toISOString().slice(0, 10) ? 'outside' : 'unknown';
  }
  const last = new Date(today + 'T12:00:00Z'); last.setUTCDate(last.getUTCDate() + 29);
  return date < today || date > last.toISOString().slice(0, 10) ? 'outside' : 'inside';
}

// A small local-app projection of the same owner-bound, latest-revision ledger.
// No competence-to-payment inference, FX, settlement inference or chat transport.
export function queryUpcomingFinancialForecast({ identity, records, now = new Date() }) {
  const empty = { source: 'persisted_financial_ledger', horizonDays: 30, events: [], hasMore: false };
  const results = ['item', 'day', 'week', 'month'].map(aggregationLevel => queryFinancialHistory({
    identity, records, aggregationLevel, periodStart: '0001-01-01', periodEnd: '9999-12-31',
  }));
  if (results.some(result => result.access !== 'allowed')) return { ...empty, access: 'denied' };
  if (!Number.isFinite(now.getTime())) return { ...empty, access: 'allowed', state: 'unavailable' };
  let incomplete = false;
  const rawGroups = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (record?.ownerId && record.ownerId !== identity.ownerId) continue;
    const id = typeof record?.id === 'string' ? record.id : null;
    const group = rawGroups.get(id) || []; group.push(record); rawGroups.set(id, group);
  }
  for (const rejected of results.flatMap(result => result.rejected || [])) {
    const group = rawGroups.get(rejected.id) || [];
    const ordered = group.every(record => Number.isSafeInteger(record?.revision) && record.revision > 0);
    const latest = ordered ? Math.max(...group.map(record => record.revision)) : null;
    if (!group.length || group.filter(record => !ordered || record.revision === latest).some(record => paymentScope(record, now) !== 'outside')) incomplete = true;
  }
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
  const events = [];
  for (const record of forecasts) {
    const scope = paymentScope(record, now);
    if (scope === 'outside') continue;
    if (scope === 'unknown' || ambiguous.has(record.id)) { incomplete = true; continue; }
    if (currencyMinorDigits(record.currency) === null) { incomplete = true; continue; }
    const date = record.expectedPaymentDate, timezone = record.expectedPaymentTimezone;
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
