import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Control from './client/src/components/finance/FinancialActApplicability';import * as journal from './client/src/lib/financialActApplicability';window.journal=journal;createRoot(document.getElementById('root')).render(<Control pending={[{iso:'2026-11-04',actCause:'act_missing'}]}/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'/tmp/synthetic-act-read.js',format:'iife',jsx:'automatic'});
const html='<meta name="viewport" content="width=device-width"><div id="root"></div><script>'+bundle.outputFiles.find(file=>file.path.endsWith('.js')).text.replaceAll('</script','<\\/script')+'</script>';
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  localStorage.setItem('crewcheck_language','pt');localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-read-a',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-token');
  const key='crewcheck_financial_act_applicability_v1:synthetic-read-a';
  localStorage.setItem(key,JSON.stringify({schema:1,ownerId:'synthetic-read-a',revision:1,events:[{revision:1,from:'2026-11-01',through:'2026-11-30',confirmed:true,source:'owner_financial_confirmation',active:true,employer:'TAM_LINHAS_AEREAS_SA',role:'cabin',coverage:'clause_1_2_included'}]}));
  window.originalDeclaration=localStorage.getItem(key);window.failRead=true;window.writes=0;window.recalculations=0;
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  Storage.prototype.getItem=function(k){if(k===key&&window.failRead)throw Error('synthetic storage read unavailable');return get.call(this,k);};
  Storage.prototype.setItem=function(k,v){window.writes++;return set.call(this,k,v);};
  window.addEventListener('crewcheck:financial-config-changed',()=>window.recalculations++);
 });
 await page.goto('http://127.0.0.1:'+server.address().port);
 const panel=page.locator('[data-financial-act-context]'),retry=page.getByRole('button',{name:'Tentar ler novamente',exact:true});
 await panel.locator('[role="status"]').waitFor();assert.equal(await panel.getAttribute('data-financial-act-context'),'unavailable');
 await retry.waitFor({timeout:1500});await retry.click();assert.equal(await panel.getAttribute('data-financial-act-context'),'unavailable');
 assert.equal(await page.evaluate(()=>window.writes),0,'Read failure must never recreate or overwrite the declaration');
 await page.evaluate(()=>window.failRead=false);await retry.click();
 await page.waitForFunction(()=>document.querySelector('[data-financial-act-context]')?.getAttribute('data-financial-act-context')!=='unavailable');
 const recovered=await page.evaluate(()=>{const snapshot=window.journal.readFinancialActApplicability();return {state:snapshot.state,raw:snapshot.raw,same:snapshot.raw===window.originalDeclaration,selection:window.journal.financialActAt(snapshot.history,'2026-11-04').state};});assert.deepEqual({state:recovered.state,same:recovered.same,selection:recovered.selection},{state:'ready',same:true,selection:'applicable'});
 assert.equal(await page.evaluate(()=>window.writes),0);assert.ok(await page.evaluate(()=>window.recalculations)>0,'Recovery must notify existing calculation consumers');
 await page.evaluate(()=>{localStorage.setItem('crewcheck_financial_act_applicability_v1:synthetic-read-a','invalid');window.dispatchEvent(new Event('crewcheck:financial-config-changed'));});
 await retry.waitFor();const writes=await page.evaluate(()=>window.writes);await retry.click();assert.equal(await panel.getAttribute('data-financial-act-context'),'unavailable');assert.equal(await page.evaluate(()=>window.writes),writes);
 await page.evaluate(()=>{window.dispatchEvent(new Event('crewcheck:auth-will-change'));localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-read-b',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-b');window.dispatchEvent(new Event('crewcheck:auth-changed'));});
 await page.waitForFunction(()=>document.querySelector('[data-financial-act-context]')?.getAttribute('data-financial-act-context')!=='unavailable');
 assert.equal(await page.evaluate(()=>localStorage.getItem('crewcheck_financial_act_applicability_v1:synthetic-read-b')),null);
 assert.deepEqual(errors,[]);console.log('PASS synthetic ACT local read recovery: failed read, explicit retry, valid prior bytes reused, recalculation signal, invalid bytes retained, account isolation; no declaration writes or network.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
