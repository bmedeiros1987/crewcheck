import {useEffect,useState} from 'react';
import {financialRateOwner,financialRateSession,readPersonalAllowanceReferences,savePersonalAllowanceReference,personalAllowanceStorageKey} from '@/lib/financialStatementLearning';
import {allowanceCategory,currentPersonalAllowance,personalAllowanceSources,personalAllowanceSourceId,type AllowanceCategory} from '@/lib/personalAllowanceReference';
import {useFinancialPrivacy} from './FinancialPrivacy';
const labels:Record<AllowanceCategory,string>={mainMeal:'Refeição integral',breakfast:'Café da manhã',taxi:'Táxi'};
const session=()=>{try{return financialRateSession()||'';}catch{return '';}};
const initialDate=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).formatToParts(new Date());return parts.find(p=>p.type==='year')!.value+'-'+parts.find(p=>p.type==='month')!.value+'-01';};
/** One common reference flow for national meals, breakfast and taxi. No new
 * amount entry/upload and no company-validity or historical-payment adoption. */
export default function PersonalAllowanceReference({onSaved}:{onSaved?:()=>void}){
 const privacy=useFinancialPrivacy(),ownerSession=session(),snapshot=readPersonalAllowanceReferences();
 const [,refresh]=useState(0),[selection,setSelection]=useState({session:ownerSession,sourceId:'',from:initialDate()}),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{
  const update=()=>refresh(n=>n+1),auth=()=>{setBusy(false);setMessage('');update();},storage=(event:StorageEvent)=>{if(event.storageArea!==localStorage)return;const owner=financialRateOwner();if(event.key===null||event.key?.startsWith('crewcheck_auth_'))auth();else if(owner&&(event.key===personalAllowanceStorageKey(owner)||event.key===`crewcheck_financial_learned_rates_v2:${encodeURIComponent(owner)}`))update();};
  window.addEventListener('crewcheck:financial-config-changed',update);for(const name of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'])window.addEventListener(name,auth);
  window.addEventListener('storage',storage);
  return()=>{window.removeEventListener('crewcheck:financial-config-changed',update);for(const name of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'])window.removeEventListener(name,auth);window.removeEventListener('storage',storage);};
 },[]);
 if(!ownerSession||snapshot.state==='unauthenticated')return null;
 if(!snapshot.history||!['ready','missing'].includes(snapshot.state))return <p role="status">Referências pessoais indisponíveis; os dados foram preservados.</p>;
 const history=snapshot.history,sources=personalAllowanceSources(snapshot.rates,history.ownerId);
 const unique=[...new Map(sources.map(rate=>[JSON.stringify([allowanceCategory(rate.key),rate.value,rate.sourceFingerprint,rate.effectiveFrom,rate.effectiveTo]),rate])).values()];
 const active=(Object.keys(labels) as AllowanceCategory[]).flatMap(category=>{const event=currentPersonalAllowance(history,category);return event?.active?[event]:[];});
 if(!unique.length&&!active.length)return null;
 const current=selection.session===ownerSession?selection:{session:ownerSession,sourceId:'',from:initialDate()};
 const chosen=sources.find(rate=>personalAllowanceSourceId(rate)===current.sourceId);
 async function save(category:AllowanceCategory,active:boolean){
  const expectedSession=ownerSession;if(!expectedSession||expectedSession!==session())return;
  setBusy(true);setMessage('');
  const saved=await savePersonalAllowanceReference({expectedSession,expectedRevision:history.revision,category,active,...(active?{sourceId:current.sourceId,from:current.from}:{})});
  if(expectedSession!==session())return;
  setBusy(false);setMessage(saved?(active?'Referência pessoal ativada para as previsões.':'Referência pessoal revogada.'):'Não foi possível salvar. Confira a sessão e a referência.');
  if(saved){refresh(n=>n+1);onSaved?.();}
 }
 return <details><summary>Reutilizar referência arquivada nas diárias</summary>
  <p>Premissa pessoal para previsão até alterar ou revogar; não confirma tarifa empresarial nem pagamento.</p>
  <label>Referência arquivada<select value={current.sourceId} disabled={busy} onChange={event=>{const rate=sources.find(rate=>personalAllowanceSourceId(rate)===event.target.value);setSelection({session:ownerSession,sourceId:event.target.value,from:rate&&rate.effectiveFrom>initialDate()?rate.effectiveFrom:initialDate()});}}><option value="">Selecione uma referência</option>{unique.map(rate=><option key={personalAllowanceSourceId(rate)} value={personalAllowanceSourceId(rate)}>{labels[allowanceCategory(rate.key)!]} · {privacy.amount(rate.value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))} · {privacy.text(rate.sourceDocument)} · {rate.effectiveFrom} a {rate.effectiveTo}</option>)}</select></label>
  {chosen&&<><label>Usar na previsão desde<input type="date" value={current.from} min={chosen.effectiveFrom} disabled={busy} onChange={event=>setSelection({...current,from:event.target.value})}/></label><button type="button" disabled={busy} onClick={()=>void save(allowanceCategory(chosen.key)!,true)}>Confirmar uso nas previsões</button></>}
  {active.map(event=>{const rate=sources.find(rate=>personalAllowanceSourceId(rate)===event.sourceId);return <p key={event.category}>{labels[event.category]} · premissa pessoal desde {event.from} · {rate?privacy.amount(rate.value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})):'Referência precisa de revisão'} <button type="button" disabled={busy} onClick={()=>void save(event.category,false)}>Revogar {labels[event.category]}</button></p>;})}
  {message&&<p role="status">{message}</p>}
 </details>;
}
