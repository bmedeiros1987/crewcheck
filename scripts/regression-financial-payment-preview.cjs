const { createRequire } = require('node:module');
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const out = path.resolve(process.env.FINANCIAL_UI_EVIDENCE_DIR || 'artifacts/financial-payment-preview');
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
function seed({theme,kind,amount,history,salaryBase,homeMode}) {
  const NativeDate=Date,instant=Date.parse('2032-02-02T15:00:00Z');
  globalThis.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};
  localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'financial-ui-qa',name:'SYNTHETIC UI QA',role:'user'}));
  localStorage.setItem('crewcheck_auth_token','synthetic-local-only');
 // Only callers that require the detailed financial card explicitly choose a Home mode.
 if(homeMode)localStorage.setItem('crewcheck:home-layout:v1:financial-ui-qa',JSON.stringify({version:1,mode:homeMode,order:['summary','finance','next','limits','smart'],visible:['summary','finance','next','limits','smart']}));

  localStorage.setItem('crewcheck:first-access-tour:v1434:disabled','1');sessionStorage.setItem('crewcheck:first-access-tour:v1434:session-seen','1');
  localStorage.setItem('crewcheck_demo_mode_seen','1');
  localStorage.setItem('crewcheck_theme_mode',theme);localStorage.setItem('crewcheck:appearance:v1',theme);
  // Synthetic numbers exercise the existing local manual-configuration path;
  // they are not ACT rules, copied statement figures or a production tariff.
  for(const key of ['domestic','north_america','mexico','south_america_caribbean','argentina','chile','england','europe','africa','other_international'])localStorage.setItem('crewcheck_financial_settings_v1:financial-ui-qa:crewcheck_perdiem_rate_'+key,String(amount));
  if(history)localStorage.setItem('crewcheck_local_history_v11_financial-ui-qa',JSON.stringify(history));
  if(salaryBase!==undefined){localStorage.setItem('crewcheck_financial_settings_v1:financial-ui-qa:crewcheck_salary_base_brl',String(salaryBase));
    // This fixture explicitly informs zero additions; absent additions must stay unknown.
    localStorage.setItem('crewcheck_financial_settings_v1:financial-ui-qa:crewcheck_salary_fixed_additions_brl','0');}
  localStorage.setItem('crewcheck_roster_choice_v1_financial-ui-qa',JSON.stringify({owner:'financial-ui-qa',roster:kind,selection:'explicit',cacheSchema:'p0-operational-date-anchor-v2',sourceFileName:'Synthetic finance UI QA'}));
}
async function showFinancial(page,screen){const root=page.locator('.cc-payment-overview');if(await root.getAttribute('data-financial-screen')===screen)return;const names={overview:'Resumo financeiro',statement:'Extrato',charts:'Gráficos',payment:'Detalhes do pagamento'};await page.getByRole('button',{name:names[screen],exact:true}).click();await page.waitForFunction(screen=>document.querySelector('.cc-payment-overview')?.dataset.financialScreen===screen,screen);}

(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{
 for(const width of [390,1440])for(const theme of ['light','dark'])for(const scenario of ['complete','partial','empty']){
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),errors=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[],"enabled":false}'});return route.continue();});
  const january={...roster('domestic',1),days:Array.from({length:31},(_,i)=>day(String(i+1).padStart(2,'0')+'/01/2032'))};
  const payload=scenario==='empty'?roster('empty'):roster('domestic');
  const december={...january,month:12,year:2031,days:Array.from({length:31},(_,i)=>day(String(i+1).padStart(2,'0')+'/12/2031'))};
  const history=scenario==='complete'?[{id:'local-synthetic-february',checksum:'synthetic-february',createdAt:'2032-02-02T14:00:00Z',roster:payload,sourceFileName:'Synthetic February'},{id:'local-synthetic-december',checksum:'synthetic-december',createdAt:'2032-01-01T00:00:00Z',roster:december,sourceFileName:'Synthetic December'},{id:'local-synthetic-january',checksum:'synthetic-january',createdAt:'2032-02-01T00:00:00Z',roster:january,sourceFileName:'Synthetic January'}]:[];
  await context.addInitScript(seed,{theme,kind:payload,amount:123.45,history,homeMode:'standard'});
  if(scenario==='complete')await context.addInitScript(()=>{localStorage.setItem('crewcheck_financial_settings_v1:financial-ui-qa:crewcheck_salary_fixed_additions_brl','0');const source={ownerId:'financial-ui-qa',currency:'BRL',sourceDocument:'synthetic-payroll.pdf',sourceFingerprint:'synthetic-payment-preview',confidence:'high',valueOrigin:'printed',confirmed:true,revision:1,payrollCompetence:'2032-01',cycleSource:'user-reported-absa-tam'};localStorage.setItem('crewcheck_financial_learned_rates_v2:financial-ui-qa',JSON.stringify({version:2,ownerId:'financial-ui-qa',rates:[{...source,key:'salary.base',label:'Synthetic base',unit:'month',value:2900,effectiveFrom:'2032-01-01',effectiveTo:'2032-01-31'},{...source,key:'salary.dayKm',label:'Synthetic variable',unit:'km',value:.07,effectiveFrom:'2031-12-01',effectiveTo:'2031-12-31'}]}));});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();
  const home=page.locator('.cc-home-finance');await home.waitFor();
  assert.equal(await home.count(),1,'one financial card in the active Home');
  for(const mode of ['personalized','standard']){
    await page.evaluate(mode=>{localStorage.setItem('crewcheck:home-layout:v1:financial-ui-qa',JSON.stringify({version:1,mode,order:['summary','finance','next','limits','smart'],visible:['summary','finance','next','limits','smart']}));window.dispatchEvent(new Event('crewcheck:personalization'));},mode);
    await page.waitForFunction(()=>document.querySelectorAll('.cc-home-finance').length===1);
    assert.equal(await home.count(),1,'one Home finance card in '+mode+' including empty programs');
  }

  if(scenario==='empty')assert(!/R\$\s*\d/.test(await home.textContent()),'empty Home does not invent a cycle amount');
  else if(/R\$\s*\d/.test(await home.textContent())){assert.match(await home.textContent(),/Total (?:parcial )?estimado em R\$/);assert.match(await home.textContent(),/não confirma recebimento/);}
  await home.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${width}-${theme}-${scenario}-home.png`),fullPage:false});
  await home.getByRole('button',{name:/Diárias/}).click();
  await page.locator('.cc-payment-hero').waitFor();
  for(let visit=0;visit<2;visit++){
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'cockpit'})));
    await page.locator('.cc-home-finance').waitFor();
    await page.locator('.cc-home-finance').getByRole('button',{name:/Salário/}).click();
    await page.locator('.cc-payment-hero').waitFor();
    assert.equal(await page.getByRole('button',{name:/^(Ocultar|Mostrar) valores financeiros$/}).count(),1,'one privacy control after repeated navigation');
  }
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'perdiem'})));
  await page.getByRole('region',{name:'Previsão de diárias',exact:true}).waitFor();const hero=page.locator('.cc-payment-hero');await hero.waitFor();await hero.getByRole('button',{name:/^(Ocultar|Mostrar) valores financeiros$/}).waitFor({state:'visible'});
  assert.equal(await page.getByRole('button',{name:/^(Ocultar|Mostrar) valores financeiros$/}).count(),1);
  const privacyBox=await hero.getByRole('button',{name:/^(Ocultar|Mostrar) valores financeiros$/}).boundingBox();assert(privacyBox.width>=44&&privacyBox.height>=44);

  if(scenario==='complete'){await page.waitForFunction(()=>document.querySelector('.cc-payment-value').textContent.includes('R$'),null,{timeout:10000}).catch(async error=>{console.log('Synthetic allowance state:',await page.locator('.cc-payment-overview').innerText());console.log('Synthetic inventory:',await page.getByLabel('Competência de referência').innerText());await page.screenshot({path:path.join(out,'allowance-debug.png'),fullPage:true});throw error;});assert.match(await hero.innerText(),/1\.728,30/,'only the seven days of the eligible cycle, not the monthly total');}
  else if(scenario==='partial'){assert.match(await hero.innerText(),/740,70/,'exact known domestic subtotal remains visible');assert.match(await hero.innerText(),/subtotal estimado · parcial/);assert.equal(await hero.locator('.cc-payment-value').first().getAttribute('data-calculation-partial'),'true');}
  else assert.match(await hero.innerText(),/Previsão incompleta/);
  assert.match(await hero.innerText(),/Data a confirmar/);assert(!/saldo disponível|recebido R\$/i.test(await hero.innerText()));
  await page.locator('.cc-payment-hero .cc-financial-privacy-toggle').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.cc-payment-hero .cc-financial-privacy-toggle').getAttribute('aria-pressed')==='true');
  await page.evaluate(()=>scrollTo({top:0,left:0,behavior:'instant'}));
  await page.screenshot({path:path.join(out,`${width}-${theme}-${scenario}-hidden.png`),fullPage:false});
  assert(!/R\$\s*\d/.test(await page.locator('.cc-per-diem-content').textContent()),'hidden mode includes the new hero and its closed details');
  assert(!/R\$\s*\d/.test(await page.locator('.cc-per-diem-content').ariaSnapshot()));
  if(scenario==='complete'){
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'cockpit'})));
    await page.locator('.cc-home-finance').getByRole('button',{name:/Salário/}).click();await page.locator('.cc-payment-hero').waitFor();
    assert.equal(await page.locator('.cc-payment-hero .cc-financial-privacy-toggle').getAttribute('aria-pressed'),'true','hidden preference survives Home/salary navigation');
    assert(!/R\$\s*\d/.test(await page.locator('.cc-per-diem-content').textContent()));
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'perdiem'})));await page.locator('.cc-payment-hero').waitFor();
    assert.equal(await page.locator('.cc-payment-hero .cc-financial-privacy-toggle').getAttribute('aria-pressed'),'true','returning to allowance stays hidden');
  }

  await page.locator('.cc-payment-hero .cc-financial-privacy-toggle').press('Space');
  assert.equal(await page.locator('.cc-payment-overview').getAttribute('data-financial-screen'),'overview');
  assert.equal(await page.locator('.cc-per-diem-items').isVisible(),false,'overview does not stack the statement');
  const overviewAmount=await page.locator('.cc-payment-value').textContent();
  const statementEntry=page.getByRole('button',{name:'Extrato',exact:true});await statementEntry.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('.cc-payment-overview').dataset.financialScreen==='statement');
  assert.equal(await page.locator('.cc-per-diem-items').isVisible(),true);assert.equal(await page.locator('.cc-payment-hero').count(),0,'statement is its own screen');
  const selectedMonth=await page.getByLabel('Competência de referência',{exact:true}).inputValue();
  await showFinancial(page,'charts');assert.equal(await page.locator('.cc-bank-details').isVisible(),true);assert.equal(await page.locator('.cc-per-diem-items').isVisible(),false);
  assert.equal(await page.getByLabel('Competência de referência',{exact:true}).inputValue(),selectedMonth,'month survives screen navigation');
  await page.waitForFunction(()=>document.querySelector('[data-financial-screen-heading]')===document.activeElement);
  assert.equal(await page.locator('[data-financial-screen-heading]').evaluate(el=>el===document.activeElement),true,'new screen receives heading focus');
  if(scenario==='complete'){assert.equal(await page.locator('.cc-bank-chart-row').count(),2,'categories reuse actual labels without inferred financial rules');assert.match(await page.locator('.cc-bank-chart').innerText(),/864,15/,'seven fixture lines total per category');}
  await page.screenshot({path:path.join(out,`${width}-${theme}-${scenario}-details.png`),fullPage:false});
  await page.getByRole('button',{name:'Ocultar valores financeiros'}).first().click();assert.equal(await page.locator('.cc-bank-chart-track').count(),0,'hidden chart bars never disclose relative amounts');assert(!/R\$\s*\d/.test(await page.locator('.cc-bank-details').textContent()));assert(!/R\$\s*\d/.test(await page.locator('.cc-bank-details').ariaSnapshot()));await page.getByRole('button',{name:'Mostrar valores financeiros'}).first().click();
  await showFinancial(page,'overview');assert.equal(await page.locator('.cc-payment-value').textContent(),overviewAmount,'return preserves the independent cycle amount');
  await showFinancial(page,'statement');assert.equal(await page.getByLabel('Competência de referência',{exact:true}).inputValue(),selectedMonth);
  if(scenario==='complete'){await page.getByLabel('Competência de referência',{exact:true}).selectOption('2032-01');await showFinancial(page,'charts');assert.equal(await page.getByLabel('Competência de referência',{exact:true}).inputValue(),'2032-01');await showFinancial(page,'overview');assert.equal(await page.locator('.cc-payment-value').textContent(),overviewAmount);await showFinancial(page,'statement');assert.equal(await page.getByLabel('Competência de referência',{exact:true}).inputValue(),'2032-01','chosen non-default month survives back and forward screens');await page.getByLabel('Competência de referência',{exact:true}).selectOption(selectedMonth);}
  await showFinancial(page,'payment');assert.match(await page.locator('.cc-next-payment-lines').innerText(),/Extrato previsto/);
  const dates=await page.locator('.cc-bank-transaction').evaluateAll(nodes=>nodes.map(node=>node.dataset.financialTransactionDate));assert.deepEqual(dates,[...dates].sort((a,b)=>a.localeCompare(b)),'cycle statement is chronological');
  if(await page.locator('.cc-bank-transaction').count()){const item=page.locator('.cc-bank-transaction').first();await item.locator('summary').click();assert.equal(await item.getAttribute('open'),'');await item.locator('summary').click();}
  assert.equal(await page.locator('.cc-payment-actions').count(),0,'duplicated shortcut row is removed');
  assert.equal(await page.locator('.cc-payment-pending').isVisible(),true,'pending confirmation stays visible without a shortcut');
  await page.getByRole('button',{name:'Demonstrativos',exact:true}).click();assert.equal(await page.locator('.cc-financial-reconciliation').getAttribute('open'),'');
  assert.equal(await page.locator('.cc-financial-reconciliation>summary').evaluate(el=>el===document.activeElement),true,'document action transfers keyboard focus');
  const hitTargets=await page.locator('.cc-payment-overview button,.cc-payment-overview summary').evaluateAll(nodes=>nodes.filter(el=>el.getClientRects().length).map(el=>({text:el.textContent,box:el.getBoundingClientRect()})).filter(item=>item.box.width<44||item.box.height<44));
  assert.deepEqual(hitTargets,[],'visible payment controls have 44px touch targets');
  if(scenario==='complete'){
   const amount=await page.locator('.cc-payment-value').textContent();await showFinancial(page,'statement');await page.getByLabel('Filtro financeiro').selectOption('week');await page.getByLabel('Filtro financeiro').selectOption('month');await showFinancial(page,'payment');assert.equal(await page.locator('.cc-payment-value').textContent(),amount,'filter cannot substitute the hero cycle');
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await showFinancial(page,'overview');
  await page.evaluate(()=>{scrollTo({top:0,left:0,behavior:'instant'});for(const a of document.getAnimations())try{a.finish()}catch{}});
  await page.screenshot({path:path.join(out,`${width}-${theme}-${scenario}.png`),fullPage:true});
  await page.screenshot({path:path.join(out,`${width}-${theme}-${scenario}-overview.png`),fullPage:false});
  if(scenario==='complete'){
    await showFinancial(page,'charts');await page.locator('.cc-financial-graph').evaluate(el=>el.scrollIntoView({behavior:'instant',block:'start'}));await page.screenshot({path:path.join(out,`${width}-${theme}-comparison.png`),fullPage:false});
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'salary'})));await page.locator('.cc-payment-hero').waitFor();
    await page.waitForFunction(()=>document.querySelector('.cc-payment-value').textContent.includes('2.900,00'),null,{timeout:10000}).catch(async error=>{console.log('SYNTHETIC PAYROLL DEBUG',await page.locator('.cc-payment-overview').innerText());await page.screenshot({path:path.join(out,'payroll-debug.png'),fullPage:true});throw error;});
    assert.match(await page.locator('.cc-payment-hero').innerText(),/fevereiro de 2032/);assert.match(await page.locator('.cc-payment-hero').innerText(),/bruto estimado/);
    await showFinancial(page,'charts');
    const breakdown=page.getByRole('region',{name:'Ganhos e descontos da competência',exact:true});
    assert.match(await breakdown.innerText(),/Não calculável/,'missing selected-competence data never becomes zero or next-cycle net');
    assert.equal(await breakdown.locator('.cc-bank-chart-track').count(),0);
    await page.getByLabel('Competência de referência',{exact:true}).selectOption('2032-01');await page.waitForFunction(()=>document.querySelector('.cc-bank-salary-breakdown')?.textContent.includes('2.900,00'));
    assert.equal(await breakdown.locator('.cc-bank-chart-track').count(),1,'legacy zero deductions without monthly evidence remain unknown');assert.match(await breakdown.innerText(),/Descontos da competência a confirmar/);
    await page.evaluate(()=>{const values=Object.fromEntries(['inss','irrf','other_deductions'].map(key=>[key,{amountMinor:0,currency:'BRL',kind:'deduction',source:'manual',sourceId:'synthetic-explicit-zero',recurrence:'once'}]));localStorage.setItem('crewcheck_financial_month_settings_v1:financial-ui-qa:2032-01',JSON.stringify({schema:1,ownerId:'financial-ui-qa',month:'2032-01',revision:1,closed:false,values}));window.dispatchEvent(new Event('crewcheck:financial-config-changed'));});await page.waitForFunction(()=>document.querySelectorAll('.cc-bank-salary-breakdown .cc-bank-chart-track').length===3);
    assert.equal(await breakdown.locator('.cc-bank-chart-track').count(),3,'explicit monthly zero is distinct from absent deductions and matches existing engine');
    await page.evaluate(()=>{const key='crewcheck_financial_month_settings_v1:financial-ui-qa:2032-01',record=JSON.parse(localStorage.getItem(key));record.values.inss.amountMinor=500;localStorage.setItem(key,JSON.stringify(record));});
    await page.getByRole('button',{name:'Ocultar valores financeiros'}).first().click();await page.getByRole('button',{name:'Mostrar valores financeiros'}).first().click();assert.equal(await breakdown.locator('.cc-bank-chart-track').count(),1,'monthly evidence differing from the cached engine cannot create a net amount');assert.match(await breakdown.innerText(),/Líquido indisponível/);
    await page.evaluate(()=>window.dispatchEvent(new Event('crewcheck:financial-config-changed')));await page.waitForFunction(()=>document.querySelector('.cc-bank-salary-breakdown')?.textContent.includes('2.895,00'));assert.equal(await breakdown.locator('.cc-bank-chart-track').count(),3,'monthly deduction is consumed by the canonical engine');assert.match(await breakdown.locator('.cc-bank-chart-row').nth(1).innerText(),/-.*5,00/,'deduction is an outflow');
    await page.evaluate(()=>{const key='crewcheck_financial_month_settings_v1:financial-ui-qa:2032-01',record=JSON.parse(localStorage.getItem(key));record.values.inss.amountMinor=null;localStorage.setItem(key,JSON.stringify(record));window.dispatchEvent(new Event('crewcheck:financial-config-changed'));});await page.waitForFunction(()=>document.querySelectorAll('.cc-bank-salary-breakdown .cc-bank-chart-track').length===1);assert.match(await breakdown.innerText(),/Líquido indisponível/,'unknown monthly deduction cannot produce net or zero');
    await page.evaluate(()=>{const key='crewcheck_financial_month_settings_v1:financial-ui-qa:2032-01',record=JSON.parse(localStorage.getItem(key));record.values.inss.amountMinor=0;localStorage.setItem(key,JSON.stringify(record));window.dispatchEvent(new Event('crewcheck:financial-config-changed'));});await page.waitForFunction(()=>document.querySelectorAll('.cc-bank-salary-breakdown .cc-bank-chart-track').length===3);

    await breakdown.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${width}-${theme}-salary-breakdown.png`),fullPage:false});
    await page.getByLabel('Filtro financeiro',{exact:true}).selectOption('week');assert.match(await breakdown.innerText(),/Não calculável/);assert.equal(await breakdown.locator('.cc-bank-chart-track').count(),0,'monthly amounts are not prorated into weeks');await page.getByLabel('Filtro financeiro',{exact:true}).selectOption('month');await page.getByLabel('Competência de referência',{exact:true}).selectOption('2032-02');
    await showFinancial(page,'overview');const salaryAmount=await page.locator('.cc-payment-value').textContent();await page.locator('.cc-payment-hero .cc-financial-privacy-toggle').click();assert(!/R\$\s*\d/.test(await page.locator('.cc-per-diem-content').textContent()));await page.locator('.cc-payment-hero .cc-financial-privacy-toggle').click();assert.equal(await page.locator('.cc-payment-value').textContent(),salaryAmount);
    await showFinancial(page,'payment');await page.getByRole('button',{name:'Demonstrativos',exact:true}).click();assert.equal(await page.locator('.cc-salary-reference').getAttribute('open'),'');
    await page.evaluate(()=>scrollTo({top:0,left:0,behavior:'instant'}));await page.screenshot({path:path.join(out,`${width}-${theme}-payroll-overview.png`),fullPage:false});
    for(const [state,count] of [['partial',1],['empty',0]]){
      await page.evaluate(count=>{const key='crewcheck_local_history_v11_financial-ui-qa',history=JSON.parse(localStorage.getItem(key));const operational=history.find(item=>item.roster.year===2031&&item.roster.month===12);operational.roster.days=operational.roster.days.slice(0,count);operational.checksum='synthetic-coverage-'+count;localStorage.setItem(key,JSON.stringify(history));window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'cockpit'}));},count);
      await page.locator('.cc-salary-history').waitFor({state:'detached'});
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'salary'})));
      await page.waitForFunction(()=>document.querySelector('.cc-payment-value')?.dataset.calculationPartial==='true',null,{timeout:10000});
      await showFinancial(page,'payment');await page.waitForFunction(count=>document.querySelector('.cc-payment-pending')?.textContent.includes((31-count)+' dia(s)'),count,{timeout:10000});
      await page.waitForFunction(()=>document.querySelector('.cc-next-payment-lines')?.textContent.includes('2.900,00'),null,{timeout:10000});
      assert.match(await page.locator('.cc-payment-pending').textContent(),/dia\(s\) sem programação|Importe a escala/);
      assert.match(await page.locator('.cc-payment-value').textContent(),/R\$/,'known fixed pay remains visible as a subtotal');assert.match(await page.locator('.cc-payment-value').textContent(),/subtotal estimado/);assert.equal(await page.locator('.cc-payment-value').getAttribute('data-complete'),'false');
      await page.evaluate(()=>scrollTo({top:0,left:0,behavior:'instant'}));await page.screenshot({path:path.join(out,`${width}-${theme}-payroll-${state}.png`),fullPage:false});
    }

  }
  assert.deepEqual(errors,[]);await context.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({scope:'Compiled production app, synthetic local fixtures only, all external requests blocked, API responses 503',widths:[390,1440],themes:['light','dark'],scenarios:['complete','partial','empty'],checks:['Home card and both destinations','repeated Home/salary navigation','single 44px privacy control','hidden DOM and accessibility','cycle calculation and filter independence','payroll incomplete coverage','keyboard action focus','minimal overview and dedicated statement/chart/payment screens with back/month preservation','category chart per currency','missing versus explicit zero and consumed monthly deductions','monthly gains/deductions/net with week fail-closed','no page overflow or runtime errors']},null,2));
 console.log('PASS next payment actual UI: own eligible-cycle amount, partial/empty, filter independence, Eye/EyeOff DOM/accessibility, keyboard shortcuts, mobile/desktop.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
