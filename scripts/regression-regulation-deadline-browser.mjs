import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {createRequire} from 'node:module';import {build} from 'esbuild';
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'regulation-deadline-browser-'));const evidence=process.env.REGULATION_DEADLINE_EVIDENCE||'/tmp/crewcheck-regulation-deadline-evidence-20261020';fs.mkdirSync(evidence,{recursive:true});
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {DetailedRegulationScenarioView as View} from ${JSON.stringify(path.resolve('client/src/components/regulation/RegulationScenarioView.tsx'))};
const day={date:'15/04/2033',type:'VOO',base:'BSB',dutyReport:'08:15',dutyReportSource:'published',dutyDebrief:'13:00',dutyDebriefSource:'published',legs:[{flightNumber:'QA1001',origin:'BSB',destination:'GRU',departureTime:'09:00',arrivalTime:'10:30',presentationTime:'08:15',workType:'OP'},{flightNumber:'QA1002',origin:'GRU',destination:'BSB',departureTime:'11:00',arrivalTime:'12:30',workType:'OP'}]};
createRoot(document.getElementById('root')).render(<View scheduleDay={day} compliance={{legalProfile:{role:'cabin'}}}/>);`;
let server,browser;
try{
 await build({stdin:{contents:entry,loader:'jsx',resolveDir:process.cwd()},bundle:true,jsx:'automatic',format:'iife',outfile:path.join(dir,'app.js'),alias:{'@':path.resolve('client/src'),'@shared':path.resolve('shared')},logLevel:'silent'});
 server=http.createServer((req,res)=>{const f=req.url==='/app.js'?'app.js':req.url==='/app.css'?'app.css':null;res.setHeader('content-type',f?.endsWith('.js')?'text/javascript':f?'text/css':'text/html');res.end(f?fs.readFileSync(path.join(dir,f)):'<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body style="background:#091522;margin:16px"><div id="root"></div><script src="/app.js"></script></body></html>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 for(const timezoneId of ['UTC','America/Sao_Paulo','Asia/Tokyo']){
  const context=await browser.newContext({timezoneId,viewport:{width:390,height:844},serviceWorkers:'block'});let external=0;const errors=[];
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():(external++,route.abort()));
  await context.addInitScript(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-A',email:'a@example.invalid',role:'user'}));localStorage.setItem('crewcheck_auth_token','offline-only');});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  const result=page.getByRole('region',{name:'Resultado temporal'});assert.match(await result.innerText(),/Falta confirmar/);assert.doesNotMatch(await result.innerText(),/min de margem/);
  assert.equal(await page.getByText('Como foi calculado',{exact:true}).evaluate(el=>el.parentElement.open),false);
  await page.getByRole('button',{name:'Confirmar dados do limite'}).click();
  await page.getByLabel('Deslocamento UTC',{exact:true}).fill('-03:00');await page.getByLabel('Regime aplicável',{exact:true}).selectOption('rbac117-b1');await page.getByLabel('Composição da tripulação',{exact:true}).selectOption('simple');await page.getByLabel('Condição de aclimatação',{exact:true}).selectOption('acclimatized');
  await page.getByLabel('Confirmei apresentação e etapas',{exact:true}).check();await page.getByLabel('Confirmei a hora de referência aclimatada',{exact:true}).check();await page.getByLabel('Confirmei o fuso dos horários publicados',{exact:true}).check();await page.getByLabel('Tarefas posteriores em minutos',{exact:true}).fill('0');await page.getByRole('button',{name:'Usar referência B.1 do motor'}).click();await page.getByLabel('Revisei a referência do limite normal',{exact:true}).check();
  await page.getByLabel('Encerramento programado da jornada',{exact:true}).fill('2033-04-15T13:00');const before=await result.innerText();assert.match(before,/21:15/);assert.match(before,/20:45/);const margin=Number(before.match(/(\d+) min de margem/)[1]);
  await page.getByRole('button',{name:'+30 min',exact:true}).click();const after=await result.innerText();assert.match(after,/21:15/);assert.match(after,/20:45/);assert.match(after,new RegExp((margin-30)+' min de margem'));
  await page.getByLabel('Atraso previsto em minutos',{exact:true}).fill('999');assert.match(await result.innerText(),/Excede a referência/);
  await page.getByRole('button',{name:'Sem atraso',exact:true}).click();await page.getByLabel('Tipo de alteração da jornada',{exact:true}).selectOption('presentation-change');assert.match(await result.innerText(),/Falta confirmar/);assert.doesNotMatch(await result.innerText(),/21:15|20:45/);
  await page.getByLabel('Tipo de alteração da jornada',{exact:true}).selectOption('flight-delay');await page.getByLabel('Revisei a referência do limite normal',{exact:true}).check();
  await page.locator('details').filter({has:page.getByText('Hipótese excepcional de extensão',{exact:true})}).getByText('Hipótese excepcional de extensão',{exact:true}).click();await page.getByRole('switch',{name:'Simular extensão de 1 hora'}).check();assert.match(await result.innerText(),new RegExp(margin+' min de margem'));assert.match(await result.innerText(),/21:15|20:45/);
  await page.getByLabel('Tarefas posteriores em minutos',{exact:true}).fill('');assert.equal(await result.locator('.cc-reg-deadlines>div').nth(1).locator('strong').innerText(),'—');
  await page.getByLabel('Tarefas posteriores em minutos',{exact:true}).fill('0');await page.locator('details[open]').evaluateAll(els=>els.forEach(el=>el.open=false));await page.evaluate(()=>window.scrollTo(0,0));
  if(timezoneId==='UTC')await page.screenshot({path:path.join(evidence,'synthetic-mobile-reviewed.png'),fullPage:true});
  await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-B',email:'b@example.invalid',role:'user'}));window.dispatchEvent(new Event('crewcheck:auth-changed'));});assert.doesNotMatch(await result.innerText(),/21:15|20:45|2033-04-15/);
  assert.equal(external,0);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS actual regulation UI: two deadlines, hidden details, delay recalculation, missing inputs, no automatic extension, presentation-change block, account reset, three zones, zero external requests.');
}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
