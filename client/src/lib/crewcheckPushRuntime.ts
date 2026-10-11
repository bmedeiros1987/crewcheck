import { authFetch, getStoredUser, getToken } from './authClient';
import { activateCrewCheckPush, revokeCrewCheckPush, invalidateCrewCheckPushActivation, type PushDependencies, type PushBinding } from './crewcheckPushActivation';
const path='/api/platform/notifications/crewcheck-installation';
async function withSubscriptionLock<T>(run:()=>Promise<T>):Promise<T>{if(!navigator.locks?.request)throw Error('Este navegador não confirmou proteção entre abas.');return navigator.locks.request('crewcheck:push-subscription:v1',run);}
function installationId(){const key='crewcheck:notification-installation:v1';let value=localStorage.getItem(key);if(!value){value=crypto.randomUUID();localStorage.setItem(key,value);}return value;}
function owner(){return getToken()?getStoredUser()?.id||null:null;}
async function worker(registration:ServiceWorkerRegistration,action:string,fields:Record<string,unknown>={}){return new Promise<any>((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(Error('Aparelho não confirmou o vínculo.')),5000);channel.port1.onmessage=event=>{clearTimeout(timer);resolve(event.data);};registration.active?.postMessage({crewcheckPush:true,action,...fields},[channel.port2]);});}
export async function readCrewCheckPushDevice(){const id=installationId();return authFetch<{enabled:boolean;registered:boolean;revision:number;publicKey:string|null;ownerId:string;events?:Array<{status:string;deviceReport:string|null;received:null}>}>(`${path}?installationId=${encodeURIComponent(id)}`,{cache:'no-store'});}
async function dependencies(enabled:boolean,revision:number):Promise<PushDependencies>{const bindingOwner=owner(),registration=await navigator.serviceWorker.ready;return{
 enabled,ownerId:bindingOwner,currentOwner:owner,registration,withSubscriptionLock,permission:()=>Notification.requestPermission(),
 subscribe:async(registration,key)=>{const decoded=atob(key.replace(/-/g,'+').replace(/_/g,'/'));const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));return await registration.pushManager.getSubscription()||registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});},
 save:async(subscription,currentOwner)=>{if(owner()!==currentOwner)throw Error('Conta mudou.');return authFetch<PushBinding>(path,{method:'POST',body:JSON.stringify({action:'subscribe',consent:true,installationId:installationId(),expectedRevision:revision,subscription})});},
 revokeInstallation:async currentOwner=>{if(owner()!==currentOwner)throw Error('Conta mudou.');await authFetch(path,{method:'POST',body:JSON.stringify({action:'revoke',installationId:installationId()})});},
 beginWorker:async()=>{const result=await worker(registration,'begin',{ownerId:bindingOwner});if(!result.ok)throw Error('Vínculo não confirmado.');return result.generation;},
 bindWorker:async(binding,generation)=>(await worker(registration,'bind',{binding,generation})).ok===true,
 cancelWorker:async generation=>(await worker(registration,'cancel',generation===undefined?{ownerId:bindingOwner}:{generation,ownerId:bindingOwner})).ok===true,
};}
export async function activateCrewCheckPushDevice(state:{enabled:boolean;revision:number;publicKey:string|null}){if(!state.enabled||!state.publicKey||!window.isSecureContext||!('Notification'in window)||!('PushManager'in window)||!('serviceWorker'in navigator)||!navigator.locks?.request)return{status:'unsupported_or_disabled',received:null};return activateCrewCheckPush(await dependencies(state.enabled,state.revision),state.publicKey,true);}
export async function cancelCrewCheckPushDevice(){if(!navigator.locks?.request)return{status:'local_cancellation_unconfirmed',serverRevocationConfirmed:false};return revokeCrewCheckPush(await dependencies(false,0));}
export async function reconcileCrewCheckPushDevice(){if(!owner()||!('serviceWorker'in navigator))return;const currentOwner=owner(),registration=await navigator.serviceWorker.ready,result=await worker(registration,'reports');const reports=(result.reports||[]).filter((v:any)=>v.envelope?.ownerId===currentOwner&&v.envelope?.installationId===installationId());if(!reports.length)return;await authFetch(path,{method:'POST',body:JSON.stringify({action:'receipts',installationId:installationId(),reports:reports.map((v:any)=>({envelope:v.envelope,status:v.status}))})});if(owner()===currentOwner)await worker(registration,'acknowledge',{keys:reports.map((v:any)=>v.key)});}
export function installCrewCheckPushLifecycle(){
 let previousOwner=owner();
 const willChange=()=>{
  invalidateCrewCheckPushActivation();const priorOwner=owner(),token=getToken(),id=installationId();
  if(priorOwner&&token)void withSubscriptionLock(async()=>{
   if(owner()===priorOwner&&getToken()&&getToken()!==token)return;
   navigator.serviceWorker?.controller?.postMessage({crewcheckPush:true,action:'cancel',ownerId:priorOwner});
   await fetch(path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({action:'revoke',installationId:id})});
  }).catch(()=>{});
 };
 const changed=()=>{
  invalidateCrewCheckPushActivation();const current=owner(),priorOwner=previousOwner;
  if((current!==priorOwner||!current)&&priorOwner&&'serviceWorker'in navigator)void withSubscriptionLock(async()=>{
   // A late logout cleanup must not erase a renewed same-account session.
   if(owner()===priorOwner&&getToken())return;
   const registration=await navigator.serviceWorker.ready;
   const subscription=await registration.pushManager.getSubscription();
   if(owner()===priorOwner&&getToken())return;
   const cancelled=await worker(registration,'cancel',{ownerId:priorOwner});
   if(cancelled.ok&&!(owner()===priorOwner&&getToken()))await subscription?.unsubscribe();
  }).catch(()=>{});
  previousOwner=current;
 };
 const reconcile=()=>{void reconcileCrewCheckPushDevice().catch(()=>{});};
 const storage=(event:StorageEvent)=>{if(['crewcheck_auth_token','crewcheck_auth_user'].includes(event.key||''))changed();};
 window.addEventListener('storage',storage);window.addEventListener('crewcheck:auth-will-change',willChange);window.addEventListener('crewcheck:auth-changed',changed);window.addEventListener('crewcheck:auth-expired',changed);window.addEventListener('online',reconcile);window.addEventListener('focus',reconcile);reconcile();
 return()=>{window.removeEventListener('storage',storage);window.removeEventListener('crewcheck:auth-will-change',willChange);window.removeEventListener('crewcheck:auth-changed',changed);window.removeEventListener('crewcheck:auth-expired',changed);window.removeEventListener('online',reconcile);window.removeEventListener('focus',reconcile);};
}
