import assert from 'node:assert/strict';import http from 'node:http';import {createRequire} from 'node:module';import {buildSync} from 'esbuild';
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const output=buildSync({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Control,{AllowanceMinimumReference} from './client/src/components/finance/FinancialActApplicability';import {FinancialPrivacyToggle} from './client/src/components/finance/FinancialPrivacy';import * as journal from './client/src/lib/financialActApplicability';window.journal=journal;createRoot(document.getElementById('root')).render(<><FinancialPrivacyToggle/><Control/><AllowanceMinimumReference rows={[{iso:'2026-01-05',label:'Synthetic minimum',currency:'USD',value:28.7,source:'Synthetic public-floor fixture'}]} totals={{USD:28.7}} inspections={[{iso:'2026-01-05',currency:'GBP',publishedFloorMinor:2400,reason:'Synthetic scope pending'}]}/></>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outfile:'/tmp/financial-act-fixture.js',format:'iife',jsx:'automatic',tsconfig:'tsconfig.json'}).outputFiles;
const js=output.find(f=>f.path.endsWith('.js')).text,css=output.find(f=>f.path.endsWith('.css'))?.text||'';
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;margin:16px}*{box-sizing:border-box}'+css+'</style><div id="root"></div><script>'+js.replaceAll('</script>','<\\/script>')+'</script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
try{
 const session=await browser.newContext({viewport:{width:390,height:844}}),page=await session.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-act-a',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-token-a');localStorage.setItem('crewcheck:financial-privacy:v2:synthetic-act-a','hidden');localStorage.setItem('crewcheck:financial-privacy:v2:synthetic-act-b','hidden');});
 await page.goto('http://127.0.0.1:'+server.address().port);
 const control=page.locator('[data-financial-act-context]');
 const key='crewcheck_financial_act_applicability_v1:synthetic-act-a',saved=()=>page.evaluate(k=>localStorage.getItem(k),key);
 assert.equal(await saved(),null);assert(await page.getByText(/Empresa e ACT ainda não confirmados/).isVisible());
 await page.getByText('Confirmar ou revisar aplicação financeira do ACT',{exact:true}).click();
 assert.equal(await control.getByLabel(/^Empregador/).count(),1);assert.equal(await control.getByLabel(/^Perfil do ACT/).count(),1);assert.equal(await control.getByLabel(/^Ação/).count(),1);
 assert.equal(await control.getByLabel(/^Empregador/).inputValue(),'');assert.equal(await control.getByLabel(/^Perfil do ACT/).inputValue(),'');
 const prepare=page.getByRole('button',{name:'Preparar declaração sem gravar',exact:true});await prepare.click();assert.equal(await saved(),null);assert(await page.getByRole('status').filter({hasText:'Selecione empresa'}).isVisible());
 await control.getByLabel(/^Empregador/).selectOption('TAM_LINHAS_AEREAS_SA');await control.getByLabel(/^Perfil do ACT/).selectOption('pilot');await control.getByLabel(/Declaro que meu vínculo/).check();
 await prepare.click();assert.equal(await saved(),null);await page.getByRole('button',{name:'Cancelar prévia',exact:true}).click();assert.equal(await saved(),null);
 await prepare.click();await page.getByRole('button',{name:'Confirmar e salvar declaração nesta conta',exact:true}).click();await page.getByRole('status').filter({hasText:'Declaração financeira salva'}).waitFor();
 let raw=await saved();assert.equal(JSON.parse(raw).events[0].role,'pilot');assert(!raw.includes('token'));assert(!raw.includes('109.44'));
 await page.reload();assert.equal(await saved(),raw);await page.getByText('Confirmar ou revisar aplicação financeira do ACT',{exact:true}).click();
 await control.getByLabel(/^Ação/).selectOption('revoke');await control.getByLabel('Revogar desde',{exact:true}).fill('2026-06-01');await prepare.click();
 // Another tab with same revision but changed bytes defeats the exact reviewed snapshot, not just revision.
 const other=await session.newPage();await other.goto('http://127.0.0.1:'+server.address().port);await other.evaluate(k=>{const h=JSON.parse(localStorage.getItem(k));h.events[0].role='cabin';localStorage.setItem(k,JSON.stringify(h));},key);
 await page.waitForFunction(()=>!document.querySelector('[aria-label="Prévia da aplicação financeira"]'));
 assert.equal(await page.getByRole('button',{name:'Confirmar e salvar declaração nesta conta',exact:true}).count(),0);
 await prepare.click();
 await page.getByRole('button',{name:'Confirmar e salvar declaração nesta conta',exact:true}).waitFor({state:'visible'});
 const beforeSwitch=await saved();
 // Attack the stale handler in the same JS turn, before React can repaint.
 const switched=await page.evaluate(key=>{const stale=document.querySelector('[aria-label="Prévia da aplicação financeira"] button');if(!stale)throw Error('Expected prepared action before switch');window.dispatchEvent(new Event('crewcheck:auth-will-change'));localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-act-b',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-token-b');window.dispatchEvent(new Event('crewcheck:auth-changed'));stale.click();return {previous:localStorage.getItem(key),next:localStorage.getItem('crewcheck_financial_act_applicability_v1:synthetic-act-b')};},key);
 assert.equal(switched.previous,beforeSwitch,'same-turn stale click cannot change the previous account');assert.equal(switched.next,null,'same-turn stale click cannot enroll the new account');
 await page.waitForFunction(()=>{const panel=document.querySelector('[data-financial-act-context]');return panel&&!panel.querySelector('[aria-label="Prévia da aplicação financeira"]')&&panel.querySelectorAll('select')[1]?.value==='';});
 assert.equal(await saved(),beforeSwitch,'settled account change preserves previous journal');
 assert.equal(await page.getByRole('button',{name:'Confirmar e salvar declaração nesta conta',exact:true}).count(),0);assert.equal(await control.getByLabel(/^Empregador/).inputValue(),'');
 assert.equal(await page.evaluate(()=>localStorage.getItem('crewcheck_financial_act_applicability_v1:synthetic-act-b')),null);
 // Explicit hidden preference conceals minimum subtotal and inspection amounts.
 assert(!/28,70/.test(await page.locator('[data-allowance-minimum-reference]').innerText()));
 await page.getByRole('button',{name:'Mostrar valores financeiros',exact:true}).click();assert(/28,70/.test(await page.locator('[data-allowance-minimum-reference]').innerText()));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile form does not overflow');assert.deepEqual(errors,[]);await other.close();
 console.log('PASS real applicability browser: blank scope, no read/preview/cancel writes, explicit save/reload, same-revision cross-tab invalidation, account-switch draft fence, privacy and 390px layout');
}finally{await browser.close();await new Promise(r=>server.close(r));}
