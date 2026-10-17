import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as plan from '../shared/stay-edit-plan.mjs';
import * as presentation from '../shared/stay-time-presentation.mjs';
import { emptyStayEditor, readStayEditor, writeStayEditor } from '../shared/stay-editor-store.mjs';
import { createStayAlarmController } from '../shared/stay-alarm-adapter.mjs';
import { createStayHostRuntime } from '../shared/stay-alarm-host-runtime.mjs';
const require = createRequire(process.env.COMPOSITION_DEPS_PACKAGE || import.meta.url);
const ts = require('typescript');
const jsx = require('react/jsx-runtime');
const now = Date.parse('2030-10-10T18:00:00Z');
class Clock extends Date { static now() { return now; } }
const compile = source => ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
const previewPath='client/src/components/v1391/StayHotelAlarmPreview.tsx';
const compiled=compile(fs.readFileSync(previewPath,'utf8'));
assert.equal(compiled.diagnostics.length,0);
const module={exports:{}};
vm.runInNewContext(compiled.outputText,{module,exports:module.exports,Date:Clock,Intl,require:name=> name==='react/jsx-runtime'?jsx:name==='@shared/stay-edit-plan.mjs'?plan:presentation});
const Preview=module.exports.default;
function nodes(element) { if(!element||typeof element!=='object')return [];return [element,...[element.props?.children].flat(Infinity).flatMap(nodes)]; }
const text=element=>typeof element==='string'?element:element?.props?[element.props.children].flat(Infinity).map(text).join(''):'';
const base={eventId:'synthetic-stay',hotelApzIso:'2030-10-11T08:30:00Z',timeZone:'America/Fortaleza',defaultLeadMinutes:90,defaultWithoutBreakfastMinutes:60,breakfastPlan:'with',onBreakfastPlan:()=>{},onChoice:()=>{},nativeTestReady:true};
function preview(patch={}) { const sent=[];const tree=Preview({...base,onProgram:(...v)=>sent.push(v),...patch});const button=nodes(tree).find(n=>n.type==='button'&&text(n)==='Confirmar tentativa de notificação neste aparelho');return {tree,button,sent}; }
const managerPath='client/src/components/v1391/PresentationStayManagerView.tsx';
const manager=fs.readFileSync(managerPath,'utf8');
const ast=ts.createSourceFile(managerPath,manager,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length,0);
let program;
function walk(node) { if(ts.isJsxAttribute(node)&&node.name.text==='onProgram')program=node.initializer.expression.getText(ast);ts.forEachChild(node,walk); }
walk(ast);assert.ok(program);
function programHandler(context) { const m={exports:{}};vm.runInNewContext(compile('module.exports=('+program+');').outputText,{module:m,exports:m.exports,Date:Clock,...context});return m.exports; }
function hostFixture() {
 let account='synthetic-account',token='synthetic-token',ready=false;const listeners=new Set(),jobs=new Map(),messages=[];let revision=0;
 const port={addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn),postMessage:raw=>{
  const envelope=JSON.parse(raw);messages.push(envelope);queueMicrotask(()=>{
   let state,payload;
   if(envelope.action==='authenticate'){state='verified';payload=JSON.stringify({protocol:'crewcheck-stay-alarm-v1',featureEnabled:true,atomicReplace:true,acknowledgedCancel:true,deliveryConfirmed:false,ownerId:account,ownerEpoch:'synthetic-epoch',permissionGranted:true});}
   else if(envelope.action==='revoke'){state='revoked';}
   else {state='ok';const r=JSON.parse(envelope.payload);let status=jobs.has(r.key)?'scheduled':'not-programmed';if(r.action==='replace'){jobs.set(r.key,r);status='scheduled';revision++;}if(r.action==='cancel'){jobs.delete(r.key);status='cancelled';revision++;}payload=JSON.stringify({...r,state:status,revision,deliveryConfirmed:false,...(r.action==='inspect'?{}:{acknowledgement:'native-api-and-journal-completed'})});}
   listeners.forEach(fn=>fn({data:JSON.stringify({id:envelope.id,state,payload})}));
  });
 }};
 const runtime=createStayHostRuntime({port,readAccount:()=>account,readToken:()=>token,onState:v=>{ready=v;},setTimer:()=>1,clearTimer:()=>{}});
 return {runtime,jobs,messages,logout(){account=null;token=null;},ready:()=>ready};
}
test('actual preview keeps native instants while display timezone changes and uses explicit breakfast choice',()=>{
 for(const zone of ['UTC','Asia/Tokyo','America/Manaus']) {const p=preview({displayTimeZone:zone});assert.ok(p.button);assert.deepEqual(p.sent,[]);p.button.props.onClick();assert.deepEqual(p.sent,[['2030-10-11T07:00:00.000Z','2030-10-11T08:30:00.000Z']]);}
 const noBreakfast=preview({breakfastPlan:'without'});noBreakfast.button.props.onClick();assert.equal(noBreakfast.sent[0][0],'2030-10-11T07:30:00.000Z');
 assert.equal(preview({breakfastPlan:'unknown'}).button,undefined);
 assert.equal(preview({nativeTestReady:false}).button,undefined);
 assert.equal(preview({hotelApzIso:''}).button,undefined);
});
test('real manager confirmation schedules via real controller/host; cancellation stays cancelled after persistence and display changes',async()=>{
 const f=hostFixture();await f.runtime.authenticate();const controller=createStayAlarmController(f.runtime),toasts=[];
 let current=true,cancelled=false;const epoch={current:0};
 const handler=()=>programHandler({editorSessionCurrent:()=>current,toast:{info:v=>toasts.push(v)},editSession:epoch,alarmController:{current:controller},nativeHost:{current:f.runtime},stayEditorAccount:()=> 'synthetic-account',selected:{id:'synthetic-stay'},apzConfirmed:true,alarmCancelled:cancelled,alarmChoice:undefined});
 const p=preview({onProgram:handler()});await p.button.props.onClick();assert.equal(f.jobs.size,1);
 assert.equal(f.jobs.values().next().value.alarmAt,'2030-10-11T07:00:00.000Z');
 assert.equal((await controller.cancel({accountId:'synthetic-account',eventId:'synthetic-stay'})).state,'cancelled');cancelled=true;assert.equal(f.jobs.size,0);
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 writeStayEditor(storage,'synthetic-account',{...emptyStayEditor('synthetic-account'),stays:{'synthetic-stay':{eventId:'synthetic-stay',signature:'r1',draft:{hotelName:'Synthetic'},timeZone:'America/Manaus',apzDate:'2030-10-11',apzConfirmed:true,apzSource:'manual',alarmState:'cancelled',breakfastPlan:'with'}}});
 const before=readStayEditor(storage,'synthetic-account');writeStayEditor(storage,'synthetic-account',{...before,timeZonePreference:{source:'utc'}});assert.equal(readStayEditor(storage,'synthetic-account').stays['synthetic-stay'].alarmState,'cancelled');
 await preview({displayTimeZone:'UTC',onProgram:handler()}).button.props.onClick();assert.equal(f.jobs.size,0);
 current=false;await handler()('2030-10-11T07:00:00Z','2030-10-11T08:30:00Z');assert.equal(f.jobs.size,0);assert.match(toasts.at(-1),/conta mudou/);
});
test('revoked session cannot program from an old preview and source pickup local fields survive display preference persistence',async()=>{
 const f=hostFixture();await f.runtime.authenticate();const controller=createStayAlarmController(f.runtime);await f.runtime.revoke();
 const result=await controller.replace({accountId:'synthetic-account',eventId:'synthetic-stay',confirmed:true,apzConfirmed:true,permission:'granted',alarmAt:'2030-10-11T07:00:00Z',hotelReportAt:'2030-10-11T08:30:00Z',now});assert.notEqual(result.state,'scheduled');assert.equal(f.jobs.size,0);
 const pickup=presentation.normalizePickupLocal({date:'2030-10-11',clock:'00:30',timeZone:'America/Manaus'}),original=JSON.stringify(pickup);
 for(const source of ['utc','base','manual','local']) {presentation.presentPickup(pickup,{source,manualZone:'Asia/Tokyo'},{localZone:'America/Fortaleza',baseZone:'America/Fortaleza'});assert.equal(JSON.stringify(pickup),original);}
 assert.equal(pickup.instant,'2030-10-11T04:30:00.000Z');
});
test('combined editor retains operational invalidation dependencies while display preference remains separate; native flags stay OFF',()=>{
 const effects=[];function scan(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes('nativeHost.current?.invalidate()'))effects.push(n.arguments[1].elements.map(e=>e.getText(ast)));ts.forEachChild(n,scan);}scan(ast);
 assert.equal(effects.length,1);for(const dep of ['hotelTimeZone','alarmChoice','defaultLead','defaultWithoutBreakfast','breakfastPlan','apzConfirmed'])assert.ok(effects[0].includes(dep));assert.ok(!effects[0].includes('displayPreference'));
 const native=fs.readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/StayAlarmHostAndroid.java','utf8');assert.match(native,/PREPARED_HOST_ENABLED=false/);assert.match(native,/PREPARED_OVERNIGHT_LEASE_ENABLED=false/);
});
