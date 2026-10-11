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
assert(begin>=0&&end>begin);const wake=home.slice(begin,end);const kpiBegin=home.indexOf('function KpiCard('),kpiEnd=home.indexOf('\ntype RadarSnapshot',kpiBegin);assert(kpiBegin>=0&&kpiEnd>kpiBegin);const kpi=home.slice(kpiBegin,kpiEnd);
assert(wake.includes('const wakeSession = useRef'),'run canonical preparation before host UI regression');
const hostPrelude=`import{setCrewCheckThemePreference}from'./client/src/lib/themeRuntime';window.fixtureTheme=setCrewCheckThemePreference;import React,{useState,useRef,useEffect} from 'react';import{getToken,authFetch,getStoredUser}from'./client/src/lib/authClient';
const storage={get:(key,fallback)=>localStorage.getItem(key)||fallback,set:(key,value)=>localStorage.setItem(key,value)};
const toast=Object.fromEntries(['success','error','info','message'].map(name=>[name,(message)=>{(window.fixtureToasts ||= []).push(message);} ]));
const isAdmin=()=>false,wakeupLeadMinutes=()=>90,wakeupChannel=()=> 'telegram',safe=(v,f)=>v||f,city=v=>v;
const publishedPresentationOf=()=> '10:00',programDateLabel=()=> 'SYN',rosterEventTitle=()=> 'Synthetic',wakeupChannelLabel=v=>v,wakeupDateLabel=v=>v&&!isNaN(v.getTime())?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'UTC'}).format(v):'Horário pendente';
const eventStartDateTime=()=>new Date('2032-02-01T10:00:00Z'),wakeupDateForEvent=eventStartDateTime;
const getPlatformBilling=async()=>null,postCrewCheckJson=(...args)=>window.fixturePost(...args);
const openTelegramBinding=()=>{},openWhatsAppBinding=()=>{};
const openNotificationSettings=()=>window.dispatchEvent(new CustomEvent('crewcheck:set-view',{detail:'notifications'}));
const Brand=()=>null,StayNavigationContext=()=>null;
const Clock=()=>null,Bell=()=>null,Hotel=()=>null,Save=()=>null,Send=()=>null,Phone=()=>null,X=()=>null,ChevronRight=()=>null;
`;
const bundle=await build({stdin:{contents:`${hostPrelude}import{createRoot}from'react-dom/client';import{NotificationReadiness}from'./client/src/components/notifications/NotificationReadiness';import{WakeupChannelSelection}from'./client/src/components/notifications/WakeupChannelSelection';import MoneyText from './client/src/components/MoneyText';${kpi}${wake}function Harness(){const[id,setId]=useState('synthetic');window.fixtureAlarm=setId;return <WakeupView event={{id,placeholder:false,origin:'SYN',destination:'SYN'}}/>;}createRoot(document.getElementById('root')).render(<Harness/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'wakeup-fixture.js',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'alias',setup(b){b.onResolve({filter:/^@\//},({path:p})=>({path:path.resolve('client/src',p.slice(2)+'.ts')}));}}]});
const css=fs.readdirSync('dist/assets').filter(name=>name.endsWith('.css')).map(name=>fs.readFileSync('dist/assets/'+name,'utf8')).join('\n');
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles.find(file=>file.path.endsWith('.js')).text:`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}#fixture-header{position:fixed;top:0;height:80px;width:100%;z-index:999;background:#333}#fixture-footer{position:fixed;bottom:0;height:96px;width:100%;z-index:999;background:#333}#root{padding-top:96px}body{margin:0}</style><header id="fixture-header">Cabeçalho</header><main id="root" class="cz-app" data-view="wakeup"></main><footer id="fixture-footer">Menu</footer><script src="/fixture.js"></script>`);});
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
  const fixturePending=await route.request().frame().evaluate(()=>window.fixturePending===true);
  const token=req.headers().authorization?.replace('Bearer ','');assert(['A','B'].includes(token));reads.push(token);
  if(offline)return route.abort();
  if(token===holdAllToken){await new Promise(r=>{held.push(r);if(held.length===2)allHeld();});}
  if(hold&&token==='B'){hold=false;signal();await new Promise(r=>resume=r);}
  return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,readiness:{telegramConfigured:true,telegramLinked:token==='A'},jobs:token==='A'?[...(fixturePending?[{id:99,jobKey:'wakeup:synthetic:SYN:10:00:90:telegram',status:'pending',channel:'telegram',scheduledAt:'2032-02-01T08:30:00Z'}]:[]),{id:1,status:'pending',channel:'OWNER_A_FIXTURE',scheduledAt:'2032-02-01T10:00:00Z'},{id:2,status:'sent',channel:'Ligação VoIP',scheduledAt:'2026-10-03T05:05:00Z',sentAt:'2026-10-03T05:05:00Z'},{id:3,status:'uncertain'},{id:4,status:'expired'},{id:5,status:'cancelled'}]:[]})});
 });
 const page=await context.newPage();
 await page.addInitScript(()=>{localStorage.setItem('crewcheck_auth_token','A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A'}));window.permissionsRequested=0;window.Notification={permission:'denied',requestPermission(){window.permissionsRequested++;throw Error('Permission must not be requested');}};});
 await page.goto(origin);
 assert.equal(await page.getByRole('button',{name:'Ativar despertador',exact:true}).count(),1);
 assert.equal(await page.getByRole('button',{name:/Testar|Vincular|Soneca|Salvar preferências|Ativar no servidor/}).count(),0,'technical/configuration actions are not simultaneous');

 const selection=page.locator('.cc-wakeup-selection'),primary=page.getByRole('button',{name:'Ativar despertador',exact:true});
 await page.getByText('Mensagem Telegram disponível para solicitar agendamento.',{exact:false}).waitFor();
 await page.evaluate(()=>{window.fixturePosts=[];window.fixturePost=async(path,body)=>{window.fixturePosts.push({path,body});return{ok:true,message:'Solicitação registrada no servidor; entrega não confirmada.'};};});
 const inherit=selection.getByRole('checkbox',{name:'Usar padrão de Menu → Notificações'}),telegram=selection.getByRole('checkbox',{name:/^Mensagem Telegram/}),call=selection.getByRole('checkbox',{name:/^Ligação via Telegram/}),phone=selection.getByRole('checkbox',{name:/^Ligação telefônica/});
 assert(await inherit.isChecked());assert(await telegram.isChecked());await inherit.uncheck();assert(await primary.isDisabled());
 await call.check();await phone.check();await selection.getByRole('button',{name:'Salvar escolha deste alarme'}).click();
 assert(await primary.isDisabled());assert.equal((await page.evaluate(()=>window.fixturePosts)).length,0);assert.equal(await page.evaluate(()=>window.permissionsRequested),0);
 await selection.getByText('Seleção múltipla salva como preferência.',{exact:false}).waitFor();
 assert.equal(await page.getByText('Mensagem Telegram + Ligação via Telegram + Ligação telefônica',{exact:true}).count(),1,'Summary names the actual selected channels');
 if(process.env.WAKEUP_SELECTION_SCREENSHOT){await page.evaluate(()=>window.fixtureTheme('dark'));await page.setViewportSize({width:390,height:844});await selection.evaluate(node=>node.scrollIntoView({block:'start',behavior:'instant'}));await selection.screenshot({path:process.env.WAKEUP_SELECTION_SCREENSHOT,animations:'disabled'});}
 const stored=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('crewcheck:wakeup-selection:v1:')).map(([key,value])=>({key,value:JSON.parse(value)})));
 assert.equal(stored.length,1);assert.deepEqual(stored[0].value.channels,['telegram','telegram-call','phone-call']);assert(!JSON.stringify(stored).includes('SYN'));
 await page.evaluate(()=>{localStorage.setItem('crewcheck:notification-preferences:v1:A',JSON.stringify({ownerId:'A',revision:1,preferences:{settings:{crewcheck_wakeup_channel:'ligacao',crewcheck_wakeup_phone:'+12025550123'}}}));window.dispatchEvent(new Event('crewcheck:notification-preferences-changed'));});
 assert(await telegram.isChecked()&&await call.isChecked()&&await phone.isChecked(),'Central default must not overwrite this alarm override');assert.equal(await page.getByText('+12025550123',{exact:false}).count(),0);
 await page.evaluate(()=>window.fixtureAlarm('synthetic-other'));await selection.getByText('Usando o padrão da central.',{exact:false}).waitFor();assert(await inherit.isChecked());assert(await phone.isChecked());assert(!(await telegram.isChecked()));assert(await primary.isDisabled());
 await page.evaluate(()=>window.fixtureAlarm('synthetic'));await selection.getByText('Escolha salva neste aparelho para este alarme.',{exact:false}).waitFor();assert(await telegram.isChecked()&&await call.isChecked()&&await phone.isChecked());
 await call.uncheck();await phone.uncheck();assert(await primary.isDisabled());await selection.getByRole('button',{name:'Salvar escolha deste alarme'}).click();await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);
 const originalGlobal=await page.evaluate(()=>localStorage.getItem('crewcheck:notification-preferences:v1:A'));assert(originalGlobal.includes('ligacao'));
 await primary.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));await primary.click();await page.waitForFunction(()=>window.fixturePosts.length===1);
 const request=(await page.evaluate(()=>window.fixturePosts))[0];assert.equal(request.path,'/api/alarm/schedule');assert.equal(request.body.channel,'telegram');assert(!('phone' in request.body));assert(!('chatId' in request.body));assert(!('telegramUsername' in request.body));assert.equal(request.body.message,'Despertador CrewCheck: confira sua preparação no aplicativo.');assert(!request.body.message.includes('SYN'));
 assert.equal(await page.evaluate(()=>localStorage.getItem('crewcheck:notification-preferences:v1:A')),originalGlobal);
 await page.evaluate(()=>{window.fixturePending=true;window.dispatchEvent(new Event('crewcheck:notification-jobs-changed'));});await page.waitForFunction(()=>document.querySelectorAll('.cc-wakeup-history article').length===6);await primary.click();await page.waitForTimeout(100);assert.equal((await page.evaluate(()=>window.fixturePosts)).length,1,'No duplicate alarm while a matching pending job exists');
 await page.evaluate(()=>{window.fixturePending=false;window.fixturePosts=[];window.dispatchEvent(new Event('crewcheck:notification-jobs-changed'));});
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
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','B');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'B'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});await began;
 assert.equal(await page.getByText('Telegram vinculado a esta conta.',{exact:false}).count(),0);assert.equal(await page.getByText('OWNER_A_FIXTURE',{exact:false}).count(),0);
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});await page.getByText('Telegram vinculado a esta conta.',{exact:false}).waitFor();resume();
 await page.waitForTimeout(100);assert.equal(await page.getByText('Esta conta não tem vínculo Telegram válido.',{exact:false}).count(),0);
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','B');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'B'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});await page.getByText('Esta conta não tem vínculo Telegram válido.',{exact:true}).waitFor();await page.getByText('Nenhum despertador gravado no servidor.',{exact:true}).waitFor();assert.equal(await page.getByText('OWNER_A_FIXTURE',{exact:false}).count(),0);
 await page.evaluate(()=>{localStorage.removeItem('crewcheck_auth_token');localStorage.removeItem('crewcheck_auth_user');window.dispatchEvent(new Event('crewcheck:auth-expired'));});await page.getByText('Disponibilidade não verificada.',{exact:false}).waitFor();await page.getByRole('alert').filter({hasText:'Não foi possível consultar'}).waitFor();assert.equal(await page.getByText('Nenhum despertador gravado no servidor.',{exact:true}).count(),0);
 // Both child and host requests from A are held; B must keep an empty list
 // after every late A response has been released.
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});
 await page.getByText('OWNER_A_FIXTURE',{exact:false}).waitFor();
 const bothHeld=new Promise(r=>allHeld=r);holdAllToken='A';
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));await bothHeld;
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','B');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'B'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});
 await page.getByText('Nenhum despertador gravado no servidor.',{exact:true}).waitFor();
 holdAllToken='';held.splice(0).forEach(r=>r());await page.waitForTimeout(100);
 assert.equal(await page.getByText('OWNER_A_FIXTURE',{exact:false}).count(),0);
 // A cancellation returns after a switch: no A success/error toast in B.
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));window.fixtureToasts=[];window.fixturePost=()=>new Promise(resolve=>window.resolveFixturePost=resolve);});
 await page.getByRole('button',{name:'Cancelar',exact:true}).waitFor();await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','B');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'B'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});
 await page.getByText('Nenhum despertador gravado no servidor.',{exact:true}).waitFor();
 await page.evaluate(()=>window.resolveFixturePost({ok:true,cancelled:true}));await page.waitForTimeout(100);
 assert.deepEqual(await page.evaluate(()=>window.fixtureToasts),[]);
 assert.equal(await page.evaluate(()=>window.permissionsRequested),0);assert(reads.includes('A')&&reads.includes('B'));
 console.log('Complete prepared WakeupView UI PASS: current bearer, offline/reconnect, cleared account state, discarded late responses, acceptance/unknown/expiry/cancel labels, zero sends or permission requests.');
}finally{held.forEach(r=>r());resume?.();await browser?.close();await new Promise(r=>server.close(r));}
