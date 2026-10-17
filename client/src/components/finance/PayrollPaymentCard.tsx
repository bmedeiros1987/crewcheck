import type { ReactNode } from 'react';
import { readConfirmedFinancialRates, reviewedPayrollCycleForOperationalMonth } from '@/lib/financialStatementLearning';
import { nextPayrollPayment } from '@/lib/nextFinancialPayment';
import { composePayrollPayment, composeOperationalPayrollEstimate, type PayrollSnapshot } from '@/lib/payrollPaymentComposition';
import type { FinancialRange } from '@/lib/financialHistoryPeriods';
import NextPaymentCard from './NextPaymentCard';

export default function PayrollPaymentCard({ snapshots, requestRange, extraDetails }: { snapshots:PayrollSnapshot[];requestRange:(range:FinancialRange)=>void;extraDetails?:ReactNode }) {
  const months=[...new Set(readConfirmedFinancialRates().filter(item=>item.key.startsWith('salary.')).map(item=>item.effectiveFrom.slice(0,7)))];
  const candidates=months.flatMap(month=>{
    const cycle=reviewedPayrollCycleForOperationalMonth(month);if(!cycle)return [];
    return [composePayrollPayment(cycle,snapshots)];
  });
  let payment=nextPayrollPayment(candidates);
  if(!payment.range&&snapshots.length){const current=new Date().toISOString().slice(0,7);const snapshot=snapshots.find(item=>item.month===current)||[...snapshots].sort((a,b)=>b.month.localeCompare(a.month))[0];payment=composeOperationalPayrollEstimate(snapshot);}
  return <NextPaymentCard payment={payment} requestRange={requestRange} extraDetails={extraDetails}/>;
}
