import { draftPayrollDsrEvidence, validPayrollDsrEvidence, payrollDsrContext, type PayrollDsrEvidence } from './payrollDsrEvidence';
import { extractPrivatePayroll, type PayrollPage, type PrivatePayrollExtraction, type PayrollSourceOrigin } from './privatePayrollExtraction';
import { getStoredUser, getToken } from './authClient';
import { payrollMonthBounds, payrollCompetences, PAYROLL_CYCLE_SOURCE } from './financialPayrollPeriods';
export type StatementKind = 'per_diem' | 'payroll';
export type LearningConfidence = 'high' | 'medium' | 'review';

export interface PayrollRateEvidence { page: number; origin: PayrollSourceOrigin; line: number; field: 'monthlyBase' | 'rate'; value: number }
export interface LearnedRate {
  payrollDsrEvidence?: PayrollDsrEvidence;
  evidence?: PayrollRateEvidence[];
  ownerId?: string;
  revision?: number;
  valueOrigin?: 'printed' | 'derived' | 'owner_confirmed';
  perDiemReview?: { breakfastQuarter: boolean; taxiQuarter: boolean };
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
  payrollDsrDraft?: PayrollDsrEvidence;
  payrollExtraction?: PrivatePayrollExtraction;
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
  const paymentDates = new Set<string>();
  let invalidPaymentDate = false;
  for (const marker of text.matchAll(/\bPagamento\s+em\b/gi)) {
    const candidate = text.slice(marker.index! + marker[0].length).match(/^\s*(\d{4}-\d{2}-\d{2})(?=$|\s|[;:()])/);
    if (!candidate || !validDay(candidate[1])) invalidPaymentDate = true;
    else paymentDates.add(candidate[1]);
  }
  const paymentIssue = invalidPaymentDate || paymentDates.size > 1;
  const paymentDate = !paymentIssue && paymentDates.size === 1 ? [...paymentDates][0] : undefined;
  const start = period?.[1] || '';
  const end = period?.[2] || '';
  const fp = fingerprint(text);
  const observations = new Map<string, number[]>();
  const aliases: Record<string, string> = { CAFE: 'breakfast', ALMOCO: 'lunch', JANTAR: 'dinner', CEIA: 'supper', TAXI: 'taxi' };
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let invalidRate = false;
  for (const match of normalized.matchAll(/\b(CAFE|ALMOCO|JANTAR|CEIA|TAXI)\b[^\n\r]{0,40}?R\$[^\S\n\r]*([^\s;:()]+)/gi)) {
    const key = aliases[match[1].toUpperCase()];
    const token = match[2];
    const strict = /^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(token);
    const cents = strict ? Number(token.replace(/\./g, '').replace(',', '')) : NaN;
    if (!strict || !Number.isSafeInteger(cents) || cents < 0) { invalidRate = true; continue; }
    const values = observations.get(key) || [];
    values.push(cents / 100);
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
      key === 'taxi' ? 'amount' : 'meal',
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
    const candidate = tail.match(/^\s*(?:na\s+data\s+(\d{4}-\d{2}-\d{2})\s*)?:?\s*R\$\s*([+-]?\s*[\d.,]+)(?=$|\s|[;:()])/i);
    const depositDate = candidate?.[1];
    if (depositDate) {
      // Dated deposits belong to the declared payment, not historical advances.
      // Never guess the current payment from a different/invalid deposit date.
      if (!validDay(depositDate) || !paymentDate || depositDate > paymentDate) {
        invalidDepositedTotal = true;
        continue;
      }
      if (depositDate < paymentDate) continue;
    }
    const token = candidate?.[2] || '';
    const strict = /^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(token);
    const cents = strict ? Number(token.replace(/\./g, '').replace(',', '')) : NaN;
    if (!strict || !Number.isSafeInteger(cents) || cents < 0) invalidDepositedTotal = true;
    else depositedTotals.add(cents);
  }
  const warnings: string[] = [];
  if (!start || !end || !validDay(start) || !validDay(end) || start > end) warnings.push('Período completo inválido ou não identificado; revisão obrigatória.');
  if (paymentIssue) warnings.push('Datas de pagamento divergentes ou inválidas; revisão obrigatória.');
  if (invalidRate) warnings.push('Tarifa de diária com formato inválido; revisão obrigatória.');
  if (conflictingMeals.length) warnings.push('Tarifas de diárias divergentes; revisão obrigatória.');
  if (!rates.length) warnings.push('Nenhuma tarifa de diária identificada.');
  if (depositedTotals.size > 1) warnings.push('Totais depositados divergentes; revisão obrigatória.');
  if (invalidDepositedTotal) warnings.push('Total depositado com formato inválido; revisão obrigatória.');
  if (!depositedTotals.size) warnings.push('Total depositado não identificado.');
  const deposited = !paymentIssue && !invalidDepositedTotal && depositedTotals.size === 1 ? [...depositedTotals][0] / 100 : undefined;
  return { kind: 'per_diem', competence: start.slice(0, 7), periodStart: start || undefined, periodEnd: end || undefined, paymentDate, rates, totals: deposited === undefined ? {} : { deposited }, warnings };
}

const PAYROLL_KEYS: Array<[RegExp, string, string, LearnedRate['unit']]> = [
  [/([\d.]+,\d{2})\s+([\d.]+)\s+KM V CMS - D\s+([\d.]+,\d{2})/i, 'salary.dayKm', 'KM diurno', 'km'],
  [/([\d.]+,\d{2})\s+([\d.]+)\s+KM V CMS - N\s+([\d.]+,\d{2})/i, 'salary.nightKm', 'KM noturno', 'km'],
  [/([\d.]+,\d{2})\s+([\d.]+)\s+KM V CMS - DFS - D\s+([\d.]+,\d{2})/i, 'salary.dfsDayKm', 'KM DFS diurno', 'km'],
  [/([\d.]+,\d{2})\s+([\d.]+)\s+KM V CMS - DFS - N\s+([\d.]+,\d{2})/i, 'salary.dfsNightKm', 'KM DFS noturno', 'km'],
];

export function learnPayrollStatement(text: string, sourceDocument: string, pages?: readonly PayrollPage[]): StatementLearningResult {
  const payrollExtraction = extractPrivatePayroll(pages ?? text);
  const competence = payrollExtraction.competence.state === 'candidate' ? payrollExtraction.competence.candidates[0].value : undefined;
  const effectiveFrom = competence ? `${competence}-01` : '';
  const fp = fingerprint(text);
  const evidencePages: readonly PayrollPage[] = pages ?? text.split('\f').map((content, index) => ({ page: index + 1, text: content, origin: 'document-logical' }));
  const rateEvidence = (match: RegExpMatchArray, value: number): PayrollRateEvidence[] => {
    // Match offsets refer to the coherent text supplied by the PDF extraction caller.
    const matchStart = match.index ?? -1;
    const matchEnd = matchStart + match[0].length;
    let pageOffset = 0;
    return evidencePages.flatMap(page => {
      let lineOffset = pageOffset;
      const refs = page.text.split(/\r?\n/).flatMap((line, index) => {
        const start = lineOffset; lineOffset += line.length + (page.text.slice(lineOffset - pageOffset + line.length).startsWith('\r\n') ? 2 : 1);
        return matchStart < start + line.length && matchEnd > start ? [{ page: page.page, origin: page.origin ?? 'document-logical', line: index + 1, field: 'rate' as const, value }] : [];
      });
      pageOffset += page.text.length + 1; // pages are joined with one form-feed
      return refs;
    });
  };
  const signedRateSource = (row: RegExpMatchArray) => /[-−]\s*(?:R\$\s*)?\d|\(\s*(?:R\$\s*)?\d|,\d{2}\s*[-−)]|,\d{2}\s*[DC]\b|\b(?:DEBITO|CREDITO)\b/i.test(row[0].normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const flagAmbiguousRate = (match: RegExpMatchArray, warning = 'Tarifa com sinal ou notação de débito/crédito; revisão obrigatória.') => {
    payrollExtraction.incomplete = true;
    payrollExtraction.warnings.push(warning);
    for (const ref of rateEvidence(match, 0)) {
      const page = evidencePages.find(page => page.page === ref.page && (page.origin ?? 'document-logical') === ref.origin);
      const source = { page: ref.page, origin: ref.origin, line: ref.line, field: 'rate', text: page?.text.split(/\r?\n/)[ref.line - 1] ?? '' };
      if (!payrollExtraction.unresolvedSources.some(old => old.page === source.page && old.origin === source.origin && old.line === source.line && old.field === source.field && old.text === source.text)) payrollExtraction.unresolvedSources.push(source);
    }
  };
  const rubricLabels: Record<string, RegExp> = {
    'salary.dayKm': /\bKM V CMS - D\b/i, 'salary.nightKm': /\bKM V CMS - N\b/i,
    'salary.dfsDayKm': /\bKM V CMS - DFS - D\b/i, 'salary.dfsNightKm': /\bKM V CMS - DFS - N\b/i,
    'salary.reserveHour': /Horas Reserva - CMS/i, 'salary.standbyHour': /Horas Sobre Aviso - CMS/i,
  };
  const sourceRows = [...text.matchAll(/[^\r\n\f]+/g)];
  const validateOccurrences = (matches: RegExpMatchArray[], key: string, label: string) => {
    const rows = sourceRows.filter(row => rubricLabels[key].test(row[0]));
    let invalid = false;
    // Inspect every labelled occurrence, including signed/parenthesized rows that the value regex cannot match.
    for (const row of rows) {
      if (signedRateSource(row)) { flagAmbiguousRate(row); invalid = true; }
      else {
        const rowMatches = matches.filter(match => match.index! >= row.index! && match.index! + match[0].length <= row.index! + row[0].length);
        const labelCount = [...row[0].matchAll(new RegExp(rubricLabels[key].source, 'gi'))].length;
        const match = rowMatches[0];
        const prefix = match ? row[0].slice(0, match.index! - row.index!) : '';
        const suffix = match ? row[0].slice(match.index! - row.index! + match[0].length) : '';
        if (rowMatches.length !== 1 || labelCount !== 1 || !/^\s*(?:\d+\s+)?$/.test(prefix) || suffix.trim()) {
          flagAmbiguousRate(row, `Tarifa ${label} com linha incompleta, múltiplas rubricas ou conteúdo não interpretado; revisão obrigatória.`); invalid = true;
        }
      }
    }
    const moneyToken = /^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/;
    const quantityToken = /^(?:\d+(?:[.,]\d+)?|\d{1,3}(?:\.\d{3})+,\d+)$/;
    const invalidTokens = matches.some(match => key.endsWith('Km')
      ? !moneyToken.test(match[1]) || !/^\d+(?:\.\d+)?$/.test(match[2]) || !moneyToken.test(match[3])
      : !quantityToken.test(match[1]) || !moneyToken.test(match[2]));
    if (invalidTokens) {
      rows.forEach(row => flagAmbiguousRate(row, `Tarifa ${label} com token numérico malformado; revisão obrigatória.`)); invalid = true;
    }
    if (new Set(matches.map(match => match[0].replace(/\s+/g, ' ').trim())).size > 1) {
      rows.forEach(row => flagAmbiguousRate(row, `Tarifa ${label} com evidências divergentes; revisão obrigatória.`)); invalid = true;
    }
    return invalid ? undefined : matches[0];
  };
  const rates: LearnedRate[] = [];
  const base = payrollExtraction.monthlyBase;
  if (effectiveFrom && !payrollExtraction.incomplete && (base.state === 'candidate' || base.state === 'zero') && base.candidates[0].value >= 0) {
    const candidate = base.candidates[0];
    rates.push({ ...rate('salary.base', 'Salário-base', candidate.value, 'month', effectiveFrom, sourceDocument, fp, 'review'), valueOrigin: 'printed', evidence: candidate.sources.map(source => ({ page: source.page, origin: source.origin, line: source.line, field: 'monthlyBase', value: candidate.value })) });
  }
  for (const [pattern, key, label, unit] of PAYROLL_KEYS) {
    const matches = [...text.matchAll(new RegExp(pattern.source, 'gi'))];
    const m = validateOccurrences(matches, key, label);
    if (!m) continue;
    const quantity = unit === 'km' ? decimal(m[1]) : 0;
    const statedRate = unit === 'km' ? decimal(m[2]) : 0;
    const derivedRate = unit === 'km' && quantity > 0 ? Number((money(m[3]) / quantity).toFixed(6)) : NaN;
    const statedRateMatchesTotal = Number.isFinite(derivedRate) && Math.abs(statedRate - derivedRate) <= Math.max(0.0001, derivedRate * 0.02);
    const usePrintedRate = unit !== 'km' || (Number.isFinite(statedRate) && statedRate > 0 && statedRate <= 5 && statedRateMatchesTotal);
    const value = unit === 'km'
      ? usePrintedRate ? statedRate : derivedRate
      : money(m[1]);
    if (Number.isFinite(value) && value >= 0 && (unit !== 'km' || value <= 5)) rates.push({ ...rate(key, label, value, unit, effectiveFrom, sourceDocument, fp, !usePrintedRate ? 'review' : 'high'), valueOrigin: !usePrintedRate ? 'derived' : 'printed', evidence: matches.flatMap(match => rateEvidence(match, value)) });
  }
  for (const [pattern, key, label] of [
    [/([\d.,]+)\s+Horas Reserva - CMS\s+([\d.]+,\d{2})/i, 'salary.reserveHour', 'Hora de reserva'],
    [/([\d.,]+)\s+Horas Sobre Aviso - CMS\s+([\d.]+,\d{2})/i, 'salary.standbyHour', 'Hora de sobreaviso'],
  ] as const) {
    const matches = [...text.matchAll(new RegExp(pattern.source, 'gi'))];
    const m = validateOccurrences(matches, key, label);
    const quantity = m ? decimal(m[1]) : 0;
    const hourlyValue = m && quantity > 0 ? Number((money(m[2]) / quantity).toFixed(6)) : NaN;
    if (Number.isFinite(hourlyValue)) rates.push({ ...rate(key, label, hourlyValue, 'hour', effectiveFrom, sourceDocument, fp, 'review'), valueOrigin: 'derived', evidence: matches.flatMap(match => rateEvidence(match, hourlyValue)) });
  }
  // The legacy rate pass can add ambiguity after the pure extractor checked the printed totals.
  if (payrollExtraction.incomplete) payrollExtraction.reconciliation = 'unavailable';
  const warnings: string[] = [...payrollExtraction.warnings];
  if (payrollExtraction.incomplete) warnings.push('Extração incompleta; revisão obrigatória antes de aplicar valores.');
  if (!effectiveFrom) warnings.push('Competência não identificada; revisão obrigatória.');
  if (!rates.length) warnings.push('Nenhuma tarifa salarial identificada.');
  const dsrOwner = financialRateOwner();
  const payrollDsrDraft = dsrOwner ? draftPayrollDsrEvidence({ ownerId:dsrOwner, sourceFingerprint:fp, sourceText:text, extraction:payrollExtraction, pages:pages || [{page:1,text,origin:'document-logical'}] }) : null;
  return {
    ...(payrollDsrDraft ? {payrollDsrDraft} : {}),
    payrollExtraction, paymentDate: payrollExtraction.creditDate.state === 'candidate' ? payrollExtraction.creditDate.candidates[0].value : undefined,
    kind: 'payroll', competence: effectiveFrom.slice(0, 7), rates: rates.filter(item => !!effectiveFrom && !payrollExtraction.incomplete && !!item.evidence?.length).map(item => ({ ...item, confidence: 'review', effectiveTo: payrollMonthBounds(effectiveFrom.slice(0, 7))?.end })),
    totals: Object.fromEntries(Object.entries(payrollExtraction.totals).filter(([, field]) => field.state === 'candidate' || field.state === 'zero').map(([key, field]) => [key, field.candidates[0].value])), warnings,
  };
}

export function learnFinancialStatement(text: string, sourceDocument: string, pages?: readonly PayrollPage[]): StatementLearningResult {
  const kind = detectFinancialStatement(text);
  if (kind === 'per_diem') return learnPerDiemStatement(text, sourceDocument);
  if (kind === 'payroll') return learnPayrollStatement(text, sourceDocument, pages);
  throw new Error('O arquivo não foi reconhecido como demonstrativo de diárias ou de pagamento.');
}

export function mergeConfirmedRates(current: LearnedRate[], incoming: LearnedRate[]): LearnedRate[] {
  const result = [...current];
  for (const item of incoming.filter(entry => entry.confirmed)) {
    const scope = result.filter(entry => entry.key === item.key && entry.effectiveFrom === item.effectiveFrom && entry.currency === item.currency);
    const latest = scope.slice().sort((a,b)=>(b.revision || 1)-(a.revision || 1))[0];
    const same=(entry:LearnedRate)=>entry.value===item.value&&entry.effectiveTo===item.effectiveTo&&entry.currency===item.currency&&entry.sourceFingerprint===item.sourceFingerprint&&JSON.stringify(entry.payrollDsrEvidence??null)===JSON.stringify(item.payrollDsrEvidence??null);
    if (item.valueOrigin==='owner_confirmed' ? latest&&same(latest) : scope.some(same)) continue;
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
  if (item?.payrollDsrEvidence !== undefined && (!validPayrollDsrEvidence(item.payrollDsrEvidence) || !item.key?.startsWith('salary.') || item.valueOrigin !== 'printed' || item.cycleSource !== PAYROLL_CYCLE_SOURCE || item.payrollCompetence !== item.payrollDsrEvidence.payrollMonth || item.sourceFingerprint !== item.payrollDsrEvidence.sourceFingerprint || (item.ownerId !== undefined && item.ownerId !== item.payrollDsrEvidence.ownerId))) return false;
  if (item?.perDiemReview !== undefined && (item.valueOrigin !== 'owner_confirmed'
    || typeof item.perDiemReview?.breakfastQuarter !== 'boolean' || typeof item.perDiemReview?.taxiQuarter !== 'boolean'
    || (item.key === 'per_diem.breakfast' && !item.perDiemReview.breakfastQuarter)
    || (item.key === 'per_diem.taxi' && !item.perDiemReview.taxiQuarter))) return false;
  if (item?.revision !== undefined && (!Number.isSafeInteger(item.revision) || item.revision < 1)) return false;
  if (item?.cycleSource !== undefined || item?.payrollCompetence !== undefined) {
    const cycle = payrollCompetences(item.payrollCompetence || '', item.cycleSource!);
    const period = cycle && payrollMonthBounds(item.key === 'salary.base' ? cycle.fixedMonth : cycle.operationalVariableMonth);
    if (!period || item.effectiveFrom !== period.start || item.effectiveTo !== period.end) return false;
  }
  return item?.confirmed === true && item.valueOrigin !== 'derived' && Number.isFinite(item.value) && item.value >= 0
    && ['BRL', 'USD', 'EUR', 'GBP'].includes(item.currency)
    && item.unit === (item.key === 'per_diem.taxi' ? 'amount' : item.key?.startsWith('per_diem.') ? 'meal' : item.key === 'salary.base' ? 'month' : ['salary.reserveHour','salary.standbyHour'].includes(item.key) ? 'hour' : 'km')
    && ['per_diem.breakfast','per_diem.lunch','per_diem.dinner','per_diem.supper','per_diem.taxi','salary.base','salary.dayKm','salary.nightKm','salary.dfsDayKm','salary.dfsNightKm','salary.reserveHour','salary.standbyHour'].includes(item.key)
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
      const signature = JSON.stringify([entry.value, entry.unit, entry.effectiveTo, entry.sourceFingerprint, entry.payrollDsrEvidence ?? null]);
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
      || rates.some(item => !boundedRate(item) || (item.ownerId !== undefined && item.ownerId !== owner) || (item.payrollDsrEvidence !== undefined && item.payrollDsrEvidence.ownerId !== owner))) return false;
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
      const signature = JSON.stringify([item.value, item.unit, item.effectiveTo, item.sourceFingerprint, item.payrollDsrEvidence ?? null]);
      if (revisions.has(key) && revisions.get(key) !== signature) return false;
      revisions.set(key, signature);
    }
    const bound = rates.map(item => {
      const { evidence, ...rest } = item;
      const safeEvidence = Array.isArray(evidence) ? evidence.filter(ref => Number.isInteger(ref?.page) && ref.page > 0 && Number.isInteger(ref?.line) && ref.line > 0
        && ['pdf-physical', 'document-logical'].includes(ref.origin) && ['monthlyBase', 'rate'].includes(ref.field) && Number.isFinite(ref.value))
        .map(ref => ({ page: ref.page, origin: ref.origin, line: ref.line, field: ref.field, value: ref.value })) : [];
      return { ...rest, ownerId: owner, ...(safeEvidence.length ? { evidence: safeEvidence } : {}) };
    });
    localStorage.setItem(OWNER_KEY + encodeURIComponent(owner), JSON.stringify({ version: 2, ownerId: owner, rates: bound }));
    window.dispatchEvent(new Event('crewcheck:financial-config-changed'));
    return true;
  } catch { return false; }
}
/** Called only after the owner explicitly confirms this company cycle for the reviewed document. */
export function applyReviewedPayrollCycle(result: StatementLearningResult): LearnedRate[] {
  const cycle = result.kind === 'payroll' ? payrollCompetences(result.competence, PAYROLL_CYCLE_SOURCE) : null;
  if (!cycle) return [];
  const reviewed: LearnedRate[] = result.rates.map(item => {
    const period = payrollMonthBounds(item.key === 'salary.base' ? cycle.fixedMonth : cycle.operationalVariableMonth)!;
    return { ...item, effectiveFrom: period.start, effectiveTo: period.end, payrollCompetence: cycle.payrollMonth, cycleSource: cycle.source };
  });
  const draft = result.payrollDsrDraft;
  if (validPayrollDsrEvidence(draft) && draft.ownerId === financialRateOwner() && draft.payrollMonth === result.competence) {
    const index = reviewed.findIndex(item => item.key === 'salary.base' && item.valueOrigin === 'printed' && item.sourceFingerprint === draft.sourceFingerprint);
    const chosen = index >= 0 ? index : reviewed.findIndex(item => item.key.startsWith('salary.') && item.valueOrigin === 'printed' && item.sourceFingerprint === draft.sourceFingerprint);
    if (chosen >= 0) reviewed[chosen] = {...reviewed[chosen], payrollDsrEvidence:draft};
  }
  return reviewed;
}
export function confirmedRateAt(key: string, date: string, currency: LearnedRate['currency'] = 'BRL'): LearnedRate | null {
  const rates = readConfirmedFinancialRates();
  const review = rateAt(rates.filter(item=>item.valueOrigin==='owner_confirmed'), 'per_diem.lunch', date, currency);
  const quarter = key === 'per_diem.breakfast' ? 'breakfastQuarter' : key === 'per_diem.taxi' ? 'taxiQuarter' : null;
  // Keep the audit archive, but an edited review with an unchecked option must
  // not resurrect an earlier owner-confirmed percentage for this month.
  const eligible = quarter && review?.valueOrigin === 'owner_confirmed' && review.perDiemReview?.[quarter] === false
    ? rates.filter(item => item.key !== key || item.valueOrigin !== 'owner_confirmed') : rates;
  const found = rateAt(eligible, key, date, currency);
  return found && Number.isFinite(Number(found.value)) ? found : null;
}
export function confirmedRateValueAt(key: string, date: string, currency: LearnedRate['currency'] = 'BRL'): number | null {
  return confirmedRateAt(key, date, currency)?.value ?? null;
}

export function reviewedPayrollCycleForOperationalMonth(month: string) {
  const candidates = readConfirmedFinancialRates().filter(item => item.currency === 'BRL' && item.key.startsWith('salary.') && item.key !== 'salary.base' && item.cycleSource === PAYROLL_CYCLE_SOURCE && item.effectiveFrom.slice(0, 7) === month && item.payrollCompetence);
  const latest = candidates.sort((a,b) => (a.revision || 1) - (b.revision || 1)).at(-1);
  if (!latest) return null;
  const cycle = payrollCompetences(latest.payrollCompetence!, PAYROLL_CYCLE_SOURCE);
  return cycle?.operationalVariableMonth === month ? { ...cycle, sourceFingerprint: latest.sourceFingerprint } : null;
}

/** Real consumer for the salary caller: reads the existing confirmed archive.
 * No source is adopted at query time; another month/account stays pending. */
export function confirmedPayrollDsrContext(competence:string) {
  const ownerId=financialRateOwner();
  return ownerId?payrollDsrContext({ownerId,competence,rates:readConfirmedFinancialRates()}):null;
}
