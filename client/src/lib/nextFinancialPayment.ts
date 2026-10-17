import { observedAllowancePeriods, rowsInObservedCycle, summarizeNativeForecastRows } from './financialForecastPeriods';
import { rosterOperationalIso } from './compensationPolicy';
import { financialMonths, validFinancialDay, type FinancialRange } from './financialHistoryPeriods';

export type PaymentLine = { iso: string; label: string; currency: string; value: number | null; source: string };
export type NextPayment = {
  kind: 'allowance' | 'payroll'; range: FinancialRange | null; timing: string;
  currencyTiming?: Record<string,string>; source: string; lines: PaymentLine[]; totals: Record<string, number> | null;
  issues: string[]; caption: string; calculationTotals?:Record<string,number>|null; calculationPartial?:boolean; estimationBasis?:'operational_month';
};
type AllowanceRow = PaymentLine & { value: number; convertedBRL: number | null };
export function knownPaymentTotals(lines:readonly PaymentLine[]):Record<string,number>|null {
 const totals:Record<string,number>={},overflow=new Set<string>();for(const line of lines){if(line.value===null||!Number.isFinite(line.value)||line.value<0||!/^[A-Z]{3}$/.test(line.currency)||overflow.has(line.currency))continue;const value=(totals[line.currency]??0)+line.value;if(Number.isFinite(value))totals[line.currency]=value;else{delete totals[line.currency];overflow.add(line.currency);}}return Object.keys(totals).length?totals:null;
}
export function nextAllowancePayment(rows: AllowanceRow[], pending: Array<{iso:string;airport:string;reason?:string}>, covered: string[], now = new Date(), coveredDays?: string[]): NextPayment {
  const today = rosterOperationalIso(now), periods = observedAllowancePeriods(now, 'roster_brt');
  // The previous closed week is still the next reference on Wednesday/Thursday.
  // Never substitute the accumulating or selected month for that week's rows.
  const cycle = rosterOperationalIso(periods.previous.payment) >= today ? periods.previous : periods.accumulation;
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
  return {kind:'allowance',range,timing:'Data a confirmar',source:'Referência semanal observada do motor atual (quarta a terça). O demonstrativo deve confirmar o calendário; não há comprovação de recebimento.',lines,totals:issues.length ? null : summary.totalsByCurrency,calculationTotals:knownPaymentTotals(lines.filter(line=>validFinancialDay(line.iso))),calculationPartial:issues.length>0,issues,caption:'Diárias · valores na moeda original'};
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
