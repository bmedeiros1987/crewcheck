// Real RadarView hooks, cache reader/saver and field decisions; synthetic local transport only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {build} from 'esbuild';

const root=process.cwd(), tmp=fs.mkdtempSync(path.join(os.tmpdir(),'radar-cache-refresh-'));
const baseline=process.env.RADAR_COUNTERPROOF_REF;
const source=baseline?execFileSync('git',['show',baseline+':client/src/pages/Home.tsx'],{encoding:'utf8'}):fs.readFileSync('client/src/pages/Home.tsx','utf8');
const ast=ts.createSourceFile('Home.tsx',source,99,true,ts.ScriptKind.TSX);
const names=['RadarView','validatedRadarForEvent','radarGateInfo','radarFlightDateLabel','radarSnapshotKey','radarEventOperationalDate','radarSnapshotMatchesEvent','readRadarSnapshot','saveRadarSnapshot','fetchRadarSnapshot','setBrowserRadarContext','browserRadarGeneration','invalidateBrowserRadarResponse','browserRadarSignature','readBrowserRadarSnapshot','browserRadarDisplayDeadline'];
const functions=names.map(name=>{const n=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);if(!n&&baseline)return '';assert(n,name);return n.getText(ast)}).join('\n');
const globals=['browserRadarContext','browserRadarResponses','browserRadarInvalidations','radarQuerySerial'].map(name=>{
 const n=ast.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name));if(!n&&baseline)return '';assert(n,name);return n.getText(ast);
}).join('\n');
const recordType=ast.statements.find(n=>ts.isTypeAliasDeclaration(n)&&n.name.text==='BrowserRadarRecord');
assert(recordType||baseline);
if(!baseline){const issuers=[];function visit(n,owner=''){if(ts.isFunctionDeclaration(n))owner=n.name?.text||'';if(ts.isCallExpression(n)&&n.expression.getText(ast)==='browserRadarResponses.set')issuers.push(owner);ts.forEachChild(n,c=>visit(c,owner))}visit(ast);assert.deepEqual(issuers,['fetchRadarSnapshot'],'only the accepted authenticated fetch may mint presentation ownership')}

const code=`import React,{useState,useEffect,useRef} from 'react';import {createRoot} from 'react-dom/client';import {Plane,ShieldCheck,Radar,Globe2,CloudSun} from 'lucide-react';
import {getStoredUser,getToken,getMe,captureAuthSession,authFetch} from '@/lib/authClient';import * as gate from '@/lib/nextFlightGate';
import {beginOperationalRadarRead,retainOperationalRadarResponse,originalOperationalRadarSnapshot,readOperationalRadarAdmission,setOperationalRadarContext} from '@/lib/operationalRadarAdmission';
import {gateQueryDay,originFlightDate,publishedGateDate,radarResultDecision,radarSourceEpoch,gateQuerySuppressed} from './shared/gate-query-day.mjs';
import {radarFailurePayload,radarAvailabilityLabel} from '@/lib/radarAvailability';
const {canonicalFlightId,retainLatestGateEvidence,nextGateUpdateWatermark,RADAR_GATE_STALE_MS,manualGateAccountKey,manualGateIdentity,readManualGate,resolveNextFlightGate,radarSnapshotStorageKey,flightOperationalDate,gateChangeAlertAllowed}=gate;
const safe=(x,f='')=>x||f,normalizedAirlineCode=()=> 'LA',airlineNameFor=()=> 'Synthetic airline',Brand=()=>null,FlightDeckNavigationContext=()=>null,AirlineLogo=()=>null,ManualGateEditor=()=>null,FollowFlightPanel=()=>null;
const storage={get:(k,d)=>localStorage.getItem(k)||d,set:(k,v)=>localStorage.setItem(k,v)},RADAR_CARD_CACHE_TTL_MS=21600000;
const publishCrewCheckNotice=()=>{},publishCrewCheckPulse=()=>{},reconcileCrewCheckPulse=()=>window.saverSideEffect?.(),manualGateNoticeIdentity=()=>'',manualGateNoticeScope=()=>'',claimManualGateNotice=()=>false,eventStartDateTime=e=>new Date(e.canonical.startDateTime);
const telegramConciergeIdentity=()=>({email:'synthetic@example.invalid',name:'Synthetic',conciergeKey:'synthetic'});
window.requests=[];const nativeFetch=window.fetch.bind(window);window.fetch=(url,init)=>String(url).startsWith('/api/radar-flight?')?new Promise(resolve=>window.requests.push({url,init,resolve})):nativeFetch(url,init);
${recordType?.getText(ast)||''}
${baseline?'const setBrowserRadarContext=()=>{};':''}
${globals}
${functions}
const events={one:{id:'SYNTHETIC-ONE',kind:'flight',flightNumber:'LA9001',origin:'BSB',destination:'CGH',day:{date:'20/10/2032'},canonical:{date:'20/10/2032',startDateTime:'2032-10-20T12:00:00.000Z'}},two:{id:'SYNTHETIC-TWO',kind:'flight',flightNumber:'LA9002',origin:'CGH',destination:'BSB',day:{date:'21/10/2032'},canonical:{date:'21/10/2032',startDateTime:'2032-10-21T12:00:00.000Z'}}};
let selected=events.one;const app=createRoot(document.getElementById('root'));
window.renderRadar=name=>{selected=events[name];app.render(<RadarView event={selected}/>)};
window.unmountRadar=()=>app.render(<p>Unmounted</p>);
window.key=()=>radarSnapshotKey(selected);
window.inspectCache=()=>{const cached=readRadarSnapshot(selected);return {cacheGate:cached?.gate,ownedAdmissionCurrent:Boolean(cached&&readOperationalRadarAdmission(cached,radarSnapshotKey(selected),JSON.stringify(selected.canonical))),owner:manualGateAccountKey(getStoredUser())}};
window.signal=(key=radarSnapshotKey(selected),snapshot={gate:'FORGED'})=>window.dispatchEvent(new CustomEvent('crewcheck:radar-updated',{detail:{key,snapshot}}));
window.payload=(index,value,extra={})=>{const u=new URL(window.requests[index].url,location.origin);return {ok:true,configured:true,provider:'aerodatabox',flight:u.searchParams.get('flight'),origin:u.searchParams.get('origin'),destination:u.searchParams.get('destination'),scheduledDepartureUtc:u.searchParams.get('scheduledDepartureUtc'),sourceReceivedAt:Date.now(),gate:value,...extra}};
window.reply=(index,value,extra={})=>window.requests[index].resolve(new Response(JSON.stringify(window.payload(index,value,extra)),{status:200,headers:{'content-type':'application/json'}}));
window.cache=(value,extra={})=>saveRadarSnapshot(selected,{ok:true,configured:true,provider:'aerodatabox',flight:selected.flightNumber,origin:selected.origin,destination:selected.destination,scheduledDepartureUtc:selected.canonical.startDateTime,sourceReceivedAt:Date.now(),gate:value,...extra});
window.removeCache=()=>{localStorage.removeItem(radarSnapshotKey(selected));window.signal()};
window.fetchRadar=()=>{void fetchRadarSnapshot(selected,true).then(x=>window.lastAccepted=x)};
window.repeatSavedDuringSaver=()=>{window.saverSideEffect=()=>{window.saverSideEffect=null;const before=localStorage.getItem(window.key());saveRadarSnapshot(selected,JSON.parse(before));localStorage.setItem(window.key(),before);window.repeatedSameBytes=before===localStorage.getItem(window.key())}};
window.revise=version=>{setBrowserRadarContext(version);window.renderRadar('one')};
window.manual=()=>{gate.writeManualGate(localStorage,manualGateAccountKey(getStoredUser()),selected,{gate:'M1'},Date.now());window.signal()};
window.switchAccount=async name=>{window.dispatchEvent(new Event('crewcheck:auth-will-change'));if(name){localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:name,name:'Synthetic',email:name+'@example.invalid'}));localStorage.setItem('crewcheck_auth_token','synthetic-'+name)}else{localStorage.removeItem('crewcheck_auth_user');localStorage.removeItem('crewcheck_auth_token')}window.dispatchEvent(new Event(name?'crewcheck:auth-changed':'crewcheck:auth-expired'));if(name){await getMe();setOperationalRadarContext(name.toLowerCase(),'synthetic-publication-v1');setBrowserRadarContext('synthetic-publication-v1')}window.renderRadar('one')};
window.rotateToken=async()=>{window.dispatchEvent(new Event('crewcheck:auth-will-change'));localStorage.setItem('crewcheck_auth_token',getToken()+'-rotated');window.dispatchEvent(new Event('crewcheck:auth-changed'));await getMe();setBrowserRadarContext('synthetic-publication-v1');window.renderRadar('one')};
(async()=>{await getMe();setOperationalRadarContext('synthetic-a','synthetic-publication-v1');setBrowserRadarContext('synthetic-publication-v1');window.renderRadar('one')})().catch(e=>{throw e});`;
let server,browser;
try {
 await build({stdin:{contents:code,resolveDir:root,loader:'tsx'},bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:path.join(tmp,'app.js'),define:{'import.meta.env':'{}'}});
 server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?fs.readFileSync(path.join(tmp,'app.js')):'<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script src="/app.js"></script>')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const require=createRequire(process.env.RADAR_PLAYWRIGHT_PACKAGE||import.meta.url);
 browser=await require('playwright').chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
 const results=[];
 for(const timezoneId of ['UTC','America/Sao_Paulo','America/Los_Angeles']) {
  const ctx=await browser.newContext({timezoneId,viewport:{width:390,height:844},serviceWorkers:'block'});
  const errors=[];let providerRequests=0;
  await ctx.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname==='/api/auth/me'){const token=route.request().headers().authorization||'';const owner=token.includes('SYNTHETIC-B')?'SYNTHETIC-B':'SYNTHETIC-A';return route.fulfill({json:{ok:true,authenticated:true,user:{id:owner,name:'Synthetic',email:owner+'@example.invalid'},stayAlarmLease:{serverNow:0,sessionExpiresAt:300000}}})}if(url.pathname.startsWith('/api/')){providerRequests++;return route.abort()}return route.continue()});
  await ctx.addInitScript(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'SYNTHETIC-A',name:'Synthetic'}));localStorage.setItem('crewcheck_auth_token','synthetic-SYNTHETIC-A');const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);window.radarListeners=new Set();window.addEventListener=(name,fn,...args)=>{if(name==='crewcheck:radar-updated')window.radarListeners.add(fn);return add(name,fn,...args)};window.removeEventListener=(name,fn,...args)=>{if(name==='crewcheck:radar-updated')window.radarListeners.delete(fn);return remove(name,fn,...args)}});
  const page=await ctx.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2032-10-20T10:00:00Z')});await page.goto(origin);
  const gateLine=page.locator('.cz-radar-screen article').first().locator('strong').filter({hasText:/Portão:/});
  const gateIs=async value=>assert.match(await gateLine.innerText(),new RegExp('Portão: '+value+'(?: ·|$)'));
  const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const reply=async(index,gate,extra={})=>{await page.evaluate(({index,gate,extra})=>window.reply(index,gate,extra),{index,gate,extra});await settle()};
  const count=()=>page.evaluate(()=>window.requests.length);
  const start=async()=>{const n=await count();await page.evaluate(()=>window.fetchRadar());await page.waitForFunction(n=>window.requests.length===n+1,n);return n};
  const queryGate=async(gate,extra={})=>{const n=await start();await reply(n,gate,extra);return n};
  await page.waitForFunction(()=>window.requests?.length===1);await gateIs('Não confirmado');
  await reply(0,'12');await gateIs('12');
  await queryGate('14');await gateIs('14');assert.equal(await page.evaluate(()=>window.radarListeners.size),1);
  const beforeSignals=await count();
  await page.evaluate(()=>window.signal('other-occurrence',{gate:'FORGED'}));await settle();await gateIs('14');
  await page.evaluate(()=>{const detail={key:window.key()};Object.defineProperty(detail,'snapshot',{get(){throw new Error('forged snapshot accessed')}});window.dispatchEvent(new CustomEvent('crewcheck:radar-updated',{detail}))});await settle();await gateIs('14');
  assert.equal(await count(),beforeSignals,'cache signals cannot query');
  await page.evaluate(()=>window.repeatSavedDuringSaver());await queryGate('15');assert.equal(await page.evaluate(()=>window.repeatedSameBytes),true,'generic nested save must preserve bytes in this counterproof');await gateIs('Não confirmado');
  // Existing operational grant expires after five minutes. The SAME accepted
  // response remains visible at six minutes, without another response or query.
  await queryGate('26');const beforeSix=await count();
  await page.clock.fastForward(6*60*1000);await page.evaluate(()=>window.signal());await settle();
  const six=await page.evaluate(()=>window.inspectCache());assert.equal(six.cacheGate,'26');assert.equal(six.ownedAdmissionCurrent,false);await gateIs('26');assert.equal(await count(),beforeSix);
  console.log('SYNTHETIC six-minute accepted response '+JSON.stringify(six));
  await page.clock.fastForward(24*60*1000+10);await settle();await gateIs('Não confirmado');assert.equal(await count(),beforeSix,'source expiry only clears UI');
  await queryGate('16');await gateIs('16');
  const removedPending=await start();await page.evaluate(()=>window.removeCache());await settle();await gateIs('Não confirmado');await reply(removedPending,'OLD');await gateIs('Não confirmado');
  await page.evaluate(()=>window.cache('DISK'));await settle();await gateIs('Não confirmado');
  await page.evaluate(()=>window.signal());await settle();await gateIs('Não confirmado');
  for(const extra of [{flight:'LA9999'},{origin:'GRU'},{destination:'CNF'},{scheduledDepartureUtc:'2032-10-21T12:00:00.000Z'},{sourceReceivedAt:Date.parse('2032-10-20T08:00:00Z')},{operationalConflicts:['gate']},{gate:''}]) {
   await page.evaluate(()=>window.removeCache());await queryGate('INVALID',extra);await gateIs('Não confirmado');
  }
  await queryGate('18');await gateIs('18');await page.evaluate(()=>{window.lastAccepted.gate='MUTATED';window.signal()});await settle();await gateIs('Não confirmado');
  const stale=await start(),newer=await start();await reply(newer,'20');await gateIs('20');await reply(stale,'OLD');await gateIs('20');
  await page.evaluate(()=>window.manual());await settle();await gateIs('M1');
  await page.evaluate(()=>{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k.includes('manual'))localStorage.removeItem(k)}window.signal()});await settle();await gateIs('20');
  const pendingAccount=await start();await page.evaluate(()=>window.switchAccount('SYNTHETIC-B'));await settle();await gateIs('Não confirmado');assert.equal(await count(),pendingAccount+1,'account change never queries');await reply(pendingAccount,'A-LATE');await gateIs('Não confirmado');
  await page.evaluate(()=>window.switchAccount('SYNTHETIC-A'));await settle();await gateIs('Não confirmado');await page.evaluate(()=>window.signal());await gateIs('Não confirmado');
  await queryGate('22');await gateIs('22');
  const pendingToken=await start();await page.evaluate(()=>window.rotateToken());await settle();await gateIs('Não confirmado');await reply(pendingToken,'TOKEN-LATE');await gateIs('Não confirmado');
  await queryGate('24');await gateIs('24');
  const pendingUnmount=await start();await page.evaluate(()=>window.unmountRadar());await settle();await reply(pendingUnmount,'UNMOUNT-LATE');assert.equal(await page.evaluate(()=>window.inspectCache().cacheGate),'24');assert.equal(await page.evaluate(()=>window.radarListeners.size),0);
  const remountBefore=await count();await page.evaluate(()=>window.renderRadar('one'));await page.waitForFunction(n=>window.requests.length===n+1,remountBefore);await gateIs('24');assert.equal(await page.evaluate(()=>window.radarListeners.size),1);
  await reply(remountBefore,'24');
  const pendingRevision=await start();await page.evaluate(()=>window.revise('synthetic-publication-v2'));await settle();await gateIs('Não confirmado');await reply(pendingRevision,'REVISION-LATE');await gateIs('Não confirmado');
  // Revised context does not itself mint a response from the old disk cache.
  await page.evaluate(()=>window.signal());await settle();await gateIs('Não confirmado');
  const revisionRequests=await count();if(revisionRequests>pendingRevision+1){await reply(revisionRequests-1,'SIGNAL-REVOKED');await gateIs('Não confirmado')}await queryGate('NEW-REVISION');await gateIs('NEW-REVISION');
  const beforeOtherDay=await count();await page.evaluate(()=>window.renderRadar('two'));await settle();await gateIs('Não confirmado');assert.equal(await count(),beforeOtherDay,'no query on flight eve');
  await page.evaluate(()=>window.renderRadar('one'));await page.waitForFunction(n=>window.requests.length===n+1,beforeOtherDay);await reply(beforeOtherDay,'28');await gateIs('28');
  await page.evaluate(()=>window.switchAccount(null));await settle();await gateIs('Não confirmado');const logoutCount=await count();await page.evaluate(()=>window.signal());await settle();await gateIs('Não confirmado');assert.equal(await count(),logoutCount);
  // Reload keeps legacy disk, but loses the private registry. No gate until a
  // newly accepted authenticated response; disk bytes alone cannot reconstruct it.
  await page.reload();await page.waitForFunction(()=>window.requests?.length===1);await gateIs('Não confirmado');await reply(0,'30');await gateIs('30');
  assert.deepEqual(errors,[]);assert.equal(providerRequests,0);results.push({timezoneId,cache12to14:true,sixMinuteContinuity:true,sourceExpiry:true,accountIsolation:true,staleFences:true,realProviderRequests:0});await ctx.close();
 }
 console.log('PASS actual RadarView cache refresh '+JSON.stringify(results));
} finally {await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true})}
