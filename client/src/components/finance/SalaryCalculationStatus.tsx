import { salaryCalculationDiagnostic, type SalaryDiagnosticItem } from '@/lib/salaryCalculationDiagnostic';
import type { FinancialRange } from '@/lib/financialHistoryPeriods';
import FinancialStatementImporter from './FinancialStatementImporter';
export function SalaryCalculationStatus({ items, range, missing }: { items: SalaryDiagnosticItem[]; range: FinancialRange; missing: string[] }) {
  const state = salaryCalculationDiagnostic(items, range, missing);
  return <section className="cz-toolbox cc-salary-prerequisites" aria-label="Condições do cálculo salarial">
    {state.reasons.length > 0 && <><h2>O que falta para calcular o bruto</h2><ul>{state.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></>}
    {state.variable !== null && <p data-salary-variable="available"><strong>Variáveis previstas da escala operacional: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(state.variable)}</strong><br/>Trabalho de {range.start} até {range.end}. Inclui somente voos, reserva, sobreaviso e adicionais calculados pelo motor atual. Não inclui salário-base, fixos ou descontos; não representa salário líquido nem pagamento recebido.</p>}
    <details><summary>Revisar referência salarial desta conta</summary><p>Importe o demonstrativo, confira a competência e a origem dos valores e confirme a aplicação nesta conta. Tarifas derivadas não são aplicadas automaticamente. Uma referência de outro mês não é transferida para preencher dados ausentes.</p><FinancialStatementImporter mode="payroll"/></details>
  </section>;
}
