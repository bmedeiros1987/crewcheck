import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url);
const { chromium } = require('playwright');
const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{BidsAlertPreferences}from'./client/src/components/v139/BidsAlertPreferences';createRoot(document.getElementById('root')).render(<div className="cc-notification-center"><BidsAlertPreferences/></div>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'fixture', setup(b) {
  b.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: '', loader: 'js' }));
  b.onResolve({ filter: /^@\// }, ({ path: name }) => ({ path: path.resolve('client/src', name.slice(2) + '.ts') }));
} }] });
const styles = fs.readFileSync('client/src/styles/fixed-navigation-headers.css', 'utf8') + fs.readFileSync('client/src/index.css', 'utf8') + fs.readFileSync('client/src/components/v139/v139.css', 'utf8') + fs.readFileSync('client/src/components/v139/bids-alert-preferences.css', 'utf8') + fs.readFileSync('client/src/components/notifications/wakeup-selection.css', 'utf8') + fs.readFileSync('client/src/components/notifications/notification-settings.css','utf8');
const html = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><style>*{box-sizing:border-box}body{margin:0}#navigation-header{position:fixed;inset:0 0 auto;height:80px;padding:24px 12px 8px;z-index:20;background:Canvas;color:CanvasText}#navigation-footer{position:fixed;inset:auto 0 0;height:88px;padding:8px 12px 24px;z-index:20;background:Canvas;color:CanvasText}main{padding:92px 12px 100px}main fieldset{margin-inline:0}</style><header id="navigation-header">Navegação CrewCheck</header><main id="root"></main><nav id="navigation-footer">Menu</nav><script src="/fixture.js"></script>`;
const server = http.createServer((req, res) => { res.setHeader('content-type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html'); res.end(req.url === '/fixture.js' ? bundle.outputFiles[0].text : html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const defaults = { enabled: false, mode: 'auto', preferredTime: '09:00', quietStart: '22:00', quietEnd: '08:00', timezone: '', channels: { all: false, individual: { mobilePwa: true, watch: false, crewCierge: false } } };
const states = { A: { revision: 0, preferences: { ...defaults } }, B: { revision: 0, preferences: { ...defaults } } }, writes = [], errors = [];
let browser, offline = false, hold = false, held, resume, readyCampaign = false;
function snapshot(token) { return { ...states[token], ownerId:token, pending: readyCampaign ? [] : ['comunicado vigente verificado', 'fuso oficial', 'competência', 'encerramento confirmado', 'público elegível verificado'], campaign: readyCampaign ? { id: 'synthetic', targetMonth: '2026-12' } : null, alreadyDid: states[token].alreadyDid === true, canConfirmAlreadyDid: readyCampaign, plan: { candidateAt: null, contextKey: 'synthetic-' + token }, message: 'Nenhum aviso foi agendado ou enviado.', externalDelivery: false }; }
try {
  browser = await chromium.launch({ args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 320, height: 700 } });
  await context.addCookies([{ name: 'crewcheck_auth_token', value: 'stale-cookie', url: origin }]);
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if(url.pathname==='/api/platform/notifications/crewcheck-installation')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({enabled:false,registered:false,revision:0,ownerId:req.headers().authorization?.replace('Bearer ',''),publicKey:null})});
    assert.equal(url.pathname, '/api/platform/notifications/preferences');
    const token = req.headers().authorization?.replace('Bearer ', ''); assert(['A', 'B'].includes(token));
    if (offline) return route.abort();
    if (req.method() === 'POST') {
      const body = req.postDataJSON(); writes.push({ token, body });
      if (hold) { hold = false; held(); await new Promise(resolve => resume = resolve); }
      if (body.expectedRevision !== states[token].revision) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'As preferências mudaram. Recarregue antes de salvar.' }) });
      if (body.action === 'save-preferences') states[token].preferences = body.preferences;
      else { assert(readyCampaign && body.confirmed === true && body.contextKey === 'synthetic-' + token); states[token].alreadyDid = true; }
      states[token].revision++;
    } else assert.equal(req.method(), 'GET');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(snapshot(token)) });
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('crewcheck_auth_token', 'A');
    window.Notification = { requestPermission() { throw Error('No permission request'); } };
    window.CrewCheckNative = { notify() { throw Error('No real notification'); }, scheduleNotification() { throw Error('No alarm'); } };
  });
  const hour=page.getByLabel('Hora · Horário padrão para BIDS',{exact:true}),minute=page.getByLabel('Minuto · Horário padrão para BIDS',{exact:true});
  const setTime=async value=>{const [h,m]=value.split(':');await hour.selectOption(h);await minute.selectOption(m);};
  const readTime=async()=>[await hour.inputValue(),await minute.inputValue()].join(':');
  await page.goto(origin); await page.getByText('BIDS pendente de validação.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Já fiz BIDS nesta janela' }).count(), 0);
  assert.equal(writes.length, 0); assert.equal(await page.getByRole('button', { name: 'Salvar preferências' }).isVisible(), true);
  await page.locator('summary').filter({hasText:'Onde receber'}).click();await page.locator('summary').filter({hasText:'Horário e silêncio'}).click();await page.locator('summary').filter({hasText:'Outros avisos e despertador'}).click();
  await page.getByLabel('Modo', { exact: false }).selectOption('manual');
  await setTime('10:30'); await page.getByLabel('Origem do fuso',{exact:true}).selectOption('manual'); await page.getByLabel('Escolha o fuso',{exact:true}).selectOption('UTC');
  await page.getByLabel('Quero avisos BIDS', { exact: false }).check();
  await page.getByRole('checkbox', { name: 'Relógio', exact: true }).check();
  await page.getByRole('checkbox', { name: 'CrewCheck', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Todos', exact: true }).check();
  for (const name of ['CrewCheck', 'Relógio', 'CrewCierge']) { assert.equal(await page.getByRole('checkbox', { name, exact: true }).isChecked(), true); assert.equal(await page.getByRole('checkbox', { name, exact: true }).isDisabled(), true); }
  await page.getByRole('checkbox', { name: 'Todos', exact: true }).uncheck();
  assert.equal(await page.getByRole('checkbox', { name: 'CrewCheck', exact: true }).isChecked(), false);
  assert.equal(await page.getByRole('checkbox', { name: 'Relógio', exact: true }).isChecked(), true);
  assert.equal(await page.getByRole('checkbox', { name: 'CrewCierge', exact: true }).isChecked(), false);
  await page.getByRole('checkbox', { name: 'Todos', exact: true }).check();
  await page.getByLabel('Modo', { exact: false }).selectOption('auto');
  assert.equal(await readTime(), '10:30', 'manual override survives Auto toggle');
  await page.getByRole('button', { name: 'Salvar preferências' }).click();
  await page.waitForFunction(() => !document.querySelector('fieldset').disabled);
  assert.equal(writes.length, 1); assert.equal(writes[0].token, 'A'); assert.equal(states.A.preferences.preferredTime, '10:30');
  assert.deepEqual(states.A.preferences.channels, { all: true, individual: { mobilePwa: false, watch: true, crewCierge: false } });
  await page.getByText('Ligação · número e disponibilidade',{exact:true}).click();
  // Measure help text in its rendered state: closed details retain stale Range boxes in Chromium.
  for(const detail of await page.locator('details.cc-notification-help,details.cc-notification-help-icon').all()) { if(!(await detail.getAttribute('open')) && await detail.getAttribute('open')===null) await detail.locator('summary').click(); }
  const header = await page.locator('#navigation-header').boundingBox(), footer = await page.locator('#navigation-footer').boundingBox();
  const cases = [];
  for (const theme of ['light', 'dark']) for (const size of [100, 200]) {
    await page.evaluate(({ theme, size }) => { document.documentElement.dataset.crewTheme = theme; document.documentElement.style.fontSize = `${16 * size / 100}px`; document.querySelector('main').style.fontSize = `${16 * size / 100}px`; }, { theme, size });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${theme}/${size} has no horizontal overflow`);
    for (const target of [page.getByRole('heading', { name: 'Avisos' }), page.getByRole('button', { name: 'Salvar preferências' })]) {
      await target.scrollIntoViewIfNeeded(); const bounds = await target.boundingBox();
      assert(bounds.y >= header.y + header.height - 1 && bounds.y + bounds.height <= footer.y + 1, `${theme}/${size}: first/last target clear fixed navigation`);
    }
    const intersections = await page.locator('section[aria-label="Preferências de avisos BIDS"]').evaluate(section => {
      const controls = [...section.querySelectorAll('input,select,button')].map(el => el.getBoundingClientRect());
      const ranges = [...section.querySelectorAll('label,p,summary')].flatMap(el => [...el.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()).flatMap(node => { const range = document.createRange(); range.selectNodeContents(node); return [...range.getClientRects()]; }));
      const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      return controls.filter(control => ranges.some(range => overlap(control, range))).length;
    });
    assert.equal(intersections, 0, `${theme}/${size}: text/control intersections`);
    assert.deepEqual(await page.locator('#navigation-header').boundingBox(), header); assert.deepEqual(await page.locator('#navigation-footer').boundingBox(), footer);
    cases.push(`${theme}/${size}`);
  }
  await page.setViewportSize({ width: 320, height: 360 });
  await page.getByLabel('Origem do fuso',{exact:true}).focus(); await page.getByLabel('Origem do fuso',{exact:true}).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Salvar preferências' }).scrollIntoViewIfNeeded();
  const keyboardButton = await page.getByRole('button', { name: 'Salvar preferências' }).boundingBox();
  assert(keyboardButton.y >= 80 && keyboardButton.y + keyboardButton.height <= 272, `short keyboard-like viewport retains accessible action: ${JSON.stringify(keyboardButton)}`);
  await page.setViewportSize({ width: 320, height: 700 });
  const start = new Promise(resolve => held = resolve); hold = true;
  await setTime('11:15'); await page.getByRole('button', { name: 'Salvar preferências' }).click(); await start;
  await page.evaluate(() => { localStorage.setItem('crewcheck_auth_token', 'B'); window.dispatchEvent(new Event('crewcheck:auth-changed')); });
  await page.waitForFunction(() => document.querySelector('select[aria-label="Hora · Horário padrão para BIDS"]').value === '09' && document.querySelector('select[aria-label="Minuto · Horário padrão para BIDS"]').value === '00');
  resume(); await page.waitForTimeout(50); assert.equal(await readTime(), '09:00', 'late A save cannot repopulate B');
  assert.equal(await page.getByRole('checkbox', { name: 'Todos', exact: true }).isChecked(), false, 'B cannot inherit A channels');
  await setTime('12:15');
  await page.evaluate(() => window.dispatchEvent(new Event('online'))); assert.equal(await readTime(), '12:15', 'unsaved override not reset by online refresh');
  readyCampaign = true; await page.evaluate(() => window.dispatchEvent(new Event('crewcheck:auth-changed')));
  await page.getByRole('button', { name: 'Já fiz BIDS nesta janela' }).waitFor();
  const before = writes.length; page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Já fiz BIDS nesta janela' }).click(); assert.equal(writes.length, before, 'dismissed confirmation writes nothing');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Já fiz BIDS nesta janela' }).click();
  await page.getByText('Você declarou “Já fiz”', { exact: false }).waitFor();
  assert.equal(writes.at(-1).token, 'B'); assert.equal(writes.at(-1).body.action, 'already-did');
  assert.equal(errors.length, 0);
  console.log(`PASS actual BIDS preferences UI: ${cases.join(', ')}; safe-area fixture with fixed navigation, first/last access, no text/control intersections, keyboard-like viewport; Todos on/off and restored individual choices, Auto/manual preservation, explicit save/confirmation, current bearer, account switch/late response, zero sends or permission requests.`);
} finally { resume?.(); await browser?.close(); await new Promise(resolve => server.close(resolve)); }
