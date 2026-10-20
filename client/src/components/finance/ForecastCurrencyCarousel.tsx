import {useEffect,useRef,useState} from 'react';
import {validFinancialDay} from '@/lib/financialHistoryPeriods';
import type {NextPayment} from '@/lib/nextFinancialPayment';
import {useFinancialScreen} from './FinancialScreen';
import {useFinancialPrivacy} from './FinancialPrivacy';
export default function ForecastCurrencyCarousel({payment}:{payment:NextPayment}){
  const privacy=useFinancialPrivacy(),viewport=useRef<HTMLDivElement>(null),[localSelected,setLocalSelected]=useState('');
  const context=useFinancialScreen(),selected=context.currency??localSelected,setSelected=context.setCurrency??setLocalSelected;
  const currencies=[...new Set(payment.lines.map(line=>line.currency))].filter(code=>/^[A-Z]{3}$/.test(code)).sort((a,b)=>{const order=['BRL','USD','EUR','GBP'];return (order.includes(a)?order.indexOf(a):99)-(order.includes(b)?order.indexOf(b):99)||a.localeCompare(b);});
  const internalSelection=useRef(false);
  const displayTotals=payment.calculationTotals??payment.totals;
  const active=currencies.includes(selected)?selected:currencies[0],index=Math.max(0,currencies.indexOf(active));
  useEffect(()=>{if(internalSelection.current){internalSelection.current=false;return;}const el=viewport.current;if(el)el.scrollTo({left:index*el.clientWidth,behavior:'instant'});},[currencies.join('|'),active]);
  function go(next:number){const target=Math.max(0,Math.min(currencies.length-1,next));internalSelection.current=true;setSelected(currencies[target]);viewport.current?.scrollTo({left:target*(viewport.current?.clientWidth||0),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  const compact=context.screen==='overview';
  const dateLabel=(value:string)=>value.split('-').reverse().join('/');
  function timing(currency:string){
    const full=payment.currencyTiming?.[currency]||payment.timing;
    if(payment.kind==='payroll')return full;
    if(currency==='BRL')return payment.expectedPaymentDates?.BRL?`Previsto · ${dateLabel(payment.expectedPaymentDates.BRL)}`:'Data a confirmar';
    const items=payment.lines.filter(line=>line.currency===currency),dates=[...new Set(items.map(line=>line.expectedPaymentDate).filter((date):date is string=>Boolean(date&&validFinancialDay(date))))].sort();
    return dates.length?`Dia do voo · ${dates.map(dateLabel).join(' · ')}${items.some(line=>!line.expectedPaymentDate)?' · parcial':''}`:'Data a confirmar';
  }
  if(!currencies.length)return <div className="cc-forecast-currencies"><div className="cc-payment-value"><strong>Previsão incompleta</strong></div><p className="cc-payment-timing">{payment.kind==='allowance'&&payment.expectedPaymentDates?.BRL?`Referência BRL · previsto ${dateLabel(payment.expectedPaymentDates.BRL)}`:payment.timing}</p></div>;
  return <div className="cc-forecast-currencies">
    <div className="cc-forecast-currency-viewport" ref={viewport} role="region" aria-label="Moedas da previsão" aria-roledescription="carrossel" tabIndex={currencies.length>1?0:undefined} onScroll={event=>{const el=event.currentTarget;const next=Math.round(el.scrollLeft/el.clientWidth);if(currencies[next]&&currencies[next]!==selected){internalSelection.current=true;setSelected(currencies[next]);}}} onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();go(index+(event.key==='ArrowRight'?1:-1));}}}>
      {currencies.map(currency=><section className="cc-forecast-currency-slide" key={currency} aria-label={`Previsão em ${currency}`}><p className="cc-forecast-currency-code">{currency}</p><div className="cc-payment-value" data-complete={Boolean(payment.totals)} data-calculation-partial={Boolean(payment.calculationPartial)}><strong>{displayTotals&&Number.isFinite(displayTotals[currency])?privacy.amount(new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(displayTotals[currency])):'Previsão incompleta'}</strong>{displayTotals&&Number.isFinite(displayTotals[currency])&&<small>{compact?(payment.calculationPartial?'subtotal estimado · parcial':'Estimado'):(payment.calculationPartial?'Previsão incompleta · subtotal estimado das parcelas conhecidas':'Estimativa calculada · sem confirmação de pagamento')}</small>}</div><p className="cc-payment-timing">{timing(currency)}</p></section>)}
    </div>
    {currencies.length>1&&<div className="cc-forecast-currency-controls"><button type="button" aria-label="Moeda anterior" disabled={!index} onClick={()=>go(index-1)}>‹</button><span aria-live="polite">{active} · {index+1} de {currencies.length}</span><button type="button" aria-label="Próxima moeda" disabled={index===currencies.length-1} onClick={()=>go(index+1)}>›</button></div>}
  </div>;
}
