import { useFinancialPrivacy } from './FinancialPrivacy';
import { salaryCalculationDiagnostic, type SalaryDiagnosticItem } from '@/lib/salaryCalculationDiagnostic';
import type { FinancialRange } from '@/lib/financialHistoryPeriods';
import FinancialStatementImporter from './FinancialStatementImporter';
export function SalaryCalculationStatus({ items, range, missing }: { items: SalaryDiagnosticItem[]; range: FinancialRange; missing: string[] }) {
  const privacy = useFinancialPrivacy();
  const state = salaryCalculationDiagnostic(items, range, missing);
  return <section className="cz-toolbox cc-salary-prerequisites" aria-label="Condições do cálculo salarial">
    {state.reasons.length > 0 && <><h2>O que falta para calcular o bruto</h2><ul>{state.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></>}
    {state.variable !== null && <details className="cc-salary-variable"><summary>Variáveis operacionais do período</summary><p data-salary-variable="available"><strong>Variáveis previstas da escala operacional: {privacy.amount(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(state.variable))}</strong><br/>Trabalho de {range.start} até {range.end}. Inclui somente voos, reserva, sobreaviso e adicionais calculados pelo motor atual. Não inclui salário-base, fixos ou descontos; não representa salário líquido nem pagamento recebido.</p></details>}
    <details className="cc-salary-reference"><summary>Revisar referência salarial desta conta</summary><p>Importe e revise antes de aplicar. A referência vale somente para a conta e a competência confirmadas.</p><FinancialStatementImporter mode="payroll"/></details>
  </section>;
}
