import {useEffect,useRef,useState} from 'react';
import type {NextPayment} from '@/lib/nextFinancialPayment';
import {useFinancialPrivacy} from './FinancialPrivacy';
export default function ForecastCurrencyCarousel({payment}:{payment:NextPayment}){
  const privacy=useFinancialPrivacy(),viewport=useRef<HTMLDivElement>(null),[selected,setSelected]=useState('');
  const currencies=[...new Set(payment.lines.map(line=>line.currency))].filter(code=>/^[A-Z]{3}$/.test(code)).sort((a,b)=>{const order=['BRL','USD','EUR','GBP'];return (order.includes(a)?order.indexOf(a):99)-(order.includes(b)?order.indexOf(b):99)||a.localeCompare(b);});
  const active=currencies.includes(selected)?selected:currencies[0],index=Math.max(0,currencies.indexOf(active));
  useEffect(()=>{const el=viewport.current;if(el)el.scrollTo({left:index*el.clientWidth,behavior:'instant'});},[currencies.join('|')]);
  function go(next:number){const target=Math.max(0,Math.min(currencies.length-1,next));setSelected(currencies[target]);viewport.current?.scrollTo({left:target*(viewport.current?.clientWidth||0),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
  if(!currencies.length)return <div className="cc-forecast-currencies"><div className="cc-payment-value"><strong>Previsão incompleta</strong></div><p className="cc-payment-timing">{payment.timing}</p></div>;
  return <div className="cc-forecast-currencies">
    <div className="cc-forecast-currency-viewport" ref={viewport} role="region" aria-label="Moedas da previsão" aria-roledescription="carrossel" tabIndex={currencies.length>1?0:undefined} onScroll={event=>{const el=event.currentTarget;const next=Math.round(el.scrollLeft/el.clientWidth);if(currencies[next])setSelected(currencies[next]);}} onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();go(index+(event.key==='ArrowRight'?1:-1));}}}>
      {currencies.map(currency=><section className="cc-forecast-currency-slide" key={currency} aria-label={`Previsão em ${currency}`}><p className="cc-forecast-currency-code">{currency}</p><div className="cc-payment-value" data-complete={Boolean(payment.totals)}><strong>{payment.totals&&Number.isFinite(payment.totals[currency])?privacy.amount(new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(payment.totals[currency])):'Previsão incompleta'}</strong></div><p className="cc-payment-timing">{payment.currencyTiming?.[currency]||payment.timing}</p></section>)}
    </div>
    {currencies.length>1&&<div className="cc-forecast-currency-controls"><button type="button" aria-label="Moeda anterior" disabled={!index} onClick={()=>go(index-1)}>‹</button><span aria-live="polite">{active} · {index+1} de {currencies.length}</span><button type="button" aria-label="Próxima moeda" disabled={index===currencies.length-1} onClick={()=>go(index+1)}>›</button></div>}
  </div>;
}
