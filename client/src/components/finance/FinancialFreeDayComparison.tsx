import {useEffect,useRef,useState,type ReactNode} from 'react';
import {CalendarDays,Info,TriangleAlert} from 'lucide-react';
import type {FreeDayReview} from '@/lib/freeDayPostponement';
import {financialRateSession} from '@/lib/financialStatementLearning';
import {useFinancialPrivacy} from './FinancialPrivacy';

// Presentation only. The existing free-day review owns comparison and evidence.
// Never mount FreeDayPostponementAlerts here: it also owns notification effects.
export default function FinancialFreeDayComparison({review,session,children}:{review:FreeDayReview;session:string|null;children?:ReactNode}){
 const root=useRef<HTMLElement>(null),privacy=useFinancialPrivacy(),[active,setActive]=useState(true);
 useEffect(()=>{setActive(true);const clear=()=>setActive(false);const storage=(e:StorageEvent)=>{if(!e.key||['crewcheck_auth_user','crewcheck_auth_token'].includes(e.key))clear();};const events=['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'];events.forEach(name=>window.addEventListener(name,clear));window.addEventListener('storage',storage);return()=>{events.forEach(name=>window.removeEventListener(name,clear));window.removeEventListener('storage',storage);};},[session]);
 if(!active||!session||session!==financialRateSession())return null;
 const unavailable=Boolean(review.reason||review.pending.length);
 function select(){const details=root.current?.querySelector<HTMLDetailsElement>('[data-free-day-source-consent]');if(details){details.open=true;details.querySelector<HTMLElement>('summary')?.focus();}}
 return <section ref={root} className="cc-financial-free-day" aria-label="Início de folga" data-comparison-state={review.reasonCode==='period_mismatch'?'period-mismatch':unavailable?'pending':'compared'}>
  <div className="cc-salary-prerequisite-summary"><CalendarDays aria-hidden="true"/><h3>Início de folga</h3><button type="button" onClick={select} disabled={!children}>Selecionar</button></div>
  <span role="status">{review.reasonCode==='period_mismatch'?'Selecione versões do mesmo mês':unavailable?'Dados a conferir':'Comparação disponível'}</span>
  {review.alerts.length>0&&<div className="cc-financial-free-day-actionable"><TriangleAlert aria-hidden="true"/><strong>{review.alerts.length} alertas a revisar</strong></div>}
  <details><summary><Info size={18} aria-hidden="true"/>Detalhes</summary>{review.reason&&<p>{privacy.text(review.reason)}</p>}{review.alerts.map(alert=><div key={alert.id}>{alert.date} · {alert.oldClock} → {alert.newClock}</div>)}{review.pending.map((item,index)=><div key={index}><strong>{item.date||'Data não comprovada'}</strong><ul>{(item.missing?.length?item.missing:[item.reason]).map((text,i)=><li key={i}>{privacy.text(text)}</li>)}</ul></div>)}<dl><div><dt>Pagamento</dt><dd>Não confirmado</dd></div></dl></details>
  {children}
 </section>;
}
