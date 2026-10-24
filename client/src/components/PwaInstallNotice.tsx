import {useEffect, useId, useRef, useState} from 'react';
import './native-play-update-notice.css';
import './pwa-install-notice.css';

const DISMISSED='crewcheck_pwa_install_dismissed_v1', INSTALLED='crewcheck_pwa_install_seen_v1';
let dismissedInMemory=false;
type InstallEvent=Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
type InstallHost=Window & {AndroidCrewCheckNative?:unknown;CrewCheckNative?:unknown;Capacitor?:{isNativePlatform?:()=>boolean}};
export function appleInstallBrowser(nav:{userAgent?:string;platform?:string;maxTouchPoints?:number}) {
  return /iPhone|iPad|iPod/i.test(nav.userAgent||'') || (nav.platform==='MacIntel' && (nav.maxTouchPoints||0)>1);
}
export default function PwaInstallNotice(){
  const [mode,setMode]=useState<'apple'|'prompt'|null>(null),[expanded,setExpanded]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const deferred=useRef<InstallEvent|null>(null), hidden=useRef(false), instructions=useId();
  useEffect(()=>{
    hidden.current=false;
    const host=window as InstallHost, media=window.matchMedia?.('(display-mode: standalone)'), full=window.matchMedia?.('(display-mode: fullscreen)');
    const stored=(key:string)=>{try{return localStorage.getItem(key)==='1';}catch{return false;}};
    const installed=()=>media?.matches||full?.matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
    const native=()=>Boolean(host.AndroidCrewCheckNative||host.CrewCheckNative||host.Capacitor?.isNativePlatform?.());
    const allowed=()=>!hidden.current&&!dismissedInMemory&&!stored(DISMISSED)&&!stored(INSTALLED)&&!installed()&&!native()&&window.isSecureContext;
    const refresh=()=>{if(!allowed()){deferred.current=null;setMode(null);}else setMode(appleInstallBrowser(navigator)?'apple':deferred.current?'prompt':null);};
    const offer=(event:Event)=>{const value=event as InstallEvent;if(!allowed()||appleInstallBrowser(navigator)||typeof value.prompt!=='function')return;value.preventDefault();deferred.current=value;setMode('prompt');};
    const done=()=>{hidden.current=true;deferred.current=null;try{localStorage.setItem(INSTALLED,'1');}catch{}setMode(null);};
    const storage=(event:StorageEvent)=>{if(event.key===null||[DISMISSED,INSTALLED].includes(event.key||''))refresh();};
    refresh();window.addEventListener('beforeinstallprompt',offer);window.addEventListener('appinstalled',done);window.addEventListener('crewcheck:native-ready',refresh);window.addEventListener('storage',storage);
    media?.addEventListener?.('change',refresh);full?.addEventListener?.('change',refresh);
    return()=>{hidden.current=true;deferred.current=null;window.removeEventListener('beforeinstallprompt',offer);window.removeEventListener('appinstalled',done);window.removeEventListener('crewcheck:native-ready',refresh);window.removeEventListener('storage',storage);media?.removeEventListener?.('change',refresh);full?.removeEventListener?.('change',refresh);};
  },[]);
  const dismiss=()=>{hidden.current=true;dismissedInMemory=true;deferred.current=null;try{localStorage.setItem(DISMISSED,'1');}catch{}setMode(null);};
  const install=async()=>{
    if(mode==='apple'){setExpanded(value=>!value);return;}
    const event=deferred.current;if(!event||busy)return;deferred.current=null;setBusy(true);
    try{await event.prompt();const choice=await event.userChoice;if(hidden.current)return;if(choice.outcome==='accepted'){setMessage('Pedido aceito pelo navegador. A instalação ainda pode estar em andamento.');}else dismiss();}
    catch{if(!hidden.current)setMessage('O navegador não concluiu a instalação. Você pode usar o menu dele.');}
    finally{if(!hidden.current)setBusy(false);}
  };
  if(!mode)return null;
  return <aside className="cc-play-update-notice cc-pwa-install-notice" aria-label="Instalar CrewCheck">
    <strong>Instalar CrewCheck</strong><p>Abra pelo ícone na Tela de Início. Instalar não autoriza notificações.</p>
    {mode==='apple'&&expanded&&<div id={instructions}><p>Toque em Compartilhar e procure “Adicionar à Tela de Início”. Se aparecer “Abrir como App da Web”, mantenha essa opção para abrir como app.</p><p>Se a opção não aparecer neste navegador, abra esta página no Safari. A instalação depende das opções oferecidas pelo aparelho.</p></div>}
    {message&&<p role="status">{message}</p>}
    <div className="cc-play-update-actions"><button type="button" onClick={dismiss}>Agora não</button><button type="button" disabled={busy||Boolean(message)} aria-expanded={mode==='apple'?expanded:undefined} aria-controls={mode==='apple'&&expanded?instructions:undefined} onClick={()=>{void install();}}>{mode==='apple'?'Como instalar':busy?'Abrindo…':'Instalar CrewCheck'}</button></div>
  </aside>;
}
