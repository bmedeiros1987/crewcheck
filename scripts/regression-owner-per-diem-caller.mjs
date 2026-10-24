import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadClientModules } from './lib/ts-module-harness.mjs';
const modules = loadClientModules({ files: ['ownerPerDiemReview','financialSettingStore','financialStatementLearning','financialAmounts','financialJourneyGrouping','financialIntervalEvidence','compensationPolicy','financialForecastPeriods'].map(name=>'client/src/lib/'+name+'.ts') });
const previous = {localStorage:globalThis.localStorage,window:globalThis.window}, storage = new Map();
globalThis.localStorage = {getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))};
globalThis.window = new EventTarget();
const login = id => {localStorage.setItem('crewcheck_auth_user',JSON.stringify({id,role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-'+id);};
try {
 const settings=modules.load('financialSettingStore'),learning=modules.load('financialStatementLearning'),{ownerPerDiemReview}=modules.load('ownerPerDiemReview');
 const source=fs.readFileSync('client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',source,99,true,ts.ScriptKind.TSX);
 const names=['perDiemConfig','calculatePerDiem','moneyBRL','moneyCurrency','readNumberSetting','readOptionalNumberSetting'],functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text));assert.equal(functions.length,6);
 const storageNode=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='storage'));assert(storageNode);
 const context=vm.createContext({...learning,...settings,localStorage:globalThis.localStorage,readAccountNotificationSetting:()=>undefined,...modules.load('financialAmounts'),...modules.load('financialJourneyGrouping'),...modules.load('financialIntervalEvidence'),...modules.load('compensationPolicy'),...modules.load('financialForecastPeriods'),
 resolveActFinancialRules:()=>({profileLabel:'Synthetic reference',legalReference:'synthetic-only',version:'test',breakfastPercent:.25,perDiem:[{key:'domestic',label:'Synthetic domestic',currency:'BRL',mainMeal:100}]}),
 loadAirportPerDiemOverrides:()=>({}),resolvePerDiemRule:()=>({rateKey:'domestic',airport:'TEST',reason:'synthetic'}),isOperationalEvent:()=>true,financialEventCode:e=>e.day.type,
 eventStartDateTime:e=>new Date(e.start),eventEndDateTime:e=>new Date(e.end),dateChip:d=>d.toISOString().slice(0,10)});
 vm.runInContext(ts.transpileModule(storageNode.getText(ast)+'\n'+functions.map(n=>n.getText(ast)).join('\n')+'\nglobalThis.calculate=calculatePerDiem;',{compilerOptions:{target:99}}).outputText,context);
 const month='2032-08',iso=month+'-06',roster={year:2032,month:8,base:'TEST'};
 const reserve=date=>({id:'synthetic-reserve',kind:'duty',origin:'TEST',destination:'TEST',start:date+'T04:10:00-03:00',end:date+'T12:30:00-03:00',day:{type:'ASB',dutyReport:'04:10',dutyDebrief:'12:30',dutyReportSource:'published',dutyDebriefSource:'published'}});
 const run=(date=iso)=>context.calculate([reserve(date)],roster,new Date(date+'T15:00:00Z'));
 const row=(result,label)=>result.rows.find(r=>r.label===label);
 login('synthetic-a');
 const input={ownerId:'synthetic-a',month,meal:'196,00',reference:'Synthetic bounded confirmation',breakfastQuarter:false,taxiQuarter:false};
 const save=changes=>{const draft=ownerPerDiemReview({...input,...changes});assert(draft.length);const next=learning.mergeConfirmedRates(learning.readConfirmedFinancialRates(),draft.map(r=>({...r,confirmed:true})));assert.equal(learning.saveConfirmedFinancialRates(next,learning.financialRateSession()),true);};
 save({});let result=run();assert.equal(row(result,'Almoço').value,196);assert.equal(row(result,'Café').value,25);assert.equal(row(result,'Café').rateSource,'act');assert.equal(row(result,'Táxi'),undefined);
 save({breakfastQuarter:true,taxiQuarter:true});result=run();assert.equal(row(result,'Café').value,49);assert.equal(row(result,'Táxi').value,49);assert.equal(row(result,'Café').rateSource,'learned');
 // A new review unchecks both without deleting the immutable rate archive.
 save({meal:'200,00'});result=run();assert.equal(row(result,'Almoço').value,200);assert.equal(row(result,'Café').value,25);assert.equal(row(result,'Café').rateSource,'act');assert.equal(row(result,'Táxi'),undefined);
 assert(learning.readConfirmedFinancialRates().some(r=>r.key==='per_diem.taxi'&&r.value===49),'old review remains auditable');
 const stored=JSON.stringify([...storage]);storage.clear();for(const [k,v] of JSON.parse(stored))storage.set(k,v);result=run();assert.equal(row(result,'Café').value,25);assert.equal(row(result,'Táxi'),undefined,'persisted consent remains off after reread');
 assert.equal(settings.writeFinancialSetting('crewcheck_perdiem_rate_domestic','80'),true);save({breakfastQuarter:true,taxiQuarter:true});result=run();assert.equal(row(result,'Almoço').value,196,'explicit monthly owner review prevails over a legacy manual principal');assert.equal(row(result,'Café').value,49);assert.equal(settings.readFinancialSetting('crewcheck_perdiem_rate_domestic'),'80','manual value is preserved');
 assert.equal(row(run('2032-09-06'),'Almoço').value,80,'outside the reviewed month manual principal resumes');
 login('synthetic-b');result=run();assert.equal(row(result,'Almoço').value,100);assert.equal(row(result,'Café').value,25);assert.equal(row(result,'Táxi'),undefined);assert.equal(settings.readFinancialSetting('crewcheck_perdiem_rate_domestic'),'');login('synthetic-a');assert.equal(settings.readFinancialSetting('crewcheck_perdiem_rate_domestic'),'80');
 console.log('PASS real per-diem caller: unchecked consent, edit/re-read, account/month isolation, independent source and bounded precedence over preserved manual settings');
} finally {modules.cleanup();Object.assign(globalThis,previous);}
