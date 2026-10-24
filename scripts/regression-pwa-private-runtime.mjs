import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(process.env.PWA_WORKER_SOURCE||'client/public/sw.js','utf8');
const origin='https://synthetic.invalid';
const current=source.match(/const CACHE_NAME = '([^']+)'/)[1];
const runtime=source.match(/const RUNTIME_CACHE = '([^']+)'/)[1];
const old='crewcheck-v14.4.10-runtime-brand936-abcdef';
const oldShell='crewcheck-v14.4.10-shell-brand936-abcdef';
function fixture(options={}){
 const events={},stores=new Map(),network=[];let offline=false;
 const caches={async keys(){return [...stores.keys()]},async open(name){if(!stores.has(name))stores.set(name,[]);const entries=stores.get(name);return {async keys(request){return entries.filter(e=>!request||e.request.url===request.url).map(e=>e.request)},async match(request){const url=typeof request==='string'?new URL(request,origin).href:request.url;return entries.find(e=>e.request.url===url)?.response.clone()},async put(request,response){request=typeof request==='string'?new Request(new URL(request,origin)):request;const i=entries.findIndex(e=>e.request.url===request.url);if(i>=0)entries.splice(i,1);entries.push({request:request.clone(),response:response.clone()})},async delete(request){const i=entries.findIndex(e=>e.request.url===(typeof request==='string'?new URL(request,origin).href:request.url));if(i<0)return false;entries.splice(i,1);return true}}},async match(request){for(const name of stores.keys()){const r=await(await this.open(name)).match(request);if(r)return r}},async delete(name){return stores.delete(name)}};
 const worker={state:'activated'};const self={location:{origin},addEventListener(n,f){events[n]=f},registration:{active:worker,installing:null,waiting:null},serviceWorker:worker,navigator:{locks:{request:async(n,o,f)=>(f||o)({name:n})}},clients:{matchAll:async()=>[{id:'old-tab'}],claim:async()=>{}}};
 const fetch=async request=>{const url=new URL(typeof request==='string'?request:request.url,origin);network.push(url.href);if(offline)throw Error('offline synthetic');if(url.pathname==='/'||url.pathname==='/index.html')return new Response('<script src="/assets/private-install.js"></script>',{headers:{'content-type':'text/html','cache-control':options.privateIndex?'private':'no-store'}});return new Response(url.pathname.includes('private')?'PRIVATE_RUNTIME_CANARY':'public asset',{headers:{'content-type':'text/javascript','cache-control':url.pathname.includes('no-store-only')?'no-store':url.pathname.includes('private-only')?'private':url.pathname.includes('private')?'private, no-store':'public, max-age=3600'}})};
 vm.runInNewContext(source,{self,caches,URL,Request,Response,importScripts(){},fetch,crypto:globalThis.crypto});
 return {caches,network,offline(){offline=true},async get(path,headers={}){let promise;events.fetch({request:new Request(new URL(path,origin),{headers}),respondWith(p){promise=p},waitUntil(){}});return promise?await promise:await fetch(new Request(new URL(path,origin),{headers}))},async install(){let p;events.install({waitUntil(value){p=value}});await p},async activate(){let p;events.activate({waitUntil(value){p=value}});await p}};
}
let checks=0;const check=(v,s)=>{checks++;assert(v,s)};
for (const options of [{privateIndex:true},{}]) {
 const candidate=fixture(options);
 await assert.rejects(candidate.install(),/Private update (?:entry|asset) response/);
 check(true,'private update response rejects shell admission');
 for (const name of await candidate.caches.keys()) for (const req of await(await candidate.caches.open(name)).keys()) check(!(await(await(await candidate.caches.open(name)).match(req)).text()).includes('PRIVATE_RUNTIME_CANARY'),'private shell response was never persisted');
}
const f=fixture();
await f.get('/assets/private.js',{Authorization:'Bearer SYNTHETIC_ONLY'});
for(const name of await f.caches.keys())for(const req of await(await f.caches.open(name)).keys())check(!req.headers.has('authorization'),'must not persist authorization request');
for (const path of ['/assets/no-store-only.js','/assets/private-only.js']) {
 await f.get(path);
 check(!(await(await f.caches.open(runtime)).match(new Request(origin+path))),'independent admission rejection: '+path);
}
await f.get('/assets/private.js');
check(!(await(await f.caches.open(runtime)).match(new Request(origin+'/assets/private.js'))),'must not admit no-store/private response');
for(const name of [runtime,old,oldShell,'unrelated-cache']){const c=await f.caches.open(name);await c.put(new Request(origin+'/synthetic-private-export.json',{headers:{Authorization:'Bearer SYNTHETIC_ONLY'}}),new Response('PRIVATE_RUNTIME_CANARY',{headers:{'cache-control':'no-store','content-type':'application/json'}}));await c.put(new Request(origin+'/assets/legacy-private.js',{headers:{Authorization:'Bearer SYNTHETIC_ONLY'}}),new Response('PRIVATE_RUNTIME_CANARY',{headers:{'cache-control':'private','content-type':'text/javascript'}}));}
const c=await f.caches.open(oldShell);await c.put('/assets/old.js',new Response('old chunk',{headers:{'content-type':'text/javascript','cache-control':'no-store'}}));await c.put('/__crewcheck_update_ready__',new Response(JSON.stringify({urls:['/assets/old.js']})));
for(const name of ['crewcheck-pwa-shared-pdf-v1','crewcheck-ocr-verified-v1'])await(await f.caches.open(name)).put('/preserve',new Response('preserve',{headers:{'cache-control':'no-store'}}));
await f.activate();
// A stale worker may still write after activation: cleanup alone must not be the fix.
for (const [path,headers] of [
 ['/assets/late-private.js',{'cache-control':'no-store','content-type':'text/javascript'}],
 ['/assets/late-vary.js',{'cache-control':'public, max-age=3600','content-type':'text/javascript','vary':'Cookie'}],
 ['/assets/late-json.js',{'cache-control':'public, max-age=3600','content-type':'application/json'}],
 ['/assets/late-query.js?token=SYNTHETIC_ONLY',{'cache-control':'public, max-age=3600','content-type':'text/javascript'}],
]) await(await f.caches.open(old)).put(path,new Response('PRIVATE_RUNTIME_CANARY',{headers}));
f.offline();
for (const path of ['/assets/late-private.js','/assets/late-vary.js','/assets/late-json.js','/assets/late-query.js?token=SYNTHETIC_ONLY']) check((await f.get(path)).type==='error','late legacy write refused: '+path);
check((await f.get('/assets/old.js',{Authorization:'Bearer SYNTHETIC_ONLY'})).type==='error','authenticated lookup never uses public cached fallback');
for(const path of ['/synthetic-private-export.json','/assets/legacy-private.js']){const r=await f.get(path);check(r.type==='error','legacy private data must not replay to next account: '+path)}
check((await(await f.get('/assets/old.js')).text())==='old chunk','old verified public chunk must survive');
for(const name of [runtime,old])check(!(await(await f.caches.open(name)).match(new Request(origin+'/assets/legacy-private.js'))),'selective legacy runtime cleanup');
for(const name of ['crewcheck-pwa-shared-pdf-v1','crewcheck-ocr-verified-v1'])check((await(await(await f.caches.open(name)).match('/preserve')).text())==='preserve','dedicated cache preserved');
check((await(await(await f.caches.open('unrelated-cache')).match(new Request(origin+'/synthetic-private-export.json'))).text())==='PRIVATE_RUNTIME_CANARY','unrelated cache untouched but inaccessible');
console.log(`PASS ${checks} actual-worker privacy checks; synthetic cache/network only`);
