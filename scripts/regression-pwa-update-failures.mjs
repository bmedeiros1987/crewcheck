import assert from'node:assert/strict';
import vm from'node:vm';
import{build}from'esbuild';
const compiled=await build({entryPoints:['client/src/lib/pwaUpdateCoordinator.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const id='a'.repeat(20);const turn=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
function fixture({waiting=true,mode='accept',native=false}={}){
 const timers=new Map(),storage=new Map();let tick=0,sends=0,checks=0,closed=0;
 class Target extends EventTarget{listeners=new Map();addEventListener(name,fn,...args){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);super.addEventListener(name,fn,...args);}removeEventListener(name,fn,...args){this.listeners.get(name)?.delete(fn);super.removeEventListener(name,fn,...args);}}
 const worker={postMessage(value,ports){if(value.type==='CREWCHECK_UPDATE_INFO')queueMicrotask(()=>ports[0].postMessage({ready:true,buildId:id}));else{assert.equal(value.type,'CREWCHECK_ACTIVATE_UPDATE');sends++;if(mode!=='drop')queueMicrotask(()=>ports[0].postMessage({accepted:mode==='accept',buildId:id}));}}};
 const registration=new Target();Object.assign(registration,{waiting:waiting?worker:null,installing:null,update:async()=>{checks++;throw Error('synthetic offline update failure');}});
 const sw=new Target();Object.assign(sw,{ready:Promise.resolve(registration),controller:worker});
 const navigator={serviceWorker:sw,onLine:true};const window=new Target();Object.assign(window,{AndroidCrewCheckNative:native?{}:undefined,setInterval:()=>999,clearInterval(){},setTimeout:(run,ms)=>{timers.set(++tick,{run,ms});return tick;},clearTimeout:key=>timers.delete(key),location:{reload(){throw Error('Reload forbidden');}}});
 class Channel{constructor(){this.port1={close(){closed++;},onmessage:null};this.port2={close(){closed++;},postMessage:data=>queueMicrotask(()=>this.port1.onmessage?.({data}))};}}
 const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
 const module={exports:{}};vm.runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,window,navigator,localStorage,MessageChannel:Channel,setTimeout:window.setTimeout,clearTimeout:window.clearTimeout,Date,JSON,Set});
 const stop=module.exports.installPwaUpdateCoordinator();return{api:module.exports,stop,window,navigator,sw,registration,timers,sends:()=>sends,checks:()=>checks,closed:()=>closed,fire(ms){for(const[k,v]of [...timers])if(v.ms===ms){timers.delete(k);v.run();}}};
}
let count=0;const eq=(a,b,label)=>{count++;assert.deepEqual(a,b,label);};
for(const mode of ['reject','drop']){
 const f=fixture({mode});await turn();eq(f.api.pwaUpdateSnapshot().phase,'available');eq(f.sends(),0,'discovery never activates');const request=f.api.requestPwaUpdate();if(mode==='drop')f.fire(5000);eq(await request,false);eq(f.api.pwaUpdateSnapshot().phase,'error');eq(f.sends(),1,'failure never retries automatically');f.stop();
}
{
 const f=fixture();await turn();eq(await f.api.requestPwaUpdate(),true);eq(f.api.pwaUpdateSnapshot().phase,'activating','ACK is not controller confirmation');f.fire(15000);eq(f.api.pwaUpdateSnapshot().phase,'error','missing controller change times out without reload');eq(f.sends(),1);f.stop();
}
{
 const f=fixture({mode:'drop'});await turn();const request=f.api.requestPwaUpdate();f.stop();const prior=f.api.pwaUpdateSnapshot();f.fire(5000);eq(await request,false);eq(f.api.pwaUpdateSnapshot(),prior,'late failed request cannot change stopped coordinator');eq([...f.window.listeners.values()].reduce((n,s)=>n+s.size,0),0,'window listeners released');eq([...f.sw.listeners.values()].reduce((n,s)=>n+s.size,0),0,'controller listener released');
}
{
 const f=fixture({waiting:false});await turn();eq(f.api.pwaUpdateSnapshot().phase,'idle');f.window.dispatchEvent(new Event('online'));await turn();eq(f.checks(),1);eq(f.api.pwaUpdateSnapshot().phase,'idle','failed check/release announcement cannot invent downloaded offer');eq(await f.api.requestPwaUpdate(),false);eq(f.sends(),0);f.stop();
}
{
 const f=fixture();await turn();f.navigator.onLine=false;f.window.dispatchEvent(new Event('offline'));eq(await f.api.requestPwaUpdate(),false);eq(f.sends(),0);f.navigator.onLine=true;f.window.dispatchEvent(new Event('online'));await turn();f.api.deferPwaUpdate();eq(f.api.pwaUpdateSnapshot().deferred,true);f.window.dispatchEvent(new Event('offline'));eq(f.api.pwaUpdateSnapshot().deferred,true,'offline/online does not undo defer');f.stop();
}
{
 const f=fixture({native:true});await turn();eq(f.api.pwaUpdateSnapshot().phase,'idle');eq(await f.api.requestPwaUpdate(),false);eq(f.sends(),0,'native shell does not activate PWA updates');f.stop();
}
const module={exports:{}};vm.runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports});eq(typeof module.exports.installPwaUpdateCoordinator(),'function','SSR safe');eq(module.exports.pwaUpdateServerSnapshot().phase,'idle');
console.log(`PASS ${count} update failure/lifecycle assertions: rejected/dropped ACK, missing controllerchange, no replay/reload, stopped responses/listener cleanup, offline/defer, failed check versus download, native and SSR; isolated APIs only.`);
