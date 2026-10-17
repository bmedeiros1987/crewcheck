import { useEffect, useRef } from 'react';
import { ArrowDownLeft, FileText, List, CircleAlert, ChevronRight } from 'lucide-react';
import type { NextPayment } from '@/lib/nextFinancialPayment';
import type { FinancialRange } from '@/lib/financialHistoryPeriods';
import { FinancialPrivacyToggle, useFinancialPrivacy } from './FinancialPrivacy';
import './payment-preview.css';

export default function NextPaymentCard({ payment, requestRange }: { payment:NextPayment; requestRange:(range:FinancialRange)=>void }) {
  const privacy=useFinancialPrivacy(), root=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(payment.range)requestRange(payment.range);},[payment.range?.start,payment.range?.end]);
  const dateLabel=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('/'):value;
  const money=(value:number,currency:string)=>privacy.amount(new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(value));
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
      <p className="cc-payment-disclaimer">Estimativa para conferir. Não representa dinheiro recebido.</p>
    </section>
    <nav className="cc-payment-actions" aria-label="Ações financeiras">
      <button onClick={()=>open('.cc-next-payment-lines')}><List aria-hidden="true"/><span>Composição</span><ChevronRight aria-hidden="true"/></button>
      <button aria-label="Demonstrativos" onClick={()=>open(payment.kind==='allowance'?'.cc-financial-reconciliation':'.cc-salary-prerequisites details')}><FileText aria-hidden="true"/><span>Extratos</span><ChevronRight aria-hidden="true"/></button>
      <button aria-label="Pendências" onClick={()=>open('.cc-payment-pending')}><CircleAlert aria-hidden="true"/><span>Pendências{payment.issues.length ? ` (${payment.issues.length})` : ''}</span><ChevronRight aria-hidden="true"/></button>
    </nav>
    <section className="cc-payment-pending" aria-label="Conferir previsão" tabIndex={-1}>
      <h3>{payment.issues.length?'O que falta conferir':'Composição disponível'}</h3>
      {payment.issues.length?<ul>{payment.issues.map(issue=><li key={issue}>{issue}</li>)}</ul>:<p>Os itens do ciclo estão disponíveis. Confirme o calendário e os valores no demonstrativo.</p>}
      {payment.issues.some(issue=>/escala|programação/.test(issue))&&<button onClick={()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'import'}))}>Importar escala <ChevronRight size={16} aria-hidden="true"/></button>}
      <button onClick={()=>open(payment.kind==='allowance'?'.cc-financial-reconciliation':'.cc-salary-prerequisites details')}>Conferir demonstrativo <ChevronRight size={16} aria-hidden="true"/></button>
    </section>
    <details className="cc-next-payment-lines"><summary>Composição do próximo pagamento <span>{payment.lines.length} itens</span></summary>
      <p>{payment.source}</p>
      {payment.lines.map((line,index)=><article key={`${line.iso}:${line.label}:${index}`}><div><strong>{line.label}</strong><small>{dateLabel(line.iso)}</small></div><b>{line.value===null?'Não informado':money(line.value,line.currency)}</b><p>{privacy.text(line.source)}</p></article>)}
      {!payment.lines.length&&<p>Nenhum valor foi presumido. Confira a referência e a escala deste ciclo.</p>}
    </details>
  </div>;
}
