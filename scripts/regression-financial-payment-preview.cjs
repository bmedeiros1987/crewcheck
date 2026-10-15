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
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{
 for(const width of [390,1440])for(const scenario of ['complete','partial','empty']){
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),errors=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[],"enabled":false}'});return route.continue();});
  const january={...roster('domestic',1),days:Array.from({length:31},(_,i)=>day(String(i+1).padStart(2,'0')+'/01/2032'))};
  const payload=scenario==='empty'?roster('empty'):roster('domestic');
  const december={...january,month:12,year:2031,days:Array.from({length:31},(_,i)=>day(String(i+1).padStart(2,'0')+'/12/2031'))};
  const history=scenario==='complete'?[{id:'local-synthetic-february',checksum:'synthetic-february',createdAt:'2032-02-02T14:00:00Z',roster:payload,sourceFileName:'Synthetic February'},{id:'local-synthetic-december',checksum:'synthetic-december',createdAt:'2032-01-01T00:00:00Z',roster:december,sourceFileName:'Synthetic December'},{id:'local-synthetic-january',checksum:'synthetic-january',createdAt:'2032-02-01T00:00:00Z',roster:january,sourceFileName:'Synthetic January'}]:[];
  await context.addInitScript(seed,{theme:'light',kind:payload,amount:123.45,history});
  if(scenario==='complete')await context.addInitScript(()=>{const source={ownerId:'financial-ui-qa',currency:'BRL',sourceDocument:'synthetic-payroll.pdf',sourceFingerprint:'synthetic-payment-preview',confidence:'high',valueOrigin:'printed',confirmed:true,revision:1,payrollCompetence:'2032-01',cycleSource:'user-reported-absa-tam'};localStorage.setItem('crewcheck_financial_learned_rates_v2:financial-ui-qa',JSON.stringify({version:2,ownerId:'financial-ui-qa',rates:[{...source,key:'salary.base',label:'Synthetic base',unit:'month',value:2900,effectiveFrom:'2032-01-01',effectiveTo:'2032-01-31'},{...source,key:'salary.dayKm',label:'Synthetic variable',unit:'km',value:.07,effectiveFrom:'2031-12-01',effectiveTo:'2031-12-31'}]}));});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'perdiem'})));
  const hero=page.locator('.cc-payment-hero');await hero.waitFor();
  if(scenario==='complete'){await page.waitForFunction(()=>document.querySelector('.cc-payment-value').textContent.includes('R$'),null,{timeout:10000}).catch(async error=>{console.log('Synthetic allowance state:',await page.locator('.cc-payment-overview').innerText());console.log('Synthetic inventory:',await page.getByLabel('Competência de referência').innerText());await page.screenshot({path:path.join(out,'allowance-debug.png'),fullPage:true});throw error;});assert.match(await hero.innerText(),/1\.728,30/,'only the seven days of the eligible cycle, not the monthly total');}
  else assert.match(await hero.innerText(),/Previsão incompleta/);
  assert.match(await hero.innerText(),/Data a confirmar/);assert(!/saldo disponível|recebido R\$/i.test(await hero.innerText()));
  await page.locator('.cc-payment-hero button').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.cc-payment-hero button').getAttribute('aria-pressed')==='true');
  assert(!/R\$\s*\d/.test(await page.locator('.cc-per-diem-content').textContent()),'hidden mode includes the new hero and its closed details');
  assert(!/R\$\s*\d/.test(await page.locator('.cc-per-diem-content').ariaSnapshot()));
  await page.locator('.cc-payment-hero button').press('Space');
  await page.getByRole('button',{name:'Composição',exact:true}).click();assert.equal(await page.locator('.cc-next-payment-lines').getAttribute('open'),'');
  assert.equal(await page.locator('.cc-next-payment-lines summary').evaluate(el=>el===document.activeElement),true,'shortcut transfers keyboard focus');
  await page.getByRole('button',{name:'Demonstrativos',exact:true}).click();assert.equal(await page.locator('.cc-financial-reconciliation').getAttribute('open'),'');
  await page.getByRole('button',{name:'Pendências',exact:true}).click();assert.equal(await page.locator('.cc-payment-pending').evaluate(el=>el===document.activeElement||el.contains(document.activeElement)),true);
  if(scenario==='complete'){
   const amount=await page.locator('.cc-payment-value').textContent();await page.getByLabel('Filtro financeiro').selectOption('week');assert.equal(await page.locator('.cc-payment-value').textContent(),amount,'filter cannot substitute the hero cycle');await page.getByLabel('Filtro financeiro').selectOption('month');
   await page.locator('.cc-financial-graph>summary').click();
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.locator('.cc-next-payment-lines').evaluate(el=>el.open=false);
  await page.evaluate(()=>{scrollTo({top:0,left:0,behavior:'instant'});for(const a of document.getAnimations())try{a.finish()}catch{}});
  await page.screenshot({path:path.join(out,`${width}-${scenario}.png`),fullPage:true});
  await page.screenshot({path:path.join(out,`${width}-${scenario}-overview.png`),fullPage:false});
  if(scenario==='complete'){
    await page.locator('.cc-financial-graph').evaluate(el=>el.scrollIntoView({behavior:'instant',block:'start'}));await page.screenshot({path:path.join(out,`${width}-comparison.png`),fullPage:false});
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'salary'})));await page.locator('.cc-payment-hero').waitFor();
    await page.waitForFunction(()=>document.querySelector('.cc-payment-value').textContent.includes('2.900,00'),null,{timeout:10000}).catch(async error=>{console.log('SYNTHETIC PAYROLL DEBUG',await page.locator('.cc-payment-overview').innerText());await page.screenshot({path:path.join(out,'payroll-debug.png'),fullPage:true});throw error;});
    assert.match(await page.locator('.cc-payment-hero').innerText(),/fevereiro de 2032/);assert.match(await page.locator('.cc-payment-hero').innerText(),/bruto estimado, antes dos descontos/);
    const salaryAmount=await page.locator('.cc-payment-value').textContent();await page.locator('.cc-payment-hero button').click();assert(!/R\$\s*\d/.test(await page.locator('.cc-per-diem-content').textContent()));await page.locator('.cc-payment-hero button').click();assert.equal(await page.locator('.cc-payment-value').textContent(),salaryAmount);
    await page.getByRole('button',{name:'Demonstrativos',exact:true}).click();assert.equal(await page.locator('.cc-salary-prerequisites>details').getAttribute('open'),'');
    await page.evaluate(()=>scrollTo({top:0,left:0,behavior:'instant'}));await page.screenshot({path:path.join(out,`${width}-payroll-overview.png`),fullPage:false});
    for(const [state,count] of [['partial',1],['empty',0]]){
      await page.evaluate(count=>{const key='crewcheck_local_history_v11_financial-ui-qa',history=JSON.parse(localStorage.getItem(key));const operational=history.find(item=>item.roster.year===2031&&item.roster.month===12);operational.roster.days=operational.roster.days.slice(0,count);operational.checksum='synthetic-coverage-'+count;localStorage.setItem(key,JSON.stringify(history));window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'cockpit'}));},count);
      await page.locator('.cc-salary-history').waitFor({state:'detached'});
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'salary'})));
      await page.waitForFunction(()=>document.querySelector('.cc-payment-value')?.textContent.includes('Previsão incompleta'),null,{timeout:10000});
      await page.waitForFunction(count=>document.querySelector('.cc-payment-pending')?.textContent.includes((31-count)+' dia(s)'),count,{timeout:10000});
      await page.waitForFunction(()=>document.querySelector('.cc-next-payment-lines')?.textContent.includes('2.900,00'),null,{timeout:10000});
      assert.match(await page.locator('.cc-payment-pending').textContent(),/dia\(s\) sem programação|Importe a escala/);
      assert(!/R\$/.test(await page.locator('.cc-payment-value').textContent()),'fixed pay alone does not masquerade as a complete payment');
      await page.evaluate(()=>scrollTo({top:0,left:0,behavior:'instant'}));await page.screenshot({path:path.join(out,`${width}-payroll-${state}.png`),fullPage:false});
    }

  }
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS next payment actual UI: own eligible-cycle amount, partial/empty, filter independence, Eye/EyeOff DOM/accessibility, keyboard shortcuts, mobile/desktop.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
