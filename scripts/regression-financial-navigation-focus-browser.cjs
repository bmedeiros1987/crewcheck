const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),ts=require('typescript');
const {createRequire}=require('node:module'),{chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||__filename)('playwright');
const out=path.resolve(process.env.FINANCIAL_UI_EVIDENCE_DIR||'artifacts/financial-focus-probe');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync('server.mjs','utf8'),ast=ts.createSourceFile('server.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),serve=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='serveStatic');
const scope=vm.createContext({guardStaticHtml: require('../server/static-html-guard.mjs').guardStaticHtml,fs,path,Buffer,distDir:path.resolve('dist'),sendJson:(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));}});vm.runInContext(serve.getText(ast)+'\nglobalThis.respond=serveStatic;',scope);
const server=http.createServer((req,res)=>scope.respond(req,res,new URL(req.url,'http://localhost')));

const fixture=ts.createSourceFile('fixture.cjs',fs.readFileSync('scripts/regression-financial-known-values-app.cjs','utf8'),ts.ScriptTarget.Latest,true);const seedSource=fixture.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='seed').getText(fixture);
async function entryHeading(page,name) {
 await page.getByRole('heading',{name,exact:true}).waitFor();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const metrics=await page.evaluate(name=>{
  const box=element=>{const rect=element.getBoundingClientRect();return {top:rect.top,bottom:rect.bottom};};
  const heading=Array.from(document.querySelectorAll('h1')).find(element=>element.textContent.trim()===name);
  return {scrollY,header:box(document.querySelector('.cz-global-header')),heading:box(heading),height:innerHeight};
 },name);
 assert(metrics.header.top>=-1&&metrics.header.bottom<=metrics.height,'fresh entry keeps the application header in view');
 assert(metrics.heading.top>=-1&&metrics.heading.bottom<=metrics.height,'fresh entry keeps its page title in view');
 assert(Math.abs(metrics.scrollY)<2,'fresh entry starts at the top rather than the payment card');
 return metrics;
}
async function entryChecks(browser,origin,results) {
 let financialWrites=0;
 for(const width of [390,1440])for(const theme of ['light','dark']) {
  const context=await browser.newContext({viewport:{width,height:850},colorScheme:theme,serviceWorkers:'block'});
  await context.addInitScript({content:'('+seedSource+')({unknown:false,unknownAddition:false,futureForeign:true,language:"pt"});localStorage.setItem("crewcheck_theme_mode","'+theme+'");'});
  await context.route('**/*',route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==origin)return route.abort();
   if(url.pathname.startsWith('/api/')) {
    if(request.method()!=='GET'&&url.pathname.startsWith('/api/platform/finance/'))financialWrites++;
    return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,code:url.pathname==='/api/platform/finance/upcoming'?'FINANCIAL_LEDGER_NOT_ENABLED':'SYNTHETIC_OFFLINE'})});
   }
   return route.continue();
  });
  try {
   const page=await context.newPage();await page.goto(origin+'/app?view=cockpit');await page.locator('.cz-app').waitFor();
   await page.evaluate(()=>{window.scrollTo({top:400,behavior:'instant'});window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'salary'}));});
   const salary=await entryHeading(page,'Salário');
   assert.equal(await page.locator('html').getAttribute('data-crewcheck-theme'),theme);
   // Internal navigation still aligns the screen content. Back must restore
   // the actual saved position/focus rather than force the first-entry policy.
   const statement=page.getByRole('button',{name:'Extrato',exact:true});
   await statement.evaluate(button=>{button.scrollIntoView({block:'center',behavior:'instant'});button.focus({preventScroll:true});});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const overviewY=await page.evaluate(()=>scrollY);await statement.press('Enter');
   await page.waitForFunction(()=>document.querySelector('.cc-payment-overview')?.dataset.financialScreen==='statement');
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const internalTop=await page.locator('.cc-payment-overview').evaluate(element=>element.getBoundingClientRect().top);
   assert(internalTop>=-1&&internalTop<80,'subsequent internal screen still aligns its content');
   await page.goBack();
   await page.waitForFunction(y=>document.querySelector('.cc-payment-overview')?.dataset.financialScreen==='overview'&&Math.abs(scrollY-y)<3&&document.activeElement?.textContent?.trim()==='Extrato',overviewY);
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'concierge'})));
   const card=page.getByRole('region',{name:'Próximas previsões financeiras'});await card.locator('li button').first().waitFor();
   // Only the source gets synthetic vertical expansion, so return restoration
   // exercises a nonzero position. Financial screens retain shipping CSS.
   await page.addStyleTag({content:'[aria-label="Próximas previsões financeiras"]{margin-top:950px!important}'});
   const opener=card.locator('li button').first(),key=await opener.getAttribute('data-financial-origin');
   assert(typeof key==='string'&&key.length>0,'Concierge opener has a stable origin key');
   await opener.evaluate(button=>{button.scrollIntoView({block:'center',behavior:'instant'});button.focus({preventScroll:true});});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const sourceY=await page.evaluate(()=>scrollY);assert(sourceY>200,'synthetic source is genuinely scrolled');
   await opener.press('Enter');const allowance=await entryHeading(page,'Diárias');
   await page.screenshot({path:path.join(out,`financial-entry-${width}-${theme}.png`)});
   await page.goBack();
   await page.waitForFunction(({key,y})=>document.activeElement?.getAttribute('data-financial-origin')===key&&Math.abs(scrollY-y)<3,{key,y:sourceY});
   assert.equal(new URL(page.url()).searchParams.get('view'),'concierge');
   results.push({variant:'entry-heading',width,theme,salary,allowance,internalTop,overviewRestored:true,conciergeRestored:true,sourceY});
  } finally {await context.close();}
 }
 assert.equal(financialWrites,0,'navigation never writes financial data');
}
(async()=>{
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});const results=[];
try{await entryChecks(browser,origin,results);for(const variant of ['programmatic-before-restore','pointer-before-restore','keyboard-before-restore','normal-restoration']){
 const context=await browser.newContext({viewport:{width:390,height:950},serviceWorkers:'block'});await context.addInitScript({content:'('+seedSource+')({unknown:false,unknownAddition:false,futureForeign:false,language:\'pt\'});'});
 await context.addInitScript(()=>{const realRAF=requestAnimationFrame.bind(window);let gated=false;const pending=[];window.__focusEvents=[];const log=e=>window.__focusEvents.push({type:e.type,key:e.key||null,trusted:e.isTrusted,target:e.target?.getAttribute?.('aria-label')||e.target?.textContent?.slice(0,50),screen:document.querySelector('.cc-payment-overview')?.dataset.financialScreen});for(const n of ['focusin','pointerdown','keydown'])document.addEventListener(n,log,true);window.requestAnimationFrame=cb=>gated?(pending.push(cb),100000+pending.length):realRAF(cb);window.__gateNextBack=()=>{gated=true};window.__flushFrames=()=>new Promise(resolve=>{gated=false;for(const cb of pending.splice(0))realRAF(cb);realRAF(()=>realRAF(resolve));});});
 await context.route('**/*',r=>{const u=new URL(r.request().url());return u.origin!==origin?r.abort():u.pathname.startsWith('/api/')?r.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"state":"unavailable"}'}):r.continue();});
 const page=await context.newPage();await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'salary'})));await page.locator('.cc-payment-hero').waitFor();
 await page.getByRole('button',{name:'Extrato',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.cc-payment-overview')?.dataset.financialScreen==='statement');
 if(variant!=='normal-restoration')await page.evaluate(()=>window.__gateNextBack());await page.goBack();await page.waitForFunction(()=>document.querySelector('.cc-payment-overview')?.dataset.financialScreen==='overview',null,{polling:25});const help=page.getByLabel('Entender esta previsão',{exact:true});
 if(variant==='programmatic-before-restore'){await help.focus();await page.evaluate(()=>window.__flushFrames());assert.equal(await page.getByRole('button',{name:'Extrato',exact:true}).evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('.cc-payment-overview')?.dataset.financialScreen==='statement');assert.equal(await page.locator('.cc-payment-help').count(),0);}
 if(variant==='pointer-before-restore'){await help.click();await page.evaluate(()=>window.__flushFrames());assert.equal(await help.evaluate(el=>el===document.activeElement),true);assert.equal(await page.locator('.cc-payment-help').getAttribute('open'),'');}
 if(variant==='keyboard-before-restore'){for(let i=0;i<100&&!await help.evaluate(el=>el===document.activeElement);i++)await page.keyboard.press('Tab');assert.equal(await help.evaluate(el=>el===document.activeElement),true);await page.evaluate(()=>window.__flushFrames());assert.equal(await help.evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Enter');assert.equal(await page.locator('.cc-payment-help').getAttribute('open'),'');}
 if(variant==='normal-restoration'){await page.waitForFunction(()=>document.activeElement?.matches('.cc-financial-screen-links button')&&document.activeElement.textContent.includes('Extrato'));await help.press('Enter');assert.equal(await page.locator('.cc-payment-help').getAttribute('open'),'');}
 results.push({variant,PASS:true,events:await page.evaluate(()=>window.__focusEvents)});await context.close();
}}finally{await browser.close();server.close();}fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log('PASS focus probe:',results.map(r=>r.variant).join(', '));})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
