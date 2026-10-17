import { useState } from 'react';
import { authFetch, captureAuthSession, getStoredUser, getToken } from '@/lib/authClient';
import { canonicalAllowanceCapture } from '@shared/financialCanonicalCapture.mjs';

type Props={rows:any[];coveredDays:string[];range:{start:string;end:string};complete:boolean;crewId:string|number;airline:string};
// Review state belongs to this mounted canonical snapshot. Parent keys by its
// inputs; auth fence prevents a response/review crossing an account change.
export default function CanonicalForecastCapture(props:Props){
 const [reference,setReference]=useState(''),[confirmed,setConfirmed]=useState(false),[brl,setBrl]=useState(false),[cycle,setCycle]=useState('');
 const [review,setReview]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const clear=()=>{setReview(null);setMessage('');};
 const preview=async()=>{
  const session=captureAuthSession(),user=getStoredUser(),ownerId=String(user?.email||'').trim().toLowerCase();
  setBusy(true);setReview(null);setMessage('');
  try{
   if(!getToken()||!ownerId||['visitor','guest'].includes(user?.role||'')||(user as any)?.crewId&&String((user as any).crewId)!==String(props.crewId))throw Error('owner');
   const source=await canonicalAllowanceCapture({...props,ownerId,review:{reference,ownerConfirmed:confirmed,brlConfirmed:brl,brlCycleDate:cycle}});
   if(!session.isCurrent())return;
   const result=await authFetch<any>('/api/platform/finance/capture',{method:'POST',body:JSON.stringify({action:'preview',source})});
   if(session.isCurrent()&&result?.ok===true)setReview({...result,session});
  }catch{if(session.isCurrent())setMessage('Não foi possível preparar a revisão. Confira titular, cobertura, referência e disponibilidade do histórico.');}
  finally{if(session.isCurrent())setBusy(false);}
 };
 const save=async()=>{
  if(!review?.session.isCurrent()){setReview(null);setMessage('Conta alterada. Revise novamente.');return;}
  setBusy(true);
  try{
   const result=await authFetch<any>('/api/platform/finance/capture',{method:'POST',body:JSON.stringify({action:'capture',source:review.source,reviewDigest:review.reviewDigest,confirmed:true})});
   if(review.session.isCurrent()&&result?.ok===true){setReview(null);setMessage('Previsão salva. Isso não confirma recebimento.');}
  }catch{if(review.session.isCurrent())setMessage('Gravação não confirmada. Tente novamente a mesma revisão; se houver conflito, prepare uma nova revisão.');}
  finally{if(review.session.isCurrent())setBusy(false);}
 };
 return <details className="cc-persisted-finance"><summary>Revisar captura da previsão de diárias</summary>
  <p>Valores calculados da escala, na moeda original. A revisão é informada pelo titular; não equivale a demonstrativo da empresa ou confirmação bancária.</p>
  <p>{props.rows.length} itens · {props.range.start} a {props.range.end}. A substituição da escala não apaga o histórico salvo.</p>
  <label>Referência da revisão<input aria-label="Referência da revisão financeira" value={reference} maxLength={128} onChange={e=>{clear();setReference(e.target.value);}} placeholder="revisao-2026-10"/></label>
  <label><input type="checkbox" checked={confirmed} onChange={e=>{clear();setConfirmed(e.target.checked);}}/>Confirmo que esta escala é minha e revisei os valores calculados.</label>
  <label><input type="checkbox" checked={brl} onChange={e=>{clear();setBrl(e.target.checked);}}/>Confirmo a política BRL: quinta-feira; feriado bancário de SP antecipa para quarta.</label>
  {brl&&<label>Quinta-feira do ciclo comprovado<input aria-label="Data comprovada do ciclo BRL" type="date" value={cycle} onChange={e=>{clear();setCycle(e.target.value);}}/></label>}
  <p>Sem ciclo comprovado, a data fica pendente. Diárias internacionais permanecem sem data até revisão do vínculo com voo publicado e seu fuso.</p>
  <p>Salário exige crédito líquido e ciclo comprovado: “até dia 5” é prazo, não dia exato. Férias e 13º continuam sem data sem dados da empresa.</p>
  <button type="button" disabled={busy||!props.complete||!confirmed||!reference} onClick={preview}>Preparar revisão sem gravar</button>
  {review&&review.session.isCurrent()&&<div role="status"><p>{review.count} itens revisados; {review.pendingDates} datas pendentes; {review.pendingAmounts} valores pendentes. Nenhum recebimento será confirmado.</p><button type="button" disabled={busy} onClick={save}>Confirmar gravação da previsão revisada</button><button type="button" disabled={busy} onClick={clear}>Cancelar revisão</button></div>}
  {message&&<p role="status">{message}</p>}
 </details>;
}
