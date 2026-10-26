import {buildSync} from 'esbuild';
import {createRequire} from 'node:module';
const localRequire=createRequire(import.meta.url);
import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
import {loadClientModules} from './lib/ts-module-harness.mjs';
const old={localStorage:globalThis.localStorage,window:globalThis.window};const data=new Map();
globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v))};globalThis.window=new EventTarget();
const names=['financialActApplicability','sharedAllowanceResolution','latamAllowanceCatalog','financialStatementLearning','financialAmounts','financialJourneyGrouping','financialIntervalEvidence','compensationPolicy','financialForecastPeriods','financialHistoryPeriods','financialRules','financialSettingStore'];
const m=loadClientModules({files:names.map(n=>'client/src/lib/'+n+'.ts')});
try{
 const libs=Object.assign({},...names.map(n=>m.load(n))),j=m.load('financialActApplicability'),learning=m.load('financialStatementLearning');
 const source=fs.readFileSync('client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',source,99,true,ts.ScriptKind.TSX);
 const fnNames=['perDiemConfig','calculatePerDiem','scopedFinancialForecast','moneyBRL','moneyCurrency'];
 const fns=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&fnNames.includes(n.name?.text));assert.equal(fns.length,fnNames.length);
 const manual={},overrides={};const context=vm.createContext({...libs,readOptionalNumberSetting:k=>manual[k]??null,readNumberSetting:()=>0,loadAirportPerDiemOverrides:()=>overrides,
 isOperationalEvent:()=>true,financialEventCode:e=>e.day.type,eventStartDateTime:e=>new Date(e.start),eventEndDateTime:e=>new Date(e.end),dateChip:d=>d.toISOString().slice(0,10)});
 vm.runInContext(ts.transpileModule(fns.map(n=>n.getText(ast)).join('\n')+'\nglobalThis.subject={perDiemConfig,calculatePerDiem,scopedFinancialForecast};',{compilerOptions:{target:99}}).outputText,context);
 const {perDiemConfig:config,calculatePerDiem:calculate,scopedFinancialForecast:scoped}=context.subject;
 const paymentModule={exports:{}};vm.runInNewContext(buildSync({entryPoints:['client/src/lib/nextFinancialPayment.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text,{module:paymentModule,exports:paymentModule.exports,require:localRequire});
 let captureExpression;function visitCapture(n){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='CanonicalForecastCapture')captureExpression=n.attributes.properties.find(a=>a.name?.getText(ast)==='complete').initializer.expression.getText(ast);ts.forEachChild(n,visitCapture);}visitCapture(ast);assert(captureExpression);

 const login=id=>{data.set('crewcheck_auth_user',JSON.stringify({id,role:'user'}));data.set('crewcheck_auth_token','synthetic-token-'+id);window.dispatchEvent(new Event('crewcheck:auth-changed'));};
 const confirm=(id,role,from='2026-01-01')=>{const next=j.planFinancialActChange({schema:1,ownerId:id,revision:0,events:[]},0,{from,through:'2027-11-30',active:true,employer:'TAM_LINHAS_AEREAS_SA',role,coverage:'clause_1_2_included'});data.set(j.financialActStorageKey(id),JSON.stringify(next));};
 const event=(date,origin='GRU',start='11:00',end='11:15')=>({id:'synthetic-'+date+'-'+origin,kind:'duty',origin,destination:origin,start:date+'T'+start+':00-03:00',end:date+'T'+end+':00-03:00',day:{type:'ASB',dutyReport:start,dutyDebrief:end,dutyReportSource:'published',dutyDebriefSource:'published'}});
 const run=(date,airport='GRU',start='11:00',end='11:15')=>calculate([event(date,airport,start,end)],{year:+date.slice(0,4),month:+date.slice(5,7),days:[],base:'GRU',airline:'LATAM',rank:'CCM'},new Date(date+'T15:00:00Z'));
 login('synthetic-shared');let result=run('2026-01-05');assert.equal(result.rows.length,0);assert.equal(result.monthly,null);assert.equal(result.nativeSummary.complete,false);assert.match(result.unclassifiedItems[0].reason,/Empresa e ACT não confirmados/);
 // Parser airline/default rank never confirms applicability.
 assert(Number.isNaN(config({days:[],airline:'LATAM',rank:'CCM'},'2026-01-05').rates.domestic.mainMeal));
 for(const role of ['cabin','pilot']){
  confirm('synthetic-shared',role,'2025-12-01');
  result=run('2026-01-05');assert.equal(result.rows[0].value,109.44);assert.match(result.rows[0].rateVersion,new RegExp(':'+role+'$'));assert.equal(result.monthly,109.44);assert.equal(result.rows[0].rateSource,'admin_enterprise_reference');
  result=run('2026-01-05','GRU','04:10','12:00');assert.equal(result.rows.find(r=>r.label==='Café').value,27.36);assert.equal(result.rows.find(r=>r.label==='Táxi').value,27.36);assert.match(result.rows.find(r=>r.label==='Táxi').source,/não consta.*ACT/);
  const december=run('2025-12-31');assert.equal(december.rows.length,0);assert.equal(december.referenceRows[0].value,109.43);assert.equal(december.monthly,null);assert.equal(december.nativeSummary.complete,false);
  const future=run('2026-12-01');assert.equal(future.rows.length,0);assert.equal(future.referenceRows.length,0);assert.equal(future.monthly,null);assert.match(future.unclassifiedItems[0].reason,/índice consolidado/);
  const expired=run('2027-12-01');assert.equal(expired.rows.length,0);assert.equal(expired.monthly,null);
  const jan=run('2026-01-05','JFK'),dec=run('2026-12-05','JFK');assert.equal(jan.referenceRows[0].value,28.7);assert.equal(dec.referenceRows[0].value,31.7);assert.equal(jan.rows.length,0);assert.equal(jan.monthly,null);assert.equal(jan.nativeSummary.complete,false);
  assert.equal(run('2026-01-05','CDG').referenceRows[0].value,25);assert.equal(run('2026-12-05','CDG').referenceRows[0].value,27);
  for(const airport of ['MEX','LHR']){const r=run('2026-01-05',airport);assert.equal(r.rows.length,0);assert.equal(r.referenceRows.length,0);assert.equal(r.referenceInspections.length,1);assert.equal(r.monthly,null);}
  for(const airport of ['ZZZ','EDI']){const r=run('2026-01-05',airport);assert.equal(r.rows.length,0);assert.equal(r.referenceRows.length,0);assert.equal(r.monthly,null,'unknown / UK outside England cannot become other international');}
  for(const airport of ['ZZZ','EDI','GLA','CWL','BFS']) for(const reverse of [false,true]) {
   const item=event('2026-01-05',reverse?airport:'GRU');item.destination=reverse?'GRU':airport;
   const r=calculate([item],{year:2026,month:1,days:[],base:'GRU'},new Date('2026-01-05T15:00:00Z'));
   assert.equal(r.rows.length,0,`${item.origin}->${item.destination}: no hidden domestic fallback`);assert.equal(r.referenceRows.length,0);assert.equal(r.monthly,null);
   for(const category of ['other_international','england','domestic']){overrides[airport]=category;const blocked=calculate([item],{year:2026,month:1,days:[],base:'GRU'});assert.equal(blocked.rows.length,0);assert.equal(blocked.referenceRows.length,0);delete overrides[airport];}
  }
  const early=event('2026-01-05','GRU','04:10','12:00');early.destination='ZZZ';
  const baseProven=calculate([early],{year:2026,month:1,days:[],base:'GRU'});
  assert.equal(baseProven.rows.find(r=>r.label==='Café').value,27.36,'independent base breakfast survives unrelated unknown destination');assert.equal(baseProven.rows.find(r=>r.label==='Táxi').value,27.36);assert.equal(baseProven.rows.some(r=>r.label==='Almoço'),false);assert.equal(baseProven.monthly,null);
  const mixedReference=calculate([event('2026-01-04','GRU'),event('2026-01-05','JFK')],{year:2026,month:1,days:[],base:'GRU'},new Date('2026-01-05T15:00:00Z'));
  assert.equal(vm.runInNewContext(captureExpression,{forecast:mixedReference}),false,'actual canonical capture completeness remains false');
  const payment=paymentModule.exports.nextAllowancePayment(mixedReference.rows,mixedReference.unclassifiedItems,['2025-12','2026-01'],new Date('2026-01-05T15:00:00Z'),['2025-12-31','2026-01-01','2026-01-02','2026-01-03','2026-01-04','2026-01-05','2026-01-06']);
  assert.equal(payment.totals,null);assert.equal(payment.calculationPartial,true);assert.deepEqual({...payment.calculationTotals},{BRL:109.44});assert(payment.issues.some(x=>x.includes('custo de vida local')));assert.equal(payment.lines.some(x=>x.currency==='USD'),false,'minimum reference never appears as a confirmed foreign payment');
  const range={valid:true,start:'2026-01-01',end:'2026-12-31'};
  const all=scoped([{perdiem:jan},{perdiem:dec}],range,[]);assert.deepEqual({...all.referenceTotalsByCurrency},{USD:60.4});assert.equal(all.referenceRows.length,2);assert.equal(all.monthly,null);assert.equal(all.nativeSummary.complete,false);
  const emptyFirst=calculate([],{year:2026,month:1,days:[],base:'GRU'});const noLeak=scoped([{perdiem:emptyFirst},{perdiem:jan},{perdiem:dec}],range,[]);assert.equal(noLeak.referenceRows.length,2);assert.deepEqual({...noLeak.referenceTotalsByCurrency},{USD:60.4});
  const week=scoped([{perdiem:jan},{perdiem:dec}],{valid:true,start:'2026-12-01',end:'2026-12-07'},[]);assert.equal(week.referenceRows.length,1);assert.deepEqual({...week.referenceTotalsByCurrency},{USD:31.7});assert.equal(week.unclassifiedItems.length,1);assert.equal(week.monthly,null);
  const empty=scoped([{perdiem:jan},{perdiem:dec}],{valid:true,start:'2026-02-01',end:'2026-02-07'},[]);assert.equal(empty.referenceRows.length,0);assert.deepEqual({...empty.referenceTotalsByCurrency},{});
 }
 // Native foreign account manual is independent; no domestic learned amount transfers to USD.
 manual.crewcheck_perdiem_rate_north_america=44;result=run('2026-01-05','JFK');assert.equal(result.rows[0].value,44);assert.equal(result.referenceRows.length,0);assert.equal(result.rows[0].currency,'USD');assert.match(result.rows[0].source,/Calibração manual desta conta/);assert.doesNotMatch(result.rows[0].source,/Destino internacional reconhecido na tabela do ACT/);assert.equal(result.nativeSummary.complete,true);assert.equal(result.monthly,null,'missing FX remains missing');delete manual.crewcheck_perdiem_rate_north_america;
 manual.crewcheck_perdiem_rate_domestic=0;login('synthetic-unconfirmed');assert.equal(run('2026-01-05').rows[0].value,0);delete manual.crewcheck_perdiem_rate_domestic;
 const rate={key:'per_diem.lunch',label:'Synthetic bounded meal',unit:'meal',value:180,currency:'BRL',effectiveFrom:'2026-01-04',effectiveTo:'2026-01-06',sourceDocument:'synthetic-only',sourceFingerprint:'synthetic-bounded',confidence:'high',confirmed:true,valueOrigin:'printed'};
 assert.equal(learning.saveConfirmedFinancialRates(learning.mergeConfirmedRates([], [rate])),true);assert.equal(run('2026-01-05').rows[0].value,180);assert.equal(run('2026-01-07').rows.length,0);assert.equal(run('2026-01-05','JFK').rows.length,0);
 console.log('PASS actual Home config/calculate/range with real catalog+journal+resolver: unknown employer, both profiles, owned/manual precedence, dated floors, unresolved scope, per-row provenance and native-only multi-month/week reference aggregation; TZ='+process.env.TZ);
}finally{m.cleanup();globalThis.localStorage=old.localStorage;globalThis.window=old.window;}
