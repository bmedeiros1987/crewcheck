import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('client/src/lib/androidPushLifecycle.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {createAndroidRegistryProtocol,createAndroidPushLifecycle}=context.exports;
const identity={ownerId:'synthetic-owner-a',session:'SYNTHETIC_BEARER_A_NOT_REAL'};
const native={enabled:true,ownerId:identity.ownerId,installationId:'synthetic-installation',generation:'1',tokenRevision:'1',token:'SYNTHETIC_FCM_TOKEN_NOT_REAL'};
let checks=0;const check=(value,message)=>{assert(value,message);checks++;};
function harness(){
 let current=identity,state={installationId:native.installationId,revision:0,consentRevision:0,registered:false,registryConfirmed:true,received:null};
 const journal=new Map(),posts=[],receipts=new Map();let sequence=0,failWrite=false,loseAck=false,alterAck=null,afterPost=null,tail=Promise.resolve();
 const protocol=createAndroidRegistryProtocol({current:account=>account===current,
  journal:{read:key=>journal.get(key)??null,write:(key,value)=>{if(failWrite)throw Error('synthetic disk');journal.set(key,structuredClone(value));},remove:key=>journal.delete(key)},
  mutationId:()=>`synthetic-operation-${++sequence}`,
  lock:(_,run)=>{const result=tail.then(run);tail=result.catch(()=>{});return result;},
  request:async(account,method,installationId,body)=>{
   if(method==='GET')return structuredClone(state);
   posts.push({account,body:structuredClone(body)});
   let ack=receipts.get(body.mutationId);
   if(ack)ack={...ack,duplicate:true};
   else {
    if(body.expectedRevision!==state.revision||body.expectedConsentRevision!==state.consentRevision)throw Object.assign(Error('CAS'),{status:409,code:'NATIVE_REVISION_CHANGED'});
    state={...state,registered:body.action!=='revoke',generation:Number(body.generation),tokenRevision:Number(body.tokenRevision),revision:state.revision+1,consentRevision:state.consentRevision+(body.action==='rotate'?0:1)};
    ack={...state,revoked:!state.registered,mutationId:body.mutationId,duplicate:false};receipts.set(body.mutationId,ack);
   }
   if(afterPost)afterPost();
   if(loseAck){loseAck=false;throw Error('synthetic lost response');}
   return alterAck?alterAck(ack):ack;
  }});
 return {protocol,journal,posts,get state(){return state;},set current(v){current=v;},set failWrite(v){failWrite=v;},set loseAck(v){loseAck=v;},set alterAck(v){alterAck=v;},set afterPost(v){afterPost=v;}};
}
let h=harness();check(!(await h.protocol.register(native,identity,false)).registered);check(h.posts.length===0,'no implicit initial consent');
h.loseAck=true;await assert.rejects(()=>h.protocol.register(native,identity,true));checks++;
check(h.journal.size===1);const retained=h.posts[0].body.mutationId;
check(!JSON.stringify([...h.journal.values()]).includes(native.token));check(!JSON.stringify([...h.journal.values()]).includes(identity.session));
check((await h.protocol.register(native,identity,false)).registered);check(h.posts[1].body.mutationId===retained);check(h.state.revision===1&&h.state.consentRevision===1&&h.journal.size===0,'lost ACK reuses durable ID without second consent');
check((await h.protocol.register(native,identity,false)).registered);check(h.posts.length===2,'confirmed cache plus GET does not renew consent');
const rotated={...native,tokenRevision:'2',token:'SYNTHETIC_ROTATED_FCM_NOT_REAL'};
check((await h.protocol.register(rotated,identity,false)).registered);check(h.posts.at(-1).body.action==='rotate'&&h.state.consentRevision===1);
h.current={ownerId:'synthetic-owner-b',session:'SYNTHETIC_BEARER_B'};
check((await h.protocol.revoke(rotated,identity)).revoked);check(h.posts.at(-1).account===identity&&h.posts.at(-1).body.token===undefined,'old captured identity revokes without raw token');
check(!h.state.registered&&h.state.consentRevision===2);
h=harness();h.failWrite=true;await assert.rejects(()=>h.protocol.register(native,identity,true));checks++;check(h.posts.length===0,'no POST without durable mutation ID');
for(const patch of [{mutationId:'foreign-operation'},{registryConfirmed:false},{received:true},{revision:9},{consentRevision:0},{generation:2},{registered:false}]){
 h=harness();h.alterAck=ack=>({...ack,...patch});await assert.rejects(()=>h.protocol.register(native,identity,true));checks++;check(h.journal.size===1,'unmatched ACK retains reconciliation ID');
}
h=harness();h.afterPost=()=>{h.current=null;};await assert.rejects(()=>h.protocol.register(native,identity,true));checks++;check(h.journal.size===1,'session changed during ACK cannot confirm');
for(const generation of ['01','1e2','9007199254740992','0']){h=harness();await assert.rejects(async()=>h.protocol.register({...native,generation},identity,true));checks++;check(h.posts.length===0);}
h=harness();await Promise.all([h.protocol.register(native,identity,true),h.protocol.register(native,identity,false)]);check(h.posts.length===1,'cross-context lock serializes concurrent reconcile');
// Exercise real lifecycle: retain old bearer on expired/logout after auth storage
// has already been cleared; an unconfirmed revoke blocks new-account activation.
let active=identity,status={...native},failRevoke=true,revokeAccounts=[],scopeWrites=0;
const target=new EventTarget();
const lifecycle=createAndroidPushLifecycle({target,identity:()=>active,host:()=>({nativePushStatus:()=>JSON.stringify(status),setNativePushSession:owner=>{scopeWrites++;status={...status,ownerId:owner};return true;},requestNativePushToken:()=>true}),
 register:async()=>({registered:true}),revoke:async(_,account)=>{revokeAccounts.push(account);if(failRevoke)throw Error('synthetic uncertain revoke');}});
check(await lifecycle.activate(true)==='registered');active=null;target.dispatchEvent(new Event('crewcheck:auth-expired'));await Promise.resolve();await Promise.resolve();
check(status.ownerId==='','local tombstone is synchronous');check(revokeAccounts[0]===identity,'logout with cleared storage retains old account bearer');
active={ownerId:'synthetic-owner-b',session:'SYNTHETIC_BEARER_B'};const before=scopeWrites;
check(await lifecycle.activate(true)==='unconfirmed');check(scopeWrites===before,'new account cannot bypass uncertain remote revocation');
failRevoke=false;check(await lifecycle.activate(true)==='registered');check(revokeAccounts.every(account=>account===identity));lifecycle.dispose();
console.log(`PASS ${checks} synthetic Android client CAS/durable-ID/lost-ACK/rotation/logout/session/consent checks; no network or real tokens`);
// Execute the default host with poison external dependencies: hard OFF must
// never even inspect storage, Web Locks, crypto or the fetch transport.
const poison=()=>{throw Error('unexpected external I/O while OFF');};
const hostWindow=new EventTarget();hostWindow.AndroidCrewCheckNative={nativePushStatus:()=>JSON.stringify(native),setNativePushSession:()=>true,requestNativePushToken:()=>true};
const hostContext={exports:{},require:name=>name==='./authClient'?{getStoredUser:()=>({id:identity.ownerId}),getToken:()=>identity.session}:context.exports};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('client/src/lib/androidPushHost.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,hostContext);
hostContext.window=hostWindow;
for(const name of ['fetch','localStorage','navigator','crypto'])Object.defineProperty(hostContext,name,{get:poison});
const off=hostContext.exports.installAndroidPushHost();
check(await off.activate(true)==='unconfirmed');off.dispose();
console.log('PASS default host hard-OFF poison I/O counterproof');
