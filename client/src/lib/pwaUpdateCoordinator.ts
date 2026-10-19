type UpdatePhase='idle'|'available'|'activating'|'ready'|'error';
export type PwaUpdateState={phase:UpdatePhase;buildId:string;online:boolean;deferred:boolean};
const DAY=86400000,KEY='crewcheck_pwa_update_defer_v1';
let state:PwaUpdateState={phase:'idle',buildId:'',online:true,deferred:false},registration:ServiceWorkerRegistration|null=null;
let lifecycle=0,activationTimer:number|undefined;
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(listener=>listener());
function deferred(id:string){if(memoryDefer.id===id&&id&&memoryDefer.until>Date.now())return true;try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');return saved?.id===id&&Number.isFinite(saved.until)&&saved.until>Date.now()&&saved.until<=Date.now()+DAY;}catch{return false;}}
function publish(phase:UpdatePhase,id=state.buildId){state={phase,buildId:id,online:typeof navigator==='undefined'||navigator.onLine!==false,deferred:deferred(id)};notify();}
export const pwaUpdateSnapshot=()=>state;
export const subscribePwaUpdate=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const pwaUpdateServerSnapshot=()=>INITIAL;
const INITIAL:PwaUpdateState={phase:'idle',buildId:'',online:true,deferred:false};
let memoryDefer={id:'',until:0};
export function deferPwaUpdate(){memoryDefer={id:state.buildId,until:Date.now()+DAY};try{localStorage.setItem(KEY,JSON.stringify({id:state.buildId,until:Date.now()+DAY}));}catch{}state={...state,deferred:true};notify();}
function message(worker:ServiceWorker,value:unknown):Promise<any>{return new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();channel.port2.close();reject(Error('worker acknowledgement timed out'));},5000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};try{worker.postMessage(value,[channel.port2]);}catch(error){clearTimeout(timer);channel.port1.close();channel.port2.close();reject(error);}});}
async function info(worker:ServiceWorker){const value=await message(worker,{type:'CREWCHECK_UPDATE_INFO'});return value?.ready===true&&/^[a-f0-9]{20}$/.test(value.buildId||'')?value.buildId:null;}
export async function requestPwaUpdate(){
 if(navigator.onLine===false||!registration?.waiting||!['available','error'].includes(state.phase))return false;
 const worker=registration.waiting,id=state.buildId,generation=lifecycle;publish('activating',id);
 try{const result=await message(worker,{type:'CREWCHECK_ACTIVATE_UPDATE',buildId:id});if(generation!==lifecycle)return false;if(result?.accepted!==true||result.buildId!==id)throw Error('activation not accepted');if(state.phase==='activating')activationTimer=window.setTimeout(()=>{if(generation===lifecycle&&state.phase==='activating'&&state.buildId===id)publish('error',id);},15000);return true;}
 catch{if(generation===lifecycle&&state.phase!=='ready'&&state.buildId===id)publish('error',id);return false;}
}
export function nativeUpdateShell(){if(typeof window==='undefined')return false;const host=window as Window&{Capacitor?:{isNativePlatform?:()=>boolean}};return Boolean(host.AndroidCrewCheckNative||host.CrewCheckNative||host.Capacitor?.isNativePlatform?.());}
/** Explicit consent only. Never reloads this tab or another tab. */
export function installPwaUpdateCoordinator(options:{checkIntervalMs?:number;idleMs?:number}={}):()=>void{
 if(typeof window==='undefined'||!('serviceWorker'in navigator)||nativeUpdateShell())return()=>{};
 const generation=++lifecycle;publish('idle','');let initialController=navigator.serviceWorker.controller;
 let stopped=false,sequence=0,activeRegistration:ServiceWorkerRegistration|null=null,installing:ServiceWorker|null=null;
 const inspect=async()=>{const ticket=++sequence;const waiting=activeRegistration?.waiting;if(!waiting){if(state.phase==='available')publish('idle','');return;}try{const id=await info(waiting);if(!stopped&&ticket===sequence&&activeRegistration?.waiting===waiting&&id){if(state.phase!=='activating'&&state.phase!=='ready')publish('available',id);}}catch{/* Incompatible or incomplete worker is not a downloaded offer. */}};
 const changed=()=>{if(installing?.state==='installed')void inspect();};
 const found=()=>{installing?.removeEventListener('statechange',changed);installing=activeRegistration?.installing||null;installing?.addEventListener('statechange',changed);void inspect();};
 const attach=(next:ServiceWorkerRegistration)=>{if(stopped)return;if(activeRegistration!==next){activeRegistration?.removeEventListener('updatefound',found);activeRegistration=next;registration=next;next.addEventListener('updatefound',found);}found();};
 const check=async()=>{if(stopped||navigator.onLine===false)return;try{const next=activeRegistration||await navigator.serviceWorker.ready;if(stopped)return;attach(next);await next.update();if(!stopped)void inspect();}catch{/* Offline/update failure never blocks boot or announces availability. */}};
 const controller=async()=>{const ticket=++sequence,worker=navigator.serviceWorker.controller;if(!worker)return;if(!initialController&&state.phase==='idle'){initialController=worker;return;}initialController=worker;try{const id=await info(worker);if(!stopped&&ticket===sequence&&id)publish('ready',id);}catch{if(!stopped&&state.phase==='activating')publish('error');}};
 const online=()=>{publish(state.phase);void check();},offline=()=>publish(state.phase),storage=(event:StorageEvent)=>{if(event.key===null||event.key===KEY)publish(state.phase);};
 navigator.serviceWorker.addEventListener('controllerchange',controller);window.addEventListener('online',online);window.addEventListener('offline',offline);window.addEventListener('storage',storage);
 void navigator.serviceWorker.ready.then(attach).catch(()=>{});const timer=window.setInterval(check,Math.max(60000,options.checkIntervalMs||900000));
 return()=>{stopped=true;sequence++;if(generation===lifecycle){lifecycle++;if(activationTimer!==undefined)window.clearTimeout(activationTimer);}window.clearInterval(timer);activeRegistration?.removeEventListener('updatefound',found);installing?.removeEventListener('statechange',changed);navigator.serviceWorker.removeEventListener('controllerchange',controller);window.removeEventListener('online',online);window.removeEventListener('offline',offline);window.removeEventListener('storage',storage);if(registration===activeRegistration)registration=null;};
}
