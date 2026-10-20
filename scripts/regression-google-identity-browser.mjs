import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const root=process.cwd(),origin='https://crewcheck-fixture.invalid';
const output=await build({stdin:{contents:"import * as google from './client/src/lib/googleIdentityAuth.ts'; import * as auth from './client/src/lib/authClient.ts'; window.fixtureApi={google,auth};",resolveDir:root},bundle:true,write:false,format:'iife',platform:'browser'});
const bundle=output.outputFiles[0].text;
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE});
let cases=0;const failures=[];
const wait=async fn=>{for(let i=0;i<250;i++){if(await fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('bounded fixture wait exceeded');};
async function scenario(name,{method='loginWithGoogle',seed=false,native,blocked=false,state,changeAt,changeKind='owner',timeout=false,cancel=false}={}) {
 const context=await browser.newContext({serviceWorkers:'block'}),requests=[],popups=[],unexpected=[];let page;
 try {
  await context.addInitScript(({native,blocked,seed})=>{
   window.__nativeCalls=[];
   if(seed){localStorage.setItem('crewcheck_auth_token','synthetic-A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A',email:'a@example.invalid'}));}
   if(native!==undefined)window.CrewCheckNative={openExternal:url=>{window.__nativeCalls.push(url);return native;}};
   if(blocked)window.open=()=>null;
  },{native,blocked,seed});
  context.on('page',p=>{if(page&&p!==page)popups.push(p);});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin===origin&&url.pathname==='/'){return route.fulfill({contentType:'text/html',body:`<!doctype html><button id="run">Run synthetic Google operation</button><script src="/bundle.js"></script><script>document.querySelector('#run').onclick=()=>{window.result=null;window.fixtureApi.google['${method}']().then(value=>window.result={ok:true,value},error=>window.result={ok:false,error:error.message});};</script>`});}
   if(url.origin===origin&&url.pathname==='/bundle.js')return route.fulfill({contentType:'application/javascript',body:bundle});
   if(url.origin==='https://provider-fixture.invalid')return route.fulfill({contentType:'text/html',body:'Synthetic provider only — no Google request.'});
   if(url.origin!==origin||!url.pathname.startsWith('/api/auth/google/')){unexpected.push(url.href);return route.abort();}
   requests.push({path:url.pathname,authorization:route.request().headers().authorization,body:route.request().postData()});
   const stage=url.pathname.endsWith('/status')?'poll':url.pathname.endsWith('/complete')?'complete':null;
   if(stage===changeAt)await page.evaluate(kind=>{
    localStorage.setItem('crewcheck_auth_token','synthetic-B');
    if(kind==='owner')localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'B',email:'b@example.invalid'}));
    window.dispatchEvent(new Event('crewcheck:auth-changed'));
   },changeKind);
   let payload;
   if(url.pathname.endsWith('/start'))payload={ok:true,state:'synthetic-state',authUrl:'https://provider-fixture.invalid/authorize'};
   else if(url.pathname.endsWith('/status')){
    if(cancel){for(const popup of popups)await popup.close();}
    if(timeout||cancel||blocked)await page.evaluate(()=>{const previous=Date.now.bind(Date);Date.now=()=>previous()+100000;});
    payload={ok:true,state:state||(timeout||cancel||blocked?'pending':method==='linkGoogleIdentity'?'link_ready':'ready'),message:'synthetic provider cancelled or failed'};
   }else if(url.pathname.endsWith('/link/complete'))payload={ok:true,linked:true,provider:'google'};
   else if(url.pathname.endsWith('/complete'))payload={ok:true,token:'synthetic-accepted-A',user:{id:'A',email:'a@example.invalid',name:'Synthetic'}};
   else throw Error('Unhandled fixture endpoint '+url.pathname);
   await route.fulfill({contentType:'application/json',body:JSON.stringify(payload)});
  });
  page=await context.newPage();await page.goto(origin);await page.click('#run');
  await wait(()=>page.evaluate(()=>!!window.result));
  const result=await page.evaluate(()=>({result:window.result,token:localStorage.getItem('crewcheck_auth_token'),user:localStorage.getItem('crewcheck_auth_user'),nativeCalls:window.__nativeCalls}));
  assert.deepEqual(unexpected,[],'every request intercepted; no unexpected network');
  if(blocked||timeout||cancel||state==='failed'||state==='link_required'||changeAt){
   assert.equal(result.result.ok,false,name+' must reject');
   if(changeAt){assert.match(result.result.error,/sessão mudou/);assert.equal(result.token,'synthetic-B');}
   else {
    if(timeout||cancel||blocked)assert.match(result.result.error,/demorou demais/,'must reach actual polling timeout, not fail opening popup');
    if(state==='failed')assert.match(result.result.error,/synthetic provider cancelled or failed/);
    if(state==='link_required')assert.match(result.result.error,/ainda não está vinculada/);
    assert.equal(result.token,seed?'synthetic-A':null);assert.equal(requests.some(r=>r.path.endsWith('/complete')),false,'failure/cancel cannot complete');}
  }else{
   assert.equal(result.result.ok,true,name+': '+result.result.error);
   assert.equal(result.token,method==='loginWithGoogle'?'synthetic-accepted-A':'synthetic-A');
   if(method==='linkGoogleIdentity'){const done=requests.find(r=>r.path.endsWith('/link/complete'));assert.equal(done.authorization,'Bearer synthetic-A');assert.equal(JSON.parse(done.body).confirmLink,true);}
  }
  if(native===true)assert.equal(popups.length,0,'native openExternal true avoids browser popup');
  if(native!==undefined)assert.equal(result.nativeCalls.length,1,'one native open attempt');
  if(!blocked&&native!==true&&!changeAt) {
   assert.ok(popups.length>0,'real browser popup observed');
   if(!cancel){await wait(()=>popups.some(p=>p.url().startsWith('https://provider-fixture.invalid/')));const popup=popups.find(p=>p.url().startsWith('https://provider-fixture.invalid/'));assert.equal(await popup.evaluate(()=>window.opener===null),true,'real noopener isolation');}
  }
  cases++;console.log('PASS '+name);
 }finally{await context.close();}
}
try {
 const definitions=[
 ['PWA popup login',{}],['PWA popup link',{method:'linkGoogleIdentity',seed:true}],
 ['popup blocked',{blocked:true}],['popup cancelled',{cancel:true}],['status failed',{native:true,state:'failed'}],['Google link absent',{native:true,state:'link_required'}],['status timeout',{native:true,timeout:true}],
 ...['poll','complete'].flatMap(changeAt=>['owner','token'].map(changeKind=>[`${changeKind} changed during ${changeAt}`,{native:true,seed:true,changeAt,changeKind}])),
 ...['poll','complete'].flatMap(changeAt=>['owner','token'].map(changeKind=>[`link ${changeKind} changed during ${changeAt}`,{native:true,seed:true,method:'linkGoogleIdentity',changeAt,changeKind}])),
 ['Android bridge openExternal true login',{native:true}],['Android bridge openExternal true link',{native:true,method:'linkGoogleIdentity',seed:true}],['Android bridge false falls back to popup',{native:false}],
 ];
 for(const [name,options]of definitions)try{await scenario(name,options);}catch(error){failures.push(name+': '+error.message);console.error('FAIL '+name+': '+error.message);}
 const native=fs.readFileSync(path.join(root,'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java'),'utf8');
 assert.match(native,/openExternal\(final String url\)|openExternal\(String url\)/,'existing native method remains');
 assert.match(native,/@JavascriptInterface[\s\S]*?boolean openExternal/,'existing exposed native contract');
 assert.deepEqual(failures,[],'offline browser failures');
 console.log(`Google identity OFFLINE browser: ${cases} cases PASS; real bundled authClient+googleIdentityAuth, PWA popup and synthetic Android bridge. All network fulfilled/aborted locally. Static native contract only; no device/provider E2E.`);
}finally{await browser.close();}
