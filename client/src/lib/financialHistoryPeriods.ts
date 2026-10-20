export type FinancialRange = { start: string; end: string; valid: boolean; kind: 'week' | 'month' | 'year' | 'custom' };
export function validFinancialDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value && Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2200;
}
const civil = (d: Date) => d.toISOString().slice(0, 10);
export function financialRange(kind: FinancialRange['kind'], month: string, day: string, start: string, end: string): FinancialRange {
  let a = start, b = end;
  if (kind === 'week' && !validFinancialDay(day)) return { start: '', end: '', valid: false, kind };
  if (kind === 'month' || kind === 'year') {
    a = kind === 'year' ? month.slice(0, 4) + '-01-01' : month + '-01';
    if (validFinancialDay(a)) {
      const d = new Date(a + 'T12:00:00Z');
      d.setUTCMonth(d.getUTCMonth() + (kind === 'year' ? 12 : 1), 0); b = civil(d);
    }
  } else if (kind === 'week' && validFinancialDay(day)) {
    const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() - 3 + 7) % 7);
    a = civil(d); d.setUTCDate(d.getUTCDate() + 6); b = civil(d);
  }
  return { start: a, end: b, valid: validFinancialDay(a) && validFinancialDay(b) && a <= b, kind };
}
export function financialMonths(range: FinancialRange): string[] {
  if (!range.valid) return [];
  const result: string[] = [], d = new Date(range.start.slice(0, 7) + '-01T12:00:00Z');
  while (civil(d).slice(0, 7) <= range.end.slice(0, 7)) { result.push(civil(d).slice(0, 7)); d.setUTCMonth(d.getUTCMonth() + 1); }
  return result;
}
export function financialWeeks(range: FinancialRange): FinancialRange[] {
  if (!range.valid) return [];
  const result: FinancialRange[] = []; let day = range.start;
  while (day <= range.end) {
    const week = financialRange('week', '', day, '', '');
    result.push({ ...week, start: day, end: week.end < range.end ? week.end : range.end });
    const d = new Date(week.end + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); day = civil(d);
  }
  return result;
}
export function financialRowsInRange<T extends { iso: string }>(rows: readonly T[], range: FinancialRange): T[] {
  return range.valid ? rows.filter(row => validFinancialDay(row.iso) && row.iso >= range.start && row.iso <= range.end) : [];
}
export function latestFinancialPeriods<T extends { id: string; year: number | null; month: number | null; createdAt: string; crewId?: string | null; crewName?: string | null; deletedAt?: string | null }>(items: readonly T[], identity: string, identityOf: (source: T) => string): { items: T[]; conflicts: string[] } {
  const groups = new Map<string, T[]>();
  if (!identity) return { items: [], conflicts: [] };
  for (const item of items) {
    if (item.deletedAt || identityOf(item) !== identity) continue;
    const period = String(item.year) + '-' + String(item.month).padStart(2, '0');
    if (!validFinancialDay(period + '-01') || !Number.isFinite(Date.parse(item.createdAt))) continue;
    groups.set(period, [...(groups.get(period) || []), item]);
  }
  const selected: T[] = [], conflicts: string[] = [];
  for (const [period, group] of groups) {
    group.sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const newest = group.filter(item => Date.parse(item.createdAt) === Date.parse(group[0].createdAt));
    if (new Set(newest.map(item => item.id)).size > 1) conflicts.push(period);
    else selected.push(group[0]);
  }
  return { items: selected, conflicts };
}
