import { payrollMonthBounds } from './financialPayrollPeriods';
import { validFinancialDay } from './financialHistoryPeriods';
import type { PayrollCandidate, PaymentLine } from './nextFinancialPayment';

export type PayrollSalary = {
  configured:boolean; config:{baseConfigured:boolean;basePay:number;fixedAdditions:number;requiresManualFunction:boolean;source:string};
  production:number; reserve:number; standby:number; chief:number; instructorPay:number;
  rows:Array<{iso:string;flight:string;route:string;total:number;timeKnown:boolean;distanceKnown:boolean;source:string}>;
  reserveAssessment:{pendingCount:number};standbyAssessment:{pendingCount:number};
};
export type PayrollSnapshot = {month:string;salary:PayrollSalary;publishedDays:string[]};
type Cycle = {operationalVariableMonth:string;fixedMonth:string;expectedCreditMonth:string};

/** A positive record count is not monthly coverage. Count distinct, valid civil
 * days of this competence, including published rest days, before totaling it. */
export function payrollOperationalCoverage(month:string, publishedDays:readonly string[]) {
  const bounds=payrollMonthBounds(month);
  const dates=new Set(publishedDays.map(value=>/^\d{2}\/\d{2}\/\d{4}$/.test(value)?value.split('/').reverse().join('-'):value)
    .filter(value=>validFinancialDay(value)&&value.slice(0,7)===month));
  const missing:string[]=[];
  if(bounds)for(const date=new Date(bounds.start+'T12:00:00Z');date.toISOString().slice(0,10)<=bounds.end;date.setUTCDate(date.getUTCDate()+1)) {
    const iso=date.toISOString().slice(0,10);if(!dates.has(iso))missing.push(iso);
  }
  return {complete:Boolean(bounds)&&!missing.length,missing};
}

export function composePayrollPayment(cycle:Cycle,snapshots:PayrollSnapshot[]):PayrollCandidate {
  const month=cycle.operationalVariableMonth, operational=snapshots.find(item=>item.month===month);
  const variable=operational?.salary, fixed=snapshots.find(item=>item.month===cycle.fixedMonth)?.salary;
  const coverage=payrollOperationalCoverage(month,operational?.publishedDays||[]);
  const rowReady=(row:PayrollSalary['rows'][number])=>Boolean(variable?.configured&&!variable.config.requiresManualFunction&&row.timeKnown&&row.distanceKnown&&Number.isFinite(row.total));
  const ready=Boolean(coverage.complete&&variable?.configured&&!variable.config.requiresManualFunction&&variable.rows.every(rowReady)&&!variable.reserveAssessment.pendingCount&&!variable.standbyAssessment.pendingCount);
  const lines:PaymentLine[]=[
    {iso:cycle.fixedMonth,label:'Salário-base',currency:'BRL',value:fixed?.config.baseConfigured?fixed.config.basePay:null,source:fixed?.config.source||'Referência dos fixos ausente'},
    {iso:cycle.fixedMonth,label:'Adicionais fixos informados',currency:'BRL',value:fixed?.config.baseConfigured?fixed.config.fixedAdditions:null,source:fixed?.config.source||'Referência dos fixos ausente'},
    ...(variable?.rows.map(row=>({iso:row.iso,label:`${row.flight} · ${row.route}`,currency:'BRL',value:rowReady(row)?row.total:null,source:row.source}))||[]),
    ...(['reserve','standby'] as const).map((key,index)=>({iso:month,label:['Reserva','Sobreaviso'][index],currency:'BRL',value:ready?variable![key]:null,source:variable?.config.source||'Escala operacional ausente'})),
  ];
  const issues=[
    ...(!coverage.complete?[`${month}: ${coverage.missing.length} dia(s) sem programação publicada. Importe ou confira a escala completa.`]:[]),
    ...(!variable?['Importe a escala operacional de '+month+'.']:!ready?['As variáveis do ciclo estão incompletas. Os fixos conhecidos continuam na composição.']:[]),
    ...(!fixed?.config.baseConfigured?['Confira os fixos da folha '+cycle.fixedMonth+'; eles não foram repetidos do mês operacional.']:[]),
  ];
  return {creditMonth:cycle.expectedCreditMonth,operationalMonth:month,fixedMonth:cycle.fixedMonth,range:{start:month+'-01',end:payrollMonthBounds(cycle.fixedMonth)!.end,kind:'custom',valid:true},lines,issues};
}
