import assert from 'node:assert/strict';
import {createFinancialFxService,createFinancialFxHandler,FINANCIAL_FX_PATH} from '../server/financial-fx.mjs';
import {convertFinancialMinor,estimateAllowanceBrl} from '../shared/financialFx.mjs';
let instant=Date.parse('2032-02-09T12:00:00Z'),calls=0,fail=false;
const fetchImpl=async(url,options)=>{calls++;assert(url.startsWith('https://api.frankfurter.dev/v2/rates?base=BRL'));assert(!/token|amount|email|owner/.test(url));assert.deepEqual(Object.keys(options.headers),['accept']);if(fail)throw Error('synthetic offline');return new Response(JSON.stringify([{base:'BRL',quote:'USD',rate:.2,date:'2032-02-08',providers:[{key:'SYN',date:'2032-02-07'}]},{base:'BRL',quote:'EUR',rate:.1,date:'2032-02-08'}]));};
const service=createFinancialFxService({fetchImpl,now:()=>instant});
const results=await Promise.all(Array.from({length:12},()=>service.read()));assert.equal(calls,1,'one shared in-flight query');assert(results.every(r=>r.state==='available'));const quotes=results[0].quotes;assert.equal(quotes.USD.asOf,'2032-02-08');assert.equal(quotes.USD.retrievedAt,'2032-02-09T12:00:00.000Z');assert.equal(quotes.USD.contributors[0].asOf,'2032-02-07');
const convert=args=>convertFinancialMinor({quotes,today:'2032-02-09',...args});assert.equal(convert({from:'USD',to:'BRL',amountMinor:100}).amountMinor,500);assert.equal(convert({from:'BRL',to:'USD',amountMinor:1000}).amountMinor,200);assert.equal(convert({from:'USD',to:'EUR',amountMinor:1000}).amountMinor,500);
const before=JSON.stringify(quotes);estimateAllowanceBrl({lines:[{id:'synthetic-usd',currency:'USD',value:10}],quotes,today:'2032-02-09'});assert.equal(JSON.stringify(quotes),before);
assert.equal(convert({from:'USD',to:'EUR',amountMinor:100,quotes:{...quotes,EUR:{rate:'10',asOf:'2032-02-08',source:'manual'}}}).state,'incompatible_methods');assert.equal(convert({from:'USD',to:'BRL',amountMinor:100,quotes:{USD:{...quotes.USD,base:'EUR'}}}).state,'incompatible_pair');
results[0].quotes.USD.rate='999';assert.equal((await service.read()).quotes.USD.rate,'0.2','callers cannot mutate central cache');assert.equal(calls,1);
instant+=86400001;fail=true;const stale=await service.read();assert.equal(stale.state,'stale');assert.equal(stale.quotes.USD.asOf,'2032-02-08');await service.read();assert.equal(calls,2,'failed refresh has retry cooldown');instant+=7*86400000;assert.equal((await service.read()).state,'unavailable');
for(const rows of [[{base:'USD',quote:'BRL',rate:5,date:'2032-02-08'}],[{base:'BRL',quote:'USD',rate:0,date:'2032-02-08'}],[{base:'BRL',quote:'USD',rate:.2,date:'2032-02-10'}],[{base:'BRL',quote:'USD',rate:.2,date:'2020-01-01'}],{}]){const bad=createFinancialFxService({now:()=>Date.parse('2032-02-09T12:00:00Z'),fetchImpl:async()=>new Response(JSON.stringify(rows))});assert.equal((await bad.read()).state,'unavailable');}
let handlerReads=0;const owner={authenticated:true,role:'owner',ownerId:'synthetic@example.invalid'};const run=async({identity=owner,enabled=true,method='GET',query=''}={})=>{const handler=createFinancialFxHandler({enabled:()=>enabled,identityProvider:()=>identity,service:{read:async()=>{handlerReads++;return {state:'available',quotes,method:'blended_daily'};}}});let status,body;const headers={};await handler({method},{setHeader:(k,v)=>headers[k]=v,writeHead:(s,h)=>{status=s;Object.assign(headers,h);},end:text=>body=JSON.parse(text)},new URL('https://synthetic.invalid'+FINANCIAL_FX_PATH+query));return {status,body,headers};};
assert.equal((await run({identity:null})).status,403);assert.equal((await run({enabled:false})).status,503);assert.equal((await run({method:'POST'})).status,405);assert.equal((await run({query:'?base=USD'})).status,400);assert.equal(handlerReads,0);const good=await run();assert.equal(good.status,200);assert.match(good.headers['cache-control'],/no-store/);assert.equal(handlerReads,1);
console.log('PASS free keyless FX: fixed public pairs, daily central cache, one in-flight query, explicit quote direction/inverse/cross, source/observation/retrieval separation, stale/error cooldown, no manual blend, immutable original amounts, strict read-only authenticated route, default OFF');

// Exercise the actual TSX loader and rendered calculator with synthetic identities.
const {default:ts}=await import('typescript');
const {default:vm}=await import('node:vm');
const {default:fs}=await import('node:fs');
const React=await import('react');
const jsx=await import('react/jsx-runtime');
const {renderToStaticMarkup}=await import('react-dom/server');
const fxMath=await import('../shared/financialFx.mjs');
const money=await import('../shared/financialMoney.mjs');
function compile(relative,stubs,Clock=Date){
 const source=ts.transpileModule(fs.readFileSync(relative,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};vm.runInNewContext(source,{exports,require:name=>{if(name in stubs)return stubs[name];throw Error('Unexpected import '+name);},setTimeout,clearTimeout,AbortController,Date:Clock,console});return exports;
}
const provider=compile('client/src/components/finance/FinancialFxProvider.tsx',{'react':React,'react/jsx-runtime':jsx,'@/lib/authClient':{},'@/lib/financialFxReference':{},'@shared/financialFx.mjs':fxMath});
let clock=Date.parse('2032-02-09T12:00:00Z'),requestCount=0,reply;
const valid={state:'available',method:'blended_daily',quotes:{USD:{base:'BRL',quote:'USD',rate:'0.2',asOf:'2032-02-08',retrievedAt:new Date(clock).toISOString(),source:'SYNTHETIC reference',method:'blended_daily'}}};
const request=async()=>{requestCount++;if(reply instanceof Error)throw reply;return reply;};
const loader=provider.createFinancialFxLoader({request,now:()=>clock});
reply=valid;const first=await loader('session-A',true);assert.equal(first.state,'available');assert.equal(fxMath.convertFinancialMinor({amountMinor:20000,from:'USD',to:'BRL',quotes:first.quotes,today:'2032-02-09'}).amountMinor,100000);
reply=Object.assign(Error('synthetic timeout'),{name:'AbortError'});clock+=1800001;const retained=await loader('session-A',true);assert.equal(retained.state,'stale');assert.equal(retained.reason,'temporary');assert.equal(retained.quotes.USD.retrievedAt,valid.quotes.USD.retrievedAt,'failure does not renew quote age');const beforeCooldown=requestCount;await loader('session-A',true);assert.equal(requestCount,beforeCooldown);
clock+=300001;reply=Object.assign(Error('synthetic OFF'),{status:503,code:'FINANCIAL_FX_NOT_ENABLED'});const off=await loader('session-A',true);assert.equal(off.state,'unavailable');assert.equal(off.reason,'disabled');assert.equal(Object.keys(off.quotes).length,0,'explicit OFF clears warm cache');
reply=valid;await loader('session-transient503',true);clock+=1800001;reply=Object.assign(Error('temporary503'),{status:503});const temporary503=await loader('session-transient503',true);assert.equal(temporary503.state,'stale');assert.equal(temporary503.quotes.USD.retrievedAt,valid.quotes.USD.retrievedAt);
reply=valid;await loader('session-B',true);reply=Object.assign(Error('synthetic denied'),{status:403});clock+=1800001;assert.equal((await loader('session-B',true)).reason,'access');assert.equal(Object.keys((await loader('session-B')).quotes).length,0);
reply=Error('synthetic offline');assert.equal((await loader('session-C',true)).state,'unavailable','new session cannot inherit stale references');
for(const patch of [{rate:'0'},{asOf:'2032-02-30'},{asOf:'2032-02-10'},{retrievedAt:'2020-01-01T00:00:00Z'},{base:'USD',quote:'BRL'},null]){
 const bad=provider.createFinancialFxLoader({now:()=>clock,request:async()=>({...valid,quotes:{USD:patch===null?null:{...valid.quotes.USD,...patch}}})});const value=await bad('synthetic');assert.equal(value.state,'unavailable');assert.equal(value.reason,'invalid');
}
const expiration=provider.createFinancialFxLoader({request,now:()=>clock});reply=valid;await expiration('A');clock+=7*86400000+1;reply=Error('offline');assert.equal(Object.keys((await expiration('A',true)).quotes).length,0,'stale cannot outlive original observation/retrieval');
let release;const race=provider.createFinancialFxLoader({request:()=>new Promise(resolve=>{release=resolve;}),now:()=>Date.parse('2032-02-09T12:00:00Z')});const old=race('A');const finishA=release;const next=race('B');const finishB=release;finishB({...valid,state:'stale'});await next;finishA(valid);await old;assert.equal((await race('B')).state,'stale','late previous session never publishes into new cache');
const timeout=provider.createFinancialFxLoader({timeoutMs:1,request:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('synthetic aborted'))))});assert.equal((await timeout('A')).reason,'temporary');
// Each currency expires independently, including inside the client TTL.
for(const age of ['observation','retrieval'])for(const revalidate of [false,true]){
 let mixedClock=Date.parse('2032-02-09T23:50:00Z'),mixedCalls=0,mixedFail=false;
 const retrievedAt='2032-02-09T23:50:00Z';
 const quote=(currency,rate)=>({base:'BRL',quote:currency,rate,asOf:'2032-02-08',retrievedAt,source:'SYNTHETIC mixed dates',method:'blended_daily'});
 const original={USD:{...quote('USD','0.2'),...(age==='observation'?{asOf:'2032-02-02'}:{asOf:'2032-02-02',retrievedAt:'2032-02-02T23:50:00Z'})},EUR:quote('EUR','0.1'),GBP:quote('GBP','0.05')};
 const mixed=provider.createFinancialFxLoader({now:()=>mixedClock,request:async()=>{mixedCalls++;if(mixedFail)throw Object.assign(Error('synthetic temporary503'),{status:503});return {state:'available',method:'blended_daily',quotes:mixedCalls>2?{...original,USD:quote('USD','0.2')}:original};}});
 assert.equal((await mixed('mixed-A')).state,'available');mixedClock=Date.parse(age==='observation'?'2032-02-10T00:05:00Z':'2032-02-09T23:55:00Z');mixedFail=true;
 const partial=await mixed('mixed-A',revalidate);
 assert.equal(mixedCalls,2,'partial expiry forces refresh even inside the existing TTL');assert.equal(partial.state,'stale');assert.deepEqual(Object.keys(partial.quotes),['EUR','GBP']);
 assert.equal(partial.quotes.EUR.retrievedAt,retrievedAt,'subset keeps original retrieval age');assert.equal(partial.quotes.EUR.asOf,'2032-02-08');
 const convert=(from,to)=>fxMath.convertFinancialMinor({amountMinor:1000,from,to,quotes:partial.quotes,today:'2032-02-10'});
 assert.equal(convert('EUR','BRL').amountMinor,10000);assert.equal(convert('BRL','EUR').amountMinor,100);assert.equal(convert('EUR','GBP').amountMinor,500);
 for(const [from,to] of [['USD','BRL'],['EUR','USD'],['USD','EUR']])assert.equal(convert(from,to).amountMinor,null,'missing expired currency never supplies a cross rate');
 await mixed('mixed-A',true);assert.equal(mixedCalls,2,'transient cooldown still applies');
 mixedClock+=300001;mixedFail=false;const recovered=await mixed('mixed-A',true);assert.equal(recovered.state,'available');assert.equal(mixedCalls,3);assert.deepEqual(Object.keys(recovered.quotes),['USD','EUR','GBP'],'a newly validated response can restore a currency');
 mixedClock=Date.parse('2032-02-17T00:05:00Z');mixedFail=true;const expired=await mixed('mixed-A',true);assert.equal(expired.state,'unavailable');assert.equal(Object.keys(expired.quotes).length,0,'no fallback remains after all original references expire');
}
console.log('PASS independent currency expiry: observation/retrieval boundaries, subset revalidation inside TTL, transient fallback without renewed age, missing cross rates, recovery and complete expiry');

// Render the real JSX with hook inputs only; no real account, browser or API calls.
let draft={key:'synthetic:synthetic@example.invalid:synthetic-token',amount:'200',from:'USD',to:'BRL',rate:'',asOf:'',manualOpen:false},fx=off;
const calculator=compile('client/src/components/finance/CurrencyCalculator.tsx',{'react':{...React,useEffect:()=>{},useState:()=>[draft,change=>{draft=typeof change==='function'?change(draft):change;}]},'react/jsx-runtime':jsx,'./FinancialFxProvider':{useFinancialFx:()=>({...fx,mode:'automatic'}),FinancialFxSourceControl:()=>null,financialFxMessage:provider.financialFxMessage},'@/lib/authClient':{getStoredUser:()=>({id:'synthetic',email:'synthetic@example.invalid'}),getToken:()=> 'synthetic-token'},'lucide-react':{Calculator:()=>null},'@shared/financialFx.mjs':fxMath,'@shared/financialMoney.mjs':money,'./FinancialPrivacy':{useFinancialPrivacy:()=>({hidden:false,amount:x=>x}),FinancialPrivacyToggle:()=>null},'./persistent-history.css':{}},class extends Date{constructor(...args){super(...(args.length?args:['2032-02-09T12:00:00Z']));}}).default;
const markup=()=>renderToStaticMarkup(calculator());
assert.match(markup(),/Cotação automática ainda não está ativada/);assert.match(markup(),/Informar cotação e data/);
const find=(node,type)=>{if(!node||typeof node!=='object')return null;if(node.type===type)return node;for(const child of [node.props?.children].flat(Infinity)){const result=find(child,type);if(result)return result;}return null;};
find(calculator(),'button').props.onClick();assert.equal(draft.manualOpen,true);assert.match(markup(),/<details open="">/);assert.match(markup(),/Data da cotação/);assert.equal(draft.rate,'','shortcut does not fabricate rate');assert.equal(draft.asOf,'');
fx=first;assert.match(markup(),/1\.000,00/);assert.match(markup(),/SYNTHETIC reference · referência 2032-02-08/);
draft={...draft,from:'BRL',to:'USD',amount:'10'};assert.match(markup(),/2,00/);
draft={...draft,from:'USD',to:'BRL',rate:'0',asOf:'2032-02-08'};assert.match(markup(),/Cotação\/data indisponível/);
console.log('PASS actual FX loader/calculator: explicit OFF/access vs temporary, timeout, original-age bounded stale cache, session race, invalid/zero/future/inverse payloads, USD200, visible manual shortcut and source/date');

// The allowance statement consumes the same quote set without changing native
// entitlements, saved history, provider mode, or original statement metadata.
const originalRows=Object.freeze([
 Object.freeze({eventId:'synthetic-foreign',iso:'2032-02-08',label:'Meal',value:20.01,currency:'USD',convertedBRL:999,source:'synthetic original',exchangeRate:999}),
 Object.freeze({eventId:'synthetic-domestic',iso:'2032-02-08',label:'Meal',value:100,currency:'BRL',convertedBRL:100,source:'synthetic original',exchangeRate:1}),
]);
const projected=fxMath.projectAllowanceFxRows(originalRows,first.quotes,'2032-02-09');
assert.equal(projected[0].convertedBRL,100.05);
assert.equal(projected[0].exchangeRate,5,'the audit rate keeps the explicit BRL/base inverse direction');
assert.equal(projected[1].convertedBRL,100,'national allowance is never converted');
assert.equal(projected[0].value,20.01);assert.equal(projected[0].source,'synthetic original');
assert.equal(projected[0].fxReferences[0].asOf,'2032-02-08');
assert.equal(projected[0].fxReferences[0].retrievedAt,first.quotes.USD.retrievedAt);
assert.equal(originalRows[0].convertedBRL,999,'projection is ephemeral, never rewrites the source row');
for(const refs of [{},{USD:{...first.quotes.USD,rate:'0'}},{USD:{...first.quotes.USD,asOf:'2032-02-10'}},{USD:{...first.quotes.USD,asOf:'2032-02-01'}}]) {
 const unavailable=fxMath.projectAllowanceFxRows(originalRows,refs,'2032-02-09');
 assert.equal(unavailable[0].convertedBRL,null);assert.equal(unavailable[0].value,20.01);assert.equal(unavailable[1].convertedBRL,100);
}
const mixed=fxMath.projectAllowanceFxRows([...originalRows,{...originalRows[0],currency:'EUR'}],{...first.quotes,EUR:{...first.quotes.USD,quote:'EUR',asOf:'2032-02-07'}},'2032-02-09');
assert.equal(mixed[0].convertedBRL,null);assert.equal(mixed[2].convertedBRL,null,'dates are coherent across the selected projection');
const manualQuote={base:'USD',quote:'BRL',rate:'5',asOf:'2032-02-08',source:'synthetic reviewed manual',method:'account_manual'};
assert.equal(fxMath.projectAllowanceFxRows(originalRows,{USD:manualQuote},'2032-02-09')[0].convertedBRL,100.05);

const {loadClientModules}=await import('./lib/ts-module-harness.mjs');
const allowanceModules=loadClientModules({files:['client/src/lib/financialForecastPeriods.ts','client/src/lib/financialHistoryPeriods.ts']});
try {
 const homeSource=fs.readFileSync('client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',homeSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const functions=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&['scopedFinancialForecast','PerDiemView'].includes(node.name?.text));assert.equal(functions.length,2);
 const ownerFx={quotes:first.quotes,setMode:()=>{}},roster={year:2032,month:2,days:[]},snapshot={roster,perdiem:{monthlyRows:originalRows,monthlyUnclassifiedItems:[]}},range={start:'2032-02-01',end:'2032-02-29',valid:true,kind:'month'};
 const context=vm.createContext({...allowanceModules.load('financialForecastPeriods'),...allowanceModules.load('financialHistoryPeriods'),...fxMath,React,
  useFinancialFx:()=>ownerFx,financeSnapshot:()=>snapshot,moneyCurrency:(value,currency)=>currency+value,
  FinancialHistoryExplorer:()=>null,FinancialFreeDayDetails:()=>null,FinancialFxSourceControl:()=>null,
  financialWeeks:()=>[],nextAllowancePayment:()=>null,buildLegs:()=>[],getStoredUser:()=>({email:'synthetic@example.invalid'}),
  CanonicalForecastCapture:()=>null,PerDiemMonthView:()=>null,NextPaymentCard:()=>null,FinancialStatementReconciliation:()=>null});
 vm.runInContext(ts.transpileModule(functions.map(node=>node.getText(ast)).join('\n')+'\nglobalThis.subject={scopedFinancialForecast,PerDiemView};',{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,context);
 const scoped=context.subject.scopedFinancialForecast([snapshot],range,[],first.quotes,'2032-02-09');
 assert.equal(scoped.monthly,200.05);assert.equal(scoped.pendingCurrencies.length,0);
 const blocked=context.subject.scopedFinancialForecast([snapshot],range,[],{},'2032-02-09');assert.equal(blocked.monthly,null);assert.deepEqual(Array.from(blocked.pendingCurrencies),['USD']);
 // Verify the public component passes the live provider quotes to its actual
 // scoped caller, not only that the pure helper works in isolation.
 ownerFx.quotes={USD:{...manualQuote,asOf:'2001-01-01'}};
 const root=context.subject.PerDiemView({bundle:{roster},freeDayEvaluation:{}});
 const render=root.props.render({snapshots:[{roster,snapshot,source:'synthetic'}],range,missing:[],coverageReady:true,requestRange:()=>{},controls:null,graph:null});
 const monthView=render.props.children.find(child=>child?.props?.forecastOverride);
 assert.equal(monthView.props.forecastOverride.monthly,200.05);
 assert.equal(monthView.props.forecastOverride.monthlyRows[0].fxReferences[0].source,'synthetic reviewed manual');
 assert.ok(monthView.props.fxControl,'shared source control reaches the allowance screen');
 const captureQuotes=ownerFx.quotes;
 const capture=render.props.children.find(child=>child?.props?.flights);
 assert(capture,'actual canonical capture host exists');
 for(const quotes of [{},{USD:{...manualQuote,rate:'6',retrievedAt:'2032-02-09T14:00:00Z'}},first.quotes]){
  ownerFx.quotes=quotes;
  const refreshed=context.subject.PerDiemView({bundle:{roster},freeDayEvaluation:{}}).props.render({snapshots:[{roster,snapshot,source:'synthetic'}],range,missing:[],coverageReady:true,requestRange:()=>{},controls:null,graph:null});
  const current=refreshed.props.children.find(child=>child?.props?.flights);
  assert.equal(current.key,capture.key,'quote refresh/source switch must not remount an in-progress canonical review');
  assert.equal(current.props.rows[0].convertedBRL,undefined,'capture excludes transient converted totals');
  assert.equal(current.props.rows[0].value,20.01,'capture preserves native amount');
  assert.equal(current.props.rows[0].fxReferences,undefined,'capture excludes transient FX provenance');
 }
 ownerFx.quotes=captureQuotes;

 assert.equal(monthView.props.graph.props.children.props.quotes,ownerFx.quotes,'reconciliation receives live quotes and narrows before projection');
 assert.equal(monthView.props.graph.props.children.props.rows[0].value,20.01);
 const captureKey=()=>context.subject.PerDiemView({bundle:{roster},freeDayEvaluation:{}}).props.render({snapshots:[{roster,snapshot,source:'synthetic'}],range,missing:[],coverageReady:true,requestRange:()=>{},controls:null,graph:null}).props.children.find(child=>child?.props?.flights).key;
 const nativeBefore=snapshot.perdiem.monthlyRows;
 snapshot.perdiem.monthlyRows=[{...nativeBefore[0],value:21.01},...nativeBefore.slice(1)];
 assert.notEqual(captureKey(),capture.key,'a native amount change still invalidates the review');
 snapshot.perdiem.monthlyRows=nativeBefore;
 context.getStoredUser=()=>({email:'other-synthetic@example.invalid'});
 assert.notEqual(captureKey(),capture.key,'account change still invalidates the review');
 context.getStoredUser=()=>({email:'synthetic@example.invalid'});
 assert.equal(captureKey(),capture.key);

 assert.equal(context.subject.scopedFinancialForecast([snapshot],range,['2032-03'],first.quotes,'2032-02-09').monthly,null,'missing roster scope still blocks a complete total');
}finally{allowanceModules.cleanup();}
console.log('PASS shared FX -> actual allowance scope/view: no undated setting fallback, immutable native amounts, national BRL unchanged, source/date, inverse/manual, OFF/expiry/mixed dates and incomplete scope');

const reconciliationModules=loadClientModules({files:['client/src/lib/financialForecastPeriods.ts','client/src/lib/financialHistoryPeriods.ts']});
try {
 let stateIndex=0,reconciliationOwner='synthetic',hidden=false;
 const printedDocument=Object.freeze({owner:'synthetic:synthetic-token',result:Object.freeze({kind:'per_diem',periodStart:'2032-02-08',periodEnd:'2032-02-08',paymentDate:'2032-02-09',totals:Object.freeze({deposited:100}),warnings:[],rates:[]})});
 const Reconciliation=compile('client/src/components/finance/FinancialStatementReconciliation.tsx',{
  'react':{...React,useEffect:()=>{},useRef:()=>({current:0}),useState:value=>[stateIndex++===0?printedDocument:value,()=>{}]},'react/jsx-runtime':jsx,
  './FinancialPrivacy':{useFinancialPrivacy:()=>({hidden,text:x=>x,amount:x=>hidden?'MASKED':x})},
  '@/lib/authClient':{getStoredUser:()=>({id:reconciliationOwner}),getToken:()=> 'synthetic-token'},
  '@/lib/financialStatementLearning':{learnFinancialStatement:()=>{throw Error('no import/write in render fixture');}},
  '@/lib/financialHistoryPeriods':reconciliationModules.load('financialHistoryPeriods'),
  '@/lib/financialForecastPeriods':reconciliationModules.load('financialForecastPeriods'),
  '@shared/financialFx.mjs':fxMath,
  './FinancialStatementImporter':{default:()=>null,extractPdfText:()=>{throw Error('no real PDF in fixture');}},
 }).default;
 const base=Object.freeze({eventId:'synthetic-paid-period',iso:'2032-02-08',label:'Meal',value:20,currency:'USD',source:'synthetic historical entitlement'});
 const view=(rows,quotes)=>{stateIndex=0;return renderToStaticMarkup(Reconciliation({rows,quotes,today:'2032-02-09',unclassified:[],coveredMonths:['2032-02'],requestRange:()=>{}}));};
 for(const rate of ['5','6']) {
  const q={base:'USD',quote:'BRL',rate,asOf:'2032-02-08',retrievedAt:'2032-02-09T12:00:00Z',source:'synthetic current FX',method:'account_manual'};
  const rows=fxMath.projectAllowanceFxRows([base],{USD:q},'2032-02-09'),html=view(rows);
  assert.doesNotMatch(html,/Diferença a conferir/,'current FX must not become a historic payment discrepancy, even when totals happen to agree');
  assert.match(html,/Diferença histórica indisponível/);assert.match(html,/Estimativa à cotação de referência atual/);
  assert.match(html,/synthetic current FX/);assert.match(html,/2032-02-08/);assert.match(html,/2032-02-09T12:00:00Z/);
  assert.ok(html.indexOf('synthetic current FX')<html.indexOf('Conciliação ainda depende'),'FX provenance is beside the total, not only buried in item disclaimers');
  assert.match(html,rate==='5'?/Estimativa à cotação de referência atual: R\$[^0-9]*100,00/:/Estimativa à cotação de referência atual: R\$[^0-9]*120,00/);
  assert.equal(printedDocument.result.totals.deposited,100);assert.equal(base.value,20);
 }
 const scopedQuote={base:'USD',quote:'BRL',rate:'5',asOf:'2032-02-08',retrievedAt:'2032-02-09T12:00:00Z',source:'scoped USD source',method:'account_manual'};
 const unrelated={...base,iso:'2032-01-08',currency:'EUR'};
 const scopedHtml=view([base,unrelated],{USD:scopedQuote,EUR:{...scopedQuote,base:'EUR',asOf:'2032-02-07',source:'unrelated EUR source'}});
 assert.match(scopedHtml,/Estimativa à cotação de referência atual: R\$[^0-9]*100,00/);
 assert.match(scopedHtml,/scoped USD source/);assert.doesNotMatch(scopedHtml,/unrelated EUR source/);
 assert.doesNotMatch(scopedHtml,/Diferença a conferir/);
 const domestic=Object.freeze({...base,currency:'BRL',value:80,convertedBRL:80,exchangeRate:1});
 assert.match(view([domestic]),/Diferença a conferir/,'domestic same-unit comparison remains available');
 assert.doesNotMatch(view(fxMath.projectAllowanceFxRows([base],{},'2032-02-09')),/Diferença a conferir/);
 hidden=true;assert.doesNotMatch(view([domestic]),/R\$|80,00|20,00|100,00/,'privacy protects compared monetary amounts');
 hidden=false;reconciliationOwner='another-owner';assert.doesNotMatch(view([domestic]),/Total informado pelo documento/,'document never crosses account scope');
}finally{reconciliationModules.cleanup();}
console.log('PASS actual reconciliation: current5/current6 cannot become a historical payment delta; source/observation/retrieval visible; original printed total immutable; domestic comparison/privacy/owner preserved');
