import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url);
const {chromium}=require('playwright');
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{NotificationReadiness}from'./client/src/components/notifications/NotificationReadiness';createRoot(document.getElementById('root')).render(<NotificationReadiness/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'alias',setup(b){b.onResolve({filter:/^@\//},({path:p})=>({path:path.resolve('client/src',p.slice(2)+'.ts')}));}}]});
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:'<div id="root"></div><script src="/fixture.js"></script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
let browser,offline=false,hold=false,resume,signal;const reads=[];
try{
 browser=await chromium.launch({args:['--no-sandbox'],...process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}});
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.addCookies([{name:'crewcheck_auth_token',value:'stale',url:origin}]);
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  assert.equal(url.pathname,'/api/alarm/scheduled');assert.equal(req.method(),'GET');
  const token=req.headers().authorization?.replace('Bearer ','');assert(['A','B'].includes(token));reads.push(token);
  if(offline)return route.abort();
  if(hold&&token==='B'){hold=false;signal();await new Promise(r=>resume=r);}
  return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,readiness:{telegramConfigured:true,telegramLinked:token==='A'},jobs:token==='A'?[{id:1,status:'pending'},{id:2,status:'sent'},{id:3,status:'uncertain'},{id:4,status:'expired'},{id:5,status:'cancelled'}]:[]})});
 });
 const page=await context.newPage();
 await page.addInitScript(()=>{localStorage.setItem('crewcheck_auth_token','A');window.permissionsRequested=0;window.Notification={permission:'denied',requestPermission(){window.permissionsRequested++;throw Error('Permission must not be requested');}};});
 await page.goto(origin);await page.getByText('Telegram vinculado a esta conta.',{exact:false}).waitFor();
 assert((await page.getByRole('region',{name:'Entrega fora do app'}).textContent()).includes('1 aceitos pelo provedor'));
 assert((await page.getByRole('region',{name:'Entrega fora do app'}).textContent()).includes('1 com resultado desconhecido'));
 assert.equal(await page.evaluate(()=>window.permissionsRequested),0);
 offline=true;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.getByText('Disponibilidade não verificada.',{exact:false}).waitFor();
 offline=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.getByText('Telegram vinculado a esta conta.',{exact:false}).waitFor();
 const began=new Promise(r=>signal=r);hold=true;
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','B');window.dispatchEvent(new Event('crewcheck:auth-changed'));});await began;
 assert.equal(await page.getByText('Telegram vinculado a esta conta.',{exact:false}).count(),0);
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','A');window.dispatchEvent(new Event('crewcheck:auth-changed'));});await page.getByText('Telegram vinculado a esta conta.',{exact:false}).waitFor();resume();
 await page.waitForTimeout(100);assert.equal(await page.getByText('Esta conta não tem vínculo Telegram válido.',{exact:false}).count(),0);
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','B');window.dispatchEvent(new Event('crewcheck:auth-changed'));});await page.getByText('Esta conta não tem vínculo Telegram válido.',{exact:true}).waitFor();
 await page.evaluate(()=>{localStorage.removeItem('crewcheck_auth_token');window.dispatchEvent(new Event('crewcheck:auth-expired'));});await page.getByText('Disponibilidade não verificada.',{exact:false}).waitFor();
 assert.equal(await page.evaluate(()=>window.permissionsRequested),0);assert(reads.includes('A')&&reads.includes('B'));
 console.log('Actual notification readiness UI PASS: current bearer, offline/reconnect, cleared account state, discarded late responses, acceptance/unknown/expiry/cancel labels, zero sends or permission requests.');
}finally{resume?.();await browser?.close();await new Promise(r=>server.close(r));}
