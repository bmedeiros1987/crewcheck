const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');
const { build } = require('esbuild');
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright');
const out = path.resolve(process.env.PLAY_UPDATE_EVIDENCE_DIR || 'artifacts/play-update-ui');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import Notice from './client/src/components/NativePlayUpdateNotice';createRoot(document.getElementById('root')).render(<Notice/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, outdir: 'fixture', jsx: 'automatic' });
  const js = bundle.outputFiles.find(f => f.path.endsWith('.js')).text;
  const css = bundle.outputFiles.find(f => f.path.endsWith('.css')).text;
  const html = `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><main><button id="work">Continuar usando</button><div id="root"></div></main><script src="/fixture.js"></script>`;
  const server = http.createServer((req, res) => { res.setHeader('content-type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html'); res.end(req.url === '/fixture.js' ? js : html); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  let storeVisits = 0, unexpected = 0;
  try {
    for (const width of [320, 390, 1024]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
      await context.route('**/*', route => {
        if (route.request().url().startsWith(origin)) return route.continue();
        if (route.request().url() === 'https://play.google.com/store/apps/details?id=com.crewcheck.app') { storeVisits++; return route.fulfill({ contentType: 'text/html', body: '<h1>Play cancelada (simulação offline)</h1>' }); }
        unexpected++; return route.abort();
      });
      await context.addInitScript(() => { window.AndroidCrewCheckNative = {}; window.__crewcheckNativeUpdateStatus = {state:'available',availableVersionCode:144158,checkedAt:Date.now()}; });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin);
      const notice = page.getByRole('complementary', { name: 'Atualização Android disponível' });
      const emit = (state, version = 144158, age = 0) => page.evaluate(({state,version,age}) => window.dispatchEvent(new CustomEvent('crewcheck:native-update-status', { detail: {state,availableVersionCode:version,checkedAt:Date.now()-age} })), {state,version,age});
      await notice.waitFor(); // Replay native response received before React mount.
      await emit('available'); await notice.waitFor();
      await page.locator('#work').click(); // No modal/inert overlay blocks the app.
      assert(!/144157|144158|14\.4\.11/.test(await notice.innerText()));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      for (const button of await notice.getByRole('button').all()) assert((await button.boundingBox()).height >= 44);
      await page.screenshot({path:path.join(out, width+'-available.png')});
      for (const state of ['current','unavailable','checking','error','canceled']) { await emit(state); await notice.waitFor({state:'hidden'}); await emit('available'); await notice.waitFor(); }
      await emit('available',144158,300001); await notice.waitFor({state:'hidden'});
      await emit('available',0); await notice.waitFor({state:'hidden'});
      await emit('available',144158,-1000); await notice.waitFor({state:'hidden'});
      await emit('available'); await notice.waitFor(); await notice.getByRole('button',{name:'Mais tarde'}).click();
      await emit('available'); await notice.waitFor({state:'hidden'});
      await page.reload(); await emit('available'); await notice.waitFor({state:'hidden'});
      await emit('available',144159); await notice.waitFor(); // New eligible version is independent.
      await notice.getByRole('button',{name:'Atualizar',exact:true}).click();
      await page.waitForURL('https://play.google.com/store/apps/details?id=com.crewcheck.app');
      await page.goBack(); await emit('available',144159); await notice.waitFor({state:'hidden'}); // Store cancellation never loops.
      await emit('available',144160); await notice.waitFor();
      await context.setOffline(true); await notice.waitFor({state:'hidden'}); await emit('available',144160); await notice.waitFor({state:'hidden'}); await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:release-updated',{detail:{version:'999.0'}}))); await notice.waitFor({state:'hidden'});
      await page.clock.install(); await emit('available',144161); await notice.waitFor(); await page.clock.fastForward(300001); await notice.waitFor({state:'hidden'});
      assert.deepEqual(errors,[]); await context.close();
    }
    // Ordinary web/PWA gets no Android package notice, even with cached/spoofed URL flags.
    const context = await browser.newContext(); const page = await context.newPage();
    await page.goto(origin+'?app=1&android=1');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:native-update-status',{detail:{state:'available',availableVersionCode:999999,checkedAt:Date.now()}})));
    assert.equal(await page.getByRole('complementary').count(),0);
    await context.close(); assert.equal(unexpected,0); assert.equal(storeVisits,3);
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({pass:true,widths:[320,390,1024],storeVisits,unexpected,realSends:0,realStoreRequests:0,states:['available','current','unavailable','error','checking','canceled','stale','offline','defer','store-cancel','web-only']},null,2));
    console.log('PASS actual React Play notice: availability, absence/error, freshness, snooze, cancellation, offline, PWA isolation; 0 real Play/API requests.');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
