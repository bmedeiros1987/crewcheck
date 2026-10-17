import assert from 'node:assert/strict';
import {build} from 'esbuild';
const original={window:globalThis.window,localStorage:globalThis.localStorage};const values=new Map(),requests=[];
globalThis.window=new EventTarget();globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
globalThis.fixtureProjection={owner:'A',fetch:()=>new Promise(resolve=>requests.push(resolve))};
const bundle=await build({entryPoints:['client/src/lib/notificationPreferences.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'auth-only-mock',setup(b){b.onResolve({filter:/authClient$/},()=>({path:'auth',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const getToken=()=>fixtureProjection.owner;export const getStoredUser=()=>({id:fixtureProjection.owner});export const authFetch=()=>fixtureProjection.fetch();'}));}}]});
const module=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const preferences=on=>({settings:{crewcheck_pulse_enabled:on}}),tick=()=>new Promise(resolve=>setImmediate(resolve));let stop;
try{
 stop=module.installNotificationPreferenceProjection();assert.equal(requests.length,1);
 assert.equal(module.cacheNotificationPreferences(preferences(false),'A',2),true);
 requests.shift()({ownerId:'A',revision:1,preferences:preferences(true)});await tick();assert.equal(module.readAccountNotificationSetting('crewcheck_pulse_enabled'),'0','GET begun before save cannot restore ON');
 assert.equal(module.cacheNotificationPreferences(preferences(true),'A',1),false);assert.equal(module.cacheNotificationPreferences(preferences(true),'A',2),false,'equal-revision conflict cannot overwrite');assert.equal(module.cacheNotificationPreferences(preferences(true),'A'),false,'unversioned cache write rejected');
 window.dispatchEvent(new Event('online'));assert.equal(requests.length,1);module.cacheNotificationPreferences(preferences(false),'A',4);requests.shift()({ownerId:'A',revision:3,preferences:preferences(true)});await tick();assert.equal(module.readAccountNotificationSetting('crewcheck_pulse_enabled'),'0');
 window.dispatchEvent(new Event('online'));fixtureProjection.owner='B';window.dispatchEvent(new Event('crewcheck:auth-changed'));requests.shift()({ownerId:'A',revision:99,preferences:preferences(true)});requests.shift()({ownerId:'A',revision:99,preferences:preferences(true)});await tick();assert.equal(module.readAccountNotificationSetting('crewcheck_pulse_enabled','pending'),'pending','foreign/stale owner cannot populate B');
 window.dispatchEvent(new Event('online'));requests.shift()({ownerId:'B',revision:0,preferences:preferences(false)});await tick();assert.equal(module.readAccountNotificationSetting('crewcheck_pulse_enabled'),'0');assert.equal(JSON.parse(values.get('crewcheck:notification-preferences:v1:B')).revision,0);
 console.log('PASS real preference projection: delayed ON after saved OFF, revision/equal/unversioned rejection, refresh invalidation, stale/foreign owner and current B; auth transport mocked, zero sends.');
}finally{stop?.();globalThis.window=original.window;globalThis.localStorage=original.localStorage;delete globalThis.fixtureProjection;}
