import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadClientModules } from './lib/ts-module-harness.mjs';
const modules = loadClientModules({ files: ['ownerPerDiemReview','financialSettingStore','financialStatementLearning','financialAmounts','financialJourneyGrouping','financialIntervalEvidence','compensationPolicy','financialForecastPeriods'].map(name=>'client/src/lib/'+name+'.ts') });
const previous = {localStorage:globalThis.localStorage,window:globalThis.window}, storage = new Map();
let unavailable=false, failedRead=null, archiveReads=0, writes=0, geography='domestic';
globalThis.localStorage = {getItem:key=>{
 if(failedRead==='all'||failedRead===key)throw Error('Synthetic unavailable authentication/storage read');
 if(key.startsWith('crewcheck_financial_learned_rates_v2:')){archiveReads++;if(unavailable)throw Error('Synthetic unavailable storage');}
 return storage.get(key)??null;
},setItem:(key,value)=>{writes++;storage.set(key,String(value));}};
globalThis.window = new EventTarget();
const login = id => {localStorage.setItem('crewcheck_auth_user',JSON.stringify({id,role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-'+id);};
try {
 const settings=modules.load('financialSettingStore'),learning=modules.load('financialStatementLearning'),{ownerPerDiemReview}=modules.load('ownerPerDiemReview');
 const source=fs.readFileSync('client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',source,99,true,ts.ScriptKind.TSX);
 const names=['perDiemConfig','calculatePerDiem','moneyBRL','moneyCurrency','readNumberSetting','readOptionalNumberSetting'],functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text));assert.equal(functions.length,6);
 const storageNode=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='storage'));assert(storageNode);
 const context=vm.createContext({...learning,...settings,localStorage:globalThis.localStorage,readAccountNotificationSetting:()=>undefined,...modules.load('financialAmounts'),...modules.load('financialJourneyGrouping'),...modules.load('financialIntervalEvidence'),...modules.load('compensationPolicy'),...modules.load('financialForecastPeriods'),
 resolveActFinancialRules:()=>({profileLabel:'Synthetic reference',legalReference:'synthetic-only',version:'test',breakfastPercent:.25,perDiem:[{key:'domestic',label:'Synthetic domestic',currency:'BRL',mainMeal:100},{key:'foreign',label:'Synthetic foreign',currency:'USD',mainMeal:80}]}),
 loadAirportPerDiemOverrides:()=>({}),resolvePerDiemRule:()=>({rateKey:geography,airport:'TEST',reason:'synthetic'}),isOperationalEvent:()=>true,financialEventCode:e=>e.day.type,
 eventStartDateTime:e=>new Date(e.start),eventEndDateTime:e=>new Date(e.end),dateChip:d=>d.toISOString().slice(0,10)});
 vm.runInContext(ts.transpileModule(storageNode.getText(ast)+'\n'+functions.map(n=>n.getText(ast)).join('\n')+'\nglobalThis.calculate=calculatePerDiem;',{compilerOptions:{target:99}}).outputText,context);
 const month='2032-08',iso=month+'-06',roster={year:2032,month:8,base:'TEST'};
 const reserve=(report='06:10')=>({id:'synthetic-reserve',kind:'duty',origin:'TEST',destination:'TEST',start:iso+'T'+report+':00-03:00',end:iso+'T12:30:00-03:00',day:{type:'ASB',dutyReport:report,dutyDebrief:'12:30',dutyReportSource:'published',dutyDebriefSource:'published'}});
 const run=(report)=>context.calculate([reserve(report)],roster,new Date(iso+'T15:00:00Z'));
 login('synthetic-a');
 const draft=ownerPerDiemReview({ownerId:'synthetic-a',month,meal:'200,00',reference:'Synthetic bounded confirmation',breakfastQuarter:true,taxiQuarter:true});
 assert.equal(learning.saveConfirmedFinancialRates(draft.map(r=>({...r,confirmed:true}))),true);
 const key=[...storage.keys()].find(k=>k.startsWith('crewcheck_financial_learned_rates_v2:'));
 const valid=storage.get(key),envelope=JSON.parse(valid);
 assert.equal(run().monthly,250,'valid source supplies breakfast and lunch');
 archiveReads=0;const snapshot=learning.confirmedPerDiemReferencesAt(iso);
 assert.equal(archiveReads,1,'values and diagnosis use one validated snapshot');
 assert.equal(snapshot.state,'ready');assert.equal(snapshot.mainMeal.value,200);assert.equal(snapshot.breakfast,50);assert.equal(snapshot.taxi,50);
 assert.equal(learning.confirmedPerDiemReferencesAt('2032-09-01').mainMeal,null,'valid archive with expired references is not corrupt');
 assert.equal(learning.confirmedPerDiemReferencesAt('2032-09-01').state,'ready');
 assert.equal(settings.writeFinancialSetting('crewcheck_perdiem_rate_domestic','80'),true);
 envelope.rates.push({...envelope.rates[0],key:'salary.dayKm',unit:'km',valueOrigin:'derived'});
 const damaged=JSON.stringify(envelope);storage.set(key,damaged);
 assert.equal(run().monthly,null,'damaged archive must not become a complete ACT total');
 assert.equal(run().rows.length,0,'no old domestic reference silently adopted');
 assert.equal(storage.get(key),damaged,'archive bytes preserved');
 assert.equal(settings.readFinancialSetting('crewcheck_perdiem_rate_domestic'),'80','manual value preserved, not silently substituted over an unreadable monthly review');
 assert.equal(learning.readFinancialRateArchive().state,'invalid');
 assert.equal(learning.readConfirmedFinancialRates().length,0,'legacy reader keeps fail-closed contract');
 const count=writes;
 assert.equal(learning.saveConfirmedFinancialRates(JSON.parse(valid).rates),false,'no recovery write silently drops malformed history');
 assert.equal(writes,count);assert.equal(storage.get(key),damaged);
 assert(run().unclassifiedItems.every(item=>/Histórico local de tarifas inválido/.test(item.reason)));
 assert.equal(run('04:10').monthlyUnclassifiedItems.filter(item=>item.pendingKind==='taxi_rate').length,1,'eligible taxi remains visible and unpriced');
 geography='foreign';const foreign=run();assert(foreign.nativeSummary.complete,'independent international rules are not blocked');assert.equal(foreign.rows.length,2);assert.equal(foreign.rows.find(row=>row.label==='Almoço').value,80);geography='domestic';
 const base=JSON.parse(valid);
 for(const [label,raw] of [
   ['bad JSON','{'],['wrong version',JSON.stringify({...base,version:1})],
   ['wrong owner',JSON.stringify({...base,ownerId:'synthetic-b'})],
   ['mixed owner',JSON.stringify({...base,rates:base.rates.map((rate,i)=>i?rate:{...rate,ownerId:'synthetic-b'})})],
   ['invalid date',JSON.stringify({...base,rates:base.rates.map((rate,i)=>i?rate:{...rate,effectiveTo:'2032-02-30'})})],
   ['conflicting revision',JSON.stringify({...base,rates:[...base.rates,{...base.rates[0],value:204}]})],
 ]){
   storage.set(key,raw);const before=writes;
   assert.equal(learning.readFinancialRateArchive().state,'invalid',label);assert.equal(run().monthly,null,label);
   assert.equal(learning.saveConfirmedFinancialRates(base.rates),false,label+' cannot overwrite evidence');
   assert.equal(storage.get(key),raw);assert.equal(writes,before);
 }
 storage.set(key,valid);unavailable=true;
 assert.equal(learning.readFinancialRateArchive().state,'unavailable');assert.equal(run().monthly,null);
 assert(run().unclassifiedItems.every(item=>/Referências locais indisponíveis/.test(item.reason)));unavailable=false;
 assert.equal(run().monthly,250,'read failure did not delete rates');
 // A browser-wide or auth-key read failure is not evidence of a real logout.
 const beforeAuthFailure=[...storage],beforeAuthWrites=writes;
 for(const failedKey of ['all','crewcheck_auth_user','crewcheck_auth_token']){
   failedRead=failedKey;
   assert.equal(run().monthly,null,failedKey+': unreadable auth storage must not produce a complete ACT fallback');
   assert.equal(learning.readFinancialRateArchive().state,'unavailable',failedKey);
   assert.equal(learning.confirmedPerDiemReferencesAt(iso).state,'unavailable',failedKey);
   assert.equal(learning.financialRateOwner(),null,'legacy owner API remains fail-closed');
   assert.equal(learning.readConfirmedFinancialRates().length,0);
   assert.equal(learning.saveConfirmedFinancialRates(base.rates),false,'unreadable auth cannot authorize a write');
   assert(run().unclassifiedItems.every(item=>/Referências locais indisponíveis/.test(item.reason)));
   assert.equal(run('04:10').monthlyUnclassifiedItems.filter(item=>item.pendingKind==='taxi_rate').length,1);
   assert.equal(writes,beforeAuthWrites);assert.deepEqual([...storage],beforeAuthFailure);
   failedRead=null;assert.equal(run().monthly,250,'read access recovery preserves the original rates');
 }
 const userKey='crewcheck_auth_user',tokenKey='crewcheck_auth_token',validUser=storage.get(userKey),validToken=storage.get(tokenKey);
 const invalidIdentities=[['missing',null],['empty',''],['malformed','{'],['null','null'],['array','[]'],['primitive','"synthetic-a"'],['missing id','{}'],['numeric id','{"id":7}'],['empty id','{"id":""}'],['blank id','{"id":"  "}'],['invalid role','{"id":"synthetic-a","role":{}}']];
 const setIdentity=raw=>raw===null?storage.delete(userKey):storage.set(userKey,raw);
 const counterproof=invalidIdentities.map(([label,raw])=>{setIdentity(raw);return {label,state:learning.readFinancialRateArchive().state,monthly:run().monthly};});
 storage.set(userKey,validUser);
 console.log('Synthetic token-present identity counterproof:',JSON.stringify(counterproof));
 assert.deepEqual(counterproof,invalidIdentities.map(([label])=>({label,state:'unavailable',monthly:null})), 'token-present unreadable identity is not logout');
 for(const [label,raw] of invalidIdentities){
   setIdentity(raw);const before=[...storage],beforeWrites=writes;archiveReads=0;
   assert.equal(learning.financialRateOwner(),null,label+': no financial owner inferred');
   const refs=learning.confirmedPerDiemReferencesAt(iso);assert.equal(refs.state,'unavailable');assert.equal(refs.mainMeal,null);assert.equal(refs.breakfast,null);assert.equal(refs.taxi,null);
   assert.equal(run().monthly,null);assert.equal(run().rows.length,0);assert(run().unclassifiedItems.every(item=>/Referências locais indisponíveis/.test(item.reason)));
   assert.equal(run('04:10').monthlyUnclassifiedItems.filter(item=>item.pendingKind==='taxi_rate').length,1);
   assert.equal(learning.saveConfirmedFinancialRates(base.rates),false);assert.equal(writes,beforeWrites);assert.deepEqual([...storage],before);assert.equal(archiveReads,0,'unknown owner never reads any owner archive');
   storage.delete(tokenKey);const loggedOut=[...storage];assert.equal(learning.readFinancialRateArchive().state,'unauthenticated',label+': absent token is genuine logout');assert.equal(learning.readConfirmedFinancialRates().length,0);assert.equal(learning.saveConfirmedFinancialRates(base.rates),false);assert.equal(writes,beforeWrites);assert.deepEqual([...storage],loggedOut);storage.set(tokenKey,validToken);
 }
 for(const role of ['visitor','guest']){storage.set(userKey,JSON.stringify({id:'synthetic-a',role}));const before=[...storage],beforeWrites=writes;assert.equal(learning.financialRateOwner(),null);assert.equal(learning.readFinancialRateArchive().state,'unavailable');assert.equal(run().monthly,null);assert.equal(learning.saveConfirmedFinancialRates(base.rates),false);assert.equal(writes,beforeWrites);assert.deepEqual([...storage],before);}
 storage.set(userKey,validUser);assert.equal(run().monthly,250,'identity recovery restores only the original owner rates');
 storage.delete(tokenKey);failedRead=userKey;assert.equal(learning.readFinancialRateArchive().state,'unauthenticated','known absent token does not require a readable user record');failedRead=null;storage.set(tokenKey,validToken);
 storage.delete(key);assert.equal(learning.readFinancialRateArchive().state,'missing');
 assert.equal(run().monthly,100,'missing archive retains independently stored manual meal and quarter breakfast');
 assert.match(run().rows[0].source,/não salva neste dispositivo/);
 storage.set(key,valid);login('synthetic-b');
 assert.equal(learning.readFinancialRateArchive().state,'missing');assert.equal(run().monthly,125,'another owner cannot see A reference');
 storage.set('crewcheck_financial_learned_rates_v2:synthetic-b','{');login('synthetic-a');assert.equal(run().monthly,250,'another owner archive cannot poison A');
 storage.delete('crewcheck_auth_token');assert.equal(learning.readFinancialRateArchive().state,'unauthenticated');assert.equal(learning.readConfirmedFinancialRates().length,0);login('synthetic-a');assert.equal(run().monthly,250);
 storage.set(key,JSON.stringify({...base,rates:[]}));assert.equal(learning.readFinancialRateArchive().state,'ready','explicit empty valid archive differs from invalid/missing');storage.set(key,valid);
 // Execute the actual Explorer effects, not a second implementation of its key matcher.
 const explorer=fs.readFileSync('client/src/components/finance/FinancialHistoryExplorer.tsx','utf8');
 const explorerAst=ts.createSourceFile('FinancialHistoryExplorer.tsx',explorer,99,true,ts.ScriptKind.TSX);
 const component=explorerAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='FinancialHistoryExplorer');assert(component);
 const effects=component.body.statements.filter(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(explorerAst)==='useEffect');
 const effect=effects.find(n=>n.getText(explorerAst).includes('setCalculationRevision'));assert(effect);
 let revision=0,authRevision=0;const cleanups=[];
 const effectContext=vm.createContext({window:globalThis.window,localStorage:globalThis.localStorage,financialRateOwner:learning.financialRateOwner,
  useEffect:fn=>cleanups.push(fn()),setCalculationRevision:fn=>{revision=fn(revision);},setAuthRevision:fn=>{authRevision=fn(authRevision);},
  epoch:{current:0},fetching:{current:new Map()},setLoaded:()=>{},setInventory:()=>{},setConflicts:()=>{},setCoverageReady:()=>{},setNotice:()=>{}});
 const authEffect=effects.find(n=>n.getText(explorerAst).includes('setAuthRevision'));assert(authEffect);
 for(const source of [effect,authEffect])vm.runInContext(ts.transpileModule(source.getText(explorerAst),{compilerOptions:{target:99}}).outputText,effectContext);
 const emit=(key,area=globalThis.localStorage)=>{const event=new Event('storage');Object.assign(event,{key,storageArea:area});window.dispatchEvent(event);};
 emit(key);assert.equal(revision,1);emit('crewcheck_financial_settings_v1:synthetic-a:crewcheck_perdiem_rate_domestic');assert.equal(revision,2);
 emit('crewcheck_financial_learned_rates_v2:synthetic-b');emit('crewcheck_financial_settings_v1:synthetic-b:crewcheck_perdiem_rate_domestic');emit(key,{});emit('unrelated');assert.equal(revision,2,'other owner, sessionStorage and unrelated events ignored');
 window.dispatchEvent(new Event('crewcheck:financial-config-changed'));assert.equal(revision,3);
 login('synthetic-b');emit(key);assert.equal(revision,3,'listener rechecks current owner');emit('crewcheck_financial_learned_rates_v2:synthetic-b');assert.equal(revision,4);
 emit(null,{});assert.equal(authRevision,0,'sessionStorage clear is not an account reset');
 storage.clear();emit(null);assert.equal(authRevision,1,'clear event resets loaded account history');
 for(const cleanup of cleanups)cleanup();login('synthetic-a');emit(key);window.dispatchEvent(new Event('crewcheck:financial-config-changed'));assert.equal(revision,4,'unmounted listeners removed');
 console.log('PASS rate archive: complete-total counterproof, one snapshot, corruption/owner/version/date/conflict/archive-and-auth-storage-unavailable states, immutable history, manual/international independence, expiry, cross-tab/account/clear/cleanup; synthetic only');
} finally {modules.cleanup();Object.assign(globalThis,previous);}

await import('./regression-personal-allowance-reference.mjs');
