import FinancialChangesScreen from './FinancialChangesScreen';
import ForecastCurrencyCarousel from './ForecastCurrencyCarousel';
import './persistent-history.css';
import { useEffect, useRef, type ReactNode } from 'react';
import { Calculator, ArrowDownLeft, FileText, ChevronRight, GitCompareArrows } from 'lucide-react';
import type { NextPayment } from '@/lib/nextFinancialPayment';
import type { FinancialRange } from '@/lib/financialHistoryPeriods';
import { FinancialPrivacyToggle, useFinancialPrivacy } from './FinancialPrivacy';
import './payment-preview.css';
import { useFinancialScreen } from './FinancialScreen';

export default function NextPaymentCard({ payment, requestRange, extraDetails, salaryDisplay }: { payment:NextPayment; requestRange:(range:FinancialRange)=>void; extraDetails?:ReactNode;salaryDisplay?:{title?:string;control:ReactNode;amount:ReactNode;caption:string} }) {
  const privacy=useFinancialPrivacy(), root=useRef<HTMLDivElement>(null);
  const {screen,navigate,back,controls,history,range,changesDetails}=useFinancialScreen();
  const overviewCaption=payment.kind==='payroll'?(payment.estimationBasis==='operational_month'&&payment.range?`Salário · ${payment.range.start.slice(0,7).split('-').reverse().join('/')} · bruto estimado`:payment.caption.replace(', antes dos descontos','').replace(' · antes dos descontos','')):'Diárias';
  const lines=[...payment.lines].sort((a,b)=>a.iso.localeCompare(b.iso));
  const currencies=[...new Set(lines.map(line=>line.currency))];

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
  return <div ref={root} className="cc-payment-overview" data-financial-screen={screen} data-financial-item-count={payment.lines.length}>
    {screen!=='changes'&&payment.kind==='payroll'&&salaryDisplay?.control}
    {screen==='statement'&&payment.kind==='payroll'&&salaryDisplay?.amount}
    {screen!=='overview'&&<header className="cc-financial-screen-head"><button type="button" onClick={()=>back?back():navigate('overview')}>← Voltar</button><h2 tabIndex={-1} data-financial-screen-heading>{screen==='statement'?'Extrato':screen==='charts'?'Gráficos':screen==='changes'?'Alterações':'Detalhes do pagamento'}</h2></header>}
    {(screen==='statement'||screen==='charts'||screen==='changes')&&controls}
    {screen==='changes'&&<>{changesDetails}<FinancialChangesScreen range={range}/></>}
    {(screen==='statement'||screen==='charts')&&history}
    {screen==='statement'&&<p className="cc-financial-history-availability">Previsões recalculadas da escala · separadas dos registros salvos.</p>}
    {(screen==='overview'||screen==='payment')&&<>
    <section className="cc-payment-hero" aria-label="Próximo pagamento previsto">
      <div className="cc-payment-topline"><span><ArrowDownLeft aria-hidden="true"/> {payment.estimationBasis==='operational_month'?'CÁLCULO DA ESCALA':'PRÓXIMO CICLO'}</span><FinancialPrivacyToggle/><details className="cc-payment-help"><summary aria-label="Entender esta previsão"><span aria-hidden="true">?</span></summary><div><p>{privacy.text(payment.source)}</p>{Object.entries(payment.currencyTiming||{}).map(([currency,timing])=><p key={currency}>{currency} · {privacy.text(timing)}</p>)}{payment.issues.length>0&&<ul>{payment.issues.map(issue=><li key={issue}>{privacy.text(issue)}</li>)}</ul>}</div></details>{payment.kind==='allowance'&&<button type="button" className="cc-financial-calculator-shortcut" aria-label="Abrir calculadora de moedas" onClick={()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'currency'}))}><Calculator size={20} aria-hidden="true"/></button>}</div>
      <h2 data-financial-screen-heading={screen==='overview'?true:undefined} tabIndex={-1}>{payment.kind==='payroll'&&salaryDisplay?.title?salaryDisplay.title:payment.estimationBasis==='operational_month'?'Estimativa salarial da escala':'Próximo pagamento previsto'}</h2>
      <p className="cc-payment-caption">{payment.kind==='payroll'&&salaryDisplay?salaryDisplay.caption:screen==='overview'?overviewCaption:payment.caption}</p>
      {payment.kind==='payroll'&&salaryDisplay?salaryDisplay.amount:<ForecastCurrencyCarousel payment={payment}/>}
      {screen==='payment'&&payment.range&&<p className="cc-payment-period">Ciclo · {payment.kind==='allowance'?'Trabalho de':'Composição de'} {dateLabel(payment.range.start)} a {dateLabel(payment.range.end)} · {payment.lines.length} itens</p>}
      <p className="cc-payment-disclaimer">Estimativa · recebimento não confirmado</p>
    </section>
    {screen!=='overview'&&<section className="cc-payment-pending" aria-label="Conferir previsão" tabIndex={-1}>
      <h3>{payment.issues.length?'Falta confirmar':'A conferir no demonstrativo'}</h3>
      {payment.issues.length?<><p>{payment.issues[0]}</p>{payment.issues.length>1&&<details><summary>Mais {payment.issues.length-1} pendência(s)</summary><ul>{payment.issues.slice(1).map(issue=><li key={issue}>{issue}</li>)}</ul></details>}</>:<p>Data e recebimento ainda não confirmados.</p>}
      <div className="cc-financial-actions">{payment.issues.some(issue=>/escala|programação/.test(issue))&&<button onClick={()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'import'}))}>Importar escala <ChevronRight size={16} aria-hidden="true"/></button>}
      <button aria-label="Demonstrativos" onClick={()=>open(payment.kind==='allowance'?'.cc-financial-reconciliation':'.cc-salary-reference')}><FileText size={16} aria-hidden="true"/> Conferir demonstrativo <ChevronRight size={16} aria-hidden="true"/></button></div>
    </section>}
    </>}
    <nav className="cc-financial-screen-links" aria-label="Navegação financeira">
      {screen!=='overview'&&<button type="button" onClick={()=>navigate('overview')}>Resumo financeiro <ChevronRight size={16} aria-hidden="true"/></button>}
      {screen==='statement'||screen==='charts'||screen==='changes'?<button type="button" onClick={()=>navigate('payment')}>Detalhes do pagamento <ChevronRight size={16} aria-hidden="true"/></button>:<button type="button" onClick={()=>navigate(screen==='overview'?'payment':'statement')}>{screen==='overview'?'Detalhes do pagamento':'Extrato'} <ChevronRight size={16} aria-hidden="true"/></button>}
      {screen!=='statement'&&screen!=='payment'&&<button type="button" onClick={()=>navigate('statement')}>Extrato <ChevronRight size={16} aria-hidden="true"/></button>}
      {screen!=='charts'&&<button type="button" onClick={()=>navigate('charts')}>Gráficos <ChevronRight size={16} aria-hidden="true"/></button>}
      {screen!=='changes'&&<button type="button" onClick={()=>navigate('changes')}><GitCompareArrows size={18} aria-hidden="true"/>Alterações</button>}
      {(screen==='charts'||screen==='statement'||screen==='changes')&&<FinancialPrivacyToggle/>}
    </nav>
    {screen==='payment'&&<section className="cc-next-payment-lines" aria-label="Composição do pagamento">
      <header><h3>{payment.estimationBasis==='operational_month'?'Composição estimada da competência':'Extrato previsto do próximo ciclo'}</h3><span>{lines.length} itens · recebimento não confirmado</span></header>
      {lines.map((line,index)=><details className="cc-bank-transaction" data-money-direction={privacy.hidden||line.value===null?undefined:line.value<0?'outflow':'income'} data-financial-transaction-date={line.iso} key={`${line.iso}:${line.label}:${index}`}><summary><span><strong>{line.label}</strong><small>{dateLabel(line.iso)} · competência/origem</small>{line.value!==null&&Number.isFinite(line.value)&&line.partial&&<small>Subtotal parcial conhecido</small>}{line.pendingReason&&(line.value===null||line.partial)&&<small>{line.pendingReason}</small>}{payment.kind==='allowance'&&<small>{line.currency==='BRL'?(payment.expectedPaymentDates?.BRL?`Pagamento previsto: ${dateLabel(payment.expectedPaymentDates.BRL)}`:'Pagamento BRL: calendário/ciclo a conferir'):line.expectedPaymentDate?`Pagamento previsto no dia do voo: ${dateLabel(line.expectedPaymentDate)}`:'Pagamento no dia do voo vinculado; vínculo/data não comprovados neste item.'}</small>}</span><b>{line.value===null||!Number.isFinite(line.value)?'Não informado':signed(line.value,line.currency)}</b></summary><p>{privacy.text(line.source)}</p></details>)}
      {!lines.length&&<p>Sem lançamentos disponíveis. Nenhum valor foi presumido.</p>}
    </section>}
    {screen==='charts'&&<section className="cc-bank-details" aria-label="Detalhes em gráficos">
      <h3>Composição do próximo ciclo</h3><p>{payment.range?`${dateLabel(payment.range.start)} a ${dateLabel(payment.range.end)} · `:''}Estimativas · recebimento não confirmado</p>
      {currencies.map(currency=>{const grouped=new Map<string,{label:string;value:number|null;count:number}>();for(const line of lines.filter(line=>line.currency===currency)){const previous=grouped.get(line.label),known=line.value!==null&&Number.isFinite(line.value);const value=previous?(previous.value!==null&&known?previous.value+line.value!:null):known?line.value:null;grouped.set(line.label,{label:line.label,value:value!==null&&Number.isFinite(value)?value:null,count:(previous?.count||0)+1});}const items=[...grouped.values()],known=items.filter(line=>line.value!==null),max=known.length?Math.max(...known.map(line=>Math.abs(line.value!))):0;return <section className="cc-bank-chart" key={currency} aria-label={`Previsões em ${currency}`}><h4>{currency}</h4>{items.map((line,index)=><div className="cc-bank-chart-row" key={index}><span>{line.label}<small>{line.count} {line.count===1?'item':'itens'}</small></span><b>{line.value===null||!Number.isFinite(line.value)?'Não informado':signed(line.value,currency)}</b>{!privacy.hidden&&line.value!==null&&Number.isFinite(line.value)&&<span className="cc-bank-chart-track" aria-hidden="true"><span style={{width:`${max>0?Math.abs(line.value)/max*100:0}%`}}/></span>}</div>)}</section>})}
      {!lines.length&&<p>Sem dados suficientes para o gráfico.</p>}
      {payment.kind==='payroll'&&<p>Composição bruta. Descontos e líquido ficam no detalhe da competência.</p>}
      {extraDetails}
      <details className="cc-financial-help"><summary>Origem do ciclo</summary><p>{payment.source}</p></details>
    </section>}
  </div>;
}
