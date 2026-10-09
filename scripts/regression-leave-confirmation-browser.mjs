import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

// Actual BIDS/leave React component and auth client; APIs are memory-only fixtures.
const require=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url);
const {chromium}=require('playwright');
const result=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import View from './client/src/components/v139/BidsWindowsView';let root;window.remount=()=>{root?.unmount();root=createRoot(document.getElementById('root'));root.render(<View/>)};window.remount();`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'fixture',setup(builder){
  builder.onResolve({filter:/\.css$/},()=>({path:'css',namespace:'fixture'}));
  builder.onResolve({filter:/\/Shell$/},()=>({path:'shell',namespace:'fixture'}));
  builder.onResolve({filter:/^sonner$/},()=>({path:'toast',namespace:'fixture'}));
  builder.onLoad({filter:/.*/,namespace:'fixture'},({path:name})=>({contents:name==='css'?'':name==='shell'?'export const V139Header=()=>null;':`const record=(type,text)=>{window.toasts||=[];window.toasts.push({type,text})};export const toast={error:t=>record('error',t),success:t=>record('success',t),info:t=>record('info',t),message:t=>record('message',t)};`,loader:'js'}));
  builder.onResolve({filter:/^@\//},({path:name})=>({path:path.resolve('client/src',name.slice(2)+'.ts')}));
}}]});
const server=http.createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(result.outputFiles[0].text);}else{res.setHeader('content-type','text/html');res.end('<div id="root"></div><script src="/fixture.js"></script>');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser,offline=false,hold=false,resume,started;
const states={A:false,B:false},writes=[];
try{
 browser=await chromium.launch({...process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{},args:['--no-sandbox']});
 const context=await browser.newContext({serviceWorkers:'block'});
 // Deliberately stale cookie: explicit bearer must control every cycle write/read.
 await context.addCookies([{name:'crewcheck_auth_token',value:'A',url:origin}]);
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  if(url.pathname==='/api/platform/bids')return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,windows:[{id:'fictional',title:'Fictional status fixture',targetMonth:'2026-10',opensAt:'2026-10-11T10:00:00Z',closesAt:'2026-10-15T20:00:00Z',notifyOpen:true,notifyLastDay:true,openDispatchStatus:'uncertain',lastDayDispatchStatus:'accepted'}],notifications:[]})});
  assert.equal(url.pathname,'/api/platform/notification-cycles/year-end-leave-2026-2027-cabine');
  const token=request.headers().authorization?.replace('Bearer ','');assert(['A','B'].includes(token));
  if(request.method()==='POST'){
   assert.deepEqual(request.postDataJSON(),{action:'submitted'});writes.push(token);
   if(offline)return route.abort();
   states[token]=true;
   if(hold){hold=false;started();await new Promise(resolve=>{resume=resolve});}
  }
  return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,submitted:states[token],message:'Solicitação declarada como enviada; não confirma concessão.'})});
 });
 const page=await context.newPage();
 await page.addInitScript(()=>{localStorage.setItem('crewcheck_auth_token','A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A',email:'A@example.test'}));});
 await page.goto(origin);
 const button=()=>page.getByRole('button',{name:'Já solicitei',exact:true});
 await button().waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Já solicitei'&&!b.disabled));
 assert(await page.getByRole('button',{name:'Lembrar depois',exact:true}).isDisabled());
 assert(await page.getByText('Abertura: Resultado desconhecido; repetição automática suspensa').isVisible());
 assert(await page.getByText('Último dia: Provedor aceitou; entrega não confirmada').isVisible());
 assert.deepEqual(await page.locator('input[type=datetime-local]').evaluateAll(inputs=>inputs.map(input=>input.value)),['','']);
 await page.locator('input[type=month]').fill('2026-12');
 assert.deepEqual(await page.locator('input[type=datetime-local]').evaluateAll(inputs=>inputs.map(input=>input.value)),['','']);
 const link=page.getByRole('link',{name:'Abrir formulário do comunicado'});
 assert.equal(await link.getAttribute('href'),'https://docs.google.com/forms/d/e/1FAIpQLSehDGJW8pRXXb5j5HbMw0-NSF5Q8nVS7Yb9EwzTqOBhhBllXA/viewform?usp=dialog');
 offline=true;await button().click();await page.waitForFunction(()=>window.toasts?.some(t=>t.type==='error'));
 assert.equal(states.A,false);assert(await button().isEnabled());
 offline=false;await button().click();await page.getByRole('button',{name:'Solicitação declarada como enviada',exact:true}).waitFor();
 await page.evaluate(()=>window.remount());await page.getByRole('button',{name:'Solicitação declarada como enviada',exact:true}).waitFor();assert.equal(states.A,true);
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','B');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'B',email:'B@example.test'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});
 await button().waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Já solicitei'&&!b.disabled));
 let signal;const began=new Promise(resolve=>{signal=resolve});started=signal;hold=true;
 await button().click();await began;
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A',email:'A@example.test'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});
 await page.getByRole('button',{name:'Solicitação declarada como enviada',exact:true}).waitFor();
 resume();await page.waitForTimeout(100);
 assert.deepEqual(writes,['A','A','B']);
 assert(await page.getByRole('button',{name:'Solicitação declarada como enviada',exact:true}).isDisabled());
 console.log('Actual leave UI PASS: offline failure, reconnect, persistence/remount, explicit owner bearer over stale cookie, late account response, source/link and disabled unsafe snooze.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
