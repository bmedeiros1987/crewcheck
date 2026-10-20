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
const hostPrelude=`import{WakeClockOptions}from'./client/src/components/notifications/WakeClockOptions';import{WakeupSimpleCard}from'./client/src/components/notifications/WakeupSimpleCard';import{wakeCivilDate,wakeDateFields,wakePlanConflict,wakeReceiptConfirmed,wakeReceiptState,wakeNextConfirmed}from'./shared/wakeupPlan.mjs';import{setCrewCheckThemePreference}from'./client/src/lib/themeRuntime';window.fixtureTheme=setCrewCheckThemePreference;import React,{useState,useRef,useEffect} from 'react';import{getToken,authFetch,getStoredUser}from'./client/src/lib/authClient';
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
const bundle=await build({stdin:{contents:`${hostPrelude}import{WakeDiagnostic}from'./client/src/components/notifications/WakeDiagnostic';import{createRoot}from'react-dom/client';import{NotificationReadiness}from'./client/src/components/notifications/NotificationReadiness';import{WakeupChannelSelection as ActualWakeupChannelSelection}from'./client/src/components/notifications/WakeupChannelSelection';function WakeupChannelSelection(props){const callback=React.useCallback(value=>{(window.fixtureDecisions ||= []).push(value);props.onDecision(value);},[props.onDecision]);return <ActualWakeupChannelSelection {...props} onDecision={callback}/>;}import MoneyText from './client/src/components/MoneyText';${kpi}${wake}function Harness(){const[id,setId]=useState('synthetic');const[visible,setVisible]=useState(true);window.fixtureAlarm=setId;window.fixtureVisible=setVisible;return visible?<WakeupView event={{id,placeholder:false,origin:'SYN',destination:'SYN'}}/>:<p>Wake fixture unmounted</p>;}createRoot(document.getElementById('root')).render(<Harness/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'wakeup-fixture.js',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'alias',setup(b){b.onResolve({filter:/^@\//},({path:p})=>({path:path.resolve('client/src',p.slice(2)+'.ts')}));}}]});
const css=fs.readdirSync('dist/assets').filter(name=>name.endsWith('.css')).map(name=>fs.readFileSync('dist/assets/'+name,'utf8')).join('\n');
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles.find(file=>file.path.endsWith('.js')).text:`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}#fixture-header{position:fixed;top:0;height:80px;width:100%;z-index:999;background:#333}#fixture-footer{position:fixed;bottom:0;height:96px;width:100%;z-index:999;background:#333}#root{padding-top:96px}body{margin:0}</style><header id="fixture-header">Cabeçalho</header><main id="root" class="cz-app" data-view="wakeup"></main><footer id="fixture-footer">Menu</footer><script src="/fixture.js"></script>`);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
let healthReads=0;let testPage;let browser,offline=false,hold=false,resume,signal;const reads=[];let holdAllToken='',held=[],allHeld;let holdConfirmation=false,confirmationHeld=[];
try{
 browser=await chromium.launch({args:['--no-sandbox'],...process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}});
 const context=await browser.newContext({viewport:{width:320,height:740},timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
 await context.addCookies([{name:'crewcheck_auth_token',value:'stale',url:origin}]);
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  if(url.pathname==='/api/notifications/diagnostic'){
    assert.equal(req.method(),'GET');assert(['Bearer A','Bearer B','Bearer A2'].includes(req.headers().authorization));
    return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,observational:true,wake:{status:'absent',scope:'current_account_wake_history',counts:[]}})});
  }
  if(url.pathname==='/api/alarm/health'){healthReads++;return route.fulfill({contentType:'application/json',body:'{"ok":true}'});}
  assert.equal(url.pathname,'/api/alarm/scheduled');assert.equal(req.method(),'GET');
  const fixturePending=await route.request().frame().evaluate(()=>window.fixturePending===true);
  const confirmedJobs=await route.request().frame().evaluate(()=>window.fixtureConfirmedJobs||[]);
  const token=req.headers().authorization?.replace('Bearer ','');assert(['A','B','A2'].includes(token));reads.push(token);
  if(offline)return route.abort();
  if(holdConfirmation&&confirmedJobs.length)await new Promise(resolve=>confirmationHeld.push(resolve));
  if(token===holdAllToken){await new Promise(r=>{held.push(r);if(held.length===2)allHeld();});if(offline)return route.abort();}
  if(hold&&token==='B'){hold=false;signal();await new Promise(r=>resume=r);}
  return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,readiness:{telegramConfigured:!(await route.request().frame().evaluate(()=>window.fixtureTelegramUnavailable===true)),telegramLinked:['A','A2'].includes(token)||await route.request().frame().evaluate(()=>window.fixtureLinkedB===true)},jobs:['A','A2'].includes(token)?[...confirmedJobs,...(fixturePending?[{id:99,jobKey:'wakeup:synthetic:SYN:10:00:75:telegram',status:'pending',channel:'telegram',scheduledAt:'2032-02-01T08:30:00Z'}]:[]),{id:1,status:'pending',channel:'OWNER_A_FIXTURE',scheduledAt:'2032-02-01T10:00:00Z'},{id:2,status:'sent',channel:'Ligação VoIP',scheduledAt:'2026-10-03T05:05:00Z',sentAt:'2026-10-03T05:05:00Z'},{id:3,status:'uncertain'},{id:4,status:'expired'},{id:5,status:'cancelled'}]:[]})});
 });
 const page=await context.newPage();testPage=page;
 await page.addInitScript(()=>{localStorage.setItem('crewcheck_auth_token','A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A'}));localStorage.setItem('crewcheck:notification-preferences:v1:A',JSON.stringify({ownerId:'A',revision:0,preferences:{settings:{crewcheck_wakeup_channel:'ambos'}}}));window.permissionsRequested=0;window.Notification={permission:'denied',requestPermission(){window.permissionsRequested++;throw Error('Permission must not be requested');}};});
 await page.goto(origin);
 assert.equal(await page.getByRole('button',{name:'Agendar mensagem Telegram',exact:true}).count(),1);
 // Real inherited combined preference reproduces the reported disabled button.
 const actionable=page.getByRole('button',{name:/^Mensagem Telegram(?: · selecionada)?$/}),scheduleAction=page.getByRole('button',{name:'Agendar mensagem Telegram',exact:true});
 await actionable.waitFor();await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-selection>button').disabled);
 assert(await scheduleAction.isDisabled(),'combined inherited choice must never silently pick a channel');
 assert.equal(await page.locator('.cc-wake-more').getAttribute('open'),null,'eligible channel is outside More options');
 const accountDefault=await page.evaluate(()=>localStorage.getItem('crewcheck:notification-preferences:v1:A'));
 await actionable.click();await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);
 assert.equal(await page.evaluate(()=>localStorage.getItem('crewcheck:notification-preferences:v1:A')),accountDefault,'quick selection changes only this occurrence');
 const quickSaved=await page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('crewcheck:wakeup-selection:')).map(([,value])=>JSON.parse(value)));
 assert.equal(quickSaved.length,1);assert.deepEqual(quickSaved[0].channels,['telegram']);
 assert.equal(await page.getByText('Nenhum próximo toque confirmado',{exact:true}).count(),1,'choosing never creates a schedule receipt');
 await page.evaluate(()=>window.fixtureAlarm('synthetic-quick-other'));await page.waitForFunction(()=>document.querySelector('.cc-wakeup-primary').disabled);
 await page.evaluate(()=>window.fixtureAlarm('synthetic'));await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);
 await page.evaluate(()=>window.fixtureTelegramUnavailable=true);await page.getByRole('button',{name:'Atualizar estado',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.cc-wakeup-primary').disabled);
 await page.waitForFunction(()=>document.querySelector('.cc-wakeup-selection>button').disabled);assert(await actionable.isDisabled(),'missing server capability blocks even a saved Telegram choice');
 await page.evaluate(()=>window.fixtureTelegramUnavailable=false);await page.getByRole('button',{name:'Atualizar estado',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);
 if(process.env.WAKEUP_ACTIONABLE_SCREENSHOT){await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{window.fixtureTheme('dark');document.querySelector('#fixture-header').style.visibility='hidden';document.querySelector('#fixture-footer').style.visibility='hidden';document.activeElement?.blur();scrollTo(0,0);});await page.locator('.cc-wakeup-page').screenshot({path:process.env.WAKEUP_ACTIONABLE_SCREENSHOT,animations:'disabled'});await page.evaluate(()=>{document.querySelector('#fixture-header').style.visibility='';document.querySelector('#fixture-footer').style.visibility='';});await page.setViewportSize({width:320,height:740});}

 assert.equal(await page.getByRole('button',{name:/Testar|Vincular|Soneca|Salvar preferências|Ativar no servidor/}).count(),0,'technical/configuration actions are not simultaneous');

 await page.getByText('Mais opções',{exact:true}).click();
 assert(await page.getByRole('checkbox',{name:'Tocar no celular',exact:true}).isDisabled());assert(await page.getByRole('checkbox',{name:'Ligar no horário',exact:true}).isDisabled());assert(await page.getByRole('checkbox',{name:/^Ligar se não recebermos/}).isDisabled());
 const directMessage=page.getByRole('checkbox',{name:'Mandar mensagem no horário',exact:true});
 await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);await directMessage.uncheck();assert(await page.getByRole('button',{name:'Agendar mensagem Telegram',exact:true}).isDisabled());await actionable.click();await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);assert(await directMessage.isChecked(),'explicit Telegram choice enables its message option, never calls');
 const selection=page.locator('.cc-wakeup-selection'),primary=page.getByRole('button',{name:'Agendar mensagem Telegram',exact:true});
 await selection.getByText('Canais e preferências',{exact:true}).click();
 await selection.getByText('Mensagem Telegram disponível para solicitar agendamento.',{exact:false}).waitFor();
 await page.evaluate(()=>{window.fixturePosts=[];window.fixturePost=async(path,body)=>{window.fixturePosts.push({path,body});return{ok:true,message:'Solicitação registrada no servidor; entrega não confirmada.'};};});
 const inherit=selection.getByRole('checkbox',{name:'Usar padrão de Menu → Notificações'}),telegram=selection.getByRole('checkbox',{name:/^Mensagem Telegram/}),call=selection.getByRole('checkbox',{name:/^Ligação via Telegram/}),phone=selection.getByRole('checkbox',{name:/^Ligação telefônica/});
 assert(!(await inherit.isChecked()));assert(await telegram.isChecked());await inherit.check();assert(await inherit.isChecked());await inherit.uncheck();assert(await primary.isDisabled());
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
 // A storage event from another real tab must reload B's phone preference without remounting.
 await page.evaluate(()=>{window.fixtureLinkedB=true;window.fixtureDecisions=[];});
 const otherTab=await context.newPage();await otherTab.goto(origin);
 await otherTab.evaluate(()=>{localStorage.setItem('crewcheck:notification-preferences:v1:B',JSON.stringify({ownerId:'B',revision:1,preferences:{settings:{crewcheck_wakeup_channel:'ligacao'}}}));localStorage.setItem('crewcheck_auth_token','B');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'B'}));});
 await page.waitForFunction(()=>window.fixtureDecisions?.at(-1)?.ownerId==='B');assert(await phone.isChecked());assert(!(await telegram.isChecked()));assert(await primary.isDisabled());
 await otherTab.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A'}));});await page.waitForFunction(()=>window.fixtureDecisions?.at(-1)?.ownerId==='A'&&window.fixtureDecisions.at(-1).ready);await otherTab.close();await page.evaluate(()=>window.fixtureLinkedB=false);
 // A new event with phone defaults never inherits the previous event's ready Telegram scope.
 await page.evaluate(()=>{window.fixtureDecisions=[];window.fixtureAlarm('event-phone');});await selection.getByText('Usando o padrão da central.',{exact:false}).waitFor();await page.waitForTimeout(50);assert((await page.evaluate(()=>window.fixtureDecisions.filter(value=>value.eventId==='event-phone'))).every(value=>!value.ready),'No transient ready decision for the new event with an old resolved scope');
 await page.evaluate(()=>window.fixtureAlarm('synthetic'));await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);
 // A 75-minute pending job must block a new 90-minute choice even while GET is held or fails.
 const heldRead=new Promise(r=>allHeld=r);holdAllToken='A';
 await page.evaluate(()=>{const node=document.querySelector('.cc-wakeup-primary'),key=Object.keys(node).find(key=>key.startsWith('__reactProps$')),oldHandler=node[key].onClick;window.fixturePending=true;window.dispatchEvent(new Event('crewcheck:notification-jobs-changed'));oldHandler();});await heldRead;assert(await primary.isDisabled());
 await primary.evaluate(node=>{const key=Object.keys(node).find(key=>key.startsWith('__reactProps$'));node[key].onClick();});assert.equal((await page.evaluate(()=>window.fixturePosts)).length,1,'Handler blocks activation while the pending-job snapshot is loading');
 offline=true;holdAllToken='';held.splice(0).forEach(r=>r());await page.locator('.cc-wakeup-history [role=alert]').filter({hasText:'Não foi possível consultar'}).waitFor({state:'attached'});assert(await primary.isDisabled());await primary.evaluate(node=>{const key=Object.keys(node).find(key=>key.startsWith('__reactProps$'));node[key].onClick();});assert.equal((await page.evaluate(()=>window.fixturePosts)).length,1,'Handler blocks activation after a failed refresh');offline=false;
 await page.evaluate(()=>{window.fixturePending=true;window.dispatchEvent(new Event('crewcheck:notification-jobs-changed'));});await page.waitForFunction(()=>document.querySelectorAll('.cc-wakeup-history article').length===6);assert(await primary.isDisabled(),'pending same-program alarm disables the primary action');await primary.evaluate(node=>{const key=Object.keys(node).find(key=>key.startsWith('__reactProps$'));node[key].onClick();});await page.waitForTimeout(100);assert.equal((await page.evaluate(()=>window.fixturePosts)).length,1,'No duplicate alarm while a matching pending job exists');
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
  const primary=page.getByRole('button',{name:'Agendar mensagem Telegram',exact:true});await primary.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));const box=await primary.boundingBox(),header=await page.locator('#fixture-header').boundingBox(),footer=await page.locator('#fixture-footer').boundingBox();assert(box.y>=header.y+header.height&&box.y+box.height<=footer.y,'primary action clear of fixed header/footer '+JSON.stringify({width,theme,scale,box,header,footer}));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
 }
 await page.setViewportSize({width:320,height:740});await page.evaluate(sizes=>document.querySelectorAll('.cc-wakeup-page *').forEach((node,index)=>node.style.fontSize=sizes[index]+'px'),baseSizes);
 await sent.evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));if(process.env.WAKEUP_SYNTHETIC_SCREENSHOT)await page.screenshot({path:process.env.WAKEUP_SYNTHETIC_SCREENSHOT});

 await page.getByText('Diagnóstico da conta',{exact:true}).click();
 await page.getByText('Conta vinculada · entrega não confirmada.',{exact:false}).waitFor();
 assert((await page.getByRole('region',{name:'Entrega fora do app'}).textContent()).includes('1 aceitos pelo provedor'));
 assert((await page.getByRole('region',{name:'Entrega fora do app'}).textContent()).includes('1 com resultado desconhecido'));
 assert.equal(await page.evaluate(()=>window.permissionsRequested),0);
 offline=true;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.getByText('Disponibilidade não verificada.',{exact:false}).waitFor();await page.getByRole('alert').filter({hasText:'Não foi possível consultar'}).waitFor();assert.equal(await page.getByText('Nenhum despertador gravado no servidor.',{exact:true}).count(),0);
 offline=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.getByText('Conta vinculada · entrega não confirmada.',{exact:false}).waitFor();
 const began=new Promise(r=>signal=r);hold=true;
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','B');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'B'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});await began;
 assert.equal(await page.getByText('Conta vinculada · entrega não confirmada.',{exact:false}).count(),0);assert.equal(await page.getByText('OWNER_A_FIXTURE',{exact:false}).count(),0);
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});await page.getByText('Conta vinculada · entrega não confirmada.',{exact:false}).waitFor();resume();
 await page.waitForTimeout(100);assert.equal(await page.getByText('Conta não vinculada.',{exact:false}).count(),0);
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','B');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'B'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});await page.getByText('Conta não vinculada.',{exact:true}).waitFor();await page.getByText('Nenhum despertador gravado no servidor.',{exact:true}).waitFor();assert.equal(await page.getByText('OWNER_A_FIXTURE',{exact:false}).count(),0);
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
 // Simple date/time editor uses the existing queue, never a recurring background job.
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A'}));localStorage.setItem('crewcheck:notification-preferences:v1:A',JSON.stringify({ownerId:'A',revision:20,preferences:{settings:{crewcheck_wakeup_channel:'telegram'}}}));window.dispatchEvent(new Event('crewcheck:auth-changed'));window.dispatchEvent(new Event('crewcheck:notification-preferences-changed'));window.fixturePosts=[];window.fixtureToasts=[];window.fixtureConfirmedJobs=[];window.fixturePending=false;});
 await page.getByText('OWNER_A_FIXTURE',{exact:false}).waitFor();
 const more=page.locator('.cc-wake-more');if(await more.evaluate(node=>node.open))await more.locator(':scope > summary').click();
 const next=page.getByRole('region',{name:'Próximo toque',exact:true});
 await next.getByText('Nenhum próximo toque confirmado',{exact:true}).waitFor();
 const automatic=page.getByRole('checkbox',{name:'Usar horário da escala',exact:true});
 assert(await automatic.isChecked());assert(await page.getByLabel('Horário',{exact:true}).isDisabled());assert(await page.getByLabel('Dia',{exact:true}).isDisabled());
 await automatic.uncheck();await page.getByLabel('Dia',{exact:true}).fill('2032-02-03');await page.getByLabel('Horário',{exact:true}).fill('04:30');
 await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);
 assert.equal((await page.evaluate(()=>window.fixturePosts)).length,0,'editing date/time never schedules');
 // Bare ok and a receipt not found in the authenticated readback cannot confirm a next touch.
 await page.evaluate(()=>{window.fixturePost=async(path,body)=>{window.fixturePosts.push({path,body});return {ok:true};};});
 await primary.click();await page.waitForFunction(()=>window.fixtureToasts.some(value=>value.includes('Não foi possível confirmar este agendamento')));
 assert.equal(await next.getByText('Agendado no servidor',{exact:true}).count(),0);assert(!(await page.evaluate(()=>window.fixtureToasts)).some(value=>value.includes('Registro confirmado')));
 await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);
 await page.evaluate(()=>{window.fixtureToasts=[];window.fixturePost=async(path,body)=>{window.fixturePosts.push({path,body});return {ok:true,...body,status:'pending'};};});
 await primary.click();await page.waitForFunction(()=>window.fixtureToasts.some(value=>value.includes('Não foi possível confirmar este agendamento')));assert.equal(await next.getByText('Agendado no servidor',{exact:true}).count(),0);
 await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);
 // Matching persisted terminal/uncertain receipts remain real history, never scheduled success.
 for(const status of ['sent','failed','cancelled','uncertain','partial','processing','dispatching','expired','held']){
  await page.evaluate(()=>{window.fixtureConfirmedJobs=[];window.fixtureToasts=[];window.dispatchEvent(new Event('crewcheck:notification-jobs-changed'));});await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);
  await page.evaluate(status=>{window.fixturePost=async(path,body)=>{window.fixturePosts.push({path,body});window.fixtureConfirmedJobs=[{id:501,...body,status}];return {ok:true,...body,status};};},status);
  await primary.click();await page.waitForFunction(()=>window.fixtureToasts.some(value=>value.includes('Registro persistido')));
  assert(!(await page.evaluate(()=>window.fixtureToasts)).some(value=>value.includes('Registro confirmado')),'non-pending receipt cannot announce scheduled: '+status);
  assert.equal(await next.getByText('Agendado no servidor',{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>window.fixtureConfirmedJobs[0].status),status,'never rewrite persisted status');
  if(['uncertain','partial'].includes(status))assert((await next.textContent()).includes('Resultado não confirmado'));
 }
 // Focus during an accepted POST must retain its operation; stale pre-commit GET cannot erase readback.
 for(const holdOldRead of [false,true]){
  await page.evaluate(()=>{window.fixtureConfirmedJobs=[];window.fixturePosts=[];window.fixtureToasts=[];window.dispatchEvent(new Event('crewcheck:notification-jobs-changed'));});await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);
  await page.evaluate(()=>{window.fixturePost=(path,body)=>{window.fixturePosts.push({path,body});return new Promise(resolve=>window.resolveFocusPost=()=>{window.fixtureConfirmedJobs=[{id:501,...body,status:'pending'}];resolve({ok:true,...body,status:'pending'});});};});
  await primary.click();await page.waitForFunction(()=>window.fixturePosts.length===1);
  if(holdOldRead)holdAllToken='A';
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  if(holdOldRead){for(let n=0;n<50&&!held.length;n++)await page.waitForTimeout(10);assert(held.length>0,'pre-commit GET held');holdAllToken='';}
  else await next.getByText('Nenhum próximo toque confirmado',{exact:true}).waitFor();
  assert(await page.locator('.cc-wakeup-primary').isDisabled(),'focus retains submission lock');
  await page.locator('.cc-wakeup-primary').evaluate(node=>{const key=Object.keys(node).find(key=>key.startsWith('__reactProps$'));node[key].onClick();});assert.equal((await page.evaluate(()=>window.fixturePosts)).length,1);
  await page.evaluate(()=>window.resolveFocusPost());await next.getByText('Agendado no servidor',{exact:true}).waitFor();await page.waitForFunction(()=>window.fixtureToasts.some(value=>value.includes('Registro confirmado no servidor')));
  held.splice(0).forEach(r=>r());await page.waitForTimeout(80);assert.equal(await next.getByText('Agendado no servidor',{exact:true}).count(),1,'late pre-commit GET cannot clear newer persisted readback');
 }
 // Focus supersedes the POST's confirmation GET. Both reads contain the correct job.
 for(const newestFirst of [false,true]){
  await page.evaluate(()=>{window.fixtureConfirmedJobs=[];window.fixturePosts=[];window.fixtureToasts=[];window.dispatchEvent(new Event('crewcheck:notification-jobs-changed'));});await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);
  holdConfirmation=true;
  await page.evaluate(()=>{window.fixturePost=async(path,body)=>{window.fixturePosts.push({path,body});window.fixtureConfirmedJobs=[{id:501,...body,status:'pending'}];return {ok:true,...body,status:'pending'};};});
  await primary.click();for(let n=0;n<100&&!confirmationHeld.length;n++)await page.waitForTimeout(10);assert(confirmationHeld.length>0,'POST confirmation GET held');
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));for(let n=0;n<100&&confirmationHeld.length<2;n++)await page.waitForTimeout(10);assert(confirmationHeld.length>=2,'newer focus GET held');
  holdConfirmation=false;const [oldRead,...newReads]=confirmationHeld.splice(0);
  if(newestFirst){newReads.forEach(resolve=>resolve());await next.getByText('Agendado no servidor',{exact:true}).waitFor();oldRead();}
  else {oldRead();await page.waitForFunction(()=>window.fixtureToasts.some(value=>value.includes('Consulta de confirmação substituída')));newReads.forEach(resolve=>resolve());}
  await next.getByText('Agendado no servidor',{exact:true}).waitFor();await page.waitForFunction(()=>window.fixtureToasts.some(value=>value.includes('Consulta de confirmação substituída')));
  assert(!(await page.evaluate(()=>window.fixtureToasts)).some(value=>value.includes('Não foi possível confirmar')),'superseded coherent GET is not a failed confirmation');
  assert(!(await page.evaluate(()=>window.fixtureToasts)).some(value=>value.includes('Registro confirmado')),'superseded handler does not claim confirmation from POST alone');
  assert.equal((await page.evaluate(()=>window.fixturePosts)).length,1);assert(await primary.isDisabled(),'persisted conflict prevents a duplicate');
 }
 await page.evaluate(()=>{window.fixtureConfirmedJobs=[];window.fixtureToasts=[];window.dispatchEvent(new Event('crewcheck:notification-jobs-changed'));});await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);
 await page.evaluate(()=>{window.fixtureToasts=[];window.fixturePost=async(path,body)=>{window.fixturePosts.push({path,body});window.fixtureConfirmedJobs=[{id:501,...body,status:'pending'}];return {ok:true,...body,status:'pending'};};});
 await primary.click();await next.getByText('Agendado no servidor',{exact:true}).waitFor();await page.waitForFunction(()=>window.fixtureToasts.some(value=>value.includes('Registro confirmado no servidor')));
 const confirmed=(await page.evaluate(()=>window.fixturePosts)).at(-1);assert.equal(confirmed.body.scheduledAt,'2032-02-03T07:30:00.000Z');assert.equal(confirmed.body.channel,'telegram');assert(confirmed.body.jobKey.startsWith('wakeup:manual:2032-02-03:'));assert.equal(await next.getByText('04:30',{exact:true}).count(),1);assert((await next.textContent()).includes('03/02/2032'));
 await page.getByLabel('Horário',{exact:true}).fill('05:00');assert(await primary.isDisabled());assert.equal(await next.getByText('04:30',{exact:true}).count(),1,'editing never relabels the saved next touch');
 assert(!(await next.textContent()).includes('05:00'));
 if(process.env.WAKEUP_SIMPLE_SCREENSHOT){await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.querySelectorAll('.cc-wakeup-page *').forEach(node=>node.style.removeProperty('font-size'));window.fixtureTheme('dark');document.activeElement?.blur();document.querySelector('#fixture-header').style.visibility='hidden';document.querySelector('#fixture-footer').style.visibility='hidden';scrollTo(0,0);});await page.waitForFunction(()=>scrollY===0);await page.locator('.cc-wakeup-page').screenshot({path:process.env.WAKEUP_SIMPLE_SCREENSHOT});await page.evaluate(()=>window.fixtureTheme('light'));await page.locator('.cc-wakeup-page').screenshot({path:process.env.WAKEUP_SIMPLE_SCREENSHOT.replace(/\.png$/,'-light.png')});await page.evaluate(()=>{document.querySelector('#fixture-header').style.visibility='';document.querySelector('#fixture-footer').style.visibility='';});}
 // Offline events immediately withdraw the current confirmation without sending anything.
 await page.evaluate(()=>window.dispatchEvent(new Event('offline')));await next.getByText('Estado não confirmado',{exact:true}).waitFor();assert.equal(await next.getByText('04:30',{exact:true}).count(),0);await page.evaluate(()=>window.dispatchEvent(new Event('online')));await next.getByText('Agendado no servidor',{exact:true}).waitFor();
 // A failed read cannot leave the old confirmed time advertised as current.
 offline=true;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await next.getByText('Estado não confirmado',{exact:true}).waitFor();assert.equal(await next.getByText('04:30',{exact:true}).count(),0);assert(await primary.isDisabled());
 offline=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await next.getByText('Agendado no servidor',{exact:true}).waitFor();
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','B');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'B'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});await next.getByText('Nenhum próximo toque confirmado',{exact:true}).waitFor();assert.equal(await next.getByText('04:30',{exact:true}).count(),0);assert(await automatic.isChecked(),'draft belongs to its current account');
 assert.equal(await page.evaluate(()=>window.permissionsRequested),0);
 // Two synchronous clicks share one submission; a late A receipt never confirms in B.
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));window.fixturePosts=[];window.fixtureToasts=[];window.fixturePost=(path,body)=>{window.fixturePosts.push({path,body});return new Promise(resolve=>window.resolveFixtureSchedule=resolve);};});
 await page.waitForFunction(()=>window.fixtureDecisions.at(-1)?.ownerId==='A');
 if(await automatic.isChecked())await automatic.uncheck();await page.getByLabel('Dia',{exact:true}).fill('2032-02-04');await page.getByLabel('Horário',{exact:true}).fill('04:30');await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);
 await primary.click();await page.locator('.cc-wakeup-primary').evaluate(node=>{const key=Object.keys(node).find(key=>key.startsWith('__reactProps$'));node[key].onClick();});assert.equal((await page.evaluate(()=>window.fixturePosts)).length,1);
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','B');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'B'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});await next.getByText('Nenhum próximo toque confirmado',{exact:true}).waitFor();
 await page.evaluate(()=>window.resolveFixtureSchedule({ok:true,...window.fixturePosts[0].body,status:'pending'}));await page.waitForTimeout(100);assert.deepEqual(await page.evaluate(()=>window.fixtureToasts),[]);assert.equal(await next.getByText('Agendado no servidor',{exact:true}).count(),0);
 // A late accepted POST after logout must not restore a confirmation or emit a toast.
 await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A'}));window.fixtureConfirmedJobs=[];window.fixturePosts=[];window.fixtureToasts=[];window.dispatchEvent(new Event('crewcheck:auth-changed'));window.fixturePost=(path,body)=>{window.fixturePosts.push({path,body});return new Promise(resolve=>window.resolveLogoutPost=()=>resolve({ok:true,...body,status:'pending'}));};});
 await page.waitForFunction(()=>window.fixtureDecisions.at(-1)?.ownerId==='A');await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);await primary.click();await page.waitForFunction(()=>window.fixturePosts.length===1);
 await page.evaluate(()=>{localStorage.removeItem('crewcheck_auth_token');localStorage.removeItem('crewcheck_auth_user');window.dispatchEvent(new Event('crewcheck:auth-expired'));});await next.getByText('Estado não confirmado',{exact:true}).waitFor();
 await page.evaluate(()=>window.resolveLogoutPost());await page.waitForTimeout(80);assert.deepEqual(await page.evaluate(()=>window.fixtureToasts),[]);assert.equal(await next.getByText('Agendado no servidor',{exact:true}).count(),0);assert(await primary.isDisabled());
 // A never-settling old POST cannot lock a new account or a renewed token of the same account.
 if(process.env.WAKEUP_SESSION_CASE!=='cleanup')for(const scenario of ['account','token','logout-login','never-finishes']){
  await page.evaluate(()=>{for(const owner of ['A','B'])localStorage.setItem('crewcheck:notification-preferences:v1:'+owner,JSON.stringify({ownerId:owner,revision:100,preferences:{settings:{crewcheck_wakeup_channel:'telegram'}}}));localStorage.setItem('crewcheck_auth_token','A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A'}));window.fixtureLinkedB=true;window.fixtureConfirmedJobs=[];window.fixturePosts=[];window.fixtureToasts=[];window.fixturePendingPosts=[];window.fixturePost=(path,body)=>{window.fixturePosts.push({path,body,token:localStorage.getItem('crewcheck_auth_token')});return new Promise(resolve=>window.fixturePendingPosts.push(resolve));};window.dispatchEvent(new Event('crewcheck:auth-changed'));window.dispatchEvent(new Event('crewcheck:notification-preferences-changed'));});
  await page.waitForFunction(()=>window.fixtureDecisions.at(-1)?.ownerId==='A'&&window.fixtureDecisions.at(-1)?.ready);await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);await primary.click();await page.waitForFunction(()=>window.fixturePosts.length===1);
  await page.evaluate(scenario=>{if(scenario==='logout-login'){localStorage.removeItem('crewcheck_auth_token');localStorage.removeItem('crewcheck_auth_user');window.dispatchEvent(new Event('crewcheck:auth-expired'));}const owner=['account','never-finishes'].includes(scenario)?'B':'A',token=['account','never-finishes'].includes(scenario)?'B':'A2';localStorage.setItem('crewcheck_auth_token',token);localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:owner}));window.dispatchEvent(new Event('crewcheck:auth-changed'));},scenario);
  await page.waitForFunction(owner=>window.fixtureDecisions.at(-1)?.ownerId===owner&&window.fixtureDecisions.at(-1)?.ready,['account','never-finishes'].includes(scenario)?'B':'A');await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);
  if(await automatic.isChecked())await automatic.uncheck();await page.getByLabel('Dia',{exact:true}).fill('2032-02-05');await page.getByLabel('Horário',{exact:true}).fill('05:30');assert.equal(await page.getByLabel('Horário',{exact:true}).inputValue(),'05:30','new session can edit while old POST is pending');await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);
  await primary.click();await page.waitForTimeout(80);assert.equal((await page.evaluate(()=>window.fixturePosts)).length,2,'new session can submit while old POST never settles: '+scenario);
  // Settling A later must neither toast in the new session nor unlock its newer pending POST.
  if(scenario!=='never-finishes')await page.evaluate(()=>window.fixturePendingPosts[0]({ok:true,...window.fixturePosts[0].body,status:'pending'}));await page.waitForTimeout(80);assert.deepEqual(await page.evaluate(()=>window.fixtureToasts),[]);assert(await page.locator('.cc-wakeup-primary').isDisabled());
  await page.locator('.cc-wakeup-primary').evaluate(node=>{const key=Object.keys(node).find(key=>key.startsWith('__reactProps$'));node[key].onClick();});assert.equal((await page.evaluate(()=>window.fixturePosts)).length,2,'old finally cannot clear newer latch: '+scenario);
  await page.evaluate(()=>window.fixturePendingPosts[1]({ok:true}));await page.waitForFunction(()=>window.fixtureToasts.some(text=>text.includes('Não foi possível confirmar')));
 }
 if(process.env.WAKEUP_SESSION_CASE!=='latch'){
  await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A'}));window.fixtureConfirmedJobs=[];window.dispatchEvent(new Event('crewcheck:auth-changed'));});await page.waitForFunction(()=>window.fixtureDecisions.at(-1)?.ownerId==='A'&&window.fixtureDecisions.at(-1)?.ready);await page.waitForTimeout(80);
  let start=reads.length,healthStart=healthReads;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(150);const mountedReads=reads.length-start,mountedHealth=healthReads-healthStart;assert(mountedReads>0&&mountedHealth>0,'mounted focus actually exercises host callbacks');
  for(let visit=0;visit<3;visit++){
   await page.evaluate(()=>window.fixtureVisible(false));await page.getByText('Wake fixture unmounted',{exact:true}).waitFor();await page.waitForTimeout(60);start=reads.length;healthStart=healthReads;
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(150);assert.equal(reads.length,start,'unmounted focus issues no job GET, visit '+visit);assert.equal(healthReads,healthStart,'unmounted focus issues no health GET, visit '+visit);
   await page.evaluate(()=>window.fixtureVisible(true));await page.getByRole('button',{name:'Agendar mensagem Telegram',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.cc-wakeup-primary').disabled);await page.waitForTimeout(80);start=reads.length;healthStart=healthReads;
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(150);assert.equal(reads.length-start,mountedReads,'remount does not accumulate job listeners');assert.equal(healthReads-healthStart,mountedHealth,'remount does not accumulate health listeners');
  }
 }
 console.log('Complete prepared WakeupView UI PASS: simple date/time, exact receipt/readback, saved time preserved while editing, synchronous duplicate/late-owner guards, same-account focus/POST/stale-GET races, terminal/uncertain receipts, logout during POST, never-settling POST across account/token changes and old finally fencing, mount/unmount/focus listener cleanup, offline/reconnect, account expiry/races, responsive history, zero sends or permission requests.');
}catch(error){if(testPage){fs.writeFileSync('/tmp/wake-simple-fixture-failure.txt',await testPage.locator('body').innerText());fs.writeFileSync('/tmp/wake-simple-fixture-details.json',JSON.stringify(await testPage.locator('details').evaluateAll(nodes=>nodes.map(node=>({text:node.querySelector('summary')?.textContent,open:node.open})))));await testPage.screenshot({path:'/tmp/wake-simple-fixture-failure.png'});}throw error;}finally{confirmationHeld.forEach(r=>r());held.forEach(r=>r());resume?.();await browser?.close();await new Promise(r=>server.close(r));}
