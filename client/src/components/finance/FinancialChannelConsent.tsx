import {useEffect,useRef,useState} from 'react';
import {authFetch,captureAuthSession,getStoredUser,getToken} from '@/lib/authClient';
const categories=[['allowance','Diárias'],['payroll','Salário'],['vacation','Férias'],['advance','Adiantamentos']] as const;
// Account-only management consumer; no Telegram read/send endpoint is called.
export default function FinancialChannelConsent(){
 const [conversation,setConversation]=useState(''),[review,setReview]=useState<any>(null),[selected,setSelected]=useState<string[]>([]),[hours,setHours]=useState('1'),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const generation=useRef(0);
 const reset=()=>{generation.current++;setBusy(false);setReview(null);setConfirmed(false);setMessage('');};
 useEffect(()=>{const clear=()=>{reset();setConversation('');setSelected([]);setBusy(false);};const storage=(event:StorageEvent)=>{if(event.key===null||['crewcheck_auth_user','crewcheck_auth_token'].includes(event.key))clear();};const events=['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'];events.forEach(e=>window.addEventListener(e,clear));window.addEventListener('storage',storage);return()=>{events.forEach(e=>window.removeEventListener(e,clear));window.removeEventListener('storage',storage);};},[]);
 const request=async(action:'preview'|'grant'|'revoke')=>{
  const session=captureAuthSession(),user=getStoredUser(),target=conversation,version=++generation.current;setBusy(true);setMessage('');
  try{
   if(!getToken()||!user?.email||['visitor','guest'].includes(user.role||''))throw Error('owner');
   if(action!=='preview'&&(!review||review.target!==target||!review.session.isCurrent()))throw Error('session');
   const command:any={action,conversationId:target};
   if(action!=='preview')command.expectedRevision=review.revision??review.consent?.revision;
   if(action==='grant')Object.assign(command,{binding:review.binding,confirmed,categories:selected,expiresAt:new Date(Date.now()+Number(hours)*3600000).toISOString()});
   const result=await authFetch<any>('/api/platform/finance/capture',{method:'POST',body:JSON.stringify({action:'channel_consent',command})});
   if(!session.isCurrent()||version!==generation.current)return;
   if(result?.ok!==true)throw Error('unavailable');
   setReview({...review,...result,revision:result.revision??result.consent?.revision,session,target});setConfirmed(false);
   setMessage(action==='grant'?'Preferência salva para esta conversa. Nenhum envio foi feito por esta ação.':action==='revoke'?'Consentimento revogado.':'Confira a conversa, categorias e prazo antes de confirmar.');
  }catch(error:any){if(session.isCurrent()&&version===generation.current){setReview(null);setConfirmed(false);setMessage(error?.code==='FINANCIAL_CONSENT_REVISION_CONFLICT'?'A preferência mudou. Consulte novamente antes de confirmar.':'Gestão indisponível ou resultado não confirmado. Consulte novamente antes de repetir.');}}
  finally{if(session.isCurrent()&&version===generation.current)setBusy(false);}
 };
 const active=Boolean(review?.target===conversation&&review?.session.isCurrent()),existing=active?review.consent:null;
 return <details className="cz-toolbox cc-financial-channel-consent"><summary>Preferências financeiras por canal</summary>
  <p>Esta preferência é separada do financeiro no app. Somente conversa privada vinculada, sob consulta, nas categorias e prazo escolhidos. Sem envio automático, holerites ou uso por modelos externos.</p>
  <label>Identificador da sua conversa privada vinculada<input aria-label="Conversa privada financeira" inputMode="numeric" value={conversation} onChange={event=>{reset();setConversation(event.target.value);}}/></label>
  <button type="button" disabled={busy||!/^\d{1,20}$/.test(conversation)} onClick={()=>request('preview')}>Consultar vínculo e preferência</button>
  {active&&<div><p>{review.linked===false?'Conversa desvinculada; só revogação disponível.':'Vínculo privado conferido nesta conta.'}</p><p>Revisão {review.revision}. Preferência: {existing?.state==='granted'?(Date.parse(existing.expiresAt)<=Date.now()?'expirada':'concedida'):existing?.state==='revoked'?'revogada':'não concedida'}{existing?.expiresAt?` · validade ${existing.expiresAt}`:''}.</p>
   {existing?.state==='granted'&&<button type="button" disabled={busy} onClick={()=>request('revoke')}>Revogar consentimento</button>}
   {review.linked!==false&&review.binding&&<fieldset disabled={busy}><legend>Categorias e prazo</legend>{categories.map(([key,label])=><label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={event=>{setConfirmed(false);setSelected(event.target.checked?[...selected,key]:selected.filter(x=>x!==key));}}/>{label}</label>)}
    <label>Prazo<select aria-label="Prazo do consentimento financeiro" value={hours} onChange={event=>{setConfirmed(false);setHours(event.target.value);}}><option value="1">1 hora</option><option value="24">24 horas</option></select></label>
    <label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>Confirmo estas categorias, este prazo e somente esta conversa privada. Posso revogar.</label>
    <button type="button" disabled={!confirmed||!selected.length} onClick={()=>request('grant')}>Confirmar preferência por canal</button>
   </fieldset>}
  </div>}
  {message&&<p role="status">{message}</p>}
 </details>;
}
