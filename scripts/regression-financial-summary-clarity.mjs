// Actual UI components with synthetic payments and a controlled FX context.
// Ledger/network responses are intercepted; no provider, account or message access.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import{createRequire}from'node:module';import{build}from'esbuild';
const root=path.resolve(process.env.FINANCIAL_SUMMARY_SOURCE_ROOT||'.'),out=path.resolve(process.env.FINANCIAL_SUMMARY_EVIDENCE_DIR||'artifacts/financial-summary-clarity');fs.mkdirSync(out,{recursive:true});
const entry=`import React,{useState}from'react';import{createRoot}from'react-dom/client';
import Home,{HomeFinancialEstimateProvider}from'${root}/client/src/components/finance/HomeFinancialEstimate';
import Explorer from'${root}/client/src/components/finance/FinancialHistoryExplorer';import Card from'${root}/client/src/components/finance/NextPaymentCard';
const roster={crewId:'SYNTHETIC',crewName:'SYNTHETIC',rank:'CC',base:'BSB',month:11,year:2032,days:[{date:'01/11/2032',type:'CRM',pairingCode:'CRM',legs:[],base:'BSB',dutyReport:'05:00',dutyDebrief:'21:00'}]};
const line=(currency,value)=>({iso:'2032-11-01',label:currency+' synthetic',currency,value,source:'SYNTHETIC ONLY'});
const quote={rate:'5',base:'USD',quote:'BRL',asOf:'2032-11-14',source:'SYNTHETIC',method:'account_manual'};
function App(){const[scenario,setScenario]=useState('brl');window.__scenario=setScenario;const knownZero=scenario==='known-zero';const foreign=['mixed','foreign','loading','stale','recovered','invalid'].includes(scenario);const lines=scenario==='empty'||knownZero?[]:scenario==='foreign'?[line('USD',20)]:[line('BRL',100),...(foreign?[line('USD',scenario==='invalid'?NaN:20)]:[])];
window.__fx={mode:'automatic',state:scenario==='loading'?'loading':scenario==='stale'?'stale':scenario==='recovered'?'available':'unavailable',quotes:['stale','recovered','invalid'].includes(scenario)?{USD:quote}:{}};
const payment={kind:'allowance',range:{kind:'month',start:'2032-11-01',end:'2032-11-30',valid:true},lines,issues:scenario==='incomplete'?['SYNTHETIC: cobertura incompleta']:[],totals:knownZero?{BRL:0}:foreign||scenario==='empty'?null:{BRL:100},calculationTotals:lines.length?{BRL:100}:null,calculationPartial:foreign||scenario==='incomplete',timing:'Data a confirmar',source:'SYNTHETIC ONLY',caption:'Diárias · valores na moeda original',...(knownZero?{noEligibleAllowance:true}:{})};
const statementPayment=knownZero?{...payment,noEligibleAllowance:undefined,totals:null,calculationPartial:true}:payment;
const snapshot=JSON.stringify(payment);window.__sourceUnchanged=()=>snapshot===JSON.stringify(payment);
return <main className="cz-app" data-version="synthetic"><div className="cc-per-diem-content"><HomeFinancialEstimateProvider roster={roster} calculate={()=>payment}><section id="home"><Home/></section><Explorer roster={roster} mode="allowance" calculate={()=>({})} metric={()=>({})} render={()=> <Card payment={payment} statementPayment={statementPayment} requestRange={()=>{}}/>}/></HomeFinancialEstimateProvider></div></main>;}
createRoot(document.getElementById('root')).render(<App/>);`;
await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,jsx:'automatic',format:'iife',outfile:out+'/app.js',alias:{'@':root+'/client/src','@shared':root+'/shared'},plugins:[{name:'controlled-fx',setup(b){b.onResolve({filter:/^\.\/FinancialFxProvider$/},a=>({path:a.path,namespace:'fx'}));b.onLoad({filter:/.*/,namespace:'fx'},()=>({contents:`import React from 'react';export const useFinancialFx=()=>window.__fx;export const FinancialFxProvider=({children})=>children;export const FinancialFxSourceControl=()=> <label>Fonte do câmbio<select aria-label="Fonte do câmbio"><option>Sintética</option></select></label>;`,resolveDir:root,loader:'tsx'}));}}],logLevel:'silent'});
const files=['client/src/components/finance/financial-history.css','client/src/components/finance/payment-preview.css','client/src/components/finance/persistent-history.css','client/src/components/finance/financial-summary-clarity.css','client/src/components/finance/financial-privacy.css'];
const css=files.filter(f=>fs.existsSync(path.join(root,f))).map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/app.js'?'application/javascript':'text/html; charset=utf-8');res.end(req.url==='/app.js'?fs.readFileSync(out+'/app.js'):`<meta name="viewport" content="width=device-width"><style>*{box-sizing:border-box}body{margin:0;font:16px system-ui}.cz-app{--cc-review-surface:#fff;--cc-review-text:#12304d;--cc-review-border:#cad9e5;--cc-review-muted:#526475;padding:16px}.cz-app.dark{--cc-review-surface:#102536;--cc-review-text:#eef5ff;--cc-review-border:#567;--cc-review-muted:#bdcddd;background:#08121c;color:#eef5ff} ${css}</style><div id="root"></div><script src="/app.js"></script>`);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const{chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});const results=[];
try{for(const width of[320,390,1280])for(const theme of['light','dark']){
 const context=await browser.newContext({viewport:{width,height:900},timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});const requests=[],errors=[];
 await context.route('**/*',route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==origin)throw new Error('Unexpected external request');if(u.pathname.startsWith('/api/')){requests.push({path:u.pathname,method:req.method()});return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify(u.pathname==='/api/platform/finance/history'?{ok:false,code:'FINANCIAL_LEDGER_NOT_ENABLED'}:{ok:false,items:[]})});}return route.continue();});
 await context.addInitScript(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-owner',email:'synthetic@example.invalid',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-token');});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2032-11-15T12:00:00Z'));await page.goto(origin);await page.evaluate(t=>document.querySelector('.cz-app').classList.toggle('dark',t==='dark'),theme);
 const home=page.locator('#home');await home.locator('.cc-home-brl-estimate').waitFor();
 const scenario=async s=>{await page.evaluate(s=>window.__scenario(s),s);await page.waitForTimeout(50);};
 assert(!/Cotação automática indisponível|Câmbio pendente|Consultando câmbio/.test(await home.innerText()),'BRL-only must not display an irrelevant FX failure');assert.match(await home.innerText(),/100,00/);assert.match(await home.innerText(),/01\/11\/2032 a 30\/11\/2032/);
 await scenario('empty');assert.match(await home.innerText(),/Sem diárias calculadas/);assert(!/Cotação automática|Câmbio pendente/.test(await home.innerText()));
 await scenario('known-zero');
 const hero=page.getByRole('region',{name:'Próximo pagamento previsto',exact:true});
 for(const scope of [home,hero]){
  assert.match(await scope.innerText(),/R\$\s*0,00/);
  assert.match(await scope.innerText(),/Sem diárias previstas no ciclo/);
  assert.doesNotMatch(await scope.innerText(),/Não calculável|Previsão incompleta|Crédito previsto/);
 }
 await hero.getByRole('button',{name:'Ocultar valores financeiros',exact:true}).click();
 for(const scope of [home,hero])assert.doesNotMatch(await scope.innerText(),/0,00/);
 await hero.getByRole('button',{name:'Mostrar valores financeiros',exact:true}).click();
 await page.getByRole('button',{name:'Extrato',exact:true}).click();
 const emptyStatement=page.getByRole('region',{name:'Previsão da escala',exact:true});
 await emptyStatement.getByText('Previsão incompleta',{exact:true}).waitFor();
 assert.doesNotMatch(await emptyStatement.innerText(),/0,00|Sem diárias previstas no ciclo/);
 await page.getByRole('button',{name:'Resumo financeiro',exact:true}).click();
 await scenario('mixed');assert.match(await home.innerText(),/Subtotal conhecido/);assert.match(await home.innerText(),/100,00/);assert.match(await home.innerText(),/Câmbio pendente: USD/);
 await home.getByText('Ver cálculo',{exact:true}).click();assert.match(await home.innerText(),/US\$\s*20,00/);assert.match(await home.innerText(),/Conversão pendente/);
 await home.getByRole('button',{name:'Ocultar valores financeiros',exact:true}).click();assert(!/100,00|20,00/.test(await home.innerText()));assert.match(await home.innerText(),/01\/11\/2032/);await home.getByRole('button',{name:'Mostrar valores financeiros',exact:true}).click();
 await scenario('foreign');assert.match(await home.innerText(),/Diárias pendentes/);assert.match(await home.innerText(),/Não calculável/);
 await scenario('loading');assert.match(await home.innerText(),/Consultando câmbio/);await scenario('stale');assert.match(await home.innerText(),/200,00/);assert.match(await home.innerText(),/Cotação em cache/);
 await scenario('recovered');assert.match(await home.innerText(),/200,00/);assert(!/Câmbio pendente/.test(await home.innerText()));
 await scenario('invalid');assert.match(await home.innerText(),/Há dados pendentes/);assert.match(await home.innerText(),/Valor original pendente/);assert(!/Câmbio pendente|Consultando câmbio/.test(await home.innerText()),'missing original amount must not be blamed on FX');
 await scenario('incomplete');assert.match(await home.innerText(),/Subtotal conhecido/);assert.match(await home.innerText(),/Há dados pendentes/);assert(!/Câmbio pendente/.test(await home.innerText()));assert(await page.evaluate(()=>window.__sourceUnchanged()));
 await scenario('brl');await page.getByRole('button',{name:'Extrato',exact:true}).click();await page.getByRole('heading',{name:'Extrato',exact:true}).waitFor();const summary=page.getByRole('region',{name:'Previsão da escala',exact:true}),period=page.getByRole('region',{name:'Período financeiro',exact:true});await summary.waitFor();assert.equal(await summary.locator('xpath=..').getByRole('button',{name:'Ocultar valores financeiros',exact:true}).count(),1,'statement must expose one privacy control, without duplicate navigation control');
 assert(await summary.evaluate((s)=>Boolean(s.compareDocumentPosition(document.querySelector('[aria-label="Período financeiro"]'))&Node.DOCUMENT_POSITION_FOLLOWING)),'summary must precede filters');
 assert.match(await page.getByRole('region',{name:'Datas financeiras'}).innerText(),/01\/11\/2032 a 30\/11\/2032/);
 const ledger=page.getByRole('region',{name:'Histórico financeiro salvo'});await ledger.getByText('Consulta salva não ativada.',{exact:true}).waitFor();assert.equal(await ledger.getByRole('heading',{name:'Registrado',exact:true}).count(),1);assert.equal(await ledger.getByRole('button',{name:'Ver previsão',exact:true}).count(),1);
 const help=ledger.getByRole('button',{name:'Entender histórico salvo'}); // Native summary role differs across Chromium versions.
 const actualHelp=ledger.locator('summary[aria-label="Entender histórico salvo"]');await actualHelp.focus();await page.keyboard.press('Enter');assert.equal(await actualHelp.evaluate(el=>el.parentElement.open),true);await page.keyboard.press('Enter');
 await page.evaluate(()=>document.documentElement.style.fontSize='24px');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 await page.screenshot({path:out+'/'+theme+'-'+width+'.png',fullPage:true});
 await ledger.getByRole('button',{name:'Ver previsão',exact:true}).click();await page.getByRole('heading',{name:'Próximo pagamento previsto',exact:true}).waitFor();
 await page.evaluate(()=>{window.dispatchEvent(new Event('crewcheck:auth-will-change'));localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-other',role:'user'}));localStorage.setItem('crewcheck_auth_token','other-synthetic');window.dispatchEvent(new Event('crewcheck:auth-changed'));});await page.waitForFunction(()=>document.querySelector('#home').textContent==='');
 assert.deepEqual(errors,[]);assert(requests.every(r=>r.method==='GET'),'no ledger or provider writes');results.push({width,theme,fxScenarios:8,knownZeroScope:true,privacy:true,accountBoundary:true,summaryFirst:true,localDates:true,ledgerOffExplained:true});await context.close();
}fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log('PASS actual financial summary/statement: relevant FX, partial/native amounts, privacy/account fence, summary-first, local dates, ledger OFF action, keyboard/mobile/themes; controlled FX context, no real API or sends');}finally{await browser.close();await new Promise(r=>server.close(r));}
