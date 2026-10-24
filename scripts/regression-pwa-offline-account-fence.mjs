import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {build} from 'esbuild';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(process.env.OFFLINE_SYNC_SOURCE||'client/src/lib/offlineSync.ts','utf8');
const bundle=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',globalName:'Offline',plugins:[{name:'synthetic-dependencies',setup(b){b.onResolve({filter:/^\.\/(?:databaseClient|authClient)$/},a=>({path:a.path,namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},a=>({contents:a.path.includes('database')?'export const saveRosterAnalysis=p=>globalThis.save(p);':'export const getStoredUser=()=>globalThis.user;export const getToken=()=>globalThis.token;',loader:'js'}));}}]});
function fixture(crypto=webcrypto){const values=new Map(),writes=[],sent=[];const ctx={crypto,TextEncoder,console,window:new EventTarget(),Event,user:{id:'account-A',email:'a@example.test'},token:'fake-A',localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>{values.set(k,String(v));writes.push(k);},removeItem:k=>values.delete(k)},save:async p=>{sent.push({owner:ctx.user?.id,source:p.sourceFileName});return{id:'fake-id'};}};vm.createContext(ctx);vm.runInContext(bundle.outputFiles[0].text,ctx);return{ctx,values,writes,sent,api:ctx.Offline};}
const payload={roster:{year:2032,month:10,crewId:'QA-A',days:[{date:'10/10/2032'}]},compliance:{score:0,alerts:[]},gym:[],sourceFileName:'Synthetic A publication'};
const changed=error=>error?.code==='OFFLINE_SCOPE_CHANGED';
let cases=0;
for(const change of ['account','logout','renewal'])for(const outcome of ['accepted','failed']){
 const f=fixture();await f.api.queueRosterOffline({...payload,checksum:'fake-A-1'});await f.api.queueRosterOffline({...payload,checksum:'fake-A-2'});f.writes.length=0;
 let finish;f.ctx.save=async p=>{f.sent.push({owner:f.ctx.user?.id});if(f.sent.length===1)await new Promise(r=>finish=r);if(outcome==='failed')throw Error('Synthetic backend unavailable');return{id:'fake-id'};};
 const pending=f.api.syncPendingRosters();await Promise.resolve();const beforeSwitch=f.writes.length;
 if(change==='account'){f.ctx.user={id:'account-B',email:'b@example.test'};f.ctx.token='fake-B';}else if(change==='logout'){f.ctx.user=null;f.ctx.token=null;}else f.ctx.token='fake-A-renewed';
 finish();await assert.rejects(pending,changed);assert.equal(f.sent.length,1,'stale batch must not start another save');assert.equal(f.writes.length,beforeSwitch,'stale completion must not write history/checksum/queue in a new session');assert(f.values.get('crewcheck_offline_queue_v11_account-a').includes('fake-A-1'),'old queue remains for safe retry');cases++;
}
for(const method of ['queueRosterOffline','saveRosterOfflineFirst']){
 let finish;const f=fixture({subtle:{digest:()=>new Promise(r=>finish=r)}});const pending=f.api[method](payload);f.ctx.user={id:'account-B'};f.ctx.token='fake-B';finish(new Uint8Array(32).buffer);await assert.rejects(pending,changed);assert.equal(f.writes.length,0);assert.equal(f.sent.length,0);cases++;
}
for(const outcome of ['accepted','failed']){
 const f=fixture();let finish;f.ctx.save=async()=>{await new Promise(r=>finish=r);if(outcome==='failed')throw Error('Synthetic413');return{id:'fake-id'};};
 const pending=f.api.saveRosterOfflineFirst({...payload,sourceFileDataBase64:'synthetic-not-a-pdf'});await new Promise(r=>setTimeout(r,0));
 // checksum may be native async crypto; wait only for this fake API boundary.
 while(!finish)await new Promise(r=>setTimeout(r,1));
 const before=f.writes.length;f.ctx.user={id:'account-B'};f.ctx.token='fake-B';finish();await assert.rejects(pending,changed);assert.equal(f.writes.length,before);cases++;
}
const restored=fixture();await restored.api.queueRosterOffline({...payload,checksum:'fake-restored'});let finishRestored;restored.ctx.save=async()=>{await new Promise(r=>finishRestored=r);return{id:'fake-id'};};const oldSession=restored.api.syncPendingRosters();await Promise.resolve();restored.ctx.window.dispatchEvent(new Event('crewcheck:auth-will-change'));finishRestored();await assert.rejects(oldSession,changed);cases++;
const normal=fixture();await normal.api.queueRosterOffline({...payload,checksum:'fake-normal'});assert.equal((await normal.api.syncPendingRosters()).synced,1);assert.equal(normal.api.getPendingOfflineCount(),0);cases++;
const runtime=fs.readFileSync('client/src/lib/offlineRuntime.ts','utf8');const ast=ts.createSourceFile('runtime.ts',runtime,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='offlineRosterProvenance');assert(fn);const scope={exports:{},Date};vm.runInNewContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);const read=scope.exports.offlineRosterProvenance;
const record={owner:'account-A',selection:'explicit',cacheSchema:'p0-operational-date-anchor-v2',sourceFileName:'Synthetic saved publication',roster:payload.roster};
assert.equal(read('account-A',record).updatedAt,null,'undated legacy data must stay undated');assert.equal(read('account-B',record),null);assert.equal(read('',record),null);assert.equal(read('account-A',{...record,cleared:true}),null);assert.equal(read('account-A',{...record,selection:'automatic'}),null);assert.equal(read('account-A',{...record,updatedAt:'invalid'}).updatedAt,null);assert.equal(read('account-A',{...record,updatedAt:'2099-01-01T00:00:00Z'}).updatedAt,null);assert.equal(read('account-A',{...record,updatedAt:'2026-01-01T00:00:00Z'}).updatedAt,'2026-01-01T00:00:00.000Z');cases+=8;
console.log(`PASS ${cases} actual-source offline session/provenance cases: no stale writes/sends, old queue preserved, legacy dates unknown; synthetic storage/API only`);
