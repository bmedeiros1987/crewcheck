import {installAllowanceDependencies} from './lib/shared-allowance-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import {createRequire} from 'node:module';import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import {loadClientModules} from './lib/ts-module-harness.mjs';

// Real selectors/store, synthetic accounts and memory only. No account migration.
const modules=loadClientModules({files:['personalAllowanceReference','financialStatementLearning','ownerPerDiemReview','financialAmounts','financialSettingStore','financialJourneyGrouping','financialIntervalEvidence','compensationPolicy','financialForecastPeriods','rosterDayAllowanceSummary','rosterDisplayDate','financialPrivacyPreference','scheduleActivityClassification'].map(name=>'client/src/lib/'+name+'.ts')});
const previous={localStorage:globalThis.localStorage,window:globalThis.window},navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
const memory=new Map(),queues=new Map();let beforeLock=()=>{},writes=0;
globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>{writes++;memory.set(key,String(value));}};
globalThis.window=new EventTarget();
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request:(key,run)=>{const next=(queues.get(key)||Promise.resolve()).then(()=>{beforeLock();return run();});queues.set(key,next.catch(()=>{}));return next;}}}});
try{
 const p=modules.load('personalAllowanceReference'),l=modules.load('financialStatementLearning'),o=modules.load('ownerPerDiemReview');
 const account='synthetic-history-owner',categories=['mainMeal','breakfast','taxi'];
 const login=(id=account)=>{memory.set('crewcheck_auth_user',JSON.stringify({id,role:'user'}));memory.set('crewcheck_auth_token','synthetic-session-'+id);};login();
 const ratesFor=(month,meal,label)=>o.ownerPerDiemReview({ownerId:account,month,meal,reference:'Synthetic '+label,breakfastQuarter:true,taxiQuarter:true}).map(r=>({...r,confirmed:true}));
 const a=ratesFor('2032-01','174,00','January A'),b=ratesFor('2032-10','200,00','October B'),c=ratesFor('2031-12','212,00','December C');
 assert.equal(l.saveConfirmedFinancialRates(l.mergeConfirmedRates([], [...a,...b,...c])),true);
 const archive=l.readConfirmedFinancialRates(),key=l.personalAllowanceStorageKey(account),archiveKey='crewcheck_financial_learned_rates_v2:'+account,archiveBytes=memory.get(archiveKey);
 const source=(rates,category)=>rates.find(r=>p.allowanceCategory(r.key)===category),id=(rates,category)=>p.personalAllowanceSourceId(source(rates,category));
 const fresh=()=>({schema:1,ownerId:account,revision:0,events:[]});
 const plan=(h,category,rates,from)=>p.planPersonalAllowance(h,archive,h.revision,{category,sourceId:id(rates,category),from,active:true},{raw:h.schema===1&&h.revision?JSON.stringify(h):null,reviewedTimeline:true});
 const val=(h,category,date)=>p.resolvePersonalAllowance(h,archive,category,date)?.rate.value??null;
 const request=(category,rates,from,active=true)=>{const s=l.readPersonalAllowanceReferences();return {expectedSession:l.financialRateSession(),expectedRevision:s.history.revision,expectedSchema:s.history.schema,expectedRaw:s.raw,reviewedTimeline:true,category,active,...(active?{sourceId:id(rates,category),from}:{})};};

 // Three categories: RED on the original last-action selector, GREEN here.
 for(const category of categories){
  const h1=plan(fresh(),category,a,'2032-01-01'),h2=plan(h1,category,b,'2032-11-01');assert(h1&&h2);
  const av=category==='mainMeal'?174:43.5,bv=category==='mainMeal'?200:50;
  assert.equal(val(h2,category,'2031-12-31'),null);
  for(const date of ['2032-01-01','2032-02-01','2032-10-31'])assert.equal(val(h2,category,date),av,date);
  assert.equal(val(h2,category,'2032-11-01'),bv);assert.equal(val(h2,category,'2033-02-01'),bv);
  const sameDate=plan(h2,category,a,'2032-11-01');assert.equal(val(sameDate,category,'2032-11-01'),av);
  assert.equal(plan(sameDate,category,a,'2032-11-01'),sameDate,'exact-source/start winner is idempotent');
  assert.equal(plan(h2,category,a,'2032-01-01'),h2,'earlier exact start remains idempotent after a later recording');
  const restored=plan(plan(h1,category,c,'2032-01-01'),category,a,'2032-01-01');assert.equal(val(restored,category,'2032-02-01'),av,'A -> B -> A is not mistaken for an old duplicate');
  const anchor=plan(h1,category,a,'2032-11-01');assert.equal(anchor.events.length,2,'same source at a distinct start retains its anchor');
  const inserted=plan(anchor,category,c,'2032-03-01');assert.equal(val(inserted,category,'2032-02-01'),av);assert.equal(val(inserted,category,'2032-04-01'),category==='mainMeal'?212:53);assert.equal(val(inserted,category,'2032-11-01'),av,'backdated correction preserves later same-source anchor');
  const revoked=p.planPersonalAllowance(h2,archive,h2.revision,{category,active:false});assert(revoked);
  assert.equal(revoked.events.at(-1).kind,'revoke');assert.equal('from' in revoked.events.at(-1),false,'global revoke invents no effective timestamp');
  for(const date of ['2032-02-01','2032-10-25','2032-11-01','2033-01-01'])assert.equal(val(revoked,category,date),null,'global revoke cancels historical and scheduled generations');
  const restart=plan(revoked,category,a,'2032-12-01');assert.equal(val(restart,category,'2032-11-30'),null);assert.equal(val(restart,category,'2032-12-01'),av);
  assert.equal(p.planPersonalAllowance(h2,archive,h1.revision,{category,active:false}),null,'stale revision rejected');
  assert.equal(plan(h1,category,b,'2032-01-01'),null,'October source cannot be backdated to January');
  assert.equal(plan(h1,category,a,'2032-02-30'),null);
 }

 // Legacy reads are unchanged. Explicit conversion retains exact serialized
 // bytes but seeds only the final live state of each category.
 const event=(category,rates,from,active=true)=>({category,sourceId:id(rates,category),from,active,confirmed:true});
 const legacy={schema:1,ownerId:account,revision:5,events:[event('mainMeal',c,'2031-12-01'),event('mainMeal',a,'2032-01-01'),event('breakfast',a,'2032-01-01'),event('taxi',a,'2032-01-01'),event('taxi',a,'2032-01-01',false)].map((e,i)=>({...e,revision:i+1}))};
 const raw=JSON.stringify(legacy,null,2)+'\n';memory.set(key,raw);const before=writes;
 assert.equal(l.readPersonalAllowanceReferences().history.schema,1);l.confirmedPerDiemReferencesAt('2032-02-01');assert.equal(writes,before,'read never converts or activates');assert.equal(memory.get(key),raw);
 const convert=request('mainMeal',b,'2032-11-01');assert.equal(await l.savePersonalAllowanceReference({...convert,reviewedTimeline:false}),false);assert.equal(memory.get(key),raw);
 assert.equal(await l.savePersonalAllowanceReference(convert),true);
 const converted=l.readPersonalAllowanceReferences().history;assert.equal(converted.schema,2);assert.equal(converted.legacyRaw,raw);assert.equal(converted.revision,6);assert.equal(converted.events.length,1);
 assert.equal(l.confirmedPerDiemReferencesAt('2032-02-01').mainMeal?.value,174);assert.equal(l.confirmedPerDiemReferencesAt('2032-02-01').breakfast,43.5);assert.equal(l.confirmedPerDiemReferencesAt('2032-02-01').taxi,null,'untouched revoked category stays revoked');
 assert.equal(val(converted,'mainMeal','2031-12-15'),null,'replaced legacy generation is audit only');
 assert.equal(l.confirmedPerDiemReferencesAt('2032-11-01').mainMeal?.value,200);assert.equal(memory.get(archiveKey),archiveBytes,'conversion never rewrites rate sources');
 assert.equal(await l.savePersonalAllowanceReference(request('mainMeal',null,null,false)),true);
 assert.equal(l.confirmedPerDiemReferencesAt('2032-02-01').mainMeal,null);assert.equal(l.confirmedPerDiemReferencesAt('2032-11-01').mainMeal,null,'scheduled source does not return after revoke');
 assert.equal(l.confirmedPerDiemReferencesAt('2032-01-15').mainMeal?.value,174,'explicit bounded source still wins over withdrawn recurring premise');
 assert.equal(await l.savePersonalAllowanceReference(request('mainMeal',a,'2032-12-01')),true);assert.equal(l.confirmedPerDiemReferencesAt('2032-11-01').mainMeal,null);

 // Legacy's already-replaced history is NOT silently reconstructed at conversion.
 const replaced={...legacy,revision:6,events:[...legacy.events,{...event('mainMeal',b,'2032-11-01'),revision:6}]};memory.set(key,JSON.stringify(replaced));
 assert.equal(l.confirmedPerDiemReferencesAt('2032-02-01').mainMeal,null);
 assert.equal(await l.savePersonalAllowanceReference(request('breakfast',b,'2032-11-01')),true);
 assert.equal(l.confirmedPerDiemReferencesAt('2032-02-01').mainMeal,null,'untouched legacy category is not reinterpreted');

 // Fresh store: full dated history, independent monthly exceptions, and source
 // validity diagnosis at the queried interval, not the latest recorded action.
 memory.delete(key);for(const category of categories)assert.equal(await l.savePersonalAllowanceReference(request(category,a,'2032-01-01')),true);
 for(const category of categories)assert.equal(await l.savePersonalAllowanceReference(request(category,b,'2032-11-01')),true);
 const home=fs.readFileSync('client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',home,99,true,ts.ScriptKind.TSX);
 const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&['perDiemConfig','calculatePerDiem','moneyBRL','moneyCurrency','readNumberSetting','readOptionalNumberSetting'].includes(n.name?.text));assert.equal(functions.length,6);
 const storageNode=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='storage'));
 const context=vm.createContext({...l,localStorage,...Object.assign({},...['financialAmounts','financialSettingStore','financialJourneyGrouping','financialIntervalEvidence','compensationPolicy','financialForecastPeriods','rosterDayAllowanceSummary','rosterDisplayDate','financialPrivacyPreference','scheduleActivityClassification'].map(n=>modules.load(n))),readAccountNotificationSetting:()=>undefined,
  resolveActFinancialRules:()=>({profileLabel:'Synthetic fallback',legalReference:'synthetic',version:'test',breakfastPercent:.25,perDiem:[{key:'domestic',label:'Synthetic',currency:'BRL',mainMeal:100}]}),loadAirportPerDiemOverrides:()=>({}),resolvePerDiemRule:()=>({rateKey:'domestic',airport:'TEST',reason:'synthetic'}),isOperationalEvent:()=>true,financialEventCode:e=>e.day.type,eventStartDateTime:e=>new Date(e.start),eventEndDateTime:e=>new Date(e.end),dateChip:d=>d.toISOString().slice(0,10)});
 vm.runInContext(ts.transpileModule(storageNode.getText(ast)+'\n'+functions.map(n=>n.getText(ast)).join('\n')+'\nglobalThis.calculate=calculatePerDiem;',{compilerOptions:{target:99}}).outputText,context);
 installAllowanceDependencies(context);
 const actualForecast=month=>{const date=`2032-${String(month).padStart(2,'0')}-05`,event={id:'synthetic-history-duty',kind:'duty',origin:'TEST',destination:'TEST',start:date+'T04:10:00-03:00',end:date+'T12:30:00-03:00',presentation:'04:10',departure:'04:10',arrival:'12:30',canonical:{date,kind:'duty',startDateTime:date+'T07:10:00Z',endDateTime:date+'T15:30:00Z'},day:{date,type:'ASB',dutyReport:'04:10',dutyDebrief:'12:30',dutyReportSource:'published',dutyDebriefSource:'published'}};const roster={year:2032,month,base:'TEST'};return {event,roster,forecast:context.calculate([event],roster,new Date(date+'T15:00:00Z'))};};
 for(const [month,meal,quarter] of [[2,174,43.5],[11,200,50]]){const rows=actualForecast(month).forecast.rows;assert.equal(rows.find(r=>r.label==='Almoço').value,meal,'actual shared caller keeps effective meal interval');assert.equal(rows.find(r=>r.label==='Café').value,quarter);assert.equal(rows.find(r=>r.label==='Táxi').value,quarter);}
 // Render BOTH actual display consumers using those real calculated rows. Only
 // unrelated shell/navigation/editor decorations are stubbed. This is SSR, not
 // browser, layout or interactive-refresh evidence.
 const nodeRequire=createRequire(import.meta.url),uiCache=new Map(),decoration=()=>null;
 const personalUi=ts.createSourceFile('PersonalAllowanceReference.tsx',fs.readFileSync('client/src/components/finance/PersonalAllowanceReference.tsx','utf8'),99,true,ts.ScriptKind.TSX);
 const todayNode=personalUi.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(personalUi)==='today'));assert(todayNode);
 let displayClock='2032-02-05T12:00:00Z';class FixedDate extends Date{constructor(...args){super(...(args.length?args:[displayClock]));}}
 for(const [instant,expected] of [['2032-02-05T12:00:00Z','2032-02-05'],['2032-02-05T02:59:59Z','2032-02-04'],['2032-02-05T03:00:00Z','2032-02-05'],['2032-01-01T02:59:59Z','2031-12-31'],['2032-03-01T02:59:59Z','2032-02-29']]){
  displayClock=instant;
  const dateContext=vm.createContext({Date:FixedDate,Intl:{DateTimeFormat:function(...args){assert.equal(args[1]?.timeZone,'America/Sao_Paulo','retain operational civil timezone abroad');const formatter=new Intl.DateTimeFormat(...args);Object.defineProperty(formatter,'format',{value:()=> '02/05/2032'});return formatter;}}});
  vm.runInContext(ts.transpileModule(todayNode.getText(personalUi)+'\nglobalThis.actualDay=today();',{compilerOptions:{target:99}}).outputText,dateContext);assert.equal(dateContext.actualDay,expected,'ISO parts and Sao Paulo midnight, not locale/device date: '+instant);
 }
 // Production SSR deliberately hides money. Test that first, then supply the
 // explicit synthetic client's snapshot to the real privacy hook for rendering
 // the shown state; this adapter is not browser/subscription coverage.
 let clientPrivacySnapshot=false;
 const reactFixture={...React,useSyncExternalStore:(subscribe,snapshot,serverSnapshot)=>React.useSyncExternalStore(subscribe,snapshot,clientPrivacySnapshot?snapshot:serverSnapshot)};
 const shell={
  'lucide-react':new Proxy({},{get:()=>decoration}),
  './useRosterLayout':{useRosterLayout:()=>({layout:'list',zoom:'month',choose(){},chooseZoom(){},message:''})},
  '@/lib/navigationContext':{peekPendingNavigationContext:()=>null,setPendingNavigationContext(){}},
  '@/lib/rosterFocus':{consumePendingRosterFocus:()=>null},
  '../alerts/AlertRosterNavigation':{AlertRosterNavigation:decoration},
  '@/components/v139/Shell':{V139Header:decoration},
  './AimsDocumentView':{AimsDocumentView:decoration},'./AimsRosterTable':{AimsRosterTable:decoration},'./CalendarRosterView':{CalendarRosterView:decoration},
 };
 const uiRequire=id=>{
  if(id==='react')return reactFixture;
  if(id==='react/jsx-runtime')return nodeRequire(id);
  if(id.endsWith('.css'))return {};
  if(shell[id])return shell[id];
  if(id==='@/components/finance/FinancialPrivacy'||id==='./finance/FinancialPrivacy')return loadUi('client/src/components/finance/FinancialPrivacy.tsx');
  if(id==='./rosterActivityLabel')return loadUi('client/src/components/v1391/rosterActivityLabel.ts');
  if(id.startsWith('@/lib/'))return modules.load(id.slice('@/lib/'.length));
  throw Error('Unexpected display dependency '+id);
 };
 function loadUi(file){if(uiCache.has(file))return uiCache.get(file);const exports={};uiCache.set(file,exports);const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:99,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInThisContext('(function(require,exports){'+compiled+'\n})')(uiRequire,exports);return exports;}
 const rosterView=loadUi('client/src/components/v1391/RosterLaunchView.tsx').default,privacy=loadUi('client/src/components/finance/FinancialPrivacy.tsx');
 const monthNode=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='PerDiemMonthView');assert(monthNode);
 let displayFixture;
 const viewContext=vm.createContext({...context,...privacy,MoneyText:loadUi('client/src/components/MoneyText.tsx').default,useState:React.useState,useMemo:React.useMemo,buildLegs:()=>[displayFixture.event],calculatePerDiem:()=>displayFixture.forecast,Brand:decoration,FinancialScreen:({children})=>children,KpiCard:({title,value})=>React.createElement('p',null,title,': ',value),BriefcaseBusiness:decoration,CalendarDays:decoration,Plane:decoration,DollarSign:decoration,PersonalAllowanceReference:decoration,FinancialStatementImporter:decoration,exports:{},require:uiRequire});
 vm.runInContext(ts.transpileModule(monthNode.getText(ast)+'\nexport default PerDiemMonthView;',{fileName:'actual-finance-display.tsx',compilerOptions:{target:99,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,viewContext);
 const financeView=viewContext.exports.default;
 memory.set('crewcheck:financial-privacy:v2:'+account,'shown');
 for(const [month,meal,quarter] of [[2,'174,00','43,50'],[11,'200,00','50,00']]){
  displayFixture=actualForecast(month);const {event,roster,forecast}=displayFixture;
  clientPrivacySnapshot=false;
  const hidden=renderToStaticMarkup(React.createElement(financeView,{bundle:{roster},forecastOverride:forecast}));assert.doesNotMatch(hidden,new RegExp(meal),'production server snapshot does not expose money');
  clientPrivacySnapshot=true;
  const rosterHtml=renderToStaticMarkup(React.createElement(rosterView,{events:[event],finance:{perdiem:forecast},financeMonth:`2032-${String(month).padStart(2,'0')}`,setView:()=>{},roster}));
  const financeHtml=renderToStaticMarkup(React.createElement(financeView,{bundle:{roster},forecastOverride:forecast}));
  for(const [label,amount] of [['Almoço',meal],['Café',quarter],['Táxi',quarter]]){
   assert.match(rosterHtml,new RegExp('<b>'+label+'</b><em>[^<]*'+amount.replace(',','\\,')+'</em>'),'actual roster card '+label);
   const financialRow=financeHtml.match(new RegExp('<strong>'+label+' · TEST</strong><b>([\\s\\S]*?)</b>'));assert(financialRow,'actual financial row exists '+label);assert.match(financialRow[1],new RegExp(amount),'actual financial row value '+label);
  }
 }
 const intact=memory.get(key),ratesIntact=memory.get(archiveKey),june=ratesFor('2032-06','220,00','June exception');
 assert.equal(l.saveConfirmedFinancialRates(l.mergeConfirmedRates(l.readConfirmedFinancialRates(),june)),true);
 assert.equal(l.confirmedPerDiemReferencesAt('2032-06-15').mainMeal?.value,220);assert.equal(l.confirmedPerDiemReferencesAt('2032-07-15').mainMeal?.value,174);
 const zero={...source(a,'mainMeal'),value:0,sourceFingerprint:'synthetic-corrected-zero'};
 assert.equal(l.saveConfirmedFinancialRates(l.mergeConfirmedRates(l.readConfirmedFinancialRates(),[zero])),true);
 const invalidPast=l.confirmedPerDiemReferencesAt('2032-02-01');assert.equal(invalidPast.state,'unavailable');assert.equal(invalidPast.mainMeal,null,'invalid historical selected source cannot silently fall back');
 assert.equal(l.confirmedPerDiemReferencesAt('2032-11-01').mainMeal?.value,200,'unrelated corrected past interval does not poison November');
 assert.equal(l.confirmedPerDiemReferencesAt('2032-06-15').mainMeal?.value,220,'bounded month bypasses missing recurring source');
 memory.set(archiveKey,ratesIntact);
 const futureZero={...source(b,'mainMeal'),value:0,sourceFingerprint:'synthetic-future-zero'};assert.equal(l.saveConfirmedFinancialRates(l.mergeConfirmedRates(l.readConfirmedFinancialRates(),[futureZero])),true);
 assert.equal(l.confirmedPerDiemReferencesAt('2032-02-01').mainMeal?.value,174,'future invalid source cannot poison an earlier interval');assert.equal(l.confirmedPerDiemReferencesAt('2032-11-01').state,'unavailable');
 memory.set(archiveKey,ratesIntact);

 // Snapshot/schema/owner fencing, including same numeric revision after reset.
 const stale=request('mainMeal',c,'2032-03-01'),altered=JSON.parse(intact);altered.events[0].from='2032-01-02';memory.set(key,JSON.stringify(altered));const alteredRaw=memory.get(key);
 assert.equal(await l.savePersonalAllowanceReference(stale),false);assert.equal(memory.get(key),alteredRaw,'snapshot CAS rejects same-revision different authority');memory.set(key,intact);
 const switchRequest=request('mainMeal',c,'2032-03-01');beforeLock=()=>login('synthetic-other');assert.equal(await l.savePersonalAllowanceReference(switchRequest),false);beforeLock=()=>{};assert.equal(l.confirmedPerDiemReferencesAt('2032-02-01').mainMeal,null);login();
 assert.equal(await l.savePersonalAllowanceReference({...request('mainMeal',c,'2032-03-01'),expectedSchema:1}),false);
 const revoke=request('mainMeal',null,null,false),concurrent=await Promise.all([l.savePersonalAllowanceReference(revoke),l.savePersonalAllowanceReference({...revoke,active:true,sourceId:id(c,'mainMeal'),from:'2032-03-01'})]);assert.deepEqual(concurrent,[true,false]);
 assert.equal(l.confirmedPerDiemReferencesAt('2032-11-01').mainMeal,null);

 const empty={schema:2,ownerId:account,revision:0,legacyRaw:null,events:[]};memory.set(key,JSON.stringify(empty));assert.equal(l.confirmedPerDiemReferencesAt('2032-02-01').mainMeal,null,'empty v2 is authoritative, no legacy fallback');memory.delete(key);assert.equal(l.confirmedPerDiemReferencesAt('2032-02-01').mainMeal,null,'single-key clear leaves no separate v1 to revive');
 for(const malformed of ['{broken',JSON.stringify({...empty,schema:3}),JSON.stringify({...empty,legacyRaw:raw}),JSON.stringify({...empty,ownerId:'wrong'}),JSON.stringify({...empty,revision:Number.MAX_SAFE_INTEGER}),JSON.stringify({...converted,events:[{...converted.events[0],extra:true}]})]){
  memory.set(key,malformed);assert.equal(l.readPersonalAllowanceReferences().state,'invalid');assert.equal(p.parsePersonalAllowanceHistory(malformed,account),null);assert.equal(await l.savePersonalAllowanceReference(convert),false);assert.equal(memory.get(key),malformed);
 }
 const nearLimit=' '.repeat(1048576-raw.length)+raw;assert(p.parsePersonalAllowanceHistory(nearLimit,account));memory.set(key,nearLimit);assert.equal(await l.savePersonalAllowanceReference(request('mainMeal',b,'2032-11-01')),false,'escaped v2 envelope cannot exceed cap');assert.equal(memory.get(key),nearLimit,'oversize conversion preserves all bytes');
 console.log('PASS allowance history: dated starts and same-source anchors; global revoke/restart; explicit byte-preserving legacy conversion; actual calculator and roster/financial SSR rows with explicit privacy fixture; month/source/diagnostic precedence; snapshot CAS, owner/locks, empty/corrupt/oversize/overflow; synthetic only TZ='+process.env.TZ);
}finally{modules.cleanup();Object.assign(globalThis,previous);if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;}
