import assert from 'node:assert/strict';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const h=loadClientModules({files:['client/src/lib/wellhubLive.ts'],prefix:'synthetic-wellhub-timeout-'});
const before={fetch:globalThis.fetch,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
try{
 const m=h.load('wellhubLive'),timers=[];let calls=0;
 globalThis.setTimeout=(fn,ms)=>{timers.push({fn,ms,cleared:false});return timers.length;};globalThis.clearTimeout=id=>{if(timers[id-1])timers[id-1].cleared=true;};
 globalThis.fetch=(_url,options)=>{calls++;return new Promise((_,reject)=>options?.signal?.addEventListener('abort',()=>reject(new Error('synthetic abort'))));};
 const pending=m.fetchWellhubVerifiedSearch({plan:'basic',location:'Synthetic city'}).then(()=>({ok:true}),error=>({error:error.message}));
 assert.equal(timers.length,1,'a stalled search must have a finite cancellation deadline');assert.equal(timers[0].ms,15000);timers[0].fn();
 const result=await pending;assert.match(result.error,/demorou/);assert.equal(calls,1,'no automatic retries');assert(timers[0].cleared);
 globalThis.fetch=async()=>({ok:true,json:async()=>({ok:true,partners:[]})});assert.deepEqual(await m.fetchWellhubVerifiedSearch({plan:'basic'}),{ok:true,partners:[]},'genuine empty remains empty');
 globalThis.fetch=async()=>({ok:false,status:503,json:async()=>({message:'Synthetic unavailable'})});await assert.rejects(()=>m.fetchWellhubVerifiedSearch({plan:'basic'}),/Synthetic unavailable/,'failure is not empty');
 console.log('PASS actual Wellhub reader: finite deadline, stalled request canceled, no retry, success/empty/error preserved; zero network');
}finally{Object.assign(globalThis,before);h.cleanup();}
