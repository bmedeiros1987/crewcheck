// Targeted actual-app regression; reuses synthetic seed/setup from known-values gate.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),ts=require('typescript');
const {createRequire}=require('node:module'),{chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||__filename)('playwright');
const out=path.resolve(process.env.FINANCIAL_UI_EVIDENCE_DIR||'artifacts/financial-known-values');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync('server.mjs','utf8'),ast=ts.createSourceFile('server.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),serve=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='serveStatic');
const scope=vm.createContext({guardStaticHtml: require('../server/static-html-guard.mjs').guardStaticHtml,fs,path,Buffer,distDir:path.resolve('dist'),sendJson:(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));}});vm.runInContext(serve.getText(ast)+'\nglobalThis.respond=serveStatic;',scope);
const server=http.createServer((req,res)=>scope.respond(req,res,new URL(req.url,'http://localhost')));
function seed({unknown,unknownAddition,futureForeign}){
 const NativeDate=Date,instant=Date.parse('2026-10-18T15:00:00Z');globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};
 const owner='financial-ui-qa';localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:owner,email:'synthetic@example.invalid',name:'SYNTHETIC FINANCE',role:'user'}));localStorage.setItem('crewcheck_language','pt');localStorage.setItem('crewcheck_auth_token','synthetic-only');
 localStorage.setItem('crewcheck:first-access-tour:v1434:disabled','1');sessionStorage.setItem('crewcheck:first-access-tour:v1434:session-seen','1');localStorage.setItem('crewcheck_demo_mode_seen','1');
 const days=Array.from({length:31},(_,i)=>({date:String(i+1).padStart(2,'0')+'/10/2026',dayOfWeek:'SYN',type:'DO',pairingCode:'DO',dutyReport:null,dutyDebrief:null,legs:[],dutyHours:0,flyingHours:0,isNextDay:false,hotel:null,base:'BSB',rawText:'SYNTHETIC QA ONLY'}));
 const leg=(flightNumber,origin,destination,departureTime,arrivalTime)=>({flightNumber,origin,destination,departureTime,arrivalTime,workType:'OP',duration:120,aircraftType:'SYN'});
 days[19]={...days[19],type:'FLIGHT',pairingCode:'SYN',dutyReport:'08:00',dutyDebrief:'17:00',legs:[leg('SYN1001','BSB','GRU','10:00','12:00'),leg('SYN1002','GRU','BSB','14:00','16:00')],dutyHours:9,flyingHours:4};
 if(unknown)days[13]={...days[13],type:'FLIGHT',pairingCode:'SYN',dutyReport:'08:00',dutyDebrief:'19:00',legs:[leg('SYNCPV1','BSB','CPV','10:00','12:00'),leg('SYNCPV2','CPV','BSB','13:00','15:00'),leg('SYNOPS','BSB','OPS','16:00','18:00')],dutyHours:11,flyingHours:6};
 if(futureForeign)days[22]={...days[22],type:'FLIGHT',pairingCode:'SYN',base:'JFK',dutyReport:'11:00',dutyDebrief:'21:30',legs:[leg('SYNUSD','JFK','BSB','13:00','21:00')],dutyHours:10.5,flyingHours:8};
 const roster={crewName:'SYNTHETIC FINANCE',crewId:'900001',base:'BSB',rank:'CC',airline:'LA',month:10,year:2026,days,rawText:'SYNTHETIC — NO REAL ROSTER'};
 localStorage.setItem('crewcheck_roster_choice_v1_'+owner,JSON.stringify({owner,roster,selection:'explicit',cacheSchema:'p0-operational-date-anchor-v2',sourceFileName:'Synthetic finance'}));
 const prefix='crewcheck_financial_settings_v1:'+owner+':';localStorage.setItem(prefix+'crewcheck_salary_base_brl','999');localStorage.setItem(prefix+'crewcheck_salary_fixed_additions_brl','999');localStorage.setItem(prefix+'crewcheck_perdiem_rate_domestic','100');localStorage.setItem(prefix+'crewcheck_perdiem_rate_north_america','100');
 const val=(amountMinor,kind='earning')=>({amountMinor,currency:'BRL',kind,source:'manual',sourceId:'synthetic',recurrence:'once'});
 localStorage.setItem('crewcheck_financial_month_settings_v1:'+owner+':2026-10',JSON.stringify({schema:1,ownerId:owner,month:'2026-10',revision:1,closed:false,values:{fixed_with_co:val(340000),other_fixed:val(unknownAddition?null:1000),inss:val(10000,'deduction'),irrf:val(0,'deduction'),other_deductions:val(2000,'deduction')}}));
}
async function screen(page,name){const root=page.locator('.cc-payment-overview');if(await root.getAttribute('data-financial-screen')===name)return;await page.getByRole('button',{name:{payment:'Detalhes do pagamento',charts:'Gráficos',statement:'Extrato',overview:'Resumo financeiro'}[name],exact:true}).click();await page.waitForFunction(name=>document.querySelector('.cc-payment-overview')?.dataset.financialScreen===name,name);}
const money=text=>Number(text.replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.'));
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const results=[];let financialWrites=0;const external=[];
 try{for(const timezoneId of ['UTC','America/Sao_Paulo']){
  const context=await browser.newContext({viewport:{width:390,height:850},timezoneId,serviceWorkers:'block'});
  await context.addInitScript(seed,{unknown:false,unknownAddition:false,futureForeign:true});
  await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin){external.push({host:url.hostname,method:req.method()});return route.abort();}if(url.pathname.startsWith('/api/')){if(req.method()!=='GET'&&url.pathname.startsWith('/api/platform/finance/'))financialWrites++;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,code:url.pathname==='/api/platform/finance/upcoming'?'FINANCIAL_LEDGER_NOT_ENABLED':'SYNTHETIC_OFFLINE'})});}return route.continue();});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/app?view=cockpit');await page.locator('.cz-app').waitFor();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'concierge'})));
  const card=page.getByRole('region',{name:'Próximas previsões financeiras'});await card.locator('li button').first().waitFor();
  const opener=card.locator('li button').first(),key=await opener.getAttribute('data-financial-origin');
  await opener.focus();await opener.evaluate(button=>{button.scrollIntoView({block:'center'});window.__originScroll=scrollY;});
  const y=await page.evaluate(()=>window.__originScroll);await opener.press('Enter');
  await page.getByRole('heading',{name:'Diárias',exact:true}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('view'),'perdiem');
  await page.goBack();await card.locator('li button').first().waitFor();
  await page.waitForFunction(key=>document.activeElement?.getAttribute('data-financial-origin')===key,key);
  assert.equal(new URL(page.url()).searchParams.get('view'),'concierge');assert(Math.abs(await page.evaluate(()=>scrollY)-y)<3,'restore source scroll after async load');
  await card.locator('li button').first().press('Enter');await page.getByRole('heading',{name:'Diárias',exact:true}).waitFor();
  await page.locator('.cz-global-header button.cz-menu-btn').click();
  await card.locator('li button').first().waitFor();await page.waitForFunction(key=>document.activeElement?.getAttribute('data-financial-origin')===key,key);
  assert.equal(new URL(page.url()).searchParams.get('view'),'concierge','actual header back returns to source');assert(Math.abs(await page.evaluate(()=>scrollY)-y)<3);
  await page.screenshot({path:path.join(out,'concierge-source-'+timezoneId.replaceAll('/','-')+'.png'),fullPage:false});
  await card.locator('li button').first().press('Enter');await page.getByRole('heading',{name:'Diárias',exact:true}).waitFor();
  await screen(page,'charts');await page.getByLabel('Filtro financeiro',{exact:true}).selectOption('custom');await page.getByLabel('Início financeiro',{exact:true}).fill('2026-10-10');await page.getByLabel('Fim financeiro',{exact:true}).fill('2026-10-25');
  if(await page.getByLabel('Moeda do gráfico',{exact:true}).count())await page.getByLabel('Moeda do gráfico',{exact:true}).selectOption('USD');
  const params=new URL(page.url()).searchParams,currency=params.get('fcurrency');
  await screen(page,'payment');await page.getByRole('button',{name:'← Voltar',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.cc-payment-overview')?.dataset.financialScreen==='charts');
  assert.equal(await page.getByLabel('Início financeiro',{exact:true}).inputValue(),'2026-10-10');assert.equal(new URL(page.url()).searchParams.get('fcurrency'),currency);
  await page.reload();await page.getByLabel('Fim financeiro',{exact:true}).waitFor();assert.equal(await page.getByLabel('Fim financeiro',{exact:true}).inputValue(),'2026-10-25');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,'concierge-origin-'+timezoneId.replaceAll('/','-')+'.png'),fullPage:false});
  results.push({timezoneId,width:390,sourceFocus:true,sourceScroll:true,sourceView:true,actualHeaderBack:true,filterCurrencyReload:true});await context.close();
 }assert.equal(financialWrites,0);assert(external.every(request=>request.method==='GET'),'no external write attempts');fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,financialWrites,externalBlocked:external},null,2));console.log('PASS targeted Concierge origin '+JSON.stringify({results,financialWrites,externalBlocked:external}));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
