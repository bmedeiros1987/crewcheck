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
import {payrollProjectionPeriods} from '@/lib/payrollProjectionPeriods';
import {payrollMonthBounds} from '@/lib/financialPayrollPeriods';
import FinancialActPresetReference from './FinancialActPresetReference';

export default function PayrollPaymentCard({ snapshots, availableMonths=[], selectReferenceMonth, requestRange, extraDetails, basis, chooseBasis }: { snapshots:PayrollSnapshot[];availableMonths?:string[];selectReferenceMonth?:(month:string,explicit?:boolean)=>void;requestRange:(range:FinancialRange)=>void;extraDetails?:ReactNode;basis:SalaryDisplayBasis;chooseBasis:(basis:SalaryDisplayBasis)=>unknown }) {
  const months=[...new Set([...availableMonths,...snapshots.map(item=>item.month),...readConfirmedFinancialRates().filter(item=>item.key.startsWith('salary.')).map(item=>item.effectiveFrom.slice(0,7))])];
  const periods=months.flatMap(month=>payrollProjectionPeriods([month],snapshots.find(item=>item.month===month)?.presetScope||null,reviewedPayrollCycleForOperationalMonth));
  // Personal fixed components have their own owner/competence evidence. The
  // operational ACT scope must not erase them when its declaration ends.
  const candidates=periods.map(period=>({...composePayrollPayment(period,period.basis==='reviewed_company_cycle'?snapshots:snapshots.filter(item=>item.month===period.fixedMonth?item.presetScope?.allowsFixedMonth(item.month):(item.presetScope?.company==='TAM'&&item.presetScope.role==='cabin'&&item.presetScope.allowsMonth(item.month)))),cycleBasis:period.basis}));
  const session=financialRateSession(),[selection,setSelection]=useState({session,month:''});
  const available=[...new Set([...snapshots.map(item=>item.month),...candidates.map(item=>item.operationalMonth)])].sort().reverse();
  const selected=selection.session===session&&available.includes(selection.month)?selection.month:'';
  const candidate=selected?candidates.find(item=>item.operationalMonth===selected):undefined;
  let payment=selected?nextPayrollPayment(candidate?[candidate]:[],candidate?new Date(candidate.creditMonth+'-01T12:00:00Z'):new Date()):nextPayrollPayment(candidates);
  let deductionMonth=candidates.find(item=>item.range===payment.range)?.fixedMonth;
  if(!payment.range&&snapshots.length){const current=new Date().toISOString().slice(0,7);const snapshot=snapshots.find(item=>item.month===(selected||current))||[...snapshots].sort((a,b)=>b.month.localeCompare(a.month))[0];payment=composeOperationalPayrollEstimate(snapshot);deductionMonth=snapshot.month;}
  const activeCandidate=candidates.find(item=>item.range===payment.range);
  const activePeriod=periods.find(item=>item.operationalVariableMonth===activeCandidate?.operationalMonth);
  const sourceStart=activePeriod?[activePeriod.operationalVariableMonth,activePeriod.fixedMonth].sort()[0]:selected||null;
  const sourceEnd=activePeriod?[activePeriod.operationalVariableMonth,activePeriod.fixedMonth].sort().at(-1):selected||null;
  const sourceRange:FinancialRange|undefined=sourceStart&&sourceEnd?{start:sourceStart+'-01',end:payrollMonthBounds(sourceEnd)!.end,kind:'custom',valid:true}:undefined;
  const operationalMonth=activeCandidate?.operationalMonth||(payment.estimationBasis==='operational_month'?deductionMonth:undefined);
  const summary=salaryDisplaySummary(basis,payment.calculationTotals?.BRL??payment.totals?.BRL??null,payment.totals!==null&&payment.totals!==undefined, deductionMonth?[deductionMonth]:[],deductionMonth?[readMonthlyFinancialSettings(deductionMonth)]:[]);
  return <NextPaymentCard salaryDisplay={{title:basis==='net'?'Salário líquido estimado':'Salário bruto estimado',control:<div className="cc-payroll-controls">{available.length>0&&<label className="cc-payroll-month">Mês de referência da produção<select aria-label="Mês da escala" value={operationalMonth||''} onChange={event=>{setSelection({session,month:event.target.value});selectReferenceMonth?.(event.target.value,true);}}>{available.map(month=><option key={month} value={month}>{month}</option>)}</select></label>}{periods.length>0&&<label className="cc-payroll-month">Mês de pagamento previsto<select aria-label="Mês de pagamento previsto" value={activeCandidate?.creditMonth||''} onChange={event=>{const period=periods.find(item=>item.expectedCreditMonth===event.target.value);if(period){setSelection({session,month:period.operationalVariableMonth});selectReferenceMonth?.(period.operationalVariableMonth,true);}}}>{!activeCandidate&&<option value="">A confirmar</option>}{periods.map(period=><option key={period.operationalVariableMonth} value={period.expectedCreditMonth}>{period.expectedCreditMonth}</option>)}</select></label>}{activePeriod&&activePeriod.basis!=='reviewed_company_cycle'&&<FinancialActPresetReference period={activePeriod}/>}<SalaryBasisControl basis={basis} choose={chooseBasis}/><SalaryPlrNotice/></div>,amount:<><SalaryBasisAmount summary={summary}/>{basis==='net'&&deductionMonth&&<PayrollNetEstimate key={deductionMonth} month={deductionMonth} paymentMonth={activeCandidate?.creditMonth} gross={payment.calculationTotals?.BRL??payment.totals?.BRL??null} complete={payment.totals!==null&&payment.totals!==undefined}/>}</>,caption:activeCandidate?'Escala '+activeCandidate.operationalMonth+' → pagamento previsto '+payment.timing.replace('Crédito esperado em ','')+' · fixos da folha '+activeCandidate.fixedMonth:payment.estimationBasis==='operational_month'?'Escala '+deductionMonth+' · pagamento a confirmar':payment.timing}}  payment={payment} requestRange={requestRange} sourceRange={sourceRange} extraDetails={extraDetails}/>;
}
