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
const hostPrelude=`import{useWakeupSpokenConsent}from'./client/src/components/notifications/useWakeupSpokenConsent';import{WakeClockOptions}from'./client/src/components/notifications/WakeClockOptions';import{WakeupSimpleCard}from'./client/src/components/notifications/WakeupSimpleCard';import{wakeCivilDate,wakeDateFields,wakePlanConflict,wakeReceiptConfirmed,wakeReceiptState,wakeNextConfirmed}from'./shared/wakeupPlan.mjs';import{setCrewCheckThemePreference}from'./client/src/lib/themeRuntime';window.fixtureTheme=setCrewCheckThemePreference;import React,{useState,useRef,useEffect} from 'react';import{getToken,authFetch,getStoredUser}from'./client/src/lib/authClient';
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
const contents=`${hostPrelude}
import{createRoot}from'react-dom/client';
const WakeDiagnostic=()=>null,NotificationReadiness=()=>null;
function WakeupChannelSelection(props){useEffect(()=>props.onDecision({ownerId:getStoredUser()?.id,eventId:props.eventId,instant:props.instant,ready:true,channel:'telegram',channels:['telegram']}),[props.eventId,props.instant]);return null;}
${kpi}${wake}
function Harness(){const[event,setEvent]=useState({id:'synthetic',placeholder:false,origin:'SYN',destination:'SYN',canonical:{id:'canonical-synthetic',revision:'A'}});window.fixtureEvent=setEvent;return <WakeupView event={event}/>;}
window.fixturePosts=[];window.fixturePost=async(path,body)=>{window.fixturePosts.push({path,body});return {ok:false};};
createRoot(document.getElementById('root')).render(<Harness/>);`;
const bundle=await build({stdin:{contents,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'fixture.js',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'alias',setup(b){b.onResolve({filter:/^@\//},({path:p})=>({path:path.resolve('client/src',p.slice(2)+'.ts')}));}}]});
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles.find(file=>file.path.endsWith('.js')).text:'<main id="root"></main><script src="/fixture.js"></script>');});
let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const context=await browser.newContext({serviceWorkers:'block'});let posts=0;const errors=[];
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname.startsWith('/api/')){assert.equal(route.request().method(),'GET');posts+=route.request().method()==='POST'?1:0;return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,jobs:[],readiness:{telegramConfigured:true,telegramLinked:true}})});}return route.continue();});
 await context.addInitScript(()=>{localStorage.setItem('crewcheck_auth_token','SYNTHETIC');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'SYNTHETIC'}));sessionStorage.setItem('crewcheck_roster',JSON.stringify({revision:'A'}));});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);
 await page.getByText('Mais opções',{exact:true}).click();
 const choice=page.getByRole('checkbox',{name:'Incluir programação confirmada neste alerta',exact:true});
 const automatic=page.getByRole('checkbox',{name:'Usar horário da escala',exact:true});
 const lead=page.getByLabel(/Antecedência da escala/);
 async function renew(){await choice.check();assert(await choice.isChecked());}
 async function cleared(label){await page.waitForFunction(()=>!Array.from(document.querySelectorAll('input[type=checkbox]')).find(node=>node.parentElement.textContent.includes('Incluir programação confirmada')).checked);assert.equal(await choice.isChecked(),false,label);}
 assert.equal(await choice.isChecked(),false);
 await renew();await automatic.uncheck();await automatic.check();await cleared('automatic → manual → automatic');
 await renew();await lead.selectOption('75');await lead.selectOption('90');await cleared('lead A → B → A');
 await renew();await page.evaluate(()=>window.fixtureEvent(previous=>({...previous,canonical:{...previous.canonical,revision:'B'}})));await cleared('same event/instant new revision');await page.evaluate(()=>window.fixtureEvent(previous=>({...previous,canonical:{...previous.canonical,revision:'A'}})));await cleared('revision restored');
 await renew();await page.evaluate(()=>window.fixtureEvent(previous=>({...previous,hotel:'OTHER_SYNTHETIC'})));await cleared('hotel context change');await page.evaluate(()=>window.fixtureEvent(previous=>({...previous,hotel:undefined})));await cleared('hotel context restored');
 await renew();await page.evaluate(()=>{window.dispatchEvent(new Event('crewcheck:auth-will-change'));window.dispatchEvent(new Event('crewcheck:auth-changed'));});await cleared('same-owner session generation, no unmount');
 await renew();await page.evaluate(()=>{localStorage.removeItem('crewcheck_auth_token');window.dispatchEvent(new Event('crewcheck:auth-expired'));localStorage.setItem('crewcheck_auth_token','SYNTHETIC');window.dispatchEvent(new Event('crewcheck:auth-changed'));});await cleared('logout/login same owner and token in one task');
 await renew();await page.evaluate(()=>{sessionStorage.setItem('crewcheck_roster',JSON.stringify({revision:'B'}));window.dispatchEvent(new Event('crewcheck:roster-updated'));sessionStorage.setItem('crewcheck_roster',JSON.stringify({revision:'A'}));window.dispatchEvent(new Event('crewcheck:roster-updated'));});await cleared('source revision A → B → A in one task');
 await renew();await page.evaluate(()=>window.dispatchEvent(new Event('crewcheck:stay-editor-saved')));await cleared('hotel source generation');
 await renew();await page.evaluate(()=>window.fixtureEvent(previous=>({...previous,stayWakeup:{plannedAt:'2032-02-01T08:30:00Z'}})));await cleared('hotel mode');assert(await choice.isDisabled());await page.evaluate(()=>window.fixtureEvent(previous=>({...previous,stayWakeup:undefined})));await cleared('return from hotel mode');
 // A source mutation without an event is still rechecked at actual request creation.
 await renew();await page.evaluate(()=>sessionStorage.setItem('crewcheck_roster',JSON.stringify({revision:'C'})));
 const activate=page.getByRole('button',{name:'Agendar mensagem Telegram',exact:true});await activate.click();await page.waitForFunction(()=>window.fixturePosts.length===1);
 assert.equal(await page.evaluate(()=>window.fixturePosts[0].body.spokenProgram),false);assert.equal(await page.evaluate(()=>window.fixturePosts[0].body.eventId),undefined);
 await renew();await activate.click();await page.waitForFunction(()=>window.fixturePosts.length===2);assert.equal(await page.evaluate(()=>window.fixturePosts[1].body.spokenProgram),true);
 assert.equal(posts,0);assert.deepEqual(errors,[]);await context.close();
 console.log('PASS real prepared WakeupView: irreversible manual/lead/hotel/source round trips, same-owner session reset, source revision and submit-time recheck; no provider calls.');
}finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
