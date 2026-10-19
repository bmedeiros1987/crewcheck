import {useEffect,useState,useSyncExternalStore}from'react';
import{deferPwaUpdate,nativeUpdateShell,pwaUpdateServerSnapshot,pwaUpdateSnapshot,requestPwaUpdate,subscribePwaUpdate}from'../lib/pwaUpdateCoordinator';
import './native-play-update-notice.css';
import './pwa-update-notice.css';
export default function PwaUpdateNotice(){
 const state=useSyncExternalStore(subscribePwaUpdate,pwaUpdateSnapshot,pwaUpdateServerSnapshot);
 const[native,setNative]=useState(false);
 useEffect(()=>{const refresh=()=>setNative(nativeUpdateShell());refresh();window.addEventListener('crewcheck:native-ready',refresh);return()=>window.removeEventListener('crewcheck:native-ready',refresh);},[]);
 if(native||state.phase==='idle'||state.deferred)return null;
 return <aside className="cc-play-update-notice cc-pwa-update-notice" aria-label="Atualização do CrewCheck">
 <strong>{state.phase==='ready'?'Versão nova preparada':'Atualização disponível'}</strong>
 <p role="status">{state.phase==='ready'?'A atualização foi ativada. Esta tela não foi recarregada.':state.phase==='activating'?'Confirmando a ativação…':state.phase==='error'?'A ativação não foi confirmada. Sua tela continua aberta.':'Os arquivos da nova versão foram baixados.'}</p>
 <p>Formulários, importações e ações desta tela continuam aqui. Abra a versão nova em outra aba quando quiser.</p>
 {!state.online&&<p>Sem conexão. A atualização permanece adiada.</p>}
 <div className="cc-play-update-actions"><button type="button" onClick={deferPwaUpdate}>Depois</button>{state.phase==='ready'?<a href="/" target="_blank" rel="noopener noreferrer" aria-disabled={!state.online} onClick={event=>{if(!state.online)event.preventDefault();}}>Abrir versão nova</a>:<button type="button" disabled={!state.online||state.phase==='activating'} onClick={()=>{void requestPwaUpdate();}}>{state.phase==='error'?'Tentar novamente':'Atualizar agora'}</button>}</div>
 </aside>;
}
