import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),require=createRequire(path.join(root,'package.json'));
const ts=require('typescript'),{build}=require('esbuild'),React=require('react');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'financial-chain-'));
const values=new Map(),requests=[],evidence=[];
globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
globalThis.window=new EventTarget();window.location={origin:'http://synthetic.invalid',hostname:'synthetic.invalid'};
let inventory=[],documents={},defer=null;
globalThis.fetch=async(url,init={})=>{
 const u=new URL(String(url),'http://synthetic.invalid');assert.equal(u.origin,'http://synthetic.invalid');assert.equal(init.method??'GET','GET','no writes allowed');
 requests.push(u.pathname);const authorized=new Headers(init.headers).get('authorization')==='Bearer synthetic-synthetic-finance-A';
 if(defer){const d=defer;defer=null;await d;}
 const payload=u.pathname==='/api/rosters'?{ok:true,rosters:authorized?inventory:[]}:u.pathname==='/api/rosters/active'?{ok:true,roster:null}:u.pathname.startsWith('/api/rosters/')?{ok:true,data:{roster:authorized?documents[decodeURIComponent(u.pathname.slice('/api/rosters/'.length))]:null,compliance:null,gym:[]}}:assert.fail('Unadmitted synthetic route '+u.pathname);
 return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
};
const modules=['authClient','databaseClient','financialHistoryPeriods','financialComparisonPeriods','financialForecastPeriods','financialActApplicability','sharedAllowanceResolution','latamAllowanceCatalog','financialStatementLearning','financialAmounts','financialJourneyGrouping','financialIntervalEvidence','compensationPolicy','financialRules','financialFxReference','financialSettingStore','nextFinancialPayment','canonicalRoster'];
try{
 const out=path.join(dir,'libs.mjs');
 await build({stdin:{contents:[...modules.map((name,i)=>`export * as m${i} from './client/src/lib/${name}';`),"export * as fx from './shared/financialFx.mjs';"].join('\n'),resolveDir:root,loader:'ts'},bundle:true,format:'esm',platform:'node',outfile:out,logLevel:'silent',define:{'import.meta.env':'{}'},alias:{'@':path.join(root,'client/src'),'@shared':path.join(root,'shared')}});
 const imported=await import(pathToFileURL(out));const libs=Object.assign({},...Object.values(imported));
 const home=fs.readFileSync(path.join(root,'client/src/pages/Home.tsx'),'utf8'),ast=ts.createSourceFile('Home.tsx',home,99,true,ts.ScriptKind.TSX);
 const names=['PerDiemView','perDiemConfig','calculatePerDiem','scopedFinancialForecast','readOptionalNumberSetting','readNumberSetting','moneyCurrency','moneyBRL','financialEventCode','flightWorkType','isOperationalEvent','eventStartDateTime','eventEndDateTime'];
 const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text));
 for(const name of ['perDiemConfig','calculatePerDiem','scopedFinancialForecast'])assert(functions.some(n=>n.name.text===name),name);
 const fixed=Date.parse('2026-10-31T12:00:00Z');class FixtureDate extends Date{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}}
 const context=vm.createContext({...libs,React,Date:FixtureDate,useFinancialFx:()=>({quotes:{},setMode:()=>{}}),financeSnapshot:()=>null,FinancialHistoryExplorer:()=>null,FinancialFreeDayDetails:()=>null,FinancialFxSourceControl:()=>null,CanonicalForecastCapture:()=>null,PerDiemMonthView:()=>null,NextPaymentCard:()=>null,FinancialStatementReconciliation:()=>null,storage:{get:(key,fallback='')=>libs.isFinancialSetting(key)?libs.readFinancialSetting(key,fallback):(values.get(key)??fallback)},loadAirportPerDiemOverrides:()=>({}),dateChip:d=>d.toISOString().slice(0,10)});
 vm.runInContext(ts.transpileModule(functions.map(n=>n.getText(ast)).join('\n')+'\nglobalThis.subject={calculatePerDiem,scopedFinancialForecast,PerDiemView};',{compilerOptions:{target:99,jsx:ts.JsxEmit.React}}).outputText,context);
 const login=owner=>{window.dispatchEvent(new Event('crewcheck:auth-will-change'));values.set('crewcheck_auth_user',JSON.stringify({id:owner,role:'user',name:'SYNTHETIC'}));values.set('crewcheck_auth_token','synthetic-'+owner);window.dispatchEvent(new Event('crewcheck:auth-changed'));};
 const owner='synthetic-finance-A';login(owner);
 const day=iso=>({date:iso.split('-').reverse().join('/'),type:'CRM',pairingCode:'CRM',dutyReport:'11:00',dutyDebrief:'11:15',dutyReportSource:'published',dutyDebriefSource:'published',base:'GRU',legs:[]});
 const roster=(month,days,crewId='SYN01')=>({year:2026,month,crewId,crewName:'SYNTHETIC',rank:'CC',base:'GRU',airline:'LA',days:days.map(day)});
 const oct=roster(10,['2026-10-28','2026-10-29','2026-10-30','2026-10-31']),nov=roster(11,['2026-11-01','2026-11-02','2026-11-03']);
 const summary=(id,r,stamp,active=false)=>({id,year:r.year,month:r.month,crewId:r.crewId,crewName:r.crewName,createdAt:stamp,isActive:active,checksum:null});
 const reset=()=>{values.clear();login(owner);requests.length=0;inventory=[summary('oct',oct,'2026-10-26T12:00:00Z'),summary('nov',nov,'2026-10-27T12:00:00Z',true)];documents={oct,nov};};
 const events=r=>libs.buildCanonicalRosterEvents(r).map(e=>({...e,canonical:e,day:e.publishedDay,date:new Date(e.startDateTime)}));
 const range=libs.financialRange('week','','2026-10-31','','');assert.deepEqual([range.start,range.end],['2026-10-28','2026-11-03']);const cycle=libs.observedAllowancePeriods(new Date('2026-10-31T12:00:00Z'),'roster_brt');assert.deepEqual([libs.rosterOperationalIso(cycle.accumulation.start),libs.rosterOperationalIso(cycle.accumulation.end),libs.rosterOperationalIso(cycle.accumulation.payment)],['2026-10-28','2026-11-03','2026-11-05']);assert.equal(cycle.paymentConfirmed,false);
 const run=async()=>{
  const list=await libs.listSavedRosters(72,false,{preserveRevisions:true});
  const selected=libs.latestFinancialPeriods(list,libs.financialRosterCrewIdentity(nov),libs.financialRosterCrewIdentity);
  const opened=await Promise.all(selected.items.map(item=>libs.openSavedRoster(item.id,item)));
  const snapshots=opened.map(({roster:r})=>({roster:r,perdiem:context.subject.calculatePerDiem(events(r),r,new Date('2026-10-31T12:00:00Z'))}));
  const missing=libs.financialMonths(range).filter(month=>!snapshots.some(s=>`${s.roster.year}-${String(s.roster.month).padStart(2,'0')}`===month));
  const result=context.subject.scopedFinancialForecast(snapshots,range,missing);
  const coveredDays=snapshots.flatMap(s=>s.roster.days.map(d=>d.date.split('/').reverse().join('-')));const payment=libs.nextAllowancePayment(result.rows,result.unclassifiedItems,libs.financialMonths(range).filter(m=>!missing.includes(m)),new Date('2026-10-31T12:00:00Z'),coveredDays);return{result,payment,snapshots,missing,conflicts:selected.conflicts};
 };
 context.buildLegs=events;
 const capture=(name,r)=>evidence.push({name,monthly:r.result.monthly,complete:r.result.nativeSummary.complete,rows:r.result.rows.length,missing:r.missing,conflicts:r.conflicts,paymentTotals:r.payment.totals,paymentPartial:r.payment.calculationPartial,pending:r.result.unclassifiedItems.map(i=>({iso:i.iso,kind:i.pendingKind,cause:i.actCause??null}))});
 reset();let r=await run();assert.equal(r.result.monthly,null);assert(r.result.unclassifiedItems.length>0);assert(r.result.unclassifiedItems.every(i=>i.actCause==='act_missing'));capture('missing ACT and owner rates',r);
 reset();assert.equal(libs.writeFinancialSetting('crewcheck_perdiem_rate_domestic','0'),true);r=await run();assert.equal(r.result.monthly,0);assert.equal(r.payment.totals?.BRL,0);assert.equal(r.result.nativeSummary.complete,true);assert.equal(r.result.rows.length,7);assert(r.result.rows.every(i=>i.value===0));assert.equal(r.result.unclassifiedItems.length,0);capture('explicit owned zero',r);
 reset();const journal={schema:1,ownerId:owner,revision:0,events:[]};const declaration=libs.planFinancialActChange(journal,0,{from:'2026-10-01',through:'2026-10-31',active:true,employer:'TAM_LINHAS_AEREAS_SA',role:'cabin',coverage:'clause_1_2_included'});assert(declaration);values.set(libs.financialActStorageKey(owner),JSON.stringify(declaration));r=await run();assert.equal(r.result.monthly,null);assert(r.result.rows.some(i=>i.iso.startsWith('2026-10')));assert(r.result.unclassifiedItems.some(i=>i.iso.startsWith('2026-11')&&i.actCause==='act_expired'));capture('ACT declaration ends at month boundary',r);
 reset();const rate=(from,to,value,fingerprint)=>({key:'per_diem.lunch',label:'SYNTHETIC ONLY',unit:'meal',value,currency:'BRL',sourceDocument:'synthetic.pdf',sourceFingerprint:fingerprint,confidence:'high',valueOrigin:'printed',confirmed:true,effectiveFrom:from,effectiveTo:to});assert.equal(libs.saveConfirmedFinancialRates(libs.mergeConfirmedRates([], [rate('2026-10-01','2026-10-31',42,'synthetic-oct'),rate('2026-11-01','2026-11-30',84,'synthetic-nov')])),true);r=await run();assert.equal(r.result.monthly,4*42+3*84);assert(r.result.rows.filter(i=>i.iso.startsWith('2026-10')).every(i=>i.value===42));assert(r.result.rows.filter(i=>i.iso.startsWith('2026-11')).every(i=>i.value===84));capture('reviewed account rates resolved by occurrence month, not active month',r);
 reset();assert.equal(libs.writeFinancialSetting('crewcheck_perdiem_rate_domestic','42'),true);r=await run();assert.equal(r.result.monthly,7*42);assert.equal(r.result.rows.length,7);assert.equal(r.result.unclassifiedItems.length,0);capture('owned synthetic nonzero total',r);
 inventory=inventory.filter(i=>i.month===11);r=await run();assert.equal(r.result.monthly,null);assert.deepEqual(r.missing,['2026-10']);assert.equal(r.result.nativeSummary.complete,false);capture('historical month absent',r);
 reset();libs.writeFinancialSetting('crewcheck_perdiem_rate_domestic','42');inventory.push(summary('oct-conflict',oct,'2026-10-26T12:00:00Z'));documents['oct-conflict']=oct;r=await run();assert.deepEqual(r.conflicts,['2026-10']);assert.equal(r.result.monthly,null);assert(!requests.includes('/api/rosters/oct-conflict'));capture('tied roster revisions remain unresolved',r);
 reset();libs.writeFinancialSetting('crewcheck_perdiem_rate_domestic','42');const changed={...oct,days:[...oct.days.slice(0,3),{...day('2026-10-31'),type:'DO',pairingCode:'DO',dutyReport:null,dutyDebrief:null}]};documents['oct-new']=changed;inventory.push(summary('oct-new',changed,'2026-10-28T12:00:00Z'));r=await run();assert.equal(r.result.rows.length,6);assert.equal(r.result.monthly,6*42);assert(!requests.includes('/api/rosters/oct'));capture('newest reimport with explicit non-working day, no sum of old revision',r);
 reset();libs.writeFinancialSetting('crewcheck_perdiem_rate_domestic','42');values.set('crewcheck_financial_learned_rates_v2:'+owner,'{corrupt');r=await run();assert.equal(r.result.monthly,null);assert(r.result.unclassifiedItems.length>0);assert(r.result.unclassifiedItems.every(i=>!i.actCause));capture('archive invalid is not missing ACT or zero',r);
 reset();libs.writeFinancialSetting('crewcheck_perdiem_rate_domestic','42');documents['other']=roster(10,['2026-10-30'],'SYN99');inventory.push(summary('other',documents.other,'2026-10-29T12:00:00Z'));r=await run();assert.equal(r.result.monthly,7*42);assert(!requests.includes('/api/rosters/other'));capture('other crew excluded',r);
 reset();assert.equal(libs.writeFinancialSetting('crewcheck_perdiem_rate_domestic','73'),true);assert.equal(libs.readFinancialSetting('crewcheck_perdiem_rate_domestic',''),'73');let release;defer=new Promise(resolve=>release=resolve);const pending=libs.listSavedRosters(72,false,{preserveRevisions:true});login('synthetic-finance-B');release();await assert.rejects(pending,e=>e.code==='STALE_SESSION');assert.equal(requests.length,1);assert(!requests.includes('/api/rosters/active'));assert.equal(libs.readFinancialSetting('crewcheck_perdiem_rate_domestic',''),'');const b=await run();assert.equal(b.result.monthly,null);assert.equal(b.result.rows.length,0);assert.deepEqual(b.missing,['2026-10','2026-11']);capture('fresh B request receives no A inventory or sentinel tariff 73',b);
 {reset();libs.writeFinancialSetting('crewcheck_perdiem_rate_domestic','42');documents.oct={...oct,days:oct.days.slice(0,3)};r=await run();evidence.push({counterexample:'FINANCIAL_DAY_COVERAGE_GAP',actualTotal:r.result.monthly,actualComplete:r.result.nativeSummary.complete,paymentTotals:r.payment.totals,paymentPartial:r.payment.calculationPartial,paymentIssues:r.payment.issues,missingMonths:r.missing,absentDate:'2026-10-31',knownRows:r.result.rows.map(i=>i.iso),expectedTotal:null,paidOrRealRequests:0});assert.equal(r.payment.totals,null,'existing payment consumer already refuses the incomplete day coverage');assert.equal(r.payment.calculationPartial,true);assert.equal(r.result.monthly,null,'FINANCIAL_DAY_COVERAGE_GAP: a missing published date is not a known day off');}


 // An explicit zero tariff does not turn a missing publication into a zero day.
 reset();libs.writeFinancialSetting('crewcheck_perdiem_rate_domestic','0');documents.oct={...oct,days:oct.days.slice(0,3)};r=await run();assert.equal(r.result.monthly,null);assert.equal(r.result.nativeSummary.complete,false);assert.equal(r.result.nativeSummary.knownTotalsByCurrency.BRL,0);assert.equal(r.payment.totals,null);capture('explicit zero rate with absent date stays partial',r);
 // Real canonical duty/meal evidence from an adjacent day is not publication
 // coverage for its arrival date. Keep the known rows when coverage is absent.
 const nightDay=iso=>({...day(iso),type:'VOO',pairingCode:'SYN-NIGHT',dutyReport:'22:00',dutyDebrief:'12:15',legs:[{flightNumber:'QA0001',origin:'GRU',destination:'REC',departureTime:'23:00',arrivalTime:'11:45',duration:12.75,workType:'OP'}]});
 for(const [name,start,arrival] of [['overnight','2026-10-29','2026-10-30'],['carry-in','2026-10-27','2026-10-28']]){
  reset();libs.writeFinancialSetting('crewcheck_perdiem_rate_domestic','42');
  const night=nightDay(start),off={...day(arrival),type:'DO',pairingCode:'DO',dutyReport:null,dutyDebrief:null};
  documents.oct={...oct,days:[...oct.days.filter(d=>![night.date,off.date].includes(d.date)),night,off]};
  const canonical=events(documents.oct).find(e=>e.kind==='flight');assert(canonical);assert.equal(libs.rosterOperationalIso(new Date(canonical.startDateTime)),start);assert.equal(libs.rosterOperationalIso(new Date(canonical.endDateTime)),arrival);
  r=await run();assert.equal(r.result.nativeSummary.complete,true);assert.equal(r.result.unclassifiedItems.length,0);
  const carryRows=r.result.rows.filter(row=>row.eventId===canonical.id&&row.iso===arrival);assert(carryRows.length>0,'actual calculator produces arrival-day meal evidence');
  const proved=carryRows.map(row=>[row.eventId,row.iso,row.label,row.value]);capture(name+' with explicit arrival-date publication',r);
  documents.oct={...documents.oct,days:documents.oct.days.filter(d=>d.date!==off.date)};
  r=await run();assert.equal(r.result.monthly,null);assert.equal(r.result.nativeSummary.complete,false);assert.equal(r.payment.totals,null);assert.equal(r.payment.calculationPartial,true);
  assert.deepEqual(r.result.rows.filter(row=>row.eventId===canonical.id&&row.iso===arrival).map(row=>[row.eventId,row.iso,row.label,row.value]),proved,'no deletion or recalculation of known carry-in when arrival date is absent');
  capture(name+' does not certify an absent arrival date',r);
 }
 // Invalid dates and malformed/empty scopes cannot certify coverage; duplicate
 // published dates do not invent additional dates, nor alter the input.
 const covered=['2026-10-28','2026-10-28','2026-02-30','malformed'];const before=JSON.stringify(covered);
 assert.deepEqual(libs.financialDayCoverage(range,covered).missingDays,['2026-10-29','2026-10-30','2026-10-31','2026-11-01','2026-11-02','2026-11-03']);assert.equal(JSON.stringify(covered),before);
 for(const invalid of [{...range,valid:false},{...range,start:'2026-02-30'},{...range,start:range.end,end:range.start}])assert.equal(libs.financialDayCoverage(invalid,covered).valid,false);
 // The existing full calculator rows carry the origin of the journey. Nominal
 // monthlyRows stay nominal; range aggregation and both actual UI consumers
 // must include only genuine carry-in, not arbitrary foreign-month activities.
 reset();libs.writeFinancialSetting('crewcheck_perdiem_rate_domestic','42');
 documents.oct={...oct,days:[...oct.days.slice(0,3),nightDay('2026-10-31')]};
 documents.nov={...nov,days:nov.days.map(d=>d.date==='01/11/2026'?{...d,dutyReport:'14:00',dutyDebrief:'14:15'}:d)};
 r=await run();
 assert.equal(r.result.monthly,294,'FINANCIAL_CARRY_IN: preserve both actual Nov1 meals from the Oct31 journey');
 const currentSnapshots=r.snapshots,original=JSON.stringify(currentSnapshots),october=currentSnapshots.find(s=>s.roster.month===10);
 const carried=october.perdiem.rows.filter(row=>row.iso==='2026-11-01');
 assert.deepEqual(Array.from(carried,row=>row.label).sort(),['Almoço','Ceia']);assert(carried.every(row=>row.originIso==='2026-10-31'));
 assert(october.perdiem.monthlyRows.every(row=>row.iso.startsWith('2026-10')),'producer nominal competence is unchanged');
 function consumer(snapshots,selectedRange=range){
  const host=context.subject.PerDiemView({bundle:{roster:nov},freeDayEvaluation:{}});
  const tree=host.props.render({snapshots:snapshots.map(snapshot=>({roster:snapshot.roster,snapshot,source:'synthetic'})),range:selectedRange,missing:[],controls:null,graph:null,coverageReady:true,requestRange:()=>{}});
  const children=React.Children.toArray(tree.props.children),screen=children.find(child=>child.props?.forecastOverride);
  const capture=children.find(child=>child.props?.flights),statement=screen.props.graph.props.children;
  return{forecast:screen.props.forecastOverride,payment:screen.props.nextPayment.props.payment,capture:capture.props,statement:statement.props};
 }
 let rendered=consumer(currentSnapshots);assert.equal(rendered.forecast.monthly,294);assert.equal(rendered.payment.totals.BRL,294);assert.equal(rendered.payment.calculationPartial,false);
 assert.equal(rendered.capture.rows.length,7);assert.equal(rendered.statement.rows.length,7);assert.equal(rendered.capture.complete,true);
 capture('OUT to NOV full rows reach the actual forecast, payment, capture and statement caller',r);
 const boundary=libs.financialRange('custom','','','2026-11-01','2026-11-03');
 rendered=consumer(currentSnapshots,boundary);assert.equal(rendered.forecast.monthly,168);assert(rendered.forecast.rows.every(row=>row.iso>='2026-11-01'));
 assert.equal(rendered.payment.totals.BRL,294,'payment reference cycle is independent from the selected forecast dates');
 const noPrior=consumer(currentSnapshots.filter(s=>s.roster.month===11),boundary);
 assert.equal(noPrior.forecast.monthly,null);assert.equal(noPrior.forecast.scopeIncomplete,true);assert.equal(noPrior.payment.totals,null);
 const afterBoundary=libs.financialRange('custom','','','2026-11-02','2026-11-03');
 assert.equal(consumer(currentSnapshots,afterBoundary).forecast.monthly,84,'out-of-range carry-in does not contaminate later dates');
 for(const order of [currentSnapshots,[...currentSnapshots].reverse()]){
  const duplicates=[...order,...JSON.parse(JSON.stringify(order))];rendered=consumer(duplicates);
  assert.equal(rendered.forecast.monthly,294);assert.equal(rendered.forecast.rows.length,7);assert.equal(rendered.payment.totals.BRL,294);assert.equal(rendered.statement.rows.length,7);
 }
 assert.equal(JSON.stringify(currentSnapshots),original,'aggregation/FX/consumer do not mutate source snapshots or nominal rows');
 // Conflicting versions of the same slot are not silently selected or summed.
 for(const [field,value] of [['value',84],['currency','USD'],['eventId','synthetic-other-flight'],['rateVersion','synthetic-new-revision'],['source','synthetic other authority'],['calculationEnd','2026-11-01T15:30:00.000Z'],['originIso','2026-10-30']]){
  const duplicate=JSON.parse(JSON.stringify(october)),target=duplicate.perdiem.rows.find(row=>row.iso==='2026-11-01'&&row.label==='Ceia');target[field]=value;
  for(const all of [[...currentSnapshots,duplicate],[duplicate,...currentSnapshots]]){
   rendered=consumer(all);assert.equal(rendered.forecast.monthly,null,field);assert.equal(rendered.payment.totals,null,field);assert.equal(rendered.capture.complete,false,field);
   assert(rendered.forecast.unclassifiedItems.some(item=>item.iso==='2026-11-01'&&item.pendingKind==='source_coverage'));
   assert(!rendered.forecast.rows.some(row=>row.iso==='2026-11-01'&&row.label==='Ceia'),'neither conflicting amount is chosen for the known subtotal');
  }
 }
 // Preserve the existing one-taxi-per-day ceiling across overlapping sources.
 const taxi={...carried[0],label:'Táxi',eventId:'synthetic-taxi-A'};
 const taxiSnapshot={perdiem:{rows:[taxi],monthlyRows:[taxi],monthlyUnclassifiedItems:[]}};
 assert.equal(libs.aggregateAllowanceEvidence([taxiSnapshot,taxiSnapshot]).rows.length,1);
 const taxiConflict={perdiem:{rows:[{...taxi,eventId:'synthetic-taxi-B'}],monthlyRows:[],monthlyUnclassifiedItems:[]}};
 const taxiEvidence=libs.aggregateAllowanceEvidence([taxiSnapshot,taxiConflict]);assert.equal(taxiEvidence.rows.length,0);assert.equal(taxiEvidence.unclassifiedItems.length,1);
 // A foreign-month literal activity in an older source is not carry-in.
 const future={...carried[0],iso:'2026-11-02',originIso:'2026-11-02',eventId:'synthetic-november-activity-in-october'};
 const extra=JSON.parse(JSON.stringify(october));extra.perdiem.rows.push(future);extra.perdiem.unclassifiedItems.push({iso:'2026-11-03',airport:'',reason:'synthetic foreign nominal activity'});
 rendered=consumer([...currentSnapshots.filter(s=>s!==october),extra]);assert.equal(rendered.forecast.monthly,294);
 assert(!rendered.forecast.rows.some(row=>row.eventId===future.eventId));assert(!rendered.forecast.unclassifiedItems.some(item=>item.reason==='synthetic foreign nominal activity'));
 const unknownOrigin=JSON.parse(JSON.stringify(october));delete unknownOrigin.perdiem.rows.find(row=>row.iso==='2026-11-01'&&row.label==='Ceia').originIso;
 rendered=consumer([...currentSnapshots.filter(s=>s!==october),unknownOrigin]);assert.equal(rendered.forecast.monthly,null);assert(rendered.forecast.unclassifiedItems.some(item=>/Origem da jornada/.test(item.reason)));
 for(const origin of ['', 'malformed','2026-10-99','2026-11-02']){
  const invalid=JSON.parse(JSON.stringify(october));invalid.perdiem.rows.find(row=>row.iso==='2026-11-01'&&row.label==='Ceia').originIso=origin;
  assert.equal(consumer([...currentSnapshots.filter(s=>s!==october),invalid]).forecast.monthly,null,'invalid carry-in origin is unknown');
 }
 // A later authenticated revision removing the Oct31 duty governs; the old
 // month must not be opened or resurrect its carried rows after reimport.
 const revised={...documents.oct,days:documents.oct.days.map(d=>d.date==='31/10/2026'?{...day('2026-10-31'),type:'DO',pairingCode:'DO',dutyReport:null,dutyDebrief:null}:d)};
 documents['oct-revised']=revised;inventory.push(summary('oct-revised',revised,'2026-10-29T12:00:00Z'));requests.length=0;
 const reimported=await run();assert.equal(reimported.result.monthly,210);assert.equal(reimported.result.nativeSummary.complete,true);assert(!requests.includes('/api/rosters/oct'));assert(!reimported.result.rows.some(row=>row.eventId.includes('QA0001')),'removed duty never survives from old revision');
 // A literal carried meal from a flight with missing presentation remains
 // a known partial row, never a certified total after the month filter.
 const partialSource=JSON.parse(JSON.stringify(october));const partialNight=partialSource.roster.days.find(day=>day.date==='31/10/2026');partialNight.dutyReport=null;partialNight.dutyReportSource='absent';
 partialSource.perdiem=context.subject.calculatePerDiem(events(partialSource.roster),partialSource.roster,new Date('2026-10-31T12:00:00Z'));
 rendered=consumer([...currentSnapshots.filter(s=>s!==october),partialSource],boundary);assert(rendered.forecast.rows.some(row=>row.iso==='2026-11-01'&&row.partial===true));assert.equal(rendered.forecast.monthly,null);assert.equal(rendered.payment.totals,null);
 // Producer recalculation under a zero owned rate remains an explicit zero;
 // it is not a synthesized fallback for a missing or expired ACT declaration.
 inventory=inventory.filter(item=>item.id!=='oct-revised');libs.writeFinancialSetting('crewcheck_perdiem_rate_domestic','0');r=await run();rendered=consumer(r.snapshots);assert.equal(rendered.forecast.monthly,0);assert.equal(rendered.payment.totals.BRL,0);
 reset();values.set(libs.financialActStorageKey(owner),JSON.stringify(declaration));
 documents.oct={...oct,days:[...oct.days.slice(0,3),nightDay('2026-10-31')]};documents.nov={...nov,days:nov.days.map(d=>d.date==='01/11/2026'?{...d,dutyReport:'14:00',dutyDebrief:'14:15'}:d)};
 r=await run();rendered=consumer(r.snapshots,boundary);assert.equal(rendered.forecast.monthly,null);assert.equal(rendered.payment.totals,null);
 assert(rendered.forecast.unclassifiedItems.some(item=>item.iso==='2026-11-01'&&item.originIso==='2026-10-31'&&item.actCause==='act_expired'),'carry-in retains dated ACT cause from its real producer');
 assert.equal(libs.allowanceSourceRange(boundary).start,'2026-10-31');assert.equal(libs.allowanceSourceRange(afterBoundary).start,afterBoundary.start);
 assert.equal(libs.allowanceSourceRange(libs.financialRange('month','2027-01','','','')).start,'2026-12-31','year boundary is civil, not device timezone');
 evidence.push({name:'carry-in actual consumer controls',total:294,boundaryTotal:168,duplicateCopiesCountedOnce:true,conflicts:7,sourceMonthAuthority:true,ACTCausePreserved:true,zeroPreserved:true,sourceMutation:false});
 // Execute the actual Explorer body and its read-only source-loading effect.
 // Hook state is synthetic; selection, session checks, loader and fetch fence
 // are production code. Only allowance boundaries request the prior source.
 reset();libs.writeFinancialSetting('crewcheck_perdiem_rate_domestic','42');
 const inventoryRows=await libs.listSavedRosters(72,false,{preserveRevisions:true});
 const explorerSource=fs.readFileSync(path.join(root,'client/src/components/finance/FinancialHistoryExplorer.tsx'),'utf8');
 const explorerAst=ts.createSourceFile('FinancialHistoryExplorer.tsx',explorerSource,99,true,ts.ScriptKind.TSX);
 const explorerNodes=explorerAst.statements.filter(node=>ts.isFunctionDeclaration(node)&&['session','FinancialHistoryExplorer'].includes(node.name?.text)||ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>['monthOf','label','formatMoney'].includes(d.name.getText(explorerAst))));
 async function explorer(mode,available=inventoryRows){
  const callbacks=[],loaded=[{roster:nov,source:'synthetic'}];let index=0,renderState,updatedLoaded=loaded;
  const states=[0,0,available,[],loaded,true,[],false,''];
  const scope=vm.createContext({...libs,React,Date:FixtureDate,window,localStorage,
   CalendarDays:()=>null,PersistentFinancialHistory:()=>null,FinancialScreenContext:{Provider:()=>null},
   useFinancialPrivacy:()=>({hidden:false,amount:v=>v,text:v=>v}),
   useFinancialNavigation:()=>({context:{screen:'summary',kind:'custom',month:'2026-11',day:'2026-11-01',from:'2026-11-01',to:'2026-11-03',currency:'BRL',comparison:'month'},update:()=>{},navigate:()=>{},back:()=>{}}),
   useMemo:fn=>fn(),useRef:initial=>({current:initial}),useEffect:fn=>callbacks.push(fn),
   useState:initial=>{const position=index++;return[states[position],next=>{states[position]=typeof next==='function'?next(states[position]):next;if(position===4)updatedLoaded=states[position];}];},
  });
  vm.runInContext(ts.transpileModule(explorerNodes.map(node=>node.getText(explorerAst).replace(/^export default /,'')).join('\n')+'\nglobalThis.Explorer=FinancialHistoryExplorer;',{compilerOptions:{target:99,jsx:ts.JsxEmit.React}}).outputText,scope);
  scope.Explorer({roster:nov,calculate:roster=>({roster}),metric:()=>({}),mode,render:state=>{renderState=state;return null;}});
  requests.length=0;const load=callbacks.find(fn=>fn.toString().includes('openSavedRoster'));assert(load,'actual source loading effect');load();
  for(let turn=0;turn<5;turn++)await new Promise(setImmediate);
  return{requests:[...requests],state:renderState,loaded:updatedLoaded};
 }
 let lookup=await explorer('allowance');assert.deepEqual(lookup.requests,['/api/rosters/oct']);assert(lookup.loaded.some(item=>item.roster.month===10));assert.deepEqual(Array.from(lookup.state.missing),['2026-10']);
 lookup=await explorer('salary');assert.deepEqual(lookup.requests,[],'salary source/competence contract unchanged');assert.deepEqual(Array.from(lookup.state.missing),[]);
 lookup=await explorer('allowance',inventoryRows.filter(item=>item.month===11));assert.deepEqual(lookup.requests,[]);assert.deepEqual(Array.from(lookup.state.missing),['2026-10'],'unavailable prior source is pending, not invented zero');
 evidence.push({name:'actual Explorer allowance source lookup',priorSourceRequested:true,salaryUnchanged:true,missingPriorUnknown:true,apiWrites:0});
 console.log(JSON.stringify({status:'PASS',timezone:process.env.TZ,evidence,sessionFence:'real reader rejects A→B with zero followup; B has no A settings',source:'real DB reader, canonical events, competence selector, ACT/owned resolver, Home calculator and range total; HTTP/storage/clock fixtures only; no tariff validation',externalRequests:0,apiWrites:0},null,2));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
