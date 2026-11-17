// Actual producer projection and UI. Synthetic amounts only; no provider/account writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import ts from 'typescript';
const root=process.cwd(),out=path.resolve(process.env.STATEMENT_CONTEXT_EVIDENCE_DIR||'artifacts/allowance-statement-context');
fs.mkdirSync(out,{recursive:true});
const text=fs.readFileSync('client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const producer=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='PerDiemView');
assert(producer,'actual allowance producer is present');
let projection;const bindings=[];
function visit(n){
 if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='statementPayment')projection=n.initializer?.getText(ast);
 if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='NextPaymentCard')bindings.push(n.attributes.properties.filter(ts.isJsxAttribute).map(a=>[a.name.getText(ast),a.initializer?.getText(ast)]));
 ts.forEachChild(n,visit);
}
visit(producer);assert(projection,'actual selected-period producer must be separate from next cycle');
assert(bindings.some(a=>a.some(([k,v])=>k==='statementPayment'&&v==='{statementPayment}')),'real caller binds selected forecast');
const entry=`import React,{useState}from'react';import{createRoot}from'react-dom/client';
import Card from './client/src/components/finance/NextPaymentCard';
import{FinancialScreenContext}from './client/src/components/finance/FinancialScreen';
import{nextAllowancePayment}from './client/src/lib/nextFinancialPayment';
const row=(iso,currency,value)=>({iso,currency,value,convertedBRL:currency==='BRL'?value:null,label:'SYNTHETIC',source:'SYNTHETIC',partial:false});
const rows=[row('2026-10-01','BRL',100),row('2026-10-02','USD',20),row('2026-11-14','BRL',300)];
const now=new Date('2026-11-14T12:00:00Z'),payment=nextAllowancePayment(rows,[],['2026-10','2026-11'],now,[]);
const source=JSON.stringify(rows);window.sourceUnchanged=()=>source===JSON.stringify(rows);
function App(){const[screen,navigate]=useState('statement'),[month,setMonth]=useState('10'),[mode,setMode]=useState('partial');
 window.contextMode=setMode;const range={start:'2026-'+month+'-01',end:'2026-'+month+(month==='10'?'-31':'-30'),valid:mode!=='invalid',kind:'month'};
 const selected=rows.filter(row=>row.iso>=range.start&&row.iso<=range.end);
 const forecast={monthlyRows:mode==='empty'?[]:mode==='zero'?[row(range.start,'BRL',0)]:selected,nativeSummary:{complete:mode==='complete',totalsByCurrency:month==='10'?{BRL:100,USD:20}:{BRL:300},knownTotalsByCurrency:mode==='empty'?{}:mode==='zero'?{BRL:0}:month==='10'?{BRL:100,USD:20}:{BRL:300}},monthlyUnclassifiedItems:mode==='partial'?[{reason:'SYNTHETIC COVERAGE PENDING'}]:[]};
 const statementPayment=${projection};
 const supplied=mode==='missing'?undefined:mode==='mismatch'?{...statementPayment,range:{...range,start:'2026-09-01',end:'2026-09-30'}}:statementPayment;
 return <main><button onClick={()=>setMonth('10')}>Selecionar outubro</button><button onClick={()=>setMonth('11')}>Selecionar novembro</button><FinancialScreenContext.Provider value={{screen,navigate,back:()=>navigate('overview'),range}}><Card payment={payment} statementPayment={supplied} requestRange={()=>{}}/></FinancialScreenContext.Provider></main>;}
createRoot(document.getElementById('root')).render(<App/>);`;
await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,jsx:'automatic',format:'iife',outfile:out+'/fixture.js',alias:{'@':root+'/client/src','@shared':root+'/shared'},logLevel:'silent'});
const css=fs.existsSync(out+'/fixture.css')?fs.readFileSync(out+'/fixture.css','utf8'):'';
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'application/javascript':'text/html');res.end(req.url==='/fixture.js'?fs.readFileSync(out+'/fixture.js'):`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:12px;font:16px system-ui}.dark{background:#121b2c;color:#eef4ff}button{min-height:44px;max-width:100%}${css}</style><div id="root"></div><script src="/fixture.js"></script>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
const results=[];let external=0;
try{
 for(const width of [320,390,1280])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:900},locale:'pt-BR',serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(external++,route.abort()));
  await context.addInitScript(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-statement',role:'crew'}));localStorage.setItem('crewcheck_auth_token','synthetic-not-a-real-token');localStorage.setItem('crewcheck:financial-privacy:v2:synthetic-statement','shown');window.financialWrites=[];const write=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(/financial_month_settings|financial_rates|roster|payroll/.test(k))window.financialWrites.push(k);return write.call(this,k,v);};});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.evaluate(t=>document.body.classList.toggle('dark',t==='dark'),theme);
  const summary=page.getByRole('region',{name:'Previsão da escala',exact:true});await summary.waitFor();
  assert.match(await summary.innerText(),/01\/10\/2026 a 31\/10\/2026/);assert.doesNotMatch(await summary.innerText(),/11\/11\/2026|17\/11\/2026|19\/11\/2026|Crédito previsto|Dia do voo/);
  assert.equal(await summary.locator('[data-calculation-partial="true"]').count(),2);assert.equal(await page.locator('[data-financial-item-count]').getAttribute('data-financial-item-count'),'2');
  assert.match(await summary.getByRole('region',{name:'Moedas da previsão'}).innerText(),/100,00/);
  await page.getByRole('button',{name:'Próxima moeda',exact:true}).click();assert.match(await summary.getByRole('region',{name:'Moedas da previsão'}).innerText(),/20,00/);
  await page.getByRole('button',{name:'Selecionar novembro',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.cc-statement-summary')?.textContent.includes('30/11/2026'));assert.match(await summary.innerText(),/01\/11\/2026 a 30\/11\/2026/);assert.equal(await summary.getByRole('region',{name:'Moedas da previsão'}).count(),1);assert.equal(await summary.getByRole('button',{name:'Próxima moeda',exact:true}).count(),0);
  await page.getByRole('button',{name:'← Voltar',exact:true}).click();const hero=page.getByRole('region',{name:'Próximo pagamento previsto',exact:true});await hero.waitFor();assert.match(await hero.innerText(),/11\/11\/2026 a 17\/11\/2026/);assert.match(await hero.innerText(),/19\/11\/2026/);
  await page.getByRole('button',{name:'Extrato',exact:true}).click();await page.getByRole('button',{name:'Selecionar outubro',exact:true}).click();
  for(const mode of ['missing','mismatch','invalid']){await page.evaluate(m=>window.contextMode(m),mode);await summary.getByRole('status').getByText('Previsão do período indisponível.',{exact:true}).waitFor();assert.doesNotMatch(await summary.innerText(),/19\/11\/2026|300,00/);}
  await page.evaluate(()=>window.contextMode('zero'));await summary.getByText(/0,00/).first().waitFor();assert.match(await summary.innerText(),/subtotal estimado · parcial/);
  await page.evaluate(()=>window.contextMode('empty'));await summary.getByText('Previsão incompleta',{exact:true}).waitFor();assert.doesNotMatch(await summary.innerText(),/Crédito|19\/11\/2026/);
  await page.evaluate(()=>window.contextMode('complete'));await summary.locator('[data-complete="true"]').first().waitFor();assert(await page.evaluate(()=>window.sourceUnchanged()));assert.deepEqual(await page.evaluate(()=>window.financialWrites),[]);assert.deepEqual(errors,[]);
  await page.getByRole('button',{name:'Ocultar valores financeiros',exact:true}).click();assert.doesNotMatch(await summary.innerText(),/100,00|20,00/);await page.getByRole('button',{name:'Mostrar valores financeiros',exact:true}).click();
  await page.screenshot({path:out+'/'+theme+'-'+width+'.png',fullPage:true});results.push({width,theme,selectedPeriod:true,nextCyclePreserved:true,missingContextClosed:true,partialZeroEmpty:true,noFinancialWrites:true});await context.close();
 }
 assert.equal(external,0);fs.writeFileSync(out+'/results.json',JSON.stringify({results,external,scope:'actual producer projection/Card/carousel; controlled forecast fixtures; not full app, live ledger or device'},null,2));console.log('PASS6 actual selected-period statement contexts: currency/period switches, next-cycle isolation, missing/mismatched scope, zero/partial/empty, privacy and immutable data; no API/writes');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
