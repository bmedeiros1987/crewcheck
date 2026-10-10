import {useEffect,useRef,useState} from 'react';
import {getToken,getStoredUser} from '@/lib/authClient';
type State={available:boolean;context:string|null;revision:number;textVersion:string;consent:boolean;expiresAt:string|null;destination:{label:string;collective:boolean}|null};
export function FreeDayPersonalConsent({session,revision,blocked}:{session:string;revision:number;blocked:boolean}) {
 const [state,setState]=useState<State|null>(null),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const generation=useRef(0),initial=useRef(''),ticket=useRef(0);
 const identity=()=>JSON.stringify([getToken(),getStoredUser()?.id,getStoredUser()?.email]);
 const request=async(action?:'grant'|'revoke')=>{
  const key=identity(),g=generation.current,token=getToken();if(!token || key!==initial.current || (action && (busy || blocked)))return;
  if(action==='grant' && (!checked || !state?.available))return;
  const t=++ticket.current;setBusy(true);
  const fresh=()=>ticket.current===t && generation.current===g && initial.current===key && identity()===key;
  try{
   const response=await fetch('/api/notifications/free-day-personal-consent',{cache:'no-store',headers:{authorization:`Bearer ${token}`,...(action?{'content-type':'application/json'}:{})},...(action?{method:'POST',body:JSON.stringify({scope:'free-day-personal-consent-v1',action,context:state?.context,expectedRevision:state?.revision,...(action==='grant'?{confirmed:true,textVersion:state?.textVersion}:{})})}:{})});
   const body=await response.json();if(!fresh())return;
   setChecked(false);
   if(!response.ok){setState(null);setMessage('A autorização ou o vínculo mudou. Atualize antes de confirmar.');return;}
   setState(body);setMessage(action==='grant'?'Autorização pessoal registrada. O envio continua desabilitado.':action==='revoke'?'Autorização pessoal revogada.':'');
  }catch{if(fresh()){setState(null);setMessage('Autorização indisponível. Atualize antes de confirmar.');}}finally{if(fresh())setBusy(false);}
 };
 useEffect(()=>{
  initial.current=identity();generation.current++;setState(null);setChecked(false);setMessage('');setBusy(false);
  const reset=()=>{generation.current++;setState(null);setChecked(false);setBusy(false);setMessage('Sessão alterada. Reabra esta revisão.');};
  const storage=(e:StorageEvent)=>{if(!e.key || ['crewcheck_auth_token','crewcheck_auth_user'].includes(e.key))reset();};
  window.addEventListener('crewcheck:auth-changed',reset);window.addEventListener('crewcheck:auth-expired',reset);window.addEventListener('storage',storage);void request();
  return()=>{generation.current++;window.removeEventListener('crewcheck:auth-changed',reset);window.removeEventListener('crewcheck:auth-expired',reset);window.removeEventListener('storage',storage);};
 },[session,revision]);
 useEffect(()=>{setChecked(false);},[blocked]);
 return <section data-free-day-personal-consent><h3>Autorização pessoal de avisos</h3>
  <p data-personal-destination>{state?.destination?.label || 'Destino existente ainda não validado.'}</p>
  {state?.destination?.collective && <p>Este destino é coletivo. A autorização refere-se especificamente a esse grupo vinculado.</p>}
  <p>{state?.available?'Esta conta pode registrar autorização pessoal. O envio continua desabilitado.':'Consentimento para envio real indisponível nesta conta.'}</p>
  <label><input aria-label="Consentimento pessoal de avisos" type="checkbox" checked={checked} disabled={!state?.available || state.consent || busy || blocked} onChange={e=>setChecked(e.target.checked)} />Conferi o destino Telegram da minha conta. Autorizo por até 30 dias avisos de postergação segundo estas duas publicações que enviei. Entendo que a origem oficial e o direito à indenização não foram verificados.</label>
  <button type="button" disabled={!state?.available || state.consent || !checked || busy || blocked} onClick={()=>void request('grant')}>Confirmar autorização de avisos neste destino</button>
  <button type="button" disabled={!state?.consent || busy || blocked} onClick={()=>void request('revoke')}>Revogar autorização pessoal</button>
  <button type="button" disabled={busy || blocked} onClick={()=>void request()}>Atualizar autorização e destino</button>
  {state?.consent && <p>Autorização vigente até {state.expiresAt}. Nenhum envio real ativado.</p>}
  {message && <p role="status">{message}</p>}
 </section>;
}
