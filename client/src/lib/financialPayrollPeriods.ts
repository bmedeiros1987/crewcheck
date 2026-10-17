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

export const ACT_PAYROLL_CYCLE_SOURCE = 'ACT-TAM-2025-2027:3.2.8' as const;
export const ACT_PAYROLL_VALIDITY = Object.freeze({start:'2025-12-01',end:'2027-11-30'});
/** Documentary variable projection, limited to cycles wholly inside ACT validity
 * (duration and clause 6.4). Cross-boundary cycles require a separately reviewed
 * applicable policy. The deadline is not an actual payday. Fixed competence is
 * only supplied by the independent, explicitly selected company guidance. */
export function actPayrollCompetences(operationalMonth:string, policy:typeof ACT_PAYROLL_CYCLE_SOURCE, fixedPolicy?:typeof PAYROLL_CYCLE_SOURCE) {
  if(policy!==ACT_PAYROLL_CYCLE_SOURCE||!payrollMonthBounds(operationalMonth))return null;
  if(fixedPolicy!==undefined&&fixedPolicy!==PAYROLL_CYCLE_SOURCE)return null;
  const payrollMonth=shift(operationalMonth,1),expectedCreditMonth=shift(operationalMonth,2);
  for(const month of [operationalMonth,payrollMonth,expectedCreditMonth]){
    const bounds=payrollMonthBounds(month);
    if(!bounds||bounds.start<ACT_PAYROLL_VALIDITY.start||bounds.end>ACT_PAYROLL_VALIDITY.end)return null;
  }
  return {payrollMonth,operationalVariableMonth:operationalMonth,expectedCreditMonth,
    fixedMonth:fixedPolicy?payrollMonth:null,fixedSource:fixedPolicy??null,
    rateMonth:payrollMonth,source:policy,variableSource:policy,
    creditDeadline:'fifth_business_day' as const,exactCreditDate:null,paymentConfirmed:false as const};
}
