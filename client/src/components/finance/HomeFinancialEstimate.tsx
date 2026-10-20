import {FinancialFxProvider,useFinancialFx,FinancialFxSourceControl} from './FinancialFxProvider';
import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {CrewRoster} from '@/lib/pdfParser';
import type {NextPayment} from '@/lib/nextFinancialPayment';
import {getStoredUser,getToken} from '@/lib/authClient';
import {readFinancialFxReferences} from '@/lib/financialFxReference';
import {estimateAllowanceBrl} from '@shared/financialFx.mjs';
import {formatFinancialMinor} from '@shared/financialMoney.mjs';
import {FinancialPrivacyToggle,useFinancialPrivacy} from './FinancialPrivacy';
const Context=createContext<NextPayment|null>(null);
export const useHomeFinancialEstimate=()=>useContext(Context);
const account=()=>String(getStoredUser()?.id||getStoredUser()?.email||'');
export function HomeFinancialEstimateProvider({roster,calculate,children,accessKey}:{accessKey?:string;roster:CrewRoster;calculate:(roster:CrewRoster)=>NextPayment|null;children:ReactNode}){
 const [,refresh]=useState(0),owner=account(),token=getToken(),bound=useRef({owner,roster});
 if(roster!==bound.current.roster)bound.current={owner,roster};
 useEffect(()=>{const update=()=>refresh(n=>n+1);for(const e of ['crewcheck:auth-changed','crewcheck:auth-expired','crewcheck:auth-will-change','crewcheck:financial-config-changed','storage'])window.addEventListener(e,update);return()=>{for(const e of ['crewcheck:auth-changed','crewcheck:auth-expired','crewcheck:auth-will-change','crewcheck:financial-config-changed','storage'])window.removeEventListener(e,update);};},[]);
 const allowed=owner&&token&&bound.current.owner===owner&&!['visitor','guest'].includes(getStoredUser()?.role||'');
 // Reuse the canonical producer; never query or mutate the ledger for a Home estimate.
 const payment=allowed&&roster.days?.length?calculate(roster):null;
 return <FinancialFxProvider accessKey={accessKey}><Context.Provider value={payment}>{children}</Context.Provider></FinancialFxProvider>;
}
export default function HomeFinancialEstimate(){
 const payment=useContext(Context),privacy=useFinancialPrivacy(),fx=useFinancialFx();
 if(!payment)return null;
 const today=new Date().toISOString().slice(0,10),quotes=fx.quotes;
 const lines=payment.lines.map((line:any)=>({...line,id:[line.eventId||'',line.iso,line.label,line.currency].join(':')}));
 const estimate=estimateAllowanceBrl({lines,quotes,today,incomplete:payment.issues.length>0});
 return <div className="cc-home-brl-estimate"><FinancialPrivacyToggle/><p>{estimate.state==='available'?'Total estimado em R$':estimate.state==='no_data'?'Estimativa de diárias indisponível':'Total parcial estimado em R$'}</p><strong>{estimate.amountMinor===null?'Não calculável':privacy.amount(formatFinancialMinor(estimate.amountMinor,'BRL'))}</strong>{fx.mode==='automatic'&&fx.state!=='available'&&<small role="status">{fx.state==='stale'?'Cotação em cache; atualização indisponível.':fx.state==='loading'?'Consultando câmbio…':'Cotação automática indisponível.'}</small>}<small>Diárias · {payment.range?.start} a {payment.range?.end} · não confirma recebimento</small><details><summary>Ver cálculo</summary><FinancialFxSourceControl/><h3>Valores originais e cotações</h3>{estimate.items.map((item:any)=><p key={item.id}>{item.currency} · {item.originalMinor===null?'Não informado':privacy.amount(formatFinancialMinor(item.originalMinor,item.currency)||'Não calculável')} · {item.convertedMinor===null?'Cotação ou data ausente/incompatível':privacy.amount(formatFinancialMinor(item.convertedMinor,'BRL'))}{item.references.map((q:any)=><small key={q.asOf+q.source}>Referência de {q.asOf}{q.asOf<today?' · data anterior à consulta':''} · {q.source} · 1 {q.base||item.currency} = {privacy.amount(q.rate)} {q.quote||'BRL'}{q.retrievedAt?` · consulta ${q.retrievedAt}`:''}</small>)}</p>)}{estimate.state!=='available'&&<p>Itens pendentes não foram tratados como zero. Cotações antigas sem data não entram no total.</p>}<p>Conversão de referência, sem taxas bancárias, impostos ou valor de crédito garantido.</p></details></div>;
}
