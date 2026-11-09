const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),ts=require('typescript');
const {createRequire}=require('node:module');
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||__filename)('playwright');
const out=path.resolve(process.env.CLOSED_DUTY_EVIDENCE_DIR||'artifacts/SYNTHETIC-allowance-closed-duty');fs.mkdirSync(out,{recursive:true});
const ast=ts.createSourceFile('server.mjs',fs.readFileSync('server.mjs','utf8'),99,true,ts.ScriptKind.JS);
const responder=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='serveStatic');assert(responder);
const scope=vm.createContext({guardStaticHtml:require('../server/static-html-guard.mjs').guardStaticHtml,fs,path,Buffer,distDir:path.resolve('dist'),sendJson:(res,status,body)=>{res.writeHead(status);res.end(JSON.stringify(body));}});
vm.runInContext(responder.getText(ast)+'\nglobalThis.respond=serveStatic;',scope);
const fixtureAst=ts.createSourceFile('seed.cjs',fs.readFileSync('scripts/regression-financial-ui-browser.cjs','utf8'),99,true,ts.ScriptKind.JS);
const seed=fixtureAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='seed');assert(seed);
const server=http.createServer((req,res)=>scope.respond(req,res,new URL(req.url,'http://localhost')));
(async()=>{
 const {closedDutyCycleFixture}=await import('./fixtures/allowance-closed-duty-cycle.mjs');
 const roster=closedDutyCycleFixture();
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 let browser;const results=[];
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
  for(const zone of ['UTC','America/Sao_Paulo','America/Los_Angeles'])for(const theme of ['light','dark']){
   const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:zone,serviceWorkers:'block'});
   await context.addInitScript({content:'('+seed.getText(fixtureAst)+')('+JSON.stringify({theme,kind:roster,amount:109.44,history:[],language:'pt'})+');'});
   await context.addInitScript(()=>{const D=Date,t=Date.parse('2026-10-22T12:00:00Z');globalThis.Date=class extends D{constructor(...args){super(...(args.length?args:[t]));}static now(){return t;}};
    for(const key of Object.keys(localStorage))if(key.startsWith('crewcheck_financial_settings_v1:financial-ui-qa:crewcheck_perdiem_rate_'))localStorage.removeItem(key);
   });
   let external=0;await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){external++;return route.abort();}if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});return route.continue();});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
   await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'perdiem'})));
   const hero=page.locator('.cc-forecast-currencies');await page.waitForFunction(()=>document.querySelector('.cc-forecast-currencies')?.textContent.includes('1.094,40'));
   assert.match(await hero.innerText(),/14\/10\/2026 a 20\/10\/2026/);assert.match(await hero.innerText(),/22\/10\/2026/);
   await page.screenshot({path:path.join(out,'SYNTHETIC-'+zone.replaceAll('/','-')+'-'+theme+'-overview.png'),fullPage:true});
   await page.goto(origin+'/app?fmode=perdiem&fscreen=statement&fkind=week&fdate=2026-10-16');await page.locator('.cz-app').waitFor();
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'perdiem'})));
   const rows=page.locator('.cc-per-diem-items [data-financial-currency="BRL"]');await rows.first().waitFor();assert.equal(await rows.count(),10);
   const supper=rows.filter({hasText:'Ceia'});assert.equal(await supper.count(),1);assert.equal(await supper.getAttribute('data-financial-iso'),'2026-10-15');
   assert.equal(await page.locator('.cc-per-diem-items [data-financial-iso="2026-10-13"]').count(),0);
   assert.equal(await page.locator('.cc-per-diem-items [data-financial-iso="2026-10-14"]').filter({hasText:'Jantar'}).count(),1);
   await supper.locator('summary').click();await page.screenshot({path:path.join(out,'SYNTHETIC-'+zone.replaceAll('/','-')+'-'+theme+'-statement.png'),fullPage:true});
   assert.equal(external,0);assert.deepEqual(errors,[]);
   results.push({zone,theme,engine:browser.version(),synthetic:true,meals:10,totalMinor:109440,font:await page.locator('body').evaluate(el=>({family:getComputedStyle(el).fontFamily,loadedFaces:Array.from(document.fonts).filter(face=>face.status==='loaded').map(face=>face.family)}))});await context.close();
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2));console.log('PASS compiled synthetic closed-duty forecast and statement: ten meals, documentary preset, real payment consumer, three device zones, both themes; no external calls or actual payment claims.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
