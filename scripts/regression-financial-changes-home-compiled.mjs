// Actual compiled Home routes and changesDetails slots. Synthetic local state;
// every API/external request is intercepted. No delivery or provider calls.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import vm from 'node:vm';import ts from 'typescript';import {createRequire} from 'node:module';import {build} from 'esbuild';
// Format sits under the collapsed "Exibição" expander of the roster.
const openView=async p=>{const d=p.locator('details.cc-roster-view-options');await d.waitFor({state:'attached'});if(!await d.evaluate(e=>e.open))await d.locator(':scope > summary').click();};
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const root=path.resolve(process.env.FINANCIAL_CHANGES_COMPILED_ROOT||process.cwd()),dist=path.join(root,'dist');assert(fs.existsSync(path.join(dist,'index.html')),'Build the actual candidate first');
const source=fs.readFileSync(path.join(root,'scripts/regression-financial-payment-preview.cjs'),'utf8'),ast=ts.createSourceFile('fixture.cjs',source,99,true,ts.ScriptKind.JS);
const declarations=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&['seed','roster'].includes(n.name?.text)||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='day'));
const fixture=vm.createContext({});vm.runInContext(declarations.map(n=>n.getText(ast)).join('\n')+'\nglobalThis.kind=roster("domestic");',fixture);const seed=declarations.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='seed').getText(ast);
const syntheticEvidence=(await build({stdin:{contents:`import {capturePublishedFreeDayStart,attachPublishedFreeDayTimeZone} from '${root}/client/src/lib/freeDayStartEvidence';import {saveOwnedPlannedRoster} from '${root}/client/src/lib/plannedRosterStore';const day=(n,clock)=>({date:String(n).padStart(2,'0')+'/08/2026',type:n===12||n===20?'DO':'DR',pairingCode:n===12||n===20?'DO':'DR',legs:[],dutyReport:null,dutyDebrief:null,freeDayStartEvidence:capturePublishedFreeDayStart([n===12||n===20?'DO':'DR',clock,'BSB'],String(n).padStart(2,'0')+'/08/2026')});const roster=clock=>attachPublishedFreeDayTimeZone({crewName:'SYNTHETIC',crewId:'900001',year:2026,month:8,rank:'CCM',base:'BSB',rawText:'SYNTHETIC Timezone -3 : Brasília',days:[12,13,20,21].map(n=>day(n,clock))});saveOwnedPlannedRoster(roster('01:46'),'SYNTHETIC BEFORE');localStorage.setItem('crewcheck_roster_choice_v1_financial-ui-qa',JSON.stringify({owner:'financial-ui-qa',roster:roster('08:30'),selection:'explicit',cacheSchema:'p0-operational-date-anchor-v2',sourceFileName:'SYNTHETIC AFTER'}));`,resolveDir:root,loader:'ts'},bundle:true,format:'iife',write:false,alias:{'@':path.join(root,'client/src'),'@shared':path.join(root,'shared')},logLevel:'silent'})).outputFiles[0].text;
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://fixture.invalid');const relative=url.pathname.startsWith('/assets/')?url.pathname.slice(1):url.pathname==='/favicon.ico'?'favicon.ico':'index.html';const file=path.join(dist,relative);if(!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.ico')?'image/x-icon':'text/html');res.end(fs.readFileSync(file));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;let browser;const results=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 for(const timezoneId of ['UTC','America/Sao_Paulo','Asia/Tokyo']){
  const context=await browser.newContext({timezoneId,viewport:{width:390,height:900},serviceWorkers:'block'}),requests=[],errors=[];
  await context.route('**/*',route=>{const r=route.request(),u=new URL(r.url());if(u.origin!==origin)return route.abort();if(u.pathname.startsWith('/api/')){requests.push({path:u.pathname,method:r.method()});return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[],"enabled":false}'});}return route.continue();});
  await context.addInitScript({content:'('+seed+')('+JSON.stringify({theme:'light',kind:fixture.kind,amount:100,history:[],salaryBase:2900,homeMode:'standard'})+');'});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();
  const open=async view=>{await page.evaluate(view=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:view})),view);await page.locator('.cc-payment-overview').waitFor();const heading=page.getByRole('heading',{name:'Alterações',exact:true});if(!await heading.count())await page.getByRole('button',{name:'Alterações',exact:true}).click();await heading.waitFor();};
  const baselineRequests=requests.length;
  for(const view of ['perdiem','salary']){
   await open(view);const slot=page.getByRole('region',{name:'Início de folga',exact:true});await slot.waitFor();assert.equal(await slot.count(),1,'one actual Home changesDetails slot');assert.match(await slot.innerText(),/Dados a conferir/);assert.equal(await slot.getByRole('button',{name:'Selecionar',exact:true}).count(),1);
   await slot.getByRole('button',{name:'Selecionar',exact:true}).click();assert.notEqual(await slot.locator('[data-free-day-source-consent]').getAttribute('open'),null);
   await page.getByRole('button',{name:'Detalhes do pagamento',exact:true}).click();await page.getByRole('button',{name:'Alterações',exact:true}).click();await slot.waitFor();assert.equal(await slot.count(),1);
  }
  await page.getByRole('combobox',{name:'Filtro financeiro',exact:true}).selectOption('custom');
  await page.locator('input[aria-label="Início financeiro"]').fill('2030-01-01');await page.locator('input[aria-label="Fim financeiro"]').fill('2030-01-31');
  const outside=page.getByRole('region',{name:'Início de folga',exact:true});await outside.locator('[role="status"]').filter({hasText:'Fora do período'}).waitFor();
  assert.equal(await outside.getByRole('button',{name:'Selecionar',exact:true}).count(),0,'out-of-period must not offer reference selection');assert.equal(await outside.locator('[data-free-day-source-consent]').count(),0);
  await page.getByRole('combobox',{name:'Filtro financeiro',exact:true}).selectOption('month');
  for(const layout of ['aims','calendar']){
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'roster'})));
   await openView(page);await page.getByRole('combobox',{name:'Formato da escala',exact:true}).selectOption(layout);
   assert.equal(await page.locator('.cc-publication-history').count(),0,'publication history is absent from actual roster '+layout);
   const link=page.getByRole('link',{name:'Alterações',exact:true});assert.equal(await link.count(),1);
   assert.equal(await link.getAttribute('href'),'?view=perdiem&fmode=allowance&fscreen=changes');
   await link.click();await page.getByRole('heading',{name:'Alterações',exact:true}).waitFor();
   assert.equal(await page.getByRole('region',{name:'Início de folga',exact:true}).count(),1,'actual roster link reaches Home changesDetails');
  }
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'compare'})));
  await page.getByRole('heading',{name:'Planejado x atual',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Marcar atual como planejada',exact:true}).count(),1,'published versus actual workflow remains available');
  await open('perdiem');
  const newRequests=requests.slice(baselineRequests);assert.equal(newRequests.filter(r=>/send|dispatch|telegram|notification.*test|free.day/i.test(r.path)&&r.method!=='GET').length,0,'navigation must not request delivery');
  await page.getByRole('region',{name:'Início de folga',exact:true}).getByRole('button',{name:'Selecionar',exact:true}).click();
  await page.evaluate(()=>window.dispatchEvent(new Event('crewcheck:auth-will-change')));
  await page.locator('.cc-financial-free-day').waitFor({state:'detached'});
  await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'other-synthetic-owner',email:'other@example.invalid',role:'user'}));localStorage.setItem('crewcheck_auth_token','other-synthetic-token');window.dispatchEvent(new Event('crewcheck:auth-changed'));});
  await page.waitForFunction(()=>!document.querySelector('[data-free-day-source-consent][open]'));
  assert.equal(await page.locator('[data-free-day-source-consent][open]').count(),0,'previous owner selector cannot remain open');
  assert.equal(await page.locator('[data-free-day-alert]').count(),0,'foreign owner has no prior actionable review');assert.deepEqual(errors,[]);results.push({timezoneId,allowanceSlot:true,salarySlot:true,selector:true,back:true,ownerBoundary:true,rosterAimsLink:true,rosterCalendarLink:true,compareRoute:true,apiRequestsIntercepted:requests.length});await context.close();
  const evidenceContext=await browser.newContext({timezoneId,viewport:{width:390,height:900},serviceWorkers:'block'});
  await evidenceContext.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[],"enabled":false}'});return route.continue();});
  await evidenceContext.addInitScript({content:'('+seed+')('+JSON.stringify({theme:'light',kind:fixture.kind,amount:100,history:[],salaryBase:2900,homeMode:'standard'})+');'+syntheticEvidence});
  const evidencePage=await evidenceContext.newPage();evidencePage.setDefaultTimeout(10000);await evidencePage.goto(origin+'/app');await evidencePage.locator('.cz-app').waitFor();
  await evidencePage.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'perdiem'})));await evidencePage.locator('.cc-payment-overview').waitFor();await evidencePage.getByRole('button',{name:'Alterações',exact:true}).click();
  await evidencePage.getByRole('combobox',{name:'Filtro financeiro',exact:true}).selectOption('month');
  const comparison=evidencePage.getByRole('region',{name:'Início de folga',exact:true});await comparison.getByText('2 alertas a revisar',{exact:true}).waitFor();assert.equal(await evidencePage.getByText('Referência · 08/2026',{exact:true}).count(),1);
  await evidencePage.getByRole('combobox',{name:'Filtro financeiro',exact:true}).selectOption('week');await evidencePage.locator('input[aria-label="Dia da semana de trabalho"]').fill('2026-08-12');
  await comparison.getByText('1 alertas a revisar',{exact:true}).waitFor();await comparison.locator('details').first().locator('summary').click();assert.match(await comparison.innerText(),/2026-08-12/);assert.doesNotMatch(await comparison.innerText(),/2026-08-20/);
  await evidencePage.getByRole('combobox',{name:'Filtro financeiro',exact:true}).selectOption('month');await comparison.getByText('2 alertas a revisar',{exact:true}).waitFor();
  results[results.length-1].outsidePeriod=true;results[results.length-1].realReviewWeekProjection=true;await evidenceContext.close();
 }
 console.log('PASS actual compiled Home financial changes slots/routes '+JSON.stringify(results));
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
