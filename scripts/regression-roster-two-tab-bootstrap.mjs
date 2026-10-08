import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { newestImports, startupCanCommit } from '../shared/rosterStartup.mjs';
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
class CustomEvent extends Event { constructor(type,opts={}){super(type);this.detail=opts.detail;} }
class StorageEvent extends Event { constructor(key,newValue){super('storage');this.key=key;this.newValue=newValue;} }
const source=fs.readFileSync('client/src/pages/Home.tsx','utf8');
const ast=ts.createSourceFile('Home.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
let body;
function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]&&ts.isArrowFunction(node.arguments[0])&&node.arguments[0].body.getText(ast).includes('A escala ativa pertence'))body=node.arguments[0].body.getText(ast);ts.forEachChild(node,visit);}
visit(ast);assert.ok(body);
const helperSource=compile(fs.readFileSync('client/src/lib/rosterStartup.ts','utf8'));
const automaticRoster={days:[{id:'synthetic-automatic'}]};
const empty=()=>({roster:{days:[]},compliance:null,source:'empty'});
function harness(deferred=false){
 const values=new Map(),tabs=[],events=[],pending=[];
 const counts={reads:0,snapshotAttempts:0,snapshotChanges:0};let nonce=0;
 for(const name of ['A','B']){
  const bus=new EventTarget();
  const window={addEventListener:bus.addEventListener.bind(bus),removeEventListener:bus.removeEventListener.bind(bus),dispatchEvent:bus.dispatchEvent.bind(bus)};
  const localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>{
   if(key==='crewcheck_roster_choice_v1_synthetic-user')counts.snapshotAttempts++;
   // Browser semantics: identical serialization does not generate a storage event.
   if(values.get(key)===value)return;
   values.set(key,value);if(key==='crewcheck_roster_choice_v1_synthetic-user')counts.snapshotChanges++;
   for(const other of tabs)if(other.name!==name)events.push(()=>other.window.dispatchEvent(new StorageEvent(key,value)));
  }};
  const auth={getStoredUser:()=>({id:'synthetic-user'}),getToken:()=> 'synthetic-session'};
  const helper={};vm.runInNewContext(helperSource,{exports:helper,require:n=>n==='./authClient'?auth:{newestImports},localStorage,window,CustomEvent,crypto:{randomUUID:()=>String(++nonce)}});
  const bundleRef={current:empty()},choiceRevision={current:0};
  const context={exports:{},...helper,...auth,window,StorageEvent,CustomEvent,bundleRef,choiceRevision,startupCanCommit,
   setStartupStatus:value=>{tab.status=value;},restoreLatestImport:()=>{counts.reads++;return deferred?new Promise(resolve=>pending.push({name,resolve})):Promise.resolve({roster:automaticRoster,source:'synthetic.json'});},analyzeSafe:()=>({alerts:[]}),
   saveRoster:(roster,source,selection)=>localStorage.setItem(helper.startupKey(),JSON.stringify({owner:'synthetic-user',roster,sourceFileName:source,selection,cacheSchema:'p0-operational-date-anchor-v2'})),
   setBundle:next=>{choiceRevision.current++;bundleRef.current=next;},setBundleState:next=>{bundleRef.current=next;},
   loadRoster:()=>{const p=JSON.parse(localStorage.getItem(helper.startupKey())||'null');return p?.roster?.days?.length&&!p.cleared&&p.selection!=='automatic'?{roster:p.roster,source:'explicit',compliance:null}:empty();},
  };
  const tab={name,window,helper,localStorage,bundleRef,choiceRevision,status:null,context};tabs.push(tab);
  vm.runInNewContext(compile('export function setup() '+body),context);
 }
 for(const tab of tabs)tab.cleanup=tab.context.exports.setup();
 return {tabs,counts,pending,events,deliver:()=>{while(events.length)events.shift()();},close:()=>tabs.forEach(t=>t.cleanup())};
}
if(!process.argv.includes('--explicit-only')){
 const h=harness();
 for(let turn=0;turn<8;turn++){await new Promise(setImmediate);h.deliver();}
 assert.equal(h.events.length,0);
 assert.equal(h.counts.reads,2,'two independent account bootstraps; automatic persistence must not trigger another read');
 assert.equal(h.counts.snapshotAttempts,2);
 assert.equal(h.counts.snapshotChanges,1,'identical automatic serializations generate just one effective change');
 for(const tab of h.tabs){assert.equal(tab.status,'ready');assert.equal(tab.bundleRef.current.roster.days[0].id,'synthetic-automatic');}
 h.close();
 console.log('PASS: native identical-write semantics; initial two-tab bootstrap bounded at 2 reads / 2 snapshot attempts / 1 effective write.');
}
const h=harness(true),[a,b]=h.tabs;
assert.equal(h.counts.reads,2);
const explicit=b.helper.beginRosterChoice();
// Resolve the older requests before delivering A's storage notification. Shared
// intent revision must reject them without relying on event delivery timing.
h.pending[0].resolve({roster:automaticRoster,source:'synthetic.json'});
h.pending[1].resolve({roster:automaticRoster,source:'synthetic.json'});
await new Promise(setImmediate);
assert.equal(h.counts.snapshotAttempts,0,'older automatic reads must not commit after a newer shared explicit intent');
h.deliver();
assert.equal(h.pending.length,3,'A may reconcile its own account after seeing B intent');
h.pending[2].resolve({roster:automaticRoster,source:'synthetic.json'});
await new Promise(setImmediate);
assert.equal(h.counts.snapshotAttempts,1);
h.deliver();
assert.equal(explicit(),true,'A automatic cache notification must not cancel B newer explicit PDF/history choice');
assert.equal(b.bundleRef.current.roster.days.length,0,'automatic notification must not overwrite the pending explicit choice');
assert.equal(h.counts.reads,3,'automatic cache notification must not restart B account read');
const explicitRoster={days:[{id:'synthetic-explicit-pdf'}]};
b.context.saveRoster(explicitRoster,'synthetic-user.pdf','explicit');
b.context.setBundle({roster:explicitRoster,source:'synthetic-user.pdf',compliance:{alerts:[]}});
explicit.finish();h.deliver();
assert.equal(a.bundleRef.current.roster.days[0].id,'synthetic-explicit-pdf');
assert.equal(b.bundleRef.current.roster.days[0].id,'synthetic-explicit-pdf');
assert.equal(h.counts.reads,3,'completed explicit selection must propagate without an automatic re-import');
b.helper.markStartupCleared();h.deliver();
assert.equal(explicit(),false);
assert.equal(a.bundleRef.current.roster.days.length,0);
assert.equal(b.bundleRef.current.roster.days.length,0);
assert.equal(h.counts.reads,3,'clear must still propagate without silent restoration');
h.close();
console.log('PASS: actual two-tab automatic-vs-explicit ordering; delayed-event generation guard; pending B choice survives A automatic write; explicit success and clear propagate.');
