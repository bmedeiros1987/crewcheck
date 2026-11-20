import assert from 'node:assert/strict';import http from 'node:http';import path from 'node:path';import fs from 'node:fs';import {createRequire} from 'node:module';import {build} from 'esbuild';
const root=process.cwd(),require=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url),{chromium}=require('playwright');
const entry=`import React,{startTransition} from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import Net from './client/src/components/finance/PayrollNetEstimate';import{FinancialPrivacyToggle}from './client/src/components/finance/FinancialPrivacy';let props={gross:5000,complete:true,month:'2026-10',paymentMonth:'2026-11',compositionKey:'synthetic-composition-a'};const root=createRoot(document.getElementById('root'));const render=()=>root.render(<><FinancialPrivacyToggle/><Net {...props}/></>);flushSync(render);const frame=()=>({checked:document.querySelector('input[type=checkbox]')?.checked??null,bases:[...document.querySelectorAll('.cc-payroll-tax-base input')].map(input=>input.value),text:document.querySelector('.cc-payroll-net-preview')?.textContent??''});window.patch=patch=>{props={...props,...patch};flushSync(render);return frame();};window.switchFrames=steps=>steps.map(([owner,token])=>{startTransition(()=>{if(owner)localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:owner,role:'crew'}));else localStorage.removeItem('crewcheck_auth_user');if(token)localStorage.setItem('crewcheck_auth_token',token);else localStorage.removeItem('crewcheck_auth_token');dispatchEvent(new Event('crewcheck:auth-changed'));});flushSync(render);return frame();});window.signal=name=>{startTransition(()=>dispatchEvent(name==='storage'?new StorageEvent('storage',{key:'crewcheck_auth_token'}):new Event(name)));flushSync(render);return frame();};const getItem=Storage.prototype.getItem;window.storageState=blocked=>{Storage.prototype.getItem=blocked?function(){throw new DOMException('SYNTHETIC_STORAGE_DENIED','SecurityError');}:getItem;flushSync(render);return frame();};window.record=(values,revision=1)=>{const owner=JSON.parse(localStorage.getItem('crewcheck_auth_user')).id;const record={schema:1,ownerId:owner,month:props.month,revision,closed:false,values:Object.fromEntries(Object.entries(values).map(([key,amount])=>[key,{kind:'deduction',currency:'BRL',amountMinor:amount,source:'reviewed_statement',sourceId:'sha256:'+'a'.repeat(64),recurrence:'once',...(typeof amount==='object'?amount:{})}]))};window.fixtureWrite=true;try{localStorage.setItem('crewcheck_financial_month_settings_v1:'+owner+':'+props.month,JSON.stringify(record));}finally{window.fixtureWrite=false;}flushSync(render);};`;
const result=await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,write:false,outdir:'/tmp/payroll-net-session',format:'iife',jsx:'automatic',alias:{'@':path.join(root,'client/src')},define:{'process.env.NODE_ENV':'"test"'}}),js=result.outputFiles.find(x=>x.path.endsWith('.js')).text,css=result.outputFiles.find(x=>x.path.endsWith('.css'))?.text||'';
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?js:`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;margin:16px}body.dark{background:#121b2c;color:#eef4ff}summary,label{display:block;min-height:44px}input[type=checkbox]{width:24px;height:24px}${css}</style><div id="root"></div><script src="/fixture.js"></script>`);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})}),which=process.argv.find(x=>x.startsWith('--case='))?.split('=')[1],results=[];let external=0;
const out=path.resolve(process.env.PAYROLL_NET_EVIDENCE_DIR||'artifacts/payroll-net-session');fs.mkdirSync(out,{recursive:true});
try{for(const timezoneId of ['UTC','America/Sao_Paulo','Pacific/Auckland'])for(const width of [320,390,1440])for(const theme of ['light','dark']){
 const context=await browser.newContext({timezoneId,viewport:{width,height:900},colorScheme:theme});await context.addInitScript(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-A',role:'crew'}));localStorage.setItem('crewcheck_auth_token','token-A');for(const owner of ['synthetic-A','synthetic-B'])localStorage.setItem('crewcheck:financial-privacy:v2:'+owner,'shown');window.runtimeFinancialWrites=[];const put=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('crewcheck_financial_')&&!window.fixtureWrite)window.runtimeFinancialWrites.push(key);return put.call(this,key,value);};});await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(external++,r.abort()));const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.evaluate(theme=>document.body.classList.toggle('dark',theme==='dark'),theme);await page.getByText('Ver composição e premissas',{exact:true}).click();const checkbox=page.locator('input[type=checkbox]'),net=page.locator('.cc-payroll-net-preview');
 const snapshot=()=>page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('crewcheck_financial_')))));
 const standard=net.locator('[data-payroll-standard-net]'),individual=net.locator('[data-payroll-individual-net]');
 const inssBase=net.getByLabel('Base de INSS (R$)',{exact:true});
 const irrfIncome=net.getByLabel('Rendimento tributável antes das deduções do IRRF (R$)',{exact:true});
 const simulate=async(inss='5000',irrf='5000')=>{await inssBase.fill(inss);await irrfIncome.fill(irrf);await checkbox.check();};
 if(!which||which==='race'){
  await simulate();const before=await snapshot();const frames=await page.evaluate(()=>window.switchFrames([['synthetic-B','token-B'],['synthetic-A','token-A']]));
  assert.deepEqual(frames.map(f=>f.checked),[false,false],'A/B/A must not resurrect the tax assumption');
  assert(frames.every(f=>f.bases.every(value=>value==='')&&!/Líquido padrão estimado:/.test(f.text)));assert.equal(await snapshot(),before,'auth/context changes do not save assumptions');
  for(const signal of ['crewcheck:auth-will-change','crewcheck:auth-expired','storage']){await simulate();assert.equal((await page.evaluate(name=>window.signal(name),signal)).checked,false,'auth invalidation clears tax approval: '+signal);}
  await simulate();assert.deepEqual((await page.evaluate(()=>window.switchFrames([['synthetic-A','rotated'],['synthetic-A','token-A']]))).map(f=>f.checked),[false,false]);
  await simulate();assert((await page.evaluate(()=>window.switchFrames([[null,null],['synthetic-A','token-A']]))).every(f=>f.checked!==true),'logout and same-token return reject prior assumptions');
  await simulate();assert.notEqual((await page.evaluate(()=>window.storageState(true))).checked,true,'storage denied after approval fails closed');assert.equal((await page.evaluate(()=>window.storageState(false))).checked,false,'restoring storage does not restore old approval');
  await simulate();assert.equal((await page.evaluate(()=>window.patch({complete:false}))).checked,false,'completeness change invalidates the assumptions');await page.evaluate(()=>window.patch({complete:true}));assert.equal(await checkbox.isChecked(),false,'return to previous props must not resurrect assumptions');
 }
 if(!which||which==='money'){
  assert.equal(await checkbox.isDisabled(),true,'gross is not a substitute for either tax base');
  assert.equal(await standard.count(),0);
  await page.evaluate(()=>window.record({other_deductions:10000,rubric_dependente:10000}));
  await simulate();
  assert.match(await standard.innerText(),/R\$\s*4\.498,50/,'5000 - INSS501.50 - IRRF0');
  assert.match(await individual.innerText(),/R\$\s*4\.398,50/,'the reviewed other-deductions total is subtracted only once');
  const before=await snapshot();await checkbox.uncheck();assert.match(await net.innerText(),/Pendente para calcular/);assert.equal(await snapshot(),before);
  await simulate();
  await page.evaluate(()=>window.record({other_deductions:10000},2));
  assert.equal(await checkbox.isChecked(),false,'a new evidence revision clears the tax premise even when the amounts and months stay the same');
  assert.equal(await standard.count(),0);
  await page.evaluate(()=>window.record({other_deductions:10000},1));
  assert.equal(await checkbox.isChecked(),false,'return to a prior evidence revision does not restore approval');
  await page.evaluate(()=>window.record({inss:10000,irrf:0,other_deductions:2000}));
  assert.match(await standard.innerText(),/R\$\s*4\.900,00/);assert.match(await individual.innerText(),/R\$\s*4\.880,00/);
  await page.evaluate(()=>window.record({inss:10000,irrf:0}));
  assert.match(await standard.innerText(),/R\$\s*4\.900,00/);assert.match(await net.innerText(),/Líquido individual a confirmar/);
  assert.equal(await individual.count(),0,'missing personal offsets never become reviewed zero');
  await page.evaluate(()=>window.record({inss:10000,irrf:0,other_deductions:0}));
  assert.match(await individual.innerText(),/R\$\s*4\.900,00/,'explicit reviewed zero is calculable');
  await page.evaluate(()=>window.patch({complete:false}));assert.match(await net.innerText(),/Saldo parcial/);
  assert.equal(await standard.count(),0);assert.equal(await individual.count(),0);
  await page.evaluate(()=>window.patch({complete:true,month:'2027-01',paymentMonth:'2027-02'}));
  await inssBase.fill('5000');await irrfIncome.fill('5000');
  assert.equal(await checkbox.isDisabled(),true);assert.equal(await standard.count(),0,'future tables unavailable');
  await page.evaluate(()=>window.patch({month:'2026-10',paymentMonth:'2026-11',gross:Number.MAX_SAFE_INTEGER}));
  assert.equal(await standard.count(),0,'unsafe cent conversion is rejected');
  await page.evaluate(()=>window.patch({gross:5000}));
  await page.evaluate(()=>window.record({inss:Number.MAX_SAFE_INTEGER,irrf:Number.MAX_SAFE_INTEGER,other_deductions:0}));
  assert.equal(await standard.count(),0,'overflowing taxes are rejected');assert.match(await net.innerText(),/fora da faixa segura/);
  await page.evaluate(()=>window.record({inss:0,irrf:0,other_deductions:0}));
  await page.evaluate(()=>window.patch({gross:0}));
  assert.match(await standard.innerText(),/R\$\s*0,00/,'explicit reviewed statutory zero remains calculable');
  assert.match(await individual.innerText(),/R\$\s*0,00/);

  // Fictional A32F captain, using supplied incidence evidence instead of
  // inferring a tax base from any earning's name.
  const earnings={'Salário-base':7900,senioridade:1100,'habilitação Narrow':800,'KM diurno':640,'KM noturno':720,DFS:200,reserva:280,sobreaviso:160,'repouso remunerado':2100,'gratificação solo':100};
  const gross=Object.values(earnings).reduce((sum,value)=>sum+value,0);
  await page.evaluate(gross=>window.patch({month:'2026-09',paymentMonth:'2026-10',gross}),gross);
  await page.evaluate(()=>window.record({
   rubric_base_fgts:{kind:'informational',amountMinor:1100000},
   rubric_fgts:{kind:'informational',amountMinor:80000},
  }));
  await inssBase.fill('6200');
  assert.equal(await checkbox.isDisabled(),true,'a single known base cannot fill in the other one');
  await simulate('6200','9000');
  assert.match(await standard.innerText(),/R\$\s*11\.931,21/,'gross 14000 less INSS 669.50 and IRRF 1399.29');
  assert.equal(await individual.count(),0,'FGTS employer deposit never becomes a personal debit');
  await page.getByRole('button',{name:'Ocultar valores financeiros',exact:true}).click();
  assert.equal(await inssBase.count(),0);assert.equal(await irrfIncome.count(),0);
  assert.doesNotMatch(await net.innerHTML(),/value="(?:6200|9000)"|11\.931,21/);
  await page.getByRole('button',{name:'Mostrar valores financeiros',exact:true}).click();
  assert.match(await standard.innerText(),/R\$\s*11\.931,21/);
  const next=await page.evaluate(()=>window.patch({compositionKey:'synthetic-composition-b'}));
  assert.deepEqual(next.bases,['','']);assert.equal(next.checked,false);assert.equal(await standard.count(),0);
  const previous=await page.evaluate(()=>window.patch({compositionKey:'synthetic-composition-a'}));
  assert.deepEqual(previous.bases,['','']);assert.equal(previous.checked,false);
  await simulate('6200','9000');
  await irrfIncome.fill('9001');assert.equal(await checkbox.isChecked(),false);assert.equal(await standard.count(),0,'changing a premise revokes approval');
  await page.evaluate(()=>window.patch({month:'2026-10',paymentMonth:'2026-11',gross:5000}));
 }
 if(!which||which==='privacy'){
  await page.evaluate(()=>window.record({inss:1000000,irrf:0,other_deductions:0}));assert.match(await net.innerText(),/Saldo de ajuste negativo/,'signed deficit preserved when visible');await page.getByRole('button',{name:'Ocultar valores financeiros',exact:true}).click();assert.doesNotMatch(await net.innerHTML(),/Saldo de ajuste negativo|excedem o bruto|5\.000|10\.000/,'privacy conceals deficit classification as well as amounts');await page.getByRole('button',{name:'Mostrar valores financeiros',exact:true}).click();assert.match(await net.innerText(),/Saldo de ajuste negativo/);
 }
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.runtimeFinancialWrites),[],'estimator never writes financial settings or assumptions');await net.evaluate(el=>{const sizes=[el,...el.querySelectorAll('*')].map(node=>[node,parseFloat(getComputedStyle(node).fontSize)]);for(const [node,size] of sizes)node.style.setProperty('font-size',size*2+'px','important');});assert.equal(await net.evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'200% text remains contained');await page.screenshot({path:path.join(out,`synthetic-${which||'all'}-${timezoneId.replaceAll('/','-')}-${width}-${theme}.png`),fullPage:true});results.push({timezoneId,width,theme});await context.close();
}assert.equal(external,0);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({browser:browser.version(),results,external,case:which||'all'},null,2));console.log('PASS real net estimator: generation/context fences, known/zero/absent/partial, reviewed precedence, 2026 tables, future/unsafe negatives, privacy and 18 synthetic layouts; no network or runtime writes');}finally{await browser.close();await new Promise(r=>server.close(r));}
