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
const staticContext=vm.createContext({fs,path,Buffer,distDir:dist,sendJson:(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));}});
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
 assert.match(await root.textContent(),/Valor oculto|Não calculável|Sem itens previstos/);
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 const results=[];
 try {
 for(const [kind,width] of [['domestic',390],['multi',1440],['unknown',390],['empty',390]]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),errors=[];
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[],"enabled":false}'});return route.continue();});
  await context.addInitScript(seed,{theme:'light',kind:roster(kind),amount:123.45,salaryBase:4321.67});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();
  await navigate(page,'perdiem');await page.locator('.cc-per-diem-content').waitFor();await expand(page);
  const before=await page.locator('.cc-per-diem-content').textContent();
  const persistedBefore=await page.evaluate(()=>JSON.stringify(localStorage));
  const toggle=page.getByRole('button',{name:'Ocultar valores financeiros'}).first();await toggle.focus();await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'Mostrar valores financeiros'}).first().waitFor();await checkHidden(page);
  assert.equal(await page.getByRole('button',{name:'Mostrar valores financeiros'}).first().getAttribute('aria-pressed'),'true');
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),persistedBefore,'display toggle never writes data/settings');
  if(kind==='domestic')await page.screenshot({path:path.join(out,'hidden-mobile.png'),fullPage:false});
  await page.getByLabel('Filtro financeiro').selectOption('year');await checkHidden(page);await page.getByLabel('Filtro financeiro').selectOption('month');
  await page.getByRole('button',{name:'Mostrar valores financeiros'}).first().focus();await page.keyboard.press('Space');
  assert.equal(await page.locator('.cc-per-diem-content').textContent(),before,'show restores exactly the same UI values and pending states');
  if(kind==='domestic')await page.screenshot({path:path.join(out,'visible-mobile.png'),fullPage:false});
  await page.getByRole('button',{name:'Ocultar valores financeiros'}).first().click();await navigate(page,'salary');await page.locator('.cc-salary-history').waitFor();await expand(page);await checkHidden(page);
  await page.getByRole('button',{name:'Mostrar valores financeiros'}).first().click();const salaryBefore=await page.locator('.cc-salary-history').textContent();
  await page.getByRole('button',{name:'Ocultar valores financeiros'}).first().click();await checkHidden(page);await page.getByRole('button',{name:'Mostrar valores financeiros'}).first().click();
  assert.equal(await page.locator('.cc-salary-history').textContent(),salaryBefore,'salary amount round trip is exact');
  await page.getByRole('button',{name:'Ocultar valores financeiros'}).first().click();
  if(kind==='domestic'){
   const importer=page.locator('.finance-learning-panel');
   await importer.locator('input[type=file]').setInputFiles({name:'synthetic-payroll.pdf',mimeType:'application/pdf',buffer:documentBytes(['DEMONSTRATIVO DE PAGAMENTO RUBRICA','Competencia 02/2032','Salario 4321,67','TOTAIS 4321,67 123,45','Liquido 4198,22'])});
   await importer.locator('.finance-learning-review').waitFor();await checkHidden(page);
   await page.getByRole('button',{name:'Mostrar valores financeiros'}).first().click();assert.match(await importer.locator('table').first().textContent(),/4.321,67/);
   await page.getByRole('button',{name:'Ocultar valores financeiros'}).first().click();
   await navigate(page,'perdiem');await page.locator('.cc-per-diem-content').waitFor();await expand(page);
   const reconciliation=page.locator('.cc-financial-reconciliation');
   await reconciliation.locator('input[type=file]').setInputFiles({name:'synthetic-diarias.pdf',mimeType:'application/pdf',buffer:documentBytes(['DEMONSTRATIVO DE DIARIAS','De 2032-02-01 ate 2032-02-29','Pagamento em 2032-03-01','ALMOCO R$ 123,45','Total depositado R$ 789,12'])});
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
  await page.getByRole('button',{name:'Ocultar valores financeiros'}).first().waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'mobile layout fits');
  assert.deepEqual(errors,[]);results.push({kind,width,keyboard:true,accessibility:true,roundTrip:true,accountIsolation:true,reload:true});await context.close();
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log('PASS financial privacy actual app:',JSON.stringify(results));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
