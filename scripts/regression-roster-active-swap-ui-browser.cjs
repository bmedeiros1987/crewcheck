// Caller/UI characterization on the actual compiled app (real Home, RosterLaunchView, calendar and
// FlightDeck quick roster, shipping CSS): two saved competences of the same crew (October and
// November 2032, synthetic) with the active roster swapped between them, clock fixed on 01/11/2032,
// every API intercepted (offline history path), no network. It pins today's behaviour so a fix of
// the history front changes it consciously:
//  - the Escala window lists both months whichever roster is active, and each month's counts are
//    its own and identical across the swap (same competence/window, totals segregated by month);
//  - the initial month is the clock's month, not the active competence;
//  - money appears only for the active competence; the other month shows "Indisponível", never zero;
//  - the calendar shows each month's own programs;
//  - the FlightDeck quick roster uses the active competence only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),ts=require('typescript');
const {createRequire}=require('node:module');const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||__filename)('playwright');
assert.match(fs.readFileSync('client/src/lib/databaseClient.ts','utf8'),/export async function openRosterDisplayWindow/,'run after node scripts/v139/apply.mjs and a web build');
const out=path.resolve('artifacts/roster-active-swap');fs.mkdirSync(out,{recursive:true});
const ast=ts.createSourceFile('server.mjs',fs.readFileSync('server.mjs','utf8'),99,true,ts.ScriptKind.JS),responder=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='serveStatic');
const scope=vm.createContext({guardStaticHtml:require('../server/static-html-guard.mjs').guardStaticHtml,fs,path,Buffer,distDir:path.resolve('dist'),sendJson:(res,code,body)=>{res.writeHead(code);res.end(JSON.stringify(body));}});vm.runInContext(responder.getText(ast)+'\nglobalThis.respond=serveStatic;',scope);const server=http.createServer((req,res)=>scope.respond(req,res,new URL(req.url,'http://localhost')));

const user='roster-swap-qa';
const flightDay=(date,flight,origin,destination)=>({date,year:2032,month:Number(date.split('/')[1]),type:'VOO',pairingCode:flight,dutyReport:'07:10',dutyDebrief:'12:30',dutyReportSource:'published',dutyDebriefSource:'published',legs:[{flightNumber:flight,origin,destination,departureTime:'07:50',arrivalTime:'09:40',presentationTime:'07:10',workType:'OP'}]});
const crew={base:'GRU',rank:'CC',airline:'LA',crewName:'TRIPULANTE SINTETICO',crewId:'BP00000001'};
const october={...crew,year:2032,month:10,days:[flightDay('10/10/2032','LA9810','GRU','BSB'),flightDay('30/10/2032','LA9830','GRU','REC')]};
const november={...crew,year:2032,month:11,days:[flightDay('02/11/2032','LA9902','GRU','BSB'),flightDay('05/11/2032','LA9905','GRU','POA'),flightDay('20/11/2032','LA9920','GRU','SSA')]};
const item=(roster,id)=>({id,checksum:id,createdAt:'2032-11-01T00:00:00Z',roster,compliance:{score:0,alerts:[]},gym:[],sourceFileName:'Sintético '+id});
const history=[item(october,'local-swap-2032-10'),item(november,'local-swap-2032-11')];

function seed({user,active,history,instant}){
 const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};
 localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:user,name:'SYNTHETIC SWAP QA',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-local-only');
 localStorage.setItem('crewcheck:first-access-tour:v1434:disabled','1');sessionStorage.setItem('crewcheck:first-access-tour:v1434:session-seen','1');localStorage.setItem('crewcheck_demo_mode_seen','1');
 localStorage.setItem('crewcheck_theme_mode','light');localStorage.setItem('crewcheck:appearance:v1','light');localStorage.setItem('crewcheck_language','pt');
 // Synthetic manual rate on the existing local configuration path; not a tariff.
 for(const key of ['domestic','north_america','mexico','south_america_caribbean','argentina','chile','england','europe','africa','other_international'])localStorage.setItem('crewcheck_financial_settings_v1:'+user+':crewcheck_perdiem_rate_'+key,'100');
 localStorage.setItem('crewcheck_local_history_v11_'+user,JSON.stringify(history));
 localStorage.setItem('crewcheck_roster_choice_v1_'+user,JSON.stringify({owner:user,roster:active,selection:'explicit',cacheSchema:'p0-operational-date-anchor-v2',sourceFileName:'Synthetic swap QA'}));
}
const text=async locator=>(await locator.textContent()||'').replace(/\s+/g,' ').trim();
async function readMonth(page,month){
 const select=page.locator('select').filter({has:page.locator(`option[value="${month}"]`)}).first();
 await select.selectOption(month);await page.waitForTimeout(150);
 const counts=await text(page.locator('.cc-roster-hero-counts-v1397'));
 return {summary:await text(page.locator('.cc-roster-finance-summary > summary')),counts,period:await text(page.locator('.cc-roster-period-count'))};
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});const results={};
 try{for(const active of ['november','october']){
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
  const external=[];await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin){external.push(url.origin+url.pathname);return route.abort();}if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"code":"DATABASE_OFFLINE","items":[],"data":[]}'});return route.request().method()==='GET'?route.continue():route.abort();});
  await context.addInitScript(seed,{user,active:active==='november'?november:october,history,instant:Date.parse('2032-11-01T15:00:00Z')});
  await context.addInitScript(()=>{window.Notification=class{static permission='denied';constructor(){throw Error('No real notification allowed')}};});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(origin+'/app');await page.locator('.cz-app[data-version]').waitFor();
  // FlightDeck quick roster (cockpit is the start view): October 30 and November 2 programs.
  await page.locator('.cc-home-roster').waitFor();
  const quick={};
  await page.getByRole('button',{name:'Sete dias anteriores'}).click();
  await page.getByRole('button',{name:/30 de outubro de 2032/}).click();quick['2032-10-30']=await page.locator('.cc-home-roster-list [data-roster-event-id]').count();
  await page.getByRole('button',{name:/^Próximos sete dias|Sete dias seguintes/}).click().catch(()=>{});
  await page.getByRole('button',{name:/2 de novembro de 2032/}).click().catch(async()=>{await page.locator('.cc-home-roster-period button').last().click();await page.getByRole('button',{name:/2 de novembro de 2032/}).click();});
  quick['2032-11-02']=await page.locator('.cc-home-roster-list [data-roster-event-id]').count();
  // Escala: window of saved competences.
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'roster'})));
  await page.waitForFunction(()=>[...document.querySelectorAll('select option')].map(o=>o.value).filter(v=>/^2032-1[01]$/.test(v)).length===2,null,{timeout:15000});
  const months=await page.locator('select').filter({has:page.locator('option[value="2032-10"]')}).first().locator('option').evaluateAll(options=>options.map(o=>o.value));
  const initial=await page.locator('select').filter({has:page.locator('option[value="2032-10"]')}).first().inputValue();
  const perMonth={};for(const month of ['2032-10','2032-11'])perMonth[month]=await readMonth(page,month);
  // Calendar layout, per month.
  await page.locator('.cc-roster-view-options > summary').click();await page.locator('select[aria-label="Formato da escala"]').selectOption('calendar');
  const calendar={};for(const month of ['2032-10','2032-11']){await page.locator('select').filter({has:page.locator(`option[value="${month}"]`)}).first().selectOption(month);await page.locator('.cc-calendar-roster').waitFor();calendar[month]=await text(page.locator('.cc-calendar-roster'));}
  await page.screenshot({path:path.join(out,`active-${active}-calendar.png`),fullPage:false});
  assert.deepEqual([...new Set(external)].filter(url=>!/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)),[],'no other external request');
  assert.deepEqual(errors,[]);
  results[active]={months,initial,perMonth,calendar,quick};await context.close();
 }}finally{await browser.close();server.close();}

 for(const active of ['november','october']){
  const r=results[active];
  assert.deepEqual(r.months,['2032-10','2032-11'],`${active} active: the Escala window lists both saved competences`);
  assert.equal(r.initial,'2032-11',`${active} active: CURRENT — the initial month is the clock's month, not the active competence`);
  assert.match(r.calendar['2032-10'],/LA9810|LA9830/);assert.doesNotMatch(r.calendar['2032-10'],/LA99\d\d/,'October calendar has only October programs');
  assert.match(r.calendar['2032-11'],/LA9902|LA9905|LA9920/);assert.doesNotMatch(r.calendar['2032-11'],/LA98\d\d/,'November calendar has only November programs');
 }
 // Same competence, same window: the swap does not change a month's counts; months stay segregated.
 for(const month of ['2032-10','2032-11'])assert.equal(results.november.perMonth[month].counts,results.october.perMonth[month].counts,`${month}: counts identical whichever roster is active`);
 const days=counts=>Number(/^(\d+) dias/.exec(counts)?.[1]),flights=counts=>Number(/dias(\d+) voos/.exec(counts)?.[1]);
 assert.deepEqual([days(results.november.perMonth['2032-10'].counts),flights(results.november.perMonth['2032-10'].counts)],[2,2],'October counts only October');
 assert.deepEqual([days(results.november.perMonth['2032-11'].counts),flights(results.november.perMonth['2032-11'].counts)],[3,3],'November counts only November');
 // Money: only the active competence; the other shows "Indisponível", never a zero.
 const money=summary=>/Diárias ([^·]+)/.exec(summary)?.[1].trim();
 assert.notEqual(money(results.november.perMonth['2032-11'].summary),'Indisponível');assert.equal(money(results.november.perMonth['2032-10'].summary),'Indisponível','CURRENT — October money hidden while November is active');
 assert.notEqual(money(results.october.perMonth['2032-10'].summary),'Indisponível');assert.equal(money(results.october.perMonth['2032-11'].summary),'Indisponível','CURRENT — November money hidden while October is active');
 for(const active of ['november','october'])for(const month of ['2032-10','2032-11'])assert.doesNotMatch(results[active].perMonth[month].summary,/Diárias R\$\s*0,00/,'unavailable is never shown as zero');
 // FlightDeck quick roster: active competence only.
 assert.deepEqual(results.november.quick,{'2032-10-30':0,'2032-11-02':1},'CURRENT — with November active the quick roster does not show October 30');
 assert.deepEqual(results.october.quick,{'2032-10-30':1,'2032-11-02':0},'CURRENT — with October active the quick roster does not show November 2');
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({scope:'Actual compiled app, synthetic October/November 2032, active swapped, clock 01/11/2032, every API intercepted.',results},null,2));
 console.log('PASS active swap UI characterization: window lists both competences and month counts are identical across the swap and segregated; initial month follows the clock; money only for the active competence (other month "Indisponível", never zero); calendar per month; FlightDeck quick roster active-only');
})().catch(error=>{console.error(error);process.exitCode=1;});
