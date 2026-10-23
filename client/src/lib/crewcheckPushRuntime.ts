import { authFetch, getStoredUser, getToken } from './authClient';
import { activateCrewCheckPush, revokeCrewCheckPush, invalidateCrewCheckPushActivation, crewCheckPushOperationGeneration, type PushDependencies, type PushBinding } from './crewcheckPushActivation';
const path='/api/platform/notifications/crewcheck-installation';
async function withSubscriptionLock<T>(run:()=>Promise<T>):Promise<T>{if(!navigator.locks?.request)throw Error('Este navegador não confirmou proteção entre abas.');return navigator.locks.request('crewcheck:push-subscription:v1',run);}
function installationId(){const key='crewcheck:notification-installation:v1';let value=localStorage.getItem(key);if(!value){value=crypto.randomUUID();localStorage.setItem(key,value);}return value;}
function owner(){return getToken()?getStoredUser()?.id||null:null;}
async function worker(registration:ServiceWorkerRegistration,action:string,fields:Record<string,unknown>={}){return new Promise<any>((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(Error('Aparelho não confirmou o vínculo.')),5000);channel.port1.onmessage=event=>{clearTimeout(timer);resolve(event.data);};registration.active?.postMessage({crewcheckPush:true,action,...fields},[channel.port2]);});}
type GateBinding={ownerId:string;installationId:string;consentRevision:number;topicRevision:number;authorityEpoch:string;active:true};
type DeviceState={enabled:boolean;registered:boolean;revision:number;publicKey:string|null;ownerId:string;installationId?:string;subscriptionHash?:string|null;renewalRequired?:boolean;gateBinding?:GateBinding|null;events?:Array<{status:string;deviceReport:string|null;received:null}>};
async function endpointHash(endpoint:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(new URL(endpoint).href));return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');}
function keyMatches(subscription:PushSubscription,key:string|null){const raw=subscription.options?.applicationServerKey;if(!raw||!key)return false;const bytes=new Uint8Array(raw);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')===key;}
export async function readCrewCheckPushDevice(){
 if(navigator.onLine===false)throw Error('Sem conexão para verificar o cadastro.');
 const id=installationId(),session=getToken(),identity=owner();
 const state=await authFetch<DeviceState>(`${path}?installationId=${encodeURIComponent(id)}`,{cache:'no-store'});
 if(!identity||owner()!==identity||getToken()!==session||state.ownerId!==identity)throw Error('Conta mudou.');
 if(!state.enabled||Boolean(window.CrewCheckNative||window.AndroidCrewCheckNative))return{...state,needsRenewal:false,subscriptionStatus:state.enabled?'native_unavailable':'disabled'};
 if(!state.registered&&!state.renewalRequired)return{...state,needsRenewal:false,subscriptionStatus:'not_registered'};
 if(!('serviceWorker'in navigator)||!('PushManager'in window))return{...state,needsRenewal:true,subscriptionStatus:'unsupported'};
 try{
  const registration=await navigator.serviceWorker.ready,local=await worker(registration,'status',{ownerId:identity});
  if(owner()!==identity||getToken()!==session)throw Error('Conta mudou.');
  if(local.cancelled===true)return{...state,serverRegistered:state.registered,registered:false,needsRenewal:false,subscriptionStatus:'locally_cancelled'};
  const subscription=await registration.pushManager.getSubscription();
  const expired=subscription?.expirationTime!==null&&subscription?.expirationTime!==undefined&&subscription.expirationTime<=Date.now();
  const matches=!!subscription&&!expired&&keyMatches(subscription,state.publicKey)&&!!state.subscriptionHash&&await endpointHash(subscription.endpoint)===state.subscriptionHash;
  if(owner()!==identity||getToken()!==session)throw Error('Conta mudou.');
  const needsRenewal=state.renewalRequired===true||!matches;
  return{...state,needsRenewal,subscriptionStatus:needsRenewal?'renewal_required':'current'};
 }catch{
  if(owner()!==identity||getToken()!==session)throw Error('Conta mudou.');
  return{...state,needsRenewal:true,subscriptionStatus:'unconfirmed'};
 }
}
async function dependencies(enabled:boolean,revision:number,renew=false,cancelIntent=false):Promise<PushDependencies>{const bindingOwner=owner(),registration=await navigator.serviceWorker.ready;return{
 enabled,ownerId:bindingOwner,currentOwner:owner,registration,withSubscriptionLock,permission:()=>Notification.requestPermission(),
 subscribe:async(registration,key)=>{const decoded=atob(key.replace(/-/g,'+').replace(/_/g,'/'));const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));const prior=await registration.pushManager.getSubscription();if(prior&&(renew||prior.expirationTime!==null&&prior.expirationTime!==undefined&&prior.expirationTime<=Date.now()||!keyMatches(prior,key))){if(!await prior.unsubscribe())throw Error('Assinatura anterior não foi cancelada.');return registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});}return prior||registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});},
 save:async(subscription,currentOwner)=>{if(owner()!==currentOwner)throw Error('Conta mudou.');return authFetch<PushBinding>(path,{method:'POST',body:JSON.stringify({action:'subscribe',consent:true,installationId:installationId(),expectedRevision:revision,subscription})});},
 revokeInstallation:async currentOwner=>{if(owner()!==currentOwner)throw Error('Conta mudou.');await authFetch(path,{method:'POST',body:JSON.stringify({action:'revoke',installationId:installationId()})});},
 beginWorker:async()=>{const result=await worker(registration,'begin',{ownerId:bindingOwner,confirmed:true});if(!result.ok)throw Error('Vínculo não confirmado.');return result.generation;},
 bindWorker:async(binding,generation)=>(await worker(registration,'bind',{binding,generation,confirmed:true})).ok===true,
 cancelWorker:async generation=>(await worker(registration,'cancel',generation===undefined?{ownerId:bindingOwner,cancelled:cancelIntent}:{generation,ownerId:bindingOwner,cancelled:cancelIntent})).ok===true,
};}
export async function activateCrewCheckPushDevice(state:{enabled:boolean;revision:number;publicKey:string|null;needsRenewal?:boolean}){
 if(!state.enabled||!state.publicKey||!window.isSecureContext||!('Notification'in window)||!('PushManager'in window)||!('serviceWorker'in navigator)||!navigator.locks?.request)return{status:'unsupported_or_disabled',received:null};
 const activationOwner=owner(),token=getToken(),generation=crewCheckPushOperationGeneration();
 if(!activationOwner||!token)return{status:'blocked',received:null};
 const current=()=>owner()===activationOwner&&getToken()===token&&crewCheckPushOperationGeneration()===generation;
 // Invoke in the explicit tap's stack. Waiting for worker.ready first can lose
 // iOS/iPadOS user activation. Existing permission never causes another prompt.
 const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
 if(!current())return{status:'account_changed',received:null};
 if(permission!=='granted')return{status:'permission_not_granted',received:null};
 const ready=await dependencies(state.enabled,state.revision,state.needsRenewal===true);
 if(!current()||ready.ownerId!==activationOwner)return{status:'account_changed',received:null};
 return activateCrewCheckPush({...ready,permission:async()=>permission},state.publicKey,true);
}
export async function cancelCrewCheckPushDevice(){if(!navigator.locks?.request)return{status:'local_cancellation_unconfirmed',serverRevocationConfirmed:false};return revokeCrewCheckPush(await dependencies(false,0,false,true));}
export async function reconcileCrewCheckPushDevice(){if(navigator.onLine===false||!owner()||!('serviceWorker'in navigator))return;const currentOwner=owner(),registration=await navigator.serviceWorker.ready,result=await worker(registration,'reports');const reports=(result.reports||[]).filter((v:any)=>v.envelope?.ownerId===currentOwner&&v.envelope?.installationId===installationId());if(!reports.length)return;await authFetch(path,{method:'POST',body:JSON.stringify({action:'receipts',installationId:installationId(),reports:reports.map((v:any)=>({envelope:v.envelope,status:v.status}))})});if(owner()===currentOwner)await worker(registration,'acknowledge',{keys:reports.map((v:any)=>v.key)});}
// Foreground authenticated reconciliation only. Never request permission, subscribe,
// auto-enroll a revoked account or pretend the worker can renew without a session.
export async function reconcileCrewCheckPushSubscription(){
 const identity=owner(),token=getToken(),operation=crewCheckPushOperationGeneration();
 if(navigator.onLine===false)return{status:'offline'};
 if(!identity||!token||!navigator.locks?.request||!('serviceWorker'in navigator))return{status:'unavailable'};
 const current=()=>owner()===identity&&getToken()===token&&crewCheckPushOperationGeneration()===operation;
 return withSubscriptionLock(async()=>{
  if(!current())return{status:'account_changed'};
  const state=await readCrewCheckPushDevice();if(!current())return{status:'account_changed'};
  if(!state.enabled||state.subscriptionStatus==='native_unavailable')return{status:'disabled'};
  if(state.subscriptionStatus==='locally_cancelled')return{status:'locally_cancelled'};
  const registration=await navigator.serviceWorker.ready;if(!current())return{status:'account_changed'};
  if(!state.registered||state.needsRenewal){
   await worker(registration,'cancel',{ownerId:identity});
   if(current())window.dispatchEvent(new Event('crewcheck:push-state'));
   return{status:state.needsRenewal?'renewal_required':'not_registered'};
  }
  let local=await worker(registration,'status');if(!current())return{status:'account_changed'};
  const binding:PushBinding={ownerId:identity,installationId:installationId(),consentRevision:state.revision,...(state.subscriptionHash?{subscriptionHash:state.subscriptionHash}:{})};
  if(!local.binding||['ownerId','installationId','consentRevision','subscriptionHash'].some(key=>local.binding[key]!==binding[key as keyof PushBinding])){
   const begin=await worker(registration,'begin',{ownerId:identity});if(!current()){await worker(registration,'cancel',{ownerId:identity,generation:begin.generation});return{status:'account_changed'};}
   if(!begin.ok||!(await worker(registration,'bind',{binding,generation:begin.generation})).ok)return{status:'local_binding_unconfirmed'};
   local={generation:begin.generation};
  }
  if(!current())return{status:'account_changed'};
  const topic=await worker(registration,'gate-sync',{binding,generation:local.generation,gateBinding:state.gateBinding||null});
  if(!current())return{status:'account_changed'};
  window.dispatchEvent(new Event('crewcheck:push-state'));
  return{status:topic.ok?'reconciled':'topic_binding_unconfirmed'};
 });
}
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
   if(owner()===priorOwner&&getToken())return;
   // Clear the account binding even when PushManager lookup fails. Keep the
   // origin lock through unsubscribe so a new activation cannot be erased.
   const cancelled=await worker(registration,'cancel',{ownerId:priorOwner});
   if(cancelled.ok&&!(owner()===priorOwner&&getToken())){
    const subscription=await registration.pushManager.getSubscription();
    if(!(owner()===priorOwner&&getToken()))await subscription?.unsubscribe();
   }
  }).catch(()=>{});
  previousOwner=current;
  if(current)reconcile();
 };
 const reconcile=()=>{void reconcileCrewCheckPushDevice().catch(()=>{});void reconcileCrewCheckPushSubscription().catch(()=>{});};
 const workerChanged=(event:MessageEvent)=>{if(event.source===navigator.serviceWorker?.controller&&event.data?.crewcheckPush&&event.data.action==='subscription-recheck'){if(event.data.changed===true)invalidateCrewCheckPushActivation();reconcile();}};
 navigator.serviceWorker?.addEventListener?.('message',workerChanged);
 const storage=(event:StorageEvent)=>{if(event.key===null||['crewcheck_auth_token','crewcheck_auth_user'].includes(event.key||''))changed();};
 window.addEventListener('storage',storage);window.addEventListener('crewcheck:auth-will-change',willChange);window.addEventListener('crewcheck:auth-changed',changed);window.addEventListener('crewcheck:auth-expired',changed);window.addEventListener('online',reconcile);window.addEventListener('focus',reconcile);reconcile();
 return()=>{navigator.serviceWorker?.removeEventListener?.('message',workerChanged);window.removeEventListener('storage',storage);window.removeEventListener('crewcheck:auth-will-change',willChange);window.removeEventListener('crewcheck:auth-changed',changed);window.removeEventListener('crewcheck:auth-expired',changed);window.removeEventListener('online',reconcile);window.removeEventListener('focus',reconcile);};
}
