export type StatementKind = 'per_diem' | 'payroll';
export type LearningConfidence = 'high' | 'medium' | 'review';

export interface LearnedRate {
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
  confidence: LearningConfidence = 'high'
): LearnedRate {
  return { key, label, value, unit, currency: 'BRL', effectiveFrom, sourceDocument, sourceFingerprint, confidence, confirmed: false };
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
  for (const [key, values] of observations) {
    const counts = new Map<number, number>();
    values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    const selected = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (Number.isFinite(selected)) rates.push(rate(`per_diem.${key}`, key, selected, 'meal', start, sourceDocument, fp));
  }
  const total = [...text.matchAll(/Total\s+depositado[^\n\r]*?R\$\s*([\d.]+,\d{2})/gi)].at(-1);
  const warnings: string[] = [];
  if (!start) warnings.push('Período não identificado; revisão obrigatória.');
  if (!rates.length) warnings.push('Nenhuma tarifa de alimentação identificada.');
  return { kind: 'per_diem', competence: start.slice(0, 7), paymentDate: payment?.[1], rates, totals: { deposited: total ? money(total[1]) : 0 }, warnings };
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
    const value = unit === 'km' ? decimal(m[2]) : money(m[1]);
    if (Number.isFinite(value) && value >= 0 && (unit !== 'km' || value <= 5)) rates.push(rate(key, label, value, unit, effectiveFrom, sourceDocument, fp));
  }
  for (const [pattern, key, label] of [
    [/([\d.,]+)\s+Horas Reserva - CMS\s+([\d.]+,\d{2})/i, 'salary.reserveHour', 'Hora de reserva'],
    [/([\d.,]+)\s+Horas Sobre Aviso - CMS\s+([\d.]+,\d{2})/i, 'salary.standbyHour', 'Hora de sobreaviso'],
  ] as const) {
    const m = text.match(pattern);
    const quantity = m ? decimal(m[1]) : 0;
    const hourlyValue = m && quantity > 0 ? Number((money(m[2]) / quantity).toFixed(6)) : NaN;
    if (Number.isFinite(hourlyValue)) rates.push(rate(key, label, hourlyValue, 'hour', effectiveFrom, sourceDocument, fp, 'medium'));
  }
  const totals = text.match(/TOTAIS\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/i);
  const net = text.match(/L[ií]quido\s*\n?\s*(?:[\d.]+,\d{2}\s+)?([\d.]+,\d{2})/i);
  const warnings: string[] = [];
  if (!effectiveFrom) warnings.push('Competência não identificada; revisão obrigatória.');
  if (!rates.length) warnings.push('Nenhuma tarifa salarial identificada.');
  return {
    kind: 'payroll', competence: effectiveFrom.slice(0, 7), rates,
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
  for (const item of incoming.filter((entry) => entry.confirmed)) {
    const same = result.findIndex((entry) => entry.key === item.key && entry.effectiveFrom === item.effectiveFrom);
    if (same >= 0) result[same] = item;
    else result.push(item);
  }
  return result.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.key.localeCompare(b.key));
}

export function rateAt(rates: LearnedRate[], key: string, date: string): LearnedRate | null {
  return rates.filter((entry) => entry.confirmed && entry.key === key && entry.effectiveFrom <= date && (!entry.effectiveTo || entry.effectiveTo >= date)).at(-1) || null;
}


export const FINANCIAL_RATES_STORAGE_KEY = 'crewcheck_financial_learned_rates_v1';

export function readConfirmedFinancialRates(): LearnedRate[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const parsed = JSON.parse(localStorage.getItem(FINANCIAL_RATES_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((entry) => entry?.confirmed === true) : [];
  } catch {
    return [];
  }
}

export function saveConfirmedFinancialRates(rates: LearnedRate[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(FINANCIAL_RATES_STORAGE_KEY, JSON.stringify(rates.filter((entry) => entry?.confirmed === true)));
  } catch {
    // O modo privado pode bloquear o armazenamento; a importação continua somente na sessão.
  }
}

export function confirmedRateValueAt(key: string, date: string): number | null {
  const found = rateAt(readConfirmedFinancialRates(), key, date);
  return found && Number.isFinite(Number(found.value)) ? Number(found.value) : null;
}
