import {FreeDayPersonalConsent} from './FreeDayPersonalConsent';
import {useEffect,useRef,useState} from 'react';
import {getToken,getStoredUser} from '@/lib/authClient';
const scope='free-day-source-simulation-v1';
const errors:Record<string,string>={SOURCE_REVISION_CHANGED:'A revisão mudou. Atualize ou reabra os recibos.',CONSENT_REQUIRED_OR_EXPIRED:'A preparação expirou ou foi revogada.',QUEUE_CONTEXT_CHANGED:'O vínculo ou a revisão mudou; a reserva anterior foi cancelada.',VERIFIED_EXISTING_DESTINATION_REQUIRED:'Nenhum destino existente foi validado.',JOB_NOT_HELD:'Esta reserva não está disponível para simulação.',OWNER_CHANGED:'A sessão desta conta mudou. Entre novamente.'};
type QueueState={revision:number;preparationConsent:boolean;destination:{label:string;verifiedAt:string;validated:true}|null;telegramConfigured:boolean;reviewPending:string|null;delayMinutes:number|null;realConsentAvailable:false;dispatchAllowed:false;job:{jobKey:string;status:string;simulated:boolean}|null;simulation?:{simulated:boolean;accepted:false;delivered:false};};
export function FreeDaySourceQueue({session,revision,blocked}:{session:string;revision:number;blocked:boolean}) {
 const [state,setState]=useState<QueueState|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const mounted=useRef(false),generation=useRef(0);
 const identity=()=>JSON.stringify([getToken(),getStoredUser()?.id,getStoredUser()?.email]);
 const initial=useRef(identity());
 const eligible=Boolean(state?.preparationConsent && state.destination && !state.reviewPending && (state.delayMinutes ?? 0)>240);
 const fresh=(g:number,key:string)=>mounted.current && generation.current===g && identity()===key && initial.current===key;
 const request=async(action?:'prepare'|'simulate')=>{
  const g=generation.current,key=identity(),token=getToken();if(!token || initial.current!==key)return;
  if(action && (busy || blocked || !eligible))return;
  setBusy(true);
  try{
   const response=await fetch('/api/notifications/free-day-source-queue',{cache:'no-store',headers:{authorization:`Bearer ${token}`,...(action?{'content-type':'application/json'}:{})},...(action?{method:'POST',body:JSON.stringify({scope,action,expectedRevision:revision,...(action==='simulate'?{jobKey:state?.job?.jobKey}:{})})}:{})});
   const body=await response.json();if(!fresh(g,key))return;
   if(!response.ok){setState(null);throw Error(errors[body.code] || 'Simulação indisponível. Atualize esta revisão.');}
   setState(body);setMessage(action==='simulate'?'Transporte local simulado. Nenhum envio real ou entrega.':action==='prepare'?`Reserva: ${body.job?.status || 'indisponível'}. Entrega desabilitada.`:'');
  }catch(e){if(fresh(g,key))setMessage(e instanceof Error?e.message:'Simulação indisponível.');}finally{if(fresh(g,key))setBusy(false);}
 };
 useEffect(()=>{
  mounted.current=true;initial.current=identity();generation.current++;setState(null);setMessage('');setBusy(false);
  const reset=()=>{generation.current++;setState(null);setMessage('Sessão alterada. Reabra esta revisão.');setBusy(false);};
  const storage=(e:StorageEvent)=>{if(!e.key || ['crewcheck_auth_token','crewcheck_auth_user'].includes(e.key))reset();};
  window.addEventListener('crewcheck:auth-changed',reset);window.addEventListener('crewcheck:auth-expired',reset);window.addEventListener('storage',storage);void request();
  return()=>{mounted.current=false;generation.current++;window.removeEventListener('crewcheck:auth-changed',reset);window.removeEventListener('crewcheck:auth-expired',reset);window.removeEventListener('storage',storage);};
 },[session,revision]);
 return <section data-free-day-source-queue aria-label="Fila simulada da revisão salva"><h3>Fila simulada da revisão salva</h3>
  <p data-existing-destination>{state?.destination?`Destino existente validado no servidor: ${state.destination.label}`:'Nenhum destino existente validado. Nenhum destinatário será presumido.'}</p>
  {state && <p>Configuração existente do canal: {state.telegramConfigured?'presente':'pendente'}. Nenhuma configuração será criada nesta simulação.</p>}
  <p>Entrega real globalmente desabilitada. A fila e o transporte local podem ser simulados com os recibos confirmados; nenhum documento ou conteúdo será compartilhado.</p>
  <FreeDayPersonalConsent session={session} revision={revision} blocked={blocked || busy} />
  <button type="button" disabled={busy || blocked} onClick={()=>void request()}>Atualizar vínculo existente</button>
  <button type="button" disabled={busy || blocked || !eligible || Boolean(state?.job)} onClick={()=>void request('prepare')}>Preparar fila simulada</button>
  <button type="button" disabled={busy || blocked || !eligible || state?.job?.status!=='held'} onClick={()=>void request('simulate')}>Simular transporte local</button>
  {state?.reviewPending && <p>A comparação tem dados pendentes. Revise os inícios, fusos e a correspondência da sequência antes de preparar a fila.</p>}
  {state?.job && <p data-source-queue-status>Fila: {state.job.status}. {state.job.simulated?'Simulação registrada; envio real não realizado.':'Nenhuma simulação de transporte registrada.'}</p>}
  {state && !state.preparationConsent && <p>Preparação expirada ou revogada. Reabra a revisão dos recibos.</p>}
  {message && <p role="status">{message}</p>}
 </section>;
}
