const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),ts=require('typescript');
const {createRequire}=require('node:module');
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||__filename)('playwright');
const out=path.resolve(process.env.CONCIERGE_SYNC_EVIDENCE_DIR||'artifacts/SYNTHETIC-concierge-roster-sync');fs.mkdirSync(out,{recursive:true});
const ast=ts.createSourceFile('server.mjs',fs.readFileSync('server.mjs','utf8'),99,true,ts.ScriptKind.JS);
const responder=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='serveStatic');assert(responder);
const scope=vm.createContext({guardStaticHtml:require('../server/static-html-guard.mjs').guardStaticHtml,fs,path,Buffer,distDir:path.resolve('dist'),sendJson:(res,status,body)=>{res.writeHead(status);res.end(JSON.stringify(body));}});
vm.runInContext(responder.getText(ast)+'\nglobalThis.respond=serveStatic;',scope);
const seedAst=ts.createSourceFile('seed.cjs',fs.readFileSync('scripts/regression-financial-ui-browser.cjs','utf8'),99,true,ts.ScriptKind.JS);
const seed=seedAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='seed');assert(seed);
const server=http.createServer((req,res)=>scope.respond(req,res,new URL(req.url,'http://localhost')));
const warning='Sincronização do Concierge não confirmada. A escala continua no app.';
(async()=>{
 const {closedDutyCycleFixture}=await import('./fixtures/allowance-closed-duty-cycle.mjs');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 let browser;const results=[];
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
  for(const width of [320,390,1440])for(const theme of ['light','dark']){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
   await context.addInitScript({content:'('+seed.getText(seedAst)+')('+JSON.stringify({theme,kind:closedDutyCycleFixture(),amount:109.44,history:[],language:'pt'})+');'});
   await context.addInitScript(()=>{const D=Date,t=Date.parse('2026-10-22T12:00:00Z');globalThis.Date=class extends D{constructor(...args){super(...(args.length?args:[t]));}static now(){return t;}};});
   let outcome='unconfirmed',writes=0,external=0,release,entered;
   await context.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());if(u.origin!==origin){if(!['fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname))external++;return route.abort();}
    if(!u.pathname.startsWith('/api/'))return route.continue();
    assert(!/radar|gate|weather|departure/.test(u.pathname),'no frozen/provider capability');
    if(u.pathname==='/api/telegram/roster-sync'&&req.method()==='POST'){
     writes++;const responseOutcome=outcome;
     if(responseOutcome==='held'){entered();await new Promise(resolve=>release=resolve);}
     return route.fulfill({status:responseOutcome==='confirmed'?200:503,contentType:'application/json',body:JSON.stringify({ok:responseOutcome==='confirmed',cache:'updated',persistence:responseOutcome==='held'?'unconfirmed':responseOutcome,message:responseOutcome==='confirmed'?'Escala salva no Concierge.':warning})});
    }
    return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
   await page.goto(origin+'/app');await page.locator('.cz-app').waitFor();
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'concierge'})));
   const button=page.getByRole('button',{name:'Sincronizar escala atual',exact:true});await button.waitFor();
   if(width===320)await page.addStyleTag({content:'html{font-size:200% !important}'});
   const original=await page.evaluate(()=>sessionStorage.getItem('crewcheck_roster'));
   await button.focus();await page.keyboard.press('Enter');const notice=page.getByText(warning,{exact:true});await notice.waitFor();
   assert.equal(writes,1);assert.equal(await page.evaluate(()=>sessionStorage.getItem('crewcheck_roster')),original);
   const accessible=await notice.evaluate(el=>{const live=el.closest('[aria-live]')||el.closest('section')?.querySelector('[aria-live]');const r=el.getBoundingClientRect(),cs=getComputedStyle(el);let parent=el,bg='';while(parent){const v=getComputedStyle(parent).backgroundColor;if(v!=='rgba(0, 0, 0, 0)'&&v!=='transparent'){bg=v;break;}parent=parent.parentElement;}return{live:live?.getAttribute('aria-live')||el.closest('section')?.getAttribute('aria-live'),text:cs.color,background:bg,rect:{x:r.x,right:r.right,width:r.width},viewport:innerWidth};});
   assert(accessible.live,'notice must retain an accessible live region');assert(accessible.rect.x>=0&&accessible.rect.right<=accessible.viewport+1,'notice text stays within viewport');
   const contrast=await notice.evaluate(el=>{const rgb=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number),lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);let p=el,b;while(p){const v=getComputedStyle(p).backgroundColor;if(v!=='rgba(0, 0, 0, 0)'&&v!=='transparent'){b=rgb(v);break;}p=p.parentElement;}const a=lum(rgb(getComputedStyle(el).color)),z=lum(b||[255,255,255]);return(Math.max(a,z)+.05)/(Math.min(a,z)+.05);});
   if(contrast<4.5){fs.writeFileSync(path.join(out,`contrast-${width}-${theme}.json`),JSON.stringify({contrast,accessible},null,2));await page.screenshot({path:path.join(out,`SYNTHETIC-${width}-${theme}-contrast-failure.png`),fullPage:true,animations:'disabled'});}
   assert(contrast>=4.5,'notice text contrast');
   await page.screenshot({path:path.join(out,`SYNTHETIC-${width}-${theme}-unconfirmed.png`),fullPage:true,animations:'disabled'});
   outcome='confirmed';await button.focus();await page.keyboard.press('Enter');await page.getByText('Escala salva no Concierge.',{exact:true}).waitFor();assert.equal(writes,2);assert.equal(await page.evaluate(()=>sessionStorage.getItem('crewcheck_roster')),original);
   outcome='held';const pending=new Promise(resolve=>entered=resolve),warningCount=await notice.count();
   await button.focus();await page.keyboard.press('Enter');await pending;
   await page.evaluate(()=>window.dispatchEvent(new Event('crewcheck:auth-will-change')));release();
   await page.waitForFunction(()=>document.querySelector('.cc-concierge-heading')===null);
   assert((await notice.count())<=warningCount,'obsolete session produces no new warning');assert.equal(writes,3);
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('crewcheck_roster')),null,'existing auth lifecycle removes the previous context');assert.equal(external,0);assert.deepEqual(errors,[]);
   results.push({width,theme,textScale:width===320?'200%':'100%',engine:browser.version(),keyboard:'Enter',liveRegion:accessible.live,contrast,synthetic:true,writes,fonts:await page.evaluate(()=>({family:getComputedStyle(document.body).fontFamily,loaded:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family)}))});
   await context.close();
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2));console.log('PASS compiled Concierge sync notice: six synthetic layouts, keyboard, live region, contrast, preserved roster, explicit success/failure, zero provider calls');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
