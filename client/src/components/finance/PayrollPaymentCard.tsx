import type { ReactNode } from 'react';
import { readConfirmedFinancialRates, reviewedPayrollCycleForOperationalMonth } from '@/lib/financialStatementLearning';
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
  let payment=nextPayrollPayment(candidates);
  let deductionMonth=candidates.find(item=>item.range===payment.range)?.fixedMonth;
  if(!payment.range&&snapshots.length){const current=new Date().toISOString().slice(0,7);const snapshot=snapshots.find(item=>item.month===current)||[...snapshots].sort((a,b)=>b.month.localeCompare(a.month))[0];payment=composeOperationalPayrollEstimate(snapshot);deductionMonth=snapshot.month;}
  const summary=salaryDisplaySummary(basis,payment.calculationTotals?.BRL??payment.totals?.BRL??null,payment.totals!==null&&payment.totals!==undefined, deductionMonth?[deductionMonth]:[],deductionMonth?[readMonthlyFinancialSettings(deductionMonth)]:[]);
  return <NextPaymentCard salaryDisplay={{control:<><SalaryBasisControl basis={basis} choose={chooseBasis}/><SalaryPlrNotice/></>,amount:<SalaryBasisAmount summary={summary}/>,caption:payment.estimationBasis==='operational_month'?'Competência operacional · '+deductionMonth+' · '+payment.timing:payment.timing}}  payment={payment} requestRange={requestRange} extraDetails={extraDetails}/>;
}
