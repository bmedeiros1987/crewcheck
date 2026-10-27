import {useEffect,useRef,useState} from 'react';
import {financialRateOwner,financialRateSession,readPersonalAllowanceReferences,savePersonalAllowanceReference,personalAllowanceStorageKey} from '@/lib/financialStatementLearning';
import {allowanceCategory,personalAllowanceTimeline,personalAllowanceSources,personalAllowanceSourceId,planPersonalAllowance,type AllowanceCategory,type PersonalAllowanceHistory} from '@/lib/personalAllowanceReference';
import {useFinancialPrivacy} from './FinancialPrivacy';
const labels:Record<AllowanceCategory,string>={mainMeal:'Refeição integral',breakfast:'Café da manhã',taxi:'Táxi'};
const session=()=>{try{return financialRateSession()||'';}catch{return '';}};
const initialDate=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).formatToParts(new Date());return parts.find(p=>p.type==='year')!.value+'-'+parts.find(p=>p.type==='month')!.value+'-01';};
const today=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(type=>parts.find(part=>part.type===type)!.value).join('-');};
const previousDay=(date:string)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);};
type Review={request:Parameters<typeof savePersonalAllowanceReference>[0];next:PersonalAllowanceHistory};
/** One common reference flow for national meals, breakfast and taxi. No new
 * amount entry/upload and no company-validity or historical-payment adoption. */
export default function PersonalAllowanceReference({onSaved}:{onSaved?:()=>void}){
 const privacy=useFinancialPrivacy(),ownerSession=session(),snapshot=readPersonalAllowanceReferences();
 const [,refresh]=useState(0),[selection,setSelection]=useState({session:ownerSession,sourceId:'',from:initialDate()}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[review,setReview]=useState<Review|null>(null);
 const saving=useRef<symbol|null>(null);
 useEffect(()=>{
  const update=()=>{setReview(null);refresh(n=>n+1);},auth=()=>{saving.current=null;setBusy(false);setMessage('');update();},storage=(event:StorageEvent)=>{if(event.storageArea!==localStorage)return;const owner=financialRateOwner();if(event.key===null||event.key?.startsWith('crewcheck_auth_'))auth();else if(owner&&(event.key===personalAllowanceStorageKey(owner)||event.key===`crewcheck_financial_learned_rates_v2:${encodeURIComponent(owner)}`))update();};
  window.addEventListener('crewcheck:financial-config-changed',update);for(const name of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'])window.addEventListener(name,auth);
  window.addEventListener('storage',storage);
  return()=>{window.removeEventListener('crewcheck:financial-config-changed',update);for(const name of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'])window.removeEventListener(name,auth);window.removeEventListener('storage',storage);};
 },[]);
 if(!ownerSession||snapshot.state==='unauthenticated')return null;
 if(!snapshot.history||!['ready','missing'].includes(snapshot.state))return <p role="status">Referências pessoais indisponíveis; os dados foram preservados.</p>;
 const history=snapshot.history,sources=personalAllowanceSources(snapshot.rates,history.ownerId);
 const unique=[...new Map(sources.map(rate=>[JSON.stringify([allowanceCategory(rate.key),rate.value,rate.sourceFingerprint,rate.effectiveFrom,rate.effectiveTo]),rate])).values()];
 const active=(Object.keys(labels) as AllowanceCategory[]).filter(category=>personalAllowanceTimeline(history,category).length);
 if(!unique.length&&!active.length)return null;
 const current=selection.session===ownerSession?selection:{session:ownerSession,sourceId:'',from:initialDate()};
 const chosen=sources.find(rate=>personalAllowanceSourceId(rate)===current.sourceId);
 function prepare(category:AllowanceCategory,active:boolean){
  if(busy||ownerSession!==session()||snapshot.raw===undefined)return;
  const request:Review['request']={expectedSession:ownerSession,expectedRevision:history.revision,expectedSchema:history.schema,expectedRaw:snapshot.raw,reviewedTimeline:true,category,active,...(active?{sourceId:current.sourceId,from:current.from}:{})};
  const next=planPersonalAllowance(history,snapshot.rates,history.revision,request,{raw:snapshot.raw,reviewedTimeline:true});
  setReview(next?{request,next}:null);setMessage(next?'':'Não foi possível preparar. Confira a data e a referência arquivada.');
 }
 async function save(){
  if(!review||saving.current||review.request.expectedSession!==session())return;
  const token=Symbol('personal-allowance-review');saving.current=token;
  setBusy(true);setMessage('');
  const saved=await savePersonalAllowanceReference(review.request);
  if(saving.current!==token||review.request.expectedSession!==session())return;
  saving.current=null;setReview(null);setBusy(false);setMessage(saved?(review.request.active?'Referência pessoal ativada para as previsões.':'Referência pessoal revogada.'):'Não foi possível salvar. A configuração pode ter mudado; prepare uma nova revisão.');
  if(saved){refresh(n=>n+1);onSaved?.();}
 }
 function intervals(value:PersonalAllowanceHistory,category:AllowanceCategory){
  const starts=personalAllowanceTimeline(value,category);
  return <ul>{starts.map((event,index)=>{const rate=sources.find(rate=>personalAllowanceSourceId(rate)===event.sourceId);return <li key={`${event.from}:${event.revision}`}>{event.from>today()?'Programada':'Premissa pessoal'} · {event.from}{starts[index+1]?` a ${previousDay(starts[index+1].from)}`:' em diante'} · {rate?privacy.amount(rate.value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})):'Referência precisa de revisão'}</li>;})}</ul>;
 }
 return <details><summary>Reutilizar referência arquivada nas diárias</summary>
  <p>Premissa pessoal para previsão até alterar ou revogar; não confirma tarifa empresarial nem pagamento.</p>
  <label>Referência arquivada<select value={current.sourceId} disabled={busy||!!review} onChange={event=>{const rate=sources.find(rate=>personalAllowanceSourceId(rate)===event.target.value);setSelection({session:ownerSession,sourceId:event.target.value,from:rate&&rate.effectiveFrom>initialDate()?rate.effectiveFrom:initialDate()});}}><option value="">Selecione uma referência</option>{unique.map(rate=><option key={personalAllowanceSourceId(rate)} value={personalAllowanceSourceId(rate)}>{labels[allowanceCategory(rate.key)!]} · {privacy.amount(rate.value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))} · {privacy.text(rate.sourceDocument)} · {rate.effectiveFrom} a {rate.effectiveTo}</option>)}</select></label>
  {chosen&&<><label>Usar na previsão desde<input type="date" value={current.from} min={chosen.effectiveFrom} disabled={busy||!!review} onChange={event=>setSelection({...current,from:event.target.value})}/></label><button type="button" disabled={busy||!!review} onClick={()=>prepare(allowanceCategory(chosen.key)!,true)}>Revisar uso nas previsões</button></>}
  {active.map(category=><section key={category} aria-label={`Vigências pessoais de ${labels[category]}`}><strong>{labels[category]}</strong>{intervals(history,category)}<button type="button" disabled={busy||!!review} onClick={()=>prepare(category,false)}>Revogar {labels[category]}</button></section>)}
  {review&&<section aria-label="Revisar vigências pessoais">
   <h4>{labels[review.request.category]} · revisão sem gravar</h4>
   {history.schema===1&&(snapshot.raw===null?<p>Ao confirmar, será criada uma referência pessoal por vigência nesta conta e dispositivo. Nenhum uso anterior será ativado automaticamente.</p>:<p>Ao confirmar, esta conta passa a manter vigências pessoais por data. Somente as referências atualmente ativas são preservadas; usos antigos substituídos ou revogados não são reativados. O histórico original permanece arquivado.</p>)}
   {review.request.active?<><p>Vigências após a confirmação:</p>{intervals(review.next,review.request.category)}<p>Referências mensais explícitas continuam prevalecendo. As outras categorias não mudam.</p></>:<p>Revogar retira esta premissa de todas as datas da previsão e cancela seus usos programados. Fontes e histórico são preservados; referências mensais explícitas não são apagadas.</p>}
   <p>Premissa pessoal, não confirmação de tarifa empresarial ou pagamento. Nenhum valor foi salvo ainda.</p>
   <button type="button" disabled={busy} onClick={()=>void save()}>Confirmar vigências nesta conta</button><button type="button" disabled={busy} onClick={()=>setReview(null)}>Cancelar revisão de vigências</button>
  </section>}
  {message&&<p role="status">{message}</p>}
 </details>;
}
