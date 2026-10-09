import { getStoredUser, getToken } from './authClient';
import { payrollMonthBounds, payrollCompetences, PAYROLL_CYCLE_SOURCE } from './financialPayrollPeriods';
export type StatementKind = 'per_diem' | 'payroll';
export type LearningConfidence = 'high' | 'medium' | 'review';

export interface LearnedRate {
  ownerId?: string;
  revision?: number;
  valueOrigin?: 'printed' | 'derived';
  payrollCompetence?: string;
  cycleSource?: typeof PAYROLL_CYCLE_SOURCE;
  key: string;
  label: string;
  value: number;
  unit: 'meal' | 'hour' | 'km' | 'month' | 'amount';
  currency: 'BRL' | 'USD' | 'EUR' | 'GBP';
  effectiveFrom: string;
  effectiveTo?: string;
  sourceDocument: string;
  sourceFingerprint: string;
  confidence: LearningConfidence;
  confirmed: boolean;
}

export interface StatementLearningResult {
  kind: StatementKind;
  competence: string;
  paymentDate?: string;
  periodStart?: string;
  periodEnd?: string;
  employeeName?: string;
  rates: LearnedRate[];
  totals: Record<string, number>;
  warnings: string[];
}

const money = (raw: string) => Number(raw.replace(/\./g, '').replace(',', '.'));
const decimal = (raw: string) => raw.includes(',')
  ? Number(raw.replace(/\./g, '').replace(',', '.'))
  : Number(raw.replace(/\s+/g, ''));
const isoDate = (raw: string) => {
  const m = raw.match(/(\d{2})[/.\-](\d{2})[/.\-](\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

function fingerprint(text: string): string {
  let hash = 2166136261;
  for (const ch of text.replace(/\s+/g, ' ').trim()) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function rate(
  key: string,
  label: string,
  value: number,
  unit: LearnedRate['unit'],
  effectiveFrom: string,
  sourceDocument: string,
  sourceFingerprint: string,
  confidence: LearningConfidence = 'high',
  effectiveTo?: string,
): LearnedRate {
  return {
    key,
    label,
    value,
    unit,
    currency: 'BRL',
    effectiveFrom,
    ...(effectiveTo ? { effectiveTo } : {}),
    sourceDocument,
    sourceFingerprint,
    confidence,
    confirmed: false,
  };
}

export function detectFinancialStatement(text: string): StatementKind | null {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (normalized.includes('DEMONSTRATIVO DE DIARIAS')) return 'per_diem';
  if (normalized.includes('DEMONSTRATIVO DE PAGAMENTO') && normalized.includes('RUBRICA')) return 'payroll';
  return null;
}

export function learnPerDiemStatement(text: string, sourceDocument: string): StatementLearningResult {
  const period = text.match(/De\s+(\d{4}-\d{2}-\d{2})\s+at[eé]\s+(\d{4}-\d{2}-\d{2})/i);
  const payment = text.match(/Pagamento\s+em\s+(\d{4}-\d{2}-\d{2})/i);
  const start = period?.[1] || '';
  const end = period?.[2] || '';
  const fp = fingerprint(text);
  const observations = new Map<string, number[]>();
  const aliases: Record<string, string> = { CAFE: 'breakfast', ALMOCO: 'lunch', JANTAR: 'dinner', CEIA: 'supper' };
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const match of normalized.matchAll(/\b(CAFE|ALMOCO|JANTAR|CEIA)\b[^\n\r]{0,40}?R\$\s*([\d.]+,\d{2})/gi)) {
    const key = aliases[match[1].toUpperCase()];
    const values = observations.get(key) || [];
    values.push(money(match[2]));
    observations.set(key, values);
  }
  const rates: LearnedRate[] = [];
  const conflictingMeals: string[] = [];
  for (const [key, values] of observations) {
    const counts = new Map<number, number>();
    values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    if (counts.size !== 1) { conflictingMeals.push(key); continue; }
    const selected = [...counts.keys()][0];
    if (Number.isFinite(selected)) rates.push(rate(
      `per_diem.${key}`,
      key,
      selected,
      'meal',
      start,
      sourceDocument,
      fp,
      'high',
      end || undefined,
    ));
  }
  const depositedTotals = new Set<number>();
  let invalidDepositedTotal = false;
  for (const marker of text.matchAll(/Total\s+depositado\b/gi)) {
    const tail = text.slice(marker.index! + marker[0].length);
    const candidate = tail.match(/^\s*:?\s*R\$\s*([+-]?\s*[\d.,]+)(?=$|\s|[;:()])/);
    const token = candidate?.[1] || '';
    const strict = /^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(token);
    const cents = strict ? Number(token.replace(/\./g, '').replace(',', '')) : NaN;
    if (!strict || !Number.isSafeInteger(cents) || cents < 0) invalidDepositedTotal = true;
    else depositedTotals.add(cents);
  }
  const warnings: string[] = [];
  if (!start || !end || !validDay(start) || !validDay(end) || start > end) warnings.push('Período completo inválido ou não identificado; revisão obrigatória.');
  if (conflictingMeals.length) warnings.push('Tarifas de alimentação divergentes; revisão obrigatória.');
  if (!rates.length) warnings.push('Nenhuma tarifa de alimentação identificada.');
  if (depositedTotals.size > 1) warnings.push('Totais depositados divergentes; revisão obrigatória.');
  if (invalidDepositedTotal) warnings.push('Total depositado com formato inválido; revisão obrigatória.');
  if (!depositedTotals.size) warnings.push('Total depositado não identificado.');
  const deposited = !invalidDepositedTotal && depositedTotals.size === 1 ? [...depositedTotals][0] / 100 : undefined;
  return { kind: 'per_diem', competence: start.slice(0, 7), periodStart: start || undefined, periodEnd: end || undefined, paymentDate: payment?.[1], rates, totals: deposited === undefined ? {} : { deposited }, warnings };
}

const PAYROLL_KEYS: Array<[RegExp, string, string, LearnedRate['unit']]> = [
  [/Sal[aá]rio\s+([\d.]+,\d{2})/i, 'salary.base', 'Salário-base', 'month'],
  [/([\d.]+,\d{2})\s+([\d.]+)\s+KM V CMS - D\s+([\d.]+,\d{2})/i, 'salary.dayKm', 'KM diurno', 'km'],
  [/([\d.]+,\d{2})\s+([\d.]+)\s+KM V CMS - N\s+([\d.]+,\d{2})/i, 'salary.nightKm', 'KM noturno', 'km'],
  [/([\d.]+,\d{2})\s+([\d.]+)\s+KM V CMS - DFS - D\s+([\d.]+,\d{2})/i, 'salary.dfsDayKm', 'KM DFS diurno', 'km'],
  [/([\d.]+,\d{2})\s+([\d.]+)\s+KM V CMS - DFS - N\s+([\d.]+,\d{2})/i, 'salary.dfsNightKm', 'KM DFS noturno', 'km'],
];

export function learnPayrollStatement(text: string, sourceDocument: string): StatementLearningResult {
  const competence = text.match(/Compet[eê]ncia[^\n\r]*?(\d{2}\/\d{4})/i)?.[1];
  const effectiveFrom = competence ? `${competence.slice(3)}-${competence.slice(0, 2)}-01` : '';
  const fp = fingerprint(text);
  const rates: LearnedRate[] = [];
  for (const [pattern, key, label, unit] of PAYROLL_KEYS) {
    const m = text.match(pattern);
    if (!m) continue;
    const quantity = unit === 'km' ? decimal(m[1]) : 0;
    const statedRate = unit === 'km' ? decimal(m[2]) : 0;
    const derivedRate = unit === 'km' && quantity > 0 ? Number((money(m[3]) / quantity).toFixed(6)) : NaN;
    const statedRateMatchesTotal = Number.isFinite(derivedRate) && Math.abs(statedRate - derivedRate) <= Math.max(0.0001, derivedRate * 0.02);
    const usePrintedRate = unit !== 'km' || (Number.isFinite(statedRate) && statedRate > 0 && statedRate <= 5 && statedRateMatchesTotal);
    const value = unit === 'km'
      ? usePrintedRate ? statedRate : derivedRate
      : money(m[1]);
    if (Number.isFinite(value) && value >= 0 && (unit !== 'km' || value <= 5)) rates.push({ ...rate(key, label, value, unit, effectiveFrom, sourceDocument, fp, !usePrintedRate ? 'review' : 'high'), valueOrigin: !usePrintedRate ? 'derived' : 'printed' });
  }
  for (const [pattern, key, label] of [
    [/([\d.,]+)\s+Horas Reserva - CMS\s+([\d.]+,\d{2})/i, 'salary.reserveHour', 'Hora de reserva'],
    [/([\d.,]+)\s+Horas Sobre Aviso - CMS\s+([\d.]+,\d{2})/i, 'salary.standbyHour', 'Hora de sobreaviso'],
  ] as const) {
    const m = text.match(pattern);
    const quantity = m ? decimal(m[1]) : 0;
    const hourlyValue = m && quantity > 0 ? Number((money(m[2]) / quantity).toFixed(6)) : NaN;
    if (Number.isFinite(hourlyValue)) rates.push({ ...rate(key, label, hourlyValue, 'hour', effectiveFrom, sourceDocument, fp, 'review'), valueOrigin: 'derived' });
  }
  const totals = text.match(/TOTAIS\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/i);
  const net = text.match(/L[ií]quido\s*\n?\s*(?:[\d.]+,\d{2}\s+)?([\d.]+,\d{2})/i);
  const warnings: string[] = [];
  if (!effectiveFrom) warnings.push('Competência não identificada; revisão obrigatória.');
  if (!rates.length) warnings.push('Nenhuma tarifa salarial identificada.');
  return {
    kind: 'payroll', competence: effectiveFrom.slice(0, 7), rates: rates.map(item => ({ ...item, effectiveTo: payrollMonthBounds(effectiveFrom.slice(0, 7))?.end })),
    totals: { gross: totals ? money(totals[1]) : 0, deductions: totals ? money(totals[2]) : 0, net: net ? money(net[1]) : 0 }, warnings,
  };
}

export function learnFinancialStatement(text: string, sourceDocument: string): StatementLearningResult {
  const kind = detectFinancialStatement(text);
  if (kind === 'per_diem') return learnPerDiemStatement(text, sourceDocument);
  if (kind === 'payroll') return learnPayrollStatement(text, sourceDocument);
  throw new Error('O arquivo não foi reconhecido como demonstrativo de diárias ou de pagamento.');
}

export function mergeConfirmedRates(current: LearnedRate[], incoming: LearnedRate[]): LearnedRate[] {
  const result = [...current];
  for (const item of incoming.filter(entry => entry.confirmed)) {
    const scope = result.filter(entry => entry.key === item.key && entry.effectiveFrom === item.effectiveFrom && entry.currency === item.currency);
    if (scope.some(entry => entry.value === item.value && entry.effectiveTo === item.effectiveTo && entry.currency === item.currency && entry.sourceFingerprint === item.sourceFingerprint)) continue;
    const revision = scope.reduce((max, entry) => Math.max(max, entry.revision || 1), 0) + 1;
    result.push({ ...item, revision });
  }
  return result.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.key.localeCompare(b.key) || (a.revision || 1) - (b.revision || 1));
}
export function rateAt(rates: LearnedRate[], key: string, date: string, currency?: LearnedRate['currency']): LearnedRate | null {
  // Select the revision first. A shortened correction must not resurrect a superseded tariff.
  const latest = rates.filter(entry => entry.confirmed && entry.key === key && (currency === undefined || entry.currency === currency) && entry.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || (b.revision || 1) - (a.revision || 1))[0];
  return latest?.effectiveTo && latest.effectiveTo >= date ? latest : null;
}

// Legacy values remain untouched, but their unknown owner is never inferred or migrated.
export const FINANCIAL_RATES_STORAGE_KEY = 'crewcheck_financial_learned_rates_v1';
const OWNER_KEY = 'crewcheck_financial_learned_rates_v2:';
export function financialRateOwner(): string | null {
  try {
    const user = getStoredUser();
    return getToken() && typeof user?.id === 'string' && user.id.trim() && !['visitor', 'guest'].includes(user.role || '') ? user.id : null;
  } catch { return null; }
}
export function financialRateSession(): string | null {
  const owner = financialRateOwner();
  return owner ? owner + ':' + getToken() : null;
}
function validDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(value + 'T12:00:00Z').getTime()) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
}
function boundedRate(item: LearnedRate): boolean {
  if (item?.revision !== undefined && (!Number.isSafeInteger(item.revision) || item.revision < 1)) return false;
  if (item?.cycleSource !== undefined || item?.payrollCompetence !== undefined) {
    const cycle = payrollCompetences(item.payrollCompetence || '', item.cycleSource!);
    const period = cycle && payrollMonthBounds(item.key === 'salary.base' ? cycle.fixedMonth : cycle.operationalVariableMonth);
    if (!period || item.effectiveFrom !== period.start || item.effectiveTo !== period.end) return false;
  }
  return item?.confirmed === true && item.valueOrigin !== 'derived' && Number.isFinite(item.value) && item.value >= 0
    && ['BRL', 'USD', 'EUR', 'GBP'].includes(item.currency)
    && item.unit === (item.key?.startsWith('per_diem.') ? 'meal' : item.key === 'salary.base' ? 'month' : ['salary.reserveHour','salary.standbyHour'].includes(item.key) ? 'hour' : 'km')
    && ['per_diem.breakfast','per_diem.lunch','per_diem.dinner','per_diem.supper','salary.base','salary.dayKm','salary.nightKm','salary.dfsDayKm','salary.dfsNightKm','salary.reserveHour','salary.standbyHour'].includes(item.key)
    && typeof item.sourceDocument === 'string' && Boolean(item.sourceDocument.trim())
    && typeof item.sourceFingerprint === 'string' && Boolean(item.sourceFingerprint.trim())
    && typeof item.effectiveFrom === 'string' && validDay(item.effectiveFrom)
    && typeof item.effectiveTo === 'string' && validDay(item.effectiveTo) && item.effectiveFrom <= item.effectiveTo;
}
export function readConfirmedFinancialRates(): LearnedRate[] {
  try {
    const owner = financialRateOwner();
    if (!owner) return [];
    const envelope = JSON.parse(localStorage.getItem(OWNER_KEY + encodeURIComponent(owner)) || 'null');
    if (envelope?.version !== 2 || envelope.ownerId !== owner || !Array.isArray(envelope.rates)) return [];
    if (envelope.rates.some((entry: LearnedRate) => entry?.ownerId !== owner || !boundedRate(entry))) return [];
    const seen = new Map<string, string>();
    for (const entry of envelope.rates as LearnedRate[]) {
      const key = [entry.key, entry.currency, entry.effectiveFrom, entry.revision || 1].join(':');
      const signature = JSON.stringify([entry.value, entry.unit, entry.effectiveTo, entry.sourceFingerprint]);
      if (seen.has(key) && seen.get(key) !== signature) return [];
      seen.set(key, signature);
    }
    return envelope.rates;
  } catch { return []; }
}
export function saveConfirmedFinancialRates(rates: LearnedRate[], expectedSession = financialRateSession()): boolean {
  try {
    const owner = financialRateOwner();
    if (!owner || !expectedSession || expectedSession !== financialRateSession() || !Array.isArray(rates)
      || rates.some(item => !boundedRate(item) || (item.ownerId !== undefined && item.ownerId !== owner))) return false;
    const existingRaw = localStorage.getItem(OWNER_KEY + encodeURIComponent(owner));
    const existing = readConfirmedFinancialRates();
    if (existingRaw !== null) {
      const envelope = JSON.parse(existingRaw);
      // Preserve malformed/conflicting archives for explicit recovery, never replace them silently.
      if (envelope?.version !== 2 || envelope.ownerId !== owner || !Array.isArray(envelope.rates) || (envelope.rates.length && !existing.length)) return false;
      if (existing.some(old => !rates.some(item => JSON.stringify(item) === JSON.stringify(old)))) return false;
    }
    const revisions = new Map<string, string>();
    for (const item of rates) {
      const key = [item.key, item.currency, item.effectiveFrom, item.revision || 1].join(':');
      const signature = JSON.stringify([item.value, item.unit, item.effectiveTo, item.sourceFingerprint]);
      if (revisions.has(key) && revisions.get(key) !== signature) return false;
      revisions.set(key, signature);
    }
    const bound = rates.map(item => ({ ...item, ownerId: owner }));
    localStorage.setItem(OWNER_KEY + encodeURIComponent(owner), JSON.stringify({ version: 2, ownerId: owner, rates: bound }));
    window.dispatchEvent(new Event('crewcheck:financial-config-changed'));
    return true;
  } catch { return false; }
}
/** Called only after the owner explicitly confirms this company cycle for the reviewed document. */
export function applyReviewedPayrollCycle(result: StatementLearningResult): LearnedRate[] {
  const cycle = result.kind === 'payroll' ? payrollCompetences(result.competence, PAYROLL_CYCLE_SOURCE) : null;
  if (!cycle) return [];
  return result.rates.map(item => {
    const period = payrollMonthBounds(item.key === 'salary.base' ? cycle.fixedMonth : cycle.operationalVariableMonth)!;
    return { ...item, effectiveFrom: period.start, effectiveTo: period.end, payrollCompetence: cycle.payrollMonth, cycleSource: cycle.source };
  });
}
export function confirmedRateValueAt(key: string, date: string, currency: LearnedRate['currency'] = 'BRL'): number | null {
  const found = rateAt(readConfirmedFinancialRates(), key, date, currency);
  return found && Number.isFinite(Number(found.value)) ? Number(found.value) : null;
}

export function reviewedPayrollCycleForOperationalMonth(month: string) {
  const candidates = readConfirmedFinancialRates().filter(item => item.currency === 'BRL' && item.key.startsWith('salary.') && item.key !== 'salary.base' && item.cycleSource === PAYROLL_CYCLE_SOURCE && item.effectiveFrom.slice(0, 7) === month && item.payrollCompetence);
  const latest = candidates.sort((a,b) => (a.revision || 1) - (b.revision || 1)).at(-1);
  if (!latest) return null;
  const cycle = payrollCompetences(latest.payrollCompetence!, PAYROLL_CYCLE_SOURCE);
  return cycle?.operationalVariableMonth === month ? { ...cycle, sourceFingerprint: latest.sourceFingerprint } : null;
}
