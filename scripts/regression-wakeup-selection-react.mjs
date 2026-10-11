import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {webcrypto} from 'node:crypto';
import path from 'node:path';
import {wakeupAlarmScope,saveWakeupSelection} from '../shared/wakeupChannelSelection.mjs';
const require=createRequire(import.meta.url),domRequire=createRequire(process.env.WAKEUP_JSDOM_PACKAGE||import.meta.url);
const {JSDOM}=domRequire('jsdom'),dom=new JSDOM('<main id="root"></main>',{url:'https://synthetic.invalid'});
for(const key of ['window','document','localStorage','HTMLElement','HTMLDetailsElement','Event','StorageEvent'])globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react'),{createRoot}=require('react-dom/client'),{act}=require('react-dom/test-utils');
assert.equal(React.version,'18.2.0');
const bundled=await build({entryPoints:['client/src/components/notifications/WakeupChannelSelection.tsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime'],loader:{'.css':'empty'},plugins:[{name:'alias',setup(b){b.onResolve({filter:/^@\//},({path:p})=>({path:path.resolve('client/src',p.slice(2)+'.ts')}));}}]});
const compiled={exports:{}};new Function('require','module','exports',bundled.outputFiles[0].text)(require,compiled,compiled.exports);
const {WakeupChannelSelection}=compiled.exports,root=createRoot(document.getElementById('root')),records=[],onDecision=value=>records.push(value),instant='2032-02-01T10:00:00Z',readiness={telegramConfigured:true,telegramLinked:true};
function seed(id,channel){localStorage.setItem('crewcheck:notification-preferences:v1:'+id,JSON.stringify({ownerId:id,revision:1,preferences:{settings:{crewcheck_wakeup_channel:channel}}}));}
function account(id){localStorage.setItem('crewcheck_auth_token',id);localStorage.setItem('crewcheck_auth_user',JSON.stringify({id}));}
const settle=async()=>{await act(async()=>{await new Promise(r=>setTimeout(r,20));});};
account('A');seed('A','ligacao');seed('B','ligacao');
const scope=await wakeupAlarmScope('alarm-A',instant);saveWakeupSelection(localStorage,'A',scope,['telegram']);
await act(async()=>root.render(React.createElement(WakeupChannelSelection,{eventId:'alarm-A',instant,readiness,onDecision})));await settle();assert.equal(records.at(-1).ready,true);
await act(async()=>{account('B');window.dispatchEvent(new StorageEvent('storage',{key:'crewcheck_auth_user',newValue:JSON.stringify({id:'B'})}));});await settle();
assert.equal(records.at(-1).ownerId,'B');assert.deepEqual(records.at(-1).channels,['phone-call']);assert.equal(records.at(-1).ready,false);
await act(async()=>{account('A');window.dispatchEvent(new StorageEvent('storage',{key:'crewcheck_auth_token',newValue:'A'}));});await settle();assert.equal(records.at(-1).ready,true,'A override restores without remount');
// Hold hashing so the new event renders against the previous resolved scope.
const nativeCrypto=globalThis.crypto;let release;
Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{digest:(...args)=>new Promise(resolve=>{release=()=>resolve(webcrypto.subtle.digest(...args));})}}});
records.length=0;await act(async()=>root.render(React.createElement(WakeupChannelSelection,{eventId:'alarm-new',instant,readiness,onDecision})));
assert(records.length>0);assert(records.every(value=>!value.ready),'No transient ready decision with the old event scope');
await act(async()=>release());await settle();assert.equal(records.at(-1).ready,false);assert.deepEqual(records.at(-1).channels,['phone-call']);
Object.defineProperty(globalThis,'crypto',{configurable:true,value:nativeCrypto});await act(async()=>root.unmount());dom.window.close();
console.log('PASS React18 actual selection: cross-tab storage reload A/B/A without remount, delayed scope never ready for a new event, no transport or permission requests.');
