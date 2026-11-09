import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { repairSelectedDepartureContext } from './home-standby-departure/selected-context.mjs';
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
const parse=source=>ts.createSourceFile('fixture.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function functions(source,names){const ast=parse(source);return ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>'export '+n.getText(ast)).join('\n');}
function rawProjection(){
 const generator=fs.readFileSync('scripts/v14331/apply.mjs','utf8'),ast=parse(generator);let helpers;
 for(const stmt of ast.statements)if(ts.isVariableStatement(stmt))for(const d of stmt.declarationList.declarations)if(d.name.getText(ast)==='selectorHelpers'){assert(ts.isNoSubstitutionTemplateLiteral(d.initializer));helpers=d.initializer.text;}
 assert(helpers,'actual canonical selector template required');
 const input=helpers+'\nfunction Departure({ event, events, setView }: { event: ZeroLeg; events: ZeroLeg[]; setView: (v: ZeroView) => void }) { return null; }\n'+"{view === 'departure' && <Departure event={departureEvent} events={departureContext?.programId ? rosterEvents : events} setView={setView}/>}";
 const files=new Map([['client/src/pages/Home.tsx',input],['scripts/regression-v14-3-50-p0-activity-classification.mjs','']]);
 const fakeFs={readFileSync:p=>{assert(files.has(p),'unexpected source read '+p);return files.get(p);},writeFileSync:(p,v)=>{assert(files.has(p),'unexpected source write '+p);files.set(p,v);}};
 const code=fs.readFileSync(process.env.DEPARTURE_APPLY_SOURCE||'scripts/home-standby-departure/apply.mjs','utf8');
 vm.runInNewContext(compile(code),{exports:{},require:name=>{if(name==='node:fs')return fakeFs;if(name==='./selected-context.mjs')return {repairSelectedDepartureContext};throw Error('unexpected dependency '+name);}});
 const once=files.get('client/src/pages/Home.tsx');
 vm.runInNewContext(compile(code),{exports:{},require:name=>{if(name==='node:fs')return fakeFs;if(name==='./selected-context.mjs')return {repairSelectedDepartureContext};throw Error('unexpected dependency '+name);}});
 assert.equal(files.get('client/src/pages/Home.tsx'),once,'complete materializer is idempotent');
 return files.get('client/src/pages/Home.tsx');
}
const prepared=process.argv.includes('--prepared');
const source=prepared?fs.readFileSync(process.env.DEPARTURE_HOME_SOURCE||'client/src/pages/Home.tsx','utf8'):rawProjection();
const classification={},policy={};vm.runInNewContext(compile(fs.readFileSync('client/src/lib/scheduleActivityClassification.ts','utf8')),{exports:classification});vm.runInNewContext(compile(fs.readFileSync('client/src/lib/airportDeparturePolicy.ts','utf8')),{exports:policy,require:()=>classification});
const now='2034-01-10T12:00:00Z',RealDate=Date;class Clock extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return RealDate.parse(now);}}
const selected={};let mounts=[],navigated=[];
function AirportDeparture(){}function PlannedRosterDeparture(){}
vm.runInNewContext(compile(functions(source,['validDepartureClock','departureEventCode','isDepartureRestEvent','isDepartureEligibleEvent','nextDepartureEvent','departureEventForContext','Departure'])),{exports:selected,Date:Clock,getStoredUser:()=>null,isAirportDepartureEligible:policy.isAirportDepartureEligible,isHomeStandby:policy.isHomeStandby,departurePresentationDateTime:e=>new Clock(e.reportAt),eventStartDateTime:e=>new Clock(e.startAt),eventEndDateTime:e=>new Clock(e.endAt),noFutureLeg:()=>({id:'missing-selection',kind:'duty',placeholder:true}),React:{Fragment:'fragment',createElement:(type,props,...children)=>{if(type===AirportDeparture||type===PlannedRosterDeparture)mounts.push(props.event);return{type,props,children};}},AirportDeparture,PlannedRosterDeparture,Brand(){},Clock(){},Car(){}});
const text=n=>n==null?'':Array.isArray(n)?n.map(text).join(' '):typeof n==='object'?text(n.children):String(n);
const flight={id:'flight-A',kind:'flight',flightNumber:'QA100',origin:'GRU',destination:'REC',presentation:'11:00',departure:'12:00',reportAt:'2034-01-10T14:00:00Z',startAt:'2034-01-10T15:00:00Z',endAt:'2034-01-10T17:00:00Z',day:{type:'VOO'},canonical:{kind:'flight',code:'QA100',showPresentation:true}};
const connection={...flight,id:'connection-A',flightNumber:'QA200',origin:'REC',destination:'GRU',canonical:{...flight.canonical,code:'QA200',showPresentation:false}};
const standby={id:'standby-other',kind:'duty',flightNumber:'HSB',origin:'BSB',presentation:'06:00',departure:'06:00',reportAt:'2034-01-11T09:00:00Z',startAt:'2034-01-11T09:00:00Z',endAt:'2034-01-11T12:00:00Z',day:{type:'HSB'},canonical:{kind:'duty',code:'HSB'}};
const frozen=JSON.stringify([flight,connection,standby]);
function render(event,events,contextSelected){mounts=[];navigated=[];const node=selected.Departure({event,events,contextSelected,setView:v=>navigated.push(v)});return{node,value:text(node),mounts:[...mounts]};}
function choose(events,id){return selected.departureEventForContext(events,id?{programId:id}:null,new Clock(now));}
let cases=0;
const failed=choose([standby,connection,flight],connection.id);assert.equal(failed.placeholder,true,'existing selector still rejects a connection');
let result=render(failed,[standby,connection,flight],true);assert.equal(result.mounts.length,0);assert.ok(!result.value.includes('Sobreaviso em casa'),'explicit invalid connection cannot borrow another standby');assert.match(result.value,/programação selecionada|seleção/);assert.match(result.value,/Nenhuma saída foi calculada/);cases++;
result=render(choose([standby,flight],flight.id),[standby,flight],true);assert.equal(result.mounts[0],flight,'eligible selected event is passed through unchanged');cases++;
for(const events of [[],[standby],[standby,{...flight,id:'other-owner-flight'}],[standby,connection]]){result=render(choose(events,flight.id),events,true);assert.equal(result.mounts.length,0);assert.ok(!result.value.includes('Sobreaviso em casa'));cases++;}
result=render(choose([standby,flight],flight.id),[standby,flight],true);assert.equal(result.mounts[0],flight);result=render(choose([standby,{...flight,canonical:{...flight.canonical,showPresentation:false}}],flight.id),[standby],true);assert.equal(result.mounts.length,0);assert.ok(!result.value.includes('Sobreaviso em casa'),'reimported ineligible same id cannot revive the plan');cases++;
const expired={...flight,startAt:'2034-01-09T15:00:00Z'};assert.equal(choose([standby,expired],expired.id).placeholder,true);result=render(choose([standby,expired],expired.id),[standby],true);assert.equal(result.mounts.length,0);assert.ok(!result.value.includes('Sobreaviso em casa'));cases++;
const updated={...flight,presentation:'12:00',reportAt:'2034-01-10T15:00:00Z',startAt:'2034-01-10T16:00:00Z'};result=render(choose([updated],updated.id),[updated],true);assert.equal(result.mounts[0],updated);assert.equal(result.mounts[0].presentation,'12:00');cases++;
// Global navigation keeps the existing home-standby preview, without making it airport-eligible.
assert.equal(selected.isDepartureEligibleEvent(standby),false);result=render(choose([standby],null),[standby],false);assert.match(result.value,/Sobreaviso em casa/);assert.equal(result.mounts.length,0);cases++;
result=render(choose([],null),[],false);assert.ok(!result.value.includes('Sobreaviso em casa'));assert.equal(result.mounts.length,0);cases++;
const find=(n,p)=>Array.isArray(n)?n.flatMap(x=>find(x,p)):n&&typeof n==='object'?[...(p(n)?[n]:[]),...find(n.children,p)]:[];
result=render(failed,[standby],true);find(result.node,n=>n.type==='button')[0].props.onClick();assert.deepEqual(navigated,['roster']);cases++;
// Actual in-memory relay: session transitions remove the old contextual request.
const events=new EventTarget(),nav={};vm.runInNewContext(compile(fs.readFileSync('client/src/lib/navigationContext.ts','utf8')),{exports:nav,window:events});
for(const transition of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired']){nav.setPendingNavigationContext({sourceView:'roster',targetView:'departure',programId:flight.id,policy:'persistent-until-return'});assert.equal(nav.peekPendingNavigationContext('departure').programId,flight.id);events.dispatchEvent(new Event(transition));assert.equal(nav.peekPendingNavigationContext('departure'),null);cases++;}
nav.setPendingNavigationContext({sourceView:'roster',targetView:'departure',programId:flight.id,policy:'persistent-until-return'});const ctx=nav.peekPendingNavigationContext('departure');result=render(choose([standby],ctx.programId),[standby],true);assert.equal(result.mounts.length,0);assert.ok(!result.value.includes('Sobreaviso em casa'));nav.clearPendingNavigationContext();assert.equal(nav.peekPendingNavigationContext(),null);cases++;
assert.equal(JSON.stringify([flight,connection,standby]),frozen,'source clocks, eligibility inputs and airport identities unchanged');
assert.equal(repairSelectedDepartureContext(source),source,'candidate repair is idempotent');assert.throws(()=>repairSelectedDepartureContext(source.replace('contextSelected={Boolean(departureContext?.programId)}','contextSelected={false}')),/unknown or partial/);
assert.ok(source.includes('contextSelected={Boolean(departureContext?.programId)}'),'actual Home entry forwards explicit selection authority');
console.log(`PASS selected departure fallback:${cases} synthetic scenarios; ${prepared?'actual prepared wrapper/selector':'actual raw materializer and canonical selector'}; TZ=${process.env.TZ||'default'}; no providers, route components instrumented, no physical claim`);
