import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
assert.match(fs.readFileSync('client/src/components/notifications/NotificationCenter.tsx','utf8'),/<OperationalBriefing\/>/);
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{OperationalBriefing}from'./client/src/components/notifications/OperationalBriefing';createRoot(document.getElementById('root')).render(<OperationalBriefing/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',write:false,jsx:'automatic',plugins:[{name:'aliases',setup(b){b.onResolve({filter:/^@\//},({path:name})=>({path:path.resolve('client/src',name.slice(2)+'.ts')}));}}]});
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/fixture.js"></script>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
let browser,disabled=false,missing=false;const writes=[],errors=[];
const saved={enabled:false,recorded:false,revision:0,preferences:null};
try{
 browser=await chromium.launch({args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:360,height:740},timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
 await context.addInitScript(()=>{localStorage.setItem('crewcheck_auth_token','synthetic-A');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-A'}));});
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();assert.equal(url.pathname,'/api/notifications/operational-briefing');
 if(disabled)return route.fulfill({status:503,json:{ok:false,code:'BRIEFING_DISABLED'}});
 if(req.method()==='POST'){const input=req.postDataJSON();assert.equal(input.expectedRevision,saved.revision);assert(input.enabled===false||input.confirmed===true);writes.push(input);Object.assign(saved,{enabled:input.enabled,recorded:input.enabled,revision:saved.revision+1,preferences:input.enabled?input.preferences:null});return route.fulfill({json:{ok:true,revision:saved.revision,inFlight:false}});}
 return route.fulfill({json:{ok:true,previewAvailable:!missing,telegramLinked:!missing,scheduledAt:null,consent:{...saved,enabled:!missing&&saved.enabled},message:missing?'Importe e ative sua escala.':'Prévia da escala ativa.',...(!missing?{briefing:{validUntil:'2099-10-06T07:00:00Z',sourceLabel:'Escala ativa importada.',duty:{presentationAt:'2099-10-06T08:30:00Z',plannedEndAt:'2099-10-06T13:00:00Z',endKind:'duty-debrief',legs:[{flight:'LA1234',origin:'GRU',destination:'BSB',departureAt:'2099-10-06T09:30:00Z',arrivalAt:'2099-10-06T11:30:00Z'}]}}}:{})}});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.getByRole('heading',{name:'Próxima jornada'}).waitFor();assert.equal(writes.length,0);
 const save=page.getByRole('button',{name:'Salvar e autorizar aviso'});assert(await save.isDisabled());await page.getByLabel('Quando avisar').selectOption('lead');await page.getByLabel(/Minutos antes/).fill('120');assert.equal(writes.length,0);await page.getByRole('checkbox').check();await save.click();await page.getByRole('status').filter({hasText:'Sua escolha de horário foi salva'}).waitFor();assert.equal(writes.length,1);assert.equal(writes[0].preferences.leadMinutes,120);
 await page.reload();await page.getByLabel(/Minutos antes/).waitFor();assert.equal(await page.getByLabel(/Minutos antes/).inputValue(),'120');assert(await save.isDisabled());assert.equal(writes.length,1);
 await page.getByLabel('Quando avisar').selectOption('custom');await page.getByLabel(/Data e hora com fuso/).fill('2099-10-06T04:00');await page.getByRole('checkbox').check();await save.click();await page.getByRole('status').filter({hasText:'Sua escolha de horário foi salva'}).waitFor();assert.equal(writes[1].preferences.customAt,'2099-10-06T07:00:00.000Z');assert.equal(writes[1].expectedRevision,1);
 missing=true;await page.reload();await page.getByText('Importe e ative sua escala.',{exact:true}).waitFor();await page.getByRole('button',{name:'Desligar aviso pelo Telegram'}).click();await page.getByRole('status').filter({hasText:'Aviso pelo Telegram desligado.'}).waitFor();assert.equal(writes[2].enabled,false);assert.equal(writes[2].expectedRevision,2);
 disabled=true;await page.reload();await page.getByRole('status').filter({hasText:'Nenhum aviso foi ativado.'}).waitFor();assert.equal(await save.count(),0);assert.equal(writes.length,3);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'PASS',syntheticWrites:writes.length,externalCalls:0,physicalDelivery:false,cases:['explicit choice','lead time','reload revision','custom device timezone','revoke without link/source','OFF']}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
