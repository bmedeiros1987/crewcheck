export const PAYROLL_CYCLE_SOURCE = 'user-reported-absa-tam';
export function payrollMonthBounds(month: string): { start: string; end: string } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, number] = month.split('-').map(Number);
  if (year < 1900 || year > 9998) return null;
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { start: month + '-01', end: month + '-' + String(last).padStart(2, '0') };
}
function shift(month: string, offset: number): string {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7);
}
/** Explicit opt-in company guidance supplied by the user; no exact credit date or settlement inferred. */
export function payrollCompetences(month: string, policy: typeof PAYROLL_CYCLE_SOURCE) {
  if (policy !== PAYROLL_CYCLE_SOURCE || !payrollMonthBounds(month)) return null;
  return { payrollMonth: month, fixedMonth: month, operationalVariableMonth: shift(month, -1), expectedCreditMonth: shift(month, 1), source: policy };
}
