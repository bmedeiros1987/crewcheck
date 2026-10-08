// Query-only contract. The caller supplies identity from its authenticated host,
// never from a chat prompt, document, URL, or browser-submitted owner field.
const statuses = new Set(['forecast', 'statement_reported', 'payment_confirmed']);
function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(value + 'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function valid(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: record.timezone }); } catch { return false; }
  return typeof record.id === 'string' && record.id.length > 0
    && typeof record.ownerId === 'string' && record.ownerId.length > 0
    && Number.isSafeInteger(record.revision) && record.revision >= 1
    && date(record.periodStart) && date(record.periodEnd) && record.periodStart <= record.periodEnd
    && /^[A-Z]{3}$/.test(record.currency || '') && statuses.has(record.status)
    && (record.amountMinor === null || Number.isSafeInteger(record.amountMinor))
    && typeof record.sourceId === 'string' && record.sourceId.length > 0
    && typeof record.timezone === 'string' && record.timezone.length > 0
    && ['allowance', 'advance'].includes(record.category)
    && (record.status !== 'forecast' || (typeof record.ruleVersion === 'string' && record.ruleVersion.length > 0))
    && (record.status !== 'payment_confirmed' || (
      record.evidence?.kind === 'settlement' && typeof record.evidence?.reference === 'string'
      && record.evidence.reference.length > 0 && date(record.paymentDate)))
    && (!record.paymentDate || date(record.paymentDate));
}

export function queryFinancialHistory({ identity, records, periodStart, periodEnd }) {
  if (identity?.authenticated !== true || identity.role !== 'owner'
      || typeof identity.ownerId !== 'string' || !identity.ownerId) {
    return { access: 'denied', records: [], history: [], totals: [] };
  }
  if (!date(periodStart) || !date(periodEnd) || periodStart > periodEnd) {
    return { access: 'allowed', state: 'invalid_period', records: [], history: [], totals: [] };
  }
  const revisions = new Map();
  const conflicts = new Set();
  for (const raw of Array.isArray(records) ? records : []) {
    if (!valid(raw) || raw.ownerId !== identity.ownerId) continue;
    // Project only permitted financial fields; never forward arbitrary document payloads.
    const record = Object.fromEntries(['id', 'ownerId', 'revision', 'periodStart', 'periodEnd',
      'currency', 'timezone', 'amountMinor', 'category', 'status', 'sourceId', 'paymentDate', 'ruleVersion']
      .filter(key => raw[key] !== undefined).map(key => [key, raw[key]]));
    const key = JSON.stringify([record.id, record.revision]);
    if (revisions.has(key) && JSON.stringify(revisions.get(key)) !== JSON.stringify(record)) conflicts.add(record.id);
    revisions.set(key, record);
  }
  const all = [...revisions.values()].filter(record => !conflicts.has(record.id));
  const latest = new Map();
  for (const record of all) {
    if (!latest.has(record.id) || latest.get(record.id).revision < record.revision) latest.set(record.id, record);
  }
  // A statement total cannot be prorated across a partial competence.
  const selected = [...latest.values()].filter(record => record.periodStart >= periodStart && record.periodEnd <= periodEnd)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart) || a.id.localeCompare(b.id));
  const selectedIds = new Set(selected.map(record => record.id));
  const totals = new Map();
  for (const record of selected) {
    const key = JSON.stringify([record.currency, record.category, record.status]);
    const total = totals.get(key) || { currency: record.currency, category: record.category,
      status: record.status, amountMinor: 0, missingAmounts: 0 };
    if (record.amountMinor === null) total.missingAmounts += 1;
    else total.amountMinor += record.amountMinor;
    if (!Number.isSafeInteger(total.amountMinor)) throw new RangeError('Financial total exceeds safe integer range');
    totals.set(key, total);
  }
  return { access: 'allowed', state: selected.length ? 'available' : 'no_data',
    records: selected, history: all.filter(record => selectedIds.has(record.id))
      .sort((a, b) => a.id.localeCompare(b.id) || a.revision - b.revision),
    totals: [...totals.values()].map(total => ({ ...total, amountMinor: total.missingAmounts ? null : total.amountMinor })),
    conflicts: conflicts.size };
}

export function financialStatusLabel(status) {
  return { forecast: 'Previsão — não confirma pagamento',
    statement_reported: 'Informado no demonstrativo — sem confirmação bancária',
    payment_confirmed: 'Pagamento confirmado por registro de liquidação' }[status] || 'Estado não confirmado';
}

// Inputs must already be grouped by the canonical producer at item/day/week.
// No rate inference, currency conversion, prorating, or adjustment to fit a PDF.
export function reconcileFinancialAmounts({ calculatedMinor, reportedMinor, currency, sourceId, ruleVersion }) {
  if (!Number.isSafeInteger(calculatedMinor) || !Number.isSafeInteger(reportedMinor)
      || !/^[A-Z]{3}$/.test(currency || '') || !sourceId || !ruleVersion) {
    return { state: 'not_calculable', differenceMinor: null,
      reason: 'Valor, moeda, origem ou versão da regra ausente/inválida' };
  }
  const differenceMinor = calculatedMinor - reportedMinor;
  if (!Number.isSafeInteger(differenceMinor)) return { state: 'not_calculable', differenceMinor: null, reason: 'Limite numérico excedido' };
  return { state: differenceMinor === 0 ? 'matched' : 'different', calculatedMinor,
    reportedMinor, differenceMinor, currency, sourceId, ruleVersion };
}
