import { useFinancialPrivacy } from './FinancialPrivacy';
import { salaryCalculationDiagnostic, type SalaryDiagnosticItem } from '@/lib/salaryCalculationDiagnostic';
import type { FinancialRange } from '@/lib/financialHistoryPeriods';
import FinancialStatementImporter from './FinancialStatementImporter';
import {useRef} from 'react';
import {CircleCheck,Info,Pencil,TriangleAlert} from 'lucide-react';
import './financial-changes.css';
export function SalaryCalculationStatus({ items, range, missing }: { items: SalaryDiagnosticItem[]; range: FinancialRange; missing: string[] }) {
  const privacy = useFinancialPrivacy();
  const state = salaryCalculationDiagnostic(items, range, missing);
  const reference=useRef<HTMLDetailsElement>(null);
  const labels=[...new Set([
    ...(!range.valid||!state.fullMonths?['Período']:[]),
    ...(missing.length||!items.length||items.some(item=>!item.days)?['Escala']:[]),
    ...(items.some(item=>item.requiresManualFunction)?['Função']:[]),
    ...(items.some(item=>!item.configured)?['Tarifas']:[]),
    ...(items.some(item=>!item.baseConfigured)?['Salário-base']:[]),
    ...(items.some(item=>item.fixedAdditionsConfigured===false)?['Fixos']:[]),
    ...(items.some(item=>!item.variableComplete)?['KM']:[]),
    ...(items.some(item=>(item.pendingActivityCount||0)>0)?['Horários']:[]),
    ...(items.some(item=>!Number.isFinite(item.variable))?['Variáveis']:[]),
  ])];
  return <section className="cz-toolbox cc-salary-prerequisites" aria-label="Condições do cálculo salarial">
    <div className="cc-salary-prerequisite-summary">{state.ready?<CircleCheck aria-hidden="true"/>:<TriangleAlert aria-hidden="true"/>}<h2>{state.ready?'Dados disponíveis':'Pendências'}</h2><button type="button" aria-label="Editar referência salarial" onClick={()=>{if(reference.current){reference.current.open=true;reference.current.querySelector('summary')?.focus();}}}><Pencil aria-hidden="true"/>Editar</button></div>
    {labels.length>0&&<ul className="cc-salary-prerequisite-labels" aria-label="Dados pendentes">{labels.map(label=><li key={label}><TriangleAlert aria-hidden="true"/>{label}</li>)}</ul>}
    {state.reasons.length>0&&<details className="cc-salary-pending-details"><summary><Info size={18} aria-hidden="true"/>Detalhes · {state.reasons.length}</summary><ul>{state.reasons.map(reason=><li key={reason}>{privacy.text(reason)}</li>)}</ul></details>}
    {state.variable !== null && <details className="cc-salary-variable"><summary>Variáveis operacionais do período</summary><p data-salary-variable="available"><strong>Variáveis previstas da escala operacional: {privacy.amount(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(state.variable))}</strong><br/>Trabalho de {range.start} até {range.end}. Inclui somente voos, reserva, sobreaviso e adicionais calculados pelo motor atual. Não inclui salário-base, fixos ou descontos; não representa salário líquido nem pagamento recebido.</p></details>}
    <details ref={reference} className="cc-salary-reference"><summary aria-label="Revisar referência salarial desta conta">Referência</summary><p>Importe e revise antes de aplicar. A referência vale somente para a conta e a competência confirmadas.</p><FinancialStatementImporter mode="payroll"/></details>
  </section>;
}
