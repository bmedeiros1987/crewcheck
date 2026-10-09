import type { FinancialRange } from './financialHistoryPeriods';
import { payrollMonthBounds } from './financialPayrollPeriods';
export type SalaryDiagnosticItem = {
  month: string; days: number; configured: boolean; baseConfigured: boolean;
  requiresManualFunction: boolean; variable: number; variableComplete: boolean; fixedMonth?: string;
};
/** Explains caller prerequisites without changing canonical calculation, moving
 * fixed pay to an operational month, or substituting missing data with zero. */
export function salaryCalculationDiagnostic(items: SalaryDiagnosticItem[], range: FinancialRange, missing: string[]) {
  const reasons: string[] = [];
  const fullMonths = range.valid && range.start.endsWith('-01') && range.end === payrollMonthBounds(range.end.slice(0, 7))?.end;
  if (!range.valid) reasons.push('Informe um intervalo válido.');
  else if (!fullMonths) reasons.push('O intervalo não contém competências mensais completas. Salário-base e descontos não são distribuídos por dia ou semana.');
  if (missing.length) reasons.push(`Falta escala para ${missing.join(', ')}. Nenhum valor foi presumido para esses meses.`);
  if (!items.length) reasons.push('Nenhuma escala com vínculo confirmado está disponível para o período.');
  for (const item of items) {
    if (!item.days) reasons.push(`${item.month}: a escala não contém dias publicados.`);
    if (item.requiresManualFunction) reasons.push(`${item.month}: a função profissional está pendente; as tarifas salariais não foram selecionadas.`);
    if (!item.configured) reasons.push(`${item.month}: não há tarifas ou valores salariais disponíveis para esta conta e competência.`);
    if (!item.baseConfigured) reasons.push(item.fixedMonth
      ? `${item.month}: salário-base não informado nesta competência operacional. A referência revisada vincula os fixos à folha ${item.fixedMonth}; esse valor não foi repetido aqui.`
      : `${item.month}: falta salário-base com fonte revisada ou cadastro válido nesta conta e competência.`);
    if (!item.variableComplete) reasons.push(`${item.month}: há voos sem distância operacional válida entre aeroportos; as variáveis e o total permanecem desconhecidos. Confira a quilometragem e sua origem.`);
    if (!Number.isFinite(item.variable)) reasons.push(`${item.month}: os componentes variáveis não produziram um valor válido. Confira a escala e a origem das tarifas.`);
  }
  const variableReady = fullMonths && !missing.length && items.length > 0 && items.every(item => item.days > 0 && item.configured && !item.requiresManualFunction && item.variableComplete && Number.isFinite(item.variable));
  return { fullMonths, reasons, ready: reasons.length === 0, variable: variableReady ? items.reduce((sum, item) => sum + item.variable, 0) : null };
}
