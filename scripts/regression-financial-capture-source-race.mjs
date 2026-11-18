// Execute the actual component with a controlled hook scheduler, deferred promises
// and a transport spy. No browser, account, server, payment or network writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const root=path.resolve(process.env.FINANCIAL_SOURCE_ROOT||'.'),require=createRequire(root+'/package.json');
const ts=require('typescript'),React=require('react');
const source=fs.readFileSync(root+'/client/src/components/finance/CanonicalForecastCapture.tsx','utf8');
const ast=ts.createSourceFile('CanonicalForecastCapture.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='CanonicalForecastCapture');assert.ok(fn);
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve}};
const elements=node=>!node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(elements)];
const button=(tree,text)=>elements(tree).find(node=>node.type==='button'&&String(node.props.children).includes(text));
const initial={complete:true,rows:[],coveredDays:['2032-08-15'],range:{start:'2032-08-15',end:'2032-08-15'},crewId:'SYNTHETIC',airline:'LA',flights:[]};
function harness(){
 const hooks=[],effects=[],writes=[],stateWrites=[];let index=0,props=structuredClone(initial),account=0,construct=async()=>({synthetic:true}),respond=async()=>({ok:true,source:{synthetic:true},reviewDigest:'synthetic-only',count:0,pendingDates:0,pendingAmounts:0});
 const context=vm.createContext({React,
  useState:initial=>{const slot=index++;if(!(slot in hooks))hooks[slot]=initial;return[hooks[slot],value=>{hooks[slot]=typeof value==='function'?value(hooks[slot]):value;stateWrites.push(slot)}]},
  useRef:initial=>{const slot=index++;if(!(slot in hooks))hooks[slot]={current:initial};return hooks[slot]},
  useEffect:(callback,deps)=>{const slot=index++,old=hooks[slot];if(!old||deps.some((value,i)=>!Object.is(value,old.deps[i]))){effects.push(()=>{old?.cleanup?.();const cleanup=callback();hooks[slot]={deps,cleanup}})}},
  canonicalBrlCycleKeys:()=>[],canonicalBrlCycleThursday:()=>null,canonicalAllowanceCapture:()=>construct(),
  authFetch:async(route,options)=>{const request={route,...JSON.parse(options.body)};writes.push(request);return respond(request)},
  captureAuthSession:()=>{const captured=account;return{isCurrent:()=>captured===account}},getStoredUser:()=>({email:`synthetic${account}@example.invalid`,id:`synthetic${account}`}),getToken:()=>`synthetic-local-${account}`,
 });
 vm.runInContext(ts.transpileModule(fn.getText(ast).replace('export default ','')+'\nglobalThis.component=CanonicalForecastCapture;',{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,context);
 const render=(next=props,flush=true)=>{props=next;index=0;let tree=context.component(props);if(flush&&effects.length){effects.splice(0).forEach(effect=>effect());index=0;tree=context.component(props)}return tree};
 const prepare=async()=>{let tree=render();elements(tree).find(node=>node.type==='input'&&node.props['aria-label']==='Referência da revisão financeira').props.onChange({target:{value:'SYNTHETIC REVIEW'}});tree=render();elements(tree).find(node=>node.type==='input'&&node.props.type==='checkbox').props.onChange({target:{checked:true}});tree=render();await button(tree,'Preparar revisão').props.onClick();return render()};
 return{render,prepare,writes,stateWrites,setConstruct:fn=>construct=fn,setRespond:fn=>respond=fn,switchAccount:()=>account++,unmount:()=>hooks.forEach(hook=>hook?.cleanup?.()),get props(){return props}};
}
let cases=0;
{
 const h=harness(),tree=await h.prepare(),staleSave=button(tree,'Confirmar gravação').props.onClick;
 h.render({...h.props,complete:false},false);await staleSave();assert.equal(h.writes.filter(write=>write.action==='capture').length,0,'old rendered save handler must recheck current source before any transport');cases++;
}
{
 const h=harness(),tree=await h.prepare(),staleSave=button(tree,'Confirmar gravação').props.onClick;
 h.render({...h.props,range:{start:'2032-08-16',end:'2032-08-16'}},false);await staleSave();assert.equal(h.writes.filter(write=>write.action==='capture').length,0,'same completeness but different source selection invalidates review');cases++;
}
{
 const h=harness(),tree=await h.prepare(),staleSave=button(tree,'Confirmar gravação').props.onClick;
 h.render({...h.props,complete:false});const restored=h.render({...h.props,complete:true});await staleSave();assert.equal(h.writes.filter(write=>write.action==='capture').length,0);assert.equal(button(restored,'Confirmar gravação'),undefined,'restored completeness cannot resurrect prior review');cases++;
}
{
 const h=harness(),wait=deferred();h.setConstruct(()=>wait.promise);const preparing=h.prepare();await Promise.resolve();h.render({...h.props,complete:false});wait.resolve({synthetic:true});await preparing;assert.equal(h.writes.length,0,'source change during async construction prevents preview transport');cases++;
}
{
 const h=harness(),wait=deferred();h.setRespond(()=>wait.promise);const preparing=h.prepare();await Promise.resolve();await Promise.resolve();h.render({...h.props,complete:false});wait.resolve({ok:true,source:{synthetic:true},reviewDigest:'old'});await preparing;assert.equal(button(h.render(),'Confirmar gravação'),undefined,'old preview response cannot publish a review');cases++;
}
{
 const h=harness(),tree=await h.prepare(),save=button(tree,'Confirmar gravação').props.onClick;h.switchAccount();await save();assert.equal(h.writes.filter(write=>write.action==='capture').length,0,'account fence preserved');cases++;
}
{
 const h=harness(),wait=deferred();h.setRespond(()=>wait.promise);const preparing=h.prepare();await Promise.resolve();await Promise.resolve();h.switchAccount();wait.resolve({ok:true,source:{synthetic:true},reviewDigest:'old-account'});await preparing;assert.equal(button(h.render(),'Confirmar gravação'),undefined);assert.equal(button(h.render(),'Preparar revisão').props.disabled,false,'stale-account completion releases only its own local busy lock');cases++;
}
{
 const h=harness(),tree=await h.prepare(),wait=deferred();h.setRespond(()=>wait.promise);const save=button(tree,'Confirmar gravação').props.onClick,first=save(),second=save();assert.equal(h.writes.filter(write=>write.action==='capture').length,1,'same rendered handler cannot double-submit');wait.resolve({ok:true});await Promise.all([first,second]);assert.equal(button(h.render(),'Confirmar gravação'),undefined);cases++;
}
{
 const h=harness(),tree=await h.prepare(),wait=deferred();h.setRespond(()=>wait.promise);const saving=button(tree,'Confirmar gravação').props.onClick();h.render({...h.props,complete:false});const before=h.stateWrites.length;wait.resolve({ok:true});await saving;assert.equal(h.stateWrites.length,before,'old save response cannot clear/update newer source state');cases++;
}
{
 const h=harness(),wait=deferred();h.setRespond(()=>wait.promise);const preparing=h.prepare();await Promise.resolve();await Promise.resolve();h.unmount();const before=h.stateWrites.length;wait.resolve({ok:true,source:{synthetic:true},reviewDigest:'unmounted'});await preparing;assert.equal(h.stateWrites.length,before,'unmounted preview cannot update state');cases++;
}
{
 const h=harness(),tree=await h.prepare(),wait=deferred();h.setRespond(()=>wait.promise);const saving=button(tree,'Confirmar gravação').props.onClick();button(tree,'Cancelar revisão').props.onClick();wait.resolve({ok:true});await saving;const current=h.render();assert.equal(button(current,'Confirmar gravação'),undefined);assert.equal(button(current,'Preparar revisão').props.disabled,false,'late Cancel cannot strand an already-submitted operation');assert.equal(h.writes.filter(write=>write.action==='capture').length,1);cases++;
}
{
 const h=harness(),tree=await h.prepare(),save=button(tree,'Confirmar gravação').props.onClick;button(tree,'Cancelar revisão').props.onClick();h.render();await save();assert.equal(h.writes.filter(write=>write.action==='capture').length,0,'a canceled review cannot be submitted through its old handler');cases++;
}
{
 const h=harness(),tree=await h.prepare(),save=button(tree,'Confirmar gravação').props.onClick;await save();h.render();await save();assert.equal(h.writes.filter(write=>write.action==='capture').length,1,'a successfully consumed review cannot be resubmitted through its old handler');cases++;
}
{
 const h=harness(),tree=await h.prepare();let attempt=0;h.setRespond(async()=>{if(!attempt++)throw Error('synthetic uncertain transport');return{ok:true}});await button(tree,'Confirmar gravação').props.onClick();const retry=button(h.render(),'Confirmar gravação');assert.ok(retry,'uncertain failure preserves same review for an authorized idempotent retry');await retry.props.onClick();assert.equal(h.writes.filter(write=>write.action==='capture').length,2);assert.equal(h.writes[1].reviewDigest,h.writes[2].reviewDigest);cases++;
}
{
 const h=harness(),tree=await h.prepare(),oldPreview=button(tree,'Preparar revisão').props.onClick;h.render({...h.props,range:{start:'2032-08-16',end:'2032-08-16'}});const before=h.writes.length;await oldPreview();assert.equal(h.writes.length,before,'an old preview handler cannot rebuild stale props under a newer source epoch');cases++;
}
console.log(`PASS ${cases} actual capture deferred-flow scenarios; controlled hooks, local stubs, zero real transport`);
