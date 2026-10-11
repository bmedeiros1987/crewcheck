import { createAndroidStayAlarmAdapter } from './stay-alarm-android.mjs';

/** Prepared WebMessage transport. Caller supplies candidate auth only; native
 * host verifies the credential and returns trusted owner+epoch. No web timers
 * schedule alarms. The sole timer expires this session locally. */
export function createStayHostRuntime({port,readAccount,readToken,onState=()=>{},timeout=10000,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  if(!port?.postMessage||typeof readAccount!=='function'||typeof readToken!=='function')return null;
  let generation=0,sequence=0,adapter=null,session=null,leaseTimer=null,permission=false;
  const programmed=new Set();
  const pending=new Map();
  const send=(action,extra={})=>new Promise((resolve,reject)=>{
    const id=`stay-${++sequence}`,timer=setTimer(()=>{pending.delete(id);reject(Error('host timeout'));},timeout);
    pending.set(id,{resolve,reject,timer,generation});
    try{port.postMessage(JSON.stringify({id,action,...extra}));}catch(error){pending.delete(id);clearTimer(timer);reject(error);}
  });
  const listener=event=>{try{
    const value=JSON.parse(event.data),request=pending.get(value.id);if(!request)return;
    pending.delete(value.id);clearTimer(request.timer);
    if(request.generation!==generation||!['ok','verified','revoked'].includes(value.state))request.reject(Error('host session unavailable'));
    else request.resolve(value.payload);
  }catch{}};
  port.addEventListener('message',listener);
  function reset(){generation++;adapter=null;session=null;permission=false;programmed.clear();onState(false);if(leaseTimer!==null)clearTimer(leaseTimer);leaseTimer=null;
    for(const request of pending.values()){clearTimer(request.timer);request.reject(Error('session invalidated'));}pending.clear();}
  async function revoke(){reset();try{await send('revoke');}catch{}}
  async function authenticate(){reset();const captured=generation,account=readAccount(),token=readToken();
    if(!account||!token){await revoke();return false;}
    try{
      const raw=await send('authenticate',{token});const caps=JSON.parse(raw);
      if(captured!==generation)return false;
      if(account!==readAccount()||token!==readToken()||caps.ownerId!==account){void revoke();return false;}
      session=`${captured}:${caps.ownerEpoch}`;permission=caps.permissionGranted===true;
      const native={capabilities:()=>raw,transact:payload=>send('transact',{payload})};
      adapter=createAndroidStayAlarmAdapter({enabled:true,native,activeAccount:readAccount,activeSession:()=>session});
      if(!adapter)return false;
      onState(true);leaseTimer=setTimer(()=>{void revoke();},300000);
      return true;
    }catch{if(captured===generation){adapter=null;session=null;}return false;}
  }
  return {authenticate,revoke,replace:async input=>adapter?await (()=>{programmed.add(input.key);return adapter.replace(input);})():({state:'not-programmed',reason:'native-host-unavailable',key:input.key}),
    cancel:input=>adapter?adapter.cancel(input):Promise.resolve({state:'not-programmed',reason:'native-host-unavailable',key:input.key}),
    atomicReplace:true,acknowledgedCancel:true,
    async invalidate(){const current=adapter;if(!current)return;session=`${session}:edit-${++sequence}`;for(const key of [...programmed]){await current.cancel({key});programmed.delete(key);}},
    permission:()=>permission,close(){void revoke();port.removeEventListener('message',listener);},ready:()=>Boolean(adapter),session:()=>session};
}
