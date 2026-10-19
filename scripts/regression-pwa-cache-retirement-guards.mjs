import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(process.env.PWA_WORKER_SOURCE || 'client/public/sw.js','utf8');
const current=source.match(/const CACHE_NAME = '([^']+)'/)[1];
const runtime=source.match(/const RUNTIME_CACHE = '([^']+)'/)[1];
const old=['crewcheck-v14.2-offline-shell-'+'a'.repeat(20),'crewcheck-v14.2-offline-runtime-'+'a'.repeat(20)];
old.push('crewcheck-v14.4.10-shell-brand936-abcdef012345-'+'b'.repeat(20),'crewcheck-v14.4.10-runtime-brand936-abcdef012345-'+'b'.repeat(20));
const protectedNames=[current,runtime,'crewcheck-pwa-shared-pdf-v1','workbox-unrelated','crewcheck-other-domain-data','crewcheck-v14.4.11-manuals-shell'];
function fixture(pages, options={}){
 const events={},deleted=[],names=new Set([...protectedNames,...old]);let reads=0;
 const self={location:{origin:'https://synthetic.invalid'},addEventListener(name,run){events[name]=run;},clients:{async matchAll(options){assert.equal(options.type,'window');assert.equal(options.includeUncontrolled,true);reads++;if(pages instanceof Error)throw pages;return typeof pages==='function'?pages(reads):pages;}}};
 const worker={state:'activated'},registration={active:worker,installing:null,waiting:null};
 let queue=Promise.resolve();
 self.serviceWorker=worker;self.registration=registration;self.navigator={locks:{request(name,lockOptions,action){if(typeof lockOptions==='function'){action=lockOptions;lockOptions={};}assert.equal(name,'crewcheck-build-cache-lifecycle-v1');if(lockOptions?.ifAvailable&&options.lockBusy)return Promise.resolve(action(null));const result=queue.then(()=>action({name}));queue=result.catch(()=>{});return result;}}};
 if(options.slot)registration[options.slot]={state:options.slot==='waiting'?'installed':'installing'};
 if(options.noLocks)delete self.navigator.locks;
 if(options.noIdentity)delete self.serviceWorker;
 const caches={async keys(){await options.onKeys?.({self,names});return[...names];},async delete(name){await options.onDelete?.({self,names});deleted.push(name);return names.delete(name);},async open(){return{async put(){},async match(){return undefined;}};}};
 vm.runInNewContext(source,{self,caches,URL,Response,importScripts(){},fetch:async()=>new Response('synthetic HTML',{headers:{'content-type':'text/html'}})});
 return{deleted,names,self,async navigate(clientId='',resultingClientId=''){let response;events.fetch({request:{url:'https://synthetic.invalid/',method:'GET',mode:'navigate'},clientId,resultingClientId,respondWith(value){response=value;}});return await response;}};
}
let checks=0;function check(value,label){checks++;assert(value,label);}
for(const pages of [[{id:'old-hidden',visibilityState:'hidden'}],[{id:'uncontrolled-old'}],[{}]]){const f=fixture(pages);check((await f.navigate('','new-client')).status===200,'navigation survives existing/unknown clients');check(f.deleted.length===0,'existing hidden/uncontrolled/unknown clients prevent retirement');}
{const f=fixture([{id:'arriving'}]);await f.navigate('existing-initiator','arriving');check(f.deleted.length===0,'an initiating client prevents excluding a claimed arriving id');}
{const f=fixture([{id:'arriving'}]);await f.navigate('','');check(f.deleted.length===0,'missing resulting client id remains conservative');}
{const f=fixture([{id:'arriving'}]);await f.navigate('','arriving');check(old.every(name=>f.deleted.includes(name)),'fresh navigation can retire only previous build pair');check(protectedNames.every(name=>f.names.has(name)),'current/shared/unrelated caches are retained');}
{const f=fixture(new Error('synthetic enumeration failure'));check((await f.navigate('','arriving')).status===200,'client lookup failure never blocks navigation');check(f.deleted.length===0,'client lookup failure retains caches');}
{const f=fixture(reads=>reads===1?[]:[{id:'appeared-existing-client'}]);await f.navigate('','arriving');check(f.deleted.length===0,'client appearance before deletion aborts retirement');}
// Pending lifecycle slots pin every cache, including names that look retired.
const failures=[];
for(const slot of ['waiting','installing']){
 const f=fixture([], {slot});await f.navigate('','arriving');
 try{check(f.deleted.length===0,slot+' worker pins all build caches');console.log('PASS pending '+slot);}catch(error){failures.push(error);console.log('FAIL pending '+slot);}
}
{
 const f=fixture([], {onKeys({self}){self.registration.active={state:'activating'};}});
 await f.navigate('','arriving');
 try{check(f.deleted.length===0,'replacement active worker stops stale execution before deletion');console.log('PASS active replacement');}catch(error){failures.push(error);console.log('FAIL active replacement');}
}
for(const options of [{noLocks:true},{noIdentity:true},{lockBusy:true}]){
 const f=fixture([],options);await f.navigate('','arriving');
 try{check(f.deleted.length===0,'missing lifecycle safety capability retains caches');}catch(error){failures.push(error);}
}
{
 let queuedWriter=false,writerRan=false;
 const f=fixture([], {onKeys({self}){
   // A new install starts after the cleanup snapshot check. It must not write
   // even its first cache until this deletion transaction releases its pin.
   self.registration.installing={state:'installing'};
   self.navigator.locks.request('crewcheck-build-cache-lifecycle-v1',async()=>{writerRan=true;});
   queuedWriter=true;
 },onDelete(){check(!writerRan,'install cache writer cannot interleave with retirement');}});
 await f.navigate('','arriving');
 check(queuedWriter,'concurrent install queued behind retirement lock');
 check(f.deleted.length===0,'new installing slot aborts before first delete');
 await Promise.resolve();check(writerRan,'install writer resumes after retirement releases lock');
}
{
 let checksBeforeDelete=0;
 const f=fixture([], {onDelete({self}){
   checksBeforeDelete++;
   if(checksBeforeDelete===1)self.registration.active={state:'activated'};
 }});
 await f.navigate('','arriving');
 check(f.deleted.length===1,'active replacement during deletion prevents all subsequent deletes');
 check(protectedNames.every(name=>f.names.has(name)),'active replacement preserves current/PDF/unrelated caches');
}
if(failures.length)throw new AggregateError(failures,'Lifecycle pin failures');
console.log(`PASS ${checks} actual-worker retirement guards: hidden/uncontrolled/unknown clients, initiating/missing ids, current/shared/unrelated preservation, enumeration failure and pre-delete client recheck; synthetic VM only.`);
