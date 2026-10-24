import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {build} from 'esbuild';
const require=createRequire(import.meta.url),pw=require(process.env.CREWCHECK_PLAYWRIGHT_PACKAGE||'playwright');
const home=fs.readFileSync('client/src/pages/Home.tsx','utf8');
const start=home.indexOf('function TelegramConciergeView('),end=home.indexOf('\nfunction ',start+1);
assert(start>=0&&end>start);
// Compile the actual shipping component and actual save function. UI-only
// children are minimal fixtures; query/capture/auth/lifecycle remain real.
const component=home.slice(start,end).replace('  return <><Brand back/>','  window.fixtureAsk = ask;\n  useEffect(() => { window.fixtureSettled = JSON.stringify(bundle.roster); }, [JSON.stringify(bundle.roster)]);\n  return <><Brand back/>');
const save=home.match(/function saveRoster\([\s\S]*?\n}/)?.[0];assert(save);
const input=`import React,{useEffect,useRef,useState}from'react';import{createRoot}from'react-dom/client';
import{useCrewciergeConversation}from'./client/src/lib/useCrewciergeConversation';
import{recordCrewciergeCapture}from'./client/src/lib/crewCiergeCapture';
import{normalizeRosterDays}from'./client/src/lib/canonicalRoster';
import{startupOwner,startupKey,startupIntentRevision}from'./client/src/lib/rosterStartup';
import{WellhubConciergeAnswer}from'./client/src/components/WellhubConciergeAnswer';
const isAdmin=()=>false,Brand=()=>null,KpiCard=()=>null,StayNavigationContext=()=>null;
const ConciergeFinancialPreview=()=>{throw Error('Financial reader must not mount offline');};
const Send=()=>null,FileText=()=>null,Wifi=()=>null,RotateCcw=()=>null,Upload=()=>null,Radar=()=>null,ShieldCheck=()=>null,MessageCircle=()=>null;
const isConciergePlaceResults=()=>false,ConciergePlaceResults=()=>null;
const forbid=()=>{window.networkAttempts++;throw Error('NETWORK_FORBIDDEN');};
const askTelegramConcierge=forbid,fetchTelegramConciergeRoster=forbid,telegramConciergeIdentity=forbid,syncRosterWithTelegramConcierge=forbid,openTelegramBinding=forbid,confirmRosterImport=forbid,fetchTelegramConciergeSettings=forbid,saveTelegramConciergePreferences=forbid;
const toast={success:forbid,error:forbid},analyzeSafe=()=>({}),ROSTER_CACHE_SCHEMA='p0-operational-date-anchor-v2';
type BundleState=any;type ZeroView=any;type CrewRoster=any;type ComplianceResult=any;type ConciergePlaceResultsData=any;
${save}
${component}
window.networkAttempts=0;window.fetch=forbid;window.XMLHttpRequest=class{constructor(){forbid();}};window.WebSocket=class{constructor(){forbid();}};
let root=createRoot(document.getElementById('root'));window.fixtureMount=roster=>root.render(<TelegramConciergeView bundle={{roster,source:'synthetic'}} setBundle={()=>{}} setView={()=>{}}/>);
window.fixtureUnmount=()=>root.unmount();window.fixtureSave=saveRoster;
window.fixtureStartupKey=startupKey;
window.fixtureNormalize=normalizeRosterDays;
const choice=JSON.parse(localStorage.getItem(startupKey())||'null');window.fixtureMount(choice?.roster||{year:2032,month:10,days:[]});
window.fixtureReady=true;`;
const compiled=await build({stdin:{contents:input,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',alias:{'@':process.cwd()+'/client/src','@shared':process.cwd()+'/shared'},define:{'process.env.NODE_ENV':'"test"'}});
const html='<!doctype html><div id="root"></div><script>'+compiled.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script>';
let sockets=0;const server=createServer((req,res)=>{sockets++;res.setHeader('Content-Type','text/html');res.end(html);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await pw.chromium.launch({headless:true,...(process.env.CREWCHECK_CHROMIUM_EXECUTABLE?{executablePath:process.env.CREWCHECK_CHROMIUM_EXECUTABLE}:{})});
 const context=await browser.newContext({timezoneId:process.env.TZ||'UTC'});await context.setOffline(true);
 // The fixture supplies only the compiled shell from memory on navigation;
 // query requests are forbidden. This does not certify the global PWA worker.
 let unexpected=0;await context.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({status:200,contentType:'text/html',body:html}):(unexpected++,route.abort()));
 const page=await context.newPage();page.on('pageerror',error=>console.error('Synthetic screen error: '+error.message));
 await page.addInitScript(()=>{
  window.makeRoster=(report='07:25')=>window.fixtureNormalize({year:2032,month:10,base:'BSB',rank:'CCM',days:[{date:'10/10/2032',year:2032,month:10,dayNumber:10,type:'VOO',pairingCode:'SYN',base:'BSB',dutyReport:report,dutyDebrief:'14:05',dutyReportSource:'published',dutyDebriefSource:'published',legs:[{flightNumber:'QA1',origin:'BSB',destination:'GRU',departureTime:'08:20',arrivalTime:'13:35',presentationTime:report,workType:'OP'}]}]});
  window.account=(owner)=>{localStorage.setItem('crewcheck_auth_token','synthetic-'+owner);localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:owner,email:owner+'@example.test',name:'Synthetic'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));};
  window.seed=(roster)=>{roster=window.fixtureNormalize(roster);localStorage.setItem(window.fixtureStartupKey(),JSON.stringify({owner:JSON.parse(localStorage.getItem('crewcheck_auth_user')).id,roster,selection:'explicit',cacheSchema:'p0-operational-date-anchor-v2'}));window.fixtureMount(roster);};
  window.pauseDigest=()=>{window.digestQueue=[];const original=crypto.subtle.digest.bind(crypto.subtle);window.resumeDigest=async()=>{crypto.subtle.digest=original;for(const run of window.digestQueue.splice(0))await run();};crypto.subtle.digest=(...args)=>new Promise((resolve,reject)=>window.digestQueue.push(async()=>{try{resolve(await original(...args));}catch(e){reject(e);}}));};
 });
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.fixtureReady&&window.fixtureAsk&&window.fixtureSettled);
 await page.evaluate(()=>{window.account('a');window.seed(window.makeRoster());});
 await page.waitForFunction(()=>window.fixtureSettled===JSON.stringify(window.makeRoster()));
 const reply=()=>page.locator('h3').filter({hasText:'Resposta do Concierge'}).locator('..').locator('p');
 const ask=async text=>{await page.evaluate(text=>window.fixtureAsk(text),text);};
 await ask('próxima jornada');assert.match(await reply().innerText(),/indisponíveis/);
 const legacy=await page.evaluate(()=>localStorage.getItem(window.fixtureStartupKey()));
 await page.evaluate(()=>window.fixtureSave(window.makeRoster(),'Synthetic selected roster'));
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem(window.fixtureStartupKey()))?.crewCiergeCapture?.contentHash);
 await ask('Quando começa minha próxima jornada?');assert.match(await reply().innerText(),/400 min/);assert.match(await reply().innerText(),/Cache capturado/);
 const ownedBefore=await page.evaluate(()=>localStorage.getItem(window.fixtureStartupKey()));
 await ask('qual APZ?');assert.match(await reply().innerText(),/aeroporto.*hotel.*van/);
 await ask('quanto vou receber?');assert.match(await reply().innerText(),/Não entendi/);
 assert.equal(await page.evaluate(()=>localStorage.getItem(window.fixtureStartupKey())),ownedBefore);
 await page.evaluate(()=>{window.originalGetItem=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key.startsWith('crewcheck_roster_choice_v1_'))throw Error('SYNTHETIC_STORAGE_UNAVAILABLE');return window.originalGetItem.call(this,key);};});
 await ask('próxima jornada');assert.match(await reply().innerText(),/indisponível/);
 await page.evaluate(()=>{Storage.prototype.getItem=window.originalGetItem;});
 // Two actual ask closures, with the first suspended inside real WebCrypto.
 await page.evaluate(()=>{window.pauseDigest();window.first=window.fixtureAsk('próxima jornada');});
 await page.waitForFunction(()=>window.digestQueue.length===1);
 await ask('qual APZ?');await page.evaluate(async()=>{await window.resumeDigest();await window.first;});
 assert.match(await reply().innerText(),/aeroporto.*hotel.*van/);
 await page.evaluate(()=>{window.pauseDigest();window.first=window.fixtureAsk('próxima jornada');});await page.waitForFunction(()=>window.digestQueue.length===1);
 await page.evaluate(async()=>{localStorage.removeItem('crewcheck_auth_token');window.dispatchEvent(new Event('crewcheck:auth-expired'));await window.resumeDigest();await window.first;});
 assert.equal(await reply().count(),0);
 await page.evaluate(()=>{window.account('a');window.seed(window.makeRoster());window.fixtureSave(window.makeRoster(),'Synthetic selection');});await page.waitForFunction(()=>JSON.parse(localStorage.getItem(window.fixtureStartupKey()))?.crewCiergeCapture);
 await ask('próxima jornada');assert.match(await reply().innerText(),/400 min/);
 await page.reload();await page.waitForFunction(()=>window.fixtureReady&&window.fixtureAsk&&window.fixtureSettled);await ask('q horas é a prx jornada?');assert.match(await reply().innerText(),/400 min/);
 // A suspended answer cannot survive an A→B selection/session switch.
 await page.evaluate(()=>{window.pauseDigest();window.first=window.fixtureAsk('próxima jornada');});await page.waitForFunction(()=>window.digestQueue.length===1);
 await page.evaluate(async()=>{window.account('b');window.seed(window.makeRoster('06:25'));await window.resumeDigest();await window.first;window.fixtureSave(window.makeRoster('06:25'),'Synthetic B selection');});
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem(window.fixtureStartupKey()))?.crewCiergeCapture&&window.fixtureSettled===JSON.stringify(window.makeRoster('06:25')));await ask('próxima jornada');assert.match(await reply().innerText(),/460 min/);
 await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'synthetic-changed-selection'})));assert.equal(await reply().count(),0);
 await page.evaluate(()=>{window.pauseDigest();window.first=window.fixtureAsk('próxima jornada');});await page.waitForFunction(()=>window.digestQueue.length===1);
 await page.evaluate(async()=>{window.seed(window.makeRoster('05:25'));await window.resumeDigest();await window.first;});assert.equal(await reply().count(),0);
 // Returning to a legacy owner-bound cache must not stamp it on read/reload.
 await page.evaluate(raw=>{window.account('a');localStorage.setItem(window.fixtureStartupKey(),raw);window.fixtureMount(JSON.parse(raw).roster);},legacy);
 await page.reload();await page.waitForFunction(()=>window.fixtureAsk&&window.fixtureSettled);await ask('próxima jornada');assert.match(await reply().innerText(),/indisponíveis/);
 assert.equal(await page.evaluate(()=>localStorage.getItem(window.fixtureStartupKey())),legacy);
 // Capture writer also fences session changes across its own digest.
 await page.evaluate(()=>{window.pauseDigest();window.fixtureSave(window.makeRoster(),'Synthetic A capture race');});await page.waitForFunction(()=>window.digestQueue.length===1);
 await page.evaluate(async()=>{window.account('b');window.seed(window.makeRoster('06:25'));await window.resumeDigest();});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('crewcheck_roster_choice_v1_a')).crewCiergeCapture),undefined);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('crewcheck_roster_choice_v1_b')).crewCiergeCapture),undefined);
 await page.evaluate(()=>window.fixtureSave(window.makeRoster('06:25'),'Synthetic B capture'));await page.waitForFunction(()=>JSON.parse(localStorage.getItem(window.fixtureStartupKey()))?.crewCiergeCapture);
 await page.evaluate(()=>{window.pauseDigest();window.first=window.fixtureAsk('próxima jornada');});await page.waitForFunction(()=>window.digestQueue.length===1);
 await page.evaluate(async()=>{window.fixtureUnmount();await window.resumeDigest();await window.first;});
 assert.equal(await page.evaluate(()=>window.networkAttempts),0);assert.equal(unexpected,0);assert.equal(sockets,0);
 console.log('PASS real compiled TelegramConciergeView offline: legitimate save metadata, reload, legacy unknown, APZ/unsupported, two concurrent questions, logout during digest, A→B, selection/storage invalidation; zero HTTP/restore or implicit cache writes. Shell navigation fulfilled from fixture memory, not a PWA-worker certification.');
 await context.close();
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
