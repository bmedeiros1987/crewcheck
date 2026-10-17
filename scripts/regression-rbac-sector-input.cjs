// Synthetic browser regression for the retained legacy sector form. The current
// scenario UI has its own compiled-app regression in the same workflow.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { chromium } = createRequire(process.env.RBAC_PLAYWRIGHT_PACKAGE || __filename)('playwright');
const esbuild = require('esbuild');
(async () => {
  // Exercise the real launch failure in a child: a leaked HTTP server must fail this check.
  if (!process.argv.includes('--launch-failure-probe')) {
    const invalidPath = path.join(os.tmpdir(), `crewcheck-missing-browser-${process.pid}`);
    assert.equal(fs.existsSync(invalidPath), false);
    const started = Date.now();
    const result = spawnSync(process.execPath, [__filename, '--launch-failure-probe'], {
      env: {...process.env, RBAC_BROWSER_PATH: invalidPath}, encoding: 'utf8', timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, 'launch failure must exit without a timeout or signal');
    assert.equal(result.status, 1, 'launch failure must preserve the error exit code');
    assert.ok(result.stderr.includes('browserType.launch') && result.stderr.includes(invalidPath),
      'must report the original browser launch failure');
    assert.ok(!result.stdout.includes('PASS:'), 'failed launch must not report success');
    console.log(`PASS: invalid RBAC_BROWSER_PATH exits 1 in ${Date.now() - started}ms`);
  }
  let dir, server, browser, failure;
  try {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-rbac-form-'));
    // Compile the retained component under test without changing the application
    // export, which now mounts RegulationScenarioView. Keep all sector assertions.
    const bundle = (await esbuild.build({plugins:[{name:'legacy-sector-fixture',setup(build){
      build.onLoad({filter:/[/\\]v1432[/\\]ManualRegulationView\.tsx$/},args=>{
        const source=fs.readFileSync(args.path,'utf8');
        const marker='export default function ManualRegulationView(';
        const offset=source.lastIndexOf(marker);
        assert.ok(offset>=0,'current wrapper must be present');
        assert.match(source.slice(offset),/return <RegulationScenarioView \{\.\.\.props\}\/>/);
        return {contents:source.slice(0,offset)+'export default LegacyManualRegulationView;',loader:'tsx',resolveDir:path.dirname(args.path)};
      });
    }}],stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import Form from './client/src/components/v1432/ManualRegulationView';
      const compliance={score:75,alerts:[
        {severity:'error',actionable:true,classification:'irregularidade_confirmada',title:'Synthetic confirmed critical alert'},
        {severity:'warning',actionable:false,classification:'informativa',title:'Synthetic informational diagnostic'},
        {severity:'error',classification:'dados_insuficientes',title:'Synthetic insufficient-data diagnostic'}
      ]};
      function App(){const [day,setDay]=React.useState(null); window.setSyntheticSchedule=setDay; return React.createElement(Form,{scheduleDay:day,compliance});} createRoot(document.getElementById('root')).render(React.createElement(App));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',loader:{'.css':'empty'},jsx:'automatic'})).outputFiles[0].text;
    server = http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/form.js'?'application/javascript':'text/html');res.end(req.url==='/form.js'?bundle:'<div id="root"></div><script src="/form.js"></script>');});
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});
    });
    browser = await chromium.launch({headless:true,...(process.env.RBAC_BROWSER_PATH?{executablePath:process.env.RBAC_BROWSER_PATH}:{}),args:['--no-sandbox']});
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
    assert.equal(await page.getByText('Synthetic confirmed critical alert',{exact:true}).count(),1);
    assert.equal(await page.getByText('Synthetic informational diagnostic',{exact:true}).count(),0);
    assert.equal(await page.getByText('Synthetic insufficient-data diagnostic',{exact:true}).count(),0);
    for (const value of Array.from({length:9},(_,i)=>String(i+1))) {
      await input.fill(value); await input.blur(); assert.equal(await input.inputValue(),value);
      assert.equal(await input.getAttribute('aria-invalid'),'false');
      assert.equal(await page.getByText('Horário do corte',{exact:true}).count(),1,'valid sectors retain the numerical result');
    }
    for (const value of ['','0','-1','10','1.5','2.0','1e0','1e1']) {
      await input.fill(value); await input.blur();
      assert.equal(await page.getByText('Informe um número inteiro de 1 a 9.').count(),1);
      assert.equal(await input.getAttribute('aria-invalid'),'true');
      assert.equal(await input.getAttribute('aria-describedby'),'cc-reg-sectors-error');
      assert.equal(await page.getByRole('alert').getAttribute('id'),'cc-reg-sectors-error');
      assert.equal(await page.getByText('Horário do corte',{exact:true}).count(),0,'invalid draft suspends numerical result');
      assert.equal(await page.getByText('Synthetic confirmed critical alert',{exact:true}).count(),1,'invalid manual draft never suppresses confirmed automatic alerts');
      await page.reload(); assert.equal(await input.inputValue(),'9','invalid drafts must not replace persisted valid data');
    }
    await page.evaluate(()=>window.addEventListener('crewcheck:set-view',event=>{window.syntheticRequestedView=event.detail;}));
    await page.getByRole('button',{name:'Abrir irregularidades completas'}).click();
    assert.equal(await page.evaluate(()=>window.syntheticRequestedView),'alerts','critical-alert navigation remains available');
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
    console.log('PASS retained legacy form: clear/type 1/2/3, all valid sectors 1-9, invalid drafts, accessible errors, critical alerts/navigation, blur, persistence, invalid stored value, reset, reserve activation and schedule changes');
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    for (const cleanup of [
      async () => { if (browser) await browser.close(); },
      async () => { if (server?.listening) await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())); },
      async () => { if (dir) fs.rmSync(dir,{recursive:true,force:true}); },
    ]) {
      try { await cleanup(); } catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length) {
      const error = new AggregateError(cleanupErrors, 'Browser regression cleanup failed');
      if (failure) console.error(error); else throw error;
    }
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
