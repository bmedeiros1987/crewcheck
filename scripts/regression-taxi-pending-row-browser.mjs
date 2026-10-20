import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadClientModules } from './lib/ts-module-harness.mjs';
const modules = loadClientModules({files:['client/src/lib/financialIntervalEvidence.ts','client/src/lib/compensationPolicy.ts','client/src/lib/financialJourneyGrouping.ts','client/src/lib/financialForecastPeriods.ts','client/src/lib/financialAmounts.ts','client/src/lib/financialStatementLearning.ts'],stubs:{authClient:'exports.getStoredUser=()=>({id:"synthetic-owner",role:"crew"});exports.getToken=()=>"synthetic-token";'}});
try {
 const policy=modules.load('compensationPolicy'), learning=modules.load('financialStatementLearning');
 const document='DEMONSTRATIVO DE DIARIAS\nDe 2032-10-01 até 2032-10-07\nCAFE R$ 25,00\nTAXI R$ 31,50\nTotal depositado R$ 56,50';
 const learned=learning.learnPerDiemStatement(document,'synthetic-taxi.txt');
 assert.equal(learned.rates.find(x=>x.key==='per_diem.taxi')?.value,31.5);
 assert.equal(learned.rates.find(x=>x.key==='per_diem.taxi')?.unit,'amount');
 assert.equal(learned.rates.find(x=>x.key==='per_diem.breakfast')?.value,25);
 assert.equal(learned.rates.every(x=>!x.confirmed),true);
 assert.equal(learning.learnPerDiemStatement(document.replace('Total depositado','TAXI R$ 40,00\nTotal depositado'),'synthetic-conflict.txt').rates.some(x=>x.key==='per_diem.taxi'),false);
 const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};globalThis.window={dispatchEvent:()=>{}};
 const rate=learned.rates.find(x=>x.key==='per_diem.taxi');
 assert.equal(learning.confirmedRateValueAt('per_diem.taxi','2032-10-05'),null);
 assert.equal(learning.saveConfirmedFinancialRates([{...rate,confirmed:true}]),true);
 assert.equal(learning.confirmedRateValueAt('per_diem.taxi','2032-10-05'),31.5);
 assert.equal(learning.confirmedRateValueAt('per_diem.taxi','2032-10-08'),null);
 const home=fs.readFileSync('client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',home,99,true,ts.ScriptKind.TSX);
 const names=['eventStartDateTime','eventEndDateTime','calculatePerDiem'];
 const fns=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text));assert.equal(fns.length,3);
 let taxiRate=31.5;
 const context=vm.createContext({...policy,...modules.load('financialIntervalEvidence'),...modules.load('financialJourneyGrouping'),...modules.load('financialForecastPeriods'),...modules.load('financialAmounts'),
 perDiemConfig:()=>({taxiRate,rates:{domestic:{mainMeal:100,currency:'BRL',label:'SYNTHETIC'}},domesticBreakfast:25,domesticMainMealSource:'synthetic',domesticBreakfastSource:'synthetic',breakfastPercent:.25,exchangeRates:{BRL:1},source:'SYNTHETIC',act:{version:'synthetic'}}),
 loadAirportPerDiemOverrides:()=>({}),resolvePerDiemRule:origin=>({rateKey:'domestic',airport:origin,reason:'synthetic'}),isOperationalEvent:()=>true,financialEventCode:e=>e.day.type,readOptionalNumberSetting:()=>null,dateChip:d=>d.toISOString().slice(0,10),moneyCurrency:(v,c)=>`${c} ${v}`});
 vm.runInContext(ts.transpileModule(fns.map(n=>n.getText(ast)).join('\n')+'\nglobalThis.calculate=calculatePerDiem;',{compilerOptions:{target:99}}).outputText,context);
 const at=(clock,iso='2032-10-05')=>`${iso}T${clock}:00-03:00`;
 const flight=(report='04:00',origin='BSB',destination='GRU',departure='06:00',arrival='08:00',iso='2032-10-05')=>({id:'SYN-FLIGHT',kind:'flight',origin,destination,day:{type:'VOO',dutyReport:report,dutyReportSource:'published'},canonical:{journeyId:'SYN-JOURNEY',startDateTime:at(departure,iso),endDateTime:at(arrival,iso),leg:{departureTime:departure,arrivalTime:arrival}}});
 const roster={year:2032,month:10,base:'BSB'};
 const run=events=>context.calculate(events,roster,new Date(at('12:00')));
 const taxis=result=>Array.from(result.rows).filter(x=>x.label==='Táxi');

 const missing=(()=>{taxiRate=null;return run([flight()]);})();
 const confirmed=(()=>{taxiRate=31.5;return run([flight()]);})();
 const zero=(()=>{taxiRate=0;return run([flight()]);})();
 const ineligible=(()=>{taxiRate=null;return run([flight('04:00','JPA')]);})();
 assert.equal(missing.monthlyRows.some(x=>x.label==='Táxi'),false);
 assert.equal(missing.monthly,null,'pending tariff never becomes a complete numeric total');
 assert.equal(confirmed.monthlyRows.find(x=>x.label==='Táxi').value,31.5);
 const unchanged=JSON.stringify(missing);
 assert.equal(missing.monthlyUnclassifiedItems.filter(x=>x.pendingKind==='taxi_rate').length,1);
 assert.equal(ineligible.monthlyUnclassifiedItems.filter(x=>x.pendingKind==='taxi_rate').length,0);
 const view=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='PerDiemMonthView');assert(view);
 const {build}=await import('esbuild');const http=await import('node:http');const {createRequire}=await import('node:module');
 const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
 const entry=`import FinancialStatementImporter from './client/src/components/finance/FinancialStatementImporter';import React,{useState,useMemo} from 'react';import{createRoot}from'react-dom/client';
 const buildLegs=()=>[], calculatePerDiem=()=>window.forecast;
 const useFinancialPrivacy=()=>({hidden:window.hidden,amount:v=>window.hidden?'••••':v,text:v=>window.hidden?'••••':v});
 const isAdmin=()=>window.admin;const Brand=()=>null,BriefcaseBusiness=()=>null,CalendarDays=()=>null,Plane=()=>null,DollarSign=()=>null;
 const FinancialScreen=({children})=><>{children}</>,MoneyText=({value})=><>{value}</>;
 const KpiCard=({title,value,detail})=><article>{title} {value} {detail}</article>;
 const forecastSummaryValue=()=> 'SYNTHETIC SUMMARY',dateChip=d=>d.toISOString().slice(0,10);
 ${view.getText(ast)}
 const root=createRoot(document.getElementById('root'));window.render=(forecast,admin=false,hidden=false)=>{window.forecast=forecast;window.admin=admin;window.hidden=hidden;root.render(<PerDiemMonthView key={Math.random()} bundle={{roster:{year:2032,month:10}}} forecastOverride={forecast}/>);};`;
 const js=(await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'pdf-worker-asset',setup(b){b.onResolve({filter:/\?url$/},()=>({path:'offline-worker',namespace:'asset'}));b.onLoad({filter:/.*/,namespace:'asset'},()=>({contents:'export default "offline-worker"',loader:'js'}));}}]})).outputFiles[0].text;
 const server=http.createServer((req,res)=>{res.setHeader('content-type','text/html');res.end('<div id="root"></div><script>'+js.replaceAll('</script>','<\\/script>')+'</script>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}});
 try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.addInitScript(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-taxi-owner',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-offline-token');});await page.goto('http://127.0.0.1:'+server.address().port);
 const render=async(f,a=false,h=false)=>{await page.evaluate(([f,a,h])=>window.render(f,a,h),[JSON.parse(JSON.stringify(f)),a,h]);await page.waitForTimeout(50);};
 await render(missing);const pending=page.locator('[data-taxi-rate-pending="true"]');assert.equal(await pending.count(),1);assert.equal(await pending.locator('b').innerText(),'—');assert.equal(await page.getByText('Sem itens previstos',{exact:true}).count(),0);await pending.locator('summary').click();assert.equal(await page.getByRole('link',{name:'Abrir revisão de tarifas'}).count(),0);
 await page.locator('[data-taxi-rate-review]>summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-taxi-rate-review]').getAttribute('open'),'','review opens by keyboard');assert.deepEqual(errors,[]);assert.equal(await page.locator('[data-taxi-rate-review] input[type=file]').count(),1,'actual importer available for owner review');assert.equal(await page.getByText('Confirmar tarifa informada pelo titular',{exact:true}).count(),1);assert.equal(await page.getByRole('link',{name:'Abrir revisão de tarifas'}).count(),0);
 await page.evaluate(()=>{localStorage.removeItem('crewcheck_auth_token');window.dispatchEvent(new Event('crewcheck:auth-expired'));});await page.getByText('Entre na conta proprietária para revisar tarifas. Visitantes não têm acesso financeiro.',{exact:true}).waitFor();assert.equal(await page.locator('[data-taxi-rate-review] input[type=file]').count(),0,'auth expiry removes importer controls');
 await render(zero);assert.equal(await pending.count(),0);assert.equal(await page.locator('[data-financial-currency=BRL]').filter({hasText:'Táxi'}).count(),1,'explicit zero remains numeric taxi');
 await render(confirmed);assert.equal(await pending.count(),0);assert.equal(await page.locator('[data-financial-currency="BRL"]').filter({hasText:'Táxi'}).count(),1);
 await render(ineligible);assert.equal(await pending.count(),0);
 await render(missing,false,true);assert.equal(await pending.locator('b').innerText(),'—');await pending.locator('summary').click();assert.equal(await pending.locator('small').innerText(),'••••');assert.equal(await page.locator('.cc-per-diem-items').innerText().then(t=>t.includes('31,50')),false);assert.deepEqual(errors,[]);assert.equal(JSON.stringify(missing),unchanged,'rendering does not add pending taxi to rows or totals');
 console.log('PASS actual Home calculator + extracted PerDiemMonthView: missing taxi is pending dash outside numeric rows, confirmed taxi unchanged, ineligible absent, existing actual importer review, explicit zero, privacy masking; offline synthetic UI.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
}finally{modules.cleanup();}
