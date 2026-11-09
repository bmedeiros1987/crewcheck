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
let inventory=[],documents={},defer=null,failRosterRead=false,failInventoryRead=false;
globalThis.fetch=async(url,init={})=>{
 const u=new URL(String(url),'http://synthetic.invalid');assert.equal(u.origin,'http://synthetic.invalid');assert.equal(init.method??'GET','GET','no writes allowed');
 requests.push(u.pathname);if(failInventoryRead&&u.pathname==='/api/rosters')throw new Error('Synthetic inventory transport failed');if(failRosterRead&&['/api/rosters/oct','/api/rosters/open'].includes(u.pathname)){throw new Error('Synthetic transport failed');}const authorized=new Headers(init.headers).get('authorization')==='Bearer synthetic-synthetic-finance-A';
 if(defer){const d=defer;defer=null;await d;}
 const payload=u.pathname==='/api/rosters'?{ok:true,rosters:authorized?inventory:[]}:u.pathname==='/api/rosters/active'?{ok:true,roster:null}:u.pathname.startsWith('/api/rosters/')?{ok:true,data:{roster:authorized?documents[decodeURIComponent(u.pathname.slice('/api/rosters/'.length))]:null,compliance:null,gym:[]}}:assert.fail('Unadmitted synthetic route '+u.pathname);
 return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
};
const modules=['authClient','aimsParser','databaseClient','financialHistoryPeriods','financialComparisonPeriods','financialForecastPeriods','financialActApplicability','sharedAllowanceResolution','latamAllowanceCatalog','financialStatementLearning','financialAmounts','financialJourneyGrouping','financialIntervalEvidence','compensationPolicy','financialRules','financialFxReference','financialSettingStore','nextFinancialPayment','canonicalRoster'];
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
  const coveredDays=libs.nominalFinancialDays(snapshots.map(s=>s.roster));const payment=libs.nextAllowancePayment(result.rows,result.unclassifiedItems,libs.financialMonths(range).filter(m=>!missing.includes(m)),new Date('2026-10-31T12:00:00Z'),coveredDays);return{result,payment,snapshots,missing,conflicts:selected.conflicts};
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
 // Actual AIMS parser + canonical calculator: an unreadable Oct31 origin can
 // cross into Nov1. It is not equivalent to proven DO, nor to an ACT/taxi issue.
 function sourceText(year,month,last){
  const mm=String(month).padStart(2,'0'),tag=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][month-1],count=new Date(Date.UTC(year,month,0)).getUTCDate();
  let text=`Escala de Tripulante Convertida para padrão AIMS\nTripulante: SYNTHETIC PILOT -BP:00000000 -Base: BSB -01/${mm}/${year} até${count}/${mm}/${year}\n`;
  for(let n=1;n<=count;n++)text+=String(n).padStart(2,'0')+tag+' '+(n===count?last:n<=5?'08:00 LA 3001 09:00 BSB GRU 10:30 (320) LA 3002 11:30 GRU BSB 13:00 (320) 13:30':'DO')+'\n';return text;
 }
 const unread='ASB BSB 05:30 BSB 08:40 09:40 LA 4101 09:39 BSB';
 const snapshotOf=roster=>({roster,perdiem:context.subject.calculatePerDiem(events(roster),roster,new Date('2026-10-31T12:00:00Z'))});
 reset();libs.writeFinancialSetting('crewcheck_perdiem_rate_domestic','42');
 const unreadOct=libs.parseAimsRoster(sourceText(2026,10,unread)),offOct=libs.parseAimsRoster(sourceText(2026,10,'DO'));
 const dinnerNov={...nov,crewId:unreadOct.crewId,crewName:unreadOct.crewName,base:unreadOct.base,days:[{...day('2026-11-01'),base:unreadOct.base,dutyReport:'19:00',dutyDebrief:'19:15'}]};
 assert(unreadOct.aimsFlightSourceCoverage&&offOct.aimsFlightSourceCoverage,'real AIMS source witness exists for both cases');
 const originUnknown=[snapshotOf(unreadOct),snapshotOf(dinnerNov)],oneDay=libs.financialRange('custom','','','2026-11-01','2026-11-01');
 assert(originUnknown[0].perdiem.unclassifiedItems.some(item=>item.iso==='2026-10-31'&&item.pendingKind==='source_coverage'),'real parser/calculator prove the prior source gap');
 assert.equal(consumer(originUnknown,oneDay).forecast.monthly,null,'PREVIOUS_SOURCE_COVERAGE: unreadable October31 is not a proven day off for November1');
 const sourceOff=snapshotOf(offOct),knownDinner=snapshotOf(dinnerNov);assert(!sourceOff.perdiem.unclassifiedItems.some(item=>item.pendingKind==='source_coverage'),'control is verified source, not an invalid empty witness');
 assert.equal(consumer([sourceOff,knownDinner],oneDay).forecast.monthly,42,'explicit prior DO does not invent a carry-in issue');
 const rateOnly=JSON.parse(JSON.stringify(sourceOff));rateOnly.perdiem.unclassifiedItems=[{iso:'2026-10-31',airport:'BSB',pendingKind:'taxi_rate',reason:'SYNTHETIC prior taxi rate'},{iso:'2026-10-31',airport:'BSB',pendingKind:'allowance_reference',actCause:'act_missing',reason:'SYNTHETIC prior ACT'}];
 assert.equal(consumer([rateOnly,knownDinner],oneDay).forecast.monthly,42,'only operational source gaps propagate across the boundary');
 const unrelated=JSON.parse(JSON.stringify(sourceOff));unrelated.perdiem.unclassifiedItems=[{iso:'2026-10-15',airport:'BSB',pendingKind:'source_coverage',reason:'SYNTHETIC unrelated source day'}];
 assert.equal(consumer([unrelated,knownDinner],oneDay).forecast.monthly,42);
 const foreignWarning=JSON.parse(JSON.stringify(knownDinner));foreignWarning.perdiem.unclassifiedItems=[{iso:'2026-10-31',airport:'BSB',pendingKind:'source_coverage',reason:'SYNTHETIC foreign old warning'}];
 assert.equal(consumer([sourceOff,foreignWarning],oneDay).forecast.monthly,42,'a foreign warning has no prior-source authority');
 // The payment cycle begins on a month boundary in October2025; exercise the
 // real payment consumer, including the upcoming-line partial flag.
 const sepUnknown=libs.parseAimsRoster(sourceText(2025,9,unread)),sepOff=libs.parseAimsRoster(sourceText(2025,9,'DO'));
 const octoberWeek={...oct,year:2025,crewId:sepUnknown.crewId,crewName:sepUnknown.crewName,base:sepUnknown.base,days:Array.from({length:7},(_,i)=>({...day(`2025-10-${String(i+1).padStart(2,'0')}`),base:sepUnknown.base,...(i===0?{dutyReport:'19:00',dutyDebrief:'19:15'}:{type:'DO',pairingCode:'DO',dutyReport:null,dutyDebrief:null})}))};
 function boundaryPayment(source){const snapshots=[source,snapshotOf(octoberWeek)],projection=libs.aggregateAllowanceEvidence(snapshots);return libs.nextAllowancePayment(projection.rows,projection.unclassifiedItems,['2025-09','2025-10'],new Date('2025-10-03T12:00:00Z'),libs.nominalFinancialDays(snapshots.map(item=>item.roster)));}
 const uncertainPayment=boundaryPayment(snapshotOf(sepUnknown));assert.equal(uncertainPayment.totals,null);assert.equal(uncertainPayment.calculationPartial,true);const cycleLines=uncertainPayment.upcomingLines.filter(row=>row.iso>='2025-10-01'&&row.iso<='2025-10-07');assert.equal(cycleLines.length,1);assert(cycleLines.every(row=>row.partial===true));
 const completePayment=boundaryPayment(snapshotOf(sepOff));assert.equal(completePayment.totals.BRL,42);assert.equal(completePayment.calculationPartial,false);
 const foreignMeal={...knownDinner.perdiem.rows[0],currency:'USD',value:20,convertedBRL:null,partial:false,expectedPaymentDate:'2026-11-01',expectedPaymentTimezone:'America/Sao_Paulo'};
 const foreignUpcoming=pending=>libs.nextAllowancePayment([foreignMeal],pending,['2026-10','2026-11'],new Date('2026-10-31T12:00:00Z'),['2026-10-31','2026-11-01']).upcomingLines[0];
 assert.equal(foreignUpcoming([{iso:'2026-10-31',airport:'BSB',pendingKind:'source_coverage'}]).partial,true);
 for(const pending of [[{iso:'2026-10-31',airport:'BSB',pendingKind:'taxi_rate'}],[{iso:'2026-10-31',airport:'BSB',pendingKind:'allowance_reference'}],[{iso:'2026-10-30',airport:'BSB',pendingKind:'source_coverage'}]])assert.equal(foreignUpcoming(pending).partial,false);

 evidence.push({name:'prior operational source uncertainty',actualParser:true,previousDOComplete:true,ACTAndTaxiDoNotPropagate:true,unrelatedAndForeignIgnored:true,paymentAndUpcomingPartial:true});

 // A foreign date in the carry-in source is not publication authority for
 // the selected competence. Exercise actual history reader -> forecast/UI.
 reset();libs.writeFinancialSetting('crewcheck_perdiem_rate_domestic','42');
 const foreignOff={...day('2026-11-01'),type:'DO',pairingCode:'DO',dutyReport:null,dutyDebrief:null};
 documents.oct={...oct,days:[...oct.days,foreignOff]};documents.nov={...nov,days:nov.days.slice(1)};
 const foreign=await run(),foreignForecast=consumer(foreign.snapshots,boundary);
 assert(foreign.snapshots.find(s=>s.roster.month===10).roster.days.some(d=>d.date==='01/11/2026'),'real history reader preserves the foreign printed date');
 assert.equal(foreignForecast.forecast.monthly,null,'NOMINAL_DAY_COVERAGE: October cannot certify missing November1');
 assert.equal(foreignForecast.forecast.nativeSummary.complete,false);assert.equal(foreignForecast.payment.totals,null);assert.equal(foreignForecast.capture.complete,false);assert(!foreignForecast.capture.coveredDays.includes('2026-11-01'));
 const beforeForeign=foreignForecast.forecast.rows.map(row=>[row.eventId,row.iso,row.label,row.value]);
 documents.oct=oct;const removedForeign=await run(),withoutForeign=consumer(removedForeign.snapshots,boundary);
 assert.equal(withoutForeign.forecast.monthly,null);assert.deepEqual(withoutForeign.forecast.rows.map(row=>[row.eventId,row.iso,row.label,row.value]),beforeForeign,'removing foreign DO cannot change money evidence');
 // Only the genuine November publication can certify this day.
 documents.oct={...oct,days:[...oct.days,foreignOff]};documents.nov={...nov,days:[foreignOff,...nov.days.slice(1)]};
 const official=consumer((await run()).snapshots,boundary);assert.equal(official.forecast.monthly,84);assert.equal(official.forecast.nativeSummary.complete,true);assert(official.capture.coveredDays.includes('2026-11-01'));
 // The inverse contamination must not fake the preceding source date either.
 documents.oct={...oct,days:oct.days.slice(0,3)};documents.nov={...nov,days:[...nov.days,{...day('2026-10-31'),type:'DO',pairingCode:'DO',dutyReport:null,dutyDebrief:null}]};
 const reverse=consumer((await run()).snapshots,boundary);assert.equal(reverse.forecast.monthly,null);assert.equal(reverse.payment.totals,null);assert(!reverse.capture.coveredDays.includes('2026-10-31'));
 // The authorized carry-in rows survive; a copied foreign DO still cannot
 // turn their absence of nominal daily publication into complete coverage.
 documents.oct={...oct,days:[...oct.days.slice(0,3),nightDay('2026-10-31'),foreignOff]};documents.nov={...nov,days:nov.days.slice(1)};
 const carriedWithoutDay=consumer((await run()).snapshots,boundary);assert.equal(carriedWithoutDay.forecast.monthly,null);assert.equal(carriedWithoutDay.payment.totals,null);assert(carriedWithoutDay.forecast.rows.some(row=>row.originIso==='2026-10-31'&&row.iso==='2026-11-01'));
 for(const order of [foreign.snapshots,[...foreign.snapshots].reverse(),[...foreign.snapshots,...foreign.snapshots]])assert.equal(consumer(order,boundary).forecast.monthly,null);
 const mixedDates=[{year:2026,month:10,days:[{date:'31/10/2026'},{date:'2026-11-01'},{date:'31/10/2026'},{date:'2026-10-99'}]},{year:2026,month:11,days:[{date:'02/11/2026'},{date:'2026-10-31'}]},{year:2026,month:13,days:[{date:'2026-11-01'}]}],datesBefore=JSON.stringify(mixedDates);
 assert.deepEqual(libs.nominalFinancialDays(mixedDates),['2026-10-31','2026-11-02']);assert.equal(JSON.stringify(mixedDates),datesBefore,'nominal-date projection does not mutate source records');
 evidence.push({name:'nominal daily publication authority',foreignDONeverCertifies:true,inverseForeignDayRejected:true,genuineDOComplete:true,authorizedCarryRowsPreserved:true});

 // User-reported LATAM cabin forecast rule: geography alone is not eligibility.
 reset();libs.writeFinancialSetting('crewcheck_perdiem_rate_domestic','42');libs.writeFinancialSetting('crewcheck_perdiem_rate_argentina','22');
 const roundTrip={year:2026,month:11,crewId:'SYN01',crewName:'SYNTHETIC',rank:'CC',base:'GRU',airline:'LA',days:[{date:'08/11/2026',type:'FLIGHT',pairingCode:'SYNTHETIC-ROUND-TRIP',dutyReport:'09:00',dutyReportSource:'published',dutyDebrief:'17:30',dutyDebriefSource:'published',base:'GRU',legs:[{flightNumber:'LA9001',origin:'GRU',destination:'EZE',departureTime:'10:00',arrivalTime:'13:00',workType:'OP',presentationTime:'09:00'},{flightNumber:'LA9002',origin:'EZE',destination:'GRU',departureTime:'14:00',arrivalTime:'17:00',workType:'OP'}]}]};
 const roundTripSource=JSON.stringify(roundTrip);
 const cabinDeclaration=libs.planFinancialActChange({schema:1,ownerId:owner,revision:0,events:[]},0,{from:'2026-11-01',through:'2026-11-30',active:true,employer:'TAM_LINHAS_AEREAS_SA',role:'cabin',coverage:'clause_1_2_included'});
 values.set(libs.financialActStorageKey(owner),JSON.stringify(cabinDeclaration));
 const tripForecast=source=>context.subject.calculatePerDiem(events(source),source,new Date('2026-11-08T12:00:00Z'));
 const roundTripResult=tripForecast(roundTrip),roundTripLunch=roundTripResult.rows.find(row=>row.label==='Almoço');
 assert.equal(roundTripLunch?.rateKey,'domestic','ROUND_TRIP_OVERNIGHT: same-day return to base without stay must not use foreign geography as international eligibility');
 assert.equal(roundTripLunch.currency,'BRL');assert.equal(roundTripLunch.value,42);assert.equal(JSON.stringify(roundTrip),roundTripSource);
 const copy=value=>JSON.parse(JSON.stringify(value));
 const domestic=copy(roundTrip);domestic.days[0].legs.forEach(leg=>{if(leg.origin==='EZE')leg.origin='GIG';if(leg.destination==='EZE')leg.destination='GIG';});
 assert.equal(tripForecast(domestic).rows.find(row=>row.label==='Almoço').value,42,'national control unchanged');
 const pendingTrip=(source,message)=>{const result=tripForecast(source);assert(!result.rows.some(row=>row.label==='Almoço'),message);assert.equal(result.nativeSummary.complete,false,message);assert(result.unclassifiedItems.some(item=>/Elegibilidade internacional pendente|Intervalo operacional incompleto/.test(item.reason)),message);return result;};
 const noReturn=copy(roundTrip);noReturn.days[0].legs.pop();pendingTrip(noReturn,'missing return cannot prove round trip or international eligibility');
 const unknownClock=copy(roundTrip);unknownClock.days[0].legs[1].arrivalTime='';pendingTrip(unknownClock,'unconfirmed return clock remains pending');
 const unknownReport=copy(roundTrip);unknownReport.days[0].dutyReport=null;unknownReport.days[0].dutyReportSource='absent';unknownReport.days[0].legs[0].presentationTime='';pendingTrip(unknownReport,'partial flight evidence cannot promote international eligibility');
 const overnight=copy(roundTrip);overnight.days=[{...overnight.days[0],dutyDebrief:'13:30',legs:[overnight.days[0].legs[0]]},{date:'08/11/2026',type:'PERNOITE',pairingCode:'SYNTHETIC-STAY',base:'EZE',dutyReport:'18:00',dutyDebrief:'08:00',dutyReportSource:'published',dutyDebriefSource:'published',legs:[]},{...overnight.days[0],date:'09/11/2026',dutyReport:'13:00',dutyDebrief:'17:30',legs:[overnight.days[0].legs[1]]}];
 assert(events(overnight).some(event=>event.kind==='stay'&&event.day.type==='PERNOITE'),'positive fixture has an actual source-published stay');
 const overnightResult=tripForecast(overnight);assert.equal(overnightResult.rows.find(row=>row.label==='Almoço').value,22);assert.equal(overnightResult.rows.find(row=>row.label==='Almoço').currency,'USD');assert.match(overnightResult.rows.find(row=>row.label==='Almoço').source,/Pernoite internacional publicado/);
 const conflictingStay=copy(roundTrip);conflictingStay.days.push({date:'08/11/2026',type:'PERNOITE',base:'EZE',dutyReport:'12:00',dutyDebrief:'18:00',dutyReportSource:'published',dutyDebriefSource:'published',legs:[]});pendingTrip(conflictingStay,'overlapping overnight that exceeds the return must not disappear from evidence');
 const absentStayClocks=copy(conflictingStay);absentStayClocks.days[1].dutyReport=null;absentStayClocks.days[1].dutyDebrief=null;absentStayClocks.days[1].dutyReportSource='absent';absentStayClocks.days[1].dutyDebriefSource='absent';pendingTrip(absentStayClocks,'clockless overnight on trip date stays pending rather than vanishing');
 const hotelOnly=copy(noReturn);hotelOnly.days[0].hotel='SYNTHETIC HOTEL';pendingTrip(hotelOnly,'hotel text is not a confirmed overnight or return');
 const baseRest=copy(roundTrip);baseRest.days.push({date:'09/11/2026',type:'PERNOITE',base:'GRU',dutyReport:'00:00',dutyDebrief:'08:00',dutyReportSource:'published',dutyDebriefSource:'published',legs:[]});assert.equal(tripForecast(baseRest).rows.find(row=>row.label==='Almoço').rateKey,'domestic','rest at base after return does not promote the foreign excursion');
 const adjacentBaseRest=copy(roundTrip);adjacentBaseRest.days.push({date:'08/11/2026',type:'PERNOITE',base:'GRU',dutyReport:'17:00',dutyDebrief:'23:00',dutyReportSource:'published',dutyDebriefSource:'published',legs:[]});assert.equal(tripForecast(adjacentBaseRest).rows.find(row=>row.label==='Almoço')?.rateKey,'domestic','base rest beginning exactly at return has no positive overlap with trip');
 const midnight=copy(roundTrip);midnight.days[0].dutyReport='17:00';midnight.days[0].legs[0].presentationTime='17:00';midnight.days[0].legs[0].departureTime='18:00';midnight.days[0].legs[0].arrivalTime='21:00';midnight.days[0].legs[1].departureTime='22:00';midnight.days[0].legs[1].arrivalTime='01:00';midnight.days[0].dutyDebrief='01:30';
 assert.equal(tripForecast(midnight).nativeSummary.complete,false,'midnight alone never proves an international overnight');
 for(const source of [roundTrip,libs.normalizeRosterDays(roundTrip),copy(libs.normalizeRosterDays(roundTrip))])assert.equal(tripForecast(source).rows.find(row=>row.label==='Almoço').rateKey,'domestic','reimport/prepared source retains decision');
 const duplicate=copy(roundTrip);duplicate.days.push(copy(duplicate.days[0]));assert.equal(tripForecast(duplicate).rows.filter(row=>row.label==='Almoço').length,0,'existing multi-record evidence gate remains pending rather than duplicating a meal');assert.equal(tripForecast(duplicate).nativeSummary.complete,false);
 const conflict=copy(duplicate);conflict.days[1].legs[1].arrivalTime='18:00';pendingTrip(conflict,'conflicting original published records remain pending');
 const boundaryTrip=copy(roundTrip);boundaryTrip.month=12;boundaryTrip.days[0].date='30/11/2026';boundaryTrip.days.push({date:'01/12/2026',type:'OFF',pairingCode:'OFF',base:'GRU',legs:[]});
 assert.equal(tripForecast(boundaryTrip).rows.find(row=>row.label==='Almoço').rateKey,'domestic');assert.equal(tripForecast(boundaryTrip).monthlyRows.length,0,'foreign-month occurrence does not become nominal month payment');
 const unknownStay=copy(overnight);unknownStay.days[1].dutyReportSource='estimated';pendingTrip(unknownStay,'estimated overnight clocks cannot prove eligibility');
 const inferredStay=copy(overnight);inferredStay.days[1].continuityInferred=true;pendingTrip(inferredStay,'continuity inference alone is not an overnight source');
 const wrongStay=copy(overnight);wrongStay.days[1].base='MVD';pendingTrip(wrongStay,'stay must belong to this actual route');
 const badEnd=copy(roundTrip);badEnd.days[0].dutyDebriefSource='unknown';pendingTrip(badEnd,'unknown published release cannot certify trip closure');
 const midnightBoundary=copy(midnight);midnightBoundary.month=12;midnightBoundary.days[0].date='30/11/2026';assert.equal(tripForecast(midnightBoundary).nativeSummary.complete,false,'competence crossing does not establish overnight');
 assert.equal(libs.resolvePerDiemRule('GRU','EZE').rateKey,'argentina','global geography remains unchanged');
 const dayRange={valid:true,start:'2026-11-08',end:'2026-11-08'},wholeMonth={valid:true,start:'2026-11-01',end:'2026-11-30'};
 const scopedTrip=context.subject.scopedFinancialForecast([{roster:roundTrip,perdiem:roundTripResult}],dayRange,[]);assert.equal(scopedTrip.monthly,42);assert.equal(scopedTrip.nativeSummary.complete,true);
 assert.equal(context.subject.scopedFinancialForecast([{roster:roundTrip,perdiem:roundTripResult}],wholeMonth,[]).monthly,null,'one known trip never certifies the full month');
 values.delete(libs.financialActStorageKey(owner));pendingTrip(roundTrip,'manual tariff does not prove LATAM cabin applicability');
 values.set(libs.financialActStorageKey(owner),JSON.stringify(cabinDeclaration));
 login('synthetic-finance-B');assert.equal(tripForecast(roundTrip).rows.length,0,'account B inherits neither A scope nor A tariff');login(owner);
 assert.equal(tripForecast(roundTrip).rows.find(row=>row.label==='Almoço').value,42,'return to account A restores only its own evidence');
 assert.equal(JSON.stringify(roundTrip),roundTripSource,'calculator never writes source');
 evidence.push({name:'synthetic international round trip without overnight',rate:roundTripLunch.rateKey,currency:roundTripLunch.currency,value:roundTripLunch.value});

 // The actual reader preserves offline local history and reports why remote
 // coverage is unconfirmed; one call, no hidden retry or mutation.
 reset();failInventoryRead=true;let offline=false;
 await libs.listSavedRosters(72,false,{preserveRevisions:true,onUnavailable:()=>{offline=true;}});
 assert.equal(offline,true);assert.equal(requests.filter(p=>p==='/api/rosters').length,1);
 failInventoryRead=false;offline=false;await libs.listSavedRosters(72,false,{preserveRevisions:true,onUnavailable:()=>{offline=true;}});assert.equal(offline,false,'explicit new read can recover remote inventory');
 // Execute the actual Explorer body and its read-only source-loading effect.
 // Hook state is synthetic; selection, session checks, loader and fetch fence
 // are production code. Only allowance boundaries request the prior source.
 reset();libs.writeFinancialSetting('crewcheck_perdiem_rate_domestic','42');
 const inventoryRows=await libs.listSavedRosters(72,false,{preserveRevisions:true});
 const explorerSource=fs.readFileSync(process.env.FINANCIAL_EXPLORER_SOURCE||path.join(root,'client/src/components/finance/FinancialHistoryExplorer.tsx'),'utf8');
 const explorerAst=ts.createSourceFile('FinancialHistoryExplorer.tsx',explorerSource,99,true,ts.ScriptKind.TSX);
 const explorerNodes=explorerAst.statements.filter(node=>ts.isFunctionDeclaration(node)&&['session','FinancialHistoryExplorer'].includes(node.name?.text)||ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>['monthOf','label','formatMoney'].includes(d.name.getText(explorerAst))));
 async function explorer(mode,available=inventoryRows){
  const callbacks=[],refs=[],loaded=[{roster:nov,source:'synthetic'}];let index=0,refIndex=0,renderState,updatedLoaded=loaded;
  const states=[0,0,available,[],loaded,true,[],false,''];
  const scope=vm.createContext({...libs,React,Date:FixtureDate,window,localStorage,
   CalendarDays:()=>null,PersistentFinancialHistory:()=>null,FinancialScreenContext:{Provider:()=>null},
   useFinancialPrivacy:()=>({hidden:false,amount:v=>v,text:v=>v}),
   useFinancialNavigation:()=>({context:{screen:'summary',kind:'custom',month:'2026-11',day:'2026-11-01',from:'2026-11-01',to:'2026-11-03',currency:'BRL',comparison:'month'},update:()=>{},navigate:()=>{},back:()=>{}}),
   useMemo:fn=>fn(),useRef:initial=>refs[refIndex++]??(refs[refIndex-1]={current:initial}),useEffect:fn=>callbacks.push(fn),
   useState:initial=>{const position=index++;if(position>=states.length)states[position]=initial;return[states[position],next=>{states[position]=typeof next==='function'?next(states[position]):next;if(position===4)updatedLoaded=states[position];}];},
  });
  vm.runInContext(ts.transpileModule(explorerNodes.map(node=>node.getText(explorerAst).replace(/^export default /,'')).join('\n')+'\nglobalThis.Explorer=FinancialHistoryExplorer;',{compilerOptions:{target:99,jsx:ts.JsxEmit.React}}).outputText,scope);
  const render=()=>{index=0;refIndex=0;callbacks.length=0;scope.Explorer({roster:nov,calculate:roster=>({roster}),metric:()=>({}),mode,render:state=>{renderState=state;return null;}});};render();
  requests.length=0;const load=callbacks.find(fn=>fn.toString().includes('openSavedRoster'));assert(load,'actual source loading effect');load();
  for(let turn=0;turn<5;turn++)await new Promise(setImmediate);
  return{requests:[...requests],state:renderState,loaded:updatedLoaded,load,render,controls:()=>renderState.controls,loadedNow:()=>updatedLoaded};
 }
 let lookup=await explorer('allowance');assert.deepEqual(lookup.requests,['/api/rosters/oct']);assert(lookup.loaded.some(item=>item.roster.month===10));assert.deepEqual(Array.from(lookup.state.missing),['2026-10']);
 lookup=await explorer('salary');assert.deepEqual(lookup.requests,[],'salary source/competence contract unchanged');assert.deepEqual(Array.from(lookup.state.missing),[]);
 lookup=await explorer('allowance',inventoryRows.filter(item=>item.month===11));assert.deepEqual(lookup.requests,[]);assert.deepEqual(Array.from(lookup.state.missing),['2026-10'],'unavailable prior source is pending, not invented zero');
 // Same-context recovery is an explicit UI action, never a retry loop.
 const settle=async()=>{for(let turn=0;turn<5;turn++)await new Promise(setImmediate);};
 const findRetry=node=>!node||typeof node!=='object'?null:node.type==='button'&&node.props.children==='Tentar leitura novamente'?node:React.Children.toArray(node.props?.children).map(findRetry).find(Boolean);
 reset();failRosterRead=true;lookup=await explorer('allowance');
 assert.equal(lookup.requests.filter(p=>p==='/api/rosters/oct').length,1);failRosterRead=false;assert(!lookup.loadedNow().some(item=>item.roster.month===10));
 lookup.load();await settle();assert.equal(requests.filter(p=>p==='/api/rosters/oct').length,1,'failed requests do not loop automatically');
 lookup.render();const retry=findRetry(lookup.controls());assert(retry,'read failure exposes an actual recovery button');retry.props.onClick();
 lookup.load();await settle();assert.equal(requests.filter(p=>p==='/api/rosters/oct').length,2);assert(lookup.loadedNow().some(item=>item.roster.month===10),'same mounted context recovers without logout/remount');
 lookup.render();assert(!findRetry(lookup.controls()),'successful recovery removes retry action');
 reset();let finish;defer=new Promise(resolve=>finish=resolve);const old=explorer('allowance');await settle();login('synthetic-finance-B');finish();const stale=await old;await settle();assert(!stale.loadedNow().some(item=>item.roster.month===10),'late A result never enters B');
 reset();
 evidence.push({name:'actual Explorer allowance source lookup',priorSourceRequested:true,salaryUnchanged:true,missingPriorUnknown:true,apiWrites:0});
 console.log(JSON.stringify({status:'PASS',timezone:process.env.TZ,evidence,sessionFence:'real reader rejects A→B with zero followup; B has no A settings',source:'real DB reader, canonical events, competence selector, ACT/owned resolver, Home calculator and range total; HTTP/storage/clock fixtures only; no tariff validation',externalRequests:0,apiWrites:0},null,2));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
