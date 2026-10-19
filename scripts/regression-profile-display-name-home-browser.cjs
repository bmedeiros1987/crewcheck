const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const{createRequire}=require('node:module');const{chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||__filename)('playwright');
const out=path.resolve(process.env.PROFILE_UI_EVIDENCE||'artifacts/home-confirmed-profile');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
 const profiles={a:{email:'a@example.invalid',publicId:'CC-A',displayName:'Confirmed A',locale:'pt-BR',timezone:'UTC',sharePresence:false,plan:'free'},b:{email:'b@example.invalid',publicId:'CC-B',displayName:'Confirmed B',locale:'pt-BR',timezone:'UTC',sharePresence:false,plan:'free'}};
 let fail=false,delay=false,pending=[],writes=0,profileGets=0,markPending;const errors=[];
 const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!=='https://profile.invalid')return route.abort();
  if(url.pathname==='/api/platform/profile'){
   if(req.method()!=='GET'){writes++;return route.fulfill({status:500,body:'{}'});}
   profileGets++;const owner=req.headers().authorization?.includes('synthetic-b')?'b':'a';const snapshot={...profiles[owner]};
   const answer=()=>route.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify(fail?{ok:false}:{ok:true,profile:snapshot})});
   if(delay&&owner==='a')return new Promise(resolve=>{pending.push(async()=>{await answer();resolve();});markPending?.();});return answer();
  }
  if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'});
  const file=path.join(path.resolve('dist'),url.pathname==='/app'||url.pathname==='/'?'index.html':url.pathname);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.woff2':'font/woff2'};
  return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
 });
 await context.addInitScript(()=>{
  if(!localStorage.getItem('profile-test-initialized')){
   localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-a',name:'Login A',email:'a@example.invalid',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-a');localStorage.setItem('profile-test-initialized','1');
   localStorage.setItem('crewcheck_profile_display_name','Unconfirmed local draft');
  }
  localStorage.setItem('crewcheck:first-access-tour:v1434:disabled','1');sessionStorage.setItem('crewcheck:first-access-tour:v1434:session-seen','1');localStorage.setItem('crewcheck_demo_mode_seen','1');
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const open=async()=>{await page.goto('https://profile.invalid/app');await page.locator('.cz-app').waitFor();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'settings'})));await page.locator('.cz-profile h2').waitFor();};
 const auth=()=>page.evaluate(()=>({user:localStorage.getItem('crewcheck_auth_user'),token:localStorage.getItem('crewcheck_auth_token'),draft:localStorage.getItem('crewcheck_profile_display_name')}));
 const name=page.locator('.cz-profile h2');
 try{
  await open();await name.filter({hasText:'Confirmed A'}).waitFor();const original=await auth();assert.match(original.user,/Login A/);assert.equal(original.draft,'Unconfirmed local draft');
  await page.screenshot({path:path.join(out,'confirmed-mobile.png'),fullPage:true});
  await page.reload();await page.locator('.cz-app').waitFor();await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'settings'})));await name.filter({hasText:'Confirmed A'}).waitFor();assert.deepEqual(await auth(),original,'read-only header must not change login/email/token/local draft');
  fail=true;const settled=page.waitForResponse(r=>r.url().endsWith('/api/platform/profile'));await open();await settled;await name.filter({hasText:'Login A'}).waitFor();assert.equal(await name.innerText(),'Login A','outage uses account fallback, never unconfirmed local name');assert.deepEqual(await auth(),original);fail=false;
  delay=true;const arrived=new Promise(resolve=>markPending=resolve);await open();await arrived;
  assert.equal(await name.innerText(),'Login A');
  await page.evaluate(()=>{window.dispatchEvent(new Event('crewcheck:auth-will-change'));localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-b',name:'Login B',email:'b@example.invalid',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-b');window.dispatchEvent(new Event('crewcheck:auth-changed'));window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'settings'}));});
  await name.filter({hasText:'Confirmed B'}).waitFor();const switched=await auth();
  const lateResponse=page.waitForResponse(r=>r.url().endsWith('/api/platform/profile')&&r.request().headers().authorization?.includes('synthetic-a'));
  delay=false;await Promise.all(pending.splice(0).map(release=>release()));await(await lateResponse).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await name.innerText(),'Confirmed B','late response from A cannot replace B');assert.deepEqual(await auth(),switched);
  profiles.b.displayName='Updated B';await page.evaluate(()=>window.dispatchEvent(new CustomEvent('crewcheck:profile-name-confirmed',{detail:{owner:'synthetic-b'}})));await name.filter({hasText:'Updated B'}).waitFor();
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(out,'confirmed-desktop.png'),fullPage:true});
  fail=true;await page.evaluate(()=>{window.dispatchEvent(new Event('crewcheck:auth-will-change'));localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-b',email:'b@example.invalid',role:'user'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});await name.filter({hasText:'b'}).waitFor();assert.equal(await name.innerText(),'b','email prefix fallback when login name absent');
  assert.equal(writes,0,'header never PATCHes profile');assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({confirmed:true,reload:true,offlineFallback:true,emailPrefixFallback:true,accountSwitch:true,lateResponseRejected:true,confirmedEvent:true,immutableAuth:true,profileWrites:writes,profileGets},null,2));
  console.log('PASS actual compiled Home settings header: confirmed name, fallback, account switch, late response, reload, profile event; zero profile writes and unchanged auth identity.');
 }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
