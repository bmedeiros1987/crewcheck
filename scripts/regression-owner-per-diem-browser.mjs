import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright');
const bundle = buildSync({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Review from './client/src/components/finance/OwnerPerDiemConfirmation'; import PersonalReference from './client/src/components/finance/PersonalAllowanceReference'; import {FinancialPrivacyToggle} from './client/src/components/finance/FinancialPrivacy'; import * as learning from './client/src/lib/financialStatementLearning'; import * as personal from './client/src/lib/personalAllowanceReference'; window.personal=personal; window.learning=learning; window.lookup=learning.confirmedRateValueAt; createRoot(document.getElementById('root')).render(<><FinancialPrivacyToggle/><Review/><PersonalReference/></>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, outfile: '/tmp/owner-review-fixture.js', format: 'iife', jsx: 'automatic', tsconfig: 'tsconfig.json' }).outputFiles.find(file => file.path.endsWith('.js') || file.path === '<stdout>').text;
const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<div id="root"></div><script>' + bundle.replaceAll('</script>', '<\\/script>') + '</script>'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
 for(const timezoneId of ['UTC','America/Sao_Paulo','Pacific/Auckland']){
  const page = await browser.newPage({timezoneId,viewport:{width:390,height:844}});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { const NativeDate=Date,fixed=NativeDate.parse('2032-02-05T12:00:00Z');window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'synthetic-review-a', role: 'user' })); localStorage.setItem('crewcheck_auth_token', 'synthetic-token-a');localStorage.setItem('crewcheck_financial_settings_v1:synthetic-review-a:crewcheck_perdiem_rate_domestic','80'); });
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.getByText('Confirmar tarifa informada pelo titular', { exact: true }).click();
  await page.getByLabel('Mês de vigência').fill('2032-08');
  await page.getByLabel('Refeição integral (BRL)').fill('175,00');
  await page.getByLabel('Referência da confirmação').fill('Synthetic review');
  await page.getByLabel('Confirmo café a 25% da refeição integral.').check();
  await page.getByLabel('Confirmo tarifa de táxi a 25%, com elegibilidade calculada separadamente.').check();
  const prepare = page.getByRole('button', { name: 'Preparar tarifas sem gravar', exact: true });
  await prepare.click();
  assert(await page.getByText(/Valor manual preservado:/).isVisible(),'review discloses the preserved manual conflict');
  assert.equal(await page.evaluate(() => lookup('per_diem.taxi', '2032-08-06')), null, 'preview never saves');
  await page.getByRole('button', { name: 'Cancelar revisão', exact: true }).click();
  assert.equal(await page.evaluate(() => lookup('per_diem.lunch', '2032-08-06')), null);
  await prepare.click();
  await page.getByRole('button', { name: 'Confirmar e salvar tarifas nesta conta', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Tarifas salvas' }).waitFor();
  assert.equal(await page.evaluate(() => lookup('per_diem.taxi', '2032-08-06')), 43.75);
  assert.equal(await page.evaluate(() => lookup('per_diem.lunch', '2032-09-01')), null);
  await page.getByLabel('Refeição integral (BRL)').fill('196,00');
  await page.getByLabel('Confirmo café a 25% da refeição integral.').uncheck();
  await page.getByLabel('Confirmo tarifa de táxi a 25%, com elegibilidade calculada separadamente.').uncheck();
  await prepare.click();assert.equal(await page.locator('li').count(),3,'unchecked review contains principal meals only');
  await page.getByRole('button', { name: 'Confirmar e salvar tarifas nesta conta', exact: true }).click();
  assert.equal(await page.evaluate(() => lookup('per_diem.lunch', '2032-08-06')),196);
  assert.equal(await page.evaluate(() => lookup('per_diem.breakfast', '2032-08-06')),null);
  assert.equal(await page.evaluate(() => lookup('per_diem.taxi', '2032-08-06')),null);
  await page.reload();
  assert.equal(await page.evaluate(() => lookup('per_diem.lunch', '2032-08-06')),196);
  assert.equal(await page.evaluate(() => lookup('per_diem.breakfast', '2032-08-06')),null,'unchecked option survives actual browser reload');
  await page.getByText('Confirmar tarifa informada pelo titular', { exact: true }).click();
  await page.getByLabel('Mês de vigência').fill('2032-08');await page.getByLabel('Refeição integral (BRL)').fill('196,00');await page.getByLabel('Referência da confirmação').fill('Synthetic edited review');
  await prepare.click();
  await page.evaluate(() => { localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'synthetic-review-b', role: 'user' })); localStorage.setItem('crewcheck_auth_token', 'synthetic-token-b'); });
  await page.getByRole('button', { name: 'Confirmar e salvar tarifas nesta conta', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'A conta ou sessão mudou' }).waitFor();
  assert.equal(await page.evaluate(() => lookup('per_diem.taxi', '2032-08-06')), null);
  await page.evaluate(() => { localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-review-a',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-token-a');window.dispatchEvent(new Event('crewcheck:auth-changed')); });
  await page.getByText('Reutilizar referência arquivada nas diárias',{exact:true}).click();
  const originalArchive=await page.evaluate(()=>localStorage.getItem('crewcheck_financial_learned_rates_v2:synthetic-review-a'));
  const selector=page.getByLabel('Referência arquivada');
  const option=await selector.locator('option').filter({hasText:'Refeição integral'}).first().getAttribute('value');
  await selector.selectOption(option);await page.getByLabel('Usar na previsão desde').fill('2032-09-01');
  await page.getByRole('button',{name:'Revisar uso nas previsões',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar vigências nesta conta',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Referência pessoal ativada'}).waitFor();
  assert.equal(await page.evaluate(()=>learning.confirmedPerDiemReferencesAt('2033-01-01').mainMeal.value),196);
  assert.equal(await page.evaluate(()=>lookup('per_diem.lunch','2033-01-01')),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('crewcheck_financial_learned_rates_v2:synthetic-review-a')),originalArchive);
  await page.getByRole('button',{name:'Revogar Refeição integral',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar vigências nesta conta',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Referência pessoal revogada'}).waitFor();
  assert.equal(await page.evaluate(()=>learning.confirmedPerDiemReferencesAt('2033-01-01').mainMeal),null);
  assert.equal(await selector.locator('input[type=file],input[type=number]').count(),0);
  // Fresh synthetic account exercises dated changes through the real UI, not
  // direct writes of the new schema. A preview/cancel must never create it.
  await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-history-ui',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-history-session');window.dispatchEvent(new Event('crewcheck:auth-changed'));});
  const monthly=async(month,meal,label)=>{
   await page.getByLabel('Mês de vigência').fill(month);await page.getByLabel('Refeição integral (BRL)').fill(meal);await page.getByLabel('Referência da confirmação').fill(label);
   await page.getByLabel('Confirmo café a 25% da refeição integral.').check();await page.getByLabel('Confirmo tarifa de táxi a 25%, com elegibilidade calculada separadamente.').check();
   await prepare.click();await page.getByRole('button',{name:'Confirmar e salvar tarifas nesta conta',exact:true}).click();
  };
  await monthly('2032-01','174,00','Synthetic January history');await monthly('2032-10','200,00','Synthetic October history');
  await page.getByText('Reutilizar referência arquivada nas diárias',{exact:true}).click();
  const policyKey='crewcheck_personal_allowance_reference_v1:synthetic-history-ui';
  const reviewPersonal=async(category,period,from)=>{
   const option=await selector.locator('option').filter({hasText:category}).filter({hasText:period}).first().getAttribute('value');assert(option);
   await selector.selectOption(option);await page.getByLabel('Usar na previsão desde').fill(from);await page.getByRole('button',{name:'Revisar uso nas previsões',exact:true}).click();
   await page.getByRole('region',{name:'Revisar vigências pessoais',exact:true}).waitFor();
  };
  await reviewPersonal('Refeição integral','2032-01-01','2032-01-01');
  assert.match(await page.getByRole('region',{name:'Revisar vigências pessoais',exact:true}).innerText(),/será criada uma referência pessoal/);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),policyKey),null);
  await page.getByRole('button',{name:'Cancelar revisão de vigências',exact:true}).click();assert.equal(await page.evaluate(key=>localStorage.getItem(key),policyKey),null);
  for(const category of ['Refeição integral','Café da manhã','Táxi']){
   await reviewPersonal(category,'2032-01-01','2032-01-01');await page.getByRole('button',{name:'Confirmar vigências nesta conta',exact:true}).click();
   await page.getByRole('status').filter({hasText:'Referência pessoal ativada'}).waitFor();
  }
  const beforeFuture=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).revision,policyKey);
  for(const category of ['Refeição integral','Café da manhã','Táxi']){
   await reviewPersonal(category,'2032-10-01','2032-11-01');
   assert.match(await page.getByRole('region',{name:'Revisar vigências pessoais',exact:true}).innerText(),/2032-01-01 a 2032-10-31/);
   // Repeated synchronous clicks cannot enqueue a second stale operation.
   await page.getByRole('button',{name:'Confirmar vigências nesta conta',exact:true}).evaluate(button=>{button.click();button.click();});
   await page.getByRole('status').filter({hasText:'Referência pessoal ativada'}).waitFor();
  }
  assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).revision,policyKey),beforeFuture+3);
  const ratesAt=()=>page.evaluate(()=>['2032-02-05','2032-11-05'].map(date=>{const r=learning.confirmedPerDiemReferencesAt(date);return [r.mainMeal?.value,r.breakfast,r.taxi];}));
  assert.deepEqual(await ratesAt(),[[174,43.5,43.5],[200,50,50]]);
  const live=page.getByRole('region',{name:'Vigências pessoais de Refeição integral',exact:true});assert.match(await live.innerText(),/Premissa pessoal · 2032-01-01 a 2032-10-31/);assert.match(await live.innerText(),/Programada · 2032-11-01 em diante/);
  await page.getByRole('button',{name:'Ocultar valores financeiros',exact:true}).click();assert.doesNotMatch(await live.innerText(),/174,00|200,00/);assert.match(await live.innerText(),/2032-11-01/);await page.getByRole('button',{name:'Mostrar valores financeiros',exact:true}).click();
  await monthly('2032-06','220,00','Synthetic June exception');assert.equal(await page.evaluate(()=>learning.confirmedPerDiemReferencesAt('2032-06-05').mainMeal.value),220);assert.deepEqual(await ratesAt(),[[174,43.5,43.5],[200,50,50]]);
  await page.getByRole('button',{name:'Revogar Refeição integral',exact:true}).click();assert.match(await page.getByRole('region',{name:'Revisar vigências pessoais',exact:true}).innerText(),/todas as datas.*cancela seus usos programados/);await page.getByRole('button',{name:'Confirmar vigências nesta conta',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Referência pessoal revogada'}).waitFor();assert.deepEqual(await ratesAt(),[[undefined,43.5,43.5],[undefined,50,50]]);assert.equal(await page.evaluate(()=>learning.confirmedPerDiemReferencesAt('2032-06-05').mainMeal.value),220);
  await reviewPersonal('Refeição integral','2032-01-01','2032-12-01');await page.getByRole('button',{name:'Confirmar vigências nesta conta',exact:true}).click();await page.getByRole('status').filter({hasText:'Referência pessoal ativada'}).waitFor();
  assert.equal(await page.evaluate(()=>learning.confirmedPerDiemReferencesAt('2032-12-05').mainMeal.value),174);assert.equal(await page.evaluate(()=>learning.confirmedPerDiemReferencesAt('2032-11-05').mainMeal),null);
  // Same-account event invalidates a stale preview; no overwrite of newer bytes.
  await reviewPersonal('Refeição integral','2032-10-01','2033-01-01');
  const external=await page.evaluate(key=>{const raw=JSON.stringify(JSON.parse(localStorage.getItem(key)),null,2);localStorage.setItem(key,raw);window.dispatchEvent(new StorageEvent('storage',{key,storageArea:localStorage,newValue:raw}));return raw;},policyKey);
  await page.getByRole('button',{name:'Confirmar vigências nesta conta',exact:true}).waitFor({state:'hidden'});assert.equal(await page.evaluate(key=>localStorage.getItem(key),policyKey),external);
  // Storage clear resets the visible timeline, without reviving another key.
  await page.evaluate(key=>{localStorage.removeItem(key);window.dispatchEvent(new StorageEvent('storage',{key,storageArea:localStorage,newValue:null}));},policyKey);
  await page.getByRole('region',{name:'Vigências pessoais de Refeição integral',exact:true}).waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>learning.confirmedPerDiemReferencesAt('2032-12-05').mainMeal),null);
  const legacyRaw=await page.evaluate(key=>{const rate=learning.readConfirmedFinancialRates().find(r=>r.key==='per_diem.lunch'&&r.effectiveFrom==='2032-01-01');const raw=JSON.stringify({schema:1,ownerId:'synthetic-history-ui',revision:1,events:[{revision:1,category:'mainMeal',sourceId:personal.personalAllowanceSourceId(rate),from:'2032-01-01',active:true,confirmed:true}]},null,2)+'\n';localStorage.setItem(key,raw);window.dispatchEvent(new StorageEvent('storage',{key,storageArea:localStorage,newValue:raw}));return raw;},policyKey);
  await reviewPersonal('Refeição integral','2032-10-01','2032-11-01');assert.match(await page.getByRole('region',{name:'Revisar vigências pessoais',exact:true}).innerText(),/histórico original permanece arquivado/);assert.equal(await page.evaluate(key=>localStorage.getItem(key),policyKey),legacyRaw);
  await page.getByRole('button',{name:'Cancelar revisão de vigências',exact:true}).click();assert.equal(await page.evaluate(key=>localStorage.getItem(key),policyKey),legacyRaw);
  await reviewPersonal('Refeição integral','2032-10-01','2032-11-01');await page.getByRole('button',{name:'Confirmar vigências nesta conta',exact:true}).click();await page.getByRole('status').filter({hasText:'Referência pessoal ativada'}).waitFor();
  const convertedRaw=await page.evaluate(key=>localStorage.getItem(key),policyKey);assert.equal(JSON.parse(convertedRaw).legacyRaw,legacyRaw);assert.equal(await page.evaluate(()=>learning.confirmedPerDiemReferencesAt('2032-02-05').mainMeal.value),174);
  await reviewPersonal('Refeição integral','2032-01-01','2033-01-01');
  await page.evaluate(()=>{localStorage.setItem('crewcheck_auth_user',JSON.stringify({id:'synthetic-no-rates',role:'user'}));localStorage.setItem('crewcheck_auth_token','synthetic-no-rates-session');window.dispatchEvent(new Event('crewcheck:auth-changed'));});
  await page.getByRole('button',{name:'Confirmar vigências nesta conta',exact:true}).waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>learning.confirmedPerDiemReferencesAt('2032-02-05').mainMeal),null);assert.equal(await page.evaluate(key=>localStorage.getItem(key),policyKey),convertedRaw);
  await page.close();
  assert.deepEqual(errors, []);
 }
  console.log('PASS synthetic owner review UI: preview/cancel, explicit save, unchecked edit/reload, manual conflict disclosure, bounded rates and account-switch rejection');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
