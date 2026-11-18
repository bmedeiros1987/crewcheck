import {getToken} from '../../lib/authClient';
import {NotificationHelp} from './NotificationHelp';
import { useEffect, useRef, useState } from 'react';
import { readCrewCheckPushDevice, activateCrewCheckPushDevice, cancelCrewCheckPushDevice } from '../../lib/crewcheckPushRuntime';
function browserPermission(): NotificationPermission | 'unsupported' {
 if (!window.isSecureContext || !('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator) || !navigator.locks?.request) return 'unsupported';
 return Notification.permission;
}
export function CrewCheckPushDevice(){
 const [permission,setPermission]=useState(browserPermission);
 const [native,setNative]=useState(()=>Boolean(window.CrewCheckNative||window.AndroidCrewCheckNative));
 useEffect(()=>{const refresh=()=>{setPermission(browserPermission());setNative(Boolean(window.CrewCheckNative||window.AndroidCrewCheckNative));};const events=['focus','crewcheck:native-ready','crewcheck:permissions-updated'];events.forEach(event=>window.addEventListener(event,refresh));return()=>events.forEach(event=>window.removeEventListener(event,refresh));},[]);
 const[state,setState]=useState<Awaited<ReturnType<typeof readCrewCheckPushDevice>>|null>(null),[message,setMessage]=useState('Disponibilidade neste aparelho ainda não verificada.'),[busy,setBusy]=useState(false),epoch=useRef(0),ticket=useRef(0);
 useEffect(()=>{const refresh=()=>{const identity=++epoch.current,request=++ticket.current;setState(null);setBusy(false);setMessage('Disponibilidade neste aparelho ainda não verificada.');if(!getToken())return;void readCrewCheckPushDevice().then(value=>{if(identity===epoch.current&&request===ticket.current)setState(value);}).catch(()=>{if(identity===epoch.current&&request===ticket.current)setMessage('Reconecte para verificar este aparelho.');});};const storage=(event:StorageEvent)=>{if(event.key===null||['crewcheck_auth_token','crewcheck_auth_user'].includes(event.key||''))refresh();};refresh();window.addEventListener('storage',storage);window.addEventListener('crewcheck:auth-changed',refresh);window.addEventListener('crewcheck:auth-expired',refresh);window.addEventListener('crewcheck:push-state',refresh);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);return()=>{epoch.current++;ticket.current++;window.removeEventListener('storage',storage);window.removeEventListener('crewcheck:auth-changed',refresh);window.removeEventListener('crewcheck:auth-expired',refresh);window.removeEventListener('crewcheck:push-state',refresh);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);};},[]);
 async function change(forceCancel=false){
  if(!state||busy)return;
  const identity=epoch.current,request=++ticket.current;setBusy(true);
  try{
   const result=forceCancel||state.registered&&!state.needsRenewal?await cancelCrewCheckPushDevice():await activateCrewCheckPushDevice(state);
   if(identity!==epoch.current||request!==ticket.current)return;
   const fresh=await readCrewCheckPushDevice();if(identity!==epoch.current||request!==ticket.current)return;
   setState(fresh);
   setMessage(result.status==='registered'&&fresh.registered&&!fresh.needsRenewal?'Aparelho cadastrado. Isso não confirma entrega ou leitura.':result.status==='inactive'&&!fresh.registered&&!fresh.renewalRequired?('serverRevocationConfirmed'in result&&result.serverRevocationConfirmed?'Avisos desativados para este aparelho.':'Cancelamento local concluído; confirmação da conta ainda pendente.'):'Ativação não confirmada. Confira instalação e permissão deste aparelho.');
  }catch{if(identity===epoch.current&&request===ticket.current)setMessage('Operação não confirmada. Reconecte para verificar.');}
  finally{if(identity===epoch.current&&request===ticket.current)setBusy(false);}
 }
 const latest=state?.events?.[0];
 const canActivate=permission==='default'||permission==='granted';
 const renew=state?.needsRenewal===true&&state.enabled&&canActivate;
 if(native)return <div className="cc-notification-status-row"><p role="status">Push Android indisponível.</p><NotificationHelp label="Avisos com o Android fechado"><p>Novos alertas do servidor no Android ainda não estão disponíveis. Lembretes locais precisam ser agendados com o app aberto. Permissão e bateria continuam sendo controles deste aparelho.</p></NotificationHelp>{state?.registered&&<button type="button" disabled={busy} onClick={()=>{void change();}}>{busy?'Confirmando…':'Desativar neste aparelho'}</button>}</div>;
 return <div>{latest&&<p role="status">{latest.deviceReport==='clicked'?'Abertura informada · leitura não confirmada.':latest.deviceReport==='display_api_resolved'?'Processamento informado · entrega não confirmada.':['dispatching','uncertain'].includes(latest.status)?'Envio com resultado desconhecido.':latest.status==='accepted_unconfirmed'?'Envio aceito · entrega não confirmada.':'Recebimento não confirmado.'}</p>}
 <p role="status">{state?.subscriptionStatus==='locally_cancelled'?'Avisos cancelados neste aparelho; confirmação da conta pode estar pendente.':state?.needsRenewal?'Cadastro precisa de verificação ou renovação neste aparelho.':state&&!state.enabled?'Avisos com app fechado indisponíveis.':message}</p>
 {state?.needsRenewal&&<p>Abra o CrewCheck e renove o cadastro. A renovação pode exigir o app aberto; o navegador não garante recuperação em segundo plano.</p>}
 {state?.needsRenewal&&message!=='Disponibilidade neste aparelho ainda não verificada.'&&<p role="status">{message}</p>}
 {permission==='unsupported'?<p>Push não suportado neste navegador.</p>:permission==='denied'?<div><p>Bloqueado no navegador.</p><p className="cc-notification-guidance">Libere notificações nos ajustes deste site.</p></div>:permission==='granted'?<p>Permissão do navegador concedida.</p>:null}
 <NotificationHelp label="Avisos no navegador"><p>{permission==='denied'?'Para autorizar, altere a permissão de notificações nas configurações deste site e volte ao CrewCheck.':permission==='unsupported'?'Este navegador não oferece os recursos necessários para avisos com a página fechada.':'O cadastro e o serviço de envio precisam estar ativos. A permissão será solicitada somente ao tocar no botão quando o serviço estiver disponível.'} Cadastro, permissão e aceitação pelo serviço não confirmam entrega ou leitura. Resultados desconhecidos não são repetidos automaticamente.</p></NotificationHelp>
 {state&&(state.registered||state.renewalRequired||(state.enabled&&canActivate))&&<button type="button" disabled={busy} onClick={()=>{void change(!renew&&(state.registered||state.renewalRequired)).finally(()=>setPermission(browserPermission()));}}>{busy?'Confirmando…':renew?'Renovar cadastro':state.registered||state.renewalRequired?'Desativar neste aparelho':permission==='default'?'Autorizar no navegador':'Ativar neste aparelho'}</button>}
 {renew&&state&&(state.registered||state.renewalRequired)&&<button type="button" disabled={busy} onClick={()=>{void change(true);}}>Desativar neste aparelho</button>}</div>;
}
