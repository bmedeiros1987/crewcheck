import { createAndroidStayAlarmAdapter } from './stay-alarm-android.mjs';

/** Prepared WebMessage transport. Caller supplies candidate auth only; native
 * host verifies the credential and returns trusted owner+epoch. No web timers
 * schedule alarms. The sole timer expires this session locally. */
export function createStayHostRuntime({port,readAccount,readToken,onState=()=>{},timeout=10000,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
  if(!port?.postMessage||typeof readAccount!=='function'||typeof readToken!=='function')return null;
  let generation=0,sequence=0,adapter=null,session=null,leaseTimer=null,permission=false;
  let activeScope=null,inactiveScope=null;
  const scopes=new Map();
  const jobs=scope=>{const id=JSON.stringify([scope.account,scope.epoch]);if(!scopes.has(id))scopes.set(id,{account:scope.account,epoch:scope.epoch,keys:new Set()});return scopes.get(id).keys;};
  const belongs=(key,scope)=>{try{const parts=key.split(':');return parts.length===3&&parts[0]==='stay-hotel-apz'&&decodeURIComponent(parts[1])===scope.account&&Boolean(decodeURIComponent(parts[2]));}catch{return false;}};
  const pending=new Map();
  const send=(action,extra={})=>new Promise((resolve,reject)=>{
    const id=`stay-${++sequence}`,timer=setTimer(()=>{pending.delete(id);reject(Error('host timeout'));},timeout);
    pending.set(id,{resolve,reject,timer,generation,action});
    try{port.postMessage(JSON.stringify({id,action,...extra}));}catch(error){pending.delete(id);clearTimer(timer);reject(error);}
  });
  const listener=event=>{try{
    const value=JSON.parse(event.data),request=pending.get(value.id);if(!request)return;
    pending.delete(value.id);clearTimer(request.timer);
    if(request.generation!==generation||value.state!==({authenticate:'verified',revoke:'revoked',suspend:'suspended',transact:'ok'}[request.action]))request.reject(Error('host session unavailable'));
    else request.resolve(value.payload);
  }catch{}};
  port.addEventListener('message',listener);
  function reset(retained=null){generation++;activeScope=null;inactiveScope=retained;adapter=null;session=null;permission=false;onState(false);if(leaseTimer!==null)clearTimer(leaseTimer);leaseTimer=null;
    for(const request of pending.values()){clearTimer(request.timer);request.reject(Error('session invalidated'));}pending.clear();}
  async function suspend(){const retained=activeScope||inactiveScope;reset(retained);try{await send('suspend');return {state:'native-suspended',cancelConfirmed:false};}catch{return {state:'suspension-unknown',cancelConfirmed:false};}}
  async function revoke(){const retained=activeScope||inactiveScope;reset(retained);try{await send('revoke',retained?{ownerId:retained.account,ownerEpoch:retained.epoch}:{});return {state:'native-revoked',cancelConfirmed:false};}catch{return {state:'revocation-unknown',cancelConfirmed:false};}}
  async function revokeScope(scope){
    if(activeScope!==scope&&inactiveScope!==scope)return {state:'superseded-session',cancelConfirmed:false};
    return revoke();
  }
  async function authenticate(){const retained=activeScope||inactiveScope;reset(retained);const captured=generation,account=readAccount(),token=readToken();
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
      activeScope={account,epoch:caps.ownerEpoch};inactiveScope=null;
      onState(true);leaseTimer=setTimer(()=>{void suspend();},remaining);
      return true;
    }catch{if(captured===generation){adapter=null;session=null;}return false;}
  }
  return {authenticate,revoke,suspend,
    async replace(input){const current=adapter,scope=activeScope;
      if(!current||!scope)return {state:'not-programmed',reason:'native-host-unavailable',key:input.key};
      if(!belongs(input.key,scope))return {state:'not-programmed',reason:'owner-epoch-mismatch',key:input.key};
      jobs(scope).add(input.key);return current.replace(input);
    },
    async cancel(input){const current=adapter,scope=activeScope;
      if(!current||!scope)return {state:'unknown',reason:'native-cancellation-unconfirmed',key:input.key};
      if(!belongs(input.key,scope))return {state:'unknown',reason:'owner-epoch-mismatch',key:input.key};
      jobs(scope).add(input.key);const result=await current.cancel(input);
      if(result.state==='cancelled'&&result.key===input.key)jobs(scope).delete(input.key);
      else await revokeScope(scope);return result;
    },
    atomicReplace:true,acknowledgedCancel:true,
    async invalidate(){const current=adapter,scope=activeScope;
      if(!current||!scope){
        if(inactiveScope&&inactiveScope.account===readAccount()&&jobs(inactiveScope).size)return revokeScope(inactiveScope);
        return {state:'no-current-session-jobs'};
      }
      const programmed=jobs(scope);
      if(!programmed.size)return {state:'no-known-jobs'};
      session=`${session}:edit-${++sequence}`;
      for(const key of [...programmed]){
        if(activeScope!==scope)return {state:'superseded-session',cancelConfirmed:false};
        const result=await current.cancel({key});
        if(result.state==='cancelled'&&result.key===key)programmed.delete(key);
        else return revokeScope(scope);
      }return {state:'cancelled'};
    },
    uncertainKeys:()=>[...scopes.values()].flatMap(scope=>[...scope.keys]),
    uncertainJobs:()=>[...scopes.values()].flatMap(scope=>[...scope.keys].map(key=>({key,account:scope.account,epoch:scope.epoch}))),
    permission:()=>permission,close(){void suspend();port.removeEventListener('message',listener);},ready:()=>Boolean(adapter),session:()=>session};
}
