const { chromium } = require(require('path').resolve(process.env.CHAT_PLAYWRIGHT_MODULE || 'node_modules/playwright'));
const esbuild = require('esbuild'), fs = require('fs'), http = require('http'), path = require('path'), assert = require('node:assert/strict');
const out = path.resolve('artifacts/visitor-composer'); fs.mkdirSync(out, { recursive: true });
(async () => {
  assert.match(fs.readFileSync('client/src/pages/VisitorAccessPage.tsx', 'utf8'), /visitorRealDay/, 'Use the canonically prepared portal');
  await esbuild.build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import VisitorAccessPage from '${path.resolve('client/src/pages/VisitorAccessPage.tsx')}';createRoot(document.getElementById('root')).render(<VisitorAccessPage/>);`, loader: 'tsx', resolveDir: process.cwd() }, jsx: 'automatic', bundle: true, platform: 'browser', format: 'iife', tsconfig: 'tsconfig.json', outfile: path.join(out, 'harness.js'), define: { 'process.env.NODE_ENV': '"test"' } });
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/harness.js' ? 'text/javascript' : 'text/html'); res.end(req.url === '/harness.js' ? fs.readFileSync(path.join(out, 'harness.js')) : '<div id="root"></div><script src="/harness.js"></script>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`, tests = []; let browser;
  try {
    browser = await chromium.launch({ ...(process.env.CHAT_CHROMIUM_PATH ? { executablePath: process.env.CHAT_CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
    for (const scenario of ['edit', 'edit-back', 'duplicate-enter', 'unchanged', 'failure', 'epoch', 'cookie', 'revoke', 'tab-return', 'main-account-independent']) {
      const context = await browser.newContext({ locale: 'pt-BR', serviceWorkers: 'block' });
      await context.addInitScript(() => { document.cookie = 'crewcheck_visitor_session=visitor-A;path=/'; localStorage.setItem('crewcheck:visitor-session-epoch', 'epoch-A'); localStorage.setItem('crewcheck_auth_token', 'main-A'); });
      let held, posts = 0, gets = 0, revoked = false; const errors = [];
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url()); if (url.origin !== origin) return route.abort(); if (!url.pathname.startsWith('/api/')) return route.continue();
        const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        if (url.pathname.endsWith('/visitor/data')) return respond({ ok: true, visitor: { displayName: 'Synthetic visitor', permissions: { roster: true, chat: true } }, owner: { publicId: 'OWNER', displayName: 'Synthetic owner' } });
        if (url.pathname.endsWith('/chat/inbox')) return respond({ ok: true, recipient: 'a'.repeat(64), snapshotVersion: '100', items: [] });
        if (url.pathname.endsWith('/visitor/chat')) {
          if (req.method() === 'POST') { posts++; assert.equal(req.postDataJSON().message, 'sent A'); held = () => respond(scenario === 'failure' ? { ok: false, message: 'Synthetic failure' } : { ok: true }, scenario === 'failure' ? 500 : 200); return; }
          gets++; return respond(revoked ? { ok: false, message: 'Acesso revogado.' } : { ok: true, threadId: 'owner-thread', messages: [] }, revoked ? 403 : 200);
        }
        return respond({ ok: false }, 503);
      });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); await page.goto(origin + '/visitor');
      await page.getByRole('button', { name: 'Chat', exact: true }).first().click();
      const input = page.getByPlaceholder('Mensagem', { exact: true }), send = page.getByRole('button', { name: 'Enviar', exact: true });
      await input.fill('sent A'); await input.press('Enter'); for (let i = 0; !held && i < 200; i++) await page.waitForTimeout(10); assert.ok(held); assert.equal(await send.isDisabled(), true);
      let expected = 'sent A';
      if (['edit', 'edit-back', 'revoke', 'tab-return'].includes(scenario)) { await input.fill('new draft'); expected = 'new draft'; }
      if (scenario === 'edit-back') { await input.fill('sent A'); expected = 'sent A'; }
      if (scenario === 'duplicate-enter') { await input.press('Enter'); await page.waitForTimeout(50); assert.equal(posts, 1); assert.equal(await send.isDisabled(), true, 'Repeated Enter cannot release pending'); }
      if (scenario === 'epoch') await page.evaluate(() => { localStorage.setItem('crewcheck:visitor-session-epoch', 'epoch-B'); window.dispatchEvent(new Event('crewcheck:visitor-session-change')); });
      if (scenario === 'cookie') { await page.evaluate(() => { document.cookie = 'crewcheck_visitor_session=visitor-B;path=/'; }); await page.waitForTimeout(1100); }
      if (scenario === 'main-account-independent') await page.evaluate(() => { localStorage.setItem('crewcheck_auth_token', 'main-B'); window.dispatchEvent(new Event('crewcheck:auth-changed')); });
      if (scenario === 'revoke') { revoked = true; await page.waitForTimeout(1100); await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.getByRole('status').filter({ hasText: 'Acesso revogado.' }).waitFor(); assert.equal(await input.count(), 0); }
      if (scenario === 'tab-return') { await page.getByRole('button', { name: 'Escala', exact: true }).click(); await page.getByRole('button', { name: 'Chat', exact: true }).first().click(); await input.waitFor(); }
      const before = gets; await held(); await page.waitForTimeout(150);
      if (['cookie', 'epoch'].includes(scenario)) { assert.equal(await input.count(), 0); await page.waitForTimeout(1100); assert.equal(gets, before, 'Old visitor session must not resume reads on POST completion'); }
      else {
        if (scenario === 'revoke') { assert.equal(await input.count(), 0); revoked = false; await page.getByRole('button', { name: 'Chat', exact: true }).first().click(); await input.waitFor(); }
        if (['unchanged', 'duplicate-enter', 'main-account-independent'].includes(scenario)) expected = '';
        assert.equal(await input.inputValue(), expected, scenario); if (expected) assert.equal(await send.isDisabled(), false);
      }
      assert.equal(posts, 1); assert.deepEqual(errors, []); tests.push(scenario); await context.close();
    }
    const result = { status: 'PASS', tests, realNetworkCalls: 0, note: 'Actual prepared VisitorAccessPage, composer, live chat and send operation; synthetic fetch with delayed POST, visitor cookie/epoch and revocation.' };
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
