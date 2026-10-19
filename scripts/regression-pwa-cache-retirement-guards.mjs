import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('client/public/sw.js','utf8');
const current=source.match(/const CACHE_NAME = '([^']+)'/)[1];
const runtime=source.match(/const RUNTIME_CACHE = '([^']+)'/)[1];
const old=['crewcheck-v14.2-offline-shell-'+'a'.repeat(20),'crewcheck-v14.2-offline-runtime-'+'a'.repeat(20)];
old.push('crewcheck-v14.4.10-shell-brand936-abcdef012345-'+'b'.repeat(20),'crewcheck-v14.4.10-runtime-brand936-abcdef012345-'+'b'.repeat(20));
const protectedNames=[current,runtime,'crewcheck-pwa-shared-pdf-v1','workbox-unrelated','crewcheck-other-domain-data','crewcheck-v14.4.11-manuals-shell'];
function fixture(pages){
 const events={},deleted=[],names=new Set([...protectedNames,...old]);let reads=0;
 const self={location:{origin:'https://synthetic.invalid'},addEventListener(name,run){events[name]=run;},clients:{async matchAll(options){assert.equal(options.type,'window');assert.equal(options.includeUncontrolled,true);reads++;if(pages instanceof Error)throw pages;return typeof pages==='function'?pages(reads):pages;}}};
 const caches={async keys(){return[...names];},async delete(name){deleted.push(name);return names.delete(name);},async open(){return{async put(){},async match(){return undefined;}};}};
 vm.runInNewContext(source,{self,caches,URL,Response,importScripts(){},fetch:async()=>new Response('synthetic HTML',{headers:{'content-type':'text/html'}})});
 return{deleted,names,async navigate(clientId='',resultingClientId=''){let response;events.fetch({request:{url:'https://synthetic.invalid/',method:'GET',mode:'navigate'},clientId,resultingClientId,respondWith(value){response=value;}});return await response;}};
}
let checks=0;function check(value,label){checks++;assert(value,label);}
for(const pages of [[{id:'old-hidden',visibilityState:'hidden'}],[{id:'uncontrolled-old'}],[{}]]){const f=fixture(pages);check((await f.navigate('','new-client')).status===200,'navigation survives existing/unknown clients');check(f.deleted.length===0,'existing hidden/uncontrolled/unknown clients prevent retirement');}
{const f=fixture([{id:'arriving'}]);await f.navigate('existing-initiator','arriving');check(f.deleted.length===0,'an initiating client prevents excluding a claimed arriving id');}
{const f=fixture([{id:'arriving'}]);await f.navigate('','');check(f.deleted.length===0,'missing resulting client id remains conservative');}
{const f=fixture([{id:'arriving'}]);await f.navigate('','arriving');check(old.every(name=>f.deleted.includes(name)),'fresh navigation can retire only previous build pair');check(protectedNames.every(name=>f.names.has(name)),'current/shared/unrelated caches are retained');}
{const f=fixture(new Error('synthetic enumeration failure'));check((await f.navigate('','arriving')).status===200,'client lookup failure never blocks navigation');check(f.deleted.length===0,'client lookup failure retains caches');}
{const f=fixture(reads=>reads===1?[]:[{id:'appeared-existing-client'}]);await f.navigate('','arriving');check(f.deleted.length===0,'client appearance before deletion aborts retirement');}
console.log(`PASS ${checks} actual-worker retirement guards: hidden/uncontrolled/unknown clients, initiating/missing ids, current/shared/unrelated preservation, enumeration failure and pre-delete client recheck; synthetic VM only.`);
