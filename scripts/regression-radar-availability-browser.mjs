import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {build} from 'esbuild';
const text=fs.readFileSync('client/src/pages/Home.tsx','utf8'),ast=ts.createSourceFile('Home.tsx',text,99,true,ts.ScriptKind.TSX);
const names=['RadarView','radarGateInfo','validatedRadarForEvent','radarFlightDateLabel'];const functions=names.map(name=>{const n=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(n,name);return n.getText(ast)}).join('\n');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-radar-ui-'));
const code=`import React,{useState,useEffect,useRef} from 'react';import {createRoot} from 'react-dom/client';import {Plane,ShieldCheck,Radar,Globe2,CloudSun} from 'lucide-react';
import {getToken,getStoredUser} from '@/lib/authClient';import {manualGateAccountKey,readManualGate,resolveNextFlightGate,RADAR_GATE_STALE_MS} from '@/lib/nextFlightGate';import {gateQueryDay,originFlightDate,publishedGateDate,radarResultDecision} from './shared/gate-query-day.mjs';import {radarFailurePayload,radarAvailabilityLabel} from '@/lib/radarAvailability';
const safe=(x,f='')=>x||f,normalizedAirlineCode=()=> 'LA',airlineNameFor=()=> 'LATAM',Brand=()=>null,AirlineLogo=()=>null,ManualGateEditor=()=>null,readRadarSnapshot=()=>null;
window.requests=[];function fetchRadarSnapshot(event){return new Promise(resolve=>window.requests.push({event,resolve}))}
${functions}
const root=createRoot(document.getElementById('root'));const event=id=>({id,kind:'flight',flightNumber:id==='one'?'LA3981':'LA3982',origin:'CPV',destination:'GRU',day:{date:'14/10/2032'},canonical:{startDateTime:'2032-10-14T12:00:00Z'}});
window.renderRadar=id=>root.render(<RadarView event={event(id)}/>);window.unmountRadar=()=>root.render(<p>Unmounted</p>);window.reply=(i,status,reason,message)=>window.requests[i].resolve(message?{ok:false,querySuppressed:true,queryReason:reason,message}:radarFailurePayload({status,payload:{ok:false,querySuppressed:true,queryReason:reason,gate:'DO-NOT-DISPLAY'}}));window.renderRadar('one');`;
await build({stdin:{contents:code,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:path.join(tmp,'app.js'),define:{'import.meta.env':'{}'}});
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?fs.readFileSync(path.join(tmp,'app.js')):'<div id="root"></div><script src="/app.js"></script>')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const require=createRequire(process.env.RADAR_PLAYWRIGHT_PACKAGE||import.meta.url),browser=await require('playwright').chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
try{
 const context=await browser.newContext({serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await context.addInitScript(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A'}));localStorage.setItem('crewcheck_auth_token','synthetic-A');const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2032-10-14T12:00:00Z']))}static now(){return NativeDate.parse('2032-10-14T12:00:00Z')}}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.waitForFunction(()=>window.requests.length===1);
 await page.evaluate(()=>window.reply(0,200,'origin-timezone-unverified'));await page.getByText('O fuso do aeroporto de origem ainda não foi confirmado.',{exact:true}).waitFor();await page.getByText('Consulta suspensa',{exact:true}).waitFor();assert.equal(await page.getByText('DO-NOT-DISPLAY').count(),0);
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const refresh=page.getByRole('button',{name:'Atualizar e exportar ao card',exact:true});await refresh.click();await page.waitForFunction(()=>window.requests.length===2);await page.evaluate(()=>window.renderRadar('two'));await page.waitForFunction(()=>window.requests.length===3);
 await page.evaluate(()=>window.reply(1,200,'old','OLD EVENT MUST NOT RENDER'));await settle();assert.equal(await page.getByText('OLD EVENT MUST NOT RENDER').count(),0);assert(await refresh.isDisabled(),'old event response cannot finish newer loading state');await page.evaluate(()=>window.reply(2,503));await page.getByText('Serviço indisponível',{exact:true}).waitFor();assert.equal(await refresh.isDisabled(),false);
 await refresh.click();await page.waitForFunction(()=>window.requests.length===4);await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'B'}));localStorage.setItem('crewcheck_auth_token','synthetic-B');window.renderRadar('two')});await page.waitForFunction(()=>window.requests.length===5);await page.evaluate(()=>window.reply(3,200,'old','OLD ACCOUNT MUST NOT RENDER'));await settle();assert.equal(await page.getByText('OLD ACCOUNT MUST NOT RENDER').count(),0);assert(await refresh.isDisabled());await page.evaluate(()=>window.reply(4,403));await page.getByText('Acesso indisponível',{exact:true}).waitFor();
 await refresh.click();await page.waitForFunction(()=>window.requests.length===6);await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_token','synthetic-B-rotated');window.renderRadar('two')});await page.waitForFunction(()=>window.requests.length===7);await page.evaluate(()=>window.reply(5,200,'old','OLD TOKEN MUST NOT RENDER'));await settle();assert.equal(await page.getByText('OLD TOKEN MUST NOT RENDER').count(),0);assert(await refresh.isDisabled());await page.evaluate(()=>window.reply(6,200,'occurrence-unverified'));await page.getByText('O voo ainda não foi vinculado à programação publicada desta conta.',{exact:true}).waitFor();
 await refresh.click();await page.waitForFunction(()=>window.requests.length===8);await page.evaluate(()=>window.unmountRadar());await page.evaluate(()=>window.reply(7,200,'old','UNMOUNTED MUST NOT RENDER'));await settle();await page.getByText('Unmounted',{exact:true}).waitFor();assert.equal(await page.getByText('UNMOUNTED MUST NOT RENDER').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS actual RadarView React: explicit suppression/backend/access reasons, no negative gate, late event/account/token/unmount fences and loading serial; network local-only');
}finally{await browser.close();await new Promise(r=>server.close(r));fs.rmSync(tmp,{recursive:true,force:true})}
