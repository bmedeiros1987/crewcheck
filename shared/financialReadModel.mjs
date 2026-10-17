// Query-only contract. The caller supplies identity from its authenticated host,
// never from a chat prompt, document, URL, or browser-submitted owner field.
const statuses = new Set(['forecast', 'statement_reported', 'payment_confirmed']);
const levels = new Set(['item', 'day', 'week', 'month']);
const string = value => typeof value === 'string' && value.trim().length > 0;
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function monthlyCredit(record) {
  if(record.amountBasis!=='net_credit')return false;
  if(record.amountMinor!==null&&record.amountMinor<0)return false;
  if(record.paymentDate!==undefined&&!date(record.paymentDate))return false;
  const month=record.periodStart.slice(0,7),last=new Date(month+'-01T12:00:00Z');
  last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);
  if(record.aggregationLevel!=='month'||record.periodStart!==month+'-01'||record.periodEnd!==last.toISOString().slice(0,10))return false;
  if(record.paymentDate&&record.paymentDate.slice(0,7)!==month)return false;
  if(record.category==='vacation')return true;
  const serial=value=>typeof value==='string'&&date(value+'-01')?Number(value.slice(0,4))*12+Number(value.slice(5,7)):null;
  const operational=serial(record.operationalMonth),payroll=serial(record.payrollMonth),credit=serial(record.expectedCreditMonth);
  return operational!==null&&payroll===operational+1&&credit===payroll+1&&record.rateMonth===record.payrollMonth
    && (record.paymentDate||record.expectedCreditMonth===month)
    && (record.status!=='forecast'||!record.paymentDate);
}
function valid(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: record.timezone }); } catch { return false; }
  return string(record.id) && string(record.ownerId)
    && Number.isSafeInteger(record.revision) && record.revision >= 1
    && date(record.periodStart) && date(record.periodEnd) && record.periodStart <= record.periodEnd
    && typeof record.currency === 'string' && /^[A-Z]{3}$/.test(record.currency) && statuses.has(record.status)
    && (record.amountMinor === null || Number.isSafeInteger(record.amountMinor))
    && string(record.sourceId) && string(record.timezone)
    && ['allowance', 'advance', 'payroll', 'vacation'].includes(record.category)
    && levels.has(record.aggregationLevel)
    && (record.aggregationLevel!=='month'||['payroll','vacation'].includes(record.category))
    && (!['payroll','vacation'].includes(record.category)||monthlyCredit(record))
    && (record.ruleVersion === undefined || string(record.ruleVersion))
    && (record.status !== 'forecast' || string(record.ruleVersion))
    && (!record.evidence || (record.evidence.kind === 'settlement' && string(record.evidence.reference)))
    && (record.status !== 'payment_confirmed' || (
      record.evidence?.kind === 'settlement' && string(record.evidence.reference) && date(record.paymentDate)))
    && (record.paymentDate === undefined || date(record.paymentDate));
}

function project(raw) {
  return Object.fromEntries(['id', 'ownerId', 'revision', 'periodStart', 'periodEnd',
    'currency', 'timezone', 'amountMinor', 'category', 'status', 'sourceId', 'paymentDate', 'ruleVersion', 'aggregationLevel',
    ...(['payroll','vacation'].includes(raw.category)?['amountBasis']:[]),
    ...(raw.category==='payroll'?['operationalMonth','payrollMonth','rateMonth','expectedCreditMonth']:[])]
    .filter(key => raw[key] !== undefined).map(key => [key, raw[key]]));
}
function signature(raw) {
  // Evidence is part of duplicate identity, although its private reference is
  // not exposed in the DTO. This is structural comparison, not bank verification.
  return JSON.stringify([project(raw), raw.evidence?.kind || null, raw.evidence?.reference || null]);
}

export function queryFinancialHistory({ identity, records, periodStart, periodEnd, aggregationLevel = 'week' }) {
  if (identity?.authenticated !== true || identity.role !== 'owner'
      || !string(identity.ownerId)) {
    return { access: 'denied', records: [], history: [], totals: [] };
  }
  if (!date(periodStart) || !date(periodEnd) || periodStart > periodEnd || !levels.has(aggregationLevel)) {
    return { access: 'allowed', state: 'invalid_period', records: [], history: [], totals: [] };
  }
  const groups = new Map();
  const rejected = [];
  const conflicts = new Set();
  let historyRejected = 0;
  if (!Array.isArray(records)) rejected.push({ id: null, reason: 'invalid_collection' });
  for (const raw of Array.isArray(records) ? records : []) {
    // Other owners' records never enter the diagnostics or output.
    if (string(raw?.ownerId) && raw.ownerId !== identity.ownerId) continue;
    if (!raw || raw.ownerId !== identity.ownerId || !string(raw.id)) {
      rejected.push({ id: null, reason: 'unattributed_or_invalid_record' });
      continue;
    }
    const group = groups.get(raw.id) || [];
    group.push(raw);
    groups.set(raw.id, group);
  }
  const all = [];
  const latest = new Map();
  for (const [id, group] of groups) {
    const invalidOrder = group.some(raw => !Number.isSafeInteger(raw.revision) || raw.revision < 1);
    const revision = invalidOrder ? null : group.reduce((max, raw) => Math.max(max, raw.revision), 0);
    const current = group.filter(raw => raw.revision === revision);
    const currentInvalid = invalidOrder || current.some(raw => !valid(raw));
    const currentConflict = !currentInvalid && new Set(current.map(signature)).size > 1;
    if (currentConflict) conflicts.add(id);
    if (currentInvalid || currentConflict) {
      rejected.push({ id, revision, reason: invalidOrder ? 'unorderable_revision'
        : currentInvalid ? 'invalid_latest_revision' : 'conflicting_latest_revision' });
    } else latest.set(id, project(current[0]));
    // Preserve unambiguous valid history, while retaining rejection diagnostics.
    const historical = new Map();
    const badRevisions = new Set();
    for (const raw of group) {
      if (!valid(raw)) { historyRejected += 1; continue; }
      if (historical.has(raw.revision) && signature(historical.get(raw.revision)) !== signature(raw)) badRevisions.add(raw.revision);
      historical.set(raw.revision, raw);
    }
    for (const [version, raw] of historical) if (!badRevisions.has(version)) all.push(project(raw));
    historyRejected += badRevisions.size;
  }
  // A statement total cannot be prorated across a partial competence.
  let selected = [...latest.values()].filter(record => record.aggregationLevel === aggregationLevel
    && record.periodStart >= periodStart && record.periodEnd <= periodEnd)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart) || a.id.localeCompare(b.id));
  // Day/week comparisons keep forecast and statement statuses separate. Monthly
  // payroll/vacation net credits instead represent one cash-credit lifecycle:
  // distinct IDs across settlement statuses cannot establish supersession.
  if (aggregationLevel !== 'item') {
    const scope = new Map();
    const ambiguous = new Set();
    for (const record of selected) {
      const lifecycleStatus = record.aggregationLevel === 'month' && ['payroll', 'vacation'].includes(record.category)
        ? 'monthly_credit_lifecycle' : record.status;
      const key = JSON.stringify([record.sourceId, record.periodStart, record.periodEnd, record.currency, lifecycleStatus, record.category]);
      if (scope.has(key)) { ambiguous.add(record.id); ambiguous.add(scope.get(key)); }
      scope.set(key, record.id);
    }
    for (const id of ambiguous) rejected.push({ id, reason: 'duplicate_aggregate_scope' });
    selected = selected.filter(record => !ambiguous.has(record.id));
  }
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
  const incomplete = rejected.length > 0 || [...totals.values()].some(total => total.missingAmounts > 0);
  return { access: 'allowed', state: incomplete ? 'incomplete' : selected.length ? 'available' : 'no_data',
    publishable: !incomplete && selected.length > 0, aggregationLevel,
    records: selected, history: all.filter(record => record.aggregationLevel === aggregationLevel
      && (selectedIds.has(record.id) || rejected.some(item => item.id === record.id))
      && record.periodStart >= periodStart && record.periodEnd <= periodEnd)
      .sort((a, b) => a.id.localeCompare(b.id) || a.revision - b.revision),
    totals: [...totals.values()].map(total => ({ ...total, amountMinor: incomplete ? null : total.amountMinor })),
    conflicts: conflicts.size, rejected, historyRejected };
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
      || typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency) || !string(sourceId) || !string(ruleVersion)) {
    return { state: 'not_calculable', differenceMinor: null,
      reason: 'Valor, moeda, origem ou versão da regra ausente/inválida' };
  }
  const differenceMinor = calculatedMinor - reportedMinor;
  if (!Number.isSafeInteger(differenceMinor)) return { state: 'not_calculable', differenceMinor: null, reason: 'Limite numérico excedido' };
  return { state: differenceMinor === 0 ? 'matched' : 'different', calculatedMinor,
    reportedMinor, differenceMinor, currency, sourceId: sourceId.trim(), ruleVersion: ruleVersion.trim() };
}
