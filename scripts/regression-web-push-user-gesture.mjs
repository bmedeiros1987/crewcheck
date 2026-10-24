import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const compiled=await build({stdin:{contents:"export{activateCrewCheckPushDevice}from'./client/src/lib/crewcheckPushRuntime';export{invalidateCrewCheckPushActivation}from'./client/src/lib/crewcheckPushActivation';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'auth-fixture',setup(b){b.onResolve({filter:/authClient$/},()=>({path:'auth',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const getToken=()=>fixture.token;export const getStoredUser=()=>fixture.token?{id:fixture.owner}:null;export const authFetch=async(path,options)=>{fixture.writes++;return{ownerId:fixture.owner,installationId:'synthetic_installation',consentRevision:1};};",loader:'js'}));}}]});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{resolve,promise};};
function fixture({permission='default',grant='granted',holdPermission=false}={}){
 const ready=deferred(),permissionGate=deferred(),counts={permission:0,subscribe:0,writes:0},state={token:'synthetic_token_A',owner:'synthetic_owner_A',writes:0},activation={gesture:true};
 const Notification={permission,requestPermission(){counts.permission++;return holdPermission?permissionGate.promise:Promise.resolve(activation.gesture?grant:'denied');}};
 class Channel{constructor(){this.port1={onmessage:null};this.port2={postMessage:data=>queueMicrotask(()=>this.port1.onmessage?.({data}))};}}
 const registration={active:{postMessage(message,ports){ports[0].postMessage({ok:true,generation:1});}},pushManager:{getSubscription:async()=>null,subscribe:async()=>{counts.subscribe++;return{toJSON:()=>({synthetic:true})};}}};
 const navigator={serviceWorker:{ready:ready.promise},locks:{request:async(_key,run)=>run()}};
 const window={isSecureContext:true,Notification,PushManager:{}};
 const localStorage={getItem:()=> 'synthetic_installation'};
 const module={exports:{}};vm.runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,fixture:state,window,navigator,Notification,localStorage,MessageChannel:Channel,Uint8Array,atob:()=>'',setTimeout,clearTimeout,queueMicrotask,fetch:()=>{throw Error('Real network forbidden');}});
 return{api:module.exports,ready,permissionGate,registration,counts,state,activation,window,navigator};
}
const enabled={enabled:true,revision:0,publicKey:'synthetic_key'};let checks=0;const eq=(a,b,label)=>{checks++;assert.deepEqual(a,b,label);};
{
 const f=fixture(),pending=f.api.activateCrewCheckPushDevice(enabled),immediate=f.counts.permission;
 f.activation.gesture=false;f.ready.resolve(f.registration);const result=await pending;
 console.log(JSON.stringify({case:'worker.ready resolves after user interaction',permissionCallsInGesture:immediate,result:result.status,subscriptionCalls:f.counts.subscribe}));
 eq(immediate,1,'permission is requested synchronously in explicit tap, before worker.ready');eq(result.status,'registered');eq(f.counts.subscribe,1);eq(f.state.writes,1);eq(result.received,null);
}
for(const setting of ['denied','default','granted']){
 const f=fixture({permission:setting,grant:setting==='default'?'denied':'granted'});f.ready.resolve(f.registration);const result=await f.api.activateCrewCheckPushDevice(enabled);
 eq(result.status,setting==='granted'?'registered':'permission_not_granted');eq(f.counts.permission,setting==='default'?1:0,'never re-prompt existing granted/denied');eq(f.counts.subscribe,setting==='granted'?1:0);
}
for(const blocked of ['disabled','noKey','noOwner','noLocks']){
 const f=fixture();if(blocked==='noOwner')f.state.token=null;if(blocked==='noLocks')f.navigator.locks=null;f.ready.resolve(f.registration);
 await f.api.activateCrewCheckPushDevice({...enabled,...(blocked==='disabled'?{enabled:false}:{}),...(blocked==='noKey'?{publicKey:null}:{})});eq(f.counts.permission,0);eq(f.counts.subscribe,0);eq(f.state.writes,0);
}
for(const transition of ['account','renewal','generation']){
 const f=fixture({holdPermission:true});const pending=f.api.activateCrewCheckPushDevice(enabled);eq(f.counts.permission,1);
 if(transition==='account'){f.state.owner='synthetic_owner_B';f.state.token='synthetic_token_B';}if(transition==='renewal')f.state.token='synthetic_token_A2';if(transition==='generation')f.api.invalidateCrewCheckPushActivation();
 f.permissionGate.resolve('granted');f.ready.resolve(f.registration);eq((await pending).status,'account_changed');eq(f.counts.subscribe,0);eq(f.state.writes,0);
}
console.log(`PASS ${checks} real runtime gesture/permission assertions: delayed worker, granted/denied/default, disabled/no owner/no lock, account/token/generation fences; fake browser APIs/auth only, zero real permission, subscription or provider requests.`);
