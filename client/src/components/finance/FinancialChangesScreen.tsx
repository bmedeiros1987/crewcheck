import {useEffect,useState} from 'react';
import {ArrowRight,GitCompareArrows,Info,TriangleAlert} from 'lucide-react';
import {currentPublicationReview,publicationOwner,subscribePublicationReview} from '@/lib/rosterPublicationRuntime';
import type {Change} from '@/lib/rosterPublicationReview';
import type {FinancialRange} from '@/lib/financialHistoryPeriods';
import {PublicationChangeDetail} from '../v1391/PublicationChangeDetail';
import {getStoredUser} from '@/lib/authClient';
import {useFinancialPrivacy} from './FinancialPrivacy';
import './financial-changes.css';

// Existing publication history is authoritative for before/after only. It has
// no linked financial revision, payroll competence or credit cycle. Never price
// these events through a second calculator or substitute a monthly total.
export default function FinancialChangesScreen({range}:{range?:FinancialRange}){
 const [stored,setStored]=useState(currentPublicationReview),[open,setOpen]=useState('');
 const privacy=useFinancialPrivacy(),owner=['visitor','guest'].includes(getStoredUser()?.role||'')?null:publicationOwner(),review=stored?.owner===owner?stored:null;
 useEffect(()=>{
  const refresh=()=>{setStored(currentPublicationReview());};
  const clear=()=>{setStored(null);setOpen('');};
  const unsubscribe=subscribePublicationReview(refresh);
  window.addEventListener('crewcheck:auth-will-change',clear);
  window.addEventListener('crewcheck:auth-changed',refresh);
  return()=>{unsubscribe();window.removeEventListener('crewcheck:auth-will-change',clear);window.removeEventListener('crewcheck:auth-changed',refresh);};
 },[]);
 const periodAvailable=!range||range.valid;
 const inRange=(change:Change)=>!range||range.valid&&[change.before?.date,change.after?.date].some(date=>date&&date>=range.start&&date<=range.end);
 const changes=review?.history.filter(inRange).slice().reverse()||[];
 const pending=review?.unconfirmed?.filter(entry=>!range||range.valid&&entry.item.date>=range.start&&entry.item.date<=range.end)||[];
 const safe=(value:string|undefined,key='')=>{
  const text=value||'—';
  return privacy.hidden&&(key==='hotel'||/\p{Sc}|\b[A-Z]{3}\s*[−+-]?\s*\d|\d[\d.,'’\s]*[A-Z]{3}\b/u.test(text))?privacy.amount(text):privacy.text(text);
 };
 return <section className="cc-financial-changes" aria-label="Alterações">
  <div className="cc-financial-changes-status"><GitCompareArrows aria-hidden="true"/><strong>{!review||range&&!range.valid?'Indisponível':`${changes.length} ${changes.length===1?'alteração':'alterações'}`}</strong>{periodAvailable&&review?.unknown&&<small><Info aria-hidden="true"/>Parcial</small>}</div>
  {range&&!range.valid&&<p role="status">Período inválido</p>}
  {periodAvailable&&!review&&<p role="status">Sem referência nesta conta</p>}
  {periodAvailable&&review&&!changes.length&&<p>{review.version===1?'Primeira referência':review.unknown?'Comparação parcial':'Sem alterações no período'}</p>}
  {changes.map(change=>{
   const key=`${review!.owner}:${review!.version}:${change.id}`,item=change.after||change.before!,expanded=open===key;
   return <article key={key} data-change-status={change.seen?'seen':'unread'}>
    <button type="button" className="cc-financial-change-toggle" aria-expanded={expanded} onClick={()=>setOpen(expanded?'':key)}>
     <span><strong>{safe(item.code||item.pairing||'Atividade')}</strong><small>{item.date} · {change.kind==='added'?'Incluída':change.kind==='removed'?'Retirada':'Alterada'}</small></span>
     <span>{change.seen?'Vista':'Não vista'}<ArrowRight aria-hidden="true"/></span>
    </button>
    {expanded&&<div className="cc-financial-change-detail"><div className="cc-financial-change-pair"><span><small>Antes</small>{change.before?safe(`${change.before.origin||'—'} → ${change.before.destination||'—'} · ${change.before.departure||change.before.start||'—'}`):'—'}</span><span><small>Depois</small>{change.after?safe(`${change.after.origin||'—'} → ${change.after.destination||'—'} · ${change.after.departure||change.after.start||'—'}`):'—'}</span></div>
    <dl><div><dt>Impacto</dt><dd>Indisponível</dd></div><div><dt>Competência</dt><dd>Não comprovada</dd></div><div><dt>Crédito</dt><dd>Não comprovado</dd></div></dl><PublicationChangeDetail owner={review!.owner} change={change} formatValue={safe}/></div>}
   </article>;
  })}
  {pending.length>0&&<details><summary><TriangleAlert aria-hidden="true"/>{pending.length} diferenças a conferir</summary><ul>{pending.map((entry,index)=><li key={index}>{safe(entry.item.code||entry.item.pairing||'Atividade')} · {entry.item.date} · {entry.kind==='ambiguous'?'Ambígua':entry.kind==='not-observed'?'Ausência não confirmada':'Inclusão não confirmada'}</li>)}</ul></details>}
  <details className="cc-financial-changes-source"><summary><Info aria-hidden="true"/>Origem</summary><dl><div><dt>Fonte</dt><dd>Histórico pessoal da publicação</dd></div><div><dt>Versão local</dt><dd>{review?.version??'—'}</dd></div><div><dt>Valores</dt><dd>Sem vínculo financeiro comprovado por alteração</dd></div><div><dt>Leitura</dt><dd>Pessoal; não representa aceite da companhia</dd></div></dl></details>
 </section>;
}
