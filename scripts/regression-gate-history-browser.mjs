import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const pwRequire=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url);
const {chromium}=pwRequire('playwright');
// Behavioral DOM contract only. This shell intentionally has no stylesheet or
// font request; it cannot satisfy the separate real-Inter visual/layout gate.
const compiled=await build({stdin:{contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {GateHistoryPanel} from './client/src/components/nextflight/GateHistoryPanel';
 import {clearSession} from './client/src/lib/authClient';
 const root=createRoot(document.getElementById('root'));
 window.account=owner=>{window.dispatchEvent(new Event('crewcheck:auth-will-change'));localStorage.setItem('crewcheck_auth_token','synthetic-'+owner);localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:owner}));window.dispatchEvent(new Event('crewcheck:auth-changed'));};
 window.logout=clearSession;
 const event=iso=>({id:'synthetic-'+iso,flightNumber:'LA4774',origin:'BSB',destination:'AJU',canonical:{startDateTime:iso}});
 window.select=iso=>root.render(<GateHistoryPanel event={event(iso)} enabled={true}/>);
 window.shipping=iso=>root.render(<GateHistoryPanel event={event(iso)}/>);
 window.shipping('2099-10-31T15:00:00.000Z');
 `,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',alias:{'@':process.cwd()+'/client/src'},define:{'process.env.NODE_ENV':'"test"'}});
const html='<!doctype html><div id="root"></div><script>'+compiled.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script>';
const identity={flight:'LA4774',origin:'BSB',destination:'AJU',departureDate:'2099-10-31',scheduledDepartureUtc:'2099-10-31T15:00:00.000Z'};
const origin='http://127.0.0.1:39283';let browser;
const requests=[],errors=[];let unexpected=0,mode='normal',hold,releaseHeld;
function history(query,token){
 const cursor=Number(query.get('cursor')),legacy=mode==='legacy'||query.get('legacy')==='1';
 const selected=Object.fromEntries(Object.keys(identity).map(k=>[k,query.get(k)]));
 const total=101,rows=cursor===0?100:1;
 return {kind:'historical-gate-records',currentConfirmation:false,order:'recorded-sequence',identity:mode==='mismatch'?{...selected,departureDate:'2099-10-30'}:selected,cursor,nextCursor:cursor===0?1:null,total,...(legacy?{legacy:true}:{}),observations:Array.from({length:rows},(_,i)=>({gate:token==='Bearer synthetic-B'?'77':cursor===0?'18':'19',provider:i%2?'cirium-flex':'flightaware',sourceUpdatedAt:i===0?null:'2099-10-31T11:55:00.000Z',observedAt:null,receivedAt:'2099-10-31T12:00:00.000Z',sequence:cursor*100+i+1,conflicted:legacy?null:i===0,outOfOrder:i===0}))};
}
try{
 browser=await chromium.launch({headless:true,...(process.env.CREWCHECK_CHROMIUM_EXECUTABLE?{executablePath:process.env.CREWCHECK_CHROMIUM_EXECUTABLE}:{})});
 const context=await browser.newContext({timezoneId:process.env.TZ||'UTC',serviceWorkers:'block'});
 await context.addInitScript(()=>{if(!localStorage.getItem('crewcheck_auth_token')){localStorage.setItem('crewcheck_auth_token','synthetic-A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'A'}));}});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.isNavigationRequest()&&url.origin===origin)return route.fulfill({status:200,contentType:'text/html',body:html});
  if(url.origin!==origin||url.pathname!=='/api/radar-history'){unexpected++;return route.abort();}
  assert.equal(req.method(),'GET');assert.equal(req.postData(),null);
  const token=req.headers().authorization;assert.ok(['Bearer synthetic-A','Bearer synthetic-B'].includes(token));
  for(const k of ['flight','origin','destination'])assert.equal(url.searchParams.get(k),identity[k]);
  assert.equal(url.searchParams.get('scheduledDepartureUtc')?.slice(0,10),url.searchParams.get('departureDate'));
  requests.push({token,cursor:url.searchParams.get('cursor'),legacy:url.searchParams.get('legacy'),date:url.searchParams.get('departureDate')});
  const body={ok:true,history:mode==='empty'?null:history(url.searchParams,token)};
  if(mode==='hold'){const notify=hold;await new Promise(resolve=>{releaseHeld=async()=>{await route.fulfill({json:body});resolve();};notify();});return;}
  if(mode==='unavailable')return route.fulfill({status:503,json:{ok:false,code:'GATE_HISTORY_DISABLED'}});
  return route.fulfill({json:body});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
 const panel=page.getByRole('region',{name:'Histórico de portões'}),read=()=>panel.getByRole('button',{name:'Consultar histórico salvo',exact:true}).click();
 // Shipping default: OFF renders no region/button and starts no request, even after an auth change.
 await page.waitForFunction(()=>document.getElementById('root').childElementCount===0);assert.equal(await panel.count(),0);
 await page.evaluate(()=>window.account('A'));assert.equal(await panel.count(),0);assert.equal(requests.length,0);
 await page.evaluate(()=>window.select('2099-10-31T15:00:00.000Z'));
 await panel.getByRole('heading',{name:'Histórico de portões'}).waitFor();assert.equal(requests.length,0);
 await read();await panel.locator('li').nth(99).waitFor();assert.equal(await panel.locator('li').count(),100);
 assert.match(await panel.innerText(),/não confirmam portão atual/);
 const first=await panel.locator('li').first().innerText();assert.match(first,/Portão 18/);assert.match(first,/flightaware/);assert.match(first,/Atualização na fonte: Não fornecido/);assert.match(first,/Recebido:.*31\/10\/2099.*12:00:00.*UTC/);assert.match(first,/Registros em conflito/);assert.match(first,/fora de ordem temporal/);
 await panel.getByRole('button',{name:'Próximos registros'}).click();await panel.getByText('Portão 19',{exact:true}).waitFor();assert.equal(await panel.locator('li').count(),1);assert.equal(await panel.locator('ol').getAttribute('start'),'101');assert.equal(requests.at(-1).cursor,'1');
 await panel.getByRole('button',{name:'Registros anteriores',exact:true}).click();await panel.locator('li').nth(99).waitFor();assert.equal(requests.at(-1).cursor,'0');
 mode='unavailable';await read();await panel.getByRole('status').waitFor();assert.match(await panel.innerText(),/indisponível.*não significa ausência/);assert.equal(await panel.locator('li').count(),0);assert.doesNotMatch(await panel.innerText(),/Nenhum registro encontrado/);
 mode='empty';await read();await panel.getByText(/Nenhum registro encontrado/).waitFor();assert.match(await panel.innerText(),/não confirma portão atual/);
 mode='mismatch';await read();try{await panel.getByText('Histórico sem ocorrência confirmada.').waitFor();}catch(error){throw new Error('HISTORY_OCCURRENCE_REJECT: wrong occurrence must be rejected',{cause:error});}assert.equal(await panel.locator('li').count(),0);
 mode='legacy';await read();await panel.locator('li').nth(99).waitFor();assert.match(await panel.innerText(),/conflitos do arquivo anterior não indexados/);
 await panel.getByRole('button',{name:'Próximos registros'}).click();await panel.getByText('Portão 19',{exact:true}).waitFor();assert.equal(requests.at(-1).legacy,'1');
 mode='hold';let started=new Promise(resolve=>{hold=resolve;});await read();await started;const before=requests.length;
 await page.evaluate(()=>window.account('B'));await releaseHeld();await page.waitForFunction(()=>!document.body.textContent.includes('Consultando…'));
 assert.equal(await panel.locator('li').count(),0);assert.equal(requests.length,before,'A late read must not start a B request');
 mode='normal';await read();await panel.locator('li').nth(99).waitFor();assert.match(await panel.locator('li').first().innerText(),/Portão 77/);assert.equal(requests.at(-1).token,'Bearer synthetic-B');
 await page.reload();await page.evaluate(()=>window.select('2099-10-31T15:00:00.000Z'));await panel.getByRole('heading',{name:'Histórico de portões'}).waitFor();assert.equal(requests.length,before+1,'Reload must not fetch history implicitly');
 await read();await panel.locator('li').nth(99).waitFor();assert.equal(requests.at(-1).token,'Bearer synthetic-B','Init script must preserve B on reload');
 mode='hold';started=new Promise(resolve=>{hold=resolve;});await read();await started;const oldOccurrenceCount=requests.length;
 await page.evaluate(()=>window.select('2099-11-01T15:00:00.000Z'));await releaseHeld();await page.waitForFunction(()=>!document.body.textContent.includes('Consultando…'));
 assert.equal(await panel.locator('li').count(),0);assert.equal(requests.length,oldOccurrenceCount);assert.match(await panel.innerText(),/2099-11-01/);
 mode='normal';await read();await panel.locator('li').nth(99).waitFor();assert.equal(requests.at(-1).date,'2099-11-01');
 await page.evaluate(()=>window.logout());try{await page.waitForFunction(()=>document.querySelectorAll('li').length===0);}catch(error){throw new Error('HISTORY_ACCOUNT_CLEAR: history must disappear on logout',{cause:error});}const beforeLogoutRead=requests.length;
 await read();await panel.getByText('Faça login para consultar o histórico.').waitFor();assert.equal(requests.length,beforeLogoutRead);
 assert.equal(unexpected,0);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'PASS',contract:'actual GateHistoryPanel + client + session fence in browser',timezone:process.env.TZ||'UTC',browser:await browser.version(),playwright:pwRequire('playwright/package.json').version,requests:requests.length,externalCalls:0,implicitFetch:false,coverage:['shipping OFF renders nothing','100+1 pagination','UTC clocks/missing source update','conflict/out-of-order labels','unavailable != empty','wrong occurrence refused','legacy paging','late A under B','reload preserves B','month change drops late response','logout'],visualGate:false,realInterValidated:false}));
}finally{await browser?.close();}
