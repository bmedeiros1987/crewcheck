import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowDownLeft, FileText, ChevronRight } from 'lucide-react';
import type { NextPayment } from '@/lib/nextFinancialPayment';
import type { FinancialRange } from '@/lib/financialHistoryPeriods';
import { FinancialPrivacyToggle, useFinancialPrivacy } from './FinancialPrivacy';
import './payment-preview.css';

export default function NextPaymentCard({ payment, requestRange, extraDetails }: { payment:NextPayment; requestRange:(range:FinancialRange)=>void; extraDetails?:ReactNode }) {
  const privacy=useFinancialPrivacy(), root=useRef<HTMLDivElement>(null);
  const [view,setView]=useState<'statement'|'details'>('statement');
  const id=useId();
  const lines=[...payment.lines].sort((a,b)=>a.iso.localeCompare(b.iso));
  const currencies=[...new Set(lines.map(line=>line.currency))];
  function changeView(next:'statement'|'details'){setView(next);root.current?.querySelector<HTMLButtonElement>(`[data-financial-tab="${next}"]`)?.focus();}
  useEffect(()=>{if(payment.range)requestRange(payment.range);},[payment.range?.start,payment.range?.end]);
  const dateLabel=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('/'):value;
  const money=(value:number,currency:string)=>privacy.amount(new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(value));
  const signed=(value:number,currency:string)=>privacy.amount(new Intl.NumberFormat('pt-BR',{style:'currency',currency,signDisplay:'always'}).format(value));
  function open(selector:string){
    const target=root.current?.closest('.cc-per-diem-content')?.querySelector<HTMLElement>(selector);
    if(!target)return;
    if(target instanceof HTMLDetailsElement)target.open=true;
    const focus=target.querySelector<HTMLElement>('summary,button,input')||target;
    if(!focus.hasAttribute('tabindex'))focus.setAttribute('tabindex','-1');
    target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});focus.focus({preventScroll:true});
  }
  return <div ref={root} className="cc-payment-overview">
    <section className="cc-payment-hero" aria-label="Próximo pagamento previsto">
      <div className="cc-payment-topline"><span><ArrowDownLeft aria-hidden="true"/> PRÓXIMO CICLO</span><FinancialPrivacyToggle/></div>
      <h2>Próximo pagamento previsto</h2>
      <p className="cc-payment-caption">{payment.caption}</p>
      <div className="cc-payment-value" data-complete={Boolean(payment.totals)}>{payment.totals ? Object.entries(payment.totals).map(([currency,value])=><strong key={currency}>{money(value,currency)}</strong>) : <strong>Previsão incompleta</strong>}</div>
      <p className="cc-payment-timing">{payment.timing}</p>
      {payment.range&&<p className="cc-payment-period">Ciclo · {payment.kind==='allowance'?'Trabalho de':'Composição de'} {dateLabel(payment.range.start)} a {dateLabel(payment.range.end)} · {payment.lines.length} itens</p>}
      <p className="cc-payment-disclaimer">Estimativa · recebimento não confirmado</p>
    </section>
    <section className="cc-payment-pending" aria-label="Conferir previsão" tabIndex={-1}>
      <h3>{payment.issues.length?'Falta confirmar':'A conferir no demonstrativo'}</h3>
      {payment.issues.length?<><p>{payment.issues[0]}</p>{payment.issues.length>1&&<details><summary>Mais {payment.issues.length-1} pendência(s)</summary><ul>{payment.issues.slice(1).map(issue=><li key={issue}>{issue}</li>)}</ul></details>}</>:<p>Data e recebimento ainda não confirmados.</p>}
      {payment.issues.some(issue=>/escala|programação/.test(issue))&&<button onClick={()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'import'}))}>Importar escala <ChevronRight size={16} aria-hidden="true"/></button>}
      <button aria-label="Demonstrativos" onClick={()=>open(payment.kind==='allowance'?'.cc-financial-reconciliation':'.cc-salary-reference')}><FileText size={16} aria-hidden="true"/> Conferir demonstrativo <ChevronRight size={16} aria-hidden="true"/></button>
    </section>
    <div className="cc-bank-tabs" role="tablist" aria-label="Consulta financeira">
      {(['statement','details'] as const).map((tab,index)=><button key={tab} type="button" role="tab" id={`${id}-${tab}-tab`} data-financial-tab={tab} aria-selected={view===tab} aria-controls={`${id}-${tab}`} tabIndex={view===tab?0:-1} onClick={()=>setView(tab)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();changeView(event.key==='Home'?'statement':event.key==='End'?'details':index===0?'details':'statement');}}}>{tab==='statement'?'Extrato':'Detalhes'}</button>)}
    </div>
    <section className="cc-next-payment-lines" role="tabpanel" id={`${id}-statement`} aria-labelledby={`${id}-statement-tab`} hidden={view!=='statement'} tabIndex={0}>
      <header><h3>Extrato previsto do próximo ciclo</h3><span>{lines.length} itens · recebimento não confirmado</span></header>
      {lines.map((line,index)=><details className="cc-bank-transaction" data-financial-transaction-date={line.iso} key={`${line.iso}:${line.label}:${index}`}><summary><span><strong>{line.label}</strong><small>{dateLabel(line.iso)} · Previsto</small></span><b>{line.value===null||!Number.isFinite(line.value)?'Não informado':signed(line.value,line.currency)}</b></summary><p>{privacy.text(line.source)}</p></details>)}
      {!lines.length&&<p>Sem lançamentos disponíveis. Nenhum valor foi presumido.</p>}
    </section>
    <section className="cc-bank-details" role="tabpanel" id={`${id}-details`} aria-labelledby={`${id}-details-tab`} hidden={view!=='details'} tabIndex={0}>
      <h3>Composição em gráfico</h3><p>Estimativas · recebimento não confirmado</p>
      {currencies.map(currency=>{const grouped=new Map<string,{label:string;value:number|null;count:number}>();for(const line of lines.filter(line=>line.currency===currency)){const previous=grouped.get(line.label),known=line.value!==null&&Number.isFinite(line.value);const value=previous?(previous.value!==null&&known?previous.value+line.value!:null):known?line.value:null;grouped.set(line.label,{label:line.label,value:value!==null&&Number.isFinite(value)?value:null,count:(previous?.count||0)+1});}const items=[...grouped.values()],known=items.filter(line=>line.value!==null),max=known.length?Math.max(...known.map(line=>Math.abs(line.value!))):0;return <section className="cc-bank-chart" key={currency} aria-label={`Previsões em ${currency}`}><h4>{currency}</h4>{items.map((line,index)=><div className="cc-bank-chart-row" key={index}><span>{line.label}<small>{line.count} {line.count===1?'item':'itens'}</small></span><b>{line.value===null||!Number.isFinite(line.value)?'Não informado':signed(line.value,currency)}</b>{!privacy.hidden&&line.value!==null&&Number.isFinite(line.value)&&<span className="cc-bank-chart-track" aria-hidden="true"><span style={{width:`${max>0?Math.abs(line.value)/max*100:0}%`}}/></span>}</div>)}</section>})}
      {!lines.length&&<p>Sem dados suficientes para o gráfico.</p>}
      {payment.kind==='payroll'&&<p>Composição bruta. Descontos e líquido ficam no detalhe da competência.</p>}
      {extraDetails}
      <details className="cc-financial-help"><summary>Origem do ciclo</summary><p>{payment.source}</p></details>
    </section>
  </div>;
}
