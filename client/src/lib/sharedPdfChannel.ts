import { getStoredUser, getToken } from './authClient';
// PDF messages have their own origin/frame-restricted native channel. No global bridge fallback.
type Pending = { cancel:()=>void; document: string; token: string | null; resolve: (value:any)=>void; timer: ReturnType<typeof setTimeout> };
const pending = new Map<string,Pending>();
let generation = 0, epoch: number | null = null, validatedOwner: string | null = null;
let lastStatus: any = null;
function documentId(): string { return String((window as any).__crewcheckPdfDocument || ''); }
function clear() {
  delete (window as any).__crewcheckPendingNativePdf;
  generation++; epoch=null; validatedOwner=null; lastStatus=null;
  for(const p of pending.values()){clearTimeout(p.timer);p.cancel();p.resolve(false);} pending.clear();
}
export function sharedPdfChannelStatus(): any { return validatedOwner === getStoredUser()?.id && getToken() ? lastStatus : null; }
async function request(op:string, fields:Record<string,unknown>={}):Promise<any> {
  const bridge=(window as any).CrewCheckPdfChannel, document=documentId();
  if(window.top!==window || !bridge?.postMessage || !document || typeof crypto?.randomUUID!=='function') return false;
  const token=getToken(), id=crypto.randomUUID();
  return new Promise(resolve=>{
    const cancel=()=>{try{bridge.postMessage(JSON.stringify({id:'cancel-'+id,op:'cancel',cancelId:id,document,epoch}));}catch{}};
    const timer=setTimeout(()=>{pending.delete(id);cancel();resolve(false);},12000);
    pending.set(id,{document,token,resolve,timer,cancel});
    bridge.onmessage=(event:{data:string})=>{
      try{
        const response=JSON.parse(event.data), item=pending.get(response.id);
        if(!item || response.document!==item.document || documentId()!==item.document || getToken()!==item.token) return;
        pending.delete(response.id);clearTimeout(item.timer);
        item.resolve(response);
      }catch{}
    };
    try{bridge.postMessage(JSON.stringify({id,op,document,epoch,...fields}));}catch{pending.delete(id);clearTimeout(timer);resolve(false);}
  });
}
export async function sharedPdfChannelCall(op:string,receipt='',fields:Record<string,unknown>={}):Promise<any> {
  const captured=generation, activeEpoch=epoch;
  if(activeEpoch===null || !validatedOwner || validatedOwner!==getStoredUser()?.id || !getToken())return false;
  const response=await request(op,{receipt,...fields});
  if(captured!==generation || activeEpoch!==epoch || response?.epoch!==epoch)return false;
  if(op==='status')lastStatus=response.result && typeof response.result==='object'?response.result:null;
  if(['claim','begin','confirm'].includes(op)&&response.result===true){
    const status=await request('status');
    if(captured!==generation||activeEpoch!==epoch||status?.epoch!==epoch)return false;
    lastStatus=status.result&&typeof status.result==='object'?status.result:null;
  }
  return response.result;
}
export async function refreshSharedPdfChannelStatus():Promise<any> { await sharedPdfChannelCall('status');return sharedPdfChannelStatus(); }
async function bind() {
  clear();const captured=generation, token=getToken();
  if(!token){await request('logout');return;}
  const response=await request('bind',{token});
  if(captured!==generation || token!==getToken() || typeof response?.result!=='string' || response.result!==getStoredUser()?.id || !Number.isSafeInteger(response.epoch))return;
  epoch=response.epoch;validatedOwner=response.result;
  await refreshSharedPdfChannelStatus();
  if(captured!==generation)return;
  const payload=(window as any).__crewcheckPendingNativePdf;
  if(payload)window.dispatchEvent(new CustomEvent('crewcheck:native-pdf',{detail:payload}));
}
if(typeof window!=='undefined'){
  window.addEventListener('crewcheck:auth-will-change',()=>{clear();void request('logout');});
  window.addEventListener('crewcheck:auth-changed',()=>void bind());
  window.addEventListener('crewcheck:auth-expired',()=>{clear();void request('logout');});
  window.addEventListener('crewcheck:pdf-channel-ready',()=>void bind());
  window.addEventListener('storage',(event:StorageEvent)=>{if(!event.key||['crewcheck_auth_token','crewcheck_auth_user'].includes(event.key))void bind();});
  window.addEventListener('pagehide',()=>{clear();void request('logout');});
  void bind();
}
