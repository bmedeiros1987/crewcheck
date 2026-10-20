import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { newestImports, startupCanCommit } from '../shared/rosterStartup.mjs';
const compile = source => ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
class CustomEvent extends Event { constructor(type, options={}) { super(type); this.detail=options.detail; } }
class StorageEvent extends Event { constructor(key) { super('storage'); this.key=key; } }
const bus = new EventTarget();
const window = {addEventListener:bus.addEventListener.bind(bus),removeEventListener:bus.removeEventListener.bind(bus),dispatchEvent:bus.dispatchEvent.bind(bus)};
const data = new Map();
const localStorage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
const auth={getStoredUser:()=>({id:'synthetic-user'}),getToken:()=> 'synthetic-session'};
let nonce=0;
const helper={};
vm.runInNewContext(compile(fs.readFileSync('client/src/lib/rosterStartup.ts','utf8')),{exports:helper,require:name=>name==='./authClient'?auth:{newestImports},localStorage,window,CustomEvent,crypto:{randomUUID:()=>String(++nonce)}});
const source=fs.readFileSync('client/src/pages/Home.tsx','utf8');
const ast=ts.createSourceFile('Home.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
let body;
function visit(node) {
 if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]&&ts.isArrowFunction(node.arguments[0])&&node.arguments[0].body.getText(ast).includes('A escala ativa pertence')) body=node.arguments[0].body.getText(ast);
 ts.forEachChild(node,visit);
}
visit(ast); assert.ok(body,'prepared startup lifecycle must exist');
let status, restores=0, saved=0, firstResolve;
const empty=()=>({roster:{days:[]},compliance:null,source:'empty'});
const bundleRef={current:empty()},choiceRevision={current:0};
const runtime={};
vm.runInNewContext(compile('export function setup() '+body),{
 exports:runtime,...helper,...auth,window,StorageEvent,CustomEvent,bundleRef,choiceRevision,startupCanCommit,
 setStartupStatus:value=>{status=value;},
 restoreLatestImport:()=>{restores++;return restores===1?new Promise(resolve=>{firstResolve=resolve;}):Promise.resolve(null);},
 analyzeSafe:()=>({alerts:[]}),saveRoster:()=>{saved++;},setBundle:next=>{choiceRevision.current++;bundleRef.current=next;},setBundleState:next=>{bundleRef.current=next;},
 loadRoster:()=>{const payload=JSON.parse(data.get(helper.startupKey())||'null');return payload?.roster?.days?.length&&!payload.cleared?{roster:payload.roster,source:'foreign-tab-selection',compliance:null}:empty();},
});
const cleanup=runtime.setup();
assert.equal(status,'loading');
const failedChoice=helper.beginRosterChoice();
assert.equal(failedChoice(),true);
failedChoice.finish();
await new Promise(setImmediate);
assert.equal(restores,2,'failed explicit choice must restart invalidated startup');
assert.equal(status,'empty','successful empty response settles loading');
firstResolve({roster:{days:[{date:'synthetic'}]},source:'obsolete-remote'});
await new Promise(setImmediate);
assert.equal(saved,0,'old slow startup must never overwrite the latest generation');
const pendingTabA=helper.beginRosterChoice();
data.set(helper.startupKey(),JSON.stringify({owner:'synthetic-user',roster:{days:[{id:'newer-tab-b'}]}}));
window.dispatchEvent(new StorageEvent(helper.startupKey()));
assert.equal(pendingTabA(),false,'storage event invalidates explicit reads, not only startup reads');
assert.equal(bundleRef.current.roster.days[0].id,'newer-tab-b');
const beforeClear=helper.beginRosterChoice();
const callsBeforeClear=restores;
helper.markStartupCleared();
assert.equal(beforeClear(),false);
assert.equal(bundleRef.current.roster.days.length,0);
assert.equal(restores,callsBeforeClear,'clear must not silently restore history');
const failedAfterClear=helper.beginRosterChoice();
failedAfterClear.finish();
await new Promise(setImmediate);
assert.equal(restores,callsBeforeClear,'failed choice after explicit clear must preserve clear intent');
assert.equal(status,'ready','clear state must settle without a pending spinner');
const pendingBeforeForeignIntent=helper.beginRosterChoice();
data.set(helper.startupKey()+'_intent_epoch','other-tab-intent');
assert.equal(pendingBeforeForeignIntent(),false,'foreign intent invalidates reads even before storage event delivery');
cleanup();
console.log('PASS: actual prepared lifecycle settles failed choices, rejects same-account cross-tab reads and preserves clear intent; no HTTP or real data.');
