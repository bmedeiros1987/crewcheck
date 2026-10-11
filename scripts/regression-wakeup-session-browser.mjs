import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url);
const {chromium}=require('playwright');
const home=fs.readFileSync('client/src/pages/Home.tsx','utf8');
const begin=home.indexOf('function WakeupView('),end=home.indexOf('function PresentationManagerView',begin);
assert(begin>=0&&end>begin);const wake=home.slice(begin,end);
assert(wake.includes('const wakeSession = useRef'),'run canonical preparation before host UI regression');
const hostPrelude=`import React,{useState,useRef,useEffect} from 'react';import{getToken,authFetch}from'./client/src/lib/authClient';
const storage={get:(key,fallback)=>localStorage.getItem(key)||fallback,set:(key,value)=>localStorage.setItem(key,value)};
const toast=Object.fromEntries(['success','error','info','message'].map(name=>[name,(message)=>{(window.fixtureToasts ||= []).push(message);} ]));
const isAdmin=()=>false,wakeupLeadMinutes=()=>90,wakeupChannel=()=> 'telegram',safe=(v,f)=>v||f,city=v=>v;
const publishedPresentationOf=()=> '10:00',programDateLabel=()=> 'SYN',rosterEventTitle=()=> 'Synthetic',wakeupChannelLabel=v=>v,wakeupDateLabel=v=>v&&!isNaN(v.getTime())?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'UTC'}).format(v):'Horário pendente';
const eventStartDateTime=()=>new Date('2032-02-01T10:00:00Z'),wakeupDateForEvent=eventStartDateTime;
const getPlatformBilling=async()=>null,postCrewCheckJson=(...args)=>window.fixturePost(...args);
const openTelegramBinding=()=>{},openWhatsAppBinding=()=>{};
const openNotificationSettings=()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'notifications'}));
const Brand=()=>null,StayNavigationContext=()=>null,KpiCard=()=>null;
const Clock=()=>null,Bell=()=>null,Hotel=()=>null,Save=()=>null,Send=()=>null,Phone=()=>null,X=()=>null,ChevronRight=()=>null;
`;
const bundle=await build({stdin:{contents:`${hostPrelude}import{createRoot}from'react-dom/client';import{NotificationReadiness}from'./client/src/components/notifications/NotificationReadiness';${wake}createRoot(document.getElementById('root')).render(<WakeupView event={{id:'synthetic',placeholder:false,origin:'SYN',destination:'SYN'}}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'alias',setup(b){b.onResolve({filter:/^@\//},({path:p})=>({path:path.resolve('client/src',p.slice(2)+'.ts')}));}}]});
const css=fs.readdirSync('dist/assets').filter(name=>name.endsWith('.css')).map(name=>fs.readFileSync('dist/assets/'+name,'utf8')).join('\n');
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}#fixture-header{position:fixed;top:0;height:80px;width:100%;z-index:999;background:#333}#fixture-footer{position:fixed;bottom:0;height:96px;width:100%;z-index:999;background:#333}#root{padding-top:96px}body{margin:0}</style><header id="fixture-header">Cabeçalho</header><main id="root" class="cz-app" data-view="wakeup"></main><footer id="fixture-footer">Menu</footer><script src="/fixture.js"></script>`);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
let browser,offline=false,hold=false,resume,signal;const reads=[];let holdAllToken='',held=[],allHeld;
try{
 browser=await chromium.launch({args:['--no-sandbox'],...process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}});
 const context=await browser.newContext({viewport:{width:320,height:740},serviceWorkers:'block'});
 await context.addCookies([{name:'crewcheck_auth_token',value:'stale',url:origin}]);
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  if(url.pathname==='/api/alarm/health')return route.fulfill({contentType:'application/json',body:'{"ok":true}'});
  assert.equal(url.pathname,'/api/alarm/scheduled');assert.equal(req.method(),'GET');
  const token=req.headers().authorization?.replace('Bearer ','');assert(['A','B'].includes(token));reads.push(token);
  if(offline)return route.abort();
  if(token===holdAllToken){await new Promise(r=>{held.push(r);if(held.length===2)allHeld();});}
  if(hold&&token==='B'){hold=false;signal();await new Promise(r=>resume=r);}
  return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,readiness:{telegramConfigured:true,telegramLinked:token==='A'},jobs:token==='A'?[{id:1,status:'pending',channel:'OWNER_A_FIXTURE',scheduledAt:'2032-02-01T10:00:00Z'},{id:2,status:'sent',channel:'Ligação VoIP',scheduledAt:'2026-10-03T05:05:00Z',sentAt:'2026-10-03T05:05:00Z'},{id:3,status:'uncertain'},{id:4,status:'expired'},{id:5,status:'cancelled'}]:[]})});
 });
 const page=await context.newPage();
 await page.addInitScript(()=>{localStorage.setItem('crewcheck_auth_token','A');window.permissionsRequested=0;window.Notification={permission:'denied',requestPermission(){window.permissionsRequested++;throw Error('Permission must not be requested');}};});
 await page.goto(origin);
 assert.equal(await page.getByRole('button',{name:'Ativar despertador',exact:true}).count(),1);
 assert.equal(await page.getByRole('button',{name:/Testar|Vincular|Soneca|Salvar preferências|Ativar no servidor/}).count(),0,'technical/configuration actions are not simultaneous');
 await page.locator('.cc-wakeup-history > summary').click();
 const sent=page.locator('.cc-wakeup-history .cz-roster-card').filter({hasText:'Aceito pelo provedor; entrega não confirmada'});
 await sent.waitFor();await sent.scrollIntoViewIfNeeded();assert.equal(await sent.locator('.cz-roster-icon').isVisible(),false,'history reserves width for status text');
 const geometry=await sent.locator('.cz-roster-copy > *').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height};}));
 for(let i=1;i<geometry.length;i++)assert(geometry[i].top>=geometry[i-1].bottom-1,'status and provider timestamp occupy separate flow rows');
 assert(geometry.every(row=>row.height>0),'status rows retain height');
 const baseSizes=await page.locator('.cc-wakeup-page *').evaluateAll(nodes=>nodes.map(node=>parseFloat(getComputedStyle(node).fontSize)));
 for(const width of [320,390,768])for(const theme of ['light','dark'])for(const scale of [1,2]){
  await page.setViewportSize({width,height:740});await page.evaluate(({theme,scale,sizes})=>{document.documentElement.dataset.crewTheme=theme;document.documentElement.style.colorScheme=theme;document.querySelectorAll('.cc-wakeup-page *').forEach((node,index)=>node.style.fontSize=(sizes[index]*scale)+'px');},{theme,scale,sizes:baseSizes});
  const rows=await sent.locator('.cz-roster-copy > *').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return{top:r.top,bottom:r.bottom};}));for(let i=1;i<rows.length;i++)assert(rows[i].top>=rows[i-1].bottom-1,'status/time flow at '+width+'/'+theme+'/'+scale);
  const primary=page.getByRole('button',{name:'Ativar despertador',exact:true});await primary.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));const box=await primary.boundingBox(),header=await page.locator('#fixture-header').boundingBox(),footer=await page.locator('#fixture-footer').boundingBox();assert(box.y>=header.y+header.height&&box.y+box.height<=footer.y,'primary action clear of fixed header/footer '+JSON.stringify({width,theme,scale,box,header,footer}));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
 }
 await page.setViewportSize({width:320,height:740});await page.evaluate(sizes=>document.querySelectorAll('.cc-wakeup-page *').forEach((node,index)=>node.style.fontSize=sizes[index]+'px'),baseSizes);
 await sent.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));if(process.env.WAKEUP_SYNTHETIC_SCREENSHOT)await page.screenshot({path:process.env.WAKEUP_SYNTHETIC_SCREENSHOT});

 await page.getByText('Telegram vinculado a esta conta.',{exact:false}).waitFor();
 assert((await page.getByRole('region',{name:'Entrega fora do app'}).textContent()).includes('1 aceitos pelo provedor'));
 assert((await page.getByRole('region',{name:'Entrega fora do app'}).textContent()).includes('1 com resultado desconhecido'));
 assert.equal(await page.evaluate(()=>window.permissionsRequested),0);
 offline=true;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.getByText('Disponibilidade não verificada.',{exact:false}).waitFor();await page.getByRole('alert').filter({hasText:'Não foi possível consultar'}).waitFor();assert.equal(await page.getByText('Nenhum despertador gravado no servidor.',{exact:true}).count(),0);
 offline=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.getByText('Telegram vinculado a esta conta.',{exact:false}).waitFor();
 const began=new Promise(r=>signal=r);hold=true;
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','B');window.dispatchEvent(new Event('crewcheck:auth-changed'));});await began;
 assert.equal(await page.getByText('Telegram vinculado a esta conta.',{exact:false}).count(),0);assert.equal(await page.getByText('OWNER_A_FIXTURE',{exact:false}).count(),0);
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','A');window.dispatchEvent(new Event('crewcheck:auth-changed'));});await page.getByText('Telegram vinculado a esta conta.',{exact:false}).waitFor();resume();
 await page.waitForTimeout(100);assert.equal(await page.getByText('Esta conta não tem vínculo Telegram válido.',{exact:false}).count(),0);
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','B');window.dispatchEvent(new Event('crewcheck:auth-changed'));});await page.getByText('Esta conta não tem vínculo Telegram válido.',{exact:true}).waitFor();await page.getByText('Nenhum despertador gravado no servidor.',{exact:true}).waitFor();assert.equal(await page.getByText('OWNER_A_FIXTURE',{exact:false}).count(),0);
 await page.evaluate(()=>{localStorage.removeItem('crewcheck_auth_token');window.dispatchEvent(new Event('crewcheck:auth-expired'));});await page.getByText('Disponibilidade não verificada.',{exact:false}).waitFor();await page.getByRole('alert').filter({hasText:'Não foi possível consultar'}).waitFor();assert.equal(await page.getByText('Nenhum despertador gravado no servidor.',{exact:true}).count(),0);
 // Both child and host requests from A are held; B must keep an empty list
 // after every late A response has been released.
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','A');window.dispatchEvent(new Event('crewcheck:auth-changed'));});
 await page.getByText('OWNER_A_FIXTURE',{exact:false}).waitFor();
 const bothHeld=new Promise(r=>allHeld=r);holdAllToken='A';
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));await bothHeld;
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','B');window.dispatchEvent(new Event('crewcheck:auth-changed'));});
 await page.getByText('Nenhum despertador gravado no servidor.',{exact:true}).waitFor();
 holdAllToken='';held.splice(0).forEach(r=>r());await page.waitForTimeout(100);
 assert.equal(await page.getByText('OWNER_A_FIXTURE',{exact:false}).count(),0);
 // A cancellation returns after a switch: no A success/error toast in B.
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','A');window.dispatchEvent(new Event('crewcheck:auth-changed'));window.fixtureToasts=[];window.fixturePost=()=>new Promise(resolve=>window.resolveFixturePost=resolve);});
 await page.getByRole('button',{name:'Cancelar',exact:true}).waitFor();await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','B');window.dispatchEvent(new Event('crewcheck:auth-changed'));});
 await page.getByText('Nenhum despertador gravado no servidor.',{exact:true}).waitFor();
 await page.evaluate(()=>window.resolveFixturePost({ok:true,cancelled:true}));await page.waitForTimeout(100);
 assert.deepEqual(await page.evaluate(()=>window.fixtureToasts),[]);
 assert.equal(await page.evaluate(()=>window.permissionsRequested),0);assert(reads.includes('A')&&reads.includes('B'));
 console.log('Complete prepared WakeupView UI PASS: current bearer, offline/reconnect, cleared account state, discarded late responses, acceptance/unknown/expiry/cancel labels, zero sends or permission requests.');
}finally{held.forEach(r=>r());resume?.();await browser?.close();await new Promise(r=>server.close(r));}
