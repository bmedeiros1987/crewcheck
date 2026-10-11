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
    pending.set(id,{resolve,reject,timer,generation,action});
    try{port.postMessage(JSON.stringify({id,action,...extra}));}catch(error){pending.delete(id);clearTimer(timer);reject(error);}
  });
  const listener=event=>{try{
    const value=JSON.parse(event.data),request=pending.get(value.id);if(!request)return;
    pending.delete(value.id);clearTimer(request.timer);
    if(request.generation!==generation||value.state!==({authenticate:'verified',revoke:'revoked',transact:'ok'}[request.action]))request.reject(Error('host session unavailable'));
    else request.resolve(value.payload);
  }catch{}};
  port.addEventListener('message',listener);
  function reset(){generation++;adapter=null;session=null;permission=false;onState(false);if(leaseTimer!==null)clearTimer(leaseTimer);leaseTimer=null;
    for(const request of pending.values()){clearTimer(request.timer);request.reject(Error('session invalidated'));}pending.clear();}
  async function revoke(){reset();try{await send('revoke');return {state:'native-revoked',cancelConfirmed:false};}catch{return {state:'revocation-unknown',cancelConfirmed:false};}}
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
      const remaining=caps.leaseRemainingMillis ?? 300000;
      if(!Number.isSafeInteger(remaining)||remaining<=0||remaining>18*3600000){void revoke();return false;}
      onState(true);leaseTimer=setTimer(()=>{void revoke();},remaining);
      return true;
    }catch{if(captured===generation){adapter=null;session=null;}return false;}
  }
  return {authenticate,revoke,replace:async input=>adapter?await (()=>{programmed.add(input.key);return adapter.replace(input);})():({state:'not-programmed',reason:'native-host-unavailable',key:input.key}),
    cancel:async input=>{programmed.add(input.key);const current=adapter;if(!current){await revoke();return {state:'unknown',reason:'native-cancellation-unconfirmed',key:input.key};}
      const result=await current.cancel(input);if(result.state==='cancelled')programmed.delete(input.key);else await revoke();return result;},
    atomicReplace:true,acknowledgedCancel:true,
    async invalidate(){const current=adapter;
      if(!programmed.size)return {state:'no-known-jobs'};
      if(!current)return revoke();
      session=`${session}:edit-${++sequence}`;
      for(const key of [...programmed]){const result=await current.cancel({key});
        if(result.state==='cancelled'&&result.key===key)programmed.delete(key);
        else return revoke(); // preserve uncertain identity; native revocation is distinct from cancellation
      }return {state:'cancelled'};},
    uncertainKeys:()=>[...programmed],
    permission:()=>permission,close(){void revoke();port.removeEventListener('message',listener);},ready:()=>Boolean(adapter),session:()=>session};
}
