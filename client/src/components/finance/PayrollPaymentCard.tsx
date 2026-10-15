import { readConfirmedFinancialRates, reviewedPayrollCycleForOperationalMonth } from '@/lib/financialStatementLearning';
import { payrollMonthBounds } from '@/lib/financialPayrollPeriods';
import { nextPayrollPayment, type PayrollCandidate, type PaymentLine } from '@/lib/nextFinancialPayment';
import type { FinancialRange } from '@/lib/financialHistoryPeriods';
import NextPaymentCard from './NextPaymentCard';

type Salary = {
  configured:boolean; config:{baseConfigured:boolean;basePay:number;fixedAdditions:number;requiresManualFunction:boolean;source:string};
  production:number; reserve:number; standby:number; chief:number; instructorPay:number;
  rows:Array<{iso:string;flight:string;route:string;total:number;timeKnown:boolean;distanceKnown:boolean;source:string}>;
  reserveAssessment:{pendingCount:number};standbyAssessment:{pendingCount:number};
};
export default function PayrollPaymentCard({ snapshots, requestRange }: { snapshots:Array<{month:string;salary:Salary;days:number}>;requestRange:(range:FinancialRange)=>void }) {
  const months=[...new Set(readConfirmedFinancialRates().filter(item=>item.key.startsWith('salary.')).map(item=>item.effectiveFrom.slice(0,7)))];
  const candidates:PayrollCandidate[]=months.flatMap(month=>{
    const cycle=reviewedPayrollCycleForOperationalMonth(month);if(!cycle)return [];
    const operational=snapshots.find(item=>item.month===cycle.operationalVariableMonth);
    const variable=operational?.salary;
    const fixed=snapshots.find(item=>item.month===cycle.fixedMonth)?.salary;
    const ready=Boolean(operational?.days&&variable?.configured&&!variable.config.requiresManualFunction&&variable.rows.every(row=>row.timeKnown&&row.distanceKnown&&Number.isFinite(row.total))&&!variable.reserveAssessment.pendingCount&&!variable.standbyAssessment.pendingCount);
    const lines:PaymentLine[]=[
      {iso:cycle.fixedMonth,label:'Salário-base',currency:'BRL',value:fixed?.config.baseConfigured?fixed.config.basePay:null,source:fixed?.config.source||'Referência dos fixos ausente'},
      {iso:cycle.fixedMonth,label:'Adicionais fixos informados',currency:'BRL',value:fixed?.config.baseConfigured?fixed.config.fixedAdditions:null,source:fixed?.config.source||'Referência dos fixos ausente'},
      ...(variable?.rows.length?variable.rows.map(row=>({iso:row.iso,label:`${row.flight} · ${row.route}`,currency:'BRL',value:ready?row.total:null,source:row.source})):[]),
      ...(['reserve','standby'] as const).map((key,index)=>({iso:month,label:['Reserva','Sobreaviso'][index],currency:'BRL',value:ready?variable![key]:null,source:variable?.config.source||'Escala operacional ausente'})),
    ];
    const issues=[...(!variable?['Importe a escala operacional de '+month+'.']:!ready?['Confira horários, função profissional e tarifas das variáveis.']:[]),...(!fixed?.config.baseConfigured?['Confira os fixos da folha '+cycle.fixedMonth+'; eles não foram repetidos do mês operacional.']:[])];
    return [{creditMonth:cycle.expectedCreditMonth,operationalMonth:month,fixedMonth:cycle.fixedMonth,range:{start:month+'-01',end:payrollMonthBounds(cycle.fixedMonth)!.end,kind:'custom' as const,valid:true},lines,issues}];
  });
  return <NextPaymentCard payment={nextPayrollPayment(candidates)} requestRange={requestRange}/>;
}
