// Real prepared Home saver/cache/pulse and card. Synthetic responses only; all external origins aborted.
// Optional local browser adapter: PLAYWRIGHT_CHROMIUM_EXECUTABLE; CI uses its installed Playwright Chromium.
import assert from 'node:assert/strict';import fs from 'node:fs';import http from 'node:http';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';import ts from 'typescript';import {build} from 'esbuild';
const root=process.cwd(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gate-pulse-browser-')),source=fs.readFileSync('client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',source,99,true,ts.ScriptKind.TSX);
const names=['nextRealFlight','validatedRadarForEvent','radarSnapshotKey','radarEventOperationalDate','radarSnapshotMatchesEvent','readRadarSnapshot','confirmedRadarGate','saveRadarSnapshot','fetchRadarSnapshot','useOperationalRadarPulse'];
const functions=names.map(name=>{const n=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(n,name);return n.getText(ast)}).join('\n');
const code=`import {beginOperationalRadarRead,retainOperationalRadarResponse,originalOperationalRadarSnapshot,readOperationalRadarAdmission} from '@/lib/operationalRadarAdmission';import React,{useEffect} from 'react';import {createRoot} from 'react-dom/client';import {getStoredUser,getToken,authFetch} from '@/lib/authClient';import * as gate from '@/lib/nextFlightGate';import {gateQueryDay,gateQuerySuppressed,originFlightDate,radarResultDecision,radarSourceEpoch} from './shared/gate-query-day.mjs';import {radarFailurePayload} from '@/lib/radarAvailability';import {buildCanonicalRosterEvents,selectNextRosterEvent} from '@/lib/canonicalRoster';import {NextFlightGateCard} from '@/components/nextflight/NextFlightGateCard';import {manualGateNoticeIdentity,manualGateNoticeScope,claimManualGateNotice} from '@/lib/manualGateNotices';import {ManualGateEditor} from '@/components/nextflight/ManualGateEditor';
const {canonicalFlightId,retainLatestGateEvidence,nextGateUpdateWatermark,RADAR_GATE_STALE_MS,manualGateAccountKey,manualGateIdentity,readManualGate,resolveNextFlightGate,radarSnapshotStorageKey,selectNextFlight,flightOperationalDate,gateChangeAlertAllowed}=gate;
const nextFlight=()=>null;const storage={get:(k,d)=>localStorage.getItem(k)||d,set:(k,v)=>localStorage.setItem(k,v)},RADAR_CARD_CACHE_TTL_MS=21600000,RADAR_CARD_REFRESH_MS=300000,radarQuerySerial=new Map();const telegramConciergeIdentity=()=>({email:'synthetic@example.invalid',name:'Synthetic',conciergeKey:''}),publishCrewCheckNotice=(value)=>window.__notices.push(value),publishCrewCheckPulse=(value)=>window.__alerts.push(value),reconcileCrewCheckPulse=()=>{},eventStartDateTime=e=>new Date(e.canonical.startDateTime);
${functions}
window.__gateSettled=0;const fetchImpl=fetchRadarSnapshot;fetchRadarSnapshot=async(...args)=>{try{const result=await fetchImpl(...args);window.__lastRadar=result;return result}finally{window.__gateSettled++}};
const roster={year:2032,month:10,base:'BSB',days:[{date:'20/10/2032',type:'VOO',legs:[{flightNumber:'LA4001',origin:'BSB',destination:'CGH',departureTime:'05:00',arrivalTime:'06:45'},{flightNumber:'LA4002',origin:'CGH',destination:'CNF',departureTime:'07:30',arrivalTime:'08:45'}]}]};const events=buildCanonicalRosterEvents(roster).filter(e=>e.kind==='flight').map(c=>({...c,canonical:c,date:new Date(c.startDateTime)}));window.__saveReported=value=>saveRadarSnapshot(events[1],{...window.__lastRadar,gate:value});window.__decision=()=>resolveNextFlightGate({event:events[1],radar:readRadarSnapshot(events[1])});function Harness(){useOperationalRadarPulse(events);return <><NextFlightGateCard events={events}/><ManualGateEditor event={selectNextFlight(events)}/></>}createRoot(document.getElementById('root')).render(<Harness/>);`;
await build({stdin:{contents:code,loader:'tsx',resolveDir:root},bundle:true,format:'iife',platform:'browser',jsx:'automatic',outfile:path.join(tmp,'app.js'),define:{'import.meta.env':'{}'}});
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?fs.readFileSync(path.join(tmp,'app.js')):'<div id="root"></div><script src="/app.js"></script>')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,require=createRequire(process.env.GATE_PLAYWRIGHT_PACKAGE||import.meta.url),browser=await require('playwright').chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
try {
 for(const timezoneId of ['UTC','America/Sao_Paulo','Pacific/Auckland']) {
  const ctx=await browser.newContext({timezoneId,serviceWorkers:'block'});let offline=false,fulfilled=0,blocked=0;
  await ctx.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();
   if(u.pathname==='/api/radar-flight'){if(offline){blocked++;return route.abort();}fulfilled++;return route.fulfill({json:{ok:true,configured:true,provider:'aerodatabox',flight:u.searchParams.get('flight'),origin:u.searchParams.get('origin'),destination:u.searchParams.get('destination'),scheduledDepartureUtc:u.searchParams.get('scheduledDepartureUtc'),sourceReceivedAt:Date.parse('2032-10-20T08:42:00Z'),gate:'12',status:'Programado'}});}
   return route.continue();
  });
  await ctx.addInitScript(()=>{
   localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'SYNTHETIC-A',email:'synthetic@example.invalid'}));localStorage.setItem('crewcheck_auth_token','synthetic-offline-token');
   const NativeDate=Date;window.__now=Number(localStorage.getItem('synthetic-clock'))||NativeDate.parse('2032-10-20T08:42:00Z');window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[window.__now]))}static now(){return window.__now}};window.__notices=[];window.__alerts=[];
  });
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  const card=page.getByRole('region',{name:'Próximo voo',exact:true});await card.locator('.cc-next-gate-gate b').getByText('12',{exact:true}).waitFor();
  await card.getByText(/Portão informado por AeroDataBox · a confirmar/).waitFor();
  const initial=await page.evaluate(()=>window.__decision());assert.equal(initial.gateSource,'reported');assert.equal(initial.usesRadar,false);assert.equal(initial.automaticFieldValidUntilEpochMs.gate,Date.parse('2032-10-20T09:12:00Z'));
  await page.evaluate(()=>{window.__now+=4*60000;window.__saveReported('14');});await card.locator('.cc-next-gate-gate b').getByText('14',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>[window.__notices.length,window.__alerts.length]),[0,0]);
  const responsesBeforeOffline=fulfilled;offline=true;
  await page.evaluate(()=>localStorage.setItem('synthetic-clock',String(Date.parse('2032-10-20T09:11:00Z'))));await page.reload();await card.locator('.cc-next-gate-gate b').getByText('14',{exact:true}).waitFor();
  await page.waitForFunction(()=>window.__gateSettled>0);assert.equal(fulfilled,responsesBeforeOffline,'offline reload receives no source response');assert(blocked>0);
  assert.equal((await page.evaluate(()=>window.__decision())).automaticFieldValidUntilEpochMs.gate,Date.parse('2032-10-20T09:12:00Z'),'offline cache-only reload cannot renew TTL');
  await page.evaluate(()=>localStorage.setItem('synthetic-clock',String(Date.parse('2032-10-20T09:13:00Z'))));await page.reload();await page.waitForFunction(()=>window.__gateSettled>0);
  const expired=await page.evaluate(()=>window.__decision());assert.notEqual(expired.gateSource,'reported');assert.equal(expired.gate,'');
  await card.locator('.cc-next-gate-gate b').getByText(/^(12|14)$/).waitFor({state:'hidden'});
  assert.equal(await card.locator('.cc-next-gate-gate b').getByText(/^(12|14)$/).count(),0,'expired portão12/14 absent from card DOM');
  assert.equal(fulfilled,responsesBeforeOffline,'expired offline reload receives no source response');
  assert.deepEqual(await page.evaluate(()=>[window.__notices.length,window.__alerts.length]),[0,0]);assert.deepEqual(errors,[]);
  console.log('PASS browser reported/no alert/Pulse/original TTL/offline cache-only reload/expired DOM',timezoneId);await ctx.close();
 }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(tmp,{recursive:true,force:true});}
