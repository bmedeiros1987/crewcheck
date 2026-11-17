import {FinancialFxProvider,useFinancialFx,FinancialFxSourceControl} from './FinancialFxProvider';
import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {CrewRoster} from '@/lib/pdfParser';
import type {NextPayment} from '@/lib/nextFinancialPayment';
import {getStoredUser,getToken} from '@/lib/authClient';
import {readFinancialFxReferences} from '@/lib/financialFxReference';
import {estimateAllowanceBrl} from '@shared/financialFx.mjs';
import {formatFinancialMinor} from '@shared/financialMoney.mjs';
import {Calculator} from 'lucide-react';
import './financial-summary-clarity.css';
import {FinancialPrivacyToggle,useFinancialPrivacy} from './FinancialPrivacy';
const Context=createContext<NextPayment|null>(null);
const CalculationStatus=createContext({pending:false,retry:()=>{}});
export const useHomeFinancialEstimate=()=>useContext(Context);
const account=()=>String(getStoredUser()?.id||getStoredUser()?.email||'');
export function HomeFinancialEstimateProvider({roster,calculate,children,accessKey}:{accessKey?:string;roster:CrewRoster;calculate:(roster:CrewRoster)=>NextPayment|null;children:ReactNode}){
 const [,refresh]=useState(0),owner=account(),token=getToken(),bound=useRef({owner,roster});
 if(roster!==bound.current.roster)bound.current={owner,roster};
 useEffect(()=>{const update=()=>refresh(n=>n+1);for(const e of ['crewcheck:auth-changed','crewcheck:auth-expired','crewcheck:auth-will-change','crewcheck:financial-config-changed','storage'])window.addEventListener(e,update);return()=>{for(const e of ['crewcheck:auth-changed','crewcheck:auth-expired','crewcheck:auth-will-change','crewcheck:financial-config-changed','storage'])window.removeEventListener(e,update);};},[]);
 const allowed=owner&&token&&bound.current.owner===owner&&!['visitor','guest'].includes(getStoredUser()?.role||'');
 // Reuse the canonical producer; never query or mutate the ledger for a Home estimate.
 let payment:NextPayment|null=null,pending=false;
 try{payment=allowed&&roster.days?.length?calculate(roster):null;}catch(error){if(error instanceof Error&&error.message==='FINANCIAL_CALCULATION_CONTEXT_CHANGED')pending=true;else throw error;}
 return <FinancialFxProvider accessKey={accessKey}><CalculationStatus.Provider value={{pending,retry:()=>refresh(n=>n+1)}}><Context.Provider value={payment}>{children}</Context.Provider></CalculationStatus.Provider></FinancialFxProvider>;
}
export default function HomeFinancialEstimate(){
 const payment=useContext(Context),privacy=useFinancialPrivacy(),fx=useFinancialFx(),calculation=useContext(CalculationStatus);
 if(calculation.pending)return <div className="cc-home-brl-estimate" role="status"><p>Atualização financeira pendente</p><button type="button" className="min-h-11" onClick={calculation.retry}>Atualizar previsão</button></div>;
 if(!payment)return null;
 const today=new Date().toISOString().slice(0,10),quotes=fx.quotes;
 const lines=payment.lines.map((line:any)=>({...line,id:[line.eventId||'',line.iso,line.label,line.currency].join(':')}));
 const estimate=estimateAllowanceBrl({lines,quotes,today,incomplete:payment.issues.length>0});
 const foreign=estimate.items.filter((item:any)=>item.currency!=='BRL');
 const pendingCurrencies=[...new Set(foreign.filter((item:any)=>item.originalMinor!==null&&item.convertedMinor===null&&item.state!=='invalid').map((item:any)=>item.currency))];
 const dateLabel=(value?:string)=>value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('/'):'a confirmar';
 const incomplete=estimate.state!=='available';
 return <div className="cc-home-brl-estimate" data-estimate-state={estimate.state}>
   <div className="cc-home-estimate-heading"><p>{estimate.state==='available'?'Diárias estimadas':estimate.state==='no_data'?'Diárias a calcular':estimate.amountMinor===null?'Diárias pendentes':'Subtotal conhecido'}</p><FinancialPrivacyToggle iconOnly/></div>
   <strong>{estimate.amountMinor===null?'Não calculável':privacy.amount(formatFinancialMinor(estimate.amountMinor,'BRL'))}</strong>
   {estimate.state==='no_data'?<small role="status">Sem diárias calculadas no período.</small>:pendingCurrencies.length>0?<small role="status">{fx.mode==='automatic'&&fx.state==='loading'?'Consultando câmbio…':`Câmbio pendente: ${pendingCurrencies.join(', ')}.`}</small>:incomplete?<small role="status">Há dados pendentes.</small>:foreign.length>0&&fx.state==='stale'?<small role="status">Cotação em cache · confira a data.</small>:null}
   <small>Diárias · {dateLabel(payment.range?.start)} a {dateLabel(payment.range?.end)} · estimativa · recebimento não confirmado</small>
   <details><summary><Calculator size={18} aria-hidden="true"/>Ver cálculo</summary>
     {foreign.length>0&&<FinancialFxSourceControl/>}
     {payment.issues.length>0&&<ul>{payment.issues.map(issue=><li key={issue}>{privacy.text(issue)}</li>)}</ul>}
     <h3>Valores por moeda</h3>{estimate.items.map((item:any)=><p key={item.id}>{item.currency} · {item.originalMinor===null?'Não informado':privacy.amount(formatFinancialMinor(item.originalMinor,item.currency)||'Não calculável')} · {item.originalMinor===null?'Valor original pendente':item.convertedMinor===null?'Conversão pendente':privacy.amount(formatFinancialMinor(item.convertedMinor,'BRL'))}{item.references.map((q:any)=><small key={q.asOf+q.source}>Referência de {q.asOf}{q.asOf<today?' · data anterior à consulta':''} · {q.source} · 1 {q.base||item.currency} = {privacy.amount(q.rate)} {q.quote||'BRL'}{q.retrievedAt?` · consulta ${q.retrievedAt}`:''}</small>)}</p>)}
     {incomplete&&<p>Dados pendentes não foram tratados como zero.</p>}
     <p>Conversão de referência. Taxas, impostos e recebimento não confirmados.</p>
   </details>
 </div>;
}
