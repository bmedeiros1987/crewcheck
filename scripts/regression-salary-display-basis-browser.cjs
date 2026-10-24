const {createRequire}=require('node:module');
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||__filename)('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=path.resolve(process.env.FINANCIAL_UI_EVIDENCE_DIR||'artifacts/salary-display-basis');fs.mkdirSync(out,{recursive:true});
function seed({theme,kind,amount,history,salaryBase}) {
  const NativeDate=Date,instant=Date.parse('2032-02-02T15:00:00Z');
  globalThis.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};
  localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'financial-ui-qa',name:'SYNTHETIC UI QA',role:'user'}));
  localStorage.setItem('crewcheck_auth_token','synthetic-local-only');
  // Explicit synthetic personal tariffs; no ACT reference is extrapolated to2032.
  for(const [key,value] of Object.entries({day_km_metric:1,night_km_metric:2,reserve_hour:3,standby_hour:4}))localStorage.setItem('crewcheck_financial_settings_v1:financial-ui-qa:crewcheck_act_'+key+'_brl',String(value));
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
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
const errors=[],results=[];try{
for(const width of [320,390,1440])for(const theme of ['light','dark'])for(const completeCoverage of [true,false]){
 const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!=='https://salary.invalid')return route.abort();
  if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});
  const file=path.join(path.resolve('dist'),url.pathname==='/'||url.pathname==='/app'?'index.html':url.pathname);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
  return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
 });
 const days=Array.from({length:29},(_,i)=>({date:String(i+1).padStart(2,'0')+'/02/2032',dayOfWeek:'SYN',type:'DO',pairingCode:'DO',dutyReport:null,dutyDebrief:null,legs:[],dutyHours:0,flyingHours:0,isNextDay:false,base:'BSB'}));
 await context.addInitScript(seed,{theme,amount:100,salaryBase:2400,kind:{crewName:'SYNTHETIC',crewId:'900001',base:'BSB',rank:'CC',airline:'LA',month:2,year:2032,days:completeCoverage?days:days.slice(0,1),rawText:'SYNTHETIC ONLY'}});
 await context.addInitScript(()=>{
  const v=(amountMinor,kind='deduction')=>({amountMinor,kind,currency:'BRL',source:'manual',sourceId:'synthetic',recurrence:'once'});
  const record={schema:1,ownerId:'financial-ui-qa',month:'2032-02',revision:1,closed:false,values:{fixed_with_co:v(240000,'earning'),other_fixed:v(0,'earning'),inss:v(10000),irrf:v(0),other_deductions:v(5000)}};
  // Never reset preference on reload. These are invented local fixtures only.
  if(!localStorage.getItem('salary-basis-test-initialized')){localStorage.setItem('crewcheck_financial_month_settings_v1:financial-ui-qa:2032-02',JSON.stringify(record));localStorage.setItem('salary-basis-test-initialized','1');}
 });
 const page=await context.newPage();const consoleErrors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
 const open=async()=>{await page.goto('https://salary.invalid/app');await page.locator('.cz-app').waitFor();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'salary'})));try{await page.getByRole('radio',{name:'Bruto',exact:true}).waitFor();}catch(error){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});fs.writeFileSync(path.join(out,'failure.txt'),await page.locator('body').innerText());fs.writeFileSync(path.join(out,'failure-errors.json'),JSON.stringify({errors,consoleErrors},null,2));throw error;}};
 await open();assert.equal(await page.getByRole('complementary',{name:'Prévia de PLR'}).count(),1);assert.equal(await page.locator('.cc-salary-plr-note details').getAttribute('open'),null);assert.match(await page.locator('.cc-salary-plr-note').innerText(),/faltam referências/);assert.equal(await page.getByRole('radio',{name:'Bruto',exact:true}).isChecked(),true);
 assert.match(await page.locator('.cc-salary-basis-amount').innerText(),/2.400,00/);
 assert.equal(await page.getByRole('group',{name:'Valor salarial'}).count(),1);
 const controls=page.locator('.cc-payroll-controls'),hero=page.locator('.cc-payment-hero');const cb=await controls.boundingBox(),hb=await hero.boundingBox();assert(cb.height<240,'compact controls stay under240px at '+width);assert(cb.y+cb.height<=hb.y+2,'controls occupy their own row above hero');for(const label of await page.locator('.cc-salary-basis label').all()){const box=await label.boundingBox();assert(box.height<=60,'radio never stretches to hero height');assert.equal(await label.evaluate(el=>getComputedStyle(el).borderTopWidth),'0px','no rectangular selection border');}

 if(!completeCoverage){
  await page.getByRole('radio',{name:'Líquido',exact:true}).check();assert.match(await page.locator('.cc-salary-basis-amount').innerText(),/Não calculável/);assert.equal(await page.locator('.cc-payroll-net-details').getAttribute('open'),null);assert.doesNotMatch(await hero.innerText(),/alternativa simplificada/);await page.keyboard.press('Tab');await page.getByRole('radio',{name:'Líquido',exact:true}).focus();assert.equal(await page.getByRole('radio',{name:'Líquido',exact:true}).evaluate(el=>el.matches(':focus-visible')),true);await page.screenshot({path:path.join(out,`${width}-${theme}-compact-overview.png`),fullPage:false});
  await page.getByRole('button',{name:'Extrato',exact:true}).click();assert.match(await page.locator('.cc-per-diem-summary').innerText(),/Líquido previsto no período[\s\S]*Não calculável/);assert.match(await page.locator('.cc-per-diem-summary').innerText(),/28 dia/);
  await page.getByRole('button',{name:'Gráficos',exact:true}).click();assert.equal(await page.locator('.cc-financial-bar-track').count(),0,'partial monthly net never produces complete graph bars');
  await page.screenshot({path:path.join(out,`${width}-${theme}-partial-net.png`),fullPage:false});results.push({width,theme,publishedDays:1,expectedDays:29,heroNetUnavailable:true,statementNetUnavailable:true,graphNetUnavailable:true});await context.close();continue;
 }
 await page.getByRole('radio',{name:'Líquido',exact:true}).check();assert.match(await page.locator('.cc-salary-basis-amount').innerText(),/2.250,00/);
 await page.getByRole('radio',{name:'Líquido',exact:true}).focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.getByRole('radio',{name:'Bruto',exact:true}).isChecked(),true);await page.keyboard.press('ArrowRight');
 await page.getByRole('button',{name:'Ocultar valores financeiros',exact:true}).first().click();assert.doesNotMatch(await page.locator('.cc-salary-basis-amount').innerText(),/2.250/);assert.match(await page.locator('.cc-salary-basis-amount').innerText(),/R\$ •••/);
 await page.getByRole('button',{name:'Mostrar valores financeiros',exact:true}).first().click();
 await open();assert.equal(await page.getByRole('radio',{name:'Líquido',exact:true}).isChecked(),true,'reload keeps account choice');
 await page.evaluate(()=>{const key='crewcheck_financial_month_settings_v1:financial-ui-qa:2032-02',r=JSON.parse(localStorage.getItem(key));delete r.values.irrf;localStorage.setItem(key,JSON.stringify(r));window.dispatchEvent(new Event('crewcheck:financial-config-changed'));});
 await page.waitForFunction(()=>document.querySelector('.cc-salary-basis-amount')?.textContent.includes('Não calculável'));assert.match(await page.locator('.cc-salary-basis-amount').innerText(),/IRRF/);
 await page.evaluate(()=>{document.documentElement.style.setProperty('font-size','32px','important');});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.screenshot({path:path.join(out,`${width}-${theme}.png`),fullPage:false});
 // Existing per-owner store: switching owner cannot inherit this preference.
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'another-synthetic',role:'user'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});
 assert.equal(await page.evaluate(()=>localStorage.getItem('crewcheck_financial_settings_v1:another-synthetic:crewcheck_salary_display_basis')),null);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'salary'})));
 if(await page.getByRole('radio',{name:'Bruto',exact:true}).count())assert.equal(await page.getByRole('radio',{name:'Bruto',exact:true}).isChecked(),true);
 results.push({width,theme,net2250:true,missingIRRF:true,reload:true,nativeKeyboard:true,masked:true,ownerIsolated:true});await context.close();
}
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({results,errors,realAPIRequests:0,network:'all requests intercepted; static compiled dist only'},null,2));console.log('PASS compiled salary basis UI:12 viewport/theme/coverage cases, exact monthly net, missing IRRF, native keyboard, masking, reload and owner preference');
}finally{await browser.close();}})();
