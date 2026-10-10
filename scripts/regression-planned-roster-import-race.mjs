import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import * as startupShared from '../shared/rosterStartup.mjs';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
globalThis.sessionStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};globalThis.window=new EventTarget();window.setTimeout=setTimeout;
const modules=loadClientModules({files:['client/src/lib/plannedRosterStore.ts'],prefix:'synthetic-import-race-'});
try{
 const store=modules.load('plannedRosterStore'),auth=modules.load('financialStatementLearning'),comparison=modules.load('rosterComparison');
 const startupScope=vm.createContext({exports:{},window,localStorage,crypto,CustomEvent,require:name=>name==='@shared/rosterStartup.mjs'?startupShared:modules.load('authClient')});
 vm.runInContext(ts.transpileModule(fs.readFileSync('client/src/lib/rosterStartup.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,startupScope);
 const ast=ts.createSourceFile('Home.tsx',fs.readFileSync(process.env.CREWCHECK_IMPORT_HOME||'client/src/pages/Home.tsx','utf8'),99,true,4);
 const named=['loadPlannedRoster','savePlannedRoster','preservePlannedRosterBeforeImport'];const funcs=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&named.includes(n.name?.text));assert.equal(funcs.length,3);
 let handler;function walk(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='handleFile'&&n.parameters[0]?.name?.getText(ast)==='inputEvent')handler=n;ts.forEachChild(n,walk);}walk(ast);assert.ok(handler);
 const session=(owner,token='synthetic-'+owner)=>{if(owner){localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:owner,role:'user'}));localStorage.setItem('crewcheck_auth_token',token);}else{localStorage.removeItem('crewcheck_auth_user');localStorage.removeItem('crewcheck_auth_token');}window.dispatchEvent(new Event('crewcheck:auth-changed'));};
 const roster={year:2032,month:10,crewId:'900001',base:'BSB',rank:'CC',rawText:'SYNTHETIC',days:[{date:'10/10/2032',type:'ASB',pairingCode:'ASB',dutyReport:'04:10',dutyDebrief:'10:10',legs:[]}]};
 const incoming={...roster,days:[{...roster.days[0],dutyReport:'05:10'}]};const captured={roster,source:'SYNTHETIC PRIVATE A'};
 let writes=[],parseResolve,confirmResolve;
 const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
 const scope=vm.createContext({...store,...auth,...comparison,console,Date,Intl,window,localStorage,sessionStorage,Event,CustomEvent,setTimeout,
  bundle:captured,publicationOwner:()=>auth.financialRateOwner(),currentPublicationReview:()=>null,...startupScope.exports,
  parsePDFResilient:()=>new Promise(r=>parseResolve=r),confirmRosterImport:()=>({ok:true,hasFuture:true}),
  setBusy:()=>{},toast:new Proxy({}, {get:()=>()=>{}}),saveRoster:()=>{writes.push('roster');return{};},
  storage:{set:()=>writes.push('storage')},setBundle:()=>writes.push('bundle'),recordPublication:async()=>{writes.push('publication');return true;},
  buildCanonicalRosterEvents:()=>[],normalizeRosterDays:x=>x,recomputeComplianceWithRegulatoryHistory:async()=>({compliance:{}}),getGymRecommendations:()=>[],
  publishCrewCheckNotice:()=>writes.push('notice'),syncRosterWithTelegramConcierge:async()=>{writes.push('telegram');},syncPlatformRoster:async()=>{writes.push('platform');},saveRosterAnalysis:async()=>{writes.push('analysis');},
  fileRef:{current:{value:''}},setView:()=>writes.push('view'),setLocation:()=>writes.push('location'),sanitizePdfImportError:String});
 vm.runInContext(ts.transpileModule(funcs.map(n=>n.getText(ast)).join('\n')+'\n'+handler.getText(ast)+'\nglobalThis.subject={preservePlannedRosterBeforeImport,handleFile};',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,scope);
 const start=()=>scope.subject.handleFile({target:{files:[{name:'SYNTHETIC.pdf'}]}});
 // Independent counterproof: no implicit session can authorize a captured bundle.
 session('SYN-A');const capturedSession=auth.financialRateSession();store.saveOwnedPlannedRoster(roster,'SYNTHETIC A');const originalA=localStorage.getItem(store.plannedRosterKey('SYN-A'));
 session('SYN-C');assert.equal(scope.subject.preservePlannedRosterBeforeImport(captured,incoming),null);assert.equal(scope.subject.preservePlannedRosterBeforeImport(captured,incoming,capturedSession),null);assert.equal(localStorage.getItem(store.plannedRosterKey('SYN-C')),null);assert.equal(localStorage.getItem(store.plannedRosterKey('SYN-A')),originalA);
 for(const scenario of ['account','logout','token','roundtrip']){
  values.clear();writes=[];session('SYN-A');const pending=start();const release=parseResolve;
  if(scenario==='account')session('SYN-B');if(scenario==='logout')session(null);if(scenario==='token')session('SYN-A','rotated-token');if(scenario==='roundtrip'){session('SYN-B');session('SYN-A');}
  release({roster:incoming,source:'local'});await pending;assert.deepEqual(writes,[],scenario+' during parsing rejected before any write, comparison publication or notification');assert.equal(localStorage.getItem(store.plannedRosterKey('SYN-B')),null);
 }
 if(handler.getText(ast).includes('await confirmRosterImport')){
  for(const scenario of ['account','logout','token']){
   values.clear();writes=[];session('SYN-A');const confirm=deferred();scope.confirmRosterImport=()=>confirm.promise;const pending=start();parseResolve({roster:incoming,source:'local'});await new Promise(r=>setImmediate(r));
   if(scenario==='account')session('SYN-B');if(scenario==='logout')session(null);if(scenario==='token')session('SYN-A','rotated-token');confirm.resolve({ok:true,hasFuture:true});await pending;assert.deepEqual(writes,[],scenario+' while confirmation open rejected before writes');
  }
 }
 scope.confirmRosterImport=()=>({ok:true,hasFuture:true});values.clear();writes=[];session('SYN-A');
 const first=start(),firstResolve=parseResolve;const second=start(),secondResolve=parseResolve;secondResolve({roster:incoming,source:'local'});await second;
 assert.ok(writes.includes('roster'),'latest import commits');const afterSecond=[...writes];firstResolve({roster:{...incoming,rawText:'SYNTHETIC OLDER IMPORT'},source:'local'});await first;assert.deepEqual(writes,afterSecond,'older concurrent import cannot write');assert.equal(store.loadOwnedPlannedRoster().source,'SYNTHETIC PRIVATE A');
 console.log('PASS actual Home/store import races: missing/stale expected session, parsing account/logout/token/roundtrip, confirmation when async, concurrent import; no cross-account private reference or stale notifications');
}finally{modules.cleanup();}
