import FinancialChannelConsent from './FinancialChannelConsent';
import { useEffect, useState } from 'react';
import { authFetch, captureAuthSession, getStoredUser, getToken } from '@/lib/authClient';
import { canonicalAllowanceCapture, canonicalBrlCycleKeys, canonicalBrlCycleThursday } from '@shared/financialCanonicalCapture.mjs';

type Props={rows:any[];coveredDays:string[];range:{start:string;end:string};complete:boolean;crewId:string|number;airline:string;flights:Array<{id:string;published:boolean;localDate:string;timezone:string;airport:string;label:string}>};
// Review state belongs to this mounted canonical snapshot. Parent keys by its
// inputs; auth fence prevents a response/review crossing an account change.
export default function CanonicalForecastCapture(props:Props){
 const [reference,setReference]=useState(''),[confirmed,setConfirmed]=useState(false),[brl,setBrl]=useState(false),[cycle,setCycle]=useState('');
 const [foreign,setForeign]=useState(false),[flightLinks,setFlightLinks]=useState<Record<string,string>>({});
 const [sourceNotice,setSourceNotice]=useState('');
 const [review,setReview]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const brlCycleCount=canonicalBrlCycleKeys(props.rows).length, brlThursday=canonicalBrlCycleThursday(props.rows);
 const clear=()=>{setReview(null);setMessage('');setSourceNotice('');};
 useEffect(()=>{const clearNotice=()=>setSourceNotice('');const events=['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'];events.forEach(e=>window.addEventListener(e,clearNotice));return()=>events.forEach(e=>window.removeEventListener(e,clearNotice));},[]);
 const preview=async()=>{
  const session=captureAuthSession(),user=getStoredUser(),ownerId=String(user?.email||'').trim().toLowerCase();
  setBusy(true);setReview(null);setMessage('');
  try{
   if(!getToken()||!ownerId||['visitor','guest'].includes(user?.role||'')||(user as any)?.crewId&&String((user as any).crewId)!==String(props.crewId))throw Error('owner');
   const source=await canonicalAllowanceCapture({...props,ownerId,review:{reference,ownerConfirmed:confirmed,brlConfirmed:brl,brlCycleDate:cycle,foreignConfirmed:foreign,flightLinks}});
   if(!session.isCurrent())return;
   const result=await authFetch<any>('/api/platform/finance/capture',{method:'POST',body:JSON.stringify({action:'preview',source})});
   if(session.isCurrent()&&result?.ok===true)setReview({...result,session});
  }catch(error){if(session.isCurrent())setMessage(error instanceof Error&&error.message==='CANONICAL_CAPTURE_BRL_CYCLE_DATE_MISMATCH'?'A quinta-feira informada não pertence à semana de trabalho selecionada. Confira o ciclo; sem comprovação, mantenha a data pendente.':'Não foi possível preparar a revisão. Confira titular, cobertura, referência e disponibilidade do histórico.');}
  finally{if(session.isCurrent())setBusy(false);}
 };
 const save=async()=>{
  if(!review?.session.isCurrent()){setReview(null);setMessage('Conta alterada. Revise novamente.');return;}
  setBusy(true);
  try{
   const result=await authFetch<any>('/api/platform/finance/capture',{method:'POST',body:JSON.stringify({action:'capture',source:review.source,reviewDigest:review.reviewDigest,confirmed:true})});
   if(review.session.isCurrent()&&result?.ok===true){setReview(null);setMessage('Previsão salva. Isso não confirma recebimento.');setSourceNotice(result.sourceFreshness?.state==='available'?`Publicação original verificada: ${result.sourceFreshness.sourceAsOf}.`:'Atualização da fonte não comprovada; horário de consulta não é publicação.');}
  }catch{if(review.session.isCurrent())setMessage('Gravação não confirmada. Tente novamente a mesma revisão; se houver conflito, prepare uma nova revisão.');}
  finally{if(review.session.isCurrent())setBusy(false);}
 };
 return <details className="cc-persisted-finance"><summary>Revisar captura da previsão de diárias</summary>
  <p>Valores calculados da escala, na moeda original. A revisão é informada pelo titular; não equivale a demonstrativo da empresa ou confirmação bancária.</p>
  <p>{props.rows.length} itens · {props.range.start} a {props.range.end}. A substituição da escala não apaga o histórico salvo.</p>
  <fieldset disabled={busy}><label>Referência da revisão<input aria-label="Referência da revisão financeira" value={reference} maxLength={128} onChange={e=>{clear();setReference(e.target.value);}} placeholder="revisao-2026-10"/></label>
  <label><input type="checkbox" checked={confirmed} onChange={e=>{clear();setConfirmed(e.target.checked);}}/>Confirmo que esta escala é minha e revisei os valores calculados.</label>
  <label><input type="checkbox" disabled={brlCycleCount!==1} checked={brl} onChange={e=>{clear();setBrl(e.target.checked);}}/>Confirmo a política BRL: quinta-feira; feriado bancário de SP antecipa para quarta.</label>
  {brlCycleCount>1&&<p>Para confirmar a data BRL, selecione uma única semana de trabalho (quarta a terça) no filtro financeiro. Nesta seleção, os valores podem ser salvos com datas pendentes.</p>}
  {brl&&<label>Quinta-feira do ciclo comprovado<input aria-label="Data comprovada do ciclo BRL" type="date" min={brlThursday||undefined} max={brlThursday||undefined} value={cycle} onChange={e=>{clear();setCycle(e.target.value);}}/></label>}
  <p>Sem ciclo comprovado, a data fica pendente.</p>
  {props.rows.some(row=>row.currency!=='BRL')&&<fieldset><legend>Vínculo internacional revisado</legend>
   <label><input type="checkbox" checked={foreign} onChange={e=>{clear();setForeign(e.target.checked);}}/>Confirmo a política: a diária internacional selecionada é prevista na data do voo vinculado.</label>
   <p>Selecione explicitamente o voo para cada item. Datas e relógios publicados abaixo são da escala em BRT (America/Sao_Paulo); não representam conversão para o fuso do destino. Nenhum vínculo é escolhido automaticamente.</p>
   {foreign&&props.rows.filter(row=>row.currency!=='BRL').map(row=>{const key=JSON.stringify([row.iso,row.label]);return <label key={key}>{row.iso} · {row.label} · {row.currency}<select aria-label={`Voo comprovado ${row.iso} ${row.label}`} value={flightLinks[key]||''} onChange={e=>{clear();setFlightLinks({...flightLinks,[key]:e.target.value});}}><option value="">Sem vínculo comprovado — data pendente</option>{props.flights.map(flight=><option key={flight.id} value={flight.id}>{flight.label}</option>)}</select></label>;})}
   {!props.flights.length&&<p>Nenhum voo com data e relógios publicados comprovados nesta cobertura.</p>}
  </fieldset>}
  <p>Salário exige crédito líquido e ciclo comprovado: “até dia 5” é prazo, não dia exato. Férias e 13º continuam sem data sem dados da empresa.</p>
  </fieldset><button type="button" disabled={busy||!props.complete||!confirmed||!reference} onClick={preview}>Preparar revisão sem gravar</button>
  {review&&review.session.isCurrent()&&<div role="status"><p>{review.count} itens revisados; {review.pendingDates} datas pendentes; {review.pendingAmounts} valores pendentes. Nenhum recebimento será confirmado.</p><button type="button" disabled={busy} onClick={save}>Confirmar gravação da previsão revisada</button><button type="button" disabled={busy} onClick={clear}>Cancelar revisão</button></div>}
  {review?.sourceFreshness?.state==='unavailable'&&<p>Atualização da fonte não comprovada. A data da consulta não substitui a publicação original.</p>}
  {review?.sourceFreshness?.state==='available'&&<p>Publicação original verificada: {review.sourceFreshness.sourceAsOf}. Não confirma recebimento.</p>}
  {message&&<p role="status">{message}</p>}
  {sourceNotice&&<p>{sourceNotice}</p>}
  <FinancialChannelConsent/>
 </details>;
}
