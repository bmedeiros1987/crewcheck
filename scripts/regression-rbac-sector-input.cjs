// Synthetic browser regression against the actual React form; no account or external APIs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');
const { chromium } = createRequire(process.env.RBAC_PLAYWRIGHT_PACKAGE || __filename)('playwright');
const esbuild = require('esbuild');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-rbac-form-'));
  const bundle = esbuild.buildSync({stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import Form from './client/src/components/v1432/ManualRegulationView'; function App(){const [day,setDay]=React.useState(null); window.setSyntheticSchedule=setDay; return React.createElement(Form,{scheduleDay:day});} createRoot(document.getElementById('root')).render(React.createElement(App));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',loader:{'.css':'empty'},jsx:'automatic'}).outputFiles[0].text;
  const server = http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/form.js'?'application/javascript':'text/html');res.end(req.url==='/form.js'?bundle:'<div id="root"></div><script src="/form.js"></script>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true,...(process.env.RBAC_BROWSER_PATH?{executablePath:process.env.RBAC_BROWSER_PATH}:{}),args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
    await page.goto(url);
    const input = page.getByLabel('Número de etapas');
    for (const value of ['1','2','3']) {
      await input.fill('9'); await input.press('Backspace');
      assert.equal(await input.inputValue(),'','clearing must remain empty until typing');
      await input.pressSequentially(value); assert.equal(await input.inputValue(),value);
      await input.blur(); await page.reload(); assert.equal(await input.inputValue(),value,'valid edit survives reopening');
    }
    for (const value of ['1','9']) { await input.fill(value); await input.blur(); assert.equal(await input.inputValue(),value); }
    for (const value of ['','0','10','1.5','1e1']) {
      await input.fill(value); await input.blur();
      assert.equal(await page.getByText('Informe um número inteiro de 1 a 9.').count(),1);
      assert.equal(await page.getByText('Horário do corte',{exact:true}).count(),0,'invalid draft suspends numerical result');
      await page.reload(); assert.equal(await input.inputValue(),'9','invalid drafts must not replace persisted valid data');
    }
    await input.fill(''); await page.getByRole('button',{name:'Restaurar dados da programação'}).click(); assert.equal(await input.inputValue(),'2');
    await page.evaluate(()=>{ const key='crewcheck:manual-regulation:v1432'; const saved=JSON.parse(localStorage.getItem(key)); localStorage.setItem(key,JSON.stringify({...saved,sectors:10})); });
    await page.reload(); assert.equal(await input.inputValue(),'10');
    assert.equal(await page.getByText('Informe um número inteiro de 1 a 9.').count(),1);
    assert.equal(await page.getByText('Horário do corte',{exact:true}).count(),0);
    await input.fill('3'); await input.blur(); await page.reload(); assert.equal(await input.inputValue(),'3');
    await page.evaluate(()=>window.setSyntheticSchedule({date:'2032-02-02',pairingCode:'RES',dutyReport:'08:00',dutyDebrief:'17:00',legs:[]}));
    await page.waitForFunction(()=>document.querySelector('input[type=number]').value==='1');
    assert.equal(await page.getByLabel('Origem da jornada').inputValue(),'reserve-activation');
    await input.fill('2'); await page.getByRole('button',{name:'Restaurar dados da programação'}).click(); assert.equal(await input.inputValue(),'1');
    await page.evaluate(()=>window.setSyntheticSchedule({date:'2032-02-03',pairingCode:'SYN',dutyReport:'09:00',dutyDebrief:'18:00',legs:Array.from({length:3},()=>({departureTime:'10:00',arrivalTime:'11:00'}))}));
    await page.waitForFunction(()=>document.querySelector('input[type=number]').value==='3');
    assert.equal(await page.getByLabel('Origem da jornada').inputValue(),'presentation');
    console.log('PASS: clear/type 1/2/3, replace 9, boundaries, invalid drafts, blur, persistence, invalid stored value, reset, reserve activation and schedule changes');
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); fs.rmSync(dir,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1;});
