import { observedAllowancePeriods, rowsInObservedCycle, summarizeNativeForecastRows } from './financialForecastPeriods';
import { rosterOperationalIso, observedStatementCycle, rosterOperationalDateAt } from './compensationPolicy';
import { financialMonths, validFinancialDay, type FinancialRange } from './financialHistoryPeriods';
import {spBankDay} from '../../../shared/spBankCalendar2026.mjs';

export type PaymentLine = { iso: string; label: string; currency: string; value: number | null; source: string; partial?:boolean;pendingReason?:string;expectedPaymentDate?:string;expectedPaymentTimezone?:string };
export type NextPayment = {
  kind: 'allowance' | 'payroll'; range: FinancialRange | null; timing: string;
  currencyTiming?: Record<string,string>; expectedPaymentDates?:Record<string,string>; upcomingLines?:PaymentLine[]; source: string; lines: PaymentLine[]; totals: Record<string, number> | null;
  issues: string[]; caption: string; calculationTotals?:Record<string,number>|null; calculationPartial?:boolean; estimationBasis?:'operational_month';
};
type AllowanceRow = PaymentLine & { value: number; convertedBRL: number | null };
export function observedBrlPaymentDate(thursday:string):string|null {
 if(!validFinancialDay(thursday)||new Date(thursday+'T12:00:00Z').getUTCDay()!==4)return null;
 const state=spBankDay(thursday).state;
 if(state==='open'||state==='partial')return thursday;
 if(state!=='holiday'&&state!=='closed_nonholiday')return null;
 const date=new Date(thursday+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-1);const wednesday=date.toISOString().slice(0,10);
 return ['open','partial'].includes(spBankDay(wednesday).state)?wednesday:null;
}
export function knownPaymentTotals(lines:readonly PaymentLine[]):Record<string,number>|null {
 const totals:Record<string,number>={},overflow=new Set<string>();for(const line of lines){if(line.value===null||!Number.isFinite(line.value)||line.value<0||!/^[A-Z]{3}$/.test(line.currency)||overflow.has(line.currency))continue;const value=(totals[line.currency]??0)+line.value;if(Number.isFinite(value))totals[line.currency]=value;else{delete totals[line.currency];overflow.add(line.currency);}}return Object.keys(totals).length?totals:null;
}
// Preserve the hero's single BRL work week, but retain already-calculated rows
// for the Concierge's independent future horizon. This only assigns forecast
// dates; it never recalculates tariffs, FX or confirmed payments.
function datedAllowanceLines(rows:AllowanceRow[],pending:Array<{iso:string}>,covered:string[],coveredDays?:string[]):PaymentLine[] {
 const cycles=new Map<string,{date:string|null;partial:boolean}>();
 return rows.filter(row=>validFinancialDay(row.iso)).map(row=>{
  if(row.currency!=='BRL'){
   // Overnight meals can occur the next day; pending flight evidence uses
   // the proved flight/payment date, not the meal's occurrence date.
   const linkedDay=row.expectedPaymentTimezone==='America/Sao_Paulo'&&validFinancialDay(row.expectedPaymentDate||'')?row.expectedPaymentDate:row.iso;
   return {...row,partial:row.partial===true||pending.some(item=>validFinancialDay(item.iso)&&item.iso===linkedDay)};
  }
  const cycle=observedStatementCycle(rosterOperationalDateAt(row.iso,12),'roster_brt'),start=rosterOperationalIso(cycle.start),end=rosterOperationalIso(cycle.end);
  if(!cycles.has(start)){
   let absent=false;for(const day=new Date(start+'T12:00:00Z');day.toISOString().slice(0,10)<=end;day.setUTCDate(day.getUTCDate()+1))if(!coveredDays?.includes(day.toISOString().slice(0,10)))absent=true;
   const missing=financialMonths({start,end,kind:'custom',valid:true}).some(month=>!covered.includes(month));
   cycles.set(start,{date:observedBrlPaymentDate(rosterOperationalIso(cycle.payment)),partial:absent||missing||rowsInObservedCycle(pending,cycle).length>0||pending.some(item=>!validFinancialDay(item.iso))});
  }
  const item=cycles.get(start)!;return {...row,expectedPaymentDate:item.date||undefined,expectedPaymentTimezone:item.date?'America/Sao_Paulo':undefined,partial:item.partial||row.partial===true};
 });
}
export function nextAllowancePayment(rows: AllowanceRow[], pending: Array<{iso:string;airport:string;reason?:string}>, covered: string[], now = new Date(), coveredDays?: string[]): NextPayment {
  const today = rosterOperationalIso(now), periods = observedAllowancePeriods(now, 'roster_brt');
  // The previous closed week is still the next reference on Wednesday/Thursday.
  // Never substitute the accumulating or selected month for that week's rows.
  const cycle = (observedBrlPaymentDate(rosterOperationalIso(periods.previous.payment))||rosterOperationalIso(periods.previous.payment)) >= today ? periods.previous : periods.accumulation;
  const range: FinancialRange = {start:rosterOperationalIso(cycle.start),end:rosterOperationalIso(cycle.end),kind:'custom',valid:true};
  const lines = rowsInObservedCycle(rows, cycle), unknown = [...rowsInObservedCycle(pending, cycle), ...pending.filter(item=>!validFinancialDay(item.iso))];
  const missing = financialMonths(range).filter(month=>!covered.includes(month));
  const absentDays:string[]=[];
  for(let day=new Date(range.start+'T12:00:00Z');day.toISOString().slice(0,10)<=range.end;day.setUTCDate(day.getUTCDate()+1)){const iso=day.toISOString().slice(0,10);if(!coveredDays?.includes(iso))absentDays.push(iso);}
  const summary = summarizeNativeForecastRows(lines, unknown);
  const issues = [
    ...(lines.some(line=>!validFinancialDay(line.iso)) ? ['Há datas inválidas na composição; confira a origem dos itens.'] : []),
    ...(absentDays.length ? [`Há ${absentDays.length} dia(s) sem programação publicada comprovada neste ciclo. Confira a escala.`] : []),
    ...(missing.length ? [`Falta conferir a escala de ${missing.join(', ')} para completar este ciclo.`] : []),
    ...(unknown.length ? [...new Set(unknown.map(item=>`${validFinancialDay(item.iso)?item.iso:'Data de origem pendente'} · ${item.reason||('Classificação ou tarifa pendente'+(item.airport?' em '+item.airport:''))}`))] : []),
    ...(!lines.length ? ['Nenhum item deste ciclo está disponível. Importe ou confira a escala correspondente.'] : []),
    ...(summary.state==='invalid_amount' ? ['Há valores inválidos neste ciclo; confira as tarifas.'] : []),
  ];
  const brlDate=observedBrlPaymentDate(rosterOperationalIso(cycle.payment));
  const foreignTiming=Object.fromEntries([...new Set(lines.map(line=>line.currency))].filter(code=>code!=='BRL').map(code=>{
   const items=lines.filter(line=>line.currency===code),dates=[...new Set(items.map(line=>line.expectedPaymentDate).filter(date=>date&&validFinancialDay(date)))].sort();
   return [code,dates.length?`Pagamento previsto no dia do voo vinculado: ${dates.map(date=>date!.split('-').reverse().join('/')).join(', ')} · datas publicadas em BRT; não confirma crédito.${items.some(line=>!line.expectedPaymentDate)?' Há itens sem vínculo/data comprovados.':''}`:'Pagamento previsto no dia do voo vinculado; vínculo/data não comprovados nesta seleção.'];
  }));
  const brlTiming=brlDate?`Pagamento previsto em ${brlDate.split('-').reverse().join('/')} · regra informada: quinta-feira, antecipada para quarta se bancos de SP fecharem na quinta. Ciclo estimado; não confirma crédito.`:'Data a confirmar · calendário bancário de SP não verificado para este ciclo BRL.';
  return {kind:'allowance',range,upcomingLines:datedAllowanceLines(rows,pending,covered,coveredDays),timing:'Data a confirmar',currencyTiming:{BRL:brlTiming,...foreignTiming},expectedPaymentDates:brlDate?{BRL:brlDate}:{},source:'Referência semanal observada do motor atual (quarta a terça). Datas estimadas pela regra informada e calendário bancário de SP; não há comprovação de recebimento.',lines,totals:issues.length ? null : summary.totalsByCurrency,calculationTotals:knownPaymentTotals(lines.filter(line=>validFinancialDay(line.iso))),calculationPartial:issues.length>0,issues,caption:'Diárias · valores na moeda original'};
}
export type PayrollCandidate = { creditMonth:string; operationalMonth:string; fixedMonth:string; range:FinancialRange; lines:PaymentLine[]; issues:string[] };
export function nextPayrollPayment(candidates: PayrollCandidate[], now = new Date()): NextPayment {
  const currentMonth=rosterOperationalIso(now).slice(0,7);
  const next=candidates.filter(item=>/^\d{4}-(0[1-9]|1[0-2])$/.test(item.creditMonth)&&item.creditMonth>=currentMonth).sort((a,b)=>a.creditMonth.localeCompare(b.creditMonth))[0];
  if(!next)return {kind:'payroll',range:null,timing:'Mês de crédito a confirmar',source:'O ciclo precisa de um demonstrativo revisado nesta conta.',lines:[],totals:null,issues:['Revise um demonstrativo salarial para identificar o próximo ciclo.'],caption:'Folha · bruto estimado, antes dos descontos'};
  const issues=[...next.issues];
  if(!next.lines.length||next.lines.some(line=>line.value===null||!Number.isFinite(line.value)||line.value<0))issues.push('A composição deste ciclo ainda está incompleta.');
  const total=next.lines.reduce((sum,line)=>sum+(line.value??NaN),0);
  if(!Number.isFinite(total)&&!issues.length)issues.push('Não foi possível totalizar a composição deste ciclo.');
  const timing=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(next.creditMonth+'-01T12:00:00Z'));
  return {kind:'payroll',range:next.range,timing:`Crédito esperado em ${timing}`,source:`Ciclo empresarial revisado nesta conta: variáveis de ${next.operationalMonth}, fixos da folha ${next.fixedMonth}. Dia exato e liquidação não confirmados.`,lines:next.lines,totals:issues.length?null:{BRL:total},calculationTotals:knownPaymentTotals(next.lines),calculationPartial:issues.length>0,issues,caption:'Folha · bruto estimado, antes dos descontos'};
}
