import { readConfirmedFinancialRates, reviewedPayrollCycleForOperationalMonth } from '@/lib/financialStatementLearning';
import { nextPayrollPayment } from '@/lib/nextFinancialPayment';
import { composePayrollPayment, type PayrollSnapshot } from '@/lib/payrollPaymentComposition';
import type { FinancialRange } from '@/lib/financialHistoryPeriods';
import NextPaymentCard from './NextPaymentCard';

export default function PayrollPaymentCard({ snapshots, requestRange }: { snapshots:PayrollSnapshot[];requestRange:(range:FinancialRange)=>void }) {
  const months=[...new Set(readConfirmedFinancialRates().filter(item=>item.key.startsWith('salary.')).map(item=>item.effectiveFrom.slice(0,7)))];
  const candidates=months.flatMap(month=>{
    const cycle=reviewedPayrollCycleForOperationalMonth(month);if(!cycle)return [];
    return [composePayrollPayment(cycle,snapshots)];
  });
  return <NextPaymentCard payment={nextPayrollPayment(candidates)} requestRange={requestRange}/>;
}
