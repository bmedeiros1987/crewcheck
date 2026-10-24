const {createRequire}=require('node:module');
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||__filename)('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('server.mjs','utf8'),ast=ts.createSourceFile('server.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const serve=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='serveStatic');assert.equal(serve.length,1);
const context=vm.createContext({guardStaticHtml:require('../server/static-html-guard.mjs').guardStaticHtml,fs,path,Buffer,distDir:path.resolve('dist'),sendJson(res,status,body){res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));}});
vm.runInContext(serve[0].getText(ast)+'\nglobalThis.respond=serveStatic;',context);
const server=http.createServer((req,res)=>context.respond(req,res,new URL(req.url,'http://localhost')));
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
 const output=path.resolve(process.env.CONCIERGE_UX_EVIDENCE||'/tmp/concierge-ux-visual');fs.mkdirSync(output,{recursive:true});
 const report={sourceSha:process.env.CONCIERGE_UX_SOURCE_SHA||'local-unrecorded',scope:'actual complete built app, isolated Chromium, synthetic session only; not physical device',cases:[],errors:[],linkStarts:0,statusReads:0};
 try{
  for(const spec of [{width:320,theme:'light',scale:100},{width:390,theme:'dark',scale:100},{width:320,theme:'light',scale:200}]){
   const ctx=await browser.newContext({viewport:{width:spec.width,height:900},serviceWorkers:'block',colorScheme:spec.theme});
   await ctx.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/api/whatsapp/link/start')report.linkStarts++;
    if(url.pathname==='/api/whatsapp/link/status'){report.statusReads++;return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"linked":false,"consentConcierge":false,"last4":""}'});}
    if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"items":[],"data":[],"enabled":false}'});
    return route.continue();});
   await ctx.addInitScript(({theme,scale})=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-concierge-ux',name:'SYNTHETIC',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-never-real-token');localStorage.setItem('crewcheck_theme_mode',theme);localStorage.setItem('crewcheck:text-size:v1:synthetic-concierge-ux',String(scale));localStorage.setItem('crewcheck_demo_mode_seen','1');localStorage.setItem('crewcheck_intro_seen_v1278','1');},{theme:spec.theme,scale:spec.scale});
   const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));
   await page.goto(origin+'/app?view=notifications');await page.locator('.cc-notification-center').waitFor();
   await page.evaluate(()=>window.dispatchEvent(new Event('crewcheck:auth-changed')));
   assert.equal(new URL(page.url()).searchParams.get('view'),'notifications','tutorial must not reset Notifications');
   await page.getByRole('button',{name:'Menu',exact:true}).click({timeout:10000});
   const menuEntry=page.getByRole('button',{name:'Concierge',exact:true});assert.match(await menuEntry.innerText(),/Vínculos, briefing e consultas/);await menuEntry.click();
   const card=page.locator('#cc-concierge-channels');
   try{await card.waitFor({timeout:10000});}catch(error){console.error(JSON.stringify({phase:'open-concierge',url:page.url(),headings:await page.locator('h1,h2').allTextContents(),errors:report.errors}));throw error;}
   assert.equal(new URL(page.url()).searchParams.get('view'),'concierge');
   const close=page.getByRole('button',{name:'Fechar tutorial',exact:true});if(await close.count())await close.click();
   await page.waitForFunction(scale=>document.documentElement.dataset.crewTextSize===String(scale),spec.scale);
   const rootFont=await page.locator('html').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
   const textFont=await card.locator('p').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
   assert(textFont>=rootFont*spec.scale/100-.1,'actual text enlarges, not just a marker');
   const box=await card.boundingBox();assert(box&&box.x>=-1&&box.x+box.width<=spec.width+1);
   assert(await card.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'card has no horizontal text overflow');
   const button=card.getByRole('button',{name:'Abrir vínculos de WhatsApp e Telegram',exact:true});assert((await button.boundingBox()).height>=44);
   await page.keyboard.press('Tab');await button.focus();assert(await button.evaluate(el=>el===document.activeElement));
   const appearance=await button.evaluate(el=>{
    const style=getComputedStyle(el),card=getComputedStyle(el.closest('section'));
    const rgb=value=>(value.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
    const luminance=value=>rgb(value).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const fg=luminance(style.color),bg=luminance(style.backgroundColor==='rgba(0, 0, 0, 0)'?card.backgroundColor:style.backgroundColor);
    return{contrast:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05),outline:style.outlineStyle,outlineWidth:parseFloat(style.outlineWidth)};
   });
   assert(appearance.contrast>=4.5,'primary action has readable contrast');assert(appearance.outline!=='none'&&appearance.outlineWidth>=2,'keyboard focus remains visible');
   const file=`concierge-${spec.width}-${spec.theme}-${spec.scale}.png`;await card.screenshot({path:path.join(output,file),animations:'disabled'});
   if(spec.scale===200){
    const note=card.locator('p').last();await note.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    const noteBox=await note.boundingBox(),dock=await page.locator('.cz-bottom-nav').boundingBox();
    assert(noteBox.y>=0&&noteBox.y+noteBox.height<=dock.y+1,'large text can scroll clear of the fixed dock: '+JSON.stringify({noteBox,dock}));
    await page.screenshot({path:path.join(output,'concierge-320-light-200-note.png'),animations:'disabled'});
   }
   await button.focus();
   await page.keyboard.press('Enter');
   const channels=page.locator('details.cc-notification-channels');await channels.waitFor();await page.waitForFunction(()=>document.querySelector('details.cc-notification-channels')?.open===true);
   assert(await channels.evaluate(el=>el.querySelector('summary')===document.activeElement),'canonical section receives keyboard focus');
   assert(await channels.getByRole('button',{name:'Vincular WhatsApp',exact:true}).isVisible());assert(await channels.getByRole('button',{name:'Vincular Telegram',exact:true}).isVisible());
   assert.equal(report.linkStarts,0);assert.equal(report.statusReads,0,'navigation alone does not consult WhatsApp status');
   if(spec.width===390){
    await page.evaluate(()=>window.dispatchEvent(new Event('crewcheck:tour:restart')));
    await page.locator('.cc-first-tour').waitFor();
    await page.getByRole('button',{name:'Próximo',exact:true}).click();
    await page.getByRole('button',{name:'Próximo',exact:true}).click();
    const tour=page.locator('.cc-first-tour .cc-tour-card');await tour.waitFor();
    const tourBox=await tour.boundingBox();assert(tourBox.x>=-1&&tourBox.x+tourBox.width<=spec.width+1&&tourBox.height<900);
    await tour.screenshot({path:path.join(output,'tour-390-dark.png'),animations:'disabled'});
    const next=tour.getByRole('button',{name:'Próximo',exact:true});await next.scrollIntoViewIfNeeded();assert(await next.isVisible(),'tutorial footer remains reachable by scrolling');
    await page.getByRole('button',{name:'Abrir Concierge e vínculos',exact:true}).click();
    await page.locator('.cc-first-tour').waitFor({state:'detached'});await card.waitFor();
    assert.equal(new URL(page.url()).searchParams.get('view'),'concierge');
   }
   report.cases.push({...spec,file,card:box,rootFont,textFont,appearance,canonicalExpanded:true});await ctx.close();
  }
  assert.deepEqual(report.errors,[]);assert.equal(report.linkStarts,0);assert.equal(report.statusReads,0);
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log('PASS actual built app: tutorial preserves Notifications, Concierge card 320/390 light/dark/200% text, keyboard Enter opens/focuses same canonical channels; zero challenge starts/status reads/external provider calls. Evidence: '+output);
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.closeAllConnections();server.close();process.exitCode=1;});
