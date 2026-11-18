// Integrated proof on the actual compiled app (real Home, BottomNav portal, AlertCenter and shipping
// CSS): device English without a saved choice, then Portuguese chosen in the same session, then the
// account-settings values (en-US/pt-BR). The reported mixed screen was the real BottomNav staying in
// English ("Alerts"/"Roster") after Portuguese. Synthetic roster, every API intercepted, no network.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),ts=require('typescript');
const {createRequire}=require('node:module');const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||__filename)('playwright');
const out=path.resolve('artifacts/alerts-language-integrated');fs.mkdirSync(out,{recursive:true});
const ast=ts.createSourceFile('server.mjs',fs.readFileSync('server.mjs','utf8'),99,true,ts.ScriptKind.JS),responder=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='serveStatic');
const scope=vm.createContext({guardStaticHtml:require('../server/static-html-guard.mjs').guardStaticHtml,fs,path,Buffer,distDir:path.resolve('dist'),sendJson:(res,code,body)=>{res.writeHead(code);res.end(JSON.stringify(body));}});vm.runInContext(responder.getText(ast)+'\nglobalThis.respond=serveStatic;',scope);const server=http.createServer((req,res)=>scope.respond(req,res,new URL(req.url,'http://localhost')));
const seedSource=ts.createSourceFile('fixture.cjs',fs.readFileSync('scripts/regression-financial-ui-browser.cjs','utf8'),99,true,ts.ScriptKind.JS),seed=seedSource.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='seed'),fixtures=vm.createContext({});vm.runInContext(seed.getText(seedSource)+'\nglobalThis.seed=seed;',fixtures);
const night=(date,flight)=>({date,year:2032,month:Number(date.split('/')[1]),type:'VOO',pairingCode:flight,dutyReport:'02:10',dutyDebrief:'10:30',dutyReportSource:'published',dutyDebriefSource:'published',legs:[{flightNumber:flight,origin:'GRU',destination:'REC',departureTime:'02:50',arrivalTime:'10:00',presentationTime:'02:10',workType:'OP'}]});
const kind={year:2032,month:10,base:'GRU',rank:'CC',airline:'LA',crewName:'SYNTHETIC ONLY',days:[night('30/09/2032','LA9901'),night('01/10/2032','LA9902'),night('02/10/2032','LA9903')]};
const states={
 en:{nav:['FlightDeck','Roster','Depart','Alerts','Menu'],heading:'Alerts',dates:/^Days to review: Sep 30 to Oct 2$/},
 pt:{nav:['FlightDeck','Escala','Saída','Alertas','Menu'],heading:'Alertas',dates:/^Dias a revisar: do dia 30\/09 ao dia 02\/10$/},
};
async function settle(page){await page.evaluate(async()=>{await document.fonts.ready;for(const a of document.getAnimations())if(Number.isFinite(a.effect?.getComputedTiming().endTime))try{a.finish();}catch{}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); await new Promise(r=>setTimeout(r,120));});}
async function check(page,state,label){
 const want=states[state];await page.locator('body > nav.cz-bottom-nav').waitFor();
 await page.waitForFunction(nav=>JSON.stringify([...document.querySelectorAll('body > nav.cz-bottom-nav > button span')].map(s=>s.textContent))===nav,JSON.stringify(want.nav),{timeout:4000}).catch(()=>{});
 const nav=await page.locator('body > nav.cz-bottom-nav > button span').allTextContents();
 assert.deepEqual(nav,want.nav,`${label}: real BottomNav`);
 // Every label fits whole inside its button (200 % text): a cut-off label is a layout failure.
 const fit=await page.locator('body > nav.cz-bottom-nav').evaluate(el=>[...el.querySelectorAll('button')].map(button=>{const span=button.querySelector('span'),range=document.createRange();range.selectNodeContents(span);const b=button.getBoundingClientRect();const g=[...range.getClientRects()];return{text:span.textContent,fits:g.length===1&&g.every(r=>r.x>=b.x-1&&r.right<=b.right+1&&r.y>=b.y-1&&r.bottom<=b.bottom+1)&&span.scrollWidth<=span.clientWidth+1};}));
 assert.deepEqual(fit.filter(row=>!row.fits),[],`${label}: whole labels inside the real BottomNav`);
 assert.equal((await page.locator('.cc-alert-center h1').innerText()).trim(),want.heading,`${label}: alerts heading`);
 const card=page.locator('.cc-alert-card').filter({has:page.locator('[data-alert-dates="review"]')});
 assert.match((await card.locator('[data-alert-dates="review"]').innerText()).replace(/\s+/g,' ').trim(),want.dates,`${label}: proven days`);
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});const results=[];
 try{for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width:320,height:740},locale:'en-US',hasTouch:true,isMobile:true,timezoneId:'Pacific/Auckland',serviceWorkers:'block'});
  const external=[];await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin){external.push(url.origin+url.pathname);return route.abort();}if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[],"enabled":false}'});return route.request().method()==='GET'?route.continue():route.abort();});
  await context.addInitScript(fixtures.seed,{theme,kind,amount:0});
  // Device English and no saved language: the first access follows the device.
  await context.addInitScript(()=>{localStorage.removeItem('crewcheck_language');window.Notification=class{static permission='denied';constructor(){throw Error('No real notification allowed')}};});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
  await page.goto(origin+'/app');await page.locator('.cz-app[data-version]').waitFor();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'settings'})));
  await page.locator('#cc-text-size').selectOption('200');await settle(page);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'alerts'})));
  await page.locator('.cc-alert-center .cc-alert-card').first().waitFor();await settle(page);
  const shot=async name=>{
   await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await settle(page);
   await page.screenshot({path:path.join(out,`${name}-${theme}-320-200-top.png`),fullPage:false});
   // Second capture: the proven-days line centred, visibly clear of the real bottom navigation.
   await page.locator('[data-alert-dates="review"]').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await settle(page);
   const clear=await page.locator('[data-alert-dates="review"]').evaluate(el=>{const r=el.getBoundingClientRect(),n=document.querySelector('body > nav.cz-bottom-nav').getBoundingClientRect();return r.bottom<=n.top&&r.top>=0;});
   assert(clear,`${name}: proven days visible above the navigation`);
   await page.screenshot({path:path.join(out,`${name}-${theme}-320-200-dates.png`),fullPage:false});
   results.push(`${name}-${theme}-320-200-top.png`,`${name}-${theme}-320-200-dates.png`);
  };
  await check(page,'en','device en-US');await shot('1-device-en');
  // Language menu path (saveCrewLanguage): stores the short code and announces crewcheck:language-change.
  await page.evaluate(()=>{localStorage.setItem('crewcheck_language','pt');window.dispatchEvent(new CustomEvent('crewcheck:language-change',{detail:{language:'pt'}}));});await settle(page);
  await check(page,'pt','after choosing Portuguese');await shot('2-chosen-pt');
  // Account settings path: stores en-US/pt-BR and announces crewcheck:locale-change.
  await page.evaluate(()=>{localStorage.setItem('crewcheck_language','en-US');window.dispatchEvent(new CustomEvent('crewcheck:locale-change',{detail:{locale:'en-US'}}));});await settle(page);
  await check(page,'en','settings en-US');await shot('3-settings-en');
  await page.evaluate(()=>{localStorage.setItem('crewcheck_language','pt-BR');window.dispatchEvent(new CustomEvent('crewcheck:locale-change',{detail:{locale:'pt-BR'}}));});await settle(page);
  await check(page,'pt','settings pt-BR');await shot('4-settings-pt');
  // The navigation is part of the layout: the five targets stay usable and inside the viewport.
  const nav=await page.locator('body > nav.cz-bottom-nav').evaluate(el=>{const r=el.getBoundingClientRect();return{inside:r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,buttons:[...el.querySelectorAll('button')].map(b=>{const x=b.getBoundingClientRect();return x.width>=44&&x.height>=44;})};});
  assert(nav.inside&&nav.buttons.every(Boolean),'real BottomNav inside the viewport with usable targets');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)<=0,true,'no horizontal overflow');
  // External requests are aborted; only the shipping web font stylesheet is attempted by the app.
  assert.deepEqual([...new Set(external)].filter(url=>!/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)),[],'no other external request');
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();server.close();}
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({scope:'Actual compiled app (Home, real BottomNav portal, AlertCenter, shipping CSS) at 320 px / 200 % text, synthetic roster, every API intercepted.',screenshots:results},null,2));
 console.log('PASS integrated compiled app: real BottomNav and AlertCenter follow device English, then Portuguese (language menu), en-US and pt-BR (account settings) with no label left in the previous language; proven days localized; light and dark at 320 px / 200 %');
})().catch(error=>{console.error(error);process.exitCode=1;});
