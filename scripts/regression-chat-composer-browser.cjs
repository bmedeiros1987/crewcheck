const { chromium } = require(require('path').resolve(process.env.CHAT_PLAYWRIGHT_MODULE || 'node_modules/playwright'));
const esbuild = require('esbuild'), fs = require('fs'), http = require('http'), path = require('path'), assert = require('node:assert/strict');
const out = path.resolve('artifacts/chat-composer'); fs.mkdirSync(out, { recursive: true });
const scenarios = ['switch', 'edit', 'edit-back', 'duplicate-enter', 'unchanged', 'failure', 'session', 'remount'];
(async () => {
  assert.match(fs.readFileSync('client/src/components/platform/PlatformCenter.tsx', 'utf8'), /resendingVisitorId/, 'Run against prepared real components');
  await esbuild.build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{CommunityCenter}from'${path.resolve('client/src/components/platform/PlatformCenter.tsx')}';createRoot(document.getElementById('root')).render(<CommunityCenter onBack={()=>{}}/>);`, loader: 'tsx', resolveDir: process.cwd() }, jsx: 'automatic', bundle: true, platform: 'browser', format: 'iife', tsconfig: 'tsconfig.json', outfile: path.join(out, 'harness.js'), define: { 'process.env.NODE_ENV': '"test"' } });
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', req.url === '/harness.js' ? 'text/javascript' : 'text/html'); res.end(req.url === '/harness.js' ? fs.readFileSync(path.join(out, 'harness.js')) : '<div id="root"></div><script src="/harness.js"></script>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, tests = []; let browser;
  try {
    browser = await chromium.launch({ ...(process.env.CHAT_CHROMIUM_PATH ? { executablePath: process.env.CHAT_CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
    for (const kind of ['colleague', 'visitor']) for (const scenario of scenarios) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      await context.addInitScript(() => { localStorage.setItem('crewcheck_auth_token', 'synthetic-A'); localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'A', email: 'a@example.invalid' })); });
      let held, posts = 0; const errors = [];
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url()); if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        if (url.pathname.endsWith('/profile')) return respond({ ok: true, profile: { publicId: 'ME', displayName: 'Synthetic', plan: 'premium_monthly' } });
        if (url.pathname.endsWith('/connections')) return respond({ ok: true, connections: ['A', 'B'].map(id => ({ id, status: 'accepted', direction: 'outgoing', person: { publicId: id, displayName: 'Peer ' + id }, permissions: { chat: true } })) });
        if (url.pathname === '/api/platform/visitors') return respond({ ok: true, visitors: ['A', 'B'].map(id => ({ id, status: 'active', display_name: 'Visitor ' + id, email: id.toLowerCase() + '@example.invalid', permissions: { chat: true } })) });
        if (url.pathname.endsWith('/chat')) {
          const key = kind === 'colleague' ? (req.method() === 'POST' ? req.postDataJSON().publicId : url.searchParams.get('publicId')) : url.pathname.split('/')[4];
          const result = { ok: true, threadId: key, person: { displayName: 'Chat ' + key }, messages: [] };
          if (req.method() === 'POST') { posts++; held = () => respond(scenario === 'failure' ? { ok: false, message: 'Synthetic failure' } : result, scenario === 'failure' ? 500 : 200); return; }
          return respond(result);
        }
        return respond({ ok: true, shares: [] });
      });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin);
      const tab = kind === 'colleague' ? 'Colegas e chat' : 'Visitantes';
      await page.getByRole('button', { name: tab, exact: true }).click();
      const open = async index => { await page.getByRole('button', { name: 'Chat', exact: true }).nth(index).click(); await page.locator('.cp-chat input').waitFor(); };
      await open(0);
      const input = page.locator('.cp-chat input'), send = page.locator('.cp-chat .cp-inline-form button');
      await input.fill('sent A'); await input.press('Enter');
      for (let i = 0; !held && i < 200; i++) await page.waitForTimeout(10);
      assert.ok(held, `${kind}/${scenario}: pending POST captured`); assert.equal(posts, 1); assert.equal(await send.isDisabled(), true);
      let expected = 'sent A';
      if (scenario === 'switch') { await open(1); await input.fill('draft B'); expected = 'draft B'; }
      if (scenario === 'edit' || scenario === 'edit-back') { await input.fill('new A'); expected = 'new A'; if (scenario === 'edit-back') { await input.fill('sent A'); expected = 'sent A'; } }
      if (scenario === 'duplicate-enter') { await input.press('Enter'); await page.waitForTimeout(50); assert.equal(posts, 1); assert.equal(await send.isDisabled(), true, 'Duplicate Enter must not release another operation pending state'); }
      if (scenario === 'session') await page.evaluate(() => { localStorage.setItem('crewcheck_auth_token', 'synthetic-B'); window.dispatchEvent(new Event('crewcheck:auth-changed')); });
      if (scenario === 'remount') { await page.getByRole('button', { name: kind === 'colleague' ? 'Visitantes' : 'Colegas e chat', exact: true }).click(); await page.getByRole('button', { name: tab, exact: true }).click(); await open(1); await input.fill('remounted B'); expected = 'remounted B'; }
      await held(); await page.waitForTimeout(150);
      if (scenario === 'session') assert.equal(await page.locator('.cp-chat').count(), 0, 'Session switch must hide old conversation');
      else { if (scenario === 'unchanged' || scenario === 'duplicate-enter') expected = ''; assert.equal(await input.inputValue(), expected, `${kind}/${scenario}: operation only clears unchanged owned draft`); if (expected) assert.equal(await send.isDisabled(), false); }
      assert.equal(posts, 1); assert.deepEqual(errors, []); tests.push(`${kind}: ${scenario}`); await context.close();
    }
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ tests, realNetworkCalls: 0, note: 'Real prepared CommunityCenter panels, useLiveChat and transport helpers; synthetic fetch with held POST responses.' }, null, 2)); console.log(JSON.stringify({ status: 'PASS', tests }, null, 2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
