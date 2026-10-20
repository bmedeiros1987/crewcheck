import { payrollMonthBounds } from './financialPayrollPeriods';
import { validFinancialDay } from './financialHistoryPeriods';
import {knownPaymentTotals,type NextPayment,type PayrollCandidate,type PaymentLine} from './nextFinancialPayment';

export type PayrollSalary = {
  configured:boolean; config:{baseConfigured:boolean;fixedAdditionsConfigured?:boolean;basePay:number;fixedAdditions:number;requiresManualFunction:boolean;source:string;baseLabel?:string};
  production:number; reserve:number; standby:number; chief:number; instructorPay:number;
  rows:Array<{iso:string;flight:string;route:string;total:number;timeKnown:boolean;distanceKnown:boolean;source:string}>;
  reserveAssessment:{pendingCount:number;knownCount?:number;knownAmount?:number};standbyAssessment:{pendingCount:number;knownCount?:number;knownAmount?:number};
};
export type PayrollSnapshot = {month:string;salary:PayrollSalary;publishedDays:string[]};
type Cycle = {operationalVariableMonth:string;fixedMonth:string;expectedCreditMonth:string};

// Monthly coverage controls completeness, not visibility of independently
// evidenced activities. An empty partial month is never an evidenced zero.
function activityLine(s:PayrollSalary|undefined,key:'reserve'|'standby',month:string,covered:boolean):PaymentLine {
 const a=key==='reserve'?s?.reserveAssessment:s?.standbyAssessment;
 const ready=Boolean(s?.configured&&!s.config.requiresManualFunction);
 const known=ready&&Boolean(a?.knownCount)&&Number.isFinite(a?.knownAmount)&&Number(a?.knownAmount)>=0;
 const complete=ready&&covered&&a?.pendingCount===0&&Number.isFinite(s?.[key])&&Number(s?.[key])>=0;
 return {iso:month,label:key==='reserve'?'Reserva':'Sobreaviso',currency:'BRL',value:complete?s![key]:known?a!.knownAmount!:null,
  partial:!complete,pendingReason:complete?undefined:known?'Subtotal dos intervalos com horários e tarifa comprovados.':!ready?'Função ou tarifa salarial pendente.':a?.pendingCount?'Início/fim publicado não comprovado nos intervalos desta parcela.':'Cobertura da competência incompleta; ausência de atividades não prova valor zero.',source:s?.config.source||'Escala operacional ausente'};
}

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
  const rowReady=(row:PayrollSalary['rows'][number])=>Boolean(variable?.configured&&!variable.config.requiresManualFunction&&row.timeKnown&&row.distanceKnown&&Number.isFinite(row.total)&&row.total>=0);
  const ready=Boolean(coverage.complete&&variable?.configured&&!variable.config.requiresManualFunction&&variable.rows.every(rowReady)&&!variable.reserveAssessment.pendingCount&&!variable.standbyAssessment.pendingCount);
  const lines:PaymentLine[]=[
    {iso:cycle.fixedMonth,label:fixed?.config.baseLabel||'Salário-base',currency:'BRL',value:fixed?.config.baseConfigured?fixed.config.basePay:null,pendingReason:fixed?.config.baseConfigured?undefined:'Valor pessoal dos fixos desta competência não informado; piso ACT não é salário individual.',source:fixed?.config.source||'Referência dos fixos ausente'},
    {iso:cycle.fixedMonth,label:'Adicionais fixos informados',currency:'BRL',value:fixed?.config.fixedAdditionsConfigured?fixed.config.fixedAdditions:null,pendingReason:fixed?.config.fixedAdditionsConfigured?undefined:'Adicionais pessoais não informados para esta competência. Ausência não equivale a zero.',source:fixed?.config.source||'Referência dos fixos ausente'},
    ...(variable?.rows.map(row=>({iso:row.iso,label:`${row.flight} · ${row.route}`,currency:'BRL',value:rowReady(row)?row.total:null,pendingReason:!row.distanceKnown?'KM da rota não disponível no cálculo salarial. Coordenadas geográficas não comprovam quilometragem remuneratória.':!row.timeKnown?'Horários publicados ou fuso não comprovados para calcular esta parcela.':'Função ou tarifa salarial pendente.',source:row.source}))||[]),
    ...(['reserve','standby'] as const).map(key=>activityLine(variable,key,month,coverage.complete)),
  ];
  const issues=[
    ...(!coverage.complete?[`${month}: ${coverage.missing.length} dia(s) sem programação publicada. Importe ou confira a escala completa.`]:[]),
    ...(!variable?['Importe a escala operacional de '+month+'.']:!ready?['As variáveis do ciclo estão incompletas. Os fixos conhecidos continuam na composição.']:[]),
    ...(!fixed?.config.baseConfigured?['Confira os fixos da folha '+cycle.fixedMonth+'; eles não foram repetidos do mês operacional.']:[]),
  ];
  return {creditMonth:cycle.expectedCreditMonth,operationalMonth:month,fixedMonth:cycle.fixedMonth,range:{start:month+'-01',end:payrollMonthBounds(cycle.fixedMonth)!.end,kind:'custom',valid:true},lines,issues};
}

// Operational estimates are available without a reviewed CREDIT cycle. Never
// manufacture net pay, deductions, a payment date or a ledger record here.
export function composeOperationalPayrollEstimate(snapshot:PayrollSnapshot):NextPayment {
 const {month,salary}=snapshot,coverage=payrollOperationalCoverage(month,snapshot.publishedDays),s=salary;
 const tariffReady=s.configured&&!s.config.requiresManualFunction;
 const rowReady=(row:PayrollSalary['rows'][number])=>tariffReady&&row.timeKnown&&row.distanceKnown&&Number.isFinite(row.total)&&row.total>=0;
 const lines:PaymentLine[]=[
  {iso:month,label:s.config.baseLabel||'Salário-base da competência',currency:'BRL',value:s.config.baseConfigured?s.config.basePay:null,pendingReason:s.config.baseConfigured?undefined:'Valor pessoal dos fixos desta competência não informado; piso ACT não é salário individual.',source:s.config.source},
  {iso:month,label:'Adicionais fixos informados',currency:'BRL',value:s.config.fixedAdditionsConfigured?s.config.fixedAdditions:null,pendingReason:s.config.fixedAdditionsConfigured?undefined:'Adicionais pessoais não informados para esta competência. Ausência não equivale a zero.',source:s.config.source},
  ...s.rows.map(row=>({iso:row.iso,label:`${row.flight} · ${row.route}`,currency:'BRL',value:rowReady(row)?row.total:null,pendingReason:!row.distanceKnown?'KM da rota não disponível no cálculo salarial. Coordenadas geográficas não comprovam quilometragem remuneratória.':!row.timeKnown?'Horários publicados ou fuso não comprovados para calcular esta parcela.':'Função ou tarifa salarial pendente.',source:row.source})),
  ...(['reserve','standby'] as const).map(key=>activityLine(s,key,month,coverage.complete)),
 ];
 const complete=coverage.complete&&tariffReady&&s.config.baseConfigured&&Number.isFinite(lines.reduce((sum,line)=>sum+(line.value??NaN),0))&&lines.every(line=>line.value!==null&&Number.isFinite(line.value)&&line.value>=0)&&!s.reserveAssessment.pendingCount&&!s.standbyAssessment.pendingCount;
 const known=knownPaymentTotals(lines);
 return {kind:'payroll',estimationBasis:'operational_month',range:{start:month+'-01',end:payrollMonthBounds(month)!.end,valid:true,kind:'month'},timing:'Mês de crédito a confirmar',source:'Motor canônico da escala; competência operacional, sem vínculo presumido com crédito.',lines,totals:complete?known:null,calculationTotals:known,calculationPartial:!complete,issues:['Ciclo de crédito não identificado. A estimativa da competência continua disponível; dia de pagamento, descontos e líquido não foram presumidos.',...(!s.config.baseConfigured?['Salário-base desta competência não informado. O subtotal não inclui essa parcela.']:[]),...(!s.config.fixedAdditionsConfigured?['Adicionais fixos desta competência não informados. O subtotal não inclui essa parcela.']:[]),...(!tariffReady?['Função ou tarifas salariais pendentes.']:[]),...(!coverage.complete?[`${coverage.missing.length} dia(s) sem cobertura publicada; subtotal parcial.`]:[]),...(s.rows.some(row=>!rowReady(row))?['Há parcelas de voo com distância, horários ou tarifa pendentes; apenas as parcelas conhecidas entram no subtotal.']:[]),...(s.reserveAssessment.pendingCount+s.standbyAssessment.pendingCount?[`${s.reserveAssessment.pendingCount+s.standbyAssessment.pendingCount} intervalo(s) de reserva/sobreaviso sem origem de horários comprovada.`]:[])],caption:complete?'Bruto estimado da competência · antes dos descontos':'Subtotal bruto estimado de parcelas conhecidas · antes dos descontos'};
}
