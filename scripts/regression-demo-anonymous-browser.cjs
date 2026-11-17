// Real compiled app; no user/token, all APIs mocked and external requests blocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||__filename)('playwright');
const root=path.resolve(process.env.DEMO_ANONYMOUS_DIST||'dist'),out=path.resolve(process.env.DEMO_ANONYMOUS_OUTPUT||'artifacts/demo-anonymous');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname;const file=pathname.startsWith('/assets/')?path.resolve(root,'.'+pathname):path.join(root,'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});const results=[];
 try{for(const width of [390,1280])for(const mode of ['401','503','offline']){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),requests=[],errors=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname.startsWith('/api/')){requests.push({path:u.pathname,method:route.request().method(),authorization:route.request().headers().authorization||null});if(mode==='offline')return route.abort();const status=mode==='401'&&u.pathname==='/api/control/telemetry'?401:503;return route.fulfill({status,contentType:'application/json',body:JSON.stringify({ok:false,code:status===401?'AUTH_REQUIRED':'BACKEND_UNAVAILABLE'})});}return route.continue();});
  await context.addInitScript(()=>{window.__demoAuthEvents=[];for(const name of ['crewcheck:auth-expired','crewcheck:auth-changed'])window.addEventListener(name,()=>window.__demoAuthEvents.push(name));localStorage.setItem('crewcheck_language','pt-BR');});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/login?app=1');const button=page.getByRole('button',{name:/Ver modo demonstração/});await button.waitFor();await button.click();await page.locator('.cz-app').waitFor();
  if(mode==='401')await page.waitForFunction(()=>window.__demoAuthEvents.length>0||document.querySelector('.cz-app'));
  await page.waitForTimeout(width===390&&mode==='401'?31_000:1500);
  assert.notEqual(new URL(page.url()).pathname,'/login','demo must remain open after protected telemetry failure');assert.equal(await button.isVisible(),false);
  const state=await page.evaluate(()=>({events:window.__demoAuthEvents,token:localStorage.getItem('crewcheck_auth_token'),user:localStorage.getItem('crewcheck_auth_user'),active:sessionStorage.getItem('crewcheck_demo_active')}));
  assert.deepEqual(state.events,[]);assert.equal(state.token,null);assert.equal(state.user,null);assert.equal(state.active,'1');assert.deepEqual(errors,[]);
  assert(requests.some(r=>r.path==='/api/control/telemetry'),'real compiled app must exercise the telemetry path');assert(requests.every(r=>r.authorization===null),'demo must not fabricate a bearer token');
  await page.screenshot({path:path.join(out,width+'-'+mode+'.png'),fullPage:false});results.push({width,mode,state,requests,errors});await context.close();
 }}finally{await browser.close();server.close();}
 const files=fs.readdirSync(path.join(root,'assets')).filter(f=>/^index.*\.js$/.test(f));const identity={indexSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'index.html'))).digest('hex'),assets:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets',f))).digest('hex')]))};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({identity,results},null,2));
 console.log('PASS compiled demo: real login click, telemetry401/503/offline, no fabricated authentication or expired event, mobile/desktop; 31-second countercheck, all APIs mocked');
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
