import { useFinancialPrivacy } from './FinancialPrivacy';

/** Presentation of the existing selected-competence calculation, never a
 * substitute for the separately composed next payroll cycle. */
export default function SalaryBreakdownChart({ gross, deductions, net, period }: { gross:number|null;deductions:number|null;net:number|null;period:string }) {
  const privacy=useFinancialPrivacy();
  const rows=[['Ganhos estimados',gross],['Descontos estimados',deductions],['Líquido estimado',net]] as const;
  const complete=rows.every(([,value])=>value!==null&&Number.isFinite(value));
  const max=complete?Math.max(...rows.map(([,value])=>Math.abs(value!))):null;
  return <section className="cc-bank-salary-breakdown" aria-label="Ganhos e descontos da competência">
    <h3>Ganhos e descontos</h3><p>Competência consultada · {period}</p>
    {rows.map(([label,value])=><div className="cc-bank-chart-row" key={label}><span>{label}</span><b>{value===null||!Number.isFinite(value)?'Não calculável':privacy.amount(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value))}</b>{!privacy.hidden&&max!==null&&value!==null&&Number.isFinite(value)&&<span className="cc-bank-chart-track" aria-hidden="true"><span style={{width:`${max>0?Math.abs(value)/max*100:0}%`}}/></span>}</div>)}
    <p>Simulação da competência. Recebimento não confirmado.</p>
  </section>;
}
