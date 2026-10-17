import { useFinancialPrivacy } from './FinancialPrivacy';
import { readMonthlyFinancialSettings } from '@/lib/financialMonthlySettings';

export function salaryDeductionEvidence(month:string, entry:{inss:number;irrf:number;otherDeductions:number}) {
  const record=readMonthlyFinancialSettings(month);
  const matches=(key:string,value:number)=>{const item=record?.values[key];return Boolean(item?.kind==='deduction'&&item.amountMinor!==null&&Number.isFinite(value)&&item.amountMinor===Math.round(value*100));};
  const inss=matches('inss',entry.inss),irrf=matches('irrf',entry.irrf),otherDeductions=matches('other_deductions',entry.otherDeductions);
  return {inss,irrf,otherDeductions,complete:inss&&irrf&&otherDeductions};
}

/** Presentation of the existing selected-competence calculation, never a
 * substitute for the separately composed next payroll cycle. */
export default function SalaryBreakdownChart({ gross, deductions, net, period, entries }: { gross:number|null;deductions:number|null;net:number|null;period:string;entries:Array<{month:string;inss:number;irrf:number;otherDeductions:number}> }) {
  const privacy=useFinancialPrivacy();
  // Legacy numeric zero alone does not prove that a deduction was informed.
  // Require explicit monthly evidence that agrees with the existing engine;
  // never apply an override or invent a net amount in this presentation.
  const known=entries.length>0&&entries.every(entry=>salaryDeductionEvidence(entry.month,entry).complete);
  const rows=[['Ganhos estimados',gross],['Descontos estimados',known?deductions:null],['Líquido estimado',known?net:null]] as const;
  const values=rows.flatMap(([,value])=>value!==null&&Number.isFinite(value)?[Math.abs(value)]:[]);
  const max=values.length?Math.max(...values):null;
  return <section className="cc-bank-salary-breakdown" aria-label="Ganhos e descontos da competência">
    <h3>Ganhos e descontos</h3><p>Competência consultada · {period}</p>
    {rows.map(([label,value])=><div className="cc-bank-chart-row" key={label}><span>{label}</span><b>{value===null||!Number.isFinite(value)?'Não calculável':privacy.amount(new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value))}</b>{!privacy.hidden&&max!==null&&value!==null&&Number.isFinite(value)&&<span className="cc-bank-chart-track" aria-hidden="true"><span style={{width:`${max>0?Math.abs(value)/max*100:0}%`}}/></span>}</div>)}
    {!known&&<p>Descontos da competência a confirmar. Líquido indisponível.</p>}<p>Simulação da competência. Recebimento não confirmado.</p>
  </section>;
}
