import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const {chromium}=createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE||import.meta.url)('playwright');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-private-mask-'));
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {useFinancialPrivacy,FinancialPrivacyToggle,concealFinancialText,hiddenValue} from './client/src/components/finance/FinancialPrivacy';
import OwnerPerDiemConfirmation from './client/src/components/finance/OwnerPerDiemConfirmation';
function App(){const p=useFinancialPrivacy();return <><FinancialPrivacyToggle/><OwnerPerDiemConfirmation/><p data-money aria-label={p.amount('R$ 123,45')} title={p.amount('JPY 987654')}>{p.amount('R$ 123,45')}</p><p data-context>{p.text('Salário 06/10/2032 · R$ 123,45 · JPY 987654 · 1.234,56 EUR · ₹ 8,50')}</p></>}
window.mask={concealFinancialText,hiddenValue,ssr:renderToString(<App/>)};
window.fixtureOwner='synthetic-A';createRoot(document.getElementById('root')).render(<App/>);`;
let browser,server;
try {
 const result=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',write:false,jsx:'automatic',plugins:[{name:'fixture-only-owner',setup(b){b.onResolve({filter:/^@\/lib\/financialStatementLearning$/},()=>({path:'owner',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const financialRateOwner=()=>window.fixtureOwner||null;export const financialRateSession=()=>window.fixtureOwner;export const mergeConfirmedRates=()=>[];export const readConfirmedFinancialRates=()=>[];export const saveConfirmedFinancialRates=()=>false;export const personalAllowanceStorageKey=owner=>`crewcheck_personal_allowance_reference_v1:${encodeURIComponent(owner)}`;export const readPersonalAllowanceReferences=()=>({state:"missing",rates:[],history:{schema:1,ownerId:window.fixtureOwner,revision:0,events:[]}});export const savePersonalAllowanceReference=async()=>false;',loader:'js'}));b.onResolve({filter:/^@\/lib\/financialPrivacyPreference$/},()=>({path:path.resolve('client/src/lib/financialPrivacyPreference.ts')}));b.onResolve({filter:/^@\/lib\//},args=>({path:path.resolve('client/src/lib',args.path.slice(6)+'.ts')}));b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}));}}]});
 const bundle=result.outputFiles[0].text;
 server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'application/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(req.url==='/bundle.js'?bundle:'<div id="root"></div><script src="/bundle.js"></script>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_BIN||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  if(localStorage.getItem('crewcheck:financial-privacy:v2:synthetic-A')===null)localStorage.setItem('crewcheck:financial-privacy:v2:synthetic-A','hidden');
  window.observedMoney=[];new MutationObserver(()=>document.querySelectorAll('[data-money]').forEach(e=>window.observedMoney.push(e.textContent))).observe(document,{childList:true,subtree:true,characterData:true});
 });
 await page.goto(origin);await page.getByRole('button',{name:'Mostrar valores financeiros'}).waitFor();
 assert.equal(await page.locator('[data-money]').textContent(),'R$ •••');
 assert.equal(await page.locator('[data-money]').getAttribute('aria-label'),'R$ •••');assert.equal(await page.locator('[data-money]').getAttribute('title'),'R$ •••');
 assert.equal(await page.locator('[data-context]').textContent(),'Salário 06/10/2032 · R$ ••• · R$ ••• · R$ ••• · R$ •••');
 assert.equal(await page.evaluate(()=>window.observedMoney.some(value=>/123/.test(value))),false,'no visible value before saved preference');
 assert.doesNotMatch(await page.evaluate(()=>window.mask.ssr),/123,45|987654/,'SSR is concealed before owner preference is available');
 assert.equal(await page.evaluate(()=>window.mask.concealFinancialText('ACT 2025/2027 · R$ 0,058547 · USD 1,234.56 · ¥0 · 7.25 CHF',true)),'ACT 2025/2027 · R$ ••• · R$ ••• · R$ ••• · R$ •••');
 for(const [raw,masked] of [['R$ − 1.234,56','R$ •••'],['CHF 1’234.56','R$ •••'],['Pagamento 06/10/2032 R$ 123,45','Pagamento 06/10/2032 R$ •••'],['Fulano123 USD456,78','Fulano123 R$ •••'],['123,45 EUR em 06/10/2032','R$ ••• em 06/10/2032'],['Pagamento 123,45 BRL 06/10/2032','Pagamento R$ ••• 06/10/2032'],['USD 123.45 2032-10-06','R$ ••• 2032-10-06'],['123,45 BRL 06:10','R$ ••• 06:10'],['123,45 BRL 15/09','R$ ••• 15/09']])assert.equal(await page.evaluate(raw=>window.mask.concealFinancialText(raw,true),raw),masked);
 await page.getByRole('button',{name:'Mostrar valores financeiros'}).focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Ocultar valores financeiros'}).waitFor();assert.equal(await page.locator('[data-money]').textContent(),'R$ 123,45');
 await page.reload();await page.getByRole('button',{name:'Ocultar valores financeiros'}).waitFor();assert.equal(await page.locator('[data-money]').textContent(),'R$ 123,45','shown preference also survives reload');
 const meal=page.getByLabel('Refeição integral (BRL)');await page.getByText('Confirmar tarifa informada pelo titular',{exact:true}).click();await meal.fill('1234,56');
 // Reapply hidden and reload without init-script resetting the preference.
 await page.getByRole('button',{name:'Ocultar valores financeiros'}).focus();await page.keyboard.press('Space');assert.equal(await meal.inputValue(),'');assert.equal(await meal.isDisabled(),true);assert.equal(await meal.getAttribute('placeholder'),'R$ •••');await page.reload();await page.getByRole('button',{name:'Mostrar valores financeiros'}).waitFor();
 await page.evaluate(()=>{window.fixtureOwner='synthetic-B';window.dispatchEvent(new Event('crewcheck:auth-changed'));});await page.getByRole('button',{name:'Ocultar valores financeiros'}).waitFor();
 await page.evaluate(()=>{window.fixtureOwner='synthetic-A';window.dispatchEvent(new Event('crewcheck:auth-changed'));});await page.getByRole('button',{name:'Mostrar valores financeiros'}).waitFor();
 const fallback=await browser.newPage();await fallback.addInitScript(()=>Object.defineProperty(Intl,'supportedValuesOf',{value:undefined}));await fallback.goto(origin);await fallback.locator('[data-money]').waitFor();assert.equal(await fallback.evaluate(()=>window.mask.concealFinancialText('KWD 1.234 · BHD 2.345 · OMR 3.456',true)),'R$ ••• · R$ ••• · R$ •••');await fallback.close();
 await page.evaluate(()=>window.dispatchEvent(new Event('storage')));await page.waitForTimeout(50);assert.deepEqual(errors,[]);console.log('PASS actual FinancialPrivacy browser: fixed mask, dates/labels, supported currencies, DOM/aria/title, synchronous initial concealment, SSR, keyboard, reload and owner isolation; synthetic only');
} finally {await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
