import {useSyncExternalStore, type ComponentType} from 'react';
import {captureAuthSession} from '@/lib/authClient';
let revision=0,blocked=false;
const listeners=new Set<()=>void>();
if(typeof window!=='undefined'){
 for(const event of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'])window.addEventListener(event,()=>{revision++;blocked=event!=='crewcheck:auth-changed';listeners.forEach(fn=>fn());});
 window.addEventListener('storage',event=>{if(event.key===null||['crewcheck_auth_token','crewcheck_auth_user'].includes(event.key)){revision++;blocked=true;listeners.forEach(fn=>fn());}});
}
function snapshot(){try{const session=captureAuthSession();return blocked||!session.token||!session.owner?'none':`${revision}:${session.owner}`;}catch{return 'none';}}
export function withLifeAccountBoundary<P extends object>(View:ComponentType<P>){
 return function LifeAccountBoundary(props:P){const key=useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},snapshot,()=> 'none');
 return key==='none'?<p role="status">Entre na sua conta para ver a rotina.</p>:<View key={key} {...props}/>;};
}
