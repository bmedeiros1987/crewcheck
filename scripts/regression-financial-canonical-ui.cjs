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
let handler; const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');if(handler&&await handler(req,res,url))return;staticContext.respond(req,res,url);});
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
async function showFinancial(page,screen){const root=page.locator('.cc-payment-overview');if(await root.getAttribute('data-financial-screen')===screen)return;const names={overview:'← Voltar ao resumo',statement:'Extrato',charts:'Gráficos',payment:'Detalhes do pagamento'};await page.getByRole('button',{name:names[screen],exact:true}).click();await page.waitForFunction(screen=>document.querySelector('.cc-payment-overview')?.dataset.financialScreen===screen,screen);}


(async()=>{
 const {createFinancialLedgerHandler}=await import('../server/financial-ledger-route.mjs');
 const {createFinancialSqlStore}=await import('../server/financial-ledger-sql.mjs');
 const ledgerTest=fs.readFileSync('scripts/regression-financial-ledger.mjs','utf8');
 const database=vm.runInNewContext('('+ledgerTest.slice(ledgerTest.indexOf('function database()'),ledgerTest.indexOf('const A ='))+')',{structuredClone,Promise,JSON,Error});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 try{
 for(const scenario of ['domestic','multi']){
 const db=database(),store=createFinancialSqlStore(db);
 handler=createFinancialLedgerHandler({enabled:()=>true,allowedOrigin:()=>origin,identityProvider:()=>({authenticated:true,role:'owner',ownerId:'synthetic-a@example.invalid'}),poolProvider:async()=>db,storeFactory:()=>store,now:()=>new Date('2032-02-02T15:00:00Z')});
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname.startsWith('/api/')&&!['/api/platform/finance/capture','/api/platform/finance/history','/api/platform/finance/upcoming'].includes(u.pathname))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[],"enabled":false}'});return route.continue();});
 const payload=roster(scenario);if(scenario==='multi')payload.days.find(day=>day.date==='01/03/2032').legs=[{flightNumber:'LA8000',origin:'BSB',destination:'JFK',departureTime:'11:00',arrivalTime:'20:00',workType:'OP'}];for(let i=25;i<=29;i++)payload.days.push({...day(String(i)+'/02/2032'),type:'DO',pairingCode:'DO',dutyReport:null,dutyDebrief:null,dutyHours:0});
 await context.addInitScript(seed,{theme:'light',kind:payload,amount:123.45,history:[]});
 await context.addInitScript(()=>{const user=JSON.parse(localStorage.getItem('crewcheck_auth_user'));user.email='synthetic-a@example.invalid';user.crewId='900001';localStorage.setItem('crewcheck_auth_user',JSON.stringify(user));});
 const page=await context.newPage();page.setDefaultTimeout(15000);await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();
 await page.locator('.cc-home-finance').getByRole('button',{name:/Diárias/}).click();
 const summary=page.locator('summary').filter({hasText:'Revisar captura da previsão de diárias'});await summary.click();
 await page.getByLabel('Referência da revisão financeira').fill('synthetic-compiled-ui');
 await page.getByLabel('Confirmo que esta escala é minha e revisei os valores calculados.').check();
 assert.equal(await page.getByLabel('Confirmo a política BRL: quinta-feira; feriado bancário de SP antecipa para quarta.').isDisabled(),true,'multi-week scope cannot apply one Thursday to all rows');
 await page.getByText(/selecione uma única semana de trabalho/).waitFor();
 if(scenario==='multi'){
 await page.getByLabel('Confirmo a política: a diária internacional selecionada é prevista na data do voo vinculado.').check();
 const links=page.getByRole('combobox',{name:/Voo comprovado/});assert(await links.count()>0,'foreign canonical items exist');
 await links.first().selectOption({index:1});
 }
 assert.equal(db.state.revisions.length,0,'mount and inputs never write');
 await page.getByRole('button',{name:'Preparar revisão sem gravar',exact:true}).click();
 await page.getByRole('button',{name:'Confirmar gravação da previsão revisada',exact:true}).waitFor().catch(async e=>{console.log(await page.locator('details').filter({has:summary}).innerText().catch(()=>page.locator('body').innerText()));throw e;});
 assert.equal(db.state.revisions.length,0,'preview remains read only');
 await page.getByRole('button',{name:'Confirmar gravação da previsão revisada',exact:true}).click();
 await page.getByText('Previsão salva. Isso não confirma recebimento.',{exact:true}).waitFor();
 assert(db.state.revisions.length>0);const records=await store.list('synthetic-a@example.invalid');assert(records.every(x=>x.status==='forecast'&&!x.paymentDate));if(scenario==='domestic')assert(records.every(x=>!x.expectedPaymentDate));else{const linked=records.filter(x=>x.expectedPaymentDate);assert.equal(linked.length,1);assert.equal(linked[0].expectedPaymentDate,'2032-03-01');assert.equal(linked[0].expectedPaymentTimezone,'America/Sao_Paulo');}
 if(scenario==='domestic'){
  const count=db.state.revisions.length;
  await page.getByRole('button',{name:'Extrato',exact:true}).click();
  await page.getByLabel('Filtro financeiro',{exact:true}).selectOption('custom');
  await page.getByLabel('Início financeiro',{exact:true}).fill('2032-02-04');await page.getByLabel('Fim financeiro',{exact:true}).fill('2032-02-10');
  await summary.click();await page.getByLabel('Referência da revisão financeira').fill('synthetic-week-review');
  await page.getByLabel('Confirmo que esta escala é minha e revisei os valores calculados.').check();
  const brl=page.getByLabel('Confirmo a política BRL: quinta-feira; feriado bancário de SP antecipa para quarta.');assert.equal(await brl.isDisabled(),false);await brl.check();
  const date=page.getByLabel('Data comprovada do ciclo BRL');assert.equal(await date.getAttribute('min'),'2032-02-12');assert.equal(await date.getAttribute('max'),'2032-02-12');
  await page.getByRole('button',{name:'Preparar revisão sem gravar',exact:true}).click();await page.getByRole('button',{name:'Confirmar gravação da previsão revisada',exact:true}).waitFor();assert.equal(db.state.revisions.length,count,'confirmed policy with empty date previews without writing');await page.getByRole('button',{name:'Cancelar revisão',exact:true}).click();
  await date.fill('2032-02-05');await page.getByRole('button',{name:'Preparar revisão sem gravar',exact:true}).click();await page.getByText(/quinta-feira informada não pertence/).waitFor();assert.equal(db.state.revisions.length,count,'wrong cycle never writes');
  await date.fill('2032-02-12');await page.getByRole('button',{name:'Preparar revisão sem gravar',exact:true}).click();await page.getByRole('button',{name:'Confirmar gravação da previsão revisada',exact:true}).waitFor();assert.equal(db.state.revisions.length,count,'valid single-week preview remains read-only');
 }
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'cockpit'})));await page.locator('.cz-menu-btn').first().click();await page.locator('.cc-menu-destination[data-menu-label="Concierge"]').click();
 await page.getByRole('heading',{name:'Próximas previsões financeiras',exact:true}).waitFor();
 await page.getByText('Resumo parcial: há dados, datas ou valores a conferir no Financeiro.',{exact:true}).waitFor();
 if(scenario==='multi')await page.locator('.cc-concierge-finance time[datetime="2032-03-01"]').waitFor();
 await page.screenshot({path:path.join(out,`canonical-${scenario}-concierge.png`),fullPage:true});
 console.log('PASS compiled canonical UI: real calculated roster -> review without write -> explicit capture -> real handler/producer/SQL protocol -> Concierge, pending unproven dates; all external requests blocked');
 await context.close();
 }
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
