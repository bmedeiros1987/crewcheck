import PayrollNetEstimate from './PayrollNetEstimate';
import {useState,type ReactNode} from 'react';
import { financialRateSession, readConfirmedFinancialRates, reviewedPayrollCycleForOperationalMonth } from '@/lib/financialStatementLearning';
import { nextPayrollPayment } from '@/lib/nextFinancialPayment';
import { composePayrollPayment, composeOperationalPayrollEstimate, type PayrollSnapshot } from '@/lib/payrollPaymentComposition';
import type { FinancialRange } from '@/lib/financialHistoryPeriods';
import {readMonthlyFinancialSettings} from '@/lib/financialMonthlySettings';
import {salaryDisplaySummary,type SalaryDisplayBasis} from '@/lib/salaryDisplayBasis';
import {SalaryBasisControl,SalaryBasisAmount,SalaryPlrNotice} from './SalaryDisplayBasis';
import NextPaymentCard from './NextPaymentCard';

export default function PayrollPaymentCard({ snapshots, requestRange, extraDetails, basis, chooseBasis }: { snapshots:PayrollSnapshot[];requestRange:(range:FinancialRange)=>void;extraDetails?:ReactNode;basis:SalaryDisplayBasis;chooseBasis:(basis:SalaryDisplayBasis)=>unknown }) {
  const months=[...new Set(readConfirmedFinancialRates().filter(item=>item.key.startsWith('salary.')).map(item=>item.effectiveFrom.slice(0,7)))];
  const candidates=months.flatMap(month=>{
    const cycle=reviewedPayrollCycleForOperationalMonth(month);if(!cycle)return [];
    return [composePayrollPayment(cycle,snapshots)];
  });
  const session=financialRateSession(),[selection,setSelection]=useState({session,month:''});
  const available=[...new Set([...snapshots.map(item=>item.month),...candidates.map(item=>item.operationalMonth)])].sort().reverse();
  const selected=selection.session===session&&available.includes(selection.month)?selection.month:'';
  const candidate=selected?candidates.find(item=>item.operationalMonth===selected):undefined;
  let payment=selected?nextPayrollPayment(candidate?[candidate]:[],candidate?new Date(candidate.creditMonth+'-01T12:00:00Z'):new Date()):nextPayrollPayment(candidates);
  let deductionMonth=candidates.find(item=>item.range===payment.range)?.fixedMonth;
  if(!payment.range&&snapshots.length){const current=new Date().toISOString().slice(0,7);const snapshot=snapshots.find(item=>item.month===(selected||current))||[...snapshots].sort((a,b)=>b.month.localeCompare(a.month))[0];payment=composeOperationalPayrollEstimate(snapshot);deductionMonth=snapshot.month;}
  const activeCandidate=candidates.find(item=>item.range===payment.range);
  const operationalMonth=activeCandidate?.operationalMonth||(payment.estimationBasis==='operational_month'?deductionMonth:undefined);
  const summary=salaryDisplaySummary(basis,payment.calculationTotals?.BRL??payment.totals?.BRL??null,payment.totals!==null&&payment.totals!==undefined, deductionMonth?[deductionMonth]:[],deductionMonth?[readMonthlyFinancialSettings(deductionMonth)]:[]);
  return <NextPaymentCard salaryDisplay={{control:<div className="cc-payroll-controls">{available.length>0&&<label className="cc-payroll-month">Mês operacional<select aria-label="Mês operacional" value={operationalMonth||''} onChange={event=>setSelection({session,month:event.target.value})}>{available.map(month=><option key={month} value={month}>{month} · crédito {candidates.find(item=>item.operationalMonth===month)?.creditMonth||'a confirmar'}</option>)}</select></label>}<SalaryBasisControl basis={basis} choose={chooseBasis}/><SalaryPlrNotice/></div>,amount:<><SalaryBasisAmount summary={summary}/>{basis==='net'&&deductionMonth&&<PayrollNetEstimate key={deductionMonth} month={deductionMonth} paymentMonth={activeCandidate?.creditMonth} gross={payment.calculationTotals?.BRL??payment.totals?.BRL??null} complete={payment.totals!==null&&payment.totals!==undefined}/>}</>,caption:activeCandidate?'Operacional '+activeCandidate.operationalMonth+' · folha '+activeCandidate.fixedMonth+' · '+payment.timing:payment.estimationBasis==='operational_month'?'Operacional '+deductionMonth+' · crédito a confirmar':payment.timing}}  payment={payment} requestRange={requestRange} extraDetails={extraDetails}/>;
}
