const { createRequire } = require('node:module');
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const out = path.resolve(process.env.FINANCIAL_UI_EVIDENCE_DIR || 'artifacts/financial-privacy');
fs.mkdirSync(out, { recursive: true });
const dist = path.resolve('dist');
// Exercise the production static responder rather than a test-only MIME table.
const vm = require('node:vm'), ts = require('typescript');
const serverSource=fs.readFileSync(path.resolve('server.mjs'),'utf8');
const staticAst=ts.createSourceFile('server.mjs',serverSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const staticFunctions=staticAst.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='serveStatic');
assert.equal(staticFunctions.length,1,'exactly one production static handler must exist');
const staticContext=vm.createContext({guardStaticHtml: require('../server/static-html-guard.mjs').guardStaticHtml,fs,path,Buffer,distDir:dist,sendJson:(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));}});
vm.runInContext(staticFunctions[0].getText(staticAst)+'\nglobalThis.respond=serveStatic;',staticContext);
const server=http.createServer((req,res)=>staticContext.respond(req,res,new URL(req.url,'http://localhost')));
const day = (date, airport = 'BSB', short = false) => ({date, dayOfWeek:'SYN', type:'CRM', pairingCode:'CRM', dutyReport:short?'11:00':'05:00', dutyDebrief:short?'11:15':'21:00', dutyReportSource:'published',dutyDebriefSource:'published', legs:[], dutyHours:short ? 0.25 : 16, flyingHours:0, isNextDay:false, hotel:null, base:airport, rawText:'SYNTHETIC UI QA ONLY'});
function roster(kind, month=2) {
  const airports = kind === 'multi' ? ['BSB','JFK','MAD','LHR'] : ['BSB'];
  const days = kind === 'empty' ? [{...day('01/02/2032'),type:'DO',pairingCode:'DO',dutyReport:null,dutyDebrief:null,dutyHours:0}]
    : kind === 'single' ? [day('01/02/2032','BSB',true)]
    : [day('31/01/2032','JFK'), ...Array.from({length:24},(_,i)=>day(String(i+1).padStart(2,'0')+'/02/2032',airports[i%airports.length])),day('01/03/2032')];
  if(kind==='unknown')days[2]={...days[2],base:'ZZZ'};
  return {crewName:'SYNTHETIC UI QA',crewId:'900001',base:'BSB',rank:'CC',airline:'LA',month,year:2032,days,rawText:'SYNTHETIC — NO REAL ROSTER OR TARIFF'};
}
function seed({theme,kind,amount,history,salaryBase}) {
  const NativeDate=Date,instant=Date.parse('2032-02-02T15:00:00Z');
  globalThis.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};
  localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'financial-ui-qa',name:'SYNTHETIC UI QA',role:'user'}));
  localStorage.setItem('crewcheck_auth_token','synthetic-local-only');
  localStorage.setItem('crewcheck:first-access-tour:v1434:disabled','1');sessionStorage.setItem('crewcheck:first-access-tour:v1434:session-seen','1');
  localStorage.setItem('crewcheck_demo_mode_seen','1');
  localStorage.setItem('crewcheck_theme_mode',theme);localStorage.setItem('crewcheck:appearance:v1',theme);
  // Synthetic numbers exercise the existing local manual-configuration path;
  // they are not ACT rules, copied statement figures or a production tariff.
  for(const key of ['domestic','north_america','mexico','south_america_caribbean','argentina','chile','england','europe','africa','other_international'])localStorage.setItem('crewcheck_financial_settings_v1:financial-ui-qa:crewcheck_perdiem_rate_'+key,String(amount));
  if(history)localStorage.setItem('crewcheck_local_history_v11_financial-ui-qa',JSON.stringify(history));
  if(salaryBase!==undefined)localStorage.setItem('crewcheck_financial_settings_v1:financial-ui-qa:crewcheck_salary_base_brl',String(salaryBase));
  localStorage.setItem('crewcheck_roster_choice_v1_financial-ui-qa',JSON.stringify({owner:'financial-ui-qa',roster:kind,selection:'explicit',cacheSchema:'p0-operational-date-anchor-v2',sourceFileName:'Synthetic finance UI QA'}));
}
const {jsPDF}=require('jspdf');
function documentBytes(lines){const doc=new jsPDF();doc.text(lines,15,20);return Buffer.from(doc.output('arraybuffer'));}
const moneyPattern=/(?:R\$|US\$|€|£|USD|BRL|EUR|GBP)\s*[−+-]?\d[\d.]*,\d+/;
async function navigate(page,view){await page.evaluate(view=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:view})),view);}
async function expand(page){await page.locator('.cc-per-diem-content details').evaluateAll(nodes=>nodes.forEach(node=>node.open=true));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function checkHidden(page){
 const root=page.locator('.cc-per-diem-content');
 assert(!moneyPattern.test(await root.textContent()),'no monetary text even inside closed details');
 const attrs=await root.evaluate(el=>[...el.querySelectorAll('*')].flatMap(node=>['aria-label','title','alt','value'].map(key=>node.getAttribute(key)||'')).join(' '));
 assert(!moneyPattern.test(attrs),'no monetary attributes/tooltips');
 assert.equal(await root.locator('.cc-financial-bar-track').count(),0,'proportional bars are not exposed');
 assert(!moneyPattern.test(await root.ariaSnapshot()),'accessibility tree has no amounts');
 assert.match(await root.textContent(),/R\$ •••|Não calculável|Sem itens previstos/);
}
async function showFinancial(page,screen){const root=page.locator('.cc-payment-overview');if(await root.getAttribute('data-financial-screen')===screen)return;const names={overview:'Resumo financeiro',statement:'Extrato',charts:'Gráficos',payment:'Detalhes do pagamento'};
 // expand() deliberately exposes every details body for privacy assertions,
 // including this overlay. Dismiss it through its real accessible control
 // before navigating, just as a user would; never bypass pointer hit testing.
 const help=root.locator('.cc-payment-help[open]');
 while(await help.count()){await help.first().locator('summary').click();}
 assert.equal(await root.locator('.cc-payment-help[open]').count(),0,'forecast help dismissed before financial navigation');
 await page.getByRole('button',{name:names[screen],exact:true}).click();await page.waitForFunction(screen=>document.querySelector('.cc-payment-overview')?.dataset.financialScreen===screen,screen);}

(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 const results=[];
 try {
 for(const [kind,width] of [['domestic',390],['multi',1440],['unknown',390],['empty',390]]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),errors=[];
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[],"enabled":false}'});return route.continue();});
  const jan={...roster('domestic',1),days:[day('31/01/2032')]};
  const history=kind==='domestic'?[{id:'local-synthetic-current-february',checksum:'synthetic-current-february',createdAt:'2032-02-02T14:00:00Z',roster:roster(kind),sourceFileName:'Synthetic current February'},{id:'local-synthetic-january',checksum:'synthetic-january',createdAt:'2032-02-01T00:00:00Z',roster:jan,sourceFileName:'Synthetic January'}]:undefined;
  await context.addInitScript(seed,{theme:'light',kind:roster(kind),amount:123.45,salaryBase:4321.67,history});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();
  await navigate(page,'perdiem');await page.locator('.cc-per-diem-content').waitFor();await expand(page);await showFinancial(page,'charts');
  if(kind==='domestic')await page.waitForFunction(()=>document.querySelectorAll('.cc-financial-bar-track').length>=2);
  const before=await page.locator('.cc-per-diem-content').textContent();
  const persistedBefore=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([key])=>!key.startsWith('crewcheck:financial-privacy:v2:')))));
  const toggle=page.getByRole('button',{name:'Ocultar valores financeiros'}).first();await toggle.focus();await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'Mostrar valores financeiros'}).first().waitFor();await checkHidden(page);
  assert.equal(await page.getByRole('button',{name:'Mostrar valores financeiros'}).first().getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([key])=>!key.startsWith('crewcheck:financial-privacy:v2:'))))),persistedBefore,'display toggle writes only the account/device privacy preference; financial data/settings unchanged');
  if(kind==='domestic')await page.evaluate(()=>scrollTo(0,0));
  if(kind==='domestic')await page.screenshot({path:path.join(out,'hidden-mobile.png'),fullPage:false});
  await page.getByLabel('Filtro financeiro').selectOption('year');await checkHidden(page);await page.getByLabel('Filtro financeiro').selectOption('month');
  await page.getByRole('button',{name:'Mostrar valores financeiros'}).first().focus();await page.keyboard.press('Space');
  if(kind==='domestic')await page.waitForFunction(()=>document.querySelectorAll('.cc-financial-bar-track').length>=2);
  assert.equal(await page.locator('.cc-per-diem-content').textContent(),before,'show restores exactly the same UI values and pending states');
  if(kind==='domestic')await page.evaluate(()=>scrollTo(0,0));
  if(kind==='domestic')await page.screenshot({path:path.join(out,'visible-mobile.png'),fullPage:false});
  await page.getByRole('button',{name:'Ocultar valores financeiros'}).first().click();await navigate(page,'salary');await page.locator('.cc-salary-history').waitFor();await expand(page);await checkHidden(page);
  await page.getByRole('button',{name:'Mostrar valores financeiros'}).first().click();const salaryBefore=await page.locator('.cc-salary-history').textContent();
  await page.getByRole('button',{name:'Ocultar valores financeiros'}).first().click();await checkHidden(page);await page.getByRole('button',{name:'Mostrar valores financeiros'}).first().click();
  assert.equal(await page.locator('.cc-salary-history').textContent(),salaryBefore,'salary amount round trip is exact');
  await page.getByRole('button',{name:'Ocultar valores financeiros'}).first().click();
  if(kind==='domestic'||kind==='multi'){
   await showFinancial(page,'payment');const importer=page.locator('.finance-learning-panel');
   await importer.locator('input[type=file]').setInputFiles({name:'synthetic-payroll.pdf',mimeType:'application/pdf',buffer:documentBytes(['DEMONSTRATIVO DE PAGAMENTO RUBRICA','Competencia 02/2032','Salario-base mensal 4321,67','TOTAIS 4321,67 123,45','Liquido 4198,22'])});
   await importer.locator('.finance-learning-review').waitFor();await checkHidden(page);
   await page.getByRole('button',{name:'Mostrar valores financeiros'}).first().click();
   const preview=importer.getByRole('region',{name:'Prévia privada do holerite',exact:true});
   assert.match(await preview.innerText(),/2032-02/);assert.match(await preview.innerText(),/4.321,67/);assert.match(await preview.innerText(),/Totais impressos conciliados/);
   assert.match(await preview.innerText(),/Página PDF 1, linha/);assert.equal(await importer.getByRole('button',{name:'Confirmar valores',exact:true}).isEnabled(),false);
   const storedBeforePreview=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>/financial/.test(key))));
   const header=['DEMONSTRATIVO DE PAGAMENTO RUBRICA','Competencia 02/2032'];
   for(const [name,lines,expected] of [
    ['proportional',['Salario-base mensal 3000,00','PROVENTOS','Salario 16 dias 1600,00','DESCONTOS','INSS 100,00','TOTAIS 1600,00 100,00','Liquido 1500,00'],/Proporcional/],
    ['zero',['Salario-base mensal 0,00','DESCONTOS','INSS 0,00','TOTAIS 0,00 0,00','Liquido 0,00'],/Zero explícito/],
    ['missing',['PROVENTOS','Adicional 100,00'],/Conciliação indisponível/],
    ['conflict',['Salario-base mensal 3000,00','Salario-base mensal 4000,00'],/Conflito/],
    ['mismatch',['Salario-base mensal 3000,00','TOTAIS 3000,00 100,00','Liquido 2800,00'],/Totais impressos divergentes/],
   ]){
    await importer.locator('input[type=file]').setInputFiles({name:'synthetic-'+name+'.pdf',mimeType:'application/pdf',buffer:documentBytes([...header,...lines])});
    await importer.locator('.finance-learning-review').waitFor();assert.match(await preview.innerText(),expected,name);
    assert.equal(await importer.getByRole('button',{name:'Confirmar valores',exact:true}).isEnabled(),false);
    assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>/financial/.test(key)))),storedBeforePreview,'preview never adopts values: '+name);
    if(name==='mismatch'){
     await importer.getByRole('checkbox').nth(0).check();await importer.getByRole('checkbox').nth(1).check();
     assert.equal(await importer.getByRole('button',{name:'Confirmar valores',exact:true}).isEnabled(),false,'both consents cannot override proven mismatch');
     assert.match(await importer.getByRole('alert').innerText(),/Aplicação bloqueada/);
     assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>/financial/.test(key)))),storedBeforePreview,'mismatch with both consents writes nothing');
    }
   }
   await page.screenshot({path:path.join(out,'private-preview-'+width+'.png'),fullPage:true});
   // Missing totals are unknown, not contradictory and never converted to zero.
   await importer.locator('input[type=file]').setInputFiles({name:'synthetic-missing-totals.pdf',mimeType:'application/pdf',buffer:documentBytes([...header,'Salario-base mensal 3000,00'])});
   await preview.waitFor();assert.match(await preview.innerText(),/Conciliação indisponível/);assert.doesNotMatch(await preview.innerText(),/Zero explícito|Totais impressos divergentes/);
   await importer.getByRole('checkbox').nth(0).check();await importer.getByRole('checkbox').nth(1).check();
   assert.equal(await importer.getByRole('button',{name:'Confirmar valores',exact:true}).isEnabled(),true,'missing totals do not masquerade as proven mismatch');
   assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>/financial/.test(key)))),storedBeforePreview);
   // A new, corrected document resets consent and can follow normal scoped adoption.
   await importer.locator('input[type=file]').setInputFiles({name:'synthetic-corrected.pdf',mimeType:'application/pdf',buffer:documentBytes([...header,'Salario-base mensal 3000,00','TOTAIS 3000,00 100,00','Liquido 2900,00'])});
   await preview.waitFor();assert.match(await preview.innerText(),/Totais impressos conciliados/);
   assert.equal(await importer.getByRole('checkbox').nth(0).isChecked(),false);assert.equal(await importer.getByRole('checkbox').nth(1).isChecked(),false);
   assert.equal(await importer.getByRole('button',{name:'Confirmar valores',exact:true}).isEnabled(),false);
   await importer.getByRole('checkbox').nth(0).check();await importer.getByRole('checkbox').nth(1).check();
   await importer.getByRole('button',{name:'Confirmar valores',exact:true}).click();await preview.waitFor({state:'hidden'});
   const savedRates=await page.evaluate(()=>JSON.parse(localStorage.getItem('crewcheck_financial_learned_rates_v2:financial-ui-qa')).rates);
   assert.equal(savedRates.length,1);assert.equal(savedRates[0].key,'salary.base');assert.equal(savedRates[0].value,3000);
   assert.equal(savedRates[0].effectiveFrom,'2032-02-01');assert.equal(savedRates[0].effectiveTo,'2032-02-29');assert.equal(savedRates[0].payrollCompetence,'2032-02');
   assert.equal(savedRates[0].sourceDocument,'synthetic-corrected.pdf');

   await page.getByRole('button',{name:'Ocultar valores financeiros'}).first().click();
   await navigate(page,'perdiem');await page.locator('.cc-per-diem-content').waitFor();await expand(page);
   await showFinancial(page,'payment');const reconciliation=page.locator('.cc-financial-reconciliation');
   await reconciliation.locator('input[type=file]').setInputFiles({name:'synthetic-diarias.pdf',mimeType:'application/pdf',buffer:documentBytes(['DEMONSTRATIVO DE DIARIAS','De 2032-02-01 ate 2032-02-29','Pagamento em 2032-03-01','ALMOCO R$ 123,45','Total depositado R$ 789,12'])});
   await reconciliation.locator('[aria-label="Conciliação de diárias"]').waitFor({state:'attached'});
   await page.getByRole('button',{name:'Demonstrativos',exact:true}).click();
   await expand(page);
   await reconciliation.locator('[aria-label="Conciliação de diárias"]').waitFor();await checkHidden(page);
   await page.getByRole('button',{name:'Mostrar valores financeiros'}).first().click();assert.match(await reconciliation.textContent(),/789,12/);
   await page.getByRole('button',{name:'Ocultar valores financeiros'}).first().click();await checkHidden(page);
  }
  await navigate(page,'roster');await page.locator('.cc-roster-premium-v1397').waitFor();
  await page.locator('.cc-roster-premium-v1397 details').evaluateAll(nodes=>nodes.forEach(node=>node.open=true));
  assert(!moneyPattern.test(await page.locator('.cc-roster-premium-v1397').textContent()),'roster monthly/day/event financial summaries also conceal amounts');
  assert(!moneyPattern.test(await page.locator('.cc-roster-premium-v1397').ariaSnapshot()));
  await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'other-synthetic-account',role:'user'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});
  assert.equal(await page.getByRole('button',{name:'Mostrar valores financeiros'}).count(),0,'other account does not inherit hidden state');
  await page.reload();await page.locator('.cz-app').waitFor();await navigate(page,'perdiem');await page.locator('.cc-per-diem-content').waitFor();
  await page.getByRole('button',{name:'Mostrar valores financeiros'}).first().waitFor();
  await checkHidden(page); // seed restores original owner; its hidden device preference survives reload.
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'mobile layout fits');
  assert.deepEqual(errors,[]);results.push({kind,width,keyboard:true,accessibility:true,roundTrip:true,accountIsolation:true,reload:true});await context.close();
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log('PASS financial privacy actual app:',JSON.stringify(results));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
